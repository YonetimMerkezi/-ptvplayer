import test from 'node:test';
import assert from 'node:assert/strict';
import { qualityOf, baseName, buildVersionIndex, versionsOf, dlId, pickTarget, makeMeta, parseMeta, dlName, pctOf, fmtSpeed, dlSub, sortJobs, summary, seriesDone, isActive } from '../www/js/dl.js';

test('qualityOf: ad etiketinden kalite', () => {
  assert.equal(qualityOf('Avatar (2009) 4K'), '4K');
  assert.equal(qualityOf('Avatar UHD TR Dublaj'), '4K');
  assert.equal(qualityOf('Avatar FHD'), 'FHD');
  assert.equal(qualityOf('Avatar Full HD'), 'FHD');
  assert.equal(qualityOf('Avatar 1080p'), 'FHD');
  assert.equal(qualityOf('Avatar HD'), 'HD');
  assert.equal(qualityOf('Avatar 720p'), 'HD');
  assert.equal(qualityOf('Avatar SD'), 'SD');
  assert.equal(qualityOf('Avatar'), '');
  assert.equal(qualityOf('Yüksek Ödül'), '', '"hd" gibi görünen kelime parçaları kalite sayılmaz');
});

test('baseName: kalite/dil/yıl etiketleri sürüm eşleştirmesini bozmaz', () => {
  const a = baseName('Avatar (2009) 4K');
  assert.equal(a, 'avatar');
  assert.equal(baseName('TR - Avatar FHD'), a);
  assert.equal(baseName('Avatar [HEVC] 1080p Türkçe Dublaj'), a);
  assert.equal(baseName('|TR| AVATAR HD'), a);
  assert.notEqual(baseName('Avatar 2'), a, 'devam filmi ayrı');
  assert.notEqual(baseName('Avatar: Suyun Yolu'), a);
  assert.equal(baseName('2012'), '2012', 'yalnız yıldan oluşan ad boşalmaz');
  assert.equal(baseName('Çılgın Dersler FHD'), baseName('CILGIN DERSLER hd'), 'Türkçe karakter ve büyük/küçük harf duyarsız');
});

const m = (id, name, group = 'Filmler') => ({ id, name, group, kind: 'movie' });

test('versionsOf: aynı filmin kopyaları kalite sırasıyla; tek kopya yalnız kendisi', () => {
  const movies = [m('1', 'Avatar SD'), m('2', 'Avatar (2009) 4K', '4K Filmler'), m('3', 'Avatar FHD'), m('4', 'Başka Film'), m('5', 'Avatar 2 FHD'), m('6', 'Avatar')];
  const idx = buildVersionIndex(movies);
  const v = versionsOf(idx, movies[2]);
  assert.deepEqual(v.map((x) => [x.it.id, x.label]), [['2', '4K'], ['3', 'FHD'], ['6', 'Standart'], ['1', 'SD']], 'etiketsiz kopya HD ile SD arasında');
  assert.equal(v[0].group, '4K Filmler');
  const solo = versionsOf(idx, movies[3]);
  assert.deepEqual(solo.map((x) => x.it.id), ['4'], 'tek kopya: yalnız kendisi');
  assert.deepEqual(versionsOf(idx, movies[4]).map((x) => x.it.id), ['5'], 'devam filmi karışmaz');
  assert.equal(solo[0].label, 'Standart');
});

test('versionsOf: yıllar farklıysa aynı adlı iki ayrı film karışmaz; yıl yoksa eşleşir', () => {
  const movies = [m('1', 'Dune (1984)'), m('2', 'Dune (2021) FHD'), m('3', 'Dune HD')];
  const idx = buildVersionIndex(movies);
  assert.deepEqual(versionsOf(idx, movies[0]).map((x) => x.it.id).sort(), ['1', '3']);
  assert.deepEqual(versionsOf(idx, movies[1]).map((x) => x.it.id).sort(), ['2', '3']);
});

test('dlId: sabit, benzersiz ve yerel taraf için güvenli karakterler', () => {
  const a = dlId('src1', 'm10');
  assert.equal(a, dlId('src1', 'm10'));
  assert.notEqual(a, dlId('src2', 'm10'));
  assert.notEqual(a, dlId('src1', 'm11'));
  assert.notEqual(dlId('s', 'd1', 'e1'), dlId('s', 'd1', 'e2'));
  assert.match(a, /^[A-Za-z0-9_-]{1,80}$/);
  assert.match(dlId('çok uzun kaynak adı / ../', 'x'.repeat(500), 'y'.repeat(500)), /^[A-Za-z0-9_-]{1,80}$/);
});

test('pickTarget: yalnız doğrudan dosya adresleri; m3u8/mpd ve http dışı reddedilir', () => {
  assert.deepEqual(pickTarget([{ url: 'http://h/movie/u/p/1.mkv', mime: 'auto' }], 'mkv'), { url: 'http://h/movie/u/p/1.mkv', headers: null, ext: 'mkv' });
  assert.equal(pickTarget([{ url: 'http://h/a.m3u8', mime: 'hls' }]), null);
  assert.equal(pickTarget([{ url: 'http://h/a.mpd?x=1', mime: 'auto' }]), null);
  assert.equal(pickTarget([{ url: 'file:///x.mp4', mime: 'auto' }]), null);
  assert.equal(pickTarget([]), null);
  assert.equal(pickTarget(null), null);
  const t = pickTarget([{ url: 'http://h/a.m3u8', mime: 'hls' }, { url: 'https://h/film.mp4?token=1', mime: 'auto', headers: { 'User-Agent': 'x' } }]);
  assert.equal(t.url, 'https://h/film.mp4?token=1');
  assert.equal(t.ext, 'mp4', 'uzantı adresten (sorgu hariç)');
  assert.deepEqual(t.headers, { 'User-Agent': 'x' });
  assert.equal(pickTarget([{ url: 'http://h/get.php?id=1', mime: 'auto' }]).ext, '', 'php uzantı sayılmaz');
});

