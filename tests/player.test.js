import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer } from '../www/js/player.js';
import { describeError, createNativeEngine } from '../www/js/engine.js';
import { retryPolicy } from '../www/js/retry.js';

function setup(policy) {
  const calls = [];
  const engine = {
    failLoad: null,
    load: async (t, ms) => {
      calls.push(['load', t.url, ms]);
      if (engine.failLoad) throw new Error(engine.failLoad);
    },
    pause: async () => calls.push(['pause']),
    resume: async () => calls.push(['resume']),
    seek: async (ms) => calls.push(['seek', ms]),
    stop: async () => calls.push(['stop']),
  };
  const timers = {
    fns: [],
    ms: [],
    set(f, ms) { this.fns.push(f); this.ms.push(ms); return this.fns.length; },
    clear(id) { this.fns[id - 1] = null; },
    fire() { const i = this.fns.map((f, k) => (f ? k : -1)).filter((k) => k >= 0).pop(); if (i !== undefined) { const f = this.fns[i]; this.fns[i] = null; f(); } },
    lastMs() { const i = this.fns.map((f, k) => (f ? k : -1)).filter((k) => k >= 0).pop(); return i === undefined ? null : this.ms[i]; },
  };
  let t = 0;
  const p = createPlayer({ engine, timers, now: () => t, ...(policy ? { policy } : {}) });
  return { p, engine, calls, timers, tick: (ms) => (t += ms) };
}
const live = { id: 'l1', kind: 'live', name: 'K' };
const movie = { id: 'm1', kind: 'movie', name: 'F' };
const T = (u, mime = 'auto') => ({ url: u, mime });

test('açılış: yükleniyor -> oynuyor', async () => {
  const { p, calls } = setup();
  await p.open(live, [T('a')]);
  assert.equal(p.state().status, 'loading');
  p.handle({ type: 'state', state: 'playing' });
  assert.equal(p.state().status, 'playing');
  assert.deepEqual(calls[0], ['load', 'a', 0]);
});

test('hata olunca sıradaki adres denenir, hepsi bitince hata durumu', async () => {
  const { p, calls } = setup();
  await p.open(live, [T('a', 'hls'), T('b', 'ts')]);
  p.handle({ type: 'error', message: 'x' });
  assert.equal(p.state().status, 'loading');
  assert.equal(calls.at(-1)[1], 'b');
  p.handle({ type: 'error', message: 'Sunucuya bağlanılamadı' });
  assert.equal(p.state().status, 'error');
  assert.equal(p.state().error, 'Sunucuya bağlanılamadı');
});

test('motor yüklemeyi reddederse de yedeğe geçer', async () => {
  const { p, engine } = setup();
  engine.failLoad = 'patladı';
  await p.open(live, [T('a'), T('b')]);
  assert.equal(p.state().status, 'error');
  assert.equal(p.state().error, 'patladı');
});

test('takılma bekçisi: yayın başlamazsa sonraki adrese geçer', async () => {
  const { p, timers, calls } = setup();
  await p.open(live, [T('a'), T('b')]);
  timers.fire();
  assert.equal(calls.at(-1)[1], 'b');
  p.handle({ type: 'state', state: 'playing' });
  timers.fire(); // temizlenmiş olmalı: etkisiz
  assert.equal(p.state().status, 'playing');
});

const loads = (calls) => calls.filter((c) => c[0] === 'load').length;

test('oynarken kopan canlı yayın hemen yeniden bağlanır ve vazgeçmez', async () => {
  const { p, calls, timers } = setup();
  await p.open(live, [T('a')]);
  p.handle({ type: 'state', state: 'playing' });
  p.handle({ type: 'error', message: 'x' });
  assert.equal(p.state().status, 'buffering');
  assert.equal(p.state().reconnect, 1);
  assert.equal(timers.lastMs(), 0, 'ilk deneme gecikmesiz');
  timers.fire();
  assert.equal(loads(calls), 2);
  for (let i = 0; i < 10; i++) {
    p.handle({ type: 'error', message: 'x' });
    timers.fire();
  }
  assert.equal(loads(calls), 12, 'art arda kopsa da sürekli yeniden dener');
  assert.notEqual(p.state().status, 'error');
  assert.ok(p.state().reconnect >= 10);
});

