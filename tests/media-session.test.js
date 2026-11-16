// Kilit ekranı / bildirim medya kontrolleri: JS tarafı sözleşmesi ve Java tarafı bilinen tuzaklar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNativeEngine, createWebEngine } from '../www/js/engine.js';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const oku = (yol) => readFileSync(join(kok, yol), 'utf8');
const JAVA = 'android/app/src/main/java/com/koruk/iptv/';
const servis = oku(JAVA + 'AudioKeepAliveService.java');
const eklenti = oku(JAVA + 'IptvPlayerPlugin.java');

test('motor: müzik bayrağı ve önceki/sonraki yerel eklentiye iletilir', async () => {
  const sent = [];
  const plugin = { addListener: async () => ({ remove() {} }), play: async (a) => sent.push(a) };
  const eng = createNativeEngine(plugin, () => {});
  await new Promise((r) => setTimeout(r, 0));
  await eng.load({ url: 'm', audioOnly: true, canPrev: true, canNext: true, bgAudio: true, title: 'Şarkı' });
  assert.equal(sent[0].audioOnly, true);
  assert.equal(sent[0].canPrev, true);
  assert.equal(sent[0].canNext, true);
  await eng.load({ url: 'v' });
  assert.equal(sent[1].audioOnly, false, 'video varsayılanda müzik sayılmaz');
  assert.equal(sent[1].canPrev, false);
  assert.equal(sent[1].canNext, false);
});

test('motor: mediaCmd olayı dinlenir, tarayıcı motorunda boş kalır', async () => {
  const dinlenen = [];
  const plugin = { addListener: async (ad, fn) => (dinlenen.push(ad), { remove() {} }), play: async () => {} };
  const eng = createNativeEngine(plugin, () => {});
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(typeof eng.onMediaCmd, 'function');
  await eng.onMediaCmd(() => {});
  assert.ok(dinlenen.includes('mediaCmd'));
  const web = createWebEngine({ video: { addEventListener() {}, getAttribute() {} }, Hls: null, on: () => {} });
  assert.equal(typeof web.onMediaCmd, 'function');
  assert.equal(typeof web.onMediaCmd(() => {}).remove, 'function');
});

test('arayüz: mediaCmd next/prev/close bağlı, canlı TV hariç; müzikte PiP düğmesi gizli', () => {
  const ui = oku('www/js/player-ui.js');
  assert.match(ui, /engine\.onMediaCmd\(/);
  assert.match(ui, /act === 'next'\) go\(1\)/);
  assert.match(ui, /go\(-1\)/);
  assert.match(ui, /act === 'close'/);
  assert.match(ui, /kind === 'live'\) return; \/\/ canlı TV/);
  assert.match(ui, /item && item\.audio/);
  const app = oku('www/js/app.js');
  assert.match(app, /audioOnly: !!item\.audio/);
  assert.match(app, /item\.kind !== 'live' && !ctx\.movie/, 'önceki/sonraki canlı TV ve önerilen filmlerde yok');
});

test('servis: MediaSession, MediaStyle ve dört düğme + tüm geri çağırmalar', () => {
  assert.match(servis, /new MediaSession\(/);
  assert.match(servis, /Notification\.MediaStyle\(\)\.setMediaSession/);
  for (const m of ['onPlay', 'onPause', 'onSkipToNext', 'onSkipToPrevious', 'onSeekTo', 'onStop']) assert.match(servis, new RegExp(`public void ${m}\\(`), m);
  for (const a of ['MEDIA_PLAY', 'MEDIA_PAUSE', 'MEDIA_NEXT', 'MEDIA_PREV', 'MEDIA_CLOSE']) assert.match(servis, new RegExp(a));
  assert.match(servis, /FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK/);
  assert.match(servis, /PlaybackState\.Builder/);
  assert.match(servis, /MediaMetadata\.Builder/);
  assert.match(servis, /METADATA_KEY_DURATION/);
});

test('servis: temizlik — oturum bırakılır, bildirim iptal edilir, kaydırınca kapanır', () => {
  assert.match(servis, /session\.release\(\)/);
  assert.match(servis, /nm\.cancel\(ID\)/);
  assert.match(servis, /setDeleteIntent\(actionIntent\(ACT_CLOSE/);
  assert.match(servis, /stopForeground\(true\)/);
});

test('servis: bildirim izni yoksa ses etkilenmez (hepsi RuntimeException korumalı)', () => {
  assert.ok((servis.match(/catch \(RuntimeException/g) || []).length >= 4);
});

test('servis: ek bağımlılık yok (media3-session eklenmedi)', () => {
  assert.ok(!/media3-session/.test(oku('android/app/build.gradle')));
  assert.ok(!/androidx\.media3\.session/.test(servis + eklenti));
});

test('eklenti: müzikte PiP kapalı, oturum koşulsuz kapanır, komutlar bağlı', () => {
  assert.match(eklenti, /if \(audioOnly\) return false;/, 'pipWanted müzikte false');
  assert.match(eklenti, /Müzikte resim içinde resim yok/);
  const destroy = eklenti.slice(eklenti.indexOf('protected void handleOnDestroy()'));
  assert.match(destroy.slice(0, 400), /endSession\(\);/);
  assert.match(eklenti, /public static boolean mediaCommand\(/);
  for (const c of ['close', 'play', 'pause', 'seek', 'next', 'prev']) assert.match(eklenti, new RegExp(`"${c}"`), c);
  assert.match(eklenti, /notifyListeners\("mediaCmd"/);
  assert.match(eklenti, /AUDIO_CONTENT_TYPE_MUSIC/);
});

test('eklenti: oturum yalnız arka plan sesine değil müziğe de bağlı; video için yalnız bgAudio', () => {
  assert.match(eklenti, /if \(audioBg \|\| audioOnlyReq\) startSession\(/);
  assert.match(eklenti, /navPrev = prevReq && !live;/, 'canlıda önceki/sonraki yok');
});

test('düzeltmeler "KÖK NEDEN DÜZELTMESİ" yorumuyla işaretli', () => {
  assert.ok((servis.match(/KÖK NEDEN DÜZELTMESİ/g) || []).length >= 3);
  assert.ok((eklenti.match(/KÖK NEDEN DÜZELTMESİ/g) || []).length >= 4);
});

test('manifest: ön plan hizmeti türü ve izinler değişmedi', () => {
  const m = oku('android/app/src/main/AndroidManifest.xml');
  assert.match(m, /android:name="\.AudioKeepAliveService"[\s\S]*?foregroundServiceType="mediaPlayback"/);
  assert.match(m, /FOREGROUND_SERVICE_MEDIA_PLAYBACK/);
  assert.match(m, /POST_NOTIFICATIONS/);
});
