import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runFollowSync, syncTeams, syncSeries, SYNC_KEY, SYNC_EVERY_MS, SYNC_RETRY_MS } from '../www/js/follow-sync.js';
import { FAV_KEY, FAV_DONE_KEY, applyAutoRemind, readDone } from '../www/js/sports-fav.js';
import { FOLLOW_STORAGE_KEY } from '../www/js/series-follow.js';
import { matchPlanId } from '../www/js/plan.js';

const H = 3600e3;
const NOW = new Date(2026, 10, 12, 12, 0).getTime();
const side = (name) => ({ name, label: name, score: null });
const M = (id, h, a, t, extra = {}) => ({ id, lg: 'tur.1', lgName: 'Süper Lig', round: '12. Hafta', t, state: 'pre', off: false, home: side(h), away: side(a), ...extra });

function fakeStore(init = {}) {
  const prefs = { ...init };
  const cache = new Map();
  return {
    prefs,
    pref: (k, d) => (k in prefs ? prefs[k] : d),
    setPref: (k, v) => { prefs[k] = v; },
    cache: { get: async (k) => cache.get(k), set: async (k, v) => { cache.set(k, v); } },
  };
}
function fakeRem(list = []) {
  const plans = [...list];
  return { plans, list: () => plans, set: (p) => { const i = plans.findIndex((x) => x.id === p.id); if (i >= 0) plans[i] = p; else plans.push(p); return p; } };
}
const pro = () => true;
const noPro = () => false;

test('applyAutoRemind: takip edilen takımın maçı kurulur, aynısı ikinci kez kurulmaz, elle kaldırılan geri gelmez', () => {
  const store = fakeStore({ [FAV_KEY]: [{ n: 'Galatasaray', l: 'Galatasaray' }] });
  const rem = fakeRem();
  const gs = M('1', 'Galatasaray', 'Fenerbahçe', NOW + 5 * H);
  const other = M('2', 'Beşiktaş', 'Trabzonspor', NOW + 6 * H);
  const info = () => ({ chId: '', chName: 'Süper Lig', src: 's1' });
  const favs = [{ n: 'Galatasaray', l: 'Galatasaray' }];
  const ids = applyAutoRemind({ matches: [gs, other], favs, rem, store, now: NOW, info });
  assert.deepEqual(ids, [matchPlanId(gs)]);
  assert.equal(rem.plans.length, 1);
  assert.equal(rem.plans[0].src, 's1');
  assert.equal(rem.plans[0].at, gs.t - 15 * 60000);
  assert.deepEqual(readDone(store), [matchPlanId(gs)]);
  // ikinci çağrı: yeniden kurulmaz
  assert.deepEqual(applyAutoRemind({ matches: [gs, other], favs, rem, store, now: NOW, info }), []);
  // kullanıcı kaldırdı: geri gelmez
  rem.plans.length = 0;
  assert.deepEqual(applyAutoRemind({ matches: [gs, other], favs, rem, store, now: NOW, info }), []);
  assert.equal(rem.plans.length, 0);
});

test('applyAutoRemind: takip yoksa, maç yoksa ya da hatırlatıcı arayüzü yoksa hiçbir şey yapmaz', () => {
  const store = fakeStore();
  const rem = fakeRem();
  const m = M('1', 'Galatasaray', 'Fenerbahçe', NOW + H);
  assert.deepEqual(applyAutoRemind({ matches: [m], favs: [], rem, store, now: NOW, info: () => ({}) }), []);
  assert.deepEqual(applyAutoRemind({ matches: [], favs: [{ n: 'Galatasaray', l: 'G' }], rem, store, now: NOW, info: () => ({}) }), []);
  assert.deepEqual(applyAutoRemind({ matches: [m], favs: [{ n: 'Galatasaray', l: 'G' }], rem: null, store, now: NOW, info: () => ({}) }), []);
  assert.equal(rem.plans.length, 0);
});

