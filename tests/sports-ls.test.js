import test from 'node:test';
import assert from 'node:assert/strict';
import { lsDateKey, lsTz, lsUrls, parseEsd, lsStatus, groupOf, parseLiveScore, loadLiveScoreDay, sameTeam, mergeSources, lsDetailUrls, lsEidOf, parseLsEvents, loadLsEvents } from '../www/js/sports-ls.js';
import { sections, chipsFor, capSections, teamKeys } from '../www/js/sports.js';

const esd = (y, mo, d, h, mi) => `${y}${String(mo).padStart(2, '0')}${String(d).padStart(2, '0')}${String(h).padStart(2, '0')}${String(mi).padStart(2, '0')}00`;
const ev = (eid, a, b, e, extra = {}) => ({ Eid: eid, Esd: e, Eps: 'NS', T1: [{ Nm: a }], T2: [{ Nm: b }], ...extra });

const DAYMS = new Date(2026, 10, 12, 0, 0, 0).getTime();

const FIX = {
  Stages: [
    { Sid: 's1', Cnm: 'Turkey', Snm: 'TFF 1. Lig', CompN: 'TFF 1. Lig', Events: [ev('e1', 'Bandirmaspor', 'Manisa FK', esd(2026, 11, 12, 14, 0), { Eps: 'FT', Tr1: '2', Tr2: '1' })] },
    { Sid: 's2', Cnm: 'Turkey', Snm: 'Super Lig', Events: [ev('e2', 'Galatasaray', 'Fenerbahce', esd(2026, 11, 12, 20, 0))] },
    { Sid: 's3', Cnm: 'Brazil', Snm: 'Serie A', Events: [ev('e3', 'Flamengo', 'Palmeiras', esd(2026, 11, 12, 22, 0), { Eps: "34'", Tr1: '1', Tr2: '0' })] },
    { Sid: 's4', Cnm: 'World', Snm: 'Friendlies', Events: [ev('e4', 'Turkey', 'Italy', esd(2026, 11, 12, 21, 45), { Eps: 'Postp.' })] },
    { Sid: 's5', Cnm: 'England', Snm: 'Championship', Events: [ev('e5', 'Leeds', 'Burnley', esd(2026, 11, 12, 20, 45), { Eps: 'HT', Tr1: '0', Tr2: '0' }), { Eid: 'bad', Esd: 'x', T1: [{ Nm: 'A' }], T2: [{ Nm: 'B' }] }, { Eid: 'bad2', Esd: esd(2026, 11, 12, 1, 0), T1: [], T2: [] }, null] },
    { Sid: 's6', Cnm: 'Turkey', Snm: 'Bos' },
    null,
  ],
};

test('adres: gün anahtarı, saat dilimi ve yedekler', () => {
  assert.equal(lsDateKey(DAMS()), '20261112');
  const tz = lsTz(DAMS());
  assert.match(tz, /^-?\d+(\.\d+)?$/);
  const u = lsUrls(DAMS());
  assert.equal(u.length, 3);
  assert.match(u[0], /^https:\/\/prod-public-api\.livescore\.com\/v1\/api\/app\/date\/soccer\/20261112\/-?\d+(\.5)?\?countryCode=TR&locale=en&MD=1$/);
  assert.match(u[1], /^https:\/\/prod-cdn-public-api\.livescore\.com/);
  assert.ok(!u[2].includes('?'));
  assert.deepEqual(lsUrls(DAMS(), 'http://x.test').map((x) => x.split('/')[2]), ['x.test', 'x.test']);
});
function DAMS() {
  return DAYMS;
}

test('Esd: 14 haneli yerel zaman; geçersiz değer null', () => {
  const t = parseEsd('20261112200000');
  const d = new Date(t);
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2026, 10, 12, 20, 0]);
  assert.equal(parseEsd(20261112200000), t);
  assert.equal(parseEsd('202611122000'), t);
  for (const bad of [null, undefined, '', 'abc', '2026', '20261340250000', 12]) assert.equal(parseEsd(bad), null, String(bad));
});

