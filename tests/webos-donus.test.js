// Fragmandan dönüş: TV servisindeki bekçi (uygulama kapanınca yeniden açar) ve uygulama tarafındaki ekran kaydı/geri yükleme.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { createElement: () => ({ style: {} }), documentElement: { style: {} }, body: {} };
globalThis.getComputedStyle = globalThis.getComputedStyle || (() => ({ fontSize: '20px' }));

const require = createRequire(import.meta.url);
const svc = require('../webos/service/service.js');
const { ctx } = await import('../webos/src/ctx.js');
const { yiginKaydi, acilisParametreleri, donusHazirla, donusUygula, UYGULAMA_ID } = await import('../webos/src/donus.js');

const kok = mkdtempSync(join(tmpdir(), 'iptv-donus-'));
svc._donusDosya(join(kok, 'donus.json'));
const UYG = 'com.koruk.iptv.webos';

// Sahte uygulama yöneticisi: running yanıtı sıra ile verilir; launch çağrıları kaydedilir
function sahte({ calisan = [], launchTamam = true, runningVar = true, onde = null } = {}) {
  const s = { calisan, cagrilar: [], launchlar: [], launchTamam, runningVar, onde };
  s.cagri = (uri, par, cb) => {
    s.cagrilar.push(uri);
    if (/\/running$/.test(uri)) {
      if (!s.runningVar) return cb({ returnValue: false, errorText: 'yok' });
      return cb({ returnValue: true, running: s.calisan.map((id) => ({ id })) });
    }
    if (/getForegroundAppInfo$/.test(uri)) {
      if (s.onde === null) return cb({ returnValue: false, errorText: 'yok' });
      return cb({ returnValue: true, appId: s.onde });
    }
    if (/\/launch$/.test(uri)) {
      s.launchlar.push(par);
      return cb(s.launchTamam ? { returnValue: true } : { returnValue: false, errorText: 'reddedildi' });
    }
    cb(null);
  };
  return s;
}
const sor = () => svc._donusSor();

test('bekçi: uygulama kapanınca (iki sorgu üst üste yok) donus parametresiyle yeniden açılır', () => {
  const s = sahte({ calisan: [UYG, 'com.webos.app.home'] });
  svc._lunaCagri(s.cagri);
  assert.equal(svc.donusKur({ uyg: UYG, params: { tani: 'x' } }).returnValue, true);
  sor();
  assert.deepEqual(s.launchlar, [], 'çalışırken açılmaz');
  s.calisan = ['com.webos.app.home'];
  sor();
  assert.deepEqual(s.launchlar, [], 'tek sorguluk yokluk yetmez');
  sor();
  assert.equal(s.launchlar.length, 1);
  assert.deepEqual(s.launchlar[0], { id: UYG, params: { tani: 'x', donus: 1 } });
  assert.equal(svc._donus(), null, 'açıldıktan sonra bekçi biter');
  const d = svc.donusDurum();
  assert.equal(d.durum, 'açıldı');
  assert.ok(d.tani.some((t) => /kapandı/.test(t)) && d.tani.some((t) => /yeniden açıldı/.test(t)));
  assert.equal(JSON.parse(readFileSync(join(kok, 'donus.json'), 'utf8')).durum, 'açıldı', 'son durum dosyaya da yazılır');
});

test('bekçi: kısa süreli yokluk (tek sorgu) açma yapmaz; uygulama hiç görülmediyse hiç açmaz', () => {
  let s = sahte({ calisan: [UYG] });
  svc._lunaCagri(s.cagri);
  svc.donusKur({ uyg: UYG });
  sor();
  s.calisan = [];
  sor();
  s.calisan = [UYG];
  sor();
  s.calisan = [];
  sor();
  assert.deepEqual(s.launchlar, [], 'aralıklı yokluk sayacı sıfırlanır');
  svc.donusIptal();
  assert.equal(svc.donusDurum().durum, 'iptal');

  s = sahte({ calisan: ['baska.uygulama'] });
  svc._lunaCagri(s.cagri);
  svc.donusKur({ uyg: UYG });
  for (let i = 0; i < 6; i++) sor();
  assert.deepEqual(s.launchlar, [], 'kimlik eşleşmiyorsa (hiç görülmedi) yanlışlıkla açılmaz');
  svc.donusIptal();
});

