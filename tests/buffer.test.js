import test from 'node:test';
import assert from 'node:assert/strict';
import { BUFFER_LEVELS, DEFAULT_BUFFER, normalizeBuffer } from '../www/js/buffer.js';

test('yayın önbelleği düzeyleri ve varsayılan', () => {
  assert.deepEqual(BUFFER_LEVELS.map(([id]) => id), ['normal', 'high', 'max']);
  assert.equal(DEFAULT_BUFFER, 'high');
});

test('normalizeBuffer: bilinmeyen/boş değer varsayılana döner, geçerli değer korunur', () => {
  for (const [id] of BUFFER_LEVELS) assert.equal(normalizeBuffer(id), id);
  for (const bad of [undefined, null, '', 'huge', 3, {}]) assert.equal(normalizeBuffer(bad), DEFAULT_BUFFER);
});
