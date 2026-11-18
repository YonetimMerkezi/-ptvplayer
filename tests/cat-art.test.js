import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { CAT_ART_RULES, CAT_ART_IDS, catArtId, catArtImg } from '../www/js/cat-art.js';

const oku = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const row = (name, extra = {}) => ({ id: 'g:' + name, name, ...extra });

test('kategori görseli: ad Türkçe harf/büyük-küçük/önek fark etmeksizin türe eşlenir', () => {
  const beklenen = {
    'ULUSAL': 'ulusal', 'TR ⇒ SPOR': 'spor', 'Haber': 'haber', 'SİNEMA & DİZİ (PLATFORM)': 'sinema', 'Çocuk': 'cocuk', 'MÜZİK': 'muzik',
    'DİNİ': 'dini', 'Belgesel': 'belgesel', 'TR | UHD': 'uhd', '4K Kanallar': 'uhd', 'Dizi Kanalları': 'dizi', 'Eğlence': 'eglence', 'Yarışma': 'eglence',
    'Almanya': 'ulke', 'Arabic': 'ulke', 'beIN Sports': 'spor', 'Çocuk Filmleri': 'cocuk', 'Spor Haber': 'spor', 'Netflix': 'genel', 'Yerel': 'ulusal',
  };
  for (const [ad, id] of Object.entries(beklenen)) assert.equal(catArtId(row(ad)), id, ad);
  assert.equal(catArtId(null), 'genel');
  assert.equal(catArtId(row('')), 'genel');
});

test('kategori görseli: özel satırlar ve klasör kendi görselini alır', () => {
  assert.equal(catArtId({ id: '__all', name: 'Tümü', special: true }), 'tumu');
  assert.equal(catArtId({ id: '__recent', name: 'Son izlenen', special: true }), 'son');
  assert.equal(catArtId({ id: '__cont', name: 'Devam et', special: true }), 'son');
  assert.equal(catArtId({ id: '__new', name: 'Yeni eklenenler', special: true }), 'tumu');
  assert.equal(catArtId({ id: '__top', name: 'En çok puan alanlar', special: true }), 'genel');
  assert.equal(catArtId({ id: 'f:1', name: 'Spor', folder: true }), 'klasor', 'klasör adı ne olursa olsun klasör görseli');
});

test('kategori görseli: her kimliğin dosyası var, küçük (WebP ≤ 60 KB), dış bağlantı yok', () => {
  assert.equal(new Set(CAT_ART_RULES.map((r) => r[0])).size, CAT_ART_RULES.length, 'kural kimlikleri tekil');
  assert.ok(CAT_ART_IDS.length >= 16);
  for (const id of CAT_ART_IDS) {
    const yol = new URL(`../www/img/cat/${id}.webp`, import.meta.url);
    assert.ok(existsSync(yol), id + ' görseli yok');
    const kb = statSync(yol).size / 1024;
    assert.ok(kb > 3 && kb <= 60, `${id}: ${kb.toFixed(1)} KB`);
    const b = readFileSync(yol);
    assert.equal(b.subarray(0, 4).toString('latin1'), 'RIFF', id + ' WebP değil');
    assert.equal(b.subarray(8, 12).toString('latin1'), 'WEBP', id + ' WebP değil');
  }
  const html = catArtImg('spor');
  assert.match(html, /src="img\/cat\/spor\.webp"/, 'çevrimdışı çalışsın: göreli yol');
  assert.match(html, /onerror="this\.remove\(\)"/, 'görsel yoksa kart bozulmaz');
  assert.doesNotMatch(html, /https?:/);
});

test('bağlantı: yalnız Canlı TV kategorilerinde görselli kart; düzenleme modunda sade satır; eski çizim simgeleri kalmadı', () => {
  const app = oku('www/js/app.js');
  assert.match(app, /function catRow\(c, i, kind\)/);
  assert.match(app, /kind === 'live' && !S\.catEdit\) \{\n\s+return `<div class="row cat vis/);
  assert.match(app, /render: \(c, i\) => catRow\(c, i, kind\)/);
  assert.match(app, /render: \(c, i\) => categoryTile\(c, i, kind\)/);
  assert.match(app, /rowH: scaled\(kind === 'live' && !S\.catEdit \? 92 : 56\)/);
  assert.doesNotMatch(oku('www/index.html'), /id="art-/, 'vektör çizimler kaldırıldı');
  assert.doesNotMatch(readFileSync(new URL('../www/js/cat-art.js', import.meta.url), 'utf8'), /catArtSvg/);
});

test('stil: görsel sağda, sola doğru kart rengine erir; yazı beyaz (koyu görsel üstünde) ve sarı dolgu üstünde değil', () => {
  const css = oku('www/css/app.css');
  const blok = css.slice(css.indexOf('/* Canlı TV kategorileri'), css.indexOf('/* Ana ekran film önerisi'));
  assert.match(blok, /\.row\.cat\.vis \.cat-art \{[^}]*object-position: right center/);
  assert.match(blok, /\.row\.cat\.vis::after \{ background: linear-gradient\(90deg, var\(--vis-bg\)/);
  assert.match(blok, /--vis-bg: color-mix\(in srgb, var\(--accent\) 14%, #070b14\)/, 'kart zemini temanın rengini taşır');
  assert.doesNotMatch(blok, /background:\s*var\(--accent\)[^;]*;[^}]*color:\s*#fff/, 'dolgu rengi üstünde beyaz yazı yok');
});
