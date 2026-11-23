// LG webOS 3.x (Chromium 38): üreteç (function*) üzerinde for-of ve String.prototype.matchAll yineleyicisi okunamaz.
// "Fragman aranamadı: Invalid attempt to iterate non-iterable instance" hatasının kökü buydu. webOS paketine giren tüm modüller bu yapılardan arınmış kalmalı.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allMatches } from '../www/js/util.js';
import { trailerIds, MAX_TRAILERS } from '../www/js/cinemeta.js';
import { parseYoutubeResults } from '../www/js/yt-search.js';

const kok = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Giriş dosyalarından göreli içe aktarmaları izleyerek paketin içine giren kaynak dosyaları toplar
function paketDosyalari(girisler) {
  const gorulen = new Set();
  const sira = girisler.map((g) => resolve(kok, g));
  while (sira.length) {
    const f = sira.pop();
    if (gorulen.has(f) || !existsSync(f)) continue;
    gorulen.add(f);
    const kod = readFileSync(f, 'utf8');
    for (const m of kod.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) sira.push(resolve(dirname(f), m[1]));
  }
  return [...gorulen];
}
// Yorum satırlarını at (açıklamalar yasak yapıları anabilir); "://" içeren adresler korunur
const yorumsuz = (kod) => kod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

const DOSYALAR = paketDosyalari(['webos/src/main.js', 'webos/src/isci.js']);

test('webOS paketine giren kaynaklar bulunur (tarama boş kalmasın)', () => {
  const adlar = DOSYALAR.map((f) => f.slice(kok.length + 1));
  for (const gerek of ['webos/src/fragman.js', 'www/js/yt-search.js', 'www/js/cinemeta.js', 'www/js/sports-se.js', 'www/js/cats.js', 'www/js/util.js']) {
    assert.ok(adlar.includes(gerek), gerek + ' pakette olmalı');
  }
});

test('webOS paketinde üreteç (function*/yield) ve String.prototype.matchAll yok', () => {
  const kotu = [];
  for (const f of DOSYALAR) {
    const kod = yorumsuz(readFileSync(f, 'utf8'));
    if (/function\s*\*/.test(kod) || /\byield\b/.test(kod)) kotu.push(f.slice(kok.length + 1) + ': üreteç');
    if (/\.matchAll\s*\(/.test(kod)) kotu.push(f.slice(kok.length + 1) + ': matchAll');
    if (/\bfor\s+await\b/.test(kod) || /async\s+function\s*\*/.test(kod)) kotu.push(f.slice(kok.length + 1) + ': eşzamansız üreteç');
  }
  assert.deepEqual(kotu, [], 'webOS 3.x bu yapıları yinelenemez bırakır; allMatches / düz döngü kullanın');
});

test('allMatches: tüm eşleşmeleri dizi olarak verir, boş eşleşmede takılmaz, paylaşılan ifadenin durumunu sıfırlar', () => {
  assert.deepEqual(allMatches(/\d+/g, 'a1b22c333').map((m) => m[0]), ['1', '22', '333']);
  assert.deepEqual(allMatches(/ (20\d\d) /g, ' x 2024 y 2026 ').map((m) => Number(m[1])), [2024, 2026]);
  assert.deepEqual(allMatches(/x*/g, 'ab').length, 3, 'boş eşleşme sonsuz döngü yapmaz');
  assert.deepEqual(allMatches(/\d/g, null), [], 'null/undefined boş dizi');
  const ortak = /\d/g;
  ortak.lastIndex = 5;
  assert.equal(allMatches(ortak, '123').length, 3, 'önceki lastIndex yok sayılır');
  assert.equal(ortak.lastIndex, 0);
  assert.ok(Array.isArray(allMatches(/a/g, 'a')), 'Array.isArray: Babel for-of yardımcısı diziyi doğrudan yineler');
});

test('trailerIds: yinelenenler atılır, sıra korunur, en çok MAX_TRAILERS kimlik (Set/yayma olmadan)', () => {
  const id = (c) => c.repeat(11);
  const detay = { trailers: [id('a'), id('b'), id('a')] };
  assert.deepEqual(trailerIds(detay, id('c')), [id('a'), id('b'), id('c')]);
  assert.deepEqual(trailerIds(null, 'https://www.youtube.com/watch?v=' + id('z')), [id('z')]);
  assert.deepEqual(trailerIds(null, ''), []);
  const cok = { trailers: ['a', 'b', 'c', 'd', 'e', 'f'].map((c) => id(c)) };
  assert.equal(trailerIds(cok, id('g')).length, MAX_TRAILERS);
});

test('parseYoutubeResults: çözülemeyen ilk ytInitialData atlanır, ikincisi okunur; hiçbiri yoksa boş dizi', () => {
  const vr = (id, t) => ({ videoRenderer: { videoId: id, title: { runs: [{ text: t }] }, lengthText: { simpleText: '2:10' } } });
  const sayfa = 'x<script>var ytInitialData = {bozuk: ;</script><script>var ytInitialData = ' + JSON.stringify({ a: [vr('abcdefghijk', 'Film fragman'), vr('abcdefghijk', 'Yinelenen'), vr('lmnopqrstuv', 'İkinci')] }) + ';</script>';
  const r = parseYoutubeResults(sayfa);
  assert.deepEqual(r.map((x) => x.id), ['abcdefghijk', 'lmnopqrstuv'], 'aynı kimlik bir kez');
  assert.equal(r[0].seconds, 130);
  assert.deepEqual(parseYoutubeResults('<html>veri yok</html>'), []);
  assert.deepEqual(parseYoutubeResults(null), []);
});