test('yeniden bağlanma süreleri kısa kalır (en çok 2 sn)', async () => {
  const { p, timers } = setup();
  await p.open(live, [T('a')]);
  p.handle({ type: 'state', state: 'playing' });
  const delays = [];
  for (let i = 0; i < 6; i++) {
    p.handle({ type: 'error', message: 'x' });
    delays.push(timers.lastMs());
    timers.fire();
  }
  assert.deepEqual(delays, [0, 600, 1200, 1800, 2000, 2000]);
});

test('art arda başarısız denemelerde yedek adrese de geçilir', async () => {
  const { p, calls, timers } = setup();
  await p.open(live, [T('a'), T('b')]);
  p.handle({ type: 'state', state: 'playing' });
  const urls = [];
  for (let i = 0; i < 5; i++) {
    p.handle({ type: 'error', message: 'x' });
    timers.fire();
    urls.push(calls.at(-1)[1]);
  }
  assert.deepEqual(urls, ['a', 'a', 'b', 'a', 'b']);
});

test('oynarken takılan (arabellekte kalan) canlı yayın 7 sn sonra yeniden bağlanır', async () => {
  const { p, calls, timers } = setup();
  await p.open(live, [T('a')]);
  p.handle({ type: 'state', state: 'playing' });
  p.handle({ type: 'state', state: 'buffering' });
  assert.equal(timers.lastMs(), 7000);
  timers.fire(); // bekçi doldu
  assert.equal(p.state().reconnect, 1);
  assert.equal(p.state().status, 'buffering');
  timers.fire(); // yeniden bağlanma
  assert.equal(loads(calls), 2);
  assert.equal(timers.lastMs(), 7000, 'yeniden bağlanırken de kısa bekçi kurulur');
});

test('yayın sekiz saniye kesintisiz oynarsa deneme sayacı sıfırlanır', async () => {
  const { p, timers, tick } = setup();
  await p.open(live, [T('a')]);
  p.handle({ type: 'state', state: 'playing' });
  for (let i = 0; i < 3; i++) {
    p.handle({ type: 'error', message: 'x' });
    timers.fire();
  }
  p.handle({ type: 'state', state: 'playing' });
  assert.equal(p.state().reconnect, 0, 'oynayınca ekrandaki sayaç kalkar');
  tick(8500);
  p.handle({ type: 'time', pos: 1, dur: -1 });
  p.handle({ type: 'error', message: 'x' });
  assert.equal(timers.lastMs(), 0, 'sayaç sıfırlandığı için yine hemen bağlanır');
  assert.equal(p.state().reconnect, 1);
});

test('bağlantı beklenirken gelen geçici durumlar planlı denemeyi bozmaz', async () => {
  const { p, calls, timers } = setup();
  await p.open(live, [T('a')]);
  p.handle({ type: 'state', state: 'playing' });
  p.handle({ type: 'error', message: 'x' });
  p.handle({ type: 'state', state: 'buffering' });
  p.handle({ type: 'error', message: 'y' });
  assert.equal(p.state().reconnect, 1);
  timers.fire();
  assert.equal(loads(calls), 2);
});

test('film: oynarken kopunca kaldığı yerden en çok 5 kez dener, sonra hata', async () => {
  const { p, calls, timers } = setup();
  await p.open(movie, [T('f.mkv')]);
  p.handle({ type: 'state', state: 'playing' });
  p.handle({ type: 'time', pos: 42000, dur: 600000 });
  for (let i = 0; i < 5; i++) {
    p.handle({ type: 'error', message: 'x' });
    assert.equal(p.state().status, 'buffering');
    timers.fire();
    assert.deepEqual(calls.at(-1), ['load', 'f.mkv', 42000]);
  }
  p.handle({ type: 'error', message: 'son' });
  assert.equal(p.state().status, 'error');
  assert.equal(p.state().error, 'son');
});

