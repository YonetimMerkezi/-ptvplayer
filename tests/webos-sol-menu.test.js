// LG webOS: ana sayfa dışındaki bölümlerde soldaki kalıcı menü (solmenu.js) — görünürlük, 1 sn bekleme, kategori paneli, bölüm geçişi.
import test from 'node:test';
import assert from 'node:assert/strict';

// Tarayıcı olmayan ortamda uygulama modülleri yüklenebilsin diye en az ölçüde taklit
const sahteSinif = () => {
  const k = {};
  return {
    add: (c) => (k[c] = true),
    remove: (c) => delete k[c],
    contains: (c) => !!k[c],
  };
};
const sahteEl = () => ({ style: {}, parentNode: null, classList: sahteSinif(), children: [], appendChild() {}, addEventListener() {} });
globalThis.window = globalThis.window || { setTimeout, clearTimeout };
globalThis.document = globalThis.document || {};
Object.assign(globalThis.document, {
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: () => {
    const e = sahteEl();
    e.ogeler = [];
    Object.defineProperty(e, 'innerHTML', {
      set(h) {
        e.ogeler = (String(h).match(/data-rl="\d+"/g) || []).map(() => sahteEl());
      },
      get: () => '',
    });
    e.querySelectorAll = () => e.ogeler;
    return e;
  },
});

// Sahte zamanlayıcı: bekleme süreleri gerçekten beklenmeden ilerletilir
let simdi = 0;
let kuyruk = [];
let sayac = 0;
const gercekSet = globalThis.setTimeout;
const gercekClear = globalThis.clearTimeout;
globalThis.setTimeout = (fn, ms) => {
  kuyruk.push({ id: ++sayac, at: simdi + (ms || 0), fn });
  return sayac;
};
globalThis.clearTimeout = (id) => {
  kuyruk = kuyruk.filter((k) => k.id !== id);
};
const ilerlet = (ms) => {
  const son = simdi + ms;
  for (;;) {
    kuyruk.sort((a, b) => a.at - b.at);
    const k = kuyruk[0];
    if (!k || k.at > son) break;
    kuyruk.shift();
    simdi = k.at;
    k.fn();
  }
  simdi = son;
};

const { solMenuKur, aktifIndeks, RAIL_EKRAN, KAT_BOLUM, BEKLEME_MS } = await import('../webos/src/solmenu.js');
const { ctx, kanca } = await import('../webos/src/ctx.js');
const { KAROLAR } = await import('../webos/src/screens/home.js');

test.after(() => {
  globalThis.setTimeout = gercekSet;
  globalThis.clearTimeout = gercekClear;
});

// Sahte ekran: browse benzeri kancaları sayar
function ekran(ad, arg, ek) {
  const e = { el: sahteEl(), name: ad, acilis: { ad, arg }, olay: [], ...ek };
  return e;
}
function browse(kind, durum) {
  const d = { acik: false, ...durum };
  const e = ekran('browse', { kind });
  e.katAcik = () => d.acik;
  e.katAc = () => {
    d.acik = true;
    e.olay.push('katAc');
  };
  e.katKapat = () => {
    d.acik = false;
    e.olay.push('katKapat');
  };
  e.katOdak = () => e.olay.push('katOdak');
  e.solGir = () => e.olay.push('solGir');
  e.solCik = () => e.olay.push('solCik');
  e.solKenar = () => true;
  e.durum = d;
  return e;
}

function kur(ustEkran) {
  ctx.stack.length = 0;
  kuyruk.length = 0;
  ctx.root = { appendChild() {}, removeChild() {} };
  const olusan = [];
  ctx.reg = {
    browse: (arg) => {
      const e = browse(arg.kind, { acik: !!arg.katAc });
      e.arg = arg;
      olusan.push(e);
      return e;
    },
    spor: () => ekran('spor'),
    settings: () => ekran('settings'),
  };
  const home = ekran('home', undefined);
  ctx.stack.push(home);
  ctx.stack.push(ustEkran);
  const kok = { appendChild() {} };
  const sol = solMenuKur(kok);
  kanca.yigin();
  return { sol, home, olusan, st: sol.durum };
}

