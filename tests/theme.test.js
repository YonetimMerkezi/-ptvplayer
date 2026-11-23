import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES, DEFAULT_THEME, DEFAULT_PRO_THEMES, themeById, applyTheme, cleanProThemes, proThemeIds, isProTheme, previewUrl } from '../www/js/theme.js';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../www/css/app.css'), 'utf8');

test('tema listesi: varsayılan yeşil, kimlikler benzersiz, bilinmeyen kimlik yeşile döner', () => {
  assert.equal(DEFAULT_THEME, 'green');
  assert.ok(THEMES.length >= 5);
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length);
  assert.equal(themeById('yok').id, 'green');
  assert.equal(themeById('purple').id, 'purple');
});

test('her temanın renkleri CSS\'te tanımlı; tüm temalar çok renkli (gradyan önizleme + tam palet)', () => {
  const root = css.match(/:root \{[\s\S]*?\n\}/)[0];
  assert.match(root, /--accent: #4ade80/, 'varsayılan (yeşil) :root içinde');
  for (const t of THEMES) {
    const own = (css.match(new RegExp(`html\\[data-theme="${t.id}"\\] \\{([^}]*)\\}`)) || [])[1];
    // varsayılan tema temel değerleri :root'tan alır, canlı katmanı kendi bloğundadır
    const block = t.id === DEFAULT_THEME ? root + (own || '') : own;
    assert.ok(block, `${t.id} teması CSS'te yok`);
    for (const k of ['--bg', '--surface', '--raised', '--line', '--sel', '--bg-grad', '--accent', '--accent-ink', '--accent-soft', '--mini']) {
      assert.ok(block.includes(k + ':'), `${t.id}: ${k} eksik`);
    }
    assert.equal(t.multi, true, `${t.id}: tek renkli tema kalmamalı`);
    assert.match(t.swatch, /gradient\(/, `${t.id}: önizleme yuvarlağı gradyan olmalı`);
    for (let i = 0; i <= 8; i++) assert.ok((own || '').includes(`--p${i}:`), `${t.id}: --p${i} eksik`);
    // canlı arka plan: en az üç renkli ışıltı (tek renkli zemin değil)
    if (t.vivid) assert.ok(((own.match(/--bg-grad:[^;]*/) || [''])[0].match(/radial-gradient/g) || []).length >= 3, `${t.id}: arka plan çok renkli değil`);
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

test('çok renkli temalar: hepsi; applyTheme data-multi ve data-vivid yazar, eski biçimli temada vivid silinir', () => {
  const multi = THEMES.filter((t) => t.multi);
  assert.equal(multi.length, THEMES.length, 'tek renkli tema kalmamalı');
  const vivid = THEMES.filter((t) => t.vivid).map((t) => t.id);
  assert.deepEqual(vivid, ['green', 'blue', 'cyan', 'purple', 'orange', 'red', 'midnight', 'ocean', 'graphite', 'rose']);
  for (const t of THEMES.filter((x) => x.vivid)) assert.ok(['glass', 'solid', 'neon'].includes(t.vivid), `${t.id}: bilinmeyen biçim`);
  const doc = { documentElement: { dataset: {} }, querySelector: () => null };
  assert.equal(applyTheme('neon', doc), 'neon');
  assert.equal(doc.documentElement.dataset.multi, '1');
  assert.equal('vivid' in doc.documentElement.dataset, false, 'eski çok renkli temada vivid yok');
  assert.equal(applyTheme('blue', doc), 'blue');
  assert.equal(doc.documentElement.dataset.multi, '1');
  assert.equal(doc.documentElement.dataset.vivid, 'neon');
  assert.equal(applyTheme('cyan', doc), 'cyan');
  assert.equal(doc.documentElement.dataset.vivid, 'solid');
});

test('canlı temalar: her ana kutu için üç biçimde de kural var, palet kutulara bağlı', () => {
  for (const k of ['live', 'movie', 'series', 'today']) assert.ok(css.includes(`html[data-vivid] .tile.t-${k} {`), `canlı tema: ${k} kutusu`);
  for (const v of ['glass', 'solid', 'neon']) {
    assert.ok(css.includes(`html[data-vivid=${v}] .tile:not(.mini) {`), `${v}: ana kutu biçimi yok`);
    assert.ok(css.includes(`html[data-vivid=${v}] .set-tile`), `${v}: ayar kutusu biçimi yok`);
  }
  // ayar kutusu biçimleri genel .set-tile kurallarından SONRA gelmeli (aynı özgüllükte sıra belirler)
  assert.ok(css.indexOf('html[data-vivid=solid] .set-tile {') > css.indexOf('html[data-multi] .set-tile .ic {'));
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
  for (const k of ['live', 'movie', 'series', 'today']) for (const th of ['cards', 'solid', 'neon', 'sunset']) assert.ok(css.includes(`html[data-theme="${th}"] .tile.t-${k}`), `${th}: ${k} kutusu`);
});

test('Pro temalar: işaretleme yoksa çok renkli temalar Pro, varsayılan tema hiçbir zaman Pro olamaz', () => {
  assert.deepEqual(DEFAULT_PRO_THEMES, ['cards', 'solid', 'neon', 'sunset']);
  assert.deepEqual(proThemeIds(null), DEFAULT_PRO_THEMES);
  assert.deepEqual(proThemeIds(undefined), DEFAULT_PRO_THEMES);
  assert.equal(isProTheme('neon', null), true);
  assert.equal(isProTheme('blue', null), false);
  // yönetici seçimi varsayılanın yerine geçer; boş liste "hiçbiri Pro değil" demektir
  assert.deepEqual(proThemeIds(['blue', 'rose']), ['blue', 'rose']);
  assert.deepEqual(proThemeIds([]), []);
  assert.equal(isProTheme('neon', ['blue']), false);
  assert.equal(isProTheme('blue', ['blue']), true);
  // bozuk girdiler ayıklanır: bilinmeyen kimlik, metin olmayan, tekrar, varsayılan tema
  assert.deepEqual(cleanProThemes(['blue', 'blue', 'yok', 5, null, DEFAULT_THEME, 'rose']), ['blue', 'rose']);
  assert.equal(cleanProThemes('blue'), null);
  assert.equal(cleanProThemes(null), null);
  assert.equal(isProTheme(DEFAULT_THEME, [DEFAULT_THEME]), false);
});

test('her temanın kartında gerçek ana ekran görüntüsü var (scripts/theme-previews.py üretir)', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (const t of THEMES) {
    assert.equal(previewUrl(t.id), `img/themes/${t.id}.webp`);
    const f = join(root, 'www', previewUrl(t.id));
    assert.ok(existsSync(f), `${t.id}: ${previewUrl(t.id)} yok; scripts/theme-previews.py çalıştırın`);
    const size = statSync(f).size;
    assert.ok(size > 4000 && size < 120000, `${t.id}: görüntü boyutu beklenmedik (${size} bayt)`);
    assert.equal(readFileSync(f).subarray(8, 12).toString(), 'WEBP', `${t.id}: WebP değil`);
  }
  assert.equal(previewUrl('bozuk'), 'img/themes/green.webp', 'bilinmeyen kimlik varsayılana düşer');
});

test('tema sayfası: Uygula düğmesi yok, dokununca hemen uygulanır; Pro kilidi uygulamadan önce sorulur', () => {
  const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../www/js/app.js'), 'utf8');
  const sheet = app.slice(app.indexOf('function themeSheet() {'), app.indexOf('function generalSheet() {'));
  assert.ok(sheet.length > 400);
  assert.doesNotMatch(sheet, /theme-apply|>Uygula<|'Uygula'/, 'Uygula düğmesi kalmamalı');
  assert.match(sheet, /needPro\('themes'\)/, 'Pro tema için üyelik sorulmalı');
  assert.ok(sheet.indexOf("needPro('themes')") < sheet.indexOf('applyTheme('), 'kilit, uygulamadan önce denetlenmeli');
  assert.match(sheet, /store\.setPref\('set\.theme'/, 'seçim hemen kaydedilmeli');
  assert.doesNotMatch(sheet, /api\.close\(\)/, 'sayfa seçimle kapanmamalı');
  assert.doesNotMatch(css, /\.theme-apply-bar|\.theme-preview/, 'eski çizimli önizleme ve Uygula çubuğu CSS\'i kalmamalı');
  assert.match(css, /\.theme-pro \{[^}]*background:#facc15; color:#1a1300/, 'sarı dolguda koyu yazı');
});

test('çok renkli temalarda vurgu rengi bölüme göre: her sekme ve her tam sayfa bir renge bağlı, sekme işareti yazılıyor', () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../www');
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const app = readFileSync(join(dir, 'js/app.js'), 'utf8');
  const tabs = [...html.matchAll(/data-tab="([a-z]+)"/g)].map((m) => m[1]);
  for (const t of [...tabs, 'multi']) assert.match(css, new RegExp(`html\\[data-multi\\]\\[data-sec=${t}\\] \\{ --pc: var\\(--p[0-8]\\); \\}`), `bölüm rengi yok: ${t}`);
  assert.match(app, /document\.documentElement\.dataset\.sec = S\.source \? S\.tab : 'home'/);
  // Tüm openPage sınıfları: ya renge bağlı ya da bilerek bulunduğu sekmenin rengini alır (dt-*: film/dizi ayrıntısı); st-pg, sp-pg'den; td-pick, td-pg'den gelir
  const bilerek = new Set(['dt-pg', 'dt-sp', 'st-pg', 'td-pick']);
  const dosyalar = ['app.js', 'ui.js', 'today-ui.js', 'sports-ui.js', 'sports-table-ui.js', 'sports-detail-ui.js', 'series-flow-ui.js', 'library-ui.js', 'cast-ui.js', 'radio-ui.js'];
  const sinif = new Set();
  for (const f of dosyalar) for (const m of readFileSync(join(dir, 'js', f), 'utf8').matchAll(/cls: '([^']*)'/g)) m[1].split(/\s+/).forEach((c) => c && sinif.add(c));
  assert.ok(sinif.size >= 15, 'sayfa sınıfları bulunamadı');
  const secici = css.match(/html\[data-multi\]\[data-sec\], html\[data-multi\] :is\(([^)]*)\) \{/);
  assert.ok(secici, 'sayfa vurgu kuralı yok');
  for (const c of sinif) assert.ok(bilerek.has(c) || secici[1].includes('.' + c), `sayfa rengi tanımsız: ${c} (CSS'e ekleyin ya da testte bilerek ayırın)`);
  // Dolgu üstü yazı koyu kalır
  assert.match(css, /--accent: var\(--pc\); --accent-ink: #0a1118;/);
});

test('çok renkli temalarda sayfa içi renk dağılımı: öğeler paletin altı rengini sırayla alır, koyu yazı korunur, liste satırlarına sıra sınıfı yazılır', () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../www');
  const app = readFileSync(join(dir, 'js/app.js'), 'utf8');
  const sira = ['p1', 'p4', 'p6', 'p2', 'p5', 'p3'];
  sira.forEach((p, i) => {
    assert.ok(css.includes(`html[data-multi] .k${i} { --k: var(--${p}); }`), `.k${i} rengi yok`);
    assert.match(css, new RegExp(`html\\[data-multi\\] :is\\([^\\n]*\\):nth-child\\(6n\\+${i + 1}\\) \\{ --k: var\\(--${p}\\); \\}`), `${i + 1}. sıra döngüsü yok`);
  });
  // Bugün TV'de türleri ve Favoriler sekmeleri kendi rengini taşır
  for (const [k, p] of [['spor', 'p1'], ['film', 'p2'], ['dizi', 'p3']]) assert.ok(css.includes(`html[data-multi] .td-k[data-kind=${k}] { --k: var(--${p}); }`), `tür rengi yok: ${k}`);
  for (const k of ['live', 'movie', 'series']) assert.match(css, new RegExp(`html\\[data-multi\\] #fseg \\[data-k=${k}\\] \\{ --k: var\\(--p[0-8]\\); \\}`), `Favoriler rengi yok: ${k}`);
  // --k → --accent çevirisi: ayar kartlarının içi kartın rengini korur, dolgu üstü yazı koyu
  const benimse = css.match(/html\[data-multi\] :is\(([^\n]*)\):not\(\.set-card \*\) \{ --accent: var\(--k, var\(--pc\)\); --accent-ink: #0a1118;/);
  assert.ok(benimse, 'benimseme kuralı yok');
  for (const c of ['.td-k', '.chips .chip', '.seg button', '.gd-day', '.td-r', '.guide-category-head', '.sp-m', '.src', '.sect', '.home-row', '.cat-tile']) assert.ok(benimse[1].includes(c), `renk dağılımına girmeyen öğe: ${c}`);
  // Sanal liste satırları sıra sınıfı alır: kategori, kanal, rehber kanalı
  assert.match(app, /const kc = \(i\) => ' k' \+ \(i % 6\);/);
  assert.ok((app.match(/\$\{kc\(i\)\}/g) || []).length >= 5, 'liste satırlarında kc(i) kullanılmalı');
  // Sarı (p7) dolguda beyaz yazı olmaz: dağılım kurallarında beyaz yazı yok
  const blok = css.slice(css.indexOf('/* Çok renkli temalarda sayfa içi dağılım'), css.indexOf('* { box-sizing'));
  assert.ok(blok.length > 2500);
  assert.doesNotMatch(blok, /color:\s*#fff\b|color:\s*white/i, 'dağılım kurallarında beyaz yazı olmamalı');
});

