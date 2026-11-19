import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDetail, loadDetail, peopleOf, personFilms, searchPerson, parseNewCatalog, loadNewReleases, buildTitleIndex, findInLibrary, trailerEmbedUrl, trailerWatchUrl, trailerThumbUrl, trailerIds, trailerQuery, trailerTitle, trailerSearchUrl, genreTr, MAX_TRAILERS, MISS_TTL, DETAIL_TTL, NEW_TTL, NEW_MAX, NEW_MIN, CINEMETA } from '../www/js/cinemeta.js';

const FORREST = { id: 'tt0109830', imdb_id: 'tt0109830', name: 'Forrest Gump', year: '1994', runtime: '142 min', genres: ['Drama', 'Romance'], description: 'Özet', poster: 'https://p/x.jpg', trailers: [{ source: '0jKUpBmYO1Q', type: 'Trailer' }, { source: 'm-btyJIYLyI', type: 'Trailer' }, { source: 'BADID', type: 'Trailer' }, { source: 'abcdefghijk', type: 'Clip' }], trailerStreams: [{ title: 'x', ytId: '0jKUpBmYO1Q' }, { title: 'y', ytId: 'Mj9IA9tTfio' }], cast: ['Tom Hanks', 'Robin Wright', 'Gary Sinise'], director: ['Robert Zemeckis'], links: [{ category: 'Cast', name: 'Sally Field' }, { category: 'Cast', name: 'tom hanks' }, { category: 'Genres', name: 'Drama' }] };
const mem = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v) }; };

test('ayrıntı: fragman kimlikleri geçerli, yinelenmeyen ve klip olmayan; oyuncular birleşir; yönetmen ve tür gelir', () => {
  const d = parseDetail(FORREST);
  assert.equal(d.imdbId, 'tt0109830');
  assert.deepEqual(d.trailers, ['0jKUpBmYO1Q', 'm-btyJIYLyI', 'Mj9IA9tTfio']);
  assert.deepEqual(d.cast, ['Tom Hanks', 'Robin Wright', 'Gary Sinise', 'Sally Field'], 'links içindeki oyuncu eklenir, aynı ad büyük/küçük harf farkıyla yinelenmez');
  assert.deepEqual(d.director, ['Robert Zemeckis']);
  assert.equal(d.year, 1994);
  assert.deepEqual(d.genres, ['Drama', 'Romance']);
  assert.equal(parseDetail(null), null);
  assert.equal(parseDetail({ id: 'xx' }), null);
  assert.equal(parseDetail({ ...FORREST, year: '2019–2023' }, 'series').year, 2019);
  assert.equal(parseDetail({ ...FORREST }, 'series').type, 'series');
});

test('ayrıntı yükleme: önbellek, süre dolumu, bulunamayan kayıt kısa süre saklanır, ağ hatası saklanmaz', async () => {
  const cache = mem();
  let n = 0;
  const net = { json: async (url) => { n++; assert.equal(url, `${CINEMETA}/meta/movie/tt0109830.json`); return { meta: FORREST }; } };
  const a = await loadDetail({ net, cache, imdbId: 'tt0109830', now: 1000 });
  const b = await loadDetail({ net, cache, imdbId: 'tt0109830', now: 2000 });
  assert.equal(n, 1);
  assert.deepEqual(a, b);
  await loadDetail({ net, cache, imdbId: 'tt0109830', now: 1000 + DETAIL_TTL + 1 });
  assert.equal(n, 2, 'süre dolunca yeniden alınır');
  const miss = { json: async () => { n++; return { meta: {} }; } };
  assert.equal(await loadDetail({ net: miss, cache, imdbId: 'tt9999999', now: 0 }), null);
  const before = n;
  assert.equal(await loadDetail({ net: miss, cache, imdbId: 'tt9999999', now: MISS_TTL - 1 }), null);
  assert.equal(n, before, 'bulunamayan kısa süre tekrar sorulmaz');
  await loadDetail({ net: miss, cache, imdbId: 'tt9999999', now: MISS_TTL + 1 });
  assert.equal(n, before + 1);
  const bad = { json: async () => { throw new Error('ağ yok'); } };
  await assert.rejects(loadDetail({ net: bad, cache, imdbId: 'tt1111111' }), /ağ yok/);
  assert.equal(cache.m.has('cinemeta:detail:v2:movie:tt1111111'), false);
  assert.equal(await loadDetail({ net, cache, imdbId: 'geçersiz' }), null);
  let url = '';
  await loadDetail({ net: { json: async (u) => ((url = u), { meta: { ...FORREST, id: 'tt0903747', imdb_id: 'tt0903747' } }) }, imdbId: 'tt0903747', type: 'series' });
  assert.match(url, /\/meta\/series\/tt0903747\.json$/);
});

