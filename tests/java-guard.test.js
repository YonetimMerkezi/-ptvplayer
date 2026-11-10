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
  // ses var görüntü yok teşhisi: ilk kare, görüntü izi ve çözücü bilgisi sayfaya bildirilir; küçük kutuda çözünürlük sınırlanır
  assert.match(kaynak, /onRenderedFirstFrame\(\)[\s\S]*?"frame"/, 'ilk görüntü karesi bildirilmiyor');
  assert.match(kaynak, /C\.TRACK_TYPE_VIDEO[\s\S]*?"video"/, 'görüntü izi bildirilmiyor');
  assert.match(kaynak, /onVideoDecoderInitialized/, 'çözücü adı alınmıyor');
  assert.match(kaynak, /setViewportSize\(/, 'kutu için çözünürlük sınırı yok');
  assert.match(kaynak, /setEnableDecoderFallback\(true\)/, 'yedek çözücü kapalı');
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

// ---- TV kumandası ----
const javaDizin = join(dirname(fileURLToPath(import.meta.url)), '../android/app/src/main/java/com/koruk/iptv/');
const androidDizin = join(dirname(fileURLToPath(import.meta.url)), '../android/app/src/main/');
const oku_ = (f) => readFileSync(join(javaDizin, f), 'utf8');

test('TV kumandası: MainActivity kanal/medya tuşlarını sayfaya iletir ve WebView\'i odakta tutar', () => {
  const main = oku_('MainActivity.java');
  assert.match(main, /public boolean dispatchKeyEvent\(KeyEvent/);
  assert.match(main, /RemoteKeys\.nameOf\([\s\S]*?RemoteKeys\.send\(/);
  assert.match(main, /ACTION_DOWN/, 'tuş yalnız basılırken iletilmeli (bırakılırken ikinci olay olmasın)');
  assert.match(main, /requestFocus\(\)/);
  assert.match(main, /onWindowFocusChanged[\s\S]*?focusWebView\(\)/, 'pencere odağı dönünce WebView yeniden odaklanmalı');
  assert.match(kaynak, /RemoteKeys\.listen\([\s\S]*?notifyListeners\("remote"/);
  assert.match(kaynak, /public void isTv\(/);
});

test('kumanda tuşları: sayfanın dinlediği her ad yerelde üretilir ve yerelin ürettiği her ad sayfada işlenir', () => {
  const rk = oku_('RemoteKeys.java');
  const yerel = new Set([...rk.matchAll(/return "(\w+)";/g)].map((m) => m[1]));
  const ui = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../www/js/player-ui.js'), 'utf8');
  for (const ad of ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'MediaTrackNext', 'MediaTrackPrevious', 'ChannelUp', 'ChannelDown']) {
    assert.ok(yerel.has(ad), `${ad} yerelde üretilmiyor`);
  }
  const uzaktan = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../www/js/remote.js'), 'utf8');
  assert.ok(ui.includes('colorOf(k)'), 'renkli tuşlar oynatıcıda remote.js üzerinden işlenmeli');
  for (const ad of yerel) {
    if (ad === 'ContextMenu') continue; // henüz bir işlevi yok
    if (ad.startsWith('ColorF')) assert.ok(uzaktan.includes(`'${ad}'`), `${ad} remote.js'te atanabilir renkler arasında yok`);
    else assert.ok(ui.includes(`'${ad}'`), `${ad} oynatıcı arayüzünde işlenmiyor`);
  }
});

test('Android TV ana ekranı ve sesli arama: manifest, bağımlılık, köprü ve eklenti yöntemleri birbirini tutar', () => {
  const manifest_ = readFileSync(join(androidDizin, 'AndroidManifest.xml'), 'utf8');
  assert.match(manifest_, /com\.android\.providers\.tv\.permission\.WRITE_EPG_DATA/, 'Watch Next yazma izni yok');
  assert.match(manifest_, /<data android:scheme="iptvpro" android:host="play" \/>/, 'iptvpro://play bağlantısı manifestte yok');
  assert.match(manifest_, /android\.speech\.action\.RECOGNIZE_SPEECH/, 'Android 11+ için sesli arama sorgu izni yok');
  const gradle = readFileSync(join(androidDizin, '../../../app/build.gradle'), 'utf8');
  assert.match(gradle, /androidx\.tvprovider:tvprovider/, 'tvprovider bağımlılığı yok');
  for (const ad of ['tvSyncWatchNext', 'voiceSearch', 'planLaunch']) {
    assert.match(kaynak, new RegExp(`public void ${ad}\\(`), `${ad} eklentide yok`);
  }
  assert.match(kaynak, /@ActivityCallback\s+private void voiceResult/, 'sesli arama sonucu ActivityCallback ile alınmalı');
  assert.match(kaynak, /startActivityForResult\(call, \w+, "voiceResult"\)/);
  const tv = oku_('TvHome.java');
  assert.match(tv, /WATCH_NEXT_TYPE_CONTINUE/);
  assert.match(tv, /WatchNextPrograms\.CONTENT_URI/);
  assert.match(tv, /\.delete\(/, 'eski satırlar silinmeden her eşitlemede yinelenir');
});

test('TV modu: setTvMode yatay kilitler; oynatıcıdan çıkınca da kilit sürer; ana ekranda çift geri tuşuyla çıkılır', () => {
  const m = kaynak.match(/public void setTvMode[\s\S]*?\n    }\n/);
  assert.ok(m, 'setTvMode bulunamadı');
  assert.match(m[0], /SCREEN_ORIENTATION_SENSOR_LANDSCAPE/);
  assert.match(m[0], /SCREEN_ORIENTATION_UNSPECIFIED/);
  const imm = kaynak.match(/public void setImmersive[\s\S]*?\n    }\n/)[0];
  assert.match(imm, /\|\| tvMode/, 'TV modunda oynatıcıdan çıkınca yön serbest kalmamalı');
  const main = oku_('MainActivity.java');
  assert.match(main, /web\.canGoBack\(\)[\s\S]*?web\.goBack\(\)/, 'geri tuşu önce sayfa geçmişinde gitmeli');
  assert.match(main, /IptvPlayerPlugin\.tvMode[\s\S]*?lastBackAt[\s\S]*?Toast/, 'TV\'de ilk geri basışı uyarı vermeli');
});

test('Android TV bildirimi: kumanda başlatıcısı, afiş, dokunmatik ve leanback zorunlu değil, oynatıcı görünümü odak almaz', () => {
  const manifest_ = readFileSync(join(androidDizin, 'AndroidManifest.xml'), 'utf8');
  assert.match(manifest_, /LEANBACK_LAUNCHER/);
  assert.match(manifest_, /android:banner="@drawable\/tv_banner"/);
  assert.match(manifest_, /hardware\.touchscreen"\s+android:required="false"/);
  assert.match(manifest_, /software\.leanback"\s+android:required="false"/);
  assert.ok(readFileSync(join(androidDizin, 'res/drawable/tv_banner.png')).length > 1000, 'afiş boş');
  const layout = readFileSync(join(androidDizin, 'res/layout/iptv_player_view.xml'), 'utf8');
  assert.match(layout, /android:focusable="false"/, 'yerel görünüm odağı çalarsa yön tuşları WebView\'e ulaşmaz');
});

test('yayın kaydı: yalnız ana oynatıcı kayda yazar, çıkışta/yeni yayında kayıt kapanır, liste (m3u8) kayda girmez', () => {
  assert.match(kaynak, /buildExo\(headers, true, loadControlFor\(buffer\), true, true\)/, 'ana oynatıcı kayıt katmanıyla kurulmalı');
  assert.match(kaynak, /buildExo\(headers, false, [\s\S]*?\.build\(\), false, false\)/, 'çoklu ekran kutuları kayda yazmamalı ve ses gecikmesi almamalı');
  assert.match(kaynak, /public void stop\(final PluginCall call\)[\s\S]*?StreamRecorder\.stop\(null\)/, 'oynatıcı kapanınca kayıt bitmeli');
  assert.match(kaynak, /if \(!keepRec\) StreamRecorder\.stop\(null\)/, 'başka yayına geçilince kayıt bitmeli');
  assert.match(kaynak, /handleOnDestroy\(\)[\s\S]*?StreamRecorder\.stop\(null\)/, 'uygulama kapanınca kayıt dosyası düzgün kapanmalı');
  assert.match(kaynak, /new DefaultDataSource\.Factory\(getContext\(\), http\)/, 'kayıt dosyaları (file://) açılabilmeli');
  const tap = oku('TapDataSource.java');
  assert.match(tap, /m3u8/);
  assert.match(tap, /mpegurl/);
  assert.match(tap, /catch \(RuntimeException/, 'kayıt hatası oynatmayı bozmamalı');
  const manifest = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /android\.permission\.WAKE_LOCK/);
});

test('yayın kaydı yöntemleri köprüde de var', () => {
  const pl = nativePlugin('IptvPlayer', { Capacitor: { isNativePlatform: () => true, nativePromise() {}, addListener() {} } });
  for (const m of ['recordStart', 'recordStop', 'recordList', 'recordDelete']) {
    assert.match(kaynak, new RegExp(`public void ${m}\\(`), `${m} Java'da yok`);
    assert.equal(typeof pl[m], 'function', `${m} köprüde yok`);
  }
});

test('telefondan TV\'ye oynatma: yöntemler köprüde, sunucu eşleşmesiz isteği ve yanlış kod denemelerini reddeder', () => {
  const pl = nativePlugin('IptvPlayer', { Capacitor: { isNativePlatform: () => true, nativePromise() {}, addListener() {} } });
  for (const m of ['castStart', 'castStop', 'castInfo', 'castPairOpen', 'castPairClose', 'castUnpair', 'castNow', 'castDiscover', 'castRequest']) {
    assert.match(kaynak, new RegExp(`public void ${m}\\(`), `${m} Java'da yok`);
    assert.equal(typeof pl[m], 'function', `${m} köprüde yok`);
  }
  const sunucu = oku('CastServer.java');
  // oynat, komut, durum ve eşleşme kaldırma token ister
  for (const yol of ['GET /state', 'POST /play', 'POST /cmd', 'POST /unpair']) {
    const i = sunucu.indexOf(`case "${yol}"`);
    assert.ok(i > 0, `${yol} yok`);
    assert.match(sunucu.slice(i, i + 220), /!authed\) return response\(401/, `${yol} token denetimsiz`);
  }
  assert.match(sunucu, /MAX_PAIR_FAILS = 5/);
  assert.match(sunucu, /pairFails\.incrementAndGet\(\) >= MAX_PAIR_FAILS\) pairCode = null/, 'çok yanlış denemede kod iptal edilmeli');
  assert.match(sunucu, /MessageDigest\.isEqual/, 'kod sabit zamanlı karşılaştırılmalı');
  assert.match(sunucu, /pairCode = null;\s*persist\(\)/, 'kod tek kullanımlık olmalı');
  assert.match(sunucu, /MAX_BODY = 64 \* 1024/);
  assert.doesNotMatch(sunucu, /Access-Control-Allow-Origin/, 'web sayfalarının erişimine açılmamalı (CORS yok)');
  const istemci = oku('CastClient.java');
  assert.match(istemci, /if \(!isLanHost\(host\)\) return new Response/, 'yalnız yerel ağ adreslerine istek atılmalı');
  assert.match(kaynak, /case "stop":[\s\S]*?"castStop"/);
  assert.match(kaynak, /o\.optJSONArray\("targets"\) == null/, 'adressiz oynatma isteği reddedilmeli');
  assert.match(kaynak, /handleOnDestroy\(\)[\s\S]*?cast\.stop\(\)/, 'uygulama kapanınca alıcı kapanmalı');
  const manifest = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /android\.permission\.CHANGE_WIFI_MULTICAST_STATE/, 'TV\'nin UDP ile bulunması için çoklu yayın kilidi izni');
  assert.match(kaynak, /holdMulticast\(false\)/, 'alıcı kapanınca çoklu yayın kilidi bırakılmalı');
});

test('ses senkronu: yöntem köprüde, yalnız ana oynatıcıda ses işlemcisi, gecikmede kodlu geçiş kapalı, sınırlar', () => {
  const pl = nativePlugin('IptvPlayer', { Capacitor: { isNativePlatform: () => true, nativePromise() {}, addListener() {} } });
  assert.match(kaynak, /public void setAudioDelay\(/, 'setAudioDelay Java\'da yok');
  assert.equal(typeof pl.setAudioDelay, 'function', 'setAudioDelay köprüde yok');
  assert.match(kaynak, /optInt\("audioDelay", audioDelayMs\)/, 'play çağrısı gecikmeyi almalı');
  assert.match(kaynak, /if \(delay && \(audioDelayMs != 0 \|\| NightCompressor\.isActive\(nightLevel\)\)\)/, 'ses işlemcisi yalnız gecikme ya da gece modu varken ve ana oynatıcıda takılmalı');
  assert.match(kaynak, /new DefaultAudioSink\.Builder\(\)[\s\S]*?setAudioProcessors\(new AudioProcessor\[\] \{proc, night\}\)/, 'gecikme ve gece modu PCM ister: kodlu geçiş açık bırakılmamalı');
  assert.match(kaynak, /Math\.max\(-1000, Math\.min\(2000, ms\)\)/, 'gecikme sınırlanmalı');
  assert.match(kaynak, /private void releasePlayer\(\) \{\s*delayProc = null;\s*nightProc = null;/, 'oynatıcı bırakılınca işlemci referansları da bırakılmalı');
  const islemci = oku('AudioDelayProcessor.java');
  assert.match(islemci, /C\.ENCODING_PCM_16BIT\) return AudioProcessor\.AudioFormat\.NOT_SET/, 'PCM 16 bit dışında ses olduğu gibi geçmeli');
  assert.match(islemci, /protected void onFlush\(\)[\s\S]*?core\.reset\(/, 'değer her sarmada yeniden okunmalı');
});

test('gece modu ve altyazı görünümü: yöntemler köprüde, düzey her açılışta iletilir, işlemci yalnız PCM 16 bitle çalışır', () => {
  const pl = nativePlugin('IptvPlayer', { Capacitor: { isNativePlatform: () => true, nativePromise() {}, addListener() {} } });
  for (const m of ['setNightMode', 'setSubtitleStyle']) {
    assert.match(kaynak, new RegExp('public void ' + m + '\\('), m + ' Java\'da yok');
    assert.equal(typeof pl[m], 'function', m + ' köprüde yok');
  }
  assert.match(kaynak, /optString\("night", nightLevel\)/, 'play çağrısı gece modu düzeyini almalı');
  assert.match(kaynak, /"light"\.equals\(v\) \|\| "medium"\.equals\(v\) \|\| "strong"\.equals\(v\)/, 'bilinmeyen düzey kapalı sayılmalı');
  assert.match(kaynak, /nightProc\.setLevel\(level\);\s*player\.seekTo\(player\.getCurrentPosition\(\)\)/, 'takılı işlemciye düzey anında uygulanır (sarma ile)');
  assert.match(kaynak, /subStyle = call\.getData\(\);/);
  assert.match(kaynak, /playerView\.setVisibility\(View\.VISIBLE\);\s*applySubStyle\(\);/, 'altyazı görünümü her açılışta uygulanmalı');
  assert.match(kaynak, /sv\.setApplyEmbeddedStyles\(false\)/, 'yayının kendi altyazı stili kullanıcı seçimini ezmemeli');
  const isl = oku('NightAudioProcessor.java');
  assert.match(isl, /C\.ENCODING_PCM_16BIT\) return AudioProcessor\.AudioFormat\.NOT_SET/, 'PCM 16 bit dışında ses olduğu gibi geçmeli');
  assert.match(isl, /protected void onFlush\(\)[\s\S]*?NightCompressor\.isActive\(l\)/, 'düzey her sarmada yeniden okunmalı');
  const core = oku('NightCompressor.java');
  assert.match(core, /softClip/, 'tepe değerler yumuşak sınırlanmalı');
  assert.match(core, /GATE_LO/, 'gürültü tabanı yükseltilmemeli');
});

test('veri eşitleme: sunucu /sync yolu yalnız eşleşmiş telefondan, büyük gövde yalnız /sync için; uygulama yanıtı beklenir', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const server = readFileSync(join(here, '../android/app/src/main/java/com/koruk/iptv/CastServer.java'), 'utf8');
  const plugin = kaynak;
  const bridge = readFileSync(join(here, '../www/js/bridge.js'), 'utf8');
  assert.match(server, /case "POST \/sync": \{\s*if \(!authed\) return response\(401/, '/sync token ister');
  assert.match(server, /"\/sync"\.equals\(r\.path\) && tk != null && tokens\.containsKey\(tk\)/, 'büyük gövde yalnız eşleşmiş telefondan');
  assert.match(server, /len > \(bigOk \? MAX_SYNC_BODY : MAX_BODY\)/);
  assert.match(plugin, /q\.poll\(25, TimeUnit\.SECONDS\)/, 'yanıt zaman aşımıyla beklenir');
  assert.match(plugin, /notifyListeners\("castSync", o\)/);
  assert.match(plugin, /syncWaiting\.remove\(id\)/, 'bekleyen kayıt her durumda temizlenir');
  assert.match(plugin, /Math\.min\(30000, d\.optInt\("timeoutMs", 4000\)\)/, 'eşitleme isteği için uzun zaman aşımı');
  assert.match(bridge, /castSyncReply: call\('castSyncReply'\)/);
});

test('çevrimdışı indirme: hizmet bildirimli ön plan (dataSync), tek iş parçacığı, kaldığı yerden devam, minSdk 22 uyumlu', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const manifest = readFileSync(join(here, '../android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /<service\s+android:name="\.DownloadService"\s+android:exported="false"\s+android:foregroundServiceType="dataSync"/, 'indirme hizmeti manifestte yok');
  assert.match(manifest, /FOREGROUND_SERVICE_DATA_SYNC/);
  const hizmet = oku('DownloadService.java');
  assert.match(hizmet, /startForeground\(Notifier\.DL_ID, n, ServiceInfo\.FOREGROUND_SERVICE_TYPE_DATA_SYNC\)/, 'ön plan türü manifestle uyuşmuyor');
  assert.match(hizmet, /if \(!Downloads\.claim\(\)\) return/, 'ikinci iş parçacığı başlatılmamalı (sağlayıcı bağlantı sınırı)');
  assert.match(hizmet, /if \(!Downloads\.busy\(\)\)[\s\S]*?stopSelf\(\)/, 'iş kalmayınca hizmet kapanmalı');
  const d = oku('Downloads.java');
  assert.match(d, /"Range", "bytes=" \+ from \+ "-"/, 'kaldığı yerden devam (Range) yok');
  assert.match(d, /"Accept-Encoding", "identity"/, 'sıkıştırma Content-Length/Range bilgisini bozar');
  assert.match(d, /code == 206[\s\S]*?cr\[0\] != have/, '206 yanıtının başlangıcı doğrulanmalı');
  assert.match(d, /code == 416/, 'aralık reddi (416) işlenmeli');
  assert.match(d, /renameTo\(fin\)/, 'tamamlanınca .part → son ad');
  assert.doesNotMatch(d, /getContentLengthLong|java\.nio\.file/, 'minSdk 22: API 24+/26+ çağrıları kullanılamaz');
  assert.match(d, /endsWith\("\.m3u8"\)/, 'm3u8 (canlı/parçalı) indirilemez');
  assert.match(d, /notMedia\(type\)/, 'HTML/JSON yanıtı video diye kaydedilmemeli');
  assert.match(d, /isActiveNetworkMetered\(\)/, 'yalnız Wi-Fi seçeneği kotalı ağı denetlemeli');
  assert.match(d, /DOWNLOADING\.equals\(j\.state\)\) j\.state = QUEUED/, 'yarım kalan indirme açılışta sıraya dönmeli');
  // hızlı (çok bağlantılı) indirme
  assert.match(d, /"Range", "bytes=" \+ from \+ "-" \+ to/, 'parça isteği Range aralığıyla yapılmalı');
  assert.match(d, /static volatile int fastConns = 4/, 'varsayılan bağlantı sayısı 4');
  assert.match(d, /j\.fast && code == 206 && have == 0/, 'hızlı yöntem yalnız sunucu Range verince (206) başlar');
  assert.match(d, /r\.rejected = true/, 'fazla bağlantı reddedilirse tek bağlantıya düşmeli');
  assert.match(d, /if \(r\.rejected\) conns = 1/, 'reddedilince kalan parçalar tek bağlantıyla inmeli');
  assert.match(d, /cr\[2\] > 0 && cr\[2\] != total/, 'sunucudaki dosya değiştiyse parçalar birleştirilmemeli');
  assert.match(d, /resetSegs\(app, j, part, false\)[\s\S]*?FR_RESET/, 'tutarsız parça bilgisinde hızlı yöntem bırakılıp baştan başlanmalı (sonsuz döngü yok)');
  assert.match(d, /segsFromString/, 'parça ilerlemesi yan dosyadan okunmalı');
  assert.doesNotMatch(d, /ExecutorService|CompletableFuture/, 'minSdk 22: yalnız temel iş parçacıkları');
  // eklenti: olay + yöntemler, yok olurken dinleyici bırakılır
  assert.match(kaynak, /notifyListeners\("dlProgress", o\)/);
  assert.match(kaynak, /Downloads\.setListener\(null\)/);
  const bridge = readFileSync(join(here, '../www/js/bridge.js'), 'utf8');
  for (const m of ['dlStart', 'dlList', 'dlPause', 'dlPauseAll', 'dlResume', 'dlResumeAll', 'dlRemove']) {
    assert.match(kaynak, new RegExp('public void ' + m + '\\('), m + ' eklentide yok');
    assert.match(bridge, new RegExp(m + ": call\\('" + m + "'\\)"), m + ' köprüde yok');
  }
  const notifier = oku('Notifier.java');
  assert.match(notifier, /CH_DL/);
  assert.match(notifier, /setProgress\(100/);
});

test('metin paylaşımı (rapor, davet): yöntem eklentide ve köprüde, paylaşım menüsü yeni görevde açılır', () => {
  const m = /public void shareText\(final PluginCall call\) \{([\s\S]*?)\n    \}\n/.exec(kaynak);
  assert.ok(m, 'shareText eklentide yok');
  assert.match(m[1], /Intent\.ACTION_SEND/);
  assert.match(m[1], /setType\("text\/plain"\)/);
  assert.match(m[1], /EXTRA_TEXT/);
  assert.match(m[1], /FLAG_ACTIVITY_NEW_TASK/, 'etkinlik dışından açılan menü yeni görevde başlamalı');
  assert.match(m[1], /call\.reject/, 'hata kullanıcıya bildirilmeli');
  assert.match(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../www/js/bridge.js'), 'utf8'), /shareText: call\('shareText'\)/);
});
