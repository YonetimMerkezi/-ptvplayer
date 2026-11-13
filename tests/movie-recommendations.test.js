import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendMovies } from '../www/js/movie-recommendations.js';

test('benzer filmler aynı kategoriye öncelik verir ve mevcut filmi dışarıda bırakır', () => {
  const current = { id: 'm1', kind: 'movie', name: 'Film A', group: 'Aksiyon' };
  const picks = recommendMovies(current, {}, [
    current,
    { id: 'm2', kind: 'movie', name: 'Film B', group: 'Aksiyon' },
    { id: 'm3', kind: 'movie', name: 'Film C', group: 'Komedi' },
    { id: 's1', kind: 'series', name: 'Dizi', group: 'Aksiyon' },
  ]);
  assert.deepEqual(picks.map((x) => x.id), ['m2']);
});

test('tür, oyuncu/yönetmen adı ve puan eşleşmesi sıralamaya katkı verir', () => {
  const current = { id: 'm1', kind: 'movie', name: 'Kayıp', group: 'Drama' };
  const picks = recommendMovies(current, { genre: 'Aksiyon, Macera', cast: 'Tom Hanks', director: 'Steven Spielberg' }, [
    { id: 'm2', kind: 'movie', name: 'Tom Hanks ile Macera', group: 'Drama', rating: 8 },
    { id: 'm3', kind: 'movie', name: 'Başka Film', group: 'Drama', rating: 5 },
  ]);
  assert.equal(picks[0].id, 'm2');
});

test('izlenmiş içerikler ve limit dışı içerikler önerilmez', () => {
  const current = { id: 'm1', kind: 'movie', name: 'A', group: 'Aksiyon' };
  const picks = recommendMovies(current, {}, [
    { id: 'm2', kind: 'movie', name: 'B', group: 'Aksiyon' },
    { id: 'm3', kind: 'movie', name: 'C', group: 'Aksiyon' },
  ], { limit: 1, excludeIds: ['m2'] });
  assert.deepEqual(picks.map((x) => x.id), ['m3']);
});