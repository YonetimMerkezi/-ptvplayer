package com.koruk.iptv;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Gece modu: dinamik aralık sıkıştırma (PCM 16 bit, kanallar serpiştirilmiş). Eşik üstündeki yüksek sesleri bastırır,
 * eşik altındaki sessiz konuşmayı telafi kazancıyla yükseltir; çok sessiz kısımlar (gürültü tabanı) yükseltilmez.
 * Kanallar birlikte işlenir (stereo görüntü bozulmaz). Android'e ve Media3'e bağlı değildir; NightAudioProcessor bunu kullanır.
 * Düzey adları www/js/night.js ile aynıdır: light | medium | strong (off = işlemez).
 */
final class NightCompressor {
    private static final double GATE_LO = -70.0; // dBFS: altında telafi kazancı yok
    private static final double GATE_HI = -55.0; // dBFS: üstünde tam telafi
    private static final double ATTACK_S = 0.002;
    private static final double RELEASE_S = 0.300;

    private final double thresholdDb;
    private final double ratio;
    private final double makeupDb;
    private final double attack;
    private final double release;
    private final int channels;
    private double envDb = -90.0;

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
        attack = 1.0 - Math.exp(-1.0 / (ATTACK_S * Math.max(8000, sampleRate)));
        release = 1.0 - Math.exp(-1.0 / (RELEASE_S * Math.max(8000, sampleRate)));
    }

    static boolean isActive(String level) {
        return "light".equals(level) || "medium".equals(level) || "strong".equals(level);
    }

    void reset() {
        envDb = -90.0;
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
        int base = in.position();
        for (int f = 0; f < frames; f++) {
            int p = base + f * frameBytes;
            double peak = 0.0;
            for (int c = 0; c < channels; c++) {
                double a = Math.abs(in.getShort(p + c * 2)) / 32768.0;
                if (a > peak) peak = a;
            }
            double lvl = 20.0 * Math.log10(Math.max(peak, 1e-5));
            envDb += (lvl > envDb ? attack : release) * (lvl - envDb);
            double gain = Math.pow(10.0, gainDb(envDb) / 20.0);
            for (int c = 0; c < channels; c++) {
                double x = in.getShort(p + c * 2) / 32768.0 * gain;
                out.putShort(softClip(x));
            }
        }
        // artan baytlar (tam çerçeve olmayan kuyruk) olduğu gibi geçer
        int tail = in.remaining() - frames * frameBytes;
        in.position(base + frames * frameBytes);
        for (int i = 0; i < tail; i++) out.put(in.get());
        in.order(inOrder);
        out.order(outOrder);
    }

    /** 0,9'a kadar doğrusal; üstü yumuşak tavan (atak anında kırpma sesi olmasın). */
    static short softClip(double x) {
        double a = Math.abs(x);
        double y = a <= 0.9 ? a : 0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1);
        double v = Math.signum(x) * y * 32767.0;
        return (short) Math.max(-32768, Math.min(32767, Math.round(v)));
    }
}
