// Maç haftası kaynağı (TheSportsDB eventsround / eventsnextleague): ayrıştırma, hafta çözümü, önbellek, eşleştirme
import test from 'node:test';
import assert from 'node:assert/strict';
import { HAFTA_LIGLERI, haftaDestek, tsdbSezon, haftaUrls, sonrakiUrls, parseOlay, parseHafta, haftaTur, haftaAl, guncelHafta, haftaCoz, eslestir } from '../www/js/sports-hafta.js';

const NOW = new Date(2026, 10, 27, 22, 0).getTime(); // 27 Kasım 2026 22:00 yerel
const ol = (id, h, a, dateEvent, strTime, ek = {}) => ({ idEvent: id, strEvent: `${h} vs ${a}`, strHomeTeam: h, strAwayTeam: a, intRound: '13', dateEvent, strTime, strStatus: 'Not Started', intHomeScore: null, intAwayScore: null, strPostponed: 'no', ...ek });
const HAFTA13 = {
  events: [
    ol('1', 'Göztepe', 'Trabzonspor', '2026-11-30', '16:00:00'),
    ol('2', 'Alanyaspor', 'Konyaspor', '2026-11-27', '17:00:00', { strStatus: 'Match Finished', intHomeScore: '1', intAwayScore: '2', strHomeTeamBadge: 'https://r2.thesportsdb.com/a.png' }),
    ol('3', 'Rizespor', 'Kasımpaşa', '2026-11-27', '17:00:00', { strStatus: 'Match Finished', intHomeScore: '3', intAwayScore: '2' }),
    ol('4', 'Gaziantep', 'Amed', '2026-11-28', '16:00:00'),
    ol('5', 'Beşiktaş', 'Galatasaray', '2026-11-30', '18:00:00'),
    null,
    { idEvent: 'bozuk', strHomeTeam: 'A' },
  ],
};
const ag = (yanit) => {
  const calls = [];
  return { calls, net: { json: async (u) => (calls.push(u), typeof yanit === 'function' ? yanit(u) : yanit) } };
};

test('hafta: lig kimlikleri ve sezon (Ağustos–Temmuz)', () => {
  assert.equal(HAFTA_LIGLERI['tur.1'], 4339);
  assert.equal(haftaDestek('tff.1'), true);
  assert.equal(haftaDestek('uefa.champions'), false);
  assert.equal(tsdbSezon(NOW), '2026-2027');
  assert.equal(tsdbSezon(new Date(2027, 2, 3).getTime()), '2026-2027');
  assert.equal(tsdbSezon(new Date(2027, 6, 20).getTime()), '2027-2028');
  assert.equal(haftaUrls('tur.1', 13, '2026-2027', 'http://x.test')[0], 'http://x.test/eventsround.php?id=4339&r=13&s=2026-2027');
  assert.equal(sonrakiUrls('tur.1', ['http://x.test', 'http://y.test'])[1], 'http://y.test/eventsnextleague.php?id=4339');
});

test('hafta: olay → maç (saat UTC, skor, durum, hafta numarası, rozet)', () => {
  const m = parseOlay(HAFTA13.events[1], 'tur.1', { now: NOW, lgName: 'Süper Lig' });
  assert.equal(m.id, 'tsdb:2');
  assert.equal(m.t, Date.UTC(2026, 10, 27, 17, 0));
  assert.equal(m.state, 'post');
  assert.equal(m.text, 'MS');
  assert.deepEqual([m.home.score, m.away.score], [1, 2]);
  assert.equal(m.home.logo, 'https://r2.thesportsdb.com/a.png/small');
  assert.equal(m.away.logo, undefined);
  assert.equal(m.round, '13. hafta');
  assert.equal(m.lg, 'tur.1');
  assert.equal(m.src, 'tsdb');
  assert.equal(m.grp, 'tr');
  const ileri = parseOlay(HAFTA13.events[0], 'tur.1', { now: NOW });
  assert.equal(ileri.state, 'pre');
  assert.equal(ileri.home.score, null);
  assert.equal(ileri.text, '');
});

