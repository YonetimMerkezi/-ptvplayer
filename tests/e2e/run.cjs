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
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && errs.push(m.text()));
    if (init) await page.addInitScript(init);
    await page.goto(base);
    return { page, ctx, errs };
  }

  // ---------------------------------------------------------------- 1. M3U ekleme, liste, arama, favori
  console.log('M3U kaynağı');
  let { page, ctx, errs } = await newPage();
  await page.waitForSelector('#f');
  ok(await page.$eval('#f-type [data-t=xtream]', (b) => b.classList.contains('on')), 'ilk açılışta kaynak ekleme sayfası kendiliğinden açık (Xtream seçili)');
  ok((await page.$$eval('#f-type button', (b) => b.map((x) => x.textContent))).join() === 'Xtream,M3U bağlantısı,Dosyadan', 'üç giriş türü: Xtream, M3U bağlantısı, Dosyadan');
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
  await page.waitForSelector('.row', { timeout: 15000 });
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
  const rowCount = await page.$$eval('.row', (e) => e.length);
  ok(rowCount > 5 && rowCount < 40, `yalnız görünen satırlar çizildi (${rowCount} satır)`);

  await page.click('#btn-search');
  await page.fill('#q', 'seker');
  await page.waitForFunction(() => document.querySelectorAll('.row').length > 0 && [...document.querySelectorAll('.row .nm')].every((n) => /Şeker/.test(n.textContent)));
  ok(true, '“seker” araması “Şeker TV” kanallarını buluyor (Türkçe duyarsız)');
  await page.screenshot({ path: path.join(SHOTS, '02-arama.png') });
  await page.click('#q-clear');
  await page.waitForSelector('.row:not(.cat)');

  await page.click('#crumb-back');
  await page.waitForSelector('.row.cat');
  ok(true, 'başlıktaki geri oku kategori listesine dönüyor');
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
  await page.reload();
  await page.waitForSelector('.row');
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
  ok((await page.$$eval('.prog-row', (e) => e.length)) > 5, 'kanal program listesi açılıyor');
  ok((await page.$$eval('.prog-row.now', (e) => e.length)) === 1, 'şimdiki program vurgulu');
  await sleep(350);
  await page.screenshot({ path: path.join(SHOTS, '03-rehber.png') });
  await page.goBack();
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  ok(true, 'geri tuşu alt sayfayı kapatıyor');

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
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden' });
  ok(true, 'geri tuşu oynatıcıyı kapatıyor');
  await page.click('#crumb-back');
  await page.click('.row.cat:has-text("Son izlenen")');
  await page.waitForSelector('.row:not(.cat)');
  ok((await page.$$eval('.row:not(.cat)', (e) => e.length)) === 2, 'son izlenenlerde iki kanal');

  // ---------------------------------------------------------------- 3b. kategori yönetimi
  console.log('Kategori yönetimi');
  const catRowOf = (name) => page.locator('.row.cat', { has: page.locator('.nm', { hasText: new RegExp('^' + name + '$') }) });
  await page.click('#crumb-back');
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
  await page.waitForSelector('.row.cat');
  const names2 = await page.$$eval('.row.cat .nm', (e) => e.map((x) => x.textContent));
  ok(JSON.stringify(names2) === JSON.stringify(names1), 'sıra ve gizleme yeniden açılışta korunuyor');
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.row:not(.cat)');
  await page.click('#btn-search');
  await page.fill('#q', g1);
  await sleep(450);
  const hiddenInSearch = await page.evaluate((g) => window.__iptv.S.items.some((it) => it.group === g), g1);
  ok(!hiddenInSearch, 'gizli kategorideki öğeler aramada da çıkmıyor');
  await page.click('#q-clear');
  await page.waitForSelector('.row:not(.cat)');

  // klasör: oluştur, uzun basarak öğe ekle
  await page.click('#crumb-back');
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
  await page.click('#crumb-back');
  await page.waitForSelector('.row.cat');
  const folderCount = await catRowOf('Sabah kanalları').locator('.n').textContent();
  ok(folderCount === '1', 'klasör satırı 1 öğe gösteriyor');
  await page.click('.row.cat:has-text("Sabah kanalları")');
  await page.waitForSelector('.row:not(.cat)');
  ok((await page.$$eval('.row:not(.cat)', (e) => e.length)) === 1 && (await page.textContent('#crumb-t')) === 'Sabah kanalları', 'klasör yalnız eklenen kanalı gösteriyor');
  // klasörden çıkar → boş klasör
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
  await page.click('#crumb-back');
  await page.waitForSelector('.row.cat');
  await page.click('#cat-edit');
  await page.click('.row.cat.edit:has-text("Sabah kanalları")');
  await page.click('#fm-ren');
  await page.fill('#fm-name', 'Haber saati');
  await page.click('#fm-save');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.waitForSelector('.row.cat.edit .nm:has-text("Haber saati")');
  ok(true, 'klasör yeniden adlandırıldı');
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

  // ---------------------------------------------------------------- 4. film
  console.log('Film');
  await page.click('#tabs [data-tab=movies]');
  await page.waitForSelector('.row.cat');
  ok((await page.$$('.card')).length === 0, 'Film sekmesi de önce kategorileri gösteriyor');
  await sleep(150);
  await page.click('.row.cat:has-text("Tümü")');
  await page.waitForSelector('.card');
  ok((await page.$$eval('.card', (e) => e.length)) === 6, 'M3U’daki 6 film kart olarak listeleniyor');
  await page.screenshot({ path: path.join(SHOTS, '06-film-izgara.png') });
  await page.click('.card');
  await page.waitForSelector('#mv-play');
  await sleep(350);
  await page.screenshot({ path: path.join(SHOTS, '07-film-detay.png') });
  await page.click('#mv-play');
  await page.waitForFunction(() => document.querySelector('#vid').currentTime > 1, null, { timeout: 20000 });
  ok(true, 'film (WebM) oynuyor');
  ok(!(await page.$eval('#pl-prog', (e) => e.classList.contains('live'))), 'film kipinde arama çubuğu var');
  const before = await page.$eval('#vid', (v) => v.currentTime);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.waitForFunction((b) => document.querySelector('#vid').currentTime > b + 25, before, { timeout: 2500 });
  ok(true, 'sağ ok ile 3 × 10 sn ileri sarıldı');
  await page.screenshot({ path: path.join(SHOTS, '08-oynatici-film.png') });
  await sleep(200);
  await page.goBack(); // oynatıcı
  await page.waitForSelector('#player', { state: 'hidden' });
  const prog = await page.evaluate(() => Object.values(window.__iptv.store.progressAll(window.__iptv.S.source.id)));
  ok(prog.length === 1 && prog[0].pos > 10000, `kapanışta konum kaydedildi (${prog[0] && Math.round(prog[0].pos / 1000)} sn)`);
  await page.goBack(); // detay sayfası
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.click('#crumb-back');
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
  await page.click('#btn-source');
  ok((await page.$$eval('.sheet .list-item', (e) => e.length)) === 3, 'kaynak değiştirici iki kaynak + “ekle” gösteriyor');
  await page.goBack();

  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 8. get.php bağlantısı otomatik Xtream
  console.log('get.php bağlantısı');
  ({ page, ctx, errs } = await newPage());
  await page.waitForSelector('#f');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', `${mock.url}/get.php?username=u&password=p&type=m3u_plus`);
  await page.click('#f-go');
  await page.waitForSelector('.row', { timeout: 15000 });
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
  await page.waitForSelector('.row', { timeout: 15000 });
  const fsrc = await page.evaluate(() => ({ local: window.__iptv.S.source.local, name: window.__iptv.S.source.name, live: window.__iptv.S.cat.live.length }));
  ok(fsrc.local === true && fsrc.name === 'evdeki-liste' && fsrc.live === 120, 'dosyadan 120 kanal yüklendi, ad dosya adından: ' + JSON.stringify(fsrc));
  await page.reload();
  await page.waitForSelector('.row');
  await page.click('#btn-refresh');
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
        const blob = URL.createObjectURL(await r.blob());
        const p = '/cache/iptvdl' + files.size + '.tmp';
        files.set('file://' + p, blob);
        return { path: p, size: 1 };
      },
      deleteFile: async ({ path }) => window.__calls.push(['delete', path]),
      play: async (a) => {
        window.__calls.push(['play', a.url, a.mime]);
        setTimeout(() => listeners.state({ state: 'playing', playing: true, live: !/webm/.test(a.url) }), 50);
        setTimeout(() => listeners.time({ pos: 1000, dur: /webm/.test(a.url) ? 40000 : -1, buffered: 0 }), 100);
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
  };
  ({ page, ctx, errs } = await newPage({ width: 390, height: 844 }, nativeInit));
  await page.waitForSelector('#f');
  await page.click('#f-type [data-t=m3u]');
  await page.fill('input[name=url]', mock.url + '/list.m3u');
  await page.click('#f-go');
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
  ok((await page.$$eval('.sheet .list-item', (e) => e.map((x) => x.textContent.trim()).join('|'))) === 'Kapalı|Türkçe', 'altyazı sayfasında “Kapalı” ve diller listeleniyor');
  ok(await page.$eval('.sheet .list-item[data-id=""]', (b) => !!b.querySelector('.ic.ok')), 'altyazı kapalıyken “Kapalı” işaretli');
  await page.click('.sheet .list-item[data-id="2:0"]');
  ok(await page.evaluate(() => window.__calls.some((c) => c[0] === 'track' && c[1] === 'text' && c[2] === '2:0')), 'altyazı izi seçimi eklentiye iletildi');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.screenshot({ path: path.join(SHOTS, '11-yerel-kip-oynatici.png') });
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden' });
  ok(await page.evaluate(() => !document.documentElement.classList.contains('native-playing') && window.__calls.some((c) => c[0] === 'stop')), 'kapanışta durduruldu, arayüz geri geldi');
  ok((await page.$('#diag')) === null, 'ekranda hata bildirimi yok');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- 10. geniş ekran
  console.log('Geniş ekran');
  ({ page, ctx, errs } = await newPage({ width: 1280, height: 720 }));
  await page.evaluate((u) => {
    localStorage.setItem('iptv.sources', JSON.stringify([{ id: 'a', name: 'Deneme', type: 'm3u', url: u }]));
  }, mock.url + '/list.m3u');
  await page.reload();
  await page.waitForSelector('.row', { timeout: 15000 });
  await page.keyboard.press('Tab');
  await page.screenshot({ path: path.join(SHOTS, '12-genis-ekran.png') });
  await ctx.close();

  await browser.close();
  www.close();
  await mock.close();
  console.log(fails ? `\n${fails} denetim BAŞARISIZ` : '\nTüm uçtan uca denetimler geçti');
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
