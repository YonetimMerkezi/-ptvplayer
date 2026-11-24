// Güncelleme: sürüm karşılaştırma ve GitHub yanıtı çözümü, otomatik denetim kuralları, bildirim, güncelleme sonrası bayrak;
// TV servisinde indirme (yönlendirme, izinli konak, boyut, ar başlığı, sha256) ve kurulum servisine verme.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash, X509Certificate } from 'node:crypto';
import { EventEmitter } from 'node:events';
import tls from 'node:tls';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { createElement: () => ({ style: {} }), documentElement: { style: {} }, body: {} };
globalThis.getComputedStyle = globalThis.getComputedStyle || (() => ({ fontSize: '20px' }));

const require = createRequire(import.meta.url);
const svc = require('../webos/service/service.js');
const { surumSayilari, surumKarsilastir, yayinCoz, denetle, otomatikDenetle, sonucuKaydet, bekleyenSurum, guncellemeSonrasi, YAYIN_ADRESI, IPK_ADI, DEPO } = await import('../webos/src/guncelle.js');

const OZET = 'a'.repeat(64);
const YAYIN = (n, ek = {}) => ({
  name: 'LG webOS TV sürümü 1.0.' + n,
  body: 'LG webOS TV için paket (IPK). Kurulum: webos-kurulum.md dosyasına bakın.\n\nDerleme ' + n + ' (4c08de9). Bu sürüm webOS 3.x (2016-2017) ve üstü için sade arayüzlüdür.',
  published_at: '2026-11-20T10:00:00Z',
  assets: [
    { name: 'webos-kurulum.md', size: 10, updated_at: '2026-11-24T09:00:00Z' },
    { name: IPK_ADI, size: 1048576, updated_at: '2026-11-24T20:54:14Z', digest: 'sha256:' + OZET },
  ],
  ...ek,
});

function sahteDepo(baslangic = {}) {
  const d = { ...baslangic };
  return { setting: (k, v) => (k in d ? d[k] : v), setSetting: (k, v) => (d[k] = v), d };
}

test('surumKarsilastir: sayısal (1.0.9 < 1.0.10); geçersiz sürüm eşit sayılır', () => {
  assert.deepEqual(surumSayilari('1.0.37'), [1, 0, 37]);
  assert.equal(surumSayilari('1.0'), null);
  assert.equal(surumSayilari('v1.0.1'), null);
  assert.equal(surumKarsilastir('1.0.9', '1.0.10'), -1);
  assert.equal(surumKarsilastir('1.0.10', '1.0.9'), 1);
  assert.equal(surumKarsilastir('1.0.10', '1.0.10'), 0);
  assert.equal(surumKarsilastir('1.1.0', '1.0.99'), 1);
  assert.equal(surumKarsilastir('2.0.0', '1.9.99'), 1);
  assert.equal(surumKarsilastir('bozuk', '1.0.1'), 0);
});

test('yayinCoz: sürüm adı, derleme/sha, IPK boyutu ve özeti; ad yoksa gövdeden; tanınmazsa null', () => {
  const y = yayinCoz(YAYIN(47));
  assert.equal(y.surum, '1.0.47');
  assert.equal(y.derleme, 47);
  assert.equal(y.sha, '4c08de9');
  assert.equal(y.tarih, '2026-11-24', 'tarih IPK varlığının güncellenme günü');
  assert.deepEqual(y.ipk, { boyut: 1048576, ozet: OZET });
  assert.match(y.notlar, /Derleme 47/);
  assert.equal(yayinCoz(YAYIN(48, { name: 'başka ad' })).surum, '1.0.48', 'ad sürüm içermezse gövdedeki derleme no');
  assert.equal(yayinCoz(YAYIN(5, { assets: [{ name: IPK_ADI, size: 9 }] })).ipk.ozet, '', 'yayında özet yoksa boş');
  assert.equal(yayinCoz(YAYIN(5, { assets: [] })).ipk, null);
  assert.equal(yayinCoz({ name: 'x', body: 'y' }), null);
  assert.equal(yayinCoz(null), null);
  assert.equal(yayinCoz('metin'), null);
  assert.match(YAYIN_ADRESI, new RegExp('^https://api\\.github\\.com/repos/' + DEPO.replace('/', '\\/') + '/releases/tags/webos$'));
});

