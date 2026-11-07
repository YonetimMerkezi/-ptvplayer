import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer } from '../www/js/player.js';
import { describeError, createNativeEngine } from '../www/js/engine.js';

function setup() {
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
  const timers = { fns: [], set(f) { this.fns.push(f); return this.fns.length; }, clear(id) { this.fns[id - 1] = null; }, fire() { const f = this.fns.filter(Boolean).pop(); if (f) f(); } };
  let t = 0;
  const p = createPlayer({ engine, timers, now: () => t });
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

test('oynarken kopan canlı yayın aynı adresle yeniden bağlanır (en çok 2 kez)', async () => {
  const { p, calls } = setup();
  await p.open(live, [T('a')]);
  p.handle({ type: 'state', state: 'playing' });
  p.handle({ type: 'error', message: 'x' });
  p.handle({ type: 'error', message: 'x' });
  assert.equal(calls.filter((c) => c[0] === 'load').length, 3);
  p.handle({ type: 'error', message: 'son' });
  assert.equal(p.state().status, 'error');
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
  assert.deepEqual(events.map((e) => e.type), ['state', 'time', 'error']);
  assert.match(events[2].message, /bağlanılamadı/);
  await eng.load({ url: 'u', mime: 'hls' }, 1234.9);
  assert.deepEqual(sent[0], { url: 'u', mime: 'hls', headers: {}, startMs: 1234 });
});
