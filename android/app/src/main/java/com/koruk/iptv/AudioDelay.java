package com.koruk.iptv;

import java.nio.ByteBuffer;

/**
 * Ses gecikmesi/öne alma hesabı (PCM 16 bit). Android'e ve Media3'e bağlı değildir; AudioDelayProcessor bunu kullanır.
 * Her akış başında ve her sarmada (flush) yeniden kurulur:
 *  - ms > 0 → ses geç çalsın: çıkışın başına ms kadar sessizlik eklenir (ses saati sessizlik dahil ilerler; içerik geride kalır)
 *  - ms < 0 → ses erken çalsın: girişin ilk |ms| kadarı atılır
 */
final class AudioDelay {
    private int pendingSilence = 0;
    private int pendingSkip = 0;

    /** Yeni akış / sarma: bekleyen sessizlik ya da atlanacak bayt sayısını hesaplar (çerçeve hizalı). */
    void reset(int delayMs, int sampleRate, int bytesPerFrame) {
        long frames = Math.abs((long) delayMs) * sampleRate / 1000L;
        long bytes = frames * bytesPerFrame;
        int b = (int) Math.min(bytes, Integer.MAX_VALUE - 8L);
        pendingSilence = delayMs > 0 ? b : 0;
        pendingSkip = delayMs < 0 ? b : 0;
    }

    /** Atlanacak kısmı girişten düşer (konumu ilerletir) ve çıkış boyutunu döndürür: bekleyen sessizlik + kalan giriş. */
    int prepare(ByteBuffer in) {
        if (pendingSkip > 0) {
            int skip = Math.min(pendingSkip, in.remaining());
            in.position(in.position() + skip);
            pendingSkip -= skip;
        }
        return in.remaining() == 0 ? 0 : pendingSilence + in.remaining();
    }

    /** prepare'dan sonra çağrılır: önce bekleyen sessizliği, sonra kalan girişi yazar (giriş tamamen tüketilir). */
    void write(ByteBuffer in, ByteBuffer out) {
        while (pendingSilence > 0) {
            int n = Math.min(pendingSilence, ZEROS.length);
            out.put(ZEROS, 0, n);
            pendingSilence -= n;
        }
        out.put(in);
    }

    private static final byte[] ZEROS = new byte[8192];
}
