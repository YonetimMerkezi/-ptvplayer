import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEAGUES, DAY, scoreboardUrl, scoreboardLadder, statusOf, parseScoreboard, loadMatches, teamPhrases, teamLabel, findProgram,
  trRound, matchRank, slicePrograms, dayLabel, dayStrip, dayStart, matchesOnDay, sections, hasLive,
} from '../www/js/sports.js';

const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 11, 10, 12, 0); // Salı

// ESPN skor tablosu biçiminde örnek kayıt
const ev = (id, iso, home, away, { hs, as, state = 'pre', name = 'STATUS_SCHEDULED', clock = '' } = {}) => ({
  id: String(id),
  date: iso,
  competitions: [{
    status: { displayClock: clock, type: { state, name } },
    competitors: [
      { homeAway: 'home', score: hs, team: { displayName: home, abbreviation: home.slice(0, 3).toUpperCase(), logo: 'https://a.espncdn.com/h.png' } },
      { homeAway: 'away', score: as, team: { displayName: away, abbreviation: away.slice(0, 3).toUpperCase(), logo: 'https://a.espncdn.com/a.png' } },
    ],
  }],
});

test('scoreboardUrl: tarih aralığı YYYYMMDD-YYYYMMDD', () => {
  const u = scoreboardUrl('tur.1', Date.UTC(2026, 10, 9), Date.UTC(2026, 10, 18));
  assert.equal(u, 'https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/scoreboard?dates=20261109-20261118&limit=300');
});

test('statusOf: oynanmamış, canlı, devre arası, bitmiş, ertelenmiş', () => {
  assert.deepEqual(statusOf({ type: { state: 'pre', name: 'STATUS_SCHEDULED' } }), { state: 'pre', text: '' });
  assert.deepEqual(statusOf({ displayClock: "67'", type: { state: 'in', name: 'STATUS_SECOND_HALF' } }), { state: 'in', text: "67'" });
  assert.equal(statusOf({ displayClock: "45'", type: { state: 'in', name: 'STATUS_HALFTIME' } }).text, 'Devre arası');
  assert.equal(statusOf({ displayClock: "0'", type: { state: 'in', name: 'STATUS_FIRST_HALF' } }).text, 'Canlı');
  assert.equal(statusOf({ type: { state: 'in', name: 'STATUS_SHOOTOUT' } }).text, 'Penaltılar');
  assert.equal(statusOf({ type: { state: 'post', name: 'STATUS_FULL_TIME' } }).text, 'MS');
  assert.equal(statusOf({ type: { state: 'post', name: 'STATUS_FINAL_PEN' } }).text, 'MS (pen.)');
  assert.equal(statusOf({ type: { state: 'post', name: 'STATUS_FINAL_AET' } }).text, 'MS (uzatma)');
  const pp = statusOf({ type: { state: 'pre', name: 'STATUS_POSTPONED' } });
  assert.equal(pp.text, 'Ertelendi');
  assert.equal(pp.off, true);
  assert.equal(statusOf({ type: { state: 'post', name: 'STATUS_CANCELED' } }).text, 'İptal');
  assert.equal(statusOf(undefined).state, 'pre'); // eksik veri hata atmaz
  assert.equal(statusOf({ type: { state: 'garip' } }).state, 'pre');
});

test('parseScoreboard: maç, skor (metin → sayı), logo, durum', () => {
  const json = {
    events: [
      ev(1, '2026-11-10T17:00Z', 'Galatasaray', 'Fenerbahçe', { hs: '2', as: '1', state: 'in', name: 'STATUS_SECOND_HALF', clock: "70'" }),
      ev(2, '2026-11-11T17:45Z', 'Real Madrid', 'Barcelona'),
      ev(3, '2026-11-09T17:45Z', 'Turkey', 'Germany', { hs: '0', as: '3', state: 'post', name: 'STATUS_FULL_TIME' }),
    ],
  };
  const m = parseScoreboard(json, 'tur.1');
  assert.equal(m.length, 3);
  assert.equal(m[0].id, 'tur.1:1');
  assert.equal(m[0].t, Date.parse('2026-11-10T17:00Z'));
  assert.equal(m[0].state, 'in');
  assert.equal(m[0].text, "70'");
  assert.equal(m[0].home.score, 2);
  assert.equal(m[0].away.score, 1);
  assert.equal(m[0].home.logo, 'https://a.espncdn.com/h.png');
  assert.equal(m[1].home.score, null, 'oynanmamış maçta skor yok');
  assert.equal(m[2].home.label, 'Türkiye');
  assert.equal(m[2].away.label, 'Almanya');
  assert.equal(m[2].home.name, 'Turkey', 'özgün ad eşleştirme için saklanır');
});

