import test from 'node:test';
import assert from 'node:assert/strict';
import {
  kindOfName, buildIndex, listDir, crumbs, findSubtitle, searchIndex, recentAdded, playlistOf,
  lockKey, lockedBy, toggleLock, fmtSize, normalizeDavUrl, normalizeSmbHost, davRow, upnpRow, smbRow, sortRows, findSiblingSub,
} from '../www/js/local-library.js';
import * as L from '../www/js/local-library.js';

const rows = [
  { uri: 'u/1', name: 'Film A.mkv', kind: 'video', dir: 'Filmler', mod: 300 },
  { uri: 'u/2', name: 'Film A.tr.srt', kind: 'sub', dir: 'Filmler' },
  { uri: 'u/3', name: 'Film A.en.vtt', kind: 'sub', dir: 'Filmler' },
  { uri: 'u/4', name: 'Dizi E10.mp4', kind: 'video', dir: 'Diziler/Sezon 1', mod: 100 },
  { uri: 'u/5', name: 'Dizi E2.mp4', kind: 'video', dir: 'Diziler/Sezon 1', mod: 200 },
  { uri: 'u/6', name: 'Şarkı.mp3', kind: 'audio', dir: 'Müzik', mod: 50 },
  { uri: 'u/7', name: 'Tatil.jpg', kind: 'image', dir: 'Foto', mod: 400 },
  { uri: 'u/8', name: 'kök video.mp4', kind: 'video', dir: '', mod: 10 },
  { uri: 'u/9', name: 'notlar.txt', dir: '' },
  { name: 'adressiz.mp4', kind: 'video' },
];
const idx = buildIndex(rows, 'R1');

test('kindOfName: uzantı ve MIME', () => {
  assert.equal(kindOfName('a.MKV'), 'video');
  assert.equal(kindOfName('a.flac'), 'audio');
  assert.equal(kindOfName('a.JPG'), 'image');
  assert.equal(kindOfName('a.srt'), 'sub');
  assert.equal(kindOfName('adsiz', 'video/mp4'), 'video');
  assert.equal(kindOfName('a.txt'), '');
});

test('buildIndex: geçersiz ve ilgisiz satırlar atılır', () => {
  assert.equal(idx.length, 8);
  assert.ok(idx.every((f) => f.rootId === 'R1' && f.id.startsWith('local:')));
});

test('listDir: kökte klasörler sayımla, dosyalar doğal sırada', () => {
  const root = listDir(idx, '');
  assert.deepEqual(root.folders.map((f) => f.name), ['Diziler', 'Filmler', 'Foto', 'Müzik']);
  assert.equal(root.folders.find((f) => f.name === 'Diziler').count, 2);
  assert.deepEqual(root.files.map((f) => f.name), ['kök video.mp4']);
  const s = listDir(idx, 'Diziler/Sezon 1');
  assert.deepEqual(s.files.map((f) => f.title), ['Dizi E2', 'Dizi E10']);
  assert.equal(listDir(idx, 'Diziler').folders[0].path, 'Diziler/Sezon 1');
  assert.equal(listDir(idx, 'Filmler').files.length, 1); // altyazılar listelenmez
});

test('crumbs: üst klasör zinciri', () => {
  assert.deepEqual(crumbs('A/B/C').map((c) => c.path), ['A', 'A/B', 'A/B/C']);
  assert.deepEqual(crumbs(''), []);
});

test('findSubtitle: dil ekli altyazı bulunur, .srt .vtt\'ye tercih edilir', () => {
  const film = idx.find((f) => f.name === 'Film A.mkv');
  assert.equal(findSubtitle(idx, film).name, 'Film A.tr.srt');
  const dizi = idx.find((f) => f.name === 'Dizi E2.mp4');
  assert.equal(findSubtitle(idx, dizi), null);
  assert.equal(findSubtitle(idx, idx.find((f) => f.kind === 'audio')), null);
});

test('searchIndex: Türkçe duyarsız, tüm sözcükler, klasör adı dahil', () => {
  assert.deepEqual(searchIndex(idx, 'sarki').map((f) => f.name), ['Şarkı.mp3']);
  assert.deepEqual(searchIndex(idx, 'dizi e2').map((f) => f.name), ['Dizi E2.mp4']);
  assert.deepEqual(searchIndex(idx, 'sezon 1', { kinds: ['video'] }).length, 2);
  assert.deepEqual(searchIndex(idx, 'film', { allow: () => false }), []);
  assert.deepEqual(searchIndex(idx, '  '), []);
});

