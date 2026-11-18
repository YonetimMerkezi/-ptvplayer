import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../www/js/app.js', import.meta.url), 'utf8');

test('TMDB düğmesi: Worker aramasının tek yolu ayara bağlı sarmalayıcıdır, varsayılan açıktır', () => {
  assert.match(app, /const tmdbLookup = \(\.\.\.args\) => \(setting\('tmdb', true\) \? lookupMeta\(net, store, \.\.\.args\) : Promise\.resolve\(null\)\)/);
  // lookupMeta yalnız sarmalayıcıda çağrılır; film ve dizi yolları ona gider (ayarı atlayan doğrudan çağrı kalmamalı)
  assert.equal((app.match(/lookupMeta\(/g) || []).length, 1);
  assert.equal((app.match(/tmdbLookup\(/g) || []).length, 2); // film + dizi
  assert.match(app, /chkRow\('tmdb', 'TMDB verisini kullan'/);
});
