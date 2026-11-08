import test from 'node:test';
import assert from 'node:assert/strict';
import { pickNext } from '../www/js/dpad.js';

const R = (l, t, w, h) => ({ l, t, r: l + w, b: t + h });
// 3 × 3 ızgara (100 × 50 kutular, 10 aralık)
const grid = [];
for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) grid.push(R(x * 110, y * 60, 100, 50));
const at = (x, y) => grid[y * 3 + x];
const go = (cur, dir, list = grid) => pickNext(cur, list, dir);

test('ızgarada yön tuşları komşu kutuya gider', () => {
  const c = at(1, 1);
  assert.equal(go(c, 'right'), 1 * 3 + 2 );
  assert.equal(go(c, 'left'), 1 * 3 + 0);
  assert.equal(go(c, 'down'), 2 * 3 + 1);
  assert.equal(go(c, 'up'), 0 * 3 + 1);
});

test('kenarda o yönde aday yoksa -1 döner', () => {
  assert.equal(go(at(0, 0), 'left'), -1);
  assert.equal(go(at(0, 0), 'up'), -1);
  assert.equal(go(at(2, 2), 'right'), -1);
  assert.equal(go(at(2, 2), 'down'), -1);
});

test('düzensiz yerleşim: büyük kutudan sağa giderken hizalı olan küçük kutu seçilir', () => {
  // solda iki satır boyunca büyük "Canlı TV", sağda üstte film, altta dizi
  const live = R(0, 0, 200, 220);
  const movie = R(210, 0, 100, 100);
  const series = R(210, 120, 100, 100);
  const list = [live, movie, series];
  const i = pickNext(live, list, 'right');
  assert.ok(i === 1 || i === 2);
  assert.equal(pickNext(movie, list, 'down'), 2, 'filmin altındaki dizi');
  assert.equal(pickNext(series, list, 'left'), 0, 'dizinin solundaki büyük kutu');
  assert.equal(pickNext(movie, list, 'left'), 0);
});

test('dik eksende hizalı aday, yakın ama kayık adaya göre önceliklidir', () => {
  const cur = R(100, 100, 100, 50);
  const aligned = R(260, 100, 100, 50); // sağda, aynı satır, biraz uzak
  const lower = R(210, 170, 100, 50); // sağda ama bir satır aşağıda
  assert.equal(pickNext(cur, [lower, aligned], 'right'), 1);
});

test('yalnız yöndeki adaylar değerlendirilir; kendisi seçilmez', () => {
  const cur = R(100, 100, 100, 50);
  const above = R(100, 20, 100, 50);
  const below = R(100, 200, 100, 50);
  assert.equal(pickNext(cur, [cur, above, below], 'up'), 1);
  assert.equal(pickNext(cur, [cur, above, below], 'down'), 2);
  assert.equal(pickNext(cur, [cur, above], 'down'), -1);
});

test('uzun dikey liste: aşağı en yakın alttaki satıra gider', () => {
  const rows = Array.from({ length: 6 }, (_, i) => R(0, i * 64, 300, 60));
  assert.equal(pickNext(rows[2], rows, 'down'), 3);
  assert.equal(pickNext(rows[2], rows, 'up'), 1);
  assert.equal(pickNext(rows[5], rows, 'down'), -1);
});

test('liste ile yan panel: sağa basınca listeden sağdaki panele geçilir', () => {
  const rows = Array.from({ length: 4 }, (_, i) => R(0, i * 64, 300, 60));
  const slot = R(320, 20, 400, 225);
  const list = [...rows, slot];
  assert.equal(pickNext(rows[1], list, 'right'), 4);
  assert.equal(pickNext(slot, list, 'left'), 2, 'panelden sola: merkezi en hizalı satır (üçüncü)');
});
