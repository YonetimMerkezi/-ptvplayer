// Java eklentisi gerçek cihazda derlenip çalıştırılmadan önce, yalnız çalışma anında patlayan bilinen tuzakları yakalar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { nativePlugin } from '../www/js/bridge.js';
import { fileURLToPath } from 'node:url';

const kaynak = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../android/app/src/main/java/com/koruk/iptv/IptvPlayerPlugin.java'),
  'utf8',
);

test('File.createTempFile öneki en az 3 karakter olmalı ("Prefix string too short")', () => {
  const sabitler = Object.fromEntries([...kaynak.matchAll(/String\s+(\w+)\s*=\s*"([^"]*)"\s*;/g)].map((m) => [m[1], m[2]]));
  const cagrilar = [...kaynak.matchAll(/createTempFile\(\s*("([^"]*)"|(\w+))\s*,/g)];
  assert.ok(cagrilar.length > 0, 'createTempFile çağrısı bulunamadı');
  for (const m of cagrilar) {
    const onek = m[2] !== undefined ? m[2] : sabitler[m[3]];
    assert.ok(onek !== undefined, `önek çözülemedi: ${m[0]}`);
    assert.ok(onek.length >= 3, `createTempFile öneki çok kısa: "${onek}"`);
  }
});

test('geçici dosya silme/temizleme aynı öneki kullanır', () => {
  assert.ok(!/startsWith\("dl"\)/.test(kaynak), 'eski kısa önek kalmış');
  assert.ok((kaynak.match(/startsWith\(TMP_PREFIX\)/g) || []).length >= 2);
});

test('geri tuşu: Capacitor çekirdeği işlemez, MainActivity WebView geçmişinde geri gitmeli', () => {
  const main = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../android/app/src/main/java/com/koruk/iptv/MainActivity.java'),
    'utf8',
  );
  assert.match(main, /OnBackPressedCallback/);
  assert.match(main, /canGoBack\(\)/);
  assert.match(main, /goBack\(\)/);
  // geçmiş bitince uygulamadan çıkılabilmeli (geri tuşu yutulmamalı)
  assert.match(main, /setEnabled\(false\)/);
});

test('ses/altyazı parça değişimi JS tarafına bildiriliyor', () => {
  assert.match(kaynak, /onTracksChanged\(Tracks tracks\)[\s\S]*notifyListeners\("tracks"/);
});

const oku = (ad) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../android/app/src/main/java/com/koruk/iptv/' + ad), 'utf8');

test('uygulama tam ekran: kenardan kenara, çubuklar gizli, çentik alanına da çiziyor', () => {
  const main = oku('MainActivity.java');
  assert.match(main, /setDecorFitsSystemWindows\(\s*\w+,\s*false\s*\)/, 'pencere sistem çubuklarının arkasına çizilmiyor');
  assert.match(main, /Build\.VERSION\.SDK_INT\s*>=\s*28[\s\S]*?layoutInDisplayCutoutMode\s*=\s*WindowManager\.LayoutParams\.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES/);
  assert.match(main, /hide\(WindowInsetsCompat\.Type\.systemBars\(\)\)/, 'durum/gezinme çubukları gizlenmiyor');
  assert.match(main, /BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/, 'çubuklar kaydırınca geçici görünmeli');
  assert.match(main, /onWindowFocusChanged[\s\S]*?hideSystemBars\(\)/, 'odak dönünce çubuklar yeniden gizlenmiyor');
  // çentik payı sayfaya gerçek ölçüyle iletilir
  assert.match(main, /Type\.displayCutout\(\)/);
  assert.match(main, /SafeArea\.set\(/);
  assert.match(main, /return WindowInsetsCompat\.CONSUMED/, 'tüketilmezse WebView kendi kenar boşluğunu ekler');
});

test('setImmersive artık yalnız yönü değiştirir (tam ekran uygulama genelinde ayarlı)', () => {
  const m = kaynak.match(/public void setImmersive[\s\S]*?\n    }\n/);
  assert.ok(m, 'setImmersive bulunamadı');
  assert.match(m[0], /setRequestedOrientation/);
  assert.doesNotMatch(m[0], /WindowCompat|layoutInDisplayCutoutMode/, 'çentik/çubuk ayarı tekrar buraya taşınmış');
});

test('çentik payı eklenti üzerinden sayfaya gider: getInsets + "insets" olayı', () => {
  assert.match(kaynak, /public void getInsets\(/);
  assert.match(kaynak, /SafeArea\.listen\([\s\S]*?notifyListeners\("insets"/);
  const safe = oku('SafeArea.java');
  assert.match(safe, /static void set\(int l, int t, int r, int b\)/);
});

test('çoklu ekran: her kutu ayrı oynatıcı, yalnız seçili kutu sesli, sesli kutu odak almaz', () => {
  for (const ad of ['multiPlay', 'multiRect', 'multiMute', 'multiStop', 'multiStopAll']) {
    assert.match(kaynak, new RegExp('public void ' + ad + '\\('), ad + ' yok');
  }
  assert.match(kaynak, /setVolume\(/, 'kutu sesi kapatılamıyor');
  assert.match(kaynak, /notifyListeners\("multi"/, 'kutu olayları sayfaya bildirilmiyor');
  // eklenti kapanınca tüm kutu oynatıcıları bırakılmalı (sızıntı olmasın)
  assert.match(kaynak, /handleOnDestroy[\s\S]*?stopAllSlots\(\)/);
});

test('uygulama içi güncelleme: APK yalnız kendi önbellek klasöründen kurulur, izin ve dosya sağlayıcı tanımlı', () => {
  const m = kaynak.match(/public void installApk[\s\S]*?\n    }\n/);
  assert.ok(m, 'installApk bulunamadı');
  assert.match(m[0], /getCanonicalPath\(\)\.startsWith\(dirPath\)/, 'yol kısıtı yok: rastgele dosya kurulabilirdi');
  assert.match(m[0], /canRequestPackageInstalls\(\)[\s\S]*ACTION_MANAGE_UNKNOWN_APP_SOURCES/);
  assert.match(m[0], /application\/vnd\.android\.package-archive/);
  assert.match(m[0], /getPackageName\(\) \+ "\.fileprovider"/);
  const manifest = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /REQUEST_INSTALL_PACKAGES/, 'kurulum izni yok');
  assert.match(manifest, /\$\{applicationId\}\.fileprovider/);
  assert.match(kaynak, /downloadApk[\s\S]*apkProgress/);
});

test('derleme akışı her sürümde version.json yayınlıyor (uygulama içi güncelleme buna bakar)', () => {
  const wf = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../.github/workflows/build-apk.yml'), 'utf8');
  assert.match(wf, /version\.json/);
  assert.match(wf, /gh release create latest iptv-oynatici\.apk version\.json/);
  assert.match(wf, /versionCode:\$code/);
});

test('Java eklentisindeki her @PluginMethod, köprü sarmalayıcısında (bridge.js) da tanımlı', () => {
  const metotlar = [...kaynak.matchAll(/@PluginMethod\s+public void (\w+)\(/g)].map((m) => m[1]);
  assert.ok(metotlar.length >= 10, 'eklenti metotları bulunamadı');
  const win = { Capacitor: { isNativePlatform: () => true, nativePromise: async () => ({}), addListener: () => ({}) } };
  const js = nativePlugin('IptvPlayer', win);
  const eksik = metotlar.filter((m) => typeof js[m] !== 'function');
  assert.deepEqual(eksik, [], 'bridge.js\'de eksik metotlar (cihazda "is not a function" hatası verir)');
});
