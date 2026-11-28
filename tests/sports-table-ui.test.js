// Puan durumu sayfası ve dizi takibi bağlantıları (kaynak denetimi; davranış /tmp/exp ölçümüyle gerçek modül + dpad ile ayrıca doğrulandı).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const kaynak = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const ui = kaynak('www/js/sports-table-ui.js');
const sports = kaynak('www/js/sports-ui.js');
const css = kaynak('www/css/app.css');
const app = kaynak('www/js/app.js');
const today = kaynak('www/js/today-ui.js');

test('puan durumu: takım satırları odak alır; Tamam/dokunuş takibi açar-kapatır; odak ve kaydırma yeniden çizimde korunur', () => {
  assert.match(ui, /<tr class="st-r\$\{fav \? ' fav' : ''\}" tabindex="0" role="button" aria-pressed=/);
  assert.match(ui, /env\.toggleTeam\(\{ name: r\.dataset\.n, label: r\.dataset\.l \}, r\.dataset\.g \|\| undefined\)/);
  assert.match(ui, /function focusKey\(\)/);
  assert.match(ui, /body\.scrollTop = top;\s*restoreFocus\(keep\);/);
  assert.match(sports, /function toggleTeam\(side, lg\)/);
  assert.match(sports, /mod\.openStandings\(\{[^}]*toggleTeam,/);
  assert.match(css, /html\.kbd \.st-r:focus td \{/);
});

test('puan durumu: ★ Takip ettiklerim tüm liglerdeki takip edilen takımları toplar', () => {
  assert.match(ui, /data-fav aria-pressed="\$\{onlyFav\}">★ Takip ettiklerim/);
  assert.match(ui, /function favGroups\(favs\)/);
  assert.match(ui, /if \(onlyFav\) for \(const l of TABLE_LEAGUES\) ensure\(l\.id\);/);
});

test('dizi takibi: dizi adına bağlanır, Pro kontrolü ve hemen hatırlatıcı eşitleme; Bugün TV\'de ⋮ seçeneğinde de var', () => {
  assert.match(app, /const title = seriesTitle\(p\.t\) \|\| 'Dizi';/);
  assert.match(app, /if \(!was && !needPro\('seriesfollow'\)\) return was;/);
  assert.match(app, /m\.syncSeries\(\{ net, store, rem: planApi,/);
  assert.match(app, /seriesFollow: \{ is: isSeriesProgram, on: isSeriesFollowed, toggle: toggleSeriesFollow \}/);
  assert.match(today, /series \? \['follow', following \? 'star-on' : 'star', following \? 'Dizi takibini bırak' : 'Diziyi takip et'\] : null/);
  assert.match(today, /else if \(act === 'follow'\) sf\.toggle\(it, p\);/);
});
