// LG webOS TV servisi: canlı yayın kaydı (diske MPEG-TS yazma). Yazılabilir disk seçimi, hata nedenlerinin bildirilmesi,
// yönlendirme, süre/durdurma ve kaydın medya sunucusundan (Range) oynatılabilmesi.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const svc = require('../webos/service/service.js');

const kok = mkdtempSync(join(tmpdir(), 'iptv-kayit-'));
const usb = join(kok, 'usb');
const yedek = join(kok, 'developer');
mkdirSync(join(usb, 'sda', 'sda1'), { recursive: true });
mkdirSync(yedek, { recursive: true });
const bolum = join(usb, 'sda', 'sda1');
svc._medyaAyarla([usb], usb);
svc._kayitAyarla(yedek);

// Sahte IPTV sunucusu: /canli.ts sürekli TS benzeri veri akıtır; /yon → /canli.ts; /yok → 404; /sinir → 200 + metin
const PAKET = Buffer.alloc(188 * 50, 0x47);
const sunucu = http.createServer((req, res) => {
  if (req.url === '/yon') {
    res.writeHead(302, { Location: '/canli.ts' });
    return res.end();
  }
  if (req.url === '/yok') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  if (req.url === '/sinir') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<html>Maximum connections reached</html>');
  }
  if (req.url === '/liste.m3u8') {
    res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
    return res.end('#EXTM3U\n');
  }
  res.writeHead(200, { 'Content-Type': 'video/mp2t' });
  const t = setInterval(() => res.write(PAKET), 10);
  res.on('close', () => clearInterval(t));
});
await new Promise((coz) => sunucu.listen(0, '127.0.0.1', coz));
const port = sunucu.address().port;
const adres = (y) => 'http://127.0.0.1:' + port + y;

test.after(() => {
  sunucu.closeAllConnections?.();
  sunucu.close();
  svc.medyaDurdur();
  rmSync(kok, { recursive: true, force: true });
});

const baslat = (p) => new Promise((coz, red) => svc.kayitBaslat(p, (e, r) => (e ? red(e) : coz(r))));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
async function bekleKadar(f, ad) {
  for (let i = 0; i < 200 && !f(); i++) await bekle(25);
  assert.ok(f(), ad + ' bekleniyordu');
}
const bitmis = (id) => svc.kayitDurum({ id }).durum === 'bitti' || svc.kayitDurum({ id }).durum === 'hata';

test('kayıt servisi: yayını USB bölümüne yazar, durum bayt/süre bildirir, durdurunca dosya tamamdır', async () => {
  const r = await baslat({ url: adres('/canli.ts'), ad: 'TRT Çocuk HD', sureSn: 30 });
  assert.equal(r.returnValue, true);
  assert.match(r.disk, /^USB 1 \(sda1\)$/);
  assert.ok(r.dosya.startsWith(join(bolum, 'IPTV-Kayit') + '/TRT_Cocuk_HD-'), r.dosya);
  assert.ok(r.dosya.endsWith('.ts'));
  await bekleKadar(() => svc.kayitDurum({ id: r.id }).bayt > 188 * 50 * 3, 'yazılan bayt');
  const d = svc.kayitDurum({ id: r.id });
  assert.equal(d.durum, 'yaziyor');
  assert.equal(d.http, 200);
  assert.ok(d.sureMs > 0);
  await assert.rejects(() => baslat({ url: adres('/canli.ts') }), /Zaten bir kayıt/);
  const son = svc.kayitDurdur({ id: r.id });
  assert.equal(son.durum, 'bitti');
  assert.match(son.mesaj, /Durduruldu/);
  await bekle(150);
  const dosya = readFileSync(r.dosya);
  assert.equal(dosya.length, svc.kayitDurum({ id: r.id }).bayt, 'durum boyutu dosyayla aynı');
  assert.ok(dosya.length >= 188 * 50 * 3);
  assert.equal(dosya[0], 0x47);
  assert.equal(dosya.length % (188 * 50), 0, 'yazılan bayt akıtılan paketlerin katı');
});