test('kapatınca bekleyen yeniden bağlanma iptal olur; elle "Yeniden dene" sayacı sıfırlar', async () => {
  const { p, calls, timers } = setup();
  await p.open(live, [T('a')]);
  p.handle({ type: 'state', state: 'playing' });
  p.handle({ type: 'error', message: 'x' });
  await p.close();
  timers.fire();
  assert.equal(loads(calls), 1);
  await p.open(live, [T('a')]);
  p.handle({ type: 'state', state: 'playing' });
  p.handle({ type: 'error', message: 'x' });
  await p.retry();
  assert.equal(p.state().reconnect, 0);
  timers.fire();
  assert.equal(loads(calls), 3, 'iptal edilen planlı deneme bir daha yüklemez');
});

test('film: kaldığı yerden başlar, ilerleme 10 sn\'de bir bildirilir, kapanışta son konum', async () => {
  const { p, calls, tick } = setup();
  const prog = [];
  p.onProgress((pos, dur) => prog.push([pos, dur]));
  await p.open(movie, [T('f.mkv')], { startAt: 90000 });
  assert.deepEqual(calls[0], ['load', 'f.mkv', 90000]);
  p.handle({ type: 'state', state: 'playing' });
  p.handle({ type: 'time', pos: 91000, dur: 600000 });
  assert.equal(prog.length, 0);
  tick(10000);
  p.handle({ type: 'time', pos: 101000, dur: 600000 });
  assert.deepEqual(prog, [[101000, 600000]]);
  p.handle({ type: 'time', pos: 105000, dur: 600000 });
  await p.close();
  assert.deepEqual(prog.at(-1), [105000, 600000]);
  assert.equal(p.state().status, 'idle');
  assert.equal(calls.at(-1)[0], 'stop');
});

test('duraklat/sürdür ve arama; canlıda arama yok', async () => {
  const { p, calls } = setup();
  await p.open(movie, [T('f')]);
  p.handle({ type: 'state', state: 'playing' });
  p.handle({ type: 'time', pos: 5000, dur: 100000 });
  await p.toggle();
  assert.equal(p.state().status, 'paused');
  await p.toggle();
  assert.deepEqual(calls.at(-1), ['resume']);
  await p.seekBy(-10000);
  assert.deepEqual(calls.at(-1), ['seek', 0]);
  await p.seek(999999);
  assert.deepEqual(calls.at(-1), ['seek', 100000]);
  const l = setup();
  await l.p.open(live, [T('a')]);
  l.p.handle({ type: 'time', pos: 1, dur: -1 });
  await l.p.seek(5000);
  assert.equal(l.calls.some((c) => c[0] === 'seek'), false);
});

test('adres yoksa anlamlı hata; kapandıktan sonra gelen olaylar yok sayılır', async () => {
  const { p } = setup();
  await p.open(live, []);
  assert.match(p.state().error, /adresi yok/);
  await p.open(live, [T('a')]);
  await p.close();
  p.handle({ type: 'error', message: 'geç geldi' });
  assert.equal(p.state().status, 'idle');
});

