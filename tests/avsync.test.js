import test from 'node:test';
import assert from 'node:assert/strict';
import { clampDelay, stepDelay, fmtDelay, describeDelay, DELAY_MIN, DELAY_MAX, DELAY_PRESETS } from '../www/js/avsync.js';

test('clampDelay: 50 ms adıma yuvarlar, sınırlar içinde tutar, bozuk değeri 0 yapar', () => {
  assert.equal(clampDelay(0), 0);
  assert.equal(clampDelay(120), 100);
  assert.equal(clampDelay(130), 150);
  assert.equal(clampDelay('250'), 250);
  assert.equal(clampDelay(99999), DELAY_MAX);
  assert.equal(clampDelay(-99999), DELAY_MIN);
  assert.equal(clampDelay(NaN), 0);
  assert.equal(clampDelay(undefined), 0);
  assert.equal(clampDelay(null), 0);
  assert.equal(clampDelay('abc'), 0);
});

test('stepDelay: adım ekler, sınırı aşmaz', () => {
  assert.equal(stepDelay(0, 50), 50);
  assert.equal(stepDelay(50, -100), -50);
  assert.equal(stepDelay(1900, 250), DELAY_MAX);
  assert.equal(stepDelay(-900, -250), DELAY_MIN);
  assert.equal(stepDelay(undefined, 50), 50);
  assert.deepEqual(DELAY_PRESETS.map((d) => stepDelay(0, d)), [-250, -50, 50, 250]);
});

test('fmtDelay / describeDelay', () => {
  assert.equal(fmtDelay(0), 'Ayarsız');
  assert.equal(fmtDelay(150), '+150 ms');
  assert.equal(fmtDelay(-50), '−50 ms');
  assert.match(describeDelay(100), /geciktirildi/);
  assert.match(describeDelay(-100), /öne alındı/);
  assert.match(describeDelay(0), /olduğu gibi/);
});
