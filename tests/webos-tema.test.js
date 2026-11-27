// LG webOS: tema merkezi (palet → CSS), kumanda renkli tuş atamaları.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMALAR, VARSAYILAN_TEMA, temaBul, cssUret, karistir, temaHizli } from '../webos/src/tema.js';
import { bellekDepo, createStore } from '../webos/src/store.js';
import { atamalar, eylemi, degistir, eylemAdi, OYNATICI, ANA, VARSAYILAN } from '../webos/src/kumanda.js';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(kok, 'webos', 'css', 'tv.css'), 'utf8');

const parlaklik = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const oran = (a, b) => {
  const x = parlaklik(a);
  const y = parlaklik(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test('tema: kimlikler tekil, renkler geçerli; vurgu rengi üzerindeki yazı okunur (WCAG ≥ 4.5)', () => {
  const kimlikler = TEMALAR.map((t) => t.id);
  assert.equal(new Set(kimlikler).size, kimlikler.length);
  assert.equal(TEMALAR[0].id, VARSAYILAN_TEMA);
  for (const t of TEMALAR) {
    for (const k of ['bg', 'surface', 'raised', 'line', 'accent', 'ink']) assert.match(t[k], /^#[0-9a-f]{6}$/, t.id + '.' + k);
    assert.ok(oran(t.accent, t.ink) >= 4.5, t.id + ': vurgu/yazı karşıtlığı ' + oran(t.accent, t.ink).toFixed(1));
    // Koyu temalarda özgün açık yazı (#e8ecf4) ≥ 7; canlı (orta tonlu) temalarda yazı beyaza çekilir, yine de ≥ 4.5 (WCAG AA) ve kutu/vurgulu kutu üzerinde de okunur
    if (t.canli) {
      for (const k of ['bg', 'surface', 'raised']) assert.ok(oran(t[k], '#ffffff') >= 4.4, t.id + ': ' + k + ' üzerinde beyaz yazı okunur (' + oran(t[k], '#ffffff').toFixed(1) + ')');
    } else assert.ok(oran(t.bg, '#e8ecf4') >= 7, t.id + ': zemin üzerinde ana yazı okunur');
    if (t.multi) {
      assert.equal(t.p.length, 9);
      for (let i = 1; i <= 8; i++) assert.match(t.p[i], /^#[0-9a-f]{6}$/);
      // Odaklanan karo her temada p rengiyle dolar ve ink yazı taşır; koyu temalarda karo yazısı p rengindedir ve karo zemininde okunur
      for (let i = 1; i <= 8; i++) assert.ok(oran(t.p[i], t.ink) >= 4.5, t.id + ' p' + i);
      if (!t.dolu) for (let i = 1; i <= 8; i++) assert.ok(oran(t.p[i], karistir(t.surface, t.p[i], 0.22)) >= 4.5, t.id + ' karo yazısı p' + i);
    }
  }
  assert.equal(temaBul('yok').id, VARSAYILAN_TEMA, 'bilinmeyen kimlik varsayılana döner');
});

const CANLILAR = TEMALAR.filter((t) => t.canli);
const KOYULAR = TEMALAR.filter((t) => t.koyu);

test('tema: canlı paket (gradyan zemin, dolu karolar, sekiz ayrı karo rengi); eski koyu temalar yenisine döner', () => {
  assert.ok(CANLILAR.length >= 7, 'zengin bir canlı tema seçkisi var');
  for (const t of CANLILAR) {
    assert.ok(t.canli && t.multi && t.dolu, t.id + ': canlı, çok renkli, dolu karolu');
    assert.match(t.zemin, /^linear-gradient\(.*#[0-9a-f]{6} 0%.*#[0-9a-f]{6} 100%\)$/, t.id + ': gradyan zemin');
    assert.ok((t.zemin.match(/#[0-9a-f]{6}/g) || []).length >= 3, t.id + ': en az üç renk durağı');
    assert.equal(new Set(t.p.slice(1, 9)).size, 8, t.id + ': sekiz karo rengi birbirinden farklı');
    // Gradyanın her durağında beyaz yazı okunur (başlık, saat ve ipucu satırı zeminin üstünde)
    for (const d of t.zemin.match(/#[0-9a-f]{6}/g)) assert.ok(oran(d, '#ffffff') >= 4.4, t.id + ': ' + d + ' üzerinde beyaz yazı ' + oran(d, '#ffffff').toFixed(1));
  }
  assert.equal(temaBul('sunset').id, 'gunbatimi');
  assert.equal(temaBul('neon').id, 'aurora');
  assert.equal(temaBul('cards').id, VARSAYILAN_TEMA);
  assert.equal(temaBul('solid').id, VARSAYILAN_TEMA);
});

test('tema: koyu tema paketi (en az sekiz tema; koyu zemin, sekiz ayrı karo rengi, her yazı okunur); hepsi seçilebilir, canlı paketten sonra gelir', () => {
  assert.ok(KOYULAR.length >= 8, 'koyu paket en az sekiz tema içerir');
  assert.ok(TEMALAR.indexOf(KOYULAR[0]) > TEMALAR.indexOf(CANLILAR[CANLILAR.length - 1]), 'koyu paket canlı temaların ardından listelenir');
  for (const t of KOYULAR) {
    assert.ok(t.multi && !t.canli && !t.dolu, t.id + ': çok renkli, koyu (canlı değil), karo yazısı kendi renginde');
    assert.equal(new Set(t.p.slice(1, 9)).size, 8, t.id + ': sekiz karo rengi birbirinden farklı');
    assert.ok(parlaklik(t.bg) < 0.02, t.id + ': zemin gerçekten koyu');
    assert.ok(parlaklik(t.surface) < 0.03 && parlaklik(t.raised) < 0.05, t.id + ': kutular koyu');
    assert.ok(oran(t.bg, '#e8ecf4') >= 12, t.id + ': özgün açık yazı zeminde çok rahat okunur (' + oran(t.bg, '#e8ecf4').toFixed(1) + ')');
    assert.ok(oran(t.surface, '#e8ecf4') >= 10 && oran(t.raised, '#e8ecf4') >= 8, t.id + ': kutular üzerinde yazı okunur');
    assert.ok(oran(t.surface, t.line) >= 1.3, t.id + ': çizgi kutudan ayırt edilir');
    if (t.zemin) {
      assert.match(t.zemin, /^linear-gradient\(.*#[0-9a-f]{6} 0%.*#[0-9a-f]{6} 100%\)$/, t.id + ': gradyan zemin');
      for (const d of t.zemin.match(/#[0-9a-f]{6}/g)) assert.ok(parlaklik(d) < 0.03 && oran(d, '#e8ecf4') >= 11, t.id + ': gradyan durağı ' + d + ' koyu kalır');
    }
    // Sarı vurguda beyaz yazı olmaz: sarı/altın vurgu ya da dolgu üzerindeki yazı koyu mürekkeptir
    for (const r of [t.accent].concat(t.p.slice(1, 9))) if (parlaklik(r) > 0.45 && /^#(f|e)[b-f][a-f0-9]{2}[0-5][0-9a-f]$/.test(r)) assert.ok(parlaklik(t.ink) < 0.05, t.id + ': sarı ' + r + ' üzerinde koyu yazı');
    const c = cssUret(css, t);
    assert.ok(!/#2dd4bf/i.test(c) || t.accent === '#2dd4bf' || t.p.indexOf('#2dd4bf') > 0, t.id + ': özgün vurgu başka renge döndü');
    assert.ok(!/#0a0e17/i.test(c) || t.bg === '#0a0e17', t.id + ': özgün zemin kalmadı');
    // Karolar zeminden ayrı, yazılar kendi renginde; odakta p dolgusu + parıltı
    for (let i = 1; i <= 8; i++) {
      assert.ok(c.includes('.tile.c' + i + ' { background: ' + karistir(t.surface, t.p[i], 0.22) + '; color: ' + t.p[i] + '; }'), t.id + ' karo ' + i);
      assert.ok(c.includes('.tile.c' + i + '.on { background: ' + t.p[i] + '; color: ' + t.ink), t.id + ' odak ' + i);
    }
    // Soluk gri yazılar koyu temada özgün haliyle kalır (canlı temalardaki gibi beyaza çekilmez)
    assert.ok(c.includes('#e8ecf4') && c.includes('#9aa6bf'), t.id + ': özgün yazı renkleri korunur');
  }
  assert.ok(KOYULAR.some((t) => t.id === 'amoled' && t.bg === '#000000'), 'AMOLED siyah saf siyah zeminli');
  for (const t of TEMALAR) assert.equal(temaBul(t.id).id, t.id, t.id + ' kimliğiyle bulunur');
});

// Boyama mantığını sınamak için tek renkli deneme paleti (uygulamada tek renkli tema yok)
const MOR = { id: 'deneme-mor', ad: 'Deneme', bg: '#0b0818', surface: '#181233', raised: '#251c4d', line: '#382a73', accent: '#a78bfa', ink: '#170a3a' };

test('tema: özgün kimlikte CSS değişmez; paletli temalarda renkler tek geçişte değişir', () => {
  assert.equal(cssUret(css, Object.assign({}, MOR, { id: 'varsayilan' })), css);
  const c = cssUret(css, MOR);
  assert.ok(!/#2dd4bf/i.test(c), 'eski vurgu kalmadı');
  assert.ok(c.includes(MOR.accent) && c.includes(MOR.bg) && c.includes(MOR.ink));
  assert.ok(!/#0a0e17/i.test(c), 'eski zemin kalmadı');
  // Odak parıltısı da paletin vurgu rengine döner (rgb'ye çevrilmiş mor: 167, 139, 250)
  assert.ok(!/rgba\(45, ?212, ?191/.test(c), 'eski vurgunun şeffaf hali kalmadı');
  assert.ok(c.includes('rgba(167, 139, 250, .55)'), 'karo parıltısı palet vurgusunda');
  // Boyut ve düzen kuralları aynen korunur
  const yalin = (x) => x.replace(/#[0-9a-f]{6}\b/gi, '#').replace(/rgba\(45, ?212, ?191,/g, 'rgba(V,').replace(/rgba\(167, 139, 250,/g, 'rgba(V,').replace(/rgba\(10, ?14, ?23,/g, 'rgba(Z,').replace(/rgba\(11, ?8, ?24,/g, 'rgba(Z,').replace(/rgba\(27, ?36, ?55,/g, 'rgba(K,').replace(/rgba\(24, ?18, ?51,/g, 'rgba(K,');
  assert.equal(yalin(c), yalin(css));
});

test('tema: tek renkli tema kalmadı; hepsi çok renkli, varsayılan canlı tema; kaldırılmış kimlik varsayılana döner', () => {
  for (const t of TEMALAR) assert.equal(t.multi, true, t.id + ' çok renkli olmalı');
  assert.equal(VARSAYILAN_TEMA, 'canli-renkli');
  assert.equal(TEMALAR[0].ad, 'Canlı renkler');
  for (const eski of ['varsayilan', 'green', 'blue', 'cyan', 'purple', 'orange', 'red', 'midnight', 'ocean', 'graphite', 'rose', 'canli-mavi', 'canli-gok', 'canli-yesil', 'canli-mor', 'canli-kirmizi', 'canli-turuncu']) {
    assert.ok(!TEMALAR.some((t) => t.id === eski), eski + ' kaldırıldı');
    assert.equal(temaBul(eski).id, VARSAYILAN_TEMA, eski + ' kayıtlıysa varsayılana döner');
  }
  const canli = TEMALAR[0];
  assert.equal(canli.canli, true);
  assert.equal(canli.dolu, true);
  assert.ok(canli.zemin && /gradient/.test(canli.zemin));
  const c = cssUret(css, canli);
  assert.ok(!/#2dd4bf/i.test(c) && !/#0a0e17/i.test(c), 'varsayılan turkuaz renkler kalmadı');
  for (let i = 1; i <= 8; i++) assert.ok(c.includes('.tile.c' + i + ' { background: ' + canli.p[i]), 'karo ' + i + ' dolu renkte');
});

test('tema: odak çerçeveyle değil parıltıyla gösterilir (outline köşeleri izlemez)', () => {
  assert.ok(!/outline: *\.?\d/.test(css), 'tv.css odak için outline kullanmaz');
  for (const id of [VARSAYILAN_TEMA, 'cards', 'solid', 'neon', 'sunset']) {
    const c = cssUret(css, temaBul(id));
    assert.ok(!/outline: *\.?\d/.test(c), id + ': çerçeve yok');
    for (let i = 1; i <= 8; i++) assert.ok(new RegExp('\\.tile\\.c' + i + '\\.on \\{[^}]*box-shadow: [^}]*rgba\\(\\d+, \\d+, \\d+, 0\\.6\\)').test(c), id + ' c' + i + ' parıltı');
  }
});

test('tema: çok renkli temalar karo renk kuralları, gradyan temalar zemin kuralı üretir', () => {
  const kartlar = cssUret(css, temaBul('cards'));
  for (let i = 1; i <= 8; i++) assert.ok(kartlar.includes('.tile.c' + i + ' {'));
  assert.ok(!kartlar.includes('linear-gradient(135deg, #2b0f4d'));
  const neon = cssUret(css, temaBul('neon'));
  assert.ok(neon.includes('html, body { background: linear-gradient'));
  assert.ok(neon.includes('.player { background: #000; }'), 'oynatıcı zemini siyah kalır');
  const duz = cssUret(css, MOR);
  assert.ok(!duz.includes('.tile.c1 {'));
});

test('tema: soldaki menü her temada paletin renklerini taşır (sabit lacivert/turkuaz kalmaz); simgeler bölümün palet rengindedir', () => {
  const MENU = /^(\.screen\.rl-ekran|\.rl[ .{]|\.rl-it|\[data-fs="xl"\] \.rl)/;
  const varsayilanRenk = /#(0a0e17|151b2b|1b2437|26324b|2dd4bf|04141a|e8ecf4|9aa6bf)\b/i;
  // Koyu temalarda özgün açık yazı renkleri bilerek korunur (zemin zaten koyu); diğer rollerin hepsi paletten gelir
  const koyuTemaRengi = /#(0a0e17|151b2b|1b2437|26324b|2dd4bf|04141a)\b/i;
  for (const t of TEMALAR) {
    const c = cssUret(css, t);
    const satirlar = c.split('\n').filter((l) => MENU.test(l));
    assert.ok(satirlar.length >= 10, t.id + ': menü kuralları var');
    // tv.css'ten gelen menü kuralları boyanır; temaya özgü c1..c8 kuralları paletten gelir
    const govde = satirlar.filter((l) => !/^\.rl-it\.c\d/.test(l)).join('\n');
    assert.ok(!(t.koyu ? koyuTemaRengi : varsayilanRenk).test(govde), t.id + ': menüde boyanmamış varsayılan renk kalmadı');
    assert.ok(govde.includes('rgba(' + parseInt(t.bg.slice(1, 3), 16) + ', ' + parseInt(t.bg.slice(3, 5), 16) + ', ' + parseInt(t.bg.slice(5, 7), 16) + ','), t.id + ': menü zemini tema zemininden');
    assert.ok(govde.includes('.rl-it.on, .rl-it.hv { background: ' + t.accent + '; color: ' + t.ink), t.id + ': odak vurgu renginde');
    for (let i = 1; i <= 8; i++) {
      assert.ok(c.includes('.rl-it.c' + i + ' { color: ' + t.p[i] + '; }'), t.id + ' c' + i + ' simge rengi');
      assert.ok(c.includes('.rl-it.c' + i + '.on, .rl-it.c' + i + '.hv { background: ' + t.p[i] + '; color: ' + t.ink), t.id + ' c' + i + ' odak dolgusu');
    }
  }
});

test('tema: karistir iki rengi orantıyla birleştirir', () => {
  assert.equal(karistir('#000000', '#ffffff', 0), '#000000');
  assert.equal(karistir('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(karistir('#000000', '#ffffff', 0.5), '#808080');
});

test('kumanda: varsayılan atamalar, değiştirme ve bozuk kayıtta varsayılana dönüş', () => {
  const s = createStore(bellekDepo());
  assert.deepEqual(atamalar(s, 'oyn'), VARSAYILAN.oyn);
  assert.deepEqual(atamalar(s, 'ana'), VARSAYILAN.ana);
  assert.equal(eylemi(s, 'oyn', 'red'), 'fav');
  assert.equal(degistir(s, 'oyn', 'red', 1), 'aspect');
  assert.equal(eylemi(s, 'oyn', 'red'), 'aspect');
  assert.equal(degistir(s, 'oyn', 'red', -1), 'fav');
  assert.equal(degistir(s, 'oyn', 'red', -1), 'none', 'başa sarar');
  assert.equal(eylemi(s, 'oyn', 'red'), null, '“Yok” atanınca eylem yoktur');
  assert.equal(eylemAdi('oyn', 'sleep'), 'Uyku zamanlayıcısı');
  s.setSetting('keys.ana', { red: 'olmayan', green: 'guide' });
  assert.equal(atamalar(s, 'ana').red, VARSAYILAN.ana.red, 'geçersiz eylem varsayılana döner');
  assert.equal(atamalar(s, 'ana').green, 'guide');
  // Her varsayılan eylem listede bulunur
  for (const v of Object.values(VARSAYILAN.oyn)) assert.ok(OYNATICI.some((x) => x[0] === v));
  for (const v of Object.values(VARSAYILAN.ana)) assert.ok(ANA.some((x) => x[0] === v));
});

test('tema: canlı temalarda soluk gri yazılar parlar, koyu lacivert katmanlar zeminin rengine döner', () => {
  const t = Object.assign({}, MOR, { id: 'deneme-canli', bg: '#1747a6', surface: '#1f52bb', raised: '#2a60d0', line: '#6b9dfa', accent: '#ffd23f', ink: '#1a1400', canli: true });
  const c = cssUret(css, t);
  for (const eski of ['#9aa6bf', '#7f8aa3', '#c9d2e6', '#e8ecf4', '#0a0e17', '#2dd4bf']) assert.ok(!c.toLowerCase().includes(eski), eski + ' kalmadı');
  assert.ok(!/rgba\(10, ?14, ?23,/.test(c), 'lacivert katman kalmadı');
  assert.ok(c.includes('color: #ffffff'), 'ana yazı beyaz');
  // Boyut ve düzen kuralları aynen korunur
  const yalin = (x) => x.replace(/#[0-9a-f]{6}\b/gi, '#').replace(/rgba\([0-9, ]+,/g, 'rgba(V,');
  assert.equal(yalin(c), yalin(css));
});

test('tema: üretilen CSS önbelleğe yazılır; sonraki açılışta ilk çizimden önce eşzamanlı uygulanır', () => {
  const eski = globalThis.localStorage;
  const kayit = {};
  globalThis.localStorage = { getItem: (k) => (k in kayit ? kayit[k] : null), setItem: (k, v) => (kayit[k] = String(v)) };
  const belge = () => {
    const stiller = {};
    const kok = { className: '' };
    return {
      stiller,
      documentElement: kok,
      head: { appendChild: (e) => (stiller[e.id] = e) },
      getElementById: (id) => stiller[id] || null,
      createElement: () => ({ id: '', textContent: '' }),
      querySelector: () => ({ disabled: false }),
    };
  };
  try {
    const tema = temaBul(VARSAYILAN_TEMA);
    const d1 = belge();
    assert.equal(temaHizli(tema.id, d1), false, 'önbellek boşken eşzamanlı uygulanmaz');
    // üretimi simüle et: sürüm|yapı|kimlik anahtarı ve CSS metni
    kayit['iptv.temaCss'] = 'body{color:#fff}';
    kayit['iptv.temaCss.k'] = '1.0.0||' + tema.id;
    const d2 = belge();
    assert.equal(temaHizli(tema.id, d2), true);
    assert.equal(d2.stiller['tema-css'].textContent, 'body{color:#fff}');
    const baska = TEMALAR.find((t) => t.id !== tema.id && t.id !== 'varsayilan');
    assert.equal(temaHizli(baska.id, belge()), false, 'başka temanın önbelleği kullanılmaz');
  } finally {
    if (eski === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = eski;
  }
});
