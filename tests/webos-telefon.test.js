// Telefon kumandası: TV servisindeki sunucu (sayfa, kod, komut kuyruğu, uzun yoklama, kapanma) ve uygulama tarafı
// (tuş olayı üretimi, yazı alanı, oynat bağlantısı, yoklayıcı).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  const betik = /<script>([\s\S]*)<\/script>/.exec(svc._kumandaSayfa)[1];
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
  const betik = /<script>([\s\S]*)<\/script>/.exec(sayfa.metin)[1];
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
  assert.match(ctxSrc, /export function ustCubuk\(baslik, alt, kok, ara\)/);
  assert.match(ctxSrc, /data-ara="1"/);
  const br = oku('src', 'screens', 'browse.js');
  assert.match(br, /ustCubuk\(BASLIK\[kind\], src \? esc\(src\.name\) : '', false, kind !== 'recents'\)/);
  assert.match(br, /araAc\(\) \{\s*open\('search', gercekTur \? \{ tur: gercekTur \} : undefined\)/);
  assert.match(br, /this\.araAc\(\)/, 'Mavi tuş da aynı kapsamla arar');
  const ara = oku('src', 'screens', 'search.js');
  assert.match(ara, /tur \? \[tur\] : null/, 'arama ekranı kapsamı veri katmanına geçirir');
});
