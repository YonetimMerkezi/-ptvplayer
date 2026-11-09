package com.koruk.iptv;

import android.app.Activity;
import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.app.UiModeManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.Icon;
import android.media.AudioManager;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.Environment;
import android.os.Looper;
import android.util.Rational;
import android.provider.MediaStore;
import android.provider.Settings;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.content.FileProvider;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.common.VideoSize;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.analytics.AnalyticsListener;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.DefaultAudioSink;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.security.SecureRandom;
import java.util.List;
import java.util.UUID;
import org.json.JSONException;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * IPTV oynatıcı eklentisi.
 * - Video, saydam WebView'in ARKASINDA bir Media3 PlayerView'da çizilir; denetimler HTML ile çizilir.
 * - download: büyük liste/JSON/XMLTV dosyalarını önbelleğe indirir (WebView'de CORS ve köprü sınırı olmaz).
 */
@CapacitorPlugin(name = "IptvPlayer")
public class IptvPlayerPlugin extends Plugin {
    private static final String UA = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
    // File.createTempFile en az 3 karakterlik önek ister; "dl" gibi kısa önek IllegalArgumentException atar.
    private static final String TMP_PREFIX = "iptvdl";
    private static final long MAX_DOWNLOAD_BYTES = 400L * 1024L * 1024L;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newFixedThreadPool(3);
    private final ExecutorService probeIo = Executors.newFixedThreadPool(2); // yayın sağlık testi: indirmeleri bekletmesin

    private PlayerView playerView;
    private ExoPlayer player;
    private String curUrl = "";
    // Ses senkronu (ms; + sesi geciktirir, − öne alır). Ana oynatıcı sıfırdan farklı değerle kurulursa ses işlemcisi takılır.
    private volatile int audioDelayMs = 0;
    private AudioDelayProcessor delayProc = null;
    private String lastMime = "auto";
    private JSObject lastHeaders = null;
    private String lastBuffer = "high";
    // Telefondan TV'ye oynatma (alıcı): durum anlık görüntüsü ana iş parçacığında güncellenir, sunucu iş parçacığı okur.
    private CastServer cast;
    private volatile boolean castActive = false;
    private volatile String castState = "idle";
    private volatile boolean castLive = false;
    private volatile long castPos = 0;
    private volatile long castDur = -1;
    private volatile String castTitle = "";
    private volatile String castKind = "";
    // Veri eşitleme: telefondan gelen istek uygulamaya (JS) iletilir, yanıt castSyncReply ile dönene kadar beklenir.
    private final ConcurrentHashMap<String, BlockingQueue<String[]>> syncWaiting = new ConcurrentHashMap<>();
    private final AtomicInteger syncSeq = new AtomicInteger();
    private volatile boolean foreground = true;
    private WifiManager.MulticastLock castLock; // bazı cihazlar uyku/ekran kapalıyken yayın paketlerini (UDP) süzer; TV'nin bulunması için tutulur
    private boolean ticking = false;
    private static volatile IptvPlayerPlugin activePlugin;
    private volatile boolean pipMode = false;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (player == null) {
                ticking = false;
                return;
            }
            emitTime();
            if (StreamRecorder.active()) notifyListeners("recording", recState());
            main.postDelayed(this, 1000);
        }
    };

    @Override
    public void load() {
        activePlugin = this;
        // Kamera çentiği payı değişince (dönme, klavye vb.) sayfaya bildirilir
        SafeArea.listen(px -> main.post(() -> notifyListeners("insets", insetsObject(px))));
        RemoteKeys.listen(name -> {
            JSObject o = new JSObject();
            o.put("key", name);
            main.post(() -> notifyListeners("remote", o));
        });
        // Eski geçici indirmeleri temizle
        io.execute(() -> {
            File[] files = getContext().getCacheDir().listFiles();
            if (files == null) return;
            long limit = System.currentTimeMillis() - 3600_000L;
            for (File f : files) {
                if (f.getName().startsWith(TMP_PREFIX) && f.getName().endsWith(".tmp") && f.lastModified() < limit) {
                    //noinspection ResultOfMethodCallIgnored
                    f.delete();
                }
            }
            // Kurulumdan arta kalan güncelleme dosyaları (bir günden eski)
            File[] old = updateDir().listFiles();
            if (old != null) {
                for (File f : old) {
                    if (f.lastModified() < System.currentTimeMillis() - 24 * 3600_000L) {
                        //noinspection ResultOfMethodCallIgnored
                        f.delete();
                    }
                }
            }
        });
    }

    // ------------------------------------------------------------------ oynatma

    @PluginMethod
    public void openExternal(final PluginCall call) {
        final String url = call.getData().optString("url", "").trim();
        final String mime = call.getData().optString("mime", "");
        if (url.isEmpty()) {
            call.reject("Oynatma adresi gerekli");
            return;
        }
        main.post(() -> {
            try {
                Intent view = new Intent(Intent.ACTION_VIEW);
                view.setDataAndType(Uri.parse(url), mime.isEmpty() ? "*/*" : mime);
                view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                Intent chooser = Intent.createChooser(view, "Harici oynatıcı seçin");
                getContext().startActivity(chooser);
                call.resolve();
            } catch (Exception e) {
                call.reject("Harici oynatıcı açılamadı: " + String.valueOf(e.getMessage()));
            }
        });
    }

    @PluginMethod
    public void play(final PluginCall call) {
        final String url = call.getData().optString("url", "");
        if (url.isEmpty()) {
            call.reject("url gerekli");
            return;
        }
        final String mime = call.getData().optString("mime", "auto");
        final long startMs = call.getData().optLong("startMs", 0L);
        final JSObject headers = call.getObject("headers");
        final String buffer = call.getData().optString("buffer", "high");
        final boolean keepRec = call.getData().optBoolean("keepRecording", false);
        audioDelayMs = clampDelay(call.getData().optInt("audioDelay", audioDelayMs));
        main.post(() -> {
            try {
                startPlayback(url, mime, startMs, headers, buffer, keepRec);
                call.resolve();
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            }
        });
    }

    // Yayın önbelleği düzeyi (Ayarlar > Genel): süreler ms; üst sınır bayt olarak da konur ki yüksek bithızlı yayın belleği doldurmasın.
    private static DefaultLoadControl loadControlFor(String level) {
        DefaultLoadControl.Builder b = new DefaultLoadControl.Builder();
        if ("max".equals(level)) {
            b.setBufferDurationsMs(45000, 180000, 4000, 15000).setTargetBufferBytes(96 * 1024 * 1024);
        } else if ("normal".equals(level)) {
            b.setBufferDurationsMs(15000, 60000, 2500, 5000);
        } else {
            b.setBufferDurationsMs(30000, 120000, 3000, 10000).setTargetBufferBytes(64 * 1024 * 1024);
        }
        return b.build();
    }

    private void startPlayback(String url, String mime, long startMs, JSObject headers, String buffer, boolean keepRec) {
        // Kayıt, aynı yayına yeniden bağlanırken sürer; başka bir yayına/dosyaya geçilince biter.
        if (!keepRec) StreamRecorder.stop(null);
        releasePlayer();
        ensureView();
        curUrl = url;
        lastMime = mime;
        lastHeaders = headers;
        lastBuffer = buffer;
        castActive = true;
        castState = "buffering";

        player = buildExo(headers, true, loadControlFor(buffer), true, true);
        player.setWakeMode(C.WAKE_MODE_NETWORK); // uygulama arka plandayken de (kayıt) ağ ve işlemci uyumasın
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                emitState();
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                emitState();
            }

            @Override
            public void onVideoSizeChanged(VideoSize size) {
                updatePipParams(); // PiP penceresi yayının en-boy oranına uysun
            }

            // Ses/altyazı parçaları yayın çözüldükçe sonradan da ortaya çıkabilir (özellikle TS yayınlarda).
            @Override
            public void onTracksChanged(Tracks tracks) {
                notifyListeners("tracks", new JSObject());
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                JSObject o = new JSObject();
                o.put("message", error.getErrorCodeName());
                o.put("code", error.errorCode);
                notifyListeners("error", o);
            }
        });
        playerView.setPlayer(player);
        playerView.setVisibility(View.VISIBLE);

        player.setMediaItem(mediaItemOf(url, mime));
        if (startMs > 0) player.seekTo(startMs);
        player.setPlayWhenReady(true);
        player.prepare();

        getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (!ticking) {
            ticking = true;
            main.postDelayed(tick, 1000);
        }
        emitState();
    }

    // Ortak oynatıcı kurulumu: başlıklar (User-Agent dahil), arabellek ayarı, ses odağı.
    // Çoklu ekran kutuları ses odağı istemez (yoksa birbirini duraklatırlar).
    private ExoPlayer buildExo(JSObject headers, boolean audioFocus, DefaultLoadControl load, boolean tap, boolean delay) {
        Map<String, String> props = new HashMap<>();
        String ua = UA;
        if (headers != null) {
            Iterator<String> keys = headers.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                String v = headers.optString(k, "");
                if ("User-Agent".equalsIgnoreCase(k)) ua = v;
                else if (!v.isEmpty()) props.put(k, v);
            }
        }
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(20000)
                .setUserAgent(ua)
                .setDefaultRequestProperties(props);
        AudioAttributes audio = new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                .build();
        // DefaultDataSource: ağ adreslerinin yanında kayıtların file:// adreslerini de açar. tap: kayıt açıkken baytları da dosyaya yazar.
        DataSource.Factory base = new DefaultDataSource.Factory(getContext(), http);
        if (tap) base = new TapDataSource.Factory(base);
        ExoPlayer.Builder eb;
        if (delay && audioDelayMs != 0) {
            // Gecikme PCM ses ister: kodlu (AC3/DTS) geçiş kapatılır, ses çözülüp işlenir.
            final AudioDelayProcessor proc = new AudioDelayProcessor(audioDelayMs);
            delayProc = proc;
            eb = new ExoPlayer.Builder(getContext(), new DefaultRenderersFactory(getContext()) {
                @Override
                protected AudioSink buildAudioSink(Context context, boolean enableFloatOutput, boolean enableAudioTrackPlaybackParams) {
                    return new DefaultAudioSink.Builder()
                            .setEnableFloatOutput(enableFloatOutput)
                            .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                            .setAudioProcessors(new AudioProcessor[] {proc})
                            .build();
                }
            }.setEnableDecoderFallback(true));
        } else {
            eb = new ExoPlayer.Builder(getContext(), new DefaultRenderersFactory(getContext()).setEnableDecoderFallback(true));
        }
        return eb
                .setMediaSourceFactory(new DefaultMediaSourceFactory(base))
                .setLoadControl(load)
                .setAudioAttributes(audio, audioFocus)
                .setHandleAudioBecomingNoisy(true)
                .build();
    }

    private static MediaItem mediaItemOf(String url, String mime) {
        MediaItem.Builder item = new MediaItem.Builder().setUri(url);
        if ("hls".equals(mime)) item.setMimeType(MimeTypes.APPLICATION_M3U8);
        return item.build();
    }

    private void ensureView() {
        if (playerView != null) return;
        Activity a = getActivity();
        WebView web = getBridge().getWebView();
        ViewGroup parent = (ViewGroup) web.getParent();
        playerView = (PlayerView) LayoutInflater.from(a).inflate(R.layout.iptv_player_view, parent, false);
        parent.addView(playerView, 0); // WebView'in altında
        web.setBackgroundColor(Color.TRANSPARENT);
        applyRect();
    }

    // Önizleme penceresi (CSS piksel: x, y, genişlik, yükseklik). null → tüm ekran.
    private double[] rect = null;

    private void applyRect() {
        // Sistem PiP penceresinde görüntü pencereyi doldurur; uygulama içi küçük pencere ölçüsü çıkınca geri uygulanır.
        if (playerView != null) placeView(playerView, pipMode ? null : rect);
    }

    // Görünümü CSS piksel dikdörtgenine yerleştirir (null → tüm ekran).
    private void placeView(PlayerView v, double[] r) {
        ViewGroup.LayoutParams lp = v.getLayoutParams();
        if (!(lp instanceof ViewGroup.MarginLayoutParams)) return;
        ViewGroup.MarginLayoutParams m = (ViewGroup.MarginLayoutParams) lp;
        if (r == null) {
            m.width = ViewGroup.LayoutParams.MATCH_PARENT;
            m.height = ViewGroup.LayoutParams.MATCH_PARENT;
            m.setMargins(0, 0, 0, 0);
        } else {
            float d = getContext().getResources().getDisplayMetrics().density;
            m.width = Math.max(1, Math.round((float) (r[2] * d)));
            m.height = Math.max(1, Math.round((float) (r[3] * d)));
            m.setMargins(Math.round((float) (r[0] * d)), Math.round((float) (r[1] * d)), 0, 0);
        }
        v.setLayoutParams(m);
    }

    @PluginMethod
    public void setRect(final PluginCall call) {
        final double x = call.getData().optDouble("x", 0);
        final double y = call.getData().optDouble("y", 0);
        final double w = call.getData().optDouble("w", 0);
        final double h = call.getData().optDouble("h", 0);
        main.post(() -> {
            rect = (w > 0 && h > 0) ? new double[] {x, y, w, h} : null;
            applyRect();
            call.resolve();
        });
    }

    @PluginMethod
    public void clearRect(final PluginCall call) {
        main.post(() -> {
            rect = null;
            applyRect();
            call.resolve();
        });
    }

    private void releasePlayer() {
        delayProc = null;
        castActive = false;
        castState = "idle";
        castPos = 0;
        castDur = -1;
        if (player != null) {
            if (playerView != null) playerView.setPlayer(null);
            player.release();
            player = null;
        }
        updatePipParams(); // oynatıcı yokken Ana ekrana çıkınca boş PiP penceresi açılmasın
    }

    @PluginMethod
    public void stop(final PluginCall call) {
        main.post(() -> {
            StreamRecorder.stop(null);
            releasePlayer();
            if (playerView != null) playerView.setVisibility(View.GONE);
            getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            JSObject o = new JSObject();
            o.put("state", "idle");
            o.put("playing", false);
            o.put("live", false);
            notifyListeners("state", o);
            call.resolve();
        });
    }

    private static int clampDelay(int ms) {
        return Math.max(-1000, Math.min(2000, ms));
    }

    // Ses senkronu (ms): + sesi geciktirir, − öne alır. Açık oynatıcıya anında uygulanır.
    @PluginMethod
    public void setAudioDelay(final PluginCall call) {
        final int ms = clampDelay(call.getData().optInt("ms", 0));
        audioDelayMs = ms;
        main.post(() -> {
            if (player != null) {
                if (delayProc != null) {
                    delayProc.setDelayMs(ms);
                    player.seekTo(player.getCurrentPosition()); // sarma ses hattını boşaltır, yeni değer okunur
                } else if (ms != 0 && !curUrl.isEmpty()) {
                    // oynatıcı ses işlemcisiz kurulmuştu: yeniden kur (canlıda yayın yeniden açılır, filmde konum korunur)
                    long pos = player.isCurrentMediaItemLive() ? 0L : Math.max(0L, player.getCurrentPosition());
                    startPlayback(curUrl, lastMime, pos, lastHeaders, lastBuffer, true);
                }
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void pause(final PluginCall call) {
        main.post(() -> {
            if (player != null) player.setPlayWhenReady(false);
            call.resolve();
        });
    }

    @PluginMethod
    public void resume(final PluginCall call) {
        main.post(() -> {
            if (player != null) {
                if (player.getPlaybackState() == Player.STATE_ENDED) player.seekTo(0);
                player.setPlayWhenReady(true);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void seekTo(final PluginCall call) {
        final long ms = call.getData().optLong("ms", 0L);
        main.post(() -> {
            if (player != null) player.seekTo(Math.max(0L, ms));
            call.resolve();
        });
    }

    @PluginMethod
    public void setResizeMode(final PluginCall call) {
        final String mode = call.getData().optString("mode", "fit");
        main.post(() -> {
            if (playerView != null) {
                int m = AspectRatioFrameLayout.RESIZE_MODE_FIT;
                if ("fill".equals(mode)) m = AspectRatioFrameLayout.RESIZE_MODE_FILL;
                else if ("zoom".equals(mode)) m = AspectRatioFrameLayout.RESIZE_MODE_ZOOM;
                playerView.setResizeMode(m);
            }
            call.resolve();
        });
    }

    // Uygulama zaten tam ekran (MainActivity: çubuklar gizli, çentiğin altına çizim); burada yalnız yön değişir:
    // oynatıcı yatayı kilitler, çıkınca yön serbest kalır.
    @PluginMethod
    public void setImmersive(final PluginCall call) {
        final boolean on = call.getData().optBoolean("on", false);
        final boolean landscape = call.getData().optBoolean("landscape", on);
        main.post(() -> {
            getActivity().setRequestedOrientation((on && landscape) || tvMode
                    ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            call.resolve();
        });
    }

    // TV modu: tüm uygulama yatay kilitli (oynatıcıdan çıkınca da döner değil). MainActivity çift geri tuşuyla çıkış için okur.
    static volatile boolean tvMode = false;

    @PluginMethod
    public void setTvMode(final PluginCall call) {
        final boolean on = call.getData().optBoolean("on", false);
        tvMode = on;
        main.post(() -> {
            getActivity().setRequestedOrientation(on
                    ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            call.resolve();
        });
    }

    // Kamera çentiği payı (CSS piksel). Sayfa bunu --na-* değişkenlerine yazar.
    private JSObject insetsObject(int[] px) {
        float d = getContext().getResources().getDisplayMetrics().density;
        JSObject o = new JSObject();
        o.put("l", px[0] / d);
        o.put("t", px[1] / d);
        o.put("r", px[2] / d);
        o.put("b", px[3] / d);
        return o;
    }

    // Android TV / kumandalı cihaz mı? (arayüz odak halkasını ve geniş kenar boşluklarını açar)
    @PluginMethod
    public void isTv(final PluginCall call) {
        UiModeManager um = (UiModeManager) getContext().getSystemService(Context.UI_MODE_SERVICE);
        PackageManager pm = getContext().getPackageManager();
        boolean tv = (um != null && um.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION)
                || pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
                || !pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN);
        JSObject o = new JSObject();
        o.put("tv", tv);
        call.resolve(o);
    }

    @PluginMethod
    public void getInsets(final PluginCall call) {
        call.resolve(insetsObject(SafeArea.get()));
    }

    // ------------------------------------------------------------------ çoklu ekran

    private static final class Slot {
        PlayerView view;
        ExoPlayer player;
        String decoder = ""; // görüntü çözücünün adı (donanım mı yazılım mı anlaşılsın diye teşhis bilgisi)
    }

    private final Map<Integer, Slot> slots = new HashMap<>();

    @PluginMethod
    public void multiPlay(final PluginCall call) {
        final int id = call.getData().optInt("slot", 0);
        final String url = call.getData().optString("url", "");
        if (url.isEmpty()) {
            call.reject("url gerekli");
            return;
        }
        final String mime = call.getData().optString("mime", "auto");
        final boolean muted = call.getData().optBoolean("muted", true);
        final boolean fill = call.getData().optBoolean("fill", true);
        final JSObject headers = call.getObject("headers");
        final double[] r = rectOf(call);
        main.post(() -> {
            try {
                startSlot(id, url, mime, headers, r, muted, fill);
                call.resolve();
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            }
        });
    }

    private static double[] rectOf(PluginCall call) {
        double w = call.getData().optDouble("w", 0);
        double h = call.getData().optDouble("h", 0);
        return (w > 0 && h > 0) ? new double[] {call.getData().optDouble("x", 0), call.getData().optDouble("y", 0), w, h} : null;
    }

    private void startSlot(final int id, String url, String mime, JSObject headers, double[] r, boolean muted, boolean fill) {
        stopSlot(id);
        // Tek oynatıcı ile çoklu ekran birlikte çalışmaz: tam ekran/önizleme oynatıcısı durdurulur.
        StreamRecorder.stop(null);
        releasePlayer();
        if (playerView != null) playerView.setVisibility(View.GONE);
        Activity a = getActivity();
        ViewGroup parent = (ViewGroup) getBridge().getWebView().getParent();
        final Slot s = new Slot();
        s.view = (PlayerView) LayoutInflater.from(a).inflate(R.layout.iptv_player_view, parent, false);
        s.view.setVisibility(View.VISIBLE);
        s.view.setResizeMode(fill ? AspectRatioFrameLayout.RESIZE_MODE_ZOOM : AspectRatioFrameLayout.RESIZE_MODE_FIT); // doldur: şerit kalmaz, taşan kenarlar kırpılır
        parent.addView(s.view, 0); // WebView'in altında
        getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
        placeView(s.view, r);
        s.player = buildExo(headers, false, new DefaultLoadControl.Builder()
                .setBufferDurationsMs(5000, 20000, 1500, 3000)
                .build(), false, false);
        s.player.setVolume(muted ? 0f : 1f);
        s.player.setWakeMode(C.WAKE_MODE_NETWORK);
        // Çoklu video yüzeylerinde hazırlık sırasında son kareyi koru ve boşta kalan shutter'ı saydam tut.
        s.view.setKeepContentOnPlayerReset(true);
        s.view.setShutterBackgroundColor(Color.TRANSPARENT);
        // Kutu küçüktür: uyarlanır (HLS) yayınlarda kutuya yetecek çözünürlük seçilir, kod çözücüler gereksiz yüklenmez.
        if (r != null) {
            float dens = getContext().getResources().getDisplayMetrics().density;
            s.player.setTrackSelectionParameters(s.player.getTrackSelectionParameters().buildUpon()
                    .setViewportSize(Math.max(1, Math.round((float) (r[2] * dens))), Math.max(1, Math.round((float) (r[3] * dens))), true)
                    .build());
        }
        s.player.addAnalyticsListener(new AnalyticsListener() {
            @Override
            public void onVideoDecoderInitialized(AnalyticsListener.EventTime eventTime, String decoderName, long initializedTimestampMs, long initializationDurationMs) {
                s.decoder = decoderName == null ? "" : decoderName;
            }
        });
        s.player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                emitSlot(id, s.player);
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                emitSlot(id, s.player);
            }

            // Görüntü karesi çizildi: sayfadaki kutu bekçisi "ses var görüntü yok" durumunu buna bakarak ayırt eder.
            @Override
            public void onRenderedFirstFrame() {
                JSObject o = new JSObject();
                o.put("slot", id);
                o.put("state", "frame");
                o.put("info", videoInfo(s));
                notifyListeners("multi", o);
            }

            // Yayında görüntü izi var mı, bu cihaz çözebiliyor mu?
            @Override
            public void onTracksChanged(Tracks tracks) {
                boolean has = false;
                boolean supported = false;
                for (int g = 0; g < tracks.getGroups().size(); g++) {
                    Tracks.Group group = tracks.getGroups().get(g);
                    if (group.getType() != C.TRACK_TYPE_VIDEO) continue;
                    has = true;
                    for (int t = 0; t < group.length; t++) if (group.isTrackSupported(t)) supported = true;
                }
                if (!has) return; // yalnız ses (radyo) ya da izler henüz bilinmiyor
                JSObject o = new JSObject();
                o.put("slot", id);
                o.put("state", "video");
                o.put("has", true);
                o.put("supported", supported);
                o.put("info", videoInfo(s));
                notifyListeners("multi", o);
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                JSObject o = new JSObject();
                o.put("slot", id);
                o.put("state", "error");
                o.put("message", error.getErrorCodeName());
                notifyListeners("multi", o);
            }
        });
        s.view.setPlayer(s.player);
        s.player.setMediaItem(mediaItemOf(url, mime));
        s.player.setPlayWhenReady(true);
        s.player.prepare();
        slots.put(id, s);
        a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    // "hevc 1920x1080 50fps · c2.qti.hevc.decoder": hata iletisinde ve teşhiste kullanılır.
    private static String videoInfo(Slot s) {
        StringBuilder b = new StringBuilder();
        Format f = s.player == null ? null : s.player.getVideoFormat();
        if (f != null) {
            if (f.sampleMimeType != null) b.append(f.sampleMimeType.startsWith("video/") ? f.sampleMimeType.substring(6) : f.sampleMimeType);
            if (f.width > 0 && f.height > 0) b.append(b.length() > 0 ? " " : "").append(f.width).append("x").append(f.height);
            if (f.frameRate > 0) b.append(" ").append(Math.round(f.frameRate)).append("fps");
        }
        if (!s.decoder.isEmpty()) b.append(b.length() > 0 ? " · " : "").append(s.decoder);
        return b.toString();
    }

    private void emitSlot(int id, ExoPlayer p) {
        int st = p.getPlaybackState();
        String name;
        if (st == Player.STATE_IDLE) name = "idle";
        else if (st == Player.STATE_BUFFERING) name = "buffering";
        else if (st == Player.STATE_ENDED) name = "ended";
        else name = p.isPlaying() ? "playing" : "buffering";
        JSObject o = new JSObject();
        o.put("slot", id);
        o.put("state", name);
        notifyListeners("multi", o);
    }

    private void stopSlot(int id) {
        Slot s = slots.remove(id);
        if (s == null) return;
        s.view.setPlayer(null);
        s.player.release();
        ((ViewGroup) s.view.getParent()).removeView(s.view);
    }

    private void stopAllSlots() {
        for (Integer id : new java.util.ArrayList<>(slots.keySet())) stopSlot(id);
        if (player == null) getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    // Tüm kutularda görüntüyü doldur (kırp) / sığdır (şeritli) olarak değiştirir.
    @PluginMethod
    public void multiFit(final PluginCall call) {
        final boolean fill = call.getData().optBoolean("fill", true);
        main.post(() -> {
            for (Slot s : slots.values()) {
                if (s.view != null) s.view.setResizeMode(fill ? AspectRatioFrameLayout.RESIZE_MODE_ZOOM : AspectRatioFrameLayout.RESIZE_MODE_FIT);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void multiRect(final PluginCall call) {
        final int id = call.getData().optInt("slot", 0);
        final double[] r = rectOf(call);
        main.post(() -> {
            Slot s = slots.get(id);
            if (s != null && r != null) placeView(s.view, r);
            call.resolve();
        });
    }

    @PluginMethod
    public void multiMute(final PluginCall call) {
        final int id = call.getData().optInt("slot", 0);
        final boolean muted = call.getData().optBoolean("muted", true);
        main.post(() -> {
            Slot s = slots.get(id);
            if (s != null) s.player.setVolume(muted ? 0f : 1f);
            call.resolve();
        });
    }

    @PluginMethod
    public void multiStop(final PluginCall call) {
        final int id = call.getData().optInt("slot", 0);
        main.post(() -> {
            stopSlot(id);
            if (slots.isEmpty() && player == null) getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    @PluginMethod
    public void multiStopAll(final PluginCall call) {
        main.post(() -> {
            stopAllSlots();
            call.resolve();
        });
    }

    // ------------------------------------------------------------------ ses / altyazı

    @PluginMethod
    public void getTracks(final PluginCall call) {
        main.post(() -> {
            JSObject out = new JSObject();
            JSArray audio = new JSArray();
            JSArray text = new JSArray();
            boolean textOn = false;
            if (player != null) {
                Tracks tracks = player.getCurrentTracks();
                for (int g = 0; g < tracks.getGroups().size(); g++) {
                    Tracks.Group group = tracks.getGroups().get(g);
                    int type = group.getType();
                    if (type != C.TRACK_TYPE_AUDIO && type != C.TRACK_TYPE_TEXT) continue;
                    for (int t = 0; t < group.length; t++) {
                        if (!group.isTrackSupported(t)) continue;
                        Format f = group.getTrackFormat(t);
                        JSObject o = new JSObject();
                        o.put("id", g + ":" + t);
                        o.put("label", trackLabel(f, type == C.TRACK_TYPE_AUDIO ? "Ses" : "Altyazı", t + 1));
                        o.put("selected", group.isTrackSelected(t));
                        if (type == C.TRACK_TYPE_AUDIO) audio.put(o);
                        else {
                            text.put(o);
                            if (group.isTrackSelected(t)) textOn = true;
                        }
                    }
                }
            }
            out.put("audio", audio);
            out.put("text", text);
            out.put("textOn", textOn);
            call.resolve(out);
        });
    }

    private static String trackLabel(Format f, String fallback, int n) {
        StringBuilder sb = new StringBuilder();
        if (f.label != null && !f.label.isEmpty()) sb.append(f.label);
        else if (f.language != null && !f.language.isEmpty() && !"und".equals(f.language)) {
            sb.append(java.util.Locale.forLanguageTag(f.language).getDisplayLanguage(java.util.Locale.forLanguageTag("tr")));
        } else sb.append(fallback).append(' ').append(n);
        if (f.channelCount > 2) sb.append(" ").append(f.channelCount > 6 ? "5.1" : f.channelCount + "ch");
        return sb.toString();
    }

    // type: "audio" | "text"; id: "grup:iz" ya da boş (altyazıyı kapat)
    @PluginMethod
    public void selectTrack(final PluginCall call) {
        final String type = call.getData().optString("type", "audio");
        final String id = call.getData().optString("id", "");
        main.post(() -> {
            if (player == null) {
                call.resolve();
                return;
            }
            int trackType = "text".equals(type) ? C.TRACK_TYPE_TEXT : C.TRACK_TYPE_AUDIO;
            TrackSelectionParameters.Builder b = player.getTrackSelectionParameters().buildUpon();
            if (id.isEmpty()) {
                b.setTrackTypeDisabled(trackType, true);
            } else {
                String[] p = id.split(":");
                try {
                    Tracks.Group group = player.getCurrentTracks().getGroups().get(Integer.parseInt(p[0]));
                    b.setTrackTypeDisabled(trackType, false);
                    b.setOverrideForType(new TrackSelectionOverride(group.getMediaTrackGroup(), Integer.parseInt(p[1])));
                } catch (Exception e) {
                    call.reject("Geçersiz iz");
                    return;
                }
            }
            player.setTrackSelectionParameters(b.build());
            call.resolve();
        });
    }

    // ------------------------------------------------------------------ parlaklık ve ses

    // Geçerli parlaklık (0..1; sistem varsayılanındaysa sistem ayarı) ve medya sesi (0..1)
    @PluginMethod
    public void getLevels(final PluginCall call) {
        main.post(() -> {
            float b = getActivity().getWindow().getAttributes().screenBrightness;
            if (b < 0) {
                try {
                    b = Settings.System.getInt(getContext().getContentResolver(), Settings.System.SCREEN_BRIGHTNESS) / 255f;
                } catch (Exception e) {
                    b = 0.5f;
                }
            }
            double vol = 0.5;
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                if (max > 0) vol = am.getStreamVolume(AudioManager.STREAM_MUSIC) / (double) max;
            }
            JSObject o = new JSObject();
            o.put("brightness", b);
            o.put("volume", vol);
            call.resolve(o);
        });
    }

    // value: 0..1; negatif → sistem varsayılan parlaklığına dön
    @PluginMethod
    public void setBrightness(final PluginCall call) {
        final double v = call.getData().optDouble("value", -1);
        main.post(() -> {
            WindowManager.LayoutParams lp = getActivity().getWindow().getAttributes();
            lp.screenBrightness = v < 0 ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE : (float) Math.max(0.02, Math.min(1.0, v));
            getActivity().getWindow().setAttributes(lp);
            call.resolve();
        });
    }

    // value: 0..1 (medya sesi)
    @PluginMethod
    public void setVolume(final PluginCall call) {
        final double v = Math.max(0, Math.min(1, call.getData().optDouble("value", 0.5)));
        main.post(() -> {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                am.setStreamVolume(AudioManager.STREAM_MUSIC, (int) Math.round(v * max), 0);
            }
            call.resolve();
        });
    }

    // ------------------------------------------------------------------ kayıt

    private File recDir() {
        File base = getContext().getExternalFilesDir(Environment.DIRECTORY_MOVIES);
        File dir = new File(base != null ? base : getContext().getFilesDir(), "Kayitlar");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return dir;
    }

    private static String safeName(String name) {
        String s = String.valueOf(name).replaceAll("[^\\p{L}\\p{N}]+", "-").replaceAll("^-+|-+$", "");
        if (s.length() > 40) s = s.substring(0, 40);
        return s.isEmpty() ? "kanal" : s;
    }

    private JSObject recState() {
        JSObject o = new JSObject();
        long[] snap = StreamRecorder.snapshot();
        File f = StreamRecorder.currentFile();
        o.put("active", snap != null);
        if (snap != null) {
            o.put("startedAt", snap[0]);
            o.put("bytes", snap[1]);
            o.put("elapsedMs", Math.max(0, System.currentTimeMillis() - snap[0]));
        }
        if (f != null) o.put("id", f.getName());
        return o;
    }

    private JSObject recInfo(StreamRecorder.Info info, String reason) {
        JSObject o = new JSObject();
        o.put("active", false);
        o.put("id", info.file.getName());
        o.put("url", Uri.fromFile(info.file).toString());
        o.put("name", info.name);
        o.put("startedAt", info.startedAt);
        o.put("durationMs", info.durationMs);
        o.put("bytes", info.bytes);
        if (reason != null) o.put("reason", reason);
        return o;
    }

    private final StreamRecorder.Listener recListener = (info, reason) -> {
        final JSObject o = recInfo(info, reason);
        main.post(() -> notifyListeners("recording", o));
    };

    @PluginMethod
    public void recordStart(final PluginCall call) {
        final String name = call.getData().optString("name", "Kanal");
        final long maxMs = call.getData().optLong("maxMs", 0L);
        main.post(() -> {
            try {
                if (player == null || !curUrl.startsWith("http")) {
                    call.reject("Önce bir canlı yayın açın");
                    return;
                }
                if (StreamRecorder.active()) {
                    call.reject("Zaten kayıt yapılıyor");
                    return;
                }
                File dir = recDir();
                if (dir.getUsableSpace() < StreamRecorder.MIN_FREE_BYTES) {
                    call.reject("Yetersiz depolama alanı (en az 300 MB boş yer gerekir)");
                    return;
                }
                String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ROOT).format(new Date());
                File f = new File(dir, stamp + "_" + safeName(name) + ".ts");
                StreamRecorder.start(f, name, maxMs, recListener);
                JSObject st = recState();
                call.resolve(st);
                notifyListeners("recording", st);
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            }
        });
    }

    @PluginMethod
    public void recordStop(final PluginCall call) {
        main.post(() -> {
            StreamRecorder.Info info = StreamRecorder.stop(null);
            if (info == null) {
                JSObject o = new JSObject();
                o.put("active", false);
                call.resolve(o);
            } else {
                call.resolve(recInfo(info, null));
            }
        });
    }

    // Kayıt klasörü: {items: [{id, url, name, startedAt, durationMs, size, active}], freeBytes, usedBytes}
    @PluginMethod
    public void recordList(final PluginCall call) {
        io.execute(() -> {
            try {
                File dir = recDir();
                File[] files = dir.listFiles((d, n) -> n.endsWith(".ts"));
                if (files == null) files = new File[0];
                Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified())); // en yeni başta
                File live = StreamRecorder.currentFile();
                JSArray items = new JSArray();
                long used = 0;
                for (File f : files) {
                    used += f.length();
                    JSObject o = new JSObject();
                    o.put("id", f.getName());
                    o.put("url", Uri.fromFile(f).toString());
                    o.put("size", f.length());
                    o.put("active", live != null && live.equals(f));
                    readMeta(f, o);
                    items.put(o);
                }
                JSObject res = new JSObject();
                res.put("items", items);
                res.put("freeBytes", dir.getUsableSpace());
                res.put("usedBytes", used);
                call.resolve(res);
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            }
        });
    }

    // Yan dosyadan ad/başlangıç/süre; yoksa dosya adından ve değişiklik tarihinden türetilir.
    private static void readMeta(File ts, JSObject o) {
        String name = null;
        long startedAt = 0;
        long dur = -1;
        try (java.io.BufferedReader r = new java.io.BufferedReader(new java.io.FileReader(StreamRecorder.metaOf(ts)))) {
            name = r.readLine();
            startedAt = Long.parseLong(String.valueOf(r.readLine()).trim());
            dur = Long.parseLong(String.valueOf(r.readLine()).trim());
        } catch (Exception ignored) {
            // yan dosya yok ya da bozuk: aşağıdaki varsayılanlar kullanılır
        }
        if (name == null || name.isEmpty()) {
            String n = ts.getName();
            int u = n.indexOf('_');
            name = (u >= 0 ? n.substring(u + 1) : n).replaceAll("\\.ts$", "").replace('-', ' ');
        }
        if (startedAt <= 0) startedAt = ts.lastModified();
        o.put("name", name);
        o.put("startedAt", startedAt);
        o.put("durationMs", dur);
    }

    @PluginMethod
    public void recordDelete(final PluginCall call) {
        final String id = call.getData().optString("id", "");
        io.execute(() -> {
            try {
                if (id.isEmpty() || !id.equals(new File(id).getName()) || !id.endsWith(".ts")) {
                    call.reject("Geçersiz kayıt");
                    return;
                }
                File f = new File(recDir(), id);
                File live = StreamRecorder.currentFile();
                if (live != null && live.equals(f)) {
                    call.reject("Kayıt sürerken silinemez");
                    return;
                }
                //noinspection ResultOfMethodCallIgnored
                f.delete();
                //noinspection ResultOfMethodCallIgnored
                StreamRecorder.metaOf(f).delete();
                call.resolve();
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            }
        });
    }

    // ------------------------------------------------------------------ olaylar

    private void emitState() {
        if (player == null) return;
        int s = player.getPlaybackState();
        String name;
        if (s == Player.STATE_IDLE) name = "idle";
        else if (s == Player.STATE_BUFFERING) name = "buffering";
        else if (s == Player.STATE_ENDED) name = "ended";
        else name = player.isPlaying() ? "playing" : (player.getPlayWhenReady() ? "buffering" : "paused");
        castState = name;
        castLive = player.isCurrentMediaItemLive();
        JSObject o = new JSObject();
        o.put("state", name);
        o.put("playing", player.isPlaying());
        o.put("live", player.isCurrentMediaItemLive());
        notifyListeners("state", o);
        updatePipParams();
    }

    private void emitTime() {
        if (player == null) return;
        JSObject o = new JSObject();
        long dur = player.getDuration();
        castPos = player.getCurrentPosition();
        castDur = dur == C.TIME_UNSET ? -1L : dur;
        o.put("pos", player.getCurrentPosition());
        o.put("dur", dur == C.TIME_UNSET ? -1L : dur);
        o.put("buffered", player.getBufferedPosition());
        notifyListeners("time", o);
    }

    // ------------------------------------------------------------------ indirme

    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getData().optString("url", "");
        final JSObject headers = call.getObject("headers");
        if (url.isEmpty()) {
            call.reject("url gerekli");
            return;
        }
        io.execute(() -> {
            File out = null;
            HttpURLConnection conn = null;
            try {
                out = File.createTempFile(TMP_PREFIX, ".tmp", getContext().getCacheDir());
                conn = connect(url, headers);
                copy(conn.getInputStream(), out);
                JSObject r = new JSObject();
                r.put("path", out.getAbsolutePath());
                r.put("size", out.length());
                call.resolve(r);
            } catch (Exception e) {
                if (out != null) {
                    //noinspection ResultOfMethodCallIgnored
                    out.delete();
                }
                String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                call.reject(msg);
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    // Yönlendirmeleri (farklı sunucuya geçenler dahil) izleyip başarılı yanıtın bağlantısını döndürür.
    private HttpURLConnection connect(String url, JSObject headers) throws IOException {
        String cur = url;
        for (int hop = 0; hop < 8; hop++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(cur).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(40000);
            conn.setRequestProperty("User-Agent", UA);
            if (headers != null) {
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    String v = headers.optString(k, "");
                    if (!v.isEmpty()) conn.setRequestProperty(k, v);
                }
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

    // ------------------------------------------------------------------ yayın sağlık testi

    // Adrese kısa bir GET atar (WebView dışından: CORS ve karışık içerik engeli yoktur), ilk baytları okuyup bağlantıyı kapatır.
    // Hata da bir sonuçtur: { error, timeout, ms } ile çözülür; bağlantı kopması kanalı "çalışmıyor" gösterir.
    @PluginMethod
    public void probe(final PluginCall call) {
        final String url = call.getData().optString("url", "");
        final JSObject headers = call.getObject("headers");
        final int timeout = Math.max(2000, Math.min(20000, call.getData().optInt("timeoutMs", 8000)));
        if (url.isEmpty()) {
            call.reject("url gerekli");
            return;
        }
        probeIo.execute(() -> {
            final long t0 = System.currentTimeMillis();
            HttpURLConnection conn = null;
            JSObject r = new JSObject();
            try {
                String cur = url;
                int code = 0;
                for (int hop = 0; hop < 6; hop++) {
                    conn = (HttpURLConnection) new URL(cur).openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(timeout);
                    conn.setReadTimeout(timeout);
                    conn.setRequestProperty("User-Agent", UA);
                    if (headers != null) {
                        Iterator<String> keys = headers.keys();
                        while (keys.hasNext()) {
                            String k = keys.next();
                            String v = headers.optString(k, "");
                            if (!v.isEmpty()) conn.setRequestProperty(k, v);
                        }
                    }
                    code = conn.getResponseCode();
                    if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                        String loc = conn.getHeaderField("Location");
                        conn.disconnect();
                        conn = null;
                        if (loc == null || loc.isEmpty()) throw new IOException("Yönlendirme adresi yok");
                        cur = new URL(new URL(cur), loc).toString();
                        continue;
                    }
                    break;
                }
                if (conn == null) throw new IOException("Çok fazla yönlendirme");
                r.put("status", code);
                r.put("ms", System.currentTimeMillis() - t0);
                String ct = conn.getContentType();
                r.put("contentType", ct == null ? "" : ct);
                if (code >= 200 && code < 300) {
                    int n = 0;
                    boolean playlist = false;
                    try {
                        InputStream in = conn.getInputStream();
                        byte[] buf = new byte[512];
                        n = Math.max(0, in.read(buf));
                        playlist = n >= 7 && "#EXTM3U".equals(new String(buf, 0, 7, java.nio.charset.StandardCharsets.ISO_8859_1));
                    } catch (IOException ignored) {
                        n = 0; // yanıt başlığı geldi ama veri gelmedi/kesildi
                    }
                    r.put("bytes", n);
                    r.put("playlist", playlist);
                }
                call.resolve(r);
            } catch (Exception e) {
                JSObject err = new JSObject();
                err.put("error", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
                err.put("timeout", e instanceof SocketTimeoutException);
                err.put("ms", System.currentTimeMillis() - t0);
                call.resolve(err);
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    // ------------------------------------------------------------------ uygulama içi güncelleme

    private File updateDir() {
        return new File(getContext().getCacheDir(), "update");
    }

    // Yeni sürümün APK'sını önbelleğe indirir; ilerleme "apkProgress" olayıyla bildirilir.
    @PluginMethod
    public void downloadApk(final PluginCall call) {
        final String url = call.getData().optString("url", "");
        if (url.isEmpty()) {
            call.reject("url gerekli");
            return;
        }
        io.execute(() -> {
            HttpURLConnection conn = null;
            File dir = updateDir();
            File part = new File(dir, "iptv-update.part");
            File out = new File(dir, "iptv-update.apk");
            try {
                //noinspection ResultOfMethodCallIgnored
                dir.mkdirs();
                conn = connect(url, null);
                long total = conn.getContentLengthLong();
                try (InputStream src = conn.getInputStream(); OutputStream os = new FileOutputStream(part)) {
                    byte[] buf = new byte[64 * 1024];
                    long done = 0;
                    long lastEmit = 0;
                    int n;
                    while ((n = src.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        done += n;
                        long now = System.currentTimeMillis();
                        if (now - lastEmit > 250) {
                            lastEmit = now;
                            JSObject p = new JSObject();
                            p.put("loaded", done);
                            p.put("total", total);
                            notifyListeners("apkProgress", p);
                        }
                    }
                }
                if (total > 0 && part.length() != total) throw new IOException("İndirme yarım kaldı");
                if (out.exists() && !out.delete()) throw new IOException("Eski güncelleme dosyası silinemedi");
                if (!part.renameTo(out)) throw new IOException("Güncelleme dosyası yazılamadı");
                JSObject r = new JSObject();
                r.put("path", out.getAbsolutePath());
                r.put("size", out.length());
                call.resolve(r);
            } catch (Exception e) {
                //noinspection ResultOfMethodCallIgnored
                part.delete();
                call.reject(e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    // İndirilen APK için Android kurulum ekranını açar. "Bilinmeyen uygulamaları yükle" izni yoksa izin ekranını açar.
    @PluginMethod
    public void installApk(final PluginCall call) {
        final String path = call.getData().optString("path", "");
        main.post(() -> {
            try {
                Context ctx = getContext();
                File f = new File(path);
                String dirPath = updateDir().getCanonicalPath() + File.separator;
                if (!f.isFile() || !f.getCanonicalPath().startsWith(dirPath)) {
                    call.reject("Güncelleme dosyası bulunamadı");
                    return;
                }
                JSObject r = new JSObject();
                if (Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
                    Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
                    s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(s);
                    r.put("needsPermission", true);
                    call.resolve(r);
                    return;
                }
                Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
                r.put("needsPermission", false);
                call.resolve(r);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
            }
        });
    }

    private static void copy(InputStream in, File dest) throws IOException {
        try (InputStream src = in; OutputStream os = new FileOutputStream(dest)) {
            byte[] buf = new byte[64 * 1024];
            long total = 0;
            int n;
            while ((n = src.read(buf)) > 0) {
                total += n;
                if (total > MAX_DOWNLOAD_BYTES) throw new IOException("Dosya çok büyük");
                os.write(buf, 0, n);
            }
        }
    }

    // Metni dosya olarak kaydeder (yedek). Android 10+: İndirilenler/Iptv Player Pro; daha eskide paylaşım menüsü açılır.
    @PluginMethod
    public void saveText(final PluginCall call) {
        final String name = call.getData().optString("name", "yedek.json").replaceAll("[^A-Za-z0-9._-]", "_");
        final String text = call.getData().optString("text", "");
        final String mime = call.getData().optString("mime", "application/json");
        io.execute(() -> {
            try {
                Context ctx = getContext();
                byte[] bytes = text.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                JSObject res = new JSObject();
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Iptv Player Pro");
                    Uri uri = ctx.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) throw new IOException("Dosya oluşturulamadı");
                    try (OutputStream os = ctx.getContentResolver().openOutputStream(uri)) {
                        if (os == null) throw new IOException("Dosya açılamadı");
                        os.write(bytes);
                    }
                    res.put("where", "İndirilenler/Iptv Player Pro");
                } else {
                    File dir = new File(ctx.getCacheDir(), "yedek");
                    //noinspection ResultOfMethodCallIgnored
                    dir.mkdirs();
                    File f = new File(dir, name);
                    try (OutputStream os = new FileOutputStream(f)) {
                        os.write(bytes);
                    }
                    Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType(mime);
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    Intent chooser = Intent.createChooser(send, "Yedeği kaydet");
                    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(chooser);
                    res.put("where", "paylaşım menüsü");
                }
                call.resolve(res);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
            }
        });
    }

    @PluginMethod
    public void deleteFile(final PluginCall call) {
        final String path = call.getData().optString("path", "");
        io.execute(() -> {
            try {
                File f = new File(path).getCanonicalFile();
                File cache = getContext().getCacheDir().getCanonicalFile();
                if (f.getPath().startsWith(cache.getPath() + File.separator) && f.getName().startsWith(TMP_PREFIX)) {
                    //noinspection ResultOfMethodCallIgnored
                    f.delete();
                }
            } catch (IOException ignored) {
                // silinemediyse bir saat sonra load() temizler
            }
            call.resolve();
        });
    }


    // ------------------------------------------------------------------ telefondan TV'ye oynatma

    private SharedPreferences castPrefs() {
        return getContext().getSharedPreferences("cast", Context.MODE_PRIVATE);
    }

    private String castDeviceId() {
        SharedPreferences sp = castPrefs();
        String id = sp.getString("id", "");
        if (id.isEmpty()) {
            id = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
            sp.edit().putString("id", id).apply();
        }
        return id;
    }

    private Map<String, String> castLoadTokens() {
        Map<String, String> m = new HashMap<>();
        try {
            JSONObject o = new JSONObject(castPrefs().getString("tokens", "{}"));
            Iterator<String> it = o.keys();
            while (it.hasNext()) {
                String k = it.next();
                m.put(k, o.optString(k, "Telefon"));
            }
        } catch (JSONException ignored) {
            // bozuk kayıt: eşleşmeler yok sayılır
        }
        return m;
    }

    private void castSaveTokens(Map<String, String> tokens) {
        JSONObject o = new JSONObject();
        try {
            for (Map.Entry<String, String> e : tokens.entrySet()) o.put(e.getKey(), e.getValue());
        } catch (JSONException ignored) {
            // anahtar/değer her zaman geçerli
        }
        castPrefs().edit().putString("tokens", o.toString()).apply();
    }

    private JSObject castInfoObject() {
        JSObject o = new JSObject();
        o.put("running", cast != null && cast.isRunning());
        if (cast != null && cast.isRunning()) {
            o.put("port", cast.port());
            o.put("id", cast.id());
            o.put("name", cast.name());
            o.put("pairing", cast.pairingOpen());
            JSArray ips = new JSArray();
            for (String ip : CastServer.localAddresses()) ips.put(ip);
            o.put("ips", ips);
            JSArray pl = new JSArray();
            for (String[] p : cast.paired()) {
                JSObject d = new JSObject();
                d.put("id", p[0]);
                d.put("name", p[1]);
                pl.put(d);
            }
            o.put("paired", pl);
        }
        return o;
    }

    private final CastServer.Host castHost = new CastServer.Host() {
        @Override
        public String onPlay(String body, String from) {
            final JSObject o;
            try {
                o = new JSObject(body);
            } catch (JSONException e) {
                return "Geçersiz istek";
            }
            if (o.optJSONArray("targets") == null || o.optJSONArray("targets").length() == 0) return "Oynatma adresi yok";
            main.post(() -> {
                if (!foreground) bringToFront();
                notifyListeners("castPlay", o);
            });
            return null;
        }

        @Override
        public String onCommand(String body) {
            return castCommand(body);
        }

        @Override
        public String state() {
            return castStateJson();
        }

        @Override
        public void onTokens(Map<String, String> tokens) {
            castSaveTokens(tokens);
        }

        @Override
        public CastServer.Reply onSync(final String body) {
            final String id = Integer.toHexString(syncSeq.incrementAndGet()) + Long.toHexString(System.nanoTime());
            final BlockingQueue<String[]> q = new ArrayBlockingQueue<>(1);
            syncWaiting.put(id, q);
            try {
                main.post(() -> {
                    JSObject o = new JSObject();
                    o.put("id", id);
                    o.put("body", body);
                    notifyListeners("castSync", o);
                });
                String[] r = q.poll(25, TimeUnit.SECONDS);
                if (r == null) return new CastServer.Reply(504, "{\"error\":\"TV yanıt vermedi. TV’de uygulamanın açık olduğundan emin olun\"}");
                return new CastServer.Reply("1".equals(r[0]) ? 200 : 422, r[1]);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return new CastServer.Reply(504, "{\"error\":\"Eşitleme kesildi\"}");
            } finally {
                syncWaiting.remove(id);
            }
        }
    };

    private void holdMulticast(boolean on) {
        try {
            if (on && castLock == null) {
                WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wm != null) {
                    castLock = wm.createMulticastLock("iptvpro-cast");
                    castLock.setReferenceCounted(false);
                    castLock.acquire();
                }
            } else if (!on && castLock != null) {
                if (castLock.isHeld()) castLock.release();
                castLock = null;
            }
        } catch (RuntimeException ignored) {
            // izin/Wi-Fi yoksa bulma yayını yine de çoğu cihazda çalışır; elle IP kalır
        }
    }

    private void bringToFront() {
        try {
            Intent i = new Intent(getContext(), MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            getContext().startActivity(i);
        } catch (RuntimeException ignored) {
            // Android 10+ arka plandan açmayı engelleyebilir; uygulama açıkken çalışır
        }
    }

    private String castCommand(String body) {
        final JSONObject o;
        try {
            o = new JSONObject(body);
        } catch (JSONException e) {
            return "Geçersiz komut";
        }
        final String a = o.optString("a", "");
        final long v = o.optLong("v", 0L);
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        switch (a) {
            case "pause":
            case "play":
            case "toggle":
            case "seekBy":
            case "seekTo":
                main.post(() -> {
                    if (player == null) return;
                    if ("pause".equals(a)) {
                        player.setPlayWhenReady(false);
                    } else if ("play".equals(a) || ("toggle".equals(a) && !player.getPlayWhenReady())) {
                        if (player.getPlaybackState() == Player.STATE_ENDED) player.seekTo(0);
                        player.setPlayWhenReady(true);
                    } else if ("toggle".equals(a)) {
                        player.setPlayWhenReady(false);
                    } else if (!player.isCurrentMediaItemLive()) {
                        long dur = player.getDuration();
                        long t = "seekBy".equals(a) ? player.getCurrentPosition() + v : v;
                        if (dur != C.TIME_UNSET) t = Math.min(t, dur);
                        player.seekTo(Math.max(0L, t));
                    }
                });
                return null;
            case "stop":
                main.post(() -> notifyListeners("castStop", new JSObject()));
                return null;
            case "volUp":
            case "volDown":
                if (am == null) return "Ses ayarlanamıyor";
                am.adjustStreamVolume(AudioManager.STREAM_MUSIC, "volUp".equals(a) ? AudioManager.ADJUST_RAISE : AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI);
                return null;
            case "setVol":
                if (am == null) return "Ses ayarlanamıyor";
                am.setStreamVolume(AudioManager.STREAM_MUSIC, (int) Math.max(0, Math.min(am.getStreamMaxVolume(AudioManager.STREAM_MUSIC), v)), AudioManager.FLAG_SHOW_UI);
                return null;
            default:
                return "Bilinmeyen komut";
        }
    }

    private String castStateJson() {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        int cur = 0;
        int max = 0;
        boolean fixed = false;
        if (am != null) {
            cur = am.getStreamVolume(AudioManager.STREAM_MUSIC);
            max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            fixed = Build.VERSION.SDK_INT >= 21 && am.isVolumeFixed();
        }
        return "{\"active\":" + castActive + ",\"state\":" + CastServer.q(castState) + ",\"pos\":" + castPos + ",\"dur\":" + castDur + ",\"live\":" + castLive
                + ",\"title\":" + CastServer.q(castTitle) + ",\"kind\":" + CastServer.q(castKind) + ",\"vol\":{\"cur\":" + cur + ",\"max\":" + max + ",\"fixed\":" + fixed + "}}";
    }

    // Alıcıyı açar (TV'de ayar açıksa uygulama başlarken çağrılır). Eşleşmiş telefonlar korunur.
    @PluginMethod
    public void castStart(final PluginCall call) {
        final String name = call.getData().optString("name", "");
        io.execute(() -> {
            try {
                if (cast == null) cast = new CastServer(castHost, castDeviceId(), name.isEmpty() ? Build.MODEL : name);
                else cast.setName(name);
                if (!cast.isRunning()) cast.start(CastServer.PORT, castLoadTokens());
                holdMulticast(true);
                call.resolve(castInfoObject());
            } catch (Exception e) {
                call.reject("Alıcı açılamadı: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void castStop(final PluginCall call) {
        io.execute(() -> {
            if (cast != null) cast.stop();
            holdMulticast(false);
            call.resolve(castInfoObject());
        });
    }

    @PluginMethod
    public void castInfo(final PluginCall call) {
        call.resolve(castInfoObject());
    }

    // TV ekranında gösterilecek 6 haneli eşleştirme kodunu açar (5 dakika geçerli, tek kullanımlık).
    @PluginMethod
    public void castPairOpen(final PluginCall call) {
        if (cast == null || !cast.isRunning()) {
            call.reject("Alıcı kapalı");
            return;
        }
        String code = String.format("%06d", new SecureRandom().nextInt(1000000));
        cast.openPairing(code, 5 * 60_000L);
        JSObject o = castInfoObject();
        o.put("code", code);
        call.resolve(o);
    }

    @PluginMethod
    public void castPairClose(final PluginCall call) {
        if (cast != null) cast.closePairing();
        call.resolve(castInfoObject());
    }

    @PluginMethod
    public void castUnpair(final PluginCall call) {
        if (cast != null) cast.unpair(call.getData().optString("id", ""));
        call.resolve(castInfoObject());
    }

    // Çalan şeyin adı (TV'nin kendi oynatması dahil); telefon uzaktan kumandası bunu gösterir.
    @PluginMethod
    public void castNow(final PluginCall call) {
        castTitle = call.getData().optString("title", "");
        castKind = call.getData().optString("kind", "");
        call.resolve();
    }

    // Uygulamanın (JS) eşitleme yanıtı: bekleyen telefon isteğine iletilir.
    @PluginMethod
    public void castSyncReply(final PluginCall call) {
        BlockingQueue<String[]> q = syncWaiting.get(call.getData().optString("id", ""));
        if (q != null) q.offer(new String[] {call.getData().optBoolean("ok", false) ? "1" : "0", call.getData().optString("body", "{}")});
        call.resolve();
    }

    // Ağdaki TV alıcılarını arar.
    @PluginMethod
    public void castDiscover(final PluginCall call) {
        final int timeout = Math.max(300, Math.min(4000, call.getData().optInt("timeoutMs", 1500)));
        io.execute(() -> {
            try {
                List<CastClient.Found> found = CastClient.discover(CastServer.PORT, timeout, null);
                JSArray arr = new JSArray();
                for (CastClient.Found f : found) {
                    try {
                        JSObject d = new JSObject(f.json);
                        d.put("host", f.host);
                        d.put("port", f.port);
                        arr.put(d);
                    } catch (JSONException ignored) {
                        // bozuk yanıt yok sayılır
                    }
                }
                JSObject o = new JSObject();
                o.put("devices", arr);
                call.resolve(o);
            } catch (Exception e) {
                call.reject("Arama yapılamadı: " + e.getMessage());
            }
        });
    }

    // TV alıcısına HTTP isteği: { host, port, method, path, token, code, name, body, timeoutMs } → { status, body, error }.
    @PluginMethod
    public void castRequest(final PluginCall call) {
        final JSONObject d = call.getData();
        io.execute(() -> {
            Map<String, String> h = new HashMap<>();
            String token = d.optString("token", "");
            if (!token.isEmpty()) h.put("X-Token", token);
            String code = d.optString("code", "");
            if (!code.isEmpty()) h.put("X-Code", code);
            if (!code.isEmpty()) {
                String n = d.optString("name", "");
                if (n.isEmpty()) n = Build.MODEL;
                try {
                    h.put("X-Name", URLEncoder.encode(n, "UTF-8").replace("+", "%20"));
                } catch (Exception ignored) {
                    // ad gönderilmez
                }
            }
            CastClient.Response r = CastClient.request(d.optString("host", ""), d.optInt("port", CastServer.PORT), d.optString("method", "GET"), d.optString("path", "/"), h, d.optString("body", ""), Math.max(500, Math.min(30000, d.optInt("timeoutMs", 4000))));
            JSObject o = new JSObject();
            o.put("status", r.status);
            o.put("body", r.body);
            if (r.error != null) o.put("error", r.error);
            call.resolve(o);
        });
    }


    // Android Picture-in-Picture: mevcut ExoPlayer ve PlayerView oturumu korunur.
    @PluginMethod
    public void enterPip(final PluginCall call) {
        main.post(() -> {
            if (player == null || playerView == null) {
                call.reject("Önce bir yayın başlatın");
                return;
            }
            if (Build.VERSION.SDK_INT < 26) {
                call.reject("PiP için Android 8.0 veya üzeri gerekir");
                return;
            }
            try {
                updatePipParams();
                boolean entered = getActivity().enterPictureInPictureMode(buildPipParams());
                if (entered) call.resolve();
                else call.reject("PiP penceresi açılamadı");
            } catch (RuntimeException e) {
                call.reject("PiP açılamadı: " + e.getMessage());
            }
        });
    }

    // Ana ekrana çıkınca PiP'e geçilebilir mi: oynayan (ya da yüklenen) bir yayın var ve çoklu ekran açık değil.
    private boolean pipWanted() {
        return player != null && player.getPlayWhenReady() && player.getPlaybackState() != Player.STATE_ENDED;
    }

    // PiP penceresinin en-boy oranı yayından alınır; Android yalnız 1:2,39 – 2,39:1 aralığını kabul eder.
    private Rational pipRatio() {
        if (player != null) {
            VideoSize v = player.getVideoSize();
            if (v.width > 0 && v.height > 0) {
                double r = (double) v.width * (v.pixelWidthHeightRatio > 0 ? v.pixelWidthHeightRatio : 1f) / v.height;
                r = Math.max(1 / 2.39, Math.min(2.39, r));
                return new Rational(Math.round((float) (r * 1000)), 1000);
            }
        }
        return new Rational(16, 9);
    }

    private PictureInPictureParams buildPipParams() {
        PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder()
                .setAspectRatio(pipRatio())
                .setActions(pipActions());
        if (Build.VERSION.SDK_INT >= 31) builder.setAutoEnterEnabled(pipWanted());
        return builder.build();
    }

    private List<RemoteAction> pipActions() {
        Activity activity = getActivity();
        boolean playing = player != null && player.isPlaying();
        List<RemoteAction> actions = new java.util.ArrayList<>();
        actions.add(pipAction(activity, 21, "pip_previous", "Önceki kanal", android.R.drawable.ic_media_previous));
        actions.add(pipAction(activity, 22, playing ? "pip_pause" : "pip_play",
                playing ? "Duraklat" : "Oynat",
                playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play));
        actions.add(pipAction(activity, 23, "pip_next", "Sonraki kanal", android.R.drawable.ic_media_next));
        return actions;
    }

    private RemoteAction pipAction(Activity activity, int requestCode, String action, String title, int iconRes) {
        Intent intent = new Intent(activity, MainActivity.class);
        intent.setAction("com.koruk.iptv.PIP_ACTION");
        intent.putExtra("pip_action", action);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pending = PendingIntent.getActivity(activity, requestCode, intent, flags);
        return new RemoteAction(Icon.createWithResource(activity, iconRes), title, title, pending);
    }

    private void updatePipParams() {
        if (Build.VERSION.SDK_INT < 26 || getActivity() == null || getActivity().isFinishing()) return;
        try {
            getActivity().setPictureInPictureParams(buildPipParams());
        } catch (RuntimeException ignored) {
            // Activity henüz hazır değilse sonraki oynatma durumu parametreleri günceller.
        }
    }

    // Ana ekran / Geri ile uygulamadan çıkılırken yayın varsa PiP'e geçilir (Android 12+ bunu kendisi yapar). true → PiP istendi.
    public static boolean enterPipFromUserLeave() {
        IptvPlayerPlugin plugin = activePlugin;
        if (plugin == null || Build.VERSION.SDK_INT < 26 || !plugin.pipWanted()) return false;
        plugin.main.post(() -> {
            try {
                plugin.updatePipParams();
                plugin.getActivity().enterPictureInPictureMode(plugin.buildPipParams());
            } catch (RuntimeException ignored) {
                // PiP kullanılamıyorsa normal arka plan davranışı korunur.
            }
        });
        return true;
    }

    public static void onPipModeChanged(boolean inPip) {
        IptvPlayerPlugin plugin = activePlugin;
        if (plugin == null) return;
        plugin.main.post(() -> {
            plugin.pipMode = inPip;
            WebView web = plugin.getBridge() != null ? plugin.getBridge().getWebView() : null;
            if (web != null) web.setVisibility(inPip ? View.GONE : View.VISIBLE);
            if (plugin.playerView != null) plugin.playerView.setVisibility(plugin.player == null ? View.GONE : View.VISIBLE);
            plugin.applyRect(); // PiP'te görüntü pencereyi doldurur, çıkınca küçük pencere ölçüsüne döner
            JSObject o = new JSObject();
            o.put("active", inPip);
            plugin.notifyListeners("pip", o);
        });
    }

    // PiP penceresi X ile kapatıldı: etkinlik görünmez kaldı, yayın duraklatılır (sesi arka planda sürmez).
    public static void onPipDismissed() {
        IptvPlayerPlugin plugin = activePlugin;
        if (plugin == null) return;
        plugin.main.post(plugin::pauseForBackground);
    }

    // Uygulama görünmez oldu: kayıt sürerken yayın sessiz akar, yoksa duraklatılır.
    private void pauseForBackground() {
        if (player == null) return;
        if (StreamRecorder.active()) player.setVolume(0f);
        else player.setPlayWhenReady(false);
    }

    public static void handlePipAction(Intent intent) {
        IptvPlayerPlugin plugin = activePlugin;
        if (plugin == null || intent == null || !"com.koruk.iptv.PIP_ACTION".equals(intent.getAction())) return;
        String action = intent.getStringExtra("pip_action");
        plugin.main.post(() -> {
            if (plugin.player == null) return;
            if ("pip_pause".equals(action)) plugin.player.setPlayWhenReady(false);
            else if ("pip_play".equals(action)) {
                if (plugin.player.getPlaybackState() == Player.STATE_ENDED) plugin.player.seekTo(0);
                plugin.player.setPlayWhenReady(true);
            } else if ("pip_previous".equals(action) || "pip_next".equals(action)) {
                JSObject event = new JSObject();
                event.put("direction", "pip_previous".equals(action) ? -1 : 1);
                plugin.notifyListeners("pipChannel", event);
            }
            plugin.updatePipParams();
        });
    }

    // ------------------------------------------------------------------ yaşam döngüsü

    @Override
    protected void handleOnStop() {
        foreground = false;
        if (Build.VERSION.SDK_INT >= 26 && getActivity().isInPictureInPictureMode()) {
            // PiP'e geçişte etkinlik görünür kalır; X ile kapatmada ise kısa süre sonra PiP'ten çıkılmış olur.
            main.postDelayed(() -> {
                if (!foreground && !getActivity().isInPictureInPictureMode()) pauseForBackground();
            }, 500);
            return;
        }
        pauseForBackground();
    }

    @Override
    protected void handleOnResume() {
        foreground = true;
        if (player != null) player.setVolume(1f);
    }

    @Override
    protected void handleOnDestroy() {
        if (activePlugin == this) activePlugin = null;
        main.removeCallbacksAndMessages(null);
        if (cast != null) cast.stop();
        holdMulticast(false);
        StreamRecorder.stop(null);
        stopAllSlots();
        releasePlayer();
        io.shutdownNow();
    }
}
