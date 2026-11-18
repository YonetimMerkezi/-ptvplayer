// webOS sürümünü derler: modern kaynak → esbuild paketi → Babel (ES5, Chromium 38) → Terser.
// Çıktı: dist/app (web uygulaması) ve dist/service (JS servisi); CI ikisini ares-package ile IPK yapar.
import { build } from 'esbuild';
import { transformAsync } from '@babel/core';
import { minify } from 'terser';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(kok, 'dist');
const pkg = JSON.parse(readFileSync(join(kok, 'package.json'), 'utf8'));
const surum = process.env.WEBOS_VERSION || pkg.version;
const yapi = process.env.WEBOS_BUILD || new Date().toISOString().slice(0, 16).replace('T', ' ');

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'app', 'js'), { recursive: true });

// 1) Paketle (modern söz dizimi korunur)
const paket = await build({
  entryPoints: [join(kok, 'src', 'main.js')],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  legalComments: 'none',
  define: { __VERSION__: JSON.stringify(surum), __BUILD__: JSON.stringify(yapi) },
  logLevel: 'warning',
});
const kaynak = paket.outputFiles[0].text;

// 2) ES5'e çevir (Chromium 38: let/const, ok işlevi, sınıf, şablon dizgisi, async yok)
const es5 = await transformAsync(kaynak, {
  babelrc: false,
  configFile: false,
  compact: false,
  comments: false,
  sourceType: 'script',
  presets: [['@babel/preset-env', { targets: { chrome: '38' }, modules: false, loose: false, bugfixes: false }]],
});

// 3) Küçült (ES5 kalır)
const kucuk = await minify(es5.code, { ecma: 5, compress: { passes: 1 }, mangle: true, format: { ascii_only: true } });
if (!kucuk.code) throw new Error('Terser çıktı üretmedi');
writeFileSync(join(dist, 'app', 'js', 'app.js'), kucuk.code);

// 4) Sabit dosyalar
const html = readFileSync(join(kok, 'index.html'), 'utf8').replace(/__VERSION__/g, surum);
writeFileSync(join(dist, 'app', 'index.html'), html);
cpSync(join(kok, 'css'), join(dist, 'app', 'css'), { recursive: true });
cpSync(join(kok, 'assets'), join(dist, 'app'), { recursive: true });
const info = JSON.parse(readFileSync(join(kok, 'appinfo.json'), 'utf8'));
info.version = surum;
writeFileSync(join(dist, 'app', 'appinfo.json'), JSON.stringify(info, null, 2));
cpSync(join(kok, 'service'), join(dist, 'service'), { recursive: true });
const sp = JSON.parse(readFileSync(join(dist, 'service', 'package.json'), 'utf8'));
sp.version = surum;
writeFileSync(join(dist, 'service', 'package.json'), JSON.stringify(sp, null, 2));

console.log(`webOS ${surum} derlendi: app.js ${(kucuk.code.length / 1024).toFixed(0)} KB`);
