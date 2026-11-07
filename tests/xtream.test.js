import test from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../www/js/xtream.js';

const cfg = { server: 'host.example:8080/', user: 'ali', pass: 'p@ss/1' };

test('sunucu adresi düzeltilir', () => {
  assert.equal(X.normalizeServer('host.example:8080/'), 'http://host.example:8080');
  assert.equal(X.normalizeServer('https://h.example/player_api.php?x=1'), 'https://h.example');
  assert.equal(X.normalizeServer(''), '');
});

test('get.php bağlantısından alanlar çıkarılır', () => {
  const r = X.parseXtreamLink('http://h.example:8080/get.php?username=u1&password=p2&type=m3u_plus&output=ts');
  assert.deepEqual(r, { server: 'http://h.example:8080', user: 'u1', pass: 'p2' });
  assert.equal(X.parseXtreamLink('abc'), null);
});

test('adresler kodlanır', () => {
  assert.equal(X.apiUrl(cfg, 'get_live_streams'), 'http://host.example:8080/player_api.php?username=ali&password=p%40ss%2F1&action=get_live_streams');
  assert.equal(X.liveUrl(cfg, 5), 'http://host.example:8080/live/ali/p%40ss%2F1/5.m3u8');
  assert.equal(X.movieUrl(cfg, 7, 'mkv'), 'http://host.example:8080/movie/ali/p%40ss%2F1/7.mkv');
  assert.equal(X.episodeUrl(cfg, 9, ''), 'http://host.example:8080/series/ali/p%40ss%2F1/9.mp4');
  assert.match(X.xmltvUrl(cfg), /xmltv\.php\?username=ali/);
});

test('kimlik doğrulama yanıtları', () => {
  assert.equal(X.checkAuth({}).ok, false);
  assert.equal(X.checkAuth({ user_info: { auth: 0 } }).ok, false);
  assert.match(X.checkAuth({ user_info: { auth: 1, status: 'Expired' } }).reason, /süre/);
  const ok = X.checkAuth({ user_info: { auth: '1', status: 'Active', exp_date: '1900000000', max_connections: '2' } });
  assert.equal(ok.ok, true);
  assert.equal(ok.maxConnections, 2);
  assert.equal(ok.expires, 1900000000000);
});

test('canlı, film, dizi eşlemesi', () => {
  const cats = [{ category_id: '1', category_name: 'Ulusal' }];
  const live = X.mapLive([{ stream_id: 10, name: ' TRT 1 ', stream_icon: 'i.png', category_id: '1', epg_channel_id: 'trt1', num: 3, tv_archive: 1 }], cats);
  assert.deepEqual(live[0], { id: 'x10', streamId: '10', kind: 'live', name: 'TRT 1', logo: 'i.png', group: 'Ulusal', tvgId: 'trt1', num: 3, archive: true });
  const vod = X.mapVod([{ stream_id: 4, name: 'Film', container_extension: 'mkv', category_id: '9', rating_5based: '3.5' }], []);
  assert.equal(vod[0].ext, 'mkv');
  assert.equal(vod[0].rating, 3.5);
  const ser = X.mapSeries([{ series_id: 2, name: 'Dizi', cover: 'c.jpg', category_id: '1' }], cats);
  assert.equal(ser[0].group, 'Ulusal');
  assert.equal(X.mapLive(null, null).length, 0);
});

test('dizi bilgisi: nesne ve dizi biçimindeki sezonlar', () => {
  const ep = (id, n) => ({ id, title: 'B' + n, episode_num: n, container_extension: 'mkv', info: { duration_secs: 2400 } });
  const a = X.mapSeriesInfo({ info: { plot: 'P' }, episodes: { 2: [ep(5, 1)], 1: [ep(2, 2), ep(1, 1)] } });
  assert.deepEqual(a.seasons.map((s) => s.season), [1, 2]);
  assert.deepEqual(a.seasons[0].episodes.map((e) => e.episodeId), ['1', '2']);
  assert.equal(a.seasons[0].episodes[0].durationSec, 2400);
  const b = X.mapSeriesInfo({ episodes: [[ep(1, 1)], [ep(2, 1)]] });
  assert.deepEqual(b.seasons.map((s) => s.season), [1, 2]);
});

test('kısa rehber base64 çözülür', () => {
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
  const r = X.mapShortEpg({
    epg_listings: [
      { title: b64('Akşam Haberleri'), description: b64('Güncel'), start_timestamp: '200', stop_timestamp: '300' },
      { title: b64('İlk'), description: '', start_timestamp: '100', stop_timestamp: '200' },
    ],
  });
  assert.deepEqual(r.map((e) => e.t), ['İlk', 'Akşam Haberleri']);
  assert.equal(r[1].d, 'Güncel');
  assert.equal(r[0].s, 100000);
});
