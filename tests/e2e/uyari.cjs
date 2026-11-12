// Abonelik bitiş uyarısı (Xtream): ana ekranda kalan gün, son 7 günde uyarı (günde bir kez), son 14 günde bildirim planı; yenilenince plan kalkar.
// Tek başına: node tests/e2e/uyari.cjs; run.cjs sonunda da çağrılır.
const path = require('node:path');

async function uyariSection({ browser, base, mock, ok, sleep }) {
  console.log('abonelik bitiş uyarısı');
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
  const DAY = 86400000;
  const expPlans = () => page.evaluate(() => (window.__iptv.store.pref('plans', []) || []).filter((p) => String(p.id).startsWith('exp:')));
  const setExp = (ms) => page.evaluate((v) => { window.__iptv.S.cat.account.expires = v; }, ms);
  const footer = async () => {
    await page.click('#tabs [data-tab=live]');
    await page.waitForSelector('.row.cat');
    await page.click('#tabs [data-tab=home]');
    await page.waitForSelector('.home-foot');
    return page.evaluate(() => ({ text: document.querySelector('.home-foot span').textContent, warn: !!document.querySelector('.home-foot .exp-warn') }));
  };

  // 1) uzak bitiş (sahte sunucu 90 gün): gün yazar, uyarı yok, plan yok
  let f = await footer();
  ok(/Bitiş Tarihi: .* · 9\d gün kaldı/.test(f.text) && !f.warn, 'ana ekranda kalan gün yazıyor, uyarı rengi yok: ' + f.text);
  ok((await expPlans()).length === 0, 'bitişe uzakken bildirim planı yok');

  // 2) 5 gün kala: uyarı iletisi, kırmızı yazı, tek bildirim planı
  await setExp(Date.now() + 5 * DAY - 3600e3);
  await page.evaluate(() => window.__iptv.watchExpiry());
  await page.waitForFunction(() => /aboneliği 5 gün sonra bitiyor/.test(document.querySelector('#toast').textContent), null, { timeout: 3000 });
  ok(true, 'son günlerde açılışta uyarı iletisi çıktı');
  let plans = await expPlans();
  ok(plans.length === 1 && plans[0].kind === 'rem' && plans[0].title === 'Abonelik bitiyor' && /gün sonra bitiyor/.test(plans[0].note) && plans[0].at > Date.now(), 'bildirim planı kuruldu: ' + (plans[0] && plans[0].note));
  f = await footer();
  ok(f.warn && /5 gün kaldı/.test(f.text), 'ana ekranda uyarı rengiyle “5 gün kaldı”: ' + f.text);

  // 3) aynı gün tekrar: ileti yeniden çıkmaz, plan çoğalmaz
  await page.evaluate(() => { document.querySelector('#toast').classList.remove('on'); document.querySelector('#toast').textContent = ''; });
  await page.evaluate(() => window.__iptv.watchExpiry());
  await sleep(300);
  ok((await page.textContent('#toast')) === '' && (await expPlans()).length === 1, 'aynı gün ikinci kez uyarı ve ikinci plan yok');

  // 4) abonelik yenilendi (60 gün): eski plan kalkar, uyarı kalkar
  await setExp(Date.now() + 60 * DAY);
  await page.evaluate(() => window.__iptv.watchExpiry());
  ok((await expPlans()).length === 0, 'abonelik yenilenince bildirim planı kaldırıldı');
  f = await footer();
  ok(!f.warn && /60 gün kaldı/.test(f.text), 'yenilenince uyarı rengi yok: ' + f.text);

  // 5) süresi dolmuş: uyarı, plan yok
  await setExp(Date.now() - 2 * DAY);
  await page.evaluate(() => window.__iptv.watchExpiry());
  await page.waitForFunction(() => /sona ermiş/.test(document.querySelector('#toast').textContent), null, { timeout: 3000 });
  f = await footer();
  ok(f.warn && /süresi doldu/.test(f.text) && (await expPlans()).length === 0, 'süresi dolmuşsa “süresi doldu”, plan yok: ' + f.text);

  ok(errs.length === 0, 'sayfa hatası yok ' + errs.join(' | '));
  await ctx.close();
}

module.exports = { uyariSection };

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
      await uyariSection({ browser, base: `http://127.0.0.1:${www.address().port}/`, mock, ok, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
    } finally {
      await browser.close();
      www.close();
      await mock.close();
    }
    console.log(fails ? `\n${fails} denetim başarısız` : '\nuyarı denetimleri geçti');
    process.exit(fails ? 1 : 0);
  })();
}
