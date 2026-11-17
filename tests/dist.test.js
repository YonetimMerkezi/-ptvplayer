// Dağıtım türü (Google Play / doğrudan APK): arayüzde Play'de olmaması gerekenler kapalı mı?
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPlay, loadDist, setDist } from '../www/js/dist.js';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(kok, 'www/js/app.js'), 'utf8');

test('loadDist: yalnız yerel taraf play:true derse Play sayılır; okunamazsa doğrudan', async () => {
  assert.equal((await loadDist({ distInfo: async () => ({ play: true }) })).play, true);
  assert.equal(isPlay(), true);
  assert.equal((await loadDist({ distInfo: async () => ({ play: false }) })).play, false);
  assert.equal((await loadDist({ distInfo: async () => ({ play: 'true' }) })).play, false, 'metin true sayılmaz');
  assert.equal((await loadDist({ distInfo: async () => ({}) })).play, false);
  assert.equal((await loadDist({ distInfo: async () => { throw new Error('yok'); } })).play, false);
  assert.equal((await loadDist({})).play, false, 'eski kabukta yöntem yok');
  assert.equal((await loadDist(null)).play, false, 'tarayıcıda eklenti yok');
  assert.equal(isPlay(), false);
  setDist({ play: true });
  assert.equal(isPlay(), true);
  setDist();
  assert.equal(isPlay(), false);
});

test('Play sürümünde güncelleme, yönetici paneli, davet kodu ve FFmpeg ayarı arayüzden kapanır', () => {
  assert.match(app, /await loadDist\(nativePlugin\)/, 'açılışta dağıtım türü okunmalı');
  assert.match(app, /async function checkForUpdate\([^)]*\) \{\s*if \(updBusy \|\| isPlay\(\)\) return;/, 'Play sürümü kendini güncellemez');
  assert.match(app, /function verTap\(\) \{[\s\S]*?if \(isPlay\(\)\) return;/, 'yönetici paneli Play sürümünde açılamaz');
  assert.match(app, /store\.pref\('adm\.on', false\) && !isPlay\(\)/, 'yönetici karosu Play sürümünde yok');
  assert.match(app, /\$\{isPlay\(\) \? '' : `<button class="set-tile" data-set="update">/, 'güncelleme karosu Play sürümünde yok');
  assert.match(app, /\$\{isPlay\(\) \? '' : '<button data-t="code">Kod<\/button>'\}/, 'davet kodu sekmesi Play sürümünde yok');
  assert.match(app, /async function refreshManaged\([^)]*\) \{\s*if \(isPlay\(\) \|\|/, 'davet kodlu listeler Play sürümünde eşitlenmez');
  assert.match(app, /nativePlugin && !isPlay\(\) \? `<div class="sel-row"><span>Yazılım ses çözücüsü/, 'FFmpeg ayarı Play sürümünde yok');
});
