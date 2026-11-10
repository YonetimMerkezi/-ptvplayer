// 1.0.104 uçtan uca denemesi: 3 sütunlu film/dizi ayrıntısı (yatay) ve değişmeyen dikey düzen, bölüm küçük resimleri,
// hafif mod, devam çubuğu anahtarı, "Hızlı" arabellek. Tek başına: node tests/e2e/v104.cjs; run.cjs sonunda da çağrılır.
const path = require('node:path');

const SVG = (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" width="160" height="90"><rect width="160" height="90" fill="${c}"/></svg>`;
const TITLES = ['Liman', 'Sis', 'Son Vapur'];

async function v104Section({ browser, base, mock, ok, sleep, SHOTS }) {
  console.log('1.0.104: ayrıntı düzeni, hafif mod, devam çubuğu, hızlı arabellek');
  const CORS = { 'access-control-allow-origin': '*' };
  const mk = async (vp, init, plotRepeat = 8) => {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: false });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
    await ctx.route(`${mock.url}/img/**`, (r) => r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/svg+xml' }, body: SVG('#3a5a9a') }));
    await ctx.route(`${mock.url}/player_api.php*`, (r) => {
      const a = new URL(r.request().url()).searchParams.get('action');
      const json = (b) => r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(b) });
      if (a === 'get_series') return json([{ series_id: 77, name: 'Gece Yolcuları', cover: `${mock.url}/img/gece.svg`, category_id: '1', plot: 'Özet' }]);
      if (a === 'get_series_info') {
        return json({
          info: { plot: 'Boğaz kıyısında geçen uzun bir hikâye. '.repeat(plotRepeat), genre: 'Dram', releaseDate: '2024-03-01', rating_5based: '4.6', cast: 'A, B', director: 'C', cover: `${mock.url}/img/gece.svg` },
          episodes: { 1: TITLES.map((t, i) => ({ id: String(900 + i), title: t, episode_num: i + 1, container_extension: 'webm', info: { duration_secs: 3000, ...(i < 2 ? { movie_image: `${mock.url}/img/t${i}.svg` } : {}) } })) },
        });
      }
      return r.continue();
    });
    await page.addInitScript(() => localStorage.setItem('iptv.pref.seen.changelog', '999'));
    if (init) await page.addInitScript(init);
    await page.goto(base);
    await page.waitForSelector('#f');
    await page.fill('input[name=server]', mock.url);
    await page.fill('input[name=user]', 'u');
    await page.fill('input[name=pass]', 'p');
    await page.click('#f-go');
    await page.waitForSelector('.tile.t-series', { timeout: 15000 });
    return { ctx, page, errs };
  };
  const openSeries = async (page) => {
    await page.click('.tile.t-series');
    await page.waitForSelector('.row.cat');
    await sleep(150);
    await page.click('.row.cat:has-text("Tümü")');
    await page.waitForSelector('.card');
    await page.click('.card');
    await page.waitForSelector('.epi');
  };
  const cols = (page) => page.$eval('.dt', (e) => getComputedStyle(e).gridTemplateColumns.split(' ').length);
  const rect = (page, sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; });

  // ---- yatay / geniş: dizi = ayrıntılar | bölümler | afiş
  let { ctx, page, errs } = await mk({ width: 1280, height: 720 });
  await openSeries(page);
  await sleep(300);
  ok((await cols(page)) === 3, 'geniş ekranda dizi ayrıntısı üç sütun');
  const [info, eps, pos] = [await rect(page, '.dt-head'), await rect(page, '.dt-eps'), await rect(page, '.dt-pos')];
  ok(info.l < eps.l && eps.r <= pos.l + 1 && info.r <= eps.l + 1, `sol ayrıntılar, orta bölümler, sağ afiş (x: ${Math.round(info.l)} < ${Math.round(eps.l)} < ${Math.round(pos.l)})`);
  ok(pos.h >= 720 - 52 - 36 - 3 && pos.l > 800, `afiş görünen yüksekliği dolduruyor ve sağda (${Math.round(pos.w)}×${Math.round(pos.h)})`);
  ok((await page.$$('.epi .epi-th')).length === 2 && (await page.$$('.epi.has-th')).length === 2, 'küçük resmi olan 2 bölümde resim var, olmayanda yok');
  ok(await page.$eval('.epi-th', (e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 80), 'geniş ekranda bölüm küçük resmi görünür');
  ok(/1\. SEZON/.test(await page.textContent('.dt-eps-h')) && /3 BÖLÜM/.test(await page.textContent('.dt-eps-h')), 'bölüm sütunu başlığı: ' + (await page.textContent('.dt-eps-h')).trim());
  ok(await page.$eval('.dt-eps', (e) => getComputedStyle(e).overflowY === 'auto'), 'bölüm listesi kendi içinde kayar');
  await page.screenshot({ path: path.join(SHOTS, '80-dizi-3-sutun.png') });
  ok(errs.length === 0, 'konsol hatası yok (geniş)' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();

  // ---- kısa yatay telefon (770×346): uzun konu sol sütunda aşağı kayar, bölümler sıkışık, liste ve afiş yerinde durur
  ({ ctx, page, errs } = await mk({ width: 770, height: 346 }, null, 30));
  await openSeries(page);
  await sleep(300);
  const pg = () => page.$eval('.dt-sp .pg-body', (b) => ({ sh: b.scrollHeight, ch: b.clientHeight, top: b.getBoundingClientRect().top, bottom: b.getBoundingClientRect().bottom }));
  const g0 = await pg();
  ok(g0.sh > g0.ch + 100, `uzun konuda sayfa aşağı kayabiliyor (${g0.sh} > ${g0.ch})`);
  ok((await rect(page, '.epi')).h <= 60, `bölüm satırı sıkışık (${Math.round((await rect(page, '.epi')).h)} px)`);
  const e0 = await rect(page, '.dt-eps');
  await page.evaluate(() => { document.querySelector('.dt-sp .pg-body').scrollTop = 99999; });
  await sleep(250);
  const g1 = await pg();
  const e1 = await rect(page, '.dt-eps');
  const p1 = await rect(page, '.dt-pos');
  const pl1 = await rect(page, '.dt-plot');
  ok(Math.abs(e1.t - e0.t) < 2 && e1.t >= g1.top - 1, `kaydırınca bölüm listesi yerinde duruyor, kırpılmıyor (${Math.round(e0.t)} → ${Math.round(e1.t)})`);
  ok(p1.t >= g1.top - 1 && p1.b <= g1.bottom + 1, 'afiş kaydırınca da görünür kalıyor');
  ok(pl1.b <= g1.bottom + 1, `konunun son satırı görünüyor (${Math.round(pl1.b)} ≤ ${Math.round(g1.bottom)})`);
  const pz = await rect(page, '.dt-pos');
  const barH = await page.$eval('.dt-sp .pg-bar', (e) => e.getBoundingClientRect().height);
  const avail = 346 - barH - 36;
  ok(pz.h >= avail - 3 && pz.h <= avail + 3 && Math.abs(pz.w / pz.h - 2 / 3) < 0.02, `afiş görünen yüksekliğe tam sığıyor, 2:3 (${Math.round(pz.w)}×${Math.round(pz.h)}, boşluk ${avail})`);
  ok(pz.r <= 770 + 1 && (await rect(page, '.dt-eps')).w >= 200, 'afiş büyüyünce bölüm sütunu hâlâ okunur genişlikte');
  await page.screenshot({ path: path.join(SHOTS, '83-dizi-kisa-yatay.png') });
  await ctx.close();

  // ---- dikey telefon: eski düzen, küçük resim ve sütun başlığı gizli
  ({ ctx, page, errs } = await mk({ width: 390, height: 844 }));
  await openSeries(page);
  ok((await cols(page)) === 2, 'dikey telefonda iki sütunlu (afiş + başlık) eski düzen');
  const hd = await rect(page, '.dt-head');
  const ep = await rect(page, '.dt-eps');
  ok(ep.t > hd.b - 1 && ep.l < 40, 'dikeyde bölümler ayrıntıların altında, tam genişlikte');
  ok(await page.$eval('.dt-eps-h', (e) => getComputedStyle(e).display === 'none') && (await page.$eval('.epi-th', (e) => getComputedStyle(e).display === 'none')), 'dikeyde küçük resim ve sütun başlığı gizli (düzen değişmedi)');
  await page.screenshot({ path: path.join(SHOTS, '81-dizi-dikey.png') });
  ok(errs.length === 0, 'konsol hatası yok (dikey)' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();

  // ---- film ayrıntısı geniş ekranda: ayrıntılar solda, afiş sağda
  ({ ctx, page, errs } = await mk({ width: 1280, height: 720 }));
  await page.click('.tile.t-movie');
  await page.waitForSelector('.row.cat');
  await sleep(150);
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.card');
  await page.click('.card');
  await page.waitForSelector('#mv-play');
  await sleep(300);
  const mh = await rect(page, '.dt-head');
  const mp = await rect(page, '.dt-pos');
  ok((await cols(page)) === 2 && mh.l < mp.l && mp.l > 800, `film ayrıntısı: ayrıntılar solda, afiş sağda (x: ${Math.round(mh.l)} < ${Math.round(mp.l)})`);
  await page.screenshot({ path: path.join(SHOTS, '82-film-yatay.png') });
  await ctx.close();

  // ---- ayarlar: hafif mod, devam çubukları, hızlı arabellek
  ({ ctx, page, errs } = await mk({ width: 390, height: 844 }));
  await page.click('[data-tab=sources]');
  await page.waitForSelector('[data-set=general]');
  await page.click('[data-set=general]');
  await page.waitForSelector('#g-lite');
  ok(await page.evaluate(() => !('lite' in document.documentElement.dataset)), 'bellek bilinmiyorsa (otomatik) hafif mod kapalı');
  ok((await page.$eval('#g-lite', (s) => [...s.options].map((o) => o.value).join())) === 'auto,on,off', 'hafif mod seçenekleri: Otomatik / Açık / Kapalı');
  await page.selectOption('#g-lite', 'on');
  ok(await page.evaluate(() => document.documentElement.dataset.lite === '1'), 'Açık: html[data-lite] hemen uygulandı');
  const fx = await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'fx';
    d.style.cssText = 'animation: sp 1s linear infinite; box-shadow: 0 0 9px red; transition: all 2s; backdrop-filter: blur(4px)';
    const sp = document.createElement('div');
    sp.className = 'spinner';
    document.body.append(d, sp);
    const a = getComputedStyle(d);
    const b = getComputedStyle(sp);
    const out = { anim: a.animationName, shadow: a.boxShadow, trans: a.transitionDuration, spin: b.animationName };
    d.remove();
    sp.remove();
    return out;
  });
  ok(fx.anim === 'none' && fx.shadow === 'none' && /^0s/.test(fx.trans), `hafif modda animasyon, gölge ve geçiş kapalı (${fx.anim}/${fx.shadow}/${fx.trans})`);
  ok(fx.spin === 'sp', 'yükleme göstergesi hafif modda da döner');
  await page.reload();
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  ok(await page.evaluate(() => document.documentElement.dataset.lite === '1'), 'hafif mod açılışta kalıcı');
  await page.click('[data-tab=sources]');
  await page.click('[data-set=general]');
  await page.waitForSelector('#g-lite');
  ok((await page.$eval('#g-lite', (s) => s.value)) === 'on', 'ayar seçicisi kayıtlı değeri gösteriyor');
  await page.selectOption('#g-lite', 'off');
  ok(await page.evaluate(() => !('lite' in document.documentElement.dataset)), 'Kapalı: işaret kalktı');

  // devam çubukları anahtarı
  ok(await page.$eval('.chk[data-k=showProg]', (b) => b.classList.contains('on')), '“Devam çubuklarını göster” varsayılan açık');
  const barDisplay = () => page.evaluate(() => {
    const c = document.createElement('div');
    c.className = 'card';
    c.innerHTML = '<div class="prog"><i style="width:40%"></i></div>';
    const e = document.createElement('div');
    e.className = 'epi';
    e.innerHTML = '<span class="t"><div class="bar"><i style="width:40%"></i></div></span>';
    document.body.append(c, e);
    const out = [getComputedStyle(c.querySelector('.prog')).display, getComputedStyle(e.querySelector('.bar')).display];
    c.remove();
    e.remove();
    return out;
  });
  ok((await barDisplay()).every((d) => d !== 'none'), 'açıkken film kutusu ve bölüm çubukları görünür');
  await page.click('.chk[data-k=showProg]');
  ok(await page.evaluate(() => document.documentElement.hasAttribute('data-noprog')) && (await barDisplay()).every((d) => d === 'none'), 'kapatınca çubuklar hemen gizlendi');
  await page.reload();
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  ok(await page.evaluate(() => document.documentElement.hasAttribute('data-noprog')), 'devam çubuğu tercihi açılışta kalıcı');
  await page.click('[data-tab=sources]');
  await page.click('[data-set=general]');
  await page.waitForSelector('.chk[data-k=showProg]');
  await page.click('.chk[data-k=showProg]');
  ok(await page.evaluate(() => !document.documentElement.hasAttribute('data-noprog')), 'yeniden açınca çubuklar geri geldi');
  await page.keyboard.press('Escape');

  // bölüm küçük resimleri anahtarı
  await page.click('[data-tab=sources]').catch(() => {});
  await page.click('[data-set=general]');
  await page.waitForSelector('.chk[data-k=epThumbs]');
  ok(await page.$eval('.chk[data-k=epThumbs]', (b) => b.classList.contains('on')), '“Bölüm küçük resimlerini göster” varsayılan açık');
  const thDisplay = () => page.evaluate(() => {
    const e = document.createElement('div');
    e.className = 'dt-sp';
    e.innerHTML = '<span class="epi-th"></span>';
    document.body.append(e);
    const d = getComputedStyle(e.firstChild).display;
    e.remove();
    return d;
  });
  await page.click('.chk[data-k=epThumbs]');
  ok(await page.evaluate(() => document.documentElement.hasAttribute('data-nothumb')) && (await thDisplay()) === 'none', 'kapatınca küçük resimler hemen gizlendi');
  await page.reload();
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  ok(await page.evaluate(() => document.documentElement.hasAttribute('data-nothumb')), 'bölüm resmi tercihi açılışta kalıcı');
  await page.click('[data-tab=sources]');
  await page.click('[data-set=general]');
  await page.waitForSelector('.chk[data-k=epThumbs]');
  await page.click('.chk[data-k=epThumbs]');
  ok(await page.evaluate(() => !document.documentElement.hasAttribute('data-nothumb')), 'yeniden açınca küçük resimler geri geldi');
  await page.keyboard.press('Escape');

  // hızlı arabellek (oynatıcı ayarları)
  await page.goBack().catch(() => {});
  await page.click('[data-tab=sources]').catch(() => {});
  await page.waitForSelector('[data-set=player]');
  await page.click('[data-set=player]');
  await page.waitForSelector('#g-buf');
  ok((await page.$eval('#g-buf', (s) => [...s.options].map((o) => o.value).join())) === 'fast,normal,high,max', 'arabellek seçenekleri: Hızlı / Normal / Yüksek / Çok yüksek');
  ok(await page.$eval('#g-buf', (s) => s.value) === 'high', 'varsayılan arabellek Yüksek kaldı');
  await page.selectOption('#g-buf', 'fast');
  ok((await page.evaluate(() => window.__iptv.store.pref('set.buffer', 'high'))) === 'fast', '“Hızlı” arabellek kaydedildi');
  ok(await page.$eval('.chk[data-k=movieNext]', (b) => b.classList.contains('on')), '“Film bitince öneri göster” varsayılan açık');
  ok(errs.length === 0, 'konsol hatası yok (ayarlar)' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();

  // ---- az bellekli cihaz: otomatik hafif mod kendiliğinden açılır
  ({ ctx, page, errs } = await mk({ width: 390, height: 844 }, () => Object.defineProperty(navigator, 'deviceMemory', { value: 1, configurable: true })));
  ok(await page.evaluate(() => document.documentElement.dataset.lite === '1'), '1 GB bellekli cihazda otomatik hafif mod açıldı');
  await ctx.close();
}

module.exports = { v104Section };

if (require.main === module) {
  (async () => {
    const { chromium } = require('playwright');
    const http = require('node:http');
    const fs = require('node:fs');
    const WWW = path.join(__dirname, '..', '..', 'www');
    const SHOTS = process.env.SHOTS || path.join(__dirname, 'shots');
    fs.mkdirSync(SHOTS, { recursive: true });
    const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    const www = await new Promise((r) => {
      const s = http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p === '/') p = '/index.html';
        const f = path.join(WWW, p);
        if (!f.startsWith(WWW) || !fs.existsSync(f)) return res.writeHead(404).end();
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }).end(fs.readFileSync(f));
      });
      s.listen(0, '127.0.0.1', () => r(s));
    });
    const { startMock } = await import('../../mock/server.mjs');
    const mock = await startMock(0);
    const browser = await chromium.launch();
    let fails = 0;
    const ok = (c, m) => {
      console.log((c ? '  ✓ ' : '  ✗ ') + m);
      if (!c) fails++;
    };
    try {
      await v104Section({ browser, base: `http://127.0.0.1:${www.address().port}/`, mock, ok, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), SHOTS });
    } finally {
      await browser.close();
      www.close();
      await mock.close();
    }
    console.log(fails ? `\n${fails} denetim başarısız` : '\n1.0.104 denetimleri geçti');
    process.exit(fails ? 1 : 0);
  })();
}
