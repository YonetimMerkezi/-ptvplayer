import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { guideBlocks, guideNameParts, guideCatIconName } from '../www/js/guide.js';

const M = 60000;
const ws = Date.UTC(2026, 10, 9, 10, 0);
const we = ws + 24 * 60 * M;
const P = (a, b, t = 'x') => ({ s: ws + a * M, e: ws + b * M, t });

test('guideBlocks: dakika cinsinden başlangıç ve süre, şimdi/geçmiş sınıfları', () => {
  const now = ws + 90 * M;
  const b = guideBlocks([P(0, 60), P(60, 120), P(120, 180)], ws, we, now);
  assert.deepEqual(b.map((x) => [x.m, x.d, x.cls]), [[0, 60, ' past'], [60, 60, ' now'], [120, 60, '']]);
});

test('guideBlocks: pencere başından önce başlayan program kırpılır, sonundan taşan kısaltılır', () => {
  const b = guideBlocks([P(-30, 30), P(24 * 60 - 20, 24 * 60 + 40)], ws, we, ws);
  assert.deepEqual(b.map((x) => [x.m, x.d]), [[0, 30], [24 * 60 - 20, 20]]);
});

test('guideBlocks: üst üste binen programlar binmez, tamamen kapsananlar atlanır', () => {
  const b = guideBlocks([P(0, 60, 'a'), P(30, 50, 'içte'), P(50, 120, 'b')], ws, we, ws);
  assert.deepEqual(b.map((x) => [x.p.t, x.m, x.d]), [['a', 0, 60], ['b', 60, 60]]);
});

test('guideBlocks: pencere dışı, bozuk ve 1 dakikadan kısa kayıtlar atlanır; boş/null liste güvenli', () => {
  assert.deepEqual(guideBlocks([P(-200, -100), P(24 * 60 + 5, 24 * 60 + 60), { s: NaN, e: 1 }, null, P(10, 10.5)], ws, we, ws), []);
  assert.deepEqual(guideBlocks(null, ws, we), []);
  assert.deepEqual(guideBlocks([], ws, we), []);
});

test('guideBlocks: boşluklar korunur (bloklar arası boş alan)', () => {
  const b = guideBlocks([P(0, 30), P(90, 120)], ws, we, ws);
  assert.deepEqual(b.map((x) => [x.m, x.d]), [[0, 30], [90, 30]]);
});

test('guideNameParts: sondaki kalite etiketi ikinci satıra ayrılır', () => {
  assert.deepEqual(guideNameParts('TRT 1 HEVC'), ['TRT 1', 'HEVC']);
  assert.deepEqual(guideNameParts('SHOW TV HEVC'), ['SHOW TV', 'HEVC']);
  assert.deepEqual(guideNameParts('TR: SPORTS TV hd'), ['TR: SPORTS TV', 'HD']);
  assert.deepEqual(guideNameParts('A SPOR | UHD'), ['A SPOR', 'UHD']);
  assert.deepEqual(guideNameParts('KABLO Info'), ['KABLO Info', '']);
  assert.deepEqual(guideNameParts('HD'), ['HD', '']); // yalnız etiketten oluşan ad bölünmez
  assert.deepEqual(guideNameParts('HDTV Plus'), ['HDTV Plus', '']);
  assert.deepEqual(guideNameParts(null), ['', '']);
});

test('guideCatIconName: kategori adına göre simge seçer', () => {
  const ic = (n, o) => guideCatIconName(n, o);
  assert.equal(ic('TR ⇒ HEVC'), 'tv');
  assert.equal(ic('TR ⇒ ULUSAL'), 'broadcast');
  assert.equal(ic('TR ⇒ UHD'), '4k');
  assert.equal(ic('TR ⇒ HABER'), 'news');
  assert.equal(ic('TR ⇒ beIN FEED / P+'), 'rss');
  assert.equal(ic('TR ⇒ beIN SPORTS'), 'ball');
  assert.equal(ic('TR ⇒ tabii / EXXEN'), 'movie');
  assert.equal(ic('TR ⇒ S SPORT'), 'trophy');
  assert.equal(ic('Sedat', { folder: true }), 'folder');
  assert.equal(ic('Sedat'), 'tv');
  assert.equal(ic('Tümü', { id: '__all' }), 'tv');
  assert.equal(ic('Favoriler', { id: '__fav' }), 'star');
  assert.equal(ic('Son izlenen', { id: '__recent' }), 'clock');
});

test('guideCatIconName: döndürdüğü simgeler index.html simge sayfasında tanımlı', () => {
  const html = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
  const defined = new Set([...html.matchAll(/<symbol id="i-([a-z0-9-]+)"/g)].map((m) => m[1]));
  const names = ['x', 'ULUSAL', 'UHD', 'HABER', 'FEED', 'bein SPORTS', 'tabii', 'S SPORT'].map((n) => guideCatIconName(n))
    .concat(['folder', 'star', 'clock'].map((_, i) => guideCatIconName('x', { folder: i === 0, id: ['', '__fav', '__recent'][i] })));
  for (const n of new Set(names)) if (n !== '4k') assert.ok(defined.has(n), n);
  for (const n of ['filter', 'news', 'broadcast', 'rss', 'trophy', 'guide', 'chev-l', 'chev-r', 'down', 'dots', 'refresh']) assert.ok(defined.has(n), n);
});