test('denetle: yeni / güncel / hata', async () => {
  const net = (j) => ({ json: async () => (j instanceof Error ? Promise.reject(j) : j) });
  let s = await denetle({ net: net(YAYIN(50)), mevcut: '1.0.47' });
  assert.deepEqual([s.durum, s.son.surum, s.hata], ['yeni', '1.0.50', '']);
  s = await denetle({ net: net(YAYIN(47)), mevcut: '1.0.47' });
  assert.equal(s.durum, 'guncel');
  s = await denetle({ net: net(YAYIN(40)), mevcut: '1.0.47' });
  assert.equal(s.durum, 'guncel', 'kurulu sürüm daha yeniyse güncel');
  s = await denetle({ net: net(new Error('Bağlanılamadı')), mevcut: '1.0.47' });
  assert.deepEqual([s.durum, s.hata], ['hata', 'Bağlanılamadı']);
  s = await denetle({ net: net({ foo: 1 }), mevcut: '1.0.47' });
  assert.deepEqual([s.durum, s.hata], ['hata', 'Sürüm bilgisi tanınmadı']);
  const istekler = [];
  await denetle({ net: { json: async (u, o) => (istekler.push([u, o]), YAYIN(1)) }, mevcut: '1.0.1' });
  assert.equal(istekler[0][0], YAYIN_ADRESI);
  assert.equal(istekler[0][1].headers.Accept, 'application/vnd.github+json');
});

test('denetle: yayın özeti yalnız tarayıcının TLS doğruladığı (doğrudan) yoldan gelmişse güvenilir sayılır', async () => {
  const net = (yol) => ({ json: async (u, o) => (yol && o.yolBildir(yol), YAYIN(50)) });
  assert.equal((await denetle({ net: net('direct'), mevcut: '1.0.47' })).son.ipk.guvenilir, true);
  assert.equal((await denetle({ net: net('service'), mevcut: '1.0.47' })).son.ipk.guvenilir, false, 'TV servisi sertifikayı denetlemeden getirebilir');
  assert.equal((await denetle({ net: net(''), mevcut: '1.0.47' })).son.ipk.guvenilir, false, 'yol bilinmiyorsa güvenilmez');
  assert.equal((await denetle({ net: net('direct'), mevcut: '1.0.47' })).son.ipk.ozet, OZET);
  const ozetsiz = YAYIN(50, { assets: [{ name: IPK_ADI, size: 5 }] });
  const r = await denetle({ net: { json: async (u, o) => (o.yolBildir('direct'), ozetsiz) }, mevcut: '1.0.47' });
  assert.equal(r.son.ipk.guvenilir, false, 'özet yoksa güvenilir olamaz');
});

