// Spor sayfası: genç / yaş grubu takımların (U19, U21, Youth League…) maçları listelenmez ve hatırlatıcısı kurulmaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isYouthText } from '../www/js/util.js';
import { isYouthMatch, loadMatches } from '../www/js/sports.js';
import { parseLiveScore, inScope } from '../www/js/sports-ls.js';
import { seMatches, mergeSe } from '../www/js/sports-se.js';
import { parseMackolik } from '../www/js/sports-mk.js';
import { autoRemindTargets, cleanFavs } from '../www/js/sports-fav.js';
import { isYouthPlan, makeMatchPlan, activePlans } from '../www/js/plan.js';

const esd = (y, mo, d, h, mi) => `${y}${String(mo).padStart(2, '0')}${String(d).padStart(2, '0')}${String(h).padStart(2, '0')}${String(mi).padStart(2, '0')}00`;
const ev = (eid, a, b, e) => ({ Eid: eid, Esd: e, Eps: 'NS', T1: [{ Nm: a }], T2: [{ Nm: b }] });
const side = (name) => ({ name, label: name, score: null });

test('isYouthText: U14–U23, Under 19, Youth League yakalanır; gerçek kulüp adları yakalanmaz', () => {
  for (const s of ['Fenerbahce U19', 'Shakhtar Donetsk U19', 'Turkey U-21', 'Besiktas U 17', 'Real Madrid U23', 'Under 19', 'under-21 Euro', 'UEFA Youth League', 'Galatasaray (U19)', 'Fenerbahçe U19']) {
    assert.equal(isYouthText(s), true, s);
  }
  for (const s of ['Fenerbahce', 'Galatasaray', 'Union Berlin', 'Universitatea Craiova', 'Genclerbirligi', 'Gençlerbirliği', 'FC U 2000', 'Bayern Munich II', 'Cluj 1948', 'Under Armour Cup', 'U24', 'U13', 'Hapoel Be\'er Sheva', 'Beşiktaş', '']) {
    assert.equal(isYouthText(s), false, s);
  }
  assert.equal(isYouthText(null), false);
  assert.equal(isYouthText(undefined), false);
});

test('isYouthMatch: takım adı, etiketi, yarışma adı ya da tur bilgisi genç işareti taşıyorsa', () => {
  assert.equal(isYouthMatch({ home: side('Shakhtar Donetsk U19'), away: side('Fenerbahce U19'), lgName: 'UEFA Youth League' }), true);
  assert.equal(isYouthMatch({ home: side('Shakhtar'), away: side('Fenerbahce'), lgName: 'UEFA Youth League' }), true, 'yarışma adı yeter');
  assert.equal(isYouthMatch({ home: side('Galatasaray'), away: side('Aston Villa U21'), lgName: 'Şampiyonlar Ligi' }), true, 'tek takım yeter');
  assert.equal(isYouthMatch({ home: { name: 'Besiktas', label: 'Beşiktaş U19' }, away: side('Hapoel'), lgName: 'Avrupa Ligi' }), true, 'etiket de bakılır');
  assert.equal(isYouthMatch({ home: side('Galatasaray'), away: side('Aston Villa'), lgName: 'Şampiyonlar Ligi', round: '5' }), false);
  assert.equal(isYouthMatch(null), false);
  assert.equal(isYouthMatch({}), false);
});

test('LiveScore: genç takım maçı ve Youth League aşaması elenir, aynı gündeki ana takım maçı kalır', () => {
  const j = {
    Stages: [
      { Sid: 'a', Cnm: 'Europe', Snm: 'UEFA Youth League', CompN: 'UEFA Youth League', Events: [ev('1', 'Shakhtar Donetsk U19', 'Fenerbahce U19', esd(2026, 11, 25, 15, 0))] },
      { Sid: 'b', Cnm: 'Turkey', Snm: 'Super Lig', Events: [ev('2', 'Galatasaray', 'Fenerbahce', esd(2026, 11, 25, 20, 0)), ev('3', 'Besiktas U19', 'Trabzonspor U19', esd(2026, 11, 25, 12, 0))] },
      { Sid: 'c', Cnm: 'England', Snm: 'Premier League', Events: [ev('4', 'Arsenal', 'Chelsea', esd(2026, 11, 25, 21, 0))] },
    ],
  };
  const ms = parseLiveScore(j, { now: Date.UTC(2026, 10, 24) });
  assert.deepEqual(ms.map((m) => `${m.home.name}-${m.away.name}`), ['Galatasaray-Fenerbahce', 'Arsenal-Chelsea']);
  assert.equal(inScope('Europe', 'UEFA Youth League'), false);
  assert.equal(inScope('Turkey', 'Super Lig'), true);
});

