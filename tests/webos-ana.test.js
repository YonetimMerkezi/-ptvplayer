// LG webOS ana sayfa: Vizyondakiler ayrıştırması ve yedekleri, odak satırları arası konum eşleme.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { createElement: () => ({ style: {} }), documentElement: { style: {} }, body: {} };
globalThis.getComputedStyle = globalThis.getComputedStyle || (() => ({ fontSize: '20px' }));

const { beyazperdeOku, tarihOku, vizyonYukle, VIZYON_TTL } = await import('../webos/src/vizyon.js');
const { yakinSutun, tarihYaz } = await import('../webos/src/screens/home.js');

const KART = (ad, id, tarih, imgAttr = 'data-src="//img.example/' + id + '.jpg"') => `<div><img alt="${ad} posteri" ${imgAttr}><a href="/filmler/film-${id}/">${ad}</a><span>${tarih} | 1s 21dk | Animasyon</span><a href="/filmler/film-${id}/seanslar/">Seanslar!</a></div>`;
const SAYFA = '<a href="/filmler/film-1/">Arama Önerisi</a>' + KART('Kayıp Şehir', 123, '13 Kasım 2026') + KART('Son Savaşçı', 456, '20 Kasım 2026', 'src="http://img.example/b.jpg"') + KART('Kızıl Vadi', 789, '5 Aralık 2026');

test('vizyon: Beyazperde kartları afiş, ad ve tarihle okunur; arama önerisi ve seans bağlantısı film sayılmaz', () => {
  const f = beyazperdeOku(SAYFA);
  assert.deepEqual(f.map((x) => x.title), ['Kayıp Şehir', 'Son Savaşçı', 'Kızıl Vadi']);
  assert.equal(f[0].poster, 'https://img.example/123.jpg');
  assert.equal(f[1].poster, 'https://img.example/b.jpg', 'http afişi https’e çevrilir');
  assert.equal(f[0].date, '2026-11-13');
  assert.equal(f[2].date, '2026-12-05');
  assert.equal(f[2].year, 2026);
});

const SAYFA6 = SAYFA + KART('Gece Treni', 11, '6 Aralık 2026') + KART('Derin Mavi', 12, '7 Aralık 2026') + KART('Atlas', 13, '8 Aralık 2026');

test('vizyon: tarih ve ana sayfadaki tarih yazımı', () => {
  assert.deepEqual(tarihOku('13 Kasım 2026 | 1s'), { year: 2026, date: '2026-11-13' });
  assert.deepEqual(tarihOku('yakında'), { year: 0, date: '' });
  assert.equal(tarihYaz({ date: '2026-12-05' }), '5 Aralık 2026');
  assert.equal(tarihYaz({ year: 2025 }), '2025');
  assert.equal(tarihYaz(null), '');
});

test('vizyon: önbellek tazeyse ağa gidilmez, bayatsa Beyazperde’den yenilenir', async () => {
  let depo = null;
  const d = { al: () => depo, yaz: (v) => (depo = v) };
  let istek = 0;
  const net = { text: async () => (istek++, SAYFA6) };
  const a = await vizyonYukle({ net, depo: d, simdi: 1000, yedek: async () => ({ films: [] }) });
  assert.equal(a.kaynak, 'beyazperde');
  assert.equal(a.films.length, 6);
  const n1 = istek;
  const b = await vizyonYukle({ net, depo: d, simdi: 2000, yedek: async () => ({ films: [] }) });
  assert.equal(b.kaynak, 'onbellek');
  assert.equal(istek, n1, 'tazeyken istek yok');
  const c = await vizyonYukle({ net, depo: d, simdi: 1000 + VIZYON_TTL + 1, yedek: async () => ({ films: [] }) });
  assert.equal(c.kaynak, 'beyazperde');
  assert.ok(istek > n1);
});

test('vizyon: Beyazperde alınamazsa Cinemeta yedeği, o da yoksa eski önbellek, hiçbiri yoksa hata', async () => {
  const bozuk = { text: async () => '<html>engellendi</html>' };
  const yedek = async () => ({ films: [{ imdbId: 'tt1', name: 'Yedek Film', year: 2026, poster: 'https://x/p.jpg' }] });
  const a = await vizyonYukle({ net: bozuk, depo: null, simdi: 1, yedek });
  assert.equal(a.kaynak, 'cinemeta');
  assert.equal(a.films[0].title, 'Yedek Film');
  const eski = { at: 1, films: [{ id: 'v1', title: 'Eski', year: 2026, date: '', poster: '' }] };
  const b = await vizyonYukle({ net: bozuk, depo: { al: () => eski, yaz() {} }, simdi: 1 + VIZYON_TTL + 5, yedek: async () => ({ films: [] }) });
  assert.equal(b.kaynak, 'onbellek');
  assert.equal(b.eski, true);
  await assert.rejects(() => vizyonYukle({ net: bozuk, depo: null, simdi: 1, yedek: async () => { throw new Error('yok'); } }));
});

test('ana sayfa: kart ↔ buton geçişinde yatay konum korunur', () => {
  assert.equal(yakinSutun(0, 3, 6), 1);
  assert.equal(yakinSutun(1, 3, 6), 3);
  assert.equal(yakinSutun(2, 3, 6), 5);
  assert.equal(yakinSutun(5, 6, 3), 2);
  assert.equal(yakinSutun(0, 6, 3), 0);
  assert.equal(yakinSutun(9, 3, 6), 5, 'taşan sütun sona kırpılır');
});