test('otomatikDenetle: kapalıysa ve 12 saat dolmadıysa sormaz; yeni sürümü aynı sürüm için bir kez bildirir; hatada 1 saat sonra yeniden dener', async () => {
  let zaman = 1_000_000_000;
  const simdi = () => zaman;
  const bildirimler = [];
  const bildir = (t) => bildirimler.push(t);
  let cevap = YAYIN(50);
  let istek = 0;
  const net = { json: async () => (istek++, cevap instanceof Error ? Promise.reject(cevap) : cevap) };
  const store = sahteDepo();
  const calis = (ek = {}) => otomatikDenetle({ net, store, bildir, simdi, mevcut: '1.0.47', ...ek });

  store.setSetting('guncelleDenetim', false);
  assert.equal(await calis(), null);
  assert.equal(istek, 0, 'kapalıysa sorulmaz');
  assert.equal((await calis({ zorla: true })).durum, 'yeni', 'zorla kapalıyken de sorar');
  store.d.guncelleDenetim = true;
  store.d.guncelleSon = 0;
  store.d.guncelleBildirilen = '';
  bildirimler.length = 0;
  istek = 0;

  const s = await calis();
  assert.equal(s.durum, 'yeni');
  assert.equal(istek, 1);
  assert.deepEqual(bildirimler, ['Yeni sürüm var: 1.0.50 — Ayarlar › Güncelleme']);
  assert.equal(bekleyenSurum(store, '1.0.47').surum, '1.0.50');
  assert.equal(bekleyenSurum(store, '1.0.50'), null, 'kurulu sürüm güncellenince bayat bilgi yok sayılır');
  zaman += 3600 * 1000;
  assert.equal(await calis(), null, '12 saat dolmadan sorulmaz');
  zaman += 12 * 3600 * 1000;
  assert.equal((await calis()).durum, 'yeni');
  assert.equal(bildirimler.length, 1, 'aynı sürüm için ikinci bildirim yok');
  cevap = YAYIN(51);
  zaman += 13 * 3600 * 1000;
  await calis();
  assert.equal(bildirimler.length, 2, 'daha yeni sürüm yeniden bildirilir');
  assert.match(bildirimler[1], /1\.0\.51/);
  // Hata: bilgi korunur, hata notlanır, 1 saat sonra yeniden denenir (12 saat beklenmez)
  cevap = new Error('Bağlanılamadı');
  zaman += 13 * 3600 * 1000;
  assert.equal((await calis()).durum, 'hata');
  assert.equal(store.d.guncelleBilgi.hata, 'Bağlanılamadı');
  assert.equal(store.d.guncelleBilgi.son.surum, '1.0.51', 'önceki başarılı bilgi silinmez');
  istek = 0;
  zaman += 1800 * 1000;
  assert.equal(await calis(), null, '30 dk sonra henüz değil');
  zaman += 1800 * 1000 + 1;
  cevap = YAYIN(51);
  assert.equal((await calis()).durum, 'yeni');
  assert.equal(istek, 1);
  assert.equal(store.d.guncelleBilgi.hata, '', 'başarılı denetim hatayı temizler');
  // Güncel çıkarsa bildirim yok
  const s2 = sahteDepo();
  const b2 = [];
  assert.equal((await otomatikDenetle({ net: { json: async () => YAYIN(47) }, store: s2, bildir: (t) => b2.push(t), simdi, mevcut: '1.0.47' })).durum, 'guncel');
  assert.deepEqual(b2, []);
});

test('guncellemeSonrasi: beklenen sürüme geçildiyse bildirir ve kaydı siler; geçilmediyse kaydı korur', () => {
  const bildirimler = [];
  const bildir = (t) => bildirimler.push(t);
  const store = sahteDepo({ guncelleBeklenen: '1.0.50', guncelleBilgi: { durum: 'yeni', son: { surum: '1.0.50' } } });
  assert.equal(guncellemeSonrasi({ store, bildir, mevcut: '1.0.47' }), false, 'hâlâ eski sürümdeyiz');
  assert.equal(store.d.guncelleBeklenen, '1.0.50', 'kayıt kalır (ekran nedenini gösterir)');
  assert.equal(guncellemeSonrasi({ store, bildir, mevcut: '1.0.50' }), true);
  assert.deepEqual(bildirimler, ['Güncellendi: 1.0.50']);
  assert.equal(store.d.guncelleBeklenen, '');
  assert.equal(store.d.guncelleBilgi, null);
  assert.equal(guncellemeSonrasi({ store, bildir, mevcut: '1.0.50' }), false, 'beklenen yoksa sessiz');
  assert.equal(guncellemeSonrasi({ store: sahteDepo({ guncelleBeklenen: '1.0.50' }), bildir, mevcut: '1.0.51' }), true, 'daha yeni sürüme geçmek de tamamlanmadır');
});

test('sonucuKaydet: hata önceki bilgiyi korur', () => {
  const store = sahteDepo();
  sonucuKaydet(store, { durum: 'yeni', mevcut: '1.0.1', son: { surum: '1.0.2' }, hata: '' }, () => 5000);
  sonucuKaydet(store, { durum: 'hata', mevcut: '1.0.1', son: null, hata: 'x' }, () => 6000);
  assert.deepEqual(store.d.guncelleBilgi.son, { surum: '1.0.2' });
  assert.equal(store.d.guncelleBilgi.hata, 'x');
});

