import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchNextItems, deepLink, parseDeepLink, watchNextPayload, WATCH_NEXT_LIMIT } from '../www/js/tvhome.js';

const P = (id, o = {}) => ({ id, kind: 'movie', name: 'Film ' + id, logo: 'http://x/' + id + '.jpg', pos: 600000, dur: 6000000, at: 1000, ...o });

test('watchNextItems: yarım kalanlar, en yeni üstte', () => {
  const r = watchNextItems([P('a', { at: 1 }), P('b', { at: 3 }), P('c', { at: 2 })]);
  assert.deepEqual(r.map((x) => x.id), ['b', 'c', 'a']);
  assert.equal(r[0].kind, 'movie');
  assert.equal(r[0].title, 'Film b');
  assert.equal(r[0].poster, 'http://x/b.jpg');
});

test('watchNextItems: bitmiş, çok kısa ve süresiz ilerleme elenir', () => {
  const r = watchNextItems([P('bitti', { pos: 5900000 }), P('kisa', { pos: 5000 }), P('suresiz', { dur: 0 }), P('ok')]);
  assert.deepEqual(r.map((x) => x.id), ['ok']);
});

test('watchNextItems: dizide yalnız en son bölüm', () => {
  const e = (id, parent, at) => ({ id, kind: 'episode', name: 'Dizi · ' + id, parent, pos: 100000, dur: 2400000, at, logo: '' });
  const r = watchNextItems([e('e1', 's1', 10), e('e2', 's1', 20), e('x1', 's2', 15), P('m', { at: 5 })]);
  assert.deepEqual(r.map((x) => x.id), ['e2', 'x1', 'm']);
  assert.equal(r[0].kind, 'episode');
  assert.equal(r[0].parent, 's1');
});

test('watchNextItems: sınır ve boş girdi', () => {
  const many = Array.from({ length: 20 }, (_, i) => P('m' + i, { at: i }));
  assert.equal(watchNextItems(many).length, WATCH_NEXT_LIMIT);
  assert.equal(watchNextItems(many, { limit: 3 }).length, 3);
  assert.deepEqual(watchNextItems(undefined), []);
  assert.deepEqual(watchNextItems([null, {}]), []);
});

test('deepLink ↔ parseDeepLink gidiş dönüş', () => {
  const u = deepLink({ src: 'abc', kind: 'episode', id: '12', parent: '3', pos: 123456.7 });
  assert.match(u, /^iptvpro:\/\/play\?/);
  assert.deepEqual(parseDeepLink(u), { src: 'abc', kind: 'episode', id: '12', parent: '3', pos: 123457 });
  assert.deepEqual(parseDeepLink(deepLink({ kind: 'movie', id: 'x y/z' })), { src: '', kind: 'movie', id: 'x y/z', parent: '', pos: 0 });
  assert.deepEqual(parseDeepLink(deepLink({ kind: 'live', id: '7', src: 's' })), { src: 's', kind: 'live', id: '7', parent: '', pos: 0 });
});

test('parseDeepLink: yabancı ve bozuk bağlantılar reddedilir', () => {
  for (const u of [null, undefined, '', 'http://x', 'iptvpro://play', 'iptvpro://play?kind=movie', 'iptvpro://play?id=1', 'iptvpro://play?kind=hack&id=1', 'iptvpro://other?kind=movie&id=1']) assert.equal(parseDeepLink(u), null, String(u));
});

test('watchNextPayload: her satıra derin bağlantı eklenir', () => {
  const items = watchNextItems([P('a'), { id: 'e1', kind: 'episode', name: 'D · E1', parent: 's1', pos: 90000, dur: 1800000, at: 5 }]);
  const r = watchNextPayload(items, 'SRC');
  assert.equal(r.length, 2);
  for (const it of r) {
    const d = parseDeepLink(it.uri);
    assert.equal(d.src, 'SRC');
    assert.equal(d.id, it.id);
    assert.equal(d.kind, it.kind);
  }
  assert.equal(parseDeepLink(r.find((x) => x.kind === 'episode').uri).parent, 's1');
});
