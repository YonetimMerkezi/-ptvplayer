import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../www/js/store.js';
import { identityOf, makeSnapshot, parseSnapshot, applySnapshot, describeAdded, syncMessage, addedTotal, SYNC_APP } from '../www/js/sync.js';

function memStore() {
  const m = new Map();
  const storage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
  return createStore({ storage, cache: { get: async () => null, set: async () => {}, del: async () => {} } });
}

const XT = { type: 'xtream', server: 'http://tv.example:8080', user: 'ali', pass: 'p1', name: 'Ev' };
const M3 = { type: 'm3u', url: 'http://list.example/a.m3u', name: 'Liste' };
const fav = (id, name = id) => ({ id, kind: 'live', name, logo: '' });
const prog = (id, pos, at) => ({ id, kind: 'movie', name: 'F' + id, logo: '', parent: null, pos, dur: 100000, at });

// iki cihaz: aynı Xtream hesabı farklı kimliklerle eklenmiş
function pair() {
  const phone = memStore();
  const tv = memStore();
  phone.put('sources', [{ ...XT, id: 'srcP' }]);
  tv.put('sources', [{ ...XT, id: 'srcT' }]);
  return { phone, tv };
}
const sync = (from, to) => applySnapshot(to, parseSnapshot(JSON.stringify(makeSnapshot(from))).snap);

test('identityOf: Xtream sunucu+kullanıcı, M3U adres; yerel ve bozuk kayıt kimliksiz', () => {
  assert.equal(identityOf(XT), 'x|http://tv.example:8080|ali');
  assert.equal(identityOf({ ...XT, server: 'HTTP://TV.example:8080/' }), 'x|http://tv.example:8080|ali');
  assert.notEqual(identityOf({ ...XT, user: 'veli' }), identityOf(XT));
  assert.equal(identityOf(M3), 'm|http://list.example/a.m3u');
  assert.equal(identityOf({ ...M3, local: true }), '');
  assert.equal(identityOf({ type: 'xtream' }), '');
  assert.equal(identityOf(null), '');
});

test('makeSnapshot: yalnız uzak kaynaklar ve kaynak başına veriler; ayarlar, şifre, eşleşmeler girmez', () => {
  const s = memStore();
  s.put('sources', [{ ...XT, id: 'a' }, { type: 'm3u', local: true, id: 'loc', fileName: 'x.m3u' }]);
  s.put('fav.a', [fav('1')]);
  s.put('fav.loc', [fav('9')]);
  s.put('pref.lock.pin', { hash: 'x' });
  s.put('pref.set.buffer', 'max');
  s.put('pref.cast.tvs', [{ id: 't' }]);
  const snap = makeSnapshot(s, 5);
  assert.equal(snap.app, SYNC_APP);
  assert.deepEqual(snap.sources.map((x) => x.id), ['a']);
  assert.deepEqual(Object.keys(snap.data), ['fav.a']);
  assert.ok(!JSON.stringify(snap).includes('lock'));
});

test('parseSnapshot: yanlış uygulama/sürüm/biçim reddedilir; yerel kaynak ve aşırı uzun değerler ayıklanır', () => {
  assert.equal(parseSnapshot('{').ok, false);
  assert.equal(parseSnapshot({ app: 'x', v: 1, sources: [] }).ok, false);
  assert.equal(parseSnapshot({ app: SYNC_APP, v: 99, sources: [] }).ok, false);
  assert.equal(parseSnapshot({ app: SYNC_APP, v: 1, sources: 'x' }).ok, false);
  const r = parseSnapshot({ app: SYNC_APP, v: 1, sources: [{ ...XT, id: 'a', pass: 'p'.repeat(5000), junk: { x: 1 } }, { ...M3, id: 'b', local: true }, { id: 'c' }, { ...XT, id: 'a' }] });
  assert.equal(r.ok, true);
  assert.equal(r.snap.sources.length, 1);
  assert.equal(r.snap.sources[0].pass.length, 2000);
  assert.ok(!('junk' in r.snap.sources[0]));
});

