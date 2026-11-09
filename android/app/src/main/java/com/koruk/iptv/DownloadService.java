package com.koruk.iptv;

import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/**
 * İndirmeleri uygulama kapalıyken de sürdüren ön plan hizmeti (bildirimli). Asıl iş Downloads'ta;
 * burada yalnız hizmetin yaşam döngüsü var: iş kalmayınca kendini kapatır.
 */
public class DownloadService extends Service {
    static final String ACTION_PAUSE = "com.koruk.iptv.DL_PAUSE";
    private final Handler main = new Handler(Looper.getMainLooper());

    static void start(Context c) {
        Intent i = new Intent(c, DownloadService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
        else c.startService(i);
    }

    static PendingIntent pauseIntent(Context c) {
        return PendingIntent.getService(c, 11, new Intent(c, DownloadService.class).setAction(ACTION_PAUSE), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, final int startId) {
        final Context app = getApplicationContext();
        if (intent != null && ACTION_PAUSE.equals(intent.getAction())) {
            Downloads.pauseAll(app);
            if (!Downloads.busy()) stopSelf(startId);
            return START_NOT_STICKY;
        }
        android.app.Notification n = Notifier.downloading(this, "İndirmeler", "Hazırlanıyor…", -1, pauseIntent(this));
        if (Build.VERSION.SDK_INT >= 29) startForeground(Notifier.DL_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(Notifier.DL_ID, n);
        if (!Downloads.claim()) return START_NOT_STICKY; // iş parçacığı zaten çalışıyor
        new Thread(() -> {
            try {
                Downloads.runQueue(app);
            } finally {
                // Ana iş parçacığında karar verilir: bu sırada yeni bir başlatma geldiyse hizmet açık kalır
                main.post(() -> {
                    if (!Downloads.busy()) {
                        stopForeground(true);
                        stopSelf();
                    }
                });
            }
        }, "iptv-download").start();
        return START_NOT_STICKY;
    }

    // Android 15+: veri eşitleme ön plan hizmetinin süre sınırı doldu; indirme bırakılır, sırada kalır ve uygulama açılınca sürer.
    public void onTimeout(int startId, int fgsType) {
        Downloads.interrupt();
    }

    @Override
    public void onDestroy() {
        Downloads.interrupt();
        super.onDestroy();
    }
}