test('recentAdded: en yeni önce, tür süzgeci ve izin', () => {
  assert.deepEqual(recentAdded(idx).map((f) => f.name), ['Film A.mkv', 'Dizi E2.mp4', 'Dizi E10.mp4', 'kök video.mp4']);
  assert.deepEqual(recentAdded(idx, { kinds: ['image'] }).map((f) => f.name), ['Tatil.jpg']);
  assert.equal(recentAdded(idx, { limit: 2 }).length, 2);
  assert.equal(recentAdded(idx, { allow: (f) => f.dir === '' }).length, 1);
});

test('playlistOf: aynı klasör ve tür, doğal sıra, geçerli yer', () => {
  const files = listDir(idx, 'Diziler/Sezon 1').files;
  const cur = files.find((f) => f.name === 'Dizi E10.mp4');
  const pl = playlistOf(files, cur);
  assert.deepEqual(pl.items.map((f) => f.title), ['Dizi E2', 'Dizi E10']);
  assert.equal(pl.index, 1);
});

test('klasör kilidi: üst klasör kilidi alt klasörü de kapsar', () => {
  let locks = [];
  locks = toggleLock(locks, lockKey('R1', 'Diziler'));
  assert.equal(lockedBy(locks, 'R1', 'Diziler/Sezon 1'), 'R1|Diziler');
  assert.equal(lockedBy(locks, 'R1', 'Filmler'), '');
  assert.equal(lockedBy(locks, 'R2', 'Diziler'), '');
  locks = toggleLock(locks, lockKey('R1', ''));
  assert.equal(lockedBy(locks, 'R1', 'Filmler'), 'R1|');
  locks = toggleLock(toggleLock(locks, 'R1|'), 'R1|Diziler');
  assert.deepEqual(locks, []);
  assert.deepEqual(toggleLock(null, 'x'), ['x']);
});

test('fmtSize ve adres düzeltme', () => {
  assert.equal(fmtSize(1536), '2 KB');
  assert.equal(fmtSize(5 * 1048576), '5 MB');
  assert.equal(fmtSize(1610612736), '1,5 GB');
  assert.equal(fmtSize(0), '');
  assert.equal(normalizeDavUrl('nas.local:5005/video'), 'http://nas.local:5005/video/');
  assert.equal(normalizeDavUrl('https://x.org/a/'), 'https://x.org/a/');
  assert.equal(normalizeDavUrl(''), '');
  assert.equal(normalizeSmbHost('smb://192.168.1.5/paylasim'), '192.168.1.5');
  assert.equal(normalizeSmbHost(' NAS '), 'NAS');
});

test('ağ satırları: WebDAV, UPnP, SMB ortak biçime çevrilir', () => {
  const d = davRow({ name: 'a.mkv', url: 'http://h/a.mkv', dir: false, size: 5 }, 'Basic xx');
  assert.equal(d.kind, 'video');
  assert.deepEqual(d.headers, { Authorization: 'Basic xx' });
  assert.equal(davRow({ name: 'x.txt', url: 'http://h/x.txt' }), null);
  assert.equal(davRow({ name: 'K', url: 'http://h/K/', dir: true }).dir, true);
  assert.equal(upnpRow({ id: '5', name: 'Klasör', dir: true }).objectId, '5');
  assert.equal(upnpRow({ id: '6', name: 'Şarkı', mime: 'audio/mpeg', url: 'http://s/1' }).kind, 'audio');
  assert.equal(upnpRow({ id: '7', name: 'Belge', mime: 'text/plain', url: 'http://s/2' }), null);
  assert.equal(smbRow({ name: 'f.mp4', dir: false, path: 'p/f.mp4' }, 'h').kind, 'video');
  assert.equal(smbRow({ name: 'z.zip', dir: false, path: 'z.zip' }, 'h'), null);
  const rows2 = sortRows([{ dir: false, name: 'b' }, { dir: true, name: 'z' }, { dir: false, name: 'a' }]);
  assert.deepEqual(rows2.map((r) => r.name), ['z', 'a', 'b']);
});

test('findSiblingSub: ağ klasöründe videonun altyazısı', () => {
  const v = smbRow({ name: 'Film.mkv', dir: false, path: 'k/Film.mkv' }, 'h');
  const s = smbRow({ name: 'Film.srt', dir: false, path: 'k/Film.srt' }, 'h');
  assert.equal(findSiblingSub([v, s], v).name, 'Film.srt');
  assert.equal(findSiblingSub([v], v), null);
});

