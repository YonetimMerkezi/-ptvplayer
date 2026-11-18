// Derleme çıktısını Chromium 38 gerçeğine göre denetler: JS yalnız ES5 olmalı, CSS'te eski motorun bilmediği özellik olmamalı.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(kok, 'dist');
let hata = 0;
const bildir = (m) => {
  hata++;
  console.error('✗ ' + m);
};

// JS: ES5 ayrıştırıcıdan geçmeli (servis Node 0.12 için aynı kural)
for (const f of [join(dist, 'app', 'js', 'app.js'), ...readdirSync(join(dist, 'service')).filter((x) => x.endsWith('.js')).map((x) => join(dist, 'service', x))]) {
  try {
    parse(readFileSync(f, 'utf8'), { ecmaVersion: 5, sourceType: 'script' });
    console.log('✓ ES5: ' + f.slice(kok.length + 1));
  } catch (e) {
    bildir(`${f.slice(kok.length + 1)}: ES5 dışı söz dizimi (${e.message})`);
  }
}

// CSS: Chromium 38'de olmayanlar (özel özellik/var(), grid, flex gap, inset, aspect-ratio, sticky, :is, min()/max()/clamp() ...)
const YASAK = [
  [/var\(\s*--/, 'CSS değişkeni var()'],
  [/(^|[;{\s])--[a-z]/i, 'özel özellik --x'],
  [/display\s*:\s*(inline-)?grid/, 'CSS grid'],
  [/grid-template|grid-area|grid-column|grid-row/, 'grid özellikleri'],
  [/(^|[;{\s])(row-|column-)?gap\s*:/, 'gap'],
  [/(^|[;{\s])inset\s*:/, 'inset'],
  [/aspect-ratio/, 'aspect-ratio'],
  [/position\s*:\s*sticky/, 'position: sticky'],
  [/:is\(|:where\(|:has\(|:focus-visible|:focus-within/, 'yeni seçiciler'],
  [/\b(min|max|clamp)\(/, 'min()/max()/clamp()'],
  [/color-mix\(/, 'color-mix()'],
  [/backdrop-filter/, 'backdrop-filter'],
  [/@container|@layer/, '@container/@layer'],
];
const cssDir = join(dist, 'app', 'css');
for (const f of readdirSync(cssDir).filter((x) => x.endsWith('.css'))) {
  const css = readFileSync(join(cssDir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  let temiz = true;
  for (const [re, ad] of YASAK) {
    if (re.test(css)) {
      bildir(`css/${f}: ${ad} kullanılmış (Chromium 38 desteklemez)`);
      temiz = false;
    }
  }
  if (temiz) console.log('✓ CSS: css/' + f);
}
const html = readFileSync(join(dist, 'app', 'index.html'), 'utf8');
if (/type\s*=\s*["']module["']/.test(html)) bildir('index.html: type="module" betiği (Chromium 38 çalıştırmaz)');
if (hata) {
  console.error(`\n${hata} sorun`);
  process.exit(1);
}
console.log('\nES5/Chromium 38 denetimi temiz');
