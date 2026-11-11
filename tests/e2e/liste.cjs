// Liste konumu denemesi: açık kategori ve kaydırma yeri, katalog yenilenince ve kanal açıp kapatırken (oynatıcı telefonu yatay
// kilitler, yön iki kez değişir) kaybolmamalı. Tek başına: node tests/e2e/liste.cjs; run.cjs sonunda da çağrılır.
const path = require('node:path');

async function listeSection({ browser, base, mock, ok, sleep }) {
  console.log('liste konumu: yenileme ve yön değişimi');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('iptv.pref.seen.changelog', '999'));
  await page.goto(base);
  await page.waitForSelector('#f');
  await page.fill('input[name=server]', mock.url);
  await page.fill('input[name=user]', 'u');
  await page.fill('input[name=pass]', 'p');
  await page.click('#f-go');
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  await page.click('.tile.t-live');
  await page.waitForSelector('.row.cat');
  await sleep(300);
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.row:not(.cat)');
  await sleep(300);

  const st = () => page.evaluate(() => {
    const l = document.querySelector('#list');
    return { mode: window.__iptv.S.listMode, grp: window.__iptv.S.group.live, top: l ? Math.round(l.scrollTop) : -1, split: !!document.querySelector('#split') };
  });
  const scrollTo = async (y) => {
    await page.evaluate((v) => { const l = document.querySelector('#list'); l.scrollTop = v; l.dispatchEvent(new Event('scroll')); }, y);
    await sleep(300);
  };
  const near = (a, b) => Math.abs(a - b) <= 4;
  const idle = () => page.waitForFunction(() => !window.__iptv.S.loading, null, { timeout: 15000 });

  // ---- 1) katalog yenilenince (yenile düğmesi ya da bayat katalog) liste başa dönmez, kategori kapanmaz
  await scrollTo(1200);
  let s0 = await st();
  ok(s0.mode === 'items' && s0.grp === '__all' && near(s0.top, 1200), 'önce: Tümü kategorisi açık, liste kaydırılmış: ' + JSON.stringify(s0));
  await page.click('#btn-refresh');
  await sleep(300);
  await idle();
  await sleep(300);
  let s1 = await st();
  ok(s1.mode === 'items' && s1.grp === '__all', 'katalog yenilenince kategori kapanmadı: ' + JSON.stringify(s1));
  ok(near(s1.top, 1200), 'katalog yenilenince liste en üste dönmedi, yeri korundu: ' + s1.top);

  // ---- 2) kanal aç → oynatıcı yatay kilitler (görünüm yatay) → geri → dikey: kategori ve yer korunur
  await page.evaluate(() => {
    const l = document.querySelector('#list').getBoundingClientRect();
    const r = [...document.querySelectorAll('#list .row:not(.cat)')].find((x) => x.getBoundingClientRect().top > l.top + 20);
    r.click();
  });
  await page.waitForFunction(() => document.body.classList.contains('player-open'), null, { timeout: 8000 });
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(900);
  const s2 = await st();
  ok(s2.mode === 'items' && s2.grp === '__all' && near(s2.top, 1200), 'oynatıcı açıkken (yatay) liste arkada bozulmadı: ' + JSON.stringify(s2));
  await page.click('#pl-back');
  await page.waitForFunction(() => !document.body.classList.contains('player-open'), null, { timeout: 8000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(1800);
  const s3 = await st();
  ok(s3.mode === 'items' && s3.grp === '__all', 'kanaldan dönünce kategori kapanmadı: ' + JSON.stringify(s3));
  ok(near(s3.top, 1200), 'kanaldan dönünce liste en üste atmadı, yeri korundu: ' + s3.top);
  ok(!s3.split, 'dikeye dönünce tek bölmeli düzen');

  // ---- 3) telefonu gerçekten yatay çevirmek bölmeli düzeni kurar, açık kategori yine kapanmaz
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForSelector('#split');
  await sleep(500);
  const s4 = await st();
  ok(s4.split && s4.mode === 'items' && s4.grp === '__all', 'yatay çevirince bölmeli düzen kuruldu, kategori açık kaldı: ' + JSON.stringify(s4));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => !document.querySelector('#split'), null, { timeout: 8000 });
  await sleep(300);
  const s5 = await st();
  ok(!s5.split && s5.mode === 'items' && s5.grp === '__all', 'dikeye dönünce tek bölmeli düzen, kategori açık: ' + JSON.stringify(s5));

  // ---- 4) hızlı çevirip geri çevirmek (oynatıcı olmadan da) gereksiz yeniden kurmaz
  await scrollTo(900);
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(60);
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(800);
  const s6 = await st();
  ok(s6.grp === '__all' && near(s6.top, 900), 'hızlı çevir-geri çevir listeyi bozmadı: ' + JSON.stringify(s6));

  ok(errs.length === 0, 'sayfa hatası yok' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}

module.exports = { listeSection };

if (require.main === module) {
  (async () => {
    const { chromium } = require('playwright');
    const http = require('node:http');
    const fs = require('node:fs');
    const WWW = path.join(__dirname, '..', '..', 'www');
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
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    let fails = 0;
    const ok = (c, m) => {
      console.log((c ? '  ✓ ' : '  ✗ ') + m);
      if (!c) fails++;
    };
    try {
      await listeSection({ browser, base: `http://127.0.0.1:${www.address().port}/`, mock, ok, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
    } finally {
      await browser.close();
      www.close();
      await mock.close();
    }
    console.log(fails ? `\n${fails} denetim başarısız` : '\nliste konumu denetimleri geçti');
    process.exit(fails ? 1 : 0);
  })();
}
