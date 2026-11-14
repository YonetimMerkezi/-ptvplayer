import test from 'node:test';
import assert from 'node:assert/strict';
import { matchMovieMetadata, loadMovieMetadata, parseMovieCatalogTitle, resolveMovieWithWikidata } from '../www/js/movie-metadata.js';

test('Türkçe veya orijinal ad tam eşleşirse doğru filmi bulur', () => {
  const rows = [
    { name: 'The Shawshank Redemption', aliases: ['Esaretin Bedeli'], year: '1994', imdb_id: 'tt0111161' },
    { name: 'Inception', aliases: ['Başlangıç'], year: '2010', imdb_id: 'tt1375666' },
  ];
  assert.equal(matchMovieMetadata(rows, 'Esaretin Bedeli', 1994).imdb_id, 'tt0111161');
  assert.equal(matchMovieMetadata(rows, 'Inception', 2010).imdb_id, 'tt1375666');
});

test('aynı adlı farklı yıllardaki filmleri karıştırmaz', () => {
  const rows = [
    { name: 'Dune', year: '1984', imdb_id: 'tt0087182' },
    { name: 'Dune', year: '2021', imdb_id: 'tt1160419' },
  ];
  assert.equal(matchMovieMetadata(rows, 'Dune', 2021).imdb_id, 'tt1160419');
  assert.equal(matchMovieMetadata(rows, 'Dune', 1990), null);
  assert.equal(matchMovieMetadata(rows, 'Dune'), null);
});

test('belirsiz eşleşmede film seçmez', () => {
  const rows = [
    { name: 'Crash', year: '1996', imdb_id: 'tt0115964' },
    { name: 'Crash', year: '2004', imdb_id: 'tt0375679' },
  ];
  assert.equal(matchMovieMetadata(rows, 'Crash'), null);
});

test('IMDb kimliğini doğrular; puan alanını uygulama metaverisine taşımaz', async () => {
  const calls = [];
  const net = { json: async (url) => {
    calls.push(url);
    if (url.includes('/catalog/')) return { metas: [{ name: 'The Shawshank Redemption', aliases: ['Esaretin Bedeli'], year: '1994', imdb_id: 'tt0111161' }] };
    return { meta: { id: 'tt0111161', imdb_id: 'tt0111161', imdbRating: '9.3' } };
  }};
  const meta = await loadMovieMetadata(net, { name: 'Esaretin Bedeli' }, { year: '1994' });
  assert.equal(meta.imdbId, 'tt0111161');
  assert.equal(Object.hasOwn(meta, 'imdbRating'), false);
  assert.equal(calls.length, 2);
});

test('kimlik uyuşmazlığında puan döndürmez', async () => {
  const net = { json: async (url) => url.includes('/catalog/')
    ? { metas: [{ name: 'The Shawshank Redemption', aliases: ['Esaretin Bedeli'], year: '1994', imdb_id: 'tt0111161' }] }
    : { meta: { id: 'tt1375666', imdb_id: 'tt1375666', imdbRating: '8.8' } } };
  assert.equal(await loadMovieMetadata(net, { name: 'The Shawshank Redemption' }, { year: '1994' }), null);
});

test('film kimliği ve puansız metaveri kalıcı önbelleğe yazılır', async () => {
  let saved = null;
  const store = { cache: {
    get: async () => null,
    set: async (key, value) => { saved = { key, value }; },
  } };
  const net = { json: async (url) => url.includes('/catalog/')
    ? { metas: [{ name: 'The Matrix', year: '1999', imdb_id: 'tt0133093' }] }
    : { meta: { id: 'tt0133093', imdb_id: 'tt0133093', imdbRating: '8.7', year: '1999', name: 'The Matrix' } } };
  const meta = await loadMovieMetadata(net, { name: 'The Matrix' }, { year: '1999' }, store);
  assert.equal(meta.imdbId, 'tt0133093');
  assert.match(saved.key, /^movie-metadata:v1:/);
  assert.equal(saved.value.value.imdbId, 'tt0133093');
  assert.equal(Object.hasOwn(saved.value.value, 'imdbRating'), false);
  assert.ok(saved.value.savedAt > 0);
});

