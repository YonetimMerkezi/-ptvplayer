import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeroTrailer, DWELL_MS, PREFETCH_MS, CINE_MS } from '../www/js/hero-trailer.js';
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

test('vitrin fragmanı: kimlik PREFETCH_MS sonra önden çözülür, DWELL_MS dolunca başlar; öncesinde oynatıcı kurulmaz', async () => {
  const { c, log, ht } = rig();
  ht.focus(A);
  await c.advance(PREFETCH_MS - 1);
  assert.deepEqual(log, [], 'hızlı gezerken ağa gidilmez');
  await c.advance(1);
  assert.deepEqual(log, ['resolve:a'], 'çözme bekleme süresiyle paralel başlar');
  await c.advance(DWELL_MS - PREFETCH_MS - 1);
  assert.deepEqual(log, ['resolve:a']);
  await c.advance(1);
  assert.deepEqual(log, ['resolve:a', 'start:vida:a']);
  assert.equal(ht.state, 'loading');
  assert.ok(DWELL_MS <= 2000 && CINE_MS === 4000, 'hızlı başlar; bilgi 4 sn sonra kaybolur');
});

test('vitrin fragmanı: odak değişince bekleyen başlatma iptal olur; aynı yapımın yeniden boyanması süreni kesmez', async () => {
  const { c, log, ht } = rig();
  ht.focus(A);
  await c.advance(DWELL_MS - 100);
  ht.focus(B);
  await c.advance(DWELL_MS - 1);
  assert.deepEqual(log, ['resolve:a', 'resolve:b'], 'A başlamadı; B için sayaç sıfırlandı');
  assert.equal(log.includes('start:vida:a'), false);
  ht.focus({ id: 'b' }); // aynı yapım yeniden boyandı
  await c.advance(1);
  assert.deepEqual(log.slice(-1), ['start:vidb:b']);
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
  assert.equal(log.filter((x) => x === 'resolve:b').length, 1, 'yeniden çözülmez');
});

