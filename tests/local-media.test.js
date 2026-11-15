import test from 'node:test';
import assert from 'node:assert/strict';
import { localId, naturalCompare, cleanName, toLocalItem, buildPlaylist, LOCAL_SRC } from '../www/js/local-media.js';

test('localId: aynı adres aynı kimliği verir, farklı adres farklı', () => {
  assert.equal(localId('content://a/1'), localId('content://a/1'));
  assert.notEqual(localId('content://a/1'), localId('content://a/2'));
  assert.match(localId('x'), /^local:[0-9a-f]{8}$/);
  assert.equal(LOCAL_SRC, 'local');
});

test('naturalCompare: sayılar sayı gibi sıralanır', () => {
  const l = ['Bölüm 10', 'Bölüm 2', 'Bölüm 1'].sort(naturalCompare);
  assert.deepEqual(l, ['Bölüm 1', 'Bölüm 2', 'Bölüm 10']);
});

test('cleanName: bilinen uzantı atılır, boşsa varsayılan', () => {
  assert.equal(cleanName('Film.2020.mkv'), 'Film.2020');
  assert.equal(cleanName('notlar.txt'), 'notlar.txt');
  assert.equal(cleanName(''), 'Cihaz medyası');
  assert.equal(cleanName('.mp4'), 'Cihaz medyası');
});

test('toLocalItem: adres yoksa null, varsa yerel öğe', () => {
  assert.equal(toLocalItem(null), null);
  assert.equal(toLocalItem({ name: 'a' }), null);
  const it = toLocalItem({ uri: 'content://v/1', name: 'a.mp4', mime: 'video/mp4' });
  assert.equal(it.localMedia, true);
  assert.equal(it.url, 'content://v/1');
  assert.equal(it.id, localId('content://v/1'));
  assert.equal(it.name, 'a');
});

test('buildPlaylist: yinelenen atılır, doğal sıralanır', () => {
  const list = buildPlaylist([
    { uri: 'u10', name: 'Dizi E10.mkv' },
    { uri: 'u2', name: 'Dizi E2.mkv' },
    { uri: 'u2', name: 'Dizi E2.mkv' },
    { name: 'adressiz.mp4' },
    { uri: 'u1', name: 'Dizi E1.mkv' },
  ]);
  assert.deepEqual(list.map((x) => x.name), ['Dizi E1', 'Dizi E2', 'Dizi E10']);
  assert.deepEqual(buildPlaylist(null), []);
});