test('parseScoreboard: bozuk/eksik kayıtlar atlanır, hata atmaz', () => {
  const json = {
    events: [
      null,
      {},
      { id: '1', date: 'geçersiz', competitions: [{ competitors: [{ team: { displayName: 'A' } }, { team: { displayName: 'B' } }] }] },
      { id: '2', date: '2026-11-10T17:00Z', competitions: [{ competitors: [{ team: { displayName: 'Tek' } }] }] },
      { id: '3', date: '2026-11-10T17:00Z', competitions: [] },
      ev(4, '2026-11-10T18:00Z', 'A', 'B'),
    ],
  };
  const m = parseScoreboard(json, 'x.1');
  assert.deepEqual(m.map((x) => x.id), ['x.1:4']);
  assert.deepEqual(parseScoreboard(null, 'x'), []);
  assert.deepEqual(parseScoreboard({ events: 'yok' }, 'x'), []);
  // logo adresi yalnız http(s) olabilir
  const w = parseScoreboard({ events: [{ ...ev(5, '2026-11-10T18:00Z', 'A', 'B'), competitions: [{ status: {}, competitors: [{ homeAway: 'home', team: { displayName: 'A', logo: 'javascript:alert(1)' } }, { homeAway: 'away', team: { displayName: 'B' } }] }] }] }, 'x');
  assert.equal(w[0].home.logo, '');
});

test('penaltı skoru okunur', () => {
  const e = ev(6, '2026-11-10T18:00Z', 'A', 'B', { hs: '1', as: '1', state: 'post', name: 'STATUS_FINAL_PEN' });
  e.competitions[0].competitors[0].shootoutScore = 4;
  e.competitions[0].competitors[1].shootoutScore = 3;
  const [m] = parseScoreboard({ events: [e] }, 'x');
  assert.equal(m.home.pen, 4);
  assert.equal(m.away.pen, 3);
});

test('teamPhrases: tam ad, kısa ve Türkçe yazımlar', () => {
  assert.ok(teamPhrases('Bayern Munich').includes('bayern munih'));
  assert.ok(teamPhrases('Manchester United').includes('man utd'));
  assert.ok(!teamPhrases('Manchester United').includes('manchester'), 'belirsiz tek sözcük kullanılmaz');
  assert.ok(!teamPhrases('Manchester United').includes('united'));
  assert.ok(teamPhrases('Fenerbahçe').includes('fenerbahce'));
  assert.ok(teamPhrases('Istanbul Basaksehir').includes('basaksehir'));
  assert.ok(teamPhrases('Turkey').includes('turkiye'));
  assert.ok(teamPhrases('Germany').includes('almanya'));
  assert.ok(teamPhrases('Bayer Leverkusen').includes('leverkusen'));
  assert.ok(teamPhrases('AS Roma').includes('roma'), 'AS eki atılır');
  assert.ok(teamPhrases('Gaziantep FK').includes('gaziantep'));
  assert.ok(teamPhrases('Atlético Madrid').includes('atletico madrid'), 'aksan atılır');
  assert.ok(teamPhrases('Paris Saint-Germain').includes('psg'));
  assert.ok(teamPhrases('Internazionale').includes('inter'));
  for (const p of teamPhrases('Real Madrid')) assert.ok(p.length >= 3);
});

