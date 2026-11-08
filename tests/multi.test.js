import test from 'node:test';
import assert from 'node:assert/strict';
import { fitSlots, nextTargetIdx } from '../www/js/multi.js';
import { holeClip } from '../www/js/hole.js';

test('kayıtlı kanallar kutu sayısına sığdırılır', () => {
  assert.deepEqual(fitSlots(['a', 'b', 'c', 'd'], 2), ['a', 'b']);
  assert.deepEqual(fitSlots(['a'], 4), ['a', null, null, null]);
  assert.deepEqual(fitSlots(undefined, 2), [null, null]);
  assert.deepEqual(fitSlots(['a', null, 'c'], 3), ['a', null, 'c']);
});

test('hatada sıradaki adres denenir, kalmadıysa -1', () => {
  assert.equal(nextTargetIdx(0, 2), 1);
  assert.equal(nextTargetIdx(1, 2), -1);
  assert.equal(nextTargetIdx(0, 1), -1);
});

// evenodd dolgusunun alanını ızgara örnekleyerek ölçer (deliklerin tam açıldığını ve fazladan bölge çıkmadığını doğrular)
function inside(poly, px, py) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const parse = (clip, W, H) =>
  clip
    .replace(/^polygon\(evenodd, /, '')
    .replace(/\)$/, '')
    .split(', ')
    .map((p) => p.split(' ').map((v, i) => (v.endsWith('%') ? (parseFloat(v) / 100) * (i ? H : W) : parseFloat(v))));

test('holeClip: boş liste → temizle', () => {
  assert.equal(holeClip([]), '');
  assert.equal(holeClip([{ x: 0, y: 0, w: 0, h: 10 }]), '');
});

test('holeClip: birden çok delik yalnız kendi dikdörtgenlerini açar', () => {
  const W = 400;
  const H = 300;
  const rects = [{ x: 20, y: 30, w: 100, h: 80 }, { x: 220, y: 40, w: 120, h: 90 }, { x: 60, y: 180, w: 150, h: 100 }];
  const poly = parse(holeClip(rects), W, H);
  const inRect = (r, x, y) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
  for (let x = 1; x < W; x += 3) {
    for (let y = 1; y < H; y += 3) {
      const hole = rects.some((r) => inRect(r, x + 0.5, y + 0.5));
      assert.equal(inside(poly, x + 0.5, y + 0.5), !hole, `(${x},${y}) ${hole ? 'delik olmalıydı' : 'dolu olmalıydı'}`);
    }
  }
});
