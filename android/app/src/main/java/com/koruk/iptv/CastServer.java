package com.koruk.iptv;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Telefondan TV'ye oynatma: TV tarafındaki küçük alıcı sunucu (yalnızca yerel ağ).
 * - TCP/HTTP: /hello, /pair, /play, /cmd, /state, /sync, /unpair. Eşleşmiş telefon X-Token başlığıyla gelir.
 * - UDP (aynı port numarası): "IPTVPRO?" yayınına "IPTVPRO!{hello}" yanıtı verir; telefon TV'yi böyle bulur.
 * Eşleştirme: TV ekranındaki 6 haneli kod bir kez girilir; geçerlilik süresi ve deneme sayısı sınırlıdır.
 * Android'e bağlı değildir (düz Java); oynatıcıyla konuşma Host arayüzü üzerinden yapılır.
 */
final class CastServer {
    static final int PORT = 8765;
    static final String APP = "iptvpro";
    static final String Q = "IPTVPRO?";
    static final String A = "IPTVPRO!";
    static final int MAX_HEADER = 16 * 1024;
    static final int MAX_BODY = 64 * 1024;
    // Eşitleme verisi (kaynaklar, favoriler, ilerleme) daha büyük olabilir; yalnız eşleşmiş telefon bu kadar gönderebilir.
    static final int MAX_SYNC_BODY = 4 * 1024 * 1024;
    static final int MAX_PAIR_FAILS = 5;

    interface Host {
        /** Oynatma isteği (JSON gövde). null → tamam, aksi hâlde hata iletisi. */
        String onPlay(String bodyJson, String from);

        /** Komut (JSON gövde). null → tamam, aksi hâlde hata iletisi. */
        String onCommand(String bodyJson);

        /** Şu anki oynatma durumu (JSON nesnesi). */
        String state();

        /** Veri eşitleme (JSON gövde): birleştirmeyi uygulama yapar, yanıtı (durum kodu + JSON) döndürür. */
        Reply onSync(String bodyJson);

        /** Eşleşmiş cihazlar değişti (token → telefon adı): kalıcı olarak saklanmalı. */
        void onTokens(Map<String, String> tokens);
    }

    /** Eşitleme yanıtı: HTTP durum kodu ve JSON gövde. */
    static final class Reply {
        final int status;
        final String json;

        Reply(int status, String json) {
            this.status = status;
            this.json = json;
        }
    }

    private final Host host;
    private final String id;
    private volatile String name;
    private final ConcurrentHashMap<String, String> tokens = new ConcurrentHashMap<>();
    private final SecureRandom rnd = new SecureRandom();
    private final AtomicInteger pairFails = new AtomicInteger();
    private volatile String pairCode = null;
    private volatile long pairUntil = 0;
    private volatile boolean running = false;
    private volatile int tcpPort = 0;
    private ServerSocket server;
    private DatagramSocket udp;
    private ExecutorService pool;

    CastServer(Host host, String id, String name) {
        this.host = host;
        this.id = id;
        this.name = name;
    }

    // ------------------------------------------------------------------ yaşam döngüsü

