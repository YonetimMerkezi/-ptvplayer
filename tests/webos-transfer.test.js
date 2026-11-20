// LG webOS: telefondan kaynak aktarma (TV servisindeki yerel alıcı, kaynak girdisi doğrulaması, ekran kablolaması).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kaynakHazirla } from '../webos/src/kaynak.js';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const oku = (...p) => readFileSync(join(kok, 'webos', ...p), 'utf8');
const require = createRequire(import.meta.url);
const svc = require('../webos/service/service.js');

const baslat = () => new Promise((coz, red) => svc.aliciBaslat({ ilkPort: 0, portAdedi: 1 }, (e, r) => (e ? red(e) : coz(r))));

// Telefonun yaptığı istek: { kod, json | metin }; bekleyen yanıt için söz döner
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
const bekle = (ms) => new Promise((c) => setTimeout(c, ms));

test('alıcı: başlar, 4 haneli kod verir, ikinci başlatma aynı kod ve portu döner; sayfa kodu içermez', async (t) => {
  t.after(() => svc.aliciDurdur());
  const a = await baslat();
  assert.equal(a.returnValue, true);
  assert.match(a.pin, /^\d{4}$/);
  assert.ok(a.port > 0);
  assert.ok(a.kalanMs > 9 * 60 * 1000);
  assert.ok(Array.isArray(a.adresler));
  const b = await baslat();
  assert.deepEqual([b.port, b.pin], [a.port, a.pin]);
  const s = await istek(a.port, '/');
  assert.equal(s.kod, 200);
  assert.match(s.tur, /text\/html; charset=utf-8/);
  assert.match(s.metin, /TV kodu/);
  assert.ok(!s.metin.includes(a.pin), 'sayfa kodu içermemeli (kod yalnız TV ekranında ve QR bağlantısında)');
  assert.equal((await istek(a.port, '/baska')).kod, 404);
  assert.equal((await istek(a.port, '/add')).kod, 404, 'GET /add yok');
});

test('alıcı: doğru kodla gelen kaynak kuyruğa düşer, sonuç telefondaki bekleyen isteğe aynı yanıtla döner', async (t) => {
  t.after(() => svc.aliciDurdur());
  const a = await baslat();
  const bekleyen = istek(a.port, '/add', { method: 'POST', govde: { pin: a.pin, tip: 'xtream', ad: 'Evim', server: 'http://x:80', user: 'u', pass: 'p' } });
  await bekle(60);
  const r = svc.aliciSor();
  assert.equal(r.returnValue, true);
  assert.equal(r.alinan.length, 1);
  assert.deepEqual(
    { ...r.alinan[0], id: 'X' },
    { id: 'X', tip: 'xtream', ad: 'Evim', url: '', server: 'http://x:80', user: 'u', pass: 'p' }
  );
  assert.deepEqual(svc.aliciSor().alinan, [], 'alınan bir daha verilmez');
  assert.equal(svc.aliciSonuc({ id: r.alinan[0].id, durum: 'tamam', mesaj: 'Eklendi' }).returnValue, true);
  const y = await bekleyen;
  assert.equal(y.kod, 200);
  assert.deepEqual(y.json, { ok: true, mesaj: 'Eklendi' });
  assert.equal(svc.aliciSonuc({ id: r.alinan[0].id, durum: 'tamam' }).returnValue, false, 'aynı istek iki kez yanıtlanmaz');

  const hata = istek(a.port, '/add', { method: 'POST', govde: { pin: a.pin, tip: 'm3u', url: 'http://x/l.m3u' } });
  await bekle(60);
  const g = svc.aliciSor().alinan[0];
  assert.equal(g.tip, 'm3u');
  svc.aliciSonuc({ id: g.id, durum: 'hata', mesaj: 'Bağlanılamadı' });
  const h = await hata;
  assert.equal(h.kod, 422);
  assert.deepEqual(h.json, { ok: false, mesaj: 'Bağlanılamadı' });
});

test('alıcı: yanlış kod reddedilir, 8 yanlıştan sonra doğru kod da kilitlenir', async (t) => {
  t.after(() => svc.aliciDurdur());
  const a = await baslat();
  const yanlis = a.pin === '0000' ? '1111' : '0000';
  for (let i = 0; i < 8; i++) {
    const r = await istek(a.port, '/add', { method: 'POST', govde: { pin: yanlis, tip: 'm3u', url: 'http://x/l.m3u' } });
    assert.equal(r.kod, 403);
    assert.match(r.json.mesaj, /kodu yanlış/);
  }
  const kilit = await istek(a.port, '/add', { method: 'POST', govde: { pin: a.pin, tip: 'm3u', url: 'http://x/l.m3u' } });
  assert.equal(kilit.kod, 429);
  assert.match(kilit.json.mesaj, /yanlış kod/);
  assert.deepEqual(svc.aliciSor().alinan, [], 'kilitliyken kuyruğa bir şey düşmez');
});