test('kişiler: önce yönetmen, sonra oyuncular; Cinemeta yoksa sağlayıcı metni bölünür; aynı kişi bir kez', () => {
  const d = parseDetail(FORREST);
  const p = peopleOf(d);
  assert.deepEqual(p.slice(0, 3).map((x) => [x.name, x.role]), [['Robert Zemeckis', 'Yönetmen'], ['Tom Hanks', ''], ['Robin Wright', '']]);
  const q = peopleOf(null, { cast: 'Ali Veli, Ayşe Fatma / Can Yılmaz', director: 'Cem Aydın' });
  assert.deepEqual(q.map((x) => x.name), ['Cem Aydın', 'Ali Veli', 'Ayşe Fatma', 'Can Yılmaz']);
  const dual = peopleOf({ director: ['Clint Eastwood'], cast: ['Clint Eastwood', 'Morgan Freeman'] });
  assert.deepEqual(dual.map((x) => [x.name, x.role]), [['Clint Eastwood', 'Yönetmen'], ['Morgan Freeman', '']]);
  assert.deepEqual(peopleOf(null, {}), []);
});

const SEARCH = [
  { id: 'tt26688393', type: 'movie', name: 'Tom Hanks: The Nomad', releaseInfo: '2023', poster: 'https://p/1' },
  { id: 'tt0120689', imdb_id: 'tt0120689', type: 'movie', name: 'The Green Mile', releaseInfo: '1999', poster: 'https://p/2' },
  { id: 'tt0109830', type: 'movie', name: 'Forrest Gump', releaseInfo: '1994', poster: 'https://p/3' },
  { id: 'tt0109830', type: 'movie', name: 'Forrest Gump', releaseInfo: '1994' },
  { id: 'kitsu:1', type: 'movie', name: 'Başka Kaynak', releaseInfo: '2000' },
  { id: 'tt0000001', type: 'series', name: 'Mini Dizi', releaseInfo: '2019–2020' },
];

test('oyuncu filmleri: adı başlıkta geçen belgeseller, yinelenenler ve IMDb dışı kimlikler elenir', () => {
  const films = personFilms(SEARCH, 'Tom Hanks');
  assert.deepEqual(films.map((f) => f.name), ['The Green Mile', 'Forrest Gump', 'Mini Dizi']);
  assert.deepEqual(films[0], { imdbId: 'tt0120689', type: 'movie', name: 'The Green Mile', year: 1999, poster: 'https://p/2' });
  assert.equal(films[2].type, 'series');
  assert.equal(films[2].year, 2019);
  assert.deepEqual(personFilms(null, 'x'), []);
  assert.equal(personFilms(SEARCH, 'tom   hanks'.replace(/\s+/g, ' ')).length, 3);
});

test('oyuncu araması: film ve dizi ayrı aranır, 7 gün önbelleklenir, biri başarısızsa kısmi sonuç önbelleğe yazılmaz, ikisi de başarısızsa hata', async () => {
  const cache = mem();
  const urls = [];
  const net = { json: async (u) => (urls.push(u), { metas: u.includes('/catalog/series/') ? [SEARCH[5]] : SEARCH.slice(0, 5) }) };
  const r = await searchPerson({ net, cache, name: 'Tom Hanks', now: 5 });
  assert.equal(r.movies.length, 2);
  assert.equal(r.series.length, 1);
  assert.ok(r.movies.every((f) => f.type === 'movie') && r.series.every((f) => f.type === 'series'));
  assert.ok(urls.some((u) => u === `${CINEMETA}/catalog/movie/top/search=Tom%20Hanks.json`));
  assert.ok(urls.some((u) => u === `${CINEMETA}/catalog/series/top/search=Tom%20Hanks.json`));
  await searchPerson({ net, cache, name: 'tom hanks', now: 6 });
  assert.equal(urls.length, 2, 'önbellekten');
  const half = { json: async (u) => { if (u.includes('/series/')) throw new Error('x'); return { metas: SEARCH }; } };
  const c2 = mem();
  const r2 = await searchPerson({ net: half, cache: c2, name: 'Ali', now: 1 });
  assert.equal(r2.series.length, 0);
  assert.equal(c2.m.size, 0, 'kısmi sonuç saklanmaz');
  await assert.rejects(searchPerson({ net: { json: async () => { throw new Error('çevrimdışı'); } }, cache: mem(), name: 'Ali' }), /çevrimdışı/);
  assert.deepEqual(await searchPerson({ net, name: '  ' }), { movies: [], series: [] });
});