// ---- TV servisi: indirme ve kurulum ----
const kok = mkdtempSync(join(tmpdir(), 'iptv-guncelle-'));
const IPK = Buffer.concat([Buffer.from('!<arch>\n'), Buffer.from('debian-binary   '), Buffer.alloc(2000, 7)]);
const sha = (b) => createHash('sha256').update(b).digest('hex');
let sunucu;
let port;
const yollar = {};
test.before(async () => {
  sunucu = http.createServer((req, res) => {
    const y = yollar[req.url.split('?')[0]];
    if (!y) {
      res.writeHead(404);
      return res.end('yok');
    }
    res.writeHead(y.kod || 200, y.baslik || { 'Content-Length': (y.govde || '').length });
    res.end(y.govde || '');
  });
  await new Promise((c) => sunucu.listen(0, '127.0.0.1', c));
  port = sunucu.address().port;
  yollar['/ok.ipk'] = { govde: IPK, baslik: { 'Content-Length': IPK.length } };
  yollar['/git'] = { kod: 302, baslik: { Location: '/ok.ipk' } };
  yollar['/dongu'] = { kod: 302, baslik: { Location: '/dongu' } };
  yollar['/dis'] = { kod: 302, baslik: { Location: 'http://baska.example/x.ipk' } };
  yollar['/html.ipk'] = { govde: Buffer.from('<html>hata sayfası</html>') };
  yollar['/buyuk.ipk'] = { govde: IPK, baslik: { 'Content-Length': 41 * 1024 * 1024 } };
  svc._guncelleDosya(join(kok, 'durum.json'));
});
test.after(() => {
  sunucu.close();
  rmSync(kok, { recursive: true, force: true });
});

const ayarla = (yol, ek = {}) =>
  svc._guncelleAyarla({ adres: 'http://127.0.0.1:' + port + yol, modul: http, protokol: 'http:', izin: (k) => k === '127.0.0.1', klasorler: [kok], kurulumMs: 120000, ...ek });
const bitenYok = async (ms = 3000) => {
  const t0 = Date.now();
  for (;;) {
    const d = svc.guncelleDurum();
    if (d.durum !== 'indiriyor' && d.durum !== 'kuruluyor') return d;
    if (Date.now() - t0 > ms) throw new Error('zaman aşımı: ' + JSON.stringify(d));
    await new Promise((c) => setTimeout(c, 10));
  }
};
function lunaSahte(cevaplar) {
  const cagrilar = [];
  svc._lunaCagri((uri, par, cb) => {
    cagrilar.push([uri, par]);
    (cevaplar || []).forEach((r) => setImmediate(() => cb(r)));
  });
  return cagrilar;
}

test('servis güncelleme: indirir, özeti doğrular, IPK dosyasını kurulum servisine verir; kurulum tamamlanınca tamam', async () => {
  svc._guncelleSifirla();
  ayarla('/git'); // yönlendirme izlenir
  const c = lunaSahte([{ returnValue: true, statusValue: 13, details: { state: 'installing' } }, { returnValue: true, statusValue: 17 }]);
  const r = svc.guncelleBaslat({ sha256: sha(IPK) });
  assert.equal(r.returnValue, true);
  assert.equal(r.durum, 'indiriyor');
  const d = await bitenYok();
  assert.equal(d.durum, 'tamam', JSON.stringify(d));
  assert.equal(c.length, 1);
  assert.equal(c[0][0], 'luna://com.webos.appInstallService/dev/install');
  assert.deepEqual([c[0][1].id, c[0][1].subscribe, /iptv-player-webos\.ipk$/.test(c[0][1].ipkUrl)], ['com.koruk.iptv.webos', true, true]);
  assert.equal(d.bayt, IPK.length);
  assert.ok(d.tani.some((t) => /özet doğrulandı/.test(t)));
  assert.ok(!existsSync(c[0][1].ipkUrl), 'kurulum bitince geçici dosya silinir');
  assert.equal(JSON.parse(readFileSync(join(kok, 'durum.json'), 'utf8')).durum, 'tamam', 'durum dosyaya da yazılır');
  svc._guncelleSifirla();
  assert.equal(svc.guncelleDurum().durum, 'tamam', 'servis yeniden başlasa da son durum dosyadan okunur');
});

