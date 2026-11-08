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
  await page.waitForSelector('#ob-add');
  ok(true, 'ilk açılışta karşılama ekranı');
  await page.screenshot({ path: path.join(SHOTS, '01-karsilama.png') });
  await page.click('#ob-add');
  await page.fill('input[name=url]', mock.url + '/list.m3u');
  await page.fill('input[name=name]', 'Deneme M3U');
  await page.click('#f-go');
  await page.waitForSelector('.row', { timeout: 15000 });
  ok(/Deneme M3U/.test(await page.textContent('#src-name')), 'kaynak adı üst çubukta');
  const chips = await page.$$eval('.chip', (e) => e.map((x) => x.textContent));
  ok(chips[0].startsWith('Tümü') && chips[0].includes('120'), 'Tümü çipi 120 kanalı gösteriyor: ' + chips[0]);
  ok(chips.some((c) => c.startsWith('Haber')), 'gruplar çip olarak listeleniyor');
  const rowCount = await page.$$eval('.row', (e) => e.length);
  ok(rowCount > 5 && rowCount < 40, `yalnız görünen satırlar çizildi (${rowCount} satır)`);

  await page.click('#btn-search');
  await page.fill('#q', 'seker');
  await page.waitForFunction(() => document.querySelectorAll('.row').length > 0 && [...document.querySelectorAll('.row .nm')].every((n) => /Şeker/.test(n.textContent)));
  ok(true, '“seker” araması “Şeker TV” kanallarını buluyor (Türkçe duyarsız)');
  await page.screenshot({ path: path.join(SHOTS, '02-arama.png') });
  await page.click('#q-clear');
  await page.waitForSelector('.row');

  await page.click('.chip:has-text("Spor")');
  await page.waitForFunction(() => [...document.querySelectorAll('.row .sub')].length && true);
  const nSpor = await page.$$eval('.row', (e) => e.length);
  ok(nSpor > 0, 'grup süzmesi çalışıyor');
  await page.click('.chip:has-text("Tümü")');

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
  await page.click('.row .nm');
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
  await page.click('.chip:has-text("Son izlenen")');
  ok((await page.$$eval('.row', (e) => e.length)) === 2, 'son izlenenlerde iki kanal');

  // ---------------------------------------------------------------- 4. film
  console.log('Film');
  await page.click('#tabs [data-tab=movies]');
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
  await page.waitForSelector('.chip:has-text("Devam et")');
  ok(true, '“Devam et” çipi belirdi');
  await page.click('.chip:has-text("Devam et")');
  await page.click('.card');
  await page.waitForSelector('#mv-play');
  ok(/Devam et/.test(await page.textContent('#mv-play')), 'detayda “Devam et” düğmesi');
  await page.goBack();

  // ---------------------------------------------------------------- 5. dizi
  console.log('Dizi');
  await page.click('#tabs [data-tab=series]');
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
  await page.click('#ob-add');
  await page.fill('input[name=url]', `${mock.url}/get.php?username=u&password=p&type=m3u_plus`);
  await page.click('#f-go');
  await page.waitForSelector('.row', { timeout: 15000 });
  ok((await page.evaluate(() => window.__iptv.S.source.type)) === 'xtream', 'get.php bağlantısı Xtream hesabı olarak eklendi');
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
        const p = '/cache/dl' + files.size + '.tmp';
        files.set('file://' + p, blob);
        return { path: p, size: 1 };
      },
      deleteFile: async ({ path }) => window.__calls.push(['delete', path]),
      play: async (a) => {
        window.__calls.push(['play', a.url, a.mime]);
        setTimeout(() => listeners.state({ state: 'playing', playing: true, live: !/webm/.test(a.url) }), 50);
        setTimeout(() => listeners.time({ pos: 1000, dur: /webm/.test(a.url) ? 40000 : -1, buffered: 0 }), 100);
      },
      pause: async () => window.__calls.push(['pause']),
      resume: async () => window.__calls.push(['resume']),
      stop: async () => window.__calls.push(['stop']),
      seekTo: async (a) => window.__calls.push(['seek', a.ms]),
      setResizeMode: async (a) => window.__calls.push(['resize', a.mode]),
      setImmersive: async (a) => window.__calls.push(['immersive', a.on]),
      getTracks: async () => ({ audio: [{ id: '0:0', label: 'Türkçe', selected: true }, { id: '1:0', label: 'İngilizce', selected: false }], text: [{ id: '2:0', label: 'Türkçe', selected: false }], textOn: false }),
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
  await page.click('#ob-add');
  await page.fill('input[name=url]', mock.url + '/list.m3u');
  await page.click('#f-go');
  await page.waitForSelector('.row', { timeout: 15000 });
  const calls = await page.evaluate(() => window.__calls.map((c) => c[0]));
  ok(calls.includes('download') && calls.includes('delete'), 'liste yerel eklentiyle indirilip geçici dosya silindi');
  await page.waitForFunction(() => window.__iptv.S.epg.ready, null, { timeout: 15000 });
  ok(true, '.xml.gz rehberi yerel yoldan alınıp açıldı');
  await page.click('.row .nm');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'play'));
  const play = await page.evaluate(() => window.__calls.find((c) => c[0] === 'play'));
  ok(/\.m3u8$/.test(play[1]) && play[2] === 'hls', 'yerel oynatıcı HLS adresiyle başlatıldı');
  ok(await page.evaluate(() => document.body.classList.contains('native-playing')), 'gövde saydam kipe geçti (video arkada)');
  ok(await page.evaluate(() => window.__calls.some((c) => c[0] === 'immersive' && c[1] === true)), 'tam ekran istendi');
  await page.waitForFunction(() => document.querySelector('#pl-audio:not([hidden])'));
  await page.click('#pl-audio');
  await page.click('.sheet .list-item[data-id="1:0"]');
  ok(await page.evaluate(() => window.__calls.some((c) => c[0] === 'track' && c[1] === 'audio' && c[2] === '1:0')), 'ses izi seçimi eklentiye iletildi');
  await page.screenshot({ path: path.join(SHOTS, '11-yerel-kip-oynatici.png') });
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden' });
  ok(await page.evaluate(() => !document.body.classList.contains('native-playing') && window.__calls.some((c) => c[0] === 'stop')), 'kapanışta durduruldu, arayüz geri geldi');
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