test('bekçi: running yoksa ön plandaki uygulamaya bakılır; ikisi de yoksa açmaz', () => {
  let s = sahte({ runningVar: false, onde: UYG });
  svc._lunaCagri(s.cagri);
  svc.donusKur({ uyg: UYG });
  sor();
  s.onde = 'com.webos.app.home';
  sor();
  sor();
  assert.equal(s.launchlar.length, 1);
  assert.ok(svc.donusDurum().tani.some((t) => /getForegroundAppInfo/.test(t)), 'çalışan yol notlanır');

  s = sahte({ runningVar: false, onde: null });
  svc._lunaCagri(s.cagri);
  svc.donusKur({ uyg: UYG });
  for (let i = 0; i < 4; i++) sor();
  assert.deepEqual(s.launchlar, []);
  assert.ok(svc.donusDurum().tani.some((t) => /yanıtsız/.test(t)));
  svc.donusIptal();
});

test('bekçi: açma başarısızsa yeniden dener; geçersiz kimlik ve köprüsüz kurulum reddedilir', async () => {
  const s = sahte({ calisan: [UYG], launchTamam: false });
  svc._lunaCagri(s.cagri);
  svc.donusKur({ uyg: UYG });
  sor();
  s.calisan = [];
  sor();
  sor();
  assert.equal(s.launchlar.length, 1);
  s.launchTamam = true;
  await new Promise((r) => setTimeout(r, 1700));
  assert.equal(s.launchlar.length, 2, 'ikinci deneme');
  assert.equal(svc.donusDurum().durum, 'açıldı');

  assert.equal(svc.donusKur({ uyg: '../kotu id' }).returnValue, false);
  assert.equal(svc.donusKur({}).returnValue, false);
  svc._lunaCagri(null);
  const r = svc.donusKur({ uyg: UYG });
  assert.equal(r.returnValue, false);
  assert.match(r.errorText, /köprü/);
});

test('bekçi: ilk açma adresi reddedilirse sıradaki adres denenir; her adresin nedeni notlanır', async () => {
  const s = sahte({ calisan: [UYG] });
  const denenen = [];
  s.cagri = ((eski) => (uri, par, cb) => {
    if (/\/launch$/.test(uri)) {
      denenen.push(uri);
      if (!/service\.applicationmanager/.test(uri)) return cb({ returnValue: false, errorText: 'Denied method call "launch" for category "/"' });
      return cb({ returnValue: true });
    }
    return eski(uri, par, cb);
  })(s.cagri);
  svc._lunaCagri(s.cagri);
  svc.donusKur({ uyg: UYG });
  sor();
  s.calisan = [];
  sor();
  sor();
  assert.deepEqual(denenen, ['luna://com.webos.applicationManager/launch'], 'ilk deneme');
  await new Promise((r) => setTimeout(r, 1700));
  assert.deepEqual(denenen[1], 'luna://com.webos.service.applicationmanager/launch', 'ikinci deneme farklı adres');
  const d = svc.donusDurum();
  assert.equal(d.durum, 'açıldı');
  assert.ok(d.tani.some((t) => /açma 1 başarısız \(luna:\/\/com\.webos\.applicationManager\/launch\): Denied method call/.test(t)), d.tani.join(' | '));
  assert.ok(d.tani.some((t) => /yeniden açıldı \(2\. deneme: luna:\/\/com\.webos\.service\.applicationmanager\/launch\)/.test(t)));
});

