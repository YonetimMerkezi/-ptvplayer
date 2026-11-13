import test from 'node:test';
import assert from 'node:assert/strict';
import { matchMovieMetadata, loadMovieMetadata } from '../www/js/movie-metadata.js';

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

test('IMDb puanını yalnız kimlik doğrulandıktan sonra döndürür', async () => {
  const calls = [];
  const net = { json: async (url) => {
    calls.push(url);
    if (url.includes('/catalog/')) return { metas: [{ name: 'The Shawshank Redemption', aliases: ['Esaretin Bedeli'], year: '1994', imdb_id: 'tt0111161' }] };
    return { meta: { id: 'tt0111161', imdb_id: 'tt0111161', imdbRating: '9.3' } };
  }};
  const meta = await loadMovieMetadata(net, { name: 'Esaretin Bedeli' }, { year: '1994' });
  assert.equal(meta.imdbId, 'tt0111161');
  assert.equal(meta.imdbRating, '9.3');
  assert.equal(calls.length, 2);
});

test('kimlik uyuşmazlığında puan döndürmez', async () => {
  const net = { json: async (url) => url.includes('/catalog/')
    ? { metas: [{ name: 'The Shawshank Redemption', aliases: ['Esaretin Bedeli'], year: '1994', imdb_id: 'tt0111161' }] }
    : { meta: { id: 'tt1375666', imdb_id: 'tt1375666', imdbRating: '8.8' } } };
  assert.equal(await loadMovieMetadata(net, { name: 'Esaretin Bedeli' }, { year: '1994' }), null);
});
