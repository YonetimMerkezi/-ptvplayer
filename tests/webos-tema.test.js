// LG webOS: tema merkezi (palet → CSS), kumanda renkli tuş atamaları.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMALAR, VARSAYILAN_TEMA, temaBul, cssUret, karistir } from '../webos/src/tema.js';
import { bellekDepo, createStore } from '../webos/src/store.js';
import { atamalar, eylemi, degistir, eylemAdi, OYNATICI, ANA, VARSAYILAN } from '../webos/src/kumanda.js';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(kok, 'webos', 'css', 'tv.css'), 'utf8');

const parlaklik = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const oran = (a, b) => {
  const x = parlaklik(a);
  const y = parlaklik(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test('tema: kimlikler tekil, renkler geçerli; vurgu rengi üzerindeki yazı okunur (WCAG ≥ 4.5)', () => {
  const kimlikler = TEMALAR.map((t) => t.id);
  assert.equal(new Set(kimlikler).size, kimlikler.length);
  assert.equal(TEMALAR[0].id, VARSAYILAN_TEMA);
  for (const t of TEMALAR) {
    for (const k of ['bg', 'surface', 'raised', 'line', 'accent', 'ink']) assert.match(t[k], /^#[0-9a-f]{6}$/, t.id + '.' + k);
    assert.ok(oran(t.accent, t.ink) >= 4.5, t.id + ': vurgu/yazı karşıtlığı ' + oran(t.accent, t.ink).toFixed(1));
    assert.ok(oran(t.bg, '#e8ecf4') >= 7, t.id + ': zemin üzerinde ana yazı okunur');
    if (t.multi) {
      assert.equal(t.p.length, 9);
      for (let i = 1; i <= 8; i++) assert.match(t.p[i], /^#[0-9a-f]{6}$/);
      if (t.dolu) for (let i = 1; i <= 8; i++) assert.ok(oran(t.p[i], t.ink) >= 4.5, t.id + ' p' + i);
    }
  }
  assert.equal(temaBul('yok').id, VARSAYILAN_TEMA, 'bilinmeyen kimlik varsayılana döner');
});

test('tema: varsayılan temada CSS değişmez; diğer temalarda renkler tek geçişte değişir', () => {
  assert.equal(cssUret(css, temaBul(VARSAYILAN_TEMA)), css);
  const mor = temaBul('purple');
  const c = cssUret(css, mor);
  assert.ok(!/#2dd4bf/i.test(c), 'eski vurgu kalmadı');
  assert.ok(c.includes(mor.accent) && c.includes(mor.bg) && c.includes(mor.ink));
  assert.ok(!/#0a0e17/i.test(c), 'eski zemin kalmadı');
  // Boyut ve düzen kuralları aynen korunur
  assert.equal(c.replace(/#[0-9a-f]{6}\b/gi, '#'), css.replace(/#[0-9a-f]{6}\b/gi, '#'));
});

test('tema: çok renkli temalar karo renk kuralları, gradyan temalar zemin kuralı üretir', () => {
  const kartlar = cssUret(css, temaBul('cards'));
  for (let i = 1; i <= 8; i++) assert.ok(kartlar.includes('.tile.c' + i + ' {'));
  assert.ok(!kartlar.includes('linear-gradient(135deg, #2b0f4d'));
  const neon = cssUret(css, temaBul('neon'));
  assert.ok(neon.includes('html, body { background: linear-gradient'));
  assert.ok(neon.includes('.player { background: #000; }'), 'oynatıcı zemini siyah kalır');
  const duz = cssUret(css, temaBul('blue'));
  assert.ok(!duz.includes('.tile.c1 {'));
});

test('tema: karistir iki rengi orantıyla birleştirir', () => {
  assert.equal(karistir('#000000', '#ffffff', 0), '#000000');
  assert.equal(karistir('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(karistir('#000000', '#ffffff', 0.5), '#808080');
});

test('kumanda: varsayılan atamalar, değiştirme ve bozuk kayıtta varsayılana dönüş', () => {
  const s = createStore(bellekDepo());
  assert.deepEqual(atamalar(s, 'oyn'), VARSAYILAN.oyn);
  assert.deepEqual(atamalar(s, 'ana'), VARSAYILAN.ana);
  assert.equal(eylemi(s, 'oyn', 'red'), 'fav');
  assert.equal(degistir(s, 'oyn', 'red', 1), 'aspect');
  assert.equal(eylemi(s, 'oyn', 'red'), 'aspect');
  assert.equal(degistir(s, 'oyn', 'red', -1), 'fav');
  assert.equal(degistir(s, 'oyn', 'red', -1), 'none', 'başa sarar');
  assert.equal(eylemi(s, 'oyn', 'red'), null, '“Yok” atanınca eylem yoktur');
  assert.equal(eylemAdi('oyn', 'sleep'), 'Uyku zamanlayıcısı');
  s.setSetting('keys.ana', { red: 'olmayan', green: 'guide' });
  assert.equal(atamalar(s, 'ana').red, VARSAYILAN.ana.red, 'geçersiz eylem varsayılana döner');
  assert.equal(atamalar(s, 'ana').green, 'guide');
  // Her varsayılan eylem listede bulunur
  for (const v of Object.values(VARSAYILAN.oyn)) assert.ok(OYNATICI.some((x) => x[0] === v));
  for (const v of Object.values(VARSAYILAN.ana)) assert.ok(ANA.some((x) => x[0] === v));
});
