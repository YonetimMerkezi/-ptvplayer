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
  assert.match(css, /\.hp-sur-plot \{[^}]*-webkit-line-clamp: 4;/);
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
  assert.match(css, /html\.tv\.hero-live \.hero-note \{ display: flex;/);
  assert.match(app, /<b>Fragman oynuyor<\/b><span class="hero-note-s">\$\{heroStage\.muted \? 'ses kapalı' : 'ses açık'\}<\/span>/);
  assert.match(app, /\$\('#hero \.hero-note-s'\)/);
});
