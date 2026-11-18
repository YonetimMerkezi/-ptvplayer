import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOVIE_GENRES, SURPRISE_ID, genresOfMovie, genreChips, pickMovies } from '../www/js/genre-picks.js';
import { mapVod } from '../www/js/xtream.js';

const mv = (id, name, group, extra = {}) => ({ id, kind: 'movie', name, group, ...extra });
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; }; // sabit "rastgele"

test('tür: kategori adından ve genre alanından çıkar; Türkçe harf/büyük-küçük fark etmez', () => {
  assert.deepEqual(genresOfMovie(mv('1', 'A', 'AKSİYON Filmleri')), ['aksiyon']);
  assert.deepEqual(genresOfMovie(mv('2', 'B', 'Netflix', { genre: 'Dram, Suç' })).sort(), ['dram', 'suc']);
  assert.deepEqual(genresOfMovie(mv('3', 'C', 'Bilim Kurgu & Fantastik')).sort(), ['bilimkurgu', 'fantastik']);
  assert.deepEqual(genresOfMovie(mv('4', 'D', 'Çocuk / Animasyon')).sort(), ['aile', 'animasyon']);
  assert.deepEqual(genresOfMovie(mv('5', 'E', 'Genel')), []);
  assert.deepEqual(genresOfMovie(null), []);
});

test('tür: her tür için kimlik tekil, etiket ve simge dolu', () => {
  assert.equal(new Set(MOVIE_GENRES.map((g) => g.id)).size, MOVIE_GENRES.length);
  for (const g of MOVIE_GENRES) assert.ok(g.label && g.icon && g.re instanceof RegExp, g.id);
  assert.ok(!MOVIE_GENRES.some((g) => g.id === SURPRISE_ID));
});

test('çipler: en çok filmi olan tür önce, az filmli tür ve film olmayanlar çıkmaz, aynı film bir sayılır', () => {
  const list = [];
  for (let i = 0; i < 6; i++) list.push(mv('k' + i, 'Komedi ' + i, 'Komedi'));
  for (let i = 0; i < 4; i++) list.push(mv('a' + i, 'Aksiyon ' + i, 'Aksiyon'));
  for (let i = 0; i < 3; i++) list.push(mv('h' + i, 'Korku ' + i, 'Korku')); // 3 < 4: çıkmaz
  list.push(mv('k0b', 'Komedi 0', 'Komedi Yedek')); // aynı ad başka kategoride
  list.push({ id: 's1', kind: 'series', name: 'Dizi', group: 'Komedi' });
  const chips = genreChips(list, { key: (it) => it.name });
  assert.deepEqual(chips.map((c) => [c.id, c.n]), [['komedi', 6], ['aksiyon', 4]]);
  assert.deepEqual(genreChips([], {}), []);
  assert.equal(genreChips(list, { key: (it) => it.name, max: 1 }).length, 1);
});

test('öneri: yalnız o türden, aynı film tek, izlenmemiş önce, sınır uygulanır', () => {
  const list = [mv('1', 'Bir', 'Komedi'), mv('2', 'İki', 'Komedi'), mv('3', 'Üç', 'Komedi'), mv('4', 'Dört', 'Aksiyon'), mv('5', 'Bir', 'Komedi 2')];
  const picks = pickMovies(list, 'komedi', { limit: 10, key: (it) => it.name, watched: (it) => it.id === '2' });
  assert.deepEqual(picks.map((x) => x.id).sort(), ['1', '2', '3']);
  assert.equal(picks[picks.length - 1].id, '2', 'izlenen en sonda');
  assert.equal(pickMovies(list, 'komedi', { limit: 2, key: (it) => it.name }).length, 2);
  assert.deepEqual(pickMovies(list, 'korku', { key: (it) => it.name }), []);
});

test('öneri: aynı çipe yeniden basınca daha önce gösterilmeyenler gelir; tükenince tekrar gösterilir', () => {
  const list = Array.from({ length: 8 }, (_, i) => mv('f' + i, 'Film ' + i, 'Dram'));
  const first = pickMovies(list, 'dram', { limit: 4, rng: seq(0.1, 0.9, 0.5, 0.3, 0.7, 0.2, 0.8, 0.4) });
  const second = pickMovies(list, 'dram', { limit: 4, seen: first.map((x) => x.id), rng: seq(0.1, 0.9) });
  assert.equal(second.filter((x) => first.some((y) => y.id === x.id)).length, 0);
  const third = pickMovies(list, 'dram', { limit: 4, seen: list.map((x) => x.id) });
  assert.equal(third.length, 4, 'hepsi gösterildiyse de boş kalmaz');
});

test('öneri: yüksek puanlı hafifçe öne çıkar; "şaşırt beni" tüm türlerden seçer', () => {
  const list = [mv('a', 'A', 'Dram', { rating: 1 }), mv('b', 'B', 'Dram', { rating: 5 })];
  assert.equal(pickMovies(list, 'dram', { limit: 1, rng: () => 0.2 })[0].id, 'b');
  const mix = [mv('1', 'Bir', 'Komedi'), mv('2', 'İki', 'Korku'), mv('3', 'Üç', 'Genel')];
  assert.equal(pickMovies(mix, SURPRISE_ID, { limit: 10 }).length, 3);
});

test('Xtream: film listesinde genre alanı varsa taşınır, yoksa boş', () => {
  const [a, b] = mapVod([{ stream_id: 1, name: 'A', category_id: '1', genre: ' Dram ' }, { stream_id: 2, name: 'B', category_id: '1' }], [{ category_id: '1', category_name: 'X' }]);
  assert.equal(a.genre, 'Dram');
  assert.equal(b.genre, '');
});

test('bağlantı: ana sayfada öneri bölümü, çip/yenile tıklaması ve kart açma var; kategori sınıfı çok renkli temaya girer', () => {
  const app = readFileSync(new URL('../www/js/app.js', import.meta.url), 'utf8');
  assert.match(app, /id="home-picks"/);
  assert.match(app, /Ne izleyeceğine karar veremedin mi\?/);
  assert.match(app, /e\.target\.closest\('\[data-pick\], \[data-pick-again\]'\)/);
  assert.match(app, /data-hk="movie" data-hid="\$\{esc\(it\.id\)\}"/);
  assert.match(app, /visibleAll\('movie'\), genreChips|genreChips\(movies/, 'kilitli/gizli kategoriler önerilmez');
  const css = readFileSync(new URL('../www/css/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.hp-chips \{/);
});
