import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANGELOG, LATEST_ID, unseenEntries, latestNotes } from '../www/js/changelog.js';

test('kayıtlar: id\'ler azalan, benzersiz; her kaydın başlığı ve maddesi var', () => {
  const ids = CHANGELOG.map((e) => e.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(LATEST_ID, ids[0]);
  for (const e of CHANGELOG) assert.ok(e.title && e.items.length > 0 && e.items.every((x) => x.length > 5));
});

test('görülmemişler: temiz kurulumda yok, kurulu kullanıcıda hepsi, sonra yalnız yeniler', () => {
  assert.equal(unseenEntries(null, false).length, 0);
  assert.equal(unseenEntries(null, true).length, CHANGELOG.length);
  assert.deepEqual(unseenEntries(LATEST_ID - 2, true).map((e) => e.id), [LATEST_ID, LATEST_ID - 1]);
  assert.equal(unseenEntries(LATEST_ID, true).length, 0);
});

test('güncelleme notu: en yeni kaydın maddeleri, 500 karakterin altında', () => {
  const n = latestNotes();
  assert.ok(n.startsWith('• ') && n.length <= 480);
  assert.equal(latestNotes([]), '');
});
