// Favori takım ve puan durumu: takip (ayrıntı sayfasındaki ★), “★ Takımlarım” çipi, otomatik hatırlatıcı (elle kaldırılan geri gelmez, takip bırakılınca kalkar),
// puan durumu sayfası (tek tablo, gruplar, hata + yeniden dene, önbellek). Sahte ESPN (sports.cjs). Tek başına: node tests/e2e/takim.cjs; run.cjs sonunda da çağrılır.
const path = require('node:path');

async function takimSection({ browser, base, mock, ok, sleep }) {
  console.log('spor: favori takım ve puan durumu');
  const { fakeEspn } = require('./sports.cjs');
  const espn = fakeEspn();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  await espn.install(ctx);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await page.addInitScript(() => { localStorage.setItem('iptv.pref.seen.changelog', '999'); window.__sportsBadgeGapMs = 30; });
  await page.goto(base);
  await page.waitForSelector('#f');
  await page.fill('input[name=server]', mock.url);
  await page.fill('input[name=user]', 'u');
  await page.fill('input[name=pass]', 'p');
  await page.click('#f-go');
  await page.waitForSelector('.tile.t-live', { timeout: 15000 });
  await page.waitForFunction(() => window.__iptv.S.cat.live.length > 3, null, { timeout: 15000 });

  const text = (sel) => page.$$eval(sel, (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  // Liste arka planda (rozet/yayın akışı) yeniden çizilebildiği için satır, çizim ortasında kopuk bir öğe olarak yakalanmasın diye
  // Playwright'ın yeniden deneyen tıklaması kullanılır (başlığa tıklanır: zil düğmesine denk gelmesin)
  const openRow = (re) => page.locator('.sp-m', { hasText: re }).locator('.sp-tt').click();
  const plans = () => page.evaluate(() => window.__iptv.store.pref('plans', []).filter((x) => x.match));
  const favs = () => page.evaluate(() => window.__iptv.store.pref('sp.favs', []));
  const toast = () => page.textContent('#toast');
  const back = async () => {
    await page.goBack();
    await page.waitForFunction(() => !document.querySelector('.sd-pg'), null, { timeout: 4000 });
  };

  await page.click('.shortcuts .t-sport');
  await page.waitForSelector('.sp-pg .sp-m', { timeout: 10000 });
  await page.click('#sp-days .chip:nth-child(3)'); // yarın: Bayern – PSG
  await page.waitForFunction(() => /Bayern/.test(document.querySelector('.sp-list').textContent), null, { timeout: 8000 });

  // 1) hiçbir takım takipte değil: çip yok, ipucu var
  ok(!(await page.$('#sp-lgs .chip.fav')), 'takip yokken “Takımlarım” çipi yok');
  ok(/takip edebilirsiniz/.test(await page.textContent('.sp-list')), 'listenin sonunda takip ipucu var');
  ok((await plans()).length === 0, 'başlangıçta hatırlatıcı yok');

  // 2) ayrıntı sayfasından takip: iki takım için düğme; takip + otomatik hatırlatıcı
  await openRow(/Bayern/);
  await page.waitForSelector('.sd-pg .sd-fol', { timeout: 8000 });
  ok((await page.$$('.sd-pg .sd-fol')).length === 2 && (await text('.sd-fol span')).join() === 'Takip et,Takip et', 'ayrıntı başlığında iki takım için “Takip et” düğmesi');
  await page.click('.sd-fol[data-follow=home]');
  await page.waitForFunction(() => window.__iptv.store.pref('sp.favs', []).length === 1, null, { timeout: 3000 });
  ok((await favs())[0].n === 'Bayern Munich', 'takip kaydedildi: ' + JSON.stringify(await favs()));
  ok(await page.$eval('.sd-fol[data-follow=home]', (b) => b.classList.contains('on') && b.getAttribute('aria-pressed') === 'true' && /Takipte/.test(b.textContent)), 'düğme “Takipte” oldu');
  ok(await page.$eval('.sd-fol[data-follow=away]', (b) => !b.classList.contains('on')), 'rakip takip edilmedi');
  let mp = await plans();
  ok(mp.length === 1 && /Bayern Munich – Paris Saint-Germain/.test(mp[0].title) && mp[0].lead === 15, 'takip edilen takımın maçına hatırlatıcı kendiliğinden kuruldu: ' + JSON.stringify(mp.map((x) => x.title)));
  ok(/Bayern Munich takip ediliyor · 1 maç için hatırlatıcı kuruldu/.test(await toast()), 'ileti: ' + (await toast()));
  await sleep(900);
  await page.screenshot({ path: path.join(process.env.SHOTS || '/tmp', '81-takip-ayrinti.png') });
  await back();

  // 3) liste: ★ işareti, “★ Takımlarım” çipi ve sayısı, süzgeç
  ok((await text('#sp-lgs .chip.fav')).join() === '★ Takımlarım1', 'çip sayısı: ' + (await text('#sp-lgs .chip.fav')).join());
  ok(!/takip edebilirsiniz/.test(await page.textContent('.sp-list')), 'takip varken ipucu görünmez');
  ok((await page.$$('.sp-m .sp-fv')).length === 1 && /Bayern/.test((await text('.sp-m:has(.sp-fv)'))[0]), 'yalnız takip edilen takımın adının yanında ★');
  await page.click('#sp-lgs .chip.fav');
  ok((await page.$$('.sp-m')).length === 1 && /Bayern/.test((await text('.sp-m'))[0]) && await page.$eval('#sp-lgs .chip.fav', (c) => c.classList.contains('on')), '“Takımlarım” yalnız takip edilen takımın maçını gösterir');
  await page.click('#sp-days .chip:nth-child(2)'); // bugün: takip edilen takımın maçı yok
  await page.waitForFunction(() => /Takip ettiğiniz takımların/.test(document.querySelector('.sp-list').textContent), null, { timeout: 3000 });
  ok(/Bugün.*maçı yok/.test(await page.textContent('.sp-list')), 'günde maçı yoksa açıklayıcı boş durum: ' + (await page.textContent('.sp-list')).slice(0, 80));
  await page.click('#sp-days .chip:nth-child(3)');
  await page.waitForSelector('.sp-m');

  // 4) kullanıcı hatırlatıcıyı kaldırırsa yenilemede geri gelmez
  await page.locator('.sp-m', { hasText: /Bayern/ }).locator('.sp-bell').click();
  ok((await plans()).length === 0, 'hatırlatıcı elle kaldırıldı');
  await page.click('#sp-ref');
  await sleep(1200);
  ok((await plans()).length === 0, 'yenilemeden sonra kaldırılan hatırlatıcı yeniden kurulmadı');
  await page.click('#sp-lgs [data-lg=""]');

  // 5) milli takım: Türkçe ad (Türkiye) ile eşleşir; takip bırakılınca kendiliğinden kurulan hatırlatıcı kalkar
  await page.click('#sp-days .chip:nth-child(5)'); // +3 gün: Turkey – Wales
  await page.waitForFunction(() => /Türkiye/.test(document.querySelector('.sp-list').textContent), null, { timeout: 8000 });
  await openRow(/Türkiye/);
  await page.waitForSelector('.sd-pg .sd-fol');
  await page.click('.sd-fol[data-follow=home]');
  await page.waitForFunction(() => window.__iptv.store.pref('sp.favs', []).length === 2, null, { timeout: 3000 });
  mp = await plans();
  ok(mp.length === 1 && /Türkiye – Galler/.test(mp[0].title), 'milli takım maçı için hatırlatıcı: ' + JSON.stringify(mp.map((x) => x.title)));
  await page.click('.sd-fol[data-follow=home]');
  await page.waitForFunction(() => window.__iptv.store.pref('sp.favs', []).length === 1, null, { timeout: 3000 });
  ok((await plans()).length === 0 && /takipten çıkarıldı/.test(await toast()), 'takip bırakılınca kendiliğinden kurulan hatırlatıcı kalktı: ' + (await toast()));
  await back();

  // 6) puan durumu: tek tablo, takip edilen satır ★
  await page.click('#sp-days .chip:nth-child(2)'); // bugün: Galatasaray – Fenerbahçe (takip ekranda yapılır; “GS” kısaltması yok, tam ad eşleşir)
  await page.waitForFunction(() => /Galatasaray/.test(document.querySelector('.sp-list').textContent), null, { timeout: 8000 });
  await openRow(/Galatasaray/);
  await page.waitForSelector('.sd-pg .sd-fol');
  await page.click('.sd-fol[data-follow=home]');
  await page.waitForFunction(() => window.__iptv.store.pref('sp.favs', []).some((f) => f.n === 'Galatasaray'), null, { timeout: 3000 });
  await back();
  await page.click('#sp-tab');
  await page.waitForSelector('.st-pg .st-tb', { timeout: 8000 });
  const lgChips = await text('.st-pg #st-lgs .chip');
  ok(lgChips.length === 9 && lgChips[0] === 'Süper Lig' && await page.$eval('#st-lgs .chip.on', (c) => c.textContent === 'Süper Lig'), 'dokuz ligin düğmesi, Süper Lig seçili: ' + lgChips.join(' | '));
  const rows = await page.$$eval('.st-tb tbody tr', (trs) => trs.map((tr) => [...tr.cells].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join(' ')));
  ok(rows.length === 3 && /^1 ★ ?Galatasaray 12 9 2 1 \+14 29$/.test(rows[0]) && /^2 Fenerbahçe 12 8 2 2 \+10 26$/.test(rows[1]), 'tablo sıralı, O/G/B/M/AV/P doğru: ' + rows.join(' / '));
  ok((await page.$$('.st-tb tr.fav')).length === 1 && /★/.test(rows[0]), 'takip edilen takımın satırı ★ ile öne çıkar');
  ok(espn.st.tableCalls.join() === 'tur.1', 'yalnız seçili ligin tablosu istendi: ' + espn.st.tableCalls.join());
  await sleep(900); // sayfa açılış animasyonu bitsin
  await page.screenshot({ path: path.join(process.env.SHOTS || '/tmp', '81-puan-durumu.png') });

  // 7) başka lig, gruplu tablo, hata + yeniden dene
  await page.click('#st-lgs [data-lg="eng.1"]');
  await page.waitForFunction(() => document.querySelectorAll('.st-tb tbody tr').length === 3 && document.querySelector('#st-lgs .chip.on').textContent === 'Premier Lig', null, { timeout: 5000 });
  ok(espn.st.tableCalls.join() === 'tur.1,eng.1', 'ikinci lig istendi');
  espn.st.tableMode = 'groups';
  await page.click('#st-lgs [data-lg="esp.1"]');
  await page.waitForSelector('.st-gh', { timeout: 5000 });
  ok((await text('.st-gh')).join() === 'Grup A,Grup B' && (await page.$$('.st-tb')).length === 2, 'gruplu yanıtta grup başlıkları ve ayrı tablolar');
  espn.st.tableMode = 'fail';
  await page.click('#st-lgs [data-lg="ita.1"]');
  await page.waitForSelector('#st-retry', { timeout: 8000 });
  ok(/Puan durumu alınamadı/.test(await page.textContent('#st-body')) && /ita\.1: HTTP 500/.test(await page.textContent('#st-body')), 'hata ekranı kaynak ayrıntısıyla: ' + (await page.textContent('#st-body')).slice(0, 120));
  espn.st.tableMode = 'data';
  await page.click('#st-retry');
  await page.waitForSelector('.st-tb', { timeout: 5000 });
  ok(true, 'yeniden dene tabloyu getirdi');
  espn.st.tableMode = 'empty';
  await page.click('#st-lgs [data-lg="ger.1"]');
  await page.waitForSelector('#st-retry', { timeout: 8000 });
  ok(/Puan durumu alınamadı/.test(await page.textContent('#st-body')), 'tablo içermeyen yanıt hata gösterir, çökmez');

  // 8) kapatıp açınca taze tablo yeniden indirilmez (önbellek)
  espn.st.tableMode = 'data';
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('.st-pg'), null, { timeout: 4000 });
  const before = espn.st.tableCalls.length;
  await page.click('#sp-tab');
  await page.waitForSelector('.st-pg .st-tb', { timeout: 8000 });
  await sleep(500);
  ok(espn.st.tableCalls.length === before, 'taze tablo yeniden istenmedi (' + before + ' → ' + espn.st.tableCalls.length + ')');
  ok(errs.length === 0, 'sayfa hatası yok' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

module.exports = { takimSection };

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
      await takimSection({ browser, base: `http://127.0.0.1:${www.address().port}/`, mock, ok, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
    } finally {
      await browser.close();
      www.close();
      await mock.close();
    }
    console.log(fails ? `\n${fails} denetim başarısız` : '\ntakım/puan durumu denetimleri geçti');
    process.exit(fails ? 1 : 0);
  })();
}
