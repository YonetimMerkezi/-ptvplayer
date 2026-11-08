import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, createCache } from '../www/js/store.js';
import { makeBackup, parseBackup, applyBackup, backupFileName, summarize } from '../www/js/backup.js';

function mk() {
  const m = new Map();
  const storage = {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
  return { store: createStore({ storage, cache: createCache('t' + Math.random()) }), m };
}

function fill(store) {
  const a = store.saveSource({ name: 'A', type: 'xtream', server: 'h', user: 'u', pass: 'p' });
  const loc = store.saveSource({ name: 'Dosya', type: 'm3u', local: true });
  store.setActive(a.id);
  store.toggleFav(a.id, { id: 'x1', kind: 'live', name: 'K1' });
  store.toggleFav(loc.id, { id: 'y1', kind: 'live', name: 'Y' });
  store.setCatPrefs(a.id, 'live', { order: ['g:Spor'], hidden: [], folders: [{ id: 'f', name: 'Çocuk', items: ['x1'] }] });
  store.setPref('set.buffer', 'max');
  store.setPref('lock.pin', { salt: 's', hash: 'h', len: 4 });
  store.setPref('bad.' + a.id, { x1: 1 });
  return { a, loc };
}

test('yedek: kaynaklar, favoriler, kategori düzeni ve ayarlar girer; şifre, işaret ve dosya listeleri girmez', () => {
  const { store } = mk();
  const { a, loc } = fill(store);
  const b = makeBackup(store, 1000);
  assert.equal(b.app, 'iptv-oynatici');
  assert.deepEqual(b.data.sources.map((s) => s.id), [a.id], 'dosyadan eklenen liste yedeğe girmez');
  assert.ok(b.data['fav.' + a.id]);
  assert.equal(b.data['fav.' + loc.id], undefined);
  assert.equal(b.data['pref.set.buffer'], 'max');
  assert.equal(b.data['pref.lock.pin'], undefined, 'şifre özeti yedekte olmaz');
  assert.equal(b.data['pref.bad.' + a.id], undefined);
  assert.deepEqual(summarize(b), { sources: 1, favs: 1, folders: 1, prefs: 1, at: 1000 });
});

test('geri yükleme: yedekteki duruma döner, yerel liste ve şifre korunur', () => {
  const { store: src } = mk();
  const { a } = fill(src);
  const backup = makeBackup(src, 5);
  const { store, m } = mk();
  const { loc } = fill(store);
  store.toggleFav(store.activeId(), { id: 'fazla', kind: 'live', name: 'Fazla' }); // yedekte olmayan veri silinmeli
  store.setPref('set.fazla', 1);
  store.put('sources', [...store.sources(), { id: 'eski', name: 'Eski', type: 'm3u', url: 'u' }]);
  applyBackup(store, JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(store.sources().map((s) => s.id).sort(), [a.id, loc.id].sort(), 'yedekteki kaynak + yerel liste; yedekte olmayan kaynak gitti');
  assert.equal(store.activeId(), a.id);
  assert.deepEqual(store.favs(a.id).map((f) => f.id), ['x1'], 'yedekte olmayan favori gitti');
  assert.equal(store.pref('set.fazla', null), null);
  assert.equal(store.pref('set.buffer', null), 'max');
  assert.deepEqual(store.pref('lock.pin', null).len, 4, 'uygulama şifresi aynen kaldı');
  assert.ok(store.favs(loc.id).length === 1, 'yerel listenin favorileri korundu');
  assert.ok(m.size > 0);
});

test('yedek dosyası doğrulama', () => {
  const { store } = mk();
  fill(store);
  const ok = parseBackup(JSON.stringify(makeBackup(store)));
  assert.equal(ok.ok, true);
  assert.equal(ok.summary.sources, 1);
  assert.equal(parseBackup('{bozuk').ok, false);
  assert.match(parseBackup('{"a":1}').error, /bu uygulamanın/);
  assert.match(parseBackup(JSON.stringify({ app: 'iptv-oynatici', v: 99, data: { sources: [] } })).error, /güncelleyin/);
  assert.match(parseBackup(JSON.stringify({ app: 'iptv-oynatici', v: 1, data: {} })).error, /kaynak listesi/);
});

test('yedek dosya adı tarihli', () => {
  assert.equal(backupFileName(new Date(2026, 10, 8).getTime()), 'iptv-yedek-2026-11-08.json');
});
