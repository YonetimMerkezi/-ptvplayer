import test from 'node:test';
import assert from 'node:assert/strict';
import { createHero, heroModel, heroCellW, HERO_DELAY_MS } from '../www/js/hero.js';

// sahte saat: bekleme süreleri elle ilerletilir
function clock() {
  let now = 0;
  let id = 0;
  const q = new Map();
  return {
    setTimer: (fn, ms) => {
      q.set(++id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (h) => q.delete(h),
    tick(ms) {
      now += ms;
      for (const [k, t] of [...q]) {
        if (t.at <= now) {
          q.delete(k);
          t.fn();
        }
      }
    },
    pending: () => q.size,
  };
}

const flush = () => new Promise((r) => setImmediate(r));

function rig(over = {}) {
  const c = clock();
  const calls = { load: [], paint: [], final: [] };
  const cache = new Map();
  const defer = new Map();
  const h = createHero({
    peek: (it) => cache.get(it.id) || null,
    canLoad: (it) => it.kind === 'movie',
    load: (it) => {
      calls.load.push(it.id);
      return new Promise((res, rej) => defer.set(it.id, { res: (v) => (cache.set(it.id, v), res(v)), rej }));
    },
    paint: (it, info, final) => {
      calls.paint.push([it.id, info && info.plot]);
      calls.final.push(!!final);
    },
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
    ...over,
  });
  return { h, c, calls, cache, defer };
}

const A = { id: 'a', kind: 'movie', name: 'A' };
const B = { id: 'b', kind: 'movie', name: 'B' };
const C = { id: 'c', kind: 'movie', name: 'C' };
const S1 = { id: 's', kind: 'series', name: 'S', plot: 'Dizi özeti' };

test('odak: listedeki bilgi hemen çizilir, ayrıntı bekleme dolunca istenir', async () => {
  const { h, c, calls, defer } = rig();
  h.focus(A);
  assert.deepEqual(calls.paint, [['a', null]]);
  assert.deepEqual(calls.load, []);
  c.tick(HERO_DELAY_MS - 1);
  assert.deepEqual(calls.load, []);
  c.tick(1);
  assert.deepEqual(calls.load, ['a']);
  defer.get('a').res({ plot: 'Özet A' });
  await flush();
  assert.deepEqual(calls.paint.at(-1), ['a', 'Özet A']);
});

test('hızlı gezerken ağ isteği gitmez: yalnız durulan kutu istenir', async () => {
  const { h, c, calls, defer } = rig();
  h.focus(A);
  c.tick(100);
  h.focus(B);
  c.tick(100);
  h.focus(C);
  c.tick(HERO_DELAY_MS);
  assert.deepEqual(calls.load, ['c']);
  defer.get('c').res({ plot: 'C' });
  await flush();
  assert.equal(calls.paint.filter(([id]) => id === 'a' || id === 'b').every(([, p]) => p === null), true);
});

test('bayat sonuç çizilmez; yoldaki istek bitince son durulan kutu istenir (tek istek)', async () => {
  const { h, c, calls, defer } = rig();
  h.focus(A);
  c.tick(HERO_DELAY_MS);
  assert.deepEqual(calls.load, ['a']);
  h.focus(B);
  c.tick(HERO_DELAY_MS);
  assert.deepEqual(calls.load, ['a'], 'A bitmeden B istenmez');
  defer.get('a').res({ plot: 'A' });
  await flush();
  assert.equal(calls.paint.some(([id, p]) => id === 'a' && p === 'A'), false, 'odak B’de, A sonucu çizilmez');
  assert.deepEqual(calls.load, ['a', 'b']);
  defer.get('b').res({ plot: 'B' });
  await flush();
  assert.deepEqual(calls.paint.at(-1), ['b', 'B']);
});

test('önbellekteki ayrıntı istek atmadan çizilir; dizide istek yok', () => {
  const { h, c, calls, cache } = rig();
  cache.set('a', { plot: 'Bellekte' });
  h.focus(A);
  assert.deepEqual(calls.paint, [['a', 'Bellekte']]);
  c.tick(HERO_DELAY_MS * 3);
  assert.deepEqual(calls.load, []);
  h.focus(S1);
  assert.equal(c.pending(), 0);
  c.tick(HERO_DELAY_MS * 3);
  assert.deepEqual(calls.load, []);
});

test('üst üste hata: sınırdan sonra istek atılmaz, reset açar, başarı sayacı sıfırlar', async () => {
  const { h, c, calls, defer } = rig({ maxFails: 2 });
  for (const it of [A, B]) {
    h.focus(it);
    c.tick(HERO_DELAY_MS);
    defer.get(it.id).rej(new Error('ağ'));
    await flush();
  }
  assert.equal(h.disabled, true);
  h.focus(C);
  assert.equal(c.pending(), 0, 'kapalıyken bekleme bile kurulmaz');
  c.tick(HERO_DELAY_MS);
  assert.deepEqual(calls.load, ['a', 'b']);
  h.reset();
  assert.equal(h.disabled, false);
  h.focus(A);
  h.focus(C);
  c.tick(HERO_DELAY_MS);
  assert.deepEqual(calls.load, ['a', 'b', 'c']);
});

test('stop: bekleyen istek iptal olur, sonuç çizilmez; aynı kutuya yeniden odak çizer', async () => {
  const { h, c, calls, defer } = rig();
  h.focus(A);
  c.tick(HERO_DELAY_MS);
  h.stop();
  defer.get('a').res({ plot: 'Geç geldi' });
  await flush();
  assert.equal(calls.paint.some(([, p]) => p === 'Geç geldi'), false);
  const n = calls.paint.length;
  h.focus(A);
  assert.equal(calls.paint.length, n + 1);
  assert.equal(h.current, A);
});

test('aynı kutuya tekrar odak bir şey yapmaz', () => {
  const { h, calls } = rig();
  h.focus(A);
  h.focus(A);
  assert.equal(calls.paint.length, 1);
});

test('heroModel: ayrıntı yoksa listedeki alanlar, varsa ayrıntı; görseller sıralı ve tekrarsız', () => {
  const it = { name: 'Film', rating: 4.5, logo: 'p.jpg', plot: 'Liste özeti' };
  const m0 = heroModel(it, null);
  assert.equal(m0.title, 'Film');
  assert.equal(m0.rating, '4.5');
  assert.deepEqual(m0.meta, []);
  assert.equal(m0.plot, 'Liste özeti');
  assert.deepEqual(m0.bg, ['p.jpg']);
  assert.equal(m0.wide, false);
  assert.equal(m0.backs, 0, 'yalnız afiş: geniş görsel yok');
  const m1 = heroModel(it, { year: '2026-03-01', durationSec: 3120, genre: 'Belgesel', plot: 'Ayrıntı özeti', cast: 'A, B', director: 'C', backdrop: 'b.jpg', logo: 'p.jpg', rating: '4.8' });
  assert.deepEqual(m1.meta, ['2026', '52 dk', 'Belgesel']);
  assert.equal(m1.plot, 'Ayrıntı özeti');
  assert.equal(m1.rating, '4.8');
  assert.deepEqual(m1.bg, ['b.jpg', 'p.jpg']);
  assert.equal(m1.wide, true);
  assert.equal(m1.backs, 1, 'bg’nin ilki geniş görsel, ikincisi afiş');
  assert.equal(heroModel({ name: 'X' }, null).rating, '');
});

test('heroCellW: ekrana oranlı, alt ve üst sınırlı', () => {
  assert.equal(heroCellW(960), 96);
  assert.equal(heroCellW(1280), 122);
  assert.equal(heroCellW(1920), 183);
  assert.equal(heroCellW(3840), 190);
  assert.equal(heroCellW(320), 96);
});

test('final: ayrıntı beklenen film önce kesinleşmemiş çizilir; ayrıntı gelince, gelmeyince ve beklenmiyorsa kesinleşir', async () => {
  const { h, c, calls, defer, cache } = rig();
  h.focus(A);
  assert.deepEqual(calls.final, [false], 'ayrıntı yolda: geniş görsel henüz yok, yedek afiş çizilmemeli');
  c.tick(HERO_DELAY_MS);
  defer.get('a').res({ plot: 'A' });
  await flush();
  assert.equal(calls.final.at(-1), true, 'ayrıntı gelince kesinleşir');

  h.focus(B);
  c.tick(HERO_DELAY_MS);
  defer.get('b').rej(new Error('ağ'));
  await flush();
  assert.deepEqual(calls.paint.at(-1), ['b', null]);
  assert.equal(calls.final.at(-1), true, 'ayrıntı gelmedi: yedek görsel kullanılsın');

  const n = calls.final.length;
  h.focus(S1);
  assert.deepEqual(calls.final.slice(n), [true], 'dizide ayrıntı beklenmez: hemen kesin');
  cache.set('c', { plot: 'C' });
  h.focus(C);
  assert.equal(calls.final.at(-1), true, 'bellekteki ayrıntı: hemen kesin');
});

test('final: hata sınırı aşılınca (kapalı) yeni kutular hemen kesin çizilir', async () => {
  const { h, c, calls, defer } = rig({ maxFails: 1 });
  h.focus(A);
  c.tick(HERO_DELAY_MS);
  defer.get('a').rej(new Error('ağ'));
  await flush();
  assert.equal(h.disabled, true);
  h.focus(B);
  assert.equal(calls.final.at(-1), true);
});
