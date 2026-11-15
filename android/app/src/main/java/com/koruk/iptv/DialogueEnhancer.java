package com.koruk.iptv;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Diyalog vurgulama: konuşma bandını (≈2,8 kHz çevresi) yükseltir, konuşmanın bulunduğu orta (mid) kanalı öne çıkarır,
 * yan (side) bileşeni ve fon kanallarını bastırır. PCM 16 bit, kanallar serpiştirilmiş.
 * Stereo: mid/side ayrımı. 3+ kanal (Android sırası: ön sol, ön sağ, orta, ...): orta kanal öne çıkar, diğerleri kısılır.
 * Android'e ve Media3'e bağlı değildir; DialogueAudioProcessor bunu kullanır.
 */
final class DialogueEnhancer {
    private static final double PRESENCE_HZ = 2800.0;
    private static final double PRESENCE_DB = 5.0;
    private static final double PRESENCE_Q = 0.9;
    private static final double MID_GAIN = 1.1;
    private static final double SIDE_GAIN = 0.65;
    private static final double CENTER_GAIN = 1.8;
    private static final double OTHER_GAIN = 0.8;

    private final int channels;
    private final double b0;
    private final double b1;
    private final double b2;
    private final double a1;
    private final double a2;
    private double x1;
    private double x2;
    private double y1;
    private double y2;

    DialogueEnhancer(int sampleRate, int channels) {
        this.channels = Math.max(1, channels);
        double fs = Math.max(8000, sampleRate);
        double a = Math.pow(10.0, PRESENCE_DB / 40.0);
        double w0 = 2.0 * Math.PI * Math.min(PRESENCE_HZ, fs * 0.45) / fs;
        double alpha = Math.sin(w0) / (2.0 * PRESENCE_Q);
        double cos = Math.cos(w0);
        double a0 = 1.0 + alpha / a;
        b0 = (1.0 + alpha * a) / a0;
        b1 = (-2.0 * cos) / a0;
        b2 = (1.0 - alpha * a) / a0;
        a1 = (-2.0 * cos) / a0;
        a2 = (1.0 - alpha / a) / a0;
    }

    void reset() {
        x1 = 0;
        x2 = 0;
        y1 = 0;
        y2 = 0;
    }

    private double presence(double x) {
        double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        return y;
    }

    private static short clip(double v) {
        if (v > 32767.0) return 32767;
        if (v < -32768.0) return -32768;
        return (short) Math.round(v);
    }

    /** input'taki tam kareleri işleyip out'a yazar; yarım kare kalırsa olduğu gibi geçirir. */
    void process(ByteBuffer input, ByteBuffer out) {
        ByteBuffer in = input.order(ByteOrder.LITTLE_ENDIAN);
        ByteBuffer o = out.order(ByteOrder.LITTLE_ENDIAN);
        int frames = in.remaining() / (2 * channels);
        double[] s = new double[channels];
        for (int f = 0; f < frames; f++) {
            for (int c = 0; c < channels; c++) s[c] = in.getShort();
            if (channels == 1) {
                s[0] = presence(s[0]);
            } else if (channels == 2) {
                double mid = presence((s[0] + s[1]) * 0.5) * MID_GAIN;
                double side = (s[0] - s[1]) * 0.5 * SIDE_GAIN;
                s[0] = mid + side;
                s[1] = mid - side;
            } else {
                for (int c = 0; c < channels; c++) {
                    if (c == 2) s[c] = presence(s[c]) * CENTER_GAIN;
                    else s[c] *= OTHER_GAIN;
                }
            }
            for (int c = 0; c < channels; c++) o.putShort(clip(s[c]));
        }
        while (in.hasRemaining()) o.put(in.get());
    }
}
