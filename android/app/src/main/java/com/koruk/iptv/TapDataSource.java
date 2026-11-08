package com.koruk.iptv;

import android.net.Uri;

import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.TransferListener;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Oynatıcının okuduğu baytları, kayıt açıkken StreamRecorder'a da verir (liste/anahtar dosyaları hariç).
 * Oynatmayı hiçbir koşulda bozmaz: kayıt tarafındaki hata yutulur.
 */
final class TapDataSource implements DataSource {
    static final class Factory implements DataSource.Factory {
        private final DataSource.Factory upstream;

        Factory(DataSource.Factory upstream) {
            this.upstream = upstream;
        }

        @Override
        public DataSource createDataSource() {
            return new TapDataSource(upstream.createDataSource());
        }
    }

    private final DataSource upstream;
    private boolean tapping;
    private boolean first;

    private TapDataSource(DataSource upstream) {
        this.upstream = upstream;
    }

    @Override
    public void addTransferListener(TransferListener transferListener) {
        upstream.addTransferListener(transferListener);
    }

    @Override
    public long open(DataSpec dataSpec) throws IOException {
        long n = upstream.open(dataSpec);
        tapping = isMedia(dataSpec.uri, upstream.getResponseHeaders());
        first = true;
        return n;
    }

    @Override
    public int read(byte[] buffer, int offset, int length) throws IOException {
        int n = upstream.read(buffer, offset, length);
        if (n > 0 && tapping && StreamRecorder.active()) {
            try {
                if (!StreamRecorder.write(this, buffer, offset, n, first)) tapping = false;
            } catch (RuntimeException ignored) {
                tapping = false;
            }
        }
        if (n > 0) first = false;
        return n;
    }

    @Override
    public Uri getUri() {
        return upstream.getUri();
    }

    @Override
    public Map<String, List<String>> getResponseHeaders() {
        return upstream.getResponseHeaders();
    }

    @Override
    public void close() throws IOException {
        try {
            StreamRecorder.release(this);
        } finally {
            tapping = false;
            upstream.close();
        }
    }

    // Yalnız ağdan gelen ve liste (m3u8) olmayan istekler kayda alınır.
    static boolean isMedia(Uri uri, Map<String, List<String>> headers) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) return false;
        String path = uri.getPath();
        if (path != null) {
            String p = path.toLowerCase(java.util.Locale.ROOT);
            if (p.endsWith(".m3u8") || p.endsWith(".m3u") || p.endsWith(".key") || p.endsWith(".mpd")) return false;
        }
        if (headers != null) {
            for (Map.Entry<String, List<String>> e : headers.entrySet()) {
                if (e.getKey() == null || !e.getKey().equalsIgnoreCase("Content-Type") || e.getValue() == null) continue;
                for (String v : e.getValue()) {
                    if (v != null && v.toLowerCase(java.util.Locale.ROOT).contains("mpegurl")) return false;
                }
            }
        }
        return true;
    }
}
