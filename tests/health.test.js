import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMediaFormat, checkStreamHealth } from '../www/js/health.js';

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
