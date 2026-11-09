import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSub, subParams, subPreviewStyle, subLabel, DEFAULT_SUB, SUB_SIZES, SUB_COLORS, SUB_BGS, SUB_POS } from '../www/js/subtitle.js';

test('varsayılan ve bozuk değer', () => {
  assert.deepEqual(normalizeSub(undefined), DEFAULT_SUB);
  assert.deepEqual(normalizeSub('x'), DEFAULT_SUB);
  assert.deepEqual(normalizeSub({ size: 'dev', color: 'kırmızı', bg: 1, pos: null }), DEFAULT_SUB);
  assert.deepEqual(normalizeSub({ size: 'large', color: 'yellow', bg: 'solid', pos: 'high' }), { size: 'large', color: 'yellow', bg: 'solid', pos: 'high' });
});

test('seçenek listeleri kimlik/ad/değer içerir', () => {
  for (const l of [SUB_SIZES, SUB_COLORS, SUB_BGS, SUB_POS]) {
    assert.ok(l.length >= 3);
    assert.equal(new Set(l.map((x) => x[0])).size, l.length);
    for (const x of l) assert.ok(typeof x[1] === 'string' && x[1] && x[2] !== undefined);
  }
});

test('subParams: oynatıcı değerleri', () => {
  const d = subParams(DEFAULT_SUB);
  assert.equal(d.size, 0.0533);
  assert.equal(d.color, '#FFFFFF');
  assert.equal(d.bgAlpha, 0.55);
  assert.equal(d.bottom, 0.08);
  assert.equal(d.outline, false);
  const big = subParams({ size: 'xlarge', color: 'yellow', bg: 'none', pos: 'low' });
  assert.ok(big.size > 0.09 && big.size < 0.092);
  assert.equal(big.color, '#FFE14D');
  assert.equal(big.bgAlpha, 0);
  assert.equal(big.outline, true); // arka plan yoksa kenar çizgisi açılır
  assert.equal(big.bottom, 0.03);
  assert.equal(subParams({ bg: 'solid' }).bgAlpha, 1);
});

test('boyutlar küçükten büyüğe artar', () => {
  const s = SUB_SIZES.map(([id]) => subParams({ size: id }).size);
  assert.deepEqual([...s].sort((a, b) => a - b), s);
});

test('önizleme biçimi: renk, zemin, kenar', () => {
  const a = subPreviewStyle({ color: 'cyan', bg: 'soft' });
  assert.match(a, /color:#6EE7F2/);
  assert.match(a, /rgba\(0,0,0,0\.55\)/);
  assert.doesNotMatch(a, /text-shadow/);
  const b = subPreviewStyle({ bg: 'none' });
  assert.match(b, /text-shadow/);
  assert.match(b, /background:transparent/);
});

test('subLabel okunur özet', () => {
  assert.equal(subLabel(DEFAULT_SUB), 'Normal · Beyaz · yarı saydam zemin');
  assert.equal(subLabel({ bg: 'none', size: 'large', color: 'yellow' }), 'Büyük · Sarı · arka plansız');
});

test('sarı yazı için beyaz zemin üretilmez (okunaklılık)', () => {
  for (const [bg] of SUB_BGS) assert.doesNotMatch(subPreviewStyle({ color: 'yellow', bg }), /background:(#fff|white|rgba\(255)/i);
});