test('alıcı: bozuk/eksik/büyük istek ve kuyruk sınırı', async (t) => {
  t.after(() => svc.aliciDurdur());
  const a = await baslat();
  assert.equal((await istek(a.port, '/add', { method: 'POST', govde: '{bozuk' })).kod, 400);
  assert.equal((await istek(a.port, '/add', { method: 'POST', govde: '[1,2]' })).kod, 403, 'dizi gövdesi kodsuz sayılır');
  const eksikM3u = await istek(a.port, '/add', { method: 'POST', govde: { pin: a.pin, tip: 'm3u' } });
  assert.equal(eksikM3u.kod, 400);
  assert.match(eksikM3u.json.mesaj, /bağlantısı gerekli/);
  const eksikX = await istek(a.port, '/add', { method: 'POST', govde: { pin: a.pin, tip: 'xtream' } });
  assert.equal(eksikX.kod, 400);
  assert.match(eksikX.json.mesaj, /Sunucu adresi gerekli/);
  const buyuk = await istek(a.port, '/add', { method: 'POST', govde: { pin: a.pin, tip: 'm3u', url: 'http://x/' + 'a'.repeat(9000) } });
  assert.equal(buyuk.kod, 413);
  // metin alanları kırpılır, kontrol karakterleri atılır
  const uzun = istek(a.port, '/add', { method: 'POST', govde: { pin: a.pin, tip: 'm3u', ad: 'A\u0000B' + 'x'.repeat(200), url: 'http://x/' + 'b'.repeat(3000) } });
  await bekle(60);
  const g = svc.aliciSor().alinan[0];
  assert.equal(g.ad.length, 80);
  assert.ok(!g.ad.includes('\u0000'));
  assert.equal(g.url.length, 2000);
  svc.aliciSonuc({ id: g.id, durum: 'hata', mesaj: 'x' });
  await uzun;
  // en çok 5 bekleyen
  const hepsi = [];
  for (let i = 0; i < 5; i++) hepsi.push(istek(a.port, '/add', { method: 'POST', govde: { pin: a.pin, tip: 'm3u', url: 'http://x/' + i } }));
  await bekle(80);
  const fazla = await istek(a.port, '/add', { method: 'POST', govde: { pin: a.pin, tip: 'm3u', url: 'http://x/6' } });
  assert.equal(fazla.kod, 429);
  assert.match(fazla.json.mesaj, /başka kaynakları/);
  svc.aliciDurdur();
  for (const r of await Promise.all(hepsi)) assert.equal(r.kod, 503, 'alıcı durunca bekleyen telefonlara anlaşılır yanıt gider');
});

test('alıcı: durdurulunca kapanır; ekran yoklamayı keserse (20 sn) ya da 10 dakika dolunca kendiliğinden durur', async (t) => {
  t.after(() => svc.aliciDurdur());
  let a = await baslat();
  assert.equal(svc.aliciDurdur().returnValue, true);
  assert.equal(svc.aliciSor().returnValue, false);
  assert.match(svc.aliciSor().errorText, /kapalı/);
  await assert.rejects(() => istek(a.port, '/'), /ECONNREFUSED/);
  assert.equal(svc.aliciDurdur().returnValue, true, 'ikinci durdurma zararsız');

  a = await baslat();
  const simdi = Date.now();
  assert.equal(svc._aliciKontrol(simdi + 10000), false, 'yoklama taze: sürer');
  svc.aliciSor(); // yoklama zamanı yenilenir
  assert.equal(svc._aliciKontrol(Date.now() + 19000), false);
  assert.equal(svc._aliciKontrol(Date.now() + 21000), true, '20 sn yoklama yok: durur');
  assert.equal(svc.aliciSor().returnValue, false);

  a = await baslat();
  assert.equal(svc._aliciKontrol(Date.now() + 5000), false);
  // sürekli yoklansa bile ömür 10 dakikayı geçmez (yoklama zamanı sanal saate göre taze tutulur)
  const d = svc._alici();
  d.sonSoru = d.bas + 9 * 60000;
  assert.equal(svc._aliciKontrol(d.bas + 9 * 60000 + 100), false, '9. dakikada sürer');
  d.sonSoru = d.bas + 10 * 60000 + 4000;
  assert.equal(svc._aliciKontrol(d.bas + 10 * 60000 + 5000), true, '10 dakikayı geçince yoklama taze olsa da durur');
  assert.equal(svc._alici(), null);
});

test('alıcı: yerel adresler yalnız IPv4 ve dahili olmayanlar; her başlatmada yeni kod üretilir', async () => {
  for (const ip of svc._yerelAdresler()) assert.match(ip, /^\d+\.\d+\.\d+\.\d+$/);
  const kodlar = new Set();
  for (let i = 0; i < 12; i++) {
    const r = await baslat();
    kodlar.add(r.pin);
    svc.aliciDurdur();
  }
  assert.ok(kodlar.size > 3, 'kod rastgele');
});

