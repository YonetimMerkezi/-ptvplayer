package com.koruk.iptv;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Gece modu: dinamik aralık sıkıştırma (PCM 16 bit, kanallar serpiştirilmiş). Eşik üstündeki yüksek sesleri bastırır,
 * eşik altındaki sessiz konuşmayı telafi kazancıyla yükseltir; çok sessiz kısımlar (gürültü tabanı) yükseltilmez.
 * Kanallar birlikte işlenir (stereo görüntü bozulmaz). Android'e ve Media3'e bağlı değildir; NightAudioProcessor bunu kullanır.
 * Düzey adları www/js/night.js ile aynıdır: light | medium | strong (off = işlemez).
 *
 * Hesap BLOK başınadır (64 çerçeve ≈ 1,3 ms): blokun tepe değeri doğrusal zarfı sürer, kazanç blok başına bir kez hesaplanır ve
 * blok içinde doğrusal geçirilir. Eskiden her çerçevede log10 + pow çalışıyordu; TV kutularının zayıf çekirdeklerinde ses hattı
 * (oynatma iş parçacığı) bu yüzden gereksiz yük taşıyordu. Blokun kendi tepesi önceden bilindiğinden çıkış 0,9'u aşmaz:
 * ani yüksek seste telafi kazancı yüzünden kırpılıp cızırdama olmaz (ek gecikme yok).
 */
final class NightCompressor {
    private static final double GATE_LO = -66.0; // dBFS: altında telafi kazancı yok (AAC gürültü tabanı ≈ -60…-50 dBFS yükselmesin)
    private static final double GATE_HI = -50.0; // dBFS: üstünde tam telafi
    private static final double ATTACK_S = 0.002;
    private static final double RELEASE_S = 0.300;
    private static final int BLOCK = 64;
    private static final double CEIL = 0.9; // blok tepesi bu tam ölçek oranını aşmaz
    private static final double LIMIT = CEIL * 32768.0 + 1.0; // bunun üstü (yuvarlama payı dışında) olmaması gerekir; olursa yumuşak tavan

    private final double thresholdDb;
    private final double ratio;
    private final double makeupDb;
    private final double attack; // blok başına zarf katsayıları
    private final double release;
    private final int channels;
    private double env = 0.0; // doğrusal zarf (tam ölçek = 1)
    private double gain = 1.0; // son blokta uygulanan doğrusal kazanç
    private short[] buf = new short[0];

    NightCompressor(String level, int sampleRate, int channels) {
        double t;
        double r;
        double m;
        if ("strong".equals(level)) {
            t = -34;
            r = 4;
            m = 12;
        } else if ("medium".equals(level)) {
            t = -30;
            r = 3;
            m = 8;
        } else {
            t = -26;
            r = 2;
            m = 4;
        }
        thresholdDb = t;
        ratio = r;
        makeupDb = m;
        this.channels = Math.max(1, channels);
        double fs = Math.max(8000, sampleRate);
        attack = 1.0 - Math.exp(-BLOCK / (ATTACK_S * fs));
        release = Math.exp(-BLOCK / (RELEASE_S * fs));
    }

    static boolean isActive(String level) {
        return "light".equals(level) || "medium".equals(level) || "strong".equals(level);
    }

    void reset() {
        env = 0.0;
        gain = 1.0;
    }

    /** Anlık seviyeye (dBFS, yumuşatılmış) karşılık gelen kazanç (dB). */
    double gainDb(double levelDb) {
        double over = levelDb - thresholdDb;
        double g = over > 0 ? -over * (1.0 - 1.0 / ratio) : 0.0;
        double q = Math.max(0.0, Math.min(1.0, (levelDb - GATE_LO) / (GATE_HI - GATE_LO)));
        return g + makeupDb * q;
    }

    /** in'deki tüm tam çerçeveleri işleyip out'a yazar (aynı bayt sayısı). Baytlar yerel bayt sırasında olmalıdır. */
    void process(ByteBuffer in, ByteBuffer out) {
        ByteOrder inOrder = in.order();
        ByteOrder outOrder = out.order();
        in.order(ByteOrder.nativeOrder());
        out.order(ByteOrder.nativeOrder());
        int frameBytes = channels * 2;
        int frames = in.remaining() / frameBytes;
        int n = frames * channels;
        int base = in.position();
        if (n > 0) {
            if (buf.length < n) buf = new short[n];
            in.asShortBuffer().get(buf, 0, n);
            double g = gain;
            for (int f = 0; f < frames; f += BLOCK) {
                int len = Math.min(BLOCK, frames - f);
                int from = f * channels;
                int to = (f + len) * channels;
                int pk = 0;
                for (int i = from; i < to; i++) {
                    int a = buf[i];
                    if (a < 0) a = -a;
                    if (a > pk) pk = a;
                }
                double peak = pk / 32768.0;
                env = peak > env ? env + attack * (peak - env) : peak + (env - peak) * release;
                double target = Math.pow(10.0, gainDb(20.0 * Math.log10(Math.max(env, 1e-5))) / 20.0);
                double start = g;
                if (peak > 0.0) {
                    double max = CEIL / peak;
                    if (target > max) target = max;
                    if (start > max) start = max;
                }
                double step = (target - start) / len;
                g = start;
                int i = from;
                for (int k = 0; k < len; k++) {
                    g += step;
                    for (int c = 0; c < channels; c++, i++) {
                        double v = buf[i] * g;
                        buf[i] = v > LIMIT || v < -LIMIT ? softClip(v / 32768.0) : (short) Math.rint(v);
                    }
                }
                g = target;
            }
            gain = g;
            out.asShortBuffer().put(buf, 0, n);
            out.position(out.position() + frames * frameBytes);
        }
        // artan baytlar (tam çerçeve olmayan kuyruk) olduğu gibi geçer
        int tail = in.remaining() - frames * frameBytes;
        in.position(base + frames * frameBytes);
        for (int i = 0; i < tail; i++) out.put(in.get());
        in.order(inOrder);
        out.order(outOrder);
    }

    /** 0,9'a kadar doğrusal; üstü yumuşak tavan (blok tepe sınırı zaten aşılmasını önler; yine de kırpma sesi olmasın). */
    static short softClip(double x) {
        double a = Math.abs(x);
        double y = a <= 0.9 ? a : 0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1);
        double v = Math.signum(x) * y * 32767.0;
        return (short) Math.max(-32768, Math.min(32767, Math.round(v)));
    }
}
