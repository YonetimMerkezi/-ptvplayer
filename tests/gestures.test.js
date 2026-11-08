import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, seekDelta, seekTarget, levelFrom, seekStep, fmtDelta } from '../www/js/gestures.js';

test('yön: eşik altında karar yok; baskın eksen kazanır', () => {
  assert.equal(classify(5, 8), null);
  assert.equal(classify(30, 10), 'h');
  assert.equal(classify(-30, 10), 'h');
  assert.equal(classify(10, -30), 'v');
  assert.equal(classify(20, 20), 'h');
});

test('yatay kaydırma: ekran genişliği ≈ 120 sn, yön işareti korunur', () => {
  assert.equal(seekDelta(200, 400), 60);
  assert.equal(seekDelta(-100, 400), -30);
  assert.equal(seekDelta(50, 0), 0);
});

test('sarma hedefi 0 ile süre arasında kalır', () => {
  assert.equal(seekTarget(10000, -30, 600000), 0);
  assert.equal(seekTarget(590000, 60, 600000), 600000);
  assert.equal(seekTarget(10000, 25, 600000), 35000);
});

test('düzey: yukarı artırır, aşağı azaltır, 0..1 aralığında kalır', () => {
  assert.equal(levelFrom(0.5, -85, 100), 1);
  assert.equal(levelFrom(0.5, 85, 100), 0);
  assert.ok(Math.abs(levelFrom(0.5, -17, 200) - 0.6) < 1e-9);
  assert.equal(levelFrom(2, 0, 100), 1);
  assert.equal(levelFrom(0.4, 10, 0), 0.4);
});

test('kumanda adımları art arda basışta büyür', () => {
  assert.deepEqual([1, 2, 3, 4, 6, 7, 9, 10, 25].map(seekStep), [10, 10, 10, 20, 20, 30, 30, 60, 60]);
  assert.equal(fmtDelta(25.4), '+25 sn');
  assert.equal(fmtDelta(-30), '−30 sn');
});
