// LG webOS: resim yedeği. Servis resmi getirip data: adresi verir (resim değilse/çok büyükse/hata ise reddeder);
// istemci yüklenemeyen <img>'i servisle yeniden dener, olmazsa gizler.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const svc = require('../webos/service/service.js');

globalThis.window = globalThis.window || {};
const resim = await import('../webos/src/resim.js');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 7)]);
let istekler = [];
const sunucu = http.createServer((req, res) => {
  istekler.push({ url: req.url, referer: req.headers.referer, kabul: req.headers.accept });
  if (req.url === '/logo.png') {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); // sunucu türü yanlış bildirse de içerikten tanınır
    return res.end(PNG);
  }
  if (req.url === '/yon') {
    res.writeHead(302, { Location: '/logo.png' });
    return res.end();
  }
  if (req.url === '/yok') {
    res.writeHead(404);
    return res.end('x');
  }
  if (req.url === '/sayfa') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<html>giriş yapın</html>');
  }
  if (req.url === '/buyuk') {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    return res.end(Buffer.concat([PNG, Buffer.alloc(200 * 1024, 1)]));
  }
  if (req.url === '/logo.svg') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    return res.end('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
  }
  res.writeHead(500);
  res.end();
});
await new Promise((c) => sunucu.listen(0, '127.0.0.1', c));
const port = sunucu.address().port;
const adres = (y) => 'http://127.0.0.1:' + port + y;
test.after(() => sunucu.close());

const getir = (url) => new Promise((coz, red) => svc.resimGetir({ url }, (e, r) => (e ? red(e) : coz(r))));

test('resim servisi: içerikten türü tanır, yönlendirmeyi izler, başvuran olarak kendi sitesini bildirir', async () => {
  const r = await getir(adres('/logo.png'));
  assert.equal(r.returnValue, true);
  assert.equal(r.mime, 'image/png', 'sunucu octet-stream dese de PNG imzasından');
  assert.equal(Buffer.from(r.data, 'base64').length, PNG.length);
  assert.equal(istekler[istekler.length - 1].referer, adres('/'));
  assert.match(istekler[istekler.length - 1].kabul, /^image\//);
  assert.equal((await getir(adres('/yon'))).mime, 'image/png');
  assert.equal((await getir(adres('/logo.svg'))).mime, 'image/svg+xml');
});

test('resim servisi: 404, resim olmayan sayfa, aşırı büyük dosya ve geçersiz adres reddedilir', async () => {
  await assert.rejects(getir(adres('/yok')), /HTTP 404/);
  await assert.rejects(getir(adres('/sayfa')), /Resim değil/);
  await assert.rejects(getir(adres('/buyuk')), /çok büyük/);
  await assert.rejects(getir('file:///etc/passwd'), /Adres yok/);
  await assert.rejects(getir(''), /Adres yok/);
});

test('resim servisi: resimTuru tanınmayan baytlarda boş döner', () => {
  assert.equal(svc.resimTuru(Buffer.from('MZ binary')), '');
  assert.equal(svc.resimTuru(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(svc.resimTuru(Buffer.from('GIF89a..')), 'image/gif');
  assert.equal(svc.resimTuru(Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ', 'latin1')), 'image/webp');
  assert.equal(svc.resimTuru(Buffer.alloc(2)), '');
});

class Img {
  constructor(src) {
    this.tagName = 'IMG';
    this.a = { src };
    this.style = {};
  }
  getAttribute(k) {
    return k in this.a ? this.a[k] : null;
  }
  setAttribute(k, v) {
    this.a[k] = v;
  }
}
const mikro = () => new Promise((c) => setImmediate(c));

test('istemci: yüklenemeyen logo servisle yeniden denenir ve data: adresiyle yerine konur; aynı adres bir kez istenir', async () => {
  window.WebOSServiceBridge = function () {}; // servis köprüsü var
  const cagrilar = [];
  resim.ayar.cagir = async (u) => (cagrilar.push(u), { mime: 'image/png', data: 'QUJD' });
  const a = new Img('https://cdn.example/logo1.png');
  const b = new Img('https://cdn.example/logo1.png');
  resim.resimHatasi(a);
  resim.resimHatasi(b);
  await mikro();
  await mikro();
  assert.equal(a.getAttribute('src'), 'data:image/png;base64,QUJD');
  assert.equal(b.getAttribute('src'), 'data:image/png;base64,QUJD');
  assert.equal(cagrilar.length, 1, 'aynı adres için tek servis çağrısı');
  assert.notEqual(a.style.display, 'none');
  // data: adresi de yüklenemezse (bozuk resim) gizlenir, döngüye girilmez
  resim.resimHatasi(a);
  assert.equal(a.style.display, 'none');
  assert.equal(cagrilar.length, 1);
});

test('istemci: servis de getiremezse logo gizlenir ve adres bir daha denenmez; köprü yoksa hemen gizlenir', async () => {
  window.WebOSServiceBridge = function () {};
  let sayac = 0;
  resim.ayar.cagir = async () => {
    sayac++;
    throw new Error('HTTP 404');
  };
  const a = new Img('http://x.example/yok.png');
  resim.resimHatasi(a);
  await mikro();
  await mikro();
  await mikro();
  assert.equal(a.style.display, 'none');
  const b = new Img('http://x.example/yok.png');
  resim.resimHatasi(b);
  await mikro();
  await mikro();
  assert.equal(b.style.display, 'none');
  assert.equal(sayac, 1, 'başarısız adres yeniden denenmez');
  delete window.WebOSServiceBridge;
  const c = new Img('http://y.example/a.png');
  resim.resimHatasi(c);
  assert.equal(c.style.display, 'none', 'servis yoksa beklemeden gizlenir');
  const d = { tagName: 'DIV', style: {}, getAttribute: () => null };
  resim.resimHatasi(d); // img olmayan öğe etkilenmez
  assert.equal(d.style.display, undefined);
});

test('istemci: eşzamanlı istek sayısı 3 ile sınırlıdır', async () => {
  window.WebOSServiceBridge = function () {};
  let ayni = 0;
  let enCok = 0;
  const bekle = [];
  resim.ayar.cagir = (u) => {
    ayni++;
    enCok = Math.max(enCok, ayni);
    return new Promise((coz) => bekle.push(() => (ayni--, coz({ mime: 'image/png', data: 'QQ==' }))));
  };
  const hepsi = [1, 2, 3, 4, 5, 6].map((n) => resim.resimYukle('https://k.example/' + n + '.png'));
  await mikro();
  assert.equal(enCok, 3);
  while (bekle.length) {
    bekle.shift()();
    await mikro();
    await mikro();
  }
  await Promise.all(hepsi);
  assert.equal(enCok, 3);
});
