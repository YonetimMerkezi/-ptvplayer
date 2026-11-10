import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES, DEFAULT_THEME, themeById, applyTheme } from '../www/js/theme.js';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../www/css/app.css'), 'utf8');

test('tema listesi: varsayılan yeşil, kimlikler benzersiz, bilinmeyen kimlik yeşile döner', () => {
  assert.equal(DEFAULT_THEME, 'green');
  assert.ok(THEMES.length >= 5);
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length);
  assert.equal(themeById('yok').id, 'green');
  assert.equal(themeById('purple').id, 'purple');
});

test('her temanın renkleri CSS\'te tanımlı ve önizleme rengi vurgu rengiyle aynı', () => {
  const root = css.match(/:root \{[\s\S]*?\n\}/)[0];
  assert.match(root, /--accent: #4ade80/, 'varsayılan (yeşil) :root içinde');
  for (const t of THEMES) {
    const block = t.id === DEFAULT_THEME ? root : (css.match(new RegExp(`html\\[data-theme="${t.id}"\\] \\{([^}]*)\\}`)) || [])[1];
    assert.ok(block, `${t.id} teması CSS'te yok`);
    for (const k of ['--bg', '--surface', '--raised', '--line', '--sel', '--bg-grad', '--accent', '--accent-ink', '--accent-soft', '--mini']) {
      assert.ok(block.includes(k + ':'), `${t.id}: ${k} eksik`);
    }
    // çok renkli temalarda swatch bir gradyandır; vurgu rengi eşleşmesi yalnız tek renkli temalar için aranır
    if (!t.multi) assert.ok(block.toLowerCase().includes('--accent: ' + t.swatch.toLowerCase()), `${t.id}: önizleme rengi vurgu rengiyle uyuşmuyor`);
    else assert.match(t.swatch, /gradient\(/, `${t.id}: çok renkli temanın önizlemesi gradyan olmalı`);
  }
});

test('applyTheme: kök öğeye data-theme ve tarayıcı çubuğu rengi yazar', () => {
  const attrs = {};
  const doc = {
    documentElement: { dataset: {} },
    querySelector: () => ({ setAttribute: (k, v) => (attrs[k] = v) }),
  };
  assert.equal(applyTheme('orange', doc), 'orange');
  assert.equal(doc.documentElement.dataset.theme, 'orange');
  assert.equal(attrs.content, themeById('orange').bar);
  assert.equal(applyTheme('bozuk', doc), 'green');
  assert.equal(doc.documentElement.dataset.theme, 'green');
});

test('ayar kutuları (.set-tile) renklerini temadan alır, sabit renk yok', () => {
  const rules = css.split('\n').filter((l) => l.startsWith('.set-tile'));
  assert.ok(rules.length >= 3, '.set-tile kuralları bulunamadı');
  for (const l of rules) assert.doesNotMatch(l, /#[0-9a-fA-F]{3,8}\b/, `sabit renk kalmış: ${l}`);
  const all = rules.join('\n');
  assert.match(all, /background: var\(--raised\)/);
  assert.match(all, /\.set-tile \.ic \{[^}]*color: var\(--accent\)/);
});

test('çok renkli temalar: 4 tane, palet tam, applyTheme data-multi yazar ve tek renkliye dönünce siler', () => {
  const multi = THEMES.filter((t) => t.multi);
  assert.deepEqual(multi.map((t) => t.id), ['cards', 'solid', 'neon', 'sunset']);
  for (const t of multi) {
    const block = css.match(new RegExp(`html\\[data-theme="${t.id}"\\] \\{([^}]*)\\}`))[1];
    for (let i = 0; i <= 8; i++) assert.ok(block.includes(`--p${i}:`), `${t.id}: --p${i} eksik`);
  }
  const doc = { documentElement: { dataset: {} }, querySelector: () => null };
  assert.equal(applyTheme('neon', doc), 'neon');
  assert.equal(doc.documentElement.dataset.multi, '1');
  assert.equal(applyTheme('blue', doc), 'blue');
  assert.equal('multi' in doc.documentElement.dataset, false);
});

test('çok renkli temalarda her sekme, her ayar kutusu ve ana kutu için renk kuralı var', () => {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../www/index.html'), 'utf8');
  const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../www/js/app.js'), 'utf8');
  const tabs = [...html.matchAll(/data-tab="([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(tabs.length >= 6);
  for (const t of tabs) assert.ok(css.includes(`html[data-multi] #tabs [data-tab=${t}]`), `sekme rengi yok: ${t}`);
  const sets = new Set([...app.matchAll(/class="set-tile" data-set="([a-z]+)"/g)].map((m) => m[1]));
  assert.ok(sets.size >= 12);
  for (const k of sets) assert.ok(css.includes(`html[data-multi] .set-tile[data-set=${k}]`), `ayar kutusu rengi yok: ${k}`);
  for (const k of ['live', 'movie', 'series', 'cats']) for (const th of ['cards', 'solid', 'neon', 'sunset']) assert.ok(css.includes(`html[data-theme="${th}"] .tile.t-${k}`), `${th}: ${k} kutusu`);
});
