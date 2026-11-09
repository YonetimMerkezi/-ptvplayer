import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextUp, introSkip, normalizeIntro, COUNTDOWN_MS, INTRO_OPTIONS, DEFAULT_INTRO } from '../www/js/nextup.js';

const ctx = (o = {}) => ({ autoNext: true, index: 0, items: [{}, {}, {}], ...o });
const st = (o = {}) => ({ status: 'playing', item: { kind: 'series' }, ep: { id: 1 }, live: false, pos: 0, dur: 2400000, ...o });

test('nextUp: son 15 saniyede açılır, saniye yukarı yuvarlanır', () => {
  assert.deepEqual(nextUp(st({ pos: 2400000 - COUNTDOWN_MS - 1 }), ctx()), { show: false, secs: 0 });
  assert.deepEqual(nextUp(st({ pos: 2400000 - COUNTDOWN_MS }), ctx()), { show: true, secs: 15 });
  assert.deepEqual(nextUp(st({ pos: 2400000 - 9500 }), ctx()), { show: true, secs: 10 });
  assert.deepEqual(nextUp(st({ pos: 2400000 - 200 }), ctx()), { show: true, secs: 1 });
  assert.equal(nextUp(st({ pos: 2400000 }), ctx()).show, false); // bitti
});

test('nextUp: koşullar', () => {
  const near = st({ pos: 2395000 });
  assert.equal(nextUp(near, ctx({ index: 2 })).show, false); // son bölüm
  assert.equal(nextUp(near, ctx({ autoNext: false })).show, false);
  assert.equal(nextUp(near, ctx(), { enabled: false }).show, false); // ayardan kapalı
  assert.equal(nextUp(near, null).show, false);
  assert.equal(nextUp({ ...near, live: true }, ctx()).show, false);
  assert.equal(nextUp({ ...near, item: { kind: 'live' } }, ctx()).show, false);
  assert.equal(nextUp({ ...near, status: 'loading' }, ctx()).show, false);
  assert.equal(nextUp({ ...near, status: 'paused' }, ctx()).show, true); // duraklatılınca kart durur
  assert.equal(nextUp(st({ dur: 60000, pos: 55000 }), ctx()).show, false); // kısa içerik
});

test('introSkip: dizi bölümünün başında görünür', () => {
  assert.deepEqual(introSkip(st({ pos: 1000 })), { show: false, to: 0 }); // henüz erken
  assert.deepEqual(introSkip(st({ pos: 5000 })), { show: true, to: 90000 });
  assert.deepEqual(introSkip(st({ pos: 5000 }), { sec: 30 }), { show: true, to: 35000 });
  assert.equal(introSkip(st({ pos: 239000 })).show, true);
  assert.equal(introSkip(st({ pos: 241000 })).show, false); // pencere geçti
});

test('introSkip: koşullar', () => {
  assert.equal(introSkip(st({ pos: 5000, ep: null })).show, false); // film/canlı değil, dizi bölümü olmalı
  assert.equal(introSkip(st({ pos: 5000, live: true })).show, false);
  assert.equal(introSkip(st({ pos: 5000, dur: 300000 })).show, false); // kısa içerik
  assert.equal(introSkip(st({ pos: 5000 }), { sec: 0 }).show, false); // kapalı
  assert.equal(introSkip(st({ pos: 5000, status: 'loading' })).show, false);
  // bölümün sonuna taşmaz
  const r = introSkip(st({ pos: 200000, dur: 620000 }), { sec: 120 });
  assert.ok(r.show && r.to <= 620000 - 60000);
});

test('normalizeIntro', () => {
  assert.equal(normalizeIntro(60), 60);
  assert.equal(normalizeIntro('90'), 90);
  assert.equal(normalizeIntro(7), DEFAULT_INTRO);
  assert.equal(normalizeIntro(undefined), DEFAULT_INTRO);
  assert.equal(normalizeIntro(0), 0);
  assert.ok(INTRO_OPTIONS.some(([s]) => s === DEFAULT_INTRO));
});
