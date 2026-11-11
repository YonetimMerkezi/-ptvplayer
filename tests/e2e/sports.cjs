// Spor (futbol) ekranı uçtan uca denemesi: sahte ESPN yanıtları (gerçek servise hiç gidilmez), gün/lig süzgeci, canlı skor,
// TV rehberinden kanal eşleştirme ve kanala geçiş, yayıncı adı yedeği, kısmi hata, hata ekranı. Tek başına: node tests/e2e/sports.cjs
// (run.cjs sonunda da çağrılır).
const path = require('node:path');

const CORS = { 'access-control-allow-origin': '*' };

function fakeEspn() {
  const st = { fail: false, failDelay: 0, rejectLimit: false, summaryFail: false, summaryCalls: [], failLeagues: new Set(['ger.1']), calls: [], urls: [], lsMode: 'empty', lsCalls: [] };
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
      status: { displayClock: o.clock || '', type: { state: o.state || 'pre', name: o.name || 'STATUS_SCHEDULED' } },
      competitors: [
        { homeAway: 'home', score: o.hs, team: { displayName: home, abbreviation: home.slice(0, 3).toUpperCase(), logo: '' } },
        { homeAway: 'away', score: o.as, team: { displayName: away, abbreviation: away.slice(0, 3).toUpperCase(), logo: '' } },
      ],
    }],
  });
  const data = () => ({
    'tur.1': [
      ev(1, at(0, 20, 0), 'Galatasaray', 'Fenerbahçe'),
      ev(2, at(0, 17, 0), 'Beşiktaş', 'Trabzonspor', { hs: '1', as: '0', state: 'in', name: 'STATUS_SECOND_HALF', clock: "67'" }),
      ev(3, at(0, 14, 0), 'Konyaspor', 'Rizespor', { hs: '2', as: '2', state: 'post', name: 'STATUS_FULL_TIME' }),
    ],
    'uefa.champions': [ev(4, at(1, 21, 45), 'Bayern Munich', 'Paris Saint-Germain')],
    'uefa.nations': [ev(5, at(3, 20, 45), 'Turkey', 'Wales')],
    'eng.1': [ev(6, at(0, 19, 0), 'Arsenal', 'Chelsea')],
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
        { Sid: 'ch', Cnm: 'England', Snm: 'Championship', Events: [e('c1', 'Leeds', 'Burnley', 20, 45)] },
      ],
    };
  };
  async function install(ctx) {
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
    await page.addInitScript(() => localStorage.setItem('iptv.pref.seen.changelog', '999'));
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
  const heads = await text(a, '.sp-lg-h');
  ok(heads[0] === 'Süper Lig' && heads[1] === 'Premier Lig', 'bölümler lig sırasıyla: ' + heads.join(', '));

  // canlı skor
  const live = await a.$eval('.sp-m.on', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  ok(/67'/.test(live) && /Beşiktaş/.test(live) && /Trabzonspor/.test(live) && /1/.test(live), 'canlı maç: dakika ve skor görünüyor: ' + live);
  ok(await a.$eval('.sp-m.on .sp-live', (e) => getComputedStyle(e).color !== getComputedStyle(document.body).color), 'canlı yazı ayrı renkte');
  const done = (await text(a, '.sp-m')).find((t) => /Konyaspor/.test(t));
  ok(/MS/.test(done) && /2.*2/.test(done), 'biten maç: MS ve skor: ' + done);
  ok(!/Yayıncı|▶/.test(done), 'biten maçta yayıncı satırı yok');
  ok(await a.$eval('#sp-upd', (e) => /Son güncelleme \d\d:\d\d · 1 lig alınamadı/.test(e.textContent)), 'bir lig alınamadı uyarısı: ' + (await a.textContent('#sp-upd')));

  // kanal eşleştirme (TV rehberi başlığından)
  const derby = (await a.$$('.sp-m')).length && (await a.$$eval('.sp-m', (rows) => rows.find((r) => /Galatasaray/.test(r.textContent)).querySelector('.sp-ch span')?.textContent));
  ok(derby === chName, 'derbi rehberdeki kanala eşleşti: ' + derby + ' (beklenen ' + chName + ')');
  ok(await a.$$eval('.sp-m', (rows) => !rows.find((r) => /Arsenal/.test(r.textContent)).querySelector('.sp-ch')), 'rehberde karşılığı olmayan maçta kanal yok');
  const arsenalBc = await a.$$eval('.sp-m', (rows) => rows.find((r) => /Arsenal/.test(r.textContent)).querySelector('.sp-bc').textContent.replace(/\s+/g, ' ').trim());
  ok(/Yayıncı: beIN SPORTS \(tahmini\)/.test(arsenalBc), 'yayıncı adı yedeği (tahmini): ' + arsenalBc);
  await a.screenshot({ path: path.join(SHOTS, '80-spor-dikey.png') });

  // eşleşen kanala dokununca oynatıcı açılır
  await a.$$eval('.sp-m', (rows) => rows.find((r) => /Galatasaray/.test(r.textContent)).click());
  await a.waitForFunction(() => document.body.classList.contains('player-open') || document.documentElement.classList.contains('native-playing'), null, { timeout: 8000 });
  ok(true, 'maça dokununca eşleşen kanal oynatıldı');
  await a.goBack();
  await a.waitForFunction(() => !document.body.classList.contains('player-open'), null, { timeout: 5000 });
  ok(await a.isVisible('.sp-pg .sp-m'), 'oynatıcıdan dönünce spor sayfası yerinde');

  // ---- maç ayrıntısı: canlı maç (olaylar, istatistik, kadro, stat/hakem, yayıncı yedeği)
  const openInfo = (re) => a.$$eval('.sp-m', (rows, src) => rows.find((r) => new RegExp(src).test(r.textContent)).querySelector('[data-info]').click(), re.source);
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
  ok(/Tahmini yayıncı: beIN SPORTS/.test(await a.textContent('#sd-bc')) && (await a.isVisible('#sd-bcs')), 'ayrıntı: rehberde yoksa tahmini yayıncı ve kanal listesi düğmesi');
  await sleep(700); // sayfa açılış geçişi bitsin
  await a.screenshot({ path: path.join(SHOTS, '82-spor-ayrinti.png') });
  await a.click('#sd-bcs');
  await a.waitForSelector('.sheet .sp-cands [data-i]', { timeout: 5000 });
  ok(/BEIN SPORTS 1/i.test(await a.textContent('.sheet .sp-cands')), 'ayrıntı: yayıncı kanalları listesi açıldı');
  await a.goBack();
  await a.waitForFunction(() => !document.querySelector('.sheet .sp-cands'), null, { timeout: 4000 });
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
  await a.waitForFunction(() => /Paramount\+/.test(document.querySelector('#sd-intl').textContent), null, { timeout: 5000 });
  ok(/Paramount\+.*ABD/.test(await a.textContent('#sd-intl')), 'ayrıntı: ESPN’deki yabancı yayıncılar ülke adıyla');
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

  // eşleşmesi olmayan maç: yayıncının kanalları listelenir
  await a.$$eval('.sp-m', (rows) => rows.find((r) => /Arsenal/.test(r.textContent)).click());
  await a.waitForSelector('.sheet .sp-cands [data-i]', { timeout: 5000 });
  const cands = await text(a, '.sheet .sp-cands .nm');
  ok(cands.length === 1 && /BEIN SPORTS 1/i.test(cands[0]), 'beIN kanalı listede: ' + cands.join(', '));
  ok(/beIN SPORTS kanalları/.test(await a.textContent('.sheet h3')), 'sayfa başlığı yayıncı adı');
  await a.click('.sheet .sp-cands [data-i="0"]');
  await a.waitForFunction(() => document.body.classList.contains('player-open') || document.documentElement.classList.contains('native-playing'), null, { timeout: 8000 });
  ok(true, 'yayıncı kanalı listesinden seçilen kanal oynatıldı');
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
  ok(/TRT \/ Tabii \(tahmini\)/.test(rowsT[0]), 'Şampiyonlar Ligi yayıncısı TRT / Tabii (tahmini)');
  await b.click('.sp-m');
  await b.waitForFunction(() => /Listenizde TRT \/ Tabii kanalı bulunamadı/.test(document.querySelector('#toast').textContent), null, { timeout: 4000 });
  ok(true, 'listede yayıncı kanalı yoksa açık bildirim');
  await b.click('#sp-days .chip:nth-child(5)'); // +3 gün: milli maç
  await b.waitForFunction(() => /Türkiye/.test(document.querySelector('.sp-list').textContent));
  rowsT = await text(b, '.sp-m');
  ok(/Türkiye/.test(rowsT[0]) && /Galler|Wales/.test(rowsT[0]) && /A Spor \/ ATV/.test(rowsT[0]), 'milli maç: Türkçe takım adı ve A Spor / ATV: ' + rowsT[0]);
  await b.click('#sp-days .chip:nth-child(4)'); // +2 gün: maç yok
  await b.waitForFunction(() => document.querySelector('.sp-list .empty'));
  ok(/Maç yok/.test(await b.textContent('.sp-list .empty')), 'maçsız günde “Maç yok” mesajı');
  await b.click('#sp-days .chip:nth-child(2)'); // bugün
  await b.waitForSelector('.sp-m');
  await b.click('#sp-lgs [data-lg="tur.1"]');
  const onlyTur = await text(b, '.sp-lg-h');
  ok(onlyTur.length === 1 && onlyTur[0] === 'Süper Lig' && (await b.$$('.sp-m')).length === 3, 'lig süzgeci yalnız Süper Lig’i bırakır');
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
  const eHeads = await text(e, '.sp-lg-h');
  ok(eHeads.includes('Türkiye · TFF 1. Lig') && eHeads.includes('İngiltere · Championship') && !eHeads.some((t) => /Brezilya/.test(t)), 'ESPN’de olmayan yarışmalar bölüm olarak geldi, “diğer ülkeler” Tümü’de yok: ' + eHeads.join(', '));
  ok(eHeads[0] === 'Süper Lig' && eHeads.indexOf('Türkiye · TFF 1. Lig') > eHeads.indexOf('Premier Lig'), 'ESPN ligleri önce, ikinci kaynak sonra');
  const eRows = await text(e, '.sp-m');
  ok(eRows.filter((t) => /Galatasaray/.test(t)).length === 1, 'iki kaynakta da olan maç (Galatasaray) tek satır');
  ok(eRows.filter((t) => /Beşiktaş|Besiktas/.test(t)).length === 1, 'iki kaynakta da olan canlı maç tek satır');
  ok(eRows.some((t) => /Bandirmaspor/.test(t) && /15:00/.test(t)), 'ikinci kaynağın maçı saatiyle listede: ' + eRows.find((t) => /Bandirmaspor/.test(t)));
  ok(/LiveScore'dan \+3 maç/.test(await e.textContent('#sp-upd')), 'durum satırı ikinci kaynağın katkısını söylüyor: ' + (await e.textContent('#sp-upd')));
  ok(espn.st.lsCalls.length === 1 && espn.st.lsCalls[0].key === (await e.evaluate(() => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; })), 'bugünün LiveScore listesi bir kez indirildi');
  ok(/countryCode=TR/.test(espn.st.lsCalls[0].url), 'LiveScore adresi ülke ve dil parametreli');
  await e.click('#sp-lgs [data-lg="g:oth"]');
  const oth = await text(e, '.sp-m');
  ok(oth.length === 1 && /Flamengo/.test(oth[0]) && /34'/.test(oth[0]) && (await e.$$('.sp-m.on')).length === 1, 'Diğer ülkeler: canlı maç dakikası ve skoruyla: ' + oth.join(' | '));
  ok(/Brezilya · Serie A/.test(await e.textContent('.sp-lg-h')), 'Brezilya bölümü Türkçe ülke adıyla');
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
  await e.$$eval('.sp-m', (rows) => rows.find((r) => /Bandirmaspor/.test(r.textContent)).querySelector('[data-info]').click());
  await e.waitForSelector('.sd-pg .sd-note', { timeout: 6000 });
  await sleep(300);
  ok(/LiveScore kaynağından/.test(await e.textContent('#sd-body')) && /Bandirmaspor/.test(await e.textContent('.sd-head')) && /Türkiye · TFF 1. Lig/.test(await e.textContent('.sd-head')), 'LiveScore maçı ayrıntısı: lig adı ve açıklama');
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
  const fHeads = await text(f, '.sp-lg-h');
  ok(!(await f.$('.sp-list .empty h3')) && fHeads.includes('Türkiye · Super Lig') && fHeads.includes('Türkiye · TFF 1. Lig'), 'ESPN yokken LiveScore maçları listede: ' + fHeads.join(', '));
  ok(/ESPN alınamadı/.test(await f.textContent('#sp-upd')), 'durum satırı: ESPN alınamadı: ' + (await f.textContent('#sp-upd')));
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
  await g.waitForFunction(() => /LiveScore alınamadı/.test((document.querySelector('#sp-upd') || {}).textContent || ''), null, { timeout: 15000 });
  ok((await g.$$('.sp-m')).length === 4 && !(await g.$('.sp-list .empty h3')), 'LiveScore yokken ESPN listesi bozulmadı');
  ok(/LiveScore: HTTP 500/.test(await g.textContent('.sp-src')), 'LiveScore hata nedeni gösteriliyor: ' + (await g.textContent('.sp-src')));
  espn.st.lsMode = 'badshape';
  await g.click('#sp-ref');
  await g.waitForFunction(() => /Beklenmeyen yanıt biçimi/.test((document.querySelector('.sp-src') || {}).textContent || ''), null, { timeout: 15000 });
  ok(true, 'beklenmeyen LiveScore biçimi açıkça bildirildi');
  espn.st.lsMode = 'data';
  await g.click('#sp-ref');
  await g.waitForFunction(() => /Bandirmaspor/.test(document.querySelector('.sp-list').textContent), null, { timeout: 15000 });
  ok(!(await g.$('.sp-src')) && !/LiveScore alınamadı/.test(await g.textContent('#sp-upd')), 'LiveScore düzelince uyarı kalktı, maçlar tamamlandı');
  ok(G.errs.length === 0, 'sayfa hatası yok (LiveScore yok): ' + G.errs.join(' | '));
  await G.ctx.close();
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
  ok(/Ayrıntı: ESPN: [a-z0-9.]+: HTTP 500/.test(await c.textContent('.sp-list .empty')), 'hata ekranı nedeni gösteriyor (ör. “tur.1: HTTP 500”)');
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
  await d.$$eval('.sp-m', (rows) => rows.find((r) => /Beşiktaş/.test(r.textContent)).querySelector('[data-info]').click());
  await d.waitForSelector('.sd-pg .sd-e', { timeout: 8000 });
  await sleep(500);
  const bodyTop = () => d.evaluate(() => document.querySelector('.sd-pg .pg-body').scrollTop);
  ok((await d.evaluate(() => { const b = document.querySelector('.sd-pg .pg-body'); return b.scrollHeight - b.clientHeight; })) > 150, 'yatay ekranda ayrıntı sayfası ekrandan uzun');
  await d.focus('#sd-bcs');
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