test('kayıt servisi: süre dolunca kendiliğinden biter', async () => {
  const r = await baslat({ url: adres('/canli.ts'), ad: 'x', sureSn: 1 });
  await bekleKadar(() => bitmis(r.id), 'bitiş');
  const d = svc.kayitDurum({ id: r.id });
  assert.equal(d.durum, 'bitti');
  assert.match(d.mesaj, /Süre doldu/);
  assert.ok(d.sureMs >= 900 && d.sureMs < 3000, 'süre ' + d.sureMs);
});

test('kayıt servisi: yönlendirmeyi izler; 404, hata sayfası ve HLS listesi nedeniyle birlikte reddedilir', async () => {
  const y = await baslat({ url: adres('/yon'), sureSn: 30 });
  await bekleKadar(() => svc.kayitDurum({ id: y.id }).bayt > 0, 'yönlendirilen yayın');
  svc.kayitDurdur({ id: y.id });
  const dosyaSayisi = () => readdirSync(join(bolum, 'IPTV-Kayit')).filter((a) => a.endsWith('.ts')).length;
  await bekle(700); // boş dosya temizliği için
  const once = dosyaSayisi();
  for (const [yol, beklenen] of [['/yok', /HTTP 404.*Not found/], ['/sinir', /yayın yerine metin verdi.*Maximum connections/], ['/liste.m3u8', /HLS listesi verdi/]]) {
    const r = await baslat({ url: adres(yol), sureSn: 30 });
    await bekleKadar(() => bitmis(r.id), yol);
    const d = svc.kayitDurum({ id: r.id });
    assert.equal(d.durum, 'hata', yol);
    assert.match(d.mesaj, beklenen, yol);
  }
  await bekle(700);
  assert.equal(dosyaSayisi(), once, 'hatalı denemeler dosya bırakmaz');
});

test('kayıt servisi: adres yoksa reddeder; bağlanılamazsa nedeni söyler', async () => {
  await assert.rejects(() => baslat({}), /Yayın adresi yok/);
  await assert.rejects(() => baslat({ url: 'ftp://x/y' }), /Yayın adresi yok/);
  const r = await baslat({ url: 'http://127.0.0.1:1/canli.ts', sureSn: 30 });
  await bekleKadar(() => bitmis(r.id), 'bağlantı hatası');
  assert.match(svc.kayitDurum({ id: r.id }).mesaj, /Bağlanılamadı: ECONNREFUSED/);
});

test('kayıt servisi: USB yazılamıyorsa hata kodunu söyler ve geliştirici alanına yazar', async () => {
  rmSync(join(bolum, 'IPTV-Kayit'), { recursive: true, force: true });
  writeFileSync(join(bolum, 'IPTV-Kayit'), 'dosya'); // klasör yerine dosya: yazma ENOTDIR ile düşer (yönetici hakkıyla da denenebilir)
  const r = await baslat({ url: adres('/canli.ts'), ad: 'y', sureSn: 30 });
  assert.equal(r.disk, 'Geliştirici alanı', 'USB yazılamadı, yedeğe geçildi');
  assert.ok(r.dosya.startsWith(join(yedek, 'IPTV-Kayit') + '/'));
  assert.match(r.mesaj, /USB 1 \(sda1\): ENOTDIR/);
  await bekleKadar(() => svc.kayitDurum({ id: r.id }).bayt > 0, 'yedeğe yazım');
  svc.kayitDurdur({ id: r.id });
  await bekle(200);
  // yedek de yazılamazsa her adayın nedeni bildirilir
  rmSync(join(yedek, 'IPTV-Kayit'), { recursive: true, force: true });
  writeFileSync(join(yedek, 'IPTV-Kayit'), 'dosya');
  await assert.rejects(() => baslat({ url: adres('/canli.ts') }), /Hiçbir diske yazılamadı \(USB 1 \(sda1\): ENOTDIR; Geliştirici alanı: ENOTDIR\)/);
  rmSync(join(yedek, 'IPTV-Kayit'), { force: true });
  rmSync(join(bolum, 'IPTV-Kayit'), { force: true });
  mkdirSync(join(bolum, 'IPTV-Kayit'), { recursive: true });
});