test('durum kodları', () => {
  const k = (raw, o) => lsStatus(raw, o);
  assert.deepEqual(k('NS'), { state: 'pre', text: '' });
  assert.deepEqual(k(''), { state: 'pre', text: '' });
  assert.deepEqual(k(null), { state: 'pre', text: '' });
  assert.deepEqual(k('FT'), { state: 'post', text: 'MS' });
  assert.deepEqual(k('AET'), { state: 'post', text: 'MS (uzatma)' });
  assert.equal(k('AP').text, 'MS (pen.)');
  assert.equal(k('FT Pen').text, 'MS (pen.)');
  assert.deepEqual(k('HT'), { state: 'in', text: 'Devre arası' });
  assert.deepEqual(k("67'"), { state: 'in', text: "67'" });
  assert.deepEqual(k('45+2'), { state: 'in', text: "45+2'" });
  assert.deepEqual(k("90+3'"), { state: 'in', text: "90+3'" });
  assert.deepEqual(k('Postp.'), { state: 'pre', text: 'Ertelendi', off: true });
  assert.deepEqual(k('Canc.'), { state: 'post', text: 'İptal', off: true });
  assert.deepEqual(k('Abn.'), { state: 'post', text: 'Yarıda kaldı', off: true });
  // tanınmayan kod: skoru olan eski maç bitti, yeni maç sürüyor; skorsuz maç başlamadı
  const now = Date.now();
  assert.equal(k('XYZ', { t: now - 5 * 3600e3, now, scored: true }).state, 'post');
  assert.equal(k('XYZ', { t: now - 3600e3, now, scored: true }).state, 'in');
  assert.equal(k('XYZ', { t: now + 3600e3, now, scored: false }).state, 'pre');
});

test('grup: Türkiye, uluslararası, büyük Avrupa, diğer', () => {
  assert.equal(groupOf('Turkey'), 'tr');
  assert.equal(groupOf('Türkiye'), 'tr');
  assert.equal(groupOf('World'), 'int');
  assert.equal(groupOf('Europe'), 'int');
  assert.equal(groupOf('England'), 'eu');
  assert.equal(groupOf('Brazil'), 'oth');
  assert.equal(groupOf(''), 'oth');
});

test('parseLiveScore: maçlar, durumlar, gruplar; bozuk kayıtlar atlanır', () => {
  const ms = parseLiveScore(FIX, { now: new Date(2026, 10, 12, 22, 0).getTime() });
  assert.equal(ms.length, 5);
  const by = Object.fromEntries(ms.map((m) => [m.id.split(':')[2], m]));
  assert.equal(by.e1.state, 'post');
  assert.deepEqual([by.e1.home.score, by.e1.away.score], [2, 1]);
  assert.equal(by.e1.src, 'ls');
  assert.equal(by.e1.lg, 'ls:turkey-tff-1-lig');
  assert.equal(by.e1.round, '');
  assert.equal(by.e1.lgName, 'Türkiye · TFF 1. Lig');
  assert.equal(by.e1.grp, 'tr');
  assert.equal(by.e2.state, 'pre');
  assert.equal(by.e2.home.score, null);
  assert.equal(by.e2.ord, 0); // Süper Lig önce
  assert.ok(by.e1.ord > by.e2.ord);
  assert.deepEqual([by.e3.state, by.e3.text, by.e3.home.score], ['in', "34'", 1]);
  assert.equal(by.e3.grp, 'oth');
  assert.equal(by.e4.off, true);
  assert.equal(by.e4.home.label, 'Türkiye'); // milli takım Türkçe gösterilir
  assert.equal(by.e4.grp, 'int');
  assert.equal(by.e5.text, 'Devre arası');
  assert.equal(by.e5.grp, 'eu');
  assert.equal(by.e5.lgName, 'İngiltere · Championship');
  assert.equal(new Date(by.e2.t).getHours(), 20);
});