test('hata çevirisi ve yerel motor olay aktarımı', async () => {
  assert.match(describeError('ERROR_CODE_IO_NETWORK_CONNECTION_FAILED'), /bağlanılamadı/);
  assert.match(describeError('ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED'), /biçimi/);
  assert.match(describeError('ERROR_CODE_FOO'), /FOO/);
  const listeners = {};
  const sent = [];
  const plugin = {
    addListener: async (n, f) => ((listeners[n] = f), { remove() {} }),
    play: async (a) => sent.push(a),
  };
  const events = [];
  const eng = createNativeEngine(plugin, (e) => events.push(e));
  await new Promise((r) => setTimeout(r, 0));
  listeners.state({ state: 'playing', live: true });
  listeners.time({ pos: 5, dur: -1, buffered: 9 });
  listeners.error({ message: 'ERROR_CODE_TIMEOUT' });
  listeners.tracks({});
  assert.deepEqual(events.map((e) => e.type), ['state', 'time', 'error', 'tracks']);
  assert.match(events[2].message, /bağlanılamadı/);
  await eng.load({ url: 'u', mime: 'hls' }, 1234.9);
  assert.deepEqual(sent[0], { url: 'u', mime: 'hls', headers: {}, startMs: 1234, buffer: 'high', keepRecording: false, audioDelay: 0, night: 'off' }, 'varsayılan önbellek düzeyi, ses senkronu ve gece modu eklentiye iletilir');
  await eng.load({ url: 'u' }, 0, true);
  assert.equal(sent[1].keepRecording, true, 'yeniden bağlanmada süren kayıt korunur');
  const engN = createNativeEngine(plugin, () => {}, () => 'high', () => {}, () => 0, () => 'strong');
  await new Promise((r) => setTimeout(r, 0));
  await engN.load({ url: 'n' });
  assert.equal(sent[sent.length - 1].night, 'strong', 'kayıtlı gece modu düzeyi her açılışta iletilir');
  const rec = [];
  const eng2 = createNativeEngine(plugin, () => {}, () => 'high', (e) => rec.push(e));
  await new Promise((r) => setTimeout(r, 0));
  listeners.recording({ active: true, elapsedMs: 5 });
  assert.deepEqual(rec, [{ active: true, elapsedMs: 5 }], 'kayıt olayı ayrı geri çağırmaya gider');
  assert.ok(eng2.rec && typeof eng2.rec.start === 'function');
  // indirmeler: olay ayrı geri çağırmaya, işlemler eklenti yöntemlerine gider
  const dlEv = [];
  const calls = [];
  const plug2 = { ...plugin, dlStart: async (j) => calls.push(['start', j]), dlList: async () => ({ items: [] }), dlPause: async (a) => calls.push(['pause', a]), dlPauseAll: async () => calls.push(['pauseAll']), dlResume: async (a) => calls.push(['resume', a]), dlResumeAll: async (a) => calls.push(['resumeAll', a]), dlRemove: async (a) => calls.push(['remove', a]) };
  const eng3 = createNativeEngine(plug2, () => {}, () => 'high', () => {}, () => 0, () => 'off', (e) => dlEv.push(e));
  await new Promise((r) => setTimeout(r, 0));
  listeners.dlProgress({ id: 'd1', state: 'downloading', bytes: 5 });
  assert.deepEqual(dlEv, [{ id: 'd1', state: 'downloading', bytes: 5 }], 'indirme olayı onDl geri çağırmasına gider');
  await eng3.dl.start({ id: 'd1', url: 'u' });
  await eng3.dl.pause('d1');
  await eng3.dl.pauseAll();
  await eng3.dl.resume('d1');
  await eng3.dl.resumeAll();
  await eng3.dl.resumeAll(true);
  await eng3.dl.remove('d1');
  assert.deepEqual(calls, [['start', { id: 'd1', url: 'u' }], ['pause', { id: 'd1' }], ['pauseAll'], ['resume', { id: 'd1' }], ['resumeAll', { paused: false }], ['resumeAll', { paused: true }], ['remove', { id: 'd1' }]]);
});

test('yeniden bağlanma ve yedek adres denemesi süren kaydı korur, yeni açılış korumaz', async () => {
  const loads = [];
  const engine = { load: async (t, ms, keep) => loads.push([t.url, !!keep]), stop: async () => {}, pause: async () => {}, resume: async () => {}, seek: async () => {} };
  const timers = { set: () => 1, clear() {} };
  const p = createPlayer({ engine, timers });
  await p.open(live, [T('a'), T('b')]);
  assert.deepEqual(loads[0], ['a', false], 'ilk açılışta kayıt sürdürülmez');
  p.handle({ type: 'error', message: 'x' });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(loads[1], ['b', true], 'ilk adres açılmayınca yedeğe geçerken kayıt sürer');
  await p.open(live, [T('c')]);
  assert.deepEqual(loads[2], ['c', false], 'başka yayın açılınca kayıt biter');
});

