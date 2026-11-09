import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NIGHT_LEVELS, normalizeNight, nightLabel, DEFAULT_NIGHT } from '../www/js/night.js';

test('gece modu düzeyleri', () => {
  assert.deepEqual(NIGHT_LEVELS.map((x) => x[0]), ['off', 'light', 'medium', 'strong']);
  assert.equal(DEFAULT_NIGHT, 'off');
  assert.equal(normalizeNight('strong'), 'strong');
  assert.equal(normalizeNight('x'), 'off');
  assert.equal(normalizeNight(undefined), 'off');
  assert.equal(nightLabel('medium'), 'Orta');
  assert.equal(nightLabel('???'), 'Kapalı');
});
