import test from 'node:test';
import assert from 'node:assert/strict';
import { keyOf, wikiLang, searchText, kindOfDescription, wikidataVerdict, cinemetaVerdict, lookupFilm, createFilmResolver, NONE_TTL } from '../www/js/film-lookup.js';

const wd = (...items) => ({ search: items.map(([label, description, match]) => ({ label, description, match: match || { type: 'label', language: 'tr', text: label } })) });
const cm = (...names) => ({ metas: names.map((n) => (typeof n === 'string' ? { name: n } : n)) });
const memCache = () => {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); }, _m: m };
};
// ağ: adres parçasına göre yanıt; sayaç tutar
const fakeNet = (routes) => {
  const calls = [];
  return {
    calls,
    json: async (url) => {
      calls.push(url);
      for (const [part, res] of routes) if (url.includes(part)) { if (res instanceof Error) throw res; return typeof res === 'function' ? res(url) : res; }
      throw new Error('yanıt yok: ' + url);
    },
  };
};

test('searchText: tümü büyük yazılmış adlar Türkçe kurallarıyla küçülür; yıl/etiket temizlenir', () => {
  assert.equal(searchText('ŞEYTAN MARKA GİYER'), 'şeytan marka giyer');
  assert.equal(searchText('Yüzüklerin Efendisi: İki Kule'), 'Yüzüklerin Efendisi: İki Kule');
  assert.equal(searchText('SPIDER-MAN 2 (2004)'), 'spider-man 2');
  assert.equal(searchText('HIZLI VE KORKUSUZ'), 'hizli ve korkusuz');
  assert.equal(keyOf('Yüzüklerin Efendisi: İki Kule'), keyOf('YÜZÜKLERİN EFENDİSİ: İKİ KULE'));
});

test('kindOfDescription: film, dizi ve TV filmi ayrımı', () => {
  assert.equal(kindOfDescription('2002 fantasy film directed by Peter Jackson'), 'film');
  assert.equal(kindOfDescription('2014 drama film by Damien Chazelle'), 'film');
  assert.equal(kindOfDescription('television film'), 'film');
  assert.equal(kindOfDescription('Turkish television series'), 'series');
  assert.equal(kindOfDescription('American animated series'), 'series');
  assert.equal(kindOfDescription('animated television series'), 'series');
  assert.equal(kindOfDescription('Turkish talk show'), 'series');
  assert.equal(kindOfDescription('musical group'), '');
  assert.equal(kindOfDescription(''), '');
});

test('wikidataVerdict: birebir ad + açıklama; belirsiz (film ve dizi) film sayılmaz; yıl ipucu çözer', () => {
  const t = 'Yüzüklerin Efendisi: İki Kule';
  assert.equal(wikidataVerdict(wd([t, '2002 fantasy film directed by Peter Jackson']), t), 'film');
  assert.equal(wikidataVerdict(wd(['Yüzüklerin Efendisi', 'film series']), t), '', 'kısmi ad eşleşmez');
  assert.equal(wikidataVerdict(wd(['Baba', '1971 Turkish film'], ['Baba', 'Turkish television series']), 'Baba'), 'none');
  assert.equal(wikidataVerdict(wd(['Whiplash', '2014 drama film'], ['Whiplash', '2013 short film']), 'WHIPLASH'), 'film');
  assert.equal(wikidataVerdict(wd(['Uzak Şehir', 'Turkish television series']), 'Uzak Şehir'), 'series');
  assert.equal(wikidataVerdict(wd(['Dilberay', '2020 film'], ['Dilberay', '2019 television series']), 'Dilberay (2020)'), 'film', 'yıl aynı olan kazanır');
  // takma adla eşleşme (Türkçe dublaj adı alias)
  assert.equal(wikidataVerdict(wd(['The Two Towers', '2002 film', { type: 'alias', language: 'tr', text: 'Yüzüklerin Efendisi: İki Kule' }]), t), 'film');
  assert.equal(wikidataVerdict(null, t), '');
});

test('cinemetaVerdict: birebir ad; yalnız film → film, yalnız dizi → dizi, ikisi → belirsiz; yıl ±1', () => {
  const t = 'The Lord of the Rings: The Two Towers';
  assert.equal(cinemetaVerdict(cm(t), cm(), t), 'film');
  assert.equal(cinemetaVerdict(cm(), cm('Survivor'), 'SURVIVOR'), 'series');
  assert.equal(cinemetaVerdict(cm('Survivor'), cm('Survivor'), 'Survivor'), 'none');
  assert.equal(cinemetaVerdict(cm('The Lord of the Rings'), cm(), t), '', 'kısmi ad film sayılmaz');
  assert.equal(cinemetaVerdict(cm({ name: 'Creed', releaseInfo: '2015' }), cm(), 'Creed (2015)'), 'film');
  assert.equal(cinemetaVerdict(cm({ name: 'Creed', releaseInfo: '2015' }), cm(), 'Creed (2023)'), '', 'yıl uyuşmuyor');
});