test('parseLiveScore: beklenmeyen biçimler hata atmaz', () => {
  for (const j of [null, undefined, 5, 'x', {}, { Stages: null }, { Stages: [null, 1, {}, { Events: 'x' }] }]) assert.deepEqual(parseLiveScore(j), []);
});

test('loadLiveScoreDay: yedek adrese düşer, biçim ve ağ hataları ayrıntıyla bildirilir', async () => {
  const urls = [];
  const net = { json: async (u) => (urls.push(u), urls.length === 1 ? Promise.reject(new Error('HTTP 403')) : FIX) };
  const r = await loadLiveScoreDay({ net, dayMs: DAYMS, now: Date.now() });
  assert.equal(urls.length, 2);
  assert.match(r.url, /prod-cdn-public-api/);
  assert.equal(r.matches.length, 5);

  const bad = { json: async () => ({ foo: 1 }) };
  await assert.rejects(loadLiveScoreDay({ net: bad, dayMs: DAYMS }), (e) => {
    assert.match(e.message, /LiveScore/);
    assert.match(e.detail, /Beklenmeyen yanıt biçimi/);
    assert.match(e.detail, /3 adres/);
    return true;
  });
  const down = { json: async () => Promise.reject(new Error('HTTP 503')) };
  await assert.rejects(loadLiveScoreDay({ net: down, dayMs: DAYMS }), (e) => /HTTP 503/.test(e.detail));
  const nul = { json: async () => null };
  await assert.rejects(loadLiveScoreDay({ net: nul, dayMs: DAYMS }), (e) => /Boş yanıt/.test(e.detail));
});

test('loadLiveScoreDay: yanıt vermeyen sunucu zaman aşımına uğrar', async () => {
  const net = { json: () => new Promise(() => {}) };
  await assert.rejects(loadLiveScoreDay({ net, dayMs: DAYMS, timeoutMs: 20 }), (e) => /zamanında/.test(e.detail));
});

test('sameTeam: yazım farkları aynı, benzer adlar farklı', () => {
  const yes = [['Inter', 'Inter Milan'], ['Manchester Utd', 'Manchester United'], ['Galatasaray', 'Galatasaray SK'], ['Bayer Leverkusen', 'Leverkusen'], ['Man City', 'Manchester City'], ['Milan', 'AC Milan'], ['Bayern Munchen', 'Bayern Munich']];
  for (const [a, b] of yes) assert.ok(sameTeam(a, b), `${a} = ${b}`);
  const no = [['Real Madrid', 'Atletico Madrid'], ['Milan', 'Inter Milan'], ['Arsenal', 'Arsenal W'], ['Bayern Munich', 'Bayern Munich II'], ['Manchester City', 'Manchester United'], ['Brazil', 'Brazil U20'], ['Sporting CP', 'Sporting Gijon']];
  for (const [a, b] of no) assert.ok(!sameTeam(a, b), `${a} ≠ ${b}`);
});

test('teamKeys: tek sözcük paylaşımı yetmez', () => {
  const k = teamKeys('Real Madrid');
  assert.ok(k.strong.has('real madrid'));
  assert.ok(!k.strong.has('madrid'));
  assert.equal(teamKeys('VfL Wolfsburg').single, 'wolfsburg');
});

const E = (id, lg, h, a, t, extra = {}) => ({ id: `${lg}:${id}`, lg, t, state: 'pre', text: '', off: false, home: { name: h, label: h, score: null }, away: { name: a, label: a, score: null }, venue: '', intl: [], ...extra });
const L = (id, h, a, t, extra = {}) => ({ id: `ls:s:${id}`, lg: 'ls:s', lgName: 'X · Y', grp: 'eu', ord: 5, src: 'ls', t, state: 'pre', text: '', off: false, home: { name: h, label: h, score: null }, away: { name: a, label: a, score: null }, venue: '', intl: [], ...extra });
const T0 = new Date(2026, 10, 12, 20, 0).getTime();
const H = 3600e3;