test('bekçi: çalışanlar arasında uygulama görünmüyorsa görülen kimlikler notlanır; nabız ve süreç değişimi tanıda belirir', () => {
  svc._donusSifirla();
  const s = sahte({ calisan: ['com.webos.app.home', 'com.baska.uyg'] });
  svc._lunaCagri(s.cagri);
  svc.donusKur({ uyg: UYG });
  for (let i = 0; i < 4; i++) sor();
  let d = svc.donusDurum();
  assert.ok(d.tani.some((t) => /dikkat: com\.koruk\.iptv\.webos çalışanlar arasında görünmüyor \(görülenler: com\.webos\.app\.home, com\.baska\.uyg\)/.test(t)), d.tani.join(' | '));
  assert.ok(d.tani.some((t) => /bekçi \d+ sn sorguladı; son sorgu \d+ sn önce/.test(t)), 'nabız satırı');
  assert.ok(!d.tani.some((t) => /UYARI/.test(t)), 'aynı süreçte uyarı yok');
  svc.donusIptal();
  // Servis yeniden başlamış gibi: dosyada başka süreç numarası
  svc._donusSifirla();
  const dosya = join(kok, 'eski.json');
  svc._donusDosya(dosya);
  writeFileSync(dosya, JSON.stringify({ durum: 'bekliyor', uyg: UYG, tani: ['kuruldu: ' + UYG], zaman: 1, basla: 1000, nabiz: 6000, pid: process.pid + 1 }));
  d = svc.donusDurum();
  assert.equal(d.durum, 'bekliyor');
  assert.ok(d.tani.some((t) => /UYARI: servis bekçiden sonra yeniden başlamış/.test(t) && /bekçi kaybolmuş/.test(t)), d.tani.join(' | '));
  assert.ok(d.tani.some((t) => /bekçi 5 sn sorguladı/.test(t)), 'servisin ne kadar yaşadığı görünür');
  svc._donusDosya(join(kok, 'donus.json'));
});

test('bekçi: palm adresiyle running çalışırsa o yol kullanılır', () => {
  svc._donusSifirla();
  const s = sahte({ calisan: [UYG] });
  const eski = s.cagri;
  s.cagri = (uri, par, cb) => (/com\.palm\.applicationManager\/running$/.test(uri) ? eski('x/running', par, cb) : /\/running$|getForegroundAppInfo$/.test(uri) ? cb({ returnValue: false, errorText: 'Denied' }) : eski(uri, par, cb));
  svc._lunaCagri(s.cagri);
  svc.donusKur({ uyg: UYG });
  sor();
  s.calisan = [];
  sor();
  sor();
  assert.equal(s.launchlar.length, 1);
  assert.ok(svc.donusDurum().tani.some((t) => /yol: luna:\/\/com\.palm\.applicationManager\/running/.test(t)));
});

test('bekçi: açıldıktan sonra ön planda başka uygulama varsa (TV canlı yayını öne aldı) yeniden açar; ön planda doğrulanınca biter', () => {
  svc._donusSifirla();
  const s = sahte({ calisan: [UYG, 'com.webos.app.home'], onde: UYG });
  svc._lunaCagri(s.cagri);
  svc.donusKur({ uyg: UYG });
  sor(); // uygulama çalışıyor ve ön planda
  s.calisan = ['com.webos.app.livetv'];
  s.onde = 'com.webos.app.livetv';
  sor();
  sor(); // iki sorgu yok → açılır
  assert.equal(s.launchlar.length, 1);
  assert.equal(svc.donusDurum().durum, 'doğruluyor', 'açma sonrası ön plan doğrulanır');
  assert.equal(svc._donus() !== null, true);
  // TV canlı yayını açma sonrası öne aldı: ön planda hâlâ başkası; 3 sorgu + 3 sn bekleme sonrası yeniden açılır
  const gercekSimdi = Date.now;
  let t = gercekSimdi();
  Date.now = () => t;
  try {
    for (let i = 0; i < 3; i++) {
      t += 1000;
      sor();
    }
    assert.equal(s.launchlar.length, 2, 'ön planda başkası varken yeniden açıldı');
    assert.ok(svc.donusDurum().tani.some((x) => /ön planda com\.webos\.app\.livetv var; yeniden açılıyor \(2\. açılış\)/.test(x)), svc.donusDurum().tani.join(' | '));
    // Bu kez uygulama ön planda: iki ardışık sorguda doğrulanır ve bekçi biter
    s.onde = UYG;
    s.calisan = [UYG];
    t += 1000;
    sor();
    assert.equal(svc._donus() !== null, true, 'tek sorgu yetmez');
    t += 1000;
    sor();
    assert.equal(svc._donus(), null);
    const d = svc.donusDurum();
    assert.equal(d.durum, 'açıldı');
    assert.ok(d.tani.some((x) => /ön planda \(doğrulandı\)/.test(x)));
    assert.equal(s.launchlar.length, 2, 'doğrulandıktan sonra tekrar açılmaz');
  } finally {
    Date.now = gercekSimdi;
  }
});

