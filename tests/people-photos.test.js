import test from 'node:test';
import assert from 'node:assert/strict';
import { nameKey, commonsThumb, filmCastQuery, byNameQuery, parsePhotos, loadPersonPhotos, PHOTO_TTL, PHOTO_MISS_TTL } from '../www/js/people-photos.js';
import { sparqlStr, rowsOf, WIKI_UA } from '../www/js/wdqs.js';

const row = (name, img, sl) => ({ name: { value: name }, img: { value: img }, ...(sl ? { sl: { value: String(sl) } } : {}) });
const res = (...rows) => ({ results: { bindings: rows } });
const cm = (f) => `http://commons.wikimedia.org/wiki/Special:FilePath/${f}`;
const mem = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v) }; };

test('adlar: noktalama ve harf farkı aynı anahtar; Commons adresi https küçük resme çevrilir, başka adres reddedilir', () => {
  assert.equal(nameKey('Robert Downey Jr.'), nameKey('robert downey jr'));
  assert.equal(nameKey('Zoë Saldaña'), 'zoe saldana');
  assert.equal(commonsThumb(cm('Johnny%20Depp.jpg')), 'https://commons.wikimedia.org/wiki/Special:FilePath/Johnny%20Depp.jpg?width=240');
  assert.equal(commonsThumb('https://commons.wikimedia.org/wiki/Special:FilePath/A.jpg'), 'https://commons.wikimedia.org/wiki/Special:FilePath/A.jpg?width=240');
  assert.equal(commonsThumb('http://evil.example/x.jpg'), '');
  assert.equal(commonsThumb(''), '');
});

test('SPARQL: kaçışlı dizgeler; film kadrosu (P161 + P57) ve ada göre sorgu (insan, oyuncu/yönetmen mesleği, bağlantı sayısına göre)', () => {
  assert.equal(sparqlStr('Ali "Veli" \\ x'), 'Ali \\"Veli\\" \\\\ x');
  const q = filmCastQuery('tt0121164');
  assert.match(q, /wdt:P345 "tt0121164"/);
  assert.match(q, /wdt:P161 \?p[\s\S]*UNION[\s\S]*wdt:P57 \?p/);
  assert.match(q, /\?p wdt:P18 \?img/);
  const n = byNameQuery(['Johnny Depp', 'Tim "Burton"']);
  assert.match(n, /VALUES \?name \{ "Johnny Depp"@en "Tim \\"Burton\\""@en \}/);
  assert.match(n, /wdt:P31 wd:Q5/);
  assert.match(n, /wdt:P279\* \?root/);
  assert.match(n, /VALUES \?root \{ wd:Q33999 wd:Q2526255 \}/);
  assert.match(n, /ORDER BY DESC\(\?sl\)/);
  assert.equal(rowsOf(null).length, 0);
  assert.ok(WIKI_UA.includes('IptvPlayerPro'));
});

test('sonuç: ilk satır (en çok bağlantılı) kalır; Commons dışı adres ve bozuk satır atlanır', () => {
  const m = parsePhotos(res(row('Chris Evans', cm('Evans%20A.jpg'), 90), row('Chris Evans', cm('Evans%20B.jpg'), 20), row('X Y', 'http://evil/x.jpg'), row('', cm('Z.jpg'))));
  assert.equal(m.size, 1);
  assert.match(m.get('chris evans'), /Evans%20A\.jpg\?width=240$/);
});

test('yükleme: önce yapımın kadrosu; eksik adlar tek ek istekle ada göre; sonuç kişi başına önbelleğe yazılır', async () => {
  const cache = mem();
  const qs = [];
  const net = { json: async (url) => {
    const q = decodeURIComponent(url.split('query=')[1]);
    qs.push(q);
    if (q.includes('wdt:P161')) return res(row('Johnny Depp', cm('Depp.jpg')), row('Tim Burton', cm('Burton.jpg')));
    return res(row('Helena Bonham Carter', cm('HBC.jpg'), 60));
  } };
  const names = ['Johnny Depp', 'Helena Bonham Carter', 'Tim Burton', 'Fotoğrafsız Kişi'];
  const r = await loadPersonPhotos({ net, cache, names, imdbId: 'tt0121164' });
  assert.equal(qs.length, 2);
  assert.match(qs[1], /VALUES \?name \{ "Helena Bonham Carter"@en "Fotoğrafsız Kişi"@en \}/, 'kadrodan gelenler ada göre aranmaz');
  assert.deepEqual([...r.keys()].sort(), ['helena bonham carter', 'johnny depp', 'tim burton']);
  assert.equal(cache.m.get('person-photo:v1:fotografsiz kisi').url, '', 'bulunamayan da (kısa süre) önbelleğe yazılır');
  const again = await loadPersonPhotos({ net, cache, names, imdbId: 'tt0121164' });
  assert.equal(qs.length, 2, 'tümü önbellekten');
  assert.equal(again.size, 3);
});

test('yükleme: IMDb kimliği yoksa yalnız ada göre; ağ hatasında boş döner ve "yok" yazılmaz; önbellek süreleri', async () => {
  const cache = mem();
  const bad = { json: async () => { throw new Error('ağ yok'); } };
  const r = await loadPersonPhotos({ net: bad, cache, names: ['Johnny Depp'] });
  assert.equal(r.size, 0);
  assert.equal(cache.m.size, 0, 'ağ hatası önbelleğe yazılmaz');
  let n = 0;
  const net = { json: async () => { n += 1; return res(row('Johnny Depp', cm('Depp.jpg'), 99)); } };
  await loadPersonPhotos({ net, cache, names: ['Johnny Depp'], now: 1000 });
  assert.equal(n, 1, 'imdbId yok: tek istek (ada göre)');
  await loadPersonPhotos({ net, cache, names: ['Johnny Depp'], now: 1000 + PHOTO_TTL + 1 });
  assert.equal(n, 2, 'bulunan 30 gün sonra yenilenir');
  const c2 = mem();
  const none = { json: async () => { n += 1; return res(); } };
  await loadPersonPhotos({ net: none, cache: c2, names: ['Kimse Yok'], now: 0 });
  const before = n;
  await loadPersonPhotos({ net: none, cache: c2, names: ['Kimse Yok'], now: PHOTO_MISS_TTL - 1 });
  assert.equal(n, before, 'bulunamayan 3 gün önbellekte');
  await loadPersonPhotos({ net: none, cache: c2, names: ['Kimse Yok'], now: PHOTO_MISS_TTL + 1 });
  assert.equal(n, before + 1);
});
