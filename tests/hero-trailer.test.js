import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeroTrailer, DWELL_MS, CINE_MS } from '../www/js/hero-trailer.js';
import { createHeroStage } from '../www/js/hero-stage.js';

// Sahte zaman: advance(ms) o süre içinde dolan zamanlayıcıları sırayla çalıştırır
function clock() {
  let now = 0;
  let n = 0;
  const q = new Map();
  return {
    set: (f, ms) => { n += 1; q.set(n, { f, at: now + ms }); return n; },
    clear: (id) => q.delete(id),
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...q.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        q.delete(due[0]);
        now = due[1].at;
        due[1].f(); // zamanlayıcı async olabilir: sonucu beklenmez, mikro görevler boşalana dek dönülür
        for (let i = 0; i < 6; i++) await Promise.resolve();
      }
      now = end;
    },
    pending: () => q.size,
  };
}
function rig(opts = {}) {
  const c = clock();
  const log = [];
  const ht = createHeroTrailer({
    timers: c,
    resolve: async (it) => { log.push('resolve:' + it.id); return opts.ids === undefined ? ['vid' + it.id] : opts.ids; },
    start: (ids, it) => log.push('start:' + ids.join(',') + ':' + it.id),
    stop: () => log.push('stop'),
    setCine: (v) => log.push('cine:' + v),
    enabled: opts.enabled,
  });
  return { c, log, ht };
}
const A = { id: 'a' };
const B = { id: 'b' };

test('vitrin fragmanı: odakta DWELL_MS bekleyince çözülür ve başlar; öncesinde hiçbir şey olmaz', async () => {
  const { c, log, ht } = rig();
  ht.focus(A);
  await c.advance(DWELL_MS - 1);
  assert.deepEqual(log, []);
  await c.advance(1);
  assert.deepEqual(log, ['resolve:a', 'start:vida:a']);
  assert.equal(ht.state, 'loading');
});

test('vitrin fragmanı: odak değişince bekleyen başlatma iptal olur; aynı yapımın yeniden boyanması süreni kesmez', async () => {
  const { c, log, ht } = rig();
  ht.focus(A);
  await c.advance(2000);
  ht.focus(B);
  await c.advance(DWELL_MS - 1);
  assert.deepEqual(log, [], 'A için sayaç sıfırlandı');
  ht.focus({ id: 'b' }); // aynı yapım yeniden boyandı
  await c.advance(1);
  assert.deepEqual(log, ['resolve:b', 'start:vidb:b']);
  ht.playing();
  ht.focus({ id: 'b' });
  assert.equal(ht.state, 'playing', 'aynı yapım: kesilmez');
  assert.equal(log.includes('stop'), false);
});

test('vitrin fragmanı: oynamaya başlayınca CINE_MS sonra bilgiler kaybolur; tuş bilgiyi getirir ve hareketsizlikte yine kaybolur', async () => {
  const { c, log, ht } = rig();
  ht.focus(A);
  await c.advance(DWELL_MS);
  ht.playing();
  await c.advance(CINE_MS - 1);
  assert.equal(ht.cine, false);
  await c.advance(1);
  assert.equal(ht.cine, true);
  assert.equal(log.at(-1), 'cine:true');
  ht.activity();
  assert.equal(ht.cine, false, 'tuşa basınca bilgi geri gelir');
  assert.equal(log.at(-1), 'cine:false');
  await c.advance(CINE_MS - 1);
  assert.equal(ht.cine, false);
  await c.advance(1);
  assert.equal(ht.cine, true, 'hareketsiz kalınca yine kaybolur');
  ht.activity();
  await c.advance(3000);
  ht.activity();
  await c.advance(CINE_MS - 1);
  assert.equal(ht.cine, false, 'etkinlik sayacı yeniden başlatır');
});

test('vitrin fragmanı: odak değişince oynatıcı durur ve bilgi geri gelir; video bitince aynı yapımda yeniden başlamaz', async () => {
  const { c, log, ht } = rig();
  ht.focus(A);
  await c.advance(DWELL_MS);
  ht.playing();
  await c.advance(CINE_MS);
  assert.equal(ht.cine, true);
  ht.focus(B);
  assert.deepEqual(log.slice(-2), ['stop', 'cine:false']);
  assert.equal(ht.state, 'arming');
  await c.advance(DWELL_MS);
  ht.playing();
  ht.ended();
  assert.equal(ht.state, 'idle');
  ht.focus({ id: 'b' });
  await c.advance(DWELL_MS * 2);
  assert.equal(log.filter((x) => x === 'start:vidb:b').length, 1, 'bitmiş yapım odak değişmeden yeniden oynamaz');
});

