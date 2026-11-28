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

test('eski WebView: ana sayfa satır afişleri aspect-ratio yerine kart genişliğinden türeyen yükseklikle çizilir; tüm kartlar aynı genişlikte', () => {
  const satirAfis = css.split('\n').filter((l) => /\.home-row-s \.card[^{]*\.poster\s*\{/.test(l));
  assert.ok(satirAfis.length >= 2, 'satır afişi kuralları bulundu: ' + satirAfis.length);
  for (const l of satirAfis) {
    assert.equal(/aspect-ratio/.test(l.replace(/\/\*.*?\*\//g, '')), false, 'aspect-ratio yok: ' + l.trim().slice(0, 70));
  }
  // tüm satırlarda (kaldığın yer, son izlenenler, filmler, diziler, vizyondakiler, radyo) kart genişliği afiş yüksekliğinin 2/3'ü: hepsi aynı
  assert.match(css, /\.home-row-s \.card \.poster \{ flex: none; height: var\(--hp-h\); \}/, 'afiş yüksekliği tek değişkenden');
  assert.match(css, /\.home-row-s \.card \{ flex: 0 0 calc\(var\(--hp-h\) \* 2 \/ 3\); width: calc\(var\(--hp-h\) \* 2 \/ 3\);/, '2:3 kart genişliği');
  assert.match(css, /\.home-row-s \.sh-more \{ flex: 0 0 calc\(var\(--hp-h\) \* 2 \/ 3\);/, '“Tümünü gör” kartı da aynı genişlikte');
  assert.match(css, /\.home-row-s\.rd-s \{ --rd-w: calc\(var\(--hp-h\) \* 2 \/ 3\); \}/, 'radyo kartı da aynı genişlikte');
  assert.equal(/\.home-row-s \.card\.nw\b/.test(css), false, 'vizyondaki kartı ayrı boyutlanmaz');
});
