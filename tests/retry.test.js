import test from 'node:test';
import assert from 'node:assert/strict';
import { reconnectDelay, LIVE_STALL_MS, LIVE_MAX_RECONNECT, STEADY_MS } from '../www/js/retry.js';

test('yeniden bağlanma gecikmesi: ilk deneme hemen, sonra kademeli ama en çok 2 sn', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10, 100].map(reconnectDelay), [0, 600, 1200, 1800, 2000, 2000, 2000]);
  assert.equal(reconnectDelay(-1), 0);
});

test('takılma eşiği kısa, deneme hakkı bol', () => {
  assert.ok(LIVE_STALL_MS <= 8000, 'canlı yayında takılma en çok 8 sn beklenir');
  assert.ok(LIVE_MAX_RECONNECT >= 30);
  assert.ok(STEADY_MS >= 5000);
});
