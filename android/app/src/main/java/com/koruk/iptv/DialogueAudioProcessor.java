package com.koruk.iptv;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.audio.BaseAudioProcessor;

import java.nio.ByteBuffer;

/**
 * Diyalog vurgulama ses işlemcisi (PCM 16 bit). Durum her akış başında ve sarmada (flush) yeniden okunur; oynarken değişince
 * bir sarma ile anında uygulanır. Kapalıyken ses olduğu gibi geçer. Hesap DialogueEnhancer'dadır.
 */
final class DialogueAudioProcessor extends BaseAudioProcessor {
    private volatile boolean on;
    private DialogueEnhancer core = null;
    private int sampleRate = 0;
    private int channels = 0;

    DialogueAudioProcessor(boolean on) {
        this.on = on;
    }

    void setOn(boolean on) {
        this.on = on;
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
        core = on ? new DialogueEnhancer(sampleRate, channels) : null;
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
