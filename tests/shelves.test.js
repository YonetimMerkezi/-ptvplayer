import test from 'node:test';
import assert from 'node:assert/strict';
import { shelfSizes, nextCell, hTarget, SHELF_CAP, ROW_CAPS, normalizeRowCap } from '../www/js/shelves.js';

test('shelfSizes: TV ekranlarında bir satır tam, sonrakinin başlığı görünür; kutu sınırları', () => {
  for (const [w, h] of [[960, 273], [1280, 384], [1920, 608]]) {
    const s = shelfSizes({ viewW: w, viewH: h });
    assert.ok(s.cw >= 84 && s.cw <= 210, `kutu genişliği sınırda (${s.cw})`);
    assert.equal(s.ch, Math.round(s.cw * 1.5 + 46));
    assert.equal(s.rowH, s.title + s.pad + s.ch);
    // 960×540'ta alçak ekranda en küçük kutu bile sığmayabilir; diğerlerinde satır görünümün %85'inden azdır
    if (w > 960) assert.ok(s.rowH <= h * 0.85, `${w}×${h}: satır ${s.rowH} px, görünüm ${h} px`);
    assert.ok(s.rowH < h * 1.0, `${w}×${h}: satır görünümden küçük`);
  }
  const big = shelfSizes({ viewW: 3840, viewH: 1500 });
  assert.equal(big.cw, 210);
});

test('shelfSizes: telefon ~3,3 kutu; yazı ölçeği başlık ve boşluğu büyütür', () => {
  const p = shelfSizes({ viewW: 390, viewH: 700 });
  assert.equal(p.cw, Math.round(390 / 3.75));
  const a = shelfSizes({ viewW: 1280, viewH: 384, scale: 1 });
  const b = shelfSizes({ viewW: 1280, viewH: 384, scale: 1.3 });
  assert.ok(b.title > a.title && b.pad > a.pad);
});

test('nextCell: sağ-sol satır içinde, kenarda yutulur', () => {
  const lens = [5, 3, 1];
  const len = (i) => lens[i];
  assert.deepEqual(nextCell(len, 3, 0, 2, 'ArrowRight'), { r: 0, c: 3 });
  assert.deepEqual(nextCell(len, 3, 0, 4, 'ArrowRight'), { r: 0, c: 4, stay: true });
  assert.deepEqual(nextCell(len, 3, 0, 1, 'ArrowLeft'), { r: 0, c: 0 });
  assert.deepEqual(nextCell(len, 3, 0, 0, 'ArrowLeft'), { r: 0, c: 0, stay: true });
});

test('nextCell: aşağı-yukarı aynı sıraya iner, kısa satırda sona kenetlenir; üst satır yoksa kumandaya bırakır', () => {
  const lens = [5, 3, 1];
  const len = (i) => lens[i];
  assert.deepEqual(nextCell(len, 3, 0, 4, 'ArrowDown'), { r: 1, c: 2 });
  assert.deepEqual(nextCell(len, 3, 1, 2, 'ArrowDown'), { r: 2, c: 0 });
  assert.deepEqual(nextCell(len, 3, 2, 0, 'ArrowDown'), { r: 2, c: 0, stay: true });
  assert.deepEqual(nextCell(len, 3, 2, 0, 'ArrowUp'), { r: 1, c: 0 });
  assert.deepEqual(nextCell(len, 3, 1, 2, 'ArrowUp'), { r: 0, c: 2 });
  assert.equal(nextCell(len, 3, 0, 3, 'ArrowUp'), null);
  assert.equal(nextCell(len, 3, 0, 3, 'Enter'), null);
});

test('hTarget: görünürse kaymaz; sağa taşarsa komşu payıyla kayar; baştaki kutu 0’a döner; sınırlar', () => {
  const v = { width: 100, view: 500, max: 2000 };
  assert.equal(hTarget({ ...v, left: 200, cur: 100 }), 100, 'ortadaki kutu için kayma yok');
  assert.equal(hTarget({ ...v, left: 450, cur: 0 }), 450 + 100 + 100 - 500, 'sağ kenara taşan: komşu payı kadar');
  assert.equal(hTarget({ ...v, left: 6, cur: 300 }), 0, 'baştaki kutu: en başa');
  assert.equal(hTarget({ ...v, left: 150, cur: 300 }), 50, 'soldan taşan: komşu payı kadar geri');
  assert.equal(hTarget({ ...v, left: 5000, cur: 0 }), 2000, 'en sonda üst sınır');
});

test('SHELF_CAP 24', () => assert.equal(SHELF_CAP, 24));

test('satırdaki yapım sayısı: seçenekler, varsayılan 24, geçersiz değer varsayılana döner, üst sınır 100', () => {
  assert.deepEqual(ROW_CAPS.map(([n]) => n), [12, 24, 36, 48, 72, 100]);
  assert.ok(ROW_CAPS.some(([n]) => n === SHELF_CAP));
  for (const [n] of ROW_CAPS) assert.equal(normalizeRowCap(n), n);
  assert.equal(normalizeRowCap(String(48)), 48);
  for (const bad of [undefined, null, '', 0, 7, 1000, 'x', {}]) assert.equal(normalizeRowCap(bad), SHELF_CAP);
});