test('teamLabel: milli takım Türkçe, kulüp özgün', () => {
  assert.equal(teamLabel('Turkey'), 'Türkiye');
  assert.equal(teamLabel('Czech Republic'), 'Çekya');
  assert.equal(teamLabel('United States'), 'ABD');
  assert.equal(teamLabel('Galatasaray'), 'Galatasaray');
  assert.equal(teamLabel(''), '?');
});

const M = (home, away, t, lg = 'tur.1') => ({ id: `${lg}:x`, lg, t, home: { name: home }, away: { name: away } });
const P = (id, s, e, t, d = '') => ({ id, p: { s, e, t, d } });
const KICK = at(2026, 11, 10, 20, 0);

test('findProgram: iki takım da başlıkta ve başlangıç maça yakın', () => {
  const m = M('Galatasaray', 'Fenerbahçe', KICK);
  const hits = [
    P('ch1', KICK - 30 * 60000, KICK + 150 * 60000, 'Süper Lig: Galatasaray - Fenerbahçe'),
    P('ch2', KICK, KICK + 120 * 60000, 'Beşiktaş - Trabzonspor'),
  ];
  assert.equal(findProgram(m, hits).id, 'ch1');
});

test('findProgram: yalnız bir takım, uzak saat ya da biten program eşleşmez', () => {
  const m = M('Galatasaray', 'Fenerbahçe', KICK);
  assert.equal(findProgram(m, [P('a', KICK, KICK + 7200000, 'Galatasaray haberleri')]), null, 'tek takım');
  assert.equal(findProgram(m, [P('b', KICK - 5 * 3600000, KICK - 3 * 3600000, 'Galatasaray - Fenerbahçe')]), null, 'uzak/erken biten');
  assert.equal(findProgram(m, [P('c', KICK + 3 * 3600000, KICK + 5 * 3600000, 'Galatasaray - Fenerbahçe')]), null, 'sonraki yayın (tekrar)');
  assert.equal(findProgram(m, [P('d', KICK - 2 * 3600000, KICK - 30 * 60000, 'Galatasaray - Fenerbahçe')]), null, 'maçtan önce bitmiş program');
  assert.equal(findProgram(m, []), null);
  assert.equal(findProgram(m, null), null);
});

test('findProgram: en yakın başlangıç seçilir; açıklamadaki takımlar da sayılır', () => {
  const m = M('Real Madrid', 'Barcelona', KICK, 'esp.1');
  const hits = [
    P('maconu', KICK - 45 * 60000, KICK + 3600000, 'Maç Önü', 'Real Madrid ve Barcelona karşılaşması öncesi'),
    P('mac', KICK - 5 * 60000, KICK + 7200000, 'La Liga', 'El Clasico: Real Madrid - Barcelona'),
  ];
  assert.equal(findProgram(m, hits).id, 'mac');
  assert.equal(findProgram(m, hits.slice(0, 1)).id, 'maconu');
});

test('findProgram: Türkçe ek, kısa ad ve tire/ayraç biçimleri', () => {
  const m = M('Bayern Munich', 'Paris Saint-Germain', KICK, 'uefa.champions');
  assert.ok(findProgram(m, [P('x', KICK, KICK + 7200000, 'Bayern Münih - PSG')]));
  assert.ok(findProgram(m, [P('x', KICK, KICK + 7200000, 'UEFA Şampiyonlar Ligi: Bayern Münih\'in konuğu Paris Saint-Germain')]));
  const t = M('Turkey', 'Germany', KICK, 'fifa.friendly');
  assert.ok(findProgram(t, [P('y', KICK, KICK + 7200000, 'Hazırlık Maçı: Türkiye-Almanya')]));
  assert.ok(findProgram(t, [P('y', KICK, KICK + 7200000, 'Türkiye\'nin Almanya sınavı')]));
});

test('findProgram: kelime sınırı — "Roma" "Romanya" içinde sayılmaz, "Inter" "International" içinde sayılmaz', () => {
  const m = M('AS Roma', 'Inter Milan', KICK, 'ita.1');
  assert.equal(findProgram(m, [P('a', KICK, KICK + 7200000, 'Romanya - International Cup')]), null);
  assert.ok(findProgram(m, [P('b', KICK, KICK + 7200000, 'Serie A: Roma - Inter')]));
});