test('syncTeams: ESPN ve ikinci kaynak birleşir; LiveScore çökerse kalan günlerde denenmez, Mackolik kullanılır', async () => {
  const store = fakeStore({ [FAV_KEY]: [{ n: 'Bandirmaspor', l: 'Bandırmaspor' }] });
  const rem = fakeRem();
  const espn = M('e1', 'Galatasaray', 'Fenerbahçe', NOW + 4 * H);
  const mkMatch = (t) => M('mk:' + t, 'Bandirmaspor', 'Manisa FK', t, { lg: 'mk:tff1', lgName: 'TFF 1. Lig', src: 'mk' });
  let lsCalls = 0;
  const mkDays = [];
  const r = await syncTeams({
    net: {}, store, rem, now: NOW, hasPro: pro, sourceId: () => 'src1',
    loadEspn: async () => ({ matches: [espn] }),
    loadLs: async () => { lsCalls++; throw new Error('çöktü'); },
    loadMk: async ({ dayMs }) => { mkDays.push(dayMs); return { matches: dayMs === mkDays[1] ? [mkMatch(NOW + 30 * H)] : [] }; },
  });
  assert.equal(lsCalls, 1, 'LiveScore bir kez denenir, sonra atlanır');
  assert.equal(mkDays.length, 8, 'bugün + 7 gün');
  assert.equal(r, 1);
  assert.equal(rem.plans.length, 1);
  assert.equal(rem.plans[0].chName, 'TFF 1. Lig · 12. Hafta');
  assert.equal(rem.plans[0].src, 'src1');
});

test('syncTeams: hiçbir kaynak yanıt vermezse hata atar; yalnız ESPN gelirse yine kurar', async () => {
  const store = fakeStore({ [FAV_KEY]: [{ n: 'Galatasaray', l: 'Galatasaray' }] });
  const fail = async () => { throw new Error('x'); };
  await assert.rejects(syncTeams({ net: {}, store, rem: fakeRem(), now: NOW, hasPro: pro, loadEspn: fail, loadLs: fail, loadMk: fail }));
  const rem = fakeRem();
  const n = await syncTeams({ net: {}, store, rem, now: NOW, hasPro: pro, loadEspn: async () => ({ matches: [M('1', 'Galatasaray', 'Fenerbahçe', NOW + 2 * H)] }), loadLs: fail, loadMk: fail });
  assert.equal(n, 1, 'ikinci kaynakların hepsi düşse de ESPN gelmişse eşitleme başarılı sayılır');
  assert.equal(rem.plans.length, 1);
});

test('syncTeams: Pro değilse ya da takip yoksa ağa gitmez', async () => {
  let called = 0;
  const loadEspn = async () => { called++; return { matches: [] }; };
  const withFav = fakeStore({ [FAV_KEY]: [{ n: 'Galatasaray', l: 'G' }] });
  assert.equal(await syncTeams({ net: {}, store: withFav, rem: fakeRem(), now: NOW, hasPro: noPro, loadEspn }), 0);
  assert.equal(await syncTeams({ net: {}, store: fakeStore(), rem: fakeRem(), now: NOW, hasPro: pro, loadEspn }), 0);
  assert.equal(called, 0);
});

const flowDay = (rows) => rows;
const row = (title, startAt, extra = {}) => ({ title, slug: title.toLowerCase().replace(/\s+/g, '-'), channel: 'Star TV', startAt, status: 'Yeni Bölüm', ep: '5. Bölüm', ...extra });

test('syncSeries: takip edilen dizinin yeni bölümü için hatırlatıcı kurulur; önbellek tazeyse ağa gidilmez', async () => {
  const store = fakeStore({ [FOLLOW_STORAGE_KEY]: [{ title: 'Kızılcık Şerbeti', slug: 'kizilcik-serbeti' }] });
  const rem = fakeRem();
  const days = [[row('Kızılcık Şerbeti', NOW + 8 * H)], [row('Başka Dizi', NOW + 9 * H)], [], [], [], [], []];
  let refreshed = 0;
  const n = await syncSeries({
    net: {}, store, rem, now: NOW, hasPro: pro, liveItems: () => [],
    readFlow: async () => ({ at: NOW - H, days }),
    refresh: async () => { refreshed++; return { at: NOW, days }; },
  });
  assert.equal(n, 1);
  assert.equal(refreshed, 0, 'önbellek 3 saatten tazeyse indirilmez');
  assert.equal(rem.plans.length, 1);
  assert.match(rem.plans[0].id, /^sfnew:/);
  // ikinci çağrı aynı hatırlatıcıyı çoğaltmaz
  assert.equal(await syncSeries({ net: {}, store, rem, now: NOW, hasPro: pro, liveItems: () => [], readFlow: async () => ({ at: NOW - H, days }), refresh: async () => ({ days }) }), 0);
  assert.equal(rem.plans.length, 1);
});

