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

test('kayıt: disk özeti — yazılabilir (boş alan ve tahmini süre), yazılamayan (neden), bilinmeyen alan', () => {
  assert.equal(
    K.alanMetni([
      { ad: 'USB 2 (sda1)', yazilabilir: false, hata: 'EACCES', bos: null },
      { ad: 'Dahili bellek', yazilabilir: true, hata: '', bos: 2.1 * 1024 * 1024 * 1024 },
      { ad: 'Geliştirici alanı', yazilabilir: true, hata: '', bos: null },
    ]),
    'USB 2 (sda1): yazılamıyor (EACCES) · Dahili bellek: 2,10 GB boş (≈ 37 dk) · Geliştirici alanı: yazılabilir'
  );
  assert.equal(K.alanMetni(null), '');
});

test('kayıt: yazılamayan diskin nedeni ve USB denemesinin sonucu metne dökülür', () => {
  const diskler = [
    { ad: 'USB 2 (sda1)', yazilabilir: false, hata: 'EACCES', ayrinti: { sahipUid: 0, sahipGid: 0, mod: '755', baglama: 'vfat rw,uid=0' } },
    { ad: 'Dahili bellek', yazilabilir: true, hata: '' },
  ];
  assert.equal(K.ayrintiMetni(diskler, { uid: 1000, gid: 1000 }), 'USB 2 (sda1): sahip 0:0, izin 755, servis 1000:1000, vfat rw,uid=0');
  assert.equal(K.ayrintiMetni(null, null), '');
  assert.equal(K.usbMetni({ sonuclar: [] }), 'Denenecek yazılamayan disk yok.');
  assert.match(K.usbMetni({ sonuclar: [{ ad: 'USB 2 (sda1)', sonuc: 'yazildi', yanit: '' }] }), /^USB 2 \(sda1\): yazıldı ✓/);
  assert.match(K.usbMetni({ sonuclar: [{ ad: 'USB 2 (sda1)', sonuc: 'yok', yanit: '{"errorText":"Denied"}' }] }), /yazılamadı \[\{"errorText":"Denied"\}\]$/);
  assert.match(K.usbMetni({ sonuclar: [{ ad: 'USB 2 (sda1)', sonuc: 'varsayilan', yanit: '' }] }), /dahili klasöre yazdı/);
});
