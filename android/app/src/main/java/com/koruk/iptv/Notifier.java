package com.koruk.iptv;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Program hatırlatıcısı ve zamanlı kayıt bildirimleri. */
final class Notifier {
    static final String CH_REMIND = "iptv_remind";
    static final String CH_REC = "iptv_rec";
    static final String CH_DL = "iptv_dl";
    static final String ACTION_OPEN = "com.koruk.iptv.OPEN_PLAN";
    static final int REC_ID = 4101;
    static final int DL_ID = 4110;

    private Notifier() {}

    static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.createNotificationChannel(new NotificationChannel(CH_REMIND, "Program hatırlatıcıları", NotificationManager.IMPORTANCE_HIGH));
        nm.createNotificationChannel(new NotificationChannel(CH_REC, "Zamanlı kayıt", NotificationManager.IMPORTANCE_LOW));
        nm.createNotificationChannel(new NotificationChannel(CH_DL, "İndirmeler", NotificationManager.IMPORTANCE_LOW));
    }

    @SuppressWarnings("deprecation")
    private static Notification.Builder builder(Context c, String channel) {
        ensureChannels(c);
        return Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, channel) : new Notification.Builder(c);
    }

    private static PendingIntent open(Context c, JSONObject plan) {
        Intent i = new Intent(c, MainActivity.class).setAction(ACTION_OPEN)
            .putExtra("plan_ch", plan.optString("chId", "")).putExtra("plan_src", plan.optString("src", ""))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, plan.optString("id", "").hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String clock(long ms) {
        return new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(ms));
    }

    static void reminder(Context c, JSONObject plan) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        String title = plan.optString("title", "Program");
        long s = plan.optLong("s", 0L);
        long leftMin = Math.max(0L, (s - System.currentTimeMillis() + 30000L) / 60000L);
        String when = leftMin > 0 ? leftMin + " dk sonra " + clock(s) + "'de" : "şimdi";
        Notification n = builder(c, CH_REMIND)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setContentText(plan.optString("chName", "") + " · " + when + " başlıyor")
            .setContentIntent(open(c, plan))
            .setAutoCancel(true)
            .build();
        nm.notify(plan.optString("id", "").hashCode(), n);
    }

    static Notification recording(Context c, String name, long until, PendingIntent stop) {
        return builder(c, CH_REC)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Kayıt sürüyor")
            .setContentText(name + " · " + clock(until) + "'e kadar")
            .setOngoing(true)
            .addAction(android.R.drawable.ic_media_pause, "Durdur", stop)
            .build();
    }

    static void recordResult(Context c, String name, String text) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Notification n = builder(c, CH_REC)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle(name)
            .setContentText(text)
            .setAutoCancel(true)
            .build();
        nm.notify(REC_ID + 1, n);
    }

    // ------------------------------------------------------------------ indirmeler

    /** 1536 → "1,5 KB", … (Türkçe ondalık virgül). */
    static String size(long bytes) {
        if (bytes < 0) bytes = 0;
        String[] unit = {"B", "KB", "MB", "GB", "TB"};
        double v = bytes;
        int u = 0;
        while (v >= 1024 && u < unit.length - 1) {
            v /= 1024;
            u++;
        }
        return (u == 0 ? String.valueOf((long) v) : String.format(new Locale("tr", "TR"), "%.1f", v)) + " " + unit[u];
    }

    private static PendingIntent openApp(Context c) {
        Intent i = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 7, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Ön plan hizmeti bildirimi: pct &lt; 0 → belirsiz ilerleme çubuğu. */
    static Notification downloading(Context c, String title, String text, int pct, PendingIntent pause) {
        Notification.Builder b = builder(c, CH_DL)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openApp(c));
        if (pct >= 0) b.setProgress(100, Math.min(100, pct), false);
        else b.setProgress(0, 0, true);
        if (pause != null) b.addAction(android.R.drawable.ic_media_pause, "Duraklat", pause);
        return b.build();
    }

    static void downloadProgress(Context c, String name, long got, long total, long speed, int queued) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        int pct = total > 0 ? (int) Math.min(100L, got * 100L / total) : -1;
        StringBuilder t = new StringBuilder();
        if (total > 0) t.append('%').append(pct).append(" · ").append(size(got)).append(" / ").append(size(total));
        else t.append(size(got));
        if (speed > 0) t.append(" · ").append(size(speed)).append("/sn");
        if (queued > 0) t.append(" · sırada ").append(queued);
        nm.notify(DL_ID, downloading(c, name, t.toString(), pct, DownloadService.pauseIntent(c)));
    }

    static void downloadWaiting(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.notify(DL_ID, downloading(c, "İndirmeler bekliyor", "Wi-Fi bağlantısı bekleniyor", -1, DownloadService.pauseIntent(c)));
    }

    static void downloadResult(Context c, String id, String name, String text, boolean ok) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Notification n = builder(c, CH_DL)
            .setSmallIcon(ok ? android.R.drawable.stat_sys_download_done : android.R.drawable.stat_notify_error)
            .setContentTitle(name)
            .setContentText(text)
            .setContentIntent(openApp(c))
            .setAutoCancel(true)
            .build();
        nm.notify(4200 + Math.abs(id.hashCode() % 700), n);
    }
}
