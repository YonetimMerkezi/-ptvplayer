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

test('var olan değer korunur (favori sırası, son izlenen, klasör, sıra/gizli); ilerlemede yalnız daha yeni kayıt geçer', () => {
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
  assert.deepEqual(tv.progressAll('srcT').m1, prog('m1', 90000, 99), 'ilerleme: daha yeni (telefon) kayıt geçti');
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
  assert.deepEqual(toTv, { sources: 0, favs: 2, recents: 0, progress: 1, folders: 0, removed: 0 });
  assert.deepEqual(toPhone, { sources: 1, favs: 2, recents: 0, progress: 1, folders: 0, removed: 0 });
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

const NOW = 1_700_000_000_000;
const withClock = (t, fn) => {
  const real = Date.now;
  Date.now = () => t;
  try {
    return fn();
  } finally {
    Date.now = real;
  }
};

test('favori silme yayılır: bir cihazda silinen favori diğerinden de kalkar, silme izi iki yerde de durur', () => {
  const { phone, tv } = pair();
  withClock(NOW, () => {
    phone.toggleFav('srcP', fav('a'));
    phone.toggleFav('srcP', fav('b'));
  });
  sync(phone, tv);
  assert.deepEqual(tv.favs('srcT').map((f) => f.id).sort(), ['a', 'b']);
  withClock(NOW + 1000, () => tv.toggleFav('srcT', fav('a'))); // TV'de a silindi
  const toPhone = sync(tv, phone);
  assert.equal(toPhone.removed, 1);
  assert.deepEqual(phone.favs('srcP').map((f) => f.id), ['b']);
  assert.ok(phone.get('favx.srcP').a > NOW);
  assert.equal(addedTotal(sync(phone, tv)) + addedTotal(sync(tv, phone)), 0, 'yakınsadı');
  assert.deepEqual(tv.favs('srcT').map((f) => f.id), ['b'], 'silinen geri gelmedi');
});

test('favori: silindikten sonra yeniden eklenen kazanır; eski silme izi temizlenir', () => {
  const { phone, tv } = pair();
  withClock(NOW, () => tv.toggleFav('srcT', fav('a')));
  withClock(NOW + 1000, () => tv.toggleFav('srcT', fav('a'))); // sil
  withClock(NOW + 2000, () => phone.toggleFav('srcP', fav('a'))); // telefonda daha sonra yeniden eklendi
  sync(tv, phone);
  assert.deepEqual(phone.favs('srcP').map((f) => f.id), ['a'], 'telefondaki yeni ekleme silinmedi');
  sync(phone, tv);
  assert.deepEqual(tv.favs('srcT').map((f) => f.id), ['a'], 'TV de yeniden ekleneni aldı');
  assert.equal(tv.get('favx.srcT') && tv.get('favx.srcT').a, undefined, 'eskimiş silme izi kalktı');
});

test('favori: eski kayıtlar (zamansız) yeni silme izine yenik düşer, zamansız uzak kayıt silinmişi geri getirmez', () => {
  const { phone, tv } = pair();
  phone.put('fav.srcP', [fav('old')]); // zamansız (eski sürüm)
  withClock(NOW, () => tv.toggleFav('srcT', fav('old')));
  withClock(NOW + 10, () => tv.toggleFav('srcT', fav('old')));
  sync(tv, phone);
  assert.deepEqual(phone.favs('srcP'), []);
  phone.put('fav.srcP', [fav('old')]);
  const a = sync(phone, tv);
  assert.equal(a.favs, 0, 'silinmiş favori eski kayıttan geri gelmez');
});

test('ilerleme: yeni kayıt kazanır; bitirilen film diğer cihazın devam listesinden kalkar; yeniden izlenirse döner', () => {
  const { phone, tv } = pair();
  phone.put('prog.srcP', { m: prog('m', 20000, 100), k: prog('k', 30000, 100) });
  tv.put('prog.srcT', { m: prog('m', 50000, 200), k: prog('k', 30000, 100) });
  sync(phone, tv);
  assert.equal(tv.progressAll('srcT').m.pos, 50000, 'TV daha yeni: korunur');
  sync(tv, phone);
  assert.equal(phone.progressAll('srcP').m.pos, 50000, 'telefon daha yeni olanı aldı');
  withClock(NOW, () => tv.setProgress('srcT', { id: 'k', kind: 'movie', name: 'Fk' }, 99000, 100000)); // k bitti
  assert.equal(tv.progressAll('srcT').k, undefined);
  const r = sync(tv, phone);
  assert.equal(r.removed, 1);
  assert.equal(phone.progressAll('srcP').k, undefined);
  assert.equal(addedTotal(sync(phone, tv)) + addedTotal(sync(tv, phone)), 0);
  withClock(NOW + 5000, () => phone.setProgress('srcP', { id: 'k', kind: 'movie', name: 'Fk' }, 40000, 100000)); // yeniden izlendi
  sync(phone, tv);
  assert.equal(tv.progressAll('srcT').k.pos, 40000);
  assert.equal((tv.get('progx.srcT') || {}).k, undefined, 'eski bitiş izi kalktı');
});

test('silme izleri: bozuk değerler ayıklanır, en yeni 500 iz tutulur, describeAdded silmeyi yazar', () => {
  const { phone, tv } = pair();
  const t = { __proto__: null };
  const tombs = {};
  for (let i = 0; i < 600; i++) tombs['id' + i] = NOW + i;
  tombs.bad = 'x';
  tombs[''] = 5;
  phone.put('favx.srcP', tombs);
  sync(phone, tv);
  const got = tv.get('favx.srcT');
  assert.equal(Object.keys(got).length, 500);
  assert.ok(got.id599 && !got.id0 && got.bad === undefined);
  assert.equal(describeAdded({ sources: 0, favs: 0, recents: 0, progress: 0, folders: 0, removed: 2 }), '2 silme');
  assert.ok(t);
});