test('bekçi: ön plana geçilemezse 40 sn sonra vazgeçer ve nedeni yazar; ön plan hiç sorgulanamazsa açmadan sonra biter', () => {
  svc._donusSifirla();
  let s = sahte({ calisan: [UYG], onde: UYG });
  svc._lunaCagri(s.cagri);
  svc.donusKur({ uyg: UYG });
  sor();
  s.calisan = [];
  s.onde = 'com.webos.app.livetv';
  sor();
  sor();
  assert.equal(s.launchlar.length, 1);
  const gercekSimdi = Date.now;
  let t = gercekSimdi();
  Date.now = () => t;
  try {
    for (let i = 0; i < 45; i++) {
      t += 1000;
      sor();
      if (!svc._donus()) break;
    }
    const d = svc.donusDurum();
    assert.equal(d.durum, 'ön planda değil');
    assert.ok(s.launchlar.length >= 2 && s.launchlar.length <= 5, 'sınırlı sayıda yeniden açma: ' + s.launchlar.length);
    assert.ok(d.tani.some((x) => /ön plana geçilemedi \(ön planda: com\.webos\.app\.livetv\)/.test(x)));
  } finally {
    Date.now = gercekSimdi;
  }
  // Ön plan API'si yok: açma sonrası doğrulanamaz, eski davranış (bitir)
  svc._donusSifirla();
  s = sahte({ calisan: [UYG], onde: null });
  svc._lunaCagri(s.cagri);
  svc.donusKur({ uyg: UYG });
  sor();
  s.calisan = [];
  sor();
  sor();
  assert.equal(svc._donus(), null);
  assert.equal(svc.donusDurum().durum, 'açıldı');
  assert.ok(svc.donusDurum().tani.some((x) => /ön plan sorgulanamadı/.test(x)));
});

// ---- Uygulama tarafı ----
const ekran = (ad, arg) => ({ el: {}, name: ad, acilis: { ad, arg } });
function depo() {
  const d = {};
  return { setting: (k, v) => (k in d ? d[k] : v), setSetting: (k, v) => (d[k] = v), d };
}

test('yiginKaydi: ilk ekran atlanır; oynatıcı/QR gibi ekranlarda ve işlev içeren bağımsız değişkende durur', () => {
  const yigin = [ekran('home'), ekran('browse', { type: 'movie' }), ekran('detail', { item: { id: 5, name: 'Film' } }), ekran('fragmanqr', { url: 'x' }), ekran('detail', { item: { id: 6 } })];
  assert.deepEqual(yiginKaydi(yigin), [
    { ad: 'browse', arg: { type: 'movie' } },
    { ad: 'detail', arg: { item: { id: 5, name: 'Film' } } },
  ]);
  assert.deepEqual(yiginKaydi([ekran('home'), ekran('detail', { f: () => 1 })]), [], 'işlev içeren ekran yeniden kurulamaz');
  assert.deepEqual(yiginKaydi([ekran('home')]), []);
  assert.deepEqual(yiginKaydi([ekran('home'), { el: {} }]), [], 'açılış bilgisi olmayan ekranda durur');
  assert.deepEqual(yiginKaydi([ekran('home'), ekran('settings')]).map((x) => x.arg), [null], 'bağımsız değişken yoksa null');
});

