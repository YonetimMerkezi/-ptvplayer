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
  assert.match(css, /\.s-tab\.on(, [^{]*)? \{/);
  assert.match(css, /\.search \.s-res \{ top: 20\.2rem/);
});

// ---- Xtream: kategori kategori tarama (tek dev "tüm liste" isteği yerine) ----
const { createProvider } = await import('../webos/src/data.js');
const CFG = { type: 'xtream', name: 'T', server: 'http://srv:8000', user: 'u', pass: 'p', id: 'k1' };

function sahteSunucu({ kategori = 12, film = 5, bozuk = [], gecikme = 8 } = {}) {
  const s = { istekler: [], eszamanli: 0, enCok: 0 };
  s.get = async (url) => {
    s.istekler.push(url);
    s.eszamanli++;
    s.enCok = Math.max(s.enCok, s.eszamanli);
    await new Promise((r) => setTimeout(r, gecikme));
    s.eszamanli--;
    const id = (url.match(/category_id=([^&]+)/) || [])[1];
    if (bozuk.indexOf(id) >= 0) throw new Error('kategori hatası ' + id);
    if (url.includes('action=get_vod_categories')) {
      const c = [];
      for (let i = 1; i <= kategori; i++) c.push({ category_id: String(i), category_name: 'Kat ' + i });
      return JSON.stringify(c);
    }
    if (url.includes('action=get_vod_streams')) {
      const l = [];
      for (let i = 0; i < film; i++) l.push({ name: id === '3' && i === 0 ? 'Gora Özel' : 'Film K' + id + ' ' + i, stream_id: Number(id) * 100 + i, category_id: id });
      return JSON.stringify(l);
    }
    return '[]';
  };
  s.json = async (url) => JSON.parse(await s.get(url));
  return s;
}
const kaliciSahte = () => ({ yazildi: [], oku: async () => null, yaz: async function (k) { this.yazildi.push(k); return true; } });

test('Xtream gez: kategoriler küçük isteklerle ve en çok 4 eşzamanlı yüklenir, sonuçlar yüklendikçe bildirilir', async () => {
  const sunucu = sahteSunucu({ kategori: 12 });
  const kalici = kaliciSahte();
  const p = createProvider(CFG, sunucu, kalici);
  const ilerlemeler = [];
  const r = await araTur(p, 'gora', 'movie', 50, (o, b, t) => ilerlemeler.push([o.length, b, t]));
  assert.deepEqual(r.map((x) => x.name), ['Gora Özel']);
  assert.equal(ilerlemeler.length, 12, 'her kategori yüklenince bildirim');
  assert.deepEqual(ilerlemeler[ilerlemeler.length - 1], [1, 12, 12]);
  assert.ok(sunucu.enCok <= 4, 'eşzamanlı istek sınırı: ' + sunucu.enCok);
  assert.ok(sunucu.enCok >= 2, 'istekler art arda değil paralel');
  assert.ok(!sunucu.istekler.some((u) => /get_vod_streams(?!.*category_id)/.test(u)), 'tüm liste isteği yapılmadı');
  await new Promise((r2) => setTimeout(r2, 1700));
  assert.deepEqual(kalici.yazildi, [], 'arama kategorileri kalıcı önbelleğe yazmaz');
});

test('Xtream gez: ikinci arama yeniden istek yapmaz; üst sınıra varınca kalan kategoriler istenmez', async () => {
  const sunucu = sahteSunucu({ kategori: 30, film: 4 });
  const p = createProvider(CFG, sunucu, kaliciSahte());
  const r = await araTur(p, 'film k', 'movie', 6);
  assert.equal(r.length, 6);
  const sonra = sunucu.istekler.length;
  assert.ok(sonra < 1 + 30, 'sınıra varınca tarama durdu: ' + sonra + ' istek');
  const sunucu2 = sahteSunucu({ kategori: 8 });
  const p2 = createProvider(CFG, sunucu2, kaliciSahte());
  await araTur(p2, 'film', 'movie', 1000);
  const ilk = sunucu2.istekler.length;
  assert.equal(ilk, 1 + 8);
  await araTur(p2, 'film k3', 'movie', 1000);
  assert.equal(sunucu2.istekler.length, ilk, 'bellek önbelleğinden: yeni istek yok');
});

test('Xtream gez: iptal edilince yeni kategori istenmez; arkadan sürmesi gerekmez', async () => {
  const sunucu = sahteSunucu({ kategori: 40, gecikme: 15 });
  const p = createProvider(CFG, sunucu, kaliciSahte());
  let iptal = false;
  const g = araTur(p, 'film', 'movie', 1000, (o, b) => { if (b >= 3) iptal = true; }, () => iptal);
  await g;
  assert.ok(sunucu.istekler.length < 15, 'iptalden sonra yeni istek başlamadı: ' + sunucu.istekler.length);
});

test('Xtream gez: bazı kategoriler başarısızsa sayılır, hepsi başarısızsa hata verir', async () => {
  const p = createProvider(CFG, sahteSunucu({ kategori: 6, bozuk: ['2', '4'] }), kaliciSahte());
  let son = null;
  const r = await araTur(p, 'film', 'movie', 1000, (o, b, t, h) => { son = { b, t, h }; });
  assert.deepEqual(son, { b: 6, t: 6, h: 2 });
  assert.equal(r.length, 4 * 5 - 1, 'başarılı 4 kategori × 5 film; 3. kategorinin ilki "Gora Özel" olduğundan eşleşmez');
  const hepsi = createProvider(CFG, sahteSunucu({ kategori: 3, bozuk: ['1', '2', '3'] }), kaliciSahte());
  await assert.rejects(() => araTur(hepsi, 'film', 'movie', 10), /Kategoriler yüklenemedi/);
});

test('Xtream gez: aramayaHazirla kategorileri arka planda yükler (sonraki arama anında)', async () => {
  const sunucu = sahteSunucu({ kategori: 6 });
  const p = createProvider(CFG, sunucu, kaliciSahte());
  aramayaHazirla(p, ['movie']);
  await new Promise((r) => setTimeout(r, 120));
  const hazirIstek = sunucu.istekler.length;
  assert.equal(hazirIstek, 1 + 6);
  const t0 = Date.now();
  const r = await araTur(p, 'gora', 'movie', 10);
  assert.equal(r.length, 1);
  assert.equal(sunucu.istekler.length, hazirIstek);
  assert.ok(Date.now() - t0 < 100);
});
