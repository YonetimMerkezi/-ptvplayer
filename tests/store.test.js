import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, createCache } from '../www/js/store.js';

function mk() {
  const m = new Map();
  const storage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  return { store: createStore({ storage, cache: createCache('t' + Math.random()) }), m };
}

test('kaynak ekle, etkin kaynak, sil', () => {
  const { store } = mk();
  assert.equal(store.activeSource(), null);
  const a = store.saveSource({ name: 'A', type: 'm3u', url: 'http://a' });
  const b = store.saveSource({ name: 'B', type: 'xtream', server: 'h', user: 'u', pass: 'p' });
  assert.notEqual(a.id, b.id);
  assert.equal(store.activeId(), a.id);
  store.setActive(b.id);
  assert.equal(store.activeSource().name, 'B');
  store.saveSource({ ...b, name: 'B2' });
  assert.equal(store.sources().length, 2);
  assert.equal(store.activeSource().name, 'B2');
  store.toggleFav(b.id, { id: 'x1', kind: 'live', name: 'K' });
  store.setPref('hidch.' + b.id, { x1: 'K' });
  store.setPref('hhist.' + b.id, { x1: [1, 5, 1] });
  store.setPref('bad.' + b.id, { x1: 1 });
  store.removeSource(b.id);
  assert.deepEqual(store.pref('hidch.' + b.id, null), null, 'kaynakla birlikte gizlenen kanallar da silinir');
  assert.deepEqual(store.pref('hhist.' + b.id, null), null);
  assert.deepEqual(store.pref('bad.' + b.id, null), null);
  assert.equal(store.sources().length, 1);
  assert.equal(store.activeId(), a.id);
  assert.deepEqual(store.favs(b.id), []);
});

test('favoriler: ekle, kaldır, sıra', () => {
  const { store } = mk();
  assert.equal(store.toggleFav('s', { id: '1', kind: 'live', name: 'A' }), true);
  assert.equal(store.toggleFav('s', { id: '2', kind: 'movie', name: 'B' }), true);
  assert.deepEqual(store.favs('s').map((f) => f.id), ['2', '1']);
  assert.equal(store.isFav('s', '1'), true);
  assert.equal(store.toggleFav('s', { id: '1' }), false);
  assert.equal(store.isFav('s', '1'), false);
});

test('son izlenenler: tekrar yok, en yeni başta, en fazla 40', () => {
  const { store } = mk();
  for (let i = 0; i < 50; i++) store.pushRecent('s', { id: 'k' + i, kind: 'live', name: 'K' + i });
  store.pushRecent('s', { id: 'k10', kind: 'live', name: 'K10' });
  const r = store.recents('s');
  assert.equal(r.length, 40);
  assert.equal(r[0].id, 'k10');
  assert.equal(new Set(r.map((x) => x.id)).size, 40);
});

test('izleme ilerlemesi: kısa izleme yok sayılır, bitince silinir, devam listesi', () => {
  const { store } = mk();
  const e = { id: 'f1', kind: 'movie', name: 'Film' };
  store.setProgress('s', e, 5000, 600000);
  assert.equal(store.progress('s', 'f1'), null);
  store.setProgress('s', e, 120000, 600000);
  assert.equal(store.progress('s', 'f1').pos, 120000);
  assert.equal(store.continueWatching('s').length, 1);
  store.setProgress('s', e, 580000, 600000);
  assert.equal(store.progress('s', 'f1'), null);
  assert.equal(store.continueWatching('s').length, 0);
});

test('bozuk depolama verisi çökertmez', () => {
  const storage = { getItem: () => '{bozuk', setItem() { throw new Error('dolu'); }, removeItem() {} };
  const store = createStore({ storage, cache: createCache('t' + Math.random()) });
  assert.deepEqual(store.sources(), []);
  assert.doesNotThrow(() => store.toggleFav('s', { id: 'a' }));
});

test('önbellek: bellek yedeği', async () => {
  const c = createCache('t' + Math.random());
  assert.equal(await c.get('a'), null);
  await c.set('a', { x: 1 });
  assert.deepEqual(await c.get('a'), { x: 1 });
  await c.del('a');
  assert.equal(await c.get('a'), null);
});

test('kategori düzeni: kaynak ve tür başına saklanır, bozuk kayıt toparlanır, kaynak silinince gider', () => {
  const { store, m } = mk();
  const a = store.saveSource({ name: 'A', type: 'm3u', url: 'http://a' });
  assert.deepEqual(store.catPrefs(a.id, 'live'), { order: [], hidden: [], locked: [], folders: [] });
  store.setCatPrefs(a.id, 'live', { order: ['g:Spor'], hidden: ['g:Haber'], folders: [{ id: 'k1', name: 'Çocuk', items: ['c1'] }] });
  store.setCatPrefs(a.id, 'movie', { order: [], hidden: ['g:Korku'], folders: [] });
  assert.deepEqual(store.catPrefs(a.id, 'live').folders[0].items, ['c1']);
  assert.deepEqual(store.catPrefs(a.id, 'movie').hidden, ['g:Korku']);
  assert.deepEqual(store.catPrefs(a.id, 'series'), { order: [], hidden: [], locked: [], folders: [] });
  m.set('iptv.cats.' + a.id, '{bozuk');
  store.reload(); // depo store dışından değiştirildi: bellek bırakılır
  assert.deepEqual(store.catPrefs(a.id, 'live'), { order: [], hidden: [], locked: [], folders: [] });
  store.setCatPrefs(a.id, 'live', { order: ['g:A'], hidden: [], folders: [] });
  store.removeSource(a.id);
  assert.equal(m.has('iptv.cats.' + a.id), false);
});

