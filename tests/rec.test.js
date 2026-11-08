import test from 'node:test';
import assert from 'node:assert/strict';
import { REC_LIMITS, fmtBytes, fmtElapsed, recItem, recEndMessage, recSub } from '../www/js/rec.js';

test('boyut biçimi', () => {
  assert.equal(fmtBytes(0), '1 KB');
  assert.equal(fmtBytes(512 * 1024), '512 KB');
  assert.equal(fmtBytes(35 * 1024 * 1024), '35 MB');
  assert.equal(fmtBytes(1.5 * 1024 * 1024 * 1024), '1,5 GB');
  assert.equal(fmtBytes(-1), '');
  assert.equal(fmtBytes(NaN), '');
});

test('geçen süre', () => {
  assert.equal(fmtElapsed(754000), '12:34');
  assert.equal(fmtElapsed(3723000), '1:02:03');
  assert.equal(fmtElapsed(-5), '0:00');
});

test('süre seçenekleri: ilki sınırsız', () => {
  assert.equal(REC_LIMITS[0][0], 0);
  assert.ok(REC_LIMITS.every(([m, l]) => Number.isInteger(m) && l));
});

test('kayıt öğesi oynatıcıya uygun', () => {
  const it = recItem({ id: 'a.ts', name: 'TRT 1', url: 'file:///x/a.ts' });
  assert.equal(it.kind, 'recording');
  assert.equal(it.url, 'file:///x/a.ts');
  assert.equal(it.id, 'rec:a.ts');
  assert.equal(recItem({ id: 'b.ts', url: 'u' }).name, 'Kayıt');
});

test('bitiş iletileri nedene göre', () => {
  assert.match(recEndMessage({ reason: 'disk' }), /Depolama doldu/);
  assert.match(recEndMessage({ reason: 'limit' }), /süresi doldu/);
  assert.match(recEndMessage({ reason: 'error' }), /yazılamadı/);
  assert.equal(recEndMessage({}), 'Kayıt kaydedildi');
});

test('liste alt yazısı', () => {
  const t = new Date(2026, 10, 8, 18, 5).getTime();
  assert.equal(recSub({ startedAt: t, durationMs: 90000, size: 20 * 1024 * 1024 }), '08.11.2026 18:05 · 1:30 · 20 MB');
  assert.match(recSub({ startedAt: t, active: true, size: 1024 }), /kaydediliyor/);
  assert.equal(recSub({ startedAt: t, durationMs: -1, size: 2048 }), '08.11.2026 18:05 · 2 KB');
});
