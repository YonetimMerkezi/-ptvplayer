import test from 'node:test';
import assert from 'node:assert/strict';
import { createSleepTimer, fmtRemaining, SLEEP_OPTIONS } from '../www/js/sleep.js';

function env() {
  let t = 0;
  const q = [];
  const timers = {
    set: (f, ms) => (q.push({ f, at: t + ms }), q.length),
    clear: (id) => {
      if (q[id - 1]) q[id - 1].f = null;
    },
  };
  const advance = (ms) => {
    t += ms;
    for (const x of q.filter((y) => y.f && y.at <= t).sort((a, b) => a.at - b.at)) {
      const f = x.f;
      x.f = null;
      f();
    }
  };
  return { timers, now: () => t, advance };
}

test('süre dolunca kapanır, 30 sn önce uyarır', () => {
  const e = env();
  const log = [];
  const s = createSleepTimer({ timers: e.timers, now: e.now, onWarn: () => log.push('warn'), onFire: () => log.push('fire') });
  s.set(15);
  assert.equal(s.active(), true);
  assert.equal(s.minutes(), 15);
  e.advance(15 * 60000 - 31000);
  assert.deepEqual(log, []);
  assert.equal(fmtRemaining(s.remaining()), '31 sn');
  e.advance(1000);
  assert.deepEqual(log, ['warn']);
  e.advance(30000);
  assert.deepEqual(log, ['warn', 'fire']);
  assert.equal(s.active(), false);
});

test('yeniden kurmak eskisini iptal eder; 0 ve cancel kapatır', () => {
  const e = env();
  const log = [];
  const s = createSleepTimer({ timers: e.timers, now: e.now, onWarn: () => log.push('warn'), onFire: () => log.push('fire') });
  s.set(15);
  s.set(30);
  e.advance(16 * 60000);
  assert.deepEqual(log.filter((x) => x === 'fire'), []);
  s.set(0);
  assert.equal(s.active(), false);
  e.advance(60 * 60000);
  assert.deepEqual(log, []);
  s.set(15);
  s.cancel();
  e.advance(60 * 60000);
  assert.deepEqual(log, []);
});

test('biçim ve seçenekler', () => {
  assert.equal(fmtRemaining(45000), '45 sn');
  assert.equal(fmtRemaining(61000), '2 dk');
  assert.equal(SLEEP_OPTIONS[0][0], 0);
  assert.ok(SLEEP_OPTIONS.every(([m, l]) => Number.isInteger(m) && l));
});
