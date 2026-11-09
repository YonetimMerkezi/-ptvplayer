package com.koruk.iptv;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Environment;
import android.os.PowerManager;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Çevrimdışı izleme için film/bölüm indirme: tek dosyalık (mkv/mp4/…) adresleri sırayla indirir.
 * Bir seferde yalnız bir indirme çalışır (sağlayıcıların bağlantı sınırını aşmamak için). Kaldığı yerden sürer (HTTP Range).
 * "Hızlı indirme" açıksa ve sunucu Range veriyorsa dosya parçalara bölünür, birkaç bağlantıyla aynı anda iner; sunucu fazla
 * bağlantıyı reddederse kendiliğinden tek bağlantıya düşer (kalan parçalar sırayla iner).
 * Durum ve ayarlar özel klasördeki &lt;kimlik&gt;.json yan dosyasında tutulur; veri &lt;kimlik&gt;.part → bitince &lt;kimlik&gt;.&lt;uzantı&gt;.
 * İndirmeyi DownloadService (ön plan hizmeti) çalıştırır; uygulama kapalıyken de sürer.
 */
final class Downloads {
    interface Listener {
        void onChange(JSONObject job);
    }

    static final String QUEUED = "queued";
    static final String DOWNLOADING = "downloading";
    static final String WAITING = "waiting"; // yalnız Wi-Fi seçili ve ağ kotalı: uygun ağ beklenir
    static final String PAUSED = "paused";
    static final String DONE = "done";
    static final String ERROR = "error";
    static final String REMOVED = "removed";

    private static final String UA = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
    private static final Pattern ID_OK = Pattern.compile("[A-Za-z0-9_-]{1,80}");
    private static final Pattern EXT_OK = Pattern.compile("[a-z0-9]{2,4}");
    private static final Pattern RANGE = Pattern.compile("bytes\\s+(\\d+)-(\\d+)/(\\d+|\\*)");
    static final long MIN_FREE_BYTES = 200L * 1024L * 1024L;
    private static final long STOP_FREE_BYTES = 30L * 1024L * 1024L;
    private static final long MIN_FILE_BYTES = 64L * 1024L;
    private static final int MAX_RETRY = 5;
    private static final long WAIT_NET_MS = 30L * 60L * 1000L;
    private static final int FAST_SEGS = 8;
    private static final int FR_DONE = 0;
    private static final int FR_STOP = 1;
    private static final int FR_WAIT = 2;
    private static final int FR_RESET = 3;
    /** Hızlı indirmede aynı anda açılan bağlantı sayısı ve bu yöntemin kullanılacağı en küçük dosya boyutu (testler değiştirir). */
    static volatile int fastConns = 4;
    static volatile long fastMin = 32L * 1024L * 1024L;

    private static final int CMD_NONE = 0;
    private static final int CMD_PAUSE = 1;
    private static final int CMD_REMOVE = 2;

    static final class Job {
        String id = "";
        String url = "";
        String headers = "";
        String name = "";
        String ext = "";
        String meta = ""; // JS'nin kendi bilgisi (opak): kaynak, öğe, bölüm vb.
        String state = QUEUED;
        String error = "";
        String file = "";
        boolean wifiOnly;
        boolean fast; // hızlı (çok bağlantılı) indirme istendi
        Seg[] segs; // parçalı indirme: bölünmüş aralıklar ve her birinin ilerlemesi; null → tek parça
        long bytes;
        long total = -1;
        long speed;
        long createdAt;
        long order;

        JSONObject toJson(File dir) {
            JSONObject o = new JSONObject();
            try {
                o.put("id", id);
                o.put("name", name);
                o.put("ext", ext);
                o.put("meta", meta);
                o.put("state", state);
                o.put("error", error);
                o.put("wifiOnly", wifiOnly);
                o.put("bytes", bytes);
                o.put("total", total);
                o.put("speed", speed);
                o.put("createdAt", createdAt);
                if (DONE.equals(state) && !file.isEmpty()) {
                    o.put("file", file);
                    o.put("url", Uri.fromFile(new File(dir, file)).toString());
                }
            } catch (Exception ignored) {
                // anahtarlar sabit: atılmaz
            }
            return o;
        }
    }

    private static final class HttpError extends IOException {
        final int code;

        HttpError(int code) {
            super("HTTP " + code);
            this.code = code;
        }
    }

    /** Yeniden denemenin anlamsız olduğu hata (video değil, depolama dolu vb.). */
    private static final class Fatal extends IOException {
        Fatal(String m) {
            super(m);
        }
    }

    /** Parçalı indirmede dosyanın [start, end) aralığı; pos bir sonraki yazılacak bayttır (yalnız sahibi iş parçacığı yazar). */
    private static final class Seg {
        final long start;
        final long end;
        volatile long pos;
        boolean busy; // LOCK altında

        Seg(long start, long end, long pos) {
            this.start = start;
            this.end = end;
            this.pos = pos;
        }

        boolean complete() {
            return pos >= end;
        }
    }

    private static long segSum(Seg[] segs) {
        long n = 0;
        for (Seg x : segs) n += Math.max(0L, Math.min(x.pos, x.end) - x.start);
        return n;
    }

    private static boolean allComplete(Seg[] segs) {
        for (Seg x : segs) if (!x.complete()) return false;
        return true;
    }

    private static int incompleteCount(Seg[] segs) {
        int n = 0;
        for (Seg x : segs) if (!x.complete()) n++;
        return n;
    }

    private static String segsToString(Seg[] segs) {
        if (segs == null) return "";
        StringBuilder sb = new StringBuilder();
        for (Seg x : segs) {
            if (sb.length() > 0) sb.append(';');
            sb.append(x.start).append(',').append(x.end).append(',').append(Math.min(x.pos, x.end));
        }
        return sb.toString();
    }