test('listeyle eşleştirme: ad+yıl, Türkçe adlı kayıt IMDb dizininden, yıl farkı en çok 1', () => {
  const lib = [
    { id: 'm1', name: 'Forrest Gump (1994)', kind: 'movie' },
    { id: 'm2', name: 'The Green Mile | 1999 | HD', kind: 'movie' },
    { id: 'm3', name: 'Yeşil Yol', kind: 'movie' },
    { id: 'm4', name: 'Forrest Gump 2', year: 2010, kind: 'movie' },
  ];
  const titleIndex = buildTitleIndex(lib);
  const f = (name, year, imdbId = 'tt1') => ({ imdbId, name, year });
  assert.equal(findInLibrary(f('Forrest Gump', 1994), { titleIndex }).id, 'm1');
  assert.equal(findInLibrary(f('The Green Mile', 1999), { titleIndex }).id, 'm2');
  assert.equal(findInLibrary(f('Forrest Gump', 1990), { titleIndex }), null, 'yıl çok farklıysa farklı film');
  assert.equal(findInLibrary(f('Forrest Gump', 1995), { titleIndex }).id, 'm1', 'bir yıl fark tolere edilir');
  assert.equal(findInLibrary(f('The Green Mile', 1999, 'tt0120689'), { titleIndex, imdbIndex: new Map([['tt0120689', lib[2]]]) }).id, 'm3', 'IMDb dizini önceliklidir');
  assert.equal(findInLibrary(f('Hiç Yok', 2001), { titleIndex }), null);
  assert.equal(findInLibrary(null, { titleIndex }), null);
  assert.equal(findInLibrary(f('Forrest Gump', 1994), {}), null);
});

test('YouTube adresleri: gömme sessiz/otomatik başlar, köken yalnız http(s) ise eklenir', () => {
  const u = new URL(trailerEmbedUrl('0jKUpBmYO1Q', { muted: true, origin: 'https://localhost' }));
  assert.equal(u.origin + u.pathname, 'https://www.youtube.com/embed/0jKUpBmYO1Q');
  assert.equal(u.searchParams.get('autoplay'), '1');
  assert.equal(u.searchParams.get('mute'), '1');
  assert.equal(u.searchParams.get('enablejsapi'), '1');
  assert.equal(u.searchParams.get('playsinline'), '1');
  assert.equal(u.searchParams.get('rel'), '0');
  for (const [k, v] of [['controls', '0'], ['disablekb', '1'], ['fs', '0'], ['iv_load_policy', '3'], ['cc_load_policy', '0']]) assert.equal(u.searchParams.get(k), v, 'YouTube kontrolleri kapalı: ' + k);
  assert.equal(u.searchParams.get('origin'), 'https://localhost');
  assert.equal(new URL(trailerEmbedUrl('0jKUpBmYO1Q', { muted: false, origin: 'file://' })).searchParams.has('origin'), false);
  assert.equal(new URL(trailerEmbedUrl('0jKUpBmYO1Q', { muted: false })).searchParams.get('mute'), '0');
  assert.equal(trailerWatchUrl('0jKUpBmYO1Q'), 'https://www.youtube.com/watch?v=0jKUpBmYO1Q');
  assert.equal(trailerThumbUrl('0jKUpBmYO1Q'), 'https://i.ytimg.com/vi/0jKUpBmYO1Q/hqdefault.jpg');
});

const meta = (n, o = {}) => ({ id: `tt${1000 + n}`, imdb_id: `tt${1000 + n}`, type: 'movie', name: `Film ${n}`, releaseInfo: '2026', poster: `https://metahub.space/poster/${n}.jpg`, ...o });

test('yeni çıkanlar: afişsiz, adsız, IMDb dışı ve yinelenen kayıtlar elenir; sıra korunur; en çok NEW_MAX', () => {
  const json = { metas: [meta(1), meta(2, { poster: '' }), meta(3, { name: '' }), meta(1), { id: 'kitsu:5', name: 'X', poster: 'https://p/x' }, meta(4, { poster: 'http://p/düz-http' }), meta(5, { releaseInfo: '2025' })] };
  const out = parseNewCatalog(json);
  assert.deepEqual(out.map((f) => f.imdbId), ['tt1001', 'tt1005']);
  assert.deepEqual(out[0], { imdbId: 'tt1001', type: 'movie', name: 'Film 1', year: 2026, poster: 'https://metahub.space/poster/1.jpg' });
  assert.equal(parseNewCatalog({ metas: Array.from({ length: 80 }, (_, i) => meta(i)) }).length, NEW_MAX);
  assert.deepEqual(parseNewCatalog(null), []);
  assert.deepEqual(parseNewCatalog({ metas: 'x' }), []);
});

