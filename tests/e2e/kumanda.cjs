// Kumanda (yön tuşları) denemesi: Ayarlar'da hiçbir satır atlanmaz, film oynatıcıda ilerleme çubuğundan alttaki düğmelere inilir,
// çubukta ↑↓ filmi sarmaz, oynatıcının altındaki sayfa kumandayı çalmaz. Tek başına: node tests/e2e/kumanda.cjs; run.cjs sonunda da çağrılır.
const path = require('node:path');

async function kumandaSection({ browser, base, mock, ok, sleep }) {
  console.log('kumanda: ayarlarda gezinme ve film oynatıcı denetimleri');
  const tvUrl = new URL('?tv=1', base).href;
  const open = async (vp) => {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
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
    await page.goto(tvUrl); // TV kipi: salt okunur alanlar, odak halkası, kumanda gezinmesi
    await page.waitForSelector('.tile.t-live', { timeout: 15000 });
    await sleep(500);
    return { ctx, page, errs };
  };
  const press = async (page, k, n = 1) => {
    for (let i = 0; i < n; i++) {
      await page.keyboard.press(k);
      await sleep(50);
    }
  };
  const foc = (page) => page.evaluate(() => { const a = document.activeElement; return !a || a === document.body ? '-' : a.id || a.dataset.theme || a.dataset.go || a.className || a.tagName; });

  // ---- Ayarlar > Genel ayarlar: aşağı ok her satıra uğrar (ekran dışında kalan satırlar, sağa yaslı seçiciler atlanmaz)
  for (const vp of [{ width: 960, height: 540 }, { width: 1280, height: 720 }, { width: 770, height: 346 }]) {
    const { ctx, page, errs } = await open(vp);
    const tag = `${vp.width}×${vp.height}`;
    await page.click('#h-set');
    await sleep(400);
    ok((await foc(page)) === 'set-tile', `${tag}: Ayarlar açılınca odak Genel ayarlar kutusunda`);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.sheet #g-cap');
    await sleep(400);
    const want = ['g-cap', 'g-lite', 'g-tv', 'g-lock', 'g-bk', 'g-dev', 'g-rep', 'g-fs', 'g-lim', 'g-clr'];
    const seen = new Set();
    let swatches = 0;
    for (let i = 0; i < 40; i++) {
      await press(page, 'ArrowDown');
      const f = await foc(page);
      seen.add(f);
      if (await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('swatch'))) swatches++;
    }
    ok(want.every((id) => seen.has(id)), `${tag}: aşağı ok Genel ayarlar'daki tüm satırlara uğradı (eksik: ${want.filter((id) => !seen.has(id)).join(',') || 'yok'})`);
    ok(swatches >= 1, `${tag}: aşağı ok Tema rengi satırına uğradı`);
    // yukarı: sağa yaslı seçiciden bir üstteki temaya, oradan satırlara; başlıktaki kapat tuşuna sıçramaz
    await page.focus('#g-cap');
    await press(page, 'ArrowUp');
    ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('swatch')), `${tag}: "Kutudaki film/dizi adı" satırından yukarı ok Tema rengi satırına gitti (kapat tuşuna sıçramadı)`);
    const up = [];
    for (let i = 0; i < 40; i++) {
      await press(page, 'ArrowUp');
      up.push(await page.evaluate(() => { const a = document.activeElement; return a && a.hasAttribute('data-close') ? 'close' : a && a.classList.contains('chk') ? 'chk' : 'x'; }));
    }
    const firstClose = up.indexOf('close');
    ok(firstClose > 3 && up.slice(firstClose).every((x) => x === 'close'), `${tag}: yukarı ok önce tüm onay satırlarını gezdi, en üstte kapat tuşunda kaldı`);
    ok(errs.length === 0, `${tag}: sayfa hatası yok ${errs.join(' | ')}`);
    await ctx.close();
  }

  // ---- Film oynatıcı: ayrıntı sayfasının üstüne açılır; kumanda oynatıcıda gezer
  for (const hiddenPages of [false, true]) {
    const { ctx, page, errs } = await open({ width: 1280, height: 720 });
    const tag = hiddenPages ? 'yerel oynatma (alttaki sayfa gizli)' : 'web oynatma';
    await page.click('.tile.t-movie');
    await page.waitForSelector('.row.cat');
    await sleep(300);
    await page.click('.row.cat:has-text("Tümü")');
    await page.waitForSelector('.card');
    await page.click('.card');
    await page.waitForSelector('#mv-play');
    await sleep(500);
    await page.focus('#mv-play');
    if (hiddenPages) await page.addStyleTag({ content: 'html.tv #app, #sheets .pg:not(.over-player), #sheets .sheet-back:not(.over-player) { visibility: hidden !important }' });
    await page.keyboard.press('Enter');
    await page.waitForSelector('body.player-open');
    await sleep(1200);
    const inPlayer = () => page.evaluate(() => !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#pl-ui')));
    ok(await inPlayer(), `${tag}: oynatıcı açılınca odak alttaki sayfadan oynatıcı denetimlerine geçti (şu an: ${await foc(page)})`);
    await press(page, 'ArrowDown');
    await sleep(300);
    ok(await inPlayer(), `${tag}: ok tuşundan sonra da odak oynatıcıda (alttaki sayfa odağı geri çekmedi; şu an: ${await foc(page)})`);
    for (let i = 0; i < 4 && (await foc(page)) !== 'pl-seek'; i++) await press(page, 'ArrowDown');
    ok((await foc(page)) === 'pl-seek', `${tag}: aşağı oklarla ilerleme çubuğuna gelindi (şu an: ${await foc(page)})`);
    const before = await page.$eval('#pl-seek', (e) => e.value);
    await press(page, 'ArrowDown');
    const f2 = await foc(page);
    ok(['pl-stats', 'pl-sleep', 'pl-aspect', 'pl-audio', 'pl-text', 'pl-dl', 'pl-rec'].includes(f2), `${tag}: çubuğun altındaki düğmelere inildi (${f2})`);
    ok((await page.$eval('#pl-seek', (e) => e.value)) === before, `${tag}: aşağı ok çubuğun değerini değiştirmedi (film sarmadı)`);
    await press(page, 'ArrowUp');
    ok((await foc(page)) === 'pl-seek', `${tag}: yukarı ok: tekrar ilerleme çubuğu`);
    await press(page, 'ArrowUp');
    ok((await foc(page)) === 'pl-play', `${tag}: yukarı ok: oynat düğmesi`);
    ok(errs.length === 0, `${tag}: sayfa hatası yok ${errs.join(' | ')}`);
    await ctx.close();
  }

  // ---- ilerleme çubuğunda ↑↓ gidecek yer olmasa da değeri oynatmaz (tuş yutulur); ←→ sarmaya devam eder
  {
    const { ctx, page } = await open({ width: 1280, height: 720 });
    await page.click('.tile.t-movie');
    await page.waitForSelector('.row.cat');
    await sleep(300);
    await page.click('.row.cat:has-text("Tümü")');
    await page.waitForSelector('.card');
    await page.click('.card');
    await page.waitForSelector('#mv-play');
    await page.focus('#mv-play');
    await page.keyboard.press('Enter');
    await page.waitForSelector('body.player-open');
    await sleep(1200);
    await page.addStyleTag({ content: '#pl-ui .pl-tools, #pl-ui .pl-mid, #pl-ui .pl-top { display: none !important }' });
    await page.focus('#pl-seek');
    const prevented = await page.evaluate(() =>
      ['ArrowDown', 'ArrowUp'].map((key) => {
        const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        document.getElementById('pl-seek').dispatchEvent(e);
        return e.defaultPrevented;
      }),
    );
    ok(prevented[0] && prevented[1], 'çubukta ↑↓ gidecek düğme olmasa da tarayıcının değer değiştirmesi engellendi');
    await ctx.close();
  }
}

module.exports = { kumandaSection };

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
      await kumandaSection({ browser, base: `http://127.0.0.1:${www.address().port}/`, mock, ok, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
    } finally {
      await browser.close();
      www.close();
      await mock.close();
    }
    console.log(fails ? `\n${fails} denetim başarısız` : '\nkumanda denetimleri geçti');
    process.exit(fails ? 1 : 0);
  })();
}