test('servis güncelleme: özet tutmuyor, IPK değil, 404, çok yönlendirme, izinsiz konak, aşırı büyük dosya → kurulmaz', async () => {
  const dene = async (yol, ozet) => {
    svc._guncelleSifirla();
    ayarla(yol);
    const c = lunaSahte([{ returnValue: true, statusValue: 17 }]);
    svc.guncelleBaslat({ sha256: ozet });
    const d = await bitenYok();
    assert.equal(c.length, 0, yol + ': kurulum servisine hiç gidilmez');
    return d;
  };
  let d = await dene('/ok.ipk', 'b'.repeat(64));
  assert.deepEqual(d.durum, 'hata');
  assert.match(d.mesaj, /özeti yayındakiyle tutmuyor/);
  d = await dene('/html.ipk', '');
  assert.match(d.mesaj, /IPK paketi değil/);
  d = await dene('/yok.ipk', '');
  assert.match(d.mesaj, /404/);
  d = await dene('/dongu', '');
  assert.match(d.mesaj, /yönlendirme/);
  d = await dene('/dis', '');
  assert.match(d.mesaj, /İzin verilmeyen adres: baska\.example/);
  d = await dene('/buyuk.ipk', '');
  assert.match(d.mesaj, /büyük/);
  // Özet verilmediyse (yayında yok) kurulur ama doğrulanamadığı notlanır
  svc._guncelleSifirla();
  ayarla('/ok.ipk');
  const c = lunaSahte([{ returnValue: true, statusValue: 17 }]);
  svc.guncelleBaslat({ sha256: 'bozuk' });
  d = await bitenYok();
  assert.equal(d.durum, 'tamam');
  assert.equal(c.length, 1);
  assert.ok(d.tani.some((t) => /özet doğrulanamadı/.test(t)));
});

test('servis güncelleme: TV kurulum servisi reddederse hata ve ham yanıt tanıda; yanıt gelmezse belirsiz; ikinci başlatma sürerken yeni indirme açmaz', async () => {
  svc._guncelleSifirla();
  ayarla('/ok.ipk');
  let c = lunaSahte([{ returnValue: false, errorText: 'Permission denied' }]);
  svc.guncelleBaslat({});
  let d = await bitenYok();
  assert.deepEqual([d.durum, d.mesaj], ['hata', 'Permission denied']);
  assert.ok(d.tani.some((t) => /kurulum yanıtı: .*Permission denied/.test(t)), 'TV\'nin ham yanıtı tanıda');
  assert.equal(c.length, 1);

  svc._guncelleSifirla();
  ayarla('/ok.ipk', { kurulumMs: 60 });
  lunaSahte([]); // hiç yanıt yok
  svc.guncelleBaslat({});
  d = await bitenYok();
  assert.equal(d.durum, 'belirsiz');
  assert.match(d.mesaj, /yeniden açıp sürümü kontrol edin/);

  svc._guncelleSifirla();
  ayarla('/ok.ipk', { kurulumMs: 60 });
  c = lunaSahte([]);
  const a = svc.guncelleBaslat({});
  const b = svc.guncelleBaslat({});
  assert.equal(a.durum, 'indiriyor');
  assert.ok(b.durum === 'indiriyor' || b.durum === 'kuruluyor', 'sürerken ikinci başlatma aynı işlemi döner');
  d = await bitenYok();
  assert.equal(c.length, 1, 'tek kurulum çağrısı');
  // Servis köprüsü yoksa kurulamaz
  svc._guncelleSifirla();
  ayarla('/ok.ipk');
  svc._lunaCagri(null);
  svc.guncelleBaslat({});
  d = await bitenYok();
  assert.deepEqual([d.durum, d.mesaj], ['hata', 'Servis köprüsü yok']);
});

