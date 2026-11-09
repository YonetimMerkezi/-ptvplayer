import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Kodda icon('ad') ile istenen her simge, index.html'deki SVG sayfasında tanımlı olmalı (eksikse kutu simgesiz kalır).
test('kullanılan tüm simgeler index.html simge sayfasında var', () => {
  const html = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
  const defined = new Set([...html.matchAll(/<symbol id="i-([a-z0-9-]+)"/g)].map((m) => m[1]));
  const dir = new URL('../www/js/', import.meta.url);
  const used = new Map();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/icon\('([a-z0-9-]+)'\)/g)) if (!used.has(m[1])) used.set(m[1], f);
  }
  const missing = [...used].filter(([n]) => !defined.has(n)).map(([n, f]) => `${n} (${f})`);
  assert.deepEqual(missing, []);
  assert.ok(used.size > 20);
});

test('index.html: <use href="#i-…"> ile kullanılan simgeler de tanımlı', () => {
  const html = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
  const defined = new Set([...html.matchAll(/<symbol id="i-([a-z0-9-]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/<use href="#i-([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(used.filter((n) => !defined.has(n)), []);
});