test('kayıt servisi: kaydedilen dosya medya sunucusundan Range ile oynatılabilir; izinli kökün dışına çıkılamaz', async () => {
  const r = await baslat({ url: adres('/canli.ts'), ad: 'oynat', sureSn: 30 });
  await bekleKadar(() => svc.kayitDurum({ id: r.id }).bayt > 188 * 50 * 2, 'yazılan bayt');
  svc.kayitDurdur({ id: r.id });
  await bekle(200);
  const b = await new Promise((coz, red) => svc.medyaBaslat({}, (e, x) => (e ? red(e) : coz(x))));
  const get = (yol, basliklar = {}) =>
    new Promise((coz, red) => {
      const q = http.request({ host: '127.0.0.1', port: b.port, path: yol, headers: basliklar }, (res) => {
        const p = [];
        res.on('data', (c) => p.push(c));
        res.on('end', () => coz({ kod: res.statusCode, baslik: res.headers, govde: Buffer.concat(p) }));
      });
      q.on('error', red);
      q.end();
    });
  const adrs = '/' + b.jeton + '/' + encodeURIComponent(r.dosya);
  const tum = await get(adrs);
  assert.equal(tum.kod, 200);
  assert.equal(tum.baslik['content-type'], 'video/mp2t');
  assert.equal(tum.govde.length, readFileSync(r.dosya).length);
  const parca = await get(adrs, { Range: 'bytes=188-375' });
  assert.equal(parca.kod, 206);
  assert.equal(parca.govde.length, 188);
  assert.equal(parca.govde[0], 0x47);
  assert.equal(svc._medyaYol(join(yedek, 'IPTV-Kayit', 'a.ts')), join(yedek, 'IPTV-Kayit', 'a.ts'), 'yedek kayıt klasörü izinli');
  assert.equal(svc._medyaYol(join(yedek, 'baska.ts')), null, 'geliştirici alanının geri kalanı izinli değil');
  assert.ok(existsSync(r.dosya));
});

test('kayıt servisi: kayitAlan her diskin yazılabilirliğini ve boş alanını bildirir; blockinfo bellek sayılmaz', async () => {
  mkdirSync(join(usb, 'blockinfo'), { recursive: true });
  rmSync(join(bolum, 'IPTV-Kayit'), { recursive: true, force: true });
  const r = await new Promise((coz, red) => svc.kayitAlan({}, (e, x) => (e ? red(e) : coz(x))));
  assert.equal(r.returnValue, true);
  const usbDisk = r.diskler.filter((d) => d.ad === 'USB 1 (sda1)')[0];
  assert.ok(usbDisk, 'USB bölümü listelenir');
  assert.equal(usbDisk.yazilabilir, true);
  assert.ok(usbDisk.bos > 0, 'df boş alanı verir: ' + usbDisk.bos);
  assert.ok(!r.diskler.some((d) => /blockinfo/.test(d.ad)), 'blockinfo bir bellek değildir');
  assert.equal(r.diskler[r.diskler.length - 1].ad, 'Geliştirici alanı');
  rmSync(join(bolum, 'IPTV-Kayit'), { recursive: true, force: true });
  writeFileSync(join(bolum, 'IPTV-Kayit'), 'dosya'); // klasör yerine dosya: yazılamayan disk olarak raporlanır
  const r2 = await new Promise((coz, red) => svc.kayitAlan({}, (e, x) => (e ? red(e) : coz(x))));
  const kotu = r2.diskler.filter((d) => d.ad === 'USB 1 (sda1)')[0];
  assert.equal(kotu.yazilabilir, false);
  assert.equal(kotu.hata, 'ENOTDIR');
  rmSync(join(bolum, 'IPTV-Kayit'), { force: true });
});

