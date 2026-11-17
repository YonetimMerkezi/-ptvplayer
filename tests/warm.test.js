import test from 'node:test';
import assert from 'node:assert/strict';
import { createWarm, httpUrls, matchLogoUrls, uniqueEntries, WARM_GAP_MS, WARM_PREF, MAX_ADVISORIES } from '../www/js/warm.js';

function setup({ unmetered = true, at = 0 } = {}) {
  const calls = [];
  const st = { unmetered, flipAfter: Infinity, prefs: { [WARM_PREF]: at } };
  const native = {
    imageCacheInfo: async () => ({ unmetered: st.unmetered && calls.filter((c) => c[0] === 'warm').length < st.flipAfter }),
    warmImages: async ({ urls }) => {
      calls.push(['warm', urls]);
      return { added: urls.length };
    },
  };
  const store = { pref: (k, d) => (k in st.prefs ? st.prefs[k] : d), setPref: (k, v) => (st.prefs[k] = v) };
  let t = 10 * WARM_GAP_MS;
  const sleeps = [];
  const w = createWarm({ native, store, net: null, now: () => t, sleep: async (ms) => sleeps.push(ms) });
  return { w, st, calls, sleeps, native, tick: (ms) => (t += ms), now: () => t };
}
const items = (n) => Array.from({ length: n }, (_, i) => ({ id: 'i' + i, logo: `https://img.example/${i}.jpg` }));

test('adres süzme: yalnız http(s), tekrarsız', () => {
  assert.deepEqual(httpUrls(['https://a/1', 'https://a/1', ' http://b/2 ', 'file:///x', '', null, 'javascript:1']), ['https://a/1', 'http://b/2']);
});

test('maç simgeleri: milli takımda bayrak, kulüpte kaynağın logosu, logosuz kulüp atlanır', () => {
  const m = (h, a, hl = '', al = '') => ({ home: { name: h, logo: hl }, away: { name: a, logo: al } });
  const urls = matchLogoUrls([m('Türkiye', 'Almanya'), m('Galatasaray', 'Fenerbahçe', 'https://espn/gs.png', ''), m('Galatasaray', 'Fenerbahçe', 'https://espn/gs.png', 'https://espn/fb.png')]);
  assert.ok(urls.every((u) => /^https?:\/\//.test(u)));
  assert.ok(urls.some((u) => /flagcdn\.com\/w80\/tr\.png$/.test(u)) && urls.some((u) => /flagcdn\.com\/w80\/de\.png$/.test(u)), 'milli takım bayrakları');
  assert.ok(urls.includes('https://espn/gs.png') && urls.includes('https://espn/fb.png'));
  assert.equal(new Set(urls).size, urls.length, 'tekrar yok');
});

test('uniqueEntries: kaynak sırası korunur, aynı kimlik bir kez', () => {
  const a = [{ kind: 'movie', it: { id: '1' } }, { kind: 'movie', it: { id: '2' } }];
  const b = [{ kind: 'series', it: { id: '2' } }, { kind: 'movie', it: { id: '3' } }, null, { kind: 'movie' }];
  assert.deepEqual(uniqueEntries(a, b).map((e) => e.it.id), ['1', '2', '3']);
});

test('atlanır: yerel eklenti yok / son indirme yakın / ağ ölçülü', async () => {
  const { w: web } = setup();
  const noNative = createWarm({ native: null, store: { pref: () => 0, setPref() {} }, net: null });
  assert.deepEqual(await noNative.run({ items: items(3), sports: false }), { skipped: 'web' });
  const recent = setup({ at: 10 * WARM_GAP_MS - 1000 });
  assert.deepEqual(await recent.w.run({ items: items(3), sports: false }), { skipped: 'recent' });
  assert.equal(recent.calls.length, 0);
  const forced = await recent.w.run({ items: items(3), sports: false, force: true });
  assert.equal(forced.images, 3, 'force süreyi yok sayar');
  const metered = setup({ unmetered: false });
  assert.deepEqual(await metered.w.run({ items: items(3), sports: false }), { skipped: 'metered' });
  assert.equal(metered.calls.length, 0, 'ölçülü ağda hiçbir şey indirilmez');
  void web;
});

test('görseller 20\'şerlik parçalarla iner, bitince zaman damgası yazılır', async () => {
  const s = setup();
  const r = await s.w.run({ items: items(45), sports: false });
  assert.deepEqual(s.calls.map((c) => c[1].length), [20, 20, 5]);
  assert.equal(r.images, 45);
  assert.equal(r.stopped, false);
  assert.equal(s.st.prefs[WARM_PREF], s.now(), 'tamamlanan tur kaydedilir');
});

test('ağ ölçülüye geçerse ya da oynatma başlarsa iş durur ve tur tamamlanmış sayılmaz', async () => {
  const a = setup();
  a.st.flipAfter = 1; // ilk parçadan sonra ölçülü
  const r = await a.w.run({ items: items(45), sports: false });
  assert.equal(a.calls.length, 1);
  assert.equal(r.stopped, true);
  assert.equal(a.st.prefs[WARM_PREF], 0, 'yarım tur yeniden denenebilsin');
  const b = setup();
  let busy = false;
  const adv = [];
  const r2 = await b.w.run({ items: [], movies: items(5), sports: false, advise: async (it) => { adv.push(it.id); busy = true; }, busy: () => busy });
  assert.deepEqual(adv, ['i0'], 'oynatma başlayınca sıradaki filme geçilmez');
  assert.equal(r2.stopped, true);
});

test('uyarılar: en çok MAX_ADVISORIES film, aralıklı; biri hata verse de sıradakine geçilir', async () => {
  const s = setup();
  const got = [];
  const r = await s.w.run({
    items: [],
    movies: items(MAX_ADVISORIES + 10),
    sports: false,
    advise: async (it) => {
      got.push(it.id);
      if (it.id === 'i1') throw new Error('kaynak yanıt vermedi');
    },
  });
  assert.equal(got.length, MAX_ADVISORIES);
  assert.equal(r.advisories, MAX_ADVISORIES - 1, 'hatalı film sayılmaz');
  assert.ok(s.sleeps.length >= MAX_ADVISORIES && s.sleeps.every((ms) => ms >= 300), 'kaynaklara aralıklı istek');
});

test('aynı anda iki tur başlamaz; maç listesi alınamazsa yalnız o adım atlanır ve tur biter', async () => {
  const s = setup();
  const net = { json: async () => { throw new Error('ağ yok'); } };
  const w = createWarm({ native: s.native, store: { pref: (k, d) => (k in s.st.prefs ? s.st.prefs[k] : d), setPref: (k, v) => (s.st.prefs[k] = v) }, net, now: s.now, sleep: async () => {} });
  const p1 = w.run({ items: items(2), sports: true });
  const p2 = await w.run({ items: items(2), sports: true });
  assert.deepEqual(p2, { skipped: 'running' });
  const r = await p1;
  assert.equal(r.matches, 0);
  assert.equal(r.stopped, false);
  assert.equal(s.st.prefs[WARM_PREF], s.now());
});