    /** "başlangıç,bitiş,konum;…" → parçalar; boşluksuz kaplama ve toplam boyut tutmuyorsa null. */
    private static Seg[] segsFromString(String str, long total) {
        if (str == null || str.isEmpty() || total <= 0) return null;
        try {
            String[] parts = str.split(";");
            Seg[] out = new Seg[parts.length];
            long next = 0;
            for (int i = 0; i < parts.length; i++) {
                String[] f = parts[i].split(",");
                long a = Long.parseLong(f[0]);
                long b = Long.parseLong(f[1]);
                long p = Long.parseLong(f[2]);
                if (a != next || b <= a || p < a || p > b) return null;
                out[i] = new Seg(a, b, p);
                next = b;
            }
            return next == total ? out : null;
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static long bytesOf(Job j, File part) {
        Seg[] s = j.segs;
        return s != null ? segSum(s) : (part.exists() ? part.length() : 0);
    }

    private static final Object LOCK = new Object();
    private static final LinkedHashMap<String, Job> JOBS = new LinkedHashMap<>();
    private static boolean loaded;
    private static boolean starting;
    private static boolean running;
    private static long seq;
    private static volatile boolean stopWorker;
    private static volatile int curCmd = CMD_NONE;
    private static volatile String curId = "";
    private static volatile Listener listener;

    private Downloads() {}

    static void setListener(Listener l) {
        listener = l;
    }

    // ------------------------------------------------------------------ klasörler

    /** İndirilen medya dosyaları (uygulamaya özel Filmler/Indirilenler). */
    static File dirOf(Context c) {
        File base = c.getExternalFilesDir(Environment.DIRECTORY_MOVIES);
        File dir = new File(base != null ? base : c.getFilesDir(), "Indirilenler");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return dir;
    }

    // Yan dosyalar (adres/başlık bilgisi içerir) uygulamaya özel iç depoda tutulur.
    private static File metaDir(Context c) {
        File dir = new File(c.getFilesDir(), "indirmeler");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return dir;
    }

    static long usedBytes(Context c) {
        Context app = c.getApplicationContext();
        File[] fs = dirOf(app).listFiles();
        long used = 0;
        synchronized (LOCK) {
            ensureLoaded(app);
            if (fs != null) {
                for (File f : fs) {
                    String n = f.getName();
                    Job j = n.endsWith(".part") ? JOBS.get(n.substring(0, n.length() - 5)) : null;
                    // Parçalı indirmede dosya baştan tam boyda ayrılır: gerçekten inen kadarı sayılır
                    used += j != null && j.segs != null ? segSum(j.segs) : f.length();
                }
            }
        }
        return used;
    }

    // ------------------------------------------------------------------ yükleme / kayıt

    private static Job fromJson(JSONObject o) {
        Job j = new Job();
        j.id = o.optString("id", "");
        j.url = o.optString("url", "");
        j.headers = o.optString("headers", "");
        j.name = o.optString("name", "");
        j.ext = cleanExt(o.optString("ext", ""));
        j.meta = o.optString("meta", "");
        j.state = o.optString("state", QUEUED);
        j.error = o.optString("error", "");
        j.file = o.optString("file", "");
        j.wifiOnly = o.optBoolean("wifiOnly", false);
        j.fast = o.optBoolean("fast", false);
        j.total = o.optLong("total", -1L);
        j.segs = segsFromString(o.optString("segs", ""), j.total);
        j.createdAt = o.optLong("createdAt", 0L);
        j.order = o.optLong("order", 0L);
        return j;
    }

    private static void save(Context c, Job j) {
        try {
            JSONObject o = new JSONObject();
            o.put("id", j.id);
            o.put("url", j.url);
            o.put("headers", j.headers);
            o.put("name", j.name);
            o.put("ext", j.ext);
            o.put("meta", j.meta);
            o.put("state", j.state);
            o.put("error", j.error);
            o.put("file", j.file);
            o.put("wifiOnly", j.wifiOnly);
            o.put("fast", j.fast);
            o.put("segs", segsToString(j.segs));
            o.put("total", j.total);
            o.put("createdAt", j.createdAt);
            o.put("order", j.order);
            File dir = metaDir(c);
            File tmp = new File(dir, j.id + ".json.tmp");
            try (OutputStream out = new FileOutputStream(tmp)) {
                out.write(o.toString().getBytes(StandardCharsets.UTF_8));
            }
            File fin = new File(dir, j.id + ".json");
            if (!tmp.renameTo(fin)) {
                //noinspection ResultOfMethodCallIgnored
                fin.delete();
                //noinspection ResultOfMethodCallIgnored
                tmp.renameTo(fin);
            }
        } catch (Exception ignored) {
            // yan dosya yazılamadıysa bu oturumda bellekteki durum geçerli kalır
        }
    }

    // Yan dosyaları bir kez okur; yarım kalan "indiriliyor" işleri sıraya döner (süreç öldürülmüş demektir).
    private static void ensureLoaded(Context c) {
        if (loaded) return;
        loaded = true;
        File[] fs = metaDir(c).listFiles((d, n) -> n.endsWith(".json"));
        final boolean listed = fs != null; // liste okunamadıysa hiçbir şey silinmez
        if (fs == null) fs = new File[0];
        List<Job> list = new ArrayList<>();
        for (File f : fs) {
            try {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                try (InputStream in = new FileInputStream(f)) {
                    byte[] b = new byte[8192];
                    int n;
                    while ((n = in.read(b)) > 0) bo.write(b, 0, n);
                }
                Job j = fromJson(new JSONObject(new String(bo.toByteArray(), StandardCharsets.UTF_8)));
                if (!ID_OK.matcher(j.id).matches()) continue;
                list.add(j);
            } catch (Exception ignored) {
                // bozuk yan dosya yok sayılır
            }
        }
        Collections.sort(list, (a, b) -> Long.compare(a.order, b.order));
        File dir = dirOf(c);
        for (Job j : list) {
            if (DONE.equals(j.state)) {
                File f = new File(dir, j.file);
                if (j.file.isEmpty() || !f.exists()) { // dosya silinmiş ya da depolama yok: hata olarak kalır (yeniden indirilebilir)
                    j.state = ERROR;
                    j.error = "İndirilen dosya bulunamadı";
                    j.file = "";
                    j.bytes = 0;
                } else {
                    j.bytes = f.length();
                }
            } else {
                File part = new File(dir, j.id + ".part");
                if (j.segs != null && (!part.exists() || part.length() != j.total)) j.segs = null; // ayrılmış dosya yok/bozuk: baştan
                j.bytes = bytesOf(j, part);
                if (DOWNLOADING.equals(j.state)) j.state = QUEUED;
            }
            seq = Math.max(seq, j.order + 1);
            JOBS.put(j.id, j);
        }
        // Yan dosyası olmayan artık .part parçaları temizlenir (biten dosyalara asla dokunulmaz)
        if (listed) {
            File[] media = dir.listFiles((d, n) -> n.endsWith(".part"));
            if (media != null) {
                for (File f : media) {
                    String n = f.getName();
                    if (!JOBS.containsKey(n.substring(0, n.length() - 5))) {
                        //noinspection ResultOfMethodCallIgnored
                        f.delete();
                    }
                }
            }
        }
    }

    private static String cleanExt(String e) {
        String s = String.valueOf(e).toLowerCase(Locale.ROOT).replace(".", "");
        return EXT_OK.matcher(s).matches() ? s : "";
    }

    // ------------------------------------------------------------------ dış arayüz

    /** Yeni indirme ekler (aynı kimlik varsa durduysa/hatalıysa yeniden sıraya alır). Dönüş: işin JSON'u. */
    static JSONObject add(Context c, JSONObject req) throws IOException {
        Context app = c.getApplicationContext();
        String id = req.optString("id", "");
        String url = req.optString("url", "");
        if (!ID_OK.matcher(id).matches()) throw new IOException("Geçersiz indirme kimliği");
        if (!url.startsWith("http://") && !url.startsWith("https://")) throw new IOException("Geçersiz adres");
        String path = url.toLowerCase(Locale.ROOT);
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);
        if (path.endsWith(".m3u8") || path.endsWith(".mpd")) throw new IOException("Canlı/parçalı (m3u8) yayınlar indirilemez");
        File dir = dirOf(app);
        JSONObject out;
        synchronized (LOCK) {
            ensureLoaded(app);
            Job j = JOBS.get(id);
            if (j != null && DONE.equals(j.state)) return j.toJson(dir);
            if (j != null && DOWNLOADING.equals(j.state)) return j.toJson(dir);
            if (dir.getUsableSpace() < MIN_FREE_BYTES) {
                throw new IOException("Yetersiz depolama alanı (en az " + Notifier.size(MIN_FREE_BYTES) + " boş yer gerekir)");
            }
            if (j == null) {
                j = new Job();
                j.id = id;
                j.createdAt = System.currentTimeMillis();
                j.order = seq++;
                JOBS.put(id, j);
            }
            j.url = url;
            j.headers = req.optString("headers", "");
            j.name = req.optString("name", "").trim();
            if (j.name.isEmpty()) j.name = "İndirme";
            j.ext = cleanExt(req.optString("ext", ""));
            j.meta = req.optString("meta", "");
            j.wifiOnly = req.optBoolean("wifiOnly", false);
            j.fast = req.optBoolean("fast", false);
            j.state = QUEUED;
            j.error = "";
            j.speed = 0;
            save(app, j);
            out = j.toJson(dir);
        }
        emit(out);
        kick(app);
        return out;
    }

    static List<JSONObject> list(Context c) {
        Context app = c.getApplicationContext();
        File dir = dirOf(app);
        List<JSONObject> res = new ArrayList<>();
        synchronized (LOCK) {
            ensureLoaded(app);
            for (Job j : JOBS.values()) res.add(j.toJson(dir));
        }
        return res;
    }

    static void pause(Context c, String id) {
        Context app = c.getApplicationContext();
        JSONObject ev = null;
        synchronized (LOCK) {
            ensureLoaded(app);
            Job j = JOBS.get(id);
            if (j == null) return;
            if (DOWNLOADING.equals(j.state) && id.equals(curId)) {
                curCmd = CMD_PAUSE; // iş parçacığı durumu kendisi PAUSED yapar
                return;
            }
            if (QUEUED.equals(j.state) || WAITING.equals(j.state)) {
                j.state = PAUSED;
                j.speed = 0;
                save(app, j);
                ev = j.toJson(dirOf(app));
            }
        }
        if (ev != null) emit(ev);
    }

    static void pauseAll(Context c) {
        Context app = c.getApplicationContext();
        List<String> ids = new ArrayList<>();
        synchronized (LOCK) {
            ensureLoaded(app);
            ids.addAll(JOBS.keySet());
        }
        // Sıradakiler önce, çalışan en sonda durdurulur (iş parçacığı bir sonrakini seçmesin)
        String cur = curId;
        for (String id : ids) if (!id.equals(cur)) pause(app, id);
        if (!cur.isEmpty()) pause(app, cur);
    }

    static void resume(Context c, String id) {
        Context app = c.getApplicationContext();
        JSONObject ev = null;
        synchronized (LOCK) {
            ensureLoaded(app);
            Job j = JOBS.get(id);
            if (j == null) return;
            if (PAUSED.equals(j.state) || ERROR.equals(j.state) || WAITING.equals(j.state)) {
                j.state = QUEUED;
                j.error = "";
                save(app, j);
                ev = j.toJson(dirOf(app));
            }
        }
        if (ev != null) emit(ev);
        kick(app);
    }

    /** Uygulama açılışı: yarım kalan (sıradaki/bekleyen) işleri sürdürür. includePaused → kullanıcı durdurduklarını da. */
    static void resumeAll(Context c, boolean includePaused) {
        Context app = c.getApplicationContext();
        List<String> ids = new ArrayList<>();
        synchronized (LOCK) {
            ensureLoaded(app);
            if (includePaused) for (Job j : JOBS.values()) if (PAUSED.equals(j.state)) ids.add(j.id);
        }
        for (String id : ids) resume(app, id);
        kick(app);
    }

    static void remove(Context c, String id) {
        Context app = c.getApplicationContext();
        boolean busy = false;
        synchronized (LOCK) {
            ensureLoaded(app);
            Job j = JOBS.get(id);
            if (j == null) return;
            if (DOWNLOADING.equals(j.state) && id.equals(curId)) {
                curCmd = CMD_REMOVE; // dosyayı iş parçacığı kapatıp siler
                busy = true;
            }
        }
        if (!busy) purge(app, id);
    }

    private static void purge(Context app, String id) {
        synchronized (LOCK) {
            Job j = JOBS.remove(id);
            File dir = dirOf(app);
            if (j != null && !j.file.isEmpty()) {
                //noinspection ResultOfMethodCallIgnored
                new File(dir, j.file).delete();
            }
            //noinspection ResultOfMethodCallIgnored
            new File(dir, id + ".part").delete();
            //noinspection ResultOfMethodCallIgnored
            new File(metaDir(app), id + ".json").delete();
        }
        JSONObject ev = new JSONObject();
        try {
            ev.put("id", id);
            ev.put("state", REMOVED);
        } catch (Exception ignored) {
            // sabit anahtarlar
        }
        emit(ev);
    }

    private static void emit(JSONObject job) {
        Listener l = listener;
        if (l != null) l.onChange(job);
    }

    // ------------------------------------------------------------------ iş parçacığı yönetimi

    /** Sırada çalıştırılacak iş varsa hizmeti başlatır (zaten çalışıyorsa bir şey yapmaz). */
    static void kick(Context c) {
        Context app = c.getApplicationContext();
        synchronized (LOCK) {
            ensureLoaded(app);
            if (starting || running || !hasPendingLocked()) return;
            starting = true;
        }
        try {
            DownloadService.start(app);
        } catch (RuntimeException e) {
            // Arka plandan ön plan hizmeti başlatılamadı: işler sırada kalır, uygulama açılınca sürer
            synchronized (LOCK) {
                starting = false;
            }
        }
    }

    private static boolean hasPendingLocked() {
        for (Job j : JOBS.values()) if (QUEUED.equals(j.state) || WAITING.equals(j.state)) return true;
        return false;
    }

    /** Hizmet iş parçacığı başlamadan önce: yalnız bir iş parçacığı çalışabilir. */
    static boolean claim() {
        synchronized (LOCK) {
            starting = false;
            if (running) return false;
            running = true;
            stopWorker = false;
            return true;
        }
    }

    static boolean busy() {
        synchronized (LOCK) {
            return running || starting;
        }
    }

    /** Hizmet kapanıyor (zaman aşımı/sistem): çalışan indirme bırakılıp sıraya döner. */
    static void interrupt() {
        stopWorker = true;
    }

    private static boolean stopped() {
        return stopWorker || curCmd != CMD_NONE;
    }

    static boolean metered(Context c) {
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            return cm != null && cm.isActiveNetworkMetered();
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static Job pickLocked(Context app, List<JSONObject> events) {
        boolean met = false;
        boolean metChecked = false;
        File dir = dirOf(app);
        for (Job j : JOBS.values()) {
            if (!QUEUED.equals(j.state) && !WAITING.equals(j.state)) continue;
            if (j.wifiOnly) {
                if (!metChecked) {
                    met = metered(app);
                    metChecked = true;
                }
                if (met) {
                    if (!WAITING.equals(j.state)) {
                        j.state = WAITING;
                        save(app, j);
                        events.add(j.toJson(dir));
                    }
                    continue;
                }
            }
            return j;
        }
        return null;
    }

    private static boolean anyWaitingLocked() {
        for (Job j : JOBS.values()) if (WAITING.equals(j.state)) return true;
        return false;
    }

    private static int queuedCountLocked(String exceptId) {
        int n = 0;
        for (Job j : JOBS.values()) if (!j.id.equals(exceptId) && (QUEUED.equals(j.state) || WAITING.equals(j.state))) n++;
        return n;
    }

    /** DownloadService'in iş parçacığı: sıradaki işleri tek tek indirir; iş kalmayınca döner. */
    static void runQueue(Context c) {
        Context app = c.getApplicationContext();
        long idleSince = 0;
        PowerManager.WakeLock wl = null;
        try {
            while (true) {
                Job j;
                boolean waiting;
                List<JSONObject> events = new ArrayList<>();
                synchronized (LOCK) {
                    if (stopWorker) {
                        running = false;
                        break;
                    }
                    j = pickLocked(app, events);
                    waiting = j == null && anyWaitingLocked();
                    if (j == null && !waiting) {
                        running = false;
                        break;
                    }
                    if (j != null) {
                        j.state = DOWNLOADING;
                        j.error = "";
                        j.speed = 0;
                        curId = j.id;
                        curCmd = CMD_NONE;
                        save(app, j);
                        events.add(j.toJson(dirOf(app)));
                    }
                }
                for (JSONObject e : events) emit(e);
                if (j == null) {
                    // Yalnız Wi-Fi bekleyenler var: bir süre ağı yokla, sonra bırak (uygulama açılınca yeniden denenir)
                    long now = System.nanoTime() / 1000000L;
                    if (idleSince == 0) idleSince = now;
                    if (now - idleSince > WAIT_NET_MS) {
                        synchronized (LOCK) {
                            running = false;
                        }
                        break;
                    }
                    Notifier.downloadWaiting(app);
                    sleepWhile(15000L);
                    continue;
                }
                idleSince = 0;
                try {
                    if (wl == null) {
                        PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
                        if (pm != null) {
                            wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "iptv:indirme");
                            wl.acquire(6L * 3600L * 1000L);
                        }
                    }
                } catch (RuntimeException ignored) {
                    wl = null; // uyku kilidi alınamazsa indirme yine de sürer
                }
                try {
                    transfer(app, j);
                } catch (RuntimeException e) {
                    fail(app, j, "Beklenmeyen hata: " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
                }
                int late = curCmd;
                curId = "";
                curCmd = CMD_NONE;
                if (late == CMD_REMOVE) purge(app, j.id); // indirme tam bittiği anda gelen silme isteği
            }
        } catch (Throwable t) {
            synchronized (LOCK) {
                running = false;
            }
        } finally {
            curId = "";
            curCmd = CMD_NONE;
            try {
                if (wl != null && wl.isHeld()) wl.release();
            } catch (RuntimeException ignored) {
                // zaten bırakılmış
            }
        }
    }

    private static void sleepWhile(long ms) {
        long end = System.nanoTime() / 1000000L + ms;
        while (!stopped() && System.nanoTime() / 1000000L < end) {
            try {
                Thread.sleep(300L);
            } catch (InterruptedException ie) {
                return;
            }
        }
    }

    // ------------------------------------------------------------------ durum yardımcıları

    private static void setState(Context app, Job j, String state, String error) {
        JSONObject ev;
        synchronized (LOCK) {
            File part = new File(dirOf(app), j.id + ".part");
            if (!DONE.equals(state)) j.bytes = bytesOf(j, part);
            j.state = state;
            j.error = error;
            j.speed = 0;
            save(app, j);
            ev = j.toJson(dirOf(app));
        }
        emit(ev);
    }

    private static void fail(Context app, Job j, String msg) {
        setState(app, j, ERROR, msg);
        Notifier.downloadResult(app, j.id, j.name, msg, false);
    }

    // Çalışırken gelen komutu (duraklat/sil/hizmet kapanıyor) uygular.
    private static void applyCommand(Context app, Job j) {
        int cmd = curCmd;
        curCmd = CMD_NONE;
        if (cmd == CMD_REMOVE) purge(app, j.id);
        else if (cmd == CMD_PAUSE) setState(app, j, PAUSED, "");
        else setState(app, j, QUEUED, ""); // hizmet kapandı: uygulama açılınca/yeniden başlatmada sürer
    }

    private static boolean mustWait(Context app, Job j) {
        return j.wifiOnly && metered(app);
    }

    private static long ms() {
        return System.nanoTime() / 1000000L;
    }

    // ------------------------------------------------------------------ indirme

    private static HttpURLConnection open(String url, String headersJson, long from) throws IOException {
        return open(url, headersJson, from, -1L, false);
    }

    /** to ≥ 0: yalnız [from, to] aralığı istenir; forceRange: from 0 olsa da Range başlığı gönderilir (sunucunun Range desteğini yoklar). */
    private static HttpURLConnection open(String url, String headersJson, long from, long to, boolean forceRange) throws IOException {
        String cur = url;
        for (int hop = 0; hop < 6; hop++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(cur).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("User-Agent", UA);
            conn.setRequestProperty("Accept-Encoding", "identity"); // sıkıştırma Content-Length/Range'i bozar
            try {
                if (headersJson != null && headersJson.startsWith("{")) {
                    JSONObject h = new JSONObject(headersJson);
                    Iterator<String> keys = h.keys();
                    while (keys.hasNext()) {
                        String k = keys.next();
                        String v = h.optString(k, "");
                        if (!v.isEmpty() && !"range".equalsIgnoreCase(k)) conn.setRequestProperty(k, v);
                    }
                }
            } catch (Exception ignored) {
                // bozuk başlık verisi yok sayılır
            }
            if (to >= 0) conn.setRequestProperty("Range", "bytes=" + from + "-" + to);
            else if (from > 0 || forceRange) conn.setRequestProperty("Range", "bytes=" + from + "-");
            int code = conn.getResponseCode();
            if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                String loc = conn.getHeaderField("Location");
                conn.disconnect();
                if (loc == null || loc.isEmpty()) throw new IOException("Yönlendirme adresi yok");
                cur = new URL(new URL(cur), loc).toString();
                continue;
            }
            if (code == 200 || code == 206 || code == 416) return conn;
            conn.disconnect();
            throw new HttpError(code);
        }
        throw new IOException("Çok fazla yönlendirme");
    }

    private static long headerLong(HttpURLConnection conn, String name) {
        try {
            String v = conn.getHeaderField(name);
            return v == null ? -1L : Long.parseLong(v.trim());
        } catch (NumberFormatException e) {
            return -1L;
        }
    }

    /** "bytes 100-199/1000" → {başlangıç, bitiş, toplam(-1 bilinmiyor)}; geçersizse null. */
    static long[] contentRange(String h) {
        if (h == null) return null;
        Matcher m = RANGE.matcher(h);
        if (!m.find()) return null;
        try {
            long total = "*".equals(m.group(3)) ? -1L : Long.parseLong(m.group(3));
            return new long[] {Long.parseLong(m.group(1)), Long.parseLong(m.group(2)), total};
        } catch (NumberFormatException e) {
            return null;
        }
    }

    static boolean notMedia(String type) {
        String t = String.valueOf(type).toLowerCase(Locale.ROOT);
        return t.startsWith("text/") || t.contains("json") || t.contains("mpegurl") || t.contains("html") || t.contains("xml");
    }

    static String extFor(String type, String url) {
        String t = String.valueOf(type).toLowerCase(Locale.ROOT);
        if (t.contains("matroska")) return "mkv";
        if (t.contains("webm")) return "webm";
        if (t.contains("mp2t")) return "ts";
        if (t.contains("quicktime")) return "mov";
        if (t.contains("x-msvideo") || t.contains("avi")) return "avi";
        if (t.contains("mp4")) return "mp4";
        String p = String.valueOf(url);
        int q = p.indexOf('?');
        if (q >= 0) p = p.substring(0, q);
        int dot = p.lastIndexOf('.');
        int slash = p.lastIndexOf('/');
        if (dot > slash && dot >= 0) {
            String e = cleanExt(p.substring(dot + 1));
            if (!e.isEmpty() && !Arrays.asList("php", "asp", "aspx", "html", "htm", "json", "xml").contains(e)) return e;
        }
        return "mp4";
    }

    private static String httpMessage(int code) {
        if (code == 401 || code == 403) return "Sağlayıcı erişimi reddetti (HTTP " + code + ")";
        if (code == 404 || code == 410) return "Dosya sunucuda bulunamadı (HTTP " + code + ")";
        if (code == 429) return "Sağlayıcı çok fazla bağlantı istedi (HTTP 429)";
        return "Sunucu hatası (HTTP " + code + ")";
    }

    private static void sleepRetry(int failures) {
        sleepWhile(Math.min(30000L, 2000L << Math.min(failures, 4)));
    }

    private static void transfer(Context app, Job j) {
        File dir = dirOf(app);
        File part = new File(dir, j.id + ".part");
        byte[] buf = new byte[64 * 1024];
        int failures = 0;
        boolean freshTried = false;
        String err = null;
        boolean toWaiting = false;
        while (!stopped()) {
            if (mustWait(app, j)) {
                toWaiting = true;
                break;
            }
            Seg[] fs = j.segs;
            long have = fs != null ? segSum(fs) : (part.exists() ? part.length() : 0);
            HttpURLConnection conn = null;
            String problem = null;
            try {
                if (fs != null) { // yarım kalmış parçalı indirme: kalan parçalar sürdürülür
                    int fr = fastRun(app, j, part, null, 0L);
                    if (fr == FR_DONE) return;
                    if (fr == FR_RESET) continue;
                    if (fr == FR_WAIT) toWaiting = true;
                    break;
                }
                conn = open(j.url, j.headers, have, -1L, j.fast && have == 0);
                int code = conn.getResponseCode();
                if (code == 416) {
                    if (j.total > 0 && have >= j.total) {
                        finish(app, j, part);
                        return;
                    }
                    if (have > 0 && !freshTried) { // parça sunucudaki dosyadan büyük/uyumsuz: baştan
                        freshTried = true;
                        //noinspection ResultOfMethodCallIgnored
                        part.delete();
                        continue;
                    }
                    throw new IOException("Sunucu kaldığı yerden devam etmeyi kabul etmedi");
                }
                String type = conn.getContentType();
                if (notMedia(type)) throw new Fatal("Bu adres bir video dosyası değil (liste ya da sayfa döndü)");
                long total;
                boolean append;
                if (code == 206) {
                    long[] cr = contentRange(conn.getHeaderField("Content-Range"));
                    if (cr == null || cr[0] != have) {
                        if (have > 0 && !freshTried) {
                            freshTried = true;
                            //noinspection ResultOfMethodCallIgnored
                            part.delete();
                            continue;
                        }
                        throw new IOException("Sunucunun aralık yanıtı geçersiz");
                    }
                    total = cr[2];
                    append = have > 0;
                } else {
                    total = headerLong(conn, "Content-Length"); // sunucu Range'i yok saydıysa baştan indirilir
                    append = false;
                    have = 0;
                }
                if (total > 0 && total < MIN_FILE_BYTES) throw new Fatal("Dosya çok küçük, video olmayabilir");
                long need = total > 0 ? total - have : MIN_FREE_BYTES;
                if (dir.getUsableSpace() < need + STOP_FREE_BYTES) {
                    throw new Fatal("Yetersiz depolama alanı (" + Notifier.size(need) + " gerekir, " + Notifier.size(dir.getUsableSpace()) + " boş)");
                }
                synchronized (LOCK) {
                    j.total = total;
                    if (j.ext.isEmpty()) j.ext = extFor(type, j.url);
                    j.bytes = have;
                    save(app, j);
                }
                if (j.fast && code == 206 && have == 0 && total > 0 && total >= fastMin) { // sunucu Range veriyor: çok bağlantılı indir
                    int fr = fastRun(app, j, part, conn, total);
                    if (fr == FR_DONE) return;
                    if (fr == FR_RESET) continue;
                    if (fr == FR_WAIT) toWaiting = true;
                    break;
                }
                long got = have;
                long mark = have;
                long lastEmit = 0;
                long lastSave = ms();
                long lastNet = ms();
                long spAt = ms();
                long spBytes = got;
                try (OutputStream out = new FileOutputStream(part, append)) {
                    InputStream in = conn.getInputStream();
                    int n;
                    while (!stopped() && (n = in.read(buf)) >= 0) {
                        out.write(buf, 0, n);
                        got += n;
                        long now = ms();
                        if (now - lastEmit >= 1000L) {
                            JSONObject ev;
                            int queued;
                            synchronized (LOCK) {
                                j.bytes = got;
                                long dt = Math.max(1L, now - spAt);
                                j.speed = (got - spBytes) * 1000L / dt;
                                ev = j.toJson(dir);
                                queued = queuedCountLocked(j.id);
                                if (now - lastSave >= 5000L) {
                                    save(app, j);
                                    lastSave = now;
                                }
                            }
                            if (now - spAt >= 3000L) {
                                spAt = now;
                                spBytes = got;
                            }
                            lastEmit = now;
                            emit(ev);
                            Notifier.downloadProgress(app, j.name, got, j.total, j.speed, queued);
                        }
                        if (now - lastNet >= 5000L) {
                            lastNet = now;
                            if (mustWait(app, j)) {
                                toWaiting = true;
                                break;
                            }
                            if (dir.getUsableSpace() < STOP_FREE_BYTES) throw new Fatal("Depolama doldu");
                        }
                    }
                }
                if (got > mark) failures = 0;
                if (toWaiting || stopped()) break;
                if (j.total > 0 && got < j.total) throw new IOException("Bağlantı koptu");
                finish(app, j, part);
                return;
            } catch (Fatal e) {
                err = e.getMessage();
                break;
            } catch (HttpError e) {
                if (e.code == 401 || e.code == 404 || e.code == 410 || e.code == 451) {
                    err = httpMessage(e.code);
                    break;
                }
                problem = httpMessage(e.code);
            } catch (IOException e) {
                if (dir.getUsableSpace() < STOP_FREE_BYTES) {
                    err = "Depolama doldu";
                    break;
                }
                problem = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            } finally {
                if (conn != null) conn.disconnect();
            }
            long now = bytesOf(j, part);
            if (now > have) failures = 0;
            if (++failures > MAX_RETRY) {
                err = "Bağlantı sorunu: " + problem;
                break;
            }
            sleepRetry(failures);
        }
        if (err != null) {
            fail(app, j, err);
            return;
        }
        if (curCmd != CMD_NONE || stopWorker) {
            applyCommand(app, j);
            return;
        }
        if (toWaiting) setState(app, j, WAITING, "");
    }

    // ------------------------------------------------------------------ hızlı (çok bağlantılı) indirme

    /** Bir turda iş parçacıklarının ortak durumu. */
    private static final class Round {
        volatile boolean abort;
        volatile boolean rejected; // fazladan bağlantı reddedildi: kalan parçalar tek bağlantıyla iner
        volatile boolean mismatch; // sunucudaki dosya değişmiş
        volatile boolean noRange; // sunucu aralık isteğini artık desteklemiyor
        volatile Throwable primaryErr;
        volatile HttpURLConnection first; // ilk (0'dan) yanıt: yalnız 0 numaralı iş parçacığı kullanır
    }

    private static void resetSegs(Context app, Job j, File part, boolean keepFast) {
        synchronized (LOCK) {
            j.segs = null;
            j.bytes = 0;
            if (!keepFast) j.fast = false;
            save(app, j);
        }
        //noinspection ResultOfMethodCallIgnored
        part.delete();
    }

    /**
     * Dosyayı FAST_SEGS parçaya bölüp fastConns bağlantıyla indirir. first: 0'dan istenmiş açık yanıt (yeni başlangıç) ya da
     * null (kalan parçaları sürdür). Dönüş: FR_DONE (bitti, dosya adlandırıldı), FR_STOP (duraklat/sil/hizmet), FR_WAIT
     * (Wi-Fi bekleniyor), FR_RESET (parça bilgisi geçersiz: tek parçadan yeniden başla). Hata IOException olarak atılır.
     */
    private static int fastRun(final Context app, final Job j, final File part, HttpURLConnection first, long totalNew) throws IOException {
        final File dir = dirOf(app);
        if (first != null) {
            try (RandomAccessFile raf = new RandomAccessFile(part, "rw")) {
                raf.setLength(totalNew); // yer baştan ayrılır; parçalar kendi aralıklarına yazar
            }
            long size = (totalNew + FAST_SEGS - 1) / FAST_SEGS;
            List<Seg> list = new ArrayList<>();
            for (long a = 0; a < totalNew; a += size) list.add(new Seg(a, Math.min(totalNew, a + size), a));
            synchronized (LOCK) {
                j.total = totalNew;
                j.segs = list.toArray(new Seg[0]);
                j.bytes = 0;
                save(app, j);
            }
        } else if (j.total <= 0 || !part.exists() || part.length() != j.total) {
            resetSegs(app, j, part, true);
            return FR_RESET;
        }
        final Seg[] segs = j.segs;
        final long total = j.total;
        synchronized (LOCK) {
            for (Seg x : segs) x.busy = false;
        }
        int conns = Math.max(1, fastConns);
        long lastEmit = 0;
        long lastSave = ms();
        long lastNet = ms();
        long spAt = ms();
        long spBytes = segSum(segs);
        while (!allComplete(segs)) {
            if (stopped()) return FR_STOP;
            final Round r = new Round();
            if (first != null) {
                r.first = first;
                first = null; // yalnız ilk tur
                synchronized (LOCK) {
                    segs[0].busy = true; // 0 numaralı iş parçacığı bu parçayı hazır bağlantıyla alır
                }
            }
            final long before = segSum(segs);
            int n = Math.min(conns, incompleteCount(segs));
            Thread[] ts = new Thread[n];
            for (int i = 0; i < n; i++) {
                final int idx = i;
                ts[i] = new Thread(new Runnable() {
                    @Override
                    public void run() {
                        fastWorker(j, part, segs, total, idx, r);
                    }
                }, "dl-" + i);
                ts[i].start();
            }
            int code = -1;
            boolean alive = true;
            while (alive) {
                try {
                    Thread.sleep(250L);
                } catch (InterruptedException ie) {
                    r.abort = true;
                }
                alive = false;
                for (Thread t : ts) if (t.isAlive()) alive = true;
                long now = ms();
                if (now - lastEmit >= 1000L) {
                    long got = segSum(segs);
                    JSONObject ev;
                    int queued;
                    synchronized (LOCK) {
                        j.bytes = got;
                        long dt = Math.max(1L, now - spAt);
                        j.speed = (got - spBytes) * 1000L / dt;
                        ev = j.toJson(dir);
                        queued = queuedCountLocked(j.id);
                        if (now - lastSave >= 5000L) {
                            save(app, j);
                            lastSave = now;
                        }
                    }
                    if (now - spAt >= 3000L) {
                        spAt = now;
                        spBytes = got;
                    }
                    lastEmit = now;
                    emit(ev);
                    Notifier.downloadProgress(app, j.name, got, j.total, j.speed, queued);
                }
                if (now - lastNet >= 5000L) {
                    lastNet = now;
                    if (mustWait(app, j)) {
                        code = FR_WAIT;
                        r.abort = true;
                    } else if (dir.getUsableSpace() < STOP_FREE_BYTES) {
                        r.primaryErr = new Fatal("Depolama doldu");
                        r.abort = true;
                    }
                }
            }
            for (Thread t : ts) {
                try {
                    t.join();
                } catch (InterruptedException ignored) {
                    // iş parçacığı zaten bitti
                }
            }
            long after = segSum(segs);
            synchronized (LOCK) {
                j.bytes = after;
                save(app, j); // parçaların son konumu yan dosyaya yazılır (duraklat/yeniden başlatma sonrası buradan sürer)
            }
            HttpURLConnection left = r.first;
            if (left != null) left.disconnect();
            if (code == FR_WAIT) return FR_WAIT;
            if (allComplete(segs)) break;
            if (stopped()) return FR_STOP;
            if (r.noRange) {
                resetSegs(app, j, part, false);
                return FR_RESET;
            }
            if (r.mismatch) {
                resetSegs(app, j, part, false); // dosya değişmiş: hızlı yöntem bırakılır, tek parçadan baştan (sonsuz döngü olmasın)
                return FR_RESET;
            }
            if (r.rejected) conns = 1; // sunucu fazla bağlantıyı kabul etmiyor: kalan parçalar sırayla tek bağlantıyla
            Throwable e = r.primaryErr;
            if (e != null && (after == before || e instanceof Fatal)) {
                if (e instanceof IOException) throw (IOException) e;
                throw new IOException(String.valueOf(e.getMessage()));
            }
            if (after == before && !r.rejected) throw new IOException("Bağlantı koptu");
        }
        if (segSum(segs) < total || part.length() != total) throw new IOException("İndirilen dosya eksik");
        synchronized (LOCK) {
            j.segs = null;
            j.bytes = total;
        }
        finish(app, j, part);
        return FR_DONE;
    }

    private static Seg takeSeg(Seg[] segs) {
        synchronized (LOCK) {
            for (Seg x : segs) {
                if (!x.busy && !x.complete()) {
                    x.busy = true;
                    return x;
                }
            }
        }
        return null;
    }

    private static void fastWorker(Job j, File part, Seg[] segs, long total, int idx, Round r) {
        RandomAccessFile raf = null;
        byte[] buf = new byte[64 * 1024];
        try {
            raf = new RandomAccessFile(part, "rw");
            while (!r.abort && !stopped()) {
                Seg s;
                boolean useFirst = false;
                if (idx == 0 && r.first != null) {
                    s = segs[0];
                    useFirst = true;
                } else {
                    s = takeSeg(segs);
                }
                if (s == null) break;
                try {
                    runSeg(j, raf, buf, s, total, idx, r, useFirst);
                } finally {
                    synchronized (LOCK) {
                        s.busy = false;
                    }
                }
                if (r.rejected && idx > 0) break;
            }
        } catch (Throwable t) {
            if (idx == 0) {
                if (r.primaryErr == null) r.primaryErr = t;
            } else {
                r.rejected = true; // fazladan bağlantı sorunu: bırakır, parçası kalan bağlantılara düşer
            }
        } finally {
            try {
                if (raf != null) raf.close();
            } catch (IOException ignored) {
                // kapatma hatası önemsiz
            }
        }
    }

    // Bir parçayı bitirene dek indirir. Fazladan bağlantılar (idx>0) veri almadan başarısız olursa parça bırakılır (reddedildi sayılır);
    // 0 numaralı bağlantı hata verirse tur sonunda yeniden deneme/durum kararı verilir.
    private static void runSeg(Job j, RandomAccessFile raf, byte[] buf, Seg s, long total, int idx, Round r, boolean useFirst) throws IOException {
        while (s.pos < s.end && !r.abort && !stopped()) {
            HttpURLConnection c = null;
            boolean got = false;
            try {
                if (useFirst) {
                    c = r.first;
                    r.first = null;
                    useFirst = false;
                } else {
                    c = open(j.url, j.headers, s.pos, s.end - 1, false);
                    int code = c.getResponseCode();
                    if (code == 200) {
                        r.noRange = true; // Range'i yok saydı: parçalı yöntem sürdürülemez
                        r.abort = true;
                        return;
                    }
                    if (code != 206) throw new HttpError(code);
                    long[] cr = contentRange(c.getHeaderField("Content-Range"));
                    if (cr == null || cr[0] != s.pos) throw new IOException("Sunucunun aralık yanıtı geçersiz");
                    if (cr[2] > 0 && cr[2] != total) {
                        r.mismatch = true; // dosya sunucuda değişmiş
                        r.abort = true;
                        return;
                    }
                }
                InputStream in = c.getInputStream();
                while (!r.abort && !stopped() && s.pos < s.end) {
                    int n = in.read(buf, 0, (int) Math.min(buf.length, s.end - s.pos));
                    if (n < 0) break;
                    raf.seek(s.pos);
                    raf.write(buf, 0, n);
                    s.pos = s.pos + n;
                    got = true;
                }
            } catch (IOException e) {
                if (e instanceof Fatal) throw e;
                if (!got) {
                    if (idx > 0) {
                        r.rejected = true;
                        return;
                    }
                    throw e;
                }
                // veri almışken koptu: aynı parça kaldığı yerden yeniden istenir
            } finally {
                if (c != null) c.disconnect();
            }
        }
    }

    private static void finish(Context app, Job j, File part) throws IOException {
        File dir = dirOf(app);
        String ext = j.ext.isEmpty() ? "mp4" : j.ext;
        File fin = new File(dir, j.id + "." + ext);
        if (fin.exists() && !fin.delete()) throw new IOException("Eski dosya silinemedi");
        if (!part.renameTo(fin)) throw new IOException("Dosya adı verilemedi");
        JSONObject ev;
        synchronized (LOCK) {
            j.file = fin.getName();
            j.bytes = fin.length();
            j.total = fin.length();
            j.speed = 0;
            j.state = DONE;
            j.error = "";
            save(app, j);
            ev = j.toJson(dir);
        }
        emit(ev);
        Notifier.downloadResult(app, j.id, j.name, "İndirme tamamlandı · " + Notifier.size(fin.length()), true);
    }
}
