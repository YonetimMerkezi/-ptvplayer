// Fragmandan dönüş: TV servisindeki bekçi (uygulama kapanınca yeniden açar) ve uygulama tarafındaki ekran kaydı/geri yükleme.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  svc._donusCagri(s.cagri);
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
  svc._donusCagri(s.cagri);
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
  svc._donusCagri(s.cagri);
  svc.donusKur({ uyg: UYG });
  for (let i = 0; i < 6; i++) sor();
  assert.deepEqual(s.launchlar, [], 'kimlik eşleşmiyorsa (hiç görülmedi) yanlışlıkla açılmaz');
  svc.donusIptal();
});

test('bekçi: running yoksa ön plandaki uygulamaya bakılır; ikisi de yoksa açmaz', () => {
  let s = sahte({ runningVar: false, onde: UYG });
  svc._donusCagri(s.cagri);
  svc.donusKur({ uyg: UYG });
  sor();
  s.onde = 'com.webos.app.home';
  sor();
  sor();
  assert.equal(s.launchlar.length, 1);
  assert.ok(svc.donusDurum().tani.some((t) => /getForegroundAppInfo/.test(t)), 'çalışan yol notlanır');

  s = sahte({ runningVar: false, onde: null });
  svc._donusCagri(s.cagri);
  svc.donusKur({ uyg: UYG });
  for (let i = 0; i < 4; i++) sor();
  assert.deepEqual(s.launchlar, []);
  assert.ok(svc.donusDurum().tani.some((t) => /yanıtsız/.test(t)));
  svc.donusIptal();
});

test('bekçi: açma başarısızsa yeniden dener; geçersiz kimlik ve köprüsüz kurulum reddedilir', async () => {
  const s = sahte({ calisan: [UYG], launchTamam: false });
  svc._donusCagri(s.cagri);
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
  svc._donusCagri(null);
  const r = svc.donusKur({ uyg: UYG });
  assert.equal(r.returnValue, false);
  assert.match(r.errorText, /köprü/);
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
  assert.equal(ctx.store.d.donus, null, 'kayıt tek kullanımlık');
  // İkinci açılışta kayıt yok → hiçbir şey olmaz
  assert.deepEqual(donusUygula({ params: { donus: 1 }, simdi: () => 21000, ac }), { donus: false, tani: '', acilan: 0, kayit: false });

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
