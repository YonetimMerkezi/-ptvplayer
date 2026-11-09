import test from 'node:test';
import assert from 'node:assert/strict';
import { guideBlocks } from '../www/js/guide.js';

const M = 60000;
const ws = Date.UTC(2026, 10, 9, 10, 0);
const we = ws + 24 * 60 * M;
const P = (a, b, t = 'x') => ({ s: ws + a * M, e: ws + b * M, t });

test('guideBlocks: dakika cinsinden başlangıç ve süre, şimdi/geçmiş sınıfları', () => {
  const now = ws + 90 * M;
  const b = guideBlocks([P(0, 60), P(60, 120), P(120, 180)], ws, we, now);
  assert.deepEqual(b.map((x) => [x.m, x.d, x.cls]), [[0, 60, ' past'], [60, 60, ' now'], [120, 60, '']]);
});

test('guideBlocks: pencere başından önce başlayan program kırpılır, sonundan taşan kısaltılır', () => {
  const b = guideBlocks([P(-30, 30), P(24 * 60 - 20, 24 * 60 + 40)], ws, we, ws);
  assert.deepEqual(b.map((x) => [x.m, x.d]), [[0, 30], [24 * 60 - 20, 20]]);
});

test('guideBlocks: üst üste binen programlar binmez, tamamen kapsananlar atlanır', () => {
  const b = guideBlocks([P(0, 60, 'a'), P(30, 50, 'içte'), P(50, 120, 'b')], ws, we, ws);
  assert.deepEqual(b.map((x) => [x.p.t, x.m, x.d]), [['a', 0, 60], ['b', 60, 60]]);
});

test('guideBlocks: pencere dışı, bozuk ve 1 dakikadan kısa kayıtlar atlanır; boş/null liste güvenli', () => {
  assert.deepEqual(guideBlocks([P(-200, -100), P(24 * 60 + 5, 24 * 60 + 60), { s: NaN, e: 1 }, null, P(10, 10.5)], ws, we, ws), []);
  assert.deepEqual(guideBlocks(null, ws, we), []);
  assert.deepEqual(guideBlocks([], ws, we), []);
});

test('guideBlocks: boşluklar korunur (bloklar arası boş alan)', () => {
  const b = guideBlocks([P(0, 30), P(90, 120)], ws, we, ws);
  assert.deepEqual(b.map((x) => [x.m, x.d]), [[0, 30], [90, 30]]);
});
