package com.koruk.iptv;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;

// Görsel önbelleği: afişler, kanal logoları, takım rozetleri ve bayraklar cihazda kalır, her açılışta yeniden inmez.
// WebView'in görsel isteklerine (ImageWebViewClient) araya girilir: önbellekte varsa dosyadan verilir, yoksa indirilip kaydedilir ve verilir;
// indirilemezse null döner ve WebView görseli kendisi dener (ekranlardaki <img> kodu değişmez). Önceden indirme (warm) aynı yolu kullanır.
// Sistem önbellek klasöründe durur: yer azalırsa Android silebilir, Ayarlar > Uygulama > Önbelleği temizle de siler. Üst sınır dolunca en eskiler gider.
final class ImageCache {
    private static final long MAX_BYTES = 160L * 1024 * 1024;
    private static final int MAX_ITEM = 4 * 1024 * 1024; // daha büyük dosya (afiş değil) önbelleğe alınmaz
    private static final long TTL_MS = 14L * 86400000L; // aynı adreste değişen görsel en geç 14 günde yenilenir
    private static final long FAIL_MS = 120000L; // indirilemeyen adres 2 dk boyunca bir daha denenmez (WebView doğrudan dener)
    private static final String DEFAULT_UA = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
    private static final String[][] TYPES = {
            {"png", "image/png"}, {"jpg", "image/jpeg"}, {"gif", "image/gif"}, {"webp", "image/webp"},
            {"svg", "image/svg+xml"}, {"avif", "image/avif"}, {"bmp", "image/bmp"}, {"ico", "image/x-icon"},
    };

    private static final char[] HEX = "0123456789abcdef".toCharArray();
    // Aynı anda en çok bu kadar indirme: zayıf TV kutusunda yüzlerce afiş birden inerse ağ, işlemci ve WebView iş parçacıkları tıkanıp arayüz kasıyordu.
    private static final Semaphore GATE = new Semaphore(4);
    // Anahtar → uzantı: önbellekte olan görseller için her istekte 8 dosya yoklaması yapılmaz (kaydı yoksa eski yoklama sürer).
    private static final Map<String, String> KNOWN = new ConcurrentHashMap<>();

    private static volatile File dir;
    private static final Object TRIM = new Object();
    private static long total = -1; // önbellekteki toplam bayt (ilk kırpmada hesaplanır)
    private static final Map<String, Object> locks = new ConcurrentHashMap<>();
    private static final Map<String, Long> failed = new ConcurrentHashMap<>();

    private ImageCache() {}

    static void init(Context c) {
        File d = new File(c.getCacheDir(), "imgcache");
        if (!d.isDirectory()) d.mkdirs();
        dir = d;
        // süresi geçenleri ve yarım kalan indirmeleri açılışı geciktirmeden temizle
        new Thread(() -> {
            try {
                File[] all = d.listFiles();
                if (all == null) return;
                long now = System.currentTimeMillis();
                for (File f : all) {
                    boolean tmp = f.getName().endsWith(".tmp");
                    if ((tmp && now - f.lastModified() > 3600000L) || (!tmp && now - f.lastModified() > TTL_MS)) f.delete();
                }
            } catch (Throwable ignored) {
                // temizlik başarısız olsa da önbellek çalışır
            }
        }, "img-clean").start();
    }

