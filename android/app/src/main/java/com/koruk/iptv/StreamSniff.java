package com.koruk.iptv;

import java.io.ByteArrayOutputStream;
import java.util.Locale;

/**
 * Oynatıcının okuduğu isteklerin ilk baytlarına bakıp yayın biçimini tanır (TapDataSource besler).
 * Amaç: kayıt başlamadan "bu yayın kaydedilebilir mi" sorusunu yanıtlamak ve boş kalan kayıtta nedenini söylemek.
 *  - TS: art arda üç paketin 0x47 ile başladığı akış (HLS parçası ya da doğrudan .ts).
 *  - fMP4 (HLS-CMAF): parça istekleri styp/moof/sidx ile başlar; başlangıç bölümü (ftyp+moov) ayrıca saklanır ve kayda en başa yazılır.
 *  - MKV, FLV, uzun MP4 akışı ve tanınmayan/şifreli veri kaydedilemez.
 * Oynatma listelerinden (m3u8) yalnız şifreli olup olmadığı ve fMP4 kullanıp kullanmadığı okunur.
 */
final class StreamSniff {
    static final int HEAD = 3 * 188 + 1;
    static final int UNDECIDED = 0;
    static final int TS = 1;
    static final int MP4_INIT = 2;
    static final int MP4_FRAG = 3;
    static final int MP4_PROG = 4; // uzun (aralıksız) MP4 akışı: başlangıç bölümünden sonra da sürüyor
    static final int MKV = 5;
    static final int FLV = 6;
    static final int AUDIO = 7;
    static final int PLAYLIST = 8;
    static final int OTHER = 9;
    static final int IGNORE = 10; // anahtar dosyası gibi küçük/anlamsız istek

    static final int INIT_CAP = 1024 * 1024;
    static final int LIST_CAP = 32 * 1024;

    /** Kayıt kararı: error doluysa kayıt başlatılmaz; mp4 doluysa fMP4 kaydı (init en başa yazılır); ikisi de boşsa TS. */
    static final class Verdict {
        byte[] init;
        String error;
    }

    private static final Object LOCK = new Object();
    private static int lastMedia;
    private static byte[] init;
    private static boolean encrypted;
    private static boolean fmp4List;
    private static String lastSig = "";

    private StreamSniff() {}

    /** Yeni yayına geçilirken önceki yayının izleri silinir. */
    static void reset() {
        synchronized (LOCK) {
            lastMedia = UNDECIDED;
            init = null;
            encrypted = false;
            fmp4List = false;
            lastSig = "";
        }
    }

    // ------------------------------------------------------------------ tanıma

    private static boolean fourcc(byte[] b, int at, String s) {
        return (b[at] & 0xFF) == s.charAt(0) && (b[at + 1] & 0xFF) == s.charAt(1) && (b[at + 2] & 0xFF) == s.charAt(2) && (b[at + 3] & 0xFF) == s.charAt(3);
    }