test('kayıt servisi: kayitAlan yazılamayan diskin sahibi, izni ve servis kimliğini bildirir', async () => {
  rmSync(join(bolum, 'IPTV-Kayit'), { recursive: true, force: true });
  writeFileSync(join(bolum, 'IPTV-Kayit'), 'dosya'); // klasör yerine dosya: yazılamayan disk
  try {
    const r = await new Promise((coz, red) => svc.kayitAlan({}, (e, x) => (e ? red(e) : coz(x))));
    const d = r.diskler.filter((x) => x.ad === 'USB 1 (sda1)')[0];
    assert.equal(d.yazilabilir, false);
    assert.equal(typeof d.ayrinti.mod, 'string');
    assert.ok(d.ayrinti.mod.length >= 3, 'izin kipi sekizlik: ' + d.ayrinti.mod);
    assert.equal(typeof d.ayrinti.sahipUid, 'number');
    assert.equal(typeof r.kullanici.uid, 'number');
    assert.ok(r.diskler.filter((x) => x.yazilabilir).every((x) => !x.ayrinti), 'yazılabilen diskte ayrıntı yok');
  } finally {
    rmSync(join(bolum, 'IPTV-Kayit'), { force: true });
  }
});

// Kök yetkili indirme servisini taklit eder: verilen adresi gerçekten indirip hedefe yazar (medya sunucusu dahil)
function sahteIndirme(yapilan) {
  return (uri, par, cb) => {
    yapilan.push([uri, par]);
    http.get(par.target, (res) => {
      const parcalar = [];
      res.on('data', (c) => parcalar.push(c));
      res.on('end', () => {
        writeFileSync(join(par.targetDir, par.targetFilename), Buffer.concat(parcalar));
        cb({ returnValue: true, completed: true });
      });
    });
  };
}
const usbDene = () => new Promise((coz, red) => svc.kayitUsbDene({}, (e, x) => (e ? red(e) : coz(x))));

test('kayıt servisi: kayitUsbDene — kök yetkili indirme servisi dosyayı USB’ye yazarsa "yazildi"', async () => {
  rmSync(join(bolum, 'IPTV-Kayit'), { recursive: true, force: true });
  writeFileSync(join(bolum, 'IPTV-Kayit'), 'dosya'); // doğrudan yazılamayan USB
  const yapilan = [];
  svc._lunaAyarla(sahteIndirme(yapilan), 3000);
  try {
    const r = await usbDene();
    assert.equal(r.returnValue, true);
    assert.equal(r.sonuclar.length, 1);
    assert.equal(r.sonuclar[0].ad, 'USB 1 (sda1)');
    assert.equal(r.sonuclar[0].sonuc, 'yazildi');
    assert.equal(yapilan[0][0], 'luna://com.webos.service.downloadmanager/download');
    assert.match(yapilan[0][1].target, /^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]+\//, 'kaynak yerel medya sunucusundan');
    assert.equal(yapilan[0][1].targetDir, bolum);
    assert.equal(readFileSync(join(bolum, 'iptv-kayit-testi.bin')).length, 4096);
    assert.ok(!existsSync(join(yedek, 'IPTV-Kayit', 'iptv-kayit-testi.bin')), 'kaynak dosya temizlenir');
  } finally {
    svc._lunaAyarla(null);
    rmSync(join(bolum, 'iptv-kayit-testi.bin'), { force: true });
    rmSync(join(bolum, 'IPTV-Kayit'), { force: true });
  }
});

test('kayıt servisi: kayitUsbDene — indirme servisi hiçbir şey yazmazsa "yok" ve yanıt bildirilir; luna yoksa hata', async () => {
  rmSync(join(bolum, 'IPTV-Kayit'), { recursive: true, force: true });
  writeFileSync(join(bolum, 'IPTV-Kayit'), 'dosya');
  try {
    svc._lunaAyarla(null);
    await assert.rejects(usbDene().then((r) => (r.returnValue === false ? Promise.reject(new Error(r.errorText)) : r)), /Luna çağrısı/);
    svc._lunaAyarla((uri, par, cb) => cb({ returnValue: false, errorText: 'Denied method call' }), 600);
    const r = await usbDene();
    assert.equal(r.sonuclar[0].sonuc, 'yok');
    assert.match(r.sonuclar[0].yanit, /Denied method call/);
  } finally {
    svc._lunaAyarla(null);
    rmSync(join(bolum, 'IPTV-Kayit'), { force: true });
  }
});
