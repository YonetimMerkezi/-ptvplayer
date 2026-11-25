// LG webOS ana sayfa: soldaki dikey bölüm menüsü (kartların yanında); ◀ ile girilir, ▶ ile çıkılır, fare ile tıklanır.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ana = fs.readFileSync(new URL('../webos/src/screens/home.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../webos/css/tv.css', import.meta.url), 'utf8');
const vurgu = fs.readFileSync(new URL('../webos/src/vurgu.js', import.meta.url), 'utf8');

test('sol menü: tüm bölümler (KAROLAR) şeritte listelenir; kartlar yerinde kalır', () => {
  assert.match(ana, /'<div class="rl">'\s*\+\s*\n?\s*KAROLAR\.map\(/, 'şerit KAROLAR’dan üretilir');
  assert.match(ana, /class="rl-it" data-rl="/);
  assert.match(ana, /class="hm-c"/, 'üst kartlar duruyor');
  assert.match(ana, /class="hm-b"/, 'küçük butonlar duruyor');
});

test('sol menü: ◀ satırın en solunda menüye girer, ▶ içeriğe döner, OK bölümü açar, ▲▼ gezer', () => {
  assert.match(ana, /let sol = false/);
  assert.match(ana, /else if \(a === 'left'\) \{[\s\S]{0,160}sol = true/, 'en soldaki ◀ menüye geçer');
  assert.match(ana, /if \(sol && \(a === 'ok'/, 'menü odaktayken tuşlar menüye gider');
  assert.match(ana, /open\(KAROLAR\[cr\]\.ekran\[0\], KAROLAR\[cr\]\.ekran\[1\]\)/, 'OK ilgili bölümü açar');
  assert.match(ana, /const n = cr \+ \(a === 'down' \? 1 : -1\)/, '▲▼ menüde gezer');
  assert.match(ana, /const icerik = !ustte && !sol/, 'menüdeyken içerik işaretli kalmaz');
});

test('sol menü: fareyle tıklama ve üzerine gelme vurgusu', () => {
  assert.match(ana, /enYakin\(e\.target, '\[data-rl\]', kok\)/);
  assert.match(vurgu, /\.rl-it/);
  assert.match(css, /\.rl-it\.on, \.rl-it\.hv \{[^}]*background: #2dd4bf; color: #04141a;/, 'odakta koyu yazı açık zeminde');
});

test('sol menü: içerik şeridin sağından başlar, şerit tüm yüksekliği kaplar', () => {
  assert.match(css, /\.home \.top, \.home \.hm, \.home \.hint \{ left: 11rem; \}/);
  assert.match(css, /\.rl \{ position: absolute; top: 0; left: 0; bottom: 0; width: 8\.6rem;/);
});
