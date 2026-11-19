import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const kaynak = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('karşılama ekranı: düğmeler tek kapsayıcıda, TV\'de "Telefondan al" (Pro kapılı) eklenir; emptyHtml sınıf alır', () => {
  const app = kaynak('www/js/app.js');
  assert.match(app, /function emptyHtml\(title, text, btn, cls = ''\) \{\s*return `<div class="empty\$\{cls \? ' ' \+ cls : ''\}">/);
  assert.match(app, /<div class="ob-act"><button class="btn" id="ob-add">Kaynak ekle<\/button>\$\{nativePlugin && isTvUi\(\) \? '<button class="btn ghost" id="ob-phone" type="button">Telefondan al<\/button>' : ''\}<\/div>`,\s*'ob',/);
  assert.match(app, /\$\('#ob-phone'\)\.addEventListener\('click', \(\) => needPro\('tvlink'\) && castUi\.receiverSheet\(\)\)/);
});

test('karşılama ekranı (TV): düğmeler adımların üstünde, adımlar yan yana, alan kaydırılabilir (odaktaki düğme ekran dışında kalmaz)', () => {
  const css = kaynak('www/css/app.css');
  assert.match(css, /html\.tv \.empty\.ob \{[^}]*max-height: 100%;[^}]*overflow-y: auto;/);
  assert.match(css, /html\.tv \.empty\.ob \.ob-act \{ order: 2; \}/);
  assert.match(css, /html\.tv \.empty\.ob \.ob-steps \{ order: 3; flex-direction: row;/);
  assert.match(css, /\.ob-act \{ display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; \}/);
});

test('eşleşme: Ayarlar › Telefondan oynat\'ta (yönetim kipi) QR ya da kodla eşleşir eşleşmez liste TV\'ye eşitlenir', () => {
  const ui = kaynak('www/js/cast-ui.js');
  assert.match(ui, /async function syncAfterPair\(dev\) \{\s*if \(!dev \|\| store\.pref\('sync\.auto', true\) === false\) return;[\s\S]*await runSync\(dev\)[\s\S]*toast\(syncMessage\(r\.tv, r\.phone\), 7000\)/, '"Kendiliğinden eşitle" kapalıysa yapılmaz');
  const calls = ui.match(/toast\(`\$\{dev\.name\} ile eşleşti`\);\s*syncAfterPair\(dev\);/g) || [];
  assert.equal(calls.length, 2, 'hem QR taramada hem koda dokunup eşleşmede');
  assert.match(ui, /store\.setPref\('sync\.last', Date\.now\(\)\);\s*toast\(syncMessage\(r\.tv, r\.phone\), 7000\);/);
});

test('TV tarafı: telefondan eşitleme gelince uygulama yenilenir (kaynak yoksa yeniden yükle)', () => {
  const app = kaynak('www/js/app.js');
  assert.match(app, /function afterSync\(\) \{\s*if \(!S\.source && store\.sources\(\)\.length\) \{[\s\S]*location\.reload\(\)/);
  const ui = kaynak('www/js/cast-ui.js');
  assert.match(ui, /plugin\.addListener\('castSync'[\s\S]*applySnapshot\(store, parsed\.snap\)[\s\S]*deps\.onSynced\(\)/);
});
