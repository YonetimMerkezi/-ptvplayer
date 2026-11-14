import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTmdbDescriptors, pickCert } from '../worker/worker.js';

test('TMDB film yayın tanımlayıcıları içerik uyarılarına çevrilir', () => {
  const result = pickCert({
    release_dates: { results: [
      { iso_3166_1: 'GB', release_dates: [{ certification: '15', descriptors: ['strong violence', 'strong language', 'sex references'] }] },
    ] },
  }, 'movie');
  assert.equal(result.cert, '15+');
  assert.equal(result.csrc, 'GB');
  assert.equal(result.w.siddet, 2);
  assert.equal(result.w.cinsellik, 2);
  assert.equal(result.w.olumsuz, 2);
});

test('TMDB dizi içerik tanımlayıcıları yaş sınıfı olmasa da alınır', () => {
  const result = pickCert({
    content_ratings: { results: [
      { iso_3166_1: 'US', rating: 'TV-MA', descriptors: ['violence', 'nudity', 'fear'] },
    ] },
  }, 'tv');
  assert.equal(result.cert, '18+');
  assert.equal(result.csrc, 'US');
  assert.equal(result.w.siddet, 2);
  assert.equal(result.w.ciplaklik, 2);
  assert.equal(result.w.korku, 2);
});

test('bilinmeyen TMDB tanımlayıcıları otomatik uyarı üretmez', () => {
  assert.deepEqual(classifyTmdbDescriptors(['general audience', 'mild thematic elements']), {});
});
