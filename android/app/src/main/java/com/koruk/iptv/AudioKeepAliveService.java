package com.koruk.iptv;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/**
 * Müzik/ses arka planda çalarken uygulama sürecini canlı tutan ön plan hizmeti; aynı zamanda sistemin medya oturumunu
 * (kilit ekranı, bildirim paneli, Bluetooth/kulaklık tuşları) ve medya bildirimini yönetir. Çalma işini oynatıcı (ExoPlayer) yapar;
 * burası yalnız durumu gösterir ve gelen komutları eklentiye iletir. Oynatıcı bırakılınca ya da ses bitince eklenti hizmeti durdurur.
 */
public class AudioKeepAliveService extends Service {
    private static final String CHANNEL = "iptv_audio";
    private static final int ID = 7411;
    private static final String ACT_PLAY = "com.koruk.iptv.MEDIA_PLAY";
    private static final String ACT_PAUSE = "com.koruk.iptv.MEDIA_PAUSE";
    private static final String ACT_NEXT = "com.koruk.iptv.MEDIA_NEXT";
    private static final String ACT_PREV = "com.koruk.iptv.MEDIA_PREV";
    private static final String ACT_CLOSE = "com.koruk.iptv.MEDIA_CLOSE";

    // KÖK NEDEN DÜZELTMESİ: durum statik alanlarda tutulur; böylece hizmet zaten çalışırken (parça değişimi, duraklat/oynat)
    // yeni startForegroundService çağrısı gerekmez (Android 12+ arka planda bunu reddeder) ve oturum her parçada yeniden kurulmaz.
    private static volatile AudioKeepAliveService inst;
    private static volatile String sTitle = "";
    private static volatile boolean sPlaying = true;
    private static volatile boolean sEnded = false;
    private static volatile boolean sLive = false;
    private static volatile boolean sCanPrev = false;
    private static volatile boolean sCanNext = false;
    private static volatile long sPos = 0L;
    private static volatile long sDur = -1L;
    private static volatile float sSpeed = 1f;

    private final Handler h = new Handler(Looper.getMainLooper());
    private MediaSession session;
    private boolean foreground = false;

    // Yeni parça/yayın için başlatır ya da çalışan hizmetin başlığını ve düğmelerini günceller.
    static void start(Context c, String title, boolean canPrev, boolean canNext, boolean live) {
        sTitle = title == null ? "" : title;
        sCanPrev = canPrev;
        sCanNext = canNext;
        sLive = live;
        sPlaying = true;
        sEnded = false;
        sPos = 0L;
        sDur = -1L;
        sSpeed = 1f;
        final AudioKeepAliveService s = inst;
        if (s != null) {
            s.h.post(s::refresh);
            return;
        }
        Intent i = new Intent(c, AudioKeepAliveService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
        } catch (RuntimeException ignored) {
            // arka plan hizmeti başlatılamadı: ses ekran açıkken yine çalar
        }
    }

    static void start(Context c, String title) {
        start(c, title, false, false, false);
    }