test('vitrin fragmanı: fragman bulunamazsa oynatıcı kurulmaz ve yeniden denenmez; kapalıysa hiç başlamaz; cancel her şeyi bırakır', async () => {
  const none = rig({ ids: [] });
  none.ht.focus(A);
  await none.c.advance(DWELL_MS * 3);
  assert.deepEqual(none.log, ['resolve:a']);
  assert.equal(none.ht.state, 'idle');
  const off = rig({ enabled: () => false });
  off.ht.focus(A);
  await off.c.advance(DWELL_MS * 2);
  assert.deepEqual(off.log, []);
  const { c, log, ht } = rig();
  ht.focus(A);
  await c.advance(DWELL_MS);
  ht.playing();
  await c.advance(CINE_MS);
  ht.cancel();
  assert.deepEqual(log.slice(-2), ['stop', 'cine:false']);
  assert.equal(c.pending(), 0, 'sayaç kalmaz');
  ht.focus(A);
  await c.advance(DWELL_MS);
  assert.equal(log.filter((x) => x === 'start:vida:a').length, 2, 'cancel sonrası aynı yapım yeniden oynar');
});

test('vitrin fragmanı: çözme sürerken odak değişirse eski sonuç yoksayılır', async () => {
  const c = clock();
  const log = [];
  let release;
  const ht = createHeroTrailer({
    timers: c,
    resolve: (it) => new Promise((r) => { release = () => r(['x' + it.id]); }),
    start: (ids) => log.push('start:' + ids),
    stop: () => log.push('stop'),
    setCine: () => {},
  });
  ht.focus(A);
  await c.advance(DWELL_MS);
  ht.focus(B);
  release();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(log, [], 'eski yapımın sonucu kullanılmaz');
});

// ---- sahne (DOM) ----
function stageRig() {
  const c = clock();
  const ls = new Set();
  const win = { addEventListener: (ev, fn) => ev === 'message' && ls.add(fn), removeEventListener: (ev, fn) => ev === 'message' && ls.delete(fn), emit: (e) => [...ls].forEach((f) => f(e)), ls };
  const cls = new Set();
  const host = {
    innerHTML: '',
    classList: { toggle: (k, v) => (v ? cls.add(k) : cls.delete(k)) },
    querySelector: () => (host.innerHTML ? host.frame : null),
  };
  host.frame = { contentWindow: { postMessage() {} }, addEventListener() {} };
  const ev = [];
  const stage = createHeroStage({ host, win, origin: 'https://localhost', timers: c, onPlaying: () => ev.push('playing'), onEnded: () => ev.push('ended') });
  const msg = (data) => win.emit({ source: host.frame.contentWindow, data: JSON.stringify(data) });
  return { c, host, cls, ev, stage, msg, win };
}

