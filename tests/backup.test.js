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
  store.setPref('hhist.' + a.id, { x1: [1, 10, 1] });
  store.setPref('hidch.' + a.id, { x1: 'Gizli Kanal' });
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
  assert.equal(b.data['pref.hhist.' + a.id], undefined, 'yayın kalitesi geçmişi yedeğe girmez');
  assert.deepEqual(b.data['pref.hidch.' + a.id], { x1: 'Gizli Kanal' }, 'gizlenen kanallar yedeğe girer');
  assert.deepEqual(summarize(b), { sources: 1, favs: 1, folders: 1, prefs: 2, at: 1000 });
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

test('bozulmuş/elle değiştirilmiş yedek: geçersiz öğeler atılır, geri yükleme sonrası uygulama çökmez', () => {
  const text = JSON.stringify({
    app: 'iptv-oynatici', v: 1, at: 1,
    data: {
      sources: [null, 7, { id: 'a', type: 'm3u', url: 'http://x/l.m3u' }, { type: 'm3u' }],
      'fav.a': [null, { id: 'f1', kind: 'live', name: 'A' }, 'x'],
      'rec.a': 'bozuk',
      'prog.a': { m1: null, m2: { id: 'm2', pos: 20000, dur: 60000, name: 'F' } },
      'cats.a': [1],
      'pref.set.theme': 'x',
    },
  });
  const r = parseBackup(text);
  assert.equal(r.ok, true);
  assert.equal(r.backup.data.sources.length, 1);
  assert.deepEqual(r.backup.data['fav.a'].map((f) => f.id), ['f1']);
  assert.equal('rec.a' in r.backup.data, false);
  assert.deepEqual(Object.keys(r.backup.data['prog.a']), ['m2']);
  assert.equal('cats.a' in r.backup.data, false);
  assert.equal(r.summary.sources, 1);
  const { store } = mk();
  store.saveSource({ id: 'old', type: 'm3u', url: 'http://old' });
  applyBackup(store, r.backup);
  assert.deepEqual(store.sources().map((s) => s.id), ['a']);
  assert.equal(store.favs('a').length, 1);
  assert.equal(store.progress('a', 'm2').pos, 20000);
});

test('yedek: cihaz kimliği, yönetici verisi, yönetilen denetim zamanı, hata günlüğü ve görüntü çözücü seçimi yedeğe girmez', () => {
  const { store } = mk();
  store.saveSource({ name: 'A', type: 'm3u', url: 'http://x/y' });
  store.setPref('dev.id', 'a1b2c3d4e5f6');
  store.setPref('adm.tok', { s: 'a', i: 'b', c: 'c' });
  store.setPref('adm.on', true);
  store.setPref('mg.at', 123);
  store.setPref('errlog', [{ n: 'K', m: 'hata' }]);
  store.setPref('set.buffer', 'max');
  store.setPref('set.decoder', 'software'); // cihaza özgü: bir TV kutusunun çözücü kaçamağı telefona taşınmamalı
  const keys = Object.keys(makeBackup(store).data);
  for (const k of ['pref.dev.id', 'pref.adm.tok', 'pref.adm.on', 'pref.mg.at', 'pref.errlog', 'pref.set.decoder']) assert.ok(!keys.includes(k), k + ' yedeğe girmemeli');
  assert.ok(keys.includes('pref.set.buffer'));
});
