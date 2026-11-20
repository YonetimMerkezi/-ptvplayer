// LG webOS medya merkezi: TV servisindeki USB gezgini ve yerel medya sunucusu (yol güvenliği, listeleme, Range, jeton, kapanma).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const svc = require('../webos/service/service.js');

const kok = mkdtempSync(join(tmpdir(), 'iptv-usb-'));
const usb = join(kok, 'usb');
const dis = join(kok, 'disarisi');
mkdirSync(join(usb, 'sda', 'sda1', 'Filmler', 'Dizi'), { recursive: true });
mkdirSync(join(usb, 'sdb'), { recursive: true });
mkdirSync(dis, { recursive: true });
const bolum = join(usb, 'sda', 'sda1');
const ICERIK = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
writeFileSync(join(bolum, 'Filmler', 'Film 1.mkv'), ICERIK);
writeFileSync(join(bolum, 'Filmler', 'Film 1.srt'), '1\n00:00:01,000 --> 00:00:02,000\nMerhaba\n');
writeFileSync(join(bolum, 'Filmler', 'notlar.txt'), 'ilgisiz');
writeFileSync(join(bolum, 'Filmler', '.gizli.mp4'), 'x');
writeFileSync(join(bolum, 'Muzik.mp3'), Buffer.alloc(0));
writeFileSync(join(usb, 'sdb', 'Foto.JPG'), Buffer.from([1, 2, 3]));
writeFileSync(join(dis, 'gizli.mp4'), 'gizli');
try {
  symlinkSync(join(dis, 'gizli.mp4'), join(bolum, 'Filmler', 'kacak.mp4'));
} catch (e) {
  /* sembolik bağlantı kurulamayan ortam: ilgili denetim atlanır */
}
svc._medyaAyarla([usb], usb);

test.after(() => {
  svc.medyaDurdur();
  rmSync(kok, { recursive: true, force: true });
});

const baslat = () => new Promise((coz, red) => svc.medyaBaslat({}, (e, r) => (e ? red(e) : coz(r))));
function get(port, yol, basliklar = {}, method = 'GET') {
  return new Promise((coz, red) => {
    const r = http.request({ host: '127.0.0.1', port, path: yol, method, headers: basliklar }, (res) => {
      const p = [];
      res.on('data', (c) => p.push(c));
      res.on('end', () => coz({ kod: res.statusCode, baslik: res.headers, govde: Buffer.concat(p) }));
    });
    r.on('error', red);
    r.end();
  });
}

test('medya servisi: yol denetimi — yalnız izinli kök, ".." ve kök dışı reddedilir', () => {
  assert.equal(svc._medyaYol(bolum), bolum);
  assert.equal(svc._medyaYol(bolum + '/'), bolum);
  assert.equal(svc._medyaYol(bolum + '/Filmler/../Muzik.mp3'), join(bolum, 'Muzik.mp3'));
  assert.equal(svc._medyaYol(bolum + '/../../../disarisi'), null);
  assert.equal(svc._medyaYol(dis), null);
  assert.equal(svc._medyaYol(usb + 'x'), null, 'kök adıyla başlayan başka klasör');
  assert.equal(svc._medyaYol('/etc/passwd'), null);
  assert.equal(svc._medyaYol('göreli/yol'), null);
  assert.equal(svc._medyaYol(''), null);
  assert.equal(svc._medyaYol(bolum + '/a\u0000b'), null);
  assert.equal(svc._medyaYol(null), null);
});

test('medya servisi: takılı bellekler — bölümlü ve bölümsüz aygıtlar adlandırılır', () => {
  const r = svc.medyaKokler();
  assert.equal(r.returnValue, true);
  assert.deepEqual(r.kokler.map((k) => k.yol), [bolum, join(usb, 'sdb')]);
  assert.equal(r.kokler[0].ad, 'USB 1 (sda1)');
  assert.equal(r.kokler[1].ad, 'USB 2 (sdb)');
});

test('medya servisi: listeleme — klasörler ve medya dosyaları gelir, gizli/ilgisiz/sembolik olanlar gelmez', () => {
  const r = svc.medyaListele({ yol: join(bolum, 'Filmler') });
  assert.equal(r.returnValue, true);
  const adlar = r.ogeler.map((o) => o.ad).sort();
  assert.deepEqual(adlar, ['Dizi', 'Film 1.mkv', 'Film 1.srt']);
  const film = r.ogeler.find((o) => o.ad === 'Film 1.mkv');
  assert.equal(film.dir, false);
  assert.equal(film.boyut, ICERIK.length);
  assert.equal(r.ogeler.find((o) => o.ad === 'Dizi').dir, true);
  assert.equal(svc.medyaListele({ yol: dis }).returnValue, false, 'kök dışı');
  assert.match(svc.medyaListele({ yol: join(bolum, 'yok') }).errorText, /okunamadı/);
  assert.equal(svc.medyaListele({}).returnValue, false);
});