test('syncSeries: önbellek bayatsa ya da yoksa akış yeniden indirilir', async () => {
  const store = fakeStore({ [FOLLOW_STORAGE_KEY]: [{ title: 'Kızılcık Şerbeti', slug: 'k' }] });
  const days = [[row('Kızılcık Şerbeti', NOW + 8 * H)], [], [], [], [], [], []];
  let refreshed = 0;
  let prevSeen = 'x';
  const mk = (cached) => ({ net: {}, store, rem: fakeRem(), now: NOW, hasPro: pro, liveItems: () => [], readFlow: async () => cached, refresh: async ({ prev }) => { refreshed++; prevSeen = prev; return { at: NOW, days }; } });
  assert.equal(await syncSeries(mk(null)), 1);
  assert.equal(await syncSeries(mk({ at: NOW - 5 * H, days: [[], [], [], [], [], [], []] })), 1);
  assert.equal(refreshed, 2);
  assert.ok(prevSeen && prevSeen.at === NOW - 5 * H, 'bayat akış prev olarak verilir');
});

test('runFollowSync: takip yoksa ağa gitmez ve durum yazmaz; çevrimdışıyken atlar', async () => {
  const store = fakeStore();
  const r = await runFollowSync({ net: {}, store, rem: fakeRem(), now: NOW, hasPro: pro });
  assert.deepEqual(r, { skipped: 'fresh' });
  assert.ok(!(SYNC_KEY in store.prefs));
  const s2 = fakeStore({ [FAV_KEY]: [{ n: 'Galatasaray', l: 'G' }] });
  assert.deepEqual(await runFollowSync({ net: {}, store: s2, rem: fakeRem(), now: NOW, hasPro: pro, online: false }), { skipped: 'offline' });
  assert.ok(!(SYNC_KEY in s2.prefs), 'çevrimdışı atlama zamanı ilerletmez');
});

test('runFollowSync: başarıdan sonra 20 saat bekler; her bölüm ayrı zamanlanır; hata 3 saat sonra yeniden denenir', async () => {
  const store = fakeStore({ [FAV_KEY]: [{ n: 'Galatasaray', l: 'G' }], [FOLLOW_STORAGE_KEY]: [{ title: 'Kızılcık Şerbeti', slug: 'k' }] });
  const calls = { series: 0, teams: 0 };
  const deps = {
    series: { readFlow: async () => ({ at: NOW, days: [[], [], [], [], [], [], []] }), refresh: async () => { throw new Error('x'); } },
    teams: { loadEspn: async () => { calls.teams++; return { matches: [M('1', 'Galatasaray', 'Fenerbahçe', NOW + 3 * H)] }; }, loadLs: async () => ({ matches: [] }), loadMk: async () => ({ matches: [] }) },
  };
  deps.series.readFlow = async () => { calls.series++; return { at: NOW, days: [[], [], [], [], [], [], []] }; };
  const rem = fakeRem();
  const a = await runFollowSync({ net: {}, store, rem, now: NOW, hasPro: pro, deps, liveItems: () => [] });
  assert.deepEqual([a.series, a.teams, a.failed], [0, 1, []]);
  assert.equal(store.prefs[SYNC_KEY].series, NOW);
  assert.equal(store.prefs[SYNC_KEY].teams, NOW);
  // hemen ardından: taze
  assert.deepEqual(await runFollowSync({ net: {}, store, rem, now: NOW + H, hasPro: pro, deps }), { skipped: 'fresh' });
  assert.equal(calls.teams, 1);
  // 20 saat sonra yeniden çalışır
  const b = await runFollowSync({ net: {}, store, rem, now: NOW + SYNC_EVERY_MS + 1, hasPro: pro, deps, liveItems: () => [] });
  assert.ok(!b.skipped);
  assert.equal(calls.teams, 2);
});

