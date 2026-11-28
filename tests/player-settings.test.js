import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativePlugin } from '../www/js/bridge.js';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const java = (ad) => readFileSync(join(kok, 'android/app/src/main/java/com/koruk/iptv', ad), 'utf8');
const plugin = java('IptvPlayerPlugin.java');

test('diyalog vurgulama ve oynatma hızı: yöntemler Java\'da ve köprüde', () => {
  const pl = nativePlugin('IptvPlayer', { Capacitor: { isNativePlatform: () => true, nativePromise() {}, addListener() {} } });
  for (const m of ['setDialogBoost', 'setSpeed']) {
    assert.match(plugin, new RegExp('public void ' + m + '\\('), m + ' Java\'da yok');
    assert.equal(typeof pl[m], 'function', m + ' köprüde yok');
  }
  assert.match(plugin, /optBoolean\("dialog", dialogOn\)/, 'play çağrısı diyalog durumunu almalı');
  assert.match(plugin, /dialogProc\.setOn\(on\);\s*player\.seekTo\(player\.getCurrentPosition\(\)\)/, 'takılı işlemciye durum anında uygulanır (sarma ile)');
  assert.match(plugin, /Math\.max\(0\.25, Math\.min\(3\.0,/, 'hız sınırlanmalı');
  assert.match(plugin, /if \(!keepRec\) speedReq = 1f;/, 'yeni içerik normal hızda başlamalı, yeniden bağlanmada hız korunmalı');
  assert.match(plugin, /if \(reuse \|\| speedReq != 1f\) player\.setPlaybackSpeed\(speedReq\);/, 'yeniden kurulan ya da yeniden kullanılan oynatıcı hızı korumalı');
});

test('diyalog işlemcisi: yalnız PCM 16 bit, durum her sarmada okunur, 3+ kanalda orta kanal öne çıkar', () => {
  const isl = java('DialogueAudioProcessor.java');
  assert.match(isl, /C\.ENCODING_PCM_16BIT\) return AudioProcessor\.AudioFormat\.NOT_SET/, 'PCM 16 bit dışında ses olduğu gibi geçmeli');
  assert.match(isl, /protected void onFlush\(\)[\s\S]*?new DialogueEnhancer\(/, 'durum her sarmada yeniden okunmalı');
  const dsp = java('DialogueEnhancer.java');
  assert.match(dsp, /if \(c == 2\) s\[c\] = presence\(s\[c\]\) \* CENTER_GAIN/, 'orta kanal vurgulanmalı');
  assert.match(dsp, /v > 32767\.0\) return 32767/, 'taşma kırpılmalı');
});
