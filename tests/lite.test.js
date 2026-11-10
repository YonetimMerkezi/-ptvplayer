import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LITE_MODES, DEFAULT_LITE, LOW_RAM_GB, normalizeLite, isLowRam, liteOn, applyLite } from '../www/js/lite.js';

test('hafif mod: seçenekler ve varsayılan otomatik', () => {
  assert.deepEqual(LITE_MODES.map(([id]) => id), ['auto', 'on', 'off']);
  assert.equal(DEFAULT_LITE, 'auto');
  for (const [id] of LITE_MODES) assert.equal(normalizeLite(id), id);
  for (const bad of [undefined, null, '', 'x', 1, true]) assert.equal(normalizeLite(bad), DEFAULT_LITE);
});

test('az bellek: 2 GB ve altı; bilinmiyorsa değil', () => {
  assert.equal(LOW_RAM_GB, 2);
  for (const m of [0.25, 0.5, 1, 2]) assert.equal(isLowRam({ deviceMemory: m }), true);
  for (const m of [4, 8]) assert.equal(isLowRam({ deviceMemory: m }), false);
  for (const nav of [undefined, null, {}, { deviceMemory: 0 }, { deviceMemory: '1' }]) assert.equal(isLowRam(nav), false);
});

test('liteOn: otomatik belleğe bakar, açık/kapalı zorlar', () => {
  assert.equal(liteOn('auto', { deviceMemory: 1 }), true);
  assert.equal(liteOn('auto', { deviceMemory: 4 }), false);
  assert.equal(liteOn(undefined, { deviceMemory: 1 }), true); // bilinmeyen değer = otomatik
  assert.equal(liteOn('on', { deviceMemory: 8 }), true);
  assert.equal(liteOn('off', { deviceMemory: 0.5 }), false);
});

test('applyLite: kök öğede data-lite koyar ve kaldırır', () => {
  const doc = { documentElement: { dataset: {} } };
  assert.equal(applyLite('on', doc, {}), true);
  assert.equal(doc.documentElement.dataset.lite, '1');
  assert.equal(applyLite('off', doc, {}), false);
  assert.equal('lite' in doc.documentElement.dataset, false);
  assert.equal(applyLite('auto', doc, { deviceMemory: 2 }), true);
  assert.equal(doc.documentElement.dataset.lite, '1');
});
