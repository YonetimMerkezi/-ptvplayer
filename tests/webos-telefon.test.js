// Telefon kumandası: TV servisindeki sunucu (sayfa, kod, komut kuyruğu, uzun yoklama, kapanma) ve uygulama tarafı
// (tuş olayı üretimi, yazı alanı, oynat bağlantısı, yoklayıcı).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Sayfada iki betik var: dil betiği (telefon-dil.js) ve sayfanın kendi betiği (sonuncusu)
const sonBetik = (h) => /<script>([\s\S]*)<\/script>/.exec(h.slice(h.lastIndexOf('<script>')))[1];
import { createRequire } from 'node:module';

globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { createElement: () => ({ style: {} }), documentElement: { style: {} }, body: {} };
globalThis.getComputedStyle = globalThis.getComputedStyle || (() => ({ fontSize: '20px' }));

const require = createRequire(import.meta.url);
const svc = require('../webos/service/service.js');
const { TUS_KODLARI, tusGonder, metinGonder, youtubeKimligi, oynatmaOgesi, oynatIsle, komutIsle, telefonYoklayici, kodAl, kaynakFormuDoldur } = await import('../webos/src/telefon.js');
const { actionOf } = await import('../webos/src/keys.js');

const baslat = (p = {}) => new Promise((coz, red) => svc.kumandaBaslat({ ilkPort: 0, portAdedi: 1, ...p }, (e, r) => (e ? red(e) : coz(r))));
const sor = (p = {}) => new Promise((coz) => svc.kumandaSor(p, coz));
const bekle = (ms) => new Promise((c) => setTimeout(c, ms));

function istek(port, yol, { method = 'GET', govde } = {}) {
  return new Promise((coz, red) => {
    const veri = govde === undefined ? null : Buffer.from(typeof govde === 'string' ? govde : JSON.stringify(govde));
    const r = http.request({ host: '127.0.0.1', port, path: yol, method, headers: veri ? { 'Content-Type': 'application/json', 'Content-Length': veri.length } : {} }, (res) => {
      const p = [];
      res.on('data', (c) => p.push(c));
      res.on('end', () => {
        const metin = Buffer.concat(p).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(metin);
        } catch (e) {
          json = null;
        }
        coz({ kod: res.statusCode, tur: res.headers['content-type'], metin, json });
      });
    });
    r.on('error', red);
    if (veri) r.write(veri);
    r.end();
  });
}

// ---- Servis ----
test('kumanda: sayfa kod içermez ve betiği geçerli; verilen kod sabit kalır; ikinci başlatma aynı portu döner', async (t) => {
  t.after(() => svc.kumandaDurdur());
  const a = await baslat({ pin: '4321' });
  assert.equal(a.pin, '4321');
  assert.ok(a.port > 0 && Array.isArray(a.adresler));
  assert.deepEqual([(await baslat({ pin: '9999' })).port, (await baslat()).pin], [a.port, '4321'], 'çalışırken kod/port değişmez');
  for (const yol of ['/', '/k?k=4321']) {
    const s = await istek(a.port, yol);
    assert.equal(s.kod, 200);
    assert.match(s.tur, /text\/html; charset=utf-8/);
    assert.match(s.metin, /TV kumandası/);
    assert.ok(!s.metin.includes('4321'), 'sayfa kodu içermez (kod QR bağlantısında)');
  }
  assert.equal((await istek(a.port, '/baska')).kod, 404);
  assert.equal((await istek(a.port, '/tus')).kod, 404, 'GET /tus yok');
  const betik = sonBetik(svc._kumandaSayfa);
  assert.doesNotThrow(() => new vm.Script(betik), 'sayfadaki betik sözdizimi geçerli');
  for (const tus of Object.keys(TUS_KODLARI)) assert.ok(svc._kumandaSayfa.includes('data-t="' + tus + '"'), 'telefon sayfasında ' + tus + ' düğmesi var');
});

test('kumanda: kodsuz/yanlış kodlu istek kuyruğa girmez; çok yanlış denemede kilitlenir, ekranı yeniden açınca açılır', async (t) => {
  t.after(() => svc.kumandaDurdur());
  const a = await baslat({ pin: '1234' });
  assert.equal((await istek(a.port, '/tus', { method: 'POST', govde: { tus: 'up' } })).kod, 403);
  const y = await istek(a.port, '/tus', { method: 'POST', govde: { pin: '0000', tus: 'up' } });
  assert.equal(y.kod, 403);
  assert.match(y.json.mesaj, /kodu yanlış/);
  assert.deepEqual((await sor({ bekleMs: 0 })).komutlar, []);
  for (let i = 0; i < 8; i++) await istek(a.port, '/tus', { method: 'POST', govde: { pin: '0000', tus: 'up' } });
  assert.equal((await istek(a.port, '/tus', { method: 'POST', govde: { pin: '1234', tus: 'up' } })).kod, 429, 'doğru kodla bile kilitli');
  await baslat({ sifirla: true });
  assert.equal((await istek(a.port, '/tus', { method: 'POST', govde: { pin: '1234', tus: 'up' } })).kod, 200);
});