test('makeMeta/parseMeta: öğe ve bölüm özeti gidiş-dönüş; bozuk veri null', () => {
  const item = { id: 's5', kind: 'series', name: 'Dizi', logo: 'l', group: 'G', rating: '8', seriesId: '5', seasons: new Map(), url: 'http://gizli' };
  const ep = { id: 'e9', episodeId: '9', episodeNum: 3, season: 1, title: 'Üç', ext: 'mkv', label: 'S1 B3 · Üç', durationSec: 2400, url: 'http://gizli' };
  const meta = parseMeta(makeMeta({ src: 'src1', item, ep }));
  assert.equal(meta.src, 'src1');
  assert.deepEqual(meta.item, { id: 's5', kind: 'series', name: 'Dizi', logo: 'l', group: 'G', rating: '8', seriesId: '5' });
  assert.equal(meta.ep.label, 'S1 B3 · Üç');
  assert.ok(!('url' in meta.item) && !('url' in meta.ep), 'adres/kimlik bilgisi meta içinde saklanmaz');
  assert.equal(parseMeta('{bozuk'), null);
  assert.equal(parseMeta(''), null);
  assert.equal(parseMeta(JSON.stringify({ v: 2, src: 'a', item: { id: 'x' } })), null);
  assert.equal(parseMeta(makeMeta({ src: 'a', item: { id: 'm1', name: 'F', kind: 'movie' } })).ep, null);
});

test('dlName', () => {
  assert.equal(dlName({ item: { name: 'Film 4K' } }), 'Film 4K');
  assert.equal(dlName({ item: { name: 'Dizi' }, ep: { label: 'S1 B2' } }), 'Dizi · S1 B2');
});

test('durum metinleri', () => {
  assert.equal(pctOf({ state: 'downloading', bytes: 512, total: 2048 }), 25);
  assert.equal(pctOf({ state: 'downloading', bytes: 5, total: -1 }), 0);
  assert.equal(pctOf({ state: 'done', bytes: 1, total: 1 }), 100);
  assert.equal(fmtSpeed(0), '');
  assert.equal(fmtSpeed(3.4 * 1024 * 1024), '3,4 MB/sn');
  assert.equal(fmtSpeed(200 * 1024), '200 KB/sn');
  const mb = 1024 * 1024;
  assert.equal(dlSub({ state: 'downloading', bytes: 100 * mb, total: 400 * mb, speed: 2 * mb }), '%25 · 100 MB / 400 MB · 2,0 MB/sn');
  assert.equal(dlSub({ state: 'downloading', bytes: 0, total: 0, speed: 0 }), 'Başlıyor…');
  assert.equal(dlSub({ state: 'queued', bytes: 0, total: -1 }), 'Sırada');
  assert.equal(dlSub({ state: 'waiting', bytes: 0, total: -1 }), 'Wi-Fi bekleniyor');
  assert.equal(dlSub({ state: 'paused', bytes: 100 * mb, total: 400 * mb }), 'Duraklatıldı · %25 · 100 MB / 400 MB');
  assert.equal(dlSub({ state: 'error', error: 'Dosya sunucuda bulunamadı (HTTP 404)' }), 'Dosya sunucuda bulunamadı (HTTP 404)');
  assert.equal(dlSub({ state: 'done', bytes: 400 * mb, total: 400 * mb }), 'İndirildi · 400 MB');
  assert.ok(isActive({ state: 'waiting' }) && !isActive({ state: 'paused' }) && !isActive(null));
});

test('sortJobs: iniyor → sırada → duraklatılmış → hatalı → biten (en yeni önce); sıra eklenme sırasıyla', () => {
  const j = (id, state, createdAt) => ({ id, state, createdAt });
  const out = sortJobs([j('d1', 'done', 1), j('q2', 'queued', 5), j('p', 'paused', 2), j('d2', 'done', 9), j('dl', 'downloading', 3), j('q1', 'queued', 4), j('e', 'error', 7)]);
  assert.deepEqual(out.map((x) => x.id), ['dl', 'q1', 'q2', 'p', 'e', 'd2', 'd1']);
  assert.deepEqual(summary(out), { active: 3, done: 2, paused: 1, failed: 1, total: 7 });
});

test('seriesDone: aynı dizinin biten bölümleri sezon/bölüm sırasıyla', () => {
  const mk = (id, state, season, no, series = 's5', src = 'a') => ({ id, state, meta: makeMeta({ src, item: { id: series, name: 'D', kind: 'series' }, ep: { id: 'e' + id, season, episodeNum: no, label: `S${season} B${no}` } }) });
  const jobs = [mk('3', 'done', 2, 1), mk('1', 'done', 1, 2), mk('2', 'done', 1, 1), mk('9', 'queued', 1, 3), mk('8', 'done', 1, 1, 's6'), mk('7', 'done', 1, 1, 's5', 'b'), { id: 'film', state: 'done', meta: makeMeta({ src: 'a', item: { id: 'm1', name: 'F', kind: 'movie' } }) }];
  assert.deepEqual(seriesDone(jobs, 'a', 's5').map((x) => x.job.id), ['2', '1', '3']);
});
