package com.koruk.iptv;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * Müzik arka planda çalarken uygulama sürecini canlı tutan ön plan hizmeti (çalma işini oynatıcı yapar).
 * Oynatıcı bırakılınca ya da ses bitince eklenti hizmeti durdurur.
 */
public class AudioKeepAliveService extends Service {
    private static final String CHANNEL = "iptv_audio";
    private static final int ID = 7411;

    static void start(Context c, String title) {
        Intent i = new Intent(c, AudioKeepAliveService.class).putExtra("title", title == null ? "" : title);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
        } catch (RuntimeException ignored) {
            // arka plan hizmeti başlatılamadı: ses ekran açıkken yine çalar
        }
    }

    static void stop(Context c) {
        try {
            c.stopService(new Intent(c, AudioKeepAliveService.class));
        } catch (RuntimeException ignored) {
            // hizmet zaten durmuş
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @SuppressWarnings("deprecation")
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent == null ? "" : String.valueOf(intent.getStringExtra("title"));
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Müzik", NotificationManager.IMPORTANCE_LOW));
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 11, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        Notification n = b.setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title.isEmpty() ? "Müzik çalıyor" : title)
            .setContentText("Arka planda çalıyor")
            .setOngoing(true)
            .setContentIntent(pi)
            .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(ID, n);
        return START_NOT_STICKY;
    }
}
