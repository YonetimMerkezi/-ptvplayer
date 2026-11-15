package com.koruk.iptv;

import android.net.Uri;
import android.util.Base64;
import android.util.Xml;

import org.json.JSONArray;
import org.json.JSONObject;
import org.xmlpull.v1.XmlPullParser;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.StringReader;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Locale;
import java.util.Properties;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import jcifs.CIFSContext;
import jcifs.config.PropertyConfiguration;
import jcifs.context.BaseContext;
import jcifs.smb.NtlmPasswordAuthenticator;
import jcifs.smb.SmbFile;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Ağ paylaşımları: WebDAV (PROPFIND), DLNA/UPnP (SSDP + ContentDirectory) ve SMB (jcifs-ng).
 * SMB dosyaları oynatıcıya yerel bir HTTP köprüsüyle (127.0.0.1, Range destekli) verilir.
 * Tüm yöntemler ağa çıkar; ana iş parçacığından çağrılmaz.
 */
final class NetShares {
    private static final OkHttpClient HTTP = new OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .followRedirects(true)
        .build();

    private NetShares() {}

    // ------------------------------------------------------------------ yardımcılar

    private static String localName(String n) {
        int i = n == null ? -1 : n.indexOf(':');
        return i >= 0 ? n.substring(i + 1) : n;
    }