test('birleştirme: aynı maç tek kalır (ESPN), ESPN\'de olmayanlar eklenir', () => {
  const espn = [E('1', 'tur.1', 'Galatasaray', 'Fenerbahçe', T0, { home: { name: 'Galatasaray', label: 'Galatasaray', score: null, logo: 'https://l/g.png' } })];
  const ls = [
    L('a', 'Galatasaray', 'Fenerbahce', T0 + 5 * 60000), // aynı maç (saat 5 dk farklı)
    L('b', 'Bandirmaspor', 'Manisa FK', T0 - 6 * H),
    L('c', 'Fenerbahce', 'Galatasaray', T0 + 4 * H), // aynı takımlar, farklı saat: ayrı maç (rövanş)
  ];
  const r = mergeSources(espn, ls);
  assert.equal(r.dupes, 1);
  assert.deepEqual(r.matches.map((m) => m.id), ['ls:s:b', 'tur.1:1', 'ls:s:c']);
  assert.equal(r.matches[1].home.logo, 'https://l/g.png');
  assert.equal(r.shift, 0);
});

test('birleştirme: ev sahibi/deplasman ters yazılmış aynı maç tekrarlanmaz; kadın/genç takımı ayrı sayılır', () => {
  const espn = [E('1', 'eng.1', 'Arsenal', 'Chelsea', T0)];
  const r = mergeSources(espn, [L('a', 'Chelsea', 'Arsenal', T0), L('b', 'Arsenal W', 'Chelsea W', T0)]);
  assert.deepEqual(r.matches.map((m) => m.id), ['eng.1:1', 'ls:s:b']);
});

test('birleştirme: LiveScore saatleri saat dilimi kadar kaymışsa ESPN\'e göre düzeltilir', () => {
  const espn = [E('1', 'tur.1', 'Galatasaray', 'Fenerbahçe', T0), E('2', 'eng.1', 'Arsenal', 'Chelsea', T0 + 1.5 * H)];
  const ls = [
    L('a', 'Galatasaray', 'Fenerbahce', T0 - 3 * H),
    L('b', 'Arsenal', 'Chelsea', T0 + 1.5 * H - 3 * H),
    L('c', 'Bandirmaspor', 'Manisa FK', T0 - 3 * H),
  ];
  const r = mergeSources(espn, ls);
  assert.equal(r.shift, 3 * H);
  assert.equal(r.dupes, 2);
  const c = r.matches.find((m) => m.id === 'ls:s:c');
  assert.equal(c.t, T0); // düzeltilmiş saat
  assert.equal(ls[2].t, T0 - 3 * H); // girdi değişmez
});

test('birleştirme: ESPN boşsa (indirilemediyse) LiveScore maçlarının hepsi gelir; girdiler bozulmaz', () => {
  const ls = [L('a', 'A', 'B', T0), L('b', 'C', 'D', T0 + H), L('a', 'A', 'B', T0)];
  const r = mergeSources([], ls);
  assert.equal(r.matches.length, 2);
  assert.equal(mergeSources(null, null).matches.length, 0);
});

