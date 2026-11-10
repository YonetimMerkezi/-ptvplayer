// Yönetici paneli ve davet kodu uçtan uca denemesi (sahte GitHub: raw + api). Tek başına: node tests/e2e/admin.cjs
// run.cjs sonunda da çağrılır. Gerçek GitHub’a hiç gitmez.
const path = require('node:path');

function fakeGithub() {
  const files = new Map(); // yol → { text, sha }
  let branch = false;
  let n = 0;
  const log = [];
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type,accept,x-github-api-version', 'access-control-allow-methods': 'GET,PUT,POST,OPTIONS' };
  const json = (route, status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  async function install(ctx) {
    await ctx.route('https://raw.githubusercontent.com/YonetimMerkezi/-ptvplayer/data/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').pop();
      const f = files.get(name);
      log.push('RAW ' + name);
      if (!f) return route.fulfill({ status: 404, headers: cors, body: 'Not Found' });
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/plain' }, body: f.text });
    });
    await ctx.route('https://api.github.com/repos/YonetimMerkezi/-ptvplayer/**', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const u = new URL(req.url());
      const p = u.pathname.replace('/repos/YonetimMerkezi/-ptvplayer', '');
      const m = req.method();
      log.push(`${m} ${p}`);
      if ((req.headers().authorization || '') !== 'Bearer TOKEN-TEST') return json(route, 401, { message: 'Bad credentials' });
      if (p === '' && m === 'GET') return json(route, 200, { default_branch: 'main', permissions: { push: true } });
      if (p === '/branches/data') return branch ? json(route, 200, {}) : json(route, 404, {});
      if (p === '/git/ref/heads/main') return json(route, 200, { object: { sha: 'abc123' } });
      if (p === '/git/refs' && m === 'POST') {
        branch = true;
        return json(route, 201, {});
      }
      const c = /^\/contents\/(.+)$/.exec(p);
      if (c && m === 'GET') {
        const f = files.get(c[1]);
        return f ? json(route, 200, { sha: f.sha, content: Buffer.from(f.text).toString('base64') }) : json(route, 404, {});
      }
      if (c && m === 'PUT') {
        const body = JSON.parse(req.postData());
        const f = files.get(c[1]);
        if ((f && body.sha !== f.sha) || (!f && body.sha)) return json(route, 409, { message: 'sha mismatch' });
        const sha = 'sha' + ++n;
        files.set(c[1], { text: Buffer.from(body.content, 'base64').toString('utf8'), sha });
        return json(route, 200, { content: { sha } });
      }
      return json(route, 404, {});
    });
  }
  return { files, log, install, hasBranch: () => branch };
}