    // Oynatıcıdan gelen durum: oynuyor mu, konum, süre, hız. Sistem konumu bu değerlerden kendisi ilerletir; sık güncelleme gerekmez.
    // ended: parça bitti; JS sıradakini açabilir, o yüzden ön plan hemen bırakılmaz (arka planda yeniden almak Android 12+'da reddedilebilir).
    static void update(boolean playing, boolean ended, long pos, long dur, float speed) {
        sPlaying = playing;
        sEnded = ended;
        sPos = pos;
        sDur = dur;
        sSpeed = speed <= 0f ? 1f : speed;
        final AudioKeepAliveService s = inst;
        if (s != null) s.h.post(s::refresh);
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
    public void onCreate() {
        super.onCreate();
        inst = this;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Müzik", NotificationManager.IMPORTANCE_LOW);
                ch.setShowBadge(false);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(ch);
            }
        }
        session = new MediaSession(this, "iptv-player");
        // Android 8'den eski sürümlerde Bluetooth/kulaklık tuşları için bayraklar gerekir.
        session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                IptvPlayerPlugin.mediaCommand("play", 0L);
            }

            @Override
            public void onPause() {
                IptvPlayerPlugin.mediaCommand("pause", 0L);
            }

            @Override
            public void onSkipToNext() {
                IptvPlayerPlugin.mediaCommand("next", 0L);
            }

            @Override
            public void onSkipToPrevious() {
                IptvPlayerPlugin.mediaCommand("prev", 0L);
            }

            @Override
            public void onSeekTo(long pos) {
                IptvPlayerPlugin.mediaCommand("seek", pos);
            }

            @Override
            public void onStop() {
                if (!IptvPlayerPlugin.mediaCommand("close", 0L)) stopSelf();
            }
        }, h);
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String act = intent == null ? null : intent.getAction();
        if (act != null) {
            // Bildirim düğmeleri: komut eklentiye iletilir, durum oynatıcıdan geri gelince bildirim yenilenir.
            if (ACT_PLAY.equals(act)) IptvPlayerPlugin.mediaCommand("play", 0L);
            else if (ACT_PAUSE.equals(act)) IptvPlayerPlugin.mediaCommand("pause", 0L);
            else if (ACT_NEXT.equals(act)) IptvPlayerPlugin.mediaCommand("next", 0L);
            else if (ACT_PREV.equals(act)) IptvPlayerPlugin.mediaCommand("prev", 0L);
            else if (ACT_CLOSE.equals(act) && !IptvPlayerPlugin.mediaCommand("close", 0L)) stopSelf();
            return START_NOT_STICKY;
        }
        // startForegroundService çağrısından sonra beş saniye içinde startForeground şart: ilk çağrıda ön plana her zaman alınır.
        refreshNow(true);
        return START_NOT_STICKY;
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onDestroy() {
        // KÖK NEDEN DÜZELTMESİ: oturum ve bildirim burada kesin temizlenir; aksi halde kilit ekranında "hayalet" kontrol kalırdı.
        inst = null;
        h.removeCallbacksAndMessages(null);
        if (session != null) {
            try {
                session.setActive(false);
                session.release();
            } catch (RuntimeException ignored) {
                // oturum zaten kapanmış
            }
            session = null;
        }
        stopForeground(true);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(ID);
        foreground = false;
        super.onDestroy();
    }

    private void refresh() {
        refreshNow(false);
    }

    @SuppressWarnings("deprecation")
    private void refreshNow(boolean forceForeground) {
        if (session == null) return;
        updateSession();
        Notification n = buildNotification();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        // Çalarken ön planda (süreç canlı); duraklatılınca ön plandan ayrılıp bildirim kaydırılabilir kalır (kaydırınca durur).
        if (sPlaying || sEnded || forceForeground) {
            try {
                if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                else startForeground(ID, n);
                foreground = true;
                return;
            } catch (RuntimeException ignored) {
                // arka planda ön plana alınamadı: ses sürer, bildirim yine de güncellenir
            }
        } else if (foreground) {
            stopForeground(false);
            foreground = false;
        }
        if (nm != null) {
            try {
                nm.notify(ID, n);
            } catch (RuntimeException ignored) {
                // bildirim izni yok: ses yine çalar, yalnız bildirim görünmez
            }
        }
    }

    private void updateSession() {
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP;
        if (!sLive && sDur > 0) actions |= PlaybackState.ACTION_SEEK_TO;
        if (sCanNext) actions |= PlaybackState.ACTION_SKIP_TO_NEXT;
        if (sCanPrev) actions |= PlaybackState.ACTION_SKIP_TO_PREVIOUS;
        long pos = sLive ? PlaybackState.PLAYBACK_POSITION_UNKNOWN : Math.max(0L, sPos);
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(actions)
            .setState(sPlaying ? PlaybackState.STATE_PLAYING : sEnded ? PlaybackState.STATE_STOPPED : PlaybackState.STATE_PAUSED, pos, sPlaying ? sSpeed : 0f)
            .build());
        MediaMetadata.Builder md = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title())
            .putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE, title());
        if (!sLive && sDur > 0) md.putLong(MediaMetadata.METADATA_KEY_DURATION, sDur);
        session.setMetadata(md.build());
    }

    private String title() {
        return sTitle.isEmpty() ? "Müzik çalıyor" : sTitle;
    }

    private PendingIntent actionIntent(String act, int code) {
        Intent i = new Intent(this, AudioKeepAliveService.class).setAction(act);
        int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getService(this, code, i, fl);
    }

    @SuppressWarnings("deprecation")
    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 11, open, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        int[] compact = new int[3];
        int n = 0;
        int idx = 0;
        if (sCanPrev) {
            b.addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous, "Önceki", actionIntent(ACT_PREV, 21)).build());
            compact[n++] = idx++;
        }
        b.addAction(sPlaying
            ? new Notification.Action.Builder(android.R.drawable.ic_media_pause, "Duraklat", actionIntent(ACT_PAUSE, 22)).build()
            : new Notification.Action.Builder(android.R.drawable.ic_media_play, "Oynat", actionIntent(ACT_PLAY, 22)).build());
        compact[n++] = idx++;
        if (sCanNext) {
            b.addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, "Sonraki", actionIntent(ACT_NEXT, 23)).build());
            compact[n++] = idx++;
        }
        b.addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Kapat", actionIntent(ACT_CLOSE, 24)).build());
        int[] shown = new int[n];
        System.arraycopy(compact, 0, shown, 0, n);
        b.setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(shown));
        b.setSmallIcon(sPlaying ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause)
            .setContentTitle(title())
            .setContentText(sLive ? "Canlı yayın" : sPlaying ? "Çalıyor" : sEnded ? "Bitti" : "Duraklatıldı")
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setShowWhen(false)
            .setOnlyAlertOnce(true)
            .setOngoing(sPlaying || sEnded)
            .setContentIntent(pi);
        // KÖK NEDEN DÜZELTMESİ: duraklatılmış bildirim kaydırılınca oynatma da kapanır (eskiden bildirim ya kalıcıydı ya da ses çalmaya devam ederdi).
        if (!sPlaying && !sEnded) b.setDeleteIntent(actionIntent(ACT_CLOSE, 25));
        return b.build();
    }
}
