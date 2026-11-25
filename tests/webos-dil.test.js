import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EN_WEBOS } from '../webos/src/i18n-en.js';
import { addPairs, setLang, translate, resolveLang } from '../www/js/i18n.js';
import { DIL } from '../webos/src/dil.js';

const kaynak = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const phs = (s) => (s.match(/\{\d+\}/g) || []).sort().join(',');
const norm = (s) => s.replace(/\s+/g, ' ').trim();

addPairs(EN_WEBOS);

test('webOS sözlüğü: her çift [Türkçe, İngilizce], boş değil, {0} {1} yer tutucuları iki yanda aynı', () => {
  assert.ok(EN_WEBOS.length > 400);
  for (const p of EN_WEBOS) {
    assert.equal(p.length, 2, JSON.stringify(p));
    assert.ok(typeof p[0] === 'string' && p[0].trim() && typeof p[1] === 'string' && p[1].trim(), JSON.stringify(p));
    assert.equal(phs(p[0]), phs(p[1]), p[0]);
  }
});

test('webOS sözlüğü: aynı Türkçe metin iki kez farklı karşılıkla yazılmamış', () => {
  const m = new Map();
  for (const [tr, en] of EN_WEBOS) {
    const k = norm(tr);
    if (m.has(k)) assert.equal(m.get(k), en, 'çelişen karşılık: ' + k);
    m.set(k, en);
  }
});

test('İngilizce seçiliyken webOS metinleri çevrilir, Türkçede olduğu gibi kalır', () => {
  setLang('en');
  assert.equal(translate('Takılı bellekler'), 'Connected drives');
  assert.equal(translate('Devam et (12 dk)'), 'Resume (12 min)');
  assert.equal(translate('▲▼ gezin · ◀▶ değiştir · OK: seç · Geri'), '▲▼ move · ◀▶ change · OK: select · Back');
  assert.equal(translate('Sıradaki bölüm'), 'Next episode'); // "{0} bölüm" kalıbı yanlış eşleşmesin
  assert.equal(translate('Açılışta son kanal'), 'Last channel on start');
  assert.equal(translate('Oynatıcıda Kırmızı tuş'), 'Player: Red key');
  assert.equal(translate('Bitmesine 30 dk'), '30 min left');
  assert.equal(translate('Filmim Türkçe Ad'), 'Filmim Türkçe Ad'); // kullanıcı içeriği sözlükte yoksa aynen kalır
  setLang('tr');
  assert.equal(translate('Takılı bellekler'), 'Takılı bellekler');
  assert.equal(translate('Devam et (12 dk)'), 'Devam et (12 dk)');
});

test('dil ayarı: Otomatik / Türkçe / English; otomatikte TV dili Türkçe değilse İngilizce', () => {
  assert.deepEqual(DIL.map(([k]) => k), ['auto', 'tr', 'en']);
  assert.equal(resolveLang('auto', 'tr-TR'), 'tr');
  assert.equal(resolveLang('auto', 'en-US'), 'en');
  assert.equal(resolveLang('auto', 'ko-KR'), 'en');
  assert.equal(resolveLang('tr', 'en-US'), 'tr');
  assert.equal(resolveLang('en', 'tr-TR'), 'en');
});

