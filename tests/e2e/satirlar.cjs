// Netflix gibi film/dizi ekranı: her kategori yatayda kayan tek satır, üstte odaktaki yapımın vitrini.
// Kapsam: TV 1920×1080 ve 960×540 gezinme, "Tümünü gör" ve Geri ile konumun dönmesi, kilitli kategori, Düzenle kutusu,
// Ayarlar > Film ve dizi ekranı seçenekleri, telefon (dokunmatik kaydırma, vitrin yalnız yatay + kumanda).
// Tek başına: node tests/e2e/satirlar.cjs; run.cjs sonunda da çağrılır.
const path = require('node:path');

async function satirlarSection({ browser, base, mock, ok, sleep }) {
  console.log('satırlar: Netflix gibi film/dizi ekranı');
  const tvUrl = new URL('?tv=1', base).href;
  const CORS = { 'access-control-allow-origin': '*' };

  // 60 yapımlık büyük liste: her satırda 24 sınırı aşılır ve "Tümünü gör" kutusu çıkar
  const bigMovies = Array.from({ length: 60 }, (_, i) => ({
    name: `Büyük Film ${i + 1}`,
    stream_id: 5000 + i,
    stream_icon: '',
    category_id: i % 2 ? '1' : '2',
    container_extension: 'webm',
    rating_5based: 3.5,
  }));

  // vp: görünüm; tv: ?tv=1 ile aç; mv: set.mvView; big: büyük film listesi
  const open = async (vp, { tv = true, mv = null, big = false, lite = null, setup = null } = {}) => {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: !tv });
    if (big) {
      await ctx.route(
        (u) => u.pathname.endsWith('/player_api.php') && u.searchParams.get('action') === 'get_vod_streams',
        (r) => r.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(bigMovies) })
      );
    }
    if (setup) await setup(ctx);
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
    if (mv) await page.evaluate((v) => localStorage.setItem('iptv.pref.set.mvView', JSON.stringify(v)), mv);
    if (lite) await page.evaluate((v) => localStorage.setItem('iptv.pref.set.lite', JSON.stringify(v)), lite);
    if (tv) {
      await page.goto(tvUrl); // TV kipi: salt okunur alanlar, odak halkası, kumanda gezinmesi
      await page.waitForSelector('.tile.t-live', { timeout: 15000 });
    }
    await sleep(500);
    return { ctx, page, errs };
  };
  const vodHits = () => mock.hits.filter((h) => /action=get_vod_info/.test(h)).length;
  const enter = async (page, tab = 'movie') => {
    await page.click('.tile.t-' + tab);
    await page.waitForSelector('.sh-row', { timeout: 8000 });
    await sleep(500);
  };
  const cell = (page) => page.evaluate(() => { const a = document.activeElement; return a && a.dataset && a.dataset.r != null ? `${a.dataset.r}.${a.dataset.c}` : '-'; });
  const heroTitle = (page) => page.evaluate(() => (document.querySelector('#hero .hero-t') || {}).textContent || '');
  const activeName = (page) => page.evaluate(() => { const c = document.activeElement && document.activeElement.querySelector('.cap'); return c ? c.textContent : ''; });
  const titles = (page) => page.evaluate(() => window.__iptv.S.list.items.map((r) => r.name));
  const press = async (page, k, n = 1, gap = 120) => {
    for (let i = 0; i < n; i++) {
      await page.keyboard.press(k);
      await sleep(gap);
    }
  };
  const fits = (page) =>
    page.evaluate(() => {
      const l = document.querySelector('#list').getBoundingClientRect();
      const c = document.activeElement.getBoundingClientRect();
      return { top: Math.round(c.top - l.top), bottom: Math.round(l.bottom - c.bottom), left: Math.round(c.left), right: Math.round(innerWidth - c.right) };
    });

  // ---- 1) TV 1920×1080 (varsayılan ayar): satırlar, vitrin, gezinme, ayrıntıya gidip dönme, Düzenle kutusu
  {
    const { ctx, page, errs } = await open({ width: 1920, height: 1080 });
    await enter(page);
    ok(await page.evaluate(() => document.querySelector('#list').classList.contains('sh') && !document.querySelector('.row.cat')), 'TV varsayılanı: kategoriler satır (klasik kategori listesi yok)');
    const t = await titles(page);
    ok(t[0] === 'Tümü' && t.includes('Dram') && t.includes('Aksiyon') && t[t.length - 1] === 'Düzenle', 'satırlar: Tümü, kategoriler, en altta Düzenle: ' + t.join(', '));
    ok((await cell(page)) === '0.0', 'kumandada odak ilk satırın ilk kutusunda');
    ok(await page.evaluate(() => !document.querySelector('#hero').hidden && document.documentElement.classList.contains('hero-on')), 'vitrin alanı açık');
    const first = await activeName(page);
    ok(first.length > 0 && (await heroTitle(page)) === first, 'vitrin odaktaki filmin adını gösteriyor: ' + first);
    const cards0 = await page.evaluate(() => document.querySelectorAll('.sh-row[data-row="0"] .card').length);
    ok(cards0 === 24, `ilk satırda 24 kutu çizili, hepsi yatay kayar (${cards0})`);

    await page.waitForFunction(() => /Henrik Lindholm/.test(document.querySelector('#hero').textContent), null, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelector('#hero-bg').classList.contains('has'), null, { timeout: 5000 });
    ok(await page.evaluate(() => /\/backdrop\//.test([...document.querySelectorAll('#hero-bg i')].filter((i) => i.classList.contains('on')).map((i) => i.style.backgroundImage).join())), 'ayrıntı gelince geniş arka plan görseli görünüyor');
    const hh = await page.evaluate(() => ({ h: document.querySelector('#hero').getBoundingClientRect().height, vh: innerHeight, l: document.querySelector('#list').getBoundingClientRect().height }));
    ok(hh.l > hh.vh * 0.5, `vitrinin altında liste yeterli yerde (vitrin ${Math.round(hh.h)} px, liste ${Math.round(hh.l)} px)`);

    // sağ ok: aynı satırda kayar, vitrin hemen yeni filmin adına geçer
    await press(page, 'ArrowRight', 2);
    ok((await cell(page)) === '0.2' && (await heroTitle(page)) === (await activeName(page)), 'sağ ok ×2: aynı satırda üçüncü kutu, vitrin adı eşleşiyor');
    // aşağı ok: ikinci satır, aynı sıradaki kutu; satır üste oturur
    await press(page, 'ArrowDown', 1, 500);
    ok((await cell(page)) === '1.2', 'aşağı ok: ikinci satırda aynı sırada kutu');
    ok((await heroTitle(page)) === (await activeName(page)), 'aşağı ok: vitrin yeni satırdaki kutuyu gösteriyor');
    const snap = await page.evaluate(() => Math.round(document.querySelector('.sh-row[data-row="1"]').getBoundingClientRect().top - document.querySelector('#list').getBoundingClientRect().top));
    ok(Math.abs(snap) <= 2, `ikinci satır liste üstüne oturdu (${snap} px)`);
    const f = await fits(page);
    ok(f.top >= 4 && f.bottom >= 4 && f.left >= 4 && f.right >= 4, `odaktaki kutu halkasıyla tam görünür (üst ${f.top}, alt ${f.bottom}, sol ${f.left}, sağ ${f.right})`);
    await press(page, 'ArrowUp', 1, 500);
    ok((await cell(page)) === '0.2', 'yukarı ok: ilk satıra, aynı kutuya dönüldü');

    // Tamam: ayrıntı sayfası; vitrinde yüklenen bilgi bellekten kullanılır; geri dönünce odak ve vitrin aynı
    const shown = await heroTitle(page);
    await page.waitForFunction(() => /Henrik Lindholm/.test(document.querySelector('#hero').textContent), null, { timeout: 5000 });
    const hitsBefore = vodHits();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#mv-play', { timeout: 5000 });
    await page.waitForFunction(() => /Henrik Lindholm/.test(document.querySelector('#mv-facts').textContent), null, { timeout: 5000 });
    ok(vodHits() === hitsBefore, 'ayrıntı sayfası vitrinde yüklenen bilgiyi bellekten kullandı (yeni istek yok)');
    ok((await page.textContent('.dt-t')) === shown, 'Tamam: doğru filmin ayrıntı sayfası açıldı');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#mv-play', { state: 'detached', timeout: 5000 });
    await sleep(400);
    ok((await cell(page)) === '0.2' && (await heroTitle(page)) === shown, 'geri: odak ve vitrin aynı kutuda');

    // hızlı gezinme: beklemeden geçilen kutular için ağ isteği gitmez
    const before = vodHits();
    await press(page, 'ArrowRight', 4, 70);
    await sleep(900);
    ok(vodHits() - before <= 1, `hızlı gezinmede ayrıntı isteği yalnız durulan kutu için (${vodHits() - before} istek)`);

    // en üst satırda yukarı ok satırlara takılmaz: kumandanın üst çubuğuna geçer
    await press(page, 'ArrowUp', 1, 300);
    ok(await page.evaluate(() => !document.querySelector('#list').contains(document.activeElement)), 'ilk satırda yukarı ok: odak üst çubuğa çıktı');

    // Düzenle kutusu: en alt satır; Tamam klasik kategori listesini düzenleme kipinde açar, Bitti satırlara döner
    await page.focus('#list .sh-row .card');
    const last = (await titles(page)).length - 1;
    await press(page, 'ArrowDown', last, 400);
    ok(await page.evaluate(() => document.activeElement.classList.contains('sh-edit')), 'en alt satırda "Kategorileri düzenle" kutusuna odak geldi');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.row.cat', { timeout: 5000 });
    ok(await page.evaluate(() => !document.querySelector('.sh-row') && (document.querySelector('#cat-edit') || {}).textContent === 'Bitti'), 'Düzenle: klasik kategori listesi düzenleme kipinde açıldı');
    await page.click('#cat-edit');
    await page.waitForSelector('.sh-row', { timeout: 5000 });
    ok(true, 'Bitti: satır görünümüne dönüldü');
    ok(errs.length === 0, 'TV 1920×1080: sayfa hatası yok' + (errs.length ? ': ' + errs[0] : ''));
    await page.screenshot({ path: path.join(__dirname, 'shots', '14-tv-satirlar.png') }).catch(() => {});
    await ctx.close();
  }

  // ---- 2) TV 960×540: bir satır tam görünür, alttaki satırın başlığı görünür, halka kırpılmaz, vitrin metni sığar
  {
    const { ctx, page, errs } = await open({ width: 960, height: 540 });
    await enter(page);
    await page.waitForFunction(() => /Henrik Lindholm|Filmin konusu/.test(document.querySelector('#hero').textContent), null, { timeout: 5000 });
    const hero = await page.evaluate(() => {
      const h = document.querySelector('#hero');
      const p = document.querySelector('#hero .hero-p');
      return { clipped: h.scrollHeight > h.clientHeight + 1, plotIn: !p || p.getBoundingClientRect().bottom <= h.getBoundingClientRect().bottom + 1 };
    });
    ok(!hero.clipped && hero.plotIn, '960×540: vitrin metni sığıyor');
    const f0 = await fits(page);
    ok(f0.top >= 4 && f0.bottom >= 4, `960×540: ilk satırdaki kutu tam görünür (üst ${f0.top}, alt ${f0.bottom})`);
    await press(page, 'ArrowDown', 1, 500);
    const f1 = await fits(page);
    ok(f1.top >= 4 && f1.bottom >= 4, `960×540: aşağı inince de tam görünür (üst ${f1.top}, alt ${f1.bottom})`);
    const cw = await page.evaluate(() => Math.round(document.querySelector('.sh-row .card').getBoundingClientRect().width));
    ok(cw >= 84 && cw <= 210, `960×540: kutu genişliği makul (${cw} px)`);
    ok(errs.length === 0, '960×540: sayfa hatası yok');
    await ctx.close();
  }

  // ---- 3) Büyük liste: 24 sınırı, "Tümünü gör" kutusu, Geri ile aynı kutuya dönüş
  {
    const { ctx, page, errs } = await open({ width: 1920, height: 1080 }, { big: true });
    await enter(page);
    const n0 = await page.evaluate(() => document.querySelectorAll('.sh-row[data-row="0"] [data-c]').length);
    ok(n0 === 25, `ilk satır 24 kutu + "Tümünü gör" (${n0} hücre)`);
    ok(/60/.test(await page.textContent('.sh-row[data-row="0"] .sh-more')), '"Tümünü gör" kutusu toplam sayıyı gösteriyor (60)');
    await press(page, 'ArrowRight', 24, 40);
    await sleep(400);
    ok((await cell(page)) === '0.24' && (await page.evaluate(() => document.activeElement.hasAttribute('data-more'))), 'sağ ok ×24: odak "Tümünü gör" kutusunda');
    const fm = await fits(page);
    ok(fm.right >= 4 && fm.left >= 4, `"Tümünü gör" kutusu ekranda tam görünür (sol ${fm.left}, sağ ${fm.right})`);
    await press(page, 'ArrowRight', 1, 100);
    ok((await cell(page)) === '0.24', 'satır sonunda sağ ok yer değiştirmez (yutulur)');

    await page.keyboard.press('Enter');
    await page.waitForSelector('#crumb-t', { timeout: 5000 });
    await page.waitForSelector('#list .card', { timeout: 5000 });
    ok((await page.textContent('#crumb-t')) === 'Tümü' && (await page.evaluate(() => window.__iptv.S.items.length)) === 60, 'Tümünü gör: Tümü açıldı, 60 yapımın hepsi listede');
    ok(await page.evaluate(() => !document.querySelector('#hero').hidden), 'ızgarada da vitrin açık');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.sh-row', { timeout: 5000 });
    await sleep(500);
    ok((await cell(page)) === '0.24', 'Geri: satırlara dönüldü, odak yine "Tümünü gör" kutusunda');

    // başka satır: Dram (30 yapım)
    const dram = (await titles(page)).indexOf('Dram');
    await press(page, 'ArrowDown', dram, 400);
    await press(page, 'ArrowRight', 30, 20);
    await sleep(300);
    ok(await page.evaluate((d) => document.activeElement.hasAttribute('data-more') && document.activeElement.dataset.r === String(d), dram), 'Dram satırında "Tümünü gör" kutusuna gelindi');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#crumb-t', { timeout: 5000 });
    ok((await page.textContent('#crumb-t')) === 'Dram' && (await page.evaluate(() => window.__iptv.S.items.length)) === 30, 'Dram açıldı, 30 yapım listede');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.sh-row', { timeout: 5000 });
    await sleep(500);
    ok((await cell(page)) === `${dram}.24`, `Geri: Dram satırındaki "Tümünü gör" kutusuna dönüldü (${await cell(page)})`);
    ok(errs.length === 0, 'büyük liste: sayfa hatası yok' + (errs.length ? ': ' + errs[0] : ''));
    await ctx.close();
  }

  // ---- 4) Kilitli kategori: satırda kilit kutusu, şifre, açılınca yapımlar; Tümü sayısı kilitliyken düşer
  {
    const { ctx, page, errs } = await open({ width: 1920, height: 1080 });
    // şifre, açık TV sayfasında tanımlanır (açılış kilidi istemesin); kategori kilitleri hemen etkin olur
    await page.evaluate(async () => {
      const { makeRecord } = await import('./js/lock.js');
      window.__iptv.store.setPref('lock.pin', await makeRecord('1234'));
    });
    await enter(page);
    const all0 = Number(await page.textContent('.sh-row[data-row="0"] .sh-t small'));
    await page.click('.sh-edit');
    await page.waitForSelector('.row.cat.edit', { timeout: 5000 });
    await page.click('.row.cat:has-text("Dram") [data-act=lock]');
    await page.click('#cat-edit');
    await page.waitForSelector('.sh-row', { timeout: 5000 });
    await sleep(400);
    const dramR = (await titles(page)).indexOf('Dram');
    ok(await page.evaluate((r) => !!document.querySelector(`.sh-row[data-row="${r}"] .sh-lock`) && !!document.querySelector(`.sh-row[data-row="${r}"] .sh-t use[href="#i-lock"]`), dramR), 'kilitli kategori: satırda kilit simgesi ve "Kilitli" kutusu');
    const all1 = Number(await page.textContent('.sh-row[data-row="0"] .sh-t small'));
    ok(all1 < all0, `kilitli kategorinin yapımları Tümü satırından düştü (${all0} → ${all1})`);
    ok((await page.evaluate((r) => document.querySelectorAll(`.sh-row[data-row="${r}"] .card`).length, dramR)) === 0, 'kilitli satırda hiç yapım kutusu yok');

    await page.click(`.sh-row[data-row="${dramR}"] .sh-lock`);
    await page.waitForSelector('#lock', { timeout: 5000 });
    await page.click('#lock [data-k=x]');
    await page.waitForSelector('#lock', { state: 'detached' });
    ok(await page.evaluate((r) => !!document.querySelector(`.sh-row[data-row="${r}"] .sh-lock`), dramR), 'şifre ekranı iptal edilince satır kilitli kaldı');
    await page.click(`.sh-row[data-row="${dramR}"] .sh-lock`);
    await page.waitForSelector('#lock');
    for (const d of '1234') await page.click(`#lock [data-k="${d}"]`);
    await page.waitForSelector('#lock', { state: 'detached' });
    await page.waitForFunction((r) => document.querySelectorAll(`.sh-row[data-row="${r}"] .card`).length > 0, dramR, { timeout: 5000 });
    ok(true, 'doğru şifre: satır açıldı, yapımlar göründü');
    const all2 = Number(await page.textContent('.sh-row[data-row="0"] .sh-t small'));
    ok(all2 === all0, `şifre girilince Tümü sayısı geri geldi (${all2})`);
    ok(errs.length === 0, 'kilit: sayfa hatası yok' + (errs.length ? ': ' + errs[0] : ''));
    await ctx.close();
  }

  // ---- 5) Dizi sekmesi aynı satır görünümünü kullanır; özet listeden gelir (ayrıntı isteği yok)
  {
    const { ctx, page, errs } = await open({ width: 1920, height: 1080 });
    const before = vodHits();
    await enter(page, 'series');
    const t = await heroTitle(page);
    ok(t.length > 0 && (await page.textContent('#hero')).includes('özeti'), 'dizi satırlarında vitrin özeti listeden geldi: ' + t);
    await sleep(900);
    ok(vodHits() === before, 'dizi için film ayrıntısı istenmedi');
    ok(errs.length === 0, 'dizi: sayfa hatası yok');
    await ctx.close();
  }

  // ---- 6) Ayar: TV'de Klasik / Klasik + TV vitrini / Netflix gibi; canlı TV etkilenmez
  {
    for (const [mv, want] of [['classic', 'cats'], ['hero', 'cats'], ['rows', 'rows'], ['auto', 'rows']]) {
      const { ctx, page, errs } = await open({ width: 1280, height: 720 }, { mv });
      await page.click('.tile.t-movie');
      await page.waitForSelector(want === 'rows' ? '.sh-row' : '.row.cat', { timeout: 8000 });
      const rows = await page.evaluate(() => document.querySelectorAll('.sh-row').length);
      const cats = await page.evaluate(() => document.querySelectorAll('.row.cat').length);
      ok(want === 'rows' ? rows > 0 && cats === 0 : cats > 0 && rows === 0, `TV, ayar "${mv}": ${want === 'rows' ? 'satırlar' : 'klasik kategori listesi'} (${rows} satır, ${cats} kategori)`);
      ok(errs.length === 0, `TV, ayar "${mv}": sayfa hatası yok`);
      if (mv === 'rows') {
        // canlı TV'de kategori listesi hep klasik kalır
        await page.keyboard.press('Escape');
        await sleep(300);
        await page.click('.tile.t-live');
        await page.waitForSelector('.row.cat', { timeout: 8000 });
        ok((await page.evaluate(() => document.querySelectorAll('.sh-row').length)) === 0, 'canlı TV kategorileri satır olmadı');
      }
      await ctx.close();
    }
  }

  // ---- 7) Telefon: varsayılan klasik; Ayarlar'dan Netflix gibi seçilince satırlar, kaydırılır, vitrin yalnız yatay + kumanda
  {
    const { ctx, page, errs } = await open({ width: 390, height: 844 }, { tv: false });
    await page.click('.tile.t-movie');
    await page.waitForSelector('.row.cat', { timeout: 8000 });
    ok((await page.evaluate(() => document.querySelectorAll('.sh-row').length)) === 0, 'telefon varsayılanı: klasik kategori listesi');
    await page.click('#tabs [data-tab=sources]');
    await page.click('[data-set=general]');
    await page.waitForSelector('#g-mv');
    const opts = await page.$$eval('#g-mv option', (o) => o.map((x) => x.value));
    ok(opts.join() === 'auto,rows,hero,classic', 'Ayarlar: Film ve dizi ekranı seçenekleri: ' + opts.join());
    ok((await page.inputValue('#g-mv')) === 'auto', 'Ayarlar: varsayılan seçim Otomatik');
    await page.selectOption('#g-mv', 'rows');
    ok((await page.evaluate(() => window.__iptv.store.pref('set.mvView', 'auto'))) === 'rows', 'seçim kaydedildi');
    await page.click('.sheet [data-close]');
    await page.click('#tabs [data-tab=movies]');
    await page.waitForSelector('.sh-row', { timeout: 8000 });
    await sleep(400);
    const m = await page.evaluate(() => {
      const strip = document.querySelector('.sh-row .sh-strip');
      const card = document.querySelector('.sh-row .card');
      return { cw: Math.round(card.getBoundingClientRect().width), scroll: strip.scrollWidth > strip.clientWidth + 20, rows: document.querySelectorAll('.sh-row').length };
    });
    ok(Math.abs(m.cw - Math.round(390 / 3.75)) <= 2, `telefonda ekranda ~3,3 kutu, dördüncüsü yarım görünür (kutu ${m.cw} px)`);
    ok(m.scroll && m.rows >= 2, 'telefon: satırlar yatay kaydırılabilir');
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('#hero')).display === 'none' && getComputedStyle(document.querySelector('#hero-bg')).display === 'none'), 'telefon dikey: vitrin ve arka plan gizli');
    // parmakla yatay kaydırma gibi: kaydırınca 25. kutuya ulaşılır, dokununca ayrıntı açılır
    await page.evaluate(() => { const s = document.querySelector('.sh-row .sh-strip'); s.scrollLeft = 300; });
    await sleep(200);
    await page.tap('.sh-row[data-row="0"] .card[data-c="5"]');
    await page.waitForSelector('#mv-play', { timeout: 5000 });
    ok(true, 'telefon: kutuya dokununca ayrıntı sayfası açıldı');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#mv-play', { state: 'detached', timeout: 5000 });
    ok(true, 'telefon: Geri ayrıntıyı kapattı');

    // yatay telefon + klavye/kumanda: vitrin görünür
    await page.setViewportSize({ width: 844, height: 390 });
    await sleep(500);
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('#hero')).display === 'none'), 'telefon yatay, kumanda yok: vitrin gizli');
    await page.focus('.sh-row[data-row="0"] .card[data-c="0"]');
    await press(page, 'ArrowRight', 1, 400);
    ok(await page.evaluate(() => document.documentElement.classList.contains('kbd') && getComputedStyle(document.querySelector('#hero')).display !== 'none' && document.querySelector('#hero .hero-t').textContent.length > 0), 'telefon yatay + tuş: vitrin göründü');

    // ayarı Klasik yap
    await page.evaluate(() => window.__iptv.store.setPref('set.mvView', 'classic'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#tabs [data-tab=home]');
    await page.click('#tabs [data-tab=movies]');
    await page.waitForSelector('.row.cat', { timeout: 8000 });
    ok((await page.evaluate(() => document.querySelectorAll('.sh-row').length)) === 0, 'ayar Klasik: telefonda kategori listesi geri geldi');
    ok(errs.length === 0, 'telefon: sayfa hatası yok' + (errs.length ? ': ' + errs[0] : ''));
    await ctx.close();
  }

  // ---- 8) Hafif mod (TV kutularında otomatik açılır): gölgeler kapalı ama kumanda halkası (gölgeyle çizilir) görünür kalır
  {
    const { ctx, page, errs } = await open({ width: 1280, height: 720 }, { mv: 'rows', lite: 'on' });
    ok(await page.evaluate(() => document.documentElement.hasAttribute('data-lite')), 'hafif mod açık');
    const shadow = (sel) => page.evaluate((q) => getComputedStyle(document.querySelector(q)).boxShadow, sel);
    // ana ekran: odaktaki kutu halkalı, ötekiler gölgesiz
    await page.keyboard.press('ArrowRight');
    await sleep(200);
    const home = await page.evaluate(() => {
      const f = document.activeElement;
      const other = [...document.querySelectorAll('.tile')].find((t) => t !== f);
      return { on: getComputedStyle(f).boxShadow, off: other ? getComputedStyle(other).boxShadow : 'yok', cls: f.className };
    });
    ok(home.on !== 'none' && /255, 255, 255/.test(home.on), 'hafif mod: ana ekranda odaktaki kutunun beyaz halkası var (' + home.cls + ')');
    ok(home.off === 'none', 'hafif mod: odakta olmayan kutuda gölge yok');
    // satırlarda odaktaki film kutusu
    await page.click('.tile.t-movie');
    await page.waitForSelector('.sh-row .card', { timeout: 8000 });
    await sleep(500);
    await press(page, 'ArrowRight', 1, 300);
    ok((await page.evaluate(() => getComputedStyle(document.activeElement).boxShadow)) !== 'none', 'hafif mod: satırlarda odaktaki film kutusunun halkası var');
    ok((await page.evaluate(() => getComputedStyle(document.querySelector('.sh-row .card:not(:focus)')).boxShadow)) === 'none', 'hafif mod: odakta olmayan film kutusunda gölge yok');
    ok(errs.length === 0, 'hafif mod: sayfa hatası yok');
    await ctx.close();
  }

  // ---- 9) Vitrin arka planı: ayrıntı yoldayken afiş kırpık çizilmez; geniş görsel gelince o görünür; ayrıntı gelmezse afiş yedek olur
  {
    const withPosters = async (ctx, vodInfo) => {
      await ctx.route(
        (u) => u.pathname.endsWith('/player_api.php') && u.searchParams.get('action') === 'get_vod_streams',
        (r) =>
          r.fulfill({
            status: 200,
            headers: CORS,
            contentType: 'application/json',
            body: JSON.stringify(bigMovies.slice(0, 8).map((m, i) => ({ ...m, stream_icon: `${mock.url}/logo/${i + 1}.svg`, category_id: '2' }))),
          })
      );
      await ctx.route((u) => u.pathname.endsWith('/player_api.php') && u.searchParams.get('action') === 'get_vod_info', vodInfo);
    };
    const bgState = (page) =>
      page.evaluate(() => {
        const el = document.querySelector('#hero-bg');
        const on = [...el.children].find((i) => i.classList.contains('on'));
        return { has: el.classList.contains('has'), url: on ? on.style.backgroundImage : '', poster: !!on && on.classList.contains('poster') };
      });

    // a) ayrıntı geç gelir (1,8 sn): bu sürede arka plan afişle doldurulmaz
    let { ctx, page, errs } = await open({ width: 1920, height: 1080 }, { setup: (c) => withPosters(c, (r) => setTimeout(() => r.continue().catch(() => {}), 1800)) });
    await page.click('.tile.t-movie');
    await page.waitForSelector('.sh-row .card', { timeout: 8000 });
    await sleep(900);
    let st = await bgState(page);
    ok(!st.has && !st.url, 'ayrıntı yoldayken arka plan afişle doldurulmadı (kırpık afiş görünmüyor)');
    await page.waitForFunction(() => /\/backdrop\//.test([...document.querySelectorAll('#hero-bg i.on')].map((i) => i.style.backgroundImage).join()), null, { timeout: 8000 });
    st = await bgState(page);
    ok(st.has && !st.poster, 'ayrıntı gelince geniş görsel (kırpmasız, tam ekran) görünüyor');
    // sonraki kutuya geçince geniş görsel gelene dek eskisi durur, afişe düşmez
    await press(page, 'ArrowRight', 1, 100);
    await sleep(500);
    st = await bgState(page);
    ok(st.has && /\/backdrop\//.test(st.url), 'yeni kutuda ayrıntı gelene dek önceki geniş görsel duruyor (afiş çizilmedi)');
    ok(errs.length === 0, 'vitrin arka planı: sayfa hatası yok');
    await ctx.close();

    // b) ayrıntı hiç gelmez: afiş yedek olarak, sağda bütün gösterilir
    ({ ctx, page, errs } = await open({ width: 1920, height: 1080 }, { setup: (c) => withPosters(c, (r) => r.abort()) }));
    await page.click('.tile.t-movie');
    await page.waitForSelector('.sh-row .card', { timeout: 8000 });
    await page.waitForFunction(() => /\/logo\//.test([...document.querySelectorAll('#hero-bg i.on')].map((i) => i.style.backgroundImage).join()), null, { timeout: 8000 });
    st = await bgState(page);
    ok(st.has && st.poster, 'ayrıntı gelmeyince afiş yedek olarak çizildi ve "poster" düzeninde (sağda, bütün)');
    ok((await page.evaluate(() => getComputedStyle(document.querySelector('#hero-bg i.on')).backgroundSize)) === 'contain', 'afiş kırpılmadan (contain) gösteriliyor');
    ok(errs.length === 0, 'afiş yedeği: sayfa hatası yok');
    await ctx.close();
  }
}

module.exports = { satirlarSection };

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
      await satirlarSection({ browser, base: `http://127.0.0.1:${www.address().port}/`, mock, ok, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
    } finally {
      await browser.close();
      www.close();
      await mock.close();
    }
    console.log(fails ? `\n${fails} denetim başarısız` : '\nsatır denetimleri geçti');
    process.exit(fails ? 1 : 0);
  })();
}
