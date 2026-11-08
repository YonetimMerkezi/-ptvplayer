package com.koruk.iptv;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;

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
                String cur = url;
                boolean done = false;
                for (int hop = 0; hop < 8 && !done; hop++) {
                    conn = (HttpURLConnection) new URL(cur).openConnection();
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
                        if (loc == null || loc.isEmpty()) throw new IOException("Yönlendirme adresi yok");
                        cur = new URL(new URL(cur), loc).toString();
                        conn.disconnect();
                        conn = null;
                        continue;
                    }
                    if (code < 200 || code >= 300) throw new IOException("HTTP " + code);
                    copy(conn.getInputStream(), out);
                    done = true;
                }
                if (!done) throw new IOException("Çok fazla yönlendirme");
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
