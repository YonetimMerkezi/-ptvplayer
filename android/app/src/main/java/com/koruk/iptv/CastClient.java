package com.koruk.iptv;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Telefondan TV'ye oynatma: telefon tarafı (TV'yi bulma ve komut gönderme). Düz Java; Android'e bağlı değildir.
 * Yalnızca yerel ağ adreslerine bağlanır (özel IPv4 aralıkları, link-local, loopback).
 */
final class CastClient {
    private CastClient() {}

    static final class Found {
        final String host;
        final int port;
        final String json;

        Found(String host, int port, String json) {
            this.host = host;
            this.port = port;
            this.json = json;
        }
    }

    static final class Response {
        final int status;
        final String body;
        final String error;

        Response(int status, String body, String error) {
            this.status = status;
            this.body = body;
            this.error = error;
        }
    }

    private static final Pattern PORT = Pattern.compile("\"port\"\\s*:\\s*(\\d{1,5})");
    private static final Pattern IPV4 = Pattern.compile("^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$");

    /** Yerel ağ IPv4 adresi mi? (10/8, 172.16/12, 192.168/16, 169.254/16, 127/8) */
    static boolean isLanHost(String host) {
        if (host == null) return false;
        Matcher m = IPV4.matcher(host.trim());
        if (!m.matches()) return false;
        int[] o = new int[4];
        for (int i = 0; i < 4; i++) {
            o[i] = Integer.parseInt(m.group(i + 1));
            if (o[i] > 255) return false;
        }
        if (o[0] == 10 || o[0] == 127) return true;
        if (o[0] == 192 && o[1] == 168) return true;
        if (o[0] == 169 && o[1] == 254) return true;
        return o[0] == 172 && o[1] >= 16 && o[1] <= 31;
    }

    /** Ağdaki alıcıları UDP yayınıyla arar (yayın iki kez gönderilir; paket kaybına karşı). extra: sınamalar için ek hedefler. */
    static List<Found> discover(int port, int timeoutMs, List<InetAddress> extra) throws IOException {
        List<Found> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        DatagramSocket s = new DatagramSocket();
        try {
            s.setBroadcast(true);
            byte[] q = CastServer.Q.getBytes(StandardCharsets.UTF_8);
            List<InetAddress> targets = broadcastTargets();
            if (extra != null) targets.addAll(extra);
            long end = System.currentTimeMillis() + timeoutMs;
            long resendAt = System.currentTimeMillis() + timeoutMs / 2;
            boolean resent = false;
            send(s, q, targets, port);
            byte[] buf = new byte[1024];
            while (true) {
                long left = end - System.currentTimeMillis();
                if (left <= 0) break;
                if (!resent && System.currentTimeMillis() >= resendAt) {
                    send(s, q, targets, port);
                    resent = true;
                }
                s.setSoTimeout((int) Math.max(1, Math.min(left, 250)));
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                try {
                    s.receive(p);
                } catch (SocketTimeoutException e) {
                    continue;
                }
                String m = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8);
                if (!m.startsWith(CastServer.A)) continue;
                String json = m.substring(CastServer.A.length());
                Matcher pm = PORT.matcher(json);
                int tcp = pm.find() ? Integer.parseInt(pm.group(1)) : CastServer.PORT;
                String host = p.getAddress().getHostAddress();
                if (seen.add(host + ":" + tcp)) out.add(new Found(host, tcp, json));
            }
        } finally {
            s.close();
        }
        return out;
    }

    private static void send(DatagramSocket s, byte[] q, List<InetAddress> targets, int port) {
        for (InetAddress a : targets) {
            try {
                s.send(new DatagramPacket(q, q.length, a, port));
            } catch (IOException ignored) {
                // bu arayüz yayına kapalı olabilir
            }
        }
    }

    private static List<InetAddress> broadcastTargets() {
        List<InetAddress> out = new ArrayList<>();
        try {
            out.add(InetAddress.getByName("255.255.255.255"));
        } catch (IOException ignored) {
            // yok sayılır
        }
        try {
            Enumeration<NetworkInterface> en = NetworkInterface.getNetworkInterfaces();
            while (en != null && en.hasMoreElements()) {
                NetworkInterface ni = en.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    InetAddress b = ia.getBroadcast();
                    if (b != null && !out.contains(b)) out.add(b);
                }
            }
        } catch (IOException ignored) {
            // yalnızca genel yayın adresi kullanılır
        }
        return out;
    }

    /** Alıcıya HTTP isteği. Ağ hatalarında istisna atmaz: status 0 + error döner. */
    static Response request(String host, int port, String method, String path, Map<String, String> headers, String body, int timeoutMs) {
        if (!isLanHost(host)) return new Response(0, "", "Yalnızca yerel ağ adreslerine bağlanılabilir");
        if (port < 1 || port > 65535) return new Response(0, "", "Geçersiz port");
        if (path == null || !path.startsWith("/")) return new Response(0, "", "Geçersiz yol");
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL("http://" + host.trim() + ":" + port + path).openConnection();
            c.setConnectTimeout(timeoutMs);
            c.setReadTimeout(timeoutMs);
            c.setUseCaches(false);
            c.setInstanceFollowRedirects(false);
            c.setRequestMethod(method);
            if (headers != null) for (Map.Entry<String, String> e : headers.entrySet()) c.setRequestProperty(e.getKey(), e.getValue());
            if (body != null && !body.isEmpty()) {
                byte[] b = body.getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true);
                c.setFixedLengthStreamingMode(b.length);
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (OutputStream os = c.getOutputStream()) {
                    os.write(b);
                }
            }
            int code = c.getResponseCode();
            InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
            return new Response(code, is == null ? "" : readAll(is), null);
        } catch (IOException e) {
            return new Response(0, "", String.valueOf(e.getMessage()));
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static String readAll(InputStream is) throws IOException {
        try (InputStream in = is) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) >= 0) {
                bo.write(buf, 0, n);
                if (bo.size() > 256 * 1024) break;
            }
            return new String(bo.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
