import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyPrefs, normalizePrefs, arrange, toggleHidden, isHidden, move, resetOrderAndHidden, hiddenGroupNames, isLocked, toggleLocked, lockedGroupNames,
  addFolder, renameFolder, deleteFolder, toggleInFolder, inFolder, folderOf, folderKey, groupKey,
} from '../www/js/cats.js';

const rows = (...ids) => ids.map((id) => ({ id }));
const ids = (r) => r.map((x) => x.id);

test('kayıtlı sıra yoksa varsayılan sıra korunur; kayıtlılar önde, yeniler arkada', () => {
  const base = rows('a', 'b', 'c', 'd');
  assert.deepEqual(ids(arrange(base, emptyPrefs())), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids(arrange(base, { ...emptyPrefs(), order: ['c', 'a'] })), ['c', 'a', 'b', 'd']);
  // listede olmayan kimlikler yok sayılır
  assert.deepEqual(ids(arrange(base, { ...emptyPrefs(), order: ['zz', 'd'] })), ['d', 'a', 'b', 'c']);
});

test('taşıma: yukarı, aşağı, en üste; uçlarda değişmez; tam sırayı kaydeder', () => {
  const all = ['a', 'b', 'c', 'd'];
  const p0 = emptyPrefs();
  assert.deepEqual(move(p0, all, 'c', 'up').order, ['a', 'c', 'b', 'd']);
  assert.deepEqual(move(p0, all, 'b', 'down').order, ['a', 'c', 'b', 'd']);
  assert.deepEqual(move(p0, all, 'd', 'top').order, ['d', 'a', 'b', 'c']);
  assert.deepEqual(move(p0, all, 'a', 'up').order, all);
  assert.deepEqual(move(p0, all, 'd', 'down').order, all);
  assert.equal(move(p0, all, 'yok', 'up'), p0);
  // art arda taşıma, arrange ile tutarlı
  let p = move(p0, all, 'd', 'top');
  p = move(p, ids(arrange(rows(...all), p)), 'c', 'up');
  assert.deepEqual(ids(arrange(rows(...all), p)), ['d', 'a', 'c', 'b']);
});

test('gizleme aç/kapa ve gizli grup adları', () => {
  let p = emptyPrefs();
  p = toggleHidden(p, groupKey('Spor'));
  p = toggleHidden(p, folderKey('x1'));
  assert.ok(isHidden(p, 'g:Spor') && isHidden(p, 'f:x1'));
  assert.deepEqual([...hiddenGroupNames(p)], ['Spor']);
  p = toggleHidden(p, groupKey('Spor'));
  assert.ok(!isHidden(p, 'g:Spor'));
  assert.deepEqual(resetOrderAndHidden({ ...p, order: ['a'], folders: [{ id: '1', name: 'K', items: [] }] }), { order: [], hidden: [], locked: [], folders: [{ id: '1', name: 'K', items: [] }] });
});

test('klasör: oluştur, yeniden adlandır, öğe ekle/çıkar, sil', () => {
  let p = emptyPrefs();
  assert.equal(addFolder(p, '   ').folder, null, 'boş ad reddedilir');
  const r = addFolder(p, '  Çocuk   kanalları ', 'k1');
  p = r.prefs;
  assert.equal(r.folder.name, 'Çocuk kanalları');
  assert.deepEqual(p.order, [], 'sıra özelleştirilmemişse sıra boş kalır');
  let t = toggleInFolder(p, 'k1', 'ch9');
  assert.ok(t.on && inFolder(t.prefs, 'k1', 'ch9'));
  t = toggleInFolder(t.prefs, 'k1', 'ch9');
  assert.ok(!t.on && !inFolder(t.prefs, 'k1', 'ch9'));
  assert.equal(toggleInFolder(p, 'yok', 'x').on, false);
  p = renameFolder(t.prefs, 'k1', 'Çizgi film');
  assert.equal(folderOf(p, 'k1').name, 'Çizgi film');
  assert.equal(renameFolder(p, 'k1', '  '), p, 'boş ad yok sayılır');
  p = toggleHidden({ ...p, order: ['f:k1', 'g:A'] }, 'f:k1');
  p = deleteFolder(p, 'k1');
  assert.deepEqual(p, { order: ['g:A'], hidden: [], locked: [], folders: [] });
});

test('sıra özelleştirilmişse yeni klasör en üste konur', () => {
  const p = { ...emptyPrefs(), order: ['g:A', 'g:B'] };
  const { prefs } = addFolder(p, 'Yeni', 'n1');
  assert.deepEqual(prefs.order, ['f:n1', 'g:A', 'g:B']);
});

test('bozuk kayıt toparlanır', () => {
  assert.deepEqual(normalizePrefs(null), emptyPrefs());
  assert.deepEqual(normalizePrefs({ order: ['a', 3, 'a'], hidden: 'x', folders: [{ id: 'k', name: 'N', items: ['1', 1, '1'] }, { id: 'k', name: 'Çift' }, null, { id: 5 }] }), {
    order: ['a'], hidden: [], locked: [], folders: [{ id: 'k', name: 'N', items: ['1'] }],
  });
});

test('kilitli kategoriler: kilitle/aç, grup adları, klasör silinince temizlenir, sıfırlama kilidi açmaz', () => {
  let p = emptyPrefs();
  p = toggleLocked(p, 'g:Yetişkin');
  p = toggleLocked(p, 'f:1');
  assert.equal(isLocked(p, 'g:Yetişkin'), true);
  assert.deepEqual([...lockedGroupNames(p)], ['Yetişkin']);
  assert.equal(isLocked(resetOrderAndHidden({ ...p, order: ['g:A'] }), 'g:Yetişkin'), true, 'sırayı/gizlemeyi sıfırlamak kilidi kaldırmaz');
  p = toggleLocked(p, 'g:Yetişkin');
  assert.equal(isLocked(p, 'g:Yetişkin'), false);
  const q = normalizePrefs({ locked: ['g:A', 'g:A', 5, 'f:9'], folders: [{ id: '9', name: 'K', items: [] }] });
  assert.deepEqual(q.locked, ['g:A', 'f:9']);
});