test('findProgram: Manchester City, Manchester United ile karışmaz', () => {
  const m = M('Manchester City', 'Arsenal', KICK, 'eng.1');
  assert.equal(findProgram(m, [P('a', KICK, KICK + 7200000, 'Manchester United - Arsenal')]), null);
  assert.ok(findProgram(m, [P('b', KICK, KICK + 7200000, 'Premier Lig: Man City - Arsenal')]));
});

test('slicePrograms: sıralı listeden aralık (uçlar dahil)', () => {
  const l = [1, 3, 5, 7, 9].map((s) => P('c', s, s + 1, 'x'));
  assert.deepEqual(slicePrograms(l, 3, 7).map((h) => h.p.s), [3, 5, 7]);
  assert.deepEqual(slicePrograms(l, 0, 2).map((h) => h.p.s), [1]);
  assert.deepEqual(slicePrograms(l, 10, 20), []);
  assert.deepEqual(slicePrograms([], 0, 9), []);
  assert.equal(slicePrograms(l, -5, 99).length, 5);
});

// ---- ağ ----

const fakeNet = (handler) => {
  const calls = [];
  return { calls, json: async (url) => { calls.push(url); return handler(url); } };
};
const slugOf = (url) => /soccer\/([^/]+)\/scoreboard/.exec(url)[1];

test('loadMatches: tüm ligler çekilir, pencere dışı atılır, saat sırasında, tekrarlar tekil', async () => {
  const day = (n, h) => new Date(at(2026, 11, 10 + n, h)).toISOString();
  const net = fakeNet((u) => {
    const s = slugOf(u);
    if (s === 'tur.1') return { events: [ev(1, day(0, 20), 'Galatasaray', 'Fenerbahçe'), ev(2, day(-3, 20), 'Eski', 'Maç'), ev(3, day(9, 20), 'Çok', 'Sonra'), ev(1, day(0, 20), 'Galatasaray', 'Fenerbahçe')] };
    if (s === 'eng.1') return { events: [ev(9, day(-1, 18), 'Arsenal', 'Chelsea', { hs: '1', as: '0', state: 'post', name: 'STATUS_FULL_TIME' })] };
    return { events: [] };
  });
  const r = await loadMatches({ net, now: NOW });
  assert.equal(net.calls.length, LEAGUES.length);
  assert.deepEqual(r.matches.map((m) => m.id), ['eng.1:9', 'tur.1:1']);
  assert.equal(r.okCount, LEAGUES.length);
  assert.deepEqual(r.failed, []);
});

test('loadMatches: bir lig hata verirse diğerleri yine gelir (başarısız olan bildirilir)', async () => {
  const net = fakeNet((u) => {
    if (slugOf(u) === 'esp.1') throw new Error('HTTP 500');
    if (slugOf(u) === 'tur.1') return { events: [ev(1, new Date(at(2026, 11, 10, 20)).toISOString(), 'A', 'B')] };
    return { events: [] };
  });
  const r = await loadMatches({ net, now: NOW });
  assert.equal(r.matches.length, 1);
  assert.deepEqual(r.failed, ['esp.1']);
  assert.equal(r.okCount, LEAGUES.length - 1);
  assert.equal(net.calls.filter((u) => u.includes('/esp.1/')).length, 3, 'başarısız lig üç yalınlıkta denenir (limitli aralık, aralık, parametresiz)');
  assert.match(r.errors['esp.1'], /HTTP 500/);
});

test('loadMatches: hiçbir lig alınamazsa açık hata ve ilk nedenler ayrıntıda', async () => {
  const net = fakeNet(() => { throw new Error('HTTP 403'); });
  await assert.rejects(loadMatches({ net, now: NOW }), (e) => /Maç bilgisi alınamadı/.test(e.message) && /^tur\.1: HTTP 403/.test(e.detail) && e.detail.split(' · ').length === 3);
});

