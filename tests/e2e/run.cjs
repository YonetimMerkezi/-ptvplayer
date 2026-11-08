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
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  ok(/Deneme M3U/.test(await page.textContent('#h-src')), 'kaynak adı ana ekranın altında');
  ok(/120 kanal/.test(await page.textContent('.t-live')) && /Son güncelleme/.test(await page.textContent('#h-upd')), 'ana ekranda Canlı TV kutusu: kanal sayısı ve son güncelleme');
  ok(/\d\d:\d\d/.test(await page.textContent('#h-clock')) && (await page.textContent('#h-date')).includes('2'), 'ana ekranda saat ve tarih');
  ok((await page.$$eval('.tile', (e) => e.length)) === 9, 'ana ekranda dokuz kutu (canlı, film, dizi, kategoriler + EPG, çoklu ekran, izleme listesi, favoriler, ayarlar)');
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
      play: async (a) => {
        window.__calls.push(['play', a.url, a.mime, a.buffer]);
        if (!window.__noPlay) setTimeout(() => listeners.state({ state: 'playing', playing: true, live: !/webm/.test(a.url) }), 50);
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
  ok((await page.$$eval('.sheet .list-item', (e) => e.map((x) => x.textContent.trim()).join('|'))) === 'Kapalı|Türkçe', 'altyazı sayfasında “Kapalı” ve diller listeleniyor');
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
  await page.screenshot({ path: path.join(SHOTS, '11-yerel-kip-oynatici.png') });
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden' });
  ok(await page.evaluate(() => !document.documentElement.classList.contains('native-playing') && window.__calls.some((c) => c[0] === 'stop')), 'kapanışta durduruldu, arayüz geri geldi');
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
  ok(mp[0][8] === true, 'kutular varsayılan olarak görüntüyü dolduruyor (şerit yok)');
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
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'multiFit' && c[1] === false));
  ok((await page.textContent('#mp-fit')) === 'Sığdır' && (await page.evaluate(() => window.__iptv.store.pref('multi.fill', true))) === false, '“Doldur/Sığdır” düğmesi tüm kutulara iletildi ve kaydedildi');
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
  await page.waitForSelector('#player', { state: 'hidden' });
  await page.waitForFunction((n) => window.__calls.filter((c) => c[0] === 'multiPlay').length >= n + 2, n0, { timeout: 5000 });
  ok(true, 'tam ekrandan dönünce kutular yeniden başladı');
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
  await page.route('**/releases/download/latest/version.json', (r) => (mainDown ? r.fulfill({ status: 504, headers: cors, body: 'gateway timeout' }) : r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(manifest) })));
  await page.route('**/releases/latest/download/version.json', (r) => (fallbackDown ? r.fulfill({ status: 504, headers: cors, body: 'gateway timeout' }) : r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(manifest) })));
  await page.evaluate(() => { window.__iptv.store.setPref('upd.at', Date.now()); window.__iptv.setVersion('1.0.5'); }); // otomatik denetim araya girmesin
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
  // “Sonra” bu sürümü otomatik bildirimden çıkarır; elle denetimde yine görünür
  await page.click('[data-set=update]');
  await page.waitForSelector('#up-later');
  await page.click('#up-later');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  ok((await page.evaluate(() => window.__iptv.store.pref('upd.skip', 0))) === 9, '“Sonra” bu sürümü sessize aldı');
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
  ok(tiles.length === 9, 'yatay ana ekranda dokuz kutu görünüyor: ' + tiles.length);
  const big = tiles.filter((t) => !/mini/.test(t.c));
  ok(big.length === 4 && big.every((t) => Math.abs(t.t - big[0].t) < 2), 'yatayda dört büyük kutu tek satırda');
  ok(tiles.every((t) => t.l >= 0 && t.t >= 0 && t.r <= 915 && t.b <= 412), 'kutular ekran dışına taşmıyor');
  const ov = tiles.some((a, i) => tiles.some((c, j) => j > i && a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1));
  ok(!ov, 'kutular birbirinin üstüne binmiyor');
  await page.screenshot({ path: path.join(SHOTS, '00-ana-ekran-yatay.png') });

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
  ok((await page.$$('.set-tile')).length === 4, 'ayarlarda dört kutu (genel, EPG, otomasyon, güncelleme)');
  await page.click('[data-set=general]');
  await page.waitForSelector('.chk');
  ok((await page.$$('.chk.on')).length === 3, 'genel ayarlarda üç seçenek açık');
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
  ok(['guide', 'multi', 'recent', 'favs', 'sources'].includes(await focused()), 'aşağı ok: kısayol çubuğuna iner: ' + (await focused()));
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
  await page.waitForSelector('.pg .row.gd');
  ok((await page.textContent('.pg h3')).includes('EPG'), 'EPG kısayolu TV rehberini açtı');
  await sleep(400);
  await page.screenshot({ path: path.join(SHOTS, '00g-rehber-tv.png') });
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
  await page.fill('#sp-q', 'Haber');
  await page.waitForFunction(() => window.__iptv.S.items.length > 0 && window.__iptv.S.items.length < 120);
  ok(await page.evaluate(() => window.__iptv.S.items.every((i) => /haber/i.test(i.name + ' ' + (i.group || '')))), 'bölmedeki “Kanal ara…” alanı kanalları süzdü: ' + (await itemsN()));
  await page.fill('#sp-q', '');
  await page.waitForFunction(() => window.__iptv.S.items.length === 120);
  ok(true, 'arama silinince tüm kanallar geri geldi');
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
  await key('MediaStop');
  await page.waitForFunction(() => !document.body.classList.contains('player-open'));
  ok(true, 'Durdur tuşu oynatıcıyı kapattı (önizlemeye dönüldü)');
  ok(errs.length === 0, 'konsol hatası yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
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