test('bölümler: ESPN ligleri önce, sonra LiveScore grupları; "Tümü" diğer ülkeleri içermez', () => {
  const day = [
    E('1', 'tur.1', 'A', 'B', T0),
    L('1', 'C', 'D', T0, { lg: 'ls:tr2', lgName: 'Türkiye · TFF 1. Lig', grp: 'tr', ord: 2 }),
    L('2', 'E', 'F', T0, { lg: 'ls:tr1', lgName: 'Türkiye · Süper Lig', grp: 'tr', ord: 0 }),
    L('3', 'G', 'H', T0, { lg: 'ls:i', lgName: 'Dünya · Hazırlık', grp: 'int', ord: 5 }),
    L('4', 'I', 'J', T0, { lg: 'ls:eu', lgName: 'İngiltere · Championship', grp: 'eu', ord: 5 }),
    L('5', 'K', 'L', T0, { lg: 'ls:br', lgName: 'Brezilya · Serie A', grp: 'oth', ord: 5 }),
    L('6', 'M', 'N', T0 + H, { lg: 'ls:br', lgName: 'Brezilya · Serie A', grp: 'oth', ord: 5 }),
  ];
  const all = sections(day, '');
  assert.deepEqual(all.map((s) => s.lg.name), ['Süper Lig', 'Türkiye · Süper Lig', 'Türkiye · TFF 1. Lig', 'Dünya · Hazırlık', 'İngiltere · Championship']);
  assert.deepEqual(sections(day, 'g:oth').map((s) => s.lg.name), ['Brezilya · Serie A']);
  assert.equal(sections(day, 'g:oth')[0].matches.length, 2);
  assert.equal(sections(day, 'g:tr').length, 2);
  assert.deepEqual(sections(day, 'ls:i').map((s) => s.matches.length), [1]);
  assert.deepEqual(sections(day, 'tur.1').map((s) => s.lg.id), ['tur.1']);

  const c = chipsFor(day);
  assert.equal(c.all, 5);
  assert.deepEqual(c.chips.map((x) => [x.id, x.count]), [['tur.1', 1], ['g:tr', 2], ['g:int', 1], ['g:eu', 1], ['g:oth', 2]]);
  assert.deepEqual(chipsFor([]), { all: 0, chips: [] });
});

test('uzun liste kesilir', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => L(String(i), 'A' + i, 'B' + i, T0 + i));
  const secs = [{ lg: { id: 'a', name: 'A' }, matches: mk(400) }, { lg: { id: 'b', name: 'B' }, matches: mk(300) }, { lg: { id: 'c', name: 'C' }, matches: mk(50) }];
  const r = capSections(secs, 500);
  assert.deepEqual(r.secs.map((s) => s.matches.length), [400, 100]);
  assert.equal(r.hidden, 250);
  assert.equal(capSections(secs, 5000).hidden, 0);
});

test('parseLiveScore: yarışma + aşama → lig adı yarışma, tur bilgisi aşama; aşamalar tek bölümde toplanır', () => {
  const j = {
    Stages: [
      { Sid: 'a', Cnm: 'World', Snm: 'Group A', CompN: 'World Cup Qualification Europe', Events: [ev('x1', 'Turkey', 'Spain', esd(2026, 11, 12, 21, 45), { ErnInf: 'Matchday 3' })] },
      { Sid: 'b', Cnm: 'World', Snm: 'Group B', CompN: 'World Cup Qualification Europe', Events: [ev('x2', 'Italy', 'Norway', esd(2026, 11, 12, 21, 45))] },
      { Sid: 'c', Cnm: 'Europe', Snm: 'Quarter-finals', CompN: 'UEFA Nations League', Events: [ev('x3', 'France', 'Portugal', esd(2026, 11, 12, 21, 45))] },
    ],
  };
  const by = Object.fromEntries(parseLiveScore(j, { now: 0 }).map((m) => [m.id.split(':')[2], m]));
  assert.equal(by.x1.lgName, 'Dünya · World Cup Qualification Europe');
  assert.equal(by.x1.round, 'Grup A · 3. hafta');
  assert.equal(by.x2.round, 'Grup B');
  assert.equal(by.x1.lg, by.x2.lg, 'aynı yarışmanın grupları tek bölüm');
  assert.notEqual(by.x1.id, by.x2.id);
  assert.equal(by.x3.round, 'Çeyrek final');
  assert.match(by.x3.lgName, /UEFA Nations League/);
});

test('lsEidOf / lsDetailUrls: maç özeti adresi cdn önce, Eid kimlikten de okunur', () => {
  assert.equal(lsEidOf({ eid: '1234567' }), '1234567');
  assert.equal(lsEidOf({ id: 'ls:5:1234567' }), '1234567', 'eski kayıt: kimliğin sonu');
  assert.equal(lsEidOf({ id: 'ls:5:1700000000000-a-b' }), '', 'uydurma kimlik Eid sayılmaz');
  assert.equal(lsEidOf(null), '');
  const u = lsDetailUrls('77777');
  assert.equal(u[0], 'https://prod-cdn-public-api.livescore.com/v1/api/app/scoreboard/soccer/77777?locale=en');
  assert.equal(u.length, 2);
});

