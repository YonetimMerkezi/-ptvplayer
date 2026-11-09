package com.koruk.iptv;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.audio.BaseAudioProcessor;

import java.nio.ByteBuffer;

/**
 * Gece modu ses işlemcisi (PCM 16 bit). Düzey her akış başında ve sarmada (flush) yeniden okunur; oynarken değişince
 * bir sarma ile anında uygulanır. "off" iken ses olduğu gibi geçer. Hesap NightCompressor'dadır.
 */
final class NightAudioProcessor extends BaseAudioProcessor {
    private volatile String level;
    private NightCompressor core = null;
    private int sampleRate = 0;
    private int channels = 0;

    NightAudioProcessor(String level) {
        this.level = level == null ? "off" : level;
    }

    void setLevel(String level) {
        this.level = level == null ? "off" : level;
    }

    @Override
    protected AudioProcessor.AudioFormat onConfigure(AudioProcessor.AudioFormat input) {
        if (input.encoding != C.ENCODING_PCM_16BIT) return AudioProcessor.AudioFormat.NOT_SET;
        sampleRate = input.sampleRate;
        channels = input.channelCount;
        return input;
    }

    @Override
    protected void onFlush() {
        String l = level;
        core = NightCompressor.isActive(l) ? new NightCompressor(l, sampleRate, channels) : null;
    }

    @Override
    public void queueInput(ByteBuffer input) {
        int size = input.remaining();
        if (size == 0) return;
        ByteBuffer out = replaceOutputBuffer(size);
        if (core == null) out.put(input);
        else core.process(input, out);
        out.flip();
    }
}
