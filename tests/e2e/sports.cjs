// Spor (futbol) ekranı uçtan uca denemesi: sahte ESPN yanıtları (gerçek servise hiç gidilmez), gün/lig süzgeci, canlı skor,
// TV rehberinden kanal eşleştirme ve kanala geçiş, yayıncı adı yedeği, kısmi hata, hata ekranı. Tek başına: node tests/e2e/sports.cjs
// (run.cjs sonunda da çağrılır).
const path = require('node:path');

const CORS = { 'access-control-allow-origin': '*' };

function fakeEspn() {
  const st = { fail: false, failDelay: 0, failLeagues: new Set(['ger.1']), calls: [] };
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
  async function install(ctx) {
    await ctx.route('https://site.api.espn.com/**', async (route) => {
      const slug = /soccer\/([^/]+)\/scoreboard/.exec(route.request().url());
      const id = slug ? slug[1] : '';
      st.calls.push(id);
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

  // ---- hata ekranı ve yeniden deneme (kayıtlı veri yok)
  espn.st.fail = true;
  espn.st.failDelay = 600; // “yükleniyor” görüntüsü yoklanabilsin
  const C = await mk({ width: 390, height: 844 });
  const c = C.page;
  await c.click('.shortcuts .t-sport');
  ok(/yükleniyor/.test(await c.textContent('.sp-list')), 'indirme sürerken “yükleniyor” görünüyor (“Maç yok” değil)');
  await c.waitForSelector('.sp-list .empty h3', { timeout: 20000 });
  ok(/Maçlar alınamadı/.test(await c.textContent('.sp-list .empty h3')) && /İnternet bağlantınızı denetleyin/.test(await c.textContent('.sp-list .empty')), 'hiçbir lig alınamazsa açık hata ekranı');
  await c.screenshot({ path: path.join(SHOTS, '81-spor-hata.png') });
  espn.st.fail = false;
  espn.st.failDelay = 0;
  await c.click('#sp-retry');
  await c.waitForSelector('.sp-m', { timeout: 15000 });
  ok(true, '“Yeniden dene” ile maçlar geldi');
  await c.click('#sp-ref');
  await c.waitForFunction(() => /Son güncelleme/.test(document.querySelector('#sp-upd').textContent));
  ok(true, 'yenile düğmesi çalışıyor');
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