test('yeni çıkanlar yükleme: yıl kataloğu, 6 saat önbellek, ağ hatasında eski önbellek, yoksa hata; boş liste saklanmaz', async () => {
  const cache = mem();
  const urls = [];
  const many = { metas: Array.from({ length: NEW_MIN + 3 }, (_, i) => meta(i)) };
  const net = { json: async (u) => (urls.push(u), many) };
  const date = new Date(2026, 5, 15);
  const a = await loadNewReleases({ net, cache, now: 1000, date });
  assert.equal(a.films.length, NEW_MIN + 3);
  assert.deepEqual(urls, [`${CINEMETA}/catalog/movie/year/genre=2026.json`]);
  await loadNewReleases({ net, cache, now: 2000, date });
  assert.equal(urls.length, 1, 'önbellekten');
  const down = { json: async () => { throw new Error('ağ yok'); } };
  const stale = await loadNewReleases({ net: down, cache, now: 1000 + NEW_TTL + 1, date });
  assert.equal(stale.stale, true);
  assert.equal(stale.films.length, NEW_MIN + 3);
  await assert.rejects(loadNewReleases({ net: down, cache: mem(), now: 5, date }), /ağ yok/);
  const empty = { json: async () => ({ metas: [] }) };
  const c2 = mem();
  await assert.rejects(loadNewReleases({ net: empty, cache: c2, now: 5, date }), /boş/);
  assert.equal(c2.m.size, 0);
});

test('yeni çıkanlar yükleme: yıl başında az film varsa önceki yıl da eklenir (yinelenmeden), önceki yıl hatası yoksayılır', async () => {
  const urls = [];
  const net = { json: async (u) => (urls.push(u), { metas: u.includes('genre=2026') ? [meta(1), meta(2)] : [meta(2), meta(3, { releaseInfo: '2025' })] }) };
  const r = await loadNewReleases({ net, cache: null, now: 0, date: new Date(2026, 0, 10) });
  assert.deepEqual(r.films.map((f) => f.imdbId), ['tt1001', 'tt1002', 'tt1003']);
  assert.equal(urls.length, 2);
  const flaky = { json: async (u) => { if (u.includes('genre=2025')) throw new Error('x'); return { metas: [meta(1)] }; } };
  assert.equal((await loadNewReleases({ net: flaky, cache: null, date: new Date(2026, 1, 1) })).films.length, 1);
  const late = [];
  await loadNewReleases({ net: { json: async (u) => (late.push(u), { metas: [meta(1)] }) }, cache: null, date: new Date(2026, 8, 1) });
  assert.equal(late.length, 1, 'yılın ilerleyen aylarında önceki yıl istenmez');
});