test('aktifIndeks: ekranın menüdeki karşılığı', () => {
  const idx = (id) => KAROLAR.findIndex((k) => k.id === id);
  assert.equal(aktifIndeks({ ad: 'browse', arg: { kind: 'movie' } }), idx('movie'));
  assert.equal(aktifIndeks({ ad: 'browse', arg: { kind: 'series', katAc: true } }), idx('series'));
  assert.equal(aktifIndeks({ ad: 'browse', arg: { kind: 'guide' } }), idx('guide'));
  assert.equal(aktifIndeks({ ad: 'spor' }), idx('spor'));
  assert.equal(aktifIndeks({ ad: 'settings' }), idx('settings'));
  assert.equal(aktifIndeks({ ad: 'home' }), -1);
  assert.equal(aktifIndeks(null), -1);
});

test('menü: ana sayfada görünmez; Canlı TV, Filmler, Diziler, Rehber, Spor, Favoriler, Geçmiş, Ara, Ayarlar ekranlarında görünür', () => {
  for (const ad of ['browse', 'spor', 'search', 'settings']) assert.ok(RAIL_EKRAN[ad], ad);
  assert.ok(!RAIL_EKRAN.home && !RAIL_EKRAN.player && !RAIL_EKRAN.sources, 'ana sayfa, oynatıcı ve alt sayfalarda menü yok');
  const { sol, home } = kur(browse('live'));
  assert.equal(sol.durum.gorunur, true);
  assert.equal(sol.el.classList.contains('gor'), true);
  assert.equal(home.el.classList.contains('rl-ekran'), false, 'ana sayfa kaymaz');
  assert.equal(ctx.stack[1].el.classList.contains('rl-ekran'), true, 'bölüm ekranı menünün sağından başlar');
  ctx.stack.pop();
  ctx.stack.push(ekran('player'));
  kanca.yigin();
  assert.equal(sol.durum.gorunur, false);
  assert.equal(sol.el.classList.contains('gor'), false);
});

test('menü: yalnız Canlı TV, Filmler ve Diziler kategori paneli açar', () => {
  assert.deepEqual(Object.keys(KAT_BOLUM).sort(), ['live', 'movie', 'series']);
  assert.equal(BEKLEME_MS, 1000);
});

test('menü: üzerinde 1 sn beklenince kategori paneli açılır; hızlı geçişte açılmaz', () => {
  const t = browse('movie');
  const { sol } = kur(t);
  const idx = (id) => KAROLAR.findIndex((k) => k.id === id);
  sol.gir(t);
  assert.equal(sol.durum.odak, true);
  assert.equal(sol.durum.cr, idx('movie'));
  ilerlet(BEKLEME_MS - 1);
  assert.ok(!t.olay.includes('katAc'), '1 sn dolmadan açılmaz');
  ilerlet(2);
  assert.ok(t.olay.includes('katAc'), '1 sn sonra açılır');
  assert.equal(t.durum.acik, true);
  // Aşağı yukarı geçerken: her tuşta bekleme yeniden başlar
  t.olay.length = 0;
  t.durum.acik = false;
  sol.key(t, 'down');
  ilerlet(400);
  sol.key(t, 'up');
  ilerlet(400);
  sol.key(t, 'down');
  ilerlet(400);
  assert.ok(!t.olay.includes('katAc'), 'geçerken panel açılmaz');
});

test('menü: Filmler açıkken Diziler üzerinde beklenince dizi kategorileri açık olarak Diziler ekranına geçilir', () => {
  const t = browse('movie');
  const { sol, olusan } = kur(t);
  sol.gir(t);
  sol.key(t, 'down'); // Diziler
  assert.ok(t.olay.includes('katKapat'), 'başka öğeye geçince önceki panel kapanır');
  const uzunluk = ctx.stack.length;
  ilerlet(BEKLEME_MS + 5);
  assert.equal(olusan.length, 1);
  assert.equal(olusan[0].arg.kind, 'series');
  assert.equal(olusan[0].arg.katAc, true, 'kategori paneli açık gelir');
  assert.equal(ctx.stack.length, uzunluk, 'yığın şişmez: ekran yerine konur');
  assert.deepEqual(ctx.stack[1].acilis, { ad: 'browse', arg: { kind: 'series' } }, 'kayıtlı açılış verisine geçici seçenek girmez');
  assert.equal(sol.durum.odak, true, 'odak menüde kalır');
  assert.equal(sol.durum.aktif, KAROLAR.findIndex((k) => k.id === 'series'));
  assert.ok(olusan[0].olay.includes('solGir'), 'açılan ekranda satır vurgulanmaz');
});