async function adminSection({ browser, base, mock, ok, sleep, SHOTS }) {
  console.log('Yönetici paneli ve davet kodu');
  const gh = fakeGithub();
  const SECRET = 'SIRKEN-PAROLA';
  const LIST = `${mock.url}/list.m3u?username=gizli-kullanici&password=${SECRET}`;
  const mk = async (vp) => {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] });
    await gh.install(ctx);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.addInitScript(() => localStorage.setItem('iptv.pref.seen.changelog', '999'));
    await page.goto(base);
    return { ctx, page, errs };
  };

  // ---- yönetici telefonu: normal kaynak ekler, sürüm satırına 7 dokunuşla paneli açar
  const A = await mk({ width: 390, height: 844 });
  const a = A.page;
  await a.waitForSelector('#f');
  await a.click('#f-type [data-t=m3u]');
  await a.fill('input[name=url]', `${mock.url}/list.m3u`);
  await a.click('#f-go');
  await a.waitForSelector('.tile.t-live', { timeout: 15000 });
  await a.click('[data-tab=sources]');
  await a.waitForSelector('#ver-tap');
  ok((await a.$$('.set-tile')).length === 9 && !(await a.$('[data-set=admin]')), 'Yönetici paneli varsayılan olarak gizli (tile sayısı 9)');
  for (let i = 0; i < 7; i++) await a.click('#ver-tap');
  await a.waitForSelector('[data-set=admin]');
  ok(true, 'sürüm satırına 7 dokunuş “Yönetici” kutusunu gösterdi');
  await a.click('[data-set=admin]');
  await a.waitForSelector('#adm-setup');
  // yanlış girişler
  await a.fill('#adm-tok', 'YANLIS');
  await a.fill('#adm-p1', 'panel-parolasi-1');
  await a.fill('#adm-p2', 'panel-parolasi-1');
  await a.click('#adm-setup');
  await a.waitForFunction(() => !document.querySelector('#adm-err').hidden);
  ok(/Token geçersiz/.test(await a.textContent('#adm-err')), 'yanlış token açık bir hatayla reddedildi');
  await a.fill('#adm-p2', 'başka');
  await a.fill('#adm-tok', 'TOKEN-TEST');
  await a.click('#adm-setup');
  ok(/Parolalar aynı değil/.test(await a.textContent('#adm-err')), 'parola tekrarı uyuşmazsa uyarı');
  await a.fill('#adm-p2', 'panel-parolasi-1');
  await a.click('#adm-setup');
  await a.waitForSelector('#adm-tabs');
  ok(gh.hasBranch(), 'veri dalı yoksa oluşturuldu');
  ok(!JSON.stringify(await a.evaluate(() => Object.entries(localStorage))).includes('TOKEN-TEST'), 'token yerelde düz metin saklanmıyor');

  // ---- kullanıcı oluştur
  await a.click('#adm-new');
  await a.waitForSelector('#uf');
  await a.fill('#uf input[name=name]', 'Deneme Kullanıcı');
  await a.selectOption('#uf select[name=days]', '30');
  await a.selectOption('#uf select[name=type0]', 'm3u');
  await a.fill('#uf input[name=url0]', LIST);
  await a.click('#uf button[type=submit]');
  await a.waitForSelector('#adm .src b');
  await a.waitForFunction(() => /Yayında/.test(document.querySelector('#adm-status').textContent));
  const code = await a.textContent('#adm .src b');
  ok(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/.test(code), 'kullanıcı için davet kodu üretildi: ' + code);
  ok(gh.files.has('config.json') && gh.files.has('vault.json'), 'config.json ve vault.json yayınlandı');
  const pub = [...gh.files.values()].map((f) => f.text).join('\n');
  ok(!pub.includes(SECRET) && !pub.includes('gizli-kullanici') && !pub.includes('Deneme') && !pub.includes(code) && !pub.includes('/list.m3u'), 'GitHub’a giden dosyalarda liste adresi, şifre, ad ve kod düz metin yok');
  await a.screenshot({ path: path.join(SHOTS, '60-yonetici-kullanicilar.png') });

  // ---- kullanıcı telefonu: kodla ekler
  const B = await mk({ width: 390, height: 844 });
  const b = B.page;
  await b.waitForSelector('#f');
  await b.click('#f-type [data-t=code]');
  ok(!(await b.isVisible('input[name=name]')) && (await b.isVisible('input[name=code]')), '“Kod” türünde yalnız kod alanı görünür');
  await b.fill('input[name=code]', 'abcd-efgh');
  await b.click('#f-go');
  await b.waitForFunction(() => !document.querySelector('#f-err').hidden);
  ok(/16 harf/.test(await b.textContent('#f-err')), 'eksik kod açıklayıcı hatayla reddedildi');
  await b.fill('input[name=code]', 'AAAA-BBBB-CCCC-DDDD');
  await b.click('#f-go');
  await b.waitForFunction(() => /bulunamadı/.test(document.querySelector('#f-err').textContent));
  ok(true, 'olmayan kod “bulunamadı” dedi');
  await b.fill('input[name=code]', code.toLowerCase().replace(/-/g, ' '));
  await b.click('#f-go');
  await b.waitForSelector('.tile.t-live', { timeout: 20000 });
  const srcs = await b.evaluate(() => window.__iptv.store.sources());
  ok(srcs.length === 1 && srcs[0].managed === true && srcs[0].url === LIST, 'kod girilince liste yönetilen kaynak olarak eklendi ve yüklendi');
  await b.click('[data-tab=sources]');
  await b.waitForSelector('.src');
  const card = await b.textContent('.src');
  ok(/Davet koduyla eklendi/.test(card) && !card.includes(SECRET) && !card.includes('gizli-kullanici'), 'kaynak kartında liste adresi/şifre görünmüyor');
  ok(!(await b.$('.src [data-a=edit]')) && !!(await b.$('.src [data-a=del]')), 'yönetilen kaynak düzenlenemez, silinebilir');
  await b.screenshot({ path: path.join(SHOTS, '61-kodlu-kaynak.png') });

  // ---- yenileme: değişiklik yoksa dokunmaz
  const r0 = await b.evaluate(() => window.__iptv.refreshManaged({ force: true }).then(() => window.__iptv.store.sources().length));
  ok(r0 === 1, 'değişiklik yokken yenileme kaynağı korudu');

  // ---- yönetici kullanıcıyı kapatır → kullanıcı cihazında liste kalkar
  await a.click('[data-a=toggle]');
  await a.waitForFunction(() => /Kapalı/.test(document.querySelector('#adm .src .badge').textContent));
  await a.waitForFunction(() => /Yayında/.test(document.querySelector('#adm-status').textContent));
  await b.evaluate(() => window.__iptv.refreshManaged({ force: true }));
  await b.waitForSelector('#mg-ok');
  ok(/artık geçerli değil/.test(await b.textContent('.sheet:has(#mg-ok)')), 'kapatılan kullanıcının cihazında açıklayıcı uyarı çıktı');
  ok((await b.evaluate(() => window.__iptv.store.sources().length)) === 0, 'liste cihazdan kaldırıldı');
  await b.click('#mg-ok');
  await b.waitForSelector('#f');
  ok(true, 'kaynak kalmayınca kaynak ekleme ekranı açıldı');

  // ---- yeniden aç + cihazı engelle
  await a.click('[data-a=toggle]');
  await a.waitForFunction(() => /Aktif/.test(document.querySelector('#adm .src .badge').textContent));
  await a.waitForFunction(() => /Yayında/.test(document.querySelector('#adm-status').textContent));
  const devId = await b.evaluate(() => window.__iptv.store.pref('dev.id', ''));
  ok(/^[0-9a-f]{12}$/.test(devId), 'cihaz kimliği üretildi');
  await a.click('#adm-tabs [data-t=blocked]');
  await a.fill('#bl-id', devId.toUpperCase().replace(/(.{4})/g, '$1-').slice(0, -1));
  await a.fill('#bl-note', 'Deneme');
  await a.click('#bl-add');
  await a.waitForSelector('#adm-view .list-item');
  await a.waitForFunction(() => /Yayında/.test(document.querySelector('#adm-status').textContent));
  ok(true, 'engelli cihaz eklendi ve yayınlandı');
  await b.click('#f-type [data-t=code]');
  await b.fill('input[name=code]', code);
  await b.click('#f-go');
  await b.waitForFunction(() => /erişimi kapatıldı/.test(document.querySelector('#f-err').textContent));
  ok(true, 'engelli cihazda kod girişi reddedildi');
  await a.click('#adm-view [data-a=unblock]');
  await a.waitForFunction(() => /Yayında/.test(document.querySelector('#adm-status').textContent) && !document.querySelector('#adm-view .list-item'));
  await b.click('#f-go');
  await b.waitForFunction(() => window.__iptv.store.sources().length === 1, null, { timeout: 20000 });
  ok(true, 'engel kaldırılınca kod yeniden çalıştı');

  // ---- sorun raporu: kullanıcı gönderir (panoya), yönetici içe alır
  await b.click('[data-tab=sources]');
  await b.click('[data-set=general]');
  await b.waitForSelector('#g-rep');
  ok((await b.textContent('#g-dev-s')).replace(/-/g, '').toLowerCase() === devId, 'Genel ayarlar’da cihaz kimliği görünüyor');
  await b.click('#g-rep');
  await b.waitForSelector('#rp-send');
  const view = await b.textContent('#rp-view');
  ok(!view.includes(SECRET) && !view.includes('gizli-kullanici') && /Kanal \d+/.test(view), 'rapor önizlemesinde kimlik bilgisi yok, sayılar var');
  await b.click('#rp-send');
  await b.waitForFunction(() => !document.querySelector('#rp-send'));
  const sent = await b.evaluate(() => navigator.clipboard.readText());
  ok(sent.includes('IPTVRAPOR1:') && !sent.includes(SECRET), 'rapor panoya kopyalandı (paylaşım menüsü yokken)');
  await a.click('#adm-tabs [data-t=reports]');
  await a.fill('#rp-in', 'Ali’den:\n' + sent + '\nteşekkürler');
  await a.click('#rp-add');
  await a.waitForSelector('#adm-view [data-a=rview]');
  ok((await a.textContent('#adm-view')).includes(devId.toUpperCase().slice(0, 4)), 'rapor yöneticide cihaz olarak listelendi');
  await a.click('#adm-view [data-a=rview]');
  await a.waitForSelector('.sheet pre');
  ok(/Sürüm/.test(await a.textContent('.sheet pre')), 'rapor ayrıntısı açıldı');
  await a.screenshot({ path: path.join(SHOTS, '62-yonetici-rapor.png') });
  await a.click('.sheet [data-close]');

  // ---- kilit: yeniden açınca parola ister; yanlış parola reddedilir
  await a.click('.pg-bar [data-close]');
  await a.click('[data-set=admin]');
  await a.waitForSelector('#adm-unlock');
  await a.fill('#adm-p1', 'yanlis-parola');
  await a.click('#adm-unlock');
  await a.waitForFunction(() => !document.querySelector('#adm-err').hidden);
  ok(/Parola yanlış/.test(await a.textContent('#adm-err')), 'yanlış panel parolası reddedildi');
  await a.fill('#adm-p1', 'panel-parolasi-1');
  await a.click('#adm-unlock');
  await a.waitForSelector('#adm-tabs');
  ok((await a.$$('#adm .src')).length === 1, 'doğru parolayla kasa GitHub’dan geri yüklendi (kullanıcı duruyor)');

  ok(A.errs.length === 0 && B.errs.length === 0, 'konsol hatası yok' + (A.errs.concat(B.errs).length ? ': ' + A.errs.concat(B.errs).slice(0, 3).join(' | ') : ''));
  await A.ctx.close();
  await B.ctx.close();
}

