import test from 'node:test';
import assert from 'node:assert/strict';
import { channelNumber, resolveChannel, createChannelNumber, NUM_MAX_DIGITS } from '../www/js/chnum.js';

const fakeTimers = () => {
  const q = [];
  return {
    set: (f, ms) => (q.push({ f, ms }), q.length),
    clear: (t) => {
      if (q[t - 1]) q[t - 1].f = null;
    },
    fire: () => q.filter((x) => x.f).forEach((x) => { const f = x.f; x.f = null; f(); }),
  };
};

test('kanal numarası: açık numara yoksa listedeki sıra', () => {
  assert.equal(channelNumber({ num: 0 }, 4), 5);
  assert.equal(channelNumber({ num: 120 }, 4), 120);
  assert.equal(channelNumber({}, 0), 1);
});

test('numaradan kanal bulma: açık numara öncelikli, yoksa sıra', () => {
  const items = [{ name: 'a' }, { name: 'b' }, { name: 'c', num: 7 }];
  assert.equal(resolveChannel(items, 1), 0);
  assert.equal(resolveChannel(items, 2), 1);
  assert.equal(resolveChannel(items, 7), 2);
  assert.equal(resolveChannel(items, 3), -1, '3. sıradaki kanalın kendi numarası var (7)');
  assert.equal(resolveChannel(items, 9), -1);
  assert.equal(resolveChannel(items, 0), -1);
  assert.equal(resolveChannel([], 1), -1);
});

test('rakam girişi: birikir, bekleme sonunda onaylanır', () => {
  const t = fakeTimers();
  const log = [];
  const c = createChannelNumber({ timers: t, onChange: (b) => log.push('c' + b), onCommit: (n) => log.push('n' + n), onLast: () => log.push('last') });
  c.digit('1');
  c.digit('2');
  assert.equal(c.active(), true);
  t.fire();
  assert.deepEqual(log, ['c1', 'c12', 'n12']);
  assert.equal(c.active(), false);
});

test('rakam girişi: Tamam hemen onaylar; boşken 0 son kanal; en fazla 4 hane', () => {
  const t = fakeTimers();
  const log = [];
  const c = createChannelNumber({ timers: t, onChange: (b) => log.push('c' + b), onCommit: (n) => log.push('n' + n), onLast: () => log.push('last') });
  c.digit('0');
  assert.deepEqual(log, ['last']);
  c.digit('5');
  c.digit('0'); // arabellek doluyken 0 rakamdır
  assert.equal(c.commit(), true);
  assert.equal(c.commit(), false);
  assert.deepEqual(log.slice(1), ['c5', 'c50', 'n50']);
  for (const d of '12345') c.digit(d);
  assert.equal(c.value().length, 1, `${NUM_MAX_DIGITS} haneden sonra yeni numara başlar`);
  c.cancel();
  assert.equal(c.active(), false);
});
