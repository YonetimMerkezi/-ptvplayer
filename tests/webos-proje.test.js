// TV servisi yanıt budama (proje): arayüze yalnız ayrıştırıcıların okuduğu alanlar gider; ayrıştırıcı çıktısı budanmışla budanmamışta birebir aynıdır.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { parseScoreboard } from '../www/js/sports.js';
import { parseStandings } from '../www/js/sports-table.js';
import { parseLiveScore } from '../www/js/sports-ls.js';
import { parseSummary } from '../www/js/sports-detail.js';

const require = createRequire(import.meta.url);
const svc = require('../webos/service/service.js');

const gurultu = (n) => Array.from({ length: n }, (_, i) => ({ rel: ['desktop', 'event'], href: 'https://www.espn.com/soccer/match/_/gameId/' + i, text: 'Gamecast', isExternal: false, isPremium: false }));
const espnTakim = (ad, k) => ({ id: String(k), uid: 's:600~t:' + k, location: ad, name: ad, abbreviation: ad.slice(0, 3).toUpperCase(), displayName: ad, shortDisplayName: ad, color: '000000', alternateColor: 'ffffff', isActive: true, logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/' + k + '.png', links: gurultu(4) });
const espnMac = (k, ev, dep, durum) => ({
  id: String(k),
  uid: 's:600~l:600~e:' + k,
  date: '2026-11-22T17:00Z',
  name: ev + ' at ' + dep,
  shortName: ev.slice(0, 3) + ' @ ' + dep.slice(0, 3),
  links: gurultu(6),
  season: { year: 2026, slug: '2026-27' },
  status: { clock: 0, displayClock: durum.clock || "0'", period: 0, type: { id: '1', name: durum.ad, state: durum.durum, completed: false, description: 'Scheduled', detail: 'Sun, November 22nd at 8:00 PM', shortDetail: '11/22 - 8:00 PM' } },
  competitions: [
    {
      id: String(k),
      date: '2026-11-22T17:00Z',
      attendance: 12000,
      type: { id: '1', abbreviation: 'STD' },
      timeValid: true,
      neutralSite: false,
      venue: { id: '9', fullName: 'Rams Park', address: { city: 'İstanbul', country: 'Turkey' }, indoor: false },
      status: { clock: 0, displayClock: durum.clock || "0'", type: { name: durum.ad, state: durum.durum, completed: false } },
      notes: [{ type: 'event', headline: 'Group Stage - Matchday 3' }],
      broadcasts: [{ market: 'national', names: ['beIN Sports'] }],
      geoBroadcasts: [{ type: { id: '1', shortName: 'TV' }, market: { id: '1', type: 'National' }, media: { shortName: 'ESPN+' }, region: 'us', lang: 'en' }],
      odds: [{ provider: { id: '58', name: 'ESPN BET' }, details: 'EVEN', overUnder: 2.5 }],
      competitors: [
        { id: '1', uid: 'u1', type: 'team', order: 0, homeAway: 'home', winner: false, score: '2', shootoutScore: 4, form: 'WWDLW', records: [{ name: 'All Splits', summary: '8-1-1' }], statistics: gurultu(2), leaders: [{ name: 'goals', leaders: gurultu(3) }], team: espnTakim(ev, 1) },
        { id: '2', uid: 'u2', type: 'team', order: 1, homeAway: 'away', winner: true, score: '1', form: 'LLWDW', records: [], statistics: [], team: espnTakim(dep, 2) },
      ],
      headlines: [{ description: 'Long recap text '.repeat(40), type: 'Recap' }],
    },
  ],
});
const ESPN = {
  leagues: [{ id: '600', name: 'Turkish Super Lig', calendar: Array.from({ length: 60 }, (_, i) => '2026-11-' + i) }],
  season: { type: 1, year: 2026 },
  day: { date: '2026-11-22' },
  events: [espnMac(1, 'Galatasaray', 'Fenerbahçe', { ad: 'STATUS_SCHEDULED', durum: 'pre' }), espnMac(2, 'Beşiktaş', 'Trabzonspor', { ad: 'STATUS_HALFTIME', durum: 'in', clock: "45'" }), espnMac(3, 'Kasımpaşa', 'Rize', { ad: 'STATUS_FULL_TIME', durum: 'post' })],
};

const statGurultu = (ad, v) => ({ name: ad, displayName: ad.toUpperCase(), shortDisplayName: ad.slice(0, 2), description: 'long text '.repeat(10), abbreviation: ad.slice(0, 2).toUpperCase(), type: ad, value: v, displayValue: String(v) });
const satir = (ad, k, p) => ({ team: espnTakim(ad, k), note: { color: '#81D6AC', description: 'Champions League', rank: 1 }, stats: [statGurultu('rank', k), statGurultu('gamesPlayed', 10), statGurultu('wins', 7), statGurultu('ties', 2), statGurultu('losses', 1), statGurultu('pointDifferential', 9), statGurultu('points', p), statGurultu('pointsFor', 20)] });
const TABLO = { uid: 's:600', id: '600', name: 'Turkish Super Lig', abbreviation: 'TSL', children: [{ id: '1', name: 'Group A', abbreviation: 'A', standings: { id: '0', name: 'Group A', displayName: 'Group A', links: gurultu(3), season: 2026, seasonType: 1, entries: [satir('Galatasaray', 1, 23), satir('Fenerbahçe', 2, 21)] } }, { id: '2', name: 'Group B', standings: { entries: [satir('Beşiktaş', 1, 19)] } }] };

const LS = {
  Stages: [
    { Sid: '77', Cnm: 'Turkey', Snm: 'Super Lig', CompN: 'Super Lig', Scd: 'turkey', Ccd: 'turkey', badgeUrl: 'x.png', Chn: [1], Events: [
      { Eid: '123', Esd: 20261122200000, Eps: 'NS', Tr1: '2', Tr2: '1', Trp1: 4, Trp2: 3, ErnInf: 'Round 12', Ese: 1, Spid: -1, Pid: 8, Pids: { 8: 'x' }, T1: [{ ID: '1', Nm: 'Galatasaray', Img: 'a.png', Abr: 'GAL', Gd: 0, newsTag: 'x' }], T2: [{ ID: '2', Nm: 'Fenerbahce', Img: 'b.png', Abr: 'FEN' }], Media: { 1: [{ t: 'x' }] }, Stg: { a: 1 } },
      { Eid: '124', Esd: 20261122183000, Eps: "HT", Tr1: '0', Tr2: '0', T1: [{ Nm: 'Besiktas' }], T2: [{ Nm: 'Trabzonspor' }] },
    ] },
    { Sid: '88', Cnm: 'England', Snm: 'Premier League', Events: [{ Eid: '125', Esd: 20261122210000, Eps: 'FT', Tr1: '3', Tr2: '1', T1: [{ Nm: 'Arsenal' }], T2: [{ Nm: 'Chelsea' }] }] },
  ],
  Ccd: 'x', CCd: 'y',
};

test('proje: ESPN maç listesi budanır, ayrıştırıcı çıktısı birebir aynı kalır', () => {
  const ham = JSON.stringify(ESPN);
  const kirpik = svc.buda(ham, 'espn-skor');
  assert.ok(kirpik.length < ham.length / 4, 'boyut ' + ham.length + ' → ' + kirpik.length);
  assert.deepEqual(parseScoreboard(JSON.parse(kirpik), 'tur.1'), parseScoreboard(JSON.parse(ham), 'tur.1'));
  const m = parseScoreboard(JSON.parse(kirpik), 'tur.1');
  assert.equal(m.length, 3);
  assert.equal(m[0].venue, 'Rams Park');
  assert.equal(m[0].round, 'Grup aşaması · 3. hafta');
  assert.equal(m[1].text, 'Devre arası');
  assert.deepEqual(m[0].intl.map((x) => x.name), ['beIN Sports', 'ESPN+']);
  assert.equal(m[0].home.pen, 4);
  assert.match(m[0].home.logo, /^https:/);
});

test('proje: ESPN puan durumu (grup ve alt grup) budanır, ayrıştırıcı çıktısı birebir aynı kalır', () => {
  const ham = JSON.stringify(TABLO);
  const kirpik = svc.buda(ham, 'espn-tablo');
  assert.ok(kirpik.length < ham.length / 3, 'boyut ' + ham.length + ' → ' + kirpik.length);
  assert.deepEqual(parseStandings(JSON.parse(kirpik)), parseStandings(JSON.parse(ham)));
  const g = parseStandings(JSON.parse(kirpik));
  assert.deepEqual(g.map((x) => x.name), ['Group A', 'Group B']);
  assert.deepEqual(g[0].rows.map((r) => r.name), ['Galatasaray', 'Fenerbahçe']);
  assert.equal(g[0].rows[0].pts, 23);
  assert.match(g[0].rows[0].logo, /^https:/);
  // doğrudan entries (children yok) ve derin iç içe düğümler de korunur
  const ic = { children: [{ children: [{ standings: { entries: [satir('A', 1, 3)] } }] }] };
  assert.deepEqual(parseStandings(JSON.parse(svc.buda(JSON.stringify(ic), 'espn-tablo'))), parseStandings(ic));
});

test('proje: LiveScore günü budanır, ayrıştırıcı çıktısı birebir aynı kalır', () => {
  const ham = JSON.stringify(LS);
  const kirpik = svc.buda(ham, 'ls-gun');
  assert.ok(kirpik.length < ham.length * 0.75, 'boyut ' + ham.length + ' → ' + kirpik.length);
  const opt = { now: new Date(2026, 10, 22, 20, 30).getTime() };
  assert.deepEqual(parseLiveScore(JSON.parse(kirpik), opt), parseLiveScore(JSON.parse(ham), opt));
  assert.ok(parseLiveScore(JSON.parse(kirpik), opt).length >= 3);
});

test('proje: bilinmeyen ad, JSON olmayan ya da boş yanıt olduğu gibi döner', () => {
  assert.equal(svc.buda('{"a":1}', 'yok'), '{"a":1}');
  assert.equal(svc.buda('<html>', 'espn-skor'), '<html>');
  assert.equal(svc.buda('null', 'espn-skor'), 'null');
  assert.equal(svc.buda('"metin"', 'espn-skor'), '"metin"');
  assert.equal(svc.buda('{"a":1}', '__proto__'), '{"a":1}', 'prototip anahtarları maske sayılmaz');
  assert.equal(svc.buda('{"events":[]}', 'espn-skor'), '{"events":[]}');
});

test('proje: servis getir proje verilince yanıtı budar; hata yanıtı (4xx) budanmadan döner', async (t) => {
  const s = http.createServer((req, res) => (req.url === '/hata' ? res.writeHead(400).end('{"events":[{"zzz":1}]}') : res.writeHead(200).end(JSON.stringify(ESPN))));
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => { s.closeAllConnections?.(); s.close(r); }));
  const taban = 'http://127.0.0.1:' + s.address().port;
  const getir = (p) => new Promise((coz, red) => svc.getir(p, (e, r) => (e ? red(e) : coz(r))));
  const tam = await getir({ url: taban + '/', chunk: 1e7 });
  const budanmis = await getir({ url: taban + '/', chunk: 1e7, proje: 'espn-skor' });
  assert.equal(tam.total, JSON.stringify(ESPN).length);
  assert.ok(budanmis.total < tam.total / 4);
  assert.equal(budanmis.done, true);
  assert.deepEqual(parseScoreboard(JSON.parse(budanmis.data), 'tur.1'), parseScoreboard(ESPN, 'tur.1'));
  const h = await getir({ url: taban + '/hata', proje: 'espn-skor' });
  assert.equal(h.status, 400);
  assert.match(h.data, /zzz/);
});

