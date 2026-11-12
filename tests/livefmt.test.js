import test from 'node:test';
import assert from 'node:assert/strict';
import { LIVE_FORMATS, normalizeLiveFmt, cleanFmtMap, rememberFmt, orderLive, preferFor, FMT_MAX } from '../www/js/livefmt.js';

const T = (mime, extra = {}) => ({ url: 'u.' + mime, mime, ...extra });

test('normalizeLiveFmt: bilinmeyen değer otomatik olur', () => {
  assert.deepEqual(LIVE_FORMATS.map((x) => x[0]), ['auto', 'hls', 'ts']);
  assert.equal(normalizeLiveFmt('ts'), 'ts');
  assert.equal(normalizeLiveFmt('x'), 'auto');
  assert.equal(normalizeLiveFmt(undefined), 'auto');
});

test('cleanFmtMap: yalnız hls/ts değerleri kalır, bozuk veri boş harita olur', () => {
  assert.deepEqual(cleanFmtMap({ a: 'ts', b: 'mp4', c: 'hls', '': 'ts' }), { a: 'ts', c: 'hls' });
  for (const bad of [null, undefined, 5, 'x', [], [1]]) assert.deepEqual(cleanFmtMap(bad), {});
});

test('rememberFmt: ekler, aynıysa aynı nesneyi döndürür, değişeni sona taşır, sınırı korur', () => {
  let m = rememberFmt({}, 'k1', 'ts');
  assert.deepEqual(m, { k1: 'ts' });
  assert.equal(rememberFmt(m, 'k1', 'ts'), m);
  m = rememberFmt(rememberFmt(m, 'k2', 'hls'), 'k1', 'hls');
  assert.deepEqual(Object.keys(m), ['k2', 'k1']);
  assert.equal(rememberFmt(m, '', 'ts'), m);
  assert.equal(rememberFmt(m, 'k3', 'dash'), m);
  let big = {};
  for (let i = 0; i < FMT_MAX + 25; i++) big = rememberFmt(big, 'c' + i, i % 2 ? 'ts' : 'hls');
  const keys = Object.keys(big);
  assert.equal(keys.length, FMT_MAX);
  assert.equal(keys[0], 'c25');
  assert.equal(keys.at(-1), 'c' + (FMT_MAX + 24));
});

test('orderLive: istenen biçimli ilk hedef başa gelir, yedek kanallara dokunulmaz', () => {
  const list = [T('hls'), T('ts'), T('hls', { alt: 'Yedek' })];
  assert.deepEqual(orderLive(list, 'ts').map((t) => t.mime + (t.alt ? '*' : '')), ['ts', 'hls', 'hls*']);
  assert.equal(orderLive(list, 'hls'), list); // zaten başta
  assert.equal(orderLive(list, ''), list);
  assert.equal(orderLive(list, 'dash'), list);
  const onlyAlt = [T('hls'), T('ts', { alt: 'Y' })];
  assert.equal(orderLive(onlyAlt, 'ts'), onlyAlt); // yedek kanalın biçimi başa alınmaz
});

test('preferFor: hatırlanan biçim ayarın önüne geçer; otomatikte hatırlanan yoksa tercih yok', () => {
  assert.equal(preferFor('auto', {}, 'k'), '');
  assert.equal(preferFor('ts', {}, 'k'), 'ts');
  assert.equal(preferFor('ts', { k: 'hls' }, 'k'), 'hls');
  assert.equal(preferFor('auto', { k: 'ts' }, 'k'), 'ts');
});
