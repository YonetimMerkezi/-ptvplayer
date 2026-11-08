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

test('tam ekranda pencere çentik alanına da çiziyor (yoksa Doldur/Yakınlaştır kenarda şerit bırakır)', () => {
  const m = kaynak.match(/public void setImmersive[\s\S]*?\n    }\n/);
  assert.ok(m, 'setImmersive bulunamadı');
  assert.match(m[0], /layoutInDisplayCutoutMode\s*=\s*on[\s\S]*?LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES[\s\S]*?LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT/);
  assert.match(m[0], /Build\.VERSION\.SDK_INT\s*>=\s*28/);
});

test('Java eklentisindeki her @PluginMethod, köprü sarmalayıcısında (bridge.js) da tanımlı', () => {
  const metotlar = [...kaynak.matchAll(/@PluginMethod\s+public void (\w+)\(/g)].map((m) => m[1]);
  assert.ok(metotlar.length >= 10, 'eklenti metotları bulunamadı');
  const win = { Capacitor: { isNativePlatform: () => true, nativePromise: async () => ({}), addListener: () => ({}) } };
  const js = nativePlugin('IptvPlayer', win);
  const eksik = metotlar.filter((m) => typeof js[m] !== 'function');
  assert.deepEqual(eksik, [], 'bridge.js\'de eksik metotlar (cihazda "is not a function" hatası verir)');
});
