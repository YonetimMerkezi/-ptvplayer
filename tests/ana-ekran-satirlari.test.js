// Ana ekran satırları: dikey afiş, satır sonunda "Tümünü gör", satır içi sağ-sol, başlığa kaydırma, Şaşırt beni düzeni,
// canlı TV önizleme bilgi satırı, vitrin fragman düğmeleri ve bilgi satırı (kaynak denetimi; davranış /tmp ölçümleriyle ayrıca doğrulandı).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const kaynak = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const app = kaynak('www/js/app.js');
const dpad = kaynak('www/js/dpad.js');
const css = kaynak('www/css/app.css');
const radio = kaynak('www/js/radio-ui.js');

test('ana ekran: tüm satırlar data-hrow + data-reveal, "Tümünü gör" kartı satırın sonunda', () => {
  assert.match(app, /const moreCard = \(go\) => `<div class="sh-more" role="button" tabindex="0" data-go="\$\{go\}">/);
  assert.match(app, /<div class="home-row-s" data-hrow>\$\{rowCards\(list\)\}\$\{all \? moreCard\(all\) : ''\}<\/div>/);
  assert.match(app, /class="home-row hp-recent" data-reveal/);
  assert.match(app, /class="home-row hp-picks" data-reveal/);
  assert.match(radio, /<section class="home-row" data-reveal>/);
  assert.match(radio, /data-hrow>\$\{cards\}\$\{more\}/);
  assert.doesNotMatch(app.slice(app.indexOf('const homeRow ='), app.indexOf('const homeRow =') + 400), /<button data-go/, 'başlıkta Tümünü gör düğmesi yok');
});

test('kumanda: satır içinde sağ-sol satırdan çıkmaz (sonda yutulur); odak kategori başlığı görünecek şekilde kaydırılır', () => {
  assert.match(dpad, /const hrow = cur\.closest\('\[data-hrow\]'\);/);
  assert.match(dpad, /if \(dir === 'left' \|\| dir === 'right'\) \{\s*const hrow/);
  assert.match(dpad, /function revealSection\(el, scope\)/);
  assert.match(dpad, /revealSection\(el, scope\);/);
  // alanın dışındaki hedefe (vitrin düğmesi) giderken birkaç piksellik kayma bir basış harcamaz
  assert.match(dpad, /sc\.scrollTop > 0 && sc\.scrollTop <= 48\) sc\.scrollTop = 0;/);
});

test('CSS: tüm kartlar aynı genişlikte; radyo da; "Şaşırt beni" sonucu afiş solda bilgi sağda', () => {
  assert.match(css, /\.home-row-s \.card \{ flex: 0 0 calc\(var\(--hp-h\) \* 2 \/ 3\);/);
  assert.match(css, /\.home-row-s\.rd-s \{ --rd-w: calc\(var\(--hp-h\) \* 2 \/ 3\); \}/);
  assert.match(css, /\.hp-sur \{ display: flex; align-items: flex-start;/);
  assert.match(css, /\.hp-sur-d \{ flex: 1 1 0; min-width: 0;/);
  assert.match(css, /\.hp-sur-plot \{[^}]*-webkit-line-clamp: 6;/);
});

test('Şaşırt beni: tek film, afiş + özet/puan/içerik uyarıları; mevcut film bilgisi ve uyarı yolları yeniden kullanılır', () => {
  assert.match(app, /const one = homePick\.genre === SURPRISE_ID && list\.length === 1 \? list\[0\] : null;/);
  assert.match(app, /function surpriseHtml\(it\)/);
  assert.match(app, /data-sur-play="\$\{esc\(it\.id\)\}"/);
  assert.match(app, /loadVodInfo\(S\.source, net, it\)/);
  assert.match(app, /paintMovieAdvisories\(host, advisoryMeta, failure, 'movie', advCtx\)/);
  assert.match(app, /fillSurprise\(\);\s*\}\s*\n\s*\n\/\/ Ana ekran satırları/, 'bölüm yeniden çizilince bilgi yeniden doldurulur');
  assert.match(app, /tickClock\(\);\s*fillSurprise\(\);/, 'ana ekran ilk çizimde de doldurulur');
});

test('canlı TV önizleme: pencerenin üstünde "Tamam (OK)" bilgi satırı (tek metin düğümü: çeviri düğüm bazlı)', () => {
  assert.match(app, /<div class="sp-fs" id="sp-fs" aria-live="polite"><\/div>/);
  assert.match(app, /'Tam ekran için seçili kanalda Tamam \(OK\) tuşuna bas'/);
  assert.match(css, /\.sp-right \{[^}]*grid-template-rows: auto auto minmax\(0, 1fr\)/);
  assert.match(css, /html\.kbd \.sp-fs \.k \{ display: inline-flex; \}/);
});

test('vitrin: TV\'de fragman düğmeleri sığar; fragman oynarken üstte bilgi satırı ve ses durumu', () => {
  assert.match(css, /html\.tv\.hero-on \.hero-c \{ display: none; \}/);
  assert.match(css, /html\.tv\.hero-on #hero \{ height: max\(34vh, 176px\); \}/);
  assert.match(css, /html\.tv\.hero-live #hero-live \{ display: flex;/);
  const html = kaynak('www/index.html');
  assert.match(html, /<div id="hero-live"[^>]*><i class="hero-dot"><\/i><b>Fragman oynuyor<\/b><span class="hero-note-s">/); // #app dışında: sinema kipinde de görünür
  assert.match(app, /\$\('#hero-live \.hero-note-s'\)/);
  assert.doesNotMatch(app.slice(app.indexOf('function paintHero'), app.indexOf('function paintHero') + 900), /hero-note/);
  assert.match(app, /heldBtn = act && box\.contains\(act\)/); // yeniden çizimde vitrin düğmesinin odağı korunur
  assert.match(app, /restoreHeroBtn\(box, heldBtn\)/);
});

test('Bugün TV\'de: ⋮ gerçek düğme; sağ ok satıra içeri girer, tam genişlik satırda yatay ok yerinde kalır; tik yerinde işaretlenir', () => {
  const ui = kaynak('www/js/today-ui.js');
  assert.match(ui, /<button class="td-dots" type="button" data-more aria-label="Seçenekler">/);
  assert.match(ui, /if \(it && e\.target\.closest\('\[data-more\]'\)\) return moreSheet\(it, row\.p\);/);
  // dpad: içeri girme / dışarı dönme / tam genişlikte yerinde kalma
  assert.match(dpad, /const inner = list\.find\(\(e\) => e !== cur && cur\.contains\(e\) && reachable\(e, scope\)\);/);
  assert.match(dpad, /list\.filter\(\(e\) => e !== cur && e\.contains\(cur\)\)\.pop\(\)/);
  assert.match(dpad, /curRect\.r - curRect\.l >= 0\.6 \* \(sr\.r - sr\.l\)\) return true;/);
  // kanal seçme: liste yeniden kurulmaz (odak ve sıra korunur), arka plan çizimi ertelenir
  const pick = ui.slice(ui.indexOf('function pick('), ui.indexOf('function moreSheet('));
  assert.match(pick, /c\.classList\.toggle\('on', on\);/);
  assert.match(pick, /drawLater\(\);/);
  const tik = pick.slice(pick.indexOf("const c = e.target.closest('.td-c')"), pick.indexOf("pg.el.addEventListener('keydown'"));
  assert.doesNotMatch(tik, /\brender\(\);/, 'tikte liste yeniden çizilmez');
  // çizim: odak aynı öğeye geri verilir; arka plan tetikleri tuşa basılırken çizmez
  assert.match(ui, /function restoreFocus\(key\)/);
  assert.match(ui, /if \(Date\.now\(\) - lastKeyAt < 800\) return drawLater\(250\);/);
});

test('odak kenarlığı ince; yuvarlak kartlarda (set-card) dışa taşıp kırpılmaz', () => {
  assert.match(css, /html\.kbd :focus \{ outline: 2px solid var\(--ring\); outline-offset: 1px; box-shadow: 0 0 0 1px var\(--ring-edge\);/);
  assert.doesNotMatch(css, /0 0 0 5px var\(--ring\)/, 'kalın 5px halka kalmadı');
  assert.doesNotMatch(css, /inset 0 0 0 5px var\(--ring-edge\)/, 'kalın iç halka kalmadı');
  assert.match(css, /html\.kbd \.set-card :focus:not\(\.btn\)[^{]*\{ outline: none; box-shadow: inset 0 0 0 2px var\(--ring\), inset 0 0 0 3px var\(--ring-edge\);/);
});

test('3 öneri: yatayı doldurur; her önerinin önünde büyük sıra sayısı (odak almaz), afiş odaklanır, yanında ad ve künye', () => {
  assert.match(app, /<div class="hp-rk"><span class="hp-no" aria-hidden="true">\$\{i \+ 1\}<\/span>\$\{poster\}<div class="hp-rk-d"><b class="hp-rk-t">/);
  assert.match(app, /<div class="home-row-s hp-rk-s" data-hrow>\$\{cards\}<\/div>/);
  assert.match(css, /\.hp-rk \{ flex: 1 1 0;/); // üç sütun eşit pay alır
  assert.match(css, /\.hp-no \{[^}]*color: var\(--accent\);[^}]*pointer-events: none;/); // tema renginde, odak/dokunuş almaz
  assert.match(css, /\.hp-rk \{ min-width: 0; gap: 8px; \}/); // yatay ekranda üçü de sığar
  assert.match(css, /\.home-row-s\.hp-sur-p \{ --hp-h: clamp\(170px, 36vh, 340px\); \}/); // Şaşırt beni afişi büyük
});
