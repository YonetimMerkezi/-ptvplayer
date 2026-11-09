import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMediaFormat, checkStreamHealth, explainProbeError } from '../www/js/health.js';

test('format uzantı ve MIME türünden tanınır', () => {
  assert.equal(detectMediaFormat('https://host/live.m3u8?token=x'), 'HLS (M3U8)');
  assert.equal(detectMediaFormat('https://host/movie.mkv'), 'MKV');
  assert.equal(detectMediaFormat('https://host/live', 'application/dash+xml'), 'MPEG-DASH');
  assert.equal(detectMediaFormat('rtsp://host/live'), 'RTSP');
});
test('sağlık testi aralık isteğiyle HTTP yanıtını ölçer', async () => {
  const result = await checkStreamHealth({ url: 'https://host/live.ts' }, {
    now: (() => { let n = 10; return () => n++; })(),
    fetchImpl: async (_url, opts) => {
      assert.equal(opts.method, 'GET');
      assert.equal(opts.headers.Range, 'bytes=0-0');
      return { status: 206, headers: { get: () => 'video/mp2t' }, body: { cancel: async () => {} } };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 206);
  assert.equal(result.format, 'video/mp2t');
});
test('RTSP için HTTP isteği gönderilmez', async () => {
  const result = await checkStreamHealth('rtsp://host/live', { fetchImpl: () => { throw new Error('çağrılmamalı'); } });
  assert.equal(result.ok, null);
  assert.match(result.message, /RTSP/);
});
test('ağ hatası anlaşılır sonuca çevrilir', async () => {
  const result = await checkStreamHealth('https://host/a.m3u8', { fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(result.ok, false);
  assert.equal(result.message, 'offline');
});

test('yerel probe: 2xx ve veri gelince çalışıyor sayılır, süre yerel ölçümden alınır', async () => {
  const calls = [];
  const result = await checkStreamHealth({ url: 'http://host/live/u/p/1', headers: { 'X-A': '1' } }, {
    probe: async (o) => { calls.push(o); return { status: 200, ms: 87, contentType: 'application/vnd.apple.mpegurl', bytes: 512, playlist: true }; },
    fetchImpl: () => { throw new Error('probe varken fetch çağrılmamalı'); },
  });
  assert.deepEqual(calls[0], { url: 'http://host/live/u/p/1', headers: { 'X-A': '1' }, timeoutMs: 8000 });
  assert.equal(result.ok, true);
  assert.equal(result.latencyMs, 87);
  assert.equal(result.format, 'HLS (M3U8)');
});
test('yerel probe: HTTP hatası ve boş yanıt çalışmıyor sayılır', async () => {
  const bad = await checkStreamHealth('http://h/a.ts', { probe: async () => ({ status: 404, ms: 30, contentType: 'text/html' }) });
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 404);
  assert.equal(bad.message, 'HTTP 404');
  const empty = await checkStreamHealth('http://h/a.ts', { probe: async () => ({ status: 200, ms: 30, contentType: 'video/mp2t', bytes: 0 }) });
  assert.equal(empty.ok, false);
  assert.match(empty.message, /veri göndermedi/);
});
test('yerel probe: hata iletileri Türkçeye çevrilir', async () => {
  const t = await checkStreamHealth('http://h/a.ts', { probe: async () => ({ error: 'failed to connect', timeout: true, ms: 8000 }) });
  assert.equal(t.ok, false);
  assert.equal(t.message, 'Bağlantı zaman aşımına uğradı');
  assert.equal(explainProbeError('Unable to resolve host "x.example"'), 'Sunucu adı çözülemedi');
  assert.equal(explainProbeError('Connection refused'), 'Sunucu bağlantıyı reddetti');
  assert.equal(explainProbeError('Connection reset by peer'), 'Bağlantı sunucu tarafından kesildi');
  const thrown = await checkStreamHealth('http://h/a.ts', { probe: async () => { throw new Error('boom'); } });
  assert.equal(thrown.ok, false);
  assert.equal(thrown.message, 'boom');
});