test('menü: Diziler açıkken Filmler üzerinde beklenince film kategorileri açılır (tersi)', () => {
  const t = browse('series');
  const { sol, olusan } = kur(t);
  sol.gir(t);
  sol.key(t, 'up');
  ilerlet(BEKLEME_MS + 5);
  assert.equal(olusan[0].arg.kind, 'movie');
  assert.equal(olusan[0].arg.katAc, true);
});

test('menü: kategori açıkken ▶ panele girer; kapalıyken içeriğe döner; ◀ menüde kalır', () => {
  const t = browse('live');
  const { sol } = kur(t);
  sol.gir(t);
  t.durum.acik = true;
  assert.equal(sol.key(t, 'left'), true, '◀ menüde yutulur');
  assert.equal(sol.durum.odak, true);
  t.olay.length = 0;
  sol.key(t, 'right');
  assert.deepEqual(t.olay, ['solCik', 'katOdak'], 'açık panele girilir');
  assert.equal(sol.durum.odak, false);
  // kapalıyken
  sol.gir(t);
  t.durum.acik = false;
  t.olay.length = 0;
  sol.key(t, 'right');
  assert.deepEqual(t.olay, ['solCik']);
});

test('menü: OK — bulunulan bölümde paneli açıp ona girer; başka bölümde bölümü paneli kapalı açar', () => {
  const t = browse('live');
  const { sol, olusan } = kur(t);
  sol.gir(t);
  t.olay.length = 0;
  sol.key(t, 'ok');
  assert.ok(t.olay.includes('katAc') && t.olay.includes('katOdak'), 'aynı bölümde OK: kategoriler açılır, odak panele geçer');
  sol.gir(t);
  sol.key(t, 'down'); // Filmler
  sol.key(t, 'ok');
  assert.equal(olusan.length, 1);
  assert.equal(olusan[0].arg.kind, 'movie');
  assert.ok(!olusan[0].arg.katAc, 'OK ile açılan bölümde panel kapalı başlar');
  assert.equal(sol.durum.odak, false);
});

test('menü: Spor ve Ayarlar gibi kategorisiz bölümlerde bekleme panel açmaz; OK bölümü açar', () => {
  const t = ekran('spor', undefined);
  t.solGir = () => {};
  t.solCik = () => {};
  const { sol } = kur(t);
  sol.gir(t);
  assert.equal(sol.durum.cr, KAROLAR.findIndex((k) => k.id === 'spor'));
  ilerlet(BEKLEME_MS * 3);
  assert.equal(sol.durum.odak, true);
  sol.key(t, 'down'); // Favoriler
  sol.key(t, 'down'); // Geçmiş
  sol.key(t, 'down'); // Ara
  sol.key(t, 'down'); // Ayarlar
  sol.key(t, 'ok');
  assert.equal(ctx.stack[1].name, 'settings');
});

test('menü: ▲▼ uçlarda taşmaz; Geri paneli kapatıp içeriğe döner', () => {
  const t = browse('live');
  const { sol } = kur(t);
  sol.gir(t);
  for (let i = 0; i < 20; i++) sol.key(t, 'up');
  assert.equal(sol.durum.cr, 0);
  for (let i = 0; i < 20; i++) sol.key(t, 'down');
  assert.equal(sol.durum.cr, KAROLAR.length - 1);
  t.olay.length = 0;
  assert.equal(sol.key(t, 'back'), true);
  assert.ok(t.olay.includes('katKapat') && t.olay.includes('solCik'));
  assert.equal(sol.durum.odak, false);
});