test('hafta: durumlar (ertelendi, canlı, güncellenmemiş eski maç) ve bozuk kayıtlar', () => {
  const t = (ek) => parseOlay(ol('9', 'A', 'B', '2026-11-27', '19:00:00', ek), 'eng.1', { now: NOW });
  assert.equal(t({ strStatus: 'Postponed' }).off, true);
  assert.equal(t({ strPostponed: 'yes' }).text, 'Ertelendi');
  const canli = t({ strStatus: '1H', intHomeScore: '1', intAwayScore: '0' });
  assert.equal(canli.state, 'in');
  assert.equal(canli.home.score, 1);
  assert.equal(parseOlay(ol('9', 'A', 'B', '2026-11-27', '12:00:00', { strStatus: 'Not Started', intHomeScore: '2', intAwayScore: '2' }), 'eng.1', { now: NOW }).state, 'post', 'saati 3,5 saatten eski ve skoru var');
  assert.equal(parseOlay(null, 'tur.1'), null);
  assert.equal(parseOlay({ idEvent: 'x', strHomeTeam: 'A' }, 'tur.1'), null);
  assert.equal(parseOlay({ strEvent: 'Aslan vs Bora', dateEvent: '2026-12-01', strTime: '17:00:00' }, 'tur.1').home.name, 'Aslan', 'takım alanı yoksa başlıktan');
  const maclar = parseHafta(HAFTA13, 'tur.1', { now: NOW });
  assert.equal(maclar.length, 5, 'bozuk kayıtlar atlanır');
  assert.deepEqual(maclar.map((m) => m.id), ['tsdb:2', 'tsdb:3', 'tsdb:4', 'tsdb:1', 'tsdb:5']);
  assert.deepEqual(parseHafta({ events: null }, 'tur.1'), []);
});

test('hafta: tur nesnesi cuma–pazartesi günlerini kapsar', () => {
  const tur = haftaTur(13, parseHafta(HAFTA13, 'tur.1', { now: NOW }), '2026-2027');
  assert.equal(tur.no, 13);
  assert.equal(tur.bas, new Date(2026, 10, 27).getTime());
  assert.equal(tur.son, new Date(2026, 10, 30).getTime());
  assert.equal(tur.tam, true);
  assert.equal(tur.sezon, '2026-2027');
});

test('hafta: haftaAl yedek adrese geçer; hiçbiri çalışmazsa ayrıntılı hata atar; hafta yoksa boş liste', async () => {
  let n = 0;
  const net = { json: async () => (++n === 1 ? Promise.reject(new Error('HTTP 429')) : HAFTA13) };
  const r = await haftaAl({ net, ligId: 'tur.1', no: 13, sezon: '2026-2027', now: NOW });
  assert.equal(r.maclar.length, 5);
  assert.equal(n, 2);
  await assert.rejects(haftaAl({ net: { json: async () => Promise.reject(new Error('HTTP 500')) }, ligId: 'tur.1', no: 13, sezon: 'x', now: NOW }), (e) => /alınamadı/.test(e.message) && /HTTP 500/.test(e.detail));
  await assert.rejects(haftaAl({ net: { json: async () => ({ x: 1 }) }, ligId: 'tur.1', no: 13, sezon: 'x', now: NOW }), (e) => /Beklenmeyen/.test(e.detail));
  const bos = await haftaAl({ net: { json: async () => ({ events: null }) }, ligId: 'tur.1', no: 99, sezon: '2026-2027', now: NOW });
  assert.deepEqual(bos.maclar, []);
});

test('hafta: güncel hafta sıradaki maçın numarası ve sezonundan', async () => {
  const net = { json: async () => ({ events: [{ strHomeTeam: 'A', strAwayTeam: 'B', intRound: '13', strSeason: '2026-2027' }] }) };
  assert.deepEqual(await guncelHafta({ net, ligId: 'tur.1' }), { no: 13, sezon: '2026-2027' });
  assert.equal(await guncelHafta({ net: { json: async () => ({ events: null }) }, ligId: 'tur.1' }), null);
});

