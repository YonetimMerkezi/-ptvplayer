import test from 'node:test';
import assert from 'node:assert/strict';

// Chromium geçmişinin sade modeli: pushState ileri girdileri siler. go(d) hedefi ÇAĞRILDIĞI andaki girdiye göre
// belirler (sonradan yapılan pushState hedefi kaydırmaz) ve eşzamansız uygulanır; sonunda popstate yayılır.
function fakeBrowser(drop = false) {
  const entries = [{ state: null }];
  let cur = 0;
  const handlers = [];
  global.history = {
    get state() {
      return entries[cur].state;
    },
    get length() {
      return entries.length;
    },
    pushState(state) {
      entries.splice(cur + 1);
      entries.push({ state });
      cur++;
    },
    go(d) {
      const target = entries[cur + d];
      if (drop || !target) return;
      setTimeout(() => {
        const i = entries.indexOf(target);
        if (i < 0) return;
        cur = i;
        handlers.forEach((h) => h());
      }, 0);
    },
    back() {
      this.go(-1);
    },
  };
  global.window = { addEventListener: (t, h) => t === 'popstate' && handlers.push(h) };
  // tarayıcının kendi geri tuşu
  return { systemBack: () => global.history.go(-1) };
}
const tick = () => new Promise((r) => setTimeout(r, 10));

const b = fakeBrowser();
const nav = await import('../www/js/nav.js');
nav.initNav();

test('katman açılır, kapatılınca onClose hemen çalışır ve katman yığından çıkar', async () => {
  let closed = 0;
  nav.pushLayer('a', () => closed++);
  assert.equal(nav.topLayer(), 'a');
  nav.popLayer('a');
  assert.equal(closed, 1, 'onClose eşzamanlı çalıştı');
  assert.equal(nav.topLayer(), null);
  await tick();
  assert.equal(nav.topLayer(), null);
  assert.equal(closed, 1, 'ikinci kez kapanmadı');
});

test('alt sayfayı kapatıp hemen yeni katman açmak yeni katmanı kapatmaz', async () => {
  const log = [];
  nav.pushLayer('sheet', () => log.push('sheet'));
  nav.popLayer('sheet');
  nav.pushLayer('player', () => log.push('player')); // geri alma sürerken
  await tick();
  assert.deepEqual(log, ['sheet'], 'oynatıcı açık kaldı');
  assert.equal(nav.topLayer(), 'player');
  b.systemBack();
  await tick();
  assert.deepEqual(log, ['sheet', 'player'], 'geri tuşu yine oynatıcıyı kapatır');
  assert.equal(nav.topLayer(), null);
});

test('kapatıp hemen iki katman açmak da ikisini de açık bırakır', async () => {
  const log = [];
  nav.pushLayer('s1', () => log.push('s1'));
  nav.popLayer('s1');
  nav.pushLayer('p', () => log.push('p'));
  nav.pushLayer('s2', () => log.push('s2'));
  await tick();
  assert.deepEqual(log, ['s1']);
  assert.equal(nav.topLayer(), 's2');
  b.systemBack();
  await tick();
  assert.equal(nav.topLayer(), 'p');
  b.systemBack();
  await tick();
  assert.deepEqual(log, ['s1', 's2', 'p']);
});

test('adıyla kapatınca üstündeki katmanlar da kapanır (üstteki önce); aynı katmanı iki kez kapatmak zarar vermez', async () => {
  const log = [];
  nav.pushLayer('tab', () => log.push('tab'));
  nav.pushLayer('group', () => log.push('group'));
  nav.pushLayer('page', () => log.push('page'));
  nav.popLayer('tab');
  nav.popLayer('tab');
  assert.deepEqual(log, ['page', 'group', 'tab']);
  await tick();
  assert.equal(nav.topLayer(), null);
  nav.popLayer('yok'); // olmayan ad: sessizce geçer
  nav.popLayer();
});

test('geri tuşu üstteki katmanı kapatır; onClose hatası akışı bozmaz', async () => {
  const log = [];
  nav.pushLayer('x', () => log.push('x'));
  nav.pushLayer('y', () => {
    throw new Error('boom');
  });
  b.systemBack();
  await tick();
  assert.equal(nav.topLayer(), 'x');
  b.systemBack();
  await tick();
  assert.deepEqual(log, ['x']);
  assert.equal(nav.topLayer(), null);
});

test('kapatılıp hemen açılıp yine kapatılan katman geçmişte iz bırakmaz', async () => {
  const log = [];
  nav.pushLayer('a', () => log.push('a'));
  nav.popLayer('a');
  nav.pushLayer('b', () => log.push('b')); // geri adım sürerken açılır, henüz geçmişe yazılmadı
  nav.popLayer('b');
  await tick();
  assert.deepEqual(log, ['a', 'b']);
  assert.equal(nav.topLayer(), null);
  assert.equal(global.history.state, null, 'geçmiş ana girdide');
  nav.pushLayer('c', () => log.push('c'));
  assert.equal(global.history.state.n, 1, 'sonraki katman temiz girdiyle başlar');
  b.systemBack();
  await tick();
  assert.deepEqual(log, ['a', 'b', 'c']);
});

test('geri adımın popstate’i hiç gelmezse bekleyen katman süre sonunda geçmişe yazılır', async () => {
  fakeBrowser(true); // go() hiç sonuçlanmaz
  nav.pushLayer('p', () => {});
  nav.popLayer('p');
  nav.pushLayer('q', () => {});
  assert.equal(global.history.state && global.history.state.layer, 'p', 'q henüz yazılmadı');
  await new Promise((r) => setTimeout(r, 1700));
  assert.equal(global.history.state.layer, 'q');
  assert.equal(global.history.state.n, 1);
  assert.equal(nav.topLayer(), 'q');
});
