import test from 'node:test';
import assert from 'node:assert/strict';
import { broadcastGroups, summaryUrl, eventIdOf, eventKind, markerKind, minuteValue, parseSummary, loadSummary } from '../www/js/sports-detail.js';
import { parseBroadcasts, parseScoreboard, findPrograms, findProgram } from '../www/js/sports.js';

const SUMMARY = {
  header: {
    competitions: [{
      status: { displayClock: "67'", type: { state: 'in', name: 'STATUS_SECOND_HALF' } },
      competitors: [
        { id: '10', homeAway: 'home', score: '2', team: { id: '10', displayName: 'Galatasaray' } },
        { id: '20', homeAway: 'away', score: '1', team: { id: '20', displayName: 'Fenerbahçe' } },
      ],
      broadcasts: [{ market: 'national', names: ['beIN SPORTS'] }],
      geoBroadcasts: [{ media: { shortName: 'Paramount+' }, region: 'us' }],
    }],
  },
  keyEvents: [
    { type: { text: 'Kickoff' }, clock: { displayValue: "0'" } },
    { type: { text: 'Goal' }, scoringPlay: true, clock: { displayValue: "12'" }, team: { id: '10' }, participants: [{ athlete: { displayName: 'Icardi' } }], shortText: 'Icardi Goal' },
    { type: { text: 'Yellow Card' }, clock: { displayValue: "30'" }, team: { id: '20' }, participants: [{ athlete: { displayName: 'Fred' } }] },
    { type: { text: 'Substitution' }, clock: { displayValue: "60'" }, team: { id: '10' }, participants: [{ athlete: { displayName: 'Mertens' } }, { athlete: { displayName: 'Zaha' } }] },
    { type: { text: 'Own Goal' }, clock: { displayValue: "64'" }, team: { id: '20' }, participants: [{ athlete: { displayName: 'Djiku' } }] },
    { type: { text: 'Penalty - Saved' }, clock: { displayValue: "66'" }, team: { id: '20' }, participants: [{ athlete: { displayName: 'Tadic' } }] },
    { type: { text: 'Halftime' }, clock: { displayValue: "45'" } },
    { type: { text: 'Red Card' }, clock: { displayValue: "70'" }, team: { id: '99' } },
  ],
  boxscore: {
    teams: [
      { homeAway: 'home', team: { id: '10' }, statistics: [{ name: 'possessionPct', displayValue: '55.4' }, { name: 'totalShots', displayValue: '12' }, { name: 'wonCorners', displayValue: '5' }] },
      { homeAway: 'away', team: { id: '20' }, statistics: [{ name: 'possessionPct', displayValue: '44.6' }, { name: 'totalShots', displayValue: '7' }, { name: 'yellowCards', displayValue: '2' }] },
    ],
  },
  rosters: [
    { homeAway: 'home', team: { id: '10' }, formation: '4-2-3-1', roster: [
      { starter: true, jersey: '1', athlete: { displayName: 'Muslera' }, position: { abbreviation: 'G' } },
      { starter: true, jersey: '9', athlete: { displayName: 'Icardi' }, position: { abbreviation: 'F' } },
      { starter: false, jersey: '77', athlete: { displayName: 'Mertens' }, position: { abbreviation: 'M' } },
    ] },
    { homeAway: 'away', team: { id: '20' }, formation: { summary: '4-4-2' }, roster: [{ starter: true, jersey: '10', athlete: { displayName: 'Tadic' }, position: { abbreviation: 'F' } }] },
  ],
  gameInfo: { venue: { fullName: 'Rams Park', address: { city: 'İstanbul' } }, attendance: 52000, officials: [{ fullName: 'Halil Umut Meler', position: { displayName: 'Referee' } }] },
};

test('summaryUrl / eventIdOf', () => {
  assert.equal(summaryUrl('tur.1', '123', 'http://x/soccer/'), 'http://x/soccer/tur.1/summary?event=123');
  assert.equal(eventIdOf({ id: 'tur.1:4455', lg: 'tur.1' }), '4455');
  assert.equal(eventIdOf({ id: 'uefa.champions:77', lg: 'uefa.champions' }), '77');
});

test('eventKind: ESPN olay türleri', () => {
  const k = (text, extra = {}) => eventKind({ type: { text }, ...extra });
  assert.equal(k('Goal - Header'), 'goal');
  assert.equal(k('Penalty - Scored'), 'goal');
  assert.equal(k('Own Goal'), 'own');
  assert.equal(k('Penalty - Missed'), 'penmiss');
  assert.equal(k('Penalty - Saved'), 'penmiss');
  assert.equal(k('Yellow Card'), 'yellow');
  assert.equal(k('Red Card'), 'red');
  assert.equal(k('Yellow Red Card'), 'red');
  assert.equal(k('Substitution'), 'sub');
  assert.equal(k('VAR Review'), 'var');
  assert.equal(k('Kickoff'), null);
  assert.equal(k('Halftime'), null);
  assert.equal(k('Shot', { scoringPlay: true }), 'goal');
  assert.equal(eventKind(null), null);
});