test('lookupFilm: Wikidata bulursa durur; önbelleğe yazar ve tekrarında ağa gitmez', async () => {
  const t = 'Yüzüklerin Efendisi: İki Kule';
  const net = fakeNet([['wbsearchentities', wd([t, '2002 fantasy film'])]]);
  const cache = memCache();
  assert.equal(await lookupFilm({ net, cache, title: t, now: 1000 }), 'film');
  assert.equal(net.calls.length, 1);
  assert.equal(await lookupFilm({ net, cache, title: t, now: 2000 }), 'film');
  assert.equal(net.calls.length, 1, 'önbellekten');
  assert.match(net.calls[0], /language=tr&uselang=en/);
});

test('lookupFilm: Wikidata bulamazsa Cinemeta, o da yoksa adı İngilizceye çevirip Cinemeta (farklı dilde ad)', async () => {
  const t = 'Yüzüklerin Efendisi: İki Kule';
  const en = 'The Lord of the Rings: The Two Towers';
  const net = fakeNet([
    ['wbsearchentities', wd()],
    ['translate_a/single', [[[en, t]], null, 'tr']],
    [`/movie/top/search=${encodeURIComponent(en)}`, cm(en)],
    ['/movie/top/search=', cm()],
    ['/series/top/search=', cm()],
  ]);
  assert.equal(await lookupFilm({ net, title: t }), 'film');
  assert.ok(net.calls.some((u) => u.includes('sl=auto&tl=en')), 'çeviri istendi (dil otomatik tespit)');
});

test('lookupFilm: genel tek sözcük çeviriyle aranmaz ("Aile" → "Family" filmi yanlış eşleşmesin)', async () => {
  const net = fakeNet([['wbsearchentities', wd()], ['/movie/top/search=', cm()], ['/series/top/search=', cm()], ['translate_a/single', [[['Family', 'Aile']]]]]);
  assert.equal(await lookupFilm({ net, title: 'Aile' }), 'none');
  assert.ok(!net.calls.some((u) => u.includes('translate_a')), 'çeviriye gidilmez');
});

test('lookupFilm: hiçbir kaynak bulamazsa none (kısa süre saklanır); hepsi hata verirse boş ve kaydedilmez', async () => {
  const cache = memCache();
  const ok = fakeNet([['wbsearchentities', wd()], ['/movie/top/search=', cm()], ['/series/top/search=', cm()], ['translate_a/single', [[['x', 'y']]]]]);
  assert.equal(await lookupFilm({ net: ok, cache, title: 'Bilinmeyen Bir Program Adı', now: 0 }), 'none');
  const n = ok.calls.length;
  assert.equal(await lookupFilm({ net: ok, cache, title: 'Bilinmeyen Bir Program Adı', now: 1000 }), 'none');
  assert.equal(ok.calls.length, n, 'önbellekten');
  await lookupFilm({ net: ok, cache, title: 'Bilinmeyen Bir Program Adı', now: NONE_TTL + 5 });
  assert.ok(ok.calls.length > n, 'süre dolunca yeniden denenir');
  const down = fakeNet([['', new Error('ağ yok')]]);
  const c2 = memCache();
  assert.equal(await lookupFilm({ net: down, cache: c2, title: 'Başka Bir Program', now: 0 }), '');
  assert.equal(c2._m.size, 0, 'hata kaydedilmez');
});

