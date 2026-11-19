import test from 'node:test';
import assert from 'node:assert/strict';
import { lsDateKey, lsTz, lsUrls, parseEsd, lsStatus, groupOf, parseLiveScore, loadLiveScoreDay, sameTeam, mergeSources, lsDetailUrls, lsEidOf, parseLsEvents, loadLsEvents, parseLsIncidents, parseLsLineups, parseLsStats, inScope, isWomenTeam } from '../www/js/sports-ls.js';
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
  assert.equal(ms.length, 4); // Brezilya (Avrupa dışı lig) kapsam dışıdır
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
  assert.equal(by.e3, undefined, 'Avrupa dışı ülke ligi kapsam dışı');
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
  assert.equal(r.matches.length, 4);

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

test('parseLsEvents: gerçek cihaz örneği — "1" devre anahtarı, takım alanı yok: 0-1 skorunda gol deplasmanındır', () => {
  const r = parseLsEvents({ 'Incs-s': { 1: [{ Min: 6, Pn: 'Missy Bo Kearns', IT: 36 }] } }, { home: { score: 0 }, away: { score: 1 } });
  assert.deepEqual(r.events.map((e) => [e.minute, e.side, e.player, e.score]), [["6'", 'away', 'Missy Bo Kearns', '0–1']]);
  assert.equal(r.warn, '');
});

test('parseLsEvents: gerçek cihaz örneği 7-0 — anahtarlar devre (1: ilk, 2: ikinci yarı); tüm goller ev sahibinindir', () => {
  const json = { 'Incs-s': { 1: [{ Min: 24, Pn: 'Lucie Calba' }, { Min: 41, Pn: 'Cindy Caputo' }, { Min: 42, Pn: 'Lucie Calba' }], 2: [{ Min: 55, Pn: 'Emelyne Laurent' }, { Min: 68, Pn: 'Louna Ribadeira' }, { Min: 82, Pn: 'Batcheba Louis' }, { Min: 89, Pn: 'Louna Ribadeira' }] } };
  const r = parseLsEvents(json, { home: { score: 7 }, away: { score: 0 } });
  assert.equal(r.events.length, 7);
  assert.ok(r.events.every((e) => e.side === 'home'), 'ikinci yarı golleri deplasmana yazılmaz');
  assert.deepEqual(r.events.map((e) => e.score), ['1–0', '2–0', '3–0', '4–0', '5–0', '6–0', '7–0']);
  assert.equal(r.warn, '');
});

