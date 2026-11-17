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

import { homeRecent } from '../www/js/home-extras.js';

test('homeRecent: canlı ve film yalnız kendi türünden, en yeni önce, katalogda olmayan atlanır', () => {
  const recents = [
    { id: 'a', kind: 'live', at: 5 },
    { id: 'm1', kind: 'movie', at: 9 },
    { id: 'b', kind: 'live', at: 7 },
    { id: 'gone', kind: 'live', at: 8 },
  ];
  const lookup = (k, e) => (e.id === 'gone' ? undefined : { id: e.id, k });
  assert.deepEqual(homeRecent('live', recents, {}, lookup).map((x) => x.id), ['b', 'a']);
  assert.deepEqual(homeRecent('movie', recents, {}, lookup).map((x) => x.id), ['m1']);
});

test('homeRecent: diziler bölüm izlemelerinden de gelir, aynı dizi bir kez, sınır uygulanır', () => {
  const recents = [{ id: 's1', kind: 'series', at: 10 }];
  const progress = {
    e1: { kind: 'episode', parent: 's2', at: 30 },
    e2: { kind: 'episode', parent: 's1', at: 20 },
    e3: { kind: 'episode', parent: 's3', at: 5 },
    m: { kind: 'movie', id: 'x', at: 99 },
  };
  const lookup = (k, e) => ({ id: e.id });
  assert.deepEqual(homeRecent('series', recents, progress, lookup).map((x) => x.id), ['s2', 's1', 's3']);
  assert.deepEqual(homeRecent('series', recents, progress, lookup, 2).map((x) => x.id), ['s2', 's1']);
  assert.deepEqual(homeRecent('series', null, null, lookup), []);
});
