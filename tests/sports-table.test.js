import test from 'node:test';
import assert from 'node:assert/strict';
import { standingsUrls, parseStandings, loadStandings, TABLE_LEAGUES } from '../www/js/sports-table.js';

const stat = (name, value) => ({ name, value });
const entry = (name, rank, p, w, d, l, gd, pts, extra = {}) => ({
  team: { displayName: name, logos: [{ href: 'https://a.test/' + rank + '.png' }] },
  stats: [stat('rank', rank), stat('gamesPlayed', p), stat('wins', w), stat('ties', d), stat('losses', l), stat('pointDifferential', gd), stat('points', pts), stat('pointsFor', 99)],
  ...extra,
});
const SINGLE = {
  children: [{ name: 'Süper Lig', standings: { entries: [entry('Fenerbahçe', 2, 10, 7, 2, 1, 12, 23), entry('Galatasaray', 1, 10, 8, 1, 1, 15, 25), entry('Turkey', 3, 10, 5, 3, 2, 4, 18)] } }],
};

test('standingsUrls: apis/v2 önce, site/v2 yedek', () => {
  assert.deepEqual(standingsUrls('tur.1', 'https://site.api.espn.com/apis/site/v2/sports/soccer/'), [
    'https://site.api.espn.com/apis/v2/sports/soccer/tur.1/standings',
    'https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/standings',
  ]);
  assert.deepEqual(standingsUrls('x', 'http://h/'), ['http://h/x/standings']);
});

test('parseStandings: tek tablo, sıraya göre, istatistikler doğru okunur', () => {
  const g = parseStandings(SINGLE);
  assert.equal(g.length, 1);
  assert.equal(g[0].name, '');
  assert.deepEqual(g[0].rows.map((r) => r.name), ['Galatasaray', 'Fenerbahçe', 'Turkey']);
  const r = g[0].rows[0];
  assert.deepEqual([r.rank, r.p, r.w, r.d, r.l, r.gd, r.pts], [1, 10, 8, 1, 1, 15, 25]);
  assert.equal(r.logo, 'https://a.test/1.png');
  assert.equal(g[0].rows[2].label, 'Türkiye');
});

test('parseStandings: gruplar ayrı tablo olur ve adları korunur', () => {
  const g = parseStandings({ children: [{ name: 'Group A', standings: { entries: [entry('A', 1, 2, 2, 0, 0, 3, 6)] } }, { name: 'Group B', standings: { entries: [entry('B', 1, 2, 1, 1, 0, 1, 4)] } }] });
  assert.deepEqual(g.map((x) => x.name), ['Group A', 'Group B']);
});

test('parseStandings: sıra yoksa puana göre dizer; puan yoksa G/B’den hesaplar', () => {
  const e = (n, w, d, gd) => ({ team: { displayName: n }, stats: [stat('wins', w), stat('ties', d), stat('pointDifferential', gd)] });
  const g = parseStandings({ standings: { entries: [e('Küçük', 1, 1, 0), e('Büyük', 3, 0, 5)] } });
  assert.deepEqual(g[0].rows.map((r) => [r.name, r.rank, r.pts]), [['Büyük', 1, 9], ['Küçük', 2, 4]]);
});

test('parseStandings: bozuk yanıtlarda hata atmaz, boş döner', () => {
  for (const bad of [null, undefined, 5, 'x', {}, { children: [] }, { children: [{ standings: { entries: [null, {}, { team: {} }] } }] }]) {
    assert.deepEqual(parseStandings(bad), []);
  }
});

test('loadStandings: ilk adres boşsa ikinciyi dener; hiçbiri olmazsa ayrıntılı hata', async () => {
  const urls = [];
  const net = { json: async (u) => (urls.push(u), u.includes('/apis/v2/') ? { children: [] } : SINGLE) };
  const g = await loadStandings({ net, slug: 'tur.1' });
  assert.equal(g[0].rows.length, 3);
  assert.equal(urls.length, 2);
  const bad = { json: async () => { throw new Error('HTTP 404'); } };
  await assert.rejects(loadStandings({ net: bad, slug: 'eng.1' }), (e) => e.message === 'Puan durumu alınamadı' && e.detail === 'eng.1: HTTP 404');
});

test('TABLE_LEAGUES: tüm kimlikler LEAGUES içinde', () => {
  assert.equal(TABLE_LEAGUES.length, 9);
  assert.equal(TABLE_LEAGUES[0].id, 'tur.1');
});
