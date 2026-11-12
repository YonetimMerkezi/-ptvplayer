// Dizi akışı: 1001dizi haftalık takvimi, ücretsiz EPG yedeği, gün/kanal filtreleri, oynatıcı, hatırlatıcı, önbellek ve hata yolları.
const path = require('node:path');
const CORS = { 'access-control-allow-origin': '*' };
const B = 'https://1001dizi.net';
const card = (slug, title, ch, time, ep, status) =>
  `<div class="c"><a href="${B}/dizi-${slug}"><img src="${B}/i/${slug}.jpg" alt="${title}, ${ch}"></a><a href="${B}/dizi-${slug}"><strong>${title}</strong></a><p>${time ? `${ch} - ${time}` : ch}</p><p>${ep}</p>${status ? `<span><b>${status}</b></span>` : ''}</div>`;
const MENU = '<ul><li><a href="/bugunun-dizileri">BUGÜNÜN DİZİLERİ</a></li><li><a href="/dizi-populer">Popüler</a></li></ul>';
// Her gün: Gündem'de bir dizi (20:00), Show TV'de bir dizi (21:00). Bugünün sayfasında ayrıca gece/sabah dizisi ve yayınlanmayan dizi.
const COMMON = [
  ['gundem-dizisi', 'Gündem Dizisi', 'Gündem', '20:00', '12. Bölüm', 'Yeni Bölüm'],
  ['show-dizisi', 'Show Dizisi', 'Show TV', '21:00', '5. Bölüm', 'Yeni Bölüm'],
];
const TODAY_EXTRA = [
  ['gece-dizisi', 'Gece Dizisi', 'Gündem', '23:59', '3. Bölüm', 'Yeni Bölüm'],
  ['sabah-dizisi', 'Sabah Dizisi', 'Gündem', '00:01', '8. Bölüm', 'Yeni Bölüm'],
  ['ara-dizi', 'Ara Dizi', 'Show TV', '22:00', '9. Bölüm', 'BU HAFTA YAYINLANMIYOR'],
];
function fakeSites() {
  const st = { mode: 'ok', epg: 'empty', calls: [] };
  const todayIdx = () => (new Date().getDay() + 6) % 7;
  const dayPage = (idx) => `<html><body>${MENU}${[...COMMON, ...(idx === todayIdx() ? TODAY_EXTRA : [])].map((c) => card(c[0], c[1], c[2], '', c[4], c[5])).join('')}<footer><a href="/iletisim">İletişim</a></footer></body></html>`;
  const weekPage = () => `<html><body>${MENU}${[...COMMON, ...TODAY_EXTRA].map((c) => card(...c)).join('')}</body></html>`;
  const slugs = ['pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi', 'pazar'];
  function freeEpg() {
    const now = Date.now();
    const ch = Object.fromEntries(['trt1', 'kanald', 'atv', 'show', 'star', 'tv8', 'now', 'kanal7'].map((id) => [id, { n: id.toUpperCase(), p: [] }]));
    if (st.epg === 'dizi') {
      const start = new Date(now + 3 * 3600e3);
      start.setUTCHours(7, 0, 0, 0); // 10:00 Europe/Istanbul
      const s = start.getTime();
      ch.trt1.p.push([s, s + 90 * 60000, 'EPG Dizisi', '', 'Dizi', '5. Bölüm', 'Yeni Bölüm']);
    }
    return { v: 1, at: now, from: now - 864e5, to: now + 2 * 864e5, tz: 'Europe/Istanbul', sources: [], ch };
  }
  async function install(ctx) {
    const epgRoute = (route) => route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(freeEpg()) });
    await ctx.route('https://raw.githubusercontent.com/YonetimMerkezi/-ptvplayer/epg-data/epg.json*', epgRoute);
    await ctx.route('https://cdn.jsdelivr.net/gh/YonetimMerkezi/-ptvplayer@epg-data/epg.json*', epgRoute);
    await ctx.route('https://1001dizi.net/**', (route) => {
      const url = route.request().url();
      st.calls.push(url);
      if (st.mode === 'fail') return route.fulfill({ status: 503, headers: CORS, body: 'hata' });
      if (st.mode === 'empty') return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/html; charset=utf-8' }, body: '<html><body>Site değişti</body></html>' });
      const m = /\/(\w+)-gunu-dizileri/.exec(url);
      const body = m && slugs.includes(m[1]) ? dayPage(slugs.indexOf(m[1])) : /haftalik-dizi-programi/.test(url) ? weekPage() : null;
      if (body == null) return route.fulfill({ status: 404, headers: CORS, body: 'yok' });
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/html; charset=utf-8' }, body });
    });
    await ctx.route('https://1001dizi.net/i/**', (route) => route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png' }, body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
  }
  return { st, install };
}
async function diziSection({ browser, base, mock, ok, sleep }) {
  console.log('dizi akışı: 1001dizi / ücretsiz EPG');
  const sites = fakeSites();
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
    await sites.install(ctx);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
    await page.addInitScript(() => localStorage.setItem('iptv.pref.seen.changelog', '999'));
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
  const rowsOf = (page) => page.$$eval('#sf-list .sf-r', (e) => e.map((r) => ({ cls: r.className, time: r.querySelector('time').textContent, title: r.querySelector('.td-m b').textContent, sub: r.querySelector('.td-m span').textContent, bell: !!r.querySelector('.sp-bell'), on: !!r.querySelector('.sp-bell.on') })));
  const openFlow = async (page) => {
    await page.click('.tile.t-today');
    await page.waitForSelector('.td-pg #td-kinds .chip');
    await page.click('#td-opts [data-flow]');
    await page.waitForSelector('.sf-pg #sf-days .chip');
  };
  const closeFlow = async (page) => {
    await page.goBack();
    await page.waitForSelector('.sf-pg', { state: 'detached' });
  };
  const plansOf = (page) => page.evaluate(() => window.__iptv.store.pref('plans', []).filter((x) => String(x.id).startsWith('drem:')));
  // ---------------------------------------------------------------- 1) normal akış
  const { ctx, page, errs } = await mk();
  await page.click('.tile.t-today');
  await page.waitForSelector('.td-pg #td-kinds .chip');
  ok(await page.$eval('#td-opts [data-flow]', (b) => /Dizi akışı/.test(b.textContent)), 'Bugün TV’de çubuğunda “Dizi akışı” düğmesi var');
  await page.click('#td-opts [data-flow]');
  await page.waitForSelector('.sf-pg #sf-list .sf-r', { timeout: 15000 });
  const chips = await page.$$eval('#sf-days .chip', (e) => e.map((c) => c.firstChild.textContent.trim()));
  ok(chips.length === 8 && chips[0] === 'Bugün' && chips[1] === 'Yarın' && /Yenile/.test(await page.textContent('#sf-days [data-refresh]')), 'gün çipleri: Bugün, Yarın, 5 gün adı, Yenile: ' + chips.join('|'));
  ok(/^Dizi akışı · \d{1,2} \p{L}+ \p{L}+$/u.test(await page.textContent('.sf-pg .pg-bar h3')), 'başlıkta bugünün tarihi: ' + (await page.textContent('.sf-pg .pg-bar h3')));
  ok(sites.st.calls.length === 8, '1 haftalık + 7 gün sayfası istendi (' + sites.st.calls.length + ')');
  ok(/1001dizi · Son güncelleme \d\d:\d\d/.test(await page.textContent('#sf-note')), 'kaynak ve güncelleme saati yazıyor: ' + (await page.textContent('#sf-note')));
  const chipsTitle0 = await page.textContent('.sf-pg .pg-bar h3');
  let rows = await rowsOf(page);
  ok(rows.length === 5 && rows.map((r) => r.title).join('|') === 'Sabah Dizisi|Gündem Dizisi|Show Dizisi|Ara Dizi|Gece Dizisi', 'bugün 5 dizi, saat sırasıyla: ' + rows.map((r) => r.title).join('|'));
  ok(rows.map((r) => r.time).join('|') === '00:01|20:00|21:00|22:00|23:59', 'gün sayfaları saatsiz; saatler haftalık sayfadan tamamlandı: ' + rows.map((r) => r.time).join('|'));
  const g = rows.find((r) => r.title === 'Gündem Dizisi');
  ok(g.sub === 'Gündem · 12. Bölüm · Yeni Bölüm', 'satırda kanal, bölüm ve durum: ' + g.sub);
  const ara = rows.find((r) => r.title === 'Ara Dizi');
  ok(/off/.test(ara.cls) && !ara.bell && /Bu hafta yayınlanmıyor/.test(ara.sub), 'yayınlanmayan dizi soluk, zilsiz, durumu küçük harfle yazılı');
  ok(!rows.some((r) => /Popüler|İletişim|BUGÜNÜN/.test(r.title)), 'menü ve altbilgi bağlantıları liste dışı');
  const chipN = await page.$eval('#sf-days [data-pos="0"] small', (e) => e.textContent);
  ok(chipN === '5', 'gün çipinde dizi sayısı: ' + chipN);
  // 2) kanal süzgeci
  const chans = await page.$$eval('#sf-chs .chip', (e) => e.map((c) => c.textContent));
  ok(chans.join('|') === 'Tümü|Gündem|Show TV', 'kanal çipleri sayıya göre: ' + chans.join('|'));
  await page.click('#sf-chs [data-chan="Show TV"]');
  rows = await rowsOf(page);
  ok(rows.length === 2 && rows.every((r) => /Show TV/.test(r.sub)), 'kanal süzgeci yalnız Show TV dizilerini gösterdi');
  // kanal listede yok: ileti
  await page.click('#sf-list .sf-r:has-text("Show Dizisi") .td-m');
  await page.waitForFunction(() => /Show TV listenizde bulunamadı/.test(document.querySelector('#toast').textContent), null, { timeout: 3000 });
  ok(true, 'listede olmayan kanal için ileti: Show TV listenizde bulunamadı');
  await page.click('#sf-chs [data-chan=""]');
  ok((await rowsOf(page)).length === 5, '“Tümü” süzgeci kaldırdı');
  // 3) kanal listede var: oynatıcı açılır
  await page.click('#sf-list .sf-r:has-text("Gündem Dizisi") .td-m');
  await page.waitForFunction(() => document.body.classList.contains('player-open') || document.documentElement.classList.contains('native-playing'), null, { timeout: 8000 });
  ok(await page.evaluate(() => /Gündem/.test(document.querySelector('#pl-title, .pl-title, #player')?.textContent || 'Gündem')), 'satıra dokununca kanal oynatıcıda açıldı');
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden', timeout: 5000 });
  ok(await page.isVisible('.sf-pg'), 'oynatıcıdan dönünce Dizi akışı sayfası açık');
  // 4) hatırlatıcı: yarının dizisi (saat her zaman ileride)
  await page.click('#sf-days [data-pos="1"]');
  await page.waitForSelector('#sf-list .sf-r .sp-bell');
  rows = await rowsOf(page);
  ok(rows.length === 2 && rows.every((r) => r.bell), 'yarın: iki dizi, ikisinde de zil var');
  ok(/^Dizi akışı · /.test(await page.textContent('.sf-pg .pg-bar h3')) && (await page.textContent('.sf-pg .pg-bar h3')) !== chipsTitle0, 'yarının başlığı yazıldı: ' + (await page.textContent('.sf-pg .pg-bar h3')));
  await page.click('#sf-list .sf-r:has-text("Gündem Dizisi") .sp-bell');
  await page.waitForFunction(() => window.__iptv.store.pref('plans', []).some((x) => String(x.id).startsWith('drem:')), null, { timeout: 3000 });
  let pl = await plansOf(page);
  ok(pl.length === 1 && pl[0].kind === 'rem' && pl[0].lead === 15 && pl[0].chName === 'Gündem' && pl[0].chId && /Gündem Dizisi · 12\. Bölüm/.test(pl[0].title), 'hatırlatıcı kuruldu: ' + JSON.stringify({ t: pl[0].title, c: pl[0].chName, id: !!pl[0].chId }));
  const at = new Date(pl[0].s);
  ok(at.getHours() === 20 && at.getMinutes() === 0 && pl[0].at === pl[0].s - 15 * 60000, 'saat 20:00, 15 dk önce uyarı');
  ok((await rowsOf(page)).find((r) => r.title === 'Gündem Dizisi').on, 'zil “açık” görünüyor');
  ok(/Hatırlatıcı kuruldu · 15 dk önce/.test(await page.textContent('#toast')), 'ileti: ' + (await page.textContent('#toast')));
  await page.click('#sf-list .sf-r:has-text("Gündem Dizisi") .sp-bell');
  await page.waitForFunction(() => !window.__iptv.store.pref('plans', []).some((x) => String(x.id).startsWith('drem:')), null, { timeout: 3000 });
  ok(!(await rowsOf(page)).find((r) => r.title === 'Gündem Dizisi').on, 'zile yeniden dokununca hatırlatıcı kalktı');
  await page.click('#sf-list .sf-r:has-text("Gündem Dizisi") .sp-bell');
  await page.waitForFunction(() => window.__iptv.store.pref('plans', []).some((x) => String(x.id).startsWith('drem:')), null, { timeout: 3000 });
  ok(true, 'hatırlatıcı yeniden kuruldu (Planlananlar için)');
  // 5) bugünün geçmiş/şimdi durumu
  await page.click('#sf-days [data-pos="0"]');
  rows = await rowsOf(page);
  ok(/past|now/.test(rows.find((r) => r.title === 'Sabah Dizisi').cls) || new Date().getHours() < 0, 'bugün 00:01 dizisi geçmiş ya da şimdi işaretli');
  ok(!rows.find((r) => r.title === 'Gece Dizisi').cls.match(/past|now/), 'bugün 23:59 dizisi henüz başlamadı');
  await page.screenshot({ path: path.join(process.env.SHOTS || '/tmp', '82-dizi-akisi.png') });
  // 6) önbellek: kapatıp açınca ağa gitmeden hemen gelir
  const n0 = sites.st.calls.length;
  await closeFlow(page);
  await page.click('#td-opts [data-flow]');
  await page.waitForSelector('.sf-pg #sf-list .sf-r', { timeout: 4000 });
  await sleep(600);
  ok(sites.st.calls.length === n0, 'taze önbellek varken sayfalar yeniden istenmedi');
  ok((await rowsOf(page)).length === 5, 'önbellekten liste hemen geldi');
  // 7) güncelleme başarısız: kayıtlı veri kalır
  sites.st.mode = 'fail';
  await page.click('#sf-days [data-refresh]');
  await page.waitForFunction(() => /Güncellenemedi · kayıtlı veri/.test(document.querySelector('#sf-note').textContent), null, { timeout: 8000 });
  ok((await rowsOf(page)).length === 5, 'güncelleme başarısızken kayıtlı liste duruyor');
  ok(/Dizi akışı güncellenemedi/.test(await page.textContent('#toast')), 'ileti: güncellenemedi');
  sites.st.mode = 'ok';
  await page.click('#sf-days [data-refresh]');
  await page.waitForFunction(() => /^1001dizi · Son güncelleme/.test(document.querySelector('#sf-note').textContent), null, { timeout: 8000 });
  ok(true, 'site geri gelince yenileme başarılı');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
  // ---------------------------------------------------------------- 2) 1001dizi bozuk → ücretsiz EPG yedeği (bugün + yarın)
  sites.st.mode = 'empty';
  sites.st.epg = 'dizi';
  sites.st.calls.length = 0;
  const B2 = await mk();
  await openFlow(B2.page);
  await B2.page.waitForSelector('#sf-list .sf-r', { timeout: 15000 });
  rows = await rowsOf(B2.page);
  ok(rows.length === 1 && rows[0].title === 'EPG Dizisi' && rows[0].time === '10:00' && /TRT1 · 5\. Bölüm/.test(rows[0].sub), 'site yapısı değişince ücretsiz EPG yedeği kullanıldı: ' + rows.map((r) => r.title).join());
  ok(/Bugün \+ yarın \(ücretsiz EPG\)/.test(await B2.page.textContent('#sf-note')), 'kaynak notu: ' + (await B2.page.textContent('#sf-note')));
  ok(await B2.page.$eval('#sf-diag', (d) => d.hidden), 'ayrıntı başta kapalı');
  await B2.page.click('#sf-note [data-diag]');
  const dg = await B2.page.textContent('#sf-diag');
  ok(/1001dizi: satır yok/.test(dg) && /ücretsiz EPG: bugün ve yarın/.test(dg), 'Ayrıntı: yedeğe geçme nedeni ve EPG kapsamı yazılı: ' + dg.replace(/\s+/g, ' ').slice(0, 160));
  await B2.page.click('#sf-note [data-diag]');
  ok(await B2.page.$eval('#sf-diag', (d) => d.hidden), 'Ayrıntıyı gizle düğmesi kapatır');
  await B2.page.click('#sf-days [data-pos="2"]');
  ok(/yalnızca bugün ve yarın/.test(await B2.page.textContent('#sf-list')), 'başka gün seçilince açıklayıcı boş durum');
  await B2.ctx.close();
  // ---------------------------------------------------------------- 3) hiçbir kaynakta dizi kaydı yok → teşhisli hata ve yeniden dene
  sites.st.mode = 'fail';
  sites.st.epg = 'empty';
  const C = await mk();
  await openFlow(C.page);
  await C.page.waitForSelector('#sf-retry', { timeout: 20000 });
  const det = await C.page.textContent('#sf-list');
  ok(/Dizi akışı alınamadı/.test(det) && /haftalık/.test(det) && /ücretsiz EPG/.test(det), 'ücretsiz kaynaklar dizi vermezken nedenler yazılı: ' + det.replace(/\s+/g, ' ').slice(0, 160));
  sites.st.mode = 'ok';
  sites.st.epg = 'empty';
  await C.page.click('#sf-retry');
  await C.page.waitForSelector('#sf-list .sf-r', { timeout: 15000 });
  ok((await rowsOf(C.page)).length === 5, '“Yeniden dene” ile liste geldi');
  ok(C.errs.length === 0, 'konsol hatası yok (hata yolu)' + (C.errs.length ? ': ' + C.errs.slice(0, 3).join(' | ') : ''));
  await C.ctx.close();
}
module.exports = { diziSection, fakeSites };
if (require.main === module) {
  (async () => {
    const http = require('node:http');
    const fs = require('node:fs');
    const { chromium } = require('playwright');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const root = path.resolve(__dirname, '../../www');
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
    const www = await new Promise((r) => {
      const s = http.createServer((req, res) => {
        const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
        if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
        fs.createReadStream(p).pipe(res);
      });
      s.listen(0, '127.0.0.1', () => r(s));
    });
    const { startMock } = await import('../../mock/server.mjs');
    const mock = await startMock(0);
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    let fails = 0;
    const ok = (c, m) => {
      console.log((c ? '  ✓ ' : '  ✗ ') + m);
      if (!c) fails++;
    };
    try {
      await diziSection({ browser, base: `http://127.0.0.1:${www.address().port}/`, mock, ok, sleep });
    } finally {
      await browser.close();
      www.close();
      await mock.close();
    }
    console.log(fails ? `\n${fails} denetim başarısız` : '\ndizi denetimleri geçti');
    process.exit(fails ? 1 : 0);
  })();
}