test('parseLsEvents: "Incs-s" gollerinden dakika, oyuncu ve takım; skor yalnız sayılar tutarsa yazılır', () => {
  const m = { home: { score: 2 }, away: { score: 1 } };
  const json = { 'Incs-s': { 1: [{ Min: 54, Pn: 'A. Ev', IT: 36 }, { Min: '12', Pn: 'B. Ev', IT: 36 }], 2: [{ Min: 90, MinEx: 3, Pn: 'C. Dep', IT: 36 }] } };
  const r = parseLsEvents(json, m);
  assert.deepEqual(r.events.map((e) => [e.minute, e.side, e.player, e.score]), [["12'", 'home', 'B. Ev', '1–0'], ["54'", 'home', 'A. Ev', '2–0'], ["90'", 'away', 'C. Dep', '2–1']]);
  assert.ok(r.events.every((e) => e.kind === 'goal' && !e.mark));
  // sayılar uyuşmuyorsa liste yine gelir, skor yazılmaz
  const r2 = parseLsEvents(json, { home: { score: 3 }, away: { score: 1 } });
  assert.equal(r2.events.length, 3);
  assert.ok(r2.events.every((e) => e.score === ''));
  // iç içe (periyot / takım) yapı da dolaşılır; takım en yakın 1/2 anahtarından
  const r3 = parseLsEvents({ 'Incs-s': { 1: { 2: [{ Min: 70, Pn: 'X' }] } } }, m);
  assert.equal(r3.events.length, 1);
  assert.equal(r3.events[0].side, 'away');
});

test('parseLsEvents: biçim beklenmedikse boş liste ve neden notu (hata atmaz)', () => {
  assert.deepEqual(parseLsEvents(null, {}).events, []);
  assert.match(parseLsEvents({ Eid: '1', Venue: 'x' }, {}).note, /Incs-s yok \(alanlar: Eid,Venue\)/);
  assert.match(parseLsEvents({ 'Incs-s': {} }, {}).note, /boş/);
  assert.deepEqual(parseLsEvents({ 'Incs-s': [{ foo: 1 }, 5, null] }, {}).events, []);
});

test('loadLsEvents: ilk adres çalışmazsa yedeğe geçer; hepsi başarısızsa events boş ve neden notu', async () => {
  const calls = [];
  const net = { json: async (url) => { calls.push(url); if (url.includes('prod-cdn')) throw new Error('HTTP 403'); return { 'Incs-s': { 1: [{ Min: 5, Pn: 'Y' }] } }; } };
  const m = { eid: '999999', home: { score: 1 }, away: { score: 0 } };
  const r = await loadLsEvents({ net, match: m });
  assert.equal(calls.length, 2);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].score, '1–0');
  const bad = await loadLsEvents({ net: { json: async () => { throw new Error('HTTP 500'); } }, match: m });
  assert.deepEqual(bad, { events: [], note: 'HTTP 500' });
  assert.deepEqual(await loadLsEvents({ net, match: { home: {}, away: {} } }), { events: [], note: 'Maç kimliği yok' });
});

test('parseLiveScore: maç nesnesi Eid taşır (maç özeti için)', () => {
  const j = { Stages: [{ Sid: 's', Cnm: 'Spain', Snm: 'Segunda RFEF', Events: [ev('4321000', 'Castellonense', 'La Nucia', esd(2026, 11, 11, 21, 0), { Eps: "54'", Tr1: '1', Tr2: '1' })] }] };
  const r = parseLiveScore(j, { now: Date.UTC(2026, 10, 11, 19, 0) });
  assert.equal(r[0].eid, '4321000');
});