test('dil katmanı bağlı: açılışta dilKur, Ayarlar\'da Dil satırı (◀▶ ile değişir) ve değişince ekranlar yeniden kurulur', () => {
  const app = kaynak('webos/src/app.js');
  assert.match(app, /import \{ dilKur \} from '\.\/dil\.js';/);
  assert.match(app, /ctx\.store = createStore\(depoSec\(\)\);\s*dilKur\(ctx\.store\);/);
  const ayar = kaynak('webos/src/screens/settings.js');
  assert.match(ayar, /id: 'lang', ad: 'Dil \/ Language'/);
  assert.match(ayar, /\/\^\(lang\|liveFmt\|/);
  assert.match(ayar, /dilKur\(ctx\.store\);\s*[^]*?resetTo\('home'\);\s*open\('settings'\);/);
  assert.match(ayar, /translate="no"/); // "Türkçe" / "English" seçenek adları çevrilmez
});

// ---- telefon sayfaları (kumanda + liste aktarma): servis/telefon-dil.js ----
import vm from 'node:vm';

function telefonDili(dil, arama = '') {
  const el = { setAttribute() {}, hasAttribute: () => false, nodeType: 1, tagName: 'DIV', firstChild: null };
  const ortam = { location: { search: arama }, navigator: { language: dil }, document: { documentElement: {}, title: 'Iptv Player Pro · Kumanda', body: el }, window: {} };
  ortam.window = ortam;
  vm.runInNewContext(kaynak('webos/service/telefon-dil.js'), ortam);
  return ortam;
}

test('telefon sayfası: telefon Türkçe değilse İngilizce, Türkçeyse Türkçe; adresteki l= her şeyi yener', () => {
  assert.equal(telefonDili('tr-TR').TDIL, 'tr');
  assert.equal(telefonDili('en-US').TDIL, 'en');
  assert.equal(telefonDili('ko-KR').TDIL, 'en');
  assert.equal(telefonDili('tr-TR', '?k=1234&l=en').TDIL, 'en');
  assert.equal(telefonDili('en-US', '?k=1234&l=tr').TDIL, 'tr');
});

test('telefon sayfası: T() iletileri (düz ve eğri tırnak, kalıplı olanlar dahil) çevirir; Türkçede olduğu gibi bırakır', () => {
  const en = telefonDili('en-GB');
  assert.equal(en.T('TV ekranındaki 4 haneli kodu yazın.'), 'Enter the 4-digit code shown on the TV.');
  assert.equal(en.T("TV'ye bağlı ✓"), 'Connected to the TV ✓'); // düz tırnak
  assert.equal(en.T('Gönderilemedi (kod 503)'), 'Could not send (code 503)');
  assert.equal(en.T('“Evim” TV’ye eklendi.'), '“Evim” was added to the TV.');
  assert.equal(en.T('Bağlanılamadı: zaman aşımı. Adresi kontrol edin.'), 'Could not connect: zaman aşımı. Check the address.');
  assert.equal(en.T('Bilinmeyen bir ileti'), 'Bilinmeyen bir ileti'); // sözlükte yok: aynen
  assert.equal(telefonDili('tr-TR').T('TV’ye bağlı ✓'), 'TV’ye bağlı ✓');
});

test('telefon sayfası: servisin döndürdüğü her sabit ileti sözlükte (kumanda ve aktarma sayfaları)', () => {
  const svc = kaynak('webos/service/service.js');
  const dil = kaynak('webos/service/telefon-dil.js');
  const iletiler = [...svc.matchAll(/mesaj: '((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'")).filter((x) => x && !/ \($/.test(x));
  assert.ok(iletiler.length >= 10);
  const en = telefonDili('en-US');
  for (const m of iletiler) assert.notEqual(en.T(m), m, 'telefon sözlüğünde yok: ' + m);
  // kumanda.html'deki yaz('…') iletileri de
  const html = kaynak('webos/service/kumanda.html');
  for (const m of [...html.matchAll(/yaz\('((?:[^'\\]|\\.)*)'/g)].map((x) => x[1])) if (/[ğüşıöçĞÜŞİÖÇ]/.test(m)) assert.notEqual(en.T(m), m, 'telefon sözlüğünde yok: ' + m);
  assert.ok(dil.length > 1000);
});

test('telefon sayfası: servis dil betiğini iki sayfaya da koyar', () => {
  const svc = kaynak('webos/service/service.js');
  assert.match(svc, /var TELEFON_DIL = fs\.readFileSync\(pathm\.join\(__dirname, 'telefon-dil\.js'\)/);
  assert.match(svc, /replace\('<!--DIL-->', '<script>' \+ TELEFON_DIL \+ '<\/script>'\)/);
  assert.match(svc, /'<script>' \+ TELEFON_DIL \+ '<\/script>' \+\s*'<script>\(function\(\)\{var \$=/);
  assert.match(kaynak('webos/service/kumanda.html'), /<!--DIL-->\s*<script>/);
});
