// TV'de dizi sayfası düzeni, konu açma/kapama ve Yayın bilgisi kutusunun kumanda odağı: kaynak koruması.
// (Düzenin ekran görüntüsüyle doğrulaması elle yapıldı; burada bozulursa test uyarır.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const oku = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const css = oku('www/css/app.css');
const blok = (re) => {
  const m = css.match(re);
  assert.ok(m, 'CSS kuralı bulunamadı: ' + re);
  return m[0];
};

test('dizi sayfası (geniş ekran): bölümler kaydırılır kutuda ve odak halkası için dolgu var; düğmeler ızgarada', () => {
  const eps = blok(/\.dt-sp \.dt-eps \{[^}]*\}/);
  assert.match(eps, /overflow-y:\s*auto/, 'bölüm sütunu kendi içinde kayar');
  assert.match(eps, /padding:\s*8px/, 'odak halkası kesilmesin diye dolgu');
  assert.match(eps, /margin:\s*-8px/, 'dolgu yerleşimi kaydırmasın');
  const chips = blok(/\.dt-sp \.dt-eps \.chips \{[^}]*\}/);
  assert.match(chips, /padding:\s*8px/, 'sezon çipleri halka için dolgulu');
  const btns = blok(/\.dt-sp \.dt-btns \{[^}]*\}/);
  assert.match(btns, /grid-template-columns:\s*1fr 1fr/, 'düğmeler iki sütunlu ızgara');
  const lg = blok(/\.dt-sp \.dt-btns \.btn\.lg \{[^}]*\}/);
  assert.match(lg, /grid-column:\s*1 \/ -1/, 'ana düğme (Devam et) tam genişlik');
});

test('dizi sayfası: konu en çok 5 satır, açılınca tamamı; künye değerleri 2 satır; başlık 2 satır', () => {
  assert.match(blok(/\.dt-sp \.dt-plot \{[^}]*\}/), /-webkit-line-clamp:\s*5/);
  assert.match(blok(/\.dt-sp \.dt-plot\.open \{[^}]*\}/), /display:\s*block/);
  assert.match(blok(/\.dt-sp \.dt-facts dd \{[^}]*\}/), /-webkit-line-clamp:\s*2/);
  assert.match(blok(/\.dt-sp \.dt-t \{[^}]*\}/), /-webkit-line-clamp:\s*2/);
});

test('dizi sayfası: dar/kısa ekran blokları yeni ızgaraya göre küçülür', () => {
  const bloklar = css.match(/@media[^{]*max-height:\s*520px[^{]*\{[\s\S]*?\n\}/g) || [];
  const m = bloklar.find((b) => b.includes('.dt-sp'));
  assert.ok(m, 'dizi sayfasının kısa ekran bloğu');
  assert.match(m, /\.dt-sp \.dt-plot \{[^}]*-webkit-line-clamp:\s*3/, 'kısa ekranda konu 3 satır');
  assert.match(m, /\.dt-sp \.dt-btns \.btn/, 'kısa ekranda düğmeler de küçülür');
});

test('dizi sayfası: konu kutusu taşıyorsa odaklanır, Tamam ile açılır/kapanır ve açık durum sezon değişince korunur', () => {
  const app = oku('www/js/app.js');
  assert.match(app, /let plotOpen = false;/);
  assert.match(app, /plotEl\.classList\.toggle\('open', plotOpen\)/, 'her çizimde açık durumu uygula');
  assert.match(app, /plotEl\.scrollHeight > plotEl\.clientHeight \+ 1/, 'yalnız gerçekten kesilen konu odaklanabilir olur');
  assert.match(app, /plotEl\.tabIndex = 0;[\s\S]{0,120}setAttribute\('role', 'button'\)/);
  assert.match(app, /plotOpen = !plotOpen;[\s\S]{0,120}aria-expanded/, 'tıklama/Tamam konuyu aç-kapat yapar');
});

test('Yayın bilgisi kutusu: kumandayla içine geçilir, oklar kutuda kalır, Geri önce kutuyu kapatır', () => {
  const ui = oku('www/js/player-ui.js');
  assert.match(ui, /const statsFocused = \(\) => statsOn && q\('#pl-stats-box'\)\.contains\(document\.activeElement\);/);
  assert.match(ui, /\|\| chp\.open \|\| statsFocused\(\)\)\) return;/, 'odak kutudayken oynatıcı tuş işleyicisi oklara karışmaz');
  assert.match(ui, /pushLayer\('pl-stats', statsHide\)/, 'Geri katmanı');
  assert.match(ui, /if \(statsLayer\) popLayer\('pl-stats'\);\s*else statsHide\(\);/, 'kapatma katmandan geçer');
  assert.match(ui, /if \(statsOn && kbdMode\(\)\) q\('#pl-stats-x'\)\.focus\(/, 'kumandayla açılınca odak kutuya geçer');
  const dpad = oku('www/js/dpad.js');
  assert.match(dpad, /stats\.contains\(doc\.activeElement\)\) return stats;/, 'gezinme kapsamı kutu olur');
  assert.match(oku('www/index.html'), /id="pl-stats-rows" class="pls-rows" tabindex="0"/, 'satırlar kaydırılabilsin diye odaklanabilir');
});

test('gece modu sıkıştırıcı: blok tabanlı zarf + bakışlı sınırlayıcı, sessizlikte işlem yok, sabitler korunur', () => {
  const j = oku('android/app/src/main/java/com/koruk/iptv/NightCompressor.java');
  assert.match(j, /static final int BLOCK = 64;/);
  assert.match(j, /CEIL\s*=\s*0\.9/, 'çıkış tavanı');
  assert.match(j, /GATE_LO\s*=\s*-66\.0/);
  assert.match(j, /GATE_HI\s*=\s*-50\.0/);
  assert.match(j, /softClip\(/, 'tavan aşılırsa yumuşak sınırlama');
  assert.doesNotMatch(j, /Math\.pow\([^)]*\)[^;\n]*\bfor\b/, 'örnek başına pow yok');
});

test('ses kesintisi ölçümü: Java dinleyicileri sayaç tutar, getStats yazar, oynatma başında sıfırlanır', () => {
  const j = oku('android/app/src/main/java/com/koruk/iptv/IptvPlayerPlugin.java');
  assert.match(j, /public void onAudioUnderrun\(AnalyticsListener\.EventTime eventTime, int bufferSize, long bufferSizeMs, long elapsedSinceLastFeedMs\)/);
  assert.match(j, /audioUnderruns\+\+;/);
  assert.match(j, /public void onAudioDecoderInitialized\(AnalyticsListener\.EventTime eventTime, String decoderName/);
  assert.match(j, /o\.put\("audioUnderruns", audioUnderruns\);/);
  assert.match(j, /o\.put\("audioGapMs", audioGapMs\);/);
  assert.match(j, /o\.put\("audioRate", a\.sampleRate\)/);
  assert.match(j, /audioUnderruns = 0;\s*audioGapMs = 0;/, 'her yayın açılışında sayaç sıfırlanır');
});
