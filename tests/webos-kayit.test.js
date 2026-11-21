// LG webOS canlı yayın kaydı istemcisi: süre seçimi, durum metinleri, kayıt öğesi adresi.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { createElement: () => ({ style: {} }), getElementById: () => null, querySelectorAll: () => [], documentElement: { style: {} }, body: {} };
const K = await import('../webos/src/kayit.js');

test('kayıt: süre seçenekleri döner; bilinmeyen süre 30 sn sayılır', () => {
  assert.equal(K.sureAdi(30), '30 sn');
  assert.equal(K.sureAdi(120), '2 dk');
  assert.equal(K.sureAdi(999), '30 sn');
  assert.equal(K.sonrakiSure(30, 1), 120);
  assert.equal(K.sonrakiSure(600, 1), 30, 'sona gelince başa sarar');
  assert.equal(K.sonrakiSure(30, -1), 600);
});

test('kayıt: boyut ve hız yazımı', () => {
  assert.equal(K.boyutYaz(0), '0 MB');
  assert.equal(K.boyutYaz(500), '1 KB');
  assert.equal(K.boyutYaz(3000000), '2,9 MB');
  assert.equal(K.boyutYaz(3 * 1024 * 1024 * 1024), '3,00 GB');
  assert.equal(K.hizYaz(3000000, 12000), '2,0 Mbps');
  assert.equal(K.hizYaz(3000000, 1000), '', 'ilk saniyede hız yazılmaz');
  assert.equal(K.hizYaz(0, 20000), '');
});

test('kayıt: durum metni — bağlanıyor, yazılıyor, bitti, hata', () => {
  const d = { durum: 'yaziyor', bayt: 3000000, sureMs: 12000, disk: 'USB 1 (sda1)', dosya: '/tmp/usb/sda/sda1/IPTV-Kayit/A-1.ts', mesaj: '' };
  assert.equal(K.durumMetni({ durum: 'baglaniyor' }, 30), 'Yayına bağlanılıyor…');
  assert.equal(K.durumMetni(d, 120), 'Yazılıyor · 0:12 / 2:00 · 2,9 MB · 2,0 Mbps · USB 1 (sda1)');
  assert.equal(K.durumMetni({ ...d, durum: 'bitti', mesaj: 'Süre doldu' }, 0), 'Bitti (Süre doldu) · 0:12 · 2,9 MB · 2,0 Mbps · USB 1 (sda1) · A-1.ts');
  assert.equal(K.durumMetni({ durum: 'hata', mesaj: 'Sunucu HTTP 404 yanıtı verdi' }, 0), 'Kayıt başarısız: Sunucu HTTP 404 yanıtı verdi');
  assert.equal(K.durumMetni(null, 0), '');
  assert.ok(K.calisiyor(d) && !K.bitti(d));
  assert.ok(K.bitti({ durum: 'hata' }) && K.bitti({ durum: 'bitti' }) && !K.calisiyor({ durum: 'bitti' }));
});

test('kayıt: kayıt dosyası yerel medya sunucusu adresiyle oynatılır', () => {
  const o = K.kayitOgesi({ dosya: '/tmp/usb/sda/sda1/IPTV-Kayit/A B-1.ts' }, 'TRT 1', { port: 4321, jeton: 'abc' });
  assert.equal(o.kind, 'local');
  assert.equal(o.mkind, 'video');
  assert.equal(o.name, 'Kayıt · TRT 1');
  assert.equal(o.url, 'http://127.0.0.1:4321/abc/' + encodeURIComponent('/tmp/usb/sda/sda1/IPTV-Kayit/A B-1.ts'));
});