test('scoreboardLadder: limitli aralık → aralık → parametresiz', () => {
  const l = scoreboardLadder('tur.1', Date.UTC(2026, 10, 9), Date.UTC(2026, 10, 18));
  assert.equal(l[0], scoreboardUrl('tur.1', Date.UTC(2026, 10, 9), Date.UTC(2026, 10, 18)));
  assert.match(l[1], /scoreboard\?dates=20261109-20261118$/);
  assert.match(l[2], /tur\.1\/scoreboard$/);
});

test('loadMatches: limit/aralık reddedilirse yalın adrese düşülür, iki ligde görülünce sonrakiler doğrudan oradan başlar', async () => {
  const net = fakeNet((u) => {
    if (u.includes('limit=')) throw new Error('HTTP 400');
    return { events: [] };
  });
  const r = await loadMatches({ net, now: NOW, parallel: 1 });
  assert.equal(r.okCount, LEAGUES.length);
  assert.deepEqual(r.failed, []);
  assert.equal(r.level, 1);
  // ilk iki lig 2'şer istek (limitli + aralık), kalanlar yalnız aralık
  assert.equal(net.calls.length, 2 * 2 + (LEAGUES.length - 2));
  assert.equal(net.calls.filter((u) => u.includes('limit=')).length, 2);
});

test('loadMatches: yalnız parametresiz adres çalışırsa yine maçlar gelir', async () => {
  const net = fakeNet((u) => {
    if (u.includes('dates=')) throw new Error('HTTP 400');
    return { events: [ev(1, new Date(at(2026, 11, 11, 20)).toISOString(), 'Galatasaray', 'Fenerbahçe')] };
  });
  const r = await loadMatches({ net, now: NOW, leagues: [LEAGUES[0]] });
  assert.equal(r.matches.length, 1);
  assert.equal(r.level, 0, 'tek lig oy vermeden basamağı yükseltmez');
});

test('loadMatches: JSON olmayan yanıt hata sayılır', async () => {
  const net = fakeNet(() => null);
  await assert.rejects(loadMatches({ net, now: NOW, leagues: [LEAGUES[0]] }), (e) => /Boş yanıt/.test(e.detail));
});

test('loadMatches: yanıt vermeyen lig zaman aşımına uğrar, diğerlerini bekletmez', async () => {
  const net = fakeNet((u) => (slugOf(u) === 'ger.1' ? new Promise(() => {}) : { events: [] }));
  const r = await loadMatches({ net, now: NOW, timeoutMs: 40 });
  assert.deepEqual(r.failed, ['ger.1']);
});

test('loadMatches: istek adresi geniş tarih aralığı ve istenen taban adresi kullanır', async () => {
  const net = fakeNet(() => ({ events: [] }));
  await loadMatches({ net, now: NOW, base: 'http://mock.test/espn/', leagues: [LEAGUES[0]] });
  assert.equal(net.calls.length, 1);
  assert.match(net.calls[0], /^http:\/\/mock\.test\/espn\/tur\.1\/scoreboard\?dates=\d{8}-\d{8}&limit=300$/);
});

// ---- gün ve bölümler ----

test('dayLabel / dayStrip', () => {
  const strip = dayStrip(NOW);
  assert.equal(strip.length, 9); // dün + bugün + 7 gün
  assert.deepEqual(strip.slice(0, 3).map((d) => dayLabel(d, NOW)), ['Dün', 'Bugün', 'Yarın']);
  assert.equal(dayLabel(strip[3], NOW), 'Per 12 Kas'); // 12 Kasım 2026 Perşembe
  assert.equal(dayLabel(strip[8], NOW), 'Sal 17 Kas'); // 17 Kasım 2026 Salı
  assert.ok(strip.every((d, i) => i === 0 || d > strip[i - 1]));
  assert.equal(dayStart(NOW), strip[1]);
});