test('IPTV başlığındaki yıl, sağlayıcı puanı ve kaynak eklerini ayıklar', () => {
  assert.deepEqual(parseMovieCatalogTitle('Fünye | 2025 | 6.3 | HMAX'), { title: 'Fünye', year: 2025 });
  assert.deepEqual(parseMovieCatalogTitle('Dune (2021)'), { title: 'Dune', year: 2021 });
});
test('ayrıştırılmış IPTV başlığıyla IMDb eşleşmesi yapar', async () => {
  const calls = [];
  const net = { json: async (url) => {
    calls.push(url);
    if (url.includes('/catalog/')) return { metas: [{ name: 'Dune', year: '2021', imdb_id: 'tt9999999' }] };
    return { meta: { id: 'tt9999999', imdb_id: 'tt9999999', imdbRating: '6.8', year: '2021', name: 'Dune' } };
  }};
  const meta = await loadMovieMetadata(net, { name: 'Dune | 2021 | 6.3 | HMAX' });
  assert.equal(meta.imdbId, 'tt9999999');
  assert.equal(Object.hasOwn(meta, 'imdbRating'), false);
  assert.match(calls[0], /search=Dune/);
});

test('Cinemeta sonucu yoksa otomatik Wikidata taraması yapmaz', async () => {
  const calls = [];
  const net = { json: async (url) => {
    calls.push(url);
    if (url.includes('/catalog/')) return { metas: [] };
    throw new Error('Beklenmeyen dış katalog isteği');
  }};
  assert.equal(await loadMovieMetadata(net, { name: 'Örnek Yerel Film | 2025' }), null);
  assert.ok(calls.every((url) => !url.includes('wikidata.org')));
});

test('Wikidata eşleştirmesi yıl uyuşmazlığında IMDb kimliği döndürmez', async () => {
  const net = { json: async (url) => url.includes('wbsearchentities')
    ? { search: [{ id: 'Q123', description: 'film' }] }
    : { entities: { Q123: {
      labels: { tr: { value: 'Aynı Adlı Film' } },
      claims: { P345: [{ mainsnak: { datavalue: { value: 'tt1234567' } } }], P577: [{ mainsnak: { datavalue: { value: { time: '+2020-01-01T00:00:00Z' } } } }] }
    } } } };
  assert.equal(await resolveMovieWithWikidata(net, 'Aynı Adlı Film', 2025), null);
});
test('orijinal başlık alanıyla Türkçe katalog adını otomatik eşleştirir', () => {
  const rows = [
    { name: 'The Woman in Cabin 10', original_name: 'The Woman in Cabin 10', aliases: ['10 Numaralı Kamara'], year: '2025', imdb_id: 'tt7130300' },
    { name: 'Cabin', year: '2011', imdb_id: 'tt9990001' },
  ];
  assert.equal(matchMovieMetadata(rows, '10 Numaralı Kamara', 2025).imdb_id, 'tt7130300');
});
test('yakın ama farklı film adında yanlış IMDb eşleşmesi yapmaz', () => {
  const rows = [
    { name: 'The Woman in Cabin', year: '2025', imdb_id: 'tt1111111' },
    { name: 'Cabin in the Woods', year: '2025', imdb_id: 'tt2222222' },
  ];
  assert.equal(matchMovieMetadata(rows, '10 Numaralı Kamara', 2025), null);
});
test('alternatif orijinal ad varsa sırayla arayıp doğru IMDb kaydını bulur', async () => {
  const calls = [];
  const net = { json: async (url) => {
    calls.push(url);
    if (url.includes('search=Yerel')) return { metas: [] };
    if (url.includes('search=Original')) return { metas: [{ name: 'Original Film', year: '2024', imdb_id: 'tt4444444' }] };
    return { meta: { id: 'tt4444444', imdb_id: 'tt4444444', imdbRating: '7.2', year: '2024', name: 'Original Film' } };
  }};
  const meta = await loadMovieMetadata(net, { name: 'Yerel Film | 2024', original_title: 'Original Film' });
  assert.equal(meta.imdbId, 'tt4444444');
  assert.equal(Object.hasOwn(meta, 'imdbRating'), false);
  assert.equal(calls.length, 3);
});
