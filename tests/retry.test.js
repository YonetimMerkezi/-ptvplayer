import test from 'node:test';
import assert from 'node:assert/strict';
import { reconnectDelay, LIVE_STALL_MS, LIVE_MAX_RECONNECT, VOD_MAX_RECONNECT, STEADY_MS, retryPolicy, normalizeReconnect, normalizeStall, RECONNECT_MODES, STALL_LEVELS } from '../www/js/retry.js';

test('yeniden bağlanma gecikmesi: ilk deneme hemen, sonra kademeli ama en çok 2 sn', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10, 100].map(reconnectDelay), [0, 600, 1200, 1800, 2000, 2000, 2000]);
  assert.equal(reconnectDelay(-1), 0);
});

test('takılma eşiği kısa, deneme hakkı bol', () => {
  assert.ok(LIVE_STALL_MS <= 8000, 'canlı yayında takılma en çok 8 sn beklenir');
  assert.ok(LIVE_MAX_RECONNECT >= 30);
  assert.ok(STEADY_MS >= 5000);
});

test('yeniden bağlanma ayarı: varsayılan eskisiyle aynı; sürekli sınırsız; kapalı sıfır', () => {
  const d = retryPolicy();
  assert.deepEqual(d, { liveMax: LIVE_MAX_RECONNECT, vodMax: VOD_MAX_RECONNECT, liveStallMs: LIVE_STALL_MS, vodStallMs: 15000 });
  assert.equal(retryPolicy({ reconnect: 'endless' }).liveMax, Infinity);
  assert.equal(retryPolicy({ reconnect: 'off' }).liveMax, 0);
  assert.equal(retryPolicy({ reconnect: 'off' }).vodMax, 0);
  assert.equal(retryPolicy({ stall: 'fast' }).liveStallMs, 4000);
  assert.equal(retryPolicy({ stall: 'patient' }).liveStallMs, 12000);
});

test('bozuk ayar değeri varsayılana döner; seçenek listeleri tutarlı', () => {
  assert.equal(normalizeReconnect('xyz'), 'normal');
  assert.equal(normalizeStall(null), 'normal');
  assert.deepEqual(retryPolicy({ reconnect: 'saçma', stall: 'saçma' }), retryPolicy());
  assert.deepEqual(RECONNECT_MODES.map(([id]) => id), ['normal', 'endless', 'off']);
  assert.deepEqual(STALL_LEVELS.map(([id]) => id), ['fast', 'normal', 'patient']);
});
