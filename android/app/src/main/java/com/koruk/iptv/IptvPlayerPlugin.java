package com.koruk.iptv;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
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
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

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

    private PlayerView playerView;
    private ExoPlayer player;
    private boolean ticking = false;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (player == null) {
                ticking = false;
                return;
            }
            emitTime();
            main.postDelayed(this, 1000);
        }
    };

    @Override
    public void load() {
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
    public void play(final PluginCall call) {
        final String url = call.getData().optString("url", "");
        if (url.isEmpty()) {
            call.reject("url gerekli");
            return;
        }
        final String mime = call.getData().optString("mime", "auto");
        final long startMs = call.getData().optLong("startMs", 0L);
        final JSObject headers = call.getObject("headers");
        main.post(() -> {
            try {
                startPlayback(url, mime, startMs, headers);
                call.resolve();
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            }
        });
    }

    private void startPlayback(String url, String mime, long startMs, JSObject headers) {
        releasePlayer();
        ensureView();

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

        DefaultLoadControl load = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(15000, 60000, 2500, 5000)
                .build();

        AudioAttributes audio = new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                .build();
        player = new ExoPlayer.Builder(getContext())
                .setMediaSourceFactory(new DefaultMediaSourceFactory(http))
                .setLoadControl(load)
                .setAudioAttributes(audio, true)
                .setHandleAudioBecomingNoisy(true)
                .build();
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                emitState();
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                emitState();
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

        MediaItem.Builder item = new MediaItem.Builder().setUri(url);
        if ("hls".equals(mime)) item.setMimeType(MimeTypes.APPLICATION_M3U8);
        player.setMediaItem(item.build());
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
        if (playerView == null) return;
        ViewGroup.LayoutParams lp = playerView.getLayoutParams();
        if (!(lp instanceof ViewGroup.MarginLayoutParams)) return;
        ViewGroup.MarginLayoutParams m = (ViewGroup.MarginLayoutParams) lp;
        if (rect == null) {
            m.width = ViewGroup.LayoutParams.MATCH_PARENT;
            m.height = ViewGroup.LayoutParams.MATCH_PARENT;
            m.setMargins(0, 0, 0, 0);
        } else {
            float d = getContext().getResources().getDisplayMetrics().density;
            m.width = Math.max(1, Math.round((float) (rect[2] * d)));
            m.height = Math.max(1, Math.round((float) (rect[3] * d)));
            m.setMargins(Math.round((float) (rect[0] * d)), Math.round((float) (rect[1] * d)), 0, 0);
        }
        playerView.setLayoutParams(m);
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
        if (player != null) {
            if (playerView != null) playerView.setPlayer(null);
            player.release();
            player = null;
        }
    }

    @PluginMethod
    public void stop(final PluginCall call) {
        main.post(() -> {
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

    // Tam ekran (sistem çubukları gizli) ve yatay yön
    @PluginMethod
    public void setImmersive(final PluginCall call) {
        final boolean on = call.getData().optBoolean("on", false);
        final boolean landscape = call.getData().optBoolean("landscape", on);
        main.post(() -> {
            Activity a = getActivity();
            View decor = a.getWindow().getDecorView();
            WindowCompat.setDecorFitsSystemWindows(a.getWindow(), !on);
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(a.getWindow(), decor);
            if (c != null) {
                if (on) {
                    c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    c.hide(WindowInsetsCompat.Type.systemBars());
                } else {
                    c.show(WindowInsetsCompat.Type.systemBars());
                }
            }
            a.setRequestedOrientation(on && landscape
                    ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            // Yatayda kamera çentiği/ada alanına da çiz; yoksa görüntü o şeritte kesilir ve “Doldur” bile tam doldurmaz.
            if (Build.VERSION.SDK_INT >= 28) {
                WindowManager.LayoutParams lp = a.getWindow().getAttributes();
                lp.layoutInDisplayCutoutMode = on
                        ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                        : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
                a.getWindow().setAttributes(lp);
            }
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

    // ------------------------------------------------------------------ olaylar

    private void emitState() {
        if (player == null) return;
        int s = player.getPlaybackState();
        String name;
        if (s == Player.STATE_IDLE) name = "idle";
        else if (s == Player.STATE_BUFFERING) name = "buffering";
        else if (s == Player.STATE_ENDED) name = "ended";
        else name = player.isPlaying() ? "playing" : (player.getPlayWhenReady() ? "buffering" : "paused");
        JSObject o = new JSObject();
        o.put("state", name);
        o.put("playing", player.isPlaying());
        o.put("live", player.isCurrentMediaItemLive());
        notifyListeners("state", o);
    }

    private void emitTime() {
        if (player == null) return;
        JSObject o = new JSObject();
        long dur = player.getDuration();
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

    // ------------------------------------------------------------------ yaşam döngüsü

    @Override
    protected void handleOnStop() {
        if (player != null) player.setPlayWhenReady(false);
    }

    @Override
    protected void handleOnDestroy() {
        main.removeCallbacksAndMessages(null);
        releasePlayer();
        io.shutdownNow();
    }
}