test('runFollowSync: başarısız bölüm 3 saat bekletilir; başarılı bölümün zamanı korunur; yeni takip hemen sıraya girer', async () => {
  const store = fakeStore({ [FAV_KEY]: [{ n: 'Galatasaray', l: 'G' }] });
  let fail = true;
  const deps = { teams: { loadEspn: async () => { if (fail) throw new Error('x'); return { matches: [] }; }, loadLs: async () => { throw new Error('x'); }, loadMk: async () => { throw new Error('x'); } } };
  const r1 = await runFollowSync({ net: {}, store, rem: fakeRem(), now: NOW, hasPro: pro, deps });
  assert.deepEqual(r1.failed, ['teams']);
  assert.equal(store.prefs[SYNC_KEY].teams, undefined, 'başarısızlık başarı zamanını ilerletmez');
  assert.equal(store.prefs[SYNC_KEY].failAt, NOW);
  assert.deepEqual(await runFollowSync({ net: {}, store, rem: fakeRem(), now: NOW + H, hasPro: pro, deps }), { skipped: 'retry' });
  // 3 saat sonra yeniden denenir (bu sefer ESPN gelir)
  fail = false;
  const r3 = await runFollowSync({ net: {}, store, rem: fakeRem(), now: NOW + SYNC_RETRY_MS + 1, hasPro: pro, deps });
  assert.deepEqual(r3.failed, []);
  assert.equal(store.prefs[SYNC_KEY].failAt, 0);
  assert.ok(store.prefs[SYNC_KEY].teams > NOW);
  // dizi takibi sonradan eklenir: takım taze olsa da dizi bölümü hemen çalışır
  store.prefs[FOLLOW_STORAGE_KEY] = [{ title: 'Kızılcık Şerbeti', slug: 'k' }];
  const days = [[row('Kızılcık Şerbeti', NOW + 10 * H + SYNC_RETRY_MS)], [], [], [], [], [], []];
  const rem = fakeRem();
  const r4 = await runFollowSync({ net: {}, store, rem, now: NOW + SYNC_RETRY_MS + 2, hasPro: pro, liveItems: () => [], deps: { series: { readFlow: async () => ({ at: NOW + SYNC_RETRY_MS, days }) }, teams: deps.teams } });
  assert.equal(r4.series, 1);
  assert.equal(r4.teams, 0);
});

test('runFollowSync: force zamanlara bakmaz; Pro değilse çalışmaz', async () => {
  const store = fakeStore({ [FAV_KEY]: [{ n: 'Galatasaray', l: 'G' }], [SYNC_KEY]: { teams: NOW, failAt: NOW } });
  let n = 0;
  const deps = { teams: { loadEspn: async () => { n++; return { matches: [] }; }, loadLs: async () => ({ matches: [] }), loadMk: async () => ({ matches: [] }) } };
  assert.deepEqual(await runFollowSync({ net: {}, store, rem: fakeRem(), now: NOW + 1, hasPro: pro, deps }), { skipped: 'fresh' });
  await runFollowSync({ net: {}, store, rem: fakeRem(), now: NOW + 1, hasPro: pro, deps, force: true });
  assert.equal(n, 1);
  assert.deepEqual(await runFollowSync({ net: {}, store: fakeStore({ [FAV_KEY]: [{ n: 'Galatasaray', l: 'G' }] }), rem: fakeRem(), now: NOW, hasPro: noPro, deps, force: true }), { skipped: 'fresh' });
});

test('uygulama kablolaması: tek planApi, açılışta ve öne gelince eşitleme, takip yokken modül yüklenmez', () => {
  const app = readFileSync(new URL('../www/js/app.js', import.meta.url), 'utf8');
  assert.equal((app.match(/reminders: planApi/g) || []).length, 3, 'Spor, Bugün ve Dizi akışı aynı plan arayüzünü kullanır');
  assert.match(app, /const planApi = \{/);
  assert.match(app, /import\('\.\/follow-sync\.js'\)/);
  assert.match(app, /scheduleFollowSync\(20000\)/);
  assert.match(app, /scheduleFollowSync\(5000\)/);
  assert.match(app, /if \(followBusy \|\| !S\.source \|\| document\.visibilityState !== 'visible' \|\| !hasFollows\(\)\) return;/);
  const ui = readFileSync(new URL('../www/js/sports-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /applyAutoRemind\(\{ matches, favs, rem, store, now: now\(\), info: remindInfo \}\)/);
  assert.ok(!/const FAV_DONE_KEY/.test(ui) && !/const LEAD_KEY/.test(ui), 'anahtarlar tek yerde (sports-fav.js)');
});

test('FAV_DONE_KEY ve FAV_KEY değerleri eski kayıtlarla aynı kalır', () => {
  assert.equal(FAV_KEY, 'sp.favs');
  assert.equal(FAV_DONE_KEY, 'sp.favdone');
});
