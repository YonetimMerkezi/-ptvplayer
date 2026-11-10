package com.koruk.iptv;

import android.net.Uri;

import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.TransferListener;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Oynatıcının okuduğu baytları, kayıt açıkken StreamRecorder'a da verir (liste/anahtar dosyaları hariç).
 * Kayıt olsun olmasın her isteğin ilk baytlarına bakıp yayın biçimini StreamSniff'e bildirir (kayıt başlamadan "kaydedilebilir mi" denetlenir).
 * HLS AES-128 şifreli parçalar (liste ve anahtar StreamSniff'te bilinirse) kayıt/tanıma için çözülür; oynatıcıya giden veri değişmez,
 * oynatıcı şifreyi kendi çözer.
 * Oynatmayı hiçbir koşulda bozmaz: kayıt, tanıma ve çözme tarafındaki hata yutulur.
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
    // anahtar isteği: 16 baytı saklanır
    private String keyUri;
    private StreamSniff.Capture keyCapture;
    // AES-128 çözme: cipher doluysa deliver() çözülmüş baytları alır
    private Cipher cipher;
    private final byte[] tail = new byte[16]; // çözülmüş son blok (sonda dolgu ayıklanır)
    private int tailLen;
    private String desc = ""; // isteğin kısa tanımı (tanılama)
    private long declared; // açılışta bildirilen uzunluk (-1: bilinmiyor)
    private long total; // bu istekte okunan bayt
    private boolean eof; // istek sonuna kadar okundu

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
        keyUri = null;
        keyCapture = null;
        cipher = null;
        tailLen = 0;
        declared = n;
        desc = describe(dataSpec.uri, n, dataSpec.position);
        total = 0;
        eof = false;
        try {
            String u = dataSpec.uri == null ? null : dataSpec.uri.toString();
            if (u != null) {
                if (StreamSniff.isKeyUri(u)) {
                    keyUri = u;
                    keyCapture = new StreamSniff.Capture(64);
                } else if (dataSpec.position == 0) {
                    StreamSniff.Crypto c = StreamSniff.cryptoFor(u);
                    if (c != null) {
                        Cipher ci = Cipher.getInstance("AES/CBC/NoPadding");
                        ci.init(Cipher.DECRYPT_MODE, new SecretKeySpec(c.key, "AES"), new IvParameterSpec(c.iv));
                        cipher = ci;
                    }
                }
            }
        } catch (Exception | LinkageError e) {
            cipher = null; // çözme kurulamadı: veri şifreli haliyle incelenir
        }
        return n;
    }

    @Override
    public int read(byte[] buffer, int offset, int length) throws IOException {
        int n = upstream.read(buffer, offset, length);
        if (n < 0) eof = true; // RESULT_END_OF_INPUT
        else total += n;
        try {
            if (n > 0) {
                if (keyCapture != null) keyCapture.add(buffer, offset, n);
                if (cipher != null) decryptChunk(buffer, offset, n);
                else deliver(buffer, offset, n);
            }
        } catch (RuntimeException e) {
            // kayıt/tanıma/çözme oynatmayı etkilemez
            StreamSniff.noteError(e);
            cipher = null;
            tapping = false;
        }
        return n;
    }

    // Şifreli parçanın bir bölümünü çözüp (son blok dolgu için bekletilir) deliver()'a verir.
    private void decryptChunk(byte[] b, int off, int n) {
        byte[] dec = cipher.update(b, off, n);
        if (dec == null || dec.length == 0) return;
        byte[] all = new byte[tailLen + dec.length];
        System.arraycopy(tail, 0, all, 0, tailLen);
        System.arraycopy(dec, 0, all, tailLen, dec.length);
        int keep = Math.min(16, all.length);
        int emit = all.length - keep;
        System.arraycopy(all, emit, tail, 0, keep);
        tailLen = keep;
        if (emit > 0) deliver(all, 0, emit);
    }

    // Parça sonuna kadar okunduysa bekleyen son blok, PKCS7 dolgusu ayıklanarak verilir; yarıda kesilen istekte atılır
    // (ortadaki bir bloğun son baytı dolgu sayılıp veri kırpılmasın).
    private void finishCrypto() {
        boolean complete = eof || (declared >= 0 && total >= declared);
        if (cipher != null && complete && total % 16 == 0 && tailLen == 16) {
            int pad = tail[15] & 0xFF;
            int real = pad >= 1 && pad <= 16 ? 16 - pad : 16;
            if (real > 0) deliver(tail, 0, real);
        }
        cipher = null;
        tailLen = 0;
    }

    // Tanıma + (kayıt açıksa) kayda yazma; veri çözülmüşse çözülmüş baytlar gelir.
    private void deliver(byte[] b, int off, int n) {
        boolean wasFirst = first;
        first = false;
        sniff(b, off, n);
        // Adres/başlık "liste" gibi görünse de içerik TS ya da fMP4 parçasıysa istek kayda alınır (yanlış ad/Content-Type'a güvenilmez).
        if (!tapping && wasFirst && (kind == StreamSniff.TS || kind == StreamSniff.MP4_FRAG) && isHttp(upstream.getUri())) tapping = true;
        if (tapping && StreamRecorder.active()) {
            try {
                if (!StreamRecorder.write(this, b, off, n, wasFirst)) tapping = false;
            } catch (RuntimeException ignored) {
                tapping = false;
            }
        }
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
            StreamSniff.noteMedia(k, head, headLen, desc);
        }
    }

    // İstek bitti: kısa kalan istekler eldeki baytlarla sınıflanır, biriken başlangıç bölümü/liste/anahtar bildirilir.
    private void finishSniff() {
        if (kind == StreamSniff.UNDECIDED && headLen > 0) decide(StreamSniff.classify(head, headLen, true));
        if (capture != null) {
            if (kind == StreamSniff.MP4_INIT) {
                if (!capture.overflow) StreamSniff.noteInit(capture.bytes());
            } else if (kind == StreamSniff.PLAYLIST) {
                byte[] t = capture.bytes();
                Uri last = upstream.getUri();
                StreamSniff.noteList(t, t.length, last == null ? null : last.toString());
            }
        }
        if (keyCapture != null && keyUri != null) StreamSniff.noteKey(keyUri, keyCapture.bytes());
        capture = null;
        keyCapture = null;
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
                finishCrypto(); // yalnız tüm parça okunduysa anlamlı; yarım kalan istekte kalan blok yazılmaz
                finishSniff();
            } catch (RuntimeException e) {
                // tanıma oynatmayı etkilemez
                StreamSniff.noteError(e);
            }
            StreamRecorder.release(this);
        } finally {
            tapping = false;
            upstream.close();
        }
    }

    // Tanılama için isteğin kısa tanımı (yalnız dosya adı + sunucunun bildirdiği tür + boyut).
    private String describe(Uri uri, long length, long position) {
        try {
            String type = null;
            Map<String, List<String>> h = upstream.getResponseHeaders();
            if (h != null) {
                for (Map.Entry<String, List<String>> e : h.entrySet()) {
                    if (e.getKey() != null && e.getKey().equalsIgnoreCase("Content-Type") && e.getValue() != null && !e.getValue().isEmpty()) {
                        type = e.getValue().get(0);
                        break;
                    }
                }
            }
            return StreamSniff.describeRequest(uri == null ? null : uri.getPath(), type, length, position);
        } catch (RuntimeException e) {
            return "";
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
