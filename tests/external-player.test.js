// Harici oynatıcıya aktarma: MIME türü seçimi ve düzenli ifadelerde ters bölünün iki kez yazılması tuzağı.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { externalMime } from '../www/js/engine.js';

test('harici oynatıcı: HLS, DASH ve video türleri doğru MIME ile gider', () => {
  assert.equal(externalMime({ url: 'http://s/live/1.m3u8?token=a', mime: 'auto' }), 'application/vnd.apple.mpegurl');
  assert.equal(externalMime({ url: 'http://s/x', mime: 'hls' }), 'application/vnd.apple.mpegurl');
  assert.equal(externalMime({ url: 'http://s/a.mpd', mime: 'auto' }), 'application/dash+xml');
  assert.equal(externalMime({ url: 'http://s/a', mime: 'dash' }), 'application/dash+xml');
  assert.equal(externalMime({ url: 'http://s/film.mkv', mime: 'video/x-matroska' }), 'video/x-matroska');
  assert.equal(externalMime({ url: 'http://s/film.mp4', mime: 'auto' }), 'video/*');
  assert.equal(externalMime({ url: 'http://s/film.mp4' }), 'video/*');
  assert.equal(externalMime({ url: 'http://s/film.mp4', mime: 'VIDEO/MP4' }), 'VIDEO/MP4');
  assert.equal(externalMime({ url: 'content://t/doc1', mime: 'auto', audio: true }), 'audio/*', 'müzik: ses türü');
});

// /\\d/ gibi ters bölüsü iki kez yazılmış düzenli ifade harf "\" + "d" arar; /^video\\//i ise bölme işlemine dönüşüp
// "i is not defined" hatası verir. Düzenli ifade değişmezlerinde \\ yalnız karakter sınıfında ([\\/]) beklenir.
test('www/js: düzenli ifade değişmezlerinde çift ters bölü yok', () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../www/js');
  const bad = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'changelog.js')) {
    readFileSync(join(dir, f), 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\[\\\\\/\]/g, ''); // [\\/] (ters bölü ya da bölü) meşru
      if (/(^|[(\[{,;=:!&|? ])\/[^/*]*\\\\[.?/dwsDWS(|*+[\]]/.test(code)) bad.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});
