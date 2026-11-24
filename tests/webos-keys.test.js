// LG webOS: tuş dağıtıcı (Geri tuşu keydown/keyup, kök ekranda çift basış, giriş alanı odaktayken).
import test from 'node:test';
import assert from 'node:assert/strict';

// Tarayıcı olmayan ortamda uygulama modülleri yüklenebilsin diye en az ölçüde taklit
globalThis.window = globalThis.window || { setTimeout, clearTimeout };
globalThis.document = globalThis.document || { getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
const { tuslariBagla } = await import('../webos/src/app.js');
const { ctx, push, top, geri } = await import('../webos/src/ctx.js');
const K = await import('../webos/src/log.js');

function sahte() {
  const dinleyen = {};
  const doc = { activeElement: null, addEventListener: (ad, fn) => (dinleyen[ad] = fn) };
  const tus = (ad, keyCode, ek) => {
    const e = { keyCode, repeat: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...ek };
    dinleyen[ad](e);
    return e;
  };
  return { doc, down: (k, ek) => tus('keydown', k, ek), up: (k, ek) => tus('keyup', k, ek) };
}

function ekran(ad, onKey, ek) {
  const el = { style: {}, parentNode: null };
  ctx.root = { appendChild() {}, removeChild() {} };
  return { el, name: ad, onKey, ...ek };
}

function sifirla() {
  ctx.stack.length = 0;
}

test('keys: Geri üstteki ekrana iletilir; ekran işlemezse bir önceki ekrana dönülür', () => {
  sifirla();
  const t = sahte();
  tuslariBagla(t.doc);
  const alinan = [];
  push(ekran('a', () => false));
  push(ekran('b', (a) => (alinan.push(a), false)));
  const e = t.down(461);
  assert.deepEqual(alinan, ['back']);
  assert.equal(e.defaultPrevented, true);
  assert.equal(top().name, 'a', 'işlenmeyen Geri ekranı kapatır');
});

test('keys: ekran Geri tuşunu işlerse ekran kapanmaz', () => {
  sifirla();
  const t = sahte();
  tuslariBagla(t.doc);
  push(ekran('a', () => false));
  push(ekran('b', () => true));
  t.down(461);
  assert.equal(top().name, 'b');
});

test('keys: yalnız keyup gelirse de Geri çalışır; keydown+keyup tek basış sayılır', () => {
  sifirla();
  const t = sahte();
  tuslariBagla(t.doc);
  push(ekran('a', () => false));
  push(ekran('b', () => false));
  push(ekran('c', () => false));
  t.up(461); // keydown yok → keyup basış sayılır
  assert.equal(top().name, 'b');
  t.down(461);
  t.up(461); // keydown görüldü → keyup ikinci basış olmaz
  assert.equal(top().name, 'a');
});

test('keys: tuşa basılı tutmak (repeat) art arda ekran kapatmaz', () => {
  sifirla();
  const t = sahte();
  tuslariBagla(t.doc);
  push(ekran('a', () => false));
  push(ekran('b', () => false));
  push(ekran('c', () => false));
  t.down(461);
  t.down(461, { repeat: true });
  t.down(461, { repeat: true });
  assert.equal(top().name, 'b');
});

test('keys: kök ekranda ilk Geri uyarı gösterir, ikincisi çıkış ister', () => {
  sifirla();
  const t = sahte();
  const toastlar = [];
  const eski = globalThis.document.getElementById;
  // toast() düğümü belge üzerinden kurar; basit bir düğümle yakalanır
  const dugum = { className: '', set textContent(v) { toastlar.push(v); }, style: {} };
  globalThis.document.getElementById = (id) => (id === 'toast' ? dugum : null);
  const cagrilar = [];
  globalThis.window.PalmSystem = { platformBack: () => cagrilar.push('platformBack') };
  tuslariBagla(t.doc);
  push(ekran('home', () => false));
  t.down(461);
  assert.deepEqual(cagrilar, [], 'ilk basışta çıkılmaz');
  assert.match(toastlar[0] || '', /tekrar/);
  t.up(461);
  t.down(461);
  assert.deepEqual(cagrilar, ['platformBack'], 'ikinci basışta çıkış istenir');
  assert.ok(K.kayitlar().some((s) => /Çıkış istendi \(platformBack\)/.test(s)));
  delete globalThis.window.PalmSystem;
  globalThis.document.getElementById = eski;
});

test('keys: yazı alanı odaktayken Geri ekranın onInputKey işlevine gider', () => {
  sifirla();
  const t = sahte();
  tuslariBagla(t.doc);
  const girdi = [];
  push(ekran('a', () => false));
  push(ekran('form', () => false, { onInputKey: (a) => (girdi.push(a), true) }));
  t.doc.activeElement = { tagName: 'INPUT' };
  const e = t.down(461);
  assert.deepEqual(girdi, ['back']);
  assert.equal(e.defaultPrevented, true);
  assert.equal(top().name, 'form', 'klavye kapanır, ekran kapanmaz');
});

test('keys: Geri ve tanınmayan tuşlar Hata kaydına yazılır', () => {
  sifirla();
  const t = sahte();
  tuslariBagla(t.doc);
  push(ekran('a', () => false));
  t.down(999);
  t.down(461);
  const l = K.kayitlar().join('\n');
  assert.match(l, /Tuş keydown 999 \(tanımsız\)/);
  assert.match(l, /Tuş keydown 461 → back/);
});

// Üst çubukta "‹ Geri" düğmesi olan sahte ekran
function ekranGeriliDugme(ad, onKey) {
  const dugme = { className: 'top-back' };
  const e = ekran(ad, onKey);
  e.el.querySelector = (sel) => (sel === '.top-back' ? dugme : null);
  e.dugme = dugme;
  return e;
}

test('keys: ekranın üst kenarında ▲ odağı Geri düğmesine çıkarır, ▼ içeriğe indirir, OK geri döner', () => {
  sifirla();
  geri.odak = false;
  const t = sahte();
  tuslariBagla(t.doc);
  push(ekran('home', () => false));
  const b = ekranGeriliDugme('liste', (a) => a === 'down');
  push(b);
  t.down(38); // ▲: ekran işlemez → düğmeye çıkılır
  assert.equal(geri.odak, true);
  assert.equal(b.dugme.className, 'top-back on');
  t.down(37); // ◀: yerinde kalır
  assert.equal(geri.odak, true);
  t.down(40); // ▼: içeriğe iner
  assert.equal(geri.odak, false);
  assert.equal(b.dugme.className, 'top-back');
  assert.equal(top().name, 'liste');
  t.down(38);
  t.down(13); // OK: bir önceki ekrana döner
  assert.equal(top().name, 'home');
  assert.equal(geri.odak, false);
});

test('keys: Geri düğmesi odaktayken Geri tuşu da geri döner; düğmesiz ekranda ▲ bir şey yapmaz', () => {
  sifirla();
  geri.odak = false;
  const t = sahte();
  tuslariBagla(t.doc);
  push(ekran('home', () => false));
  push(ekranGeriliDugme('b', () => false));
  t.down(38);
  t.down(461);
  assert.equal(top().name, 'home');
  t.down(38); // kök ekran, düğme yok
  assert.equal(geri.odak, false);
  assert.equal(top().name, 'home');
});

test('keys: ekran ▲ tuşunu işlerse (listede yukarı gezinme) odak düğmeye çıkmaz', () => {
  sifirla();
  geri.odak = false;
  const t = sahte();
  tuslariBagla(t.doc);
  push(ekran('home', () => false));
  const b = ekranGeriliDugme('liste', (a) => a === 'up');
  push(b);
  t.down(38);
  assert.equal(geri.odak, false);
  assert.equal(b.dugme.className, 'top-back');
});

test('keys: oynatıcıda ▲ Geri düğmesine çıkmaz (kanal/ses işlevleri ekrana aittir)', () => {
  sifirla();
  geri.odak = false;
  const t = sahte();
  tuslariBagla(t.doc);
  push(ekran('home', () => false));
  const p = ekranGeriliDugme('player', () => false);
  push(p);
  t.down(38);
  assert.equal(geri.odak, false);
});

// Üst çubukta Geri ve Ara düğmesi olan sahte ekran
function ekranAraliDugme(ad, onKey, araAc) {
  const geriD = { className: 'top-back' };
  const araD = { className: 'top-ara' };
  const e = ekran(ad, onKey, araAc ? { araAc } : {});
  e.el.querySelector = (sel) => (sel === '.top-back' ? geriD : sel === '.top-ara' ? araD : null);
  e.geriD = geriD;
  e.araD = araD;
  return e;
}

test('keys: Ara düğmesi — ▲ Geri\'ye çıkar, ▶ Ara\'ya geçer, ◀ Geri\'ye döner, OK ekranın araAc\'ını çağırır ve odak kapanır', () => {
  sifirla();
  geri.odak = false;
  const t = sahte();
  tuslariBagla(t.doc);
  push(ekran('home', () => false));
  let aranan = 0;
  const b = ekranAraliDugme('film', () => false, () => aranan++);
  push(b);
  t.down(38); // ▲ → Geri
  assert.deepEqual([geri.odak, geri.dugme, b.geriD.className, b.araD.className], [true, 'geri', 'top-back on', 'top-ara']);
  t.down(39); // ▶ → Ara
  assert.deepEqual([geri.dugme, b.geriD.className, b.araD.className], ['ara', 'top-back', 'top-ara on']);
  t.down(39); // sağda başka düğme yok: yerinde
  assert.equal(geri.dugme, 'ara');
  t.down(37); // ◀ → Geri
  assert.deepEqual([geri.dugme, b.geriD.className, b.araD.className], ['geri', 'top-back on', 'top-ara']);
  t.down(39);
  t.down(13); // OK: Ara
  assert.equal(aranan, 1);
  assert.equal(geri.odak, false);
  assert.equal(b.araD.className, 'top-ara');
  assert.equal(top().name, 'film', 'Ara düğmesi ekranı kapatmaz');
  t.down(38);
  t.down(39);
  t.down(40); // ▼ içeriğe indirir
  assert.deepEqual([geri.odak, b.araD.className], [false, 'top-ara']);
  assert.equal(aranan, 1);
});

test('keys: Ara düğmesi odaktayken Geri tuşu geri döner; araAc tanımsızsa tüm katalog Ara ekranı açılır; Ara yoksa ▶ yerinde kalır', () => {
  sifirla();
  geri.odak = false;
  const t = sahte();
  tuslariBagla(t.doc);
  push(ekran('home', () => false));
  push(ekranAraliDugme('film', () => false));
  t.down(38);
  t.down(39);
  t.down(461); // Geri
  assert.equal(top().name, 'home');
  assert.equal(geri.odak, false);
  // Ara düğmesi olmayan ekran: ▶ Geri'de kalır
  push(ekranGeriliDugme('liste', () => false));
  t.down(38);
  t.down(39);
  assert.deepEqual([geri.odak, geri.dugme], [true, 'geri']);
});
