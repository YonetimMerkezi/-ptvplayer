// Film ve dizi kategorileri “Netflix düzeni”nde: yeni eklenenler ve en çok puan alanlar satırları, sonra yeni/platform/tür sırası, yetişkin en sonda;
// Genel ayarlar > “Film ve dizi kategori sırası” ile sağlayıcının sırasına dönülür. Tek başına: node tests/e2e/kategori.cjs; run.cjs sonunda da çağrılır.
const path = require('node:path');

async function kategoriSection({ browser, base, mock, ok, sleep }) {
  console.log('kategori sırası: Netflix düzeni');
  const tvUrl = new URL('?tv=1', base).href;
  const CORS = { 'access-control-allow-origin': '*' };
  const CATS = ['XXX 18+', 'Korku', 'Komedi', 'Aksiyon', 'NETFLIX Filmleri', 'EN ⇒ ACTION', 'Yeni Filmler 2026', 'Belgesel'];
  // 40 film: her kategoride en az bir film; 20'sinin eklenme zamanı var, 12'si 4+ puanlı
  const movies = Array.from({ length: 40 }, (_, i) => ({
    name: `Film ${i + 1}`,
    stream_id: 7000 + i,
    stream_icon: '',
    category_id: String((i % CATS.length) + 1),
    container_extension: 'webm',
    rating_5based: i < 12 ? 4.2 + (i % 5) / 10 : 3,
    added: i % 2 ? String(1700000000 + i * 1000) : '0',
  }));
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const api = (action, body) =>
    ctx.route((u) => u.pathname.endsWith('/player_api.php') && u.searchParams.get('action') === action, (r) => r.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) }));
  await api('get_vod_categories', CATS.map((n, i) => ({ category_id: String(i + 1), category_name: n })));
  await api('get_vod_streams', movies);
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
  await page.evaluate(() => localStorage.setItem('iptv.pref.set.mvView', JSON.stringify('rows')));
  await page.goto(tvUrl);
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  await sleep(500);
  const rows = () => page.evaluate(() => window.__iptv.S.list.items.map((r) => `${r.name}${r.special ? '*' : ''}:${r.count}`));
  const enter = async () => {
    await page.click('.tile.t-movie');
    await page.waitForSelector('.sh-row', { timeout: 8000 });
    await sleep(500);
  };

  // 1) varsayılan: Netflix düzeni
  await enter();
  let r = await rows();
  ok(r.join('|') === 'Yeni eklenenler*:20|En çok puan alanlar*:12|Yeni Filmler 2026:5|NETFLIX Filmleri:5|Aksiyon:5|Komedi:5|Korku:5|Belgesel:5|EN ⇒ ACTION:5|XXX 18+:5|Düzenle:undefined', 'satır sırası Netflix düzeninde: ' + r.join(' | '));
  // özel satırların içeriği: en yeni önce, en yüksek puan önce
  const first = await page.evaluate(() => window.__iptv.S.list.items.slice(0, 2).map((x) => x.id));
  ok(first.join() === '__new,__top', 'özel satır kimlikleri: ' + first.join());
  await page.screenshot({ path: path.join(process.env.SHOTS || '/tmp', '83-kategori-sirasi.png') });

  // 2) ayar seçenekleri; sağlayıcının sırasına dön
  await page.keyboard.press('Escape');
  await page.waitForSelector('.tile.t-set', { timeout: 5000 });
  await page.click('.tile.t-set');
  await page.waitForSelector('.set-tile[data-set=general]');
  await page.click('.set-tile[data-set=general]');
  await page.waitForSelector('#g-cord');
  ok((await page.$$eval('#g-cord option', (o) => o.map((x) => x.value).join())) === 'smart,provider' && (await page.$eval('#g-cord', (s) => s.value)) === 'smart', 'ayar “Film ve dizi kategori sırası”: akıllı (varsayılan) / sağlayıcı');
  await page.selectOption('#g-cord', 'provider');
  ok((await page.evaluate(() => window.__iptv.store.pref('set.catOrder', 'smart'))) === 'provider', 'seçim kaydedildi');
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.waitForSelector('.tile.t-movie', { timeout: 5000 });
  await enter();
  r = await rows();
  ok(r.join('|') === 'XXX 18+:5|Korku:5|Komedi:5|Aksiyon:5|NETFLIX Filmleri:5|EN ⇒ ACTION:5|Yeni Filmler 2026:5|Belgesel:5|Düzenle:undefined', 'sağlayıcının sırasında, özel satırsız: ' + r.join(' | '));
  ok(errs.length === 0, 'sayfa hatası yok' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}

module.exports = { kategoriSection };

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
      await kategoriSection({ browser, base: `http://127.0.0.1:${www.address().port}/`, mock, ok, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
    } finally {
      await browser.close();
      www.close();
      await mock.close();
    }
    console.log(fails ? `\n${fails} denetim başarısız` : '\nkategori denetimleri geçti');
    process.exit(fails ? 1 : 0);
  })();
}