test('parseSummary: olaylar takıma ve dakikaya göre, ilgisiz olaylar atılır', () => {
  const d = parseSummary(SUMMARY, {});
  assert.deepEqual(d.events.map((e) => [e.kind, e.minute, e.side, e.player]), [
    ['goal', "12'", 'home', 'Icardi'],
    ['yellow', "30'", 'away', 'Fred'],
    ['ht', "45'", '', ''],
    ['sub', "60'", 'home', 'Mertens'],
    ['own', "64'", 'away', 'Djiku'],
    ['penmiss', "66'", 'away', 'Tadic'],
    ['red', "70'", '', ''],
  ]);
  assert.equal(d.events[3].other, 'Zaha');
  assert.equal(d.status.state, 'in');
  assert.equal(d.status.text, "67'");
  assert.equal(d.home.score, 2);
  assert.equal(d.away.score, 1);
});

test('parseSummary: istatistik verilmez (ESPN yanıtında olsa bile)', () => {
  const d = parseSummary(SUMMARY, {});
  assert.equal('stats' in d, false);
  assert.equal(JSON.stringify(d).includes('Topla oynama'), false);
});

test('parseSummary: kadro, diziliş, yedekler; hakem/seyirci', () => {
  const d = parseSummary(SUMMARY, {});
  assert.equal(d.lineups.home.formation, '4-2-3-1');
  assert.equal(d.lineups.away.formation, '4-4-2');
  assert.deepEqual(d.lineups.home.starters.map((p) => [p.n, p.name, p.pos]), [['1', 'Muslera', 'G'], ['9', 'Icardi', 'F']]);
  assert.deepEqual(d.lineups.home.subs.map((p) => p.name), ['Mertens']);
  assert.equal(d.venue, 'Rams Park');
  assert.equal(d.city, 'İstanbul');
  assert.equal(d.referee, 'Halil Umut Meler');
  assert.equal(d.attendance, 52000);
  assert.equal(d.empty, false);
});

test('parseSummary: yayıncılar (ülke adıyla), tekrarsız', () => {
  const d = parseSummary(SUMMARY, {});
  assert.deepEqual(d.intl, [{ name: 'beIN SPORTS', region: '' }, { name: 'Paramount+', region: 'ABD' }]);
});

test('parseSummary: boş/bozuk yanıt hata atmaz ve "empty" işaretlenir', () => {
  for (const bad of [null, undefined, 5, 'x', {}, { keyEvents: 'x', rosters: [null, 3], boxscore: { teams: [null] }, header: { competitions: [null] } }]) {
    const d = parseSummary(bad, {});
    assert.equal(d.empty, true);
    assert.deepEqual(d.events, []);
    assert.equal(d.home.score, null);
  }
});

test('parseSummary: takım yan bilgisi yalnız boxscore/roster kimliğinden de çıkarılır', () => {
  const d = parseSummary({
    keyEvents: [{ type: { text: 'Goal' }, team: { id: '5' }, participants: [{ athlete: { displayName: 'A' } }] }],
    boxscore: { teams: [{ homeAway: 'home', team: { id: '5' }, statistics: [] }] },
  }, {});
  assert.equal(d.events[0].side, 'home');
});

test('loadSummary: adres, fast bayrağı, hata ayrıntısı', async () => {
  const calls = [];
  const net = { json: async (u, o) => { calls.push([u, o]); return SUMMARY; } };
  const d = await loadSummary({ net, match: { id: 'tur.1:42', lg: 'tur.1' }, base: 'http://b/soccer/' });
  assert.deepEqual(calls, [['http://b/soccer/tur.1/summary?event=42', { fast: true }]]);
  assert.equal(d.events.length, 7); // 6 olay + devre arası ayracı
  await assert.rejects(loadSummary({ net: { json: async () => { throw new Error('HTTP 404'); } }, match: { id: 'a:1', lg: 'a' } }), (e) => /ayrıntısı alınamadı/.test(e.message) && e.detail === 'HTTP 404');
  await assert.rejects(loadSummary({ net: { json: async () => null }, match: { id: 'a:1', lg: 'a' } }), (e) => e.detail === 'Boş yanıt');
  await assert.rejects(loadSummary({ net: { json: () => new Promise(() => {}) }, match: { id: 'a:1', lg: 'a' }, timeoutMs: 30 }), (e) => /zamanında/.test(e.detail));
});

