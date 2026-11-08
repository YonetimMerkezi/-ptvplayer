import test from 'node:test';
import assert from 'node:assert/strict';
import { TV_MODES, DEFAULT_TV_MODE, normalizeTvMode, resolveTv } from '../www/js/tvmode.js';

test('TV modu: varsayılan otomatik; geçersiz değer otomatiğe döner', () => {
  assert.equal(DEFAULT_TV_MODE, 'auto');
  assert.deepEqual(TV_MODES.map(([id]) => id), ['auto', 'on', 'off']);
  assert.equal(normalizeTvMode('bozuk'), 'auto');
  assert.equal(normalizeTvMode(undefined), 'auto');
  assert.equal(normalizeTvMode('on'), 'on');
});

test('TV modu çözümü: Açık/Kapalı cihazdan bağımsız, Otomatik cihaz TV ise açık', () => {
  assert.equal(resolveTv('on', false), true);
  assert.equal(resolveTv('off', true), false);
  assert.equal(resolveTv('auto', true), true);
  assert.equal(resolveTv('auto', false), false);
  assert.equal(resolveTv('???', true), true, 'bilinmeyen değer otomatik sayılır');
});
