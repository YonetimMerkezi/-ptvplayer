// webOS arama: sekmeli kapsam, yazdıkça arama, kumanda geçişleri ve hız önlemleri (ad önbelleği, tek indirme, süzme).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { createElement: () => ({ style: {} }), documentElement: { style: {} }, body: {} };
globalThis.getComputedStyle = globalThis.getComputedStyle || (() => ({ fontSize: '20px' }));

const { araTur, ara, aramayaHazirla, sonuclariSuz } = await import('../webos/src/data.js');
const { gecis, CANLI_MIN, CANLI_MS, TUR_LIMIT } = await import('../webos/src/screens/search.js');

const ad = (n, tur = 'live') => ({ id: String(n), name: n, kind: tur });
function sahte(listeler, sayac = {}) {
  return {
    all: async (k) => {
      sayac[k] = (sayac[k] || 0) + 1;
      await new Promise((r) => setTimeout(r, 5));
      return listeler[k];
    },
  };
}

test('araTur: Türkçe harf/büyük-küçük duyarsız, yalnız istenen tür indirilir', async () => {
  const sayac = {};
  const p = sahte({ live: [ad('TRT Çocuk'), ad('Kanal D')], movie: [ad('Çocuk Filmi', 'movie')], series: [ad('Dizi', 'series')] }, sayac);
  assert.deepEqual((await araTur(p, 'cocuk', 'live', 10)).map((x) => x.name), ['TRT Çocuk']);
  assert.deepEqual((await araTur(p, 'ÇOCUK', 'movie', 10)).map((x) => x.name), ['Çocuk Filmi']);
  assert.deepEqual(sayac, { live: 1, movie: 1 }, 'series hiç istenmedi');
  assert.deepEqual(await araTur(p, '   ', 'live', 10), []);
});

test('araTur: eşzamanlı istekler aynı listeyi paylaşır ve üst sınır uygulanır', async () => {
  const liste = [];
  for (let i = 0; i < 50; i++) liste.push(ad('Film ' + i, 'movie'));
  const sayac = {};
  const p = sahte({ movie: liste }, sayac);
  const [a, b] = await Promise.all([araTur(p, 'film', 'movie', 5), araTur(p, 'film 1', 'movie', 100)]);
  assert.equal(a.length, 5);
  assert.equal(b.length, 11); // Film 1, 10-19
});

test('araTur: büyük listede doğru sonuç, büyüyen liste yeniden hesaplanır', async () => {
  const liste = [];
  for (let i = 0; i < 30000; i++) liste.push(ad('Örnek İçerik ' + i, 'movie'));
  const p = sahte({ movie: liste });
  const t0 = Date.now();
  const r = await araTur(p, 'icerik 29999', 'movie', 10);
  assert.deepEqual(r.map((x) => x.name), ['Örnek İçerik 29999']);
  const ilk = Date.now() - t0;
  const t1 = Date.now();
  await araTur(p, 'icerik 1234', 'movie', 10);
  assert.ok(Date.now() - t1 <= ilk, 'ikinci arama ad önbelleğinden gelir (yeniden küçültme yok)');
  liste.push(ad('Yepyeni Çıkış', 'movie'));
  assert.deepEqual((await araTur(p, 'cikis', 'movie', 10)).map((x) => x.name), ['Yepyeni Çıkış']);
});

test('araTur: ad küçültme süre dilimlerine bölünür (Geri/tuşlar donmaz)', async () => {
  const liste = [];
  for (let i = 0; i < 60000; i++) liste.push(ad('İçerik Adı ' + i, 'movie'));
  const p = sahte({ movie: liste });
  let tikler = 0;
  const z = setInterval(() => tikler++, 1);
  await araTur(p, 'icerik adi 5', 'movie', 10);
  clearInterval(z);
  assert.ok(tikler >= 3, 'hesap sürerken olay döngüsüne nefes verildi: ' + tikler);
});

test('ara: üst sınıra varınca kalan türlerin listesi indirilmez; eski imza korunur', async () => {
  const sayac = {};
  const live = [];
  for (let i = 0; i < 10; i++) live.push(ad('Kanal ' + i));
  const p = sahte({ live, movie: [ad('Kanal Film', 'movie')], series: [] }, sayac);
  const r = await ara(p, 'kanal', 5);
  assert.equal(r.length, 5);
  assert.deepEqual(sayac, { live: 1 });
  const turler = [];
  await ara(p, 'kanal film', 10, (t) => turler.push(t), ['movie']);
  assert.deepEqual(turler, ['movie']);
});

