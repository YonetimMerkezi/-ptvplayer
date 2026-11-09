import test from 'node:test';
import assert from 'node:assert/strict';
import { recordResult, lastResult, pruneHist, hideChannels, restoreChannels, applyHidden, hiddenCount, HIST_TTL } from '../www/js/hhist.js';

const T = 1_700_000_000_000;

test('sonuç geçmişe yazılır ve okunur; çalışmıyor / doğrulanamadı ayrı tutulur', () => {
  let h = recordResult({}, 'x1', { ok: true, ms: 120.4 }, T);
  h = recordResult(h, 'x2', { ok: false }, T + 1);
  h = recordResult(h, 'x3', { ok: null, ms: null }, T + 2);
  assert.deepEqual(lastResult(h, 'x1', T + 10), { ok: true, ms: 120, at: T, hist: true });
  assert.equal(lastResult(h, 'x2', T + 10).ok, false);
  assert.equal(lastResult(h, 'x2', T + 10).ms, null);
  assert.equal(lastResult(h, 'x3', T + 10).ok, null);
  assert.equal(lastResult(h, 'yok', T), null);
  assert.equal(lastResult(null, 'x1'), null);
});

test('yeni sonuç eskisini değiştirir; özgün nesne bozulmaz', () => {
  const a = recordResult({}, 'x1', { ok: false }, T);
  const b = recordResult(a, 'x1', { ok: true, ms: 50 }, T + 5);
  assert.equal(lastResult(a, 'x1', T + 6).ok, false);
  assert.equal(lastResult(b, 'x1', T + 6).ok, true);
});

test('süresi dolan kayıt görünmez ve temizlenir', () => {
  const h = recordResult({}, 'x1', { ok: true, ms: 10 }, T);
  assert.equal(lastResult(h, 'x1', T + HIST_TTL + 1), null);
  assert.deepEqual(Object.keys(pruneHist(h, T + HIST_TTL + 1)), []);
  assert.deepEqual(Object.keys(pruneHist(h, T + 1000)), ['x1']);
});

test('geçmiş sınırı aşılınca en eski kayıtlar atılır', () => {
  let h = {};
  for (let i = 0; i < 12; i++) h = recordResult(h, 'k' + i, { ok: true, ms: 1 }, T + i, 10);
  assert.equal(Object.keys(h).length, 10);
  assert.ok(!('k0' in h) && !('k1' in h) && 'k11' in h);
});

test('gizleme ve geri getirme: tek tek ve hepsi', () => {
  let m = hideChannels({}, [{ id: 'x1', name: 'A' }, { id: 'x2', name: 'B' }]);
  m = hideChannels(m, [{ id: 'x3', name: 'C' }]);
  assert.equal(hiddenCount(m), 3);
  const back = restoreChannels(m, ['x2']);
  assert.deepEqual(Object.keys(back), ['x1', 'x3']);
  assert.deepEqual(restoreChannels(m), {});
  assert.equal(hiddenCount(null), 0);
});

test('gizlenen kanallar listeden çıkar; boş haritada liste aynen döner', () => {
  const list = [{ id: 'x1' }, { id: 'x2' }, { id: 'x3' }];
  assert.deepEqual(applyHidden(list, { x2: 'B' }).map((i) => i.id), ['x1', 'x3']);
  assert.equal(applyHidden(list, {}), list, 'boşsa aynı dizi (kopya yok)');
  assert.equal(applyHidden(list, null), list);
});
