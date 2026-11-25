// Eski Android WebView (Chrome 80–86: projeksiyon, TV kutusu): yeni CSS kısayolları yok sayılınca ana kapsayıcı ekrandan taşıyor,
// afişler çöküyor. Bu yüzden `inset` kısayolu ve satır afişlerinde `aspect-ratio` kullanılmaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../www/css/app.css', import.meta.url), 'utf8');

test('eski WebView: `inset` kısayolu yok; tam ekran kapsayıcı dört kenarla sabitlenir', () => {
  assert.equal(/(?<![-\w])inset\s*:/.test(css), false, 'inset: kısayolu Chrome 87 öncesinde yok sayılır; top/right/bottom/left yazılmalı');
  assert.match(css, /#app \{ position: fixed; top: 0; right: 0; bottom: 0; left: 0;/, '#app ekrana dört kenarından bağlı');
  assert.match(css, /#hero-tr \{ position: fixed; top: 0; right: 0; bottom: 0; left: 0;/);
});

test('eski WebView: ana sayfa satır afişleri aspect-ratio yerine kart genişliğinden türeyen yükseklikle çizilir', () => {
  const satirAfis = css.split('\n').filter((l) => /\.home-row-s \.card[^{]*\.poster\s*\{/.test(l));
  assert.ok(satirAfis.length >= 5, 'satır afişi kuralları bulundu: ' + satirAfis.length);
  for (const l of satirAfis) {
    assert.equal(/aspect-ratio/.test(l.replace(/\/\*.*?\*\//g, '')), false, 'aspect-ratio yok: ' + l.trim().slice(0, 70));
  }
  assert.match(css, /\.home-row-s \.card \.poster \{ flex: none; height: clamp\(129px, 10\.69vw, 180px\);/, 'geniş ekranda 16:9 (kart 230–320px)');
  assert.match(css, /\.home-row-s \.card\.nw \.poster \{ height: clamp\(195px, 16\.5vw, 285px\); \}/, '2:3 afiş (kart 130–190px)');
  assert.match(css, /\.home-row-s \.card\.is-live \.poster \{ flex: none; height: 112px; \}/, 'telefonda canlı kart kare');
});
