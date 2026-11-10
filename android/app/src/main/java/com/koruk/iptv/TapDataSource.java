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
 * Kayıt olsun olmasın her isteğin ilk baytlarına bakıp yayın biçimini StreamSniff'e bildirir (kayıt başlamadan "kaydedilebilir mi" denetlenir).
 * Oynatmayı hiçbir koşulda bozmaz: kayıt ve tanıma tarafındaki hata yutulur.
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
    // biçim tanıma (istek başına)
    private final byte[] head = new byte[StreamSniff.HEAD];
    private int headLen;
    private int kind;
    private StreamSniff.Capture capture;
    private boolean progFlagged;

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
        headLen = 0;
        kind = StreamSniff.UNDECIDED;
        capture = null;
        progFlagged = false;
        return n;
    }

    @Override
    public int read(byte[] buffer, int offset, int length) throws IOException {
        int n = upstream.read(buffer, offset, length);
        if (n > 0) {
            boolean wasFirst = first;
            try {
                sniff(buffer, offset, n);
            } catch (RuntimeException ignored) {
                // tanıma oynatmayı etkilemez
            }
            // Adres/başlık "liste" gibi görünse de içerik TS ya da fMP4 parçasıysa istek kayda alınır (yanlış ad/Content-Type'a güvenilmez).
            if (!tapping && wasFirst && (kind == StreamSniff.TS || kind == StreamSniff.MP4_FRAG) && isHttp(upstream.getUri())) tapping = true;
            if (tapping && StreamRecorder.active()) {
                try {
                    if (!StreamRecorder.write(this, buffer, offset, n, wasFirst)) tapping = false;
                } catch (RuntimeException ignored) {
                    tapping = false;
                }
            }
            first = false;
        }
        return n;
    }

    // İsteğin ilk baytlarından türü belirler; başlangıç bölümü (fMP4) ve oynatma listesi metni biriktirilir.
    private void sniff(byte[] b, int off, int n) {
        if (kind != StreamSniff.UNDECIDED) {
            if (capture != null) {
                capture.add(b, off, n);
                checkProgressive();
            }
            return;
        }
        int take = Math.min(n, StreamSniff.HEAD - headLen);
        System.arraycopy(b, off, head, headLen, take);
        headLen += take;
        int k = StreamSniff.classify(head, headLen, false);
        if (k == StreamSniff.UNDECIDED) return;
        decide(k);
        if (capture != null && take < n) {
            capture.add(b, off + take, n - take);
            checkProgressive();
        }
    }

    // Başlangıç bölümü sınırı aştıysa bu bir başlangıç bölümü değil, aralıksız MP4 akışıdır: kayıttan önce bilinsin diye hemen bildirilir.
    private void checkProgressive() {
        if (kind == StreamSniff.MP4_INIT && capture != null && capture.overflow && !progFlagged) {
            progFlagged = true;
            StreamSniff.noteProgressiveMp4(head, headLen);
        }
    }

    private void decide(int k) {
        kind = k;
        if (k == StreamSniff.MP4_INIT) {
            capture = new StreamSniff.Capture(StreamSniff.INIT_CAP);
            capture.add(head, 0, headLen);
        } else if (k == StreamSniff.PLAYLIST) {
            capture = new StreamSniff.Capture(StreamSniff.LIST_CAP);
            capture.add(head, 0, headLen);
        } else {
            StreamSniff.noteMedia(k, head, headLen);
        }
    }

    // İstek bitti: kısa kalan istekler eldeki baytlarla sınıflanır, biriken başlangıç bölümü/liste bildirilir.
    private void finishSniff() {
        if (kind == StreamSniff.UNDECIDED && headLen > 0) decide(StreamSniff.classify(head, headLen, true));
        if (capture != null) {
            if (kind == StreamSniff.MP4_INIT) {
                if (!capture.overflow) StreamSniff.noteInit(capture.bytes());
            } else if (kind == StreamSniff.PLAYLIST) {
                byte[] t = capture.bytes();
                StreamSniff.noteList(t, t.length);
            }
        }
        capture = null;
        kind = StreamSniff.IGNORE;
        headLen = 0;
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
            try {
                finishSniff();
            } catch (RuntimeException ignored) {
                // tanıma oynatmayı etkilemez
            }
            StreamRecorder.release(this);
        } finally {
            tapping = false;
            upstream.close();
        }
    }

    private static boolean isHttp(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        return scheme != null && (scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"));
    }

    // Yalnız ağdan gelen ve liste (m3u8) olmayan istekler kayda alınır.
    static boolean isMedia(Uri uri, Map<String, List<String>> headers) {
        if (!isHttp(uri)) return false;
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