test('proje: ESPN maç özeti — olaylar budanmışla budanmamışta aynı, yorum akışı ve haber gibi büyük bölümler atılır', () => {
  const ozet = {
    header: { competitions: [{ status: { displayClock: "67'", type: { state: 'in', name: 'STATUS_SECOND_HALF' } }, competitors: [{ id: '10', homeAway: 'home', score: '2', team: { id: '10', displayName: 'A' } }, { id: '20', homeAway: 'away', score: '1', team: { id: '20', displayName: 'B' } }] }] },
    gameInfo: { venue: { fullName: 'Stat' }, attendance: 1000 },
    keyEvents: [
      { type: { text: 'Goal' }, scoringPlay: true, team: { id: '10' }, clock: { displayValue: "12'" }, participants: [{ athlete: { displayName: 'Oyuncu 1' } }], shortText: 'Gol 1' },
      { type: { text: 'Yellow Card' }, team: { id: '20' }, clock: { displayValue: "30'" }, participants: [{ athlete: { displayName: 'Oyuncu 2' } }] },
      { type: { text: 'Red Card' }, team: { id: '20' }, clock: { displayValue: "55'" }, participants: [{ athlete: { displayName: 'Oyuncu 3' } }] },
    ],
    commentary: Array.from({ length: 400 }, (_, i) => ({ sequence: i, time: { displayValue: i + "'" }, text: 'Yorum satırı '.repeat(10) })),
    news: { articles: Array.from({ length: 30 }, (_, i) => ({ headline: 'Haber ' + i, description: 'x'.repeat(300) })) },
    videos: Array.from({ length: 20 }, (_, i) => ({ id: i, headline: 'Video', links: { web: { href: 'https://x/' + i } } })),
    boxscore: { teams: [{ homeAway: 'home', team: { id: '10', displayName: 'A', logo: 'https://x/a.png' }, statistics: [{ name: 'a', value: 1 }] }] },
    rosters: [{ homeAway: 'home', team: { id: '10' }, roster: Array.from({ length: 30 }, (_, i) => ({ athlete: { displayName: 'P' + i } })) }],
  };
  const tam = JSON.stringify(ozet);
  const budali = svc.buda(tam, 'espn-ozet');
  const mac = { id: 'tur.1:1', lg: 'tur.1' };
  assert.deepEqual(parseSummary(JSON.parse(budali), mac).events, parseSummary(ozet, mac).events);
  assert.equal(parseSummary(JSON.parse(budali), mac).events.length, 3);
  assert.ok(budali.length < tam.length / 5, 'budanmış özet çok daha küçük (' + budali.length + ' / ' + tam.length + ')');
  assert.ok(budali.indexOf('Yorum satırı') < 0 && budali.indexOf('Haber 0') < 0);
});
