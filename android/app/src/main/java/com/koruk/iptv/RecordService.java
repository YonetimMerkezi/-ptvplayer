package com.koruk.iptv;

import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Iterator;
import java.util.Locale;

/**
 * Zamanlı kayıt: uygulama kapalıyken bile doğrudan TS akışını okuyup kayıt klasörüne yazar (ön plan hizmeti).
 * Yalnız doğrudan TS adresi olan kanallar kaydedilir (HLS parça birleştirme yok). Kaydı StreamRecorder yazar.
 */
public class RecordService extends Service {
    private static final String UA = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
    private static final String ACTION_STOP = "com.koruk.iptv.REC_STOP";
    private static volatile boolean running;
    private static volatile boolean stopFlag;

    static void start(Context c, JSONObject plan) {
        String name = plan.optString("chName", "Kanal");
        if (StreamRecorder.active() || running) {
            Notifier.recordResult(c, name, "Zamanlı kayıt başlatılamadı: başka bir kayıt sürüyor");
            return;
        }
        Intent i = new Intent(c, RecordService.class)
            .putExtra("url", plan.optString("url", ""))
            .putExtra("headers", plan.optString("headers", ""))
            .putExtra("name", plan.optString("title", "").isEmpty() ? name : name + " " + plan.optString("title", ""))
            .putExtra("until", PlanStore.endOf(plan));
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
        } catch (RuntimeException e) {
            Notifier.recordResult(c, name, "Zamanlı kayıt başlatılamadı: arka planda kayıt izni verilmedi");
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopFlag = true;
            return START_NOT_STICKY;
        }
        final String url = intent == null ? "" : String.valueOf(intent.getStringExtra("url"));
        final String headers = intent == null ? "" : String.valueOf(intent.getStringExtra("headers"));
        final String name = intent == null ? "Kayıt" : String.valueOf(intent.getStringExtra("name"));
        final long until = intent == null ? 0L : intent.getLongExtra("until", 0L);
        PendingIntent stop = PendingIntent.getService(this, 9, new Intent(this, RecordService.class).setAction(ACTION_STOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        android.app.Notification n = Notifier.recording(this, name, until, stop);
        if (Build.VERSION.SDK_INT >= 29) startForeground(Notifier.REC_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(Notifier.REC_ID, n);
        if (running || !url.startsWith("http") || until <= System.currentTimeMillis()) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        stopFlag = false;
        final Context app = getApplicationContext();
        new Thread(() -> {
            String result;
            try {
                result = record(app, url, headers, name, until);
            } catch (Exception e) {
                result = "Kayıt başarısız: " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
            }
            running = false;
            Notifier.recordResult(app, name, result);
            stopForeground(true);
            stopSelf();
        }, "iptv-plan-rec").start();
        return START_NOT_STICKY;
    }

    private static HttpURLConnection open(String url, String headersJson) throws IOException {
        String cur = url;
        for (int hop = 0; hop < 6; hop++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(cur).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("User-Agent", UA);
            try {
                if (headersJson != null && headersJson.startsWith("{")) {
                    JSONObject h = new JSONObject(headersJson);
                    Iterator<String> keys = h.keys();
                    while (keys.hasNext()) {
                        String k = keys.next();
                        String v = h.optString(k, "");
                        if (!v.isEmpty()) conn.setRequestProperty(k, v);
                    }
                }
            } catch (Exception ignored) {
                // bozuk başlık verisi yok sayılır
            }
            int code = conn.getResponseCode();
            if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                String loc = conn.getHeaderField("Location");
                conn.disconnect();
                if (loc == null || loc.isEmpty()) throw new IOException("Yönlendirme adresi yok");
                cur = new URL(new URL(cur), loc).toString();
                continue;
            }
            if (code < 200 || code >= 300) {
                conn.disconnect();
                throw new IOException("HTTP " + code);
            }
            return conn;
        }
        throw new IOException("Çok fazla yönlendirme");
    }

    // Bitiş saatine kadar okur; bağlantı koparsa birkaç kez yeniden bağlanır. Dönüş: bildirim metni.
    private static String record(Context app, String url, String headersJson, String name, long until) throws IOException {
        File dir = StreamRecorder.dirOf(app);
        if (dir.getUsableSpace() < StreamRecorder.MIN_FREE_BYTES) return "Yetersiz depolama alanı (en az 300 MB boş yer gerekir)";
        String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ROOT).format(new Date());
        File f = new File(dir, stamp + "_" + StreamRecorder.safeName(name) + ".ts");
        final String[] reason = {null};
        final boolean[] empty = {false};
        StreamRecorder.start(f, name, Math.max(1000L, until - System.currentTimeMillis()), (info, r) -> {
            reason[0] = r;
            empty[0] = info.empty;
        });
        final Object me = new Object();
        byte[] buf = new byte[64 * 1024];
        int failures = 0;
        try {
            while (!stopFlag && System.currentTimeMillis() < until && StreamRecorder.active()) {
                HttpURLConnection conn = null;
                try {
                    conn = open(url, headersJson);
                    InputStream in = conn.getInputStream();
                    boolean first = true;
                    while (!stopFlag && System.currentTimeMillis() < until) {
                        int n = in.read(buf);
                        if (n < 0) break; // sunucu akışı kapattı: yeniden bağlan
                        boolean keep = StreamRecorder.write(me, buf, 0, n, first);
                        first = false;
                        failures = 0;
                        if (!keep) throw new IOException("Akış MPEG-TS değil");
                        if (!StreamRecorder.active()) break;
                    }
                } catch (IOException e) {
                    if (++failures >= 5) throw e;
                } finally {
                    StreamRecorder.release(me);
                    if (conn != null) conn.disconnect();
                }
                if (!stopFlag && System.currentTimeMillis() < until && StreamRecorder.active()) {
                    try {
                        Thread.sleep(2000L);
                    } catch (InterruptedException ie) {
                        break;
                    }
                }
            }
        } finally {
            StreamRecorder.stop(null);
        }
        if (empty[0]) return "Kayıt boş kaldı: yayın MPEG-TS biçiminde değil ya da veri gelmedi";
        if ("disk".equals(reason[0])) return "Kayıt depolama dolduğu için durdu";
        if ("error".equals(reason[0])) return "Kayıt dosyası yazılamadı";
        return stopFlag ? "Kayıt durduruldu" : "Kayıt tamamlandı";
    }
}