    private static boolean looksLikeAudio(byte[] b, int len) {
        if (len >= 3 && b[0] == 'I' && b[1] == 'D' && b[2] == '3') return true;
        return len >= 2 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xF0) == 0xF0; // ADTS / MP3 çerçevesi
    }

    /**
     * İstek başlığından tür. last=false iken karar için veri yetmiyorsa UNDECIDED döner (TS için üç paket gerekir);
     * last=true (istek bitti) iken eldeki veriyle kesin karar verilir.
     */
    static int classify(byte[] b, int len, boolean last) {
        int off = 0;
        if (len >= 10 && (b[0] & 0xFF) == 0xEF && (b[1] & 0xFF) == 0xBB && (b[2] & 0xFF) == 0xBF) off = 3; // UTF-8 BOM
        if (len - off >= 7 && b[off] == '#' && b[off + 1] == 'E' && b[off + 2] == 'X' && b[off + 3] == 'T' && b[off + 4] == 'M' && b[off + 5] == '3' && b[off + 6] == 'U') return PLAYLIST;
        if (len >= 8) {
            if (fourcc(b, 4, "ftyp") || fourcc(b, 4, "moov")) return MP4_INIT;
            if (fourcc(b, 4, "styp") || fourcc(b, 4, "moof") || fourcc(b, 4, "sidx")) return MP4_FRAG;
        }
        if (len >= 4 && (b[0] & 0xFF) == 0x1A && (b[1] & 0xFF) == 0x45 && (b[2] & 0xFF) == 0xDF && (b[3] & 0xFF) == 0xA3) return MKV;
        if (len >= 3 && b[0] == 'F' && b[1] == 'L' && b[2] == 'V') return FLV;
        if (len >= HEAD) {
            if (StreamRecorder.findSync(b, 0, len) >= 0) return TS;
            return looksLikeAudio(b, len) ? AUDIO : OTHER;
        }
        if (!last) return UNDECIDED;
        if (looksLikeAudio(b, len)) return AUDIO;
        return len >= 256 ? OTHER : IGNORE;
    }

    static String hex(byte[] b, int len) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < Math.min(len, 8); i++) {
            if (i > 0) sb.append(' ');
            sb.append(String.format(Locale.ROOT, "%02X", b[i] & 0xFF));
        }
        return sb.toString();
    }

    // ------------------------------------------------------------------ durum

    /** Bir medya isteğinin türü belli oldu (liste ve başlangıç bölümü hariç). */
    static void noteMedia(int kind, byte[] head, int len) {
        if (kind == AUDIO || kind == IGNORE || kind == PLAYLIST || kind == UNDECIDED || kind == MP4_INIT) return;
        synchronized (LOCK) {
            lastMedia = kind;
            lastSig = hex(head, len);
        }
    }

    /** Başlangıç bölümü (ftyp+moov) tam okundu. */
    static void noteInit(byte[] bytes) {
        synchronized (LOCK) {
            init = bytes;
        }
    }

    /** Başlangıç bölümü sınırı aştı: istek bir başlangıç bölümü değil, uzun akış. */
    static void noteProgressiveMp4(byte[] head, int len) {
        synchronized (LOCK) {
            lastMedia = MP4_PROG;
            lastSig = hex(head, len);
        }
    }

    /** Oynatma listesi okundu: şifreleme ve fMP4 işaretleri aranır. */
    static void noteList(byte[] text, int len) {
        String s = new String(text, 0, len, java.nio.charset.StandardCharsets.ISO_8859_1);
        boolean enc = false;
        int at = 0;
        while ((at = s.indexOf("#EXT-X-KEY", at)) >= 0) {
            int end = s.indexOf('\n', at);
            String line = s.substring(at, end < 0 ? s.length() : end).toUpperCase(Locale.ROOT);
            if (line.contains("METHOD=") && !line.contains("METHOD=NONE")) enc = true;
            at += 10;
        }
        boolean map = s.contains("#EXT-X-MAP");
        synchronized (LOCK) {
            if (enc) encrypted = true;
            if (map) fmp4List = true;
        }
    }

    // ------------------------------------------------------------------ karar

    static Verdict verdict() {
        Verdict v = new Verdict();
        synchronized (LOCK) {
            switch (lastMedia) {
                case TS:
                case UNDECIDED:
                    if (lastMedia == UNDECIDED && encrypted) v.error = "Bu yayın şifreli (HLS) olduğundan kaydedilemiyor";
                    return v; // henüz bir şey okunmadıysa denenir; veri gelmezse kayıt kendiliğinden biter
                case MP4_FRAG:
                    if (init != null && init.length > 0) v.init = init;
                    else v.error = "Bu fMP4 yayının başlangıç bölümü alınamadı; kanalı yeniden açıp tekrar deneyin";
                    return v;
                case MKV:
                    v.error = "Bu yayın MKV biçiminde; canlı kayıt yalnız MPEG-TS ve fMP4 (HLS) yayınlarda çalışır";
                    return v;
                case FLV:
                    v.error = "Bu yayın FLV biçiminde; canlı kayıt yalnız MPEG-TS ve fMP4 (HLS) yayınlarda çalışır";
                    return v;
                case MP4_PROG:
                    v.error = "Bu yayın aralıksız bir MP4 akışı; canlı kayıt yalnız MPEG-TS ve fMP4 (HLS) yayınlarda çalışır";
                    return v;
                default:
                    v.error = encrypted
                        ? "Bu yayın şifreli (HLS) olduğundan kaydedilemiyor"
                        : "Bu yayının biçimi tanınmadı (başlık: " + lastSig + "), kaydedilemiyor";
                    return v;
            }
        }
    }

    /** Kayıt boş kalınca kullanıcıya gösterilecek kısa neden. */
    static String describe() {
        synchronized (LOCK) {
            switch (lastMedia) {
                case TS:
                    return "yayın MPEG-TS ama kayıt süresince yeni veri alınmadı";
                case UNDECIDED:
                    return encrypted ? "yayın şifreli (HLS)" : "yayından veri alınamadı";
                case MP4_FRAG:
                    return "fMP4 yayın, parça alınamadı";
                case MKV:
                    return "yayın MKV biçiminde";
                case FLV:
                    return "yayın FLV biçiminde";
                case MP4_PROG:
                    return "yayın aralıksız MP4 akışı";
                default:
                    return encrypted ? "yayın şifreli (HLS)" : "yayın biçimi tanınmadı (başlık: " + lastSig + ")";
            }
        }
    }

    /** Sınırlı büyüklükte biriktirici (başlangıç bölümü ve liste metni için). */
    static final class Capture {
        private final ByteArrayOutputStream buf = new ByteArrayOutputStream();
        private final int cap;
        boolean overflow;

        Capture(int cap) {
            this.cap = cap;
        }

        void add(byte[] b, int off, int n) {
            if (overflow) return;
            int room = cap - buf.size();
            if (n > room) {
                if (room > 0) buf.write(b, off, room); // liste için baştaki kısım yeter; başlangıç bölümü için overflow tümünü geçersiz kılar
                overflow = true;
                return;
            }
            buf.write(b, off, n);
        }

        byte[] bytes() {
            return buf.toByteArray();
        }
    }
}