test('yeni kaynak eklenir (diğer cihazın kimliğiyle) ve verileri gelir', () => {
  const phone = memStore();
  const tv = memStore();
  phone.put('sources', [{ ...XT, id: 'srcP' }, { ...M3, id: 'srcM' }]);
  phone.put('fav.srcP', [fav('a'), fav('b')]);
  phone.put('rec.srcM', [{ ...fav('z'), at: 5 }]);
  const added = sync(phone, tv);
  assert.deepEqual(tv.sources().map((s) => s.id), ['srcP', 'srcM']);
  assert.equal(added.sources, 2);
  assert.equal(added.favs, 2);
  assert.equal(added.recents, 1);
  assert.deepEqual(tv.favs('srcP').map((f) => f.id), ['a', 'b']);
});

test('aynı kaynak farklı kimliklerle: veriler kimlik eşleştirilerek birleşir, ikinci kaynak oluşmaz', () => {
  const { phone, tv } = pair();
  phone.put('fav.srcP', [fav('a')]);
  tv.put('fav.srcT', [fav('b')]);
  sync(phone, tv);
  assert.equal(tv.sources().length, 1);
  assert.deepEqual(tv.favs('srcT').map((f) => f.id), ['b', 'a'], 'var olan başta, eksik sona eklendi');
});

test('var olan hiçbir değer değişmez: favori sırası, ilerleme konumu, son izlenen kaydı, klasör, sıra/gizli', () => {
  const { phone, tv } = pair();
  tv.put('fav.srcT', [fav('x'), fav('y')]);
  phone.put('fav.srcP', [fav('y', 'FARKLI AD'), fav('x'), fav('n')]);
  tv.put('prog.srcT', { m1: prog('m1', 20000, 10) });
  phone.put('prog.srcP', { m1: prog('m1', 90000, 99), m2: prog('m2', 30000, 50) });
  tv.put('rec.srcT', [{ ...fav('r1', 'Eski ad'), at: 100 }]);
  phone.put('rec.srcP', [{ ...fav('r1', 'Yeni ad'), at: 200 }, { ...fav('r2'), at: 150 }]);
  tv.put('cats.srcT', { live: { order: ['g:A'], hidden: [], locked: [], folders: [{ id: 'f1', name: 'Spor', items: ['1'] }] } });
  phone.put('cats.srcP', { live: { order: ['g:B', 'g:A'], hidden: ['g:X'], locked: ['g:Y'], folders: [{ id: 'fz', name: 'Spor', items: ['1', '2'] }, { id: 'fq', name: 'Çocuk', items: ['7'] }] } });
  sync(phone, tv);
  assert.deepEqual(tv.favs('srcT').map((f) => [f.id, f.name]), [['x', 'x'], ['y', 'y'], ['n', 'n']]);
  assert.deepEqual(tv.progressAll('srcT').m1, prog('m1', 20000, 10), 'ilerleme üzerine yazılmadı');
  assert.ok(tv.progressAll('srcT').m2, 'eksik ilerleme eklendi');
  assert.equal(tv.recents('srcT').find((r) => r.id === 'r1').name, 'Eski ad');
  assert.deepEqual(tv.recents('srcT').map((r) => r.id), ['r2', 'r1'], 'eksik kayıt zamanına göre araya girdi');
  const c = tv.catPrefs('srcT', 'live');
  assert.deepEqual(c.order, ['g:A'], 'dolu sıra korundu');
  assert.deepEqual(c.hidden, ['g:X'], 'boş olan alan diğer cihazdan dolduruldu');
  assert.deepEqual(c.locked, ['g:Y']);
  assert.deepEqual(c.folders.map((f) => [f.name, f.items]), [['Spor', ['1', '2']], ['Çocuk', ['7']]], 'aynı adlı klasörde eksik öğe eklendi, yeni klasör geldi');
});