test('createFilmResolver: kuyruk sırayla çözer, film bulununca bildirir, yerel kanıt ağa gitmeden film sayar, tekrar istek yinelemez', async () => {
  const seen = [];
  const lookup = async ({ title }) => { seen.push(title); return /Film/.test(title) ? 'film' : 'none'; };
  const r = createFilmResolver({ net: {}, lookup, local: (t) => t === 'Yerel Kütüphane Filmi', concurrency: 2 });
  let changes = 0;
  r.request(['Bir Film', 'Haber Programı', 'Yerel Kütüphane Filmi', 'Bir Film'], () => { changes++; });
  assert.equal(r.verdict('Yerel Kütüphane Filmi'), 'film');
  await new Promise((res) => setTimeout(res, 400));
  assert.deepEqual(seen, ['Bir Film', 'Haber Programı']);
  assert.equal(r.verdict('Bir Film'), 'film');
  assert.equal(r.verdict('Haber Programı'), 'none');
  assert.equal(r.verdict('Hiç sorulmayan'), '');
  assert.equal(changes, 1, 'bildirim birleştirilir');
  r.request(['Bir Film', 'Haber Programı']);
  await new Promise((res) => setTimeout(res, 50));
  assert.deepEqual(seen, ['Bir Film', 'Haber Programı'], 'çözülenler yeniden sorulmaz');
  r.stop();
});

test('createFilmResolver: ağ hatası (boş karar) kalıcı sayılmaz, sonraki istekte yeniden denenir; bütçe aşılmaz', async () => {
  let n = 0;
  const lookup = async () => (++n === 1 ? '' : 'film');
  const r = createFilmResolver({ net: {}, lookup, concurrency: 1 });
  r.request(['Başka Film']);
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(r.verdict('Başka Film'), '');
  r.request(['Başka Film']);
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(r.verdict('Başka Film'), 'film');
  const small = createFilmResolver({ net: {}, lookup: async () => 'none', concurrency: 1, budget: 2 });
  small.request(['a b c', 'd e f', 'g h i']);
  await new Promise((res) => setTimeout(res, 30));
  assert.equal(small.verdict('g h i'), '', 'bütçe dolunca sorulmaz');
});

test('keyOf / wikiLang: Latin olmayan alfabelerde boş anahtar çıkmaz; dil kodları Wikidata biçimine çevrilir', () => {
  assert.equal(keyOf('Властелин колец: Две крепости'), 'властелин колец две крепости');
  assert.equal(keyOf('ВЛАСТЕЛИН КОЛЕЦ'), keyOf('властелин колец'));
  assert.notEqual(keyOf('指环王2：双塔奇兵'), '2');
  assert.equal(wikiLang('zh-CN'), 'zh');
  assert.equal(wikiLang('iw'), 'he');
  assert.equal(wikiLang('de'), 'de');
  assert.equal(wikiLang(''), '');
  assert.equal(wikiLang(undefined), '');
});

test('lookupFilm: Almanca ad — dil tespit edilir, Wikidata\'da kendi dilinde aranır', async () => {
  const t = 'Der Herr der Ringe: Die zwei Türme';
  const net = fakeNet([
    ['language=de', wd([t, '2002 film directed by Peter Jackson'])],
    ['wbsearchentities', wd()],
    ['/movie/top/search=', cm()],
    ['/series/top/search=', cm()],
    ['translate_a/single', [[['The Lord of the Rings: The Two Towers', t]], null, 'de']],
  ]);
  assert.equal(await lookupFilm({ net, title: t }), 'film');
  assert.ok(net.calls.some((u) => u.includes('language=de')));
});

test('lookupFilm: Rusça (Kiril) ad — tek sözcük bile kendi dilindeki Wikidata kaydından bulunur; İngilizce çeviri yalnız uzun adlarda aranır', async () => {
  const net = fakeNet([
    ['language=ru', wd(['Титаник', '1997 film directed by James Cameron'], ['Титаник', 'British ocean liner'])],
    ['translate_a/single', [[['Titanic', 'Титаник']], null, 'ru']],
  ]);
  assert.equal(await lookupFilm({ net, title: 'ТИТАНИК' }), 'film');
  assert.ok(!net.calls.some((u) => u.includes('language=tr')), 'Latin olmayan adda Türkçe arama atlanır');
  assert.ok(!net.calls.some((u) => u.includes('/catalog/')), 'tek sözcüklü çeviriyle Cinemeta aranmaz');
});

test('lookupFilm: Arapça ad — dil Wikidata kodu olarak kullanılır, bulunamazsa İngilizce çeviriyle Cinemeta aranır', async () => {
  const t = 'سيد الخواتم: البرجان';
  const en = 'The Lord of the Rings: The Two Towers';
  const net = fakeNet([
    ['language=ar', wd()],
    ['language=en', wd()],
    ['translate_a/single', [[[en, t]], null, 'ar']],
    [`/movie/top/search=${encodeURIComponent(en)}`, cm(en)],
    ['/movie/top/search=', cm()],
    ['/series/top/search=', cm()],
  ]);
  assert.equal(await lookupFilm({ net, title: t }), 'film');
});