test('parseBroadcasts: broadcasts/geoBroadcasts biçimleri, tekrarsız, sınırlı', () => {
  assert.deepEqual(parseBroadcasts(null), []);
  assert.deepEqual(parseBroadcasts({ broadcasts: ['ESPN', { names: ['Sky Sports', 'ESPN'], region: 'gb' }, { media: { shortName: 'TNT' } }, null] }), [
    { name: 'ESPN', region: '' }, { name: 'Sky Sports', region: 'İngiltere' }, { name: 'ESPN', region: 'İngiltere' }, { name: 'TNT', region: '' },
  ]);
  assert.deepEqual(parseBroadcasts({ geoBroadcasts: [{ media: { shortName: 'beIN' }, region: 'tr' }, { media: { shortName: 'beIN' }, region: 'tr' }, { media: { shortName: 'X' }, region: 'zz' }] }), [
    { name: 'beIN', region: 'Türkiye' }, { name: 'X', region: 'ZZ' },
  ]);
  const many = { broadcasts: Array.from({ length: 20 }, (_, i) => `K${i}`) };
  assert.equal(parseBroadcasts(many).length, 8);
});

test('parseScoreboard: stat ve yayıncılar da okunur', () => {
  const r = parseScoreboard({ events: [{ id: '1', date: '2026-11-11T17:00Z', competitions: [{
    venue: { fullName: 'Rams Park' }, broadcasts: [{ names: ['beIN SPORTS'] }],
    status: { type: { state: 'pre', name: 'STATUS_SCHEDULED' } },
    competitors: [{ homeAway: 'home', team: { displayName: 'A' } }, { homeAway: 'away', team: { displayName: 'B' } }],
  }] }] }, 'tur.1');
  assert.equal(r[0].venue, 'Rams Park');
  assert.deepEqual(r[0].intl, [{ name: 'beIN SPORTS', region: '' }]);
});

test('findPrograms: aynı maçı veren tüm kanallar, maça en yakın başlangıçtan uzağa', () => {
  const t = Date.UTC(2026, 10, 11, 17, 0);
  const m = { t, home: { name: 'Galatasaray' }, away: { name: 'Fenerbahçe' } };
  const P = (id, s, title) => ({ id, p: { s, e: s + 7200e3, t: title } });
  const hits = [
    P('a', t - 600e3, 'Galatasaray - Fenerbahçe'),
    P('b', t, 'Süper Lig: Galatasaray Fenerbahçe canlı'),
    P('c', t + 60e3, 'Beşiktaş - Trabzonspor'),
    P('d', t - 5 * 3600e3, 'Galatasaray - Fenerbahçe (tekrar)'),
    P('e', t - 60e3, 'Galatasaray - Fenerbahçe maç öncesi'),
  ];
  assert.deepEqual(findPrograms(m, hits).map((h) => h.id), ['b', 'e', 'a']);
  assert.equal(findProgram(m, hits).id, 'b');
  assert.deepEqual(findPrograms(m, []), []);
  assert.equal(findProgram(null, hits), null);
});

const ITEMS = [
  { id: '1', name: 'TR: BEIN SPORTS 1 HD' }, { id: '2', name: 'TR| beINSPORTS 2' }, { id: '3', name: 'S Sport 2' },
  { id: '4', name: 'A SPOR' }, { id: '5', name: 'Tivibu Spor 1' }, { id: '6', name: 'Habertürk' },
];

test('broadcastGroups: rehber ve yayın kanalları; kanallar tekrarlanmaz', () => {
  const g = broadcastGroups({ epgChans: [{ item: ITEMS[0], p: { title: 'GS - FB' } }], tvNames: ['beIN Sports 1', 'S Sport 2'], items: ITEMS });
  assert.deepEqual(g.map((x) => x.id), ['epg', 'tv']);
  assert.deepEqual(g[0].channels.map((c) => c.item.id), ['1']);
  const tv = g[1].channels.map((c) => c.item.id);
  assert.ok(!tv.includes('1'), 'rehberdeki kanal ikinci kez gelmez');
  assert.ok(tv.includes('3'));
  assert.match(g[1].title, /^Yayın kanalları: beIN Sports 1, S Sport 2$/);
  assert.equal(g[1].note, '');
});

test('broadcastGroups: bilgi yoksa grup yok (tahmin yürütülmez, ilgisiz kanal listelenmez)', () => {
  assert.deepEqual(broadcastGroups({ items: ITEMS }), []);
  assert.deepEqual(broadcastGroups({ epgChans: [], tvNames: [], items: [] }), []);
});