    /** Başlatır; kullanılan TCP port numarasını döndürür (port doluysa sonraki 9 port denenir). */
    synchronized int start(int port, Map<String, String> saved) throws IOException {
        if (running) return tcpPort;
        tokens.clear();
        if (saved != null) tokens.putAll(saved);
        IOException last = null;
        for (int p = port; p < port + 10; p++) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(p));
                server = s;
                break;
            } catch (IOException e) {
                last = e;
            }
        }
        if (server == null) throw last != null ? last : new IOException("port açılamadı");
        tcpPort = server.getLocalPort();
        running = true;
        pool = Executors.newFixedThreadPool(6, new ThreadFactory() {
            private final AtomicInteger n = new AtomicInteger();

            @Override
            public Thread newThread(Runnable r) {
                Thread t = new Thread(r, "cast-" + n.incrementAndGet());
                t.setDaemon(true);
                return t;
            }
        });
        Thread acceptor = new Thread(this::acceptLoop, "cast-accept");
        acceptor.setDaemon(true);
        acceptor.start();
        try {
            DatagramSocket u = new DatagramSocket(null);
            u.setReuseAddress(true);
            u.setBroadcast(true);
            u.bind(new InetSocketAddress(port));
            udp = u;
            Thread t = new Thread(this::udpLoop, "cast-udp");
            t.setDaemon(true);
            t.start();
        } catch (IOException e) {
            udp = null; // bulma yayını çalışmaz; elle IP ile bağlanılabilir
        }
        return tcpPort;
    }

    synchronized void stop() {
        running = false;
        pairCode = null;
        try {
            if (server != null) server.close();
        } catch (IOException ignored) {
            // kapanırken hata önemsiz
        }
        if (udp != null) udp.close();
        if (pool != null) pool.shutdownNow();
        server = null;
        udp = null;
        pool = null;
        tcpPort = 0;
    }

    boolean isRunning() {
        return running;
    }

    int port() {
        return tcpPort;
    }

    String id() {
        return id;
    }

    String name() {
        return name;
    }

    void setName(String n) {
        if (n != null && !n.trim().isEmpty()) name = clip(n.trim(), 40);
    }

    // ------------------------------------------------------------------ eşleştirme

    void openPairing(String code, long ttlMs) {
        pairFails.set(0);
        pairUntil = System.currentTimeMillis() + ttlMs;
        pairCode = code;
    }

    void closePairing() {
        pairCode = null;
    }

    boolean pairingOpen() {
        return pairCode != null && System.currentTimeMillis() < pairUntil;
    }

    /** {id, ad} çiftleri: id, token'ın SHA-256 özetinin ilk 8 hanesi (token'ın kendisi dışarı verilmez). */
    List<String[]> paired() {
        List<String[]> out = new ArrayList<>();
        for (Map.Entry<String, String> e : tokens.entrySet()) out.add(new String[] {tokenId(e.getKey()), e.getValue()});
        Collections.sort(out, (a, b) -> a[1].compareToIgnoreCase(b[1]));
        return out;
    }

    boolean unpair(String tid) {
        boolean any = false;
        for (String t : new ArrayList<>(tokens.keySet())) {
            if (tokenId(t).equals(tid)) {
                tokens.remove(t);
                any = true;
            }
        }
        if (any) persist();
        return any;
    }

    private void persist() {
        try {
            host.onTokens(new HashMap<>(tokens));
        } catch (RuntimeException ignored) {
            // saklama hatası bağlantıyı bozmasın
        }
    }

    static String tokenId(String token) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder b = new StringBuilder();
            for (int i = 0; i < 4; i++) b.append(String.format("%02x", d[i] & 0xff));
            return b.toString();
        } catch (Exception e) {
            return "";
        }
    }

    // ------------------------------------------------------------------ UDP bulma

    private void udpLoop() {
        byte[] buf = new byte[160];
        DatagramPacket p = new DatagramPacket(buf, buf.length);
        while (running) {
            try {
                DatagramSocket u = udp;
                if (u == null) return;
                p.setLength(buf.length);
                u.receive(p);
                String m = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8);
                if (m.startsWith(Q)) {
                    byte[] rep = (A + hello(false)).getBytes(StandardCharsets.UTF_8);
                    u.send(new DatagramPacket(rep, rep.length, p.getAddress(), p.getPort()));
                }
            } catch (SocketException e) {
                if (!running) return;
            } catch (IOException ignored) {
                // tek paket hatası döngüyü bozmasın
            }
        }
    }

    // ------------------------------------------------------------------ HTTP

    private void acceptLoop() {
        while (running) {
            try {
                final Socket s = server.accept();
                ExecutorService p = pool;
                if (p == null) {
                    s.close();
                    return;
                }
                p.execute(() -> handle(s));
            } catch (IOException e) {
                if (!running) return;
            } catch (RuntimeException e) {
                return; // havuz kapandı
            }
        }
    }

    private static final class Req {
        String method = "";
        String path = "";
        final Map<String, String> h = new HashMap<>();
        String body = "";
    }

    private void handle(Socket s) {
        try {
            s.setSoTimeout(8000);
            InputStream in = new BufferedInputStream(s.getInputStream());
            OutputStream out = s.getOutputStream();
            Req r = readRequest(in);
            byte[] resp;
            if (r == null) resp = response(400, "{\"error\":\"bad\"}");
            else resp = route(r);
            out.write(resp);
            out.flush();
        } catch (IOException ignored) {
            // istemci koptu
        } finally {
            try {
                s.close();
            } catch (IOException ignored) {
                // kapanış hatası önemsiz
            }
        }
    }

    private Req readRequest(InputStream in) throws IOException {
        ByteArrayOutputStream head = new ByteArrayOutputStream();
        int state = 0; // \r\n\r\n arama
        int c;
        while ((c = in.read()) >= 0) {
            head.write(c);
            if (head.size() > MAX_HEADER) return null;
            if ((state == 0 || state == 2) && c == '\r') state++;
            else if ((state == 1 || state == 3) && c == '\n') state++;
            else state = c == '\r' ? 1 : 0;
            if (state == 4) break;
        }
        if (state != 4) return null;
        String[] lines = new String(head.toByteArray(), StandardCharsets.ISO_8859_1).split("\r\n");
        String[] rl = lines[0].split(" ");
        if (rl.length < 2) return null;
        Req r = new Req();
        r.method = rl[0].toUpperCase();
        String path = rl[1];
        int q = path.indexOf('?');
        r.path = q >= 0 ? path.substring(0, q) : path;
        for (int i = 1; i < lines.length; i++) {
            int k = lines[i].indexOf(':');
            if (k > 0) r.h.put(lines[i].substring(0, k).trim().toLowerCase(), lines[i].substring(k + 1).trim());
        }
        int len = 0;
        String cl = r.h.get("content-length");
        if (cl != null) {
            try {
                len = Integer.parseInt(cl);
            } catch (NumberFormatException e) {
                return null;
            }
        }
        String tk = r.h.get("x-token");
        boolean bigOk = "/sync".equals(r.path) && tk != null && tokens.containsKey(tk); // büyük gövde yalnız eşleşmiş telefondan
        if (len < 0 || len > (bigOk ? MAX_SYNC_BODY : MAX_BODY)) return null;
        byte[] body = new byte[len];
        int got = 0;
        while (got < len) {
            int n = in.read(body, got, len - got);
            if (n < 0) return null;
            got += n;
        }
        r.body = new String(body, StandardCharsets.UTF_8);
        return r;
    }

    private byte[] route(Req r) {
        String token = r.h.get("x-token");
        boolean authed = token != null && tokens.containsKey(token);
        String key = r.method + " " + r.path;
        try {
            switch (key) {
                case "GET /hello":
                    return response(200, hello(authed));
                case "POST /pair":
                    return pair(r);
                case "GET /state":
                    if (!authed) return response(401, "{\"error\":\"auth\"}");
                    return response(200, host.state());
                case "POST /play": {
                    if (!authed) return response(401, "{\"error\":\"auth\"}");
                    String err = host.onPlay(r.body, tokens.get(token));
                    return err == null ? response(200, "{\"ok\":true}") : response(422, "{\"error\":" + q(err) + "}");
                }
                case "POST /cmd": {
                    if (!authed) return response(401, "{\"error\":\"auth\"}");
                    String err = host.onCommand(r.body);
                    return err == null ? response(200, "{\"ok\":true}") : response(422, "{\"error\":" + q(err) + "}");
                }
                case "POST /sync": {
                    if (!authed) return response(401, "{\"error\":\"auth\"}");
                    Reply rep = host.onSync(r.body);
                    return response(rep.status, rep.json);
                }
                case "POST /unpair":
                    if (!authed) return response(401, "{\"error\":\"auth\"}");
                    tokens.remove(token);
                    persist();
                    return response(200, "{\"ok\":true}");
                default:
                    return response(404, "{\"error\":\"yok\"}");
            }
        } catch (RuntimeException e) {
            return response(500, "{\"error\":\"hata\"}");
        }
    }

    private byte[] pair(Req r) {
        String code = pairCode;
        if (code == null || System.currentTimeMillis() >= pairUntil) return response(403, "{\"error\":\"closed\"}");
        String given = r.h.get("x-code");
        if (given == null || !MessageDigest.isEqual(given.getBytes(StandardCharsets.UTF_8), code.getBytes(StandardCharsets.UTF_8))) {
            if (pairFails.incrementAndGet() >= MAX_PAIR_FAILS) pairCode = null; // çok yanlış deneme: kod iptal, TV'de yeniden açılmalı
            return response(403, "{\"error\":\"wrong\"}");
        }
        String who = "Telefon";
        String raw = r.h.get("x-name");
        if (raw != null && !raw.isEmpty()) {
            try {
                who = clip(URLDecoder.decode(raw, "UTF-8").trim(), 40);
            } catch (Exception ignored) {
                // geçersiz kodlama: varsayılan ad
            }
            if (who.isEmpty()) who = "Telefon";
        }
        byte[] b = new byte[16];
        rnd.nextBytes(b);
        StringBuilder t = new StringBuilder();
        for (byte x : b) t.append(String.format("%02x", x & 0xff));
        String token = t.toString();
        tokens.put(token, who);
        pairCode = null;
        persist();
        return response(200, "{\"token\":" + q(token) + ",\"id\":" + q(id) + ",\"name\":" + q(name) + "}");
    }

    private String hello(boolean paired) {
        return "{\"app\":\"" + APP + "\",\"v\":1,\"id\":" + q(id) + ",\"name\":" + q(name) + ",\"port\":" + tcpPort + ",\"paired\":" + paired + "}";
    }

    private static byte[] response(int code, String json) {
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        String text = code == 200 ? "OK" : code == 400 ? "Bad Request" : code == 401 ? "Unauthorized" : code == 403 ? "Forbidden" : code == 404 ? "Not Found" : code == 413 ? "Payload Too Large" : code == 422 ? "Unprocessable" : code == 504 ? "Gateway Timeout" : "Error";
        String head = "HTTP/1.1 " + code + " " + text + "\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: " + body.length + "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
        byte[] h = head.getBytes(StandardCharsets.ISO_8859_1);
        byte[] out = new byte[h.length + body.length];
        System.arraycopy(h, 0, out, 0, h.length);
        System.arraycopy(body, 0, out, h.length, body.length);
        return out;
    }

    // ------------------------------------------------------------------ yardımcılar

    static String q(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    private static String clip(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }

    /** Bu cihazın yerel ağ IPv4 adresleri (TV ekranında elle bağlanmak için gösterilir). */
    static List<String> localAddresses() {
        List<String> out = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> en = NetworkInterface.getNetworkInterfaces();
            while (en != null && en.hasMoreElements()) {
                NetworkInterface ni = en.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                Enumeration<InetAddress> as = ni.getInetAddresses();
                while (as.hasMoreElements()) {
                    InetAddress a = as.nextElement();
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) out.add(a.getHostAddress());
                }
            }
        } catch (SocketException ignored) {
            // adres listesi alınamadı
        }
        return out;
    }
}
