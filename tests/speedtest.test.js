import test from 'node:test';
import assert from 'node:assert/strict';
import { runInternetSpeedTest } from '../www/js/speedtest.js';

test('hız testi ping, indirme ve yükleme sonuçlarını üretir', async () => {
  let tick = 0;
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method });
    if (url.includes('__down?bytes=0')) return new Response(null, { status: 200 });
    if (url.includes('__down?bytes=')) return new Response(new Uint8Array(8000), { status: 200 });
    if (url.includes('__up')) return new Response(null, { status: 200 });
    throw new Error('Beklenmeyen URL');
  };
  const phases = [];
  const result = await runInternetSpeedTest({
    fetchImpl,
    now: () => (tick += 100),
    downloadBytes: 8000,
    uploadBytes: 1000,
    pingCount: 2,
    onProgress: (p) => phases.push(p.phase),
  });
  assert.equal(result.pingMs, 100);
  assert.equal(result.downloadMbps, 0.6);
  assert.equal(result.uploadMbps, 0.1);
  assert.equal(result.server, 'Cloudflare');
  assert.equal(calls.filter((x) => x.url.includes('__down?bytes=0')).length, 2);
  assert.ok(calls.some((x) => x.method === 'POST'));
  assert.deepEqual([...new Set(phases)], ['ping', 'download', 'upload', 'done']);
});

test('hız testi HTTP hatasında anlaşılır hata verir', async () => {
  await assert.rejects(
    () => runInternetSpeedTest({ fetchImpl: async () => new Response(null, { status: 503 }), pingCount: 1 }),
    /HTTP 503/,
  );
});

test('hız testi kullanıcı iptalini dikkate alır', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => runInternetSpeedTest({ signal: controller.signal, fetchImpl: async () => { throw new Error('çağrılmamalı'); } }),
    { name: 'AbortError' },
  );
});
