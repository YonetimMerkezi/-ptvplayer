// Gece modu sıkıştırıcısı (NightCompressor.java) Android'e bağlı olmadığından gerçekten derlenip çalıştırılır (javac/java yoksa atlanır).
// Korunan davranış: boyut/kuyruk bozulmaz, sessizlik sessiz kalır, ani yüksek seste çıkış tavanı aşılmaz (cızırtı yok),
// sürekli seste kazanç eşik/oran/telafi hesabına uyar, gürültü tabanı tam telafi almaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KAYNAK = fileURLToPath(new URL('../android/app/src/main/java/com/koruk/iptv/NightCompressor.java', import.meta.url));

const HARNESS = `package com.koruk.iptv;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

public class NightHarness {
    static final int FS = 48000;

    static ByteBuffer buf(int bytes) { return ByteBuffer.allocateDirect(bytes).order(ByteOrder.nativeOrder()); }

    static short[] run(String level, double[] x, int ch) {
        NightCompressor c = new NightCompressor(level, FS, ch);
        ByteBuffer in = buf(x.length * 2);
        for (double v : x) in.putShort((short) Math.round(v * 32767.0));
        in.flip();
        ByteBuffer out = buf(x.length * 2);
        c.process(in, out);
        out.flip();
        short[] y = new short[x.length];
        for (int i = 0; i < y.length; i++) y[i] = out.getShort();
        return y;
    }

    static double[] sine(double hz, double db, int frames) {
        double amp = Math.pow(10, db / 20.0);
        double[] x = new double[frames];
        for (int i = 0; i < frames; i++) x[i] = amp * Math.sin(2 * Math.PI * hz * i / FS);
        return x;
    }

    // son saniyede tepe kazancı (dB)
    static double steadyGainDb(String level, double hz, double db) {
        double[] x = sine(hz, db, FS * 3);
        short[] y = run(level, x, 1);
        double pk = 0;
        for (int i = FS * 2; i < y.length; i++) pk = Math.max(pk, Math.abs(y[i] / 32768.0));
        return 20 * Math.log10(pk / Math.pow(10, db / 20.0));
    }

    public static void main(String[] a) {
        StringBuilder o = new StringBuilder();
        // 1) boyut ve kuyruk: 1, 2 ve 6 kanal; tam çerçeve olmayan bayt sayıları
        boolean sizes = true;
        for (int ch : new int[] {1, 2, 6}) for (String lvl : new String[] {"light", "medium", "strong"}) {
            NightCompressor c = new NightCompressor(lvl, FS, ch);
            for (int size : new int[] {0, 1, 3, 4, 5, 7, 255, 257, 1000, 4097, 16384}) {
                ByteBuffer in = buf(size);
                java.util.Random r = new java.util.Random(size);
                for (int i = 0; i + 1 < size; i += 2) in.putShort((short) (8000 * r.nextGaussian()));
                while (in.hasRemaining()) in.put((byte) 0x7f);
                in.flip();
                byte[] before = new byte[size];
                in.duplicate().get(before);
                ByteBuffer out = buf(size);
                c.process(in, out);
                out.flip();
                if (out.remaining() != size || in.hasRemaining()) sizes = false;
                int tail = size % (ch * 2);
                for (int t = 0; t < tail; t++) if (out.get(size - tail + t) != before[size - tail + t]) sizes = false;
            }
        }
        o.append("sizes=").append(sizes).append('\\n');
        // 2) sessizlik sessiz
        short[] z = run("strong", new double[FS], 1);
        boolean silent = true;
        for (short v : z) if (v != 0) silent = false;
        o.append("silent=").append(silent).append('\\n');
        // 3) ani yüksek ses: -40 dBFS konuşmadan sonra -6 dBFS patlama; çıkış tavanı (0,9) aşmamalı
        for (String lvl : new String[] {"light", "medium", "strong"}) {
            double[] x = new double[FS * 2];
            for (int i = 0; i < x.length; i++) x[i] = Math.pow(10, (i < FS ? -40.0 : -6.0) / 20) * Math.sin(2 * Math.PI * 200 * i / FS);
            short[] y = run(lvl, x, 1);
            int mx = 0;
            for (short v : y) mx = Math.max(mx, Math.abs((int) v));
            o.append("burstMax.").append(lvl).append('=').append(mx).append('\\n');
        }
        // 4) tam ölçek kare dalga (stereo)
        double[] sq = new double[FS * 2];
        for (int i = 0; i < FS; i++) { double v = i % 100 < 50 ? 0.9999 : -1.0; sq[2 * i] = v; sq[2 * i + 1] = v; }
        short[] ys = run("strong", sq, 2);
        int smx = 0;
        for (short v : ys) smx = Math.max(smx, Math.abs((int) v));
        o.append("squareMax=").append(smx).append('\\n');
        // 5) sürekli ses: -24 dBFS, orta düzey → -4 dB sıkıştırma + 8 dB telafi ≈ +4 dB; bas seste de (60 Hz) kazanç oynamaz
        o.append("gain.medium.200=").append(steadyGainDb("medium", 200, -24)).append('\\n');
        o.append("gain.medium.60=").append(steadyGainDb("medium", 60, -24)).append('\\n');
        // 6) gürültü tabanı (-60 dBFS): telafinin yarısından azı
        o.append("gain.medium.floor=").append(steadyGainDb("medium", 300, -60)).append('\\n');
        // 7) parçalı işleme bütünle aynı (parça sınırı blok sınırına denk geliyor)
        double[] x = sine(180, -30, FS);
        ByteBuffer whole = buf(x.length * 2);
        for (double v : x) whole.putShort((short) Math.round(v * 32767.0));
        whole.flip();
        ByteBuffer o1 = buf(whole.capacity());
        new NightCompressor("medium", FS, 1).process(whole.duplicate().order(ByteOrder.nativeOrder()), o1);
        o1.flip();
        ByteBuffer o2 = buf(whole.capacity());
        NightCompressor cc = new NightCompressor("medium", FS, 1);
        for (int p = 0; p < whole.capacity(); p += 2048) {
            ByteBuffer part = whole.duplicate().order(ByteOrder.nativeOrder());
            part.limit(Math.min(whole.capacity(), p + 2048)).position(p);
            ByteBuffer po = buf(2048);
            cc.process(part, po);
            po.flip();
            o2.put(po);
        }
        o2.flip();
        int diff = 0;
        while (o1.hasRemaining()) diff = Math.max(diff, Math.abs(o1.getShort() - o2.getShort()));
        o.append("chunkDiff=").append(diff).append('\\n');
        System.out.print(o);
    }
}
`;

