import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { greeting, homeContinue, statusText, RECENT_TABS, recentLatest, recentTabPick } from '../www/js/home-extras.js';

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

test('recentLatest: her türün en son izleme zamanı; dizi için bölüm ilerlemesi de sayılır', () => {
  const rec = [{ kind: 'live', id: 'c1', at: 50 }, { kind: 'live', id: 'c2', at: 90 }, { kind: 'movie', id: 'm1', at: 70 }, { kind: 'series', id: 's1', at: 10 }, { kind: 'live', id: '', at: 999 }, { kind: 'radio', id: 'r', at: 999 }];
  const prog = { e1: { kind: 'episode', parent: 's2', at: 80 }, m1: { kind: 'movie', id: 'm1', at: 999 }, e2: { kind: 'episode', parent: null, at: 999 } };
  assert.deepEqual(recentLatest(rec, prog), { live: 90, movie: 70, series: 80 });
  assert.deepEqual(recentLatest(null, null), { live: 0, movie: 0, series: 0 });
  assert.deepEqual(recentLatest([], [{ kind: 'episode', parent: 's', at: 5 }]), { live: 0, movie: 0, series: 5 });
});

test('recentTabPick: seçilen sekme doluysa o; değilse en son izlemenin olduğu, eşitlikte canlı → film → dizi', () => {
  const counts = { live: 3, movie: 2, series: 0 };
  const latest = { live: 10, movie: 20, series: 99 };
  assert.equal(recentTabPick(counts, latest), 'movie', 'boş dizi sekmesi sayılmaz, en yeni film');
  assert.equal(recentTabPick(counts, latest, 'live'), 'live', 'seçim korunur');
  assert.equal(recentTabPick(counts, latest, 'series'), 'movie', 'seçilen sekme boşsa varsayılana döner');
  assert.equal(recentTabPick(counts, latest, 'radio'), 'movie', 'geçersiz seçim yok sayılır');
  assert.equal(recentTabPick({ live: 1, movie: 1, series: 1 }, { live: 5, movie: 5, series: 5 }), 'live', 'eşitlikte sıra');
  assert.equal(recentTabPick({ live: 0, movie: 0, series: 0 }, latest), '');
  assert.equal(recentTabPick(null, null), '');
  assert.deepEqual(RECENT_TABS.map((t) => [t.kind, t.go]), [['live', 'recent'], ['movie', 'recent-movie'], ['series', 'recent-series']]);
});

test('bağlantı: ana ekranda kanal/film/dizi son izlenenleri tek sekmeli bölümde; sekmeye dokununca yalnız bölüm yeniden çizilir', () => {
  const app = readFileSync(new URL('../www/js/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /Son izlenen (kanallar|filmler|diziler)/, 'ayrı satırlar kalmadı');
  assert.match(app, /<div id="home-recent">\$\{homeRecentHtml\(\)\}<\/div>/);
  assert.match(app, /role="tab" aria-selected="\$\{t\.kind === on\}" data-rtab="\$\{t\.kind\}"/);
  assert.match(app, /<button data-go="\$\{cur\.go\}">Tümünü gör<\/button>/, '“Tümünü gör” açık sekmeyi izler');
  assert.match(app, /const rt = e\.target\.closest\('\[data-rtab\]'\);\s*if \(rt\) \{\s*homeRecentState\.tab = rt\.dataset\.rtab;\s*return fillHomeRecent\(\);/);
  assert.match(app, /recentTabPick\(counts, recentLatest\(store\.recents\(sid\(\)\), store\.progressAll\(sid\(\)\)\), homeRecentState\.tab\)/);
});