test('ilerleme/son izlenen sınırları: mevcutlar atılmaz, eklenenler sığdığı kadar alınır', () => {
  const { phone, tv } = pair();
  const many = {};
  for (let i = 0; i < 300; i++) many['t' + i] = prog('t' + i, 20000, i);
  tv.put('prog.srcT', many);
  phone.put('prog.srcP', { n1: prog('n1', 20000, 5000) });
  const a = sync(phone, tv);
  assert.equal(a.progress, 0);
  assert.equal(Object.keys(tv.progressAll('srcT')).length, 300);
  const r = [];
  for (let i = 0; i < 250; i++) r.push({ ...fav('l' + i), at: 1000 - i });
  tv.put('rec.srcT', r);
  phone.put('rec.srcP', [{ ...fav('p1'), at: 5000 }]);
  sync(phone, tv);
  assert.equal(tv.recents('srcT').length, 250, 'mevcut kayıtların hiçbiri atılmadı');
  assert.equal(tv.recents('srcT')[0].id, 'p1');
});

test('iki yönlü: sırayla iki yöne uygulayınca iki cihaz aynı veriye varır; tekrar uygulamak değişiklik yapmaz', () => {
  const { phone, tv } = pair();
  phone.put('fav.srcP', [fav('a'), fav('b')]);
  tv.put('fav.srcT', [fav('c')]);
  phone.put('prog.srcP', { p: prog('p', 20000, 1) });
  tv.put('prog.srcT', { q: prog('q', 25000, 2) });
  tv.put('sources', [...tv.sources(), { ...M3, id: 'srcM' }]);
  tv.put('fav.srcM', [fav('m')]);
  const toTv = sync(phone, tv);
  const toPhone = sync(tv, phone);
  assert.deepEqual(toTv, { sources: 0, favs: 2, recents: 0, progress: 1, folders: 0 });
  assert.deepEqual(toPhone, { sources: 1, favs: 2, recents: 0, progress: 1, folders: 0 });
  const ids = (s, sid) => s.favs(sid).map((f) => f.id).sort();
  assert.deepEqual(ids(phone, 'srcP'), ['a', 'b', 'c']);
  assert.deepEqual(ids(tv, 'srcT'), ['a', 'b', 'c']);
  assert.deepEqual(ids(phone, 'srcM'), ['m']);
  assert.deepEqual(Object.keys(phone.progressAll('srcP')).sort(), ['p', 'q']);
  assert.deepEqual(Object.keys(tv.progressAll('srcT')).sort(), ['p', 'q']);
  assert.equal(addedTotal(sync(phone, tv)) + addedTotal(sync(tv, phone)), 0, 'ikinci tur: değişiklik yok');
});

test('bozuk/kötü niyetli kayıtlar: eksik alanlı öğeler atlanır, __proto__ kimliği zarar vermez', () => {
  const { phone, tv } = pair();
  const snap = parseSnapshot({
    app: SYNC_APP,
    v: 1,
    sources: [{ ...XT, id: 'srcP' }],
    data: { 'fav.srcP': [null, 5, { id: 1 }, { id: 'k' }, { id: 'ok', name: 'Tamam' }], 'prog.srcP': { a: { id: '__proto__', name: 'x', pos: 99999 }, b: { id: 'b', name: 'B', pos: -5 }, c: { id: 'c', name: 'C', pos: 20000, dur: 'x', at: 'y' } }, 'cats.srcP': 'bozuk' },
  }).snap;
  const a = applySnapshot(tv, snap);
  assert.deepEqual(tv.favs('srcT').map((f) => f.id), ['ok']);
  assert.deepEqual(Object.keys(tv.progressAll('srcT')), ['c']);
  assert.equal(tv.progressAll('srcT').c.dur, 0);
  assert.equal(({}).polluted, undefined);
  assert.equal(a.favs, 1);
  assert.ok(phone);
});

test('iletiler', () => {
  const z = { sources: 0, favs: 0, recents: 0, progress: 0, folders: 0 };
  assert.equal(describeAdded(z), 'yeni bir şey yok');
  assert.equal(describeAdded({ ...z, favs: 5, sources: 1 }), '1 kaynak, 5 favori');
  assert.match(syncMessage(z, z), /Zaten eşit/);
  assert.equal(syncMessage({ ...z, favs: 2 }, { ...z, progress: 3 }), 'TV’ye eklenen: 2 favori. Telefona eklenen: 3 ilerleme.');
});
