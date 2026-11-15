import test from 'node:test';
import assert from 'node:assert/strict';
import { greeting, homeContinue, statusText } from '../www/js/home-extras.js';

test('greeting: saate göre karşılama', () => {
  assert.equal(greeting(7).text, 'İyi sabahlar, iyi seyirler');
  assert.equal(greeting(13).text, 'İyi günler, iyi seyirler');
  assert.equal(greeting(20).text, 'İyi akşamlar, iyi seyirler');
  assert.equal(greeting(20).emoji, '🌙');
  assert.equal(greeting(2).text, 'İyi geceler, iyi seyirler');
  assert.equal(greeting(5).text, 'İyi sabahlar, iyi seyirler');
  assert.equal(greeting(22).text, 'İyi geceler, iyi seyirler');
});

test('homeContinue: film ve dizi birleşir, aynı dizi bir kez, katalogda olmayan atlanır, sınır uygulanır', () => {
  const cat = { 'movie:m1': { id: 'm1' }, 'movie:m2': { id: 'm2' }, 'series:s1': { id: 's1' } };
  const lookup = (k, id) => cat[k + ':' + id];
  const prog = [
    { kind: 'episode', id: 'e5', parent: 's1' },
    { kind: 'movie', id: 'm1' },
    { kind: 'episode', id: 'e4', parent: 's1' },
    { kind: 'movie', id: 'yok' },
    { kind: 'live', id: 'c1' },
    { kind: 'episode', id: 'x', parent: null },
    { kind: 'movie', id: 'm2' },
  ];
  const r = homeContinue(prog, lookup);
  assert.deepEqual(r.map((x) => x.kind + ':' + x.it.id), ['series:s1', 'movie:m1', 'movie:m2']);
  assert.equal(homeContinue(prog, lookup, 2).length, 2);
  assert.deepEqual(homeContinue(null, lookup), []);
});

test('statusText: liste durum özeti', () => {
  assert.equal(statusText({ live: 12, vod: 5, lists: 2 }), '12 Canlı TV · 5 VOD · 2 liste');
  assert.equal(statusText(), '0 Canlı TV · 0 VOD · 0 liste');
});
