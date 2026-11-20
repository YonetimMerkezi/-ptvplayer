// LG webOS: tuş dağıtıcı (Geri tuşu keydown/keyup, kök ekranda çift basış, giriş alanı odaktayken).
import test from 'node:test';
import assert from 'node:assert/strict';

// Tarayıcı olmayan ortamda uygulama modülleri yüklenebilsin diye en az ölçüde taklit
globalThis.window = globalThis.window || { setTimeout, clearTimeout };
globalThis.document = globalThis.document || { getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
const { tuslariBagla } = await import('../webos/src/app.js');
const { ctx, push, top } = await import('../webos/src/ctx.js');
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