    static String basic(String user, String pass) {
        if (user == null || user.isEmpty()) return "";
        String raw = user + ":" + (pass == null ? "" : pass);
        return "Basic " + Base64.encodeToString(raw.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
    }

    private static String fetch(Request req) throws IOException {
        try (Response r = HTTP.newCall(req).execute()) {
            if (r.code() == 401 || r.code() == 403) throw new IOException("Erişim reddedildi (HTTP " + r.code() + "): kullanıcı adı ya da şifre hatalı olabilir");
            if (r.code() >= 400) throw new IOException("Sunucu hata verdi (HTTP " + r.code() + ")");
            if (r.body() == null) return "";
            return r.body().string();
        }
    }

    // ------------------------------------------------------------------ WebDAV

    /** Bir WebDAV klasörünü listeler. Dönüş: {entries:[{name,url,dir,size,mime}], auth}. */
    static JSONObject davList(String url, String user, String pass) throws Exception {
        String xml = "<?xml version=\"1.0\" encoding=\"utf-8\"?><d:propfind xmlns:d=\"DAV:\"><d:prop>"
            + "<d:displayname/><d:getcontentlength/><d:getcontenttype/><d:resourcetype/></d:prop></d:propfind>";
        Request.Builder rb = new Request.Builder().url(url)
            .method("PROPFIND", RequestBody.create(xml, MediaType.parse("application/xml; charset=utf-8")))
            .header("Depth", "1");
        String auth = basic(user, pass);
        if (!auth.isEmpty()) rb.header("Authorization", auth);
        String body = fetch(rb.build());

        XmlPullParser p = Xml.newPullParser();
        p.setInput(new StringReader(body));
        JSONArray entries = new JSONArray();
        String href = null, disp = null, mime = null;
        long size = 0;
        boolean dir = false, inResp = false;
        String tag = "";
        String selfPath = new URL(url).getPath();
        for (int ev = p.getEventType(); ev != XmlPullParser.END_DOCUMENT; ev = p.next()) {
            if (ev == XmlPullParser.START_TAG) {
                tag = localName(p.getName()).toLowerCase(Locale.ROOT);
                if (tag.equals("response")) {
                    inResp = true;
                    href = null; disp = null; mime = null; size = 0; dir = false;
                } else if (tag.equals("collection")) {
                    dir = true;
                }
            } else if (ev == XmlPullParser.TEXT && inResp) {
                String t = p.getText() == null ? "" : p.getText().trim();
                if (t.isEmpty()) continue;
                if (tag.equals("href")) href = t;
                else if (tag.equals("displayname")) disp = t;
                else if (tag.equals("getcontenttype")) mime = t;
                else if (tag.equals("getcontentlength")) {
                    try { size = Long.parseLong(t); } catch (NumberFormatException ignored) { size = 0; }
                }
            } else if (ev == XmlPullParser.END_TAG) {
                if (localName(p.getName()).equalsIgnoreCase("response") && inResp) {
                    inResp = false;
                    if (href == null) continue;
                    String abs = new URL(new URL(url), href).toString();
                    String path = new URL(abs).getPath();
                    if (trimSlash(Uri.decode(path)).equals(trimSlash(Uri.decode(selfPath)))) continue; // klasörün kendisi
                    String name = disp;
                    if (name == null || name.isEmpty()) {
                        String seg = trimSlash(Uri.decode(path));
                        name = seg.substring(seg.lastIndexOf('/') + 1);
                    }
                    if (name.isEmpty()) continue;
                    JSONObject o = new JSONObject();
                    o.put("name", name);
                    o.put("url", dir && !abs.endsWith("/") ? abs + "/" : abs);
                    o.put("dir", dir);
                    o.put("size", size);
                    o.put("mime", mime == null ? "" : mime);
                    entries.put(o);
                }
                tag = "";
            }
        }
        JSONObject r = new JSONObject();
        r.put("entries", entries);
        r.put("auth", auth);
        return r;
    }

    private static String trimSlash(String s) {
        String t = s == null ? "" : s;
        while (t.endsWith("/")) t = t.substring(0, t.length() - 1);
        return t;
    }

    // ------------------------------------------------------------------ DLNA / UPnP

    /** Ağdaki medya sunucularını bulur (SSDP). Dönüş: [{name, control}]. */
    static JSONArray upnpDiscover(int timeoutMs) throws Exception {
        final String st = "urn:schemas-upnp-org:device:MediaServer:1";
        String msg = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: " + st + "\r\n\r\n";
        byte[] data = msg.getBytes(StandardCharsets.US_ASCII);
        Set<String> locations = new HashSet<>();
        DatagramSocket sock = new DatagramSocket();
        try {
            sock.setSoTimeout(700);
            InetAddress group = InetAddress.getByName("239.255.255.250");
            long end = System.currentTimeMillis() + Math.max(1500, Math.min(8000, timeoutMs));
            int sent = 0;
            byte[] buf = new byte[4096];
            while (System.currentTimeMillis() < end) {
                if (sent < 3) {
                    sock.send(new DatagramPacket(data, data.length, group, 1900));
                    sent++;
                }
                try {
                    DatagramPacket pk = new DatagramPacket(buf, buf.length);
                    sock.receive(pk);
                    String resp = new String(pk.getData(), 0, pk.getLength(), StandardCharsets.UTF_8);
                    for (String line : resp.split("\r\n")) {
                        if (line.toLowerCase(Locale.ROOT).startsWith("location:")) locations.add(line.substring(9).trim());
                    }
                } catch (SocketTimeoutException ignored) {
                    // yeni yanıt yok: süre dolana kadar beklenir
                }
            }
        } finally {
            sock.close();
        }
        JSONArray out = new JSONArray();
        Set<String> seen = new HashSet<>();
        for (String loc : locations) {
            try {
                JSONObject dev = describe(loc);
                if (dev != null && seen.add(dev.optString("control"))) out.put(dev);
            } catch (Exception ignored) {
                // yanıt vermeyen cihaz atlanır
            }
        }
        return out;
    }

    private static JSONObject describe(String location) throws Exception {
        String xml = fetch(new Request.Builder().url(location).build());
        XmlPullParser p = Xml.newPullParser();
        p.setInput(new StringReader(xml));
        String name = "", base = "", type = "", control = "", tag = "";
        boolean inService = false;
        for (int ev = p.getEventType(); ev != XmlPullParser.END_DOCUMENT; ev = p.next()) {
            if (ev == XmlPullParser.START_TAG) {
                tag = localName(p.getName());
                if (tag.equals("service")) { inService = true; type = ""; }
            } else if (ev == XmlPullParser.TEXT) {
                String t = p.getText() == null ? "" : p.getText().trim();
                if (t.isEmpty()) continue;
                if (tag.equals("friendlyName") && name.isEmpty()) name = t;
                else if (tag.equals("URLBase")) base = t;
                else if (inService && tag.equals("serviceType")) type = t;
                else if (inService && tag.equals("controlURL") && type.contains("ContentDirectory") && control.isEmpty()) control = t;
            } else if (ev == XmlPullParser.END_TAG) {
                if (localName(p.getName()).equals("service")) inService = false;
                tag = "";
            }
        }
        if (control.isEmpty()) return null;
        String root = base.isEmpty() ? location : base;
        JSONObject o = new JSONObject();
        o.put("name", name.isEmpty() ? "Medya sunucusu" : name);
        o.put("control", new URL(new URL(root), control).toString());
        return o;
    }

    /** ContentDirectory klasörünü listeler. Dönüş: {entries:[{id,name,dir,url,size,mime}]}. */
    static JSONObject upnpBrowse(String control, String objectId) throws Exception {
        JSONArray entries = new JSONArray();
        int start = 0;
        int total = Integer.MAX_VALUE;
        while (start < total && start < 3000) {
            String soap = "<?xml version=\"1.0\"?><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">"
                + "<s:Body><u:Browse xmlns:u=\"urn:schemas-upnp-org:service:ContentDirectory:1\"><ObjectID>" + xmlEsc(objectId) + "</ObjectID>"
                + "<BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>" + start + "</StartingIndex>"
                + "<RequestedCount>300</RequestedCount><SortCriteria></SortCriteria></u:Browse></s:Body></s:Envelope>";
            Request req = new Request.Builder().url(control)
                .post(RequestBody.create(soap, MediaType.parse("text/xml; charset=\"utf-8\"")))
                .header("SOAPACTION", "\"urn:schemas-upnp-org:service:ContentDirectory:1#Browse\"")
                .build();
            String resp = fetch(req);
            String didl = "";
            int returned = 0;
            XmlPullParser p = Xml.newPullParser();
            p.setInput(new StringReader(resp));
            String tag = "";
            for (int ev = p.getEventType(); ev != XmlPullParser.END_DOCUMENT; ev = p.next()) {
                if (ev == XmlPullParser.START_TAG) tag = localName(p.getName());
                else if (ev == XmlPullParser.TEXT) {
                    String t = p.getText() == null ? "" : p.getText();
                    if (tag.equals("Result")) didl += t;
                    else if (tag.equals("NumberReturned")) returned = parseInt(t.trim());
                    else if (tag.equals("TotalMatches")) total = parseInt(t.trim());
                } else if (ev == XmlPullParser.END_TAG) tag = "";
            }
            parseDidl(didl, entries);
            if (returned <= 0) break;
            start += returned;
        }
        JSONObject r = new JSONObject();
        r.put("entries", entries);
        return r;
    }

    private static int parseInt(String s) {
        try { return Integer.parseInt(s); } catch (NumberFormatException e) { return 0; }
    }

    private static String xmlEsc(String s) {
        return String.valueOf(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static void parseDidl(String didl, JSONArray out) throws Exception {
        if (didl.isEmpty()) return;
        XmlPullParser p = Xml.newPullParser();
        p.setInput(new StringReader(didl));
        String id = "", title = "", url = "", mime = "", tag = "";
        long size = 0;
        boolean inItem = false, isDir = false, haveRes = false;
        for (int ev = p.getEventType(); ev != XmlPullParser.END_DOCUMENT; ev = p.next()) {
            if (ev == XmlPullParser.START_TAG) {
                tag = localName(p.getName());
                if (tag.equals("container") || tag.equals("item")) {
                    inItem = true;
                    isDir = tag.equals("container");
                    id = p.getAttributeValue(null, "id") == null ? "" : p.getAttributeValue(null, "id");
                    title = ""; url = ""; mime = ""; size = 0; haveRes = false;
                } else if (inItem && tag.equals("res") && !haveRes) {
                    String info = p.getAttributeValue(null, "protocolInfo");
                    String[] f = info == null ? new String[0] : info.split(":");
                    String m = f.length >= 3 ? f[2] : "";
                    if (m.startsWith("video/") || m.startsWith("audio/") || m.startsWith("image/")) {
                        mime = m;
                        String sz = p.getAttributeValue(null, "size");
                        try { size = sz == null ? 0 : Long.parseLong(sz); } catch (NumberFormatException e) { size = 0; }
                        haveRes = true;
                        tag = "res"; // metin bir sonraki TEXT olayında okunur
                    } else {
                        tag = "resSkip";
                    }
                }
            } else if (ev == XmlPullParser.TEXT && inItem) {
                String t = p.getText() == null ? "" : p.getText().trim();
                if (t.isEmpty()) continue;
                if (tag.equals("title") && title.isEmpty()) title = t;
                else if (tag.equals("res") && url.isEmpty()) url = t;
            } else if (ev == XmlPullParser.END_TAG) {
                String n = localName(p.getName());
                if ((n.equals("container") || n.equals("item")) && inItem) {
                    inItem = false;
                    if (isDir || !url.isEmpty()) {
                        JSONObject o = new JSONObject();
                        o.put("id", id);
                        o.put("name", title.isEmpty() ? "Adsız" : title);
                        o.put("dir", isDir);
                        o.put("url", url);
                        o.put("size", size);
                        o.put("mime", mime);
                        out.put(o);
                    }
                }
                tag = "";
            }
        }
    }

    // ------------------------------------------------------------------ SMB

    private static final ConcurrentHashMap<String, CIFSContext> CTX = new ConcurrentHashMap<>();

    private static CIFSContext smbContext(String user, String pass) throws Exception {
        String key = (user == null ? "" : user) + "\u0000" + (pass == null ? "" : pass);
        CIFSContext c = CTX.get(key);
        if (c != null) return c;
        Properties props = new Properties();
        props.setProperty("jcifs.smb.client.responseTimeout", "15000");
        props.setProperty("jcifs.smb.client.connTimeout", "10000");
        CIFSContext base = new BaseContext(new PropertyConfiguration(props));
        if (user == null || user.isEmpty()) {
            // Kullanıcı adı boşsa misafir girişi (jcifs-ng 2.1.10'da withGuestCredentials yok; GUEST kullanıcısı aynı işi görür)
            c = base.withCredentials(new NtlmPasswordAuthenticator(null, "GUEST", ""));
        } else {
            String domain = "";
            String u = user;
            int bs = user.indexOf('\\');
            if (bs > 0) { domain = user.substring(0, bs); u = user.substring(bs + 1); }
            c = base.withCredentials(new NtlmPasswordAuthenticator(domain, u, pass == null ? "" : pass));
        }
        CTX.put(key, c);
        return c;
    }

    private static String smbUrl(String host, String path, boolean dir) {
        String p = path == null ? "" : path.replace('\\', '/');
        while (p.startsWith("/")) p = p.substring(1);
        String url = "smb://" + host + "/" + p;
        if (dir && !url.endsWith("/")) url += "/";
        return url;
    }

    /** SMB klasörünü listeler; path boşsa sunucunun paylaşımları gelir. Dönüş: {entries:[{name,dir,size,path}]}. */
    static JSONObject smbList(String host, String path, String user, String pass) throws Exception {
        CIFSContext ctx = smbContext(user, pass);
        SmbFile dir = new SmbFile(smbUrl(host, path, true), ctx);
        JSONArray entries = new JSONArray();
        String base = path == null ? "" : path.replace('\\', '/');
        while (base.startsWith("/")) base = base.substring(1);
        if (!base.isEmpty() && !base.endsWith("/")) base += "/";
        for (SmbFile f : dir.listFiles()) {
            String name = f.getName();
            boolean isDir = f.isDirectory() || name.endsWith("/");
            if (name.endsWith("/")) name = name.substring(0, name.length() - 1);
            if (name.isEmpty() || name.endsWith("$")) continue; // IPC$, ADMIN$ gibi yönetim paylaşımları
            JSONObject o = new JSONObject();
            o.put("name", name);
            o.put("dir", isDir);
            o.put("size", isDir ? 0L : f.length());
            o.put("path", base + name);
            entries.put(o);
        }
        JSONObject r = new JSONObject();
        r.put("entries", entries);
        return r;
    }

    /** SMB dosyası için oynatıcının açabileceği yerel köprü adresi. */
    static String smbPlayUrl(String host, String path, String user, String pass) throws Exception {
        SmbFile f = new SmbFile(smbUrl(host, path, false), smbContext(user, pass));
        String name = f.getName();
        return SmbProxy.register(f, name);
    }

    /** 127.0.0.1 üzerinde Range destekli küçük HTTP sunucusu: oynatıcı SMB dosyasını bu adresten okur. */
    private static final class SmbProxy {
        private static final ConcurrentHashMap<String, SmbFile> ROUTES = new ConcurrentHashMap<>();
        private static final ExecutorService POOL = Executors.newCachedThreadPool();
        private static ServerSocket server;

        static synchronized String register(SmbFile f, String name) throws IOException {
            if (server == null || server.isClosed()) {
                server = new ServerSocket();
                server.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
                final ServerSocket s = server;
                Thread t = new Thread(() -> {
                    while (!s.isClosed()) {
                        try {
                            final Socket c = s.accept();
                            POOL.execute(() -> serve(c));
                        } catch (IOException e) {
                            break;
                        }
                    }
                }, "iptv-smb-proxy");
                t.setDaemon(true);
                t.start();
            }
            String token = UUID.randomUUID().toString().replace("-", "");
            ROUTES.put(token, f);
            return "http://127.0.0.1:" + server.getLocalPort() + "/s/" + token + "/" + Uri.encode(name);
        }

        private static String mimeOf(String name) {
            String n = name.toLowerCase(Locale.ROOT);
            if (n.endsWith(".mp4") || n.endsWith(".m4v")) return "video/mp4";
            if (n.endsWith(".mkv")) return "video/x-matroska";
            if (n.endsWith(".webm")) return "video/webm";
            if (n.endsWith(".avi")) return "video/x-msvideo";
            if (n.endsWith(".mov")) return "video/quicktime";
            if (n.endsWith(".ts") || n.endsWith(".m2ts")) return "video/mp2t";
            if (n.endsWith(".mp3")) return "audio/mpeg";
            if (n.endsWith(".m4a") || n.endsWith(".aac")) return "audio/mp4";
            if (n.endsWith(".flac")) return "audio/flac";
            if (n.endsWith(".ogg") || n.endsWith(".opus")) return "audio/ogg";
            if (n.endsWith(".wav")) return "audio/wav";
            if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
            if (n.endsWith(".png")) return "image/png";
            return "application/octet-stream";
        }

        private static void serve(Socket c) {
            InputStream in = null;
            try {
                c.setSoTimeout(30000);
                BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.ISO_8859_1));
                String req = r.readLine();
                if (req == null) return;
                String[] parts = req.split(" ");
                long from = 0, to = -1;
                boolean ranged = false;
                String line;
                while ((line = r.readLine()) != null && !line.isEmpty()) {
                    if (line.toLowerCase(Locale.ROOT).startsWith("range:")) {
                        String v = line.substring(6).trim().toLowerCase(Locale.ROOT);
                        if (v.startsWith("bytes=")) {
                            String[] se = v.substring(6).split("-", -1);
                            try {
                                if (!se[0].isEmpty()) from = Long.parseLong(se[0]);
                                if (se.length > 1 && !se[1].isEmpty()) to = Long.parseLong(se[1]);
                                ranged = true;
                            } catch (NumberFormatException ignored) {
                                ranged = false;
                            }
                        }
                    }
                }
                OutputStream out = c.getOutputStream();
                String[] seg = parts.length > 1 ? parts[1].split("/") : new String[0];
                SmbFile f = seg.length >= 3 ? ROUTES.get(seg[2]) : null;
                if (f == null) {
                    out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
                    out.flush();
                    return;
                }
                long len = f.length();
                if (to < 0 || to >= len) to = len - 1;
                if (from >= len) {
                    out.write(("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */" + len + "\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                    out.flush();
                    return;
                }
                long count = to - from + 1;
                StringBuilder h = new StringBuilder();
                h.append(ranged ? "HTTP/1.1 206 Partial Content\r\n" : "HTTP/1.1 200 OK\r\n");
                h.append("Content-Type: ").append(mimeOf(f.getName())).append("\r\n");
                h.append("Accept-Ranges: bytes\r\n");
                if (ranged) h.append("Content-Range: bytes ").append(from).append('-').append(to).append('/').append(len).append("\r\n");
                h.append("Content-Length: ").append(count).append("\r\nConnection: close\r\n\r\n");
                out.write(h.toString().getBytes(StandardCharsets.US_ASCII));
                if ("HEAD".equals(parts[0])) {
                    out.flush();
                    return;
                }
                in = f.getInputStream();
                long skipped = 0;
                while (skipped < from) {
                    long n = in.skip(from - skipped);
                    if (n <= 0) break;
                    skipped += n;
                }
                byte[] buf = new byte[65536];
                long left = count;
                while (left > 0) {
                    int n = in.read(buf, 0, (int) Math.min(buf.length, left));
                    if (n < 0) break;
                    out.write(buf, 0, n);
                    left -= n;
                }
                out.flush();
            } catch (Exception ignored) {
                // oynatıcı bağlantıyı kapattı (arama/durdurma): normal
            } finally {
                try {
                    if (in != null) in.close();
                } catch (Exception ignored) {
                    // kapanış hatası önemsiz
                }
                try {
                    c.close();
                } catch (Exception ignored) {
                    // kapanış hatası önemsiz
                }
            }
        }
    }
}