test('broadcastGroups: yayın kanalı listede yoksa açık not; rehber zaten buldu ve yayın listesi aynı kanalsa ikinci grup çıkmaz', () => {
  const lost = broadcastGroups({ tvNames: ['Olmayan Kanal XYZ'], items: ITEMS });
  assert.equal(lost.length, 1);
  assert.equal(lost[0].id, 'tv');
  assert.equal(lost[0].channels.length, 0);
  assert.match(lost[0].note, /listenizde bulunamadı/);
  const same = broadcastGroups({ epgChans: [{ item: ITEMS[2] }], tvNames: ['S Sport 2'], items: ITEMS });
  assert.deepEqual(same.map((x) => x.id), ['epg'], 'aynı kanal yalnız rehber grubunda');
  const mixed = broadcastGroups({ epgChans: [{ item: ITEMS[2] }], tvNames: ['Olmayan Kanal XYZ'], items: ITEMS });
  assert.deepEqual(mixed.map((x) => x.id), ['epg'], 'rehber kanalı varken listede olmayan kanal notu gösterilmez');
});

test('minuteValue / markerKind: uzatma dakikaları ve devre arası işaretleri', () => {
  assert.equal(minuteValue("12'"), 12);
  assert.equal(minuteValue("45'+2'"), 45.02);
  assert.equal(minuteValue("90'+11'"), 90.11);
  assert.ok(Number.isNaN(minuteValue('')));
  assert.equal(markerKind({ type: { text: 'Halftime' } }), 'ht');
  assert.equal(markerKind({ type: { text: 'End Regular Time' } }), 'ft');
  assert.equal(markerKind({ type: { text: 'Full Time' } }), 'ft');
  assert.equal(markerKind({ type: { text: 'Kickoff' } }), null);
  assert.equal(markerKind({ type: { text: 'Start 2nd Half' } }), null);
  assert.equal(markerKind({ type: { text: 'Goal' } }), null);
});

test('parseSummary: olaylar dakikaya göre sıralanır, golde skor, devre arası/maç sonu ayracı, ayrıntı etiketi', () => {
  const ev = (type, min, team, who, extra = {}) => ({ type: { text: type }, clock: { displayValue: min }, team: team ? { id: team } : undefined, participants: who ? [{ athlete: { displayName: who } }] : [], ...extra });
  const j = {
    header: { competitions: [{ competitors: [{ homeAway: 'home', id: '10' }, { homeAway: 'away', id: '20' }] }] },
    keyEvents: [
      ev('Yellow Card', "80'", '20', 'Z'),
      ev('Goal', "90'+4'", '20', 'Geç Gol'), // uzatmada: 90'dan sonra
      ev('Goal - Header', "12'", '10', 'Kafa Golcü', { scoringPlay: true }),
      ev('Full Time', "90'+6'"),
      ev('Penalty - Scored', "45'+2'", '20', 'Penaltıcı', { scoringPlay: true }),
      ev('Halftime', "45'+3'"),
      ev('Own Goal', "70'", '20', 'Kalesine'),
      ev('Yellow Red Card', "85'", '10', 'İkinci'),
      { type: { text: 'Substitution' }, clock: { displayValue: "60'" }, team: { id: '10' }, participants: [{ athlete: { displayName: 'Giren' } }, { athlete: { displayName: 'Çıkan' } }] },
    ],
  };
  const d = parseSummary(j, {});
  assert.deepEqual(d.events.map((e) => [e.minute, e.kind, e.score]), [
    ["12'", 'goal', '1–0'],
    ["45'+2'", 'goal', '1–1'],
    ["45'+3'", 'ht', '1–1'],
    ["60'", 'sub', ''],
    ["70'", 'own', '2–1'], // deplasmanın kendi kalesine golü ev sahibine yazılır
    ["80'", 'yellow', ''],
    ["85'", 'red', ''],
    ["90'+4'", 'goal', '2–2'],
    ["90'+6'", 'ft', '2–2'],
  ]);
  assert.equal(d.events[0].detail, 'kafa');
  assert.equal(d.events[1].detail, 'penaltı');
  assert.equal(d.events[6].detail, 'ikinci sarıdan');
  assert.equal(d.events[3].player, 'Giren');
  assert.equal(d.events[3].other, 'Çıkan');
  assert.ok(d.events[2].mark && d.events[8].mark && !d.events[0].mark);
});

test('parseSummary: takımı bilinmeyen golden sonra skor yazılmaz', () => {
  const j = {
    header: { competitions: [{ competitors: [{ homeAway: 'home', id: '10' }, { homeAway: 'away', id: '20' }] }] },
    keyEvents: [
      { type: { text: 'Goal' }, clock: { displayValue: "5'" }, team: { id: '10' }, participants: [{ athlete: { displayName: 'A' } }] },
      { type: { text: 'Goal' }, clock: { displayValue: "9'" }, participants: [{ athlete: { displayName: 'B' } }] },
      { type: { text: 'Goal' }, clock: { displayValue: "20'" }, team: { id: '20' }, participants: [{ athlete: { displayName: 'C' } }] },
    ],
  };
  assert.deepEqual(parseSummary(j, {}).events.map((e) => e.score), ['1–0', '', '']);
});