test('parseLsEvents: takım sırayla gol sonrası skordan (Sc), olaydaki takım numarasından, maç skorundan, anahtardan çıkar', () => {
  // Sc: hangi sayı arttıysa o takım; devre anahtarları (1/2) takım sanılmaz
  const sc = { 'Incs-s': { 1: [{ Min: 10, Pn: 'A', Sc: [0, 1] }, { Min: 30, Pn: 'B', Sc: [1, 1] }], 2: [{ Min: 60, Pn: 'C', Sc: [1, 2] }, { Min: 80, Pn: 'D', Sc: [2, 2] }] } };
  const r1 = parseLsEvents(sc, { home: { score: 2 }, away: { score: 2 } });
  assert.deepEqual(r1.events.map((e) => [e.player, e.side, e.score]), [['A', 'away', '0–1'], ['B', 'home', '1–1'], ['C', 'away', '1–2'], ['D', 'home', '2–2']]);
  // olaydaki takım numarası (Nm: 1 ev sahibi, 2 deplasman)
  const tn = { 'Incs-s': { 1: [{ Min: 5, Pn: 'A', Nm: 2 }, { Min: 25, Pn: 'B', Nm: 1 }], 2: [{ Min: 70, Pn: 'C', Nm: 1 }] } };
  const r2 = parseLsEvents(tn, { home: { score: 2 }, away: { score: 1 } });
  assert.deepEqual(r2.events.map((e) => [e.player, e.side, e.score]), [['A', 'away', '0–1'], ['B', 'home', '1–1'], ['C', 'home', '2–1']]);
  // maç skoru: bir takım hiç atmadıysa hepsi diğerinin
  const r3 = parseLsEvents({ 'Incs-s': { 1: [{ Min: 12, Pn: 'A' }], 2: [{ Min: 50, Pn: 'B' }, { Min: 88, Pn: 'C' }] } }, { home: { score: 3 }, away: { score: 0 } });
  assert.deepEqual(r3.events.map((e) => e.side), ['home', 'home', 'home']);
  // anahtar yalnız sayıları skorla tam tutuyorsa takımdır (1 ev sahibi, 2 deplasman)
  const key = { 'Incs-s': { 1: [{ Min: 12, Pn: 'A' }], 2: [{ Min: 50, Pn: 'B' }] } };
  assert.deepEqual(parseLsEvents(key, { home: { score: 1 }, away: { score: 1 } }).events.map((e) => e.side), ['home', 'away']);
  // tutmuyorsa (devre anahtarı olabilir) takım belirlenmez, skor yazılmaz ve neden notu verilir
  const amb = parseLsEvents({ 'Incs-s': { 1: [{ Min: 12, Pn: 'A' }, { Min: 30, Pn: 'B' }], 2: [{ Min: 50, Pn: 'C' }] } }, { home: { score: 1 }, away: { score: 2 } });
  assert.deepEqual(amb.events.map((e) => [e.side, e.score]), [['', ''], ['', ''], ['', '']]);
  assert.match(amb.warn, /takım belirlenemedi \(alanlar: Min,Pn; örnek: \{\"Min\":12,\"Pn\":\"A\"\}\)/);
  // sayılar skorla uyuşmuyorsa liste gelir, skor yazılmaz
  const r4 = parseLsEvents({ 'Incs-s': { 1: [{ Min: 6, Pn: 'A', Nm: 1 }] } }, { home: { score: 3 }, away: { score: 0 } });
  assert.equal(r4.events.length, 1);
  assert.equal(r4.events[0].score, '');
  // dakikalar sıralanır (uzatma dakikası 45+2 sonra gelir)
  const o = parseLsEvents({ 'Incs-s': [{ Min: '45+2', Pn: 'B', Nm: 1 }, { Min: 44, Pn: 'A', Nm: 2 }] }, {});
  assert.deepEqual(o.events.map((e) => e.player), ['A', 'B']);
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
  const r = await loadLsEvents({ net, match: m, lineups: false, stats: false, incidents: false });
  assert.equal(calls.length, 2);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].score, '1–0');
  const bad = await loadLsEvents({ net: { json: async () => { throw new Error('HTTP 500'); } }, match: m, lineups: false, stats: false, incidents: false });
  assert.deepEqual(bad, { events: [], note: 'HTTP 500' });
  assert.deepEqual(await loadLsEvents({ net, match: { home: {}, away: {} } }), { events: [], note: 'Maç kimliği yok' });
});

test('parseLiveScore: maç nesnesi Eid taşır (maç özeti için)', () => {
  const j = { Stages: [{ Sid: 's', Cnm: 'Spain', Snm: 'Segunda RFEF', Events: [ev('4321000', 'Castellonense', 'La Nucia', esd(2026, 11, 11, 21, 0), { Eps: "54'", Tr1: '1', Tr2: '1' })] }] };
  const r = parseLiveScore(j, { now: Date.UTC(2026, 10, 11, 19, 0) });
  assert.equal(r[0].eid, '4321000');
});

// ---- gerçek maç yanıtlarından (Galatasaray 4–3 Amed Sportif) alınan örnekler ----
const P = (Min, Nm, IT, Fn, Ln, Sc, extra = {}) => ({ Min, Nm, IT, Fn, Ln, Pn: `${Fn[0]}. ${Ln}`, ...(Sc ? { Sc } : {}), ...extra });
const INC = {
  Eid: '1821078', Tr1: '4', Tr2: '3', Trh1: '2', Trh2: '0',
  Incs: {
    1: [P(7, 1, 36, 'Rafael', 'Leão', [1, 0]), P(7, 1, 63, 'Lucas', 'Torreira', [1, 0]), P(45, 1, 39, 'Alban', 'Lafont', [2, 0])],
    2: [
      P(50, 2, 43, 'Rayan', 'Raveloson'), P(59, 1, 36, 'Aleksey', 'Batrakov', [3, 0]), P(59, 1, 63, 'Roland', 'Sallai', [3, 0]), P(61, 2, 43, 'Gift', 'Orban'),
      P(62, 2, 36, 'Dia', 'Saba', [3, 1]), P(65, 2, 36, 'Gift', 'Orban', [3, 2]), P(65, 2, 63, 'Furkan', 'Soyalp', [3, 2]), P(74, 2, 43, 'David', 'Bates'),
      P(80, 1, 36, 'Barış Alper', 'Yılmaz', [4, 2]), P(80, 1, 63, 'Gabriel', 'Sara', [4, 2]), P(90, 2, 36, 'Yira', 'Sor', [4, 3], { MinEx: 2 }),
    ],
  },
};

test('parseLsIncidents: gol, kendi kalesine gol, sarı kart; asist golün ayrıntısına yazılır; asist ve bilinmeyen kodlar olay olmaz', () => {
  const r = parseLsIncidents(INC);
  const ev = r.events;
  assert.equal(ev.length, 10, '6 gol + 1 kendi kalesine + 3 sarı kart; asistler ayrı olay değil');
  const goal = ev[0];
  assert.deepEqual([goal.kind, goal.side, goal.minute, goal.player, goal.score, goal.detail], ['goal', 'home', "7'", 'Rafael Leão', '1–0', 'asist: Lucas Torreira']);
  const own = ev.find((e) => e.kind === 'own');
  assert.deepEqual([own.side, own.player, own.score], ['away', 'Alban Lafont', '2–0']); // Lafont deplasman kalecisi: golü ev sahibi alır
  assert.equal(ev.filter((e) => e.kind === 'yellow').length, 3);
  assert.deepEqual(ev.filter((e) => e.kind === 'yellow').map((e) => e.side), ['away', 'away', 'away']);
  const last = ev[ev.length - 1];
  assert.deepEqual([last.minute, last.score, last.side], ["90+2'", '4–3', 'away']);
  assert.equal(r.ht, '2–0');
  // iç içe olay + tanınmayan kod + oyuncusuz kayıt
  const nested = { Incs: { 1: [{ Min: 5, Nm: 2, Sc: [0, 1], Incs: [P(5, 2, 36, 'Y', 'Başaytaç', [0, 1])] }, { Min: 37, Nm: 2, IT: 44 }, { Min: 12, Nm: 1, IT: 99, Pn: 'X' }] } };
  assert.deepEqual(parseLsIncidents(nested).events.map((e) => [e.kind, e.player, e.side]), [['goal', 'Y Başaytaç', 'away']]);
  for (const j of [null, {}, { Incs: null }, { Incs: [] }, { Incs: { 1: [null, 5, 'x'] } }]) assert.deepEqual(parseLsIncidents(j).events, []);
});

const LU = {
  Eid: '1821078',
  Lu: [
    { Tnb: 1, Fo: [4, 2, 3, 1], Ps: [
      { Aid: '22006', Pid: '22006', Fn: 'Uğurcan', Ln: 'Çakır', Pos: 1, Snu: 1, PosA: 1, Fp: '1:1' },
      { Aid: '38280', Pid: '38280', Fn: 'Evren Eren', Ln: 'Elmali', Pos: 2, Snu: 17, PosA: 2, Fp: '2:4' },
      { Pid: '6pg', Fn: 'Aleksey', Ln: 'Batrakov', Pos: 3, Snu: 83, PosA: 3, Fp: '4:2' },
      { Aid: '2152', Pid: '2152', Fn: 'El Chadaille', Ln: 'Bitshiabu', Pos: 5, PosS: 2, Snu: 4 },
      { Aid: '49215', Pid: '49215', Fn: 'Okan', Ln: 'Buruk', Pos: 10, Pon: 'COACH' },
      { Aid: '77', Pid: '77', Fn: 'Yedek', Ln: 'Oyuncu', Pos: 5, PosS: 3, Snu: 77 },
    ] },
    { Tnb: 2, Fo: [4, 3, 1, 2], Ps: [
      { Aid: '54265', Pid: '54265', Fn: 'Ali', Ln: 'Bulbul', Pos: 5, PosS: 4, Snu: 9 },
      { Aid: '43603', Pid: '43603', Fn: 'Gökhan', Ln: 'Gül', Pos: 3, Snu: 8, Fp: '3:2' },
      { Aid: '1', Pid: '1', Fn: 'Kaleci', Ln: 'Bir', Pos: 1, Snu: 1, Fp: '1:1' },
      { Aid: '9', Pid: '9', Fn: 'Besnik', Ln: 'Hasi', Pos: 10, Pon: 'COACH' },
    ] },
  ],
  // her değişiklik iki kayıt: giren IT 5, çıkan IT 4
  Subs: { 2: [
    { Min: 46, Nm: 2, Aid: '54265', ID: '54265', Fn: 'Ali', Ln: 'Bulbul', IDo: '43603', AIDo: '43603', IT: 5 },
    { Min: 46, Nm: 2, Aid: '43603', ID: '43603', Fn: 'Gökhan', Ln: 'Gül', IDo: '54265', AIDo: '54265', IT: 4 },
    { Min: 63, Nm: 1, Aid: '77', ID: '77', IDo: '38280', PnumO: 17, IT: 5 },
  ] },
};

test('parseLsLineups: ilk 11 formasyon sırasıyla, yedekler, teknik direktör, formasyon; oyuncu değişiklikleri çift kayıttan tek olay olur', () => {
  const r = parseLsLineups(LU);
  const h = r.lineups.home;
  assert.equal(h.formation, '4-2-3-1');
  assert.deepEqual(h.starters.map((p) => p.name), ['Uğurcan Çakır', 'Evren Eren Elmali', 'Aleksey Batrakov']);
  assert.deepEqual(h.starters.map((p) => p.pos), ['K', 'D', 'OS']);
  assert.deepEqual(h.subs.map((p) => [p.n, p.name, p.pos]), [['4', 'El Chadaille Bitshiabu', 'D'], ['77', 'Yedek Oyuncu', 'OS']]);
  assert.equal(h.coach, 'Okan Buruk');
  assert.equal(r.lineups.away.coach, 'Besnik Hasi');
  assert.equal(r.lineups.away.formation, '4-3-1-2');
  assert.equal(r.subs.length, 2, '46. dk değişikliği iki kayıttan bir olay');
  assert.deepEqual([r.subs[0].side, r.subs[0].minute, r.subs[0].player, r.subs[0].other], ['away', "46'", 'Ali Bulbul', 'Gökhan Gül']);
  assert.deepEqual([r.subs[1].side, r.subs[1].minute, r.subs[1].player, r.subs[1].other], ['home', "63'", 'Yedek Oyuncu', 'Evren Eren Elmali']); // adı olmayan kayıtta oyuncular kimlikten kadrodan bulunur
  for (const j of [null, {}, { Lu: null }, { Lu: [null, {}] }]) assert.deepEqual(parseLsLineups(j), { lineups: {}, subs: [] });
  // ilk 11 belli değilse (kadro henüz açıklanmadı) kadro bölümü yok
  assert.deepEqual(parseLsLineups({ Lu: [{ Tnb: 1, Ps: [{ Fn: 'A', Ln: 'B', Pos: 5 }] }] }).lineups, {});
});

test('parseLsStats: doğrulanan satırlar; takım Tnb ile bulunur; yüzdelik toplamı 100 değilse gösterilmez; kart satırı yalnız kart varsa', () => {
  const j = { Eid: '1', Stat: [
    { Tnb: 2, Fls: 11, Ofs: 8, Ycs: 3, Rcs: 0, Shof: 3, Shbl: 6, Gks: 3, Pss: 43, Shon: 5, Cos: 6 },
    { Tnb: 1, Fls: 8, Ofs: 3, Ycs: 0, Rcs: 0, Shof: 6, Shbl: 5, Gks: 2, Pss: 57, Shon: 6, Cos: 3 },
  ] };
  const rows = parseLsStats(j);
  assert.deepEqual(rows.map((r) => r.label), ['Top hakimiyeti', 'İsabetli şut', 'İsabetsiz şut', 'Engellenen şut', 'Kurtarış', 'Faul', 'Ofsayt', 'Sarı kartlar']);
  assert.deepEqual([rows[0].home, rows[0].away, rows[0].pct], [57, 43, true]);
  assert.deepEqual([rows[7].home, rows[7].away], [0, 3]);
  assert.equal(parseLsStats({ Stat: [{ Tnb: 1, Pss: 70 }, { Tnb: 2, Pss: 70 }] }).length, 0);
  assert.deepEqual(parseLsStats({ Stat: [{ Tnb: 1, Fls: 0, Ofs: 0 }, { Tnb: 2, Fls: 0, Ofs: 0 }] }), [], 'hepsi sıfırsa veri yok sayılır');
  for (const x of [null, {}, { Stat: [] }, { Stat: [{}] }]) assert.deepEqual(parseLsStats(x), []);
});

test('loadLsEvents: durum+skor, olaylar (HT/MS ayraçlı), değişiklikler, kadro ve istatistik tek yüklemede; lineups/stats:false ise o uçlar sorulmaz', async () => {
  const SB = { Eid: '1821078', Tr1: '4', Tr2: '3', Trh1: '2', Trh2: '0', Eps: 'FT', 'Incs-s': { 1: [] } };
  const calls = [];
  const net = { json: async (url) => {
    calls.push(url);
    if (url.includes('/scoreboard/')) return SB;
    if (url.includes('/incidents/')) return INC;
    if (url.includes('/lineups/')) return LU;
    if (url.includes('/statistics/')) return { Eid: '1', Stat: [{ Tnb: 1, Pss: 57, Shon: 6 }, { Tnb: 2, Pss: 43, Shon: 5 }] };
    throw new Error('beklenmeyen ' + url);
  } };
  const m = { eid: '1821078', t: Date.now() - 3 * 3600e3, home: { score: 4 }, away: { score: 3 } };
  const r = await loadLsEvents({ net, match: m });
  assert.equal(r.status.state, 'post');
  assert.deepEqual([r.home.score, r.away.score], [4, 3]);
  const kinds = r.events.map((e) => (e.mark ? e.kind : e.kind));
  assert.ok(kinds.indexOf('ht') > kinds.indexOf('own') && kinds.indexOf('ht') < kinds.indexOf('yellow'), 'devre arası 45. dk ile 50. dk arasında');
  assert.deepEqual(kinds.slice(-1), ['ft']);
  assert.equal(r.events.find((e) => e.kind === 'ht').score, '2–0');
  assert.equal(r.events.find((e) => e.kind === 'ft').score, '4–3');
  assert.equal(r.events.filter((e) => e.kind === 'sub').length, 2);
  assert.ok(r.lineups.home.starters.length && r.stats.length);
  assert.equal(calls.length, 4 * 1 + 0, 'ilk adres çalıştı: dört uç, birer istek');
  // seyrek yoklama: kadro/istatistik istenmezse sorulmaz ve yanıtta yer almaz
  calls.length = 0;
  const lite = await loadLsEvents({ net, match: m, lineups: false, stats: false });
  assert.equal(calls.length, 2);
  assert.ok(!('lineups' in lite) && !('stats' in lite));
  assert.ok(lite.events.length >= 10);
});

test('kapsam: Türkiye, Avrupa ve uluslararası erkek futbolu; kadın, genç olmayan Avrupa dışı ligler ve kadın takımlar dışarıda', () => {
  assert.equal(inScope('Turkiye', 'Süper Lig'), true);
  assert.equal(inScope('Czech Republic', '1. Liga'), true);
  assert.equal(inScope('Bosnia & Herzegovina', 'Premier Liga'), true);
  assert.equal(inScope('World', 'Friendlies'), true);
  assert.equal(inScope('South America', 'Copa Libertadores'), true);
  assert.equal(inScope('Brazil', 'Serie A'), false);
  assert.equal(inScope('Japan', 'J1 League'), false);
  assert.equal(inScope('England', "Women's Super League"), false);
  assert.equal(inScope('Germany', 'Frauen-Bundesliga'), false);
  assert.equal(inScope('Spain', 'Liga F'), false);
  assert.equal(inScope('Europe', 'UEFA Women\'s Champions League'), false);
  assert.equal(isWomenTeam('Arsenal W'), true);
  assert.equal(isWomenTeam('Lyon Women'), true);
  assert.equal(isWomenTeam('Wolfsberger AC'), false);
  assert.equal(isWomenTeam('Arsenal'), false);
  const j = { Stages: [{ Sid: 's', Cnm: 'England', Snm: 'Premier League', Events: [ev('1', 'Arsenal', 'Chelsea', esd(2026, 11, 12, 20, 0)), ev('2', 'Arsenal W', 'Chelsea W', esd(2026, 11, 12, 21, 0))] }] };
  assert.deepEqual(parseLiveScore(j).map((m) => m.eid), ['1']);
});

test('parseLsEvents: asist, kart ve oyuncusuz kayıtlar gol sayılmaz (tür kodu varsa)', () => {
  const j = { 'Incs-s': { 1: [{ Min: 7, Nm: 1, Sc: [1, 0], Incs: [{ Min: 7, Nm: 1, IT: 36, Pn: 'Leão', Sc: [1, 0] }, { Min: 7, Nm: 1, IT: 63, Pn: 'Torreira', Sc: [1, 0] }] }, { Min: 37, Nm: 2, IT: 44 }, { Min: 40, Nm: 2, IT: 43, Pn: 'Kartlı' }] } };
  const r = parseLsEvents(j, { home: { score: 1 }, away: { score: 0 } });
  assert.deepEqual(r.events.map((e) => e.player), ['Leão']);
  assert.equal(r.events[0].side, 'home');
});
