import test from 'node:test';
import assert from 'node:assert/strict';
import { searchAll, totalOf } from '../www/js/multisearch.js';

const it = (id, name, group = 'G') => ({ id, name, group });
const A = { id: 'a', name: 'Ev' };
const B = { id: 'b', name: 'Yedek' };
const catA = { live: [it('1', 'TRT Çocuk'), it('2', 'Kanal D')], movies: [it('m1', 'Kar Tanesi')], series: [] };
const catB = { live: [it('9', 'Çocuk TV'), it('8', 'Spor')], movies: [it('m9', 'Karlar Ülkesi')], series: [it('s9', 'Çocuk Dizisi')] };

test('searchAll: tüm kaynaklarda arar, sonuç kaynakla etiketlenir; önek eşleşmesi öne gelir', () => {
  const r = searchAll([{ src: A, cat: catA }, { src: B, cat: catB }], 'çocuk');
  assert.deepEqual(r.live.map((x) => [x.src.id, x.it.id]), [['b', '9'], ['a', '1']], 'önek (Çocuk TV) önce, sonra içeren (TRT Çocuk)');
  assert.deepEqual(r.series.map((x) => x.it.id), ['s9']);
  assert.equal(totalOf(r), 3);
  const kar = searchAll([{ src: A, cat: catA }, { src: B, cat: catB }], 'kar');
  assert.deepEqual(kar.movie.map((x) => [x.src.name, x.it.name]), [['Ev', 'Kar Tanesi'], ['Yedek', 'Karlar Ülkesi']], 'eşit önekte etkin (ilk) kaynak önce');
});

test('searchAll: görünürlük süzgeci her kaynak için uygulanır; kataloğu olmayan kaynak atlanır; boş sorgu boş döner', () => {
  const hideSpor = (kind, list) => list.filter((x) => x.name !== 'TRT Çocuk');
  const r = searchAll([{ src: A, cat: catA, visible: hideSpor }, { src: B, cat: catB }, { src: { id: 'c', name: 'Yok' }, cat: null }], 'çocuk');
  assert.deepEqual(r.live.map((x) => x.it.id), ['9']);
  assert.equal(totalOf(searchAll([{ src: A, cat: catA }], '  ')), 0);
  assert.equal(totalOf(searchAll([], 'x')), 0);
});

test('searchAll: sonuç üst sınırı her tür için uygulanır', () => {
  const big = { live: Array.from({ length: 50 }, (_, i) => it('l' + i, 'Spor ' + i)), movies: [], series: [] };
  assert.equal(searchAll([{ src: A, cat: big }, { src: B, cat: big }], 'spor', 30).live.length, 30);
});