test('bozulmuş depo kaydı (beklenen dizi/nesne değil) varsayılana düşer, okuyan kod çökmez', () => {
  const { store, m } = mk();
  m.set('iptv.sources', JSON.stringify([null, 5, { id: 'a', type: 'm3u', url: 'http://x' }]));
  m.set('iptv.fav.a', 'null');
  m.set('iptv.rec.a', '{"x":1}');
  m.set('iptv.prog.a', '[1,2]');
  m.set('iptv.cats.a', '"x"');
  m.set('iptv.pref.cast.tvs', '{}');
  assert.deepEqual(store.sources().map((s) => s.id), ['a']);
  assert.deepEqual(store.favs('a'), []);
  assert.equal(store.isFav('a', 'q'), false);
  assert.deepEqual(store.recents('a'), []);
  assert.deepEqual(store.progressAll('a'), {});
  assert.deepEqual(store.continueWatching('a'), []);
  assert.deepEqual(store.catPrefs('a', 'live').folders, []);
  assert.deepEqual(store.pref('cast.tvs', []), []);
});

test('bellek önbelleği: depo bir kez okunur; yazma/silme önbelleği düşürür; okuyana sığ kopya verilir; reload dışarıdan değişikliği alır', () => {
  const m = new Map();
  let okuma = 0;
  const storage = { getItem: (k) => { okuma++; return m.has(k) ? m.get(k) : null; }, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  const store = createStore({ storage, cache: { get: async () => null, set: async () => {}, del: async () => {} } });
  store.setPref('x', { a: 1 });
  store.setPref('fav', [3, 1, 2]);
  okuma = 0;
  for (let i = 0; i < 50; i++) store.pref('x', {}), store.pref('fav', []), store.pref('yok', 7);
  assert.equal(okuma, 3, 'her anahtar yalnız bir kez okunur (yok olan da)');
  // sığ kopya: sıralama/ekleme depoyu ve sonraki okumayı bozmaz
  const l = store.pref('fav', []);
  l.sort();
  l.push(9);
  assert.deepEqual(store.pref('fav', []), [3, 1, 2]);
  const o = store.pref('x', {});
  o.a = 5;
  assert.deepEqual(store.pref('x', {}), { a: 1 });
  // yazma önbelleği düşürür
  store.setPref('x', { a: 2 });
  assert.deepEqual(store.pref('x', {}), { a: 2 });
  // drop / dışarıdan değişiklik
  store.drop('pref.x');
  assert.deepEqual(store.pref('x', { d: 1 }), { d: 1 });
  m.set('iptv.pref.fav', '[7]');
  assert.deepEqual(store.pref('fav', []), [3, 1, 2], 'dışarıdan yazma kendiliğinden görülmez');
  store.reload();
  assert.deepEqual(store.pref('fav', []), [7]);
});

test('preload: tüm kayıtlar parça parça belleğe alınır, ilerleme bildirilir; sonrasında okuma depoya gitmez; reload ile yeniden alınır', async () => {
  const m = new Map();
  let okuma = 0;
  const storage = { length: 0, key: (i) => [...m.keys()][i], getItem: (k) => { okuma++; return m.has(k) ? m.get(k) : null; }, setItem: (k, v) => { m.set(k, String(v)); storage.length = m.size; }, removeItem: (k) => { m.delete(k); storage.length = m.size; } };
  const store = createStore({ storage, cache: { get: async () => null, set: async () => {}, del: async () => {} } });
  for (let i = 0; i < 10; i++) store.setPref('k' + i, i);
  store.reload();
  const prog = [];
  const n = await store.preload({ chunk: 4, tick: async () => {}, onProgress: (d, t) => prog.push([d, t]) });
  assert.equal(n, 10);
  assert.deepEqual(prog.at(-1), [10, 10]);
  assert.ok(prog.every(([d, t], i) => t === 10 && (i === 0 || d >= prog[i - 1][0])));
  okuma = 0;
  for (let i = 0; i < 10; i++) assert.equal(store.pref('k' + i, -1), i);
  assert.equal(okuma, 0, 'bellekten okunur');
  m.set('iptv.pref.k0', '99');
  await store.preload({ reload: true, tick: async () => {} });
  assert.equal(store.pref('k0', -1), 99, 'reload: depodaki yeniden alınır');
});
