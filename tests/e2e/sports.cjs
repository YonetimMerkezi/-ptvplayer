// Spor (futbol) ekranı uçtan uca denemesi: sahte ESPN yanıtları (gerçek servise hiç gidilmez), gün/lig süzgeci, canlı skor,
// TV rehberinden kanal eşleştirme ve kanala geçiş, yayıncı adı yedeği, kısmi hata, hata ekranı. Tek başına: node tests/e2e/sports.cjs
// (run.cjs sonunda da çağrılır).
const path = require('node:path');

const CORS = { 'access-control-allow-origin': '*' };

function fakeEspn() {
  const st = { fail: false, failDelay: 0, rejectLimit: false, summaryFail: false, summaryCalls: [], failLeagues: new Set(['ger.1']), calls: [], urls: [], lsMode: 'empty', lsCalls: [], tvMode: 'empty', tvCalls: [], seMode: 'data0', seCalls: [], altMode: 'fail', altCalls: [], badgeCalls: [] };
  const at = (dayOff, h, m = 0) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    d.setDate(d.getDate() + dayOff);
    return d;
  };
  const ev = (id, when, home, away, o = {}) => ({
    id: String(id),
    date: when.toISOString(),
    competitions: [{
      ...(o.round ? { notes: [{ headline: o.round }] } : {}),
      status: { displayClock: o.clock || '', type: { state: o.state || 'pre', name: o.name || 'STATUS_SCHEDULED' } },
      competitors: [
        { homeAway: 'home', score: o.hs, team: { displayName: home, abbreviation: home.slice(0, 3).toUpperCase(), logo: '' } },
        { homeAway: 'away', score: o.as, team: { displayName: away, abbreviation: away.slice(0, 3).toUpperCase(), logo: '' } },
      ],
    }],
  });
  const data = () => ({
    'tur.1': [
      ev(1, at(0, 20, 0), 'Galatasaray', 'Fenerbahçe', { round: 'Round 12' }),
      ev(2, at(0, 17, 0), 'Beşiktaş', 'Trabzonspor', { hs: '1', as: '0', state: 'in', name: 'STATUS_SECOND_HALF', clock: "67'" }),
      ev(3, at(0, 14, 0), 'Konyaspor', 'Rizespor', { hs: '2', as: '2', state: 'post', name: 'STATUS_FULL_TIME' }),
    ],
    'uefa.champions': [ev(4, at(1, 21, 45), 'Bayern Munich', 'Paris Saint-Germain', { round: 'Group Stage - Matchday 3' })],
    'uefa.nations': [ev(5, at(3, 20, 45), 'Turkey', 'Wales')],
    'eng.1': [ev(6, at(0, 19, 0), 'Arsenal', 'Chelsea'), ev(7, at(0, 20, 0), 'Liverpool', 'Everton')],
  });
  const comp = (state, name, hs, as, extra = {}) => ({
    header: { competitions: [{ status: { displayClock: extra.clock || '', type: { state, name } }, competitors: [{ id: '1', homeAway: 'home', score: hs, team: { id: '1' } }, { id: '2', homeAway: 'away', score: as, team: { id: '2' } }], ...(extra.comp || {}) }] },
  });
  const summaries = () => ({
    2: {
      ...comp('in', 'STATUS_SECOND_HALF', '1', '0', { clock: "67'" }),
      keyEvents: [
        { type: { text: 'Kickoff' }, clock: { displayValue: "0'" } },
        { type: { text: 'Goal' }, scoringPlay: true, clock: { displayValue: "12'" }, team: { id: '1' }, participants: [{ athlete: { displayName: 'Cenk Tosun' } }] },
        { type: { text: 'Yellow Card' }, clock: { displayValue: "30'" }, team: { id: '2' }, participants: [{ athlete: { displayName: 'Uğurcan Çakır' } }] },
        { type: { text: 'Substitution' }, clock: { displayValue: "60'" }, team: { id: '1' }, participants: [{ athlete: { displayName: 'Rafa Silva' } }, { athlete: { displayName: 'Semih Kılıçsoy' } }] },
      ],
      boxscore: { teams: [
        { homeAway: 'home', team: { id: '1' }, statistics: [{ name: 'possessionPct', displayValue: '58' }, { name: 'totalShots', displayValue: '11' }] },
        { homeAway: 'away', team: { id: '2' }, statistics: [{ name: 'possessionPct', displayValue: '42' }, { name: 'totalShots', displayValue: '5' }] },
      ] },
      rosters: [
        { homeAway: 'home', team: { id: '1' }, formation: '4-2-3-1', roster: [{ starter: true, jersey: '1', athlete: { displayName: 'Mert Günok' }, position: { abbreviation: 'G' } }, { starter: false, jersey: '7', athlete: { displayName: 'Rafa Silva' }, position: { abbreviation: 'M' } }] },
        { homeAway: 'away', team: { id: '2' }, formation: '4-3-3', roster: [{ starter: true, jersey: '1', athlete: { displayName: 'Uğurcan Çakır' }, position: { abbreviation: 'G' } }] },
      ],
      gameInfo: { venue: { fullName: 'Tüpraş Stadyumu', address: { city: 'İstanbul' } }, officials: [{ fullName: 'Cüneyt Çakır' }], attendance: 41000 },
    },
    1: comp('pre', 'STATUS_SCHEDULED', undefined, undefined, { comp: { geoBroadcasts: [{ media: { shortName: 'Paramount+' }, region: 'us' }] } }),
    3: { ...comp('post', 'STATUS_FULL_TIME', '2', '2'), keyEvents: [{ type: { text: 'Goal' }, scoringPlay: true, clock: { displayValue: "5'" }, team: { id: '2' }, participants: [{ athlete: { displayName: 'Deneme Oyuncu' } }] }] },
  });
  // Sahte LiveScore: lsMode 'empty' (boş gün), 'data' (ESPN'de olmayan maçlar + bir yinelenen), 'fail' (HTTP 500), 'badshape' (beklenmeyen JSON)
  const lsBody = (key) => {
    const e = (eid, a, b, hh, mm, o = {}) => ({ Eid: eid, Esd: `${key}${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}00`, Eps: 'NS', T1: [{ Nm: a }], T2: [{ Nm: b }], ...o });
    const todayKey = (() => {
      const d = new Date();
      return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    })();
    if (key !== todayKey) return { Stages: [{ Sid: 'tff1', Cnm: 'Turkey', Snm: 'TFF 1. Lig', Events: [e('x' + key, 'Ankaragucu', 'Bursaspor', 18, 0)] }] };
    return {
      Stages: [
        { Sid: 'tff1', Cnm: 'Turkey', Snm: 'TFF 1. Lig', Events: [e('t1', 'Bandirmaspor', 'Manisa FK', 15, 0)] },
        { Sid: 'sl', Cnm: 'Turkey', Snm: 'Super Lig', Events: [e('t2', 'Galatasaray', 'Fenerbahce', 20, 0), e('t3', 'Besiktas', 'Trabzonspor', 17, 0, { Eps: "67'", Tr1: '1', Tr2: '0' })] },
        { Sid: 'br', Cnm: 'Brazil', Snm: 'Serie A', Events: [e('b1', 'Flamengo', 'Palmeiras', 22, 0, { Eps: "34'", Tr1: '1', Tr2: '0' })] },
        { Sid: 'ch', Cnm: 'England', Snm: 'Championship', Events: [e('c1', 'Leeds', 'Burnley', 20, 45, { ErnInf: 'Round 18' })] },
      ],
    };
  };
  // Sahte TheSportsDB TV listesi: tvMode 'empty' (kayıt yok), 'data', 'fail' (HTTP 500), 'badshape' (beklenmeyen JSON)
  const tvBody = () => ({
    tvevents: [
      { idEvent: '1', strSport: 'Soccer', strEvent: 'Arsenal vs Chelsea', strChannel: 'TRT Spor', strCountry: 'Turkey', strTimeStamp: at(0, 19, 0).toISOString() },
      { idEvent: '2', strSport: 'Soccer', strEvent: 'Bandirmaspor vs Manisa FK', strChannel: 'Tabii', strCountry: 'Turkey', strTimeStamp: at(0, 15, 0).toISOString() },
      { idEvent: '3', strSport: 'Soccer', strEvent: 'Arsenal vs Chelsea', strChannel: 'Sky Sports', strCountry: 'United Kingdom', strTimeStamp: at(0, 19, 0).toISOString() },
    ],
  });
  // Sahte Spor Ekranı günlük sayfası: seMode 'data0'/'nofootball' (yalnız tenis satırı), 'data' (futbol satırları; biri yayınsız), 'fail' (HTTP 500),
  // 'blocked' (maç bağlantısı olmayan sayfa)
  const tsi = (d) => {
    const x = new Date(d.getTime() + 3 * 3600e3);
    const p2 = (n) => String(n).padStart(2, '0');
    return { date: `${x.getUTCFullYear()}/${p2(x.getUTCMonth() + 1)}/${p2(x.getUTCDate())}`, time: `${p2(x.getUTCHours())}:${p2(x.getUTCMinutes())}` };
  };
  let seId = 1000;
  const slug = (c) => c.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const seRow = (sport, d, teams, comp, channels) => {
    const t = tsi(d);
    const chs = channels.length
      ? channels.map((c) => `<img src="https://img.sporekrani.com/channels/${slug(c)}.png" alt="${c}">`).join('') + channels.map((c) => `<b>${c}</b>`).join('')
      : '<b>Yayın Yok</b><b>Yayın Yok</b>';
    return `<a class="row" href="https://www.sporekrani.com/home/match/${seId++}/${t.date}/x-hangi-kanalda"><span>${sport}</span><span>${t.time}</span><span>${teams}</span><span>${comp}</span>${chs}</a>`;
  };
  const seBody = () => {
    const tennis = seRow('Tenis', at(0, 1, 0), 'C.Gauff - L.Noskova', 'WTA', ['Bein Sports Max 1']);
    if (st.seMode === 'blocked') return '<html><body>Just a moment...</body></html>';
    if (st.seMode !== 'data') return `<div>${tennis}</div>`; // 'data0' ve 'nofootball': yalnız futbol dışı satır
    return `<div>${seRow('Futbol', at(0, 13, 0), 'Kepez Bld. - Balıkesirspor', 'TFF 3. Lig', ['Tivibu Spor 1'])}${seRow('Futbol', at(0, 19, 0), 'Arsenal - Chelsea', 'Premier Lig', ['TRT Spor'])}${seRow('Futbol', at(0, 15, 0), 'Bandırmaspor - Manisa FK', 'TFF 1. Lig', ['Tabii'])}${seRow('Futbol', at(0, 20, 0), 'Galatasaray - Fenerbahçe', 'Süper Lig', ['beIN Sports 1', 'beIN Sports Max 2'])}${seRow('Futbol', at(0, 21, 0), 'Ermenistan - Güney Kıbrıs', 'UEFA Uluslar Ligi', [])}${seRow('Basketbol', at(0, 20, 0), 'Anadolu Efes - Real Madrid', 'EuroLeague', ['S Sport'])}</div>`;
  };
  // Yedek yayın akışı siteleri: altMode 'fail' (HTTP 503), 'mr' (Maç Rehberi sayfası), 'lst' (LiveSoccerTV sayfası); diğer siteler 503
  const mrRow = (sport, d, teams, comp, channels) => {
    const t = tsi(d);
    const chs = (channels.length ? channels : ['Yayın Yok'])
      .map((c) => `<span><picture><img data-src="https://img.sporekrani.com/tr_h_30,w_50,c_limit/channels/${slug(c)}.png" src="https://img.sporekrani.com//tr_h_30,w_50,c_limit_preview/channels/${slug(c)}.png" alt="${c}"></picture></span>`)
      .join('');
    return `<a href="/mac/${seId++}/${t.date}/x-hangi-kanalda" style="text-decoration:none"><div class="row event"><div class="col sportHour flex"><div class="col sport"><img data-src="https://img.sporekrani.com/tr_h_30,w_30,c_limit/sports/f.svg" alt="${sport}" title="${sport}"></div><div class="col hour">${t.time}</div></div><div class="col nameChannels flex"><div class="col name"><div class="h2">${teams} <span>${comp} </span></div></div><div class="col channels">${chs}</div></div><div class="col arrow"><i class="q-icon material-icons">chevron_right</i></div></div></a>`;
  };
  const mrBody = () => `<div class="col-12 events">${mrRow('Tenis', at(0, 1, 0), 'C.Gauff - L.Noskova', 'WTA', ['Bein Sports Max 1'])}${mrRow('Futbol', at(0, 13, 0), 'Kepez Bld. - Balıkesirspor', 'TFF 3. Lig', ['Tivibu Spor 1'])}${mrRow('Futbol', at(0, 15, 0), 'Bandırmaspor - Manisa FK', 'TFF 1. Lig', ['Tabii'])}${mrRow('Futbol', at(0, 19, 0), 'Arsenal - Chelsea', 'Premier Lig', ['TRT Spor'])}${mrRow('Futbol', at(0, 21, 0), 'Ermenistan - Güney Kıbrıs', 'UEFA Uluslar Ligi', [])}</div>`;
  const lstBody = () => {
    const row = (id, d, teams, chans) => `<tr id="${id}" class="matchrow" data-ko="x" data-has-tv="1"><td class='timecol'><span class="timecell"><span id='ko${id}' class='ts' dv='${d.getTime()}' df='H:MM'>00:00</span></span></td><td valign="top" id="match" class="matchcol"><div class="match-ch-flex"><div class="match-name-col"><a href="/tr/match/a-vs-b/q${id}#${id}" title="${teams}" id="g${id}">${teams}</a></div><div id="channels" class="channels-col"><div class="mchannels disable-link">${chans.map((c) => `<a href="/tr/channels/${slug(c)}/" class="homech">${c}</a>`).join(', ')}</div></div></div></td></tr>`;
    return `<table class="schedules"><tr class="sortable_comp" id="1"><td colspan="3" class="r_comprow"><a href="/tr/competitions/x/" class="r_complink"><span class="flag turkey">Türkiye - TFF 3. Lig</span></a></td></tr>${row(7001, at(0, 13, 0), 'Kepez Bld. vs Balıkesirspor', ['Tivibu Spor 1'])}</table>`;
  };
  async function install(ctx) {
    await ctx.route('https://www.sporekrani.com/**', async (route) => {
      st.seCalls.push(route.request().url());
      if (st.seMode === 'fail') return route.fulfill({ status: 500, headers: CORS, body: 'hata' });
      const key = (/day\/(\d{4}-\d\d-\d\d)/.exec(route.request().url()) || [])[1];
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const mode = st.seMode;
      if (key !== today && mode === 'data') st.seMode = 'data0';
      const body = seBody();
      st.seMode = mode;
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/html; charset=utf-8' }, body });
    });
    await ctx.route('https://img.sporekrani.com/**', (route) => route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png' }, body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
    const altRoute = (kind, body) => async (route) => {
      st.altCalls.push(route.request().url());
      if (st.altMode !== kind) return route.fulfill({ status: 503, headers: CORS, body: 'hata' });
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/html; charset=utf-8' }, body: body() });
    };
    await ctx.route('https://www.macrehberi.com/**', altRoute('mr', mrBody));
    await ctx.route('https://www.livesoccertv.com/**', altRoute('lst', lstBody));
    await ctx.route('https://www.sahadan.com/**', altRoute('sd', () => '<html></html>'));
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await ctx.route('https://flagcdn.com/**', (route) => route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png' }, body: PNG }));
    await ctx.route('https://r2.thesportsdb.com/**', (route) => route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png' }, body: PNG }));
    await ctx.route('https://www.thesportsdb.com/**', async (route) => {
      const bq = /searchteams\.php\?t=([^&]*)/.exec(route.request().url());
      if (bq) {
        const name = decodeURIComponent(bq[1]);
        st.badgeCalls.push(name);
        const known = ['Arsenal', 'Chelsea'].includes(name);
        const body = known ? { teams: [{ strTeam: name, strSport: 'Soccer', strBadge: `https://r2.thesportsdb.com/images/media/team/badge/${name.toLowerCase()}.png` }] } : { teams: null };
        return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      }
      st.tvCalls.push(route.request().url());
      if (st.tvMode === 'fail') return route.fulfill({ status: 500, headers: CORS, body: 'hata' });
      const body = st.tvMode === 'badshape' ? { Message: 'premium' } : st.tvMode === 'data' ? tvBody() : { tvevents: null };
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    });
    await ctx.route(/https:\/\/prod-(cdn-)?public-api\.livescore\.com\/.*/, async (route) => {
      const url = route.request().url();
      const key = (/soccer\/(\d{8})\//.exec(url) || [])[1] || '';
      st.lsCalls.push({ key, url });
      if (st.lsMode === 'fail') return route.fulfill({ status: 500, headers: CORS, body: 'hata' });
      const body = st.lsMode === 'badshape' ? { hata: 1 } : st.lsMode === 'data' ? lsBody(key) : { Stages: [] };
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    });
    await ctx.route('https://site.api.espn.com/**', async (route) => {
      const sm = /soccer\/([^/]+)\/summary\?event=(\d+)/.exec(route.request().url());
      if (sm) {
        st.summaryCalls.push(sm[2]);
        if (st.summaryFail) return route.fulfill({ status: 500, headers: CORS, body: 'hata' });
        return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(summaries()[sm[2]] || {}) });
      }
      const slug = /soccer\/([^/]+)\/scoreboard/.exec(route.request().url());
      const id = slug ? slug[1] : '';
      st.calls.push(id);
      st.urls.push(route.request().url());
      if (st.rejectLimit && /limit=/.test(route.request().url())) return route.fulfill({ status: 400, headers: CORS, body: 'bad' });
      if (st.fail && st.failDelay) await new Promise((r) => setTimeout(r, st.failDelay));
      if (st.fail || st.failLeagues.has(id)) return route.fulfill({ status: 500, headers: CORS, body: 'hata' });
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ events: data()[id] || [] }) });
    });
  }
  return { st, install, at };
}

