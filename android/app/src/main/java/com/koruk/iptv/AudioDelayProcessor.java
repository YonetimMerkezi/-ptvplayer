package com.koruk.iptv;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.audio.BaseAudioProcessor;

import java.nio.ByteBuffer;

/**
 * Ses senkronu: sesi görüntüye göre geciktirir (+) ya da öne alır (−). Yalnızca PCM 16 bit sesle çalışır;
 * başka biçimde etkisiz kalır (ses olduğu gibi geçer). Değer her sarmada (flush) yeniden okunur, bu yüzden
 * oynarken değiştirildiğinde bir sarma ile anında uygulanır. Hesap AudioDelay'dedir.
 */
final class AudioDelayProcessor extends BaseAudioProcessor {
    private volatile int delayMs;
    private final AudioDelay core = new AudioDelay();
    private int sampleRate = 0;
    private int bytesPerFrame = 0;

    AudioDelayProcessor(int delayMs) {
        this.delayMs = delayMs;
    }

    void setDelayMs(int ms) {
        delayMs = ms;
    }

    @Override
    protected AudioProcessor.AudioFormat onConfigure(AudioProcessor.AudioFormat input) {
        if (input.encoding != C.ENCODING_PCM_16BIT) return AudioProcessor.AudioFormat.NOT_SET;
        sampleRate = input.sampleRate;
        bytesPerFrame = input.bytesPerFrame;
        return input;
    }

    @Override
    protected void onFlush() {
        core.reset(delayMs, sampleRate, bytesPerFrame);
    }

    @Override
    public void queueInput(ByteBuffer input) {
        if (!input.hasRemaining()) return;
        int size = core.prepare(input);
        if (size == 0) return;
        ByteBuffer out = replaceOutputBuffer(size);
        core.write(input, out);
        out.flip();
    }
}