test('hafta: haftaCoz güncel haftayı bulur, önbellekler, gezinir, olmayan haftada yok döner', async () => {
  const a = ag((u) => (u.includes('eventsnextleague') ? { events: [{ intRound: '13', strSeason: '2026-2027' }] } : u.includes('r=13') ? HAFTA13 : { events: null }));
  const onbellek = new Map();
  const r = await haftaCoz({ net: a.net, ligId: 'tur.1', now: NOW, onbellek });
  assert.equal(r.tur.no, 13);
  assert.equal(r.tur.maclar.length, 5);
  assert.equal(a.calls.length, 2); // sıradaki maç + hafta
  // aynı haftayı yeniden iste: önbellekten (yalnız güncel numara için bir istek)
  const r2 = await haftaCoz({ net: a.net, ligId: 'tur.1', no: 13, sezon: '2026-2027', now: NOW + 60e3, onbellek });
  assert.equal(r2.tur.no, 13);
  assert.equal(a.calls.length, 2, 'hafta önbellekten geldi');
  // oynanmamış maçı olan hafta 10 dk sonra yeniden istenir
  await haftaCoz({ net: a.net, ligId: 'tur.1', no: 13, sezon: '2026-2027', now: NOW + 11 * 60e3, onbellek });
  assert.equal(a.calls.length, 3);
  // olmayan hafta: yok
  const yok = await haftaCoz({ net: a.net, ligId: 'tur.1', no: 40, yon: 1, sezon: '2026-2027', now: NOW, onbellek });
  assert.deepEqual([yok.tur, yok.yok], [null, true]);
  assert.deepEqual(await haftaCoz({ net: a.net, ligId: 'tur.1', no: 0, yon: 1, now: NOW, onbellek }), null, 'numara bilinmeden gezilemez');
  assert.equal(await haftaCoz({ net: a.net, ligId: 'uefa.champions', now: NOW, onbellek }), null, 'desteklenmeyen lig');
  assert.equal((await haftaCoz({ net: a.net, ligId: 'tur.1', no: 0, now: NOW, onbellek, zorla: true })).tur.no, 13);
  assert.equal((await haftaCoz({ net: a.net, ligId: 'tur.1', no: 0, now: NOW, onbellek: new Map() })).tur.sezon, '2026-2027');
});

test('hafta: canlı karşılık eşleştirme (farklı yazılışlar, en yakın saat, tsdb maçı aday olmaz)', () => {
  const m = (id, h, a, t, ek = {}) => ({ id, t, src: 'ls', state: 'pre', home: { name: h, label: h }, away: { name: a, label: a }, ...ek });
  const T = Date.UTC(2026, 10, 28, 16, 0);
  const x = m('tsdb:4', 'Gaziantep', 'Amed', T, { src: 'tsdb' });
  const adaylar = [
    m('ls:a', 'Gaziantep FK', 'Amed Sportif Faaliyetler', T + 5 * 60000),
    m('ls:b', 'Gaziantep FK', 'Amedspor', T + 60 * 60000),
    m('ls:c', 'Konyaspor', 'Alanyaspor', T),
    m('tsdb:z', 'Gaziantep', 'Amed', T, { src: 'tsdb' }),
  ];
  assert.equal(eslestir(x, adaylar).id, 'ls:a');
  assert.equal(eslestir(x, [adaylar[2]]), null);
  assert.equal(eslestir(x, [m('ls:u', 'Gaziantep FK', 'Başka', T + 4 * 3600e3)]), null, '3 saatten uzak');
  // bir takım eşleşir, diğeri farklı yazılmış: ±90 dk içinde aynı maç
  assert.equal(eslestir(x, [m('ls:d', 'Gaziantep FK', 'Amed SK', T + 30 * 60000)]).id, 'ls:d');
  assert.equal(eslestir(x, [m('ls:e', 'Gaziantep FK', 'Başka Takım', T + 2 * 3600e3)]), null);
  assert.equal(eslestir(x, []), null);
});
