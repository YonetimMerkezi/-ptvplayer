import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, PLAYER_ACTIONS, HOME_ACTIONS, DEFAULT_PLAYER, DEFAULT_HOME, colorOf, normalizeKeys, actionFor } from '../www/js/remote.js';

test('renk adı ve tuş eşlemesi', () => {
  assert.equal(colorOf('ColorF0Red'), 'red');
  assert.equal(colorOf('ColorF1Green'), 'green');
  assert.equal(colorOf('ColorF2Yellow'), 'yellow');
  assert.equal(colorOf('ColorF3Blue'), 'blue');
  assert.equal(colorOf('Enter'), null);
  assert.deepEqual(COLORS.map((c) => c[0]), ['red', 'green', 'yellow', 'blue']);
});

test('varsayılanlar geçerli eylemlerdir; eski kırmızı=favori, mavi=en-boy korunur', () => {
  for (const c of COLORS) {
    assert.ok(PLAYER_ACTIONS.some((a) => a[0] === DEFAULT_PLAYER[c[0]]));
    assert.ok(HOME_ACTIONS.some((a) => a[0] === DEFAULT_HOME[c[0]]));
  }
  assert.equal(DEFAULT_PLAYER.red, 'fav');
  assert.equal(DEFAULT_PLAYER.blue, 'aspect');
});

test('eylem kimlikleri benzersiz, oynatıcı eylemleri bir düğmeye bağlı', () => {
  for (const list of [PLAYER_ACTIONS, HOME_ACTIONS]) assert.equal(new Set(list.map((a) => a[0])).size, list.length);
  for (const [id, , btn] of PLAYER_ACTIONS) if (id !== 'none') assert.match(btn, /^#pl-[a-z]+$/);
});

test('normalizeKeys: bozuk ve eksik değer varsayılana döner', () => {
  assert.deepEqual(normalizeKeys(undefined, PLAYER_ACTIONS, DEFAULT_PLAYER), DEFAULT_PLAYER);
  assert.deepEqual(normalizeKeys('x', HOME_ACTIONS, DEFAULT_HOME), DEFAULT_HOME);
  assert.deepEqual(normalizeKeys({ red: 'yok-böyle', green: 'night' }, PLAYER_ACTIONS, DEFAULT_PLAYER), { red: 'fav', green: 'night', yellow: 'sleep', blue: 'aspect' });
  assert.equal(normalizeKeys({ red: 'search' }, PLAYER_ACTIONS, DEFAULT_PLAYER).red, 'fav'); // listelerdeki eylem oynatıcıda geçersiz
  assert.equal(normalizeKeys({ blue: 'none' }, HOME_ACTIONS, DEFAULT_HOME).blue, 'none');
});

test('actionFor: atanmış eylem, Yok ve renk dışı tuş', () => {
  assert.equal(actionFor('ColorF0Red', {}, PLAYER_ACTIONS, DEFAULT_PLAYER), 'fav');
  assert.equal(actionFor('ColorF1Green', { green: 'stats' }, PLAYER_ACTIONS, DEFAULT_PLAYER), 'stats');
  assert.equal(actionFor('ColorF2Yellow', { yellow: 'none' }, PLAYER_ACTIONS, DEFAULT_PLAYER), null);
  assert.equal(actionFor('ArrowUp', {}, PLAYER_ACTIONS, DEFAULT_PLAYER), null);
  assert.equal(actionFor('ColorF3Blue', {}, HOME_ACTIONS, DEFAULT_HOME), 'sources');
});
