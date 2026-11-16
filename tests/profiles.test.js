import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, createCache } from '../www/js/store.js';

function mk(m = new Map()) {
  const storage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  return { store: createStore({ storage, cache: createCache('t' + Math.random()) }), m };
}
const fav = (id) => ({ id, kind: 'movie', name: 'Film ' + id });

test('ana profil eski anahtarları kullanır; yeni profilin favorileri, son izlenenleri ve ilerlemesi ayrıdır', () => {
  const { store, m } = mk();
  const src = store.saveSource({ name: 'A', type: 'm3u', url: 'http://a' });
  store.toggleFav(src.id, fav('f1'));
  assert.ok(m.has('iptv.fav.' + src.id), 'ana profil: taşıma yok, eski anahtar');
  assert.deepEqual(store.profiles(), [{ id: '', name: 'Ana profil' }]);
  const p = store.saveProfile({ name: '  Elif  ' });
  assert.equal(p.name, 'Elif');
  store.setProfile(p.id);
  assert.equal(store.favs(src.id).length, 0, 'yeni profil boş başlar');
  store.toggleFav(src.id, fav('f2'));
  store.pushRecent(src.id, fav('f2'));
  store.setProgress(src.id, fav('f2'), 60000, 600000);
  assert.deepEqual(store.favs(src.id).map((x) => x.id), ['f2']);
  store.setProfile('');
  assert.deepEqual(store.favs(src.id).map((x) => x.id), ['f1']);
  assert.equal(store.recents(src.id).length, 0);
  assert.equal(store.progress(src.id, 'f2'), null);
  // kaynaklar ve ayarlar ortaktır
  store.setPref('set.theme', 'neon');
  store.setProfile(p.id);
  assert.equal(store.pref('set.theme', ''), 'neon');
  assert.equal(store.sources().length, 1);
});

test('etkin profil kalıcıdır; silinince kayıtları da gider ve ana profile dönülür', () => {
  const { store, m } = mk();
  const src = store.saveSource({ name: 'A', type: 'm3u', url: 'http://a' });
  const p = store.saveProfile({ name: 'Ali' });
  store.setProfile(p.id);
  store.toggleFav(src.id, fav('x'));
  const again = mk(m).store;
  assert.equal(again.profileId(), p.id, 'yeniden açılışta aynı profil');
  assert.equal(again.favs(src.id).length, 1);
  assert.equal(again.removeProfile(p.id), true);
  assert.equal(again.profileId(), '');
  assert.ok(![...m.keys()].some((k) => k.includes('.p.' + p.id + '.') || k.startsWith('iptv.p.' + p.id)), 'profilin kayıtları silindi');
  assert.equal(again.removeProfile(''), false, 'ana profil silinmez');
});

test('ad değiştirme, sınır ve kaynak silme', () => {
  const { store, m } = mk();
  const src = store.saveSource({ name: 'A', type: 'm3u', url: 'http://a' });
  assert.equal(store.saveProfile({ id: '', name: 'Baba' }).name, 'Baba');
  assert.equal(store.profiles()[0].name, 'Baba');
  assert.equal(store.saveProfile({ name: '   ' }), null);
  const made = [];
  for (let i = 0; i < 10; i++) made.push(store.saveProfile({ name: 'P' + i }));
  assert.equal(store.profiles().length, store.MAX_PROFILES);
  assert.equal(made.filter(Boolean).length, store.MAX_PROFILES - 1);
  const p = made[0];
  assert.equal(store.saveProfile({ id: p.id, name: 'Yeni' }).name, 'Yeni');
  store.setProfile(p.id);
  store.toggleFav(src.id, fav('y'));
  store.removeSource(src.id);
  assert.ok(![...m.keys()].some((k) => k.endsWith('fav.' + src.id)), 'kaynak silinince profildeki favoriler de silindi');
});