test('kaynakHazirla: Xtream alanları, get.php bağlantısı, M3U ve hata iletileri', () => {
  assert.deepEqual(kaynakHazirla({ tip: 'xtream', ad: 'Evim', server: 'sunucu.com:8080', user: 'u', pass: 'p' }), {
    src: { type: 'xtream', name: 'Evim', server: 'http://sunucu.com:8080', user: 'u', pass: 'p' },
  });
  assert.equal(kaynakHazirla({ tip: 'xtream', server: 'http://s:80', user: 'u' }).hata, 'Sunucu, kullanıcı adı ve şifre gerekli.');
  assert.equal(kaynakHazirla({ tip: 'xtream' }).hata, 'Sunucu, kullanıcı adı ve şifre gerekli.');
  // Xtream sunucu alanına get.php bağlantısı yapıştırılırsa alanlar ayrıştırılır
  const k = kaynakHazirla({ tip: 'xtream', server: 'http://s.com:8080/get.php?username=ali&password=veli&type=m3u_plus' });
  assert.deepEqual([k.src.type, k.src.server, k.src.user, k.src.pass, k.src.name], ['xtream', 'http://s.com:8080', 'ali', 'veli', 'Xtream']);
  // M3U sekmesinde get.php bağlantısı Xtream olarak eklenir, düz liste M3U kalır
  assert.equal(kaynakHazirla({ tip: 'm3u', url: 'http://s.com:8080/get.php?username=a&password=b&type=m3u' }).src.type, 'xtream');
  assert.deepEqual(kaynakHazirla({ tip: 'm3u', url: 'https://x.com/liste.m3u' }).src, { type: 'm3u', name: 'Liste', url: 'https://x.com/liste.m3u' });
  assert.deepEqual(kaynakHazirla({ tip: 'm3u', ad: ' Sinema ', url: 'https://x.com/l.m3u' }).src.name, 'Sinema');
  assert.equal(kaynakHazirla({ tip: 'm3u', url: 'ftp://x/l.m3u' }).hata, 'Bağlantı http:// veya https:// ile başlamalı.');
  assert.equal(kaynakHazirla({ tip: 'm3u', url: '' }).hata, 'Bağlantı http:// veya https:// ile başlamalı.');
  assert.equal(kaynakHazirla({}).hata, 'Bağlantı http:// veya https:// ile başlamalı.');
  // yapıştırırken satır sonu / boşluk karışırsa temizlenir
  assert.equal(kaynakHazirla({ tip: 'm3u', url: '  https://x.com/l\n.m3u \n' }).src.url, 'https://x.com/l.m3u');
});

test('kablolama: ekran kayıtlı, düğme var, servis komutları tutarlı, elle ekleme ile aynı ortak yol kullanılır', () => {
  const app = oku('src', 'app.js');
  assert.match(app, /import \{ transferScreen \} from '\.\/screens\/transfer\.js'/);
  assert.match(app, /transfer: transferScreen/);

  const ekle = oku('src', 'screens', 'addsource.js');
  assert.match(ekle, /data-f="phone">Telefondan aktar</);
  assert.match(ekle, /if \(f === 'phone'\) return open\('transfer'\)/);
  assert.match(ekle, /kaynakHazirla\(/);
  assert.match(ekle, /await kaynakEkle\(h\.src\)/);
  assert.ok(!/createProvider|parseXtreamLink/.test(ekle), 'doğrulama/ayrıştırma tek yerde (kaynak.js, ctx.js)');

  const tr = oku('src', 'screens', 'transfer.js');
  const komutlar = JSON.parse(oku('service', 'services.json')).services[0].commands.map((c) => c.name);
  for (const k of ['aliciBaslat', 'aliciSor', 'aliciSonuc', 'aliciDurdur']) {
    assert.ok(komutlar.includes(k), k + ' services.json içinde');
    assert.match(tr, new RegExp("SERVIS \\+ '" + k + "'"), k + ' ekrandan çağrılıyor');
    assert.match(oku('service', 'service.js'), new RegExp("servis\\.register\\('" + k + "'"), k + ' servise kayıtlı');
  }
  assert.match(tr, /qrSvg\(adres \+ '\/\?k=' \+ r\.pin/, 'QR, kodu önceden dolduran bağlantıyı içerir');
  assert.match(tr, /destroy: dur/, 'ekran kapanınca alıcı durdurulur');
  assert.match(tr, /while \(sira\.length && !kapali\) await isle/, 'bağlantı denenirken yoklama kesilmez (işleme ayrı döngüde)');

  const ctxSrc = oku('src', 'ctx.js');
  assert.match(ctxSrc, /export async function kaynakEkle\(src\)/);
  const ci = readFileSync(join(kok, '.github', 'workflows', 'webos.yml'), 'utf8');
  assert.equal((ci.match(/www\/js\/qr\.js/g) || []).length, 2, 'QR dosyası değişince webOS derlemesi tetiklenir');
  assert.match(oku('css', 'tv.css'), /\.tr-qr \{/);
});