test('kumanda: tuş, yazı ve oynat komutları doğrulanıp sıraya girer; geçersizler reddedilir', async (t) => {
  t.after(() => svc.kumandaDurdur());
  const a = await baslat({ pin: '1234' });
  const gonder = (yol, g) => istek(a.port, yol, { method: 'POST', govde: { pin: '1234', ...g } });
  assert.equal((await gonder('/tus', { tus: 'ping' })).kod, 200, 'ping yalnız doğrular');
  assert.deepEqual((await sor({ bekleMs: 0 })).komutlar, []);
  assert.equal((await gonder('/tus', { tus: 'up' })).kod, 200);
  assert.equal((await gonder('/tus', { tus: 'ok', ms: 99999 })).kod, 200);
  assert.equal((await gonder('/tus', { tus: 'ok', ms: -5 })).kod, 200);
  assert.equal((await gonder('/tus', { tus: 'home' })).kod, 400, 'bilinmeyen tuş');
  assert.equal((await gonder('/tus', { tus: 'constructor' })).kod, 400, 'prototip adları tuş sayılmaz');
  assert.equal((await gonder('/tus', {})).kod, 400);
  assert.equal((await gonder('/metin', { metin: 'a\nb\u0000c' + 'x'.repeat(400), enter: true })).kod, 200);
  assert.equal((await gonder('/metin', { metin: 'kısa', enter: 'evet' })).kod, 200);
  assert.equal((await gonder('/oynat', { url: '  https://ornek.com/a.m3u8?x=1  ', ad: 'Maç\n1' })).kod, 200);
  for (const kotu of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://x/y', 'https://a b', 'ornek.com', '', 'http://']) {
    assert.equal((await gonder('/oynat', { url: kotu })).kod, 400, kotu);
  }
  const r = await sor({ bekleMs: 0 });
  assert.equal(r.returnValue, true);
  assert.equal(r.telefon, true, 'telefon yakın zamanda istek attı');
  assert.deepEqual(r.komutlar.slice(0, 3), [{ t: 'tus', tus: 'up', ms: 0 }, { t: 'tus', tus: 'ok', ms: 1500 }, { t: 'tus', tus: 'ok', ms: 0 }]);
  assert.equal(r.komutlar[3].t, 'metin');
  assert.equal(r.komutlar[3].metin.length, 300);
  assert.ok(!/[\n\u0000]/.test(r.komutlar[3].metin));
  assert.equal(r.komutlar[3].enter, true);
  assert.deepEqual(r.komutlar[4], { t: 'metin', metin: 'kısa', enter: false }, 'enter yalnız true ise');
  assert.deepEqual(r.komutlar[5], { t: 'oynat', url: 'https://ornek.com/a.m3u8?x=1', ad: 'Maç1' });
  assert.equal(r.komutlar.length, 6);
  assert.deepEqual((await sor({ bekleMs: 0 })).komutlar, [], 'alınan bir daha verilmez');
});

test('kumanda: uzun yoklama komut gelince hemen yanıtlar; yeni yoklama eskisini boş yanıtlar; süre dolunca boş döner', async (t) => {
  t.after(() => svc.kumandaDurdur());
  const a = await baslat({ pin: '1234' });
  const t0 = Date.now();
  const bekleyen = sor({ bekleMs: 4000 });
  await bekle(60);
  await istek(a.port, '/tus', { method: 'POST', govde: { pin: '1234', tus: 'left' } });
  const r = await bekleyen;
  assert.deepEqual(r.komutlar, [{ t: 'tus', tus: 'left', ms: 0 }]);
  assert.ok(Date.now() - t0 < 1500, 'komut beklemeden iletilir');
  // Yeni yoklama eskisini serbest bırakır (uygulama yeniden başlarsa iki yoklama birikmesin)
  const eski = sor({ bekleMs: 4000 });
  await bekle(30);
  const yeni = sor({ bekleMs: 150 });
  assert.deepEqual((await eski).komutlar, []);
  assert.deepEqual((await yeni).komutlar, [], 'süre dolunca boş liste');
});

test('kumanda: yoklama kesilince (uygulama kapandı) kapanır; bekleyen yoklama varsa kapanmaz; durdurma bekleyeni serbest bırakır', async (t) => {
  t.after(() => svc.kumandaDurdur());
  const a = await baslat({ pin: '1234' });
  assert.ok(svc._kumanda());
  assert.equal(svc._kumandaKontrol(Date.now() + 5000), false);
  assert.equal(svc._kumandaKontrol(Date.now() + 19000), false);
  const bekleyen = sor({ bekleMs: 5000 });
  assert.equal(svc._kumandaKontrol(Date.now() + 60000), false, 'uzun yoklama sürüyorsa uygulama canlıdır');
  const sonuc = svc.kumandaDurdur();
  assert.equal(sonuc.returnValue, true);
  assert.deepEqual((await bekleyen).komutlar, []);
  assert.equal(svc.kumandaDurdur().returnValue, true, 'ikinci durdurma zararsız');
  const r = await sor();
  assert.equal(r.returnValue, false);
  assert.match(r.errorText, /kapalı/);
  await assert.rejects(istek(a.port, '/', {}), 'sunucu kapandı');
  await baslat({ pin: '1234' });
  assert.equal(svc._kumandaKontrol(Date.now() + 21000), true, '20 sn yoklama yok: durur');
  assert.equal(svc._kumanda(), null);
});

test('kumanda: aktarma alıcısından bağımsız (biri durunca diğeri sürer)', async (t) => {
  t.after(() => {
    svc.kumandaDurdur();
    svc.aliciDurdur();
  });
  const k = await baslat({ pin: '1234' });
  const al = await new Promise((coz, red) => svc.aliciBaslat({ ilkPort: 0, portAdedi: 1 }, (e, r) => (e ? red(e) : coz(r))));
  assert.notEqual(k.port, al.port);
  svc.aliciDurdur();
  assert.equal((await istek(k.port, '/tus', { method: 'POST', govde: { pin: '1234', tus: 'ping' } })).kod, 200);
});

// ---- Uygulama tarafı ----
function sahteBelge({ aktif = null } = {}) {
  const olaylar = [];
  const hedefOlay = (hedef) => (e) => olaylar.push({ tur: e.type, keyCode: e.keyCode, hedef });
  const doc = {
    activeElement: aktif,
    body: { id: 'body' },
    createEvent: () => {
      const e = { type: '', initEvent(t) { this.type = t; } };
      return e;
    },
    dispatchEvent: hedefOlay('document'),
  };
  if (aktif) aktif.dispatchEvent = hedefOlay('input');
  return { doc, olaylar };
}

test('tusGonder: kumanda tuşu gibi keydown+keyup üretir; keys.js ile aynı eylem; ms ile basılı tutar; bilinmeyen tuş reddedilir', () => {
  for (const [ad, kod] of Object.entries(TUS_KODLARI)) {
    const eylem = actionOf(kod);
    assert.ok(eylem, ad + ' (' + kod + ') uygulamada tanınmalı');
    if (!/^num/.test(ad)) assert.equal(eylem, { pause: 'pause', play: 'play' }[ad] || ad, ad);
    else assert.equal(eylem, ad);
  }
  let { doc, olaylar } = sahteBelge();
  assert.equal(tusGonder('up', { doc }), true);
  assert.deepEqual(olaylar, [{ tur: 'keydown', keyCode: 38, hedef: 'document' }, { tur: 'keyup', keyCode: 38, hedef: 'document' }]);
  assert.equal(tusGonder('home', { doc }), false);
  assert.equal(tusGonder('constructor', { doc }), false);
  assert.equal(olaylar.length, 2);
  // Yazı alanı odakta ise olay oraya gider (gerçek kumanda gibi); uzun basış: keyup sonradan
  const giris = { tagName: 'INPUT' };
  ({ doc, olaylar } = sahteBelge({ aktif: giris }));
  const zamanlar = [];
  tusGonder('ok', { doc, ms: 900, bekle: (f, ms) => zamanlar.push([f, ms]) });
  assert.deepEqual(olaylar, [{ tur: 'keydown', keyCode: 13, hedef: 'input' }]);
  assert.equal(zamanlar[0][1], 900);
  zamanlar[0][0]();
  assert.equal(olaylar[1].tur, 'keyup');
});

