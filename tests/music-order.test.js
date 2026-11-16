import test from 'node:test';
import assert from 'node:assert/strict';
import { nextIndex, nextRepeat, normalizeRepeat, hueOf } from '../www/js/music-order.js';

test('sıralı çalma: sonraki/önceki, liste sonunda durur; liste tekrarında baştan sürer', () => {
  assert.equal(nextIndex({ index: 0, count: 3 }), 1);
  assert.equal(nextIndex({ index: 1, count: 3, delta: -1 }), 0);
  assert.equal(nextIndex({ index: 2, count: 3, auto: true }), -1);
  assert.equal(nextIndex({ index: 0, count: 3, delta: -1 }), -1);
  assert.equal(nextIndex({ index: 2, count: 3, repeat: 'all', auto: true }), 0);
  assert.equal(nextIndex({ index: 0, count: 3, repeat: 'all', delta: -1 }), 2);
});

test('şarkıyı tekrarla: kendiliğinden bitince aynı şarkı; düğmeyle sonraki şarkıya geçilir', () => {
  assert.equal(nextIndex({ index: 1, count: 3, repeat: 'one', auto: true }), 1);
  assert.equal(nextIndex({ index: 1, count: 3, repeat: 'one' }), 2);
});

test('karışık çalma: tur bitmeden şarkı yinelenmez; tur bitince tekrar kapalıysa durur, açıksa yeni tur başlar', () => {
  const seen = new Set([0]);
  let i = 0;
  for (let n = 0; n < 4; n++) {
    i = nextIndex({ index: i, count: 5, shuffle: true, auto: true, played: [...seen], rnd: () => 0.99 });
    assert.ok(i >= 0 && !seen.has(i), `yeni şarkı (${i})`);
    seen.add(i);
  }
  assert.equal(nextIndex({ index: i, count: 5, shuffle: true, auto: true, played: [...seen] }), -1);
  const again = nextIndex({ index: i, count: 5, shuffle: true, repeat: 'all', auto: true, played: [...seen], rnd: () => 0 });
  assert.ok(again >= 0 && again !== i);
  // düğmeyle: tur bitse de bir şarkı verir
  assert.ok(nextIndex({ index: i, count: 5, shuffle: true, played: [...seen] }) >= 0);
});

test('tek şarkılık liste, tekrar sırası ve renk tonu', () => {
  assert.equal(nextIndex({ index: 0, count: 1, auto: true }), -1);
  assert.equal(nextIndex({ index: 0, count: 1, repeat: 'all', auto: true }), 0);
  assert.equal(nextIndex({ index: 0, count: 0 }), -1);
  assert.deepEqual(['off', 'all', 'one'].map(nextRepeat), ['all', 'one', 'off']);
  assert.equal(normalizeRepeat('x'), 'off');
  assert.equal(hueOf('Şarkı'), hueOf('Şarkı'));
  assert.ok(hueOf('Şarkı') >= 0 && hueOf('Şarkı') < 360);
});
