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

test('ana ekran "Ne izleyeceğine karar veremedin mi?": tür başına en fazla 3 öneri, "Şaşırt beni" tek film', () => {
  const app = kaynak('www/js/app.js');
  assert.match(app, /const PICKS_MAX = 3;/);
  assert.match(app, /pickMovies\(visibleAll\('movie'\), genre, \{ limit: genre === SURPRISE_ID \? 1 : PICKS_MAX,/);
});

test('öneri bölümü yeniden çizilince odak aynı çipe/düğmeye döner ve sayfa en üste kaymaz (kumanda odağı ilk öğeye atmasın)', () => {
  const app = kaynak('www/js/app.js');
  const fn = app.slice(app.indexOf('function fillHomePicks()'), app.indexOf('// Ana ekran satırları: kaldığın yerden devam'));
  assert.match(fn, /const had = a && el\.contains\(a\)/);
  assert.match(fn, /data-pick-again/);
  assert.match(fn, /const page = el\.closest\('\.home'\);[\s\S]*const top = page \? page\.scrollTop : 0;/);
  assert.match(fn, /el\.innerHTML = homePicksHtml\(\);[\s\S]*t\.focus\(\{ preventScroll: true \}\);[\s\S]*page\.scrollTop = top;/);
});

test('tema kartları: görsel kutusu 3:4\'ü yüzde dolguyla kurar, kart taşmaz (aspect-ratio ve düğmede flex\'e bağlı değil)', () => {
  const css = kaynak('www/css/app.css');
  assert.match(css, /\.theme-choice \{\s*position:relative; display:block; box-sizing:border-box; width:100%; min-width:0; max-width:100%; overflow:hidden;/);
  assert.match(css, /\.theme-shot \{ position:relative; display:block; width:100%; height:0; padding-top:133\.3334%; overflow:hidden;/);
  assert.match(css, /\.theme-shot img \{ position:absolute; left:0; top:0; display:block; width:100%; height:100%; max-width:100%; object-fit:cover;/);
  assert.doesNotMatch(css, /\.theme-shot \{[^}]*aspect-ratio/);
});

test('Pro: fragman oynatma (otomatik ve elle) ve oyuncu ayrıntıları Pro özelliğidir; QR ile liste aktarma kapıları yerinde', async () => {
  const { isProFeature, canUse } = await import('../www/js/membership.js');
  assert.ok(isProFeature('trailer') && isProFeature('actors') && isProFeature('tvlink'));
  assert.ok(canUse('trailer', { tier: 'pro' }) && !canUse('trailer', { tier: 'standard' }) && canUse('trailer', { tier: 'trial' }), 'yalnız Pro (ve denemede)');
  assert.ok(canUse('actors', { tier: 'pro' }) && !canUse('actors', { tier: 'standard' }));
  const app = kaynak('www/js/app.js');
  assert.match(app, /const trailerAutoOn = \(\) => setting\('trailerAuto'\) && proOk\('trailer'\);/);
  assert.match(app, /const actorsLocked = \(\) => memOn\(\) && !proOk\('actors'\);/);
  assert.match(app, /const trailerLocked = \(\) => memOn\(\) && !proOk\('trailer'\);/, 'fragman tümüyle Pro: elle oynatma da kilitli');
  assert.match(app, /const find = trailerOn\(\) && !locked && !ids\.length/, 'Pro değilken YouTube araması yapılmaz');
  assert.match(app, /locked \? \(lockedCard \? trailerLockedHtml\(\) : ''\) : trailerHtml\(/, 'Pro değilken oynatıcı yerine kilitli kart');
  assert.match(app, /\$\('\[data-tr=lock\]', tr\)\.addEventListener\('click', \(\) => needPro\('trailer'\)\)/, 'kilitli karta dokununca Pro sayfası');
  assert.match(app, /chkRow\('trailerFind', 'Fragmanı otomatik ara', '[^']*', 'trailer'\)/, 'otomatik arama ayarı da Pro');
  assert.match(app, /c\.dataset\.k === 'trailerAuto' \|\| c\.dataset\.k === 'trailerFind' \? 'trailer' : ''/);
  assert.match(app, /function openActor\(name, role = '', photo = ''\) \{\s*if \(!needPro\('actors'\)\) return undefined;/, 'oyuncu sayfası kapıdan geçer (3 çağıran de)');
  assert.match(app, /if \(!actorsLocked\(\)\) paintPhotos\(pp, people, detail && detail\.imdbId\);/, 'Pro değilken fotoğraf araması yapılmaz');
  assert.match(app, /pp\.innerHTML = peopleHtml\(people, actorsLocked\(\)\);/);
  assert.match(app, /chkRow\('trailerAuto', 'Fragmanı otomatik oynat', '[^']*', 'trailer'\)/, 'ayar satırında PRO işareti');
  assert.match(app, /if \(on && pk && !needPro\(pk\)\) return;/, 'Pro olmadan açılmaz, Pro sayfası açılır');
  const ui = kaynak('www/js/title-ui.js');
  assert.match(ui, /export function peopleHtml\(people, locked = false\)[\s\S]*Oyuncular ve ekip\$\{locked \? '<em class="set-pro">PRO<\/em>' : ''\}/);
  assert.match(kaynak('www/css/app.css'), /\.set-pro \{[^}]*background: #facc15; color: #0a1118;/, 'sarı dolguda koyu yazı');
});
