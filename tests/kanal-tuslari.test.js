// Kumanda kanal tuşları: P+ sonraki, P− önceki kanalı açar (TV kumandalarında kanal numarası P+ ile artar). Android TV ve LG webOS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { actionOf } from '../webos/src/keys.js';

const oku = (yol) => readFileSync(new URL('../' + yol, import.meta.url), 'utf8');

test('webOS: kumanda P+ (427) ve PageUp (33) "chup", P− (428) ve PageDown (34) "chdown" olur', () => {
  assert.equal(actionOf(427), 'chup');
  assert.equal(actionOf(33), 'chup');
  assert.equal(actionOf(428), 'chdown');
  assert.equal(actionOf(34), 'chdown');
});

test('webOS oynatıcı: P+ sonraki, P− önceki kanal/bölüm; yön tuşları ayrı kalır (▼ sonraki, ▲ önceki)', () => {
  const k = oku('webos/src/screens/player.js');
  assert.match(k, /if \(a === 'chup' \|\| a === 'chdown'\) \{\s*if \(canli\(\) \|\| it\.kind === 'episode'\) kanal\(a === 'chup' \? 1 : -1\);/);
  assert.match(k, /if \(a === 'down'\) \{\s*if \(canli\(\)\) kanal\(1\);/);
  assert.match(k, /if \(a === 'up'\) \{\s*if \(canli\(\)\) kanal\(-1\);/);
});

test('Android oynatıcı: ChannelUp/PageUp canlıda sonraki, ChannelDown/PageDown önceki kanal; film/müzikte PageUp önceki parça kalır', () => {
  const k = oku('www/js/player-ui.js');
  assert.match(k, /else if \(k === 'ChannelDown' && live\) go\(-1\);\s*else if \(k === 'ChannelUp' && live\) go\(1\);/);
  assert.match(k, /else if \(live && \(k === 'PageUp' \|\| k === 'PageDown'\)\) go\(k === 'PageUp' \? 1 : -1\);\s*else if \(k === 'PageUp' \|\| k === 'MediaTrackPrevious'\) go\(-1\);\s*else if \(k === 'PageDown' \|\| k === 'MediaTrackNext'\) go\(1\);/);
});