test('servis güncelleme: indirme adresi sabittir (uygulamadan alınmaz) ve uygulamadaki depo adıyla aynı', () => {
  assert.equal(svc._guncelleAdres, 'https://github.com/' + DEPO + '/releases/download/webos/' + IPK_ADI);
  // Varsayılan izin: yalnız github.com ve githubusercontent.com
  const kaynak = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'webos', 'service', 'service.js'), 'utf8');
  assert.match(kaynak, /GUNCELLE_UYGULAMA = 'com\.koruk\.iptv\.webos'/);
  assert.ok(!/p\.(url|adres)/.test(kaynak.slice(kaynak.indexOf('function guncelleBaslat'), kaynak.indexOf('var SAYFA ='))), 'guncelleBaslat uygulamadan adres almaz');
});

// ---- TLS: eski TV'nin sertifika deposu GitHub'ı tanımayabilir ("certificate not trusted") ----
function tlsSahte(kayit, { eszamanli = false, kod = 'CERT_UNTRUSTED' } = {}) {
  return {
    get(secenek, cevap) {
      kayit.push({ ca: secenek.ca, rejectUnauthorized: secenek.rejectUnauthorized, agent: secenek.agent });
      if (secenek.rejectUnauthorized !== false) {
        if (eszamanli && secenek.ca) throw new Error('PEM routines:PEM_read_bio:bad end line');
        const r = new EventEmitter();
        r.setTimeout = () => {};
        r.abort = () => {};
        setImmediate(() => {
          const e = new Error('certificate not trusted');
          e.code = kod;
          r.emit('error', e);
        });
        return r;
      }
      return http.get(secenek, cevap);
    },
  };
}

test('servis güncelleme: gömülü kök sertifikalar Node/Mozilla listesindeki gerçek köklerdir ve indirmeye ca olarak verilir', async () => {
  const kokler = svc._guncelleKokler;
  assert.ok(kokler.length >= 5);
  const bilinen = new Set(tls.rootCertificates.map((p) => new X509Certificate(p).fingerprint256));
  const adlar = [];
  for (const pem of kokler) {
    const x = new X509Certificate(pem);
    assert.ok(bilinen.has(x.fingerprint256), 'gömülü kök gerçek bir kök sertifika: ' + x.subject);
    adlar.push(/CN=(.*)/.exec(x.subject)[1]);
  }
  for (const ad of ['DigiCert Global Root G2', 'USERTrust RSA Certification Authority', 'ISRG Root X1', 'Sectigo Public Server Authentication Root R46']) assert.ok(adlar.includes(ad), ad + ' gömülü');
  svc._guncelleSifirla();
  const kayit = [];
  ayarla('/ok.ipk', { modul: tlsSahte(kayit), ca: kokler });
  lunaSahte([]);
  svc.guncelleBaslat({ sha256: sha(IPK) }); // özet güvenilir işaretli değil: TLS hatasında durur
  await bitenYok();
  assert.deepEqual(kayit[0].ca, kokler);
  assert.equal(kayit[0].rejectUnauthorized, undefined, 'önce doğrulama açık');
  assert.equal(kayit[0].agent, false);
});

test('servis güncelleme: TLS doğrulanamazsa yalnız güvenilir yoldan gelen özet varsa sertifika denetimi atlanıp dosya özetle doğrulanır', async () => {
  svc._guncelleSifirla();
  const kayit = [];
  ayarla('/ok.ipk', { modul: tlsSahte(kayit) });
  const c = lunaSahte([{ returnValue: true, statusValue: 17 }]);
  svc.guncelleBaslat({ sha256: sha(IPK), ozetGuvenilir: true });
  const d = await bitenYok();
  assert.equal(d.durum, 'tamam', JSON.stringify(d));
  assert.deepEqual(kayit.map((k) => k.rejectUnauthorized), [undefined, false], 'önce doğrulamalı, sonra özetle korunan yedek');
  assert.ok(d.tani.some((t) => /sertifika doğrulanamadı: certificate not trusted/.test(t)));
  assert.ok(d.tani.some((t) => /özet doğrulandı \(sertifika denetimsiz indirildi\)/.test(t)));
  assert.equal(c.length, 1);
  assert.equal(d.bayt, IPK.length, 'yeniden denemede bayt sayacı sıfırlanır');
});

