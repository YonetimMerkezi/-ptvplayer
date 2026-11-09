import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_TOOLS, normalizeLabels } from '../www/js/ptools.js';

test('düğme listesi: kimlikler tekrarsız ve index.html ile uyumlu', async () => {
  const ids = PLAYER_TOOLS.map(([id]) => id);
  assert.equal(new Set(ids).size, ids.length);
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
  for (const id of ids) assert.match(html, new RegExp(`id="pl-${id}"[^>]*class="tool"|class="tool"[^>]*id="pl-${id}"`), `#pl-${id} oynatıcıda yok`);
});

test('normalizeLabels: bilinmeyenleri ve bozuk veriyi atar, sırayı korur', () => {
  assert.deepEqual(normalizeLabels(['sleep', 'audio', 'x', 5, 'audio']), ['audio', 'sleep']);
  assert.deepEqual(normalizeLabels(null), []);
  assert.deepEqual(normalizeLabels('audio'), []);
  assert.deepEqual(normalizeLabels([]), []);
});