test('parça listesi değişince arayüze haber verilir (sürüm artar, olay yayılır)', async () => {
  const { p } = setup();
  await p.open(live, [T('a')]);
  p.handle({ type: 'state', state: 'playing' });
  const seen = [];
  p.on((st) => seen.push(st.tracksVer));
  assert.equal(p.state().tracksVer, 0);
  p.handle({ type: 'tracks' });
  p.handle({ type: 'tracks' });
  assert.equal(p.state().tracksVer, 2);
  assert.deepEqual(seen, [1, 2]);
});

test('ayar: yeniden bağlanma kapalıysa oynarken kopunca hemen hata gösterilir', async () => {
  const { p, calls, timers } = setup(() => retryPolicy({ reconnect: 'off' }));
  await p.open(live, [T('a')]);
  p.handle({ type: 'state', state: 'playing' });
  p.handle({ type: 'error', message: 'Sunucuya bağlanılamadı' });
  assert.equal(p.state().status, 'error');
  assert.equal(p.state().error, 'Sunucuya bağlanılamadı');
  assert.equal(loads(calls), 1, 'yeniden bağlanılmadı');
  assert.equal(timers.lastMs(), null);
});

test('ayar: sürekli kipte 60 denemeden sonra da vazgeçilmez', async () => {
  const { p, timers } = setup(() => retryPolicy({ reconnect: 'endless' }));
  await p.open(live, [T('a')]);
  p.handle({ type: 'state', state: 'playing' });
  for (let i = 0; i < 90; i++) {
    p.handle({ type: 'error', message: 'x' });
    timers.fire();
  }
  p.handle({ type: 'error', message: 'x' });
  assert.notEqual(p.state().status, 'error');
});

test('ayar: takılma bekleme süresi bekçiye yansır (hızlı 4 sn)', async () => {
  const { p, timers } = setup(() => retryPolicy({ stall: 'fast' }));
  await p.open(live, [T('a')]);
  p.handle({ type: 'state', state: 'playing' });
  p.handle({ type: 'state', state: 'buffering' });
  assert.equal(timers.lastMs(), 4000);
});

test('ayar her denemede güncel okunur (oynarken değiştirilebilir)', async () => {
  let mode = 'normal';
  const { p, calls } = setup(() => retryPolicy({ reconnect: mode }));
  await p.open(live, [T('a')]);
  p.handle({ type: 'state', state: 'playing' });
  mode = 'off';
  p.handle({ type: 'error', message: 'x' });
  assert.equal(p.state().status, 'error');
  assert.equal(loads(calls), 1);
});

test('film ilk açılışta: tampon büyüyorsa bekçi yeniden kurulur, üst sınırda hata; süre okunduysa mesaj ayrışır', async () => {
  const { p, timers, tick } = setup();
  await p.open(movie, [T('a')]);
  assert.equal(timers.lastMs(), 25000);
  tick(20000);
  p.handle({ type: 'time', pos: 0, dur: 7169000, buffered: 5000 }); // veri geliyor
  assert.equal(timers.lastMs(), 25000, 'bekçi yeniden kuruldu');
  tick(20000);
  p.handle({ type: 'time', pos: 0, dur: 7169000, buffered: 5000 }); // tampon büyümedi: yeniden kurulmaz
  timers.fire();
  assert.equal(p.state().status, 'error');
  assert.match(p.state().error, /Film açıldı ama görüntü başlamadı/);
  // süre hiç okunamadıysa eski mesaj
  const b = setup();
  await b.p.open(movie, [T('a')]);
  b.timers.fire();
  assert.equal(b.p.state().error, 'Yayın başlamadı (zaman aşımı)');
  // üst sınır: 90 sn'den sonra tampon büyüse de bekçi uzatılmaz
  const c = setup();
  await c.p.open(movie, [T('a')]);
  c.tick(95000);
  const n = c.timers.fns.length;
  c.p.handle({ type: 'time', pos: 0, dur: 7169000, buffered: 9000 });
  assert.equal(c.timers.fns.length, n, 'üst sınır aşıldı: yeniden kurulmadı');
  // canlıda değişmez
  const d = setup();
  await d.p.open(live, [T('a')]);
  const m = d.timers.fns.length;
  d.p.handle({ type: 'time', pos: 0, dur: -1, buffered: 9000 });
  assert.equal(d.timers.fns.length, m);
});