function javaVar() {
  const r = spawnSync('javac', ['-version'], { encoding: 'utf8' });
  return !r.error && r.status === 0;
}

test('NightCompressor derlenip çalışır: boyut/kuyruk, sessizlik, tavan, kazanç ve gürültü tabanı', { skip: !javaVar() && 'javac yok' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'night-'));
  try {
    const pkg = join(dir, 'src', 'com', 'koruk', 'iptv');
    mkdirSync(pkg, { recursive: true });
    copyFileSync(KAYNAK, join(pkg, 'NightCompressor.java'));
    writeFileSync(join(pkg, 'NightHarness.java'), HARNESS);
    const out = join(dir, 'out');
    const c = spawnSync('javac', ['-encoding', 'UTF-8', '-d', out, join(pkg, 'NightCompressor.java'), join(pkg, 'NightHarness.java')], { encoding: 'utf8', timeout: 120000 });
    assert.equal(c.status, 0, 'derleme: ' + c.stderr);
    const r = spawnSync('java', ['-cp', out, 'com.koruk.iptv.NightHarness'], { encoding: 'utf8', timeout: 120000 });
    assert.equal(r.status, 0, 'çalıştırma: ' + r.stderr);
    const v = Object.fromEntries(r.stdout.trim().split('\n').map((l) => l.split('=')));
    assert.equal(v.sizes, 'true', 'çıkış boyutu girişle aynı, tam çerçeve olmayan kuyruk olduğu gibi geçer');
    assert.equal(v.silent, 'true', 'sessizlik sessiz kalır');
    const tavan = 0.9 * 32768 + 2;
    for (const l of ['light', 'medium', 'strong']) assert.ok(Number(v['burstMax.' + l]) <= tavan, `ani patlamada (${l}) çıkış tavanı aşılmaz: ${v['burstMax.' + l]}`);
    assert.ok(Number(v.squareMax) <= tavan, 'tam ölçek kare dalga tavanı aşmaz: ' + v.squareMax);
    for (const k of ['gain.medium.200', 'gain.medium.60']) assert.ok(Math.abs(Number(v[k]) - 4) < 0.4, `${k}: orta düzeyde -24 dBFS için ≈ +4 dB bekleniyor, ${v[k]}`);
    const taban = Number(v['gain.medium.floor']);
    assert.ok(taban > 1.5 && taban < 4, 'gürültü tabanı (-60 dBFS) 8 dB telafinin yarısından azını alır: ' + taban);
    assert.ok(Number(v.chunkDiff) <= 1, 'parçalı işleme bütünle aynı: ' + v.chunkDiff);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