async function sportsSection({ browser, base, mock, ok, sleep, SHOTS }) {
  console.log('Spor: maç takvimi, skor, kanal eşleştirme');
  const espn = fakeEspn();
  const mk = async (vp, init) => {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: true });
    await espn.install(ctx);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
    await page.addInitScript(() => { localStorage.setItem('iptv.pref.seen.changelog', '999'); window.__sportsBadgeGapMs = 30; });
    if (init) await page.addInitScript(init);
    await page.goto(base);
    await page.waitForSelector('#f');
    await page.fill('input[name=server]', mock.url);
    await page.fill('input[name=user]', 'u');
    await page.fill('input[name=pass]', 'p');
    await page.click('#f-go');
    await page.waitForSelector('.tile.t-live', { timeout: 15000 });
    await page.waitForFunction(() => window.__iptv.S.cat.live.length > 3, null, { timeout: 15000 });
    return { ctx, page, errs };
  };
  const text = (page, sel) => page.$$eval(sel, (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  const openRow = (page, re) => page.$$eval('.sp-m', (rows, src) => rows.find((r) => new RegExp(src).test(r.textContent)).click(), re.source);
  const playerOpen = (page) => page.evaluate(() => document.body.classList.contains('player-open') || document.documentElement.classList.contains('native-playing'));

  // ---- telefon: dikey
  const A = await mk({ width: 390, height: 844 });
  const a = A.page;
  ok(await a.isVisible('.shortcuts .t-sport'), 'ana ekranda “Spor” kutusu var');
  ok((await a.textContent('.shortcuts .t-sport b')).trim() === 'Spor', 'kutunun adı “Spor”');

  // TV rehberi: ilk kanalda bugünkü derbi, kanal adı beIN (ikinci maç için yayıncı listesi)
  const chName = await a.evaluate(() => {
    const { S } = window.__iptv;
    const first = S.cat.live[0];
    const second = S.cat.live[1];
    second.name = 'TR: BEIN SPORTS 1 HD';
    const kick = new Date();
    kick.setHours(20, 0, 0, 0);
    S.epg.data = { map: { [first.id]: 'e2e1' }, prog: { e2e1: [[kick.getTime() - 30 * 60000, kick.getTime() + 150 * 60000, 'Süper Lig: Galatasaray - Fenerbahçe', 'Canlı yayın']] } };
    S.epg._rep = null;
    return first.name;
  });

  await a.click('.shortcuts .t-sport');
  await a.waitForSelector('.sp-pg .sp-m', { timeout: 10000 });
  const days = await text(a, '#sp-days .chip');
  ok(days.length === 9 && /^Dün/.test(days[0]) && /^Bugün/.test(days[1]) && /^Yarın/.test(days[2]), 'gün şeridi: dün, bugün, yarın… (' + days.join(' | ') + ')');
  ok(await a.$eval('#sp-days .chip.on', (e) => /^Bugün/.test(e.textContent)), 'açılışta bugün seçili');
  const lgs = await text(a, '#sp-lgs .chip');
  ok(lgs[0].startsWith('Tümü') && lgs.some((t) => t.startsWith('Süper Lig')) && lgs.some((t) => t.startsWith('Premier Lig')) && !lgs.some((t) => t.startsWith('Şampiyonlar')), 'lig çipleri yalnız o günün ligleri: ' + lgs.join(' | '));
  ok(!(await a.$('.sp-lg-h')), 'bölüm başlığı yok: düz, saat sıralı liste');
  const order = (await text(a, '.sp-m')).map((t) => (/Konyaspor/.test(t) ? 'K' : /Beşiktaş/.test(t) ? 'B' : /Arsenal/.test(t) ? 'A' : /Galatasaray/.test(t) ? 'G' : /Liverpool/.test(t) ? 'L' : '?')).join('');
  ok(order === 'KBAGL', 'maçlar saat sırasında, aynı saatte (20:00) Süper Lig önce, sonra Premier Lig: ' + order);
  const lgl = await text(a, '.sp-m .sp-l2');
  ok(lgl[0] === 'Süper Lig' && lgl[2] === 'Premier Lig' && lgl[3] === 'Süper Lig · 12. hafta', 'her satırda lig/turnuva ve tur bilgisi: ' + lgl.join(' | '));

  // canlı skor
  const live = await a.$eval('.sp-m.on', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  ok(/67'/.test(live) && /Beşiktaş/.test(live) && /Trabzonspor/.test(live) && /1/.test(live), 'canlı maç: dakika ve skor görünüyor: ' + live);
  ok(await a.$eval('.sp-m.on .sp-live', (e) => getComputedStyle(e).color !== getComputedStyle(document.body).color), 'canlı yazı ayrı renkte');
  const done = (await text(a, '.sp-m')).find((t) => /Konyaspor/.test(t));
  ok(/MS/.test(done) && /2.*2/.test(done), 'biten maç: MS ve skor: ' + done);
  ok(!/Yayıncı|▶/.test(done), 'biten maçta yayıncı satırı yok');
  ok(await a.$eval('#sp-upd', (e) => /^Son güncelleme \d\d:\d\d · bazı veriler alınamadı$/.test(e.textContent)), 'bir lig alınamadı uyarısı (kaynak adı yok): ' + (await a.textContent('#sp-upd')));

  // kanal eşleştirme (TV rehberi başlığından)
  const derby = await a.$$eval('.sp-m', (rows) => rows.find((r) => /Galatasaray/.test(r.textContent)).querySelector('.sp-cb').getAttribute('title'));
  ok(derby === chName, 'derbi rehberdeki kanala eşleşti (sağdaki kutu): ' + derby + ' (beklenen ' + chName + ')');
  const arsenalBox = await a.$$eval('.sp-m', (rows) => { const b = rows.find((r) => /Arsenal/.test(r.textContent)).querySelector('.sp-cb'); return { none: b.classList.contains('none'), txt: b.textContent.trim() }; });
  ok(arsenalBox.none && arsenalBox.txt === 'Yayın yok', 'yayın bilgisi yoksa “Yayın yok” kutusu (tahmin yürütülmez): ' + JSON.stringify(arsenalBox));
  ok(!(await a.$$eval('.sp-m', (rows) => rows.some((r) => r.textContent.includes('Konyaspor') && r.querySelector('.sp-cb')))), 'biten maçta kanal kutusu yok');
  await a.screenshot({ path: path.join(SHOTS, '80-spor-dikey.png') });

  // tur bilgisi satırda; satıra dokununca oynatıcı değil maç bilgi ekranı açılır (kanal listesi orada)
  ok(/12\. hafta/.test((await text(a, '.sp-m')).find((t) => /Galatasaray/.test(t))), 'satırda tur bilgisi (12. hafta)');
  await openRow(a, /Galatasaray/);
  await a.waitForSelector('.sd-pg .sd-ch', { timeout: 8000 });
  ok(!(await playerOpen(a)), 'maça dokununca oynatıcı değil, maç bilgi ekranı açılır');
  ok(/Süper Lig/.test(await a.textContent('.sd-lg')) && /12\. hafta/.test(await a.textContent('.sd-lg')), 'ayrıntı başlığında lig ve tur: ' + (await a.textContent('.sd-lg')));
  await a.goBack();
  await a.waitForFunction(() => !document.querySelector('.sd-pg'), null, { timeout: 4000 });
  ok(await a.isVisible('.sp-pg .sp-m'), 'ayrıntıdan dönünce spor sayfası yerinde');

  // ---- maç ayrıntısı: canlı maç (olaylar, istatistik, kadro, stat/hakem, yayıncı yedeği)
  const openInfo = (re) => openRow(a, re);
  await openInfo(/Beşiktaş/);
  await a.waitForSelector('.sd-pg .sd-e', { timeout: 8000 });
  const head = (await a.textContent('.sd-head')).replace(/\s+/g, ' ');
  ok(/Beşiktaş/.test(head) && /Trabzonspor/.test(head) && /1 – 0/.test(head) && /67'/.test(head), 'ayrıntı: takımlar, skor ve dakika: ' + head.slice(0, 90));
  ok(/Tüpraş Stadyumu, İstanbul/.test(head) && /Hakem: Cüneyt Çakır/.test(head) && /Seyirci: 41/.test(head), 'ayrıntı: stat, hakem, seyirci');
  const evs = await text(a, '.sd-e');
  const has = (t, ...parts) => parts.every((p) => t.includes(p));
  ok(evs.length === 3 && has(evs[0], "12'", 'Cenk Tosun') && has(evs[1], "30'", 'Uğurcan') && has(evs[2], "60'", 'Rafa Silva', 'Semih'), 'ayrıntı: gol, kart, değişiklik olayları (' + evs.join(' | ') + ')');
  ok(await a.$$eval('.sd-e.home', (e) => e.length) === 2 && (await a.$$eval('.sd-e.away', (e) => e.length)) === 1, 'ayrıntı: olaylar takımına göre sol/sağda');
  const stats = await text(a, '.sd-s');
  ok(stats.length === 2 && /58%.*Topla oynama.*42%/.test(stats[0]) && /11.*Şut.*5/.test(stats[1]), 'ayrıntı: istatistik satırları (' + stats.join(' | ') + ')');
  ok((await a.$$('.sd-lu')).length === 2 && /4-2-3-1/.test(await a.textContent('.sd-lu')) && /Mert Günok/.test(await a.textContent('.sd-lu')) && /Yedekler:.*Rafa Silva/.test(await a.textContent('.sd-lu')), 'ayrıntı: kadro, diziliş ve yedekler');
  ok(/Bu maç için yayın bilgisi bulunamadı/.test(await a.textContent('#sd-bc')) && (await a.$$('#sd-bc .sd-ch')).length === 0, 'ayrıntı: yayın bilgisi yoksa kanal listesi yok, açık not var');
  ok(/Süper Lig/.test(await a.textContent('.sd-lg')), 'ayrıntı başlığında lig adı');
  await sleep(700); // sayfa açılış geçişi bitsin
  await a.screenshot({ path: path.join(SHOTS, '82-spor-ayrinti.png') });
  const callsBefore2 = espn.st.summaryCalls.length;
  await a.click('#sd-ref');
  await a.waitForFunction((n) => /Son güncelleme/.test(document.querySelector('#sd-upd').textContent), 0, { timeout: 5000 });
  ok(espn.st.summaryCalls.length === callsBefore2 + 1, 'ayrıntı: yenile düğmesi ayrıntıyı yeniden indirdi');
  await a.goBack();
  await a.waitForFunction(() => !document.querySelector('.sd-pg'), null, { timeout: 4000 });
  ok(await a.isVisible('.sp-pg .sp-m'), 'ayrıntıdan dönünce spor sayfası yerinde');

  // derbi: rehberdeki kanal ayrıntıda da listelenir, dokununca oynar; yabancı yayıncılar
  await openInfo(/Galatasaray/);
  await a.waitForSelector('.sd-pg .sd-ch', { timeout: 8000 });
  ok((await text(a, '.sd-ch .nm')).join('|') === chName, 'ayrıntı: rehberdeki kanal Yayın bölümünde (' + (await text(a, '.sd-ch .nm')).join('|') + ')');
  ok(/Galatasaray - Fenerbahçe/.test(await a.textContent('.sd-ch .sub')), 'ayrıntı: kanal satırında program adı');
  ok(!/Paramount|ESPN/.test(await a.textContent('#sd-bc')), 'ayrıntı: yurtdışı yayıncı ve kaynak adı yok');
  ok(/Maç başlayınca/.test(await a.textContent('#sd-body')) || (await a.$$('.sd-e')).length === 0, 'ayrıntı: başlamamış maçta olay yok, açıklama var');
  await a.click('.sd-ch');
  await a.waitForFunction(() => document.body.classList.contains('player-open') || document.documentElement.classList.contains('native-playing'), null, { timeout: 8000 });
  ok(true, 'ayrıntıdan kanala dokununca oynatıldı');
  await a.goBack();
  await a.waitForFunction(() => !document.body.classList.contains('player-open'), null, { timeout: 5000 });
  await a.goBack();
  await a.waitForFunction(() => !document.querySelector('.sd-pg'), null, { timeout: 4000 });

  // biten maçta satıra dokununca doğrudan ayrıntı açılır; hata ve yeniden deneme
  espn.st.summaryFail = true;
  await a.$$eval('.sp-m', (rows) => rows.find((r) => /Konyaspor/.test(r.textContent)).click());
  await a.waitForSelector('.sd-pg .empty h3', { timeout: 8000 });
  ok(/Ayrıntı alınamadı/.test(await a.textContent('.sd-pg .empty h3')) && /Ayrıntı: HTTP 500/.test(await a.textContent('.sd-pg .empty')), 'ayrıntı hatası nedenle gösteriliyor');
  ok(/MS/.test(await a.textContent('.sd-head')) && /Maç sona erdi/.test(await a.textContent('#sd-bc')), 'ayrıntı: veri gelmese de başlık ve “Maç sona erdi” görünür');
  espn.st.summaryFail = false;
  await a.click('#sd-retry');
  await a.waitForSelector('.sd-pg .sd-e', { timeout: 8000 });
  ok(/Deneme Oyuncu/.test(await a.textContent('.sd-evs')), 'ayrıntı: “Yeniden dene” ile olaylar geldi');
  await a.goBack();
  await a.waitForFunction(() => !document.querySelector('.sd-pg'), null, { timeout: 4000 });

  // yayın bilgisi olmayan maç: ayrıntıda kanal listesi yok
  await openRow(a, /Arsenal/);
  await a.waitForSelector('.sd-pg #sd-bc', { timeout: 8000 });
  ok(/Bu maç için yayın bilgisi bulunamadı/.test(await a.textContent('#sd-bc')) && (await a.$$('#sd-bc .sd-ch')).length === 0 && !/tahmini|beIN/i.test(await a.textContent('#sd-bc')), 'bilgi yoksa kanal listesi ve tahmini yayıncı gösterilmez');
  // görünen metinlerde kaynak adı yok
  ok(!/Spor Ekranı|LiveScore|ESPN|TheSportsDB/i.test(await a.evaluate(() => document.querySelector('.sd-pg').innerText)), 'ayrıntıda kaynak adı yok');
  await a.goBack();
  await a.waitForFunction(() => !document.querySelector('.sd-pg'), null, { timeout: 4000 });
  ok(!/Spor Ekranı|LiveScore|ESPN|TheSportsDB|tahmini/i.test(await a.evaluate(() => document.querySelector('.sp-pg').innerText)), 'listede kaynak adı ve “tahmini” yok');
  ok(A.errs.length === 0, 'sayfa hatası yok: ' + A.errs.join(' | '));
  await A.ctx.close();

  // ---- ikinci cihaz: gün ve lig süzgeci, yayıncı bulunamadı bildirimi, kayıtlı veri
  const B = await mk({ width: 390, height: 844 });
  const b = B.page;
  await b.click('.shortcuts .t-sport');
  await b.waitForSelector('.sp-pg .sp-m');
  await b.click('#sp-days .chip:nth-child(3)'); // yarın
  await b.waitForFunction(() => /Bayern/.test(document.querySelector('.sp-list').textContent));
  let rowsT = await text(b, '.sp-m');
  ok(rowsT.length === 1 && /Bayern Munich/.test(rowsT[0]) && /Paris Saint-Germain/.test(rowsT[0]) && /21:45/.test(rowsT[0]), 'yarının maçı: ' + rowsT.join(' | '));
  ok(/Şampiyonlar Ligi · Grup aşaması · 3\. hafta/.test(rowsT[0]) && /Yayın yok/.test(rowsT[0]), 'lig + tur satırda, yayın bilgisi yok: ' + rowsT[0]);
  await b.click('.sp-m');
  await b.waitForSelector('.sd-pg #sd-bc', { timeout: 6000 });
  ok(/Bu maç için yayın bilgisi bulunamadı/.test(await b.textContent('#sd-bc')), 'yayın bilgisi yoksa ayrıntıda açık not');
  ok(/Şampiyonlar Ligi/.test(await b.textContent('.sd-lg')) && /Grup aşaması · 3\. hafta/.test(await b.textContent('.sd-lg')), 'ayrıntı başlığında turnuva ve aşama: ' + (await b.textContent('.sd-lg')));
  ok((await b.$$('#sd-bc .sd-ch')).length === 0, 'bilgi yoksa kanal listelenmez');
  await b.goBack();
  await b.waitForFunction(() => !document.querySelector('.sd-pg'), null, { timeout: 4000 });
  await b.click('#sp-days .chip:nth-child(5)'); // +3 gün: milli maç
  await b.waitForFunction(() => /Türkiye/.test(document.querySelector('.sp-list').textContent));
  rowsT = await text(b, '.sp-m');
  ok(/Türkiye/.test(rowsT[0]) && /Galler|Wales/.test(rowsT[0]) && /UEFA Uluslar Ligi/.test(rowsT[0]), 'milli maç: Türkçe takım adı ve turnuva: ' + rowsT[0]);
  await b.click('#sp-days .chip:nth-child(4)'); // +2 gün: maç yok
  await b.waitForFunction(() => /Maç yok/.test((document.querySelector('.sp-list .empty') || {}).textContent || ''), null, { timeout: 8000 });
  ok(/Maç yok/.test(await b.textContent('.sp-list .empty')), 'maçsız günde “Maç yok” mesajı');
  await b.click('#sp-days .chip:nth-child(2)'); // bugün
  await b.waitForSelector('.sp-m');
  await b.click('#sp-lgs [data-lg="tur.1"]');
  const onlyTur = await text(b, '.sp-m .sp-l2');
  ok(onlyTur.length === 3 && onlyTur.every((x) => /^Süper Lig/.test(x)), 'lig süzgeci yalnız Süper Lig’i bırakır: ' + onlyTur.join(' | '));
  // kayıtlı veri: sayfa kapanıp açılınca ESPN’e yeniden gitmeden hemen gelir
  const callsBefore = espn.st.calls.length;
  await b.click('.sp-pg [data-close]');
  await b.waitForFunction(() => !document.querySelector('.sp-pg'));
  espn.st.fail = true;
  await b.click('.shortcuts .t-sport');
  await b.waitForSelector('.sp-pg .sp-m', { timeout: 5000 });
  ok(espn.st.calls.length === callsBefore, 'taze kayıtlı veri varken yeniden indirilmedi');
  ok(!/alınamadı|Güncellenemedi/.test(await b.textContent('#sp-upd')), 'kayıtlı veriyle açıldı, hata yok');
  ok(B.errs.length === 0, 'sayfa hatası yok: ' + B.errs.join(' | '));
  await B.ctx.close();
  espn.st.fail = false;

  // ---- ikinci kaynak (LiveScore): ESPN'de olmayan maçlar tamamlanır, yinelenenler tek görünür
  espn.st.lsMode = 'data';
  espn.st.lsCalls.length = 0;
  const E = await mk({ width: 390, height: 844 });
  const e = E.page;
  await e.click('.shortcuts .t-sport');
  await e.waitForFunction(() => /Türkiye · diğer/.test((document.querySelector('#sp-lgs') || {}).textContent || ''), null, { timeout: 12000 });
  const eLgs = await text(e, '#sp-lgs .chip');
  ok(eLgs.some((t) => t.startsWith('Türkiye · diğer')) && eLgs.some((t) => t.startsWith('Avrupa ligleri')) && eLgs.some((t) => t.startsWith('Diğer ülkeler')), 'ikinci kaynağın grupları lig çiplerinde: ' + eLgs.join(' | '));
  const eHeads = await text(e, '.sp-m .sp-l2');
  ok(eHeads.includes('Türkiye · TFF 1. Lig') && eHeads.some((t) => t.startsWith('İngiltere · Championship')) && !eHeads.some((t) => /Brezilya/.test(t)), 'ESPN’de olmayan yarışmalar satırlarda lig adıyla geldi, “diğer ülkeler” Tümü’de yok: ' + eHeads.join(', '));
  const eRows = await text(e, '.sp-m');
  ok(eRows.filter((t) => /Galatasaray/.test(t)).length === 1, 'iki kaynakta da olan maç (Galatasaray) tek satır');
  ok(eRows.filter((t) => /Beşiktaş|Besiktas/.test(t)).length === 1, 'iki kaynakta da olan canlı maç tek satır');
  ok(eRows.some((t) => /Bandirmaspor/.test(t) && /15:00/.test(t)), 'ikinci kaynağın maçı saatiyle listede: ' + eRows.find((t) => /Bandirmaspor/.test(t)));
  ok(/^Son güncelleme \d\d:\d\d/.test(await e.textContent('#sp-upd')) && !/LiveScore|ESPN/.test(await e.textContent('#sp-upd')), 'durum satırında kaynak adı yok: ' + (await e.textContent('#sp-upd')));
  ok(espn.st.lsCalls.length === 1 && espn.st.lsCalls[0].key === (await e.evaluate(() => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; })), 'bugünün LiveScore listesi bir kez indirildi');
  ok(/countryCode=TR/.test(espn.st.lsCalls[0].url), 'LiveScore adresi ülke ve dil parametreli');
  await e.click('#sp-lgs [data-lg="g:oth"]');
  const oth = await text(e, '.sp-m');
  ok(oth.length === 1 && /Flamengo/.test(oth[0]) && /34'/.test(oth[0]) && (await e.$$('.sp-m.on')).length === 1, 'Diğer ülkeler: canlı maç dakikası ve skoruyla: ' + oth.join(' | '));
  ok(/Brezilya · Serie A/.test(await e.textContent('.sp-m .sp-l2')), 'Brezilya maçının ligi Türkçe ülke adıyla');
  await e.click('#sp-lgs [data-lg=""]');
  await e.click('#sp-days .chip:nth-child(3)'); // yarın
  await e.waitForFunction(() => /Ankaragucu/.test(document.querySelector('.sp-list').textContent), null, { timeout: 8000 });
  ok(espn.st.lsCalls.length === 2, 'başka güne geçince o günün listesi indirildi');
  await e.click('#sp-days .chip:nth-child(2)'); // bugün
  await e.waitForSelector('.sp-m');
  await sleep(300);
  ok(espn.st.lsCalls.length === 2, 'taze günde yeniden indirme yok');
  // LiveScore maçının ayrıntısı: olay/istatistik yok, açık not; ESPN ayrıntısı çağrılmaz
  const sumBefore = espn.st.summaryCalls.length;
  ok(/18\. hafta/.test(eRows.find((t) => /Leeds/.test(t)) || ''), 'LiveScore maçında tur bilgisi satırda: ' + eRows.find((t) => /Leeds/.test(t)));
  await openRow(e, /Bandirmaspor/);
  await e.waitForSelector('.sd-pg .sd-note', { timeout: 6000 });
  await sleep(300);
  ok(/olay, istatistik ve kadro bilgisi yok/.test(await e.textContent('#sd-body')) && !/LiveScore/.test(await e.textContent('.sd-pg')) && /Bandirmaspor/.test(await e.textContent('.sd-head')) && /Türkiye · TFF 1. Lig/.test(await e.textContent('.sd-head')), 'LiveScore maçı ayrıntısı: lig adı ve açıklama');
  ok(espn.st.summaryCalls.length === sumBefore, 'LiveScore maçı için ESPN ayrıntısı istenmedi');
  await e.goBack();
  await e.waitForFunction(() => !document.querySelector('.sd-pg'), null, { timeout: 4000 });
  await e.screenshot({ path: path.join(SHOTS, '83-spor-livescore.png') });
  ok(E.errs.length === 0, 'sayfa hatası yok (ikinci kaynak): ' + E.errs.join(' | '));
  await E.ctx.close();

  // ESPN çökerse maçlar LiveScore'dan gelir (hata ekranı yok); nedeni listenin üstünde yazar
  espn.st.fail = true;
  const F = await mk({ width: 390, height: 844 });
  const f = F.page;
  await f.click('.shortcuts .t-sport');
  await f.waitForFunction(() => document.querySelectorAll('.sp-m').length > 0, null, { timeout: 25000 });
  await f.waitForFunction(() => /^Son güncelleme/.test((document.querySelector('#sp-upd') || {}).textContent || ''), null, { timeout: 15000 });
  const fHeads = await text(f, '.sp-m .sp-l2');
  ok(!(await f.$('.sp-list .empty h3')) && fHeads.includes('Türkiye · Super Lig') && fHeads.includes('Türkiye · TFF 1. Lig'), 'ESPN yokken ikinci kaynağın maçları listede: ' + fHeads.join(', '));
  ok(/bazı veriler alınamadı/.test(await f.textContent('#sp-upd')) && !/ESPN/.test(await f.textContent('#sp-upd')), 'durum satırı kaynak adı vermeden uyarıyor: ' + (await f.textContent('#sp-upd')));
  ok(/ESPN: .*HTTP 500/.test(await f.textContent('.sp-src')), 'ESPN hata nedeni listenin üstünde');
  ok((await text(f, '.sp-m')).filter((t) => /Galatasaray/.test(t)).length === 1, 'ESPN yokken Galatasaray maçı LiveScore’dan tek satır');
  ok(F.errs.length === 0, 'sayfa hatası yok (ESPN yok): ' + F.errs.join(' | '));
  await F.ctx.close();
  espn.st.fail = false;

  // LiveScore çökerse ESPN listesi eskisi gibi; neden yazılır, düzelince “Yenile” ile tamamlanır
  espn.st.lsMode = 'fail';
  const G = await mk({ width: 390, height: 844 });
  const g = G.page;
  await g.click('.shortcuts .t-sport');
  await g.waitForFunction(() => /LiveScore: HTTP 500/.test((document.querySelector('.sp-src') || {}).textContent || ''), null, { timeout: 15000 });
  ok(!/LiveScore/.test(await g.textContent('#sp-upd')), 'LiveScore çalışmasa da durum satırında adı geçmez');
  ok((await g.$$('.sp-m')).length === 5 && !(await g.$('.sp-list .empty h3')), 'LiveScore yokken ESPN listesi bozulmadı');
  ok(/LiveScore: HTTP 500/.test(await g.textContent('.sp-src')), 'LiveScore hata nedeni gösteriliyor: ' + (await g.textContent('.sp-src')));
  espn.st.lsMode = 'badshape';
  await g.click('#sp-ref');
  await g.waitForFunction(() => /Beklenmeyen yanıt biçimi/.test((document.querySelector('.sp-src') || {}).textContent || ''), null, { timeout: 15000 });
  ok(true, 'beklenmeyen LiveScore biçimi açıkça bildirildi');
  espn.st.lsMode = 'data';
  await g.click('#sp-ref');
  await g.waitForFunction(() => /Bandirmaspor/.test(document.querySelector('.sp-list').textContent), null, { timeout: 15000 });
  ok(!/LiveScore:/.test((await g.textContent('.sp-src').catch(() => '')) || ''), 'LiveScore düzelince teknik uyarı kalktı, maçlar tamamlandı');
  ok(G.errs.length === 0, 'sayfa hatası yok (LiveScore yok): ' + G.errs.join(' | '));
  await G.ctx.close();
  espn.st.lsMode = 'empty';

  // ---- yayın bilgisi: yayın akışı (maç takvimi + kanal), yedek kaynak, bilgi yoksa kanal gösterilmez
  espn.st.lsMode = 'data';
  espn.st.seMode = 'data';
  espn.st.tvMode = 'empty';
  espn.st.seCalls.length = 0;
  espn.st.tvCalls.length = 0;
  const H = await mk({ width: 390, height: 844 });
  const h = H.page;
  await h.evaluate(() => {
    const { S } = window.__iptv;
    S.cat.live[1].name = 'TR: TRT SPOR HD';
  });
  await h.click('.shortcuts .t-sport');
  const boxOf = (pg, re) => pg.$$eval('.sp-m', (rows, src) => { const r = rows.find((x) => new RegExp(src).test(x.textContent)); const b = r && r.querySelector('.sp-cb'); return b ? { title: b.getAttribute('title') || '', txt: b.textContent.trim(), none: b.classList.contains('none'), img: !!b.querySelector('img') } : null; }, re.source);
  await h.waitForFunction(() => [...document.querySelectorAll('.sp-m')].some((r) => /Arsenal/.test(r.textContent) && (r.querySelector('.sp-cb') || {}).title === 'TRT Spor'), null, { timeout: 12000 });
  ok(!/Spor Ekranı|LiveScore|ESPN|TheSportsDB|tahmini/i.test(await h.evaluate(() => document.querySelector('.sp-pg').innerText)), 'listede kaynak adı ve “tahmini” yok');
  ok(/\/home\/day\/\d{4}-\d\d-\d\d$/.test(espn.st.seCalls[0]) && espn.st.tvCalls.length === 0, 'günlük yayın akışı sayfası istendi, yedek kaynağa gidilmedi: ' + espn.st.seCalls[0]);
  ok((await boxOf(h, /Arsenal/)).title === 'TRT Spor', 'ESPN maçında yayın akışındaki kanal sağdaki kutuda');
  ok((await boxOf(h, /Bandirmaspor/)).title === 'Tabii', 'ikinci kaynak maçında da (Bandırmaspor ı/i farkına rağmen) kanal kutuda');
  const gsBox = await boxOf(h, /Galatasaray/);
  ok(gsBox.title === 'beIN Sports 1, beIN Sports Max 2' && /\+1/.test(gsBox.txt), 'birden çok kanalda ilki ve +1 rozeti: ' + JSON.stringify(gsBox));
  // takvimde olmayan maçlar yayın akışından gelir: lig/turnuva, saat, kanal logosu
  const rowTxt = async (re) => (await text(h, '.sp-m')).find((t) => re.test(t));
  const kepez = await rowTxt(/Kepez/);
  ok(/13:00/.test(kepez) && /Kepez Bld\. - Balıkesirspor/.test(kepez) && /TFF 3\. Lig/.test(kepez), 'ESPN/ikinci kaynakta olmayan maç yayın akışından listede, lig adıyla: ' + kepez);
  const kb = await boxOf(h, /Kepez/);
  ok(kb.title === 'Tivibu Spor 1' && kb.img, 'kanal logosu görüntü olarak gösterilir: ' + JSON.stringify(kb));
  const erm = await rowTxt(/Ermenistan/);
  ok(/UEFA Uluslar Ligi/.test(erm) && /Yayın yok/.test(erm), 'yayınsız maç “Yayın yok” kutusuyla: ' + erm);
  // teknik ayrıntı (kaynak adlarıyla) durum satırına dokununca açılır
  ok(!(await h.isVisible('.sp-src')), 'teknik ayrıntı varsayılan gizli');
  await h.click('#sp-upd');
  ok(await h.isVisible('.sp-src') && /Spor Ekranı: /.test(await h.textContent('.sp-src')), 'durum satırına dokununca teknik ayrıntı görünür: ' + (await h.textContent('.sp-src')).slice(0, 100));
  await h.click('#sp-upd');
  await openRow(h, /Arsenal/);
  await h.waitForSelector('.sd-pg #sd-bc .sd-ch', { timeout: 8000 });
  const hc = await text(h, '#sd-bc .sd-ch .nm');
  ok(hc.length === 1 && /TRT SPOR HD/.test(hc[0]), 'yayın akışındaki kanalın kullanıcı listesindeki karşılığı: ' + hc.join(', '));
  ok(/^Yayın kanalları: TRT Spor$/.test(await h.textContent('#sd-bc .sd-grp h5')) && !/Kaynak|Spor Ekranı/.test(await h.textContent('#sd-bc')), 'grup başlığı kaynak adı vermeden: ' + (await h.textContent('#sd-bc .sd-grp h5')));
  await h.click('#sd-bc .sd-ch');
  await h.waitForFunction(() => document.body.classList.contains('player-open') || document.documentElement.classList.contains('native-playing'), null, { timeout: 8000 });
  ok(true, 'ayrıntıdaki kanala dokununca oynatıldı');
  await h.goBack();
  await h.waitForFunction(() => !document.body.classList.contains('player-open'), null, { timeout: 5000 });
  await h.goBack();
  await h.waitForFunction(() => !document.querySelector('.sd-pg'), null, { timeout: 4000 });
  await openRow(h, /Bandirmaspor/);
  await h.waitForSelector('.sd-pg #sd-bc', { timeout: 8000 });
  ok(/Yayın kanalları: Tabii/.test(await h.textContent('#sd-bc')) && /listenizde bulunamadı/.test(await h.textContent('#sd-bc')) && (await h.$$('#sd-bc .sd-ch')).length === 0, 'listede olmayan kanal için ayrıntıda açık not: ' + (await h.textContent('#sd-bc')).slice(0, 120));
  await h.goBack();
  await h.waitForFunction(() => !document.querySelector('.sd-pg'), null, { timeout: 4000 });
  // yayın akışından gelen maçın ayrıntısı: ESPN ayrıntısı istenmez, lig adı ve kanal var
  const sumB = espn.st.summaryCalls.length;
  await openRow(h, /Kepez/);
  await h.waitForSelector('.sd-pg #sd-bc', { timeout: 8000 });
  await sleep(300);
  ok(/TFF 3\. Lig/.test(await h.textContent('.sd-lg')) && /Tivibu Spor 1/.test(await h.textContent('#sd-bc')) && espn.st.summaryCalls.length === sumB, 'yayın akışı maçının ayrıntısı: lig, kanal; ESPN ayrıntısı istenmedi');
  await h.goBack();
  await h.waitForFunction(() => !document.querySelector('.sd-pg'), null, { timeout: 4000 });
  // yayın bilgisi bulunamayan maç (Leeds–Burnley): kanal listesi gösterilmez
  await openRow(h, /Leeds/);
  await h.waitForSelector('.sd-pg #sd-bc', { timeout: 8000 });
  ok(/Bu maç için yayın bilgisi bulunamadı/.test(await h.textContent('#sd-bc')) && (await h.$$('#sd-bc .sd-ch')).length === 0, 'yayın bilgisi bulunamayan maçta kanal listesi yok: ' + (await h.textContent('#sd-bc')).slice(0, 100));
  await h.goBack();
  await h.waitForFunction(() => !document.querySelector('.sd-pg'), null, { timeout: 4000 });
  await h.click('#sp-days .chip:nth-child(3)'); // yarın: ikinci kaynaktaki 1. Lig maçı, yayın kaydı yok
  await h.waitForFunction(() => /Ankaragucu/.test(document.querySelector('.sp-list').textContent), null, { timeout: 8000 });
  ok((await boxOf(h, /Ankaragucu/)).none, 'yayın kaydı olmayan maçta tahmin yok, “Yayın yok”');
  // takım simgeleri: kulüp rozeti aranır (bulunursa görsel, yoksa baş harf yer tutucu), milli takım maçında iki bayrak
  while (await h.$('.sd-pg')) await h.click('.sd-pg [data-close]'); // açık ayrıntı sayfaları kapanır
  await h.waitForSelector('.sp-pg .sp-m', { timeout: 8000 });
  await h.click('#sp-days .chip:nth-child(2)'); // bugün
  await h.waitForFunction(() => [...document.querySelectorAll('.sp-m')].some((r) => /Arsenal/.test(r.textContent) && r.querySelector('.sp-flag img[src*="/badge/arsenal.png/tiny"]')), null, { timeout: 30000 });
  ok(true, 'ESPN logosu olmayan kulüp için rozet bulundu ve satırda görünüyor');
  const ph = await h.$$eval('.sp-m', (rows) => { const r = rows.find((x) => /Liverpool/.test(x.textContent)); return [...r.querySelectorAll('.sp-flag')].map((f) => ({ i: f.dataset.i, img: !!f.querySelector('img') })); });
  ok(ph.length === 2 && ph[0].i === 'L' && !ph[0].img, 'rozeti bulunamayan takımda baş harf yer tutucu: ' + JSON.stringify(ph));
  ok(!(await h.evaluate(() => document.querySelector('.sp-m .sp-flag').textContent)), 'yer tutucu harf CSS ile çizilir (metin değil)');
  await h.click('#sp-days .chip:nth-child(5)');
  const trRow = () => [...document.querySelectorAll('.sp-m')].find((r) => /^Türkiye/.test(r.querySelector('.sp-tt').textContent.trim()));
  await h.waitForFunction(`(${trRow})()`, null, { timeout: 8000 });
  const fl = await h.evaluate(`((${trRow})() && [...(${trRow})().querySelectorAll('.sp-flag.fl img')].map((i) => i.getAttribute('src')))`);
  ok(fl.length === 2 && fl[0] === 'https://flagcdn.com/w80/tr.png' && fl[1] === 'https://flagcdn.com/w80/gb-wls.png', 'milli takım maçında iki ülke bayrağı: ' + fl.join(', '));
  await h.evaluate(`(${trRow})().click()`);
  await h.waitForSelector('.sd-team .sp-flag.fl img', { timeout: 8000 });
  ok((await h.$$('.sd-team .sp-flag.fl img')).length === 2, 'maç ayrıntısı başlığında da iki bayrak');
  await h.click('.sd-pg [data-close]');
  ok(H.errs.length === 0, 'sayfa hatası yok (yayın bilgisi): ' + H.errs.join(' | '));
  await H.ctx.close();

  // Spor Ekranı alınamazsa yedek kaynak (TheSportsDB) devreye girer; neden yazılır
  espn.st.seMode = 'fail';
  espn.st.tvMode = 'data';
  espn.st.tvCalls.length = 0;
  const I = await mk({ width: 390, height: 844 });
  const i = I.page;
  await i.click('.shortcuts .t-sport');
  await i.waitForFunction(() => [...document.querySelectorAll('.sp-m')].some((r) => /Arsenal/.test(r.textContent) && (r.querySelector('.sp-cb') || {}).title === 'TRT Spor'), null, { timeout: 15000 });
  ok(/json\/123\/eventstv\.php\?d=\d{4}-\d\d-\d\d&a=Turkey/.test(espn.st.tvCalls[0]) && !/TheSportsDB|Spor Ekranı/.test(await i.evaluate(() => document.querySelector('.sp-pg').innerText)), 'yedek kaynaktan kanal geldi, kaynak adı görünmüyor');
  ok(/Spor Ekranı: HTTP 500/.test(await i.textContent('.sp-src')), 'asıl kaynağın hata nedeni listenin üstünde: ' + (await i.textContent('.sp-src')));
  ok(I.errs.length === 0, 'sayfa hatası yok (yedek kaynak): ' + I.errs.join(' | '));
  await I.ctx.close();

  // Spor Ekranı çökerse sıradaki yedek site: Maç Rehberi; o da çökerse (Sahadan bugünü verir ama burada 503) LiveSoccerTV. Kaynak adı görünmez.
  espn.st.tvMode = 'empty';
  espn.st.altMode = 'mr';
  espn.st.altCalls.length = 0;
  const M2 = await mk({ width: 390, height: 844 });
  const m2 = M2.page;
  await m2.click('.shortcuts .t-sport');
  await m2.waitForFunction(() => [...document.querySelectorAll('.sp-m')].some((r) => /Kepez/.test(r.textContent) && (r.querySelector('.sp-cb') || {}).title === 'Tivibu Spor 1'), null, { timeout: 15000 });
  const bnd = await m2.$$eval('.sp-m', (rows) => { const r = rows.find((x) => /Kepez/.test(x.textContent)); return { l2: r.querySelector('.sp-l2').textContent }; });
  ok(bnd.l2 === 'TFF 3. Lig', 'Spor Ekranı yokken Maç Rehberi’nden lig ve kanal geldi: ' + bnd.l2);
  ok((await boxOf(m2, /Band[ıi]rmaspor/)).title === 'Tabii', 'Maç Rehberi’ndeki kanal ESPN/ikinci kaynak maçına da eşlendi');
  ok(/macrehberi\.com\/gun\/\d{4}-\d\d-\d\d$/.test(espn.st.altCalls[0]), 'yedek site günlük adresinden alındı: ' + espn.st.altCalls[0]);
  ok(!/Maç Rehberi|Spor Ekranı|Sahadan|LiveSoccerTV/.test(await m2.evaluate(() => document.querySelector('.sp-pg').innerText)), 'yedek sitenin adı da görünmüyor');
  ok(/Spor Ekranı: HTTP 500/.test(await m2.textContent('.sp-src')) && /Maç Rehberi: \d+ bağlantı/.test(await m2.textContent('.sp-src')), 'teşhis: her kaynağın durumu: ' + (await m2.textContent('.sp-src')));
  ok(M2.errs.length === 0, 'sayfa hatası yok (Maç Rehberi): ' + M2.errs.join(' | '));
  await M2.ctx.close();

  espn.st.altMode = 'lst';
  espn.st.altCalls.length = 0;
  const L2 = await mk({ width: 390, height: 844 });
  const l2 = L2.page;
  await l2.click('.shortcuts .t-sport');
  await l2.waitForFunction(() => [...document.querySelectorAll('.sp-m')].some((r) => /Kepez/.test(r.textContent) && (r.querySelector('.sp-cb') || {}).title === 'Tivibu Spor 1'), null, { timeout: 15000 });
  const lrow = await l2.$$eval('.sp-m', (rows) => rows.find((x) => /Kepez/.test(x.textContent)).querySelector('.sp-l2').textContent);
  ok(lrow === 'Türkiye TFF 3. Lig', 'üçüncü yedek (LiveSoccerTV): lig ve kanal geldi: ' + lrow);
  const altOrder = espn.st.altCalls.map((u) => (/macrehberi/.test(u) ? 'mr' : /sahadan/.test(u) ? 'sd' : /livesoccertv/.test(u) ? 'lst' : '?'));
  ok(altOrder.slice(0, 3).join(',') === 'mr,sd,lst', 'yedekler sırayla denendi: ' + altOrder.join(','));
  ok(L2.errs.length === 0, 'sayfa hatası yok (LiveSoccerTV): ' + L2.errs.join(' | '));
  await L2.ctx.close();
  espn.st.altMode = 'fail';

  // İki yayın kaynağı da yoksa liste bozulmaz; nedenler yazılır
  espn.st.tvMode = 'fail';
  const J = await mk({ width: 390, height: 844 });
  const j = J.page;
  await j.click('.shortcuts .t-sport');
  await j.waitForFunction(() => /TheSportsDB: HTTP 500/.test((document.querySelector('.sp-src') || {}).textContent || ''), null, { timeout: 15000 });
  const jsrc = await j.textContent('.sp-src');
  ok((await j.$$('.sp-m')).length >= 4 && /Spor Ekranı: HTTP 500/.test(jsrc) && /TheSportsDB: HTTP 500/.test(jsrc), 'iki yayın kaynağı yokken maçlar listede, nedenler yazıyor: ' + jsrc);
  espn.st.tvMode = 'badshape';
  await j.click('#sp-ref');
  await j.waitForFunction(() => /Beklenmeyen yanıt biçimi/.test((document.querySelector('.sp-src') || {}).textContent || ''), null, { timeout: 15000 });
  ok(true, 'beklenmeyen yedek kaynak biçimi açıkça bildirildi');
  ok(J.errs.length === 0, 'sayfa hatası yok (yayın kaynakları yok): ' + J.errs.join(' | '));
  await J.ctx.close();

  // Sayfa yapısı değişirse (futbol satırı çıkmıyorsa) teşhis satırı gösterir
  espn.st.seMode = 'nofootball';
  espn.st.tvMode = 'empty';
  const K = await mk({ width: 390, height: 844 });
  const k = K.page;
  await k.click('.shortcuts .t-sport');
  await k.waitForFunction(() => /Spor Ekranı: 1 bağlantı/.test((document.querySelector('.sp-src') || {}).textContent || ''), null, { timeout: 15000 });
  ok(/Spor Ekranı: 1 bağlantı, 0 futbol, 0 kanallı; örnek: Tenis \| 01:00/.test(await k.textContent('.sp-src')), 'futbol satırı yoksa teşhis (bağlantı sayısı ve örnek satır): ' + (await k.textContent('.sp-src')));
  espn.st.seMode = 'blocked';
  await k.click('#sp-ref');
  await k.waitForFunction(() => /maç bağlantısı yok/.test((document.querySelector('.sp-src') || {}).textContent || ''), null, { timeout: 15000 });
  ok(true, 'tanınmayan sayfa (engel/yapı değişikliği) açıkça bildirildi');
  ok(K.errs.length === 0, 'sayfa hatası yok (teşhis): ' + K.errs.join(' | '));
  await K.ctx.close();
  espn.st.seMode = 'data0';
  espn.st.tvMode = 'empty';
  espn.st.lsMode = 'empty';

  // ---- hata ekranı ve yeniden deneme (kayıtlı veri yok)
  espn.st.fail = true;
  espn.st.failDelay = 600; // “yükleniyor” görüntüsü yoklanabilsin
  const C = await mk({ width: 390, height: 844 });
  const c = C.page;
  await c.click('.shortcuts .t-sport');
  ok(/yükleniyor/.test(await c.textContent('.sp-list')), 'indirme sürerken “yükleniyor” görünüyor (“Maç yok” değil)');
  await c.waitForSelector('.sp-list .empty h3', { timeout: 20000 });
  ok(/Maçlar alınamadı/.test(await c.textContent('.sp-list .empty h3')) && /İnternet bağlantınızı denetleyin/.test(await c.textContent('.sp-list .empty')), 'hiçbir lig alınamazsa açık hata ekranı');
  ok(/Ayrıntı: [a-z0-9.]+: HTTP 500/.test(await c.textContent('.sp-list .empty')) && !/ESPN|LiveScore/.test(await c.textContent('.sp-list .empty')), 'hata ekranı nedeni gösteriyor (ör. “tur.1: HTTP 500”), kaynak adı yok');
  await c.screenshot({ path: path.join(SHOTS, '81-spor-hata.png') });
  espn.st.fail = false;
  espn.st.failDelay = 0;
  await c.click('#sp-retry');
  await c.waitForSelector('.sp-m', { timeout: 15000 });
  ok(true, '“Yeniden dene” ile maçlar geldi');
  await c.click('#sp-ref');
  await c.waitForFunction(() => /Son güncelleme/.test(document.querySelector('#sp-upd').textContent));
  ok(true, 'yenile düğmesi çalışıyor');
  // ESPN limit parametresini reddederse yalın adrese düşülür ve maçlar yine gelir
  espn.st.rejectLimit = true;
  espn.st.urls.length = 0;
  await c.click('#sp-ref');
  await c.waitForFunction(() => /Son güncelleme/.test(document.querySelector('#sp-upd').textContent), null, { timeout: 15000 });
  ok(espn.st.urls.some((u) => !/limit=/.test(u)) && (await c.$$('.sp-m')).length > 0, 'limit reddedilince aralık adresine düşüldü, maçlar yine listede');
  espn.st.rejectLimit = false;
  ok(C.errs.length === 0, 'sayfa hatası yok (hata yolu): ' + C.errs.join(' | '));
  await C.ctx.close();

  // ---- yatay ekran: kutu sığıyor
  const D = await mk({ width: 844, height: 390 });
  const d = D.page;
  await d.click('.shortcuts .t-sport');
  await d.waitForSelector('.sp-pg .sp-m');
  const over = await d.$$eval('.sp-pg .sp-m', (rows) => rows.filter((r) => r.scrollWidth > r.clientWidth + 1).length);
  ok(over === 0, 'yatay ekranda maç satırları taşmıyor');
  await sleep(700); // sayfa açılış animasyonu bitsin
  await d.screenshot({ path: path.join(SHOTS, '82-spor-yatay.png') });
  // kumanda: ayrıntı sayfasında alttaki içerik aşağı okla okunur (alt düğmeye sıçramaz), yukarı okla başa dönülür
  await openRow(d, /Beşiktaş/);
  await d.waitForSelector('.sd-pg .sd-e', { timeout: 8000 });
  await sleep(500);
  const bodyTop = () => d.evaluate(() => document.querySelector('.sd-pg .pg-body').scrollTop);
  ok((await d.evaluate(() => { const b = document.querySelector('.sd-pg .pg-body'); return b.scrollHeight - b.clientHeight; })) > 150, 'yatay ekranda ayrıntı sayfası ekrandan uzun');
  await d.focus('#sd-ref');
  for (let i = 0; i < 30; i++) {
    await d.keyboard.press('ArrowDown');
    await sleep(40);
  }
  const atEnd = await d.evaluate(() => { const b = document.querySelector('.sd-pg .pg-body'); return b.scrollHeight - b.clientHeight - b.scrollTop; });
  ok(atEnd <= 2, 'kumanda: aşağı okla ayrıntı sayfası sonuna kadar okundu (kalan ' + atEnd + 'px)');
  for (let i = 0; i < 40; i++) {
    await d.keyboard.press('ArrowUp');
    await sleep(40);
  }
  ok((await bodyTop()) <= 2, 'kumanda: yukarı okla ayrıntı sayfası başına dönüldü (' + (await bodyTop()) + 'px)');
  await D.ctx.close();
}

module.exports = { sportsSection };

if (require.main === module) {
  (async () => {
    const { chromium } = require('playwright');
    const http = require('node:http');
    const fs = require('node:fs');
    const WWW = path.join(__dirname, '..', '..', 'www');
    const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    const SHOTS = process.env.SHOTS || path.join(__dirname, 'shots');
    fs.mkdirSync(SHOTS, { recursive: true });
    let fails = 0;
    const ok = (c, m) => {
      console.log((c ? '  ✓ ' : '  ✗ ') + m);
      if (!c) fails++;
    };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const { startMock } = await import('../../mock/server.mjs');
    const mock = await startMock(0);
    const www = await new Promise((r) => {
      const srv = http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p === '/') p = '/index.html';
        const f = path.join(WWW, p);
        if (!f.startsWith(WWW) || !fs.existsSync(f)) return res.writeHead(404).end();
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }).end(fs.readFileSync(f));
      });
      srv.listen(0, '127.0.0.1', () => r(srv));
    });
    const base = `http://127.0.0.1:${www.address().port}/`;
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    await sportsSection({ browser, base, mock, ok, sleep, SHOTS });
    await browser.close();
    www.close();
    await mock.close();
    console.log(fails ? `\n${fails} denetim BAŞARISIZ` : '\nSpor denetimleri geçti');
    process.exit(fails ? 1 : 0);
  })().catch((e) => {
    console.error(e);
    process.exit(2);
  });
}