test('aramayaHazirla: kapsamdaki listeleri arka planda yükler, hata fırlatmaz', async () => {
  const sayac = {};
  const p = sahte({ live: [ad('A')], movie: [ad('B', 'movie')] }, sayac);
  aramayaHazirla(p, ['live', 'movie']);
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(sayac, { live: 1, movie: 1 });
  aramayaHazirla({ all: async () => { throw new Error('ağ yok'); } }, ['live']);
  await new Promise((r) => setTimeout(r, 10)); // yakalanmamış söz reddi olmamalı
});

test('sonuclariSuz: devam eden sorgu anında süzülür; eksik/ilgisiz sonuçta null', () => {
  const onceki = [ad('Gora'), ad('Goralı Kanal'), ad('Gordion')];
  assert.deepEqual(sonuclariSuz(onceki, 'gor', 'gora', 300).map((x) => x.name), ['Gora', 'Goralı Kanal']);
  assert.equal(sonuclariSuz(onceki, 'gor', 'abc', 300), null, 'devamı değil');
  assert.equal(sonuclariSuz(onceki, 'gor', 'gora', 3), null, 'üst sınıra varmış: eksik olabilir');
  assert.equal(sonuclariSuz(undefined, 'gor', 'gora', 300), null);
  assert.equal(sonuclariSuz(onceki, '', 'gora', 300), null);
  assert.deepEqual(sonuclariSuz(onceki, 'gor', 'GÖRA', 300).map((x) => x.name), ['Gora', 'Goralı Kanal'], 'Türkçe harf duyarsız');
});

test('gecis: yazı alanı → Ara düğmesi → sekmeler → sonuçlar', () => {
  const g = (b, a, s = true, l0 = false) => gecis(b, a, s, l0);
  assert.deepEqual(g('input', 'right'), { git: 'go', yut: true, sekme: 0 });
  assert.equal(g('input', 'down').git, 'tabs');
  assert.equal(g('input', 'left').yut, true);
  assert.equal(g('input', 'up').yut, false, '▲ üst çubuğa/Geri\'ye düşer');
  assert.equal(g('input', 'back').yut, false, 'Geri çıkışa düşer');
  assert.equal(g('go', 'left').git, 'input');
  assert.equal(g('go', 'down').git, 'tabs');
  assert.equal(g('go', 'right').yut, true);
  assert.equal(g('go', 'up').yut, false);
  assert.equal(g('tabs', 'right').sekme, 1);
  assert.equal(g('tabs', 'left').sekme, -1);
  assert.equal(g('tabs', 'up').git, 'input');
  assert.equal(g('tabs', 'down', true).git, 'list');
  assert.deepEqual(g('tabs', 'down', false), { git: '', yut: true, sekme: 0 }, 'sonuç yokken sekmelerde kalır');
  assert.equal(g('tabs', 'ok', true).git, 'list');
  assert.equal(g('tabs', 'back').yut, false);
  assert.equal(g('list', 'left').sekme, -1, 'sonuçlarda ◀▶ sekme değiştirir');
  assert.equal(g('list', 'right').sekme, 1);
  assert.equal(g('list', 'up', true, true).git, 'tabs');
  assert.equal(g('list', 'up', true, false).yut, false, 'liste kendi içinde gezer');
  assert.equal(g('list', 'down').yut, false);
  assert.equal(g('list', 'back').yut, false);
});

test('arama ekranı: yazdıkça arama, sekmeler ve Chromium 38 uyumu (kaynak denetimi)', () => {
  const k = readFileSync(new URL('../webos/src/screens/search.js', import.meta.url), 'utf8');
  assert.match(k, /inp\.addEventListener\('input'/);
  assert.match(k, /setTimeout\(\(\) => calistir\(false\), CANLI_MS\)/);
  assert.match(k, /id="s-tabs"/);
  assert.match(k, /'aramaKapsam'/);
  assert.match(k, /aramayaHazirla\(pr, kapsamTurleri\(\)\)/);
  assert.doesNotMatch(k, /\.findIndex\(|\.includes\(|\.find\(/, 'Chromium 38\'de yok');
  assert.ok(CANLI_MIN >= 2 && CANLI_MS >= 150 && CANLI_MS <= 600 && TUR_LIMIT >= 100);
  const css = readFileSync(new URL('../webos/css/tv.css', import.meta.url), 'utf8');
  assert.match(css, /\.s-tab\.on \{/);
  assert.match(css, /\.search \.s-res \{ top: 20\.2rem/);
});