test('medya servisi: sunucu — tam dosya, Range, sondan Range, HEAD, boş dosya, geçersiz aralık', async () => {
  const b = await baslat();
  assert.ok(b.port > 0 && b.jeton.length >= 16);
  const ayni = await baslat();
  assert.equal(ayni.port, b.port, 'ikinci başlatma aynı sunucuyu verir');
  const url = (y) => '/' + b.jeton + '/' + encodeURIComponent(y);
  const film = join(bolum, 'Filmler', 'Film 1.mkv');
  const tam = await get(b.port, url(film));
  assert.equal(tam.kod, 200);
  assert.equal(tam.baslik['content-type'], 'video/x-matroska');
  assert.equal(tam.baslik['accept-ranges'], 'bytes');
  assert.deepEqual(tam.govde, ICERIK);
  const ara = await get(b.port, url(film), { Range: 'bytes=10-15' });
  assert.equal(ara.kod, 206);
  assert.equal(ara.baslik['content-range'], 'bytes 10-15/' + ICERIK.length);
  assert.equal(ara.govde.toString(), 'abcdef');
  const acik = await get(b.port, url(film), { Range: 'bytes=30-' });
  assert.equal(acik.govde.toString(), ICERIK.slice(30).toString());
  const son = await get(b.port, url(film), { Range: 'bytes=-4' });
  assert.equal(son.govde.toString(), 'wxyz');
  const asiri = await get(b.port, url(film), { Range: 'bytes=5-9999' });
  assert.equal(asiri.baslik['content-range'], 'bytes 5-' + (ICERIK.length - 1) + '/' + ICERIK.length);
  assert.equal((await get(b.port, url(film), { Range: 'bytes=500-600' })).kod, 416);
  const bas = await get(b.port, url(film), {}, 'HEAD');
  assert.equal(bas.kod, 200);
  assert.equal(bas.baslik['content-length'], String(ICERIK.length));
  assert.equal(bas.govde.length, 0);
  const bos = await get(b.port, url(join(bolum, 'Muzik.mp3')));
  assert.equal(bos.kod, 200);
  assert.equal(bos.baslik['content-type'], 'audio/mpeg');
  assert.equal(bos.govde.length, 0);
  assert.equal((await get(b.port, url(join(usb, 'sdb', 'Foto.JPG')))).baslik['content-type'], 'image/jpeg');
});

test('medya servisi: sunucu — yanlış jeton, kök dışı yol, sembolik bağlantı, klasör, olmayan dosya, yöntem reddedilir', async () => {
  const b = await baslat();
  const url = (y, j = b.jeton) => '/' + j + '/' + encodeURIComponent(y);
  assert.equal((await get(b.port, url(join(bolum, 'Muzik.mp3'), 'yanlis'))).kod, 403);
  assert.equal((await get(b.port, '/' + encodeURIComponent(join(bolum, 'Muzik.mp3')))).kod, 403, 'jetonsuz');
  assert.equal((await get(b.port, url(join(dis, 'gizli.mp4')))).kod, 403, 'kök dışı');
  assert.equal((await get(b.port, url(bolum + '/../../../disarisi/gizli.mp4'))).kod, 403, 'dışarı kaçış');
  assert.equal((await get(b.port, url(join(bolum, 'Filmler')))).kod, 404, 'klasör');
  assert.equal((await get(b.port, url(join(bolum, 'yok.mp4')))).kod, 404);
  assert.equal((await get(b.port, url(join(bolum, 'Filmler', 'kacak.mp4')))).kod, 404, 'sembolik bağlantı sunulmaz');
  assert.equal((await get(b.port, url(join(bolum, 'Muzik.mp3')), {}, 'POST')).kod, 405);
  assert.equal((await get(b.port, '/' + b.jeton + '/%E0%A4%A')).kod, 400, 'bozuk kodlama');
});

test('medya servisi: sorgusuzluk 20 sn sürerse kapanır; medyaSor canlı tutar; durdurunca yanıt vermez', async () => {
  const b = await baslat();
  assert.equal(svc.medyaSor().port, b.port);
  const m = svc._medya();
  assert.equal(svc._medyaKontrol(m.sonSoru + 19000), false, 'süre dolmadı');
  assert.equal(svc._medyaKontrol(m.sonSoru + 21000), true, 'süre doldu → kapanır');
  assert.equal(svc._medya(), null);
  assert.equal(svc.medyaSor().returnValue, false);
  assert.equal(svc.medyaDurdur().returnValue, true, 'kapalıyken durdurmak hata değildir');
  await assert.rejects(() => get(b.port, '/x/y'), /ECONNREFUSED|ECONNRESET/);
  const yeni = await baslat();
  assert.notEqual(yeni.jeton, b.jeton, 'her oturumda yeni jeton');
});
