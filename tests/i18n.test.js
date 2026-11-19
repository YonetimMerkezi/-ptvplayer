import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EN_PAIRS } from '../www/js/i18n-en.js';
import { normalizeLang, resolveLang, setLang, lang, loc, translate, translateTree, LANG_CHOICES } from '../www/js/i18n.js';

const kaynak = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const phs = (s) => (s.match(/\{\d+\}/g) || []).sort().join(',');

test('dil seçimi: otomatik cihaz diline bakar (tr ise Türkçe, değilse İngilizce); geçersiz değer otomatiğe döner', () => {
  assert.deepEqual(LANG_CHOICES.map(([k]) => k), ['auto', 'tr', 'en']);
  assert.equal(normalizeLang('en'), 'en');
  assert.equal(normalizeLang('de'), 'auto');
  assert.equal(normalizeLang(undefined), 'auto');
  assert.equal(resolveLang('auto', 'tr-TR'), 'tr');
  assert.equal(resolveLang('auto', 'en-US'), 'en');
  assert.equal(resolveLang('auto', 'de'), 'en');
  assert.equal(resolveLang('auto', ''), 'en');
  assert.equal(resolveLang('tr', 'en-US'), 'tr');
  assert.equal(resolveLang('en', 'tr-TR'), 'en');
});

test('Türkçe seçiliyken hiçbir metin değişmez; tarih biçimi tr-TR', () => {
  setLang('tr');
  assert.equal(lang(), 'tr');
  assert.equal(translate('Ayarlar'), 'Ayarlar');
  assert.equal(loc(), 'tr-TR');
});

test('İngilizce: birebir eşleşme, boşluk korunur, yer tutuculu kalıp, sözlükte olmayan metin aynen kalır', () => {
  setLang('en');
  try {
    assert.equal(lang(), 'en');
    assert.equal(loc(), 'en-GB');
    assert.equal(translate('Ayarlar'), 'Settings');
    assert.equal(translate('  Favoriler\n'), '  Favorites\n');
    assert.equal(translate('3 öğe'), '3 items');
    assert.equal(translate('Gece yarısı filmi Çınar'), 'Gece yarısı filmi Çınar', 'kullanıcı içeriği çevrilmez');
    assert.equal(translate(''), '');
    assert.equal(translate(42), 42);
  } finally { setLang('tr'); }
});

test('İngilizce: birleştirilmiş metin parça parça çevrilir (cümle ve " · " ayraçları)', () => {
  setLang('en');
  try {
    assert.equal(translate('Normal · Beyaz · yarı saydam zemin'), 'Normal · White · semi-transparent background');
    assert.match(translate('Önce TV’de Ayarlar › Telefondan oynat ekranını açın (liste olmayan TV’de ilk ekrandaki “Telefondan al”); QR kod ve 6 haneli kod orada görünür. Sonra QR kodu tarayın ya da buradan TV’ye dokunup kodu girin. Telefon ve TV aynı Wi‑Fi ağında olmalı; TV’de uygulama açık olmalı. TV’de Ayarlar › Telefondan oynat ekranı QR kodu ve eşleştirme kodunu gösterir.'), /^First open Settings .* The TV's Settings › Play from phone screen shows the QR code and pairing code\.$/);
    assert.equal(translate('Kimsenin çevirisi olmayan tek cümle. Bir tane daha.'), 'Kimsenin çevirisi olmayan tek cümle. Bir tane daha.');
  } finally { setLang('tr'); }
});

test('sözlük bütünlüğü: anahtarlar tekil, yer tutucular iki tarafta aynı, boş çeviri yok', () => {
  const seen = new Set();
  for (const [tr, en] of EN_PAIRS) {
    assert.ok(typeof tr === 'string' && typeof en === 'string' && tr && en, 'boş çift: ' + tr);
    assert.equal(phs(tr), phs(en), 'yer tutucu uyuşmuyor: ' + tr);
    const k = tr.replace(/\s+/g, ' ').trim();
    assert.ok(!seen.has(k), 'yinelenen anahtar: ' + k);
    seen.add(k);
  }
  assert.ok(EN_PAIRS.length > 1500, 'sözlük dolu: ' + EN_PAIRS.length);
});

test('DOM çevirici: metin ve placeholder/title/aria-label çevrilir; translate="no" alt ağacı çevrilmez; script/textarea atlanır', () => {
  const mk = (tag, attrs = {}, kids = []) => {
    const el = { nodeType: 1, tagName: tag, attrs: { ...attrs }, firstChild: null, nextSibling: null,
      getAttribute(a) { return this.attrs[a] ?? null; }, hasAttribute(a) { return a in this.attrs; }, setAttribute(a, v) { this.attrs[a] = v; } };
    let prev = null;
    for (const k of kids) { if (prev) prev.nextSibling = k; else el.firstChild = k; prev = k; }
    return el;
  };
  const txt = (v) => ({ nodeType: 3, nodeValue: v, nextSibling: null });
  setLang('en');
  try {
    const t1 = txt('Ayarlar'); const t2 = txt('Türkçe'); const t3 = txt('Favoriler'); const t4 = txt('Ayarlar');
    const root = mk('DIV', {}, [
      mk('BUTTON', { 'aria-label': 'Kapat' }, [t1]),
      mk('OPTION', { translate: 'no' }, [t2]),
      mk('TEXTAREA', {}, [t3]),
      mk('INPUT', { placeholder: 'Ara…' }, []),
      mk('SPAN', {}, [t4]),
    ]);
    translateTree(root);
    assert.equal(t1.nodeValue, 'Settings');
    assert.equal(root.firstChild.attrs['aria-label'], 'Close');
    assert.equal(t2.nodeValue, 'Türkçe', 'translate="no" atlanır');
    assert.equal(t3.nodeValue, 'Favoriler', 'textarea atlanır');
    assert.equal(root.firstChild.nextSibling.nextSibling.nextSibling.attrs.placeholder, 'Search…');
    assert.equal(t4.nodeValue, 'Settings');
  } finally { setLang('tr'); }
});

test('uygulamaya bağlantı: açılışta startI18n, ayarlarda dil satırı (dil adları çevrilmez), tarihler loc() ile', () => {
  const app = kaynak('www/js/app.js');
  assert.match(app, /import \{ startI18n, loc, LANG_CHOICES, normalizeLang \} from '\.\/i18n\.js';/);
  assert.match(app, /startI18n\(\{ pref: store\.pref\('set\.lang', 'auto'\)/);
  assert.match(app, /selRow\('g-lang', 'Dil \/ Language'/);
  assert.match(app, /v === 'auto' \? '' : ' translate=\\"no\\"'|v === 'auto' \? '' : ' translate="no"'/, 'Türkçe / English seçenekleri çevrilmez');
  assert.match(app, /store\.setPref\('set\.lang', normalizeLang\(e\.target\.value\)\);[\s\S]*location\.reload\(\)/, 'dil değişince yeniden başlar');
  assert.ok(!/toLocale\w*String\([^)]*'tr-TR'/.test(kaynak('www/js/plan.js')), 'plan.js tr-TR sabitlemez');
  for (const f of ['expiry', 'plan', 'series-flow-ui', 'sports-detail-ui']) assert.match(kaynak(`www/js/${f}.js`), /from '\.\/i18n\.js'/, f);
});