test('acilisParametreleri: PalmSystem.launchParams JSON metni okunur; bozuk/yoksa boş', () => {
  assert.deepEqual(acilisParametreleri({ PalmSystem: { launchParams: '{"donus":1,"tani":"a"}' } }), { donus: 1, tani: 'a' });
  assert.deepEqual(acilisParametreleri({ webOSSystem: { launchParams: '{"donus":1}' } }), { donus: 1 });
  assert.deepEqual(acilisParametreleri({ PalmSystem: { launchParams: '{bozuk' } }), {});
  assert.deepEqual(acilisParametreleri({ PalmSystem: { launchParams: '' } }), {});
  assert.deepEqual(acilisParametreleri({}), {});
});

test('donusHazirla: yığını kaydeder ve servise kurulum çağrısı yapar; servis yoksa hata fırlatmadan kuruldu=false', async () => {
  ctx.store = depo();
  ctx.stack = [ekran('home'), ekran('detail', { item: { id: 9 } })];
  const cagrilar = [];
  const r = await donusHazirla({ cagri: async (uri, par) => (cagrilar.push([uri, par]), { returnValue: true }), simdi: () => 1000 });
  assert.deepEqual(r, { kuruldu: true, neden: '' });
  assert.match(cagrilar[0][0], /donusKur$/);
  assert.equal(cagrilar[0][1].uyg, UYGULAMA_ID);
  assert.deepEqual(ctx.store.d.donus, { t: 1000, yigin: [{ ad: 'detail', arg: { item: { id: 9 } } }] });
  const r2 = await donusHazirla({ cagri: async () => { throw new Error('webOS servis köprüsü yok'); } });
  assert.equal(r2.kuruldu, false);
  assert.match(r2.neden, /köprü/);
  const r3 = await donusHazirla({ cagri: async () => ({ returnValue: false, errorText: 'izin yok' }) });
  assert.deepEqual(r3, { kuruldu: false, neden: 'izin yok' });
});

test('donusUygula: dönüş parametresiyle kayıtlı ekranlar açılır; kayıt silinir; eski ya da parametresiz ve eski kayıt yok sayılır', () => {
  const acilan = [];
  const ac = (ad, arg) => acilan.push([ad, arg]);
  const yigin = [{ ad: 'browse', arg: { type: 'movie' } }, { ad: 'detail', arg: { item: { id: 9 } } }];
  ctx.store = depo();
  ctx.store.setSetting('donus', { t: 1000, yigin });
  let r = donusUygula({ params: { donus: 1, tani: 'running ok' }, simdi: () => 20000, ac });
  assert.deepEqual(r, { donus: true, tani: 'running ok', acilan: 2, kayit: true });
  assert.deepEqual(acilan, [['browse', { type: 'movie' }], ['detail', { item: { id: 9 } }]]);
  assert.equal(ctx.store.d.donus.kullanildi, 20000, 'kayıt kullanıldı diye işaretlenir (silinmez: servis ikinci kez açabilir)');
  // Servis TV başka uygulamayı öne aldığı için uygulamayı yeniden açtı: 1 dk içinde ikinci dönüş açılışı da ekranları kurar
  acilan.length = 0;
  r = donusUygula({ params: { donus: 1 }, simdi: () => 30000, ac });
  assert.deepEqual([r.donus, r.acilan], [true, 2], 'ikinci dönüş açılışı');
  assert.equal(ctx.store.d.donus.kullanildi, 30000);
  // Dönüş parametresiz (elle) açılışta kullanılmış kayıt silinir ve ekran kurulmaz
  acilan.length = 0;
  r = donusUygula({ params: {}, simdi: () => 40000, ac });
  assert.deepEqual([r.donus, r.kayit, acilan.length], [false, true, 0]);
  assert.equal(ctx.store.d.donus, null);
  // Kayıt yoksa hiçbir şey olmaz
  assert.deepEqual(donusUygula({ params: { donus: 1 }, simdi: () => 41000, ac }), { donus: false, tani: '', acilan: 0, kayit: false });
  // Kullanılmış kayıt 1 dakikadan eskiyse dönüş parametresi olsa da kurulmaz
  ctx.store.setSetting('donus', { t: 1000, yigin, kullanildi: 20000 });
  assert.equal(donusUygula({ params: { donus: 1 }, simdi: () => 20000 + 61000, ac }).donus, false);
  assert.equal(ctx.store.d.donus, null);

  // Parametre okunamadıysa: kayıt yeniyse (2 dk içinde) dönüş sayılır, eskiyse sayılmaz
  acilan.length = 0;
  ctx.store.setSetting('donus', { t: 1000, yigin });
  r = donusUygula({ params: {}, simdi: () => 60000, ac });
  assert.equal(r.donus, true);
  acilan.length = 0;
  ctx.store.setSetting('donus', { t: 1000, yigin });
  r = donusUygula({ params: {}, simdi: () => 1000 + 10 * 60000, ac });
  assert.deepEqual([r.donus, r.kayit, acilan.length], [false, true, 0], 'elle açılış: ekran kurulmaz, kayıt silinir');
  assert.equal(ctx.store.d.donus, null);
  // Çok eski kayıt parametre olsa da yok sayılır
  ctx.store.setSetting('donus', { t: 1000, yigin });
  assert.equal(donusUygula({ params: { donus: 1 }, simdi: () => 1000 + 4 * 3600 * 1000, ac }).donus, false);
  // Bir ekran açılamazsa kalanlar atlanır, uygulama çökmez
  ctx.store.setSetting('donus', { t: 1000, yigin });
  r = donusUygula({ params: { donus: 1 }, simdi: () => 5000, ac: (ad) => { if (ad === 'browse') throw new Error('ekran yok'); } });
  assert.deepEqual([r.donus, r.acilan], [true, 0]);
});