    private static String keyOf(String url) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-1").digest(url.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder(40);
            for (byte b : h) sb.append(HEX[(b >> 4) & 15]).append(HEX[b & 15]);
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(url.hashCode());
        }
    }

    private static String extFor(String contentType) {
        if (contentType == null) return null;
        String t = contentType.toLowerCase(Locale.US);
        int semi = t.indexOf(';');
        if (semi >= 0) t = t.substring(0, semi);
        t = t.trim();
        if (t.equals("image/jpg")) t = "image/jpeg";
        if (t.equals("image/vnd.microsoft.icon")) t = "image/x-icon";
        for (String[] ty : TYPES) if (ty[1].equals(t)) return ty[0];
        return null;
    }

    private static String mimeOf(String ext) {
        for (String[] ty : TYPES) if (ty[0].equals(ext)) return ty[1];
        return "image/png";
    }

    // Taze kayıt dosyası; yoksa ya da süresi geçtiyse null (geçmişse silinir).
    private static File cached(String url) {
        File d = dir;
        if (d == null) return null;
        String key = keyOf(url);
        String ext = KNOWN.get(key);
        if (ext != null) {
            File f = new File(d, key + "." + ext);
            if (f.isFile() && System.currentTimeMillis() - f.lastModified() < TTL_MS && f.length() > 0) return f;
            KNOWN.remove(key); // silinmiş ya da süresi geçmiş: aşağıdaki yoklama karar verir
        }
        for (String[] ty : TYPES) {
            File f = new File(d, key + "." + ty[0]);
            if (!f.isFile()) continue;
            if (System.currentTimeMillis() - f.lastModified() < TTL_MS && f.length() > 0) {
                KNOWN.put(key, ty[0]);
                return f;
            }
            f.delete();
        }
        return null;
    }

    private static String header(Map<String, String> h, String name) {
        if (h == null) return null;
        for (Map.Entry<String, String> e : h.entrySet()) if (e.getKey() != null && e.getKey().equalsIgnoreCase(name)) return e.getValue();
        return null;
    }

    // WebView görsel isteği: önbellekten ya da indirip kaydederek yanıtlar; yapamazsa null (WebView kendisi indirir).
    static WebResourceResponse serve(WebResourceRequest r) {
        try {
            if (dir == null || r == null || !"GET".equalsIgnoreCase(r.getMethod())) return null;
            Uri u = r.getUrl();
            if (u == null) return null;
            String scheme = u.getScheme();
            String host = u.getHost();
            if (host == null || !("http".equals(scheme) || "https".equals(scheme))) return null;
            if (host.equals("localhost") || host.startsWith("127.")) return null; // uygulamanın kendi dosyaları (Capacitor yerel sunucu)
            Map<String, String> h = r.getRequestHeaders();
            String accept = header(h, "Accept");
            if (accept == null || !accept.toLowerCase(Locale.US).startsWith("image/") || header(h, "Range") != null) return null;
            String url = u.toString();
            File f = cached(url);
            if (f == null) {
                Long bad = failed.get(url);
                if (bad != null && System.currentTimeMillis() - bad < FAIL_MS) return null;
                f = download(url, header(h, "User-Agent"), accept, header(h, "Accept-Language"));
                if (f == null) {
                    if (failed.size() > 500) failed.clear();
                    failed.put(url, System.currentTimeMillis());
                    return null;
                }
            }
            return respond(f);
        } catch (Throwable t) {
            return null;
        }
    }

    private static WebResourceResponse respond(File f) throws IOException {
        String n = f.getName();
        String ext = n.substring(n.lastIndexOf('.') + 1);
        Map<String, String> hd = new HashMap<>();
        hd.put("Access-Control-Allow-Origin", "*"); // crossorigin'li görsel isteği de (tuval okuma) çalışsın
        hd.put("Cache-Control", "max-age=86400");
        return new WebResourceResponse(mimeOf(ext), null, 200, "OK", hd, new FileInputStream(f));
    }

    // Aynı adresi aynı anda isteyenler tek indirmeyi paylaşır.
    private static File download(String url, String ua, String accept, String lang) {
        String key = keyOf(url);
        Object fresh = new Object();
        Object lock = locks.putIfAbsent(key, fresh);
        if (lock == null) lock = fresh;
        synchronized (lock) {
            try {
                File f = cached(url); // bekleyen başka istek indirmiş olabilir
                return f != null ? f : fetchGated(url, key, ua, accept, lang);
            } finally {
                locks.remove(key);
            }
        }
    }

    private static File fetchGated(String url, String key, String ua, String accept, String lang) {
        GATE.acquireUninterruptibly();
        try {
            return fetch(url, key, ua, accept, lang);
        } finally {
            GATE.release();
        }
    }

    private static File fetch(String url, String key, String ua, String accept, String lang) {
        HttpURLConnection c = null;
        File tmp = null;
        try {
            String cur = url;
            int code = -1;
            for (int hop = 0; hop < 5; hop++) {
                c = (HttpURLConnection) new URL(cur).openConnection();
                c.setInstanceFollowRedirects(false); // http<->https yönlendirmesini HttpURLConnection izlemez; elle izlenir
                c.setConnectTimeout(8000);
                c.setReadTimeout(12000);
                c.setRequestProperty("User-Agent", ua != null && !ua.isEmpty() ? ua : DEFAULT_UA);
                c.setRequestProperty("Accept", accept != null ? accept : "image/*,*/*;q=0.8");
                if (lang != null) c.setRequestProperty("Accept-Language", lang);
                code = c.getResponseCode();
                if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                    String loc = c.getHeaderField("Location");
                    c.disconnect();
                    c = null;
                    if (loc == null) return null;
                    cur = new URL(new URL(cur), loc).toString();
                    continue;
                }
                break;
            }
            if (c == null || code != 200) return null;
            String ext = extFor(c.getContentType());
            if (ext == null || c.getContentLength() > MAX_ITEM) return null;
            tmp = File.createTempFile("dl_", ".tmp", dir);
            long size = 0;
            try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(tmp)) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) {
                    size += n;
                    if (size > MAX_ITEM) return null;
                    out.write(buf, 0, n);
                }
            }
            if (size == 0) return null;
            File out = new File(dir, key + "." + ext);
            for (String[] ty : TYPES) new File(dir, key + "." + ty[0]).delete(); // tür değiştiyse eskisi kalmasın
            if (!tmp.renameTo(out)) return null;
            KNOWN.put(key, ext);
            trim(size);
            return out;
        } catch (Throwable t) {
            return null;
        } finally {
            if (c != null) c.disconnect();
            if (tmp != null && tmp.exists()) tmp.delete();
        }
    }

    // Toplam MAX_BYTES'ı aşarsa en eski kayıtlar %80'e inene kadar silinir.
    private static void trim(long added) {
        synchronized (TRIM) {
            File d = dir;
            if (d == null) return;
            if (total < 0) total = sizeOnDisk();
            else total += added;
            if (total <= MAX_BYTES) return;
            File[] all = d.listFiles();
            if (all == null) return;
            Arrays.sort(all, Comparator.comparingLong(File::lastModified));
            long target = MAX_BYTES / 10 * 8;
            for (File f : all) {
                if (total <= target) break;
                long len = f.length();
                if (f.delete()) total -= len;
            }
        }
    }

    private static long sizeOnDisk() {
        File d = dir;
        File[] all = d == null ? null : d.listFiles();
        long sum = 0;
        if (all != null) for (File f : all) sum += f.length();
        return sum;
    }

    // Önceden indirme: önbellekte olmayan http(s) adreslerini sırayla indirir; eklenen sayıyı döndürür.
    static int warm(List<String> urls) {
        if (dir == null) return 0;
        int added = 0;
        for (String u : urls) {
            try {
                if (u == null || !(u.startsWith("http://") || u.startsWith("https://"))) continue;
                if (cached(u) != null) continue;
                if (download(u, null, null, null) != null) added++;
            } catch (Throwable ignored) {
                // bir görsel indirilemese de diğerleri sürer
            }
        }
        return added;
    }

    static long bytes() {
        synchronized (TRIM) {
            total = sizeOnDisk();
            return total;
        }
    }

    static int count() {
        File d = dir;
        File[] all = d == null ? null : d.listFiles();
        int n = 0;
        if (all != null) for (File f : all) if (!f.getName().endsWith(".tmp")) n++;
        return n;
    }

    static void clear() {
        synchronized (TRIM) {
            File d = dir;
            File[] all = d == null ? null : d.listFiles();
            if (all != null) for (File f : all) f.delete();
            total = 0;
            failed.clear();
            KNOWN.clear();
        }
    }

    static List<String> clean(List<String> in, int max) {
        List<String> out = new ArrayList<>();
        for (String s : in) {
            if (s != null && (s.startsWith("http://") || s.startsWith("https://")) && s.length() < 2000 && !out.contains(s)) out.add(s);
            if (out.size() >= max) break;
        }
        return out;
    }
}
