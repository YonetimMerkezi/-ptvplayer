import test from 'node:test';
import assert from 'node:assert/strict';
import { versionCodeOf, parseManifest, isNewer, checkUpdate, fmtMB, shouldAutoCheck, AUTO_CHECK_MS, UPDATE_BASE } from '../www/js/update.js';

test('sürüm numarası "1.0.N" biçiminden çıkarılır, tanınmayan 0 olur', () => {
  assert.equal(versionCodeOf('1.0.57'), 57);
  assert.equal(versionCodeOf('2.3.101'), 101);
  assert.equal(versionCodeOf('geliştirme'), 0);
  assert.equal(versionCodeOf(''), 0);
  assert.equal(versionCodeOf(null), 0);
});

test('version.json doğrulanır: geçersiz → null, eksik alanlar varsayılanla tamamlanır', () => {
  assert.equal(parseManifest(null), null);
  assert.equal(parseManifest({}), null);
  assert.equal(parseManifest({ versionCode: 'x' }), null);
  assert.equal(parseManifest({ versionCode: 0 }), null);
  assert.equal(parseManifest({ versionCode: 1.5 }), null);
  const m = parseManifest({ versionCode: 12 });
  assert.deepEqual(m, { code: 12, name: '1.0.12', size: 0, notes: '', apkUrl: UPDATE_BASE + 'iptv-oynatici.apk' });
});

test('APK dosya adı yalnızca güvenli karakterlerden oluşuyorsa kullanılır (yol/adres sızdırılamaz)', () => {
  assert.equal(parseManifest({ versionCode: 5, apk: 'x.apk' }).apkUrl, UPDATE_BASE + 'x.apk');
  for (const bad of ['../x.apk', 'a/b.apk', 'https://evil.example/x.apk', 'x.exe', 'x.apk?y=1']) {
    assert.equal(parseManifest({ versionCode: 5, apk: bad }).apkUrl, UPDATE_BASE + 'iptv-oynatici.apk', bad);
  }
});

test('yalnız daha büyük sürüm güncelleme sayılır; yerel sürüm bilinmiyorsa asla', () => {
  assert.equal(isNewer(58, 57), true);
  assert.equal(isNewer(57, 57), false);
  assert.equal(isNewer(56, 57), false);
  assert.equal(isNewer(58, 0), false);
});

test('checkUpdate: yeni sürümü, güncel durumu ve desteklenmeyen sürümü ayırt eder', async () => {
  const net = (j) => ({ json: async (url) => (assert.equal(url, UPDATE_BASE + 'version.json'), j) });
  const a = await checkUpdate({ net: net({ versionCode: 60, versionName: '1.0.60', size: 31457280, notes: 'Yeni' }), localVersion: '1.0.57' });
  assert.equal(a.status, 'available');
  assert.equal(a.name, '1.0.60');
  assert.equal(a.local, 57);
  assert.equal(a.apkUrl, UPDATE_BASE + 'iptv-oynatici.apk');
  const c = await checkUpdate({ net: net({ versionCode: 57 }), localVersion: '1.0.57' });
  assert.equal(c.status, 'current');
  const u = await checkUpdate({ net: net({ versionCode: 99 }), localVersion: 'geliştirme' });
  assert.deepEqual(u, { status: 'unsupported' });
  await assert.rejects(() => checkUpdate({ net: net({ bozuk: true }), localVersion: '1.0.57' }), /okunamadı/);
});

test('ağ hatası checkUpdate dışına yayılır (arayüz yakalayıp bildirir)', async () => {
  await assert.rejects(() => checkUpdate({ net: { json: async () => { throw new Error('HTTP 404'); } }, localVersion: '1.0.3' }), /404/);
});

test('boyut biçimi ve otomatik denetim sıklığı', () => {
  assert.equal(fmtMB(31457280), '30,0 MB');
  assert.equal(shouldAutoCheck(0), true);
  assert.equal(shouldAutoCheck(1000, 1000 + AUTO_CHECK_MS - 1), false);
  assert.equal(shouldAutoCheck(1000, 1000 + AUTO_CHECK_MS + 1), true);
});