test.after(() => rmSync(kok, { recursive: true, force: true }));

// ---- Elle açılışta dönüş raporu (bekçi uygulamayı açmadıysa nedeni ekranda yazılır) ----
const { raporMetni, donusRaporu } = await import('../webos/src/donus.js');

test('raporMetni: servis yeniden başlamışsa onu, yoksa uyarı/hata satırını, o da yoksa son notu söyler', () => {
  assert.equal(raporMetni(null), '');
  assert.equal(raporMetni({ durum: 'yok', tani: [] }), '');
  const tani = ['kuruldu: x', 'yol: luna://a/running (3 uygulama)', 'uygulama çalışıyor', 'canlı tutma etkinliği kurulamadı: yanıt yok', 'UYARI: servis bekçiden sonra yeniden başlamış (süreç 1 → 2): bekçi kaybolmuş', 'bekçi 4 sn sorguladı'];
  assert.match(raporMetni({ durum: 'bekliyor', tani }), /^Dönüş bekçisi: bekliyor · UYARI: servis bekçiden sonra yeniden başlamış/);
  assert.match(raporMetni({ durum: 'bekliyor', tani: tani.slice(0, 4) }), /· canlı tutma etkinliği kurulamadı: yanıt yok$/);
  assert.match(raporMetni({ durum: 'açılamadı', tani: ['kuruldu: x', 'açma 6 başarısız (luna://a/launch): reddedildi'] }), /· açma 6 başarısız/);
  assert.equal(raporMetni({ durum: 'iptal', tani: ['kuruldu: x', 'uygulama çalışıyor'] }), 'Dönüş bekçisi: iptal · uygulama çalışıyor');
  assert.equal(raporMetni({ durum: 'iptal', tani: [] }), 'Dönüş bekçisi: iptal');
  assert.ok(raporMetni({ durum: 'x', tani: ['UYARI ' + 'a'.repeat(400)] }).length <= 170, 'toast için kısaltılır');
});

test('donusRaporu: servis durumunu okur; servis yoksa/hata verirse boş döner (açılışı bozmaz)', async () => {
  const gelen = [];
  const m = await donusRaporu({ cagri: async (uri) => (gelen.push(uri), { returnValue: true, durum: 'bekliyor', tani: ['kuruldu: x'] }) });
  assert.equal(m, 'Dönüş bekçisi: bekliyor · kuruldu: x');
  assert.match(gelen[0], /donusDurum$/);
  assert.equal(await donusRaporu({ cagri: async () => { throw new Error('servis yok'); } }), '');
  assert.equal(await donusRaporu({ cagri: async () => null }), '');
});