test('vitrin sahnesi: kontrolsüz, sesli başlar; oynayınca katman görünür ve oynuyor bildirilir; bitince kaldırılır', () => {
  const r = stageRig();
  r.stage.start(['a1', 'b2']);
  assert.match(r.host.innerHTML, /<iframe class="ht-frame" src="https:\/\/www\.youtube\.com\/embed\/a1\?[^"]*mute=0[^"]*controls=0[^"]*disablekb=1[^"]*fs=0/);
  assert.match(r.host.innerHTML, /tabindex="-1"/, 'kumanda odağı iframe\'e girmez');
  assert.equal(r.cls.has('live'), false, 'oynamadan görünmez');
  r.msg({ event: 'infoDelivery', info: { playerState: 1 } });
  assert.equal(r.cls.has('live'), true);
  assert.deepEqual(r.ev, ['playing']);
  r.msg({ event: 'infoDelivery', info: { playerState: 1 } });
  assert.deepEqual(r.ev, ['playing'], 'tekrar bildirmez');
  r.msg({ event: 'onStateChange', info: 0 });
  assert.equal(r.host.innerHTML, '');
  assert.equal(r.cls.has('live'), false);
  assert.deepEqual(r.ev, ['playing', 'ended']);
});

test('vitrin sahnesi: sesli oynamazsa sessiz yeniden denenir, o da olmazsa sıradaki kimlik, kalmadıysa biter; hata hemen sıradakine geçer', async () => {
  const r = stageRig();
  r.stage.start(['a1', 'b2']);
  await r.c.advance(4499);
  assert.equal(r.stage.muted, false);
  await r.c.advance(1);
  assert.equal(r.stage.muted, true, 'sessiz yeniden dene');
  assert.match(r.host.innerHTML, /embed\/a1\?[^"]*mute=1/);
  await r.c.advance(4500);
  assert.equal(r.stage.index, 1, 'sıradaki kimlik');
  assert.match(r.host.innerHTML, /embed\/b2\?/);
  r.msg({ event: 'onError', info: 101 });
  assert.deepEqual(r.ev, ['ended'], 'kimlik kalmadı');
  assert.equal(r.host.innerHTML, '');
  const e = stageRig();
  e.stage.start(['x1', 'y2']);
  e.msg({ event: 'onError', info: 153 });
  assert.equal(e.stage.index, 1, 'gömülemeyen video: hemen sıradaki');
  e.msg({ event: 'infoDelivery', info: { playerState: 1 } });
  await e.c.advance(10000);
  assert.equal(e.stage.index, 1, 'oynuyorsa bekleme sayacı kalkmış');
  assert.deepEqual(e.ev, ['playing']);
});

test('vitrin sahnesi: yabancı kaynaktan gelen mesaj yoksayılır; destroy dinleyiciyi bırakır', () => {
  const r = stageRig();
  r.stage.start(['a1']);
  r.win.emit({ source: {}, data: JSON.stringify({ event: 'onStateChange', info: 1 }) });
  assert.equal(r.cls.has('live'), false);
  r.stage.destroy();
  assert.equal(r.win.ls.size, 0);
});

// ---- bağlantı ----
import { readFileSync } from 'node:fs';
const kaynak = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('bağlantı: vitrin boyanınca fragman denetleyicisine bildirilir; vitrin kapanınca/sayfa-oynatıcı açılınca/arka planda kesilir; yalnız TV ve ayar açıkken', () => {
  const app = kaynak('www/js/app.js');
  assert.match(app, /if \(!box \|\| box\.hidden\) return;\n  heroTrailer\.focus\(it\);/, 'paintHero her boyamada odağı bildirir');
  assert.match(app, /function heroOff\(\) \{\n  document\.documentElement\.classList\.remove\('hero-on'\);\n  heroTrailer\.cancel\(\);/);
  assert.match(app, /const heroTrailerOn = \(\) => isTvUi\(\) && !kidActive\(\) && setting\('trailerAuto'\) && !heroBusy\(\)/, 'TV, çocuk modu dışı, ayar açık, sayfa/oynatıcı yok');
  assert.match(app, /document\.querySelector\('#sheets > \*'\) \|\| document\.body\.classList\.contains\('player-open'\)/);
  assert.match(app, /visibilitychange', \(\) => \{ if \(document\.visibilityState === 'hidden'\) heroTrailer\.cancel\(\)/);
  assert.match(app, /\['keydown', 'pointerdown', 'touchstart'\]/, 'tuş/dokunuş bilgiyi geri getirir');
  assert.match(app, /setCine: \(on\) => document\.documentElement\.classList\.toggle\('hero-cine', on\)/);
  assert.match(app, /new Promise\(\(res\) => loadTitleExtras\(it, meta && meta\.imdbId, type,/, 'sağlayıcı → Cinemeta → YouTube sırası');
  assert.match(app, /if \(!setting\('trailerFind'\)\) return \[\];/);
  const html = kaynak('www/index.html');
  assert.match(html, /<div id="hero-tr" aria-hidden="true" inert><\/div>/, 'katman etkileşime kapalı: kumanda odağı iframe\'e girmez');
});

test('bağlantı: fragman katmanı tam ekran, oynamadan görünmez; cine kipinde bilgi solar; video başlık şeridi ekran dışında', () => {
  const css = kaynak('www/css/app.css');
  assert.match(css, /#hero-tr \{ position: fixed; inset: 0;[^}]*visibility: hidden; opacity: 0;/);
  assert.match(css, /#hero-tr\.live \{ visibility: visible; opacity: 1;/);
  assert.match(css, /#hero-tr \.ht-frame \{ position: absolute; left: 0; top: -35%; width: 100%; height: 170%;/);
  assert.match(css, /html\.hero-cine #app \{ opacity: 0; \}/);
});