test('metinGonder: odaktaki ya da ekrandaki yazı alanına yazar, Enter ekranın giriş işleyicisini çağırır; alan yoksa arama ekranı açılır', () => {
  const olaylar = [];
  const alan = { tagName: 'INPUT', value: '', dispatchEvent: (e) => olaylar.push(e.type) };
  const ust = { el: { querySelector: () => alan }, onInputKey: (a, e, g) => olaylar.push(['girdi', a, g === alan, e.keyCode]) };
  const doc = { activeElement: { tagName: 'DIV' }, createEvent: () => ({ type: '', initEvent(t) { this.type = t; } }) };
  assert.equal(metinGonder('breaking bad', true, { doc, ust, ac: () => assert.fail('alan varken ekran açılmaz') }), 'yazildi');
  assert.equal(alan.value, 'breaking bad');
  assert.deepEqual(olaylar, ['input', ['girdi', 'ok', true, 13]]);
  olaylar.length = 0;
  assert.equal(metinGonder('x', false, { doc, ust }), 'yazildi');
  assert.deepEqual(olaylar, ['input'], 'enter yok: yalnız yazılır');
  const acilan = [];
  const bos = { el: { querySelector: () => null } };
  assert.equal(metinGonder('film adı', true, { doc, ust: bos, ac: (ad, arg) => acilan.push([ad, arg]) }), 'arama');
  assert.deepEqual(acilan, [['search', { q: 'film adı' }]]);
  assert.equal(metinGonder('film adı', false, { doc, ust: bos, ac: () => assert.fail('enter yok') }), 'yok');
  assert.equal(metinGonder('', true, { doc, ust: bos, ac: () => assert.fail('boş yazı aranmaz') }), 'yok');
});

test('youtubeKimligi ve oynatmaOgesi: YouTube bağlantı türleri; diğerleri doğrudan yayın öğesi olur', () => {
  const ID = 'dQw4w9WgXcQ';
  for (const u of [`https://www.youtube.com/watch?v=${ID}`, `https://youtu.be/${ID}?t=5`, `https://m.youtube.com/watch?feature=share&v=${ID}&t=1`, `https://www.youtube.com/shorts/${ID}`, `https://www.youtube.com/embed/${ID}`, `https://music.youtube.com/watch?v=${ID}`, `https://www.youtube.com/live/${ID}`]) {
    assert.equal(youtubeKimligi(u), ID, u);
  }
  for (const u of ['https://www.youtube.com/', 'https://www.youtube.com/@kanal', 'https://youtu.be/kisa', 'https://ornek.com/watch?v=' + ID, 'https://evilyoutube.com/watch?v=' + ID, 'https://ornek.com/a.m3u8', '']) {
    assert.equal(youtubeKimligi(u), '', u);
  }
  assert.deepEqual(oynatmaOgesi('https://cdn.ornek.com:8080/a/b.m3u8?t=1', '', () => 7), { kind: 'local', id: 'tel:7', name: 'Telefondan · cdn.ornek.com:8080', url: 'https://cdn.ornek.com:8080/a/b.m3u8?t=1' });
  assert.equal(oynatmaOgesi('https://x.com/a.mp4', ' Maç ').name, 'Maç');

  const acilan = [];
  const yt = [];
  const bildirimler = [];
  oynatIsle('https://ornek.com/a.m3u8', 'Maç', { ac: (ad, arg) => acilan.push([ad, arg.list[0].url, arg.index]), youtube: (id) => yt.push(id), bildir: (t) => bildirimler.push(t) });
  oynatIsle(`https://youtu.be/${ID}`, '', { ac: () => assert.fail('YouTube oynatıcıda açılmaz'), youtube: (id, ad) => yt.push([id, ad]), bildir: (t) => bildirimler.push(t) });
  assert.deepEqual(acilan, [['player', 'https://ornek.com/a.m3u8', 0]]);
  assert.deepEqual(yt, [[ID, '']]);
  assert.equal(bildirimler.length, 2);
});

test('komutIsle: komut türlerine yönlendirir; yazı alanı yoksa bildirir; bilinmeyen komut yok sayılır', () => {
  const { doc, olaylar } = sahteBelge();
  const bildirimler = [];
  assert.equal(komutIsle({ t: 'tus', tus: 'down', ms: 0 }, { doc }), true);
  assert.equal(olaylar.length, 2);
  assert.equal(komutIsle({ t: 'metin', metin: 'abc', enter: false }, { doc, ust: { el: { querySelector: () => null } }, bildir: (t) => bildirimler.push(t) }), 'yok');
  assert.match(bildirimler[0], /yazı yazılacak bir alan/);
  assert.equal(komutIsle({ t: 'bilinmeyen' }, {}), false);
  assert.equal(komutIsle(null, {}), false);
});

