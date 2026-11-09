import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAllow, allowSet, filterAllowed, applyKid, toggleAllowed, setAllowed, pruneAllow, hasAllowed, countAllowed, kidActiveOf, groupOf } from '../www/js/kid.js';

const it = (id, group, name = id) => ({ id, group, name });

test('normalizeAllow: bozuk girdiler atılır, kopyalar tekilleşir, her tür dizi olur', () => {
  const n = normalizeAllow({ a: { live: ['Spor', 'Spor', 5, 'x'.repeat(300)], movie: 'yanlış' }, b: 'x', __proto__: { live: ['Z'] }, '': { live: ['Q'] } });
  assert.deepEqual(n, { a: { live: ['Spor'], movie: [], series: [] } });
  assert.deepEqual(normalizeAllow(null), {});
  assert.deepEqual(normalizeAllow([1, 2]), {});
});

test('filterAllowed / applyKid: yalnız izinli kategoriler; boş izin hiçbir şey göstermez; grupsuz öğe "Diğer"', () => {
  const raw = { live: [it('1', 'Çocuk'), it('2', 'Haber'), it('3', '')], movies: [it('m1', 'Animasyon'), it('m2', 'Korku')], series: [it('s1', 'Çizgi')] };
  let allow = setAllowed({}, 'src', 'live', ['Çocuk', 'Diğer']);
  allow = setAllowed(allow, 'src', 'movie', ['Animasyon']);
  const k = applyKid(raw, allow, 'src');
  assert.deepEqual(k.live.map((x) => x.id), ['1', '3']);
  assert.deepEqual(k.movies.map((x) => x.id), ['m1']);
  assert.deepEqual(k.series, [], 'izin verilmeyen tür boş');
  assert.deepEqual(applyKid(raw, allow, 'baska').live, [], 'ayarlanmamış kaynak boş');
  assert.equal(groupOf(it('x', undefined)), 'Diğer');
  assert.deepEqual(filterAllowed(null, new Set(['a'])), []);
});

test('toggleAllowed / setAllowed / sayımlar: kaynak ve tür başına bağımsız, girdi değişmez', () => {
  const a0 = {};
  const a1 = toggleAllowed(a0, 's1', 'live', 'Spor');
  const a2 = toggleAllowed(a1, 's1', 'movie', 'Aksiyon');
  const a3 = toggleAllowed(a2, 's2', 'live', 'Haber');
  assert.deepEqual(a0, {});
  assert.equal(countAllowed(a3, 's1', 'live'), 1);
  assert.equal(countAllowed(a3, 's1', 'series'), 0);
  assert.ok(hasAllowed(a3, 's2') && !hasAllowed(a3, 's3'));
  const a4 = toggleAllowed(a3, 's1', 'live', 'Spor');
  assert.equal(countAllowed(a4, 's1', 'live'), 0, 'ikinci dokunuş kaldırır');
  assert.ok(allowSet(a4, 's1', 'movie').has('Aksiyon'));
});

test('pruneAllow: silinen kaynakların kaydı temizlenir', () => {
  const a = setAllowed(setAllowed({}, 'a', 'live', ['X']), 'b', 'live', ['Y']);
  assert.deepEqual(Object.keys(pruneAllow(a, ['b'])), ['b']);
});

test('kidActiveOf: açık işaret ve çıkış şifresi birlikte gerekir (şifresiz mod takılı kalmaz)', () => {
  assert.equal(kidActiveOf(true, { hash: 'h' }), true);
  assert.equal(kidActiveOf(true, null), false);
  assert.equal(kidActiveOf(false, { hash: 'h' }), false);
  assert.equal(kidActiveOf(true, {}), false);
});
