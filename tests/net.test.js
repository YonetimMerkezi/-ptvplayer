import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readBody, createNet } from '../www/js/net.js';

const bodyOf = (buf, step = 1000) =>
  new ReadableStream({
    start(c) {
      for (let i = 0; i < buf.length; i += step) c.enqueue(new Uint8Array(buf.subarray(i, i + step)));
      c.close();
    },
  });

async function collect(buf, step) {
  const parts = [];
  const total = await readBody(bodyOf(buf, step), (t) => parts.push(t));
  return { text: parts.join(''), total };
}

test('düz metin, çok baytlı karakter parça sınırında bölünse de bozulmaz', async () => {
  const txt = 'Çağrı Şükrü Öğüt İİ ığ '.repeat(500);
  const buf = Buffer.from(txt, 'utf8');
  for (const step of [1, 3, 7, 999]) {
    const r = await collect(buf, step);
    assert.equal(r.text, txt);
    assert.equal(r.total, buf.length);
  }
});

test('gzip otomatik açılır', async () => {
  const txt = '<tv>' + 'Şarkı '.repeat(20000) + '</tv>';
  const r = await collect(gzipSync(Buffer.from(txt)), 777);
  assert.equal(r.text, txt);
});

test('boş gövde', async () => {
  assert.equal((await collect(Buffer.alloc(0), 10)).text, '');
});

test('bozuk gzip hata verir', async () => {
  const bad = Buffer.concat([Buffer.from([0x1f, 0x8b, 8, 0]), Buffer.from('bu gzip degil')]);
  await assert.rejects(() => collect(bad, 4));
});

test('createNet: tarayıcı yolu, HTTP hatası ve json', async () => {
  const net = createNet({
    fetchImpl: async (url) => {
      if (url.includes('404')) return new Response('yok', { status: 404 });
      if (url.includes('html')) return new Response('<html>');
      return new Response(JSON.stringify({ a: 'ü' }));
    },
  });
  assert.deepEqual(await net.json('http://x/ok'), { a: 'ü' });
  await assert.rejects(() => net.text('http://x/404'), /HTTP 404/);
  await assert.rejects(() => net.json('http://x/html'), /JSON/);
});

test('createNet: yerel indirme yolu geçici dosyayı temizler', async () => {
  const calls = [];
  const native = {
    download: async ({ url, headers }) => {
      calls.push(['download', url, headers]);
      return { path: '/cache/a.tmp' };
    },
    deleteFile: async ({ path }) => calls.push(['delete', path]),
  };
  const net = createNet({
    native,
    convertFileSrc: (p) => p.replace('file://', 'https://localhost/_f'),
    fetchImpl: async (u) => {
      calls.push(['fetch', u]);
      return new Response('merhaba');
    },
  });
  assert.equal(await net.text('http://srv/list.m3u', { headers: { 'User-Agent': 'X' } }), 'merhaba');
  assert.deepEqual(calls, [
    ['download', 'http://srv/list.m3u', { 'User-Agent': 'X' }],
    ['fetch', 'https://localhost/_f/cache/a.tmp'],
    ['delete', '/cache/a.tmp'],
  ]);
});

test('createNet: fast isteği yerel indirmeye ayrı havuz bayrağıyla gider, normal istek bayraksız', async () => {
  const sent = [];
  const native = { download: async (o) => { sent.push(o); return { path: '/cache/b.tmp' }; }, deleteFile: async () => {} };
  const net = createNet({ native, convertFileSrc: (p) => p, fetchImpl: async () => new Response('{"a":1}') });
  assert.deepEqual(await net.json('http://api/x', { fast: true }), { a: 1 });
  await net.json('http://srv/y');
  assert.deepEqual(sent, [{ url: 'http://api/x', headers: {}, fast: true }, { url: 'http://srv/y', headers: {} }]);
});
