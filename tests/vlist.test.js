import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleRows } from '../www/js/vlist.js';

test('liste penceresi', () => {
  const v = visibleRows({ scrollTop: 0, viewH: 500, rowH: 50, count: 100000, overscan: 2 });
  assert.equal(v.first, 0);
  assert.equal(v.last, 12);
  assert.equal(v.total, 5000000);
  const m = visibleRows({ scrollTop: 10000, viewH: 500, rowH: 50, count: 100000, overscan: 2 });
  assert.equal(m.first, 198);
  assert.equal(m.last, 212);
});

test('ızgara satır sayısı ve sonda taşma yok', () => {
  const v = visibleRows({ scrollTop: 0, viewH: 400, rowH: 200, count: 7, cols: 3, overscan: 1 });
  assert.equal(v.rows, 3);
  assert.equal(v.last, 2);
  assert.equal(v.total, 600);
  const e = visibleRows({ scrollTop: 0, viewH: 400, rowH: 50, count: 0 });
  assert.equal(e.total, 0);
  assert.ok(e.last < e.first || e.rows === 0);
});
