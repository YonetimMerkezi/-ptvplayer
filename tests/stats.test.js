import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtBps, fmtBuffer, codecName, bufferLevel, statsRows, targetKind, isSoftwareDecoder } from '../www/js/stats.js';

test('bit hızı: Mb/sn ve kb/sn, geçersizde boş', () => {
  assert.equal(fmtBps(4_500_000), '4,5 Mb/sn');
  assert.equal(fmtBps(12_000_000), '12 Mb/sn');
  assert.equal(fmtBps(640_000), '640 kb/sn');
  assert.equal(fmtBps(0), '');
  assert.equal(fmtBps(undefined), '');
});

test('tampon süresi saniye olarak yazılır', () => {
  assert.equal(fmtBuffer(12400), '12,4 sn');
  assert.equal(fmtBuffer(30), '0 sn');
  assert.equal(fmtBuffer(-1), '');
  assert.equal(fmtBuffer(undefined), '');
});

test('codec adları okunur hale gelir', () => {
  assert.equal(codecName('avc1.64001f'), 'H.264');
  assert.equal(codecName('hvc1.1.6.L93.B0'), 'H.265');
  assert.equal(codecName('', 'video/hevc'), 'H.265');
  assert.equal(codecName('mp4a.40.2'), 'AAC');
  assert.equal(codecName('', 'audio/ac3'), 'AC3');
  assert.equal(codecName('ec-3'), 'E-AC3');
  assert.equal(codecName('', 'video/x-foo'), 'x-foo');
  assert.equal(codecName(''), '');
});

test('tampon düzeyi canlıda 3 sn altı düşük, 10 sn üstü bol', () => {
  assert.equal(bufferLevel(1000), 'low');
  assert.equal(bufferLevel(5000), 'ok');
  assert.equal(bufferLevel(12000), 'good');
  assert.equal(bufferLevel(12000, false), 'ok');
  assert.equal(bufferLevel(undefined), '');
});

test('satırlar: durum, yayın türü, görüntü, bit hızı, bağlantı, tampon, düşen kare', () => {
  const st = { status: 'playing', reconnect: 2, live: true, idx: 1, targets: [{ url: 'http://h.tv:8080/live/u/p/3.m3u8', mime: 'hls' }, { url: 'http://h.tv:8080/live/u/p/3.ts', mime: 'ts' }] };
  const rows = statsRows(st, { width: 1920, height: 1080, fps: 25, videoCodec: 'avc1.640028', videoBps: 4_200_000, audioBps: 128_000, audioCodec: 'mp4a.40.2', bandwidthBps: 18_000_000, bufferMs: 8200, dropped: 12, rendered: 988 });
  const get = (k) => rows.find((r) => r.k === k);
  assert.equal(get('Durum').v, 'Oynuyor · yeniden bağlanma 2');
  assert.equal(get('Yayın').v, 'MPEG-TS · h.tv:8080 · adres 2/2');
  assert.equal(get('Görüntü').v, '1920×1080 · 25 k/sn · H.264');
  assert.equal(get('Bit hızı').v, 'görüntü 4,2 Mb/sn · ses 128 kb/sn · AAC');
  assert.equal(get('Bağlantı hızı').v, '18 Mb/sn (tahmini)');
  assert.deepEqual([get('Tampon').v, get('Tampon').level], ['8,2 sn', 'ok']);
  assert.equal(get('Düşen kare').v, '12 (%1,2)');
});

test('ölçüm yoksa yalnız durum ve yayın satırı; yedek kanal belirtilir', () => {
  const st = { status: 'buffering', reconnect: 0, idx: 1, targets: [{ url: 'http://a/1.m3u8', mime: 'hls' }, { url: 'http://b/2.m3u8', mime: 'hls', alt: 'Kanal HD' }] };
  const rows = statsRows(st, null);
  assert.deepEqual(rows.map((r) => r.k), ['Durum', 'Yayın']);
  assert.match(rows[1].v, /yedek kanal \(Kanal HD\)/);
  assert.deepEqual(statsRows(null, null).map((r) => r.k), ['Durum']);
});

test('adres biçimi: HLS, MPEG-TS, yedek kanal; bilinmeyen boş', () => {
  assert.equal(targetKind({ url: 'http://h/live/1.m3u8', mime: 'hls' }), 'HLS');
  assert.equal(targetKind({ url: 'http://h/live/1.ts?x=1', mime: 'auto' }), 'MPEG-TS');
  assert.equal(targetKind({ url: 'http://h/x', alt: 'Yedek' }), 'yedek kanal (Yedek)');
  assert.equal(targetKind({ url: 'http://h/x', mime: 'auto' }), '');
  assert.equal(targetKind(undefined), '');
});

test('çözücü adı: google/android yazılım, üreticiler donanım', () => {
  for (const n of ['OMX.google.h264.decoder', 'c2.android.avc.decoder', 'c2.google.hevc.decoder', 'OMX.ffmpeg.sw.decoder']) assert.equal(isSoftwareDecoder(n), true, n);
  for (const n of ['OMX.MTK.VIDEO.DECODER.AVC', 'c2.mtk.hevc.decoder', 'OMX.amlogic.avc.decoder.awesome', 'c2.qti.avc.decoder', '']) assert.equal(isSoftwareDecoder(n), false, n);
});

test('satırlar: çözücü, uyumlu mod ve olay kaydı (ilk olaya göre saniye, son 7 satır)', () => {
  const st = { status: 'buffering', reconnect: 2, live: true, idx: 0, targets: [{ url: 'http://h/1.ts', mime: 'ts' }], log: Array.from({ length: 9 }, (_, i) => ({ t: 1000 + i * 1500, text: `olay ${i}` })) };
  const rows = statsRows(st, { decoder: 'OMX.google.h264.decoder', compat: true, dropped: 0, rendered: 0 });
  const get = (k) => rows.filter((r) => r.k === k).map((r) => r.v);
  assert.deepEqual(get('Çözücü'), ['OMX.google.h264.decoder · yazılım']);
  assert.match(get('Mod')[0], /^Uyumlu/);
  const ev = rows.slice(rows.findIndex((r) => r.k === 'Olaylar'));
  assert.equal(ev.length, 7, 'son 7 olay');
  assert.deepEqual([ev[0].k, ev[1].k], ['Olaylar', ''], 'başlık yalnız ilk satırda');
  assert.equal(ev[0].v, '+3,0 sn · olay 2');
  assert.equal(ev[6].v, '+12,0 sn · olay 8');
  const none = statsRows({ status: 'playing', targets: [], idx: 0 }, {});
  assert.ok(!none.some((r) => ['Çözücü', 'Mod', 'Olaylar'].includes(r.k)), 'veri yokken bu satırlar çıkmaz');
});
