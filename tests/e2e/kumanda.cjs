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
    if (hiddenPages) {
      // Yerelde oynatıcı açılınca alttaki sayfa gizlenir; gizli öğe odağını kaybeder, bu yüzden tıklama JS ile verilir (zamanlamaya bağlı değil)
      await page.addStyleTag({ content: 'html.tv #app, #sheets .pg:not(.over-player), #sheets .sheet-back:not(.over-player) { visibility: hidden !important }' });
      await page.evaluate(() => document.querySelector('#mv-play').click());
    } else {
      await page.focus('#mv-play');
      await page.keyboard.press('Enter');
    }
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
    // odaktaki simge düğmesinin üstünde küçük ad etiketi çıkar (TV'de fare yok; kumanda odağında görünmeli)
    const tip = () => page.evaluate(() => {
      const t = document.querySelector('.pl-tip');
      const a = document.activeElement;
      if (!t || t.hidden || !a) return null;
      const tr = t.getBoundingClientRect();
      const ar = a.getBoundingClientRect();
      return { text: t.textContent, above: tr.bottom <= ar.top + 1, inside: tr.left >= 0 && tr.right <= innerWidth };
    });
    const tp = await tip();
    ok(tp && /^(Duraklat|Oynat)$/.test(tp.text) && tp.above && tp.inside, `${tag}: odaktaki oynat düğmesinin üstünde ad etiketi var (${JSON.stringify(tp)})`);
    await press(page, 'ArrowLeft');
    const tp2 = await tip();
    ok((await foc(page)) === 'pl-rew' && tp2 && tp2.text === '10 sn geri', `${tag}: odak geri sarma düğmesine geçince etiket de değişti (${tp2 && tp2.text})`);
    await press(page, 'ArrowRight');
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

  // ---- kategori düzenleme: satırdaki göster/gizle → kilit → taşıma düğmelerine sağ okla geçilir (kilit atlanmaz), sol okla geri dönülür
  {
    const { ctx, page, errs } = await open({ width: 1280, height: 720 });
    await page.click('.tile.t-live');
    await page.waitForSelector('#cat-edit');
    await sleep(300);
    await page.click('#cat-edit');
    await sleep(400);
    await page.focus('.row.cat.edit [data-act=eye]');
    const acts = [];
    for (let i = 0; i < 5; i++) {
      await press(page, 'ArrowRight');
      acts.push(await page.evaluate(() => (document.activeElement && document.activeElement.dataset.act) || 'satır'));
    }
    ok(acts[0] === 'lock', `düzenleme: göster/gizle düğmesinden sağa basınca kilit düğmesine gelindi (${acts.join(' → ')})`);
    ok(acts.includes('top') && acts.includes('up') && acts.includes('down'), 'düzenleme: sağ okla taşıma düğmelerine de ulaşıldı');
    await page.focus('.row.cat.edit [data-act=lock]');
    await press(page, 'ArrowLeft');
    ok((await page.evaluate(() => document.activeElement.dataset.act)) === 'eye', 'düzenleme: kilitten sola basınca göster/gizle düğmesine dönüldü');
    ok(errs.length === 0, `düzenleme: sayfa hatası yok ${errs.join(' | ')}`);
    await ctx.close();
  }

  // ---- kategoriye girip geri çıkınca imleç en üstteki Düzenle düğmesine değil, son girilen kategoride kalır
  for (const vp of [{ width: 960, height: 540 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const { ctx, page, errs } = await open(vp);
    const tag = `${vp.width}×${vp.height}`;
    await page.click('.tile.t-live');
    await page.waitForSelector('.row.cat');
    await sleep(400);
    for (let i = 0; i < 4; i++) await press(page, 'ArrowDown');
    const name = () => page.evaluate(() => { const a = document.activeElement; return a && a.classList.contains('cat') ? a.textContent.replace(/\d+›?$/, '').trim() : '-'; });
    const before = await name();
    ok(before !== '-' && before !== 'Tümü', `${tag}: kategori satırında duruluyor (${before})`);
    await page.keyboard.press('Enter');
    await sleep(500);
    ok(await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('row') && !document.activeElement.classList.contains('cat')), `${tag}: kategoriye girince imleç listenin ilk öğesinde`);
    await page.keyboard.press('Escape');
    await sleep(600);
    ok((await name()) === before, `${tag}: geri çıkınca imleç aynı kategoride (${await name()})`);
    ok(errs.length === 0, `${tag}: sayfa hatası yok ${errs.join(' | ')}`);
    await ctx.close();
  }

  // ---- film ayrıntısı: uzun konu kumandayla aşağı okunur, yukarı basınca en üste dönülür
  for (const vp of [{ width: 960, height: 540 }, { width: 1280, height: 720 }]) {
    const { ctx, page, errs } = await open(vp);
    const tag = `${vp.width}×${vp.height}`;
    const LONG = 'Boğaz kıyısında geçen uzun bir hikâye. '.repeat(120);
    await page.route(`${mock.url}/player_api.php*`, (r) => {
      if (new URL(r.request().url()).searchParams.get('action') === 'get_vod_info') {
        return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ info: { plot: LONG, genre: 'Dram', releasedate: '2020-01-01' } }) });
      }
      return r.continue();
    });
    await page.click('.tile.t-movie');
    await page.waitForSelector('.row.cat');
    await sleep(300);
    await page.click('.row.cat:has-text("Tümü")');
    await page.waitForSelector('.card');
    await page.click('.card');
    await page.waitForSelector('#mv-play');
    await sleep(900);
    const top = () => page.evaluate(() => document.querySelector('.pg-body').scrollTop);
    ok((await page.evaluate(() => { const b = document.querySelector('.pg-body'); return b.scrollHeight - b.clientHeight; })) > 300, `${tag}: konu ekrandan uzun (kaydırma gerekir)`);
    for (let i = 0; i < 40; i++) await press(page, 'ArrowDown');
    const bottom = await page.evaluate(() => { const b = document.querySelector('.pg-body'); return b.scrollHeight - b.clientHeight - b.scrollTop; });
    ok(bottom <= 2, `${tag}: aşağı okla konu sonuna kadar kaydırıldı (kalan ${bottom}px)`);
    for (let i = 0; i < 60; i++) await press(page, 'ArrowUp');
    ok((await top()) <= 2, `${tag}: yukarı okla tekrar en üste dönüldü (${await top()}px)`);
    ok(errs.length === 0, `${tag}: sayfa hatası yok ${errs.join(' | ')}`);
    await ctx.close();
  }

  // ---- odak halkası her temada belirgin (beyaz + koyu kenar), tema seçimi kumandayla yapılır
  {
    const { ctx, page, errs } = await open({ width: 1280, height: 720 });
    const themes = await page.evaluate(async () => (await import('/js/theme.js')).THEMES.map((t) => t.id));
    for (const t of themes) {
      await page.evaluate((id) => localStorage.setItem('iptv.pref.set.theme', JSON.stringify(id)), t);
      await page.goto(tvUrl);
      await page.waitForSelector('.tile.t-live');
      await sleep(300);
      await page.keyboard.press('ArrowDown');
      await sleep(600); // halka geçişi (0,15 sn) bitsin
      const ring = await page.evaluate(() => {
        const a = document.activeElement;
        const cs = getComputedStyle(a);
        return { theme: document.documentElement.dataset.theme, shadow: cs.boxShadow, outline: cs.outlineStyle === 'none' ? '' : cs.outlineColor + ' ' + cs.outlineWidth };
      });
      ok(ring.theme === t && /rgb\(255, 255, 255\)/.test(ring.shadow + ' ' + ring.outline), `${t}: odaklanan kutuda beyaz halka (${ring.shadow.slice(0, 70)})`);
      await page.click('.tile.t-live');
      await page.waitForSelector('.row.cat');
      await sleep(300);
      await press(page, 'ArrowDown', 2);
      await sleep(500);
      const row = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return cs.boxShadow; });
      ok(/rgb\(255, 255, 255\)/.test(row), `${t}: listede odaklı satırda beyaz halka`);
    }
    await page.evaluate(() => localStorage.removeItem('iptv.pref.set.theme'));
    await page.goto(tvUrl);
    await page.waitForSelector('#h-set');
    await page.click('#h-set');
    await page.waitForSelector('.set-tile');
    await page.focus('[data-set=general]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.swatch');
    await sleep(300);
    await page.focus('.swatch.on');
    await press(page, 'ArrowRight');
    // odaktaki tema kutusu belirgin: dolgu (beyaz), kenarlık (beyaz), büyüme ve halka kaydırma alanında kırpılmıyor
    const sw = await page.evaluate(() => {
      const a = document.activeElement;
      const cs = getComputedStyle(a);
      let sc = a.parentElement;
      while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
      const r = a.getBoundingClientRect();
      const o = sc ? sc.getBoundingClientRect() : { top: 0, bottom: innerHeight };
      return { sw: a.classList.contains('swatch'), bg: cs.backgroundColor, border: cs.borderTopColor, tr: cs.transform, ringTop: r.top - 7 - o.top, ringBottom: o.bottom - (r.bottom + 7) };
    });
    ok(sw.sw && sw.bg === 'rgb(255, 255, 255)' && sw.border === 'rgb(255, 255, 255)' && /matrix\(1\.0/.test(sw.tr), `tema kutusu odakta beyaz dolgu + beyaz kenarlık + büyüme (${sw.bg} ${sw.border} ${sw.tr})`);
    ok(sw.ringTop >= -1 && sw.ringBottom >= -1, `odaktaki tema kutusunun halkası kaydırma alanında kırpılmıyor (üst ${Math.round(sw.ringTop)}px, alt ${Math.round(sw.ringBottom)}px)`);
    await page.keyboard.press('Enter');
    await sleep(300);
    ok(await page.evaluate(() => document.documentElement.dataset.theme !== 'green'), 'Tamam tuşuyla tema seçildi (kumanda)');
    ok(errs.length === 0, `halka/tema: sayfa hatası yok ${errs.join(' | ')}`);
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
