import test from 'node:test';
import assert from 'node:assert/strict';
import { DECODER_MODES, DEFAULT_DECODER, decoderLabel, normalizeDecoder } from '../www/js/decoder.js';

test('görüntü çözücü kipleri ve varsayılan', () => {
  assert.deepEqual(DECODER_MODES.map(([id]) => id), ['auto', 'software']);
  assert.equal(DEFAULT_DECODER, 'auto');
});

test('normalizeDecoder: bilinmeyen/boş değer otomatiğe döner, geçerli değer korunur', () => {
  for (const [id] of DECODER_MODES) assert.equal(normalizeDecoder(id), id);
  for (const bad of [undefined, null, '', 'hardware', 1, {}]) assert.equal(normalizeDecoder(bad), DEFAULT_DECODER);
});

test('decoderLabel: bilinmeyen değer için "Otomatik" gösterilir', () => {
  assert.equal(decoderLabel('software'), 'Yazılım öncelikli');
  assert.equal(decoderLabel('x'), 'Otomatik');
});
