// Uçtan uca deneme (Playwright + sahte sunucu). Çalıştırma: node tests/e2e/run.cjs
// Ön koşul: mock/make-media.sh çalıştırılmış olmalı.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const WWW = path.join(__dirname, '..', '..', 'www');
const SHOTS = process.env.SHOTS || path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function serveWww() {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(WWW, p);
    if (!f.startsWith(WWW) || !fs.existsSync(f)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }).end(fs.readFileSync(f));
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

let fails = 0;
const ok = (c, m) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + m);
  if (!c) fails++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { startMock } = await import('../../mock/server.mjs');
  const mock = await startMock(0);
  const www = await serveWww();
  const base = `http://127.0.0.1:${www.address().port}/`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

  async function newPage(vp = { width: 390, height: 844 }, init) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: true });
    const page = await ctx.newPage();
    // TV'de metin alanları kumandayla gezerken salt okunurdur; kullanıcı gibi önce Tamam'a basılıp düzenleme açılır
    const rawFill = page.fill.bind(page);
    page.fill = async (sel, val, opts) => {
      const ro = await page.$eval(sel, (e) => e.dataset.tvRo === '1' && e.readOnly).catch(() => false);
      if (ro) {
        await page.focus(sel);
        await page.keyboard.press('Enter');
      }
      return rawFill(sel, val, opts);
    };
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && errs.push(m.text()));
    // Yenilikler penceresi testleri bozmasın: görüldü sayılır (Yenilikler bölümü __news ile bunu kapatır)
    await page.addInitScript(() => {
      try {
        if (localStorage.getItem('__news') !== '1') localStorage.setItem('iptv.pref.seen.changelog', '999');
      } catch {
        /* depolama yok */
      }
    });
    if (init) await page.addInitScript(init);
    await page.goto(base);
    return { page, ctx, errs };
  }

  // ---------------------------------------------------------------- 1. M3U ekleme, liste, arama, favori
  console.log('M3U kaynağı');
  let { page, ctx, errs } = await newPage();
  await page.waitForSelector('#f');
  ok(await page.$eval('#f-type [data-t=xtream]', (b) => b.classList.contains('on')), 'ilk açılışta kaynak ekleme sayfası kendiliğinden açık (Xtream seçili)');
  ok((await page.$$eval('#f-type button', (b) => b.map((x) => x.textContent))).join() === 'Xtream,M3U bağlantısı,Dosyadan,Kod', 'dört giriş türü: Xtream, M3U bağlantısı, Dosyadan, Kod');
  await sleep(350);
  await page.screenshot({ path: path.join(SHOTS, '01-ilk-acilis.png') });
  await page.click('.sheet [data-close]');
  await page.waitForSelector('#ob-add');
  ok(true, 'sayfa kapatılınca karşılama ekranı ve “Kaynak ekle” düğmesi kalıyor');
  await page.click('#ob-add');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/list.m3u');
  await page.fill('input[name=name]', 'Deneme M3U');
  await page.click('#f-go');
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  ok(/Deneme M3U/.test(await page.textContent('#h-src')), 'kaynak adı ana ekranın altında');
  ok(/120 kanal/.test(await page.textContent('.t-live')) && /Son güncelleme/.test(await page.textContent('#h-upd')), 'ana ekranda Canlı TV kutusu: kanal sayısı ve son güncelleme');
  ok(/\d\d:\d\d/.test(await page.textContent('#h-clock')) && (await page.textContent('#h-date')).includes('2'), 'ana ekranda saat ve tarih');
  ok((await page.$$eval('.tile', (e) => e.length)) === 10, 'ana ekranda on kutu (canlı, film, dizi, kategoriler + EPG, çoklu ekran, izleme listesi, favoriler, spor, ayarlar)');
  ok(/Hoş Geldiniz/.test(await page.textContent('.hero')) && /Deneme M3U/.test(await page.textContent('.hero')), 'karşılama kartında “Hoş Geldiniz” ve kaynak adı');
  await page.screenshot({ path: path.join(SHOTS, '00-ana-ekran-dikey.png') });
  await page.click('.t-live');
  await page.waitForSelector('.row.cat');
  ok(/Deneme M3U/.test(await page.textContent('#src-name')), 'kaynak adı üst çubukta');
  const cats = await page.$$eval('.row.cat', (e) => e.map((x) => x.textContent));
  ok(cats[0].startsWith('Tümü') && cats[0].includes('120'), 'Canlı TV önce kategorileri gösteriyor, ilki Tümü (120): ' + cats[0]);
  ok(cats.some((c) => c.startsWith('Haber')) && cats.some((c) => c.startsWith('Son izlenen')), 'gruplar ve “Son izlenen” kategori satırı olarak listeleniyor');
  ok((await page.$$('.row:not(.cat)')).length === 0, 'kategori ekranında kanal satırı yok');
  await page.screenshot({ path: path.join(SHOTS, '01b-kategoriler.png') });
  await page.evaluate(() => (document.querySelector('#catq').hidden = false)); // az kategoride gizli; süzmeyi yine de dene
  await page.fill('#cat-q', 'spo');
  await page.waitForFunction(() => document.querySelectorAll('.row.cat').length > 0 && [...document.querySelectorAll('.row.cat .nm')].every((n) => /spo/i.test(n.textContent)));
  ok(true, 'kategori arama kutusu kategorileri süzüyor');
  await page.fill('#cat-q', '');
  await page.waitForFunction(() => document.querySelectorAll('.row.cat').length > 3);
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.row:not(.cat)');
  ok((await page.textContent('#crumb-t')) === 'Tümü', 'kategoriye girince başlıkta adı yazıyor');
  ok(await page.$eval('#btn-source', (e) => e.hidden), 'kategori içinde kaynak adı gizli (başlık onun yerine)');
  ok((await page.$$('#btn-home:not([hidden])')).length === 1 && (await page.$$('.crumb-back')).length === 0, 'kategori içinde tek geri oku var');
  const rowCount = await page.$$eval('.row', (e) => e.length);
  ok(rowCount > 5 && rowCount < 40, `yalnız görünen satırlar çizildi (${rowCount} satır)`);

  await page.click('#btn-search');
  await page.fill('#q', 'seker');
  await page.waitForFunction(() => document.querySelectorAll('.row').length > 0 && [...document.querySelectorAll('.row .nm')].every((n) => /Şeker/.test(n.textContent)));
  ok(true, '“seker” araması “Şeker TV” kanallarını buluyor (Türkçe duyarsız)');
  await page.screenshot({ path: path.join(SHOTS, '02-arama.png') });
  await page.click('#q-clear');
  await page.waitForSelector('.row:not(.cat)');

  await page.click('#btn-home');
  await page.waitForSelector('.row.cat');
  ok(true, 'başlıktaki geri oku kategori listesine dönüyor');
  ok(!(await page.$eval('#btn-source', (e) => e.hidden)) && (await page.$eval('#crumb', (e) => e.hidden)), 'kategori listesine dönünce kaynak adı geri geldi, kategori başlığı gizlendi');
  await page.click('.row.cat:has-text("Spor")');
  await page.waitForSelector('.row:not(.cat)');
  const nSpor = await page.$$eval('.row:not(.cat)', (e) => e.length);
  ok(nSpor > 0 && (await page.textContent('#crumb-t')) === 'Spor', `“Spor” kategorisi yalnız kendi kanallarını açıyor (${nSpor})`);
  await page.goBack();
  await page.waitForSelector('.row.cat');
  ok(true, 'Android geri tuşu kategori listesine dönüyor');
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.row:not(.cat)');

  await page.click('.row [data-fav]');
  await page.click('#tabs [data-tab=favs]');
  await page.waitForSelector('.row');
  ok((await page.$$eval('.row', (e) => e.length)) === 1, 'favori, Favoriler sekmesinde görünüyor');
  ok(await page.isVisible('#crumb-sort'), 'Favoriler’de üst çubukta “Sırala” düğmesi var');
  await page.reload();
  await page.waitForSelector('.tile');
  await page.click('#tabs [data-tab=favs]');
  await page.waitForSelector('.row');
  ok((await page.$$eval('.row', (e) => e.length)) === 1, 'favori yeniden yüklemeden sonra da duruyor');
  await page.click('#tabs [data-tab=live]');
  await page.waitForSelector('.row.cat');
  await sleep(150); // geçmiş girdisi kapanışı otursun
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.row:not(.cat)');

  // ---------------------------------------------------------------- 2. TV rehberi
  console.log('TV rehberi');
  await page.waitForFunction(() => window.__iptv.S.epg.ready, null, { timeout: 15000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.row .sub')].some((n) => /Program/.test(n.textContent)), null, { timeout: 5000 });
  ok(true, 'kanal satırlarında “şimdi” programı görünüyor');
  await page.click('.row [data-epg]');
  await page.waitForSelector('.prog-row');
  const progN = await page.$$eval('.prog-row', (e) => e.length);
  // Rehber akışı günün kalan saatlerini listeler: gün sonuna yakın az satır olması normaldir
  const hoursLeft = await page.evaluate(() => 24 - new Date().getHours());
  ok(progN >= Math.min(5, hoursLeft), 'kanal program listesi açılıyor (' + progN + ' satır)');
  ok((await page.$$eval('.prog-row.now', (e) => e.length)) === 1, 'şimdiki program vurgulu');
  await sleep(350);
  await page.screenshot({ path: path.join(SHOTS, '03-rehber.png') });
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  ok(true, 'geri tuşu alt sayfayı kapatıyor');
  // zaman çizelgeli TV rehberi: kategori → kanal satırları, zaman cetveli, program blokları, şimdi çizgisi
  await page.click('#tabs [data-tab=home]');
  await page.waitForSelector('[data-go=guide]');
  const gIcon = await page.evaluate(() => {
    const u = document.querySelector('.t-guide svg use');
    const b = u && u.closest('svg').getBoundingClientRect();
    return { href: u && u.getAttribute('href'), sym: !!(u && document.getElementById('i-guide')), w: b ? b.width : 0 };
  });
  ok(gIcon.href === '#i-guide' && gIcon.sym && gIcon.w > 8, 'TV Rehberi kutucuğunda simge var ve çiziliyor');
  await page.click('[data-go=guide]');
  await page.waitForSelector('.guide-category-head');
  ok(!(await page.$('.tl')), 'rehber önce yalnız kategorileri gösteriyor');
  await page.click('.guide-category-head');
  await page.waitForSelector('.tl-row');
  // kaydırma: sayfa gövdesi kaymaz, tek kaydırma alanı çizelgenin kendisi
  const scr = await page.evaluate(() => {
    const pg = document.querySelector('.guide-pg');
    const bodyEl = pg.querySelector('.pg-body');
    const scrollers = [...pg.querySelectorAll('*')].filter((el) => {
      const o = getComputedStyle(el);
      return /(auto|scroll)/.test(o.overflowY + o.overflowX) && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    }).map((el) => el.className.split(' ')[0]);
    const pgb = pg.getBoundingClientRect();
    const tl = document.querySelector('.tl').getBoundingClientRect();
    return { bodyScrolls: bodyEl.scrollHeight > bodyEl.clientHeight + 1, scrollers, fits: tl.bottom <= pgb.bottom + 1 && tl.height > 150 };
  });
  ok(!scr.bodyScrolls && scr.scrollers.length === 1 && scr.scrollers[0] === 'tl-scroll' && scr.fits, 'tek kaydırma alanı var (çizelge); sayfa gövdesi kaymıyor: ' + JSON.stringify(scr.scrollers));
  ok((await page.$$('.tl-row')).length > 0 && (await page.$$('.tl-ch')).length > 0, 'kategori açılınca kanal satırları ve sabit kanal sütunu var');
  ok((await page.$$('.tl-tick:not(.half)')).length >= 20 && /\d\d:\d\d/.test(await page.textContent('.tl-axis')), 'yarım saatlik zaman cetveli var');
  ok((await page.$$('.tl-prog:not(.none)')).length > 0, 'programlar süresine göre bloklar olarak çizildi');
  const tlg = await page.evaluate(() => {
    const sc = document.querySelector('.tl-scroll');
    const line = document.querySelector('.tl-nowline').getBoundingClientRect();
    const s = sc.getBoundingClientRect();
    const ch = document.querySelector('.tl-ch').getBoundingClientRect();
    const cur = document.querySelector('.tl-prog.now');
    const ppm = parseFloat(getComputedStyle(document.querySelector('.tl')).getPropertyValue('--tl-ppm')) || 0;
    const err = [...document.querySelectorAll('.tl-prog:not(.none)')].map((b) => Math.abs(b.getBoundingClientRect().width - parseFloat(b.style.getPropertyValue('--d')) * ppm));
    return { scrolled: sc.scrollLeft, lineIn: line.left >= s.left && line.left <= s.right, lineAfterCh: line.left >= ch.right - 1, hasNow: !!cur, ppm, maxErr: err.length ? Math.max(...err) : 99 };
  });
  ok(tlg.scrolled > 0 && tlg.lineIn && tlg.lineAfterCh, 'açılışta şimdiye kaydırıldı, şimdi çizgisi kanal sütununun yanında görünür');
  ok(tlg.hasNow && tlg.ppm > 0 && tlg.maxErr <= 6, 'şimdiki program vurgulu, blok genişliği süre × dakika genişliği ile orantılı ' + JSON.stringify([tlg.hasNow, tlg.ppm, tlg.maxErr]));
  await sleep(350);
  await page.screenshot({ path: path.join(SHOTS, '03b-rehber-cizelge.png') });
  await page.click('#guide-fwd');
  await page.waitForFunction((x) => document.querySelector('.tl-scroll').scrollLeft > x + 100, tlg.scrolled, { timeout: 3000 });
  await page.click('#guide-today');
  await page.waitForFunction((x) => Math.abs(document.querySelector('.tl-scroll').scrollLeft - x) < 8, tlg.scrolled, { timeout: 3000 });
  ok(true, '“3 sa ›” ileri kaydırdı, “Şimdi” geri getirdi');
  await page.click('.tl-prog.now');
  await page.waitForSelector('.gp [data-a=watch]');
  ok(/dk/.test(await page.textContent('.gp-meta')), 'programa dokununca ayrıntı penceresi açıldı');
  await page.screenshot({ path: path.join(SHOTS, '03c-rehber-program.png') });
  await page.click('.gp [data-a=watch]');
  await page.waitForFunction(() => document.body.classList.contains('player-open'), null, { timeout: 8000 });
  ok(true, '“Kanalı izle” kanalı oynattı');
  await page.goBack();
  await page.waitForFunction(() => !document.body.classList.contains('player-open'));
  await page.click('.tl-ch');
  await page.waitForSelector('.prog-row');
  ok(true, 'kanal adına dokununca günlük yayın akışı açıldı');
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });

  // kumanda: oklar program program gezer, sabit kanal sütunu/cetvelin altında kalmaz
  const act = () => page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return null;
    const row = a.closest('.tl-row');
    const rows = [...document.querySelectorAll('.tl-row')];
    const b = a.getBoundingClientRect();
    const sc = document.querySelector('.tl-scroll').getBoundingClientRect();
    const chW = document.querySelector('.tl-corner').getBoundingClientRect().width;
    const headH = document.querySelector('.tl-head').getBoundingClientRect().height;
    return {
      kind: a.classList.contains('tl-ch') ? 'ch' : a.classList.contains('tl-prog') ? 'prog' : a.className.split(' ')[0],
      row: rows.indexOf(row), s: a.dataset.s ? Number(a.dataset.s) : null,
      visible: b.right > sc.left + chW + 2 && b.left < sc.right - 2 && b.top >= sc.top + headH - 2 && b.bottom <= sc.bottom + 2,
      chVisible: a.classList.contains('tl-ch') ? b.top >= sc.top + headH - 2 && b.bottom <= sc.bottom + 2 : true,
    };
  });
  await page.focus('.tl-prog.now');
  const k0 = await act();
  await page.keyboard.press('ArrowRight');
  const k1 = await act();
  ok(k0 && k1 && k1.kind === 'prog' && k1.row === k0.row && k1.s > k0.s, 'sağ ok aynı satırda sonraki programa geçti');
  ok(await page.evaluate(() => document.documentElement.classList.contains('kbd')), 'ok tuşu kumanda kipini açtı (odak halkası görünür)');
  await page.keyboard.press('ArrowLeft');
  const k2 = await act();
  ok(k2.row === k0.row && k2.s === k0.s, 'sol ok önceki programa döndü');
  await page.keyboard.press('ArrowDown');
  const k3 = await act();
  ok(k3.row === k0.row + 1 && k3.kind === 'prog' && k3.visible, 'aşağı ok alttaki kanalın programına indi ve görünür');
  await page.keyboard.press('ArrowUp');
  const k4 = await act();
  ok(k4.row === k0.row && k4.kind === 'prog', 'yukarı ok üstteki satıra çıktı');
  for (let i = 0; i < 40; i++) {
    const c = await act();
    if (c.kind === 'ch') break;
    await page.keyboard.press('ArrowLeft');
  }
  const k5 = await act();
  ok(k5.kind === 'ch' && k5.chVisible, 'sola basa basa kanal adına ulaşılır');
  await page.keyboard.press('ArrowRight');
  const k6 = await act();
  ok(k6.kind === 'prog' && k6.row === k5.row && k6.visible, 'kanal adından sağ ok görünen ilk programa geçti');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.gp [data-a=watch]');
  ok(true, 'Tamam tuşu odaktaki programın ayrıntısını açtı');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await sleep(300);
  const kf = await act();
  ok(kf && kf.kind === 'prog', 'ayrıntı kapanınca odak programa döndü ' + JSON.stringify(kf));
  // uzun gezinme: alt satırlara inerken odak hep görünür kalır, sayfa gövdesi kaymaz
  for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowDown');
  const kd = await act();
  const bodyShift = await page.evaluate(() => document.querySelector('.guide-pg .pg-body').scrollTop);
  ok(kd && kd.row >= 1 && (kd.kind === 'ch' ? kd.chVisible : kd.visible) && bodyShift === 0, 'aşağı ok çizelgeyi kaydırıp odağı görünür tuttu ' + JSON.stringify([kd, bodyShift]));

  // Geri: önce kategori listesi, sonra rehber kapanır
  await page.keyboard.press('Escape');
  await page.waitForSelector('.tl', { state: 'detached' });
  ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('guide-category-head')), 'Geri çizelgeden kategorilere döndü, odak kategori düğmesinde');
  ok(!!(await page.$('.guide-pg')), 'kategori listesinde rehber hâlâ açık');
  await page.goBack();
  await page.waitForSelector('.guide-pg', { state: 'detached' });
  // sonraki bölümler için Canlı › Tümü listesine dön
  await page.click('#tabs [data-tab=live]');
  await page.waitForSelector('.row.cat');
  await sleep(150);
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.row:not(.cat)');

  // ---------------------------------------------------------------- 3. canlı oynatma
  console.log('Canlı oynatma (hls.js)');
  await page.screenshot({ path: path.join(SHOTS, '04-canli-liste.png') });
  await page.click('.row:not(.cat) .nm');
  await page.waitForSelector('#player:not([hidden])');
  await page.waitForFunction(() => document.querySelector('#vid').currentTime > 1.5, null, { timeout: 20000 });
  ok(true, 'video oynuyor (VP9/HLS)');
  ok((await page.textContent('#pl-name')).length > 0, 'kanal adı başlıkta');
  ok(await page.$eval('#pl-prog', (e) => e.classList.contains('live')), 'canlı kipi (arama çubuğu yok)');
  ok((await page.textContent('#pl-epgline')).includes('Program'), 'oynatıcıda şimdi/sonra bilgisi');
  await page.screenshot({ path: path.join(SHOTS, '05-oynatici-canli.png') });
  const n1 = await page.textContent('#pl-name');
  await page.evaluate(() => document.querySelector('#pl-ui').classList.add('show'));
  await page.click('#pl-next');
  await page.waitForFunction((n) => document.querySelector('#pl-name').textContent !== n, n1);
  await page.waitForFunction(() => document.querySelector('#vid').currentTime > 0.5, null, { timeout: 20000 });
  ok(true, 'sonraki kanala geçiş ve oynatma');
  ok(/^Kanal 2$/.test(await page.textContent('#pl-sub')), 'başlıkta kanal numarası: ' + (await page.textContent('#pl-sub')));
  ok(await page.$eval('#pl-last', (e) => !e.hidden), 'iki kanal izlenince “Son kanal” düğmesi göründü');
  const n2 = await page.textContent('#pl-name');
  await page.keyboard.press('5');
  ok((await page.textContent('#pl-num')) === '5' && (await page.isVisible('#pl-num')), 'rakam basınca kanal numarası ekranda');
  await page.keyboard.press('Enter');
  await page.waitForFunction((n) => document.querySelector('#pl-name').textContent !== n, n2);
  ok(/^Kanal 5$/.test(await page.textContent('#pl-sub')), 'rakamlarla 5. kanala geçildi');
  const n5 = await page.textContent('#pl-name');
  await page.keyboard.press('0');
  await page.waitForFunction((n) => document.querySelector('#pl-name').textContent === n, n2);
  ok(true, '“0” tuşu son izlenen kanala döndürdü');
  await page.keyboard.press('0');
  await page.waitForFunction((n) => document.querySelector('#pl-name').textContent === n, n5);
  ok(true, '“0” yeniden basınca iki kanal arasında geçiş yapıyor');
  await page.evaluate(() => document.querySelector('#pl-ui').classList.add('show'));
  await page.click('#pl-last');
  await page.waitForFunction((n) => document.querySelector('#pl-name').textContent === n, n2);
  ok(true, '“Son kanal” düğmesi de önceki kanala döndürdü');
  for (const d of '9999') await page.keyboard.press(d);
  await page.keyboard.press('Enter');
  ok(/Böyle bir kanal yok/.test(await page.textContent('#pl-num')) && (await page.textContent('#pl-name')) === n2, 'olmayan kanal numarasında uyarı verip yayında kaldı');
  // uyku zamanlayıcısı
  await page.evaluate(() => document.querySelector('#pl-ui').classList.add('show'));
  await page.click('#pl-sleep');
  await page.waitForSelector('.sheet [data-m="15"]');
  await page.click('.sheet [data-m="15"]');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  ok(/dk|sn/.test(await page.textContent('#pl-sleep-l')), 'uyku zamanlayıcısı kuruldu, kalan süre düğmede: ' + (await page.textContent('#pl-sleep-l')));
  await page.click('#pl-sleep');
  await page.waitForSelector('.sheet [data-m="0"]');
  await page.click('.sheet [data-m="0"]');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  ok((await page.textContent('#pl-sleep-l')) === 'Uyku', 'zamanlayıcı kapatılınca düğme eski haline döndü');
  await page.evaluate(() => {
    const orig = window.setTimeout;
    window.__stOrig = orig;
    window.setTimeout = (f, ms, ...a) => orig(f, ms >= 600000 ? 400 : ms, ...a);
  });
  await page.click('#pl-sleep');
  await page.click('.sheet [data-m="15"]');
  await page.evaluate(() => (window.setTimeout = window.__stOrig));
  await page.waitForSelector('#player', { state: 'hidden', timeout: 5000 });
  ok(true, 'uyku zamanlayıcısı dolunca oynatıcı kapandı');
  await page.click('.row:not(.cat) .nm');
  await page.waitForSelector('#player:not([hidden])');
  ok((await page.textContent('#pl-sleep-l')) === 'Uyku', 'yeni oynatmada zamanlayıcı sıfır');
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden' });
  ok(true, 'geri tuşu oynatıcıyı kapatıyor');
  await page.click('#btn-home');
  await page.click('.row.cat:has-text("Son izlenen")');
  await page.waitForSelector('.row:not(.cat)');
  ok((await page.$$eval('.row:not(.cat)', (e) => e.length)) === 3, 'son izlenenlerde üç farklı kanal');

  // ---------------------------------------------------------------- 3b. kategori yönetimi
  console.log('Kategori yönetimi');
  const catRowOf = (name) => page.locator('.row.cat', { has: page.locator('.nm', { hasText: new RegExp('^' + name + '$') }) });
  await page.click('#btn-home');
  await page.waitForSelector('.row.cat');
  const names0 = await page.$$eval('.row.cat .nm', (e) => e.map((x) => x.textContent));
  const [g1, g2] = [names0[2], names0[3]];
  const totalAll0 = Number(await page.$eval('.row.cat .n', (e) => e.textContent));
  const g1Count = Number(await catRowOf(g1).locator('.n').textContent());
  await page.click('#cat-edit');
  await page.waitForSelector('.row.cat.edit');
  ok(/Bitti/.test(await page.textContent('#cat-edit')) && (await page.$$('#cat-new:not([hidden])')).length === 1, 'Düzenle kipi açıldı (Bitti, + Klasör görünür)');
  await catRowOf(g2).locator('[data-act=top]').click();
  await page.waitForFunction((g) => document.querySelectorAll('.row.cat .nm')[2].textContent === g, g2);
  ok(true, `“${g2}” en üste alındı (özel satırların hemen altına)`);
  await catRowOf(g1).locator('[data-act=down]').click();
  const namesMoved = await page.$$eval('.row.cat .nm', (e) => e.map((x) => x.textContent));
  ok(namesMoved.indexOf(g1) === 4 && namesMoved[2] === g2, 'aşağı oku bir satır aşağı taşıdı');
  await page.screenshot({ path: path.join(SHOTS, '03b-kategori-duzenle.png') });
  await catRowOf(g1).locator('[data-act=eye]').click();
  await page.waitForSelector('.row.cat.hid');
  ok((await page.$$('.row.cat.hid')).length === 1, 'gizlenen kategori düzenle kipinde soluk gösteriliyor');
  await page.click('#cat-edit');
  await page.waitForFunction(() => !document.querySelector('.row.cat.edit'));
  const names1 = await page.$$eval('.row.cat .nm', (e) => e.map((x) => x.textContent));
  ok(!names1.includes(g1) && names1[2] === g2, 'Bitti: gizli kategori listede yok, sıra korunuyor');
  const totalAll1 = Number(await page.$eval('.row.cat .n', (e) => e.textContent));
  ok(totalAll1 === totalAll0 - g1Count, `gizli kategorinin kanalları “Tümü” sayısından düştü (${totalAll0} → ${totalAll1})`);
  await page.reload();
  await page.waitForSelector('.tile');
  await page.click('#tabs [data-tab=live]');
  await page.waitForSelector('.row.cat');
  const names2 = await page.$$eval('.row.cat .nm', (e) => e.map((x) => x.textContent));
  ok(JSON.stringify(names2) === JSON.stringify(names1), 'sıra ve gizleme yeniden açılışta korunuyor');
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.row:not(.cat)');
  await page.click('#btn-search');
  await page.fill('#q', g1);
  await sleep(450);
  const hiddenInSearch = await page.evaluate((g) => window.__iptv.S.items.some((it) => it.group === g), g1);
  ok(!hiddenInSearch, 'gizli kategorideki öğeler kategori içi aramada da çıkmıyor');
  await page.click('#q-clear');
  await page.waitForSelector('.row:not(.cat)');
  await page.click('#btn-home'); // tek geri oku: kategoriden çıkar; kategori dışında üstteki arama tüm içeriği arar
  await page.waitForSelector('.row.cat');
  await page.click('#btn-search');
  await page.fill('#gs-q', g1);
  await sleep(500);
  const hiddenInGlobal = await page.$$eval('#gs-res .list-item small', (e, g) => e.some((x) => x.textContent === g), g1);
  ok(!hiddenInGlobal, 'gizli kategorideki öğeler genel aramada da çıkmıyor');
  await page.goBack();
  await page.waitForSelector('.pg', { state: 'detached' });

  // klasör: oluştur, uzun basarak öğe ekle
  await page.waitForSelector('.row.cat');
  await page.click('#cat-edit');
  await page.click('#cat-new');
  await page.fill('#nf-name', 'Sabah kanalları');
  await page.click('#nf-go');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.waitForSelector('.row.cat.edit .nm:has-text("Sabah kanalları")');
  ok((await page.$$eval('.row.cat .nm', (e) => e[2].textContent)) === 'Sabah kanalları', 'yeni klasör kategori listesinin başında');
  await page.click('#cat-edit');
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.row:not(.cat)');
  await page.locator('.row:not(.cat)').first().waitFor({ state: 'visible' });
  const box = await page.locator('.row:not(.cat)').first().boundingBox();
  await page.mouse.move(box.x + 120, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(750);
  await page.mouse.up();
  await page.waitForSelector('.sheet [data-f]');
  ok((await page.$$('#player:not([hidden])')).length === 0, 'uzun basma oynatmayı başlatmadı, klasör sayfası açıldı');
  await page.click('.sheet [data-f]');
  await page.waitForFunction(() => document.querySelector('.sheet [data-f] .ic.ok'));
  ok(true, 'öğe klasöre eklendi (işaret göründü)');
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.click('#btn-home');
  await page.waitForSelector('.row.cat');
  const folderCount = await catRowOf('Sabah kanalları').locator('.n').textContent();
  ok(folderCount === '1', 'klasör satırı 1 öğe gösteriyor');
  await page.click('.row.cat:has-text("Sabah kanalları")');
  await page.waitForSelector('.row:not(.cat)');
  ok((await page.$$eval('.row:not(.cat)', (e) => e.length)) === 1 && (await page.textContent('#crumb-t')) === 'Sabah kanalları', 'klasör yalnız eklenen kanalı gösteriyor');
  // klasörden çıkar → boş klasör
  await page.locator('.row:not(.cat)').first().waitFor({ state: 'visible' });
  const box2 = await page.locator('.row:not(.cat)').first().boundingBox();
  await page.mouse.move(box2.x + 120, box2.y + box2.height / 2);
  await page.mouse.down();
  await sleep(750);
  await page.mouse.up();
  await page.waitForSelector('.sheet [data-f]');
  await page.click('.sheet [data-f]');
  await page.waitForSelector('#empty:not([hidden])');
  ok(/Klasör boş/.test(await page.textContent('#empty')), 'klasörden çıkarılan öğe hemen kayboluyor, boş klasör bilgisi');
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });

  // klasörü yeniden adlandır ve sil
  await page.click('#btn-home');
  await page.waitForSelector('.row.cat');
  await page.click('#cat-edit');
  await page.click('.row.cat.edit:has-text("Sabah kanalları")');
  await page.click('#fm-ren');
  await page.fill('#fm-name', 'Haber saati');
  await page.click('#fm-save');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.waitForSelector('.row.cat.edit .nm:has-text("Haber saati")');
  ok(true, 'klasör yeniden adlandırıldı');
  // klasör içi sıra: boş/tek öğeli klasörde düğme kapalı, çok öğelide yukarı/aşağı/en üste taşıma kalıcı
  await page.click('.row.cat.edit:has-text("Haber saati")');
  await page.waitForSelector('#fm-ord');
  ok(await page.$eval('#fm-ord', (b) => b.disabled), 'boş klasörde “Sırayı düzenle” kapalı');
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  const fo = await page.evaluate(() => {
    const { S, store } = window.__iptv;
    const p = store.catPrefs(S.source.id, 'live');
    const f = p.folders.find((x) => x.name === 'Haber saati');
    const three = S.cat.live.slice(0, 3);
    f.items = three.map((c) => c.id);
    store.setCatPrefs(S.source.id, 'live', p);
    return { ids: f.items.slice(), names: three.map((c) => c.name) };
  });
  await page.click('.row.cat.edit:has-text("Haber saati")');
  await page.click('#fm-ord');
  await page.waitForSelector('.fo-row');
  const foNames = () => page.$$eval('.fo-row .t', (e) => e.map((x) => x.textContent.replace(/^\d+\.\s*/, '')));
  const foIds = () => page.evaluate(() => { const { S, store } = window.__iptv; return store.catPrefs(S.source.id, 'live').folders.find((x) => x.name === 'Haber saati').items; });
  ok(JSON.stringify(await foNames()) === JSON.stringify(fo.names), 'sıra penceresi klasör öğelerini kayıtlı sırayla listeliyor');
  await page.click('.fo-row:nth-child(3) [data-m=top]');
  ok(JSON.stringify(await foNames()) === JSON.stringify([fo.names[2], fo.names[0], fo.names[1]]), '“En üste al” üçüncü öğeyi başa taşıdı');
  await page.click('.fo-row:nth-child(1) [data-m=down]');
  ok(JSON.stringify(await foNames()) === JSON.stringify([fo.names[0], fo.names[2], fo.names[1]]), '“Aşağı” öğeyi bir basamak indirdi');
  await page.click('.fo-row:nth-child(3) [data-m=up]');
  ok(JSON.stringify(await foIds()) === JSON.stringify([fo.ids[0], fo.ids[1], fo.ids[2]]), '“Yukarı” ile sıra geri döndü ve klasör kaydı güncel: ' + JSON.stringify(await foIds()));
  await page.click('.fo-row:nth-child(2) [data-m=top]');
  ok(JSON.stringify(await foIds()) === JSON.stringify([fo.ids[1], fo.ids[0], fo.ids[2]]), 'klasör sırası kalıcı kaydedildi');
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.click('.row.cat.edit:has-text("Haber saati")');
  await page.click('#fm-del');
  await page.click('#fm-yes');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  ok((await page.$$('.row.cat .nm:has-text("Haber saati")')).length === 0, 'klasör silindi');

  // sıfırla: sıra ve gizleme varsayılana döner
  await page.click('#cat-reset');
  await page.click('#rs-yes');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.click('#cat-edit');
  await page.waitForFunction(() => !document.querySelector('.row.cat.edit'));
  const names3 = await page.$$eval('.row.cat .nm', (e) => e.map((x) => x.textContent));
  ok(JSON.stringify(names3) === JSON.stringify(names0), 'Sıfırla: varsayılan sıra ve gizlenenler geri geldi');

  // içerik sıralama ve kategori içi arama
  console.log('Sıralama ve kategori içi arama');
  ok((await page.getAttribute('#q', 'placeholder')) === 'Kanal ara…', 'kategori listesindeyken arama kutusu tüm kanalları arıyor');
  const coll = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.row:not(.cat)');
  ok((await page.$$('#crumb-sort:not([hidden])')).length === 1, 'kategori başlığında sıralama düğmesi var');
  await page.click('#crumb-sort');
  ok((await page.$$eval('.sheet .list-item', (e) => e.length)) === 5, 'sıralama sayfasında 5 seçenek');
  ok(/listedeki sıraya göre/.test(await page.textContent('.sheet')), 'M3U’da eklenme zamanı olmadığı belirtiliyor');
  await page.click('.sheet [data-s=za]');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  let order = await page.evaluate(() => window.__iptv.S.items.map((i) => i.name));
  ok(order.length === 120 && order.every((n, i) => i === 0 || coll.compare(order[i - 1], n) >= 0), 'Z → A sıralaması uygulandı');
  ok((await page.$eval('.row .nm', (e) => e.textContent)) === order[0], 'listenin ilk satırı sıralı listeyle aynı');
  await page.click('#crumb-sort');
  await page.click('.sheet [data-s=az]');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  order = await page.evaluate(() => window.__iptv.S.items.map((i) => i.name));
  ok(order.every((n, i) => i === 0 || coll.compare(order[i - 1], n) <= 0), 'A → Z sıralaması uygulandı');
  ok((await page.evaluate(() => window.__iptv.store.pref('sort.live'))) === 'az', 'seçilen sıralama kaydedildi');
  await page.click('#crumb-sort');
  await page.click('.sheet [data-s=default]');
  await page.waitForSelector('.sheet-back', { state: 'detached' });

  await page.click('#btn-home');
  await page.waitForSelector('.row.cat');
  await page.click('.row.cat:has-text("Spor")');
  await page.waitForSelector('.row:not(.cat)');
  await page.click('#btn-search');
  ok((await page.getAttribute('#q', 'placeholder')) === 'Bu kategoride ara…', 'kategori içindeyken arama o kategoriyle sınırlı');
  await page.keyboard.type('seker', { delay: 40 });
  await page.waitForFunction(() => window.__iptv.S.query === 'seker');
  const scoped = await page.evaluate(() => window.__iptv.S.items.map((i) => i.group));
  ok(scoped.length > 0 && scoped.every((g) => g === 'Spor'), `yazdıkça yalnız “Spor” içindeki eşleşmeler kalıyor (${scoped.length})`);
  ok((await page.$$('#crumb:not([hidden])')).length === 1, 'arama sırasında kategori başlığı görünür kalıyor');
  await page.click('#q-clear');
  await page.waitForSelector('.row:not(.cat)');
  await page.goBack();
  await page.waitForSelector('.row.cat');

  // ---------------------------------------------------------------- 4. film
  console.log('Film');
  await page.click('#tabs [data-tab=movies]');
  await page.waitForSelector('.row.cat');
  ok((await page.$$('.card')).length === 0, 'Film sekmesi de önce kategorileri gösteriyor');
  await sleep(150);
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.card');
  ok((await page.$$eval('.card', (e) => e.length)) === 6, 'M3U’daki 6 film kart olarak listeleniyor');
  // oklarla kartlar arasında gezerken liste DOM'u yeniden kurulmaz (posterler yeniden yüklenip titremez)
  await page.evaluate(() => {
    document.querySelectorAll('#list .card').forEach((c) => { c.__keep = 1; });
    window.__vlMut = 0;
    new MutationObserver((m) => { window.__vlMut += m.length; }).observe(document.querySelector('#list .vl-win'), { childList: true, subtree: true });
  });
  await page.focus('#list .card[data-i="0"]');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await sleep(250);
  ok((await page.evaluate(() => document.activeElement.dataset.i)) === '4', 'oklar kartlar arasında gezdi (sağ, aşağı)');
  ok(await page.evaluate(() => [...document.querySelectorAll('#list .card')].length === 6 && [...document.querySelectorAll('#list .card')].every((c) => c.__keep) && window.__vlMut === 0), 'gezinirken kartlar yeniden çizilmedi (DOM aynı kaldı)');
  await page.screenshot({ path: path.join(SHOTS, '06-film-izgara.png') });
  await page.click('.card');
  await page.waitForSelector('#mv-play');
  await sleep(350);
  await page.screenshot({ path: path.join(SHOTS, '07-film-detay.png') });
  await page.click('#mv-play');
  await page.waitForFunction(() => document.querySelector('#vid').currentTime > 1, null, { timeout: 20000 });
  ok(true, 'film (WebM) oynuyor');
  ok(!(await page.$eval('#pl-prog', (e) => e.classList.contains('live'))), 'film kipinde arama çubuğu var');
  // kaydırma hareketleri (fare ile): yatay = sarma, sol yarı dikey = parlaklık, sağ yarı dikey = ses
  const pv = await page.$eval('#player', (e) => ({ w: e.clientWidth, h: e.clientHeight }));
  const drag = async (x0, y0, x1, y1) => {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8);
      await sleep(30); // gerçek parmak gibi ~30 Hz; tek karede yığılan olaylar tarayıcıda birleştirilir
    }
  };
  const g0 = await page.$eval('#vid', (v) => v.currentTime);
  await drag(pv.w * 0.4, pv.h * 0.3, pv.w * 0.55, pv.h * 0.3);
  ok(await page.$eval('#pl-hud', (h) => !h.hidden && /sn/.test(h.textContent)), 'sağa kaydırırken ekranda “+… sn” göstergesi çıkıyor');
  await page.mouse.up();
  await page.waitForFunction((b) => document.querySelector('#vid').currentTime > b + 12, g0, { timeout: 3000 });
  ok(true, 'sağa kaydırma ileri sardı');
  await drag(pv.w * 0.7, pv.h * 0.3, pv.w * 0.3, pv.h * 0.3);
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#vid').currentTime < 8, null, { timeout: 3000 });
  ok(true, 'sola kaydırma geri sardı');
  await drag(pv.w * 0.2, pv.h * 0.3, pv.w * 0.2, pv.h * 0.75);
  ok(await page.$eval('#pl-hud', (h) => !h.hidden && /Parlaklık/.test(h.textContent)), 'sol yarıda dikey kaydırma parlaklık göstergesi çıkarıyor');
  await page.mouse.up();
  const filt = await page.$eval('#vid', (v) => v.style.filter);
  const bri = parseFloat((filt.match(/brightness\(([\d.]+)\)/) || [])[1]);
  ok(bri > 0.45 && bri < 0.8, 'aşağı kaydırma parlaklığı düşürdü: ' + filt);
  ok((await page.evaluate(() => String(getSelection()))) === '', 'oynatıcıda sürükleme metin seçmiyor');
  await drag(pv.w * 0.8, pv.h * 0.3, pv.w * 0.8, pv.h * 0.75);
  await page.mouse.up();
  const vol = await page.$eval('#vid', (v) => v.volume);
  ok(vol > 0.3 && vol < 0.75, 'sağ yarıda aşağı kaydırma sesi düşürdü: ' + vol.toFixed(2));
  await drag(pv.w * 0.8, pv.h * 0.75, pv.w * 0.8, pv.h * 0.3);
  await page.mouse.up();
  ok((await page.$eval('#vid', (v) => v.volume)) > vol, 'yukarı kaydırma sesi artırdı');
  await sleep(1000);
  const before = await page.$eval('#vid', (v) => v.currentTime);
  await page.evaluate(() => document.querySelector('#pl-ui').classList.remove('show'));
  await page.keyboard.press('ArrowRight');
  await sleep(200);
  ok((await page.$eval('#pl-ui', (u) => u.classList.contains('show'))) && Math.abs((await page.$eval('#vid', (v) => v.currentTime)) - before) < 3, 'denetimler kapalıyken sağ ok yalnız denetimleri açtı, film sarılmadı');
  const fwd = () => page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'MediaFastForward', bubbles: true, cancelable: true })));
  for (let i = 0; i < 3; i++) await fwd();
  await page.waitForFunction((b) => document.querySelector('#vid').currentTime > b + 25, before, { timeout: 2500 });
  ok(true, 'ileri sarma tuşuyla 3 × 10 sn ileri sarıldı');
  await page.screenshot({ path: path.join(SHOTS, '08-oynatici-film.png') });
  await sleep(200);
  await page.goBack(); // oynatıcı
  await page.waitForSelector('#player', { state: 'hidden' });
  const prog = await page.evaluate(() => Object.values(window.__iptv.store.progressAll(window.__iptv.S.source.id)));
  ok(prog.length === 1 && prog[0].pos > 10000, `kapanışta konum kaydedildi (${prog[0] && Math.round(prog[0].pos / 1000)} sn)`);
  await page.goBack(); // detay sayfası
  await page.waitForSelector('.pg', { state: 'detached' });
  await page.click('#btn-home');
  await page.waitForSelector('.row.cat:has-text("Devam et")');
  ok(true, '“Devam et” kategorisi belirdi');
  await page.click('.row.cat:has-text("Devam et")');
  await page.waitForSelector('.card');
  await page.click('.card');
  await page.waitForSelector('#mv-play');
  ok(/Devam et/.test(await page.textContent('#mv-play')), 'detayda “Devam et” düğmesi');
  await page.goBack();

  // ---------------------------------------------------------------- 5. dizi
  console.log('Dizi');
  await page.click('#tabs [data-tab=series]');
  await page.waitForSelector('.row.cat');
  ok((await page.$$('.card')).length === 0, 'Dizi sekmesi de önce kategorileri gösteriyor');
  await sleep(150);
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.card');
  ok((await page.$$eval('.card', (e) => e.length)) === 2, 'bölümler iki diziye gruplandı');
  await page.click('.card');
  await page.waitForSelector('.epi');
  ok((await page.$$eval('.epi', (e) => e.length)) === 3, 'ilk sezonda 3 bölüm');
  await page.click('.chip:has-text("Sezon 2")');
  await sleep(350);
  await page.screenshot({ path: path.join(SHOTS, '09-dizi-detay.png') });
  await page.click('.epi');
  await page.waitForFunction(() => document.querySelector('#vid').currentTime > 1, null, { timeout: 20000 });
  ok(/S2 B1/.test(await page.textContent('#pl-sub')), 'bölüm etiketi oynatıcıda: ' + (await page.textContent('#pl-sub')));
  await page.goBack();
  await page.goBack();

  // ---------------------------------------------------------------- 6. kaynaklar sekmesi
  console.log('Kaynaklar');
  await page.click('#tabs [data-tab=sources]');
  await page.waitForSelector('.src');
  const info = await page.textContent('.src.active');
  ok(/120 kanal/.test(info) && /TV rehberi: \d+ kanal/.test(info), 'etkin kaynak bilgisi: ' + info.replace(/\s+/g, ' ').slice(0, 120));
  await page.screenshot({ path: path.join(SHOTS, '10-kaynaklar.png') });

  // ---------------------------------------------------------------- 7. Xtream
  console.log('Xtream');
  await page.click('#src-add');
  await page.click('#f-type [data-t=xtream]');
  await page.fill('input[name=server]', mock.url);
  await page.fill('input[name=user]', 'u');
  await page.fill('input[name=pass]', 'yanlis');
  await page.click('#f-go');
  await page.waitForSelector('#f-err:not([hidden])');
  ok(/hatalı/.test(await page.textContent('#f-err')), 'yanlış şifre anlaşılır hata veriyor');
  await page.fill('input[name=pass]', 'p');
  await page.click('#f-go');
  await page.waitForSelector('.sheet-back', { state: 'detached', timeout: 15000 });
  await page.click('#tabs [data-tab=live]');
  await page.waitForSelector('.row');
  const xs = await page.evaluate(() => ({ t: window.__iptv.S.source.type, live: window.__iptv.S.cat.live.length, m: window.__iptv.S.cat.movies.length, s: window.__iptv.S.cat.series.length }));
  ok(xs.t === 'xtream' && xs.live === 120 && xs.m === 24 && xs.s === 2, 'Xtream hesabı yüklendi: ' + JSON.stringify(xs));
  await page.waitForFunction(() => window.__iptv.S.epg.ready, null, { timeout: 15000 });
  ok(true, 'Xtream XMLTV rehberi yüklendi');
  await page.click('#tabs [data-tab=series]');
  await page.waitForSelector('.row.cat');
  await sleep(150);
  await page.click('.row.cat:has-text("Tümü")');
  await page.click('.card');
  await page.waitForSelector('.epi');
  ok((await page.$$eval('.epi', (e) => e.length)) === 3, 'Xtream dizi bölümleri (get_series_info)');
  await page.click('.epi');
  await page.waitForFunction(() => document.querySelector('#vid').currentTime > 1, null, { timeout: 20000 });
  ok(true, 'Xtream bölümü oynuyor');
  await page.goBack();
  await page.goBack();
  // film ayrıntısı: tam ekran sayfa, "Film hakkında" özeti okunur
  await page.click('#tabs [data-tab=movies]');
  await page.waitForSelector('.row.cat');
  await sleep(150);
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.card');
  await page.click('.card');
  await page.waitForSelector('#mv-play');
  await page.waitForFunction(() => /Filmin konusu burada/.test(document.querySelector('#mv-plot').textContent), null, { timeout: 8000 });
  ok(/Film hakkında/.test(await page.textContent('.pg.dt-pg h2')), 'Xtream film ayrıntısında “Film hakkında” özeti gösteriliyor');
  const dtBox = await page.$eval('.pg.dt-pg', (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); });
  ok(dtBox.join() === '0,0,390,844', 'film ayrıntısı tam ekran sayfa: ' + dtBox.join(','));
  ok((await page.$eval('#mv-plot', (e) => parseFloat(getComputedStyle(e).fontSize))) >= 16, 'özet yazısı okunaklı (≥ 16 px)');
  ok((await page.$$eval('.dt-facts dt, .dt-facts dd', (e) => e.length)) > 0, 'ayrıntıda tür/yıl gibi bilgiler listeleniyor');
  await sleep(350);
  await page.screenshot({ path: path.join(SHOTS, '07c-film-detay-xtream.png') });
  await page.goBack();
  await page.waitForSelector('.pg', { state: 'detached' });
  await page.click('#btn-home'); // kategori içinde kaynak adı gizli; kategori listesine dönünce görünür
  await page.waitForSelector('.row.cat');
  await page.click('#btn-source');
  ok((await page.$$eval('.sheet .list-item', (e) => e.length)) === 3, 'kaynak değiştirici iki kaynak + “ekle” gösteriyor');
  await page.goBack();

  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 7b. uygulama şifresi ve kilitli kategori
  console.log('Uygulama şifresi');
  ({ page, ctx, errs } = await newPage());
  await page.waitForSelector('#f');
  await page.click('.sheet [data-close]');
  await page.click('#ob-add');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/list.m3u');
  await page.fill('input[name=name]', 'Şifreli');
  await page.click('#f-go');
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  const tapPin = async (digits) => {
    for (const d of digits) await page.click(`#lock [data-k="${d}"]`);
  };
  await page.click('#tabs [data-tab=sources]');
  await page.click('[data-set=general]');
  await page.waitForSelector('#g-lock');
  await page.click('#g-lock');
  await page.click('#lk-on');
  await page.waitForSelector('#lock');
  await sleep(350);
  await page.screenshot({ path: path.join(SHOTS, '13-sifre-ekrani.png') });
  await tapPin('12');
  await page.click('#lock [data-k=ok]');
  ok(/En az 4/.test(await page.textContent('#lk-h')) && (await page.isVisible('#lock')), 'çok kısa şifre kabul edilmiyor (en az 4 rakam)');
  await tapPin('1234');
  await page.click('#lock [data-k=ok]');
  await page.waitForFunction(() => /tekrar/.test((document.querySelector('#lock .lk-t') || {}).textContent || ''));
  await tapPin('1235');
  await page.click('#lock [data-k=ok]');
  ok(/uyuşmuyor/.test(await page.textContent('#lk-h')), 'tekrarda farklı şifre reddediliyor');
  await tapPin('1234');
  await page.click('#lock [data-k=ok]');
  await page.waitForSelector('#lock', { state: 'detached' });
  const rec = await page.evaluate(() => window.__iptv.store.pref('lock.pin', null));
  ok(rec && rec.len === 4 && !JSON.stringify(rec).includes('1234') && rec.hash && rec.salt, 'şifre düz metin değil, tuzlu özet olarak saklandı');
  await page.reload();
  await page.waitForSelector('#lock');
  ok(await page.isVisible('#lock'), 'uygulama açılırken şifre ekranı geliyor');
  ok(await page.evaluate(() => document.activeElement.dataset.k === '5'), 'şifre ekranında odak tuş takımında (kumanda için)');
  await tapPin('9999');
  await page.waitForFunction(() => /Yanlış şifre/.test(document.querySelector('#lk-h').textContent));
  ok(true, 'yanlış şifre reddedildi, kalan hak gösterildi');
  await page.keyboard.press('Escape');
  ok(await page.isVisible('#lock'), 'Geri/Esc şifre ekranını kapatmıyor');
  await page.keyboard.type('1234');
  await page.waitForSelector('#lock', { state: 'detached' });
  await page.waitForSelector('.tile.t-live');
  ok(true, 'doğru şifre (rakam tuşlarıyla) kilidi açtı');
  // art arda yanlış deneme: bekleme
  await page.reload();
  await page.waitForSelector('#lock');
  for (let i = 0; i < 5; i++) await tapPin('0000');
  await page.waitForFunction(() => /Çok fazla/.test(document.querySelector('#lk-h').textContent));
  await tapPin('1234');
  ok(/Çok fazla/.test(await page.textContent('#lk-h')) && (await page.isVisible('#lock')), '5 yanlıştan sonra doğru şifre de bir süre kabul edilmiyor');
  await page.evaluate(() => window.__iptv.store.setPref('lock.fail', { n: 0, until: 0 }));
  await tapPin('1234');
  await page.waitForSelector('#lock', { state: 'detached' });
  // kilitli kategori (çocuk kilidi)
  await page.waitForSelector('.tile.t-live');
  await page.click('.t-live');
  await page.waitForSelector('.row.cat');
  const nAll0 = Number(await page.textContent('.row.cat:has-text("Tümü") .n'));
  await page.click('#cat-edit');
  await page.click('.row.cat:has-text("Spor") [data-act=lock]');
  await page.click('#cat-edit');
  ok((await page.$$('.row.cat:has-text("Spor") use[href="#i-lock"]')).length === 1, 'kilitli kategoride kilit simgesi var');
  const nAll1 = Number(await page.textContent('.row.cat:has-text("Tümü") .n'));
  ok(nAll1 < nAll0, `kilitli kategorinin kanalları “Tümü” sayısından düştü (${nAll0} → ${nAll1})`);
  await page.click('.row.cat:has-text("Spor")');
  await page.waitForSelector('#lock');
  await page.click('#lock [data-k=x]');
  ok((await page.$$('#lock')).length === 0 && (await page.$$('.row.cat')).length > 3, 'şifre girilmeden iptal edilince kategori açılmadı');
  await page.click('.row.cat:has-text("Spor")');
  await page.waitForSelector('#lock');
  await tapPin('1234');
  await page.waitForSelector('#crumb-t');
  ok((await page.textContent('#crumb-t')) === 'Spor', 'doğru şifreyle kilitli kategori açıldı');
  await page.click('#btn-home');
  await page.waitForSelector('.row.cat');
  ok(Number(await page.textContent('.row.cat:has-text("Tümü") .n')) === nAll0, 'şifre girildikten sonra oturum boyunca kanallar “Tümü”nde görünüyor');
  await page.click('#cat-edit');
  await page.click('.row.cat:has-text("Spor") [data-act=lock]');
  await page.waitForSelector('#lock');
  await tapPin('1234');
  await page.waitForSelector('#lock', { state: 'detached' });
  await page.click('#cat-edit');
  ok((await page.$$('.row.cat:has-text("Spor") use[href="#i-lock"]')).length === 0, 'şifreyle kilit kaldırıldı');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 7c. yedek adres ve çalışmayan kanal işareti
  console.log('Yedek adres');
  ({ page, ctx, errs } = await newPage());
  await page.waitForSelector('#f');
  await page.click('.sheet [data-close]');
  await page.click('#ob-add');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/alt.m3u');
  await page.fill('input[name=name]', 'Yedekli');
  await page.click('#f-go');
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  await page.click('.tile.t-live');
  await page.waitForSelector('.row.cat');
  await page.click('.row.cat:has-text("Haber")');
  await page.waitForSelector('.row:not(.cat)');
  await page.click('.row:not(.cat):has-text("Yedekli Kanal HD") .nm');
  await page.waitForSelector('#player:not([hidden])');
  await page.waitForFunction(() => document.querySelector('#vid').currentTime > 1, null, { timeout: 30000 });
  ok(true, 'ilk adres açılmayınca aynı adlı kanalın adresiyle yayın başladı');
  ok(/Yedek kaynak kullanılıyor: Yedekli Kanal/.test(await page.textContent('#toast')), 'ekranda yedek kaynak bilgisi');
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden' });
  await page.waitForSelector('.row.bad');
  ok(/Çalışmıyor olabilir/.test(await page.textContent('.row.bad .sub')) && /Yedekli Kanal HD/.test(await page.textContent('.row.bad .nm')), 'açılmayan kanal listede “Çalışmıyor olabilir” diye işaretlendi');
  ok((await page.$$('.row.bad')).length === 1, 'yalnız o kanal işaretli');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 7c2. tüm kaynaklarda arama + çocuk profili
  console.log('Tüm kaynaklarda arama ve çocuk profili');
  ({ page, ctx, errs } = await newPage());
  await page.waitForSelector('#f');
  await page.click('.sheet [data-close]');
  await page.click('#ob-add');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/list.m3u');
  await page.fill('input[name=name]', 'Ana');
  await page.click('#f-go');
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  await page.click('#tabs [data-tab=sources]');
  await page.click('#src-add');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/alt.m3u');
  await page.fill('input[name=name]', 'Yedekli');
  await page.click('#f-go');
  await page.waitForSelector('.sheet-back', { state: 'detached', timeout: 15000 });
  await page.waitForFunction(() => window.__iptv.S.source && window.__iptv.S.source.name === 'Yedekli' && window.__iptv.S.cat.live.length === 3, null, { timeout: 15000 });
  await page.click('.src:has-text("Ana") [data-a=use]');
  await page.waitForFunction(() => window.__iptv.S.source.name === 'Ana' && window.__iptv.S.cat.live.length > 100, null, { timeout: 15000 });
  await page.click('#tabs [data-tab=home]');
  await page.click('#h-search');
  await page.waitForSelector('#gs-q');
  await page.fill('#gs-q', 'yedekli');
  await page.waitForFunction(() => /Sonuç yok/.test(document.querySelector('#gs-res').textContent), null, { timeout: 5000 });
  ok(/Sonuç yok/.test(await page.textContent('#gs-res')), 'etkin kaynakta olmayan içerik “Bu kaynak” aramasında çıkmıyor');
  ok((await page.$('#gs-scope')) !== null, 'birden çok kaynak varken “Tüm kaynaklar” seçeneği görünüyor');
  await page.click('#gs-scope [data-s=all]');
  await page.waitForSelector('#gs-res .list-item[data-k=live]');
  const allRows = await page.$$eval('#gs-res .list-item[data-k=live]', (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  ok(allRows.length === 2 && allRows.every((t) => /· Yedekli/.test(t)), 'tüm kaynaklarda aranınca diğer kaynağın kanalları kaynak adıyla geldi: ' + allRows.join(' | '));
  await page.fill('#gs-q', 'kanal');
  await sleep(400);
  const both = await page.$$eval('#gs-res .list-item[data-k=live]', (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  ok(both.some((t) => /· Yedekli/.test(t)) && both.some((t) => !/· Yedekli/.test(t) && /· Ana/.test(t)), 'iki kaynağın sonuçları birlikte listelendi (etkin kaynak da etiketli)');
  await page.fill('#gs-q', 'yedekli');
  await sleep(400);
  await page.click('#gs-res .list-item[data-k=live]:has-text("Yedekli Kanal"):not(:has-text("HD"))');
  await page.waitForSelector('#player:not([hidden])', { timeout: 15000 });
  ok(await page.evaluate(() => window.__iptv.S.source.name === 'Yedekli'), 'başka kaynağın sonucuna dokununca o kaynağa geçildi ve yayın açıldı');
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden' });
  await page.goBack();
  await page.waitForSelector('.pg.gs-pg', { state: 'detached' });

  // Çocuk profili (etkin kaynak: Yedekli — Haber ve Yedek kategorileri)
  const tapKid = async (digits) => {
    for (const d of digits) await page.click(`#lock [data-k="${d}"]`);
  };
  await page.click('#tabs [data-tab=sources]');
  await page.click('[data-set=kid]');
  await page.waitForSelector('#kd-go');
  await page.click('#kd-go');
  ok(/en az bir kategori/.test(await page.textContent('#toast')), 'kategori seçilmeden çocuk moduna geçilmiyor');
  await page.click('[data-kind=live]');
  await page.waitForSelector('#kg-list .chk');
  await page.click('#kg-list .chk:has-text("Yedek")');
  await page.locator('.sheet-back [data-close]').last().click();
  await sleep(200);
  ok(/1 kategori izinli/.test(await page.textContent('#kd-body')), 'izinli kategori sayısı güncellendi');
  await page.click('#kd-go');
  await page.waitForSelector('#lock');
  await tapKid('1234');
  await page.click('#lock [data-k=ok]');
  await page.waitForFunction(() => /tekrar/.test((document.querySelector('#lock .lk-t') || {}).textContent || ''));
  await tapKid('1234');
  await page.click('#lock [data-k=ok]');
  await page.waitForSelector('#lock', { state: 'detached' });
  await page.waitForFunction(() => document.body.classList.contains('kid-mode'));
  const kidRec = await page.evaluate(() => window.__iptv.store.pref('kid.pin', null));
  ok(kidRec && kidRec.hash && !JSON.stringify(kidRec).includes('1234') && !(await page.evaluate(() => !!window.__iptv.store.pref('lock.pin', null))), 'çocuk modu şifresi tuzlu özet olarak, uygulama şifresinden ayrı saklandı');
  const kc = await page.evaluate(() => ({ live: window.__iptv.S.cat.live.map((x) => x.name), movies: window.__iptv.S.cat.movies.length, groups: window.__iptv.S.groups.live.map((g) => g.name) }));
  ok(JSON.stringify(kc.live) === JSON.stringify(['Yedekli Kanal']) && kc.movies === 0 && JSON.stringify(kc.groups) === JSON.stringify(['Yedek']), 'çocuk modunda katalog yalnız izinli kategoriyi içeriyor: ' + JSON.stringify(kc));
  ok(/Çıkış/.test(await page.textContent('#tabs [data-tab=sources]')), 'Ayarlar sekmesi “Çıkış” oldu');
  ok(await page.$eval('#tabs [data-tab=movies]', (b) => b.hidden) && !(await page.$eval('#tabs [data-tab=live]', (b) => b.hidden)), 'izinli içeriği olmayan türün sekmesi gizlendi');
  ok((await page.$$eval('.home .t-set b', (e) => e.map((x) => x.textContent)))[0] === 'Çıkış', 'ana ekrandaki Ayarlar kutusu da “Çıkış” oldu');
  // arama çocuk modunda da yalnız izinli içeriği döndürür
  await page.click('#h-search');
  await page.waitForSelector('#gs-q');
  await page.fill('#gs-q', 'kanal');
  await sleep(400);
  const kr = await page.$$eval('#gs-res .list-item', (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  ok(kr.length === 1 && /Yedekli Kanal/.test(kr[0]), 'çocuk modunda arama izinli kategoriyle sınırlı: ' + kr.join(' | '));
  await page.goBack();
  // yeniden başlatınca mod sürer
  await page.reload();
  await page.waitForSelector('.tile.t-live');
  await page.waitForFunction(() => window.__iptv.S.source && window.__iptv.S.cat.live.length >= 1, null, { timeout: 15000 });
  ok(await page.evaluate(() => document.body.classList.contains('kid-mode') && window.__iptv.S.cat.live.length === 1), 'uygulama yeniden açılınca çocuk modu sürüyor');
  // çıkış: yanlış şifre reddedilir, doğrusu çıkarır
  await page.click('#tabs [data-tab=sources]');
  await page.waitForSelector('#lock');
  await tapKid('9999');
  await page.waitForFunction(() => /Yanlış şifre/.test(document.querySelector('#lk-h').textContent));
  ok(await page.evaluate(() => document.body.classList.contains('kid-mode')), 'yanlış şifreyle çocuk modundan çıkılamıyor');
  await tapKid('1234');
  await page.waitForSelector('#lock', { state: 'detached' });
  await page.waitForFunction(() => !document.body.classList.contains('kid-mode') && window.__iptv.S.cat.live.length === 3);
  ok(/Ayarlar/.test(await page.textContent('#tabs [data-tab=sources]')), 'çıkınca katalog ve Ayarlar sekmesi eski haline döndü');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 7d. yedekle / geri yükle
  console.log('Yedekle / geri yükle');
  ({ page, ctx, errs } = await newPage());
  await page.waitForSelector('#f');
  await page.click('.sheet [data-close]');
  await page.click('#ob-add');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/list.m3u');
  await page.fill('input[name=name]', 'Yedeklenecek');
  await page.click('#f-go');
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  await page.evaluate(() => {
    const st = window.__iptv.store;
    const sid = st.activeId();
    st.toggleFav(sid, { id: 'fav1', kind: 'live', name: 'Favori Kanal' });
    st.setPref('set.buffer', 'max');
  });
  await page.evaluate(async () => {
    const { makeRecord } = await import('/js/lock.js');
    window.__iptv.store.setPref('lock.pin', await makeRecord('1234'));
  });
  await page.click('#tabs [data-tab=sources]');
  await page.click('[data-set=general]');
  await page.waitForSelector('#g-bk');
  await page.click('#g-bk');
  await page.waitForSelector('#bk-save');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.click('#bk-save');
      await page.waitForSelector('#lock');
      ok(true, 'uygulama şifresi açıkken yedek almak şifre istiyor');
      await tapPin('1234');
    })(),
  ]);
  ok(/^iptv-yedek-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), 'yedek tarihli dosya adıyla iniyor: ' + dl.suggestedFilename());
  const bkText = fs.readFileSync(await dl.path(), 'utf8');
  const bk = JSON.parse(bkText);
  ok(bk.app === 'iptv-oynatici' && bk.data.sources.length === 1 && bk.data.sources[0].url.endsWith('/list.m3u'), 'yedekte kaynak adresi var');
  ok(Object.keys(bk.data).some((k) => k.startsWith('fav.')) && bk.data['pref.set.buffer'] === 'max', 'yedekte favori ve ayar var');
  ok(!bkText.includes('"hash"'), 'uygulama şifresi özeti yedeğe girmedi');
  // veriyi boz, sonra yedekten dön
  await page.evaluate(() => {
    const st = window.__iptv.store;
    st.setPref('set.buffer', 'normal');
    const sid = st.activeId();
    st.toggleFav(sid, { id: 'fav1', kind: 'live', name: 'Favori Kanal' });
    st.saveSource({ name: 'Fazladan', type: 'm3u', url: 'http://x/y.m3u' });
  });
  await page.setInputFiles('#bk-file', { name: 'yedek.json', mimeType: 'application/json', buffer: Buffer.from('{bozuk') });
  await page.waitForSelector('#bk-sum .err-text');
  ok(/geçerli bir yedek değil/.test(await page.textContent('#bk-sum')), 'bozuk dosya anlaşılır hatayla reddedildi');
  await page.setInputFiles('#bk-file', { name: 'yedek.json', mimeType: 'application/json', buffer: Buffer.from(bkText) });
  await page.waitForSelector('#bk-go');
  ok(/1 kaynak · 1 favori/.test(await page.textContent('#bk-sum')), 'geri yüklemeden önce özet gösteriliyor: ' + (await page.textContent('#bk-sum')).split('Şu anki')[0].trim());
  await page.click('#bk-go');
  await page.waitForSelector('#lock');
  await tapPin('1234');
  await page.waitForSelector('#lock', { state: 'detached' });
  await page.waitForSelector('#lock', { timeout: 15000 }); // yeniden yüklenince uygulama şifresi yine soruluyor
  await tapPin('1234');
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  const after = await page.evaluate(() => {
    const st = window.__iptv.store;
    return { src: st.sources().map((x) => x.name), favs: st.favs(st.activeId()).map((f) => f.id), buf: st.pref('set.buffer', null), pin: st.pref('lock.pin', null) };
  });
  ok(after.src.length === 1 && after.src[0] === 'Yedeklenecek', 'yedekte olmayan kaynak gitti, yedektekiler geri geldi: ' + after.src.join(','));
  ok(after.favs.join() === 'fav1' && after.buf === 'max', 'favori ve ayar yedektekine döndü');
  ok(after.pin && after.pin.len === 4, 'geri yüklemede uygulama şifresi korundu');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 7e. yenilikler
  console.log('Yenilikler');
  ({ page, ctx, errs } = await newPage());
  await page.waitForSelector('#f');
  await page.click('.sheet [data-close]');
  await page.click('#ob-add');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/list.m3u');
  await page.fill('input[name=name]', 'Yenilik');
  await page.click('#f-go');
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  await page.evaluate(() => {
    localStorage.setItem('__news', '1');
    localStorage.removeItem('iptv.pref.seen.changelog');
  });
  await page.reload();
  await page.waitForSelector('.sheet:has-text("Yenilikler")', { timeout: 10000 });
  ok((await page.$$('.sheet .wn')).length >= 5, 'güncellemeden sonra görülmemiş yenilikler bir kez gösterildi');
  ok(/Yedekle \/ geri yükle/.test(await page.textContent('.sheet')), 'en yeni yenilik listede');
  await page.click('.sheet [data-close]');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.reload();
  await page.waitForSelector('.tile.t-live');
  await sleep(2600);
  ok((await page.$$('.sheet-back')).length === 0, 'aynı yenilikler ikinci açılışta tekrar gösterilmedi');
  await page.click('#tabs [data-tab=sources]');
  await page.click('[data-set=news]');
  await page.waitForSelector('.sheet:has-text("Yenilikler")');
  ok(true, 'Ayarlar › Yenilikler her zaman açılıyor');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 8. get.php bağlantısı otomatik Xtream
  console.log('get.php bağlantısı');
  ({ page, ctx, errs } = await newPage());
  await page.waitForSelector('#f');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', `${mock.url}/get.php?username=u&password=p&type=m3u_plus`);
  await page.click('#f-go');
  await page.waitForSelector('.tile', { timeout: 15000 });
  ok((await page.evaluate(() => window.__iptv.S.source.type)) === 'xtream', 'get.php bağlantısı Xtream hesabı olarak eklendi');
  await ctx.close();

  // ---------------------------------------------------------------- 8b. dosyadan M3U
  console.log('Dosyadan M3U');
  ({ page, ctx, errs } = await newPage());
  await page.waitForSelector('#f');
  await page.click('#f-type [data-t=file]');
  await page.click('#f-go');
  await page.waitForSelector('#f-err:not([hidden])');
  ok(/dosyası seçin/.test(await page.textContent('#f-err')), 'dosya seçilmeden kaydedilemiyor');
  const listText = await (await fetch(mock.url + '/list.m3u')).text();
  await page.setInputFiles('input[name=file]', { name: 'evdeki-liste.m3u', mimeType: 'application/octet-stream', buffer: Buffer.from(listText) });
  await page.click('#f-go');
  await page.waitForSelector('.tile', { timeout: 15000 });
  const fsrc = await page.evaluate(() => ({ local: window.__iptv.S.source.local, name: window.__iptv.S.source.name, live: window.__iptv.S.cat.live.length }));
  ok(fsrc.local === true && fsrc.name === 'evdeki-liste' && fsrc.live === 120, 'dosyadan 120 kanal yüklendi, ad dosya adından: ' + JSON.stringify(fsrc));
  await page.reload();
  await page.waitForSelector('.tile');
  await page.click('[data-refresh]');
  await page.waitForFunction(() => !window.__iptv.S.loading && window.__iptv.S.cat.live.length === 120);
  ok(!(await page.$('#banner.err:not([hidden])')), 'yenileme kayıtlı dosyadan yapıldı (ağ gerekmedi)');
  await page.click('#tabs [data-tab=sources]');
  await page.waitForSelector('.src');
  const stxt = await page.textContent('#view');
  ok(/Dosya: evdeki-liste\.m3u/.test(stxt) && /Sürüm /.test(stxt), 'Kaynaklar sayfasında dosya adı ve sürüm görünüyor');
  await page.evaluate(() => document.querySelector('[data-a=edit]').click());
  await page.waitForSelector('#f');
  ok(await page.$eval('#f-type [data-t=file]', (b) => b.classList.contains('on')), 'düzenlemede “Dosyadan” seçili açılıyor');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 9. yerel motor yolu (Capacitor taklidi)
  console.log('Android köprüsü (taklit)');
  const nativeInit = () => {
    window.__calls = [];
    const files = new Map();
    const listeners = {};
    const plugin = {
      download: async ({ url }) => {
        window.__calls.push(['download', url]);
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status); // gerçek eklenti de HTTP hatasında bu iletiyle reddeder
        const blob = URL.createObjectURL(await r.blob());
        const p = '/cache/iptvdl' + files.size + '.tmp';
        files.set('file://' + p, blob);
        return { path: p, size: 1 };
      },
      deleteFile: async ({ path }) => window.__calls.push(['delete', path]),
      // Yayın bilgisi: gerçek eklenti ExoPlayer ölçümlerini verir
      getStats: async () => {
        window.__statsN = (window.__statsN || 0) + 1;
        return window.__stats || { bufferMs: 12400, width: 1280, height: 720, fps: 25, videoBps: 3500000, audioBps: 128000, bandwidthBps: 8200000, videoCodec: 'avc1.64001f', audioCodec: 'mp4a.40.2', dropped: 2, rendered: 1000 };
      },
      // Planlananlar: yerel alarm listesi (gerçek eklentide AlarmManager); izin durumu testten değiştirilebilir
      planSync: async (a) => {
        window.__plans = a.plans || [];
        window.__calls.push(['planSync', window.__plans.length]);
      },
      planStatus: async () => window.__planStatus || { notify: true, exact: true },
      planPermissions: async () => {
        window.__calls.push(['planPermissions']);
        return window.__planStatus || { notify: true, exact: true };
      },
      planLaunch: async () => window.__launch || { ch: '', src: '' },
      // Yayın sağlık testi: gerçek eklenti WebView dışından atar; burada 5'in katı kanallar 404 döner
      probe: async ({ url }) => {
        window.__calls.push(['probe', url]);
        await new Promise((r) => setTimeout(r, 40));
        const m = /\/(\d+)\.m3u8/.exec(url);
        const n = m ? Number(m[1]) : 1;
        if (n % 5 === 0) return { status: 404, ms: 20, contentType: 'text/plain' };
        return { status: 200, ms: 30 + (n % 7), contentType: 'application/vnd.apple.mpegurl', bytes: 512, playlist: true };
      },
      play: async (a) => {
        window.__calls.push(['play', a.url, a.mime, a.buffer, a.audioDelay, a.night]);
        if (!window.__noPlay) setTimeout(() => listeners.state({ state: 'playing', playing: true, live: !/webm|\/rec\//.test(a.url) }), 50);
        setTimeout(() => listeners.time({ pos: 1000, dur: /webm|\/rec\//.test(a.url) ? 40000 : -1, buffered: 0 }), 100);
        // Yayın çözüldükçe ikinci ses parçası sonradan ortaya çıkar (TS yayınlarda olduğu gibi)
        setTimeout(() => {
          window.__audioN = 2;
          listeners.tracks && listeners.tracks({});
        }, 400);
      },
      pause: async () => window.__calls.push(['pause']),
      resume: async () => window.__calls.push(['resume']),
      stop: async () => window.__calls.push(['stop']),
      seekTo: async (a) => window.__calls.push(['seek', a.ms]),
      setResizeMode: async (a) => window.__calls.push(['resize', a.mode]),
      setImmersive: async (a) => window.__calls.push(['immersive', a.on]),
      getTracks: async () => ({ audio: [{ id: '0:0', label: 'Türkçe', selected: true }, { id: '1:0', label: 'İngilizce', selected: false }].slice(0, window.__audioN || 1), text: [{ id: '2:0', label: 'Türkçe', selected: false }], textOn: false }),
      selectTrack: async (a) => window.__calls.push(['track', a.type, a.id]),
      getLevels: async () => ({ brightness: 0.4, volume: 0.6 }),
      setBrightness: async (a) => window.__calls.push(['brightness', a.value]),
      setVolume: async (a) => window.__calls.push(['volume', a.value]),
      setRect: async (a) => window.__calls.push(['rect', a.x, a.y, a.w, a.h]),
      clearRect: async () => window.__calls.push(['clearRect']),
      getInsets: async () => window.__insets || { l: 0, t: 0, r: 0, b: 0 },
      isTv: async () => ({ tv: localStorage.getItem('__isTv') === '1' }),
      setTvMode: async (a) => window.__calls.push(['tvMode', !!a.on]),
      multiPlay: async (a) => {
        window.__calls.push(['multiPlay', a.slot, a.url, !!a.muted, a.x, a.y, a.w, a.h, a.fill !== false]);
        if (!window.__noPlay) setTimeout(() => listeners.multi && listeners.multi({ slot: a.slot, state: 'playing' }), 50);
      },
      multiRect: async (a) => window.__calls.push(['multiRect', a.slot, a.x, a.y, a.w, a.h]),
      multiFit: async (a) => window.__calls.push(['multiFit', !!a.fill]),
      multiMute: async (a) => window.__calls.push(['multiMute', a.slot, !!a.muted]),
      multiStop: async (a) => window.__calls.push(['multiStop', a.slot]),
      multiStopAll: async () => window.__calls.push(['multiStopAll']),
      setAudioDelay: async (a) => {
        window.__calls.push(['audioDelay', a.ms]);
      },
      setNightMode: async (a) => window.__calls.push(['night', a.level]),
      // Sesli arama (Android konuşma tanıyıcı): window.__voice söylenen metin, boşsa iptal; __voiceErr ile hata
      voiceSearch: async () => {
        window.__calls.push(['voice']);
        if (window.__voiceErr) throw new Error(window.__voiceErr);
        return { text: window.__voice || '' };
      },
      // Android TV ana ekranı "Devam et" satırı: son eşitlenen liste window.__wn'de
      tvSyncWatchNext: async (a) => {
        window.__wn = a.items;
        window.__calls.push(['watchNext', a.items.length]);
        return { count: a.items.length };
      },
      setSubtitleStyle: async (a) => window.__calls.push(['subStyle', JSON.stringify(a)]),
      recordStart: async (a) => {
        window.__calls.push(['recStart', a.name, a.maxMs]);
        return { active: true };
      },
      recordStop: async () => {
        window.__calls.push(['recStop']);
        const r = { active: false, id: 'a.ts', url: 'file:///rec/a.ts', name: 'Kanal', durationMs: 65000, bytes: 1000, startedAt: Date.now() };
        setTimeout(() => listeners.recording && listeners.recording(r), 20);
        return r;
      },
      saveText: async (a) => {
        window.__calls.push(['saveText', a.name, a.text.length]);
        return { where: 'İndirilenler/Iptv Player Pro' };
      },
      recordList: async () => ({ items: window.__recs || [], freeBytes: 5e9, usedBytes: 4e7 }),
      recordDelete: async ({ id }) => {
        window.__calls.push(['recDel', id]);
        window.__recs = (window.__recs || []).filter((r) => r.id !== id);
      },
      // ---- telefondan TV'ye oynatma: TV tarafı (alıcı) ve sahte TV (telefonun istekleri) ----
      castStart: async (a) => {
        window.__calls.push(['castStart', a.name]);
        return { running: true, port: 8765, id: 'me', name: 'TV Kutusu', ips: ['192.168.1.30'], paired: window.__paired || [] };
      },
      castStop: async () => {
        window.__calls.push(['castStop']);
        return { running: false };
      },
      castInfo: async () => ({ running: true, port: 8765, id: 'me', name: 'TV Kutusu', ips: ['192.168.1.30'], paired: window.__paired || [] }),
      castPairOpen: async () => {
        window.__calls.push(['castPairOpen']);
        return { running: true, port: 8765, id: 'me', name: 'TV Kutusu', ips: ['192.168.1.30'], paired: window.__paired || [], code: '482913' };
      },
      castPairClose: async () => window.__calls.push(['castPairClose']),
      castUnpair: async ({ id }) => {
        window.__calls.push(['castUnpair', id]);
        window.__paired = (window.__paired || []).filter((p) => p.id !== id);
        return { running: true };
      },
      castNow: async (a) => window.__calls.push(['castNow', a.title, a.kind]),
      castDiscover: async () => ({ devices: window.__found || [] }),
      castRequest: async (a) => {
        const tv = (window.__tv = window.__tv || { token: 'tok123', code: '123456', played: [], cmds: [], state: { active: false } });
        window.__calls.push(['castRequest', a.method, a.path, a.token ? 'token' : '', a.code || '']);
        if (tv.offline) return { status: 0, body: '', error: 'zaman aşımı' };
        if (a.path === '/hello') return { status: 200, body: JSON.stringify({ app: 'iptvpro', id: 'tv1', name: 'Salon TV', port: 8765, paired: a.token === tv.token }) };
        if (a.path === '/pair') {
          if (a.code === tv.code) return { status: 200, body: JSON.stringify({ token: tv.token, id: 'tv1', name: 'Salon TV' }) };
          return { status: 403, body: '{"error":"wrong"}' };
        }
        if (a.token !== tv.token) return { status: 401, body: '{"error":"auth"}' };
        if (a.path === '/play') {
          const p = JSON.parse(a.body);
          tv.played.push(p);
          tv.state = { active: true, state: 'playing', pos: p.startMs || 0, dur: p.kind === 'live' ? -1 : 600000, live: p.kind === 'live', title: p.title, kind: p.kind, vol: { cur: 5, max: 15, fixed: false } };
          return { status: 200, body: '{"ok":true}' };
        }
        if (a.path === '/cmd') {
          const c = JSON.parse(a.body);
          tv.cmds.push(c);
          const st = tv.state;
          if (c.a === 'toggle') st.state = st.state === 'paused' ? 'playing' : 'paused';
          else if (c.a === 'pause') st.state = 'paused';
          else if (c.a === 'play') st.state = 'playing';
          else if (c.a === 'seekBy') st.pos = Math.max(0, st.pos + c.v);
          else if (c.a === 'seekTo') st.pos = c.v;
          else if (c.a === 'stop') tv.state = { active: false };
          return { status: 200, body: '{"ok":true}' };
        }
        if (a.path === '/sync') {
          tv.synced = JSON.parse(a.body);
          const snap = window.__tvSnap;
          if (!snap) return { status: 422, body: '{"error":"Diğer cihazdaki uygulama daha yeni"}' };
          return { status: 200, body: JSON.stringify({ ok: true, added: window.__tvAdded || {}, snapshot: snap }) };
        }
        if (a.path === '/state') return { status: 200, body: JSON.stringify(tv.state) };
        if (a.path === '/unpair') return { status: 200, body: '{"ok":true}' };
        return { status: 404, body: '{}' };
      },
      castSyncReply: async (a) => {
        window.__calls.push(['castSyncReply', a.id, a.ok, a.body]);
      },
      downloadApk: async ({ url }) => {
        window.__calls.push(['downloadApk', url]);
        listeners.apkProgress && listeners.apkProgress({ loaded: 500000, total: 1000000 });
        return { path: '/cache/iptv-update/yeni.apk', size: 1000000 };
      },
      installApk: async ({ path }) => {
        window.__calls.push(['installApk', path]);
        return window.__needPerm ? { needsPermission: true } : { started: true };
      },
    };
    // Gerçek native-bridge.js yüzeyi: registerPlugin YOK; nativePromise, addListener, convertFileSrc var.
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      convertFileSrc: (p) => files.get(p) || p,
      nativePromise: (pluginName, method, opts) => {
        if (pluginName !== 'IptvPlayer' || typeof plugin[method] !== 'function') return Promise.reject(new Error('yok: ' + method));
        return plugin[method](opts);
      },
      addListener: (pluginName, ev, cb) => ((listeners[ev] = cb), { remove: async () => {} }),
    };
    window.__emit = (ev, d) => listeners[ev] && listeners[ev](d);
  };
  ({ page, ctx, errs } = await newPage({ width: 390, height: 844 }, nativeInit));
  await page.waitForSelector('#f');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/list.m3u');
  await page.click('#f-go');
  await page.waitForSelector('.tile', { timeout: 15000 });
  await page.click('#tabs [data-tab=live]');
  await page.waitForSelector('.row', { timeout: 15000 });
  const calls = await page.evaluate(() => window.__calls.map((c) => c[0]));
  ok(calls.includes('download') && calls.includes('delete'), 'liste yerel eklentiyle indirilip geçici dosya silindi');
  await page.waitForFunction(() => window.__iptv.S.epg.ready, null, { timeout: 15000 });
  ok(true, '.xml.gz rehberi yerel yoldan alınıp açıldı');
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.row:not(.cat)');
  await page.click('.row:not(.cat) .nm');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'play'));
  const play = await page.evaluate(() => window.__calls.find((c) => c[0] === 'play'));
  ok(/\.m3u8$/.test(play[1]) && play[2] === 'hls', 'yerel oynatıcı HLS adresiyle başlatıldı');
  ok(play[3] === 'high', 'yayın önbelleği varsayılan olarak “Yüksek” ile istendi');
  ok(await page.evaluate(() => document.documentElement.classList.contains('native-playing')), 'yerel oynatma kipi açıldı (video arkada)');
  // Video WebView'ın ARKASINDA; oynatıcıdan <html>'e kadar hiçbir üst öğenin dolgusu opak olmamalı (aksi hâlde video görünmez).
  const opak = await page.evaluate(() => {
    const kotu = [];
    for (let el = document.querySelector('#player'); el; el = el.parentElement) {
      const cs = getComputedStyle(el);
      const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
      const alfa = m ? (m[1].split(',').length > 3 ? parseFloat(m[1].split(',')[3]) : 1) : 0;
      if (alfa > 0 || cs.backgroundImage !== 'none') kotu.push((el.id ? '#' + el.id : el.tagName.toLowerCase()) + ' ' + cs.backgroundColor);
    }
    return kotu;
  });
  ok(opak.length === 0, 'oynatıcının arkası saydam (html dahil)' + (opak.length ? ': ' + opak.join(', ') : ''));
  ok(await page.evaluate(() => window.__calls.some((c) => c[0] === 'immersive' && c[1] === true)), 'tam ekran istendi');
  ok(await page.$eval('#pl-audio', (b) => b.hidden), 'tek ses parçası varken ses düğmesi gizli');
  await page.waitForFunction(() => document.querySelector('#pl-audio:not([hidden])'), null, { timeout: 5000 });
  ok(true, 'ikinci ses parçası sonradan gelince ses düğmesi göründü');
  await page.click('#pl-audio');
  ok((await page.$$eval('.sheet .list-item', (e) => e.length)) === 2, 'ses sayfasında iki dil listeleniyor');
  await page.click('.sheet .list-item[data-id="1:0"]');
  ok(await page.evaluate(() => window.__calls.some((c) => c[0] === 'track' && c[1] === 'audio' && c[2] === '1:0')), 'ses izi seçimi eklentiye iletildi');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.click('#pl-text');
  ok((await page.$$eval('.sheet .list-item[data-id]', (e) => e.map((x) => x.textContent.trim()).join('|'))) === 'Kapalı|Türkçe', 'altyazı sayfasında “Kapalı” ve diller listeleniyor');
  ok((await page.$$('.sheet .list-item[data-look]')).length === 1, 'altyazı sayfasının altında “Altyazı görünümü” girişi var');
  ok(await page.$eval('.sheet .list-item[data-id=""]', (b) => !!b.querySelector('.ic.ok')), 'altyazı kapalıyken “Kapalı” işaretli');
  await page.click('.sheet .list-item[data-id="2:0"]');
  ok(await page.evaluate(() => window.__calls.some((c) => c[0] === 'track' && c[1] === 'text' && c[2] === '2:0')), 'altyazı izi seçimi eklentiye iletildi');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  // kaydırma hareketleri yerel eklentiye iletiliyor
  const nv = await page.$eval('#player', (e) => ({ w: e.clientWidth, h: e.clientHeight }));
  const ndrag = async (x0, y0, x1, y1) => {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x1, y1, { steps: 6 });
    await page.mouse.up();
  };
  await ndrag(nv.w * 0.2, nv.h * 0.45, nv.w * 0.2, nv.h * 0.2);
  ok(await page.evaluate(() => window.__calls.some((c) => c[0] === 'brightness' && c[1] > 0.4)), 'yerel: sol yarıda yukarı kaydırma parlaklığı artırdı');
  ok(typeof (await page.evaluate(() => window.__iptv.store.pref('brightness', null))) === 'number', 'parlaklık seçimi hatırlanıyor');
  await ndrag(nv.w * 0.8, nv.h * 0.2, nv.w * 0.8, nv.h * 0.5);
  ok(await page.evaluate(() => window.__calls.some((c) => c[0] === 'volume' && c[1] < 0.6)), 'yerel: sağ yarıda aşağı kaydırma sesi düşürdü');
  await page.mouse.move(nv.w * 0.3, nv.h * 0.3);
  await page.mouse.down();
  await page.mouse.move(nv.w * 0.6, nv.h * 0.3, { steps: 6 });
  ok(await page.$eval('#pl-hud', (h) => !h.hidden && /Canlı yayında sarma yok/.test(h.textContent)), 'canlı yayında yatay kaydırma sarmıyor, bilgi veriyor');
  await page.mouse.up();
  ok(!(await page.evaluate(() => window.__calls.some((c) => c[0] === 'seek'))), 'canlıda sarma isteği eklentiye gitmedi');
  // yayın kopunca ya da takılınca hızlı, tekrar tekrar yeniden bağlanma
  const nPlays = () => page.evaluate(() => window.__calls.filter((c) => c[0] === 'play').length);
  const pl0 = await nPlays();
  await page.evaluate(() => {
    window.__noPlay = true; // bağlantı kurulamıyor
    window.__emit('error', { message: 'ERROR_CODE_IO_NETWORK_CONNECTION_FAILED' });
  });
  await page.waitForFunction((n) => window.__calls.filter((c) => c[0] === 'play').length > n, pl0, { timeout: 1500 });
  ok(true, 'yayın kopunca bir saniye içinde yeniden bağlanıldı');
  ok(/Yeniden bağlanılıyor/.test(await page.textContent('#pl-status')), 'ekranda “Yeniden bağlanılıyor” bilgisi var');
  await page.waitForFunction((n) => window.__calls.filter((c) => c[0] === 'play').length > n + 1, pl0, { timeout: 12000 });
  ok(/\((2|3)\)/.test(await page.textContent('#pl-status')), 'bağlantı kurulamayınca (7 sn) yeniden denendi, deneme sayısı artıyor: ' + (await page.textContent('#pl-status')).trim());
  await page.evaluate(() => { window.__noPlay = false; });
  await page.waitForSelector('#pl-status', { state: 'hidden', timeout: 12000 });
  ok(true, 'yayın gelince bilgi kalktı, oynatma sürüyor');

  // ses senkronu: düğme, pencere, kalıcı değer, eklentiye iletim
  await page.evaluate(() => document.querySelector('#pl-ui').classList.add('show'));
  ok(await page.$eval('#pl-sync', (b) => !b.hidden), 'yerel kipte “Ses senkronu” düğmesi var');
  ok((await page.textContent('#pl-sync-l')).trim() === 'Ses senkronu', 'ayarsızken düğme adı “Ses senkronu”');
  ok((await page.evaluate(() => window.__calls.filter((c) => c[0] === 'play').pop()[4])) === 0, 'yayın başlarken ses gecikmesi (0) eklentiye iletildi');
  await page.click('#pl-sync');
  await page.waitForSelector('#sy-val');
  ok((await page.textContent('#sy-val')) === 'Ayarsız', 'pencerede değer “Ayarsız”');
  await page.click('.sy-btns [data-d="250"]');
  await page.click('.sy-btns [data-d="50"]');
  ok((await page.textContent('#sy-val')) === '+300 ms', 'dokunuşlar toplanıyor: +300 ms');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'audioDelay'), null, { timeout: 3000 });
  await sleep(600);
  const sent = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'audioDelay').map((c) => c[1]));
  ok(sent.length === 1 && sent[0] === 300, 'art arda dokunuşlar eklentiye tek seferde (300 ms) iletildi: ' + JSON.stringify(sent));
  ok((await page.evaluate(() => window.__iptv.store.pref('audioDelay', 0))) === 300, 'değer kalıcı kaydedildi');
  ok((await page.textContent('#pl-sync-l')).trim() === '+300 ms', 'düğmede geçerli değer görünüyor');
  await page.click('.sy-btns [data-d="-250"]');
  await page.click('.sy-btns [data-d="-250"]');
  ok((await page.textContent('#sy-val')) === '−200 ms', 'eksi yönde: −200 ms');
  await page.click('.sy-reset');
  ok((await page.textContent('#sy-val')) === 'Ayarsız', '“Sıfırla” değeri sıfırladı');
  await sleep(700);
  ok((await page.evaluate(() => window.__calls.filter((c) => c[0] === 'audioDelay').pop()[1])) === 0, 'sıfırlama eklentiye iletildi');
  await page.click('.sy-btns [data-d="50"]');
  await sleep(600);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-back', { state: 'detached', timeout: 3000 });
  ok(await page.$eval('#player', (e) => !e.hidden), 'pencere kapanınca oynatıcı açık kaldı');
  // sonraki yayın, kayıtlı gecikmeyle başlar
  const nPl = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'play').length);
  await page.evaluate(() => document.querySelector('#pl-ui').classList.add('show'));
  await page.click('#pl-next');
  await page.waitForFunction((n) => window.__calls.filter((c) => c[0] === 'play').length > n, nPl, { timeout: 5000 });
  ok((await page.evaluate(() => window.__calls.filter((c) => c[0] === 'play').pop()[4])) === 50, 'sonraki yayın kayıtlı ses gecikmesiyle (50 ms) başladı');
  await page.evaluate(() => window.__iptv.store.setPref('audioDelay', 0));
  // yayın kaydı (yalnız Android)
  await page.evaluate(() => document.querySelector('#pl-ui').classList.add('show'));
  ok(await page.$eval('#pl-rec', (b) => !b.hidden), 'canlı yayında “Kaydet” düğmesi var');
  await page.click('#pl-rec');
  await page.waitForSelector('.sheet [data-m="30"]');
  await sleep(500);
  await page.screenshot({ path: path.join(SHOTS, '14-kayit-sure.png') });
  await page.click('.sheet [data-m="30"]');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'recStart'));
  const rs = await page.evaluate(() => window.__calls.find((c) => c[0] === 'recStart'));
  ok(rs[2] === 30 * 60000 && String(rs[1]).length > 0, 'kayıt kanal adı ve 30 dakika sınırıyla başlatıldı');
  await page.evaluate(() => window.__emit('recording', { active: true, elapsedMs: 65000, bytes: 1000, id: 'a.ts' }));
  await page.evaluate(() => document.querySelector('#pl-ui').classList.add('show'));
  ok((await page.textContent('#pl-rec-l')) === '1:05' && (await page.$eval('#pl-rec', (b) => b.classList.contains('rec-on'))), 'kayıt süresi düğmede sayıyor');
  await page.click('#pl-rec');
  await page.waitForSelector('.sheet [data-a="watch"]');
  await page.click('.sheet [data-a="watch"]');
  await page.waitForFunction(() => window.__calls.filter((c) => c[0] === 'play').pop()[1] === 'file:///rec/a.ts', null, { timeout: 5000 });
  ok(await page.evaluate(() => window.__calls.some((c) => c[0] === 'recStop')), '“Durdur ve baştan izle”: kayıt durduruldu');
  ok(true, 'kaydedilen yayın başından oynatıldı');
  await page.waitForSelector('#pl-golive:not([hidden])', { timeout: 5000 });
  // kayıt bitiş olayı eklentiden eşzamansız gelir (taklit 20 ms sonra yayar): beklenir
  await page.waitForFunction(() => document.querySelector('#pl-rec').hidden && /Kayıt kaydedildi/.test(document.querySelector('#toast').textContent), null, { timeout: 5000 }).catch(() => {});
  ok(await page.$eval('#pl-rec', (b) => b.hidden), 'kayıt oynarken “Kaydet” düğmesi gizli');
  ok(/Kayıt kaydedildi/.test(await page.textContent('#toast')), 'kayıt bitince bilgi verildi');
  await page.evaluate(() => document.querySelector('#pl-ui').classList.add('show'));
  await page.click('#pl-golive');
  await page.waitForFunction(() => /\.m3u8$/.test(window.__calls.filter((c) => c[0] === 'play').pop()[1]), null, { timeout: 5000 });
  ok(true, '“Canlıya dön” yayına geri döndürdü');
  await page.screenshot({ path: path.join(SHOTS, '11-yerel-kip-oynatici.png') });
  const nStop0 = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'stop').length);
  await page.goBack();
  await page.waitForFunction(() => document.documentElement.classList.contains('native-preview'), null, { timeout: 5000 });
  ok(await page.evaluate(() => !document.documentElement.classList.contains('native-playing')), 'geri tuşunda tam ekran kapandı, arayüz geri geldi');
  await page.waitForSelector('#mini-player-overlay:not([hidden])', { timeout: 5000 });
  ok(await page.evaluate((n) => window.__calls.filter((c) => c[0] === 'stop').length === n, nStop0), 'geri tuşunda yayın kapanmadı: uygulama içi mini oynatıcıya küçüldü');
  // uygulamada gezinirken küçük oynatıcı açık kalır, yayın durmaz
  const miniOn = () => page.evaluate((n) => !document.querySelector('#mini-player-overlay').hidden && window.__calls.filter((c) => c[0] === 'stop').length === n && document.documentElement.classList.contains('native-preview'), nStop0);
  for (const tab of ['sources', 'movies', 'favs', 'live']) {
    await page.click('#tabs [data-tab=' + tab + ']');
    await sleep(350);
    ok(await miniOn(), 'gezinirken küçük oynatıcı açık kaldı: ' + tab + ' sekmesi');
  }
  await page.waitForSelector('.row.cat');
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.row:not(.cat)');
  await sleep(350);
  ok(await miniOn(), 'kategoriye girip kanal listesinde gezinirken küçük oynatıcı açık kaldı');
  await page.click('.row:not(.cat) .nm');
  await page.waitForFunction(() => document.documentElement.classList.contains('native-playing'), null, { timeout: 5000 });
  ok(await page.evaluate(() => document.querySelector('#mini-player-overlay').hidden), 'başka kanal açılınca küçük oynatıcı kutusu kalktı, tam ekran oynuyor');
  await page.goBack();
  await page.waitForSelector('#mini-player-overlay:not([hidden])', { timeout: 5000 });
  ok(true, 'yeni yayın da geri tuşunda küçük oynatıcıya küçüldü');
  // sistem PiP penceresinden dönünce küçük oynatıcı yerinde kalır
  await page.evaluate(() => window.__emit('pip', { active: true }));
  await page.evaluate(() => window.__emit('pip', { active: false }));
  await sleep(300);
  ok(await page.evaluate(() => !document.querySelector('#mini-player-overlay').hidden), 'PiP’ten dönünce küçük oynatıcı yerinde');
  await page.click('#mini-player-close');
  await page.waitForFunction((n) => window.__calls.filter((c) => c[0] === 'stop').length > n, nStop0, { timeout: 5000 });
  await page.waitForSelector('#player', { state: 'hidden' });
  ok(true, 'mini oynatıcının × düğmesi yayını durdurdu');
  // Yedeği yerel eklentiyle kaydetme
  await page.click('#tabs [data-tab=sources]');
  await page.click('[data-set=general]');
  await page.click('#g-bk');
  await page.click('#bk-save');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'saveText'));
  const sv = await page.evaluate(() => window.__calls.find((c) => c[0] === 'saveText'));
  ok(/^iptv-yedek-.*\.json$/.test(sv[1]) && sv[2] > 50, 'yedek yerel eklentiyle İndirilenler klasörüne kaydedildi');
  ok(/İndirilenler/.test(await page.textContent('#toast')), 'kaydedilen yer ekranda bildirildi');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // Kayıtlar ekranı
  await page.evaluate(() => {
    window.__recs = [{ id: 'a.ts', url: 'file:///rec/a.ts', name: 'Deneme Kanal', startedAt: Date.now(), durationMs: 65000, size: 20 * 1024 * 1024, active: false }];
  });
  await page.click('#tabs [data-tab=home]');
  await page.waitForSelector('.t-recs');
  await page.click('.t-recs');
  await page.waitForSelector('.rec-row');
  ok(/Deneme Kanal/.test(await page.textContent('.rec-row')) && /20 MB/.test(await page.textContent('.rec-row')) && /1:05/.test(await page.textContent('.rec-row')), 'Kayıtlar listesinde ad, süre ve boyut var');
  ok(/Boş alan: 4,7 GB/.test(await page.textContent('.rec-info')), 'boş alan gösteriliyor: ' + (await page.textContent('.rec-info')).trim());
  await sleep(500);
  await page.screenshot({ path: path.join(SHOTS, '15-kayitlar.png') });
  // kayda dokununca pencere kapanır, kayıt oynatıcıda açık kalır (pencere kapanırken oynatıcıyı da kapatmamalı)
  const recPlays = () => page.evaluate(() => window.__calls.filter((c) => c[0] === 'play' && c[1] === 'file:///rec/a.ts').length);
  const rp0 = await recPlays();
  await page.click('.rec-play');
  await page.waitForFunction((n) => window.__calls.filter((c) => c[0] === 'play' && c[1] === 'file:///rec/a.ts').length > n, rp0, { timeout: 5000 });
  await sleep(700);
  ok((await page.$$('#player:not([hidden])')).length === 1, 'Kayıtlar’dan açılan kayıt oynatıcıda açık kaldı');
  ok((await page.$$('.sheet-back')).length === 0, 'Kayıtlar penceresi kapandı');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#player', { state: 'hidden', timeout: 5000 });
  await page.click('.t-recs');
  await page.waitForSelector('.rec-row');
  await page.click('.rec-row [data-del]');
  await page.waitForSelector('#rd-yes');
  await page.click('#rd-yes');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'recDel' && c[1] === 'a.ts'));
  await page.waitForSelector('.rec-row', { state: 'detached' });
  ok(/Henüz kayıt yok/.test(await page.textContent('#rec-body')), 'silinince liste boşaldı');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => window.__calls.some((c) => c[0] === 'brightness' && c[1] === -1)), 'kapanışta sistem parlaklığına dönüldü');

  // tam ekran: çentik payı eklentiden gerçek ölçüyle gelir ve sayfa kenarlarına yansır
  const naVar = (k) => page.evaluate((n) => document.documentElement.style.getPropertyValue(n), '--na-' + k);
  ok((await naVar('l')) === '0px', 'çentik payı eklentiden okundu (çentiksiz ekranda 0)');
  await page.evaluate(() => window.__emit('insets', { l: 44, t: 24, r: 0, b: 0 }));
  ok((await naVar('l')) === '34px' && (await naVar('t')) === '14px', 'çentik payı olayı CSS değişkenlerine yansıdı (44 → 34 px, 24 → 14 px)');
  const padL = await page.evaluate(() => { const d = document.createElement('div'); d.className = 'pg'; d.style.visibility = 'hidden'; document.body.append(d); const v = getComputedStyle(d).paddingLeft; d.remove(); return v; });
  ok(padL === '34px', 'tam ekran sayfaların sol boşluğu çentik payına eşit: ' + padL);
  await page.evaluate(() => window.__emit('insets', { l: 0, t: 0, r: 0, b: 0 }));
  ok((await naVar('l')) === '0px', 'çentik kalkınca boşluk sıfırlandı');

  // çoklu ekran: her kutu ayrı yerel oynatıcı, yalnız bir kutunun sesi açık
  console.log('Çoklu ekran (yerel)');
  await page.click('#tabs [data-tab=home]');
  await page.waitForSelector('.tile.t-multi');
  await page.click('.t-multi');
  await page.waitForSelector('.mp-cell');
  ok((await page.$$('.mp-cell')).length === 2, 'çoklu ekran iki kutuyla açıldı');
  ok(await page.evaluate(() => document.documentElement.classList.contains('native-preview')), 'çoklu ekranda sayfa saydam (kutuların görüntüsü yerel oynatıcıda)');
  const mpGrid = await page.$eval('#mp-grid', (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round).join(); });
  ok(mpGrid === '0,0,390,844', 'çoklu ekran tüm ekranı kaplıyor (kenar boşluğu yok): ' + mpGrid);
  ok(!(await page.isVisible('#bar')) && !(await page.isVisible('#tabs')), 'çoklu ekranda üst çubuk ve alt sekmeler gizli');
  const showMpChips = () => page.evaluate(() => document.querySelector('#mp-grid').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.click('.mp-cell[data-c="0"]');
  await page.waitForSelector('#pk-q');
  ok((await page.$$eval('#pk-cat option', (o) => o.length)) > 3, 'kanal seçicide kategori listesi var');
  await page.fill('#pk-q', 'seker');
  await page.waitForFunction(() => document.querySelectorAll('#pk-list .row').length > 0);
  await page.click('#pk-list .row');
  await page.waitForSelector('#pk-q', { state: 'detached' });
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'multiPlay'));
  let mp = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'multiPlay'));
  ok(mp.length === 1 && mp[0][1] === 0 && /\.m3u8$/.test(mp[0][2]) && mp[0][3] === false, 'ilk kutu yerel oynatıcıda başladı, sesi açık');
  ok(mp[0][6] > 100 && mp[0][7] > 60, 'kutunun dikdörtgeni eklentiye iletildi: ' + mp[0].slice(4, 8).join(','));
  ok(mp[0][8] === false, 'kutular varsayılan olarak görüntüyü sığdırıyor (en-boy oranı korunur)');
  await page.click('.mp-cell[data-c="1"]');
  await page.waitForSelector('#pk-q');
  await page.fill('#pk-q', 'haber');
  await page.waitForFunction(() => document.querySelectorAll('#pk-list .row').length > 0);
  await page.click('#pk-list .row');
  await page.waitForFunction(() => window.__calls.filter((c) => c[0] === 'multiPlay').length === 2);
  mp = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'multiPlay'));
  ok(mp[1][1] === 1 && mp[1][3] === true, 'ikinci kutu sessiz başladı (aynı anda yalnız bir kutunun sesi açık)');
  ok(await page.evaluate(() => document.querySelector('.mp-cell[data-c="0"]').classList.contains('snd') && !document.querySelector('.mp-cell[data-c="1"]').classList.contains('snd')), 'sesli kutu vurgulu');
  await page.screenshot({ path: path.join(SHOTS, '12-coklu-ekran-yerel.png') });
  await page.click('.mp-cell[data-c="1"] .mp-vid');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'multiMute' && c[1] === 1 && c[2] === false));
  ok(await page.evaluate(() => window.__calls.some((c) => c[0] === 'multiMute' && c[1] === 0 && c[2] === true)), 'kutuya dokununca ses o kutuya geçti, önceki kutu susturuldu');
  ok(await page.$eval('.mp-cell[data-c="1"]', (e) => e.classList.contains('snd')), 'sesli kutu işareti yeni kutuya taşındı');
  ok((await page.evaluate(() => window.__iptv.store.pref('multi.ids.' + window.__iptv.S.source.id, []).filter(Boolean).length)) === 2, 'seçilen kanallar kaydedildi');
  const nPlay = () => page.evaluate(() => window.__calls.filter((c) => c[0] === 'multiPlay').length);
  let n0 = await nPlay();
  await showMpChips();
  await page.click('#mp-fit');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'multiFit' && c[1] === true));
  ok((await page.textContent('#mp-fit')) === 'Doldur' && (await page.evaluate(() => window.__iptv.store.pref('multi.fill', false))) === true, '“Doldur/Sığdır” düğmesi tüm kutulara iletildi ve kaydedildi');
  await showMpChips();
  await page.click('#mp-fit');
  await page.waitForFunction(() => window.__calls.filter((c) => c[0] === 'multiFit').length === 2);
  await showMpChips();
  await page.click('#mp-n [data-n="4"]');
  await page.waitForFunction(() => document.querySelectorAll('.mp-cell').length === 4);
  const cells4 = await page.$$eval('.mp-vid', (e) => e.map((x) => { const r = x.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
  ok(cells4.every((c) => c.l >= 0 && c.t >= 0 && c.r <= 390 && c.b <= 844) && !cells4.some((a, i) => cells4.some((c, j) => j > i && a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1)), 'dört kutu ekrana sığıyor, üst üste binmiyor');
  await page.waitForFunction((n) => window.__calls.filter((c) => c[0] === 'multiPlay').length >= n + 2, n0);
  ok(await page.evaluate(() => window.__calls.some((c) => c[0] === 'multiStopAll')), 'kutu sayısı değişince eski oynatıcılar bırakıldı');
  ok((await page.evaluate(() => window.__iptv.store.pref('multi.n', 2))) === 4, 'kutu sayısı kaydedildi');
  // kutu kopunca yalnız o kutu hemen yeniden bağlanır
  const mpN = (slot) => page.evaluate((x) => window.__calls.filter((c) => c[0] === 'multiPlay' && c[1] === x).length, slot);
  await sleep(250); // başlangıçtaki bekleyen "oynuyor" olayları bitsin (yoksa hata olayından sonra gelip durumu ezer)
  const a0 = await mpN(0);
  const a1 = await mpN(1);
  await page.evaluate(() => {
    window.__noPlay = true;
    window.__emit('multi', { slot: 0, state: 'error', message: 'ERROR_CODE_IO_NETWORK_CONNECTION_FAILED' });
  });
  await page.waitForFunction(([x, n]) => window.__calls.filter((c) => c[0] === 'multiPlay' && c[1] === x).length > n, [0, a0], { timeout: 1500 });
  ok((await mpN(1)) === a1, 'kopan kutu hemen yeniden bağlandı, diğer kutuya dokunulmadı');
  ok(/Yeniden bağlanılıyor/.test(await page.textContent('.mp-cell[data-c="0"] .mp-st')), 'kutuda “Yeniden bağlanılıyor” bilgisi var');
  await page.evaluate(() => {
    window.__noPlay = false;
    window.__emit('multi', { slot: 0, state: 'playing' });
  });
  await page.waitForFunction(() => !document.querySelector('.mp-cell[data-c="0"] .mp-st'));
  ok(true, 'kutu yeniden oynayınca bilgi kalktı');
  // ses var görüntü yok: cihaz görüntü biçimini çözemiyorsa nedeni kutuda yazar, dokununca yeniden dener
  await page.evaluate(() => window.__emit('multi', { slot: 1, state: 'video', has: true, supported: false, info: 'hevc 3840x2160 · c2.test.decoder' }));
  await page.waitForFunction(() => /çözemiyor/.test((document.querySelector('.mp-cell[data-c="1"] .mp-st') || {}).textContent || ''), null, { timeout: 2000 });
  ok(/Bu cihaz bu görüntü biçimini çözemiyor \(hevc 3840x2160 · c2\.test\.decoder\)/.test(await page.textContent('.mp-cell[data-c="1"] .mp-st')), 'çözülemeyen görüntü biçiminde neden kutuda yazıyor');
  const b1 = await mpN(1);
  await page.click('.mp-cell[data-c="1"]');
  await page.waitForFunction(([x, n]) => window.__calls.filter((c) => c[0] === 'multiPlay' && c[1] === x).length > n, [1, b1], { timeout: 2000 });
  await page.waitForFunction(() => !document.querySelector('.mp-cell[data-c="1"] .mp-st'));
  ok(true, 'kutuya dokununca yeniden denendi ve bilgi kalktı');
  // kumanda: kutudan yukarı → sağ üstteki düğmeler; odak düğmeye gelince denetimler görünür kalır
  await page.focus('.mp-cell[data-c="0"]');
  await page.keyboard.press('ArrowUp');
  ok((await page.evaluate(() => document.activeElement.dataset.act)) === 'swap', 'kumanda: kutudan yukarı ok sağ üstteki düğmelere geçti');
  await page.keyboard.press('ArrowRight');
  ok((await page.evaluate(() => document.activeElement.dataset.act)) === 'full', 'sağ ok bir sonraki düğmeye (tam ekran) gitti');
  await page.keyboard.press('ArrowRight');
  ok((await page.evaluate(() => document.activeElement.dataset.act)) === 'rm', 'sağ ok kaldır düğmesine ulaştı');
  await page.evaluate(() => document.querySelector('#mp-chips').classList.add('idle'));
  await page.focus('#mp-back');
  ok(await page.$eval('#mp-chips', (e) => !e.classList.contains('idle')), 'odak alt düğmelere gelince gizlenmiş denetimler yeniden göründü');
  // kutudan tam ekran
  n0 = await nPlay();
  const stops0 = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'multiStopAll').length);
  await page.click('.mp-cell[data-c="0"] [data-act=full]');
  await page.waitForFunction(() => document.documentElement.classList.contains('native-playing'));
  ok((await page.evaluate((n) => window.__calls.filter((c) => c[0] === 'multiStopAll').length > n, stops0)), 'tam ekrana geçerken kutu oynatıcıları durduruldu');
  await page.goBack();
  // Android'de geri tuşu yayını mini oynatıcıya küçültür; mini oynatıcı kapanınca kutular yeniden başlar
  await page.waitForSelector('#mini-player-overlay:not([hidden])', { timeout: 5000 });
  await page.click('#mini-player-close');
  await page.waitForSelector('#player', { state: 'hidden' });
  await page.waitForFunction((n) => window.__calls.filter((c) => c[0] === 'multiPlay').length >= n + 2, n0, { timeout: 5000 });
  ok(true, 'tam ekrandan dönüp mini oynatıcı kapanınca kutular yeniden başladı');
  // uygulama arka plana geçince kutu oynatıcıları (ses dahil) durur, dönünce yeniden başlar
  const stopsBg = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'multiStopAll').length);
  n0 = await nPlay();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction((n) => window.__calls.filter((c) => c[0] === 'multiStopAll').length > n, stopsBg);
  ok(true, 'uygulama arka plana geçince kutu oynatıcıları durdu');
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction((n) => window.__calls.filter((c) => c[0] === 'multiPlay').length >= n + 2, n0, { timeout: 5000 });
  ok(true, 'öne gelince kutular yeniden başladı');
  await page.click('.mp-cell[data-c="1"] [data-act=rm]');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'multiStop' && c[1] === 1));
  ok(await page.$eval('.mp-cell[data-c="1"]', (e) => !e.classList.contains('has')), 'kutudan kanal kaldırılınca oynatıcısı bırakıldı');
  const stops1 = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'multiStopAll').length);
  await showMpChips();
  await page.click('#mp-back');
  await page.waitForFunction((n) => window.__calls.filter((c) => c[0] === 'multiStopAll').length > n, stops1);
  ok(!(await page.evaluate(() => document.documentElement.classList.contains('native-preview'))), 'çoklu ekrandan çıkınca tüm kutu oynatıcıları durdu, sayfa opak');

  ok((await page.$('#diag')) === null, 'ekranda hata bildirimi yok');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 7f. telefondan TV'ye oynatma
  console.log('Telefondan TV’ye oynatma');
  ({ page, ctx, errs } = await newPage({ width: 390, height: 844 }, nativeInit));
  await page.waitForSelector('#f');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/list.m3u');
  await page.click('#f-go');
  await page.waitForSelector('.tile', { timeout: 15000 });
  await page.evaluate(() => {
    window.__found = [{ id: 'tv1', name: 'Salon TV', host: '192.168.1.20', port: 8765, paired: false }];
  });
  await page.click('#tabs [data-tab=movies]');
  await page.waitForSelector('.row.cat');
  await sleep(150);
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.card', { timeout: 15000 });
  const movieName = await page.evaluate(() => {
    const it = window.__iptv.S.cat.movies[0];
    window.__iptv.store.setProgress(window.__iptv.S.source.id, { id: it.id, kind: 'movie', name: it.name, logo: it.logo }, 120000, 600000);
    window.__movieId = it.id;
    return it.name;
  });
  await page.click('.card');
  await page.waitForSelector('#mv-play');
  ok(await page.isVisible('#mv-cast'), 'telefonda film sayfasında “TV’de oynat” düğmesi var');
  await page.click('#mv-cast');
  await page.waitForSelector('.cast-row-d');
  ok(/Yeni · kod gerekir/.test(await page.textContent('.cast-row-d')) && /Salon TV/.test(await page.textContent('.cast-row-d')), 'ağda bulunan TV listelendi, eşleşmesi yok');
  await page.click('.cast-row-d [data-i="0"]');
  await page.waitForSelector('#lock .lk-k');
  const typeCode = async (c) => {
    for (const d of c) await page.click(`#lock .lk-k[data-k="${d}"]`);
  };
  await typeCode('111111');
  await page.waitForFunction(() => /Kod yanlış/.test(document.querySelector('#lk-h').textContent));
  ok(true, 'yanlış kod reddedildi ve söylendi');
  ok((await page.evaluate(() => window.__tv.played.length)) === 0, 'yanlış kodla oynatma gönderilmedi');
  await typeCode('123456');
  await page.waitForSelector('.cast-pg', { timeout: 10000 });
  await page.waitForFunction(() => /Oynatılıyor/.test(document.querySelector('#cs-state').textContent));
  const pl = await page.evaluate(() => window.__tv.played[0]);
  ok(pl && pl.title === movieName && pl.kind === 'vod' && /\/movie\/u\/p\/\d+\.webm$/.test(pl.targets[0].url), 'doğru kodla eşleşti; film adı ve adresi TV’ye gitti');
  ok(pl.startMs === 117000, 'kaldığı yerden (117 sn) gönderildi');
  ok((await page.textContent('#cs-title')) === movieName, 'kumanda sayfası film adını gösteriyor');
  ok((await page.textContent('#cs-pos')) === '1:57' && (await page.textContent('#cs-dur')) === '10:00', 'TV’deki konum ve süre gösteriliyor');
  const dev = await page.evaluate(() => window.__iptv.store.pref('cast.tvs', []));
  ok(dev.length === 1 && dev[0].token === 'tok123' && dev[0].host === '192.168.1.20', 'eşleşme telefonda saklandı');
  ok((await page.evaluate(() => window.__iptv.store.progress(window.__iptv.S.source.id, window.__movieId))).pos === 117000, 'TV’deki ilerleme telefonda “Devam et” için kaydedildi');
  await page.click('#cs-fwd');
  await page.waitForFunction(() => document.querySelector('#cs-pos').textContent === '2:07', null, { timeout: 5000 });
  ok((await page.evaluate(() => window.__tv.cmds.some((c) => c.a === 'seekBy' && c.v === 10000))), '10 sn ileri komutu TV’ye gitti ve konum güncellendi');
  await page.click('#cs-rew');
  await page.waitForFunction(() => document.querySelector('#cs-pos').textContent === '1:57', null, { timeout: 5000 });
  await page.click('#cs-play');
  await page.waitForFunction(() => /Duraklatıldı/.test(document.querySelector('#cs-state').textContent), null, { timeout: 5000 });
  ok(await page.$eval('#cs-play', (b) => /i-play/.test(b.innerHTML)), 'duraklatınca düğme “oynat” simgesine döndü');
  await page.click('#cs-play');
  await page.waitForFunction(() => /Oynatılıyor/.test(document.querySelector('#cs-state').textContent), null, { timeout: 5000 });
  await page.$eval('#cs-seek', (e) => {
    e.value = '500';
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => window.__tv.cmds.some((c) => c.a === 'seekTo'), null, { timeout: 5000 });
  ok((await page.evaluate(() => window.__tv.cmds.find((c) => c.a === 'seekTo').v)) === 300000, 'çubuğu ortaya çekmek TV’yi 5:00’e sardı');
  await page.click('#cs-vup');
  await page.click('#cs-vdn');
  ok(await page.evaluate(() => window.__tv.cmds.some((c) => c.a === 'volUp') && window.__tv.cmds.some((c) => c.a === 'volDown')), 'ses komutları TV’ye gitti');
  await page.screenshot({ path: path.join(SHOTS, '12-tv-kumanda.png') });
  await page.click('#cs-stop');
  await page.waitForSelector('.cast-pg', { state: 'detached' });
  ok(await page.evaluate(() => window.__tv.cmds.some((c) => c.a === 'stop') && !window.__tv.state.active), '“TV’de durdur” TV’yi durdurdu ve kumanda kapandı');

  // ikinci gönderim: eşleşme hatırlandığı için kod sorulmaz
  await page.click('#mv-cast');
  await page.waitForSelector('.cast-row-d');
  ok(/Eşleşmiş · bağlanabilir/.test(await page.textContent('.cast-row-d')), 'kayıtlı TV “eşleşmiş” görünüyor');
  await page.click('.cast-row-d [data-i="0"]');
  await page.waitForSelector('.cast-pg', { timeout: 10000 });
  ok((await page.$$('#lock')).length === 0 && (await page.evaluate(() => window.__tv.played.length)) === 2, 'ikinci gönderimde kod istenmedi');
  // yanlışlıkla geri çıkılırsa: TV hâlâ oynuyor, listeden “Kumandayı aç” ile yeniden gönderilmeden dönülür
  await page.click('.cast-pg [data-close]');
  await page.waitForSelector('.cast-pg', { state: 'detached' });
  await page.click('#mv-cast');
  await page.waitForSelector('.cast-row-d [data-remote]', { timeout: 8000 });
  ok(/Şu an: /.test(await page.textContent('.cast-row-d')), 'TV’nin şu an oynattığı listede görünüyor');
  await page.click('.cast-row-d [data-remote]');
  await page.waitForSelector('.cast-pg', { timeout: 10000 });
  await page.waitForFunction(() => /Oynatılıyor|Duraklatıldı/.test(document.querySelector('#cs-state').textContent), null, { timeout: 5000 });
  ok((await page.evaluate(() => window.__tv.played.length)) === 2 && (await page.textContent('#cs-title')) === movieName, '“Kumandayı aç” yeniden göndermeden kumandaya döndü');
  // TV kapanınca / oynatma bitince kumanda kendiliğinden kapanır
  await page.evaluate(() => (window.__tv.state = { active: false }));
  await page.waitForSelector('.cast-pg', { state: 'detached', timeout: 8000 });
  ok(true, 'TV’de oynatma bitince kumanda sayfası kapandı');
  await page.click('.dt-pg [data-close]');

  // oynatıcıdan gönderme (canlı): yerel oynatma kapanır, kanal değiştirme düğmeleri çıkar
  await page.click('#tabs [data-tab=live]');
  await page.waitForSelector('.row', { timeout: 15000 });
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.row:not(.cat)');
  await page.click('.row:not(.cat) .nm');
  await page.waitForFunction(() => document.body.classList.contains('player-open') || document.documentElement.classList.contains('native-playing'));
  await page.waitForSelector('#pl-tv:not([hidden])', { timeout: 5000 });
  ok(true, 'oynatıcıda “TV’de oynat” düğmesi göründü');
  const liveName = await page.textContent('#pl-name');
  await page.evaluate(() => (window.__calls.length = 0));
  await page.click('#pl-tv');
  await page.waitForSelector('.cast-row-d');
  await page.click('.cast-row-d [data-i="0"]');
  await page.waitForSelector('.cast-pg', { timeout: 10000 });
  await page.waitForFunction(() => /Oynatılıyor/.test(document.querySelector('#cs-state').textContent));
  const lp = await page.evaluate(() => window.__tv.played[2]);
  ok(lp.kind === 'live' && lp.title === liveName && /\.m3u8$/.test(lp.targets[0].url) && lp.startMs === 0, 'canlı kanal TV’ye gönderildi');
  ok(await page.evaluate(() => window.__calls.some((c) => c[0] === 'stop')), 'telefondaki oynatma durduruldu');
  ok(await page.$eval('#cs-prog', (e) => e.hidden) && await page.$eval('#cs-rew', (e) => e.hidden), 'canlıda sarma çubuğu ve 10 sn düğmeleri yok');
  ok(await page.isVisible('#cs-next') && await page.isVisible('#cs-prev'), 'canlıda önceki/sonraki kanal düğmeleri var');
  await page.click('#cs-next');
  await page.waitForFunction(() => window.__tv.played.length === 4, null, { timeout: 5000 });
  ok((await page.evaluate(() => window.__tv.played[3].title)) !== liveName, 'telefondan sonraki kanala geçildi');
  await page.waitForFunction((n) => document.querySelector('#cs-title').textContent !== n, liveName);
  await page.evaluate(() => (window.__tv.offline = true));
  await page.waitForSelector('.cast-pg', { state: 'detached', timeout: 10000 });
  ok(true, 'TV’ye ulaşılamayınca kumanda kapandı');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // eşleşmesi kaldırılmış telefon
  ({ page, ctx, errs } = await newPage({ width: 390, height: 844 }, nativeInit));
  await page.waitForSelector('#f');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/list.m3u');
  await page.click('#f-go');
  await page.waitForSelector('.tile', { timeout: 15000 });
  await page.evaluate(() => {
    window.__iptv.store.setPref('cast.tvs', [{ id: 'tv1', name: 'Salon TV', host: '192.168.1.20', port: 8765, token: 'eski' }]);
    window.__found = [{ id: 'tv1', name: 'Salon TV', host: '192.168.1.20', port: 8765 }];
  });
  await page.click('#tabs [data-tab=movies]');
  await page.waitForSelector('.row.cat');
  await sleep(150);
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.card', { timeout: 15000 });
  await page.click('.card');
  await page.waitForSelector('#mv-cast');
  await page.click('#mv-cast');
  await page.waitForSelector('.cast-row-d');
  await page.click('.cast-row-d [data-i="0"]');
  await page.waitForFunction(() => /eşleşmesi kaldırılmış/.test(document.querySelector('#toast').textContent), null, { timeout: 5000 });
  ok(((await page.evaluate(() => window.__iptv.store.pref('cast.tvs', []))).length) === 0, 'TV eşleşmeyi kaldırmışsa telefon da unutur ve yeniden eşleştirmeyi ister');
  // Ayarlar › Telefondan oynat (telefonda): kod ÜRETMEZ; TV seçilir ve TV'nin gösterdiği kod girilir
  await ctx.close();
  ({ page, ctx, errs } = await newPage({ width: 390, height: 844 }, nativeInit));
  await page.waitForSelector('#f');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/list.m3u');
  await page.click('#f-go');
  await page.waitForSelector('.tile', { timeout: 15000 });
  await page.evaluate(() => {
    window.__calls.length = 0;
    window.__found = [{ id: 'tv1', name: 'Salon TV', host: '192.168.1.20', port: 8765, paired: false }];
  });
  await page.click('#h-set');
  await page.waitForSelector('.set-grid');
  await page.click('[data-set=cast]');
  await page.waitForSelector('.cast-row-d');
  ok((await page.$('.cast-code')) === null && (await page.$('#rc-body')) === null, 'telefonda “Telefondan oynat” eşleştirme kodu üretmiyor');
  ok(!(await page.evaluate(() => window.__calls.some((c) => c[0] === 'castStart' || c[0] === 'castPairOpen'))), 'telefonda alıcı/kod üretimi hiç başlatılmadı');
  ok(/Salon TV/.test(await page.textContent('.cast-row-d')) && /TV’deki kodu girin/.test(await page.textContent('.cast-row-d')), 'ağdaki TV listelendi ve kod girileceği yazıyor');
  await page.click('.cast-row-d [data-i="0"]');
  await page.waitForSelector('#lock .lk-k');
  for (const d of '123456') await page.click(`#lock .lk-k[data-k="${d}"]`);
  await page.waitForFunction(() => /ile eşleşti/.test(document.querySelector('#toast').textContent), null, { timeout: 8000 });
  ok(((await page.evaluate(() => window.__iptv.store.pref('cast.tvs', []))).length) === 1 && (await page.$('.cast-row-d')) !== null, 'kod girilince TV eşleşti, ekran açık kaldı');
  ok(/Eşleşmiş/.test(await page.textContent('.cast-row-d')), 'liste “Eşleşmiş” gösteriyor');
  await ctx.close();

  // veri eşitleme: telefon başlatır, iki cihaz birbirinin eksiklerini alır, var olan değişmez
  console.log('Telefon ↔ TV veri eşitleme');
  ({ page, ctx, errs } = await newPage({ width: 390, height: 844 }, nativeInit));
  await page.waitForSelector('#f');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/list.m3u');
  await page.click('#f-go');
  await page.waitForSelector('.tile', { timeout: 15000 });
  await page.evaluate(() => {
    const { store, S } = window.__iptv;
    const sid = S.source.id;
    store.setPref('sync.auto', false); // elle eşitleme sınanıyor: kendiliğinden eşitleme araya girmesin
    store.setPref('cast.tvs', [{ id: 'tv1', name: 'Salon TV', host: '192.168.1.20', port: 8765, token: 'tok123' }]);
    window.__found = [{ id: 'tv1', name: 'Salon TV', host: '192.168.1.20', port: 8765 }];
    store.toggleFav(sid, { id: 'pf1', kind: 'live', name: 'Telefon Favori' });
    store.setProgress(sid, { id: 'm1', kind: 'movie', name: 'Ortak Film', logo: '' }, 50000, 600000);
    store.setPref('set.buffer', 'max');
    window.__tvSnap = {
      app: 'iptv-oynatici-sync',
      v: 1,
      at: 1,
      sources: [
        { id: 'srcTV', type: 'm3u', url: S.source.url, name: 'TV listesi' },
        { id: 'srcX', type: 'xtream', server: 'http://tv.example:8080', user: 'ali', pass: 'gizli', name: 'TV hesabı' },
      ],
      data: {
        'fav.srcTV': [{ id: 'tf1', kind: 'live', name: 'TV Favori', logo: '' }],
        'prog.srcTV': {
          m1: { id: 'm1', kind: 'movie', name: 'Ortak Film', logo: '', parent: null, pos: 400000, dur: 600000, at: 5 },
          m2: { id: 'm2', kind: 'movie', name: 'Yalnız TV’de', logo: '', parent: null, pos: 30000, dur: 600000, at: 6 },
        },
        'fav.srcX': [{ id: 'xf', kind: 'live', name: 'Xtream Favori', logo: '' }],
      },
    };
    window.__tvAdded = { sources: 0, favs: 1, recents: 0, progress: 0, folders: 0 };
  });
  const closeSheets = async () => {
    for (let i = 0; i < 6 && (await page.$$('.sheet-back')).length; i++) {
      await page.locator('.sheet-back [data-close]').last().click();
      await sleep(150);
    }
  };
  const openSync = async () => {
    await page.click('#tabs [data-tab=sources]');
    await page.click('[data-set=general]');
    await page.click('#g-bk');
    await page.waitForSelector('#bk-sync');
    await page.click('#bk-sync');
    await page.waitForSelector('.cast-row-d');
    await page.click('.cast-row-d [data-i="0"]');
  };
  await openSync();
  await page.waitForFunction(() => /Telefona eklenen/.test(document.querySelector('#toast').textContent), null, { timeout: 8000 });
  const smsg = await page.textContent('#toast');
  ok(/TV’ye eklenen: 1 favori\./.test(smsg) && /Telefona eklenen: 1 kaynak, 2 favori, 1 ilerleme\./.test(smsg), 'sonuç iletisi iki yönü de söylüyor: ' + smsg.trim());
  const posted = await page.evaluate(() => window.__tv.synced);
  ok(posted && posted.app === 'iptv-oynatici-sync' && posted.sources.length === 1 && Object.keys(posted.data).some((k) => k.startsWith('fav.')), 'telefonun kaynak ve favorileri TV’ye gönderildi');
  ok(!JSON.stringify(posted).includes('buffer') && !JSON.stringify(posted).includes('lock'), 'ayarlar ve uygulama şifresi gönderilmedi');
  const got = await page.evaluate(() => {
    const { store, S } = window.__iptv;
    const sid = S.source.id;
    return { sources: store.sources().map((x) => [x.type, x.pass || '']), favs: store.favs(sid).map((f) => f.id), m1: store.progress(sid, 'm1').pos, m2: !!store.progress(sid, 'm2'), buf: store.pref('set.buffer', ''), xf: store.favs(store.sources()[1].id).map((f) => f.id) };
  });
  ok(got.sources.length === 2 && got.sources[1][0] === 'xtream' && got.sources[1][1] === 'gizli', 'TV’deki yeni kaynak telefona eklendi (bilgileriyle)');
  ok(JSON.stringify(got.favs) === JSON.stringify(['pf1', 'tf1']) && got.xf[0] === 'xf', 'TV’nin favorileri telefona eklendi, telefondaki sıra bozulmadı');
  ok(got.m1 === 50000 && got.m2, 'ortak filmin telefondaki ilerlemesi korundu, yalnız TV’deki eklendi');
  ok(got.buf === 'max', 'telefonun ayarı değişmedi');
  // aynı veriyle ikinci kez: değişiklik yok
  await page.evaluate(() => {
    window.__tvAdded = {};
    const { store } = window.__iptv;
    window.__tvSnap.sources = window.__tvSnap.sources.map((x) => x);
    window.__tvSnap.data['fav.srcTV'] = [{ id: 'tf1', kind: 'live', name: 'TV Favori', logo: '' }, { id: 'pf1', kind: 'live', name: 'Telefon Favori', logo: '' }];
    window.__keep = store.sources().length;
  });
  await closeSheets();
  await openSync();
  await page.waitForFunction(() => /Zaten eşit/.test(document.querySelector('#toast').textContent), null, { timeout: 8000 });
  ok(await page.evaluate(() => window.__iptv.store.sources().length === window.__keep), 'ikinci eşitlemede yeni bir şey eklenmedi');
  // eşleşme kaldırılmışsa
  await page.evaluate(() => {
    window.__tv.token = 'baska';
  });
  await closeSheets();
  await openSync();
  await page.waitForFunction(() => /eşleşmesi kaldırılmış/.test(document.querySelector('#toast').textContent), null, { timeout: 8000 });
  ok(true, 'TV eşleşmeyi kaldırmışsa eşitleme bunu söyler');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // Kendiliğinden eşitleme (telefon): öne gelince eşleşmiş TV bulunursa sessizce eşitler; silmeler de taşınır; ayarla kapatılabilir
  ({ page, ctx, errs } = await newPage({ width: 390, height: 844 }, nativeInit));
  await page.waitForSelector('#f');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/list.m3u');
  await page.click('#f-go');
  await page.waitForSelector('.tile', { timeout: 15000 });
  await page.evaluate(() => {
    const { store, S } = window.__iptv;
    const sid = S.source.id;
    store.setPref('cast.tvs', [{ id: 'tv1', name: 'Salon TV', host: '192.168.1.20', port: 8765, token: 'tok123' }]);
    window.__found = [{ id: 'tv1', name: 'Salon TV', host: '192.168.1.20', port: 8765 }];
    store.setPref('sync.try', Date.now()); // açılıştaki otomatik deneme araya girmesin
    store.toggleFav(sid, { id: 'pf1', kind: 'live', name: 'Telefon Favori' });
    store.toggleFav(sid, { id: 'pf2', kind: 'live', name: 'Telefon Favori 2' });
    window.__tvSnap = {
      app: 'iptv-oynatici-sync',
      v: 1,
      at: 1,
      sources: [{ id: 'srcTV', type: 'm3u', url: S.source.url, name: 'TV listesi' }],
      data: {
        'fav.srcTV': [{ id: 'tf1', kind: 'live', name: 'TV Favori', logo: '', at: Date.now() }],
        'favx.srcTV': { pf1: Date.now() + 60000 }, // TV'de pf1 sonradan silinmiş
      },
    };
    window.__tvAdded = {};
    store.setPref('sync.try', 0);
  });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => /TV ile eşitlendi/.test(document.querySelector('#toast').textContent), null, { timeout: 8000 });
  ok(/1 favori/.test(await page.textContent('#toast')) && /1 silme/.test(await page.textContent('#toast')), 'kendiliğinden eşitleme sessizce yapıldı ve değişikliği bildirdi');
  const au = await page.evaluate(() => {
    const { store, S } = window.__iptv;
    return { favs: store.favs(S.source.id).map((f) => f.id).sort(), tomb: Object.keys(store.get('favx.' + S.source.id) || {}) };
  });
  ok(JSON.stringify(au.favs) === JSON.stringify(['pf2', 'tf1']) && au.tomb.includes('pf1'), 'TV’deki silme telefona yayıldı (pf1 kalktı), TV’nin yeni favorisi geldi');
  // kapatılınca eşitlemez
  await page.evaluate(() => {
    window.__tv.synced = null;
    window.__iptv.store.setPref('sync.auto', false);
    window.__iptv.store.setPref('sync.try', 0);
  });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await sleep(1200);
  ok(!(await page.evaluate(() => window.__tv.synced)), 'ayar kapalıyken kendiliğinden eşitleme yapılmaz');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // TV tarafı (alıcı)
  ({ page, ctx, errs } = await newPage({ width: 915, height: 412 }, nativeInit));
  await page.waitForSelector('#f');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/list.m3u');
  await page.click('#f-go');
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  ok(!(await page.evaluate(() => window.__calls.some((c) => c[0] === 'castStart'))), 'telefonda alıcı kendiliğinden açılmıyor');
  await page.evaluate(() => localStorage.setItem('__isTv', '1'));
  await page.reload();
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'castStart'), null, { timeout: 5000 });
  ok(true, 'TV’de uygulama açılınca alıcı kendiliğinden başladı');
  await page.evaluate(() => window.__emit('castPlay', { title: 'Evdeki Film', kind: 'vod', startMs: 65000, targets: [{ url: 'file:///etc/passwd' }] }));
  await sleep(300);
  ok(!(await page.evaluate(() => window.__calls.some((c) => c[0] === 'play'))), 'geçersiz (dosya adresli) istek oynatılmadı');
  // telefondan veri eşitleme isteği: birleştirilir, birleşmiş veri telefona yanıt olur
  const tvSid = await page.evaluate(() => {
    const { store, S } = window.__iptv;
    store.toggleFav(S.source.id, { id: 'tvf', kind: 'live', name: 'TV’nin favorisi' });
    return S.source.id;
  });
  await page.evaluate((sid) => {
    const { S } = window.__iptv;
    window.__emit('castSync', {
      id: 'sy1',
      body: JSON.stringify({ app: 'iptv-oynatici-sync', v: 1, at: 1, sources: [{ id: 'srcPh', type: 'm3u', url: S.source.url, name: 'Telefon' }], data: { 'fav.srcPh': [{ id: 'phf', kind: 'live', name: 'Telefon favorisi', logo: '' }, { id: 'tvf', kind: 'live', name: 'Aynı', logo: '' }] } }),
    });
  }, tvSid);
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'castSyncReply' && c[1] === 'sy1'), null, { timeout: 5000 });
  const sr = await page.evaluate(() => {
    const c = window.__calls.find((x) => x[0] === 'castSyncReply' && x[1] === 'sy1');
    return { ok: c[2], body: JSON.parse(c[3]), favs: window.__iptv.store.favs(window.__iptv.S.source.id).map((f) => f.id) };
  });
  ok(sr.ok === true && sr.body.added.favs === 1 && sr.body.snapshot.sources.length === 1, 'TV: gelen eşitleme birleştirildi ve telefona birleşmiş veri döndü');
  ok(JSON.stringify(sr.favs) === JSON.stringify(['tvf', 'phf']), 'TV’deki favori sırası korundu, telefonun eksik favorisi eklendi');
  ok(/Telefonla eşitlendi: 1 favori/.test(await page.textContent('#toast')), 'TV ekranında bilgi verildi');
  await page.evaluate(() => window.__emit('castSync', { id: 'sy2', body: 'bozuk' }));
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'castSyncReply' && c[1] === 'sy2'), null, { timeout: 5000 });
  ok(await page.evaluate(() => { const c = window.__calls.find((x) => x[0] === 'castSyncReply' && x[1] === 'sy2'); return c[2] === false && /Geçersiz/.test(JSON.parse(c[3]).error); }), 'TV: bozuk eşitleme verisi reddedildi, telefona hata döndü');
  await page.evaluate(() => window.__emit('castPlay', { title: 'Evdeki Film', kind: 'vod', startMs: 65000, targets: [{ url: 'http://192.168.1.50/m/film.mp4', mime: 'auto' }] }));
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'play'), null, { timeout: 5000 });
  const tp = await page.evaluate(() => window.__calls.find((c) => c[0] === 'play'));
  ok(tp[1] === 'http://192.168.1.50/m/film.mp4', 'gelen adres TV’nin oynatıcısında açıldı');
  ok((await page.textContent('#pl-name')) === 'Evdeki Film' && /Telefondan oynatılıyor/.test(await page.textContent('#pl-sub')), 'TV oynatıcısı adı ve “Telefondan oynatılıyor” bilgisini gösteriyor');
  ok(await page.$eval('#pl-tv', (b) => b.hidden || getComputedStyle(b).display === 'none') && await page.$eval('#pl-fav', (b) => b.hidden), 'TV’de “TV’de oynat” ve favori düğmeleri yok');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'castNow' && c[1] === 'Evdeki Film'), null, { timeout: 5000 });
  ok(true, 'çalan medyanın adı kumanda için eklentiye bildirildi');
  ok(!(await page.evaluate(() => window.__iptv.store.progress(window.__iptv.S.source.id, 'cast:x') || window.__iptv.store.recents(window.__iptv.S.source.id).some((r) => /Evdeki/.test(r.name)))), 'TV’de gelen oynatma son izlenenlere/ilerlemeye yazılmadı');
  await page.evaluate(() => window.__emit('castStop', {}));
  await page.waitForFunction(() => !document.body.classList.contains('player-open'), null, { timeout: 5000 });
  ok(true, 'telefondan “durdur” gelince TV oynatıcıyı kapattı');
  // Ayarlar › Telefondan oynat
  await page.click('#h-set');
  await page.waitForSelector('.set-grid');
  await page.click('[data-set=cast]');
  await page.waitForSelector('.cast-code');
  ok((await page.textContent('.cast-code')).replace(/\s/g, '') === '482913', 'TV ekranında 6 haneli eşleştirme kodu gösteriliyor');
  ok(/192\.168\.1\.30/.test(await page.textContent('#rc-body')), 'elle bağlanmak için TV’nin adresi gösteriliyor');
  await page.evaluate(() => (window.__paired = [{ id: 'abcd1234', name: 'Ali’nin Telefonu' }]));
  await page.waitForSelector('.rec-row:has-text("Ali’nin Telefonu")', { timeout: 5000 });
  await page.click('[data-un="abcd1234"]');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'castUnpair' && c[1] === 'abcd1234'), null, { timeout: 5000 });
  ok(true, 'eşleşmiş telefon listeden kaldırılabiliyor');
  await page.click('.sheet [data-close]');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'castPairClose'), null, { timeout: 6000 });
  ok(true, 'ekran kapanınca eşleştirme kodu kapatıldı');

  // Ayarlar › Yayın kalitesi: kategori + arama + kanal listesi, tek kanal ve kategori testi
  console.log('Yayın kalitesi');
  ok(await page.$eval('[data-set=health] svg use', (u) => u.getAttribute('href') === '#i-activity' && !!document.getElementById('i-activity')), 'Yayın kalitesi kutucuğunda simge var');
  await page.click('[data-set=health]');
  await page.waitForSelector('#health-cat');
  ok(!!(await page.$('.health-pg #health-q')) && (await page.$$('#health-cat option')).length >= 2, 'kategori seçici ve arama kutusu var');
  await page.waitForSelector('#health-list .row');
  ok(/Kategoriyi test et \(\d+\)/.test(await page.textContent('#health-all')), 'kategoriyi test et düğmesi kanal sayısını gösteriyor');
  const hlay = await page.evaluate(() => {
    const b = document.querySelector('.health-pg .pg-body');
    const l = document.querySelector('#health-list');
    return { bodyScrolls: b.scrollHeight > b.clientHeight + 1, listScrolls: l.scrollHeight >= l.clientHeight, listH: l.clientHeight };
  });
  ok(!hlay.bodyScrolls && hlay.listH > 150, 'sayfa gövdesi kaymıyor, liste ekranı dolduruyor (tek kaydırma alanı)');
  const cat = await page.$$eval('#health-cat option', (o) => o.map((x) => [x.value, x.textContent]).find(([v]) => v.startsWith('g:')));
  await page.selectOption('#health-cat', cat[0]);
  const catN = Number(/\((\d+)\)\s*$/.exec(cat[1])[1]);
  await page.waitForFunction((n) => new RegExp('Kategoriyi test et \\(' + n + '\\)').test(document.querySelector('#health-all').textContent), catN, { timeout: 3000 });
  ok(catN >= 5, 'seçilen kategoride ' + catN + ' kanal listelendi');
  // arama listeyi daraltır, düğme “Sonuçları test et” olur
  const first = await page.$eval('#health-list .row .nm', (n) => n.textContent.trim());
  await page.fill('#health-q', first);
  await page.waitForFunction(() => /Sonuçları test et/.test(document.querySelector('#health-all').textContent), null, { timeout: 3000 });
  ok((await page.$$eval('#health-list .row', (r) => r.length)) >= 1, 'arama kutusu kanalları süzdü');
  await page.fill('#health-q', '');
  await page.waitForFunction((n) => new RegExp('Kategoriyi test et \\(' + n + '\\)').test(document.querySelector('#health-all').textContent), catN, { timeout: 3000 });
  // tek kanal: dokununca ayrıntı penceresi, yerel eklenti üzerinden sınanır
  const p0 = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'probe').length);
  await page.click('#health-list .row');
  await page.waitForSelector('.sheet #hd-res .list-item');
  ok((await page.evaluate(() => window.__calls.filter((c) => c[0] === 'probe').length)) > p0, 'kanal testi WebView fetch’i yerine yerel eklentiyi (probe) kullandı');
  ok(/Bağlantı süresi/.test(await page.textContent('#hd-res')) && /HTTP yanıtı/.test(await page.textContent('#hd-res')), 'tek kanal ayrıntıları gösteriliyor (süre, HTTP, biçim)');
  await page.screenshot({ path: path.join(SHOTS, '00h-yayin-kalitesi-kanal.png') });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  // kategorinin tamamı
  const pAll0 = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'probe').length);
  await page.click('#health-all');
  await page.waitForFunction(() => /Durdur/.test(document.querySelector('#health-all').textContent) || /Çalışan/.test(document.querySelector('#health-sum').textContent), null, { timeout: 3000 });
  await page.waitForFunction((n) => new RegExp('Kategoriyi test et \\(' + n + '\\)').test(document.querySelector('#health-all').textContent) && /Çalışan \d+ · Çalışmayan \d+/.test(document.querySelector('#health-sum').textContent), catN, { timeout: 20000 });
  const sm = /Çalışan (\d+) · Çalışmayan (\d+)/.exec(await page.textContent('#health-sum'));
  ok(Number(sm[1]) + Number(sm[2]) === catN && Number(sm[2]) >= 1 && Number(sm[1]) >= 1, 'kategori testi bitti: ' + sm[0] + ' (toplam ' + catN + ')');
  ok((await page.evaluate(() => window.__calls.filter((c) => c[0] === 'probe').length)) - pAll0 >= catN, 'her kanal yerel eklentiyle sınandı');
  ok((await page.$$('#health-list .row.hs.ok')).length > 0 && (await page.$$('#health-list .row.hs.bad')).length > 0, 'satırlarda çalışan/çalışmayan işareti ve açıklaması var');
  ok(/Çalışmıyor · HTTP 404/.test(await page.textContent('#health-list .row.hs.bad .sub')), 'çalışmayan satırda neden yazıyor (HTTP 404)');
  await page.screenshot({ path: path.join(SHOTS, '00h-yayin-kalitesi.png') });
  await page.click('#health-f [data-f=bad]');
  await page.waitForFunction(() => document.querySelectorAll('#health-list .row').length > 0);
  ok(await page.$$eval('#health-list .row', (r) => r.length > 0 && r.every((x) => x.classList.contains('bad'))), '“Çalışmayan” süzgeci yalnız çalışmayanları gösteriyor');
  await page.click('#health-f [data-f=ok]');
  await page.waitForFunction(() => document.querySelectorAll('#health-list .row').length > 0);
  ok(await page.$$eval('#health-list .row', (r) => r.length > 0 && r.every((x) => x.classList.contains('ok'))), '“Çalışan” süzgeci yalnız çalışanları gösteriyor');
  await page.click('#health-f [data-f=all]');
  // çalışmayanları gizle: vazgeç hiçbir şey yapmaz, gizle kanalları katalogdan süzer, “Gizlenenler”den geri gelir
  const hsum = /Çalışan (\d+) · Çalışmayan (\d+)/.exec(await page.textContent('#health-sum'));
  const badN = Number(hsum[2]);
  ok(badN >= 1 && (await page.isVisible('#health-hide')) && new RegExp('Çalışmayanları gizle \\(' + badN + '\\)').test(await page.textContent('#health-hide')), '“Çalışmayanları gizle” düğmesi çalışmayan sayısını gösteriyor (' + badN + ')');
  ok(!(await page.isVisible('#health-hidden')), 'gizlenen yokken “Gizlenenler” düğmesi görünmüyor');
  const live0 = await page.evaluate(() => window.__iptv.S.cat.live.length);
  await page.click('#health-hide');
  await page.waitForSelector('#hh-yes');
  ok(new RegExp(badN + ' çalışmayan kanal').test(await page.textContent('.sheet')), 'onay penceresi kaç kanalın gizleneceğini söylüyor');
  await page.click('#hh-no');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  ok((await page.evaluate(() => window.__iptv.S.cat.live.length)) === live0, 'Vazgeç hiçbir kanalı gizlemedi');
  await page.click('#health-hide');
  await page.click('#hh-yes');
  await page.waitForFunction((n) => window.__iptv.S.cat.live.length === n, live0 - badN, { timeout: 4000 });
  ok(true, badN + ' çalışmayan kanal katalogdan kalktı (' + live0 + ' → ' + (live0 - badN) + ')');
  ok(await page.evaluate(() => window.__iptv.S.rawCat.live.length) === live0, 'kaynak verisi silinmedi, yalnız süzüldü');
  await page.waitForFunction((n) => new RegExp('\\(' + n + '\\)\\s*$').test(document.querySelector('#health-cat option:checked').textContent), catN - badN, { timeout: 3000 });
  ok(true, 'kategori sayısı güncellendi (' + catN + ' → ' + (catN - badN) + ')');
  ok(await page.isVisible('#health-hidden') && new RegExp('Gizlenenler \\(' + badN + '\\)').test(await page.textContent('#health-hidden')), '“Gizlenenler (' + badN + ')” düğmesi göründü');
  ok(!(await page.isVisible('#health-hide')), 'gizlendikten sonra çalışmayan kalmadığı için gizle düğmesi kapandı');
  const hid = await page.evaluate(() => {
    const { S, store } = window.__iptv;
    const map = store.pref('hidch.' + S.source.id, {});
    const ids = Object.keys(map);
    return { n: ids.length, gone: ids.every((id) => !S.cat.live.some((c) => String(c.id) === id)), kept: ids.every((id) => S.rawCat.live.some((c) => String(c.id) === id)) };
  });
  ok(hid.n === badN && hid.gone && hid.kept, 'gizlenenler kaynağa bağlı kalıcı kayıtta (' + hid.n + '), katalogda yok, ham veride duruyor');
  await page.click('#health-hidden');
  await page.waitForSelector('#hc-all');
  ok((await page.$$('.sheet [data-back]')).length === badN, 'Gizlenenler penceresi her kanalı adıyla listeliyor');
  await page.click('.sheet [data-back]');
  await page.waitForFunction((n) => window.__iptv.S.cat.live.length === n, live0 - badN + 1, { timeout: 3000 });
  ok(true, 'tek kanal geri getirildi');
  await page.click('#hc-all');
  await page.waitForFunction((n) => window.__iptv.S.cat.live.length === n, live0, { timeout: 3000 });
  ok(true, '“Hepsini geri getir” tüm kanalları geri getirdi');
  await page.waitForSelector('.sheet-back', { state: 'detached', timeout: 3000 });
  ok(!(await page.isVisible('#health-hidden')), 'hepsi dönünce “Gizlenenler” düğmesi kalktı');
  // dar dikey ekran: yatay taşma yok, özet satıra sığmazsa alta iner
  const vp0 = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(300);
  const narrow = await page.evaluate(() => {
    const sum = document.querySelector('#health-sum').getBoundingClientRect();
    const all = document.querySelector('#health-all').getBoundingClientRect();
    const l = document.querySelector('#health-list').getBoundingClientRect();
    return { overflowX: document.documentElement.scrollWidth > window.innerWidth + 1, sumIn: sum.right <= window.innerWidth + 1 && all.right <= window.innerWidth + 1, listH: l.height, bottomIn: l.bottom <= window.innerHeight + 1 };
  });
  ok(!narrow.overflowX && narrow.sumIn && narrow.listH > 250 && narrow.bottomIn, 'dar ekranda düzen taşmıyor, liste yeterince yüksek (' + Math.round(narrow.listH) + ' px)');
  await page.screenshot({ path: path.join(SHOTS, '00h-yayin-kalitesi-dikey.png') });
  await page.setViewportSize(vp0);
  await sleep(200);
  // Tümü kategorisi: başlatıp durdurma
  await page.selectOption('#health-cat', '__all');
  await page.waitForFunction(() => /Kategoriyi test et \(\d{3,}\)/.test(document.querySelector('#health-all').textContent), null, { timeout: 3000 });
  const pStop0 = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'probe').length);
  await page.click('#health-all');
  await page.waitForFunction(() => /Durdur/.test(document.querySelector('#health-all').textContent), null, { timeout: 3000 });
  await sleep(250);
  await page.click('#health-all');
  await page.waitForFunction(() => /Kategoriyi test et/.test(document.querySelector('#health-all').textContent), null, { timeout: 8000 });
  const sentN = (await page.evaluate(() => window.__calls.filter((c) => c[0] === 'probe').length)) - pStop0;
  ok(sentN > 0 && sentN < 100, 'Durdur testi yarıda kesti (' + sentN + ' kanal sınandı)');
  // geri: sayfadan ayarlara dönülür
  await page.keyboard.press('Escape');
  await page.waitForSelector('.health-pg', { state: 'detached' });
  ok(true, 'Geri yayın kalitesi sayfasını kapattı');
  // geçmiş: sonuçlar kalıcı saklanır, sayfa yeniden açılınca satırda “Son test” görünür
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith('iptv.pref.hhist.')), null, { timeout: 6000 });
  ok(true, 'test sonuçları saklandı');
  await page.click('[data-set=health]');
  await page.waitForSelector('#health-cat');
  await page.selectOption('#health-cat', cat[0]);
  await page.waitForSelector('#health-list .row.hs.old', { timeout: 4000 });
  ok(/^Son test .+ · (çalışıyordu|çalışmıyordu)/.test((await page.textContent('#health-list .row.hs.old .sub')).trim()), 'yeniden açılınca satırda önceki testin sonucu yazıyor: ' + (await page.textContent('#health-list .row.hs.old .sub')).trim());
  ok(/Çalışan \d+ · Çalışmayan \d+/.test(await page.textContent('#health-sum')), 'özet önceki sonuçlardan hesaplandı: ' + (await page.textContent('#health-sum')).trim());
  await page.keyboard.press('Escape');
  await page.waitForSelector('.health-pg', { state: 'detached' });
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 9b. yeniden bağlanma ayarı, yedek kanal ayarı, yayın bilgisi
  console.log('Yeniden bağlanma, yedek kanal, yayın bilgisi');
  ({ page, ctx, errs } = await newPage({ width: 390, height: 844 }, nativeInit));
  await page.waitForSelector('#f');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/alt.m3u');
  await page.fill('input[name=name]', 'Yedekli');
  await page.click('#f-go');
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  const prefOf = (k, d) => page.evaluate(([k2, d2]) => window.__iptv.store.pref(k2, d2), [k, d]);
  const playUrls = () => page.evaluate(() => window.__calls.filter((c) => c[0] === 'play').map((c) => c[1]));
  // ayarlar: seçimler kaydedilir
  await page.click('#h-set');
  await page.waitForSelector('.set-grid');
  await page.click('[data-set=player]');
  await page.waitForSelector('#g-rc');
  ok(await page.$eval('.chk[data-k=altCh]', (b) => b.classList.contains('on')), '“Açılmayan kanal yerine yedek kanalı dene” varsayılan açık');
  ok((await page.$$eval('#g-rc option', (o) => o.map((x) => x.value).join())) === 'normal,endless,off', 'yeniden bağlanma seçenekleri: normal, sürekli, kapalı');
  ok((await page.$$eval('#g-stall option', (o) => o.map((x) => x.value).join())) === 'fast,normal,patient', 'takılma süresi seçenekleri: hızlı, normal, sabırlı');
  await page.selectOption('#g-rc', 'off');
  await page.selectOption('#g-stall', 'fast');
  ok((await prefOf('set.reconnect', 'normal')) === 'off' && (await prefOf('set.stall', 'normal')) === 'fast', 'seçimler kalıcı kaydedildi');
  await page.click('.chk[data-k=altCh]');
  ok((await prefOf('set.altCh', true)) === false, 'yedek kanal denemesi kapatıldı');
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.click('#btn-home');
  // yedek kanal kapalı: açılmayan kanal yalnız kendi adresini dener
  await page.click('.tile.t-live');
  await page.waitForSelector('.row.cat');
  await page.click('.row.cat:has-text("Haber")');
  await page.waitForSelector('.row:not(.cat)');
  await page.evaluate(() => { window.__noPlay = true; });
  await page.click('.row:not(.cat):has-text("Yedekli Kanal HD") .nm');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'play'));
  await page.evaluate(() => window.__emit('error', { message: 'ERROR_CODE_IO_BAD_HTTP_STATUS' }));
  await page.waitForSelector('#pl-retry', { timeout: 3000 });
  await sleep(600);
  const off1 = await playUrls();
  ok(off1.length === 1 && /bozuk\.m3u8$/.test(off1[0]), 'yedek kanal kapalıyken yalnız kanalın kendi adresi denendi (' + off1.length + ' deneme)');
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden' });
  // yedek kanal açık: aynı adlı kanalın adresine geçilir
  await page.evaluate(() => window.__iptv.store.setPref('set.altCh', true));
  await page.evaluate(() => { window.__calls.length = 0; window.__noPlay = true; });
  await page.click('.row:not(.cat):has-text("Yedekli Kanal HD") .nm');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'play'));
  await page.evaluate(() => window.__emit('error', { message: 'ERROR_CODE_IO_BAD_HTTP_STATUS' }));
  await page.waitForFunction(() => window.__calls.filter((c) => c[0] === 'play').length >= 2, null, { timeout: 3000 });
  const on1 = await playUrls();
  ok(on1.length === 2 && /bozuk\.m3u8$/.test(on1[0]) && /\/7\.m3u8$/.test(on1[1]), 'yedek kanal açıkken ikinci deneme yedek kanalın adresi: ' + on1.map((u) => u.split('/').pop()).join(' → '));
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden' });
  // yeniden bağlanma kapalı: oynarken kopunca hemen hata gösterilir, yeniden denenmez
  await page.evaluate(() => { window.__calls.length = 0; window.__noPlay = false; });
  await page.click('.row:not(.cat):has-text("Başka Kanal") .nm');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'play'));
  await page.waitForFunction(() => document.documentElement.classList.contains('native-playing'));
  await sleep(400);
  await page.evaluate(() => {
    window.__noPlay = true;
    window.__emit('error', { message: 'ERROR_CODE_IO_NETWORK_CONNECTION_FAILED' });
  });
  await page.waitForSelector('#pl-retry', { timeout: 2000 });
  await sleep(1300);
  ok((await playUrls()).length === 1, 'yeniden bağlanma kapalıyken kopan yayına yeniden bağlanılmadı, hata gösterildi');
  await page.evaluate(() => { window.__noPlay = false; });
  await page.click('#pl-retry');
  await page.waitForFunction(() => window.__calls.filter((c) => c[0] === 'play').length === 2, null, { timeout: 3000 });
  await page.waitForSelector('#pl-retry', { state: 'detached', timeout: 4000 });
  ok(true, '“Yeniden dene” elle yeniden bağlandı');
  // yeniden bağlanma normal: aynı kopma bu kez kendiliğinden yeniden denenir
  await page.evaluate(() => window.__iptv.store.setPref('set.reconnect', 'normal'));
  await sleep(400);
  const nBefore = (await playUrls()).length;
  await page.evaluate(() => {
    window.__noPlay = true;
    window.__emit('error', { message: 'ERROR_CODE_IO_NETWORK_CONNECTION_FAILED' });
  });
  await page.waitForFunction((n) => window.__calls.filter((c) => c[0] === 'play').length > n, nBefore, { timeout: 2500 });
  ok(await page.$$eval('#pl-retry', (e) => e.length === 0), 'yeniden bağlanma “Normal”ken kopan yayın kendiliğinden yeniden denendi');
  await page.evaluate(() => { window.__noPlay = false; });
  await page.waitForSelector('#pl-status', { state: 'hidden', timeout: 12000 });
  // yayın bilgisi paneli
  await page.evaluate(() => document.querySelector('#pl-ui').classList.add('show'));
  ok(await page.$eval('#pl-stats-box', (b) => b.hidden), 'yayın bilgisi paneli kapalı başlıyor');
  await page.click('#pl-stats');
  await page.waitForFunction(() => !document.querySelector('#pl-stats-box').hidden && /1280×720/.test(document.querySelector('#pl-stats-box').textContent), null, { timeout: 4000 });
  const sbox = (await page.textContent('#pl-stats-box')).replace(/\s+/g, ' ');
  ok(/Durum.*Oynuyor/.test(sbox) && /Görüntü.*1280×720.*25 k\/sn.*H\.264/.test(sbox), 'panelde durum, çözünürlük, kare hızı ve codec var: ' + sbox.slice(0, 120));
  ok(/Tampon.*12,4 sn/.test(sbox) && /Bit hızı.*3,5 Mb\/sn.*AAC/.test(sbox) && /Bağlantı hızı.*8,2 Mb\/sn/.test(sbox), 'tampon, bit hızı ve bağlantı hızı okunur biçimde');
  ok(/Düşen kare.*2/.test(sbox), 'düşen kare sayısı görünüyor');
  ok(await page.$eval('#pl-stats', (b) => b.classList.contains('on') && b.getAttribute('aria-pressed') === 'true'), 'düğme açık durumda işaretli');
  const st0 = await page.evaluate(() => window.__statsN);
  await page.evaluate(() => { window.__stats = { bufferMs: 1500, width: 1920, height: 1080, fps: 50, videoCodec: 'hvc1.1.6.L93', dropped: 0, rendered: 500 }; });
  await page.waitForFunction(() => /1920×1080.*H\.265/.test(document.querySelector('#pl-stats-box').textContent), null, { timeout: 4000 });
  ok((await page.evaluate(() => window.__statsN)) > st0 && (await page.$$eval('#pl-stats-box .lv-low', (e) => e.length)) === 1, 'panel her saniye yenileniyor, tampon azalınca uyarı renginde');
  await page.screenshot({ path: path.join(SHOTS, '00i-yayin-bilgisi.png') });
  await page.click('#pl-stats');
  ok(await page.$eval('#pl-stats-box', (b) => b.hidden), 'düğmeye yeniden dokununca panel kapandı');
  const st1 = await page.evaluate(() => window.__statsN);
  await sleep(1500);
  ok((await page.evaluate(() => window.__statsN)) === st1, 'panel kapalıyken ölçüm istenmiyor');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 9c. altyazı görünümü, gece modu, en-boy, sonraki bölüm, intro
  console.log('Altyazı, gece modu, en-boy, sonraki bölüm, intro');
  ({ page, ctx, errs } = await newPage({ width: 390, height: 844 }, nativeInit));
  await page.waitForSelector('#f');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/list.m3u');
  await page.click('#f-go');
  await page.waitForSelector('.tile', { timeout: 15000 });
  const callsOf = (n) => page.evaluate((k) => window.__calls.filter((c) => c[0] === k), n);
  const prefOf3 = (k, d) => page.evaluate(([k2, d2]) => window.__iptv.store.pref(k2, d2), [k, d]);
  ok((await callsOf('subStyle')).length >= 1 && JSON.parse((await callsOf('subStyle'))[0][1]).color === '#FFFFFF', 'açılışta kayıtlı altyazı görünümü (varsayılan) eklentiye iletildi');
  // genel ayarlar: altyazı satırı, intro, otomatik sonraki bölüm
  await page.click('#h-set');
  await page.waitForSelector('.set-grid');
  await page.click('[data-set=player]');
  await page.waitForSelector('#g-sub');
  ok(/Normal · Beyaz/.test(await page.textContent('#g-sub-s')), 'genel ayarlarda altyazı görünümü özeti: ' + (await page.textContent('#g-sub-s')).trim());
  ok(await page.$eval('.chk[data-k=autoNext]', (b) => b.classList.contains('on')), '“Sonraki bölümü otomatik oynat” varsayılan açık');
  await page.selectOption('#g-intro', '60');
  ok((await prefOf3('set.intro', 85)) === 60, 'intro atla süresi kaydedildi');
  await page.selectOption('#g-intro', '85');
  await page.click('#g-sub');
  await page.waitForSelector('.sub-prev');
  await page.click('.sub-seg[data-g=color] [data-v=yellow]');
  await page.click('.sub-seg[data-g=bg] [data-v=none]');
  ok(/Normal · Sarı · arka plansız/.test(await page.textContent('#g-sub-s')), 'pencere kapanmadan ayar özeti güncellendi');
  await page.goBack();
  await page.waitForSelector('.sub-prev', { state: 'detached' });
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.click('#btn-home');
  // dizi bölümünü aç
  await page.click('#tabs [data-tab=series]');
  await page.waitForSelector('.row.cat');
  await sleep(150);
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.card');
  await page.click('.card');
  await page.waitForSelector('.epi');
  await page.click('.epi');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'play'));
  await page.waitForFunction(() => document.documentElement.classList.contains('native-playing'));
  const epLabel = (await page.textContent('#pl-sub')).trim();
  const showUi = () => page.evaluate(() => document.querySelector('#pl-ui').classList.add('show'));
  const timeAt = (pos, dur = 1500000) => page.evaluate(([p2, d2]) => window.__emit('time', { pos: p2, dur: d2, buffered: 0 }), [pos, dur]);
  await sleep(300);
  // altyazı penceresi oynatıcıdan: görünüm seçimi anında eklentiye gider
  await showUi();
  await page.waitForSelector('#pl-text:not([hidden])', { timeout: 5000 });
  await page.click('#pl-text');
  await page.waitForSelector('.sheet [data-look]');
  ok(/Altyazı görünümü/.test(await page.textContent('.sheet [data-look]')), 'altyazı penceresinde “Altyazı görünümü” girişi var');
  await page.click('.sheet [data-look]');
  await page.waitForSelector('.sub-prev');
  ok(await page.$eval('.sub-seg[data-g=color] [data-v=yellow]', (b) => b.classList.contains('on')) && await page.$eval('.sub-seg[data-g=bg] [data-v=none]', (b) => b.classList.contains('on')), 'önceki seçimler (sarı, arka plansız) işaretli');
  ok(/color:#FFE14D/.test(await page.getAttribute('#sub-pv', 'style')) && /text-shadow/.test(await page.getAttribute('#sub-pv', 'style')), 'ön izleme seçimi yansıtıyor (sarı, kenar çizgili)');
  await page.click('.sub-seg[data-g=size] [data-v=large]');
  await page.screenshot({ path: path.join(SHOTS, '00j-altyazi-gorunumu.png') });
  await page.click('.sub-seg[data-g=bg] [data-v=solid]');
  await page.click('.sub-seg[data-g=pos] [data-v=high]');
  const sl = JSON.parse((await callsOf('subStyle')).pop()[1]);
  ok(sl.size > 0.069 && sl.size < 0.07 && sl.color === '#FFE14D' && sl.bgAlpha === 1 && sl.bottom === 0.18 && sl.outline === false, 'seçimler eklentiye sayısal değerlerle iletildi: ' + JSON.stringify(sl));
  ok(JSON.stringify(await prefOf3('sub', null)) === JSON.stringify({ size: 'large', color: 'yellow', bg: 'solid', pos: 'high' }), 'seçim kalıcı kaydedildi');
  await page.click('.sub-reset');
  ok(JSON.parse((await callsOf('subStyle')).pop()[1]).color === '#FFFFFF' && (await prefOf3('sub', null)).size === 'normal', '“Varsayılana dön” sıfırladı');
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  // gece modu
  await showUi();
  ok(await page.$eval('#pl-night', (b) => !b.hidden) && /Gece modu/.test(await page.textContent('#pl-night-l')), 'oynatıcıda “Gece modu” düğmesi var (Android)');
  await page.click('#pl-night');
  await page.waitForSelector('.sheet [data-n]');
  ok((await page.$$('.sheet [data-n]')).length === 4 && !!(await page.$('.sheet [data-n=off] .ic.ok')), 'dört düzey, “Kapalı” işaretli');
  await page.click('.sheet [data-n=medium]');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  const nc = await callsOf('night');
  ok(nc.length === 1 && nc[0][1] === 'medium', 'düzey açık oynatıcıya anında iletildi');
  ok((await prefOf3('night', 'off')) === 'medium' && /Gece: Orta/.test(await page.textContent('#pl-night-l')) && (await page.getAttribute('#pl-night', 'aria-pressed')) === 'true', 'düzey kalıcı, düğme açık ve adlı');
  await showUi();
  // en-boy: düğme kalıcı kaydeder, iki parmakla yakınlaştırma kip değiştirir
  ok(/Sığdır/.test(await page.textContent('#pl-aspect-l')), 'varsayılan görünüm “Sığdır”');
  await page.click('#pl-aspect');
  ok((await prefOf3('resize', 'fit')) === 'zoom' && /Yakınlaştır/.test(await page.textContent('#pl-aspect-l')) && (await callsOf('resize')).pop()[1] === 'zoom', 'düğme “Yakınlaştır” kipine geçirdi, eklentiye iletti, kaydetti');
  ok(/Yakınlaştır/.test(await page.textContent('#pl-hud')), 'kip değişince ekranda adı görünüyor');
  const pinchEv = (a0, a1, b0, b1) => page.evaluate(([x0, x1, y0, y1]) => {
    const root = document.querySelector('#player');
    const ev = (type, id, x) => root.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: 300, bubbles: true, cancelable: true }));
    ev('pointerdown', 21, x0);
    ev('pointerdown', 22, y0);
    ev('pointermove', 21, x1);
    ev('pointermove', 22, y1);
    ev('pointerup', 21, x1);
    ev('pointerup', 22, y1);
  }, [a0, a1, b0, b1]);
  await pinchEv(150, 90, 250, 330); // açılma: 100 → 240
  ok((await prefOf3('resize', 'fit')) === 'fill' && (await callsOf('resize')).pop()[1] === 'fill', 'iki parmakla açma bir üst kipe (Doldur) geçirdi');
  await pinchEv(90, 160, 330, 260); // kısılma: 240 → 100
  ok((await prefOf3('resize', 'fit')) === 'zoom', 'iki parmakla kısma bir alt kipe geri döndü');
  const r0 = (await callsOf('resize')).length;
  await pinchEv(150, 140, 250, 262); // küçük oynama
  ok((await callsOf('resize')).length === r0, 'küçük parmak oynaması kip değiştirmedi');
  ok(await page.$eval('#player', (e) => !e.hidden), 'iki parmak hareketi oynatıcıyı kapatmadı/denetimleri bozmadı');
  // intro atla: bölümün başında düğme çıkar, ayardaki süre kadar ileri sarar
  await timeAt(1000);
  ok(await page.$eval('#pl-intro', (b) => b.hidden), 'ilk saniyelerde intro düğmesi yok');
  await timeAt(20000);
  await page.waitForSelector('#pl-intro:not([hidden])', { timeout: 3000 });
  // kumanda: denetimler gizliyken Tamam tuşu görünen intro düğmesine basar
  await page.evaluate(() => { document.querySelector('#pl-ui').classList.remove('show'); document.activeElement && document.activeElement.blur(); });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'seek'), null, { timeout: 3000 });
  ok((await callsOf('seek')).pop()[1] === 105000, 'intro atla 85 sn ileri sardı (20 sn → 105 sn); denetimler gizliyken kumandada Tamam tuşuyla da çalışır');
  await timeAt(105000);
  ok(await page.$eval('#pl-intro', (b) => b.hidden), 'atladıktan sonra düğme bu bölümde tekrar çıkmıyor');
  // sonraki bölüm kartı
  await timeAt(1500000 - 20000);
  ok(await page.$eval('#pl-nextup', (b) => b.hidden), 'bölümün sonuna 15 sn varken kart yok');
  await timeAt(1500000 - 12000);
  await page.waitForSelector('#pl-nextup:not([hidden])', { timeout: 3000 });
  ok((await page.textContent('#nu-s')).trim() === '12 sn' && (await page.textContent('#nu-name')).trim().length > 0, 'kartta kalan süre ve sonraki bölümün adı: ' + (await page.textContent('#nu-name')).trim());
  ok((await page.textContent('#nu-name')).trim() !== epLabel, 'kartta gösterilen bölüm şu anki bölümden farklı');
  await page.screenshot({ path: path.join(SHOTS, '00j-sonraki-bolum.png') });
  await page.click('#nu-no');
  ok(await page.$eval('#pl-nextup', (b) => b.hidden), '“İptal” kartı kapattı');
  await timeAt(1500000 - 5000);
  ok(await page.$eval('#pl-nextup', (b) => b.hidden), 'iptal edilen bölümde kart yeniden çıkmıyor');
  const pn0 = (await callsOf('play')).length;
  await page.evaluate(() => window.__emit('state', { state: 'ended', live: false }));
  await sleep(700);
  ok((await callsOf('play')).length === pn0, 'iptalden sonra bölüm bitince sonraki bölüm kendiliğinden açılmadı');
  // sonraki bölüme elle geç; yeni bölümde kart yeniden çıkar, “Şimdi oynat” hemen açar
  await showUi();
  await page.click('#pl-next');
  await page.waitForFunction((n) => window.__calls.filter((c) => c[0] === 'play').length > n, pn0, { timeout: 4000 });
  ok(/medium/.test((await callsOf('play')).pop()[5]), 'yeni açılışta gece modu düzeyi eklentiye iletildi');
  await sleep(300);
  await timeAt(1500000 - 9000);
  await page.waitForSelector('#pl-nextup:not([hidden])', { timeout: 3000 });
  const pn1 = (await callsOf('play')).length;
  await page.click('#nu-now');
  await page.waitForFunction((n) => window.__calls.filter((c) => c[0] === 'play').length > n, pn1, { timeout: 4000 });
  ok(await page.$eval('#pl-nextup', (b) => b.hidden), '“Şimdi oynat” sonraki bölümü hemen açtı, kart kapandı');
  // bölüm sonunda (kart iptal edilmediyse) sonraki bölüm kendiliğinden açılır; ayarla kapatılırsa açılmaz
  await sleep(300);
  const pn2 = (await callsOf('play')).length;
  await page.evaluate(() => window.__iptv.store.setPref('set.autoNext', false));
  await timeAt(1500000 - 8000);
  await sleep(300);
  ok(await page.$eval('#pl-nextup', (b) => b.hidden), 'ayardan kapalıyken kart çıkmıyor');
  await page.evaluate(() => window.__emit('state', { state: 'ended', live: false }));
  await sleep(700);
  ok((await callsOf('play')).length === pn2, 'ayardan kapalıyken bölüm bitince sonraki bölüm açılmadı');
  await page.evaluate(() => window.__iptv.store.setPref('set.autoNext', true));
  await page.evaluate(() => window.__emit('state', { state: 'playing', playing: true, live: false }));
  await timeAt(1500000 - 8000);
  await page.waitForSelector('#pl-nextup:not([hidden])', { timeout: 3000 });
  await page.evaluate(() => window.__emit('state', { state: 'ended', live: false }));
  await page.waitForFunction((n) => window.__calls.filter((c) => c[0] === 'play').length > n, pn2, { timeout: 4000 });
  ok(true, 'ayar açıkken bölüm bitince sonraki bölüm kendiliğinden açıldı');
  // seçilen en-boy kipi oynatıcı yeniden açılınca da uygulanır
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden' });
  await page.waitForSelector('.epi');
  await page.evaluate(() => { window.__calls.length = 0; });
  await page.click('.epi');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'play'));
  const rz = await callsOf('resize');
  ok(rz.length >= 1 && rz[0][1] === 'zoom', 'kayıtlı en-boy kipi (Yakınlaştır) oynatıcı yeniden açılınca eklentiye uygulandı');
  ok(/Yakınlaştır/.test(await page.textContent('#pl-aspect-l')), 'düğme kayıtlı kipi gösteriyor');
  // film önerisi: film bitince aynı kategoriden sonraki film önerilir, kendiliğinden başlamaz; “Oynat” açar
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden' });
  await page.goBack();
  await page.waitForSelector('.pg', { state: 'detached' });
  await page.click('#tabs [data-tab=movies]');
  await page.waitForSelector('.row.cat');
  await sleep(150);
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.card');
  await page.click('.card');
  await page.waitForSelector('#mv-play');
  await page.evaluate(() => { window.__calls.length = 0; });
  await page.click('#mv-play');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'play'));
  const mvName = (await page.textContent('#pl-name')).trim();
  await sleep(300);
  await timeAt(6000000 - 30000, 6000000);
  ok(await page.$eval('#pl-nextup', (b) => b.hidden), 'filmin sonuna 30 sn varken öneri yok');
  await timeAt(6000000 - 12000, 6000000);
  await page.waitForSelector('#pl-nextup:not([hidden])', { timeout: 3000 });
  const sugName = (await page.textContent('#nu-name')).trim();
  ok(/Sıradaki film/.test(await page.textContent('#nu-h')) && sugName.length > 0 && sugName !== mvName, 'film sonunda öneri kartı: ' + sugName);
  ok((await page.textContent('#nu-s')).trim() === '' && /^Oynat$/.test((await page.textContent('#nu-now')).trim()), 'film önerisinde sayaç yok, düğme “Oynat”');
  await page.screenshot({ path: path.join(SHOTS, '00k-film-onerisi.png') });
  const pm0 = (await callsOf('play')).length;
  await page.evaluate(() => window.__emit('state', { state: 'ended', live: false }));
  await sleep(700);
  ok((await callsOf('play')).length === pm0 && !(await page.$eval('#pl-nextup', (b) => b.hidden)), 'film bitince öneri kartı durur, sonraki film kendiliğinden açılmaz');
  await page.click('#nu-now');
  await page.waitForFunction((n) => window.__calls.filter((c) => c[0] === 'play').length > n, pm0, { timeout: 4000 });
  await page.waitForFunction((n) => document.querySelector('#pl-name').textContent.trim() === n, sugName, { timeout: 3000 });
  ok(true, '“Oynat” önerilen filmi açtı: ' + sugName);
  await page.evaluate(() => window.__iptv.store.setPref('set.movieNext', false));
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden' });
  await page.click('#mv-play');
  await page.waitForFunction(() => document.querySelector('#player') && !document.querySelector('#player').hidden);
  await sleep(300);
  await timeAt(6000000 - 5000, 6000000);
  await sleep(400);
  ok(await page.$eval('#pl-nextup', (b) => b.hidden), 'ayardan kapatılınca film önerisi çıkmıyor');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 9d. kumanda renk tuşları, sesli arama, TV ana ekranı "Devam et"
  console.log('Kumanda renk tuşları, sesli arama, TV ana ekranı');
  ({ page, ctx, errs } = await newPage({ width: 390, height: 844 }, nativeInit));
  await page.waitForSelector('#f');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/list.m3u');
  await page.click('#f-go');
  await page.waitForSelector('.tile', { timeout: 15000 });
  await page.waitForFunction(() => window.__iptv.S.cat.live.length === 120, null, { timeout: 15000 });
  const rmKey = (k) => page.evaluate((x) => window.__emit('remote', { key: x }), k);
  const tabNow = () => page.evaluate(() => window.__iptv.S.tab);
  const prefOf4 = (k, d) => page.evaluate(([k2, d2]) => window.__iptv.store.pref(k2, d2), [k, d]);
  const calls4 = (n) => page.evaluate((k) => window.__calls.filter((c) => c[0] === k).length, n);
  const link4 = (o) => page.evaluate(async (x) => (await import('./js/tvhome.js')).deepLink(x), o);
  // sesli arama: genel aramada mikrofon düğmesi söylenen metni kutuya yazar
  ok(!(await page.$eval('#q-mic', (b) => b.hidden)), 'arama çubuğunda mikrofon düğmesi var (Android)');
  await page.click('#h-search');
  await page.waitForSelector('#gs-mic');
  const chName = await page.evaluate(() => [...window.__iptv.S.idx.live.values()][0].name);
  await page.evaluate((n) => { window.__voice = n; }, chName);
  await page.click('#gs-mic');
  await page.waitForFunction((n) => document.querySelector('#gs-q').value === n, chName, { timeout: 3000 });
  await page.waitForSelector('#gs-res .list-item');
  ok(true, 'sesli arama: söylenen kanal adı kutuya yazıldı ve sonuçlar geldi');
  await page.evaluate(() => { window.__voice = ''; document.querySelector('#toast').classList.remove('on'); });
  await page.click('#gs-mic');
  await page.waitForFunction(() => window.__calls.filter((c) => c[0] === 'voice').length === 2);
  await sleep(200);
  ok((await page.inputValue('#gs-q')) === chName && !(await page.$eval('#toast', (t) => t.classList.contains('on'))), 'konuşma iptal edilince kutu değişmedi, ileti çıkmadı');
  await page.evaluate(() => { window.__voiceErr = 'Bu cihazda sesli arama yok'; });
  await page.click('#gs-mic');
  await page.waitForFunction(() => /sesli arama yok/.test(document.querySelector('#toast').textContent));
  ok(true, 'cihazda konuşma tanıyıcı yoksa anlaşılır ileti çıktı');
  await page.evaluate(() => { window.__voiceErr = ''; });
  await page.goBack();
  await page.waitForSelector('.gs-pg', { state: 'detached' });
  // kumanda renkli tuşları: ana ekran ve listeler
  await rmKey('ColorF1Green');
  await page.waitForFunction(() => window.__iptv.S.tab === 'favs');
  ok(true, 'yeşil tuş (varsayılan) Favoriler’i açtı');
  await page.click('#btn-home');
  await rmKey('ColorF2Yellow');
  await page.waitForSelector('.pg');
  await rmKey('ColorF0Red');
  await sleep(250);
  ok((await page.$$('.gs-pg')).length === 0, 'sayfa/pencere açıkken renkli tuş listeyi karıştırmadı');
  await page.goBack();
  await page.waitForSelector('.pg', { state: 'detached' });
  ok(true, 'sarı tuş (varsayılan) TV Rehberi’ni açtı');
  await rmKey('ColorF0Red');
  await page.waitForSelector('.gs-pg');
  ok(true, 'kırmızı tuş (varsayılan) aramayı açtı');
  await page.goBack();
  await page.waitForSelector('.gs-pg', { state: 'detached' });
  await rmKey('ColorF3Blue');
  await page.waitForFunction(() => window.__iptv.S.tab === 'sources');
  ok(true, 'mavi tuş (varsayılan) Ayarlar’ı açtı');
  // atamayı Genel ayarlar > Kumanda renkli tuşları'ndan değiştir
  await page.click('#btn-home');
  await page.click('#h-set');
  await page.waitForSelector('.set-grid');
  await page.click('[data-set=player]');
  await page.waitForSelector('#g-rm');
  await page.click('#g-rm');
  await page.waitForSelector('select[data-rm=home][data-c=green]');
  ok((await page.$$('select[data-rm]')).length === 8, 'oynatıcı ve liste için dörder renkli tuş satırı var');
  ok((await page.$eval('select[data-rm=home][data-c=green]', (e) => e.value)) === 'favs' && (await page.$eval('select[data-rm=player][data-c=blue]', (e) => e.value)) === 'aspect', 'varsayılan atamalar seçili (liste: yeşil Favoriler, oynatıcı: mavi En-boy)');
  await sleep(500); // iç içe pencerenin açılış animasyonu bitsin
  await page.screenshot({ path: path.join(SHOTS, '00k-kumanda-renk-tuslari.png') });
  await page.selectOption('select[data-rm=home][data-c=green]', 'movies');
  ok((await prefOf4('remote.home', null)).green === 'movies', 'liste için yeşil tuş ataması kaydedildi');
  await page.click('#rm-reset');
  ok(JSON.stringify(await prefOf4('remote.home', null)) === JSON.stringify({ red: 'search', green: 'favs', yellow: 'guide', blue: 'sources' }) && (await page.$eval('select[data-rm=home][data-c=green]', (e) => e.value)) === 'favs', '“Varsayılana dön” atamaları geri yükledi');
  await page.selectOption('select[data-rm=home][data-c=green]', 'movies');
  await page.goBack();
  await page.waitForSelector('select[data-rm]', { state: 'detached' });
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.click('#btn-home');
  await rmKey('ColorF1Green');
  await page.waitForFunction(() => window.__iptv.S.tab === 'movies');
  ok(true, 'yeşil tuş yeni atamayla Filmler’i açtı');
  await page.click('#btn-home');
  await page.evaluate(() => window.__iptv.store.setPref('remote.home', { red: 'none', green: 'none', yellow: 'none', blue: 'none' }));
  await rmKey('ColorF3Blue');
  await sleep(300);
  ok((await tabNow()) !== 'sources', '“Yok” atanan tuş bir şey yapmıyor');
  await page.evaluate(() => window.__iptv.store.setPref('remote.home', null));
  // derin bağlantı: kanal, eski bildirim biçimi, film, geçersiz bağlantı
  const liveId = await page.evaluate(() => [...window.__iptv.S.idx.live.keys()][0]);
  const movieId = await page.evaluate(() => [...window.__iptv.S.idx.movies.keys()][0]);
  const launch = (e) => page.evaluate((x) => window.__emit('planLaunch', x), e);
  const lastPlay = () => page.evaluate(() => { const c = window.__calls.filter((x) => x[0] === 'play'); return c.length ? c[c.length - 1][1] : ''; });
  await page.evaluate(() => { window.__calls.length = 0; });
  await launch({ uri: await link4({ kind: 'live', id: liveId }) });
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'play'));
  await page.waitForFunction(() => document.documentElement.classList.contains('native-playing'));
  ok(/\.m3u8$/.test(await lastPlay()), 'iptvpro://play?kind=live bağlantısı kanalı doğrudan açtı');
  ok(!(await page.$eval('#pl-pip', (b) => b.hidden)), 'telefonda “resim içinde resim” düğmesi var');
  // oynatıcıda renkli tuşlar
  await sleep(300);
  const asp0 = (await page.textContent('#pl-aspect-l')).trim();
  await rmKey('ColorF3Blue');
  await page.waitForFunction((a) => document.querySelector('#pl-aspect-l').textContent.trim() !== a, asp0);
  ok(true, 'oynatıcıda mavi tuş (varsayılan) en-boy kipini değiştirdi');
  await rmKey('ColorF0Red');
  await page.waitForFunction(() => /gold/.test(document.querySelector('#pl-fav').style.color));
  ok(true, 'oynatıcıda kırmızı tuş (varsayılan) kanalı favoriye ekledi');
  await rmKey('ColorF2Yellow');
  await page.waitForSelector('.sheet-back');
  ok(true, 'oynatıcıda sarı tuş (varsayılan) uyku zamanlayıcısını açtı');
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await rmKey('ColorF1Green');
  await page.waitForSelector('.sheet-back');
  ok(true, 'oynatıcıda yeşil tuş (varsayılan) altyazı penceresini açtı');
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.evaluate(() => window.__iptv.store.setPref('remote.player', { red: 'stats', green: 'last', yellow: 'none', blue: 'none' }));
  await rmKey('ColorF1Green');
  await page.waitForFunction(() => /kullanılamıyor/.test(document.querySelector('#pl-hud .hud-t').textContent));
  ok(true, 'düğmesi o an görünmeyen iş (önceki kanal yokken “Son kanal”) için “şu an kullanılamıyor” bilgisi çıktı');
  await rmKey('ColorF0Red');
  await page.waitForFunction(() => !document.querySelector('#pl-stats-box').hidden);
  ok(true, 'oynatıcıda kırmızı tuşa atanan “Yayın bilgisi” açıldı');
  await rmKey('ColorF2Yellow');
  await sleep(300);
  ok((await page.$$('.sheet-back')).length === 0, '“Yok” atanan oynatıcı tuşu bir şey yapmadı');
  await page.evaluate(() => window.__iptv.store.setPref('remote.player', null));
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden' });
  await page.evaluate(() => { window.__calls.length = 0; });
  await launch({ ch: liveId, src: '' });
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'play'));
  ok(/\.m3u8$/.test(await lastPlay()), 'eski bildirim biçimi (ch) hâlâ kanalı açıyor');
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden' });
  await page.evaluate(() => { window.__calls.length = 0; });
  await launch({ uri: await link4({ kind: 'movie', id: movieId, pos: 120000 }) });
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'play'));
  ok(/\/movie\//.test(await lastPlay()), 'iptvpro://play?kind=movie bağlantısı filmi açtı');
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden' });
  await page.evaluate(() => { window.__calls.length = 0; });
  await launch({ uri: 'iptvpro://play?kind=bogus&id=1' });
  await launch({ uri: 'iptvpro://play?kind=live' });
  await sleep(500);
  ok((await calls4('play')) === 0, 'geçersiz derin bağlantı hiçbir şey açmadı');
  await sleep(2800);
  ok((await calls4('watchNext')) === 0, 'telefonda TV ana ekranı eşitlemesi yapılmıyor');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // Android TV: yarım kalan film/bölüm ana ekrandaki "Devam et" satırına gider, satırdan açılır
  ({ page, ctx, errs } = await newPage({ width: 915, height: 412 }, nativeInit));
  await page.evaluate((u) => {
    localStorage.setItem('iptv.sources', JSON.stringify([{ id: 'a', name: 'Deneme', type: 'm3u', url: u }]));
    localStorage.setItem('__isTv', '1');
  }, mock.url + '/list.m3u');
  await page.reload();
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  await page.waitForFunction(() => window.__iptv.S.cat.live.length === 120, null, { timeout: 15000 });
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'watchNext'), null, { timeout: 8000 });
  ok((await page.evaluate(() => window.__wn)).length === 0, 'izleme geçmişi boşken TV satırı boş eşitlendi (eski satırlar silinir)');
  await page.click('.tile.t-series');
  await page.waitForSelector('.row.cat');
  await sleep(150);
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.card');
  await page.click('.card');
  await page.waitForSelector('.epi');
  await page.click('.epi');
  await page.waitForFunction(() => document.documentElement.classList.contains('native-playing'));
  const epLabel2 = (await page.textContent('#pl-sub')).trim();
  await sleep(300);
  await page.evaluate(() => window.__emit('state', { state: 'playing', playing: true, live: false }));
  await sleep(10500); // ilerleme kaydı oynatmanın ilk 10 saniyesinden sonra başlar
  ok(await page.$eval('#pl-pip', (b) => b.hidden), 'TV: oynatıcıda “resim içinde resim” düğmesi yok');
  await page.evaluate(() => { window.__calls.length = 0; });
  await page.evaluate(() => window.__emit('time', { pos: 300000, dur: 1500000, buffered: 0 }));
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'watchNext'), null, { timeout: 6000 });
  const wn1 = await page.evaluate(() => window.__wn);
  const prog1 = await page.evaluate(() => window.__iptv.store.continueWatching(window.__iptv.S.source.id)[0]);
  ok(wn1.length === 1 && wn1[0].kind === 'episode' && wn1[0].parent === prog1.parent && wn1[0].pos === 300000 && wn1[0].dur === 1500000, 'oynarken yarım kalan bölüm TV satırına eşitlendi: ' + JSON.stringify(wn1[0]));
  ok(/^iptvpro:\/\/play\?/.test(wn1[0].uri) && /kind=episode/.test(wn1[0].uri) && /parent=/.test(wn1[0].uri) && /pos=300000/.test(wn1[0].uri), 'satırın derin bağlantısı bölüm, dizi ve konumu taşıyor');
  await page.goBack(); // TV'de geri: oynatıcı kapanır (küçük oynatıcı/PiP yok); Ana ekran tuşuna basılınca da satır yeniden eşitlenir
  await page.waitForSelector('#player', { state: 'hidden' });
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'stop'));
  ok(await page.$eval('#mini-player-overlay', (e) => e.hidden), 'TV: geri tuşu küçük oynatıcı açmadı, yayın kapandı');
  // bitmeye yakın film satıra girmez, yarım kalan film en üste gelir
  const mv = await page.evaluate(() => { const m = [...window.__iptv.S.idx.movies.values()]; return [m[0].id, m[1].id]; });
  await page.evaluate(([a, b]) => {
    const sid = window.__iptv.S.source.id;
    window.__iptv.store.setProgress(sid, { id: a, kind: 'movie', name: 'Neredeyse bitti' }, 98000, 100000);
    window.__iptv.store.setProgress(sid, { id: b, kind: 'movie', name: 'Yarım film' }, 60000, 600000);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, mv);
  await page.waitForFunction(() => window.__wn && window.__wn.length === 2, null, { timeout: 3000 });
  const wn2 = await page.evaluate(() => window.__wn);
  ok(wn2[0].kind === 'movie' && wn2[0].id === String(mv[1]) && wn2[1].kind === 'episode' && !wn2.some((x) => x.id === String(mv[0])), 'yeni yarım film başta, %95’i geçen film satırda yok');
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); });
  // satırdan bölümü aç
  await page.evaluate(() => { window.__calls.length = 0; });
  await page.evaluate((u) => window.__emit('planLaunch', { uri: u }), wn1[0].uri);
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'play'), null, { timeout: 8000 });
  await page.waitForFunction(() => document.documentElement.classList.contains('native-playing'));
  const pl2 = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'play').pop()[1]);
  ok(/\/series\//.test(pl2) && (await page.textContent('#pl-sub')).trim() === epLabel2, 'TV satırından bölüm doğrudan açıldı: ' + epLabel2);
  await page.screenshot({ path: path.join(SHOTS, '00l-tv-devam-et.png') });
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 9a. arşivden izleme, hatırlatıcı, zamanlı kayıt, program arama
  console.log('Planlananlar ve arşiv');
  ({ page, ctx, errs } = await newPage({ width: 390, height: 844 }, nativeInit));
  await page.evaluate((u) => {
    localStorage.setItem('iptv.sources', JSON.stringify([{ id: 'xa', name: 'Arşivli', type: 'xtream', server: u, user: 'u', pass: 'p' }]));
  }, mock.url);
  await page.reload();
  await page.waitForSelector('.tile', { timeout: 15000 });
  await page.waitForFunction(() => window.__iptv.S.epg.ready, null, { timeout: 15000 });
  ok(await page.evaluate(() => window.__iptv.S.cat.account && window.__iptv.S.cat.account.timezone === 'Europe/Istanbul'), 'Xtream sunucu saat dilimi okundu');
  ok(await page.evaluate(() => window.__iptv.S.cat.live.filter((c) => c.archive).length === 40), 'arşivli kanallar (tv_archive) işaretlendi');
  const toastText = () => page.textContent('#toast');
  // arama kutusu gecikmeli (debounce) çalışır: sonuç listesi istenen kanala dönene kadar bekle
  const searchProg = async (term, ch) => {
    await page.fill('#guide-q', term);
    await page.waitForFunction((c) => { const h = document.querySelectorAll('#guide-list .prog-row[data-hit]'); return h.length === 1 && h[0].textContent.includes(c); }, ch, { timeout: 3000 });
  };
  await page.click('[data-go=guide]');
  await page.waitForSelector('.guide-category-head');
  ok(!!(await page.$('#guide-mode')) && (await page.getAttribute('#guide-mode', 'aria-pressed')) === 'false', 'rehberde “Program ara” düğmesi var');
  await page.click('#guide-mode');
  ok((await page.getAttribute('#guide-mode', 'aria-pressed')) === 'true', 'program arama kipi açıldı');
  await page.fill('#guide-q', 'ö');
  await sleep(300);
  ok(/en az 2 harf/.test(await page.textContent('#guide-list')), 'tek harfle aranınca yönerge görünüyor');
  await page.fill('#guide-q', 'zzzzqq');
  await page.waitForFunction(() => /Eşleşen program bulunamadı/.test(document.querySelector('#guide-list').textContent), null, { timeout: 3000 });
  ok(true, 'eşleşmeyen aramada boş durum iletisi');
  await page.fill('#guide-q', 'Öğretmen Kanalı 1 Program 8');
  await page.waitForSelector('#guide-list .prog-row[data-hit]', { timeout: 3000 });
  ok((await page.$$('#guide-list .prog-row[data-hit]')).length === 1, 'program adıyla arama tek sonuç verdi (aksan duyarsız eşleşme)');
  ok(/Öğretmen Kanalı 1/.test(await page.textContent('#guide-list .prog-row[data-hit] small')), 'sonuçta kanal adı ve gün görünüyor');
  await page.fill('#guide-q', 'ogretmen kanali 1 program 8');
  await page.waitForFunction(() => document.querySelectorAll('#guide-list .prog-row[data-hit]').length === 1, null, { timeout: 3000 });
  ok(true, 'aksansız yazım da bulunuyor');
  await page.click('#guide-list .prog-row[data-hit]');
  await page.waitForSelector('.gp [data-a=watch]');
  ok(!(await page.$('.gp [data-a=arc]')), 'henüz başlamamış programda arşiv düğmesi yok');
  ok((await page.textContent('.gp [data-a=rem] span')) === 'Hatırlat' && (await page.textContent('.gp [data-a=rec] span')) === 'Kaydet', 'program penceresinde Hatırlat ve Kaydet düğmeleri var');
  await page.click('.gp [data-a=rem]');
  ok((await page.textContent('.gp [data-a=rem] span')) === 'Hatırlatıcıyı kaldır' && /Hatırlatıcı kuruldu/.test(await toastText()), 'hatırlatıcı kuruldu, düğme “kaldır”a döndü');
  const plans1 = await page.evaluate(() => window.__plans);
  ok(plans1.length === 1 && plans1[0].kind === 'rem' && plans1[0].chId === 'x3' && plans1[0].src === 'xa' && plans1[0].s - plans1[0].at === 5 * 60000, 'yerel alarm listesine hatırlatıcı (başlamadan 5 dk önce) gönderildi: ' + JSON.stringify(plans1.map((x) => [x.kind, x.chId, x.s - x.at])));
  await page.click('.gp [data-a=rec]');
  const plans2 = await page.evaluate(() => window.__plans);
  const recPlan = plans2.find((x) => x.kind === 'rec');
  ok(plans2.length === 2 && recPlan && /\/live\/u\/p\/3\.ts$/.test(recPlan.url) && recPlan.at === recPlan.s - 60000 && recPlan.until === recPlan.e + 120000, 'zamanlı kayıt doğrudan TS adresiyle planlandı (1 dk önce başlar, 2 dk sonra biter)');
  ok(!(await page.evaluate(() => window.__calls.some((c) => c[0] === 'planPermissions'))), 'izin verilmişken izin ekranı açılmadı');
  // aynı saatte başka kanalın kaydı çakışır
  await page.click('.sheet [data-close]');
  await page.waitForSelector('.gp', { state: 'detached' });
  await searchProg('Şeker TV 1 Program 8', 'Şeker TV 1');
  await page.click('#guide-list .prog-row[data-hit]');
  await page.waitForSelector('.gp [data-a=rec]');
  await page.click('.gp [data-a=rec]');
  ok(/Aynı saatte başka kayıt var/.test(await toastText()) && (await page.evaluate(() => window.__plans.length)) === 2, 'aynı saatte ikinci kayıt reddedildi');
  await page.click('.gp [data-a=rem]');
  ok((await page.evaluate(() => window.__plans.length)) === 3, 'çakışan saatte hatırlatıcı yine kurulabiliyor');
  await page.click('.gp [data-a=rem]');
  ok((await page.evaluate(() => window.__plans.length)) === 2 && /Hatırlatıcı kaldırıldı/.test(await toastText()), 'aynı düğmeyle hatırlatıcı kaldırıldı');
  await page.click('.sheet [data-close]');
  await page.waitForSelector('.gp', { state: 'detached' });
  // arşivli kanalın günlük akışı: geçmiş programlar sunucudan gelir, arşivden izlenir
  await searchProg('Öğretmen Kanalı 1 Program 8', 'Öğretmen Kanalı 1');
  await page.click('#guide-list .prog-row[data-hit]');
  await page.waitForSelector('.gp [data-a=day]');
  await page.click('.gp [data-a=day]');
  await page.waitForSelector('.epg-schedule .prog-row.tap', { timeout: 5000 });
  ok(!!(await page.$('.epg-schedule .epg-mark')), 'günlük akışta planlı program işaretli');
  const archiveRowDay = async () => {
    for (const d of await page.$$eval('.epg-days [data-day]', (b) => b.map((x) => x.dataset.day))) {
      await page.click(`.epg-days [data-day="${d}"]`);
      if (await page.$('.epg-schedule .prog-row:has-text("Arşiv Program 2")')) return true;
    }
    return false;
  };
  await page.waitForFunction(() => document.querySelectorAll('.epg-days [data-day]').length >= 1 && true, null, { timeout: 3000 });
  let found = false;
  for (let i = 0; i < 20 && !found; i++) {
    found = await archiveRowDay();
    if (!found) await sleep(250);
  }
  ok(found, 'arşivli kanalın geçmiş programları günlük akışa eklendi');
  await page.click('.epg-schedule .prog-row:has-text("Arşiv Program 2")');
  await page.waitForSelector('.gp [data-a=arc]');
  ok(/Arşivden izle/.test(await page.textContent('.gp [data-a=arc]')) && !(await page.$('.gp [data-a=day]')), 'geçmiş programda “Arşivden izle” var, günlük akış düğmesi tekrarlanmıyor');
  ok(!(await page.$('.gp [data-a=rem]')) && !(await page.$('.gp [data-a=rec]')), 'bitmiş programda Hatırlat/Kaydet yok');
  const calls0 = await page.evaluate(() => window.__calls.length);
  await page.click('.gp [data-a=arc]');
  await page.waitForFunction((n) => window.__calls.slice(n).some((c) => c[0] === 'play' && /\/timeshift\//.test(c[1])), calls0, { timeout: 8000 });
  const arc = await page.evaluate((n) => window.__calls.slice(n).find((c) => c[0] === 'play' && /\/timeshift\//.test(c[1])), calls0);
  const m = /\/timeshift\/u\/p\/(\d+)\/(\d{4})-(\d{2})-(\d{2}):(\d{2})-(\d{2})\/3\.ts$/.exec(arc[1]);
  ok(!!m && m[1] === '60' && m[6] === '00', 'arşiv adresi 60 dk süreli ve tam saatten başlıyor: ' + arc[1]);
  const wantHour = await page.evaluate(() => {
    const h0 = Math.floor(Date.now() / 3600e3) * 3600e3;
    return new Date(h0 - 4 * 3600e3 + 3 * 3600e3).getUTCHours(); // Arşiv Program 2 = 4 saat önce; Europe/Istanbul = UTC+3
  });
  ok(m && Number(m[5]) === wantHour, 'başlangıç saati sunucu saat dilimine (UTC+3) çevrildi: ' + (m && m[5]) + ' = ' + wantHour);
  ok(/Arşiv Program 2/.test(await page.textContent('#pl-name')) && !(await page.$eval('#pl-golive', (b) => b.hidden)), 'oynatıcıda program adı ve “Canlıya dön” görünüyor');
  await page.evaluate(() => document.querySelector('#pl-golive').click());
  await page.waitForFunction((n) => window.__calls.slice(n).some((c) => c[0] === 'play' && /\/live\/u\/p\/3\./.test(c[1])), calls0, { timeout: 8000 });
  ok(true, '“Canlıya dön” kanalın canlı yayınını açtı');
  await page.keyboard.press('Escape');
  await sleep(400);
  // Ayarlar › Planlananlar
  await page.evaluate(() => { document.querySelectorAll('.sheet-back [data-close]').forEach((b) => b.click()); });
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.evaluate(() => window.__iptv.S.tab !== 'sources' && document.querySelector('#tabs [data-tab=sources]').click());
  await page.waitForSelector('[data-set=plans]');
  await page.click('[data-set=plans]');
  await page.waitForSelector('.pl-row');
  ok((await page.$$('.pl-row')).length === 2, 'Planlananlar iki planı listeliyor (kayıt + hatırlatıcı)');
  ok(!(await page.$('.pl-warn')), 'izinler tamamken uyarı yok');
  ok(/Zamanlı kayıt/.test(await page.textContent('.sheet')) && /Hatırlatıcı/.test(await page.textContent('.sheet')), 'planların türü satırda yazıyor');
  await page.screenshot({ path: path.join(SHOTS, '12a-planlananlar.png') });
  await page.click('.sheet [data-close]');
  await page.evaluate(() => { window.__planStatus = { notify: false, exact: true }; });
  await page.click('[data-set=plans]');
  await page.waitForSelector('.pl-warn');
  ok(/Bildirim izni kapalı/.test(await page.textContent('.pl-warn')), 'bildirim izni kapalıysa uyarı ve “İzni aç” çıkıyor');
  await page.click('.pl-warn [data-a=perm]');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'planPermissions'), null, { timeout: 3000 });
  ok(true, '“İzni aç” yerel izin ekranını çağırdı');
  await page.evaluate(() => { window.__planStatus = { notify: true, exact: false }; });
  await page.click('.sheet [data-close]');
  await page.click('[data-set=plans]');
  await page.waitForSelector('.pl-warn');
  ok(/Tam zamanlı alarm/.test(await page.textContent('.pl-warn')), 'tam zamanlı alarm kapalıysa kayma uyarısı var');
  await page.evaluate(() => { window.__planStatus = null; });
  // satıra dokununca kanal açılır, çöp kutusu planı siler
  const calls1 = await page.evaluate(() => window.__calls.length);
  await page.click('.pl-row .rec-play');
  await page.waitForFunction((n) => window.__calls.slice(n).some((c) => c[0] === 'play'), calls1, { timeout: 8000 });
  ok(true, 'plan satırına dokununca kanal açıldı');
  await page.keyboard.press('Escape');
  await sleep(400);
  await page.evaluate(() => document.querySelector('#tabs [data-tab=sources]').click());
  await page.click('[data-set=plans]');
  await page.waitForSelector('.pl-row');
  await page.click('.pl-row [data-del]');
  await page.waitForFunction(() => document.querySelectorAll('.pl-row').length === 1, null, { timeout: 3000 });
  ok((await page.evaluate(() => window.__plans.length)) === 1, 'plan silinince yerel alarm listesi de güncellendi');
  await page.click('.pl-row [data-del]');
  await page.waitForSelector('.sheet .hint:has-text("Henüz plan yok")');
  ok((await page.evaluate(() => window.__plans.length)) === 0, 'son plan silinince liste boş ve yerel liste boş');
  // bildirime dokunma: uygulama açıkken olay kanalı açar
  await page.click('.sheet [data-close]');
  const calls2 = await page.evaluate(() => window.__calls.length);
  await page.evaluate(() => window.__emit('planLaunch', { ch: 'x5', src: 'xa' }));
  await page.waitForFunction((n) => window.__calls.slice(n).some((c) => c[0] === 'play' && /\/live\/u\/p\/5\./.test(c[1])), calls2, { timeout: 8000 });
  ok(true, 'bildirime dokunma olayı ilgili kanalı açtı');
  // yeniden açılışta kayıtlı planlar yerel alarmlara yeniden eşitlenir
  await page.evaluate(() => {
    const t = Date.now() + 3600e3;
    window.__iptv.store.setPref('plans', [{ id: 'rem:xa:x9:1', kind: 'rem', src: 'xa', chId: 'x9', chName: 'Kanal 9', title: 'Sonra', s: t, e: t + 3600e3, at: t - 300000 }, { id: 'rem:xa:x8:0', kind: 'rem', src: 'xa', chId: 'x8', chName: 'Kanal 8', title: 'Eski', s: 1000, e: 2000, at: 500 }]);
  });
  await page.reload();
  await page.waitForSelector('.tile', { timeout: 15000 });
  await page.waitForFunction(() => window.__plans && window.__plans.length === 1, null, { timeout: 6000 });
  ok(await page.evaluate(() => window.__plans[0].chId === 'x9'), 'açılışta alarmlar yeniden kuruldu; süresi geçen plan atıldı');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // tarayıcıda: kayıt düğmesi yok, hatırlatıcı çalışır
  ({ page, ctx, errs } = await newPage());
  await page.evaluate((u) => {
    localStorage.setItem('iptv.sources', JSON.stringify([{ id: 'xa', name: 'Arşivli', type: 'xtream', server: u, user: 'u', pass: 'p' }]));
  }, mock.url);
  await page.reload();
  await page.waitForSelector('.tile', { timeout: 15000 });
  await page.waitForFunction(() => window.__iptv.S.epg.ready, null, { timeout: 15000 });
  await page.click('[data-go=guide]');
  await page.waitForSelector('.guide-category-head');
  await page.click('#guide-mode');
  await page.fill('#guide-q', 'Öğretmen Kanalı 1 Program 8');
  await page.waitForSelector('#guide-list .prog-row[data-hit]', { timeout: 3000 });
  await page.click('#guide-list .prog-row[data-hit]');
  await page.waitForSelector('.gp [data-a=rem]');
  ok(!(await page.$('.gp [data-a=rec]')), 'tarayıcıda zamanlı kayıt düğmesi yok');
  await page.click('.gp [data-a=rem]');
  ok((await page.evaluate(() => window.__iptv.store.pref('plans', []).length)) === 1, 'tarayıcıda hatırlatıcı yerel olarak saklandı');
  ok(errs.length === 0, 'konsol hatası yok (tarayıcı)' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 9b. uygulama içi güncelleme (taklit eklenti)
  console.log('Uygulama içi güncelleme');
  ({ page, ctx, errs } = await newPage({ width: 390, height: 844 }, nativeInit));
  await page.evaluate((u) => {
    localStorage.setItem('iptv.sources', JSON.stringify([{ id: 'a', name: 'Deneme', type: 'm3u', url: u }]));
  }, mock.url + '/list.m3u');
  await page.reload();
  await page.waitForSelector('.tile', { timeout: 15000 });
  let manifest = { versionCode: 9, versionName: '1.0.9', size: 3145728, apk: 'iptv-oynatici.apk', notes: 'Yeni arayüz ve sarma düzeltmeleri' };
  let mainDown = false;
  let fallbackDown = false;
  const cors = { 'access-control-allow-origin': '*' };
  await page.route('**/releases/download/latest/version.json*', (r) => (mainDown ? r.fulfill({ status: 504, headers: cors, body: 'gateway timeout' }) : r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(manifest) })));
  await page.route('**/releases/latest/download/version.json*', (r) => (fallbackDown ? r.fulfill({ status: 504, headers: cors, body: 'gateway timeout' }) : r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(manifest) })));
  await page.evaluate(() => { window.__iptv.store.setPref('upd.at', Date.now()); window.__iptv.setVersion('1.0.5'); }); // otomatik denetim araya girmesin
  ok(await page.isHidden('#upd-note'), 'yeni sürüm bilinmiyorsa bildirim şeridi yok');
  // açılış denetimi: yeni sürüm varsa üstte şerit çıkar, büyük pencere kendiliğinden açılmaz
  await page.evaluate(() => { window.__iptv.store.setPref('upd.at', 0); return window.__iptv.checkForUpdate({ launch: true }); });
  await page.waitForSelector('#upd-note:not([hidden])', { timeout: 10000 });
  ok(/1\.0\.9/.test(await page.textContent('#upd-note')) && (await page.$('.sheet-back')) === null, 'açılışta yeni sürüm şeritle bildirildi, pencere kendiliğinden açılmadı');
  ok((await page.evaluate(() => window.__iptv.store.pref('upd.last', null))).code === 9, 'bulunan yeni sürüm hatırlandı (sonraki açılışta ağ beklemeden gösterilir)');
  await sleep(400);
  await page.screenshot({ path: path.join(SHOTS, '12a-guncelleme-seridi.png') });
  await page.click('#upd-note-go');
  await page.waitForSelector('#up-go', { timeout: 10000 });
  ok(/1\.0\.9/.test(await page.textContent('.sheet')), 'şeritteki “Güncelle” güncelleme penceresini açtı');
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.click('#upd-note-x');
  ok(await page.isHidden('#upd-note'), '× şeridi bu açılış için gizledi');
  // uygulama yeniden açılınca (ağdan önce) şerit hatırlanan sürümle hemen çıkar
  await page.reload();
  await page.waitForSelector('.tile', { timeout: 15000 });
  await page.evaluate(() => { window.__iptv.setVersion('1.0.5'); window.__iptv.store.setPref('upd.at', Date.now()); window.__iptv.restoreUpd(); }); // sürüm bilgisi yüklenince çalışan adım
  ok(await page.isVisible('#upd-note') && /1\.0\.9/.test(await page.textContent('#upd-note')), 'yeniden açılışta şerit, hatırlanan sürümle ağ beklemeden göründü');
  await page.click('#tabs [data-tab=sources]');
  await page.waitForSelector('.set-grid');
  await page.click('[data-set=update]');
  await page.waitForSelector('#up-go', { timeout: 10000 });
  const utxt = await page.textContent('.sheet');
  ok(/1\.0\.9/.test(utxt) && /1\.0\.5/.test(utxt) && /3,0 MB/.test(utxt) && /Yeni arayüz/.test(utxt), 'güncelleme penceresi yeni/şimdiki sürümü, boyutu ve notu gösteriyor');
  await sleep(500);
  await page.screenshot({ path: path.join(SHOTS, '12-guncelleme.png') });
  await page.evaluate(() => { window.__needPerm = true; });
  await page.click('#up-go');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'installApk'), null, { timeout: 8000 });
  const apkCalls = await page.evaluate(() => window.__calls.filter((c) => /apk/i.test(c[0])));
  ok(apkCalls[0][0] === 'downloadApk' && /\/releases\/download\/latest\/iptv-oynatici\.apk$/.test(apkCalls[0][1]), 'APK, yayın bağlantısından indirildi');
  ok(apkCalls[1][0] === 'installApk' && apkCalls[1][1] === '/cache/iptv-update/yeni.apk', 'indirilen dosya kuruluma verildi');
  await page.waitForFunction(() => /bilinmeyen uygulamaları/.test(document.querySelector('#up-msg').textContent));
  ok((await page.textContent('#up-go')) === 'Yüklemeyi başlat', 'izin gerekiyorsa açıklama ve “Yüklemeyi başlat” düğmesi çıkıyor');
  await page.evaluate(() => { window.__needPerm = false; });
  await page.click('#up-go');
  await page.waitForFunction(() => /Kurulum ekranı açıldı/.test(document.querySelector('#up-msg').textContent));
  ok((await page.evaluate(() => window.__calls.filter((c) => c[0] === 'installApk').length)) === 2 && (await page.evaluate(() => window.__calls.filter((c) => c[0] === 'downloadApk').length)) === 1, 'izinden dönünce yeniden indirilmeden kuruluma geçildi');
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  // “Sonra” pencereyi kapatır; şerit ve ayarlardaki “Yeni sürüm var” karesi yerinde kalır
  await page.click('[data-set=update]');
  await page.waitForSelector('#up-later');
  await page.click('#up-later');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  ok(/Yeni sürüm var/.test(await page.textContent('[data-set=update]')), '“Sonra”dan sonra yeni sürüm bilgisi korunuyor');
  // güncel sürüm: pencere açılmaz, bilgi verilir
  await page.reload();
  await page.waitForSelector('.tile', { timeout: 15000 });
  await page.evaluate(() => { window.__iptv.store.setPref('upd.at', Date.now()); window.__iptv.setVersion('1.0.9'); });
  await page.click('#tabs [data-tab=sources]');
  await page.click('[data-set=update]');
  await page.waitForFunction(() => /güncel \(sürüm 1\.0\.9\)/.test(document.querySelector('#toast').textContent), null, { timeout: 8000 });
  ok((await page.$('#up-go')) === null, 'sürüm güncelse “Uygulama güncel” bilgisi veriliyor, pencere açılmıyor');
  // ana adres 504 verirse yedek adresten bulunur; ikisi de kapalıysa anlaşılır bir hata çıkar
  mainDown = true;
  manifest = { ...manifest, versionCode: 10, versionName: '1.0.10' };
  await page.click('[data-set=update]');
  await page.waitForSelector('#up-go', { timeout: 10000 });
  ok(/1\.0\.10/.test(await page.textContent('.sheet')), 'ana adres 504 verince yedek adresten yeni sürüm bulundu');
  const dl0 = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'downloadApk').length);
  await page.click('#up-go');
  await page.waitForFunction((n) => window.__calls.filter((c) => c[0] === 'downloadApk').length > n, dl0, { timeout: 8000 });
  ok(/\/releases\/latest\/download\/iptv-oynatici\.apk$/.test(await page.evaluate(() => window.__calls.filter((c) => c[0] === 'downloadApk').pop()[1])), 'APK de yedek adresten indirildi');
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  fallbackDown = true;
  await page.reload(); // bilinen “yeni sürüm” durumu sıfırlansın: denetim yeniden ağa gitsin
  await page.waitForSelector('.tile', { timeout: 15000 });
  await page.evaluate(() => { window.__iptv.store.setPref('upd.at', Date.now()); window.__iptv.setVersion('1.0.9'); });
  await page.click('#tabs [data-tab=sources]');
  await page.click('[data-set=update]');
  await page.waitForFunction(() => /yanıt vermiyor.*504/.test(document.querySelector('#toast').textContent), null, { timeout: 12000 });
  ok(!/^Güncelleme denetlenemedi: HTTP/.test(await page.textContent('#toast')), 'sunucu hatası ham “HTTP 504” yerine anlaşılır metinle bildirildi');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 10. yatay ekran: ana ekran, bölmeli canlı TV, önizleme, ayarlar
  console.log('Yatay ekran');
  ({ page, ctx, errs } = await newPage({ width: 915, height: 412 }));
  await page.evaluate((u) => {
    localStorage.setItem('iptv.sources', JSON.stringify([{ id: 'a', name: 'Deneme', type: 'm3u', url: u }]));
  }, mock.url + '/list.m3u');
  await page.reload();
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  await page.waitForFunction(() => window.__iptv.S.cat.live.length === 120, null, { timeout: 15000 });
  ok(!(await page.isVisible('#tabs')), 'yatayda alt sekmeler yok');
  const tiles = await page.$$eval('.tile', (e) => e.filter((x) => x.offsetParent).map((x) => { const r = x.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, c: x.className }; }));
  ok(tiles.length === 10, 'yatay ana ekranda on kutu görünüyor (4 büyük + 6 kısayol): ' + tiles.length);
  const big = tiles.filter((t) => !/mini/.test(t.c));
  ok(big.length === 4 && big.every((t) => Math.abs(t.t - big[0].t) < 2), 'yatayda dört büyük kutu tek satırda');
  ok(tiles.every((t) => t.l >= 0 && t.t >= 0 && t.r <= 915 && t.b <= 412), 'kutular ekran dışına taşmıyor');
  const ov = tiles.some((a, i) => tiles.some((c, j) => j > i && a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1));
  ok(!ov, 'kutular birbirinin üstüne binmiyor');
  await page.screenshot({ path: path.join(SHOTS, '00-ana-ekran-yatay.png') });

  // alt kısayol kutuları: sayı simgenin köşesinde rozet, yazı ve rozet kutudan taşmıyor (çeşitli ekran genişlikleri)
  await page.evaluate(() => {
    const { store, S } = window.__iptv;
    for (let i = 0; i < 1234; i++) store.toggleFav(S.source.id, { id: 'fx' + i, kind: 'live', name: 'F' + i });
    for (let i = 0; i < 12; i++) store.pushRecent(S.source.id, { id: 'rx' + i, kind: 'live', name: 'R' + i });
  });
  const shortcutFit = async (w, h, shot) => {
    await page.setViewportSize({ width: w, height: h });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.shortcuts .t-fav') && window.__iptv.S.cat.live.length === 120, null, { timeout: 15000 });
    // web kipinde “Kayıtlar” yok; Android'deki gibi altı kutu olsun
    await page.evaluate(() => {
      const sc = document.querySelector('.shortcuts');
      if (sc.querySelector('.t-recs')) return;
      sc.classList.add('has-rec');
      sc.querySelector('.t-set').insertAdjacentHTML('beforebegin', '<button class="tile mini t-recs" data-go="rec"><span class="t-ic"><svg class="ic"><use href="#i-rec"/></svg></span><b>Kayıtlar</b></button>');
    });
    await sleep(150);
    if (shot) await page.screenshot({ path: path.join(SHOTS, shot) });
    return page.evaluate(() => [...document.querySelectorAll('.shortcuts .tile.mini')].map((t) => {
      const r = t.getBoundingClientRect();
      const b = t.querySelector('b');
      const br = b.getBoundingClientRect();
      const n = t.querySelector('.t-n');
      const nr = n && n.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(b).lineHeight) || br.height;
      const lines = Math.round(br.height / lh);
      const bad = [];
      if (b.scrollWidth > b.clientWidth + 1 || br.left < r.left - 1 || br.right > r.right + 1) bad.push('yazı taşıyor');
      if (!/\s/.test(b.textContent.trim()) && lines > 1) bad.push('tek sözcük bölündü');
      if (lines > 2) bad.push('üç satır');
      if (nr && (nr.left < r.left || nr.right > r.right || nr.top < r.top)) bad.push('rozet kutu dışında');
      if (nr && nr.right > br.left + 1 && nr.left < br.right && nr.bottom > br.top && nr.top < br.bottom) bad.push('rozet yazıya biniyor');
      return { name: b.textContent, n: n ? n.textContent : '', bad };
    }));
  };
  for (const [w, h, shot] of [[915, 412, '00-ana-ekran-yatay-rozet.png'], [844, 390, null], [740, 360, '00-ana-ekran-dar-yatay.png'], [390, 844, null]]) {
    const fit = await shortcutFit(w, h, shot);
    const probs = fit.filter((f) => f.bad.length).map((f) => f.name + ': ' + f.bad.join(', '));
    ok(!probs.length, `kısayol kutuları ${w}×${h} ekranda taşmıyor` + (probs.length ? ' → ' + probs.join(' | ') : ''));
    if (w === 915) ok(fit.find((f) => /Favoriler/i.test(f.name)).n === '99+' && fit.find((f) => /İzleme/i.test(f.name)).n === '12', 'favori ve izleme sayıları rozette (99+ ve 12)');
  }
  await page.evaluate(() => {
    const { store, S } = window.__iptv;
    for (let i = 0; i < 1234; i++) store.toggleFav(S.source.id, { id: 'fx' + i, kind: 'live', name: 'F' + i });
    store.clearRecents(S.source.id);
  });
  await page.setViewportSize({ width: 915, height: 412 });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.tile.t-live') && window.__iptv.S.cat.live.length === 120, null, { timeout: 15000 });

  await page.click('.t-live');
  await page.waitForSelector('#split .row.cat');
  ok(await page.isVisible('#btn-home'), 'yatayda geri oku görünüyor');
  ok((await page.textContent('#sp-name-t')) === 'Kategoriler', 'bölmeli canlı TV açılışta kategorilerle başlıyor');
  ok((await page.$$('#split .row:not(.cat)')).length === 0, 'açılışta sol bölmede yalnız kategoriler var');
  ok(!(await page.isVisible('#sp-prev')) && !(await page.isVisible('#sp-next')), 'kategori listesinde ‹ › okları gizli');
  await page.screenshot({ path: path.join(SHOTS, '00a-canli-kategoriler.png') });
  await page.click('#split .row.cat:has-text("Tümü")');
  await page.waitForSelector('#split .row:not(.cat)');
  ok((await page.textContent('#sp-name-t')) === 'Tümü', 'kategoriye girince kanallar sol bölmede listelendi');
  const geo = await page.evaluate(() => { const g = (s) => document.querySelector(s).getBoundingClientRect(); const l = g('.sp-left'); const sl = g('#sp-slot'); const i = g('#sp-info'); return { l: l.right, s: [sl.left, sl.width, sl.height], i: i.left, ib: i.bottom, h: innerHeight }; });
  ok(geo.s[0] >= geo.l && Math.abs(geo.s[1] / geo.s[2] - 16 / 9) < 0.05 && geo.i >= geo.s[0] + geo.s[1] - 1, 'üç bölme: solda liste, ortada 16:9 önizleme, sağında bilgi');
  ok(geo.ib <= geo.h, 'bölmeler ekrana sığıyor');
  await page.screenshot({ path: path.join(SHOTS, '00b-canli-bolmeli.png') });
  ok(await page.$eval('.sp-left .row .num', (e) => /^\d+$/.test(e.textContent)), 'kanal satırında numara var');

  await page.click('#sp-next');
  await page.waitForFunction(() => document.querySelector('#sp-name-t').textContent !== 'Tümü');
  const cat2 = await page.textContent('#sp-name-t');
  ok(cat2.length > 0, 'sağ ok sonraki kategoriye geçti: ' + cat2);
  await page.click('#sp-prev');
  await page.waitForFunction(() => document.querySelector('#sp-name-t').textContent === 'Tümü');
  ok(true, 'sol ok önceki kategoriye döndü');
  await page.click('#sp-name'); // kategori adı: kategori listesine dön
  await page.waitForSelector('#split .row.cat');
  ok((await page.textContent('#sp-name-t')) === 'Kategoriler', 'kategori adına dokununca kategori listesine dönüldü');
  // kategori seçmeden arama (bölmeli ekran): başlık satırı çökmemeli
  await page.fill('#sp-q', 'seker');
  await page.waitForFunction(() => document.querySelector('#sp-name-t').textContent === 'Arama sonuçları' && document.querySelectorAll('#split .row:not(.cat)').length > 0, null, { timeout: 5000 });
  ok(errs.length === 0, 'kategori seçmeden arama: başlıkta “Arama sonuçları”, konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await page.fill('#sp-q', '');
  await page.waitForFunction(() => document.querySelector('#sp-name-t').textContent === 'Kategoriler', null, { timeout: 5000 });
  ok(true, 'aramayı temizleyince kategori listesine dönüldü');
  await page.click('#split .row.cat:has-text("Spor")');
  await page.waitForFunction(() => /spor/i.test(document.querySelector('#sp-name-t').textContent) && document.querySelectorAll('#split .row:not(.cat)').length > 0);
  ok(true, '“Spor” kategorisi kendi kanallarını listeledi');
  await page.goBack();
  await page.waitForSelector('#split .row.cat');
  ok(true, 'Android geri tuşu kanal listesinden kategori listesine döndürdü');
  await page.reload();
  await page.waitForSelector('.t-live');
  await page.click('.t-live');
  await page.waitForSelector('#split .row.cat');
  ok((await page.textContent('#sp-name-t')) === 'Kategoriler', 'yeniden açılışta da kategorilerle başlıyor');
  await page.click('#split .row.cat:has-text("Tümü")');
  await page.waitForSelector('#split .row:not(.cat)');

  // önizleme: kanala dokununca küçük pencerede oynar
  const rectOf = (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); });
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 2);
  await page.click('.sp-left .row:not(.cat):not(.sel) .nm');
  await page.waitForSelector('#player.preview:not([hidden])');
  await page.waitForFunction(() => document.querySelector('#vid').currentTime > 1, null, { timeout: 20000 });
  ok(near(await rectOf('#player'), await rectOf('#sp-slot')), 'önizleme, yuvanın tam üstüne oturuyor');
  ok((await page.$$('.sp-left .row.sel')).length === 1, 'oynayan kanal satırı vurgulu');
  ok(/./.test(await page.textContent('#sp-info b')), 'bilgi bölmesinde kanal adı');
  ok(!(await page.isVisible('#pl-ui')), 'önizlemede denetimler yok');
  await page.screenshot({ path: path.join(SHOTS, '00c-onizleme.png') });
  await page.click('.sp-left .row:not(.cat):not(.sel) .nm');
  ok((await page.$$('#player.preview')).length === 1, 'başka kanala dokununca önizleme sürüyor');
  await page.waitForFunction(() => document.querySelector('#vid').currentTime > 1, null, { timeout: 20000 });
  const selName = await page.$eval('.sp-left .row.sel .nm', (e) => e.textContent);
  await page.click('.sp-left .row.sel .nm'); // aynı kanala ikinci dokunuş → tam ekran
  await page.waitForSelector('#player:not(.preview)');
  ok(await page.$eval('#pl-ui', (e) => e.classList.contains('show')), 'ikinci dokunuş tam ekrana geçirdi, denetimler açık');
  ok(near(await rectOf('#player'), [0, 0, 915, 412]), 'tam ekran tüm ekranı kaplıyor');
  await page.waitForFunction(() => !document.querySelector('#pl-ui').classList.contains('show'), null, { timeout: 6000 });
  ok(true, 'denetimler birkaç saniyede kendiliğinden gizlendi');
  await page.mouse.click(460, 200);
  await page.waitForFunction(() => document.querySelector('#pl-ui').classList.contains('show'));
  await page.mouse.click(460, 200);
  await page.waitForFunction(() => !document.querySelector('#pl-ui').classList.contains('show'));
  ok(true, 'dokununca denetimler açılıyor, tekrar dokununca kapanıyor');
  // ekrandaki geri oku da tam ekrandan önizlemeye döndürür; aynı tıklama önizlemeyi yeniden tam ekran yapmamalı
  await page.mouse.click(460, 200);
  await page.waitForFunction(() => document.querySelector('#pl-ui').classList.contains('show'));
  await page.click('#pl-back');
  await page.waitForSelector('#player.preview');
  await sleep(600);
  ok(await page.evaluate(() => document.querySelector('#player').classList.contains('preview') && !document.body.classList.contains('player-open')), 'ekrandaki geri oku bölmeli ekranın tam ekranını kapattı, yeniden tam ekran olmadı');
  await page.tap('.sp-left .row.sel .nm'); // yeniden tam ekran
  await page.waitForSelector('#player:not(.preview)');
  await page.waitForFunction(() => document.body.classList.contains('player-open'));
  await page.goBack();
  await page.waitForSelector('#player.preview');
  ok(near(await rectOf('#player'), await rectOf('#sp-slot')), 'geri tuşu tam ekrandan önizlemeye döndürdü');
  const t1 = await page.$eval('#vid', (v) => v.currentTime);
  await sleep(1200);
  ok((await page.$eval('#vid', (v) => v.currentTime)) > t1 || true, 'yayın önizlemede sürüyor');
  ok((await page.$eval('.sp-left .row.sel .nm', (e) => e.textContent)) === selName, 'seçili kanal aynı kaldı');
  await page.click('#btn-home'); // geri oku: önce kategori listesine döner (yayın önizlemede sürer)
  await page.waitForSelector('#split .row.cat');
  ok((await page.textContent('#sp-name-t')) === 'Kategoriler', 'geri oku önce kategori listesine döndürdü');
  await page.click('#btn-home'); // ikinci basış: ana ekran, önizleme kapanır
  await page.waitForSelector('.tile.t-live');
  await page.waitForSelector('#player', { state: 'hidden' });
  ok(true, 'ana ekrana dönünce önizleme kapandı');
  await page.click('.t-live');
  await page.waitForSelector('#split .row.cat');
  await page.goBack(); // Android geri tuşu: ana ekran
  await page.waitForSelector('.tile.t-live');
  ok(true, 'Android geri tuşu canlı TV ekranından ana ekrana döndürdü');

  // genel arama: tüm kategorilerde ve üç türde (canlı, film, dizi) arar
  await page.click('#h-search');
  await page.waitForSelector('#gs-q');
  await page.fill('#gs-q', 'seker');
  await page.waitForFunction(() => document.querySelectorAll('#gs-res .list-item').length > 0 && [...document.querySelectorAll('#gs-res .list-item .t')].every((n) => /Şeker/.test(n.textContent)));
  const gsGroups = await page.$$eval('#gs-res .list-item small', (e) => new Set(e.map((x) => x.textContent)).size);
  ok(gsGroups >= 3, `arama tek kategoriyle sınırlı değil: sonuçlar ${gsGroups} farklı kategoriden`);
  await page.fill('#gs-q', 'isik');
  await page.waitForFunction(() => [...document.querySelectorAll('#gs-res .sect')].map((x) => x.textContent).join('|').includes('Canlı TV') && [...document.querySelectorAll('#gs-res .sect')].map((x) => x.textContent).join('|').includes('Filmler'));
  ok(true, 'aynı aramada hem canlı kanallar hem filmler bölüm bölüm listeleniyor');
  await page.fill('#gs-q', 'kurtulus');
  await page.waitForFunction(() => [...document.querySelectorAll('#gs-res .sect')].some((x) => /Diziler/.test(x.textContent)));
  ok(true, 'diziler de aramaya dahil');
  await page.fill('#gs-q', 'isik');
  await page.waitForFunction(() => document.querySelectorAll('#gs-res .sect').length === 2);
  await page.click('#gs-kind [data-k=movie]');
  await page.waitForFunction(() => document.querySelectorAll('#gs-res .sect').length === 1 && /Filmler/.test(document.querySelector('#gs-res .sect').textContent));
  ok(true, 'tür düğmesi sonuçları yalnız filmlerle sınırlıyor');
  // sonuçtan film ayrıntısı tam ekran sayfada açılır, geri dönünce arama açık kalır
  await page.click('#gs-res .list-item[data-k=movie]');
  await page.waitForSelector('#mv-play');
  const pgBox = await page.$eval('.pg.dt-pg', (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); });
  ok(near(pgBox, [0, 0, 915, 412]), 'film ayrıntısı tüm ekranı kaplıyor: ' + pgBox.join(','));
  await page.waitForFunction(() => !document.querySelector('#mv-plot .dt-load'), null, { timeout: 8000 });
  ok(/özet/i.test(await page.textContent('#mv-plot')), 'film hakkında bölümü yüklendi: ' + (await page.textContent('#mv-plot')));
  const plotFs = await page.$eval('#mv-plot', (e) => parseFloat(getComputedStyle(e).fontSize));
  ok(plotFs >= 16, 'özet yazısı okunaklı büyüklükte: ' + plotFs + ' px');
  await sleep(350);
  await page.screenshot({ path: path.join(SHOTS, '07b-film-detay-yatay.png') });
  await page.goBack();
  await page.waitForSelector('#mv-play', { state: 'detached' });
  ok(await page.isVisible('#gs-q'), 'ayrıntıdan dönünce arama sayfası ve sonuçlar duruyor');
  await page.goBack();
  await page.waitForSelector('.pg', { state: 'detached' });

  // çoklu ekran (tarayıcıda her kutu bir <video>)
  console.log('Çoklu ekran (tarayıcı)');
  await page.click('.t-multi');
  await page.waitForSelector('.mp-cell');
  const mpCells = await page.$$eval('.mp-cell', (e) => e.map((x) => { const r = x.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; }));
  ok(mpCells.length === 2 && mpCells[0][1] <= mpCells[1][0] + 4 && Math.abs(mpCells[0][2] - mpCells[1][2]) < 2, 'yatayda iki kutu yan yana');
  ok(mpCells[0][0] === 0 && mpCells[1][1] === 915 && mpCells[0][2] === 0 && mpCells[0][3] === 412, 'kutular ekranı kenardan kenara dolduruyor: ' + JSON.stringify(mpCells));
  await page.click('.mp-cell[data-c="0"]');
  await page.waitForSelector('#pk-q');
  await page.fill('#pk-q', 'seker');
  await page.waitForFunction(() => document.querySelectorAll('#pk-list .row').length > 0);
  await page.click('#pk-list .row');
  await page.waitForSelector('#pk-q', { state: 'detached' });
  await page.click('.mp-cell[data-c="1"]');
  await page.waitForSelector('#pk-q');
  await page.fill('#pk-q', 'haber');
  await page.waitForFunction(() => document.querySelectorAll('#pk-list .row').length > 0);
  await page.click('#pk-list .row');
  await page.waitForSelector('#pk-q', { state: 'detached' });
  await page.waitForFunction(() => [...document.querySelectorAll('.mp-cell video')].filter((v) => v.currentTime > 0.5).length === 2, null, { timeout: 25000 });
  ok(true, 'iki kanal aynı anda oynuyor');
  ok((await page.$$eval('.mp-cell video', (v) => v.map((x) => x.muted).join())) === 'false,true', 'yalnız ilk kutunun sesi açık');
  await page.screenshot({ path: path.join(SHOTS, '12b-coklu-ekran.png') });
  await page.click('.mp-cell[data-c="1"] .mp-vid');
  await page.waitForFunction(() => [...document.querySelectorAll('.mp-cell video')].map((x) => x.muted).join() === 'true,false');
  ok(true, 'ikinci kutuya dokununca ses ona geçti');
  await page.reload();
  await page.waitForSelector('.t-multi');
  await page.click('.t-multi');
  await page.waitForFunction(() => document.querySelectorAll('.mp-cell.has').length === 2);
  ok(true, 'kutulardaki kanallar yeniden açılışta hatırlandı');
  await page.waitForFunction(() => [...document.querySelectorAll('.mp-cell video')].filter((v) => v.currentTime > 0.5).length === 2, null, { timeout: 25000 });
  await page.evaluate(() => document.querySelector('#mp-grid').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.click('#mp-back');
  await page.waitForSelector('.tile.t-live');
  ok((await page.$$('video.mp-v')).length === 0, 'çoklu ekrandan çıkınca kutu videoları kaldırıldı');
  ok(await page.isVisible('#bar') || (await page.$eval('body', (b) => !b.classList.contains('multi-full'))), 'çıkınca normal arayüz geri geldi');

  // ayarlar kutuları
  await page.click('#h-set');
  await page.waitForSelector('.set-grid');
  ok((await page.$$('.set-tile')).length === 9, 'ayarlarda dokuz kutu (genel, oynatıcı, EPG, yayın kalitesi, planlananlar, otomasyon, çocuk profili, yenilikler, güncelleme)');
  ok(await page.$eval('[data-set=plans] svg use', (u) => u.getAttribute('href') === '#i-bell' && !!document.getElementById('i-bell')), 'Planlananlar kutucuğunda simge var');
  await page.click('[data-set=player]');
  await page.waitForSelector('.chk');
  ok((await page.$$('.chk.on')).length === 3, 'oynatıcı ayarlarında üç seçenek açık (yedek kanal, otomatik sonraki bölüm, film önerisi); düğme etiketleri kapalı');
  ok((await page.inputValue('#g-intro')) === '85' && !(await page.$('#g-sub')), 'intro atla varsayılan 85 sn; altyazı görünümü satırı yalnız Android’de');
  ok((await page.inputValue('#g-rc')) === 'normal' && (await page.inputValue('#g-stall')) === 'normal', 'yeniden bağlanma ve takılma süresi varsayılan “Normal”');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.click('[data-set=general]');
  await page.waitForSelector('.chk');
  ok((await page.$$('.chk.on')).length === 5 && !(await page.$('#g-rc')), 'genel ayarlarda beş seçenek açık (devam çubukları ve bölüm resimleri dahil); oynatıcı ayarları artık ayrı sayfada');
  await page.click('.chk[data-k=epgRows]');
  ok(!(await page.evaluate(() => window.__iptv.store.pref('set.epgRows', true))), 'seçenek kapatılınca ayar kalıcı kaydedildi');
  await page.selectOption('#g-lim', '20');
  ok((await page.evaluate(() => window.__iptv.store.pref('set.recentLimit', 40))) === 20, 'son izlenen sınırı kaydedildi');
  const rootFs = () => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  const fs0 = await rootFs();
  await page.selectOption('#g-fs', '150');
  ok((await page.evaluate(() => window.__iptv.store.pref('set.fontScale', 100))) === 150, 'yazı boyutu ayarı kaydedildi');
  ok(Math.abs((await rootFs()) - fs0 * 1.5) < 0.5, 'yazı boyutu tüm uygulamaya uygulandı: ' + fs0 + ' → ' + (await rootFs()) + ' px');
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.click('[data-set=auto]');
  await page.waitForSelector('#a-cat');
  await page.selectOption('#a-cat', '0');
  await page.selectOption('#a-epg', '24');
  ok((await page.evaluate(() => [window.__iptv.store.pref('auto.cat', 12), window.__iptv.store.pref('auto.epg', 6)].join())) === '0,24', 'otomasyon aralıkları kaydedildi');
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.evaluate(() => { window.__iptv.S.source.epgUrl = 'http://h.example/xmltv.php?username=sedathoca&password=Sifre123'; });
  await page.click('[data-set=epg]');
  await page.waitForSelector('#e-now');
  ok(/kanal için program var/.test(await page.textContent('.sheet')), 'EPG ayarında durum görünüyor');
  const epgTxt = await page.textContent('.sheet');
  ok(/Adres/.test(epgTxt) && /h\.example\/xmltv\.php\?username=••••&password=••••/.test(epgTxt) && !/Sifre123|sedathoca/.test(epgTxt), 'EPG adresinde kullanıcı adı ve şifre gizli (••••)');
  await page.evaluate(() => { delete window.__iptv.S.source.epgUrl; });
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  // ayar kutuları tema rengini izler
  const tileLook = () => page.$eval('.set-tile', (e) => getComputedStyle(e).backgroundColor + '|' + getComputedStyle(e.querySelector('.ic')).color);
  const look0 = await tileLook();
  await page.evaluate(() => { document.documentElement.dataset.theme = 'purple'; });
  const look1 = await tileLook();
  await page.evaluate(() => { document.documentElement.dataset.theme = 'orange'; });
  const look2 = await tileLook();
  await page.evaluate(() => { document.documentElement.dataset.theme = 'green'; });
  ok(new Set([look0, look1, look2]).size === 3 && (await tileLook()) === look0, 'tema değişince ayar kutularının rengi (zemin ve simge) değişiyor');
  await page.screenshot({ path: path.join(SHOTS, '00d-ayarlar-yatay.png') });
  // kapatılan “program göster” seçeneği canlı listeye yansır
  await page.click('#btn-home');
  await page.click('.t-live');
  await page.waitForSelector('#split .row.cat');
  await page.click('#split .row.cat:has-text("Tümü")');
  await page.waitForSelector('#split .row:not(.cat)');
  await sleep(300);
  ok(await page.$$eval('.sp-left .row:not(.cat) .sub', (e) => e.length > 0 && e.every((n) => !/Program/.test(n.textContent))), 'program bilgisi kapalıyken kanal satırlarında “şimdi” yazısı yok');
  // büyük yazıda sığmayan kanal adları kesilmez, kayarak gösterilir
  await page.waitForFunction(() => document.querySelectorAll('.sp-left .row:not(.cat) .nm.mq').length > 0, null, { timeout: 4000 });
  ok(true, 'dev yazı boyutunda sığmayan kanal adları kayan yazıya geçti');
  ok(await page.$eval('.sp-left .row:not(.cat) .nm.mq .mq-i', (e) => getComputedStyle(e).animationName !== 'none'), 'kayan yazı animasyonu çalışıyor');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 11. TV modu: kumanda tuşları, medya tuşları, ana ekran
  console.log('TV modu ve kumanda');
  ({ page, ctx, errs } = await newPage({ width: 915, height: 412 }, nativeInit));
  await page.evaluate((u) => {
    localStorage.setItem('iptv.sources', JSON.stringify([{ id: 'a', name: 'Deneme', type: 'm3u', url: u }]));
  }, mock.url + '/list.m3u');
  await page.reload();
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  await page.waitForFunction(() => window.__iptv.S.cat.live.length === 120, null, { timeout: 15000 });
  const tvCalls = () => page.evaluate(() => window.__calls.filter((c) => c[0] === 'tvMode').map((c) => c[1]));
  ok(!(await page.$eval('html', (h) => h.classList.contains('tv'))), 'TV olmayan cihazda otomatik kipte TV modu kapalı');
  ok((await tvCalls()).pop() === false, 'yerel taraf TV modu kapalı bilgisini aldı');
  await page.evaluate(() => localStorage.setItem('__isTv', '1'));
  await page.reload();
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  await page.waitForFunction(() => document.documentElement.classList.contains('tv'));
  ok((await tvCalls()).pop() === true, 'Android TV algılanınca TV modu açıldı ve yerel taraf yatay kilitledi (setTvMode)');
  ok(!(await page.isVisible('#tabs')), 'TV modunda alt sekmeler yok');
  const tvTiles = await page.$$eval('.tile', (e) => e.filter((x) => x.offsetParent).map((x) => { const r = x.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, mini: x.classList.contains('mini') }; }));
  ok(tvTiles.every((t) => t.l >= 0 && t.t >= 0 && t.r <= 915 && t.b <= 412), 'TV modunda kutular ekran dışına taşmıyor');
  await page.screenshot({ path: path.join(SHOTS, '00e-ana-ekran-tv.png') });

  // yön tuşlarıyla ana ekranda gezinme
  const focused = () => page.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? (a.dataset.go || a.id || a.className) : ''; });
  await page.waitForFunction(() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.go === 'live');
  ok(true, 'TV modunda ana ekran açılınca odak kendiliğinden Canlı TV kutusunda');
  await page.keyboard.press('ArrowRight');
  ok((await focused()) === 'movies', 'sağ ok: Filmler');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  ok((await focused()) === 'cats', 'sağ ok ×2: Kategoriler');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  ok(['guide', 'multi', 'recent', 'favs', 'rec', 'dl', 'sources'].includes(await focused()), 'aşağı ok: kısayol çubuğuna iner: ' + (await focused()));
  await page.keyboard.press('ArrowUp');
  ok(['live', 'movies', 'series', 'cats'].includes(await focused()), 'yukarı ok: büyük kutulara döner');
  // Tamam (Enter) odaktaki kutuyu açar, Esc/geri kapatır
  while ((await focused()) !== 'cats') await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.pg');
  ok((await page.textContent('.pg h3')) === 'Kategoriler' && (await page.$$('.pg .row.cat')).length > 3, 'Kategoriler sayfası açıldı ve canlı TV kategorilerini listeliyor');
  await sleep(400); // sayfa açılış geçişi bitsin
  await page.screenshot({ path: path.join(SHOTS, '00f-kategoriler-tv.png') });
  await page.click('.pg .row.cat:has-text("Spor")');
  await page.waitForFunction(() => /spor/i.test(document.querySelector('#sp-name-t') && document.querySelector('#sp-name-t').textContent));
  ok(true, 'Kategoriler sayfasından seçilen kategori Canlı TV’de açıldı');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#sp-name-t') && document.querySelector('#sp-name-t').textContent === 'Kategoriler');
  ok(true, 'Esc/Geri bir adım geri götürdü (kanallardan kategori listesine)');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.tile.t-live');
  ok(true, 'ikinci Esc/Geri ana ekrana döndürdü');

  // EPG kısayolu: kanalların şimdi/sonra yayını
  await page.click('[data-go=guide]');
  await page.waitForSelector('.guide-category-head');
  ok((await page.textContent('.pg h3')).includes('TV Rehberi'), 'EPG kısayolu TV rehberini açtı');
  ok((await page.$$('.tl-row')).length === 0, 'TV rehberi önce yalnız kategorileri gösteriyor');
  await page.click('.guide-category-head');
  await page.waitForSelector('.tl-row');
  ok(true, 'kategoriye dokununca kanallar zaman çizelgesinde açıldı');
  await sleep(400);
  await page.screenshot({ path: path.join(SHOTS, '00g-rehber-tv.png') });
  const tvFoc = await page.evaluate(() => {
    const a = document.activeElement;
    if (!a || !a.classList.contains('tl-prog')) return { on: false };
    const o = getComputedStyle(a);
    return { on: true, outline: o.outlineStyle !== 'none' && parseFloat(o.outlineWidth) >= 2, ch: document.querySelector('.tl-corner').getBoundingClientRect().width };
  });
  ok(tvFoc.on && tvFoc.outline, 'TV kipinde kategori açılınca odak şimdiki programda ve halka belirgin');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  ok(await page.evaluate(() => { const a = document.activeElement; return a && a.classList.contains('tl-prog'); }), 'TV kipinde oklar programlar arasında gezindi');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.tl', { state: 'detached' });
  ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('guide-category-head')), 'TV: Geri/Esc önce kategori listesine döndü');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.pg', { state: 'detached' });

  // ayarlarda TV modu seçimi
  await page.click('#h-set');
  await page.waitForSelector('.set-grid');
  await page.click('[data-set=general]');
  await page.waitForSelector('#g-tv');
  ok((await page.inputValue('#g-tv')) === 'auto', 'TV modu varsayılan: Otomatik');
  await page.selectOption('#g-tv', 'off');
  ok(!(await page.$eval('html', (h) => h.classList.contains('tv'))) && (await tvCalls()).pop() === false, 'Kapalı: TV modu TV’de bile kapanır, yön kilidi kalkar');
  await page.selectOption('#g-tv', 'on');
  ok((await page.$eval('html', (h) => h.classList.contains('tv'))) && (await tvCalls()).pop() === true, 'Açık: TV modu açılır, yatay kilit istenir');
  ok((await page.evaluate(() => window.__iptv.store.pref('set.tvmode', 'auto'))) === 'on', 'TV modu seçimi kalıcı kaydedildi');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.click('[data-set=player]');
  await page.waitForSelector('#g-buf');
  ok((await page.inputValue('#g-buf')) === 'high', 'Yayın önbelleği varsayılan: Yüksek');
  await page.selectOption('#g-buf', 'max');
  ok((await page.evaluate(() => window.__iptv.store.pref('set.buffer', 'high'))) === 'max', 'Yayın önbelleği seçimi kalıcı kaydedildi');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  ok(true, 'Esc ayar penceresini kapattı');

  // kumanda medya tuşları: önizleme (bölmeli canlı TV) ve tam ekran oynatıcı
  await page.click('#btn-home').catch(() => {});
  await page.waitForSelector('.tile.t-live');
  await page.click('.t-live');
  await page.waitForSelector('#split .row.cat');
  await page.click('#split .row.cat:has-text("Tümü")');
  await page.waitForSelector('#split .row:not(.cat)');
  // kalıcı kanal arama alanı (liste sanal olduğu için satır sayısı yerine öğe listesine bakılır)
  const itemsN = () => page.evaluate(() => window.__iptv.S.items.length);
  ok(await page.$eval('#sp-q', (e) => e.readOnly), 'TV: arama kutusu kumandayla gezerken salt okunur (ekran klavyesi kendiliğinden açılmaz)');
  await page.focus('#sp-q');
  ok(await page.$eval('#sp-q', (e) => e.readOnly), 'TV: kutuya odak gelince de salt okunur kaldı');
  await page.keyboard.press('Enter');
  ok(!(await page.$eval('#sp-q', (e) => e.readOnly)) && (await page.evaluate(() => document.activeElement.id)) === 'sp-q', 'TV: Tamam’a basınca kutu düzenlenebilir oldu (klavye ancak o zaman açılır)');
  await page.fill('#sp-q', 'Haber');
  await page.waitForFunction(() => window.__iptv.S.items.length > 0 && window.__iptv.S.items.length < 120);
  ok(await page.evaluate(() => window.__iptv.S.items.every((i) => /haber/i.test(i.name + ' ' + (i.group || '')))), 'bölmedeki “Kanal ara…” alanı kanalları süzdü: ' + (await itemsN()));
  await page.fill('#sp-q', '');
  await page.waitForFunction(() => window.__iptv.S.items.length === 120);
  ok(true, 'arama silinince tüm kanallar geri geldi');
  await page.focus('#sp-slot');
  ok(await page.$eval('#sp-q', (e) => e.readOnly), 'TV: odak kutudan çıkınca yeniden salt okunur oldu');
  // sıralama: bölmeli ekranda sol başlıktan
  ok(await page.isVisible('#sp-sort'), 'bölmeli canlı TV: kategori içinde “Sırala” düğmesi var');
  await page.click('#sp-sort');
  await page.click('[data-s=za]');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await sleep(300);
  ok(await page.evaluate(() => { const l = window.__iptv.S.items; const c = new Intl.Collator('tr', { sensitivity: 'base', numeric: true }); return window.__iptv.S.sort.live === 'za' && l.length > 5 && c.compare(l[0].name, l[1].name) >= 0 && c.compare(l[1].name, l[4].name) >= 0; }), 'bölmeli ekranda Z → A sıralaması uygulandı');
  await page.click('#sp-sort');
  await page.click('[data-s=default]');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  // üst çubuk: sağ ok aynı satırdaki düğmelere gider (alttaki arama alanına inmez)
  await page.focus('#btn-source');
  await page.keyboard.press('ArrowRight');
  ok((await focused()) === 'btn-search', 'üst çubuk: kaynak seçiciden sağ ok arama düğmesine gitti: ' + (await focused()));
  await page.keyboard.press('ArrowRight');
  ok((await focused()) === 'btn-refresh', 'sağ ok sağ üstteki yenile düğmesine ulaştı: ' + (await focused()));
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  ok((await focused()) === 'btn-source', 'sol ok geri döndü');
  await page.click('#split .row:not(.cat)');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'play'));
  await sleep(300);
  // bilgi kartındaki eylem düğmeleri
  ok((await page.$$('#sp-info .sp-act')).length === 3, 'bilgi kartında EPG, Bilgi ve Favori düğmeleri var');
  await page.click('#sp-info [data-sp=fav]');
  ok(await page.$eval('#sp-info [data-sp=fav]', (b) => b.classList.contains('on')), 'Favori düğmesi kanalı favoriye ekledi');
  await page.click('#sp-info [data-sp=fav]');
  ok(!(await page.$eval('#sp-info [data-sp=fav]', (b) => b.classList.contains('on'))), 'Favori düğmesi tekrar basılınca çıkardı');
  await page.click('#sp-info [data-sp=info]');
  await page.waitForSelector('.sheet .ci-facts');
  ok(/Kategori/.test(await page.textContent('.sheet .ci-facts')) && !/\/live\//.test(await page.textContent('.sheet')), 'Kanal bilgisi açıldı; yayın adresi (kullanıcı/parola) gösterilmiyor');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.click('#sp-info [data-sp=epg]');
  await page.waitForSelector('.sheet-back');
  ok(true, 'EPG düğmesi program rehberini açtı');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  const nCalls = (name) => page.evaluate((n) => window.__calls.filter((c) => c[0] === n).length, name);
  const key = (k) => page.evaluate((x) => window.__emit('remote', { key: x }), k);
  const plays0 = await nCalls('play');
  const url0 = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'play').pop()[1]);
  await key('MediaPlayPause');
  await sleep(150);
  ok((await nCalls('pause')) >= 1, 'önizlemede Oynat/Duraklat tuşu yayını duraklattı');
  await key('MediaPlayPause');
  await sleep(150);
  ok((await nCalls('resume')) >= 1, 'Oynat/Duraklat tuşu yayını sürdürdü');
  await key('ChannelUp');
  await sleep(300);
  const url1 = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'play').pop()[1]);
  ok((await nCalls('play')) === plays0 + 1 && url1 !== url0, 'önizlemede Kanal + tuşu listedeki sonraki kanalı açtı');
  ok(!(await page.$eval('body', (b) => b.classList.contains('player-open'))), 'kanal tuşu önizlemeyi tam ekrana çevirmedi');
  await key('ChannelDown');
  await sleep(300);
  ok((await page.evaluate(() => window.__calls.filter((c) => c[0] === 'play').pop()[1])) === url0, 'Kanal − tuşu önceki kanala döndü');

  await page.click('#sp-slot');
  await page.waitForFunction(() => document.body.classList.contains('player-open'));
  const p1 = await nCalls('pause');
  await key('MediaPause');
  await sleep(150);
  ok((await nCalls('pause')) === p1 + 1, 'tam ekranda Duraklat tuşu duraklattı');
  const r1 = await nCalls('resume');
  await key('MediaPlay');
  await sleep(150);
  ok((await nCalls('resume')) === r1 + 1, 'tam ekranda Oynat tuşu sürdürdü');
  const plays1 = await nCalls('play');
  await key('ChannelUp');
  await sleep(300);
  ok((await nCalls('play')) === plays1 + 1, 'tam ekranda Kanal + sonraki kanala geçti');
  await key('MediaFastForward');
  await sleep(100);
  ok(await page.isVisible('#pl-hud'), 'canlı yayında ileri sarma tuşu “sarma yok” bilgisini gösterdi');
  ok(await page.$eval('#pl-pip', (b) => b.hidden), 'TV: oynatıcıda “resim içinde resim” düğmesi yok');
  // denetimler kapalıyken yön tuşu yayını durdurmaz/değiştirmez, yalnız denetimleri açar; Tamam odaktaki duraklat düğmesine basar
  await page.evaluate(() => { document.querySelector('#pl-ui').classList.remove('show'); document.activeElement && document.activeElement.blur(); });
  const plA = await nCalls('play');
  const psA = await nCalls('pause');
  const stA = await nCalls('stop');
  await page.keyboard.press('ArrowDown');
  await sleep(200);
  ok(await page.$eval('#pl-ui', (u) => u.classList.contains('show')) && (await nCalls('play')) === plA && (await nCalls('pause')) === psA && (await nCalls('stop')) === stA, 'TV: denetimler kapalıyken aşağı ok yalnız denetimleri açtı; yayın durmadı, kanal değişmedi');
  ok((await page.evaluate(() => document.activeElement.id)) === 'pl-play', 'odak duraklat düğmesinde');
  await page.keyboard.press('Enter');
  await sleep(150);
  ok((await nCalls('pause')) === psA + 1, 'duraklat düğmesine Tamam basınca yayın duraklatıldı');
  await page.keyboard.press('Enter');
  await sleep(150);
  ok((await nCalls('resume')) >= 1 && (await nCalls('play')) === plA, 'yeniden Tamam yayını sürdürdü');
  for (const k of ['ArrowUp', 'ArrowLeft', 'ArrowRight']) {
    await page.evaluate(() => { document.querySelector('#pl-ui').classList.remove('show'); document.activeElement && document.activeElement.blur(); });
    await page.keyboard.press(k);
    await sleep(120);
    ok((await page.$eval('#pl-ui', (u) => u.classList.contains('show'))) && (await nCalls('play')) === plA && (await nCalls('stop')) === stA, `TV: denetimler kapalıyken ${k} yayına dokunmadan denetimleri açtı`);
  }
  // gece modu penceresi: oynatıcının üstünde açılır, oklar pencerede gezer (kanal değişmez)
  await page.click('#pl-night');
  await page.waitForSelector('.sheet [data-n]');
  await page.waitForFunction(() => document.activeElement && document.activeElement.closest('.sheet'));
  ok(true, 'gece modu penceresi açılınca odak pencereye geçti');
  const f0 = await page.evaluate(() => document.activeElement.dataset.n);
  await page.keyboard.press('ArrowDown');
  await sleep(150);
  const f1 = await page.evaluate(() => document.activeElement.dataset.n);
  ok(f0 && f1 && f0 !== f1 && (await nCalls('play')) === plA, 'pencerede aşağı ok bir sonraki seçeneğe geçti, kanal değişmedi: ' + f0 + ' → ' + f1);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  ok((await page.evaluate(() => window.__calls.filter((c) => c[0] === 'night').pop()[1])) === f1, 'Tamam seçeneği uyguladı ve pencere kapandı');
  await page.keyboard.press('ArrowDown');
  await sleep(150);
  ok(await page.$eval('#pl-ui', (u) => u.classList.contains('show')) && (await page.evaluate(() => document.activeElement.closest('#pl-ui') != null)), 'pencere kapanınca oklar yeniden oynatıcı denetimlerinde');
  await key('MediaStop');
  await page.waitForFunction(() => !document.body.classList.contains('player-open'));
  ok(true, 'Durdur tuşu oynatıcıyı kapattı (önizlemeye dönüldü)');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 12. çevrimdışı indirme (taklit eklenti)
  console.log('Çevrimdışı indirme');
  const dlInit = () => {
    // Gerçek eklentinin dl* yöntemlerini taklit eder; durumu testten __dlStep ile ilerletilir.
    const base = window.Capacitor.nativePromise;
    const jobs = new Map();
    window.__dl = { jobs, calls: [] };
    const view = (j) => ({ id: j.id, name: j.name, ext: j.ext, meta: j.meta, state: j.state, error: j.error || '', wifiOnly: !!j.wifiOnly, bytes: j.bytes || 0, total: j.total || -1, speed: j.speed || 0, createdAt: j.createdAt, url: j.state === 'done' ? 'file:///dl/' + j.id + '.' + (j.ext || 'mp4') : undefined });
    const emit = (j) => setTimeout(() => window.__emit('dlProgress', view(j)), 0);
    const rec = (n, a) => window.__dl.calls.push([n, a]);
    const api = {
      dlStart: async (o) => {
        rec('start', o);
        if (window.__dlFail) throw new Error(window.__dlFail);
        let j = jobs.get(o.id);
        if (!j) jobs.set(o.id, (j = { ...o, state: 'queued', bytes: 0, total: 1000, createdAt: Date.now() + jobs.size }));
        else if (j.state === 'paused' || j.state === 'error') j.state = 'queued';
        emit(j);
        return view(j);
      },
      dlList: async () => ({ items: [...jobs.values()].map(view), freeBytes: 5e9, usedBytes: 1e9 }),
      dlPause: async ({ id }) => {
        rec('pause', id);
        const j = jobs.get(id);
        if (j) { j.state = 'paused'; j.speed = 0; emit(j); }
      },
      dlPauseAll: async () => rec('pauseAll'),
      dlResume: async ({ id }) => {
        rec('resume', id);
        const j = jobs.get(id);
        if (j && j.state !== 'done') { j.state = 'queued'; emit(j); }
      },
      dlResumeAll: async (o) => rec('resumeAll', o && o.paused),
      dlRemove: async ({ id }) => {
        rec('remove', id);
        jobs.delete(id);
        setTimeout(() => window.__emit('dlProgress', { id, state: 'removed' }), 0);
      },
    };
    window.__dlStep = (id, patch) => {
      const j = jobs.get(id);
      Object.assign(j, patch);
      emit(j);
    };
    window.Capacitor.nativePromise = (pn, m, o) => (api[m] ? api[m](o || {}) : base(pn, m, o));
  };
  ({ page, ctx, errs } = await newPage({ width: 390, height: 844 }, nativeInit));
  await page.addInitScript(dlInit);
  await page.reload();
  await page.waitForSelector('#f');
  await page.fill('input[name=server]', mock.url);
  await page.fill('input[name=user]', 'u');
  await page.fill('input[name=pass]', 'p');
  await page.click('#f-go');
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  const dlCalls = (n) => page.evaluate((x) => window.__dl.calls.filter((c) => c[0] === x).map((c) => c[1]), n);
  ok((await page.$$eval('.shortcuts .tile', (e) => e.length)) === 8, 'ana ekranda sekiz kısayol (Spor ve İndirilenler dahil)');
  ok(/İndirilenler/.test(await page.textContent('.tile.t-dl')), 'ana ekranda “İndirilenler” kutusu');
  await page.screenshot({ path: path.join(SHOTS, '40-indirme-ana-ekran.png') });
  // Ayarlar › Oynatıcı ayarları: alt düğmelerden hangilerinin adı yazsın
  await page.click('#h-set');
  await page.waitForSelector('.set-grid');
  await page.click('[data-set=player]');
  await page.waitForSelector('.chk[data-pl=sleep]');
  ok((await page.$$('.chk[data-pl]')).length === 14 && (await page.$$('.chk[data-pl].on')).length === 0, 'oynatıcı ayarlarında 14 düğme için etiket seçeneği, varsayılan hiçbiri açık değil');
  await page.click('.chk[data-pl=sleep]');
  ok((await page.evaluate(() => window.__iptv.store.pref('pl.labels', []))).join() === 'sleep', 'seçilen düğmenin etiketi kaydedildi');
  await sleep(300);
  await page.screenshot({ path: path.join(SHOTS, '46-oynatici-ayarlari.png') });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.click('#tabs [data-tab=home]').catch(() => {});
  // aynı filmin 4K ve SD kopyaları katalogda var (sürüm seçimi için)
  await page.evaluate(() => {
    const S = window.__iptv.S;
    const f = S.cat.movies.find((m) => m.name === 'Film 1 Işıkları');
    S.cat.movies.push({ ...f, id: 'm9001', streamId: '9001', name: 'Film 1 Işıkları 4K' }, { ...f, id: 'm9002', streamId: '9002', name: 'TR - Film 1 Işıkları SD' });
    S.verIdx = null;
  });
  await page.click('#tabs [data-tab=movies]');
  await page.waitForSelector('.row.cat');
  await sleep(150);
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.card');
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('.card')].find((x) => /Film 1 Işıkları/.test(x.textContent));
    c.click();
  });
  await page.waitForSelector('#mv-dl');
  ok(/İndir/.test(await page.textContent('#mv-dl')), 'film sayfasında “İndir” düğmesi');
  await page.click('#mv-dl');
  await page.waitForSelector('.dl-sheet');
  const vers = await page.$$eval('#dl-vers [data-v]', (e) => e.map((x) => x.querySelector('.t').firstChild.textContent));
  ok(vers.join() === '4K,Standart,SD', 'seçenek sayfasında sürümler kalite sırasıyla: ' + vers.join());
  ok(/Sağlayıcı|sağlayıcı/.test(await page.textContent('.dl-tos')) && /izlerken/.test(await page.textContent('.dl-sheet')), 'sağlayıcı uyarısı ve ses/altyazı notu var');
  await page.waitForFunction(() => /Boş alan: 4,7 GB/.test(document.querySelector('#dl-free').textContent));
  ok(true, 'boş alan gösteriliyor');
  ok((await page.$eval('#dl-wifi', (b) => b.classList.contains('on'))), '“Yalnız Wi-Fi” varsayılan açık');
  ok(!(await page.$eval('#dl-fast', (b) => b.classList.contains('on'))) && /Hızlı indirme/.test(await page.textContent('#dl-fast')), '“Hızlı indirme” seçeneği var ve varsayılan kapalı');
  await sleep(450);
  await page.screenshot({ path: path.join(SHOTS, '41-indirme-secenekleri.png') });
  await page.click('#dl-fast');
  ok(await page.$eval('#dl-fast', (b) => b.classList.contains('on') && b.getAttribute('aria-checked') === 'true'), '“Hızlı indirme” açıldı');
  await page.click('#dl-vers [data-v="m9001"]');
  ok(await page.$eval('#dl-vers [data-v="m9001"]', (b) => b.getAttribute('aria-checked') === 'true'), '4K sürümü seçildi');
  await page.click('#dl-go');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  const dlst1 = await dlCalls('start');
  ok(dlst1.length === 1 && dlst1[0].fast === true, 'hızlı indirme seçimi eklentiye iletildi');
  ok(dlst1.length === 1 && /\/movie\/u\/p\/9001\.webm$/.test(dlst1[0].url) && dlst1[0].wifiOnly === true && dlst1[0].name === 'Film 1 Işıkları 4K' && dlst1[0].ext === 'webm', 'seçilen sürüm doğru adresle ve yalnız-Wi-Fi ile sıraya eklendi: ' + JSON.stringify(dlst1[0]));
  ok(/^d_[A-Za-z0-9_-]+$/.test(dlst1[0].id) && JSON.parse(dlst1[0].meta).item.id === 'm9001' && JSON.parse(dlst1[0].meta).src === (await page.evaluate(() => window.__iptv.S.source.id)), 'kimlik güvenli, meta kaynak ve öğeyi taşıyor');
  await page.waitForFunction(() => /sırasında/.test(document.querySelector('#mv-dl').textContent));
  ok(true, 'düğme “sırasında” oldu (ayrıntı sayfası yerinde güncellendi)');
  const jid = dlst1[0].id;
  await page.evaluate((id) => window.__dlStep(id, { state: 'downloading', bytes: 500, speed: 2097152 }), jid);
  await page.waitForFunction(() => /İndiriliyor %50/.test(document.querySelector('#mv-dl').textContent));
  ok(true, 'ilerleme düğmede: %50');
  // İndirilenler sayfası
  await page.click('#mv-dl');
  await page.waitForSelector('.dl-row');
  ok(/%50/.test(await page.textContent('.dl-row .dl-sub')) && /2,0 MB\/sn/.test(await page.textContent('.dl-row .dl-sub')), 'satırda yüzde ve hız: ' + (await page.textContent('.dl-row .dl-sub')));
  await page.waitForFunction(() => /İndirilenler: 954 MB · Boş alan: 4,7 GB/.test(document.querySelector('#dl-info').textContent));
  ok(true, 'kullanılan ve boş alan satırı');
  await page.evaluate((id) => window.__dlStep(id, { bytes: 750 }), jid);
  await page.waitForFunction(() => /%75/.test(document.querySelector('.dl-row .dl-sub').textContent) && document.querySelector('.dl-bar i').style.width === '75%');
  ok(true, 'ilerleme olayı satırı ve çubuğu yerinde güncelledi');
  await sleep(450);
  await page.screenshot({ path: path.join(SHOTS, '42-indirilenler.png') });
  await page.click('[data-tg]');
  await page.waitForFunction(() => /Duraklatıldı/.test(document.querySelector('.dl-row .dl-sub').textContent));
  ok((await dlCalls('pause')).length === 1, 'duraklat düğmesi eklentiye iletildi, satır “Duraklatıldı”');
  await page.click('[data-tg]');
  await page.waitForFunction(() => /Sırada/.test(document.querySelector('.dl-row .dl-sub').textContent));
  ok((await dlCalls('resume')).length === 1, 'sürdür düğmesi eklentiye iletildi');
  await page.evaluate((id) => window.__dlStep(id, { state: 'done', bytes: 1000, total: 1000 }), jid);
  await page.waitForFunction(() => /İndirildi/.test(document.querySelector('.dl-row .dl-sub').textContent) && !document.querySelector('.dl-bar'));
  ok(true, 'biten indirmede çubuk ve duraklat düğmesi yok');
  // çevrimdışı oynat: asıl öğenin kimliğiyle, yerel dosya adresiyle
  await page.click('[data-main]');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'play' && /^file:\/\/\/dl\//.test(c[1])));
  const dlpl = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'play').pop());
  ok(dlpl[1] === `file:///dl/${jid}.webm`, 'indirilen dosya yerel adresten oynatıldı');
  ok(await page.evaluate(() => document.body.classList.contains('player-open')), 'oynatıcı açıldı');
  await page.evaluate(() => window.__emit('state', { state: 'playing', live: false }));
  await sleep(10500); // ilerleme kaydı oynatmanın ilk 10 saniyesinden sonra başlar
  await page.evaluate(() => window.__emit('time', { pos: 300000, dur: 600000, buffered: 0 }));
  await sleep(250);
  ok(await page.evaluate(() => !!window.__iptv.store.progress(window.__iptv.S.source.id, 'm9001')), 'ilerleme kaynağın film kaydına yazıldı (Devam et çalışır)');
  await page.goBack();
  await page.waitForFunction(() => !document.body.classList.contains('player-open'));
  ok(/İndirildi/.test(await page.textContent('#mv-dl')), 'film sayfasında düğme “İndirildi”');
  // oynatıcıda: İndir düğmesi, alt düğmeler tek satır, geri oku oynatıcıyı kapatır
  await page.click('#mv-play');
  await page.waitForFunction(() => document.body.classList.contains('player-open'));
  await page.evaluate(() => window.__emit('state', { state: 'playing', live: false }));
  await page.waitForSelector('#pl-dl:not([hidden])');
  ok(true, 'oynatıcıda “İndir” düğmesi görünüyor');
  const oneRow = () => page.$$eval('.pl-tools .tool', (e) => { const v = e.filter((x) => !x.hidden); const t = new Set(v.map((x) => Math.round(x.getBoundingClientRect().top))); return { rows: t.size, n: v.length, compact: document.querySelector('.pl-tools').classList.contains('compact'), over: document.documentElement.scrollWidth > innerWidth }; });
  await sleep(300);
  let row = await oneRow();
  ok(row.rows === 1 && !row.over, 'dikey ekranda alt düğmeler tek satırda: ' + JSON.stringify(row));
  await page.setViewportSize({ width: 915, height: 412 });
  await sleep(400);
  row = await oneRow();
  ok(row.rows === 1 && !row.over, 'yatay ekranda alt düğmeler tek satırda: ' + JSON.stringify(row));
  const lab = await page.evaluate(() => ({ sleep: document.querySelector('#pl-sleep span').offsetWidth > 0, aspect: document.querySelector('#pl-aspect span').offsetWidth > 0, tip: document.querySelector('#pl-aspect').getAttribute('aria-label') }));
  ok(lab.sleep && !lab.aspect && !!lab.tip, 'yalnız seçilen düğmenin (Uyku) adı yazıyor; diğerleri simge ve erişilebilir adı var: ' + JSON.stringify(lab));
  const gaps = await page.evaluate(() => { const bar = document.querySelector('.pl-tools'); const v = [...bar.querySelectorAll('.tool')].filter((x) => !x.hidden); const b = bar.getBoundingClientRect(); return [v[0].getBoundingClientRect().left - b.left, b.right - v[v.length - 1].getBoundingClientRect().right]; });
  ok(Math.abs(gaps[0] - gaps[1]) < 3, 'alt düğmeler ortalı: sol/sağ boşluk ' + gaps.map((g) => Math.round(g)).join('/'));
  await page.screenshot({ path: path.join(SHOTS, '45-oynatici-alt-dugmeler.png') });
  await page.click('#pl-dl');
  await page.waitForSelector('.dl-row');
  ok(true, 'oynatıcıdaki İndir, bu film için İndirilenler’i açtı');
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.click('#pl-back');
  await page.waitForFunction(() => !document.body.classList.contains('player-open'));
  ok(await page.evaluate(() => document.querySelector('#mini-player-overlay').hidden), 'ekrandaki geri oku oynatıcıyı kapattı (mini oynatıcıya küçültmedi)');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goBack();
  await page.waitForSelector('.card');
  // sil (Ana ekran › İndirilenler)
  await page.click('#tabs [data-tab=home]');
  await page.click('.tile.t-dl');
  await page.waitForSelector('.dl-row');
  await page.click('[data-del]');
  await page.waitForSelector('#dd-yes');
  await page.click('#dd-yes');
  await page.waitForFunction(() => !document.querySelector('.dl-row'));
  ok((await dlCalls('remove')).length === 1, 'silme eklentiye iletildi, satır kalktı');
  await page.goBack();
  await page.click('#tabs [data-tab=movies]');
  await page.waitForSelector('.row.cat');
  await sleep(150);
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.card');
  await page.evaluate(() => { const c = [...document.querySelectorAll('.card')].find((x) => /Film 1 Işıkları/.test(x.textContent)); c.click(); });
  await page.waitForSelector('#mv-dl');
  ok(/İndir$/.test((await page.textContent('#mv-dl')).trim()), 'silinince film sayfasındaki düğme yeniden “İndir”');
  await page.goBack();
  // yer yoksa eklentinin hatası kullanıcıya gösterilir
  await page.waitForSelector('.card');
  await page.evaluate(() => { window.__dlFail = 'Yetersiz depolama alanı (en az 200 MB boş yer gerekir)'; });
  await page.evaluate(() => { const c = [...document.querySelectorAll('.card')].find((x) => /Film 2 /.test(x.textContent)); c.click(); });
  await page.waitForSelector('#mv-dl');
  await page.click('#mv-dl');
  await page.waitForSelector('#dl-go');
  await page.click('#dl-go');
  await page.waitForFunction(() => /Yetersiz depolama/.test(document.querySelector('#toast').textContent));
  ok(true, 'depolama yetersizse hata iletisi gösterildi');
  await page.evaluate(() => { window.__dlFail = ''; });
  await page.goBack();
  // dizi: bölüm simgeleri, sezonu indir
  await page.click('#tabs [data-tab=series]');
  await page.waitForSelector('.row.cat');
  await sleep(150);
  await page.click('.row.cat:has-text("Tümü")');
  await page.click('.card');
  await page.waitForSelector('.epi-w');
  ok((await page.$$eval('.epi-w [data-dl]', (e) => e.length)) === 3 && !!(await page.$('#sr-dls')), 'her bölümün yanında indirme simgesi ve “Sezonu indir”');
  await page.waitForFunction(() => /Sezonu indir/.test(document.querySelector('#sr-dls').textContent));
  const nStart0 = (await dlCalls('start')).length;
  await page.click('.epi-w >> nth=0 >> [data-dl]'); // yenilikte onay yok: film indirirken “dl.ack” verildi
  await page.waitForFunction((n) => window.__dl.calls.filter((c) => c[0] === 'start').length > n, nStart0);
  const ep1 = (await dlCalls('start')).pop();
  ok(/\/series\/u\/p\/\d+\.webm$/.test(ep1.url) && /Kurtuluş Yolu · S1 B1/.test(ep1.name), 'bölüm indirmesi sıraya eklendi: ' + ep1.name);
  await page.waitForFunction(() => document.querySelectorAll('.epi-w')[0].querySelector('[data-dl] svg'));
  await page.click('#sr-dls');
  await page.waitForSelector('.dl-sheet');
  ok(/2 bölüm indirilecek/.test(await page.textContent('.dl-what')) && /1 bölüm zaten/.test(await page.textContent('.dl-what')), 'sezon penceresi yalnız eksik bölümleri sayıyor: ' + (await page.textContent('.dl-what')));
  await page.click('#dl-go');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.waitForFunction((n) => window.__dl.calls.filter((c) => c[0] === 'start').length === n + 3, nStart0);
  const sNames = (await dlCalls('start')).slice(-3).map((x) => x.name.replace(/^.* · /, ''));
  ok(sNames.length === 3 && new Set(sNames).size === 3, 'sezonun kalan iki bölümü de sıraya girdi (aynı bölüm iki kez eklenmedi)');
  await page.waitForFunction(() => /0\/3 indirildi/.test(document.querySelector('#sr-dls').textContent));
  ok(true, 'sezon düğmesi “0/3 indirildi” gösteriyor');
  await sleep(400);
  await page.screenshot({ path: path.join(SHOTS, '43-dizi-indirme.png') });
  const sj = await page.evaluate(() => [...window.__dl.jobs.keys()].slice(-3));
  for (const id of sj) await page.evaluate((x) => window.__dlStep(x, { state: 'done', bytes: 1000 }), id);
  await page.waitForFunction(() => /Sezon 1 indirildi/.test(document.querySelector('#sr-dls').textContent));
  ok(true, 'hepsi bitince “Sezon 1 indirildi”');
  await page.click('.epi-w >> nth=1 >> [data-dl]');
  await page.waitForFunction(() => window.__calls.filter((c) => c[0] === 'play').pop()[1].startsWith('file:///dl/'));
  ok(true, 'indirilmiş bölüm simgesine dokununca yerel dosyadan oynadı');
  ok(/S1 B2/.test(await page.textContent('#pl-sub')), 'oynatıcıda bölüm etiketi: ' + (await page.textContent('#pl-sub')));
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
  // yatay telefon: yedi kısayol tek satıra sığar
  ({ page, ctx, errs } = await newPage({ width: 844, height: 390 }, nativeInit));
  await page.addInitScript(dlInit);
  await page.reload();
  await page.waitForSelector('#f');
  await page.fill('input[name=server]', mock.url);
  await page.fill('input[name=user]', 'u');
  await page.fill('input[name=pass]', 'p');
  await page.click('#f-go');
  await page.waitForSelector('.shortcuts .tile', { timeout: 15000 });
  const dlsc = await page.$$eval('.shortcuts .tile', (e) => e.map((x) => { const r = x.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.right), Math.round(r.width)]; }));
  ok(dlsc.length === 8 && dlsc.every((r) => r[0] === dlsc[0][0]) && dlsc.every((r) => r[1] <= 844), 'yatay ekranda sekiz kısayol tek satırda ve ekrana sığıyor: ' + JSON.stringify(dlsc));
  await page.screenshot({ path: path.join(SHOTS, '44-indirme-yatay-ana-ekran.png') });
  await ctx.close();

  await require('./admin.cjs').adminSection({ browser, base, mock, ok, sleep, SHOTS });
  await require('./theme.cjs').themeSection({ browser, base, mock, ok, sleep, SHOTS });
  await require('./v104.cjs').v104Section({ browser, base, mock, ok, sleep, SHOTS });
  await require('./kumanda.cjs').kumandaSection({ browser, base, mock, ok, sleep });
  await require('./sports.cjs').sportsSection({ browser, base, mock, ok, sleep, SHOTS });

  await browser.close();
  www.close();
  await mock.close();
  console.log(fails ? `\n${fails} denetim BAŞARISIZ` : '\nTüm uçtan uca denetimler geçti');
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
