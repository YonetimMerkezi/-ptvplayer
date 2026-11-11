// TV vitrini denemesi: kategoride kumandayla gezerken odaktaki film/dizinin arka planı ve bilgisi üstte görünür; Tamam ayrıntıyı açar.
// Telefonda hiçbir şey değişmez. Tek başına: node tests/e2e/vitrin.cjs; run.cjs sonunda da çağrılır.
const path = require('node:path');

async function vitrinSection({ browser, base, mock, ok, sleep }) {
  console.log('vitrin: TV’de odaktaki film/dizi arka planı ve bilgisi');
  const tvUrl = new URL('?tv=1', base).href;
  const open = async (vp, tv) => {
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
    if (tv) {
      await page.goto(tvUrl);
      await page.waitForSelector('.tile.t-live', { timeout: 15000 });
    }
    await sleep(500);
    return { ctx, page, errs };
  };
  const vodHits = () => mock.hits.filter((h) => /action=get_vod_info/.test(h)).length;
  const enterCat = async (page, tab) => {
    await page.click('.tile.t-' + tab);
    await page.waitForSelector('.row.cat');
    await sleep(300);
    await page.click('.row.cat >> nth=0');
    await page.waitForSelector('.card');
    await sleep(500);
  };
  const heroTitle = (page) => page.evaluate(() => (document.querySelector('#hero .hero-t') || {}).textContent || '');
  const cardName = (page, i) => page.evaluate((n) => (document.querySelector(`#list .card[data-i="${n}"] .cap`) || {}).textContent || '', i);
  const activeI = (page) => page.evaluate(() => (document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.i : null));

  // ---- 1) film kategorisi, TV 1920×1080
  {
    const { ctx, page, errs } = await open({ width: 1920, height: 1080 }, true);
    await enterCat(page, 'movie');
    ok(await page.evaluate(() => !document.querySelector('#hero').hidden && document.documentElement.classList.contains('hero-on')), 'film kategorisinde vitrin alanı açık');
    ok((await activeI(page)) === '0', 'kumandada odak ilk kutuda');
    const first = await cardName(page, 0);
    ok((await heroTitle(page)) === first && first.length > 0, 'vitrin ilk kutunun adını gösteriyor: ' + first);
    const cols = await page.evaluate(() => new Set([...document.querySelectorAll('#list .card')].map((c) => Math.round(c.getBoundingClientRect().left))).size);
    ok(cols >= 7 && cols <= 12, `TV’de kutular büyük (${cols} sütun)`);

    // ayrıntı bekleme sonunda gelir: oyuncular, yönetmen, geniş arka plan
    await page.waitForFunction(() => /Clara Lindqvist/.test(document.querySelector('#hero').textContent), null, { timeout: 5000 });
    ok(/Yönetmen\s*Henrik Lindholm/.test(await page.textContent('#hero')), 'yönetmen ve oyuncular geldi');
    await page.waitForFunction(() => document.querySelector('#hero-bg').classList.contains('has'), null, { timeout: 5000 });
    const bg1 = await page.evaluate(() => [...document.querySelectorAll('#hero-bg i')].filter((i) => i.classList.contains('on')).map((i) => i.style.backgroundImage));
    ok(bg1.length === 1 && /\/backdrop\//.test(bg1[0]), 'geniş arka plan tek katmanda görünüyor: ' + bg1.join('|'));
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('#hero-bg')).display === 'block'), 'arka plan katmanı ekranda');
    const hh = await page.evaluate(() => ({ h: document.querySelector('#hero').getBoundingClientRect().height, vh: innerHeight, list: document.querySelector('#list').getBoundingClientRect().height }));
    ok(Math.abs(hh.h - hh.vh * 0.38) < 2 && hh.list > hh.vh * 0.5, `vitrin ekranın %38’i, altta liste yeterli yerde (${Math.round(hh.h)} px / liste ${Math.round(hh.list)} px)`);

    // aşağı ok: odaktaki kutu (halkasıyla) liste alanında tam görünür, kırpılmaz
    await page.keyboard.press('ArrowDown');
    await sleep(500);
    const fit = await page.evaluate(() => {
      const l = document.querySelector('#list').getBoundingClientRect();
      const c = document.activeElement.getBoundingClientRect();
      return { top: Math.round(c.top - l.top), bottom: Math.round(l.bottom - c.bottom) };
    });
    ok(fit.top >= 5 && fit.bottom >= 5, `aşağı ok: odaktaki kutu liste alanında tam görünür (üst ${fit.top}, alt ${fit.bottom} px)`);
    await page.keyboard.press('ArrowUp');
    await sleep(500);

    // sağ ok: ad hemen değişir; arka plan başka görsele geçer
    await page.keyboard.press('ArrowRight');
    await sleep(60);
    ok((await heroTitle(page)) === (await cardName(page, 1)), 'sağ ok: vitrin adı hemen yeni kutuya geçti');
    await page.waitForFunction(() => /Clara Lindqvist/.test(document.querySelector('#hero').textContent), null, { timeout: 5000 });
    await sleep(700);
    const bg2 = await page.evaluate(() => [...document.querySelectorAll('#hero-bg i')].filter((i) => i.classList.contains('on')).map((i) => i.style.backgroundImage));
    ok(bg2.length === 1 && bg2[0] !== bg1[0], 'arka plan yeni filmin görseline geçti');

    // hızlı gezinme: beklemeden geçilen kutular için ağ isteği gitmez
    const before = vodHits();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('ArrowRight');
      await sleep(70);
    }
    const quickIdx = await activeI(page);
    await sleep(900);
    const after = vodHits();
    ok(after - before <= 1, `hızlı gezinmede ayrıntı isteği yalnız durulan kutu için (${after - before} istek, odak ${quickIdx})`);
    ok((await heroTitle(page)) === (await cardName(page, Number(quickIdx))), 'durulan kutunun bilgisi gösteriliyor');

    // Tamam: ayrıntı sayfası açılır; aynı film için yeniden istek gitmez (bellekten); geri dönünce odak ve vitrin aynı kutuda
    const shown = await heroTitle(page);
    const beforeOpen = vodHits();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#mv-play', { timeout: 5000 });
    await page.waitForFunction(() => /Henrik Lindholm/.test(document.querySelector('#mv-facts').textContent), null, { timeout: 5000 });
    ok(vodHits() === beforeOpen, 'ayrıntı sayfası vitrinde yüklenen bilgiyi bellekten kullandı (yeni istek yok)');
    ok(/Filmin konusu burada/.test(await page.textContent('#mv-plot')) && (await page.textContent('.dt-t')) === shown, 'Tamam: ayrıntı sayfası açıldı, konu ve ad doğru');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#mv-play', { state: 'detached', timeout: 5000 });
    await sleep(400);
    ok((await activeI(page)) === quickIdx && (await heroTitle(page)) === shown, 'geri: odak ve vitrin aynı kutuda');

    // oynatıcı/önizleme açıkken (yerel video saydam sayfanın altında oynar) arka plan katmanı gizlenir
    const hid = await page.evaluate(() => {
      const r = document.documentElement;
      const out = [];
      for (const c of ['native-playing', 'native-preview']) {
        r.classList.add(c);
        out.push(getComputedStyle(document.querySelector('#hero-bg')).display);
        r.classList.remove(c);
      }
      return out;
    });
    ok(hid.every((d) => d === 'none'), 'yerel oynatıcı açıkken vitrin arka planı gizli: ' + hid.join(','));

    // kategoriden çıkınca vitrin ve arka plan kalkar
    await page.keyboard.press('Escape');
    await sleep(500);
    ok(await page.evaluate(() => !!document.querySelector('.row.cat') && !document.documentElement.classList.contains('hero-on') && getComputedStyle(document.querySelector('#hero-bg')).display === 'none'), 'kategori listesine dönünce vitrin yok');
    ok(errs.length === 0, 'sayfa hatası yok' + (errs.length ? ': ' + errs[0] : ''));
    await ctx.close();
  }

  // ---- 1b) alçak TV ekranı 960×540: vitrin yazısı taşmaz, odaktaki kutu halkasıyla tam görünür
  {
    const { ctx, page, errs } = await open({ width: 960, height: 540 }, true);
    await enterCat(page, 'movie');
    await page.waitForFunction(() => /Clara Lindqvist/.test(document.querySelector('#hero').textContent), null, { timeout: 5000 });
    await page.keyboard.press('ArrowDown');
    await sleep(500);
    const r = await page.evaluate(() => {
      const h = document.querySelector('#hero');
      const l = document.querySelector('#list').getBoundingClientRect();
      const c = document.activeElement.getBoundingClientRect();
      const p = document.querySelector('#hero .hero-p').getBoundingClientRect();
      const hb = h.getBoundingClientRect();
      return { clipped: h.scrollHeight > h.clientHeight + 1, plotIn: p.bottom <= hb.bottom + 1, top: Math.round(c.top - l.top), bottom: Math.round(l.bottom - c.bottom), dir: getComputedStyle(document.querySelector('#hero .hero-d')).display };
    });
    ok(!r.clipped && r.plotIn, '960×540: vitrin metni sığıyor (konu kesilmiyor)');
    ok(r.dir === 'none', '960×540: yönetmen satırı gizli, yer açıldı');
    ok(r.top >= 5 && r.bottom >= 5, `960×540: odaktaki kutu halkasıyla tam görünür (üst ${r.top}, alt ${r.bottom} px)`);
    ok(errs.length === 0, '960×540: sayfa hatası yok');
    await ctx.close();
  }

  // ---- 2) dizi kategorisi: özet listeden gelir, ayrıntı isteği yok
  {
    const { ctx, page, errs } = await open({ width: 1920, height: 1080 }, true);
    const before = vodHits();
    await enterCat(page, 'series');
    const t = await heroTitle(page);
    ok(t.length > 0 && (await page.textContent('#hero')).includes('özeti'), 'dizide özet listeden hemen geldi: ' + t);
    await sleep(900);
    ok(vodHits() === before, 'dizi için film ayrıntısı istenmedi');
    ok(errs.length === 0, 'dizi: sayfa hatası yok');
    await ctx.close();
  }

  // ---- 3) ayar kapatılınca vitrin yok, kutular eski boyutta
  {
    const { ctx, page, errs } = await open({ width: 1920, height: 1080 }, true);
    await page.evaluate(() => window.__iptv.store.setPref('set.tvHero', false));
    await enterCat(page, 'movie');
    ok(await page.evaluate(() => document.querySelector('#hero').hidden && !document.documentElement.classList.contains('hero-on')), 'ayar kapalı: vitrin gizli');
    const cols = await page.evaluate(() => new Set([...document.querySelectorAll('#list .card')].map((c) => Math.round(c.getBoundingClientRect().left))).size);
    ok(cols >= 14, `ayar kapalı: kutular eski küçük boyutta (${cols} sütun)`);
    ok(errs.length === 0, 'ayar kapalı: sayfa hatası yok');
    await ctx.close();
  }

  // ---- 4) telefon (dokunmatik, TV kipi değil): hiçbir şey değişmez
  {
    const { ctx, page, errs } = await open({ width: 390, height: 844 }, false);
    const before = vodHits();
    await enterCat(page, 'movie');
    ok(await page.evaluate(() => document.querySelector('#hero').hidden && !document.documentElement.classList.contains('hero-on') && getComputedStyle(document.querySelector('#hero-bg')).display === 'none'), 'telefonda vitrin ve arka plan yok');
    const cols = await page.evaluate(() => new Set([...document.querySelectorAll('#list .card')].map((c) => Math.round(c.getBoundingClientRect().left))).size);
    ok(cols === 3, `telefonda kutu düzeni aynı (${cols} sütun)`);
    await page.focus('#list .card[data-i="0"]');
    await page.keyboard.press('ArrowRight');
    await sleep(700);
    ok(vodHits() === before, 'telefonda odak film ayrıntısı istemiyor');
    ok(errs.length === 0, 'telefon: sayfa hatası yok');
    await ctx.close();
  }
}

module.exports = { vitrinSection };

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
      await vitrinSection({ browser, base: `http://127.0.0.1:${www.address().port}/`, mock, ok, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
    } finally {
      await browser.close();
      www.close();
      await mock.close();
    }
    console.log(fails ? `\n${fails} denetim başarısız` : '\nvitrin denetimleri geçti');
    process.exit(fails ? 1 : 0);
  })();
}
