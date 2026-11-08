import test from 'node:test';
import assert from 'node:assert/strict';
import { sortItems, isSortMode, SORTS } from '../www/js/sort.js';

const names = (l) => l.map((x) => x.name);

test('varsayılan sıra listeyi olduğu gibi bırakır', () => {
  const l = [{ name: 'b' }, { name: 'a' }];
  assert.equal(sortItems(l, 'default'), l);
  assert.equal(sortItems(l, undefined), l);
  assert.equal(sortItems(l, 'bilinmeyen'), l);
});

test('A→Z ve Z→A Türkçe alfabeye ve sayılara (1, 2, 10) uyar; özgün listeyi bozmaz', () => {
  const l = [{ name: 'Işık' }, { name: 'Zeytin' }, { name: 'İpek' }, { name: 'Çay' }, { name: 'Ağaç' }, { name: 'Bölüm 10' }, { name: 'Bölüm 2' }];
  const copy = names(l);
  assert.deepEqual(names(sortItems(l, 'az')), ['Ağaç', 'Bölüm 2', 'Bölüm 10', 'Çay', 'Işık', 'İpek', 'Zeytin']);
  assert.deepEqual(names(sortItems(l, 'za')), ['Zeytin', 'İpek', 'Işık', 'Çay', 'Bölüm 10', 'Bölüm 2', 'Ağaç']);
  assert.deepEqual(names(l), copy);
});

test('büyük/küçük harf ve aksan farkı sırayı değiştirmez, eşitler kararlı kalır', () => {
  const l = [{ name: 'beta', n: 1 }, { name: 'Beta', n: 2 }, { name: 'alfa', n: 3 }];
  assert.deepEqual(sortItems(l, 'az').map((x) => x.n), [3, 1, 2]);
});

test('eklenme zamanı: yeni→eski ve eski→yeni; zamanı olmayanlar en eski sayılır', () => {
  const l = [{ name: 'a', added: 200 }, { name: 'b', added: 300 }, { name: 'c' }, { name: 'd', added: 100 }];
  assert.deepEqual(names(sortItems(l, 'new')), ['b', 'a', 'd', 'c']);
  assert.deepEqual(names(sortItems(l, 'old')), ['c', 'd', 'a', 'b']);
});

test('M3U (eklenme zamanı yok): liste sırası zaman yerine geçer', () => {
  const l = [{ name: 'ilk' }, { name: 'orta' }, { name: 'son' }];
  assert.deepEqual(names(sortItems(l, 'new')), ['son', 'orta', 'ilk']);
  assert.deepEqual(names(sortItems(l, 'old')), ['ilk', 'orta', 'son']);
});

test('sıralama kipleri', () => {
  assert.ok(SORTS.every(([k]) => isSortMode(k)) && !isSortMode('x'));
});

test('puan: yüksekten düşüğe; puanı olmayanlar sona, eşitler listedeki sırada', () => {
  const l = [{ name: 'a', rating: 3.5 }, { name: 'b' }, { name: 'c', rating: '4.8' }, { name: 'd', rating: 3.5 }, { name: 'e', rating: 0 }];
  assert.deepEqual(names(sortItems(l, 'rate')), ['c', 'a', 'd', 'b', 'e']);
  assert.ok(isSortMode('rate'));
});