test('Spor Ekranı yayın akışı: genç maç satırı maç olmaz; mergeSe de eklemez', () => {
  const t0 = Date.UTC(2026, 10, 25, 12, 0);
  const rows = [
    { id: '1', t: t0, title: 'Shakhtar Donetsk U19 - Fenerbahce U19 UEFA Youth League', teams: ['Shakhtar Donetsk U19', 'Fenerbahce U19'], comp: 'UEFA Youth League', channels: ['TRT Spor'], logos: {} },
    { id: '2', t: t0, title: 'Ermenistan - Güney Kıbrıs UEFA Uluslar Ligi', teams: ['Ermenistan', 'Güney Kıbrıs'], comp: 'UEFA Uluslar Ligi', channels: [], logos: {} },
    { id: '3', t: t0, title: 'Türkiye U21 - Belçika U21 Hazirlik Maçı', teams: ['Türkiye U21', 'Belçika U21'], comp: 'Hazirlik Maçı', channels: [], logos: {} },
  ];
  assert.deepEqual(seMatches(rows).map((m) => m.id), ['se:2']);
  assert.deepEqual(mergeSe([], rows).map((m) => m.id), ['se:2']);
});

test('ESPN yükleme: genç takım maçı sonuca girmez', async () => {
  const ev1 = (id, h, a, date) => ({ id, date, competitions: [{ status: { type: { state: 'pre', name: 'STATUS_SCHEDULED', description: 'Scheduled' } }, competitors: [{ homeAway: 'home', team: { displayName: h }, score: '0' }, { homeAway: 'away', team: { displayName: a }, score: '0' }] }] });
  const now = Date.UTC(2026, 10, 24, 10, 0);
  const json = { events: [ev1('1', 'Shakhtar Donetsk U19', 'Fenerbahce U19', '2026-11-25T12:00Z'), ev1('2', 'Galatasaray', 'Aston Villa', '2026-11-24T17:45Z')] };
  const r = await loadMatches({ net: { json: async () => json }, now, leagues: [{ id: 'uefa.champions', name: 'Şampiyonlar Ligi' }], back: 1, ahead: 3 });
  assert.deepEqual(r.matches.map((m) => `${m.home.name}-${m.away.name}`), ['Galatasaray-Aston Villa']);
});

test('otomatik hatırlatıcı: takip edilen takımın genç maçına kurulmaz', () => {
  const NOW = Date.UTC(2026, 10, 24, 12, 0);
  const favs = cleanFavs([{ n: 'Fenerbahce' }]);
  const mk = (t, h, a, extra = {}) => ({ id: `${t}-${h}`, t, state: 'pre', off: false, home: side(h), away: side(a), ...extra });
  const youth = mk(NOW + 3600e3, 'Shakhtar Donetsk U19', 'Fenerbahce U19', { lgName: 'UEFA Youth League' });
  const main = mk(NOW + 7200e3, 'Fenerbahce', 'Rizespor');
  assert.deepEqual(autoRemindTargets([youth, main], favs, { now: NOW }).map((m) => m.id), [main.id]);
});

test('Planlananlar: önceden kurulmuş genç maç hatırlatıcısı tanınır; ana takım maçı ve program hatırlatıcısı etkilenmez', () => {
  const NOW = Date.UTC(2026, 10, 24, 12, 0);
  const young = makeMatchPlan({ t: NOW + 3600e3, home: side('Shakhtar Donetsk U19'), away: side('Fenerbahce U19') });
  const main = makeMatchPlan({ t: NOW + 7200e3, home: side('Galatasaray'), away: side('Aston Villa') });
  const prog = { id: 'rem:x:1', kind: 'rem', chName: 'TRT', title: 'U19 Milli Maç Özeti', s: NOW + 3600e3, e: NOW + 7200e3, at: NOW + 3000e3 };
  assert.equal(isYouthPlan(young), true);
  assert.equal(isYouthPlan(main), false);
  assert.equal(isYouthPlan(prog), false, 'maç planı olmayan program hatırlatıcısına dokunulmaz');
  assert.equal(isYouthPlan(null), false);
  const kalan = activePlans([young, main, prog], NOW).filter((x) => !isYouthPlan(x));
  assert.deepEqual(kalan.map((x) => x.id).sort(), [main.id, prog.id].sort());
});

test('Mackolik: Türkiye ligindeki genç takım (U19) satırı elenir', () => {
  const comp = [1, 'Türkiye', 1708, '2.Lig Beyaz Grup', 73493, '2026/2027', '', 0, 1, 'T2L-B', 0, 1];
  const r = (id, h, a) => {
    const x = new Array(38).fill(0);
    x[0] = id; x[1] = 1; x[2] = h; x[3] = 2; x[4] = a; x[5] = 0; x[6] = ''; x[7] = '0-0'; x[16] = '13:00'; x[35] = '25/11/2026'; x[36] = comp;
    return x;
  };
  const ms = parseMackolik({ m: [r(1, 'Elazığspor', 'Menemen FK'), r(2, 'Fenerbahçe U19', 'Galatasaray U19'), r(3, 'Bursaspor', 'Sakaryaspor U21')] }, { now: Date.UTC(2026, 10, 24) });
  assert.deepEqual(ms.map((m) => m.id), ['mk:1']);
});
