import test from 'node:test';
import assert from 'node:assert/strict';
import { smartSort, newestItems, topRatedItems, normalizeCatOrder, CAT_ORDERS, DEFAULT_CAT_ORDER, SPECIAL_MIN } from '../www/js/cats.js';

const g = (...names) => names.map((name) => ({ name }));
const names = (a) => a.map((x) => x.name);
const NOW = new Date(2026, 10, 12).getTime();

test('smartSort: yetişkin en sona, yeni/vizyon başa, platformlar sonra, sonra türler popülerlik sırasıyla', () => {
  const out = smartSort(g('XXX 18+', 'Korku', 'Komedi', 'Aksiyon', 'NETFLIX Dizileri', 'Yeni Eklenenler', 'Dram'), NOW);
  assert.deepEqual(names(out), ['Yeni Eklenenler', 'NETFLIX Dizileri', 'Aksiyon', 'Komedi', 'Dram', 'Korku', 'XXX 18+']);
});

test('smartSort: sağlayıcı önekleri ve işaretler (TR ⇒, |) tanınır; Türkçe/belirsiz içerik yabancı dilden önce', () => {
  const out = smartSort(g('EN ⇒ ACTION', 'DE | KOMEDİ', 'TR ⇒ KOMEDİ', 'TR ⇒ AKSİYON', 'ARAPÇA DRAM', 'Belgesel'), NOW);
  assert.deepEqual(names(out), ['TR ⇒ AKSİYON', 'TR ⇒ KOMEDİ', 'Belgesel', 'EN ⇒ ACTION', 'DE | KOMEDİ', 'ARAPÇA DRAM']);
});

test('smartSort: güncel yıl içeren kategori yeni sayılır, eski yıl sayılmaz', () => {
  const out = smartSort(g('Aksiyon', 'Filmler 2019', 'Filmler 2026', 'Komedi'), NOW);
  assert.equal(out[0].name, 'Filmler 2026');
  assert.deepEqual(names(out).slice(1), ['Aksiyon', 'Komedi', 'Filmler 2019']);
});

test('smartSort: aynı anahtarlı kategoriler sağlayıcı sırasını korur; girdi değişmez; boş liste', () => {
  const input = g('Zeta', 'Alfa', 'Beta');
  const copy = names(input);
  assert.deepEqual(names(smartSort(input, NOW)), ['Zeta', 'Alfa', 'Beta']);
  assert.deepEqual(names(input), copy);
  assert.deepEqual(smartSort([], NOW), []);
});

test('smartSort: "tod" / "max" yalnız tam sözcükse platform; "stodyum" gibi sözcükler karışmaz', () => {
  const out = smartSort(g('Stodyum Filmleri', 'TOD Dizileri', 'Maxi Seçki'), NOW);
  assert.equal(out[0].name, 'TOD Dizileri');
});

const it = (id, added, rating) => ({ id, name: 'F' + id, added, rating });

test('newestItems: eklenme zamanı bilinenlerin en yenileri; yeterince veri yoksa boş', () => {
  const items = Array.from({ length: 10 }, (_, i) => it(i, 1000 + i, 3));
  const out = newestItems(items, 4);
  assert.deepEqual(out.map((x) => x.id), [9, 8, 7, 6]);
  assert.deepEqual(newestItems(items.slice(0, SPECIAL_MIN - 1)), [], 'çok az tarihli yapım: satır yok');
  assert.deepEqual(newestItems(Array.from({ length: 20 }, (_, i) => it(i, 0, 3))), [], 'M3U gibi zamansız liste: satır yok');
});

test('topRatedItems: 5 üzerinden en az 4 puanlılar, puana göre; hepsi 3,5 ise satır yok', () => {
  const items = Array.from({ length: 10 }, (_, i) => it(i, 0, 4 + i / 20));
  assert.deepEqual(topRatedItems(items, 3).map((x) => x.id), [9, 8, 7]);
  assert.deepEqual(topRatedItems(Array.from({ length: 24 }, (_, i) => it(i, 0, 3.5))), []);
  assert.deepEqual(topRatedItems(items.slice(0, SPECIAL_MIN - 1)), []);
});

test('normalizeCatOrder: bilinmeyen değer varsayılana (akıllı) döner', () => {
  assert.equal(DEFAULT_CAT_ORDER, 'smart');
  assert.equal(normalizeCatOrder('provider'), 'provider');
  assert.equal(normalizeCatOrder('x'), 'smart');
  assert.equal(normalizeCatOrder(undefined), 'smart');
  assert.deepEqual(CAT_ORDERS.map((x) => x[0]), ['smart', 'provider']);
});
