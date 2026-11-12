// TV'ye özgü ekranlar: Ayarlar alt sayfaları tam sayfa açılır (küçük pencere yerine); telefonda alt pencere kalır.
// Tek başına: node tests/e2e/tvekran.cjs; run.cjs içinde de çağrılır.
const path = require('node:path');

async function tvekranSection({ browser, base, mock, ok, sleep }) {
  console.log('tv ekranları: ayarlar tam sayfa');
  const tvUrl = new URL('?tv=1', base).href;
  const open = async (vp, tv) => {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: !tv });
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
    if (tv) {
      await page.goto(tvUrl);
      await page.waitForSelector('.tile.t-live', { timeout: 15000 });
    }
    await sleep(400);
    return { ctx, page, errs };
  };
  const box = (page, sel) => page.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: innerWidth, h: innerHeight }; }, sel);

  // TV 960×540: her ayar kutusu tam sayfa açılır, kapatınca ayarlara dönülür
  {
    const { ctx, page, errs } = await open({ width: 960, height: 540 }, true);
    await page.click('.tile.t-set');
    await page.waitForSelector('.set-tile', { timeout: 8000 });
    await sleep(300);
    const keys = await page.$$eval('.set-tile', (t) => t.map((x) => x.dataset.set));
    ok(keys.includes('general') && keys.length >= 9, 'ayarlar kutuları: ' + keys.join(','));

    // Genel ayarlar: tam sayfa, ekranı kaplar, alt pencere yok
    await page.click('.set-tile[data-set=general]');
    await page.waitForSelector('.pg.set-pg', { timeout: 5000 });
    await page.waitForSelector('#g-mv');
    const pg = await box(page, '.pg.set-pg');
    ok(pg.l === 0 && pg.t === 0 && pg.r === pg.w && pg.b === pg.h, `Genel ayarlar ekranı tamamen kaplıyor (${pg.r}×${pg.b} / ${pg.w}×${pg.h})`);
    ok(await page.evaluate(() => !document.querySelector('.sheet-back')), 'Genel ayarlar alt pencere değil, sayfa');
    ok((await page.textContent('.pg.set-pg .pg-bar h3')) === 'Genel ayarlar', 'sayfa başlığı Genel ayarlar');
    // sayfanın sonuna kaydırınca en alttaki satır tam görünür (alttan kesilmiyor)
    await page.evaluate(() => { const b = document.querySelector('.pg.set-pg .pg-body'); b.scrollTop = b.scrollHeight; });
    await sleep(200);
    const lastRow = await page.evaluate(() => { const b = document.querySelector('.pg.set-pg .pg-body'); const l = b.lastElementChild.getBoundingClientRect(); return { b: Math.round(l.bottom), h: innerHeight }; });
    ok(lastRow.b <= lastRow.h, `en alttaki ayar satırı tam görünür (alt ${lastRow.b} / ${lastRow.h})`);
    await page.evaluate(() => document.querySelector('#g-mv').scrollIntoView({ block: 'center' }));
    await sleep(200);
    const sel = await box(page, '#g-mv');
    ok(sel.t >= 0 && sel.b <= sel.h && sel.l >= 0 && sel.r <= sel.w, `"Film ve dizi ekranı" seçimi tam görünür (üst ${sel.t}, alt ${sel.b} / ${sel.h})`);
    const body = await page.evaluate(() => { const b = document.querySelector('.pg.set-pg .pg-body').getBoundingClientRect(); return Math.round(b.width); });
    ok(body <= 1000, `satırlar ekran boyunca uzamıyor (içerik ${body} px)`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.pg.set-pg', { state: 'detached', timeout: 5000 });
    await sleep(300);
    ok(await page.evaluate(() => !!document.querySelector('.set-tile')), 'Geri: ayarlar sayfasına dönüldü');

    // öteki ayar sayfaları da tam sayfa: oynatıcı, plan, kayıtlar, yenilikler
    for (const k of ['player', 'plans', 'rec', 'news', 'epg']) {
      if (!(await page.$(`.set-tile[data-set=${k}]`))) continue;
      await page.click(`.set-tile[data-set=${k}]`);
      await page.waitForSelector('.pg.set-pg, .sheet-back', { timeout: 5000 });
      const full = await page.evaluate(() => !!document.querySelector('.pg.set-pg') && !document.querySelector('.sheet-back'));
      ok(full, `"${k}" ayarı tam sayfa açıldı`);
      await page.keyboard.press('Escape');
      await sleep(300);
    }
    ok(errs.length === 0, 'TV ayarlar: sayfa hatası yok' + (errs.length ? ': ' + errs[0] : ''));
    await page.screenshot({ path: path.join(__dirname, 'shots', '15-tv-ayarlar.png') }).catch(() => {});
    await ctx.close();
  }

  // Telefon: eskisi gibi alt pencere
  {
    const { ctx, page, errs } = await open({ width: 390, height: 844 }, false);
    await page.click('#tabs [data-tab=sources]');
    await page.click('.set-tile[data-set=general]');
    await page.waitForSelector('.sheet-back .sheet', { timeout: 5000 });
    ok(await page.evaluate(() => !document.querySelector('.pg.set-pg')), 'telefonda Genel ayarlar alt pencere olarak kaldı');
    ok(errs.length === 0, 'telefon ayarlar: sayfa hatası yok');
    await ctx.close();
  }
}

module.exports = { tvekranSection };

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
    const browser = await chromium.launch();
    let fails = 0;
    const ok = (c, m) => {
      console.log((c ? '  ✓ ' : '  ✗ ') + m);
      if (!c) fails++;
    };
    try {
      await tvekranSection({ browser, base: `http://127.0.0.1:${www.address().port}/`, mock, ok, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
    } finally {
      await browser.close();
      www.close();
      await mock.close();
    }
    console.log(fails ? `\n${fails} denetim başarısız` : '\ntv ekran denetimleri geçti');
    process.exit(fails ? 1 : 0);
  })();
}