test('sections: lig sırası, saat sırası, lig süzgeci; matchesOnDay', () => {
  const mk = (id, lg, t) => ({ id, lg, t, state: 'pre', home: { name: 'A' }, away: { name: 'B' } });
  const ms = [mk('3', 'eng.1', at(2026, 11, 10, 19)), mk('2', 'tur.1', at(2026, 11, 10, 20)), mk('1', 'tur.1', at(2026, 11, 10, 17)), mk('4', 'tur.1', at(2026, 11, 11, 17))];
  const today = matchesOnDay(ms, dayStart(NOW));
  assert.deepEqual(today.map((m) => m.id).sort(), ['1', '2', '3']);
  const sec = sections(today);
  assert.deepEqual(sec.map((s) => s.lg.id), ['tur.1', 'eng.1']);
  assert.deepEqual(sec[0].matches.map((m) => m.id), ['1', '2']);
  assert.deepEqual(sections(today, 'eng.1').map((s) => s.lg.id), ['eng.1']);
  assert.deepEqual(sections(today, 'esp.1'), []);
  assert.equal(hasLive(today), false);
  assert.equal(hasLive([{ state: 'in' }]), true);
  assert.equal(DAY, 86400000);
});

test('lig listesi: kimlikler tekil, her ligin adı var', () => {
  const ids = LEAGUES.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(LEAGUES.every((l) => l.name));
  for (const id of ['tur.1', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'uefa.nations']) assert.ok(ids.includes(id), id);
});

test('trRound: tur/aşama metni Türkçeleşir, uzunluk sınırlı, boş değer boş', () => {
  assert.equal(trRound('Group Stage - Matchday 3'), 'Grup aşaması · 3. hafta');
  assert.equal(trRound('Quarter-finals'), 'Çeyrek final');
  assert.equal(trRound('Semi-Finals'), 'Yarı final');
  assert.equal(trRound('Round of 16'), 'Son 16');
  assert.equal(trRound('Group C'), 'Grup C');
  assert.equal(trRound('Round 12'), '12. hafta');
  assert.equal(trRound('Final'), 'Final');
  assert.equal(trRound('Leg 2'), '2. maç');
  assert.equal(trRound('Özel Tur'), 'Özel Tur');
  assert.equal(trRound(''), '');
  assert.equal(trRound(null), '');
  assert.ok(trRound('x'.repeat(200)).length <= 48);
});

test('parseScoreboard: tur bilgisi notlardan okunur, yoksa boş', () => {
  const withNote = ev(1, '2026-11-10T17:00Z', 'A', 'B');
  withNote.competitions[0].notes = [{ headline: 'Quarter-finals' }];
  const evNote = ev(2, '2026-11-10T17:00Z', 'C', 'D');
  evNote.notes = ['Group Stage - Matchday 2'];
  const plain = ev(3, '2026-11-10T17:00Z', 'E', 'F');
  const [a, b, c] = parseScoreboard({ events: [withNote, evNote, plain] }, 'x.1');
  assert.equal(a.round, 'Çeyrek final');
  assert.equal(b.round, 'Grup aşaması · 2. hafta');
  assert.equal(c.round, '');
});

test('matchRank: ESPN ligleri LEAGUES sırasıyla, diğerleri sonra kendi sırasıyla', () => {
  const first = LEAGUES[0].id;
  const last = LEAGUES[LEAGUES.length - 1].id;
  assert.ok(matchRank({ lg: first }) < matchRank({ lg: last }));
  assert.ok(matchRank({ lg: last }) < matchRank({ lg: 'se:x', ord: 0 }));
  assert.ok(matchRank({ lg: 'se:x', ord: 1 }) < matchRank({ lg: 'ls:y', ord: 5 }));
  assert.equal(matchRank({ lg: 'ls:y' }), 100);
  // aynı saatteki maçlarla sıralama çökmez
  const rows = [{ id: 'b', t: 1, lg: 'ls:y', ord: 3 }, { id: 'a', t: 1, lg: first }, { id: 'c', t: 1, lg: 'se:x', ord: 1 }];
  rows.sort((a, b) => a.t - b.t || matchRank(a) - matchRank(b) || a.id.localeCompare(b.id));
  assert.deepEqual(rows.map((r) => r.id), ['a', 'c', 'b']);
});
