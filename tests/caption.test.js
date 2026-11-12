import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPTION_LINES, DEFAULT_CAPTION, CAP_FS, normalizeCaption, captionPx, applyCaption } from '../www/js/caption.js';

test('kutudaki ad: seçenekler ve varsayılan 3 satır', () => {
  assert.deepEqual(CAPTION_LINES.map(([n]) => n), [0, 2, 3, 5]);
  assert.equal(DEFAULT_CAPTION, 3);
  for (const [n] of CAPTION_LINES) assert.equal(normalizeCaption(n), n);
  assert.equal(normalizeCaption('5'), 5); // ayar metin olarak gelebilir
  for (const bad of [undefined, null, '', 'x', 1, 4, 9, -1, {}]) assert.equal(normalizeCaption(bad), DEFAULT_CAPTION);
});

test('captionPx: 3 satır eski sabit alanla (66 px) aynı, satır arttıkça büyür, 0 = 0', () => {
  assert.equal(captionPx(3, 1), 66);
  assert.equal(captionPx(0, 1), 0);
  assert.ok(captionPx(2) < captionPx(3) && captionPx(3) < captionPx(5));
  assert.equal(captionPx(5, 1), 98);
  assert.equal(captionPx(3, 1.3), Math.round(65.75 * 1.3)); // yazı boyutu çarpanı
  assert.equal(captionPx('garip'), 66); // geçersiz değer varsayılana düşer
});

test('applyCaption: --cap-lines ve data-nocap işaretini koyar', () => {
  const props = {};
  const doc = { documentElement: { dataset: {}, style: { setProperty: (k, v) => (props[k] = v) } } };
  assert.equal(applyCaption(5, doc), 5);
  assert.equal(props['--cap-lines'], '5');
  assert.equal('nocap' in doc.documentElement.dataset, false);
  assert.equal(applyCaption(0, doc), 0);
  assert.equal(doc.documentElement.dataset.nocap, '1');
  assert.equal(props['--cap-lines'], '3'); // gizliyken değişken geçerli kalır (açılınca varsayılan)
  assert.equal(applyCaption('2', doc), 2);
  assert.equal('nocap' in doc.documentElement.dataset, false);
});

test('captionPx: ad yazısı küçülünce (telefon satırları 0,75 rem) alan satır başına daha az yer tutar; varsayılan yazıyla aynı', () => {
  assert.equal(CAP_FS, 0.8125);
  assert.equal(captionPx(3, 1, CAP_FS), captionPx(3, 1));
  assert.equal(captionPx(3, 1, 0.75), Math.round((3 * 1.25 * 0.75 + 1.0625) * 16)); // 61 px
  assert.ok(captionPx(3, 1, 0.75) < captionPx(3, 1));
  assert.equal(captionPx(0, 1, 0.75), 0);
  assert.equal(captionPx(3, 1.3, 0.75), Math.round((3 * 1.25 * 0.75 + 1.0625) * 16 * 1.3)); // yazı ölçeği çarpar
});