test('telefonYoklayici: sunucuyu kodla başlatır, komutları uygular, hatada aynı kodla yeniden başlatır; durdurunca yoklama biter', async () => {
  globalThis.window.PalmServiceBridge = function () {}; // TV'de olduğumuzu varsay (varlik)
  const cagrilar = [];
  const uygulanan = [];
  let yoklama = 0;
  const cagri = async (uri, par) => {
    cagrilar.push([uri.replace(/^.*\//, ''), par]);
    if (/kumandaBaslat$/.test(uri)) return { returnValue: true, port: 8800, pin: par.pin || '0000', adresler: ['192.168.1.20'] };
    if (/kumandaSor$/.test(uri)) {
      yoklama++;
      if (yoklama === 1) return { returnValue: true, komutlar: [{ t: 'tus', tus: 'up', ms: 0 }, { t: 'tus', tus: 'ok', ms: 0 }], telefon: true };
      if (yoklama === 2) throw new Error('Servis yanıt vermedi');
      await new Promise((c) => setTimeout(c, 5));
      return { returnValue: true, komutlar: [], telefon: true };
    }
    return { returnValue: true };
  };
  const y = telefonYoklayici({ cagri, pin: () => '4321', uygula: (k) => uygulanan.push(k.tus), bekle: () => Promise.resolve() });
  const duyuru = [];
  y.abone(() => duyuru.push([y.telefon(), y.hata()]));
  const b = await y.baslat({ sifirla: true });
  assert.deepEqual(b, { ip: '192.168.1.20', port: 8800, pin: '4321', adres: 'http://192.168.1.20:8800/k?k=4321' });
  assert.deepEqual(cagrilar[0], ['kumandaBaslat', { pin: '4321', sifirla: true }]);
  await new Promise((c) => setTimeout(c, 60));
  assert.deepEqual(uygulanan, ['up', 'ok']);
  assert.equal(y.telefon(), true);
  assert.ok(duyuru.some((d) => d[1] === 'Servis yanıt vermedi'), 'hata duyurulur');
  assert.ok(cagrilar.filter((c) => c[0] === 'kumandaBaslat').length >= 2, 'hatadan sonra aynı kodla yeniden başlatılır');
  assert.deepEqual(cagrilar.filter((c) => c[0] === 'kumandaBaslat')[1][1], { pin: '4321' });
  assert.equal(y.hata(), '', 'sonra yoklama düzelince hata temizlenir');
  y.durdur();
  const n = cagrilar.length;
  await new Promise((c) => setTimeout(c, 40));
  assert.ok(cagrilar.length <= n + 1, 'durdurunca yeni yoklama başlamaz');
  assert.equal(cagrilar[cagrilar.length - 1][0] === 'kumandaDurdur' || cagrilar.some((c) => c[0] === 'kumandaDurdur'), true);
  assert.equal(y.bilgi(), null);
  delete globalThis.window.PalmServiceBridge;
  await assert.rejects(telefonYoklayici({ cagri }).baslat(), /yalnızca TV/);
});

test('kodAl: 4 haneli kod bir kez üretilir ve saklanır; bozuk kayıt yenilenir', () => {
  const d = {};
  const store = { setting: (k, v) => (k in d ? d[k] : v), setSetting: (k, v) => (d[k] = v) };
  assert.equal(kodAl(store, () => 0.0042), '0042');
  assert.equal(kodAl(store, () => 0.9), '0042', 'ikinci çağrı aynı kodu verir');
  d.telefonKod = 'abc';
  assert.match(kodAl(store, () => 0.5), /^5000$/);
});

// ---- Telefondan liste bilgisi (Kaynak ekle formu) ----
test('kumanda: /kaynak formu temizlenip sıraya girer; ekle için adres zorunlu; yanlış kodda ve ölçüsüz gövdede reddedilir; sayfa formu içerir', async (t) => {
  t.after(() => svc.kumandaDurdur());
  const a = await baslat({ pin: '1234' });
  const gonder = (g, pin = '1234') => istek(a.port, '/kaynak', { method: 'POST', govde: { pin, ...g } });
  assert.equal((await gonder({ tip: 'xtream', server: 'http://s:8080', user: 'ali', pass: 'g\u0000izli\n', ad: 'Evim', ekle: true })).kod, 200);
  assert.equal((await gonder({ tip: 'm3u', url: 'http://h/l.m3u', ekle: false })).kod, 200);
  assert.equal((await gonder({ tip: 'xtream', server: '', ekle: false })).kod, 200, 'yalnız yazmak için boş alan sorun değil');
  assert.equal((await gonder({ tip: 'xtream', server: '', ekle: true })).kod, 400, 'ekle: sunucu adresi gerekli');
  assert.equal((await gonder({ tip: 'm3u', url: '', ekle: true })).kod, 400, 'ekle: liste bağlantısı gerekli');
  assert.equal((await gonder({ tip: 'xtream', server: 'http://s' }, '9999')).kod, 403, 'yanlış kod');
  assert.equal((await istek(a.port, '/kaynak', { method: 'POST', govde: 'bozuk{' })).kod, 400);
  assert.equal((await gonder({ tip: 'xtream', server: 'x'.repeat(9000) })).kod, 413, 'çok büyük gövde');
  const r = await sor({ bekleMs: 0 });
  assert.deepEqual(r.komutlar[0], { t: 'kaynak', tip: 'xtream', ad: 'Evim', server: 'http://s:8080', user: 'ali', pass: 'gizli', url: '', ekle: true });
  assert.deepEqual(r.komutlar[1], { t: 'kaynak', tip: 'm3u', ad: '', server: '', user: '', pass: '', url: 'http://h/l.m3u', ekle: false });
  assert.equal(r.komutlar[2].tip, 'xtream');
  assert.equal(r.komutlar.length, 3, 'reddedilenler kuyruğa girmez');
  // Telefon sayfası: form alanları, ?s=liste ile açık gelme ve geçerli betik
  const sayfa = await istek(a.port, '/k?k=1234&s=liste');
  assert.equal(sayfa.kod, 200);
  for (const id of ['id="ld"', 'id="ls"', 'id="lu"', 'id="lp"', 'id="lb"', 'id="la"', 'id="ly"', 'id="le"']) assert.ok(sayfa.metin.includes(id), id);
  assert.match(sayfa.metin, /\/kaynak/);
  assert.ok(!sayfa.metin.includes('1234'), 'sayfa kodu içermez');
  const betik = sonBetik(sayfa.metin);
  new vm.Script(betik); // sözdizimi geçerli
});

test('komutIsle: kaynak komutu kancaya iletilir; kanca yoksa yok sayılır', () => {
  const alinan = [];
  const k = { t: 'kaynak', tip: 'm3u', url: 'http://h/l.m3u', ekle: false };
  assert.equal(komutIsle(k, { kaynak: (x) => (alinan.push(x), 'yazildi') }), 'yazildi');
  assert.deepEqual(alinan, [k]);
  assert.equal(komutIsle(k, {}), false);
});

test('kaynakFormuDoldur: Kaynak ekle ekranı açıksa doldurur; değilse önce açar; oynatıcıdayken açmaz', () => {
  const doldurulan = [];
  const ekran = (ad) => ({ name: ad, kaynakDoldur: (k) => doldurulan.push([ad, k.tip]) });
  const k = { t: 'kaynak', tip: 'xtream', server: 'http://s' };
  // Ekran zaten açık
  let ust = ekran('addsource');
  assert.equal(kaynakFormuDoldur(k, { ust: () => ust, ac: () => assert.fail('açık ekran yeniden açılmaz') }), 'yazildi');
  // Başka ekranda: addsource açılır, sonra doldurulur
  ust = ekran('home');
  const acilan = [];
  assert.equal(kaynakFormuDoldur(k, { ust: () => ust, ac: (ad, arg) => { acilan.push([ad, arg]); ust = ekran(ad); } }), 'yazildi');
  assert.deepEqual(acilan, [['addsource', undefined]]);
  assert.deepEqual(doldurulan, [['addsource', 'xtream'], ['addsource', 'xtream']]);
  // Oynatıcı: açılmaz, bildirilir
  ust = ekran('player');
  const bil = [];
  assert.equal(kaynakFormuDoldur(k, { ust: () => ust, ac: () => assert.fail('oynatıcıda açılmaz'), bildir: (t) => bil.push(t) }), 'yok');
  assert.match(bil[0], /oynatıcıdan çıkın/);
  // Açılan ekran doldurmayı bilmiyorsa
  assert.equal(kaynakFormuDoldur(k, { ust: () => ({ name: 'x' }), ac: () => {} }), 'yok');
});

test('kablolama: Kaynak ekle ekranı telefon panelini açar ve telefondan gelen formu alır; film/dizi/kanal ekranlarında Ara düğmesi var', () => {
  const kok = join(dirname(fileURLToPath(import.meta.url)), '..', 'webos');
  const oku = (...y) => readFileSync(join(kok, ...y), 'utf8');
  const ekle = oku('src', 'screens', 'addsource.js');
  assert.match(ekle, /id="tel-pn"/, 'panel ekranda');
  assert.match(ekle, /qrSvg\(b\.adres \+ '&s=liste'/, 'QR telefon sayfasını liste formu açık getirir');
  assert.match(ekle, /telefon\.abone\(panelCiz\)/, 'panel telefon bağlanınca güncellenir');
  assert.match(ekle, /if \(varlik\(\) && !kapaliAd\(\)\) telefonAc\(\)/, 'ilk kurulumda (karar verilmediyse) kumanda açılır; kullanıcı kapattıysa açılmaz');
  assert.match(ekle, /kaynakDoldur\(k\)/);
  assert.match(ekle, /destroy\(\) \{\s*if \(birak\) birak\(\)/, 'ekran kapanınca abonelik bırakılır');
  assert.ok(!/K\.(bilgi|hata)\([^)]*pass/.test(ekle), 'şifre günlüğe yazılmaz');
  const tel = oku('src', 'telefon.js');
  assert.match(tel, /kaynak: kaynakFormuDoldur/);
  assert.match(oku('src', 'app.js'), /setTimeout\(telefonuBaslat/);
  assert.match(oku('css', 'tv.css'), /\.tel-pn \{/);
  assert.match(oku('css', 'tv.css'), /\.top-ara\.on \{/);
  // Ara düğmesi: üst çubuk çizimi, gözatma ekranı (Son izlenenler hariç) ve kapsamlı arama
  const ctxSrc = oku('src', 'ctx.js');
  assert.match(ctxSrc, /export function ustCubuk\(baslik, alt, kok, ara, kumanda\)/);
  assert.match(ctxSrc, /data-ara="1"/);
  const br = oku('src', 'screens', 'browse.js');
  assert.match(br, /ustCubuk\(BASLIK\[kind\], src \? esc\(src\.name\) : '', false, kind !== 'recents'\)/);
  assert.match(br, /araAc\(\) \{\s*open\('search', gercekTur \? \{ tur: gercekTur \} : undefined\)/);
  assert.match(br, /this\.araAc\(\)/, 'Mavi tuş da aynı kapsamla arar');
  const ara = oku('src', 'screens', 'search.js');
  assert.match(ara, /gecerliKapsam\(p && p\.tur\)/, 'bölümden açılınca o sekme seçili gelir');
  assert.match(ara, /kapsamTurleri = \(\) => \(kapsam \? \[kapsam\] : TURLER\)/, 'arama ekranı kapsamı veri katmanına geçirir');
  assert.match(ara, /turler = kapsamTurleri\(\)\.filter/, 'yalnız kapsamdaki türler aranır');
  assert.match(ara, /araTur\(\s*pr,\s*q,\s*k,\s*TUR_LIMIT/, 'her tür kendi kapsamında taranır');
});

// ---- Fare alanı, hızlı geçiş, ses, sanal imleç, ana sayfa düğmesi ----
const { imlecKur } = await import('../webos/src/imlec.js');
const { fareIsle, ekranAc } = await import('../webos/src/telefon.js');

test('kumanda: /fare hareketleri toplar ve sınırlar; tık ve kaydırma ayrı komut olur; /ekran yalnız bilinen bölümleri kabul eder', async (t) => {
  t.after(() => svc.kumandaDurdur());
  const a = await baslat({ pin: '1234' });
  const gonder = (yol, g) => istek(a.port, yol, { method: 'POST', govde: { pin: '1234', ...g } });
  await sor({ bekleMs: 0 });
  assert.equal((await gonder('/fare', { dx: 10, dy: -4 })).kod, 200);
  assert.equal((await gonder('/fare', { dx: 5, dy: 1.6 })).kod, 200);
  assert.equal((await gonder('/fare', { dx: 99999, dy: -99999 })).kod, 200);
  assert.equal((await gonder('/fare', { dx: 0, dy: 0 })).kod, 200, 'sıfır hareket kuyruğu şişirmez');
  assert.equal((await gonder('/fare', { dx: 'x', dy: NaN })).kod, 200);
  assert.equal((await gonder('/fare', { tik: true })).kod, 200);
  assert.equal((await gonder('/fare', { kaydir: 5000 })).kod, 200);
  assert.equal((await gonder('/fare', { kaydir: -40 })).kod, 200);
  let r = await sor({ bekleMs: 0 });
  assert.deepEqual(r.komutlar[0], { t: 'fare', dx: 615, dy: -602 }, 'art arda hareket tek komutta toplanır (10+5+600, -4+2-600), tek istek 600 px ile sınırlı');
  assert.deepEqual(r.komutlar.slice(1), [{ t: 'fare', tik: true }, { t: 'fare', kaydir: 600 }, { t: 'fare', kaydir: -40 }]);
  // Toplam sınırı: sırada çok hareket birikse de imleç komutu ±2400'ü aşmaz
  for (let i = 0; i < 8; i++) await gonder('/fare', { dx: 600, dy: 0 });
  r = await sor({ bekleMs: 0 });
  assert.equal(r.komutlar.length, 1);
  assert.equal(r.komutlar[0].dx, 2400);
  // /ekran
  for (const ad of ['home', 'live', 'movie', 'series', 'guide', 'spor', 'favs', 'recents', 'search', 'settings']) {
    assert.equal((await gonder('/ekran', { ad })).kod, 200, ad);
  }
  for (const kotu of ['', 'constructor', '__proto__', 'player', 'addsource', undefined]) {
    assert.equal((await gonder('/ekran', { ad: kotu })).kod, 400, String(kotu));
  }
  r = await sor({ bekleMs: 0 });
  assert.equal(r.komutlar.length, 10);
  assert.deepEqual(r.komutlar[0], { t: 'ekran', ad: 'home' });
  // Kodsuz istek kuyruğa girmez
  assert.equal((await istek(a.port, '/fare', { method: 'POST', govde: { dx: 1, dy: 1 } })).kod === 200, false);
  assert.deepEqual((await sor({ bekleMs: 0 })).komutlar, []);
});

test('kumanda: /ses TV ses servisini çağırır; ilk adres yoksa ikincisi denenir; sessiz durumu tersine çevirir; hata 502 olur', async (t) => {
  t.after(() => { svc._lunaCagri(null); svc.kumandaDurdur(); });
  const a = await baslat({ pin: '1234' });
  const gonder = (g) => istek(a.port, '/ses', { method: 'POST', govde: { pin: '1234', ...g } });
  const cagrilar = [];
  let sessizMi = false;
  svc._lunaCagri((uri, par, cb) => {
    cagrilar.push([uri, par]);
    if (/com\.webos\.service\.audio/.test(uri)) return cb({ returnValue: false, errorText: 'yok' }); // 1. adres bu TV'de yok
    if (/getVolume/.test(uri)) return cb({ returnValue: true, muted: sessizMi });
    if (/setMuted/.test(uri)) sessizMi = par.muted;
    cb({ returnValue: true });
  });
  assert.equal((await gonder({ islem: 'artir' })).kod, 200);
  assert.deepEqual(cagrilar.map((c) => c[0]), ['luna://com.webos.service.audio/master/volumeUp', 'luna://com.webos.audio/volumeUp'], 'ilk adres olmayınca ikinciye geçilir');
  cagrilar.length = 0;
  assert.equal((await gonder({ islem: 'azalt' })).kod, 200);
  assert.match(cagrilar[1][0], /volumeDown$/);
  cagrilar.length = 0;
  assert.equal((await gonder({ islem: 'sessiz' })).kod, 200);
  assert.equal(sessizMi, true, 'sessiz değildi → sessize alındı');
  assert.equal((await gonder({ islem: 'sessiz' })).kod, 200);
  assert.equal(sessizMi, false, 'sessizdi → açıldı');
  for (const kotu of ['', 'yukselt', 'constructor', undefined]) assert.equal((await gonder({ islem: kotu })).kod, 400, String(kotu));
  svc._lunaCagri((uri, par, cb) => cb(null));
  const h = await gonder({ islem: 'artir' });
  assert.equal(h.kod, 502);
  assert.equal(h.json.ok, false);
  assert.match(h.json.mesaj, /TV sesi/);
  svc._lunaCagri(null);
  assert.equal((await gonder({ islem: 'artir' })).kod, 502, 'köprü yoksa da çökmez');
});

test('kumanda sayfası: tek ekrana sığan sekmeler, fare alanı, hızlı geçiş ve ses düğmeleri var; tüm tuşlar ve ekran adları sayfada', () => {
  const s = svc._kumandaSayfa;
  for (const sekme of ['p-k', 'p-f', 'p-y', 'p-d']) {
    assert.ok(s.includes('id="' + sekme + '"') && s.includes('data-s="' + sekme + '"'), sekme);
  }
  for (const tus of Object.keys(TUS_KODLARI)) assert.ok(s.includes('data-t="' + tus + '"'), tus);
  for (const ad of ['home', 'live', 'movie', 'series', 'guide', 'spor', 'favs', 'recents', 'search', 'settings']) assert.ok(s.includes('data-e="' + ad + '"'), ad);
  for (const v of ['azalt', 'sessiz', 'artir']) assert.ok(s.includes('data-v="' + v + '"'), v);
  assert.match(s, /id="tp"/, 'fare alanı');
  assert.match(s, /'\/fare'/);
  assert.match(s, /'\/ekran'/);
  assert.match(s, /'\/ses'/);
  assert.match(s, /overflow:hidden/, 'ana düzen kaydırma gerektirmez');
  assert.ok(!/user-scalable=yes/.test(s));
  // Betik her sekmeden bağımsız çalışır: söz dizimi geçerli
  const betik = sonBetik(s);
  assert.doesNotThrow(() => new vm.Script(betik));
});

// Sahte belge: imleç dugumu, elementFromPoint ve MouseEvents
function imlecDunyasi({ gen = 1920, yuk = 1080 } = {}) {
  const olaylar = [];
  const hedef = { tagName: 'DIV', dispatchEvent: (e) => olaylar.push(e.type + ':' + e.clientX + ',' + e.clientY) };
  const girdi = { tagName: 'INPUT', odak: 0, focus() { this.odak++; }, dispatchEvent: (e) => olaylar.push('girdi-' + e.type) };
  let altinda = hedef;
  const dugumler = [];
  const doc = {
    body: { appendChild: (d) => dugumler.push(d) },
    createElement: () => ({ style: {}, className: '', innerHTML: '' }),
    createEvent: () => ({ initMouseEvent(tur, a, b, w, d, sx, sy, cx, cy) { this.type = tur; this.clientX = cx; this.clientY = cy; } }),
    elementFromPoint: () => altinda,
  };
  const zamanlar = [];
  return {
    doc, olaylar, hedef, girdi, dugumler, zamanlar,
    altinda: (n) => { altinda = n; },
    kur: (tus = () => {}) => imlecKur({ doc, win: { innerWidth: gen, innerHeight: yuk }, bekle: (f, ms) => (zamanlar.push([f, ms]), zamanlar.length), iptal: () => {}, tus }),
  };
}

test('imlecKur: ortada başlar, ekran sınırında kalır, hareket mousemove üretir, tıklama altındaki öğeye gider; yazı alanına odak verir; kendiliğinden gizlenir', () => {
  const d = imlecDunyasi();
  const im = d.kur();
  assert.deepEqual(im.hareket(100, -50), { x: 960 + 100, y: 540 - 50 });
  assert.equal(d.dugumler.length, 1);
  assert.equal(d.dugumler[0].className, 'sanal-imlec');
  assert.equal(d.dugumler[0].style.display, 'block');
  assert.deepEqual(d.olaylar, ['mousemove:1060,490']);
  assert.deepEqual(im.hareket(-99999, 99999), { x: 0, y: 1079 }, 'ekran dışına çıkmaz');
  assert.deepEqual(im.hareket('a', undefined), { x: 0, y: 1079 }, 'sayı olmayan hareket sıfır sayılır');
  d.olaylar.length = 0;
  assert.equal(im.tikla(), true);
  assert.deepEqual(d.olaylar, ['mousedown:0,1079', 'mouseup:0,1079', 'click:0,1079']);
  d.altinda(d.girdi);
  d.olaylar.length = 0;
  assert.equal(im.tikla(), true);
  assert.equal(d.girdi.odak, 1, 'yazı alanına tıklayınca TV klavyesi için odak verilir');
  d.altinda(null);
  assert.equal(im.tikla(), false, 'altında öğe yoksa tıklanmaz');
  // Gizleme: son hareketten 5 sn sonra
  const son = d.zamanlar[d.zamanlar.length - 1];
  assert.equal(son[1], 5000);
  son[0]();
  assert.equal(d.dugumler[0].style.display, 'none');
  im.hareket(1, 1);
  assert.equal(d.dugumler[0].style.display, 'block', 'yeniden hareket edince görünür');
  assert.equal(d.dugumler.length, 1, 'düğüm bir kez oluşturulur');
});

test('imlecKur.kaydir: 30 birim bir ▲/▼ tuşu; küçük kaydırmalar birikir; tek komutta en çok 8 tuş; parmak aşağı = liste yukarı', () => {
  const d = imlecDunyasi();
  const tuslar = [];
  const im = d.kur((a) => tuslar.push(a));
  assert.equal(im.kaydir(20), 0);
  assert.equal(im.kaydir(20), 1, 'birikim 40 → bir adım, 10 artar');
  assert.deepEqual(tuslar, ['up']);
  assert.equal(im.kaydir(-100), 3, '10-100 = -90 → 3 adım aşağı');
  assert.deepEqual(tuslar, ['up', 'down', 'down', 'down']);
  tuslar.length = 0;
  assert.equal(im.kaydir(5000), 8, 'tek komutta 8 tuş');
  assert.equal(tuslar.length, 8);
  assert.equal(im.kaydir(NaN), 0);
});

test('fareIsle ve komutIsle: hareket imleci oynatır, tik tıklar, kaydir tuş basar; kanca yoksa fare/ekran yok sayılır', () => {
  const cagri = [];
  const sahte = { hareket: (x, y) => cagri.push(['h', x, y]), tikla: () => (cagri.push(['t']), true), kaydir: (n) => (cagri.push(['k', n]), n > 0 ? 2 : 0) };
  assert.equal(fareIsle({ t: 'fare', dx: 5, dy: -3 }, sahte), true);
  assert.equal(fareIsle({ t: 'fare', tik: true }, sahte), true);
  assert.equal(fareIsle({ t: 'fare', kaydir: 60 }, sahte), true);
  assert.equal(fareIsle({ t: 'fare', kaydir: 0 }, sahte), false);
  assert.equal(fareIsle(null, sahte), false);
  assert.deepEqual(cagri, [['h', 5, -3], ['t'], ['k', 60], ['k', 0]]);
  const alinan = [];
  assert.equal(komutIsle({ t: 'fare', dx: 1, dy: 2 }, { fare: (k) => (alinan.push(k), true) }), true);
  assert.equal(komutIsle({ t: 'ekran', ad: 'live' }, { ekran: (ad) => (alinan.push(ad), true) }), true);
  assert.deepEqual(alinan, [{ t: 'fare', dx: 1, dy: 2 }, 'live']);
  assert.equal(komutIsle({ t: 'fare', dx: 1, dy: 2 }, {}), false);
  assert.equal(komutIsle({ t: 'ekran', ad: 'live' }, {}), false);
});

test('ekranAc: açık ekranları kapatıp ana sayfaya döner, sonra istenen bölümü açar; home yalnız döner; bilinmeyen ad reddedilir', () => {
  const yigin = [{ name: 'home' }, { name: 'browse' }, { name: 'player' }];
  const acilan = [];
  const ek = {
    ust: () => yigin[yigin.length - 1],
    geri: () => yigin.pop(),
    ac: (ad, arg) => { acilan.push([ad, arg]); yigin.push({ name: ad }); },
    derinlik: () => yigin.length,
  };
  assert.equal(ekranAc('movie', ek), true);
  assert.deepEqual(yigin.map((e) => e.name), ['home', 'browse'], 'oynatıcı ve eski liste kapandı, yeni liste açıldı');
  assert.deepEqual(acilan, [['browse', { kind: 'movie' }]]);
  acilan.length = 0;
  assert.equal(ekranAc('home', ek), true);
  assert.deepEqual(yigin.map((e) => e.name), ['home']);
  assert.deepEqual(acilan, []);
  assert.equal(ekranAc('settings', ek), true);
  assert.deepEqual(acilan, [['settings', undefined]]);
  assert.equal(ekranAc('player', ek), false);
  assert.equal(ekranAc('constructor', ek), false);
  // Sınırsız döngüye girmez: ust hep başka ekran döndürse de en çok 30 geri
  let geri = 0;
  assert.equal(ekranAc('search', { ust: () => ({ name: 'x' }), geri: () => geri++, ac: () => {}, derinlik: () => 5 }), true);
  assert.equal(geri, 30);
});

test('kablolama: ana sayfada kumanda düğmesi (üst çubuk, odak, tıklama) ve fare/ekran komutları uygulamaya bağlı', () => {
  const kok = join(dirname(fileURLToPath(import.meta.url)), '..', 'webos');
  const oku = (...y) => readFileSync(join(kok, ...y), 'utf8');
  const ana = oku('src', 'screens', 'home.js');
  assert.match(ana, /ustCubuk\('Iptv Player Pro', src \? esc\(src\.name\) : '', true, false, true\)/, 'yalnız ana sayfada kumanda düğmesi');
  assert.match(ana, /open\('telefonkumanda'\)/);
  assert.match(ana, /let ustte = false/);
  assert.match(ana, /a === 'up' && r === 0/, 'kart satırından ▲ ile düğmeye çıkılır');
  assert.match(ana, /!ustte && r === 0/, 'düğmedeyken kartlar işaretli kalmaz');
  const c = oku('src', 'ctx.js');
  assert.match(c, /data-kum="1"/);
  assert.match(c, /telefon: '<svg/);
  const tel = oku('src', 'telefon.js');
  assert.match(tel, /fare: \(k\) => fareIsle\(k, imlecAl\(\)\)/);
  assert.match(tel, /ekran: \(ad\) =>/);
  assert.match(tel, /imlecKur\(\{ tus: \(a\) => tusGonder\(a\) \}\)/);
  const css = oku('css', 'tv.css');
  assert.match(css, /\.top-kum \{/);
  assert.match(css, /\.top-kum\.on \{/);
  assert.match(css, /\.sanal-imlec \{[^}]*pointer-events: none/, 'imleç tıklamayı yakalamaz');
  // ES5: imleç modülü Chromium 38'de olmayan işlevleri kullanmaz
  const im = oku('src', 'imlec.js');
  assert.ok(!/new MouseEvent|\.includes\(|\.findIndex\(|Array\.from\(/.test(im));
  assert.match(im, /createEvent\('MouseEvents'\)/);
});

// ---- Güncellemeden sonra eski servis süreci ----
test('servis: kumandaBaslat yapı kimliğini bildirir; servisYenile yanıtı verir, kısa süre sonra süreci kapatır', async (t) => {
  t.after(() => {
    svc._cikis(() => {});
    svc.kumandaDurdur();
  });
  const a = await baslat({ pin: '1234' });
  assert.equal(a.yapi, svc._yapi());
  assert.equal(typeof a.yapi, 'string');
  let cikti = 0;
  svc._cikis(() => cikti++);
  const r = svc.servisYenile();
  assert.equal(r.returnValue, true);
  assert.equal(r.yapi, svc._yapi());
  assert.equal(cikti, 0, 'önce yanıt gider, süreç hemen kapanmaz');
  await bekle(550);
  assert.equal(cikti, 1, 'yanıttan sonra süreç kapanır (webOS sonraki çağrıda güncel kodla açar)');
});

test('telefonYoklayici: servis eski yapıdaysa bir kez servisYenile istenir ve yeniden başlatılır; uyuşuyorsa dokunulmaz; yenileme başarısızsa döngüye girmez', async () => {
  globalThis.window.PalmServiceBridge = function () {};
  const kur = (servisYapi, { yenileHata = false } = {}) => {
    const cagrilar = [];
    let yapi = servisYapi;
    const cagri = async (uri, par) => {
      const ad = uri.replace(/^.*\//, '');
      cagrilar.push(ad);
      if (ad === 'kumandaBaslat') return { returnValue: true, port: 8800, pin: par.pin || '0000', adresler: ['192.168.1.20'], yapi };
      if (ad === 'servisYenile') {
        if (yenileHata) throw new Error('Bilinmeyen komut');
        yapi = 'YENI'; // süreç kapandı, yenisi güncel kodla açıldı
        return { returnValue: true };
      }
      if (ad === 'kumandaSor') {
        await new Promise((c) => setTimeout(c, 20));
        return { returnValue: true, komutlar: [], telefon: false };
      }
      return { returnValue: true };
    };
    return { cagrilar, y: telefonYoklayici({ cagri, pin: () => '4321', uygula: () => {}, bekle: () => Promise.resolve(), yapi: 'YENI' }) };
  };
  // eski süreç: servisYenile → yeniden başlatma
  let k = kur('ESKI');
  let b = await k.y.baslat();
  assert.deepEqual(k.cagrilar.slice(0, 3), ['kumandaBaslat', 'servisYenile', 'kumandaBaslat']);
  assert.equal(b.port, 8800);
  k.y.durdur();
  // ikinci başlatma aynı oturumda yeniden yenileme istemez
  k.cagrilar.length = 0;
  await k.y.baslat();
  assert.equal(k.cagrilar.filter((a) => a === 'servisYenile').length, 0);
  k.y.durdur();
  // güncel servis: dokunulmaz
  k = kur('YENI');
  await k.y.baslat();
  assert.equal(k.cagrilar.filter((a) => a === 'servisYenile').length, 0);
  k.y.durdur();
  // servisYenile'yi bilmeyen eski servis: hata yutulur, kumanda yine de başlar, tekrar denenmez
  k = kur('ESKI', { yenileHata: true });
  b = await k.y.baslat();
  assert.equal(b.port, 8800);
  assert.equal(k.cagrilar.filter((a) => a === 'servisYenile').length, 1);
  k.y.durdur();
  k.cagrilar.length = 0;
  await k.y.baslat();
  assert.equal(k.cagrilar.filter((a) => a === 'servisYenile').length, 0, 'döngüye girmez');
  k.y.durdur();
  // yapı kimliği yoksa (geliştirme/test derlemesi) denetim kapalı
  const k2 = [];
  const y2 = telefonYoklayici({ cagri: async (uri, par) => (k2.push(uri.replace(/^.*\//, '')), /kumandaBaslat$/.test(uri) ? { returnValue: true, port: 1, pin: '1111', adresler: [], yapi: 'X' } : { returnValue: true, komutlar: [] }), pin: () => '1111', uygula: () => {}, bekle: () => Promise.resolve(), yapi: '' });
  await y2.baslat();
  assert.ok(!k2.includes('servisYenile'));
  y2.durdur();
  delete globalThis.window.PalmServiceBridge;
});

test('derleme: servis yapı kimliği uygulamayla aynı kimlikle yazılır; yer tutucu servis kaynağında durur', () => {
  const kok = join(dirname(fileURLToPath(import.meta.url)), '..', 'webos');
  const oku = (...y) => readFileSync(join(kok, ...y), 'utf8');
  assert.match(oku('service', 'service.js'), /var YAPI = '__YAPI__';/);
  const b = oku('scripts', 'build.mjs');
  assert.match(b, /__BUILD__: JSON\.stringify\(yapi\)/, 'uygulama aynı kimliği alır');
  assert.match(b, /replace\("var YAPI = '__YAPI__';", 'var YAPI = ' \+ JSON\.stringify\(yapi\) \+ ';'\)/, 'servis aynı kimliği alır');
  assert.match(oku('src', 'version.js'), /export const YAPI = /);
  assert.match(oku('service', 'services.json'), /"name": "servisYenile"/);
});