module.exports = { adminSection };

if (require.main === module) {
  const { chromium } = require('playwright');
  const http = require('node:http');
  const fs = require('node:fs');
  const WWW = path.join(__dirname, '..', '..', 'www');
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  const SHOTS = process.env.SHOTS || path.join(__dirname, 'shots');
  fs.mkdirSync(SHOTS, { recursive: true });
  let fails = 0;
  const ok = (c, m) => {
    console.log((c ? '  ✓ ' : '  ✗ ') + m);
    if (!c) fails++;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    const { startMock } = await import('../../mock/server.mjs');
    const mock = await startMock(0);
    const www = await new Promise((r) => {
      const srv = http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p === '/') p = '/index.html';
        const f = path.join(WWW, p);
        if (!f.startsWith(WWW) || !fs.existsSync(f)) return res.writeHead(404).end();
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }).end(fs.readFileSync(f));
      });
      srv.listen(0, '127.0.0.1', () => r(srv));
    });
    const base = `http://127.0.0.1:${www.address().port}/`;
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    await adminSection({ browser, base, mock, ok, sleep, SHOTS });
    await browser.close();
    www.close();
    await mock.close();
    console.log(fails ? `\n${fails} denetim BAŞARISIZ` : '\nYönetici denetimleri geçti');
    process.exit(fails ? 1 : 0);
  })().catch((e) => {
    console.error(e);
    process.exit(2);
  });
}
