// Çok renkli temalar uçtan uca denemesi: seçici, uygulama, kalıcılık, simge renkleri. Tek başına: node tests/e2e/theme.cjs
// run.cjs sonunda da çağrılır.
const path = require('node:path');

const IDS = ['cards', 'solid', 'neon', 'sunset'];

async function themeSection({ browser, base, mock, ok, sleep, SHOTS }) {
  console.log('Çok renkli temalar');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.addInitScript(() => localStorage.setItem('iptv.pref.seen.changelog', '999'));
  await page.goto(base);
  await page.waitForSelector('#f');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', `${mock.url}/list.m3u`);
  await page.click('#f-go');
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });

  let swatches = 0;
  const colors = (sel) => page.$$eval(sel, (els) => els.map((e) => getComputedStyle(e).color));
  const distinct = (a) => new Set(a).size;
  const pick = async (id) => {
    await page.click('[data-tab=sources]');
    await page.waitForSelector('[data-set=general]');
    await page.click('[data-set=general]');
    await page.waitForSelector('#g-theme');
    swatches = (await page.$$('#g-theme .swatch')).length;
    await page.click(`#g-theme [data-theme=${id}]`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    if (await page.$('.sheet')) { await page.mouse.click(195, 30); await page.waitForTimeout(400); }
  };

  await pick('green');
  ok(swatches === 6 + IDS.length, `tema seçicide ${swatches} yuvarlak var (6 tek renkli + ${IDS.length} çok renkli)`);
  const greenTabs = distinct(await colors('#tabs button .ic'));
  ok(greenTabs <= 2, `tek renkli temada sekme simgeleri tek tonda (${greenTabs} farklı renk)`);
  ok(await page.evaluate(() => !('multi' in document.documentElement.dataset)), 'tek renkli temada data-multi yok');

  for (const id of IDS) {
    await pick(id);
    const st = await page.evaluate(() => ({ t: document.documentElement.dataset.theme, m: document.documentElement.dataset.multi }));
    ok(st.t === id && st.m === '1', `${id}: tema ve çok renkli işareti uygulandı`);
    await page.click('[data-tab=home]');
    await page.waitForSelector('.tile.t-live');
    await page.waitForTimeout(300);
    const tabs = distinct(await colors('#tabs button .ic'));
    ok(tabs >= 5, `${id}: alt sekme simgeleri ayrı renkte (${tabs} farklı renk)`);
    const main = distinct(await colors('.tiles .tile .ic'));
    const bgs = distinct(await page.$$eval('.tiles .tile', (els) => els.map((e) => getComputedStyle(e).backgroundImage)));
    ok(id === 'solid' ? bgs === 4 : main === 4, `${id}: dört ana kutu birbirinden ayrı renkte (simge ${main}, zemin ${bgs})`);
    const minis = distinct(await colors('.shortcuts .tile .ic'));
    ok(minis >= 4, `${id}: kısayol simgeleri ayrı renkte (${minis})`);
    const hdr = await page.$eval('#h-search', (e) => getComputedStyle(e).color) !== await page.$eval('#h-set', (e) => getComputedStyle(e).color);
    ok(hdr, `${id}: üst çubuk simgeleri ayrı renkte`);
    await page.screenshot({ path: path.join(SHOTS, `70-tema-${id}-ana.png`) });
    await page.click('[data-tab=sources]');
    await page.waitForSelector('.set-tile');
    const sets = distinct(await colors('.set-tile .ic'));
    ok(sets >= 6, `${id}: ayar kutusu simgeleri ayrı renkte (${sets})`);
    await page.screenshot({ path: path.join(SHOTS, `71-tema-${id}-ayarlar.png`) });
  }

  // kalıcılık: yenileyince son çok renkli tema korunur
  await page.reload();
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  const after = await page.evaluate(() => ({ t: document.documentElement.dataset.theme, m: document.documentElement.dataset.multi }));
  ok(after.t === 'sunset' && after.m === '1', 'yenileyince çok renkli tema korundu');

  // tek renkliye dönünce çok renkli işaret kalkar
  await pick('blue');
  ok(await page.evaluate(() => !('multi' in document.documentElement.dataset) && document.documentElement.dataset.theme === 'blue'), 'tek renkliye dönünce çok renkli işaret kalktı');
  ok(distinct(await colors('#tabs button .ic')) <= 2, 'tek renkliye dönünce sekme simgeleri yine tek tonda');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

module.exports = { themeSection };

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
      await themeSection({ browser, base: `http://127.0.0.1:${www.address().port}/`, mock, ok, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), SHOTS });
    } finally {
      await browser.close();
      www.close();
      await mock.close();
    }
    console.log(fails ? `\n${fails} denetim başarısız` : '\nTema denetimleri geçti');
    process.exit(fails ? 1 : 0);
  })();
}