test('oynatma listesi dosyaları (m3u, pls) şarkı sayılmaz; MIME audio/x-mpegurl olsa da', () => {
  assert.equal(L.kindOfName('_migrated_.m3u', 'audio/x-mpegurl'), '');
  assert.equal(L.kindOfName('liste.M3U8', ''), '');
  assert.equal(L.kindOfName('liste.pls', 'audio/x-scpls'), '');
  assert.equal(L.kindOfName('adsiz', 'audio/x-mpegurl'), '');
  assert.equal(L.kindOfName('sarki.mp3', 'audio/mpeg'), 'audio');
  // yerel tarama kind=audio dese bile dizine girmez (eski önbellekteki kayıtlar da elenir)
  const idx = L.buildIndex([
    { uri: 'content://x/1', name: '_migrated_.m3u', kind: 'audio', mime: 'audio/x-mpegurl' },
    { uri: 'content://x/2', name: 'Sarki.mp3', kind: 'audio', mime: 'audio/mpeg' },
  ], 'r1');
  assert.deepEqual(idx.map((f) => f.name), ['Sarki.mp3']);
});

test('etiket: kayıt, imza ve dosya satırına işleme; başlık yoksa dosya adı kalır', () => {
  const [a, b] = L.buildIndex([
    { uri: 'content://x/1', name: 'Track01.mp3', kind: 'audio', size: 10, mod: 5 },
    { uri: 'content://x/2', name: 'Eski Sarki.mp3', kind: 'audio', size: 20, mod: 6 },
  ], 'r1');
  const cache = new Map();
  assert.equal(L.needsTag(a, cache), true);
  const e = L.tagEntry({ title: '  Gül  Ağacı ', artist: 'Ezginin Günlüğü', album: 'Vurulduk', track: '3/12', year: '1988-01-01', dur: '212345' }, a);
  assert.deepEqual(e, { s: '10:5', t: 'Gül Ağacı', a: 'Ezginin Günlüğü', al: 'Vurulduk', n: 3, y: 1988, d: 212345 });
  cache.set(a.uri, e);
  assert.equal(L.needsTag(a, cache), false);
  assert.equal(L.needsTag({ ...a, mod: 6 }, cache), true, 'dosya değişince yeniden okunur');
  L.applyTag(a, e);
  assert.deepEqual([a.title, a.artist, a.album, a.track, a.dur], ['Gül Ağacı', 'Ezginin Günlüğü', 'Vurulduk', 3, 212345]);
  assert.deepEqual(L.searchIndex([a], 'ezginin vurulduk').map((f) => f.id), [a.id], 'arama sanatçı ve albümü de bulur');
  L.applyTag(b, L.tagEntry({}, b)); // etiketsiz dosya: boş kayıt, ad dosya adından
  assert.deepEqual([b.title, b.artist, b.album], ['Eski Sarki', '', '']);
  assert.equal(L.needsTag(b, new Map([[b.uri, L.tagEntry(null, b)]])), false, 'okunamayan dosya yeniden denenmez');
});

test('müzik grupları: sanatçı ve albüm, sıra, bilinmeyenler sonda', () => {
  const rows = L.buildIndex([
    { uri: 'u/1', name: 'a.mp3', kind: 'audio' }, { uri: 'u/2', name: 'b.mp3', kind: 'audio' },
    { uri: 'u/3', name: 'c.mp3', kind: 'audio' }, { uri: 'u/4', name: 'd.mp3', kind: 'audio' },
    { uri: 'u/5', name: 'v.mp4', kind: 'video' },
  ], 'r');
  const tag = (f, t, a, al, n) => L.applyTag(f, L.tagEntry({ title: t, artist: a, album: al, track: n }, f));
  tag(rows[0], 'İkinci', 'Zeki Müren', 'Albüm B', '2');
  tag(rows[1], 'Birinci', 'Zeki Müren', 'Albüm B', '1');
  tag(rows[2], 'Üçüncü', 'Barış Manço', 'Albüm A', '1');
  const songs = L.songsOf(rows);
  assert.equal(songs.length, 4, 'video şarkı değil');
  const artists = L.groupSongs(songs, 'artist');
  assert.deepEqual(artists.map((g) => [g.name, g.rows.length]), [['Barış Manço', 1], ['Zeki Müren', 2], [L.UNKNOWN_ARTIST, 1]]);
  const albums = L.groupSongs(songs, 'album');
  assert.deepEqual(albums.map((g) => g.name), ['Albüm A', 'Albüm B', L.UNKNOWN_ALBUM]);
  assert.deepEqual(albums[1].rows.map((r) => r.title), ['Birinci', 'İkinci'], 'albüm parça sırasına göre');
  assert.equal(albums[1].artist, 'Zeki Müren');
  assert.deepEqual(L.sortSongs(songs).map((r) => r.title), ['Birinci', 'd', 'İkinci', 'Üçüncü'], 'Türkçe sıralama');
  assert.deepEqual(L.rowsByIds([rows[2].id, 'yok', rows[0].id], songs).map((r) => r.title), ['Üçüncü', 'İkinci']);
});