test('vitrin fragmanı: fragman bulunamazsa oynatıcı kurulmaz ve yeniden denenmez; kapalıysa hiç başlamaz; cancel her şeyi bırakır', async () => {
  const none = rig({ ids: [] });
  none.ht.focus(A);
  await none.c.advance(DWELL_MS * 3);
  assert.deepEqual(none.log, ['resolve:a'], 'çözme yalnız bir kez');
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
  assert.match(r.host.innerHTML, /<iframe class="ht-frame lo" src="https:\/\/www\.youtube\.com\/embed\/a1\?[^"]*mute=0[^"]*controls=0[^"]*disablekb=1[^"]*fs=0/);
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

test('vitrin sahnesi: sesli oynamazsa 2,5 sn sonra sessiz yeniden denenir ve sonrakiler baştan sessiz başlar; o da olmazsa sıradaki kimlik, kalmadıysa biter; hata hemen sıradakine geçer', async () => {
  const r = stageRig();
  r.stage.start(['a1', 'b2']);
  await r.c.advance(2499);
  assert.equal(r.stage.muted, false);
  await r.c.advance(1);
  assert.equal(r.stage.muted, true, 'sessiz yeniden dene');
  assert.match(r.host.innerHTML, /embed\/a1\?[^"]*mute=1/);
  await r.c.advance(5999);
  assert.equal(r.stage.index, 0, 'sessiz deneme daha uzun beklenir (yavaş TV kutusu)');
  await r.c.advance(1);
  assert.equal(r.stage.index, 1, 'sıradaki kimlik');
  assert.match(r.host.innerHTML, /embed\/b2\?/);
  r.msg({ event: 'onError', info: 101 });
  assert.deepEqual(r.ev, ['ended'], 'kimlik kalmadı');
  assert.equal(r.host.innerHTML, '');
  r.stage.start(['c3']);
  assert.match(r.host.innerHTML, /embed\/c3\?[^"]*mute=1/, 'sesli başlatma engellendiği öğrenildi: bir sonraki fragman baştan sessiz');
  const e = stageRig();
  e.stage.start(['x1', 'y2']);
  e.msg({ event: 'onError', info: 153 });
  assert.equal(e.stage.index, 1, 'gömülemeyen video: hemen sıradaki');
  e.msg({ event: 'infoDelivery', info: { playerState: 1 } });
  await e.c.advance(10000);
  assert.equal(e.stage.index, 1, 'oynuyorsa bekleme sayacı kalkmış');
  assert.deepEqual(e.ev, ['playing']);
});

test('vitrin sahnesi: toggleMute sesi açar/kapatır (oynatıcıya komut gider); oynatıcı yokken null', () => {
  const r = stageRig();
  const posted = [];
  r.host.frame.contentWindow.postMessage = (m) => posted.push(JSON.parse(m));
  assert.equal(r.stage.toggleMute(), null, 'oynatıcı yok');
  r.stage.start(['a1']);
  assert.equal(r.stage.muted, false);
  assert.equal(r.stage.toggleMute(), true);
  assert.deepEqual(posted.at(-1), { event: 'command', func: 'mute', args: [] });
  assert.equal(r.stage.toggleMute(), false);
  assert.deepEqual(posted.slice(-2), [{ event: 'command', func: 'unMute', args: [] }, { event: 'command', func: 'setVolume', args: [100] }]);
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
  assert.match(app, /const heroTrailerCan = \(\) => \(isTvUi\(\) \|\| phoneVitrin\(\)\) && !kidActive\(\) && !heroBusy\(\) && document\.visibilityState !== 'hidden';\nconst heroTrailerOn = \(\) => heroTrailerCan\(\) && trailerAutoOn\(\);/, 'TV ya da telefon dikey vitrin, çocuk modu dışı, sayfa/oynatıcı yok; kendiliğinden oynama ayrıca ayara ve Pro\'ya bağlı');
  assert.match(app, /document\.querySelector\('#sheets > \*'\) \|\| document\.body\.classList\.contains\('player-open'\)/);
  assert.match(app, /visibilitychange', \(\) => \{ if \(document\.visibilityState === 'hidden'\) heroTrailer\.cancel\(\)/);
  assert.match(app, /\['pointerdown', 'touchstart', 'touchmove', 'wheel'\]/, 'dokunuş/kaydırma bilgiyi geri getirir');
  assert.match(app, /document\.addEventListener\('keydown', \(e\) => \{\n  const cine = heroTrailer\.cine;\n  heroTrailer\.activity\(\);/, 'tuş bilgiyi geri getirir');
  assert.match(app, /setCine: \(on\) => document\.documentElement\.classList\.toggle\('hero-cine', on\)/, 'sinema kipi TV\'de de telefonda da');
  assert.match(app, /idle: \(\) => \(isTvUi\(\) \? 0 : 7000\)/, 'telefonda dokunuştan sonra 7 sn görünür, TV\'de CINE_MS');
  assert.match(app, /new Promise\(\(res\) => loadTitleExtras\(it, meta && meta\.imdbId, type,/, 'sağlayıcı → Cinemeta → YouTube sırası');
  assert.match(app, /if \(!setting\('trailerFind'\)\) return \[\];/);
  const html = kaynak('www/index.html');
  assert.match(html, /<div id="hero-tr" aria-hidden="true" inert><\/div>/, 'katman etkileşime kapalı: kumanda odağı iframe\'e girmez');
  assert.match(html, /<div id="hero-dim" aria-hidden="true" inert><\/div>\n<div id="hero-tr"/, 'karartma katmanı fragmanın altında');
});

test('bağlantı: fragman katmanı tam ekran, oynamadan görünmez; cine kipinde bilgi solar; video başlık şeridi ekran dışında', () => {
  const css = kaynak('www/css/app.css');
  assert.match(css, /#hero-tr \{ position: fixed; inset: 0;[^}]*visibility: hidden; opacity: 0;/);
  assert.match(css, /#hero-tr\.live \{ visibility: visible; opacity: 1;/);
  assert.match(css, /#hero-tr \.ht-frame \{ position: absolute; left: 0; top: -35%; width: 100%; height: 170%;/);
  assert.match(css, /html\.hero-cine #app \{ opacity: 0; \}/);
  assert.match(css, /html\.hero-cine #app \{ pointer-events: none; \}/, 'gizliyken dokunuş görünmeyen öğeye gitmez');
  assert.match(css, /html:not\(\.tv\) #hero-dim \{ display: block; position: fixed; inset: 0; z-index: 0; background: #000; opacity: 0; pointer-events: none; transition: opacity 0\.9s ease; \}/);
  assert.match(css, /html:not\(\.tv\)\.hero-cine #hero-dim \{ opacity: 1; \}/, 'telefonda zemin kararır');
  assert.match(css, /html:not\(\.tv\)\.hero-cine #hero-tr::after \{ opacity: 0; \}/, 'telefonda video üstündeki gölge de kalkar');
});

test('vitrin fragmanı: idle verilince dokunuştan sonra bilgi o süre sonra kaybolur; ilk gizleme CINE_MS', async () => {
  const c = clock();
  const log = [];
  const ht = createHeroTrailer({
    timers: c, idle: () => 7000,
    resolve: async () => ['v'], start: () => log.push('start'), stop: () => log.push('stop'), setCine: (v) => log.push('cine:' + v),
  });
  ht.focus(A);
  await c.advance(DWELL_MS);
  ht.playing();
  await c.advance(CINE_MS - 1);
  assert.equal(ht.cine, false);
  await c.advance(1);
  assert.equal(ht.cine, true, 'ilk gizleme CINE_MS sonra');
  ht.activity();
  assert.equal(ht.cine, false, 'dokunuş bilgiyi getirir');
  await c.advance(6999);
  assert.equal(ht.cine, false, 'telefonda 7 sn görünür kalır');
  await c.advance(1);
  assert.equal(ht.cine, true);
  ht.activity();
  ht.activity(); // sürekli kaydırma: sayaç her seferinde yeniden başlar
  await c.advance(5000);
  ht.activity();
  await c.advance(6999);
  assert.equal(ht.cine, false);
});

test('vitrin fragmanı: idle sayı, işlev ya da boş olabilir; geçersizse CINE_MS kullanılır', async () => {
  for (const idle of [undefined, null, 0, () => 0, () => undefined, -5]) {
    const c = clock();
    const ht = createHeroTrailer({ timers: c, idle, resolve: async () => ['v'], start: () => {}, stop: () => {}, setCine: () => {} });
    ht.focus(A);
    await c.advance(DWELL_MS);
    ht.playing();
    await c.advance(CINE_MS);
    ht.activity();
    await c.advance(CINE_MS - 1);
    assert.equal(ht.cine, false, String(idle));
    await c.advance(1);
    assert.equal(ht.cine, true, String(idle));
  }
});

test('bağlantı: vitrinde ses düğmesi (TV, fragman oynarken), Oynat/Duraklat ve M tuşu; düğme hero-live ile görünür', () => {
  const app = kaynak('www/js/app.js');
  assert.match(app, /data-hero="sound"/);
  assert.match(app, /if \(b && b\.dataset\.hero === 'sound'\) return toggleHeroSound\(\);/, 'kumanda Tamam\'ı (kbd) da sesi açar: kbd dönüşünden önce');
  assert.match(app, /e\.key !== 'MediaPlayPause' && e\.key !== 'm' && e\.key !== 'M'/);
  assert.match(app, /onPlaying: \(\) => \{ heroLive\(true\); heroTrailer\.playing\(\); \}/);
  assert.match(app, /stop: \(\) => \{ heroStage\.stop\(\); heroLive\(false\); \}/);
  const css = kaynak('www/css/app.css');
  assert.match(css, /\.hero-snd \{ display: none; \}/);
  assert.match(css, /html\.tv\.hero-live \.hero-snd \{ display: inline-flex;/);
});

test('vitrin sahnesi: opts.muted ile baştan sessiz başlar (telefon); seçenek yoksa sesli denenir', () => {
  const a = stageRig();
  a.stage.start(['a1'], { muted: true });
  assert.match(a.host.innerHTML, /embed\/a1\?[^"]*mute=1/);
  const b = stageRig();
  b.stage.start(['a1']);
  assert.match(b.host.innerHTML, /embed\/a1\?[^"]*mute=0/);
});

test('bağlantı: dikey telefon vitrininde de fragman (sessiz, sinema kipi yok, ses düğmesi); yatay çevrilince kesilir', () => {
  const app = kaynak('www/js/app.js');
  assert.match(app, /const phoneVitrin = \(\) => !isTvUi\(\) && document\.documentElement\.classList\.contains\('hero-on'\) && document\.documentElement\.classList\.contains\('hero-rows'\) && !!\(window\.matchMedia && window\.matchMedia\('\(orientation: portrait\)'\)\.matches\)/);
  assert.match(app, /start: \(ids\) => heroStage\.start\(ids, \{ muted: !isTvUi\(\) \}\)/, 'telefonda sessiz başlar');
  assert.match(app, /matchMedia\('\(orientation: portrait\)'\)\.addEventListener\('change', \(\) => \{\s*if \(!heroTrailerOn\(\)\) heroTrailer\.cancel\(\);/);
  const css = kaynak('www/css/app.css');
  assert.match(css, /html:not\(\.tv\) #hero-tr \{ bottom: auto; height: 58vh;/, 'fragman afişle aynı alanı (üst %58) kaplar');
  assert.match(css, /html:not\(\.tv\) #hero-tr \.ht-frame \{ width: calc\(58vh \* 16 \/ 9\); left: 50%; transform: translateX\(-50%\); \}/, '16:9 video alanı doldurur, ortalı');
  assert.match(css, /html:not\(\.tv\)\.hero-live \.hero-snd \{ display: grid;[^}]*position: absolute;/, 'telefonda yuvarlak ses düğmesi');
  assert.match(css, /@media \(orientation: landscape\) \{ html:not\(\.tv\):not\(\.kbd\) #hero-tr \{ display: none !important; \} \}/);
  assert.match(css, /@media not all and \(orientation: landscape\) \{ html:not\(\.tv\):not\(\.hero-rows\) #hero-tr \{ display: none !important; \} \}/);
});

test('bağlantı: fragman sahnesi kenarları keskin değil (maske ile solar), düğme kutunun dışında kalır', () => {
  const css = kaynak('www/css/app.css');
  assert.match(css, /\.tr-box \{ position: relative; aspect-ratio: 16 \/ 9;[^}]*-webkit-mask-image: linear-gradient\(180deg, transparent 0[^}]*mask-image: linear-gradient\(180deg, transparent 0/);
  assert.doesNotMatch(css, /\.tr-box::after \{[^}]*var\(--bg, #05080d\)/, 'sayfa zeminini taklit eden bant yok');
  assert.match(css, /\.tr-box \{ border-radius: 0; -webkit-mask-image: linear-gradient\(90deg, transparent 0[^}]*mask-composite: intersect;/, 'yatayda dört kenar solar');
  assert.doesNotMatch(css, /\.tr-box \{ border-radius: 14px; box-shadow/);
  const ui = kaynak('www/js/title-ui.js');
  assert.match(ui, /<div class="tr-hero"><div class="tr-box">\$\{media\}<\/div>\$\{unmute\}<\/div>/, 'düğme maskeli kutunun dışında');
});

// ---- elle "Fragmanı oynat", düşük kalite, varsayılan kapalı ----
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
test('elle oynatma: beklemeden başlar, otomatik oynatma kapalıyken de çalışır; izin yoksa başlamaz; fragman yoksa notFound', async () => {
  const c = clock();
  const log = [];
  let allow = true;
  let ids = ['v1'];
  const ht = createHeroTrailer({
    timers: c,
    enabled: () => false, // otomatik oynatma kapalı (varsayılan)
    allowed: () => allow,
    notFound: (it) => log.push('yok:' + it.id),
    resolve: async (it) => { log.push('resolve:' + it.id); return ids; },
    start: (list, it) => log.push('start:' + list.join(',') + ':' + it.id),
    stop: () => log.push('stop'),
    setCine: () => {},
  });
  ht.focus(A);
  await c.advance(DWELL_MS * 3);
  assert.deepEqual(log, [], 'otomatik kapalıyken odakta bekleyince hiçbir şey olmaz (ağ da kullanılmaz)');
  assert.equal(ht.play(A), true);
  await flush();
  assert.deepEqual(log, ['resolve:' + A.id, 'start:v1:' + A.id], 'bekleme yok');
  assert.equal(ht.state, 'loading');
  ht.playing();
  assert.equal(ht.state, 'playing');
  ht.stop();
  assert.equal(ht.state, 'idle');
  assert.equal(log.at(-1), 'stop');
  // durdurulan yapımda kendiliğinden yeniden başlamaz; elle yine başlar
  log.length = 0;
  ids = [];
  assert.equal(ht.play(A), true);
  await flush();
  assert.deepEqual(log, ['resolve:' + A.id, 'yok:' + A.id]);
  assert.equal(ht.state, 'idle');
  allow = false;
  assert.equal(ht.play(A), false, 'izin yoksa (çocuk modu, Pro değil, sayfa açık) başlamaz');
});

test('elle oynatma: çözülürken odak başka yapıma geçerse eski sonuç kullanılmaz', async () => {
  const c = clock();
  const log = [];
  let release;
  const ht = createHeroTrailer({
    timers: c,
    enabled: () => false,
    allowed: () => true,
    resolve: () => new Promise((r) => { release = () => r(['x']); }),
    start: (ids) => log.push('start:' + ids),
    stop: () => log.push('stop'),
    setCine: () => {},
  });
  ht.play(A);
  await flush(); // çözme başladı, sonuç bekleniyor
  ht.focus(B);
  release();
  await flush();
  assert.deepEqual(log, []);
  assert.equal(ht.state, 'idle');
});

test('vitrin sahnesi: oynatıcı düşük kaliteyle (yarı boy) kurulur; 4 sn sorunsuz oynarsa tam boya alınır; hafif modda düşük kalır', async () => {
  const mk = (canUpgrade) => {
    const c = clock();
    const cls = new Set(['ht-frame', 'lo']);
    const posted = [];
    const host = { innerHTML: '', classList: { toggle() {} }, querySelector: () => (host.innerHTML ? host.frame : null) };
    host.frame = { contentWindow: { postMessage: (m) => posted.push(JSON.parse(m)) }, addEventListener() {}, classList: { remove: (k) => cls.delete(k) } };
    const ls = new Set();
    const win = { addEventListener: (ev, fn) => ev === 'message' && ls.add(fn), removeEventListener() {}, emit: (e) => [...ls].forEach((f) => f(e)) };
    const stage = createHeroStage({ host, win, timers: c, canUpgrade });
    return { c, cls, posted, host, stage, play: () => win.emit({ source: host.frame.contentWindow, data: JSON.stringify({ event: 'infoDelivery', info: { playerState: 1 } }) }) };
  };
  const a = mk(() => true);
  a.stage.start(['a1']);
  assert.match(a.host.innerHTML, /class="ht-frame lo"/);
  assert.equal(a.cls.has('lo'), true);
  a.play();
  await a.c.advance(3999);
  assert.equal(a.cls.has('lo'), true, 'daha erken yükseltilmez');
  await a.c.advance(1);
  assert.equal(a.cls.has('lo'), false, 'tam boya alındı');
  assert.deepEqual(a.posted.at(-1), { event: 'command', func: 'setPlaybackQuality', args: ['large'] });
  // oynamadan durdurulursa yükseltme zamanlayıcısı kalmaz
  const d = mk(() => true);
  d.stage.start(['a1']);
  d.play();
  d.stage.stop();
  assert.equal(d.c.pending(), 0);
  // hafif mod: düşük kalır
  const b = mk(() => false);
  b.stage.start(['a1']);
  b.play();
  await b.c.advance(60000);
  assert.equal(b.cls.has('lo'), true);
});

test('bağlantı: fragman otomatik oynatma varsayılan KAPALI (ayar ekranı ve kod aynı varsayılanı kullanır); vitrinde "Fragmanı oynat" düğmesi (TV ve telefon)', () => {
  const app = kaynak('www/js/app.js');
  assert.match(app, /const SETTING_DEFAULTS = \{ trailerAuto: false \};/);
  assert.match(app, /const setting = \(k, d = settingDefault\(k\)\) => store\.pref\('set\.' \+ k, d\);/, 'chkRow ve tıklama aynı setting() varsayılanını okur');
  assert.ok(!/setting\('trailerAuto', true\)/.test(app));
  assert.match(app, /data-hero="trailer"/);
  assert.match(app, /if \(b && b\.dataset\.hero === 'trailer'\) return toggleHeroTrailer\(\);/, 'kumanda Tamam\'ı (kbd) da çalışır: kbd dönüşünden önce');
  assert.match(app, /if \(trailerLocked\(\)\) return void needPro\('trailer'\);/, 'fragman Pro: kilitliyse Pro sayfası');
  assert.match(app, /allowed: \(\) => heroTrailerCan\(\) && proOk\('trailer'\)/);
  assert.match(app, /canUpgrade: \(\) => !document\.documentElement\.dataset\.lite/, 'hafif modda düşük kalite');
  assert.match(app, /kidActive\(\) \? '' : `<button class="hero-trb"/, 'çocuk modunda düğme yok');
  const css = kaynak('www/css/app.css');
  assert.match(css, /\.hero-trb \{ display: none; \}/);
  assert.match(css, /html\.tv\.hero-on \.hero-trb \{ display: inline-flex;/);
  assert.match(css, /#hero-tr \.ht-frame\.lo \{ width: 50%; height: 85%; transform-origin: 0 0; transform: scale\(2\); \}/, 'yarı boy kurulup 2× büyütülür: kapladığı alan tam boyla aynı');
});
