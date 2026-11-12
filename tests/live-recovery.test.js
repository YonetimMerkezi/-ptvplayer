import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer } from '../www/js/player.js';
import { createNativeEngine } from '../www/js/engine.js';
import { playTargets } from '../www/js/catalog.js';

function setup(extra = {}) {
  const calls = [];
  const engine = { load: async (t, ms, keep, opts) => { calls.push({ url: t.url, ms, keep, opts }); }, pause: async () => {}, resume: async () => {}, seek: async () => {}, stop: async () => {} };
  const timers = {
    fns: [],
    set(f) { this.fns.push(f); return this.fns.length; },
    clear(id) { this.fns[id - 1] = null; },
    fire() { const i = this.fns.map((f, k) => (f ? k : -1)).filter((k) => k >= 0).pop(); if (i !== undefined) { const f = this.fns[i]; this.fns[i] = null; f(); } },
  };
  let t = 0;
  const p = createPlayer({ engine, timers, now: () => t, ...extra });
  return { p, calls, timers, tick: (ms) => (t += ms) };
}
const live = { id: 'l1', kind: 'live', name: 'K' };
const T = (u, mime = 'auto', extra = {}) => ({ url: u, mime, live: true, ...extra });
const flush = () => new Promise((r) => setImmediate(r));

test('görüntü donması: önce aynı adrese yeniden bağlanır, ikinci donmada yedek adrese geçer', async () => {
  const { p, calls, timers } = setup();
  await p.open(live, [T('hls', 'hls'), T('ts', 'ts')]);
  p.handle({ type: 'state', state: 'playing', live: true });
  p.handle({ type: 'error', message: 'Görüntü donuyor', frozen: true });
  assert.equal(p.state().status, 'buffering');
  timers.fire();
  await flush();
  assert.equal(calls.at(-1).url, 'hls', 'ilk donmada aynı adres');
  assert.equal(calls.at(-1).keep, true);
  p.handle({ type: 'state', state: 'playing', live: true });
  p.handle({ type: 'error', message: 'Görüntü donuyor', frozen: true });
  timers.fire();
  await flush();
  assert.equal(calls.at(-1).url, 'ts', 'ikinci donmada beklemeden öteki biçim');
});

test('donma sayacı kesintisiz oynayınca sıfırlanır (seyrek donmalar adres değiştirmez)', async () => {
  const { p, calls, timers, tick } = setup();
  await p.open(live, [T('hls', 'hls'), T('ts', 'ts')]);
  p.handle({ type: 'state', state: 'playing', live: true });
  p.handle({ type: 'error', message: 'x', frozen: true });
  timers.fire();
  await flush();
  p.handle({ type: 'state', state: 'playing', live: true });
  tick(30000);
  p.handle({ type: 'time', pos: 1, dur: -1, buffered: 1 });
  p.handle({ type: 'error', message: 'x', frozen: true });
  timers.fire();
  await flush();
  assert.equal(calls.at(-1).url, 'hls');
});

test('retryCompat: aynı adres uyumlu modda yeniden açılır; sonraki açılış normal', async () => {
  const { p, calls } = setup();
  await p.open(live, [T('hls', 'hls'), T('ts', 'ts')]);
  p.handle({ type: 'state', state: 'playing', live: true });
  await p.retryCompat();
  assert.deepEqual([calls.at(-1).url, calls.at(-1).ms, calls.at(-1).keep, calls.at(-1).opts], ['hls', 0, true, { compat: true }]);
  await p.open(live, [T('hls', 'hls')]);
  assert.equal(calls.at(-1).opts, undefined);
  await p.close();
  assert.equal(p.retryCompat(), undefined, 'kapalıyken bir şey yapmaz');
});

test('onSteady: yalnız ilk adres dışındaki adres 20 sn kesintisiz oynarsa, bir kez çağrılır', async () => {
  const seen = [];
  const { p, timers, tick } = setup({ onSteady: (t, i) => seen.push([t.url, i]) });
  await p.open(live, [T('hls', 'hls'), T('ts', 'ts')]);
  p.handle({ type: 'state', state: 'playing', live: true });
  tick(25000);
  p.handle({ type: 'time', pos: 1, dur: -1, buffered: 1 });
  assert.deepEqual(seen, [], 'ilk adres sorunsuz: hatırlanacak bir şey yok');
  p.handle({ type: 'error', message: 'x' }); // oynarken koptu
  timers.fire();
  p.handle({ type: 'error', message: 'x' });
  timers.fire();
  p.handle({ type: 'error', message: 'x' }); // üçüncü: yedek adrese geçer
  timers.fire();
  p.handle({ type: 'state', state: 'playing', live: true });
  tick(10000);
  p.handle({ type: 'time', pos: 1, dur: -1, buffered: 1 });
  assert.deepEqual(seen, [], '20 sn dolmadı');
  tick(11000);
  p.handle({ type: 'time', pos: 2, dur: -1, buffered: 2 });
  p.handle({ type: 'time', pos: 3, dur: -1, buffered: 3 });
  assert.deepEqual(seen, [['ts', 1]]);
});

test('yerel motor: VIDEO_FROZEN olayı frozen bayrağıyla gelir; load canlı ve uyumlu bayrağını iletir', async () => {
  const handlers = {};
  const sent = [];
  const plugin = {
    addListener: async (n, f) => { handlers[n] = f; return { remove() {} }; },
    play: async (o) => { sent.push(o); },
  };
  const events = [];
  const eng = createNativeEngine(plugin, (e) => events.push(e));
  await flush();
  handlers.error({ message: 'VIDEO_FROZEN', code: -2 });
  handlers.error({ message: 'ERROR_CODE_IO_NETWORK_CONNECTION_FAILED' });
  assert.equal(events[0].frozen, true);
  assert.match(events[0].message, /Görüntü donuyor/);
  assert.equal(events[1].frozen, false);
  await eng.load({ url: 'x', mime: 'ts', live: true }, 0, true, { compat: true });
  await eng.load({ url: 'y', mime: 'auto' }, 0);
  assert.deepEqual([sent[0].live, sent[0].compat, sent[1].live, sent[1].compat], [true, true, false, false]);
});

test('canlı hedeflere live bayrağı konur, film/dizi hedeflerine konmaz', () => {
  const xs = { type: 'xtream', id: 's', server: 'http://h', user: 'u', pass: 'p' };
  const liveT = playTargets(xs, { kind: 'live', id: 'a', streamId: 7 });
  assert.deepEqual(liveT.map((t) => [t.mime, t.live]), [['hls', true], ['ts', true]]);
  const movieT = playTargets(xs, { kind: 'movie', id: 'm', streamId: 9, ext: 'mkv' });
  assert.equal(movieT[0].live, undefined);
  const m3u = { type: 'm3u', id: 'm' };
  const t = playTargets(m3u, { kind: 'live', id: 'c', url: 'http://h/ch.ts' });
  assert.equal(t[0].live, true);
});