test('fragman kimlikleri: Cinemeta önce, sağlayıcının fragmanı ardından; yinelenen ve geçersiz atılır; en çok 4', () => {
  assert.deepEqual(trailerIds({ trailers: ['aaaaaaaaaaa', 'bbbbbbbbbbb'] }, 'https://youtu.be/bbbbbbbbbbb'), ['aaaaaaaaaaa', 'bbbbbbbbbbb']);
  assert.deepEqual(trailerIds({ trailers: ['aaaaaaaaaaa'] }, 'ccccccccccc'), ['aaaaaaaaaaa', 'ccccccccccc']);
  assert.deepEqual(trailerIds(null, 'ccccccccccc'), ['ccccccccccc'], 'Cinemeta eşleşmesi yoksa yalnız sağlayıcının fragmanı');
  assert.deepEqual(trailerIds({ trailers: [] }, ''), []);
  assert.deepEqual(trailerIds(null, 'geçersiz'), []);
  assert.deepEqual(trailerIds({ trailers: ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee'] }, 'fffffffffff').length, MAX_TRAILERS);
});

test('fragman araması: katalog adındaki dil öneki, kalite etiketi ve yıl ayıklanır; adres kaçışlıdır', () => {
  assert.equal(trailerQuery('TR | Kuruluş Osman (2020)'), 'Kuruluş Osman 2020 fragman');
  assert.equal(trailerQuery('TR ⇒ Çılgın Dersane'), 'Çılgın Dersane fragman');
  assert.equal(trailerQuery('Aşk-ı Memnu 2008 FHD'), 'Aşk-ı Memnu 2008 fragman');
  assert.equal(trailerQuery('The Matrix [4K]', '1999-03-31'), 'The Matrix 1999 fragman');
  assert.equal(trailerQuery('Yüzüklerin Efendisi: Yüzük Kardeşliği', 2001), 'Yüzüklerin Efendisi: Yüzük Kardeşliği 2001 fragman');
  assert.equal(trailerQuery('', ''), 'fragman');
  assert.equal(trailerQuery('Anatomy of a Scandal', 2022, 'official trailer'), 'Anatomy of a Scandal 2022 official trailer', 'özgün adla arama ek sözcüğü değişir');
  assert.equal(trailerSearchUrl('Kuruluş Osman 2020 fragman'), 'https://www.youtube.com/results?search_query=Kurulu%C5%9F%20Osman%202020%20fragman');
});

test('türler: İngilizce Cinemeta türleri Türkçeleşir; bilinmeyen tür olduğu gibi kalır', () => {
  assert.deepEqual(['Drama', 'Horror', 'Mystery', 'Sci-Fi', 'Reality-TV', 'Action'].map(genreTr), ['Dram', 'Korku', 'Gizem', 'Bilim kurgu', 'Reality', 'Aksiyon']);
  assert.equal(genreTr(' comedy '), 'Komedi');
  assert.equal(genreTr('Zorlu Tür'), 'Zorlu Tür');
  assert.equal(genreTr(null), '');
});

test('fragman adı: dil öneki ve etiketler ayıklanır, adda yıl varsa ayrılır', () => {
  assert.deepEqual(trailerTitle('TR | Kuruluş Osman (2020)'), { title: 'Kuruluş Osman', year: 2020 });
  assert.deepEqual(trailerTitle('Asla Teslim Olma'), { title: 'Asla Teslim Olma', year: 0 });
  assert.deepEqual(trailerTitle('', ''), { title: '', year: 0 });
});

test('kişi fotoğrafları: app_extras ve credits_cast birleşir; yalnız https ya da TMDB profil yolu; rol (karakter) kartta taşınır', () => {
  const meta = {
    ...FORREST,
    app_extras: {
      cast: [{ name: 'Tom Hanks', character: 'Forrest Gump', photo: 'https://img.example/hanks.jpg' }, { name: 'Robin Wright', character: 'Jenny', photo: 'http://insecure/x.jpg' }],
      directors: [{ name: 'Robert Zemeckis', photo: 'https://img.example/zemeckis.jpg' }],
    },
    credits_cast: [{ name: 'Robin Wright', character: 'Jenny Curran', profile_path: '/robin.jpg' }, { name: 'Gary Sinise', character: 'Lt. Dan', profile_path: '/../kotu' }],
  };
  const d = parseDetail(meta);
  const by = (n) => d.castInfo.find((x) => x.name === n);
  assert.equal(by('Tom Hanks').photo, 'https://img.example/hanks.jpg');
  assert.equal(by('Tom Hanks').character, 'Forrest Gump');
  assert.equal(by('Robin Wright').photo, 'https://image.tmdb.org/t/p/w185/robin.jpg', 'http reddedilir, TMDB yolu tamamlanır');
  assert.equal(by('Gary Sinise').photo, '', 'geçersiz yol reddedilir');
  assert.equal(d.directorInfo[0].photo, 'https://img.example/zemeckis.jpg');
  const people = peopleOf(d);
  const tom = people.find((x) => x.name === 'Tom Hanks');
  assert.deepEqual([tom.role, tom.character, tom.photo], ['', 'Forrest Gump', 'https://img.example/hanks.jpg']);
  assert.equal(people[0].photo, 'https://img.example/zemeckis.jpg');
  assert.equal(people[0].role, 'Yönetmen');
});

test('kişi fotoğrafları: meta.cast boşsa oyuncular kişi listelerinden gelir; fotoğraf yoksa boş alan (baş harfler gösterilir)', () => {
  const d = parseDetail({ ...FORREST, cast: undefined, links: [], app_extras: { cast: [{ name: 'Ali Veli', photo: 'https://i/a.jpg' }, { name: 'Ayşe Fatma' }] } });
  assert.deepEqual(d.cast, ['Ali Veli', 'Ayşe Fatma']);
  assert.deepEqual(peopleOf(d).filter((x) => x.role === '').map((x) => [x.name, x.photo]), [['Ali Veli', 'https://i/a.jpg'], ['Ayşe Fatma', '']]);
  assert.equal(peopleOf(null, { cast: 'Can Yılmaz' })[0].photo, '', 'Cinemeta yoksa sağlayıcı metni: fotoğrafsız');
});
