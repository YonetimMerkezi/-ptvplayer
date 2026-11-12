// "Bugün TV'de" denemesi: TV rehberindeki programlar tür (spor/film/dizi) ve kanala göre, bugün/yarın, biten programlar, kanal seçimi (kalıcı), program ayrıntısı.
// Sahte rehberde (mock/server.mjs CATS) programların türü dönüşümlü verilir. Tek başına: node tests/e2e/bugun.cjs; run.cjs sonunda da çağrılır.
const path = require('node:path');

async function bugunSection({ browser, base, mock, ok, sleep }) {
  console.log('bugün TV’de: spor, film, dizi programları');
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
  await page.waitForFunction(() => window.__iptv.S.epg.ready, null, { timeout: 15000 });

  // rehberdeki gerçek kategoriye göre beklenen program sayısı (sayfanın kendi sınıflandırmasından bağımsız)
  const expected = (kind, day = 0, past = false) =>
    page.evaluate(({ kind, day, past }) => {
      const cat = { spor: 'Spor', film: 'Film', dizi: 'Dizi' }[kind];
      const now = Date.now();
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + day);
      const from = d.getTime();
      const to = from + 24 * 3600e3;
      // spor kategorisindeki haber/bülten programları (başlığında “Haber” geçenler; sahte kanal “Işık Haber”) spor listesine alınmaz
      return window.__iptv.S.epg.between(from, to).filter((h) => h.p.c === cat && h.p.s >= from && h.p.s < to && (past || h.p.e > now) && !(kind === 'spor' && /haber/i.test(h.p.t))).length;
    }, { kind, day, past });
  const rows = () => page.$$eval('#td-list .td-r', (e) => e.map((r) => ({ cls: r.className, time: r.querySelector('time').textContent, title: r.querySelector('.td-m b').textContent, ch: r.querySelector('.td-m span').textContent })));
  const chipN = (sel) => page.$eval(sel, (e) => Number((e.querySelector('small') || {}).textContent));
  const open = async () => {
    await page.click('.tile.t-today');
    await page.waitForSelector('.td-pg #td-kinds .chip');
    await sleep(250);
  };

  ok((await page.textContent('.tile.t-today b')).trim() === 'Bugün TV’de' && !(await page.$('.tile.t-cats')) && !(await page.$('.shortcuts .t-today')), 'ana ekranda büyük “Bugün TV’de” kutusu var; Kategoriler kutusu yok, kısayol olarak ikinci kez yok');
  ok(await page.evaluate(() => { const r = document.querySelector('.shortcuts').getBoundingClientRect(); return r.right <= innerWidth + 1 && [...document.querySelectorAll('.shortcuts .tile')].every((t) => t.getBoundingClientRect().right <= innerWidth + 1); }), 'kısayol kutuları ekrana sığıyor (telefon dikey)');

  await open();
  ok((await page.$$eval('#td-kinds .chip', (e) => e.map((c) => c.firstChild.textContent))).join('|') === 'Spor|Film|Dizi', 'türler: Spor, Film, Dizi');
  const title = await page.textContent('.td-pg .pg-bar h3');
  ok(/^Bugün TV’de · \d{1,2} \p{L}+$/u.test(title), 'başlıkta bugünün tarihi yazıyor: ' + title);

  // 1) spor: sayı rehberdeki kategoriye uyuyor, biten yok, saat sırasıyla
  const exSpor = await expected('spor');
  ok(exSpor > 0, 'sahte rehberde bugün için spor programı var (' + exSpor + ')');
  const spor = await rows();
  ok(spor.length === Math.min(exSpor, 400) && (await chipN('#td-kinds [data-kind=spor]')) === exSpor, `spor: ${spor.length} program, çip sayısı rehberle aynı`);
  ok(spor.every((r) => !/past/.test(r.cls)) && spor.every((r, i) => i === 0 || r.time >= spor[i - 1].time || true), 'spor: biten program listelenmiyor');
  const times = await page.$$eval('#td-list .td-r time', (e) => e.map((t) => t.textContent));
  const mins = times.map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)));
  ok(mins.every((m, i) => i === 0 || m >= mins[i - 1]), 'spor: saat sırasına göre');
  ok(spor.every((r) => /Program \d+/.test(r.title)) && spor.every((r) => r.ch.length > 3), 'her satırda program adı ve kanal adı var');

  // 2) film ve dizi
  await page.click('#td-kinds [data-kind=film]');
  await sleep(150);
  const exFilm = await expected('film');
  const film = await rows();
  ok(film.length === Math.min(exFilm, 400) && film.length > 0, `film: ${film.length} program`);
  ok(JSON.stringify(film.map((r) => r.title + r.time)) !== JSON.stringify(spor.map((r) => r.title + r.time)), 'film listesi spordan farklı');
  await page.click('#td-kinds [data-kind=dizi]');
  await sleep(150);
  const exDizi = await expected('dizi');
  ok((await rows()).length === Math.min(exDizi, 400) && exDizi > 0, `dizi: ${exDizi} program`);
  ok((await chipN('#td-kinds [data-kind=dizi]')) === exDizi, 'dizi çip sayısı rehberle aynı');

  // 3) şimdi yayında olan satır işaretli
  const nowRows = await page.$$eval('#td-list .td-r.now', (e) => e.length);
  ok(nowRows === 0 || (await page.$eval('#td-list .td-r.now .td-now', (e) => e.textContent)) === 'ŞİMDİ', 'şimdi yayındaki program “ŞİMDİ” etiketli');

  // 4) bitenler
  await page.click('#td-kinds [data-kind=spor]');
  const exAll = await expected('spor', 0, true);
  await page.click('#td-opts [data-past]');
  await sleep(150);
  const withPast = await rows();
  ok(withPast.length === Math.min(exAll, 400), `bitenler açık: ${withPast.length} program`);
  ok(exAll === exSpor || withPast.some((r) => /past/.test(r.cls)), 'biten programlar soluk işaretli');
  ok((await page.getAttribute('#td-opts [data-past]', 'aria-pressed')) === 'true', 'bitenler düğmesi basılı');
  await page.click('#td-opts [data-past]');

  // 5) yarın
  await page.click('#td-opts [data-day="1"]');
  await sleep(150);
  const exTom = await expected('spor', 1);
  const tom = await rows();
  ok(tom.length === Math.min(exTom, 400), `yarın: ${tom.length} program (rehberde ${exTom})`);
  ok(!(await page.$('#td-opts [data-past]')) && /^Yarın TV’de/.test(await page.textContent('.td-pg .pg-bar h3')), 'yarın seçiliyken başlık “Yarın” ve “Bitenler” düğmesi yok');
  if (!exTom) ok(/Yarın spor programı yok/.test(await page.textContent('#td-list')), 'yarın program yoksa açıklama yazıyor');
  await page.click('#td-opts [data-day="0"]');
  await sleep(150);

  // 6) program ayrıntısı: dokununca program sayfası (hatırlat / izle) açılır
  const firstTitle = (await rows())[0].title;
  await page.click('#td-list .td-r >> nth=0');
  await page.waitForSelector('.gp', { timeout: 4000 });
  ok(new RegExp(firstTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(await page.textContent('.sheet-h')) && (await page.$$('.gp .btn')).length >= 1, 'satıra dokununca program ayrıntısı açıldı: ' + firstTitle);
  await page.click('.sheet [data-close]');
  await page.waitForSelector('.gp', { state: 'detached' });

  // 7) kanal seçimi
  ok((await page.textContent('#td-opts [data-pick] small')) === 'Tümü', 'kanal seçimi başta “Tümü”');
  const allCount = (await rows()).length;
  await page.click('#td-opts [data-pick]');
  await page.waitForSelector('.td-pick .td-c');
  ok(/Hiçbiri seçili değil/.test(await page.textContent('#td-ph')), 'seçim ekranı: hiçbiri seçili değil açıklaması');
  await page.fill('#td-q', 'Şeker TV 1');
  await sleep(200);
  const names = await page.$$eval('.td-pick .td-c .td-m b', (e) => e.map((x) => x.textContent));
  ok(names.length > 0 && names.every((n) => /Şeker TV 1/.test(n)), 'arama kanalları süzüyor: ' + names.slice(0, 3).join(', '));
  const pickName = names[0];
  await page.click('.td-pick .td-c >> nth=0');
  await sleep(150);
  ok(/1 kanal seçili/.test(await page.textContent('#td-ph')) && (await page.getAttribute('.td-pick .td-c.on', 'aria-pressed')) === 'true', 'kanal seçildi, işaretli');
  await page.click('.td-pick [data-close]');
  await page.waitForSelector('.td-pick', { state: 'detached' });
  await sleep(150);
  ok((await page.textContent('#td-opts [data-pick] small')) === '1', 'kanal seçimi çipi “1” gösteriyor');
  const some = await rows();
  ok(some.length < allCount && some.every((r) => r.ch.startsWith(pickName)), `yalnız seçili kanal: ${some.length} program (${allCount} idi)`);

  // seçim kalıcı: sayfa yenilenip yeniden açılınca duruyor
  await page.reload();
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  await page.waitForFunction(() => window.__iptv.S.epg.ready, null, { timeout: 15000 });
  await open();
  ok((await page.textContent('#td-opts [data-pick] small')) === '1' && (await rows()).every((r) => r.ch.startsWith(pickName)), 'kanal seçimi yenilemeden sonra da duruyor');

  // seçimi temizle
  await page.click('#td-opts [data-pick]');
  await page.waitForSelector('.td-pick .td-c.on');
  await page.click('#td-clear');
  await sleep(150);
  await page.click('.td-pick [data-close]');
  await page.waitForSelector('.td-pick', { state: 'detached' });
  ok((await page.textContent('#td-opts [data-pick] small')) === 'Tümü' && (await rows()).length === allCount, 'seçim temizlenince bütün kanallar geri geldi');

  // 8) klavye / kumanda: satırda Enter program ayrıntısını açar
  await page.focus('#td-list .td-r >> nth=0');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.gp', { timeout: 4000 });
  ok(true, 'kumanda: satırda Tamam program ayrıntısını açtı');
  await page.click('.sheet [data-close]');
  await page.waitForSelector('.gp', { state: 'detached' });

  // 9) rehber yoksa açıklama
  await page.click('.td-pg [data-close]');
  await page.waitForSelector('.td-pg', { state: 'detached' });
  await page.evaluate(() => { window.__iptv.S.epg.data = { map: {}, prog: {} }; });
  await open();
  ok(/TV rehberi yok/.test(await page.textContent('#td-list')), 'rehber yoksa “TV rehberi yok” açıklaması');
  ok(errs.length === 0, 'sayfa hatası yok ' + errs.join(' | '));
  await ctx.close();
}

module.exports = { bugunSection };

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
      await bugunSection({ browser, base: `http://127.0.0.1:${www.address().port}/`, mock, ok, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
    } finally {
      await browser.close();
      www.close();
      await mock.close();
    }
    console.log(fails ? `\n${fails} denetim başarısız` : '\nbugün denetimleri geçti');
    process.exit(fails ? 1 : 0);
  })();
}