test('servis güncelleme: TLS doğrulanamadığında özet yok ya da güvenilmez ise hiçbir şey indirilip kurulmaz', async () => {
  for (const p of [{}, { sha256: sha(IPK) }, { sha256: sha(IPK), ozetGuvenilir: false }, { sha256: sha(IPK), ozetGuvenilir: 'true' }, { ozetGuvenilir: true }]) {
    svc._guncelleSifirla();
    const kayit = [];
    ayarla('/ok.ipk', { modul: tlsSahte(kayit) });
    const c = lunaSahte([{ returnValue: true, statusValue: 17 }]);
    svc.guncelleBaslat(p);
    const d = await bitenYok();
    assert.equal(d.durum, 'hata', JSON.stringify(p));
    assert.match(d.mesaj, /GitHub sertifikasına güvenmiyor .*certificate not trusted.* güvenilir bir doğrulama özeti yok/);
    assert.equal(kayit.length, 1, 'doğrulamasız yedek hiç denenmez: ' + JSON.stringify(p));
    assert.equal(c.length, 0);
  }
});

test('servis güncelleme: yedek yolda özet tutmuyorsa (araya girilmiş dosya) kurulmaz', async () => {
  svc._guncelleSifirla();
  ayarla('/ok.ipk', { modul: tlsSahte([]) });
  const c = lunaSahte([{ returnValue: true, statusValue: 17 }]);
  svc.guncelleBaslat({ sha256: 'c'.repeat(64), ozetGuvenilir: true });
  const d = await bitenYok();
  assert.equal(d.durum, 'hata');
  assert.match(d.mesaj, /özeti yayındakiyle tutmuyor/);
  assert.equal(c.length, 0);
});

test('servis güncelleme: gömülü kök PEM\'i yüklenemeyip eşzamanlı hata fırlarsa servis çökmez, güvenilir özetle yedek denenir', async () => {
  svc._guncelleSifirla();
  const kayit = [];
  ayarla('/ok.ipk', { modul: tlsSahte(kayit, { eszamanli: true }) });
  lunaSahte([{ returnValue: true, statusValue: 17 }]);
  svc.guncelleBaslat({ sha256: sha(IPK), ozetGuvenilir: true });
  const d = await bitenYok();
  assert.equal(d.durum, 'tamam', JSON.stringify(d));
  assert.deepEqual(kayit.map((k) => k.rejectUnauthorized), [undefined, false]);

  svc._guncelleSifirla();
  ayarla('/ok.ipk', { modul: tlsSahte([], { eszamanli: true }) });
  lunaSahte([{ returnValue: true, statusValue: 17 }]);
  svc.guncelleBaslat({});
  const d2 = await bitenYok();
  assert.equal(d2.durum, 'hata');
  assert.match(d2.mesaj, /güvenilir bir doğrulama özeti yok/);
});

test('servis güncelleme: ağ hatası (TLS değil) yedek yola geçmez', async () => {
  svc._guncelleSifirla();
  const kayit = [];
  const modul = {
    get(secenek) {
      kayit.push(secenek.rejectUnauthorized);
      const r = new EventEmitter();
      r.setTimeout = () => {};
      r.abort = () => {};
      setImmediate(() => {
        const e = new Error('getaddrinfo ENOTFOUND github.com');
        e.code = 'ENOTFOUND';
        r.emit('error', e);
      });
      return r;
    },
  };
  ayarla('/ok.ipk', { modul });
  svc.guncelleBaslat({ sha256: sha(IPK), ozetGuvenilir: true });
  const d = await bitenYok();
  assert.deepEqual(kayit, [undefined], 'DNS/ağ hatasında doğrulamasız deneme yok');
  assert.match(d.mesaj, /İndirilemedi: getaddrinfo ENOTFOUND/);
});
