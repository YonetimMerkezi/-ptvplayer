import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, loadEpg, EpgView, search, groupList, inGroup, playTargets, archiveTargets, recordTarget, catalogToStorable, catalogFromStorable, loadSeriesInfo } from '../www/js/catalog.js';
import { createNet } from '../www/js/net.js';

const b64 = (s) => Buffer.from(s).toString('base64');

function fakeServer(routes) {
  return createNet({
    fetchImpl: async (url) => {
      for (const [re, fn] of routes) if (re.test(url)) return new Response(typeof fn === 'function' ? fn(url) : fn);
      return new Response('yok', { status: 404 });
    },
  });
}

const M3U = `#EXTM3U url-tvg="http://epg/x.xml"
#EXTINF:-1 tvg-id="trt1" group-title="Ulusal",TRT 1
http://h/live/u/p/1.m3u8
#EXTINF:-1 group-title="Ulusal",Şeker Kanal
http://h/live/u/p/2.m3u8
#EXTINF:-1 group-title="Film",Işık Hızı
http://h/movie/u/p/3.mp4
#EXTINF:-1,Dizi S01E01
http://h/series/u/p/4.mp4
`;

test('M3U kaynağı: türlere ayrılır, rehber adresi alınır', async () => {
  const net = fakeServer([[/list\.m3u/, M3U]]);
  const stages = [];
  const cat = await loadCatalog({ type: 'm3u', url: 'http://srv/list.m3u' }, net, { onStage: (s) => stages.push(s) });
  assert.equal(cat.live.length, 2);
  assert.equal(cat.movies.length, 1);
  assert.equal(cat.series.length, 1);
  assert.deepEqual(cat.epgUrls, ['http://epg/x.xml']);
  assert.ok(stages.length >= 2);
});

test('boş liste anlamlı hata verir', async () => {
  const net = fakeServer([[/list/, '#EXTM3U\n']]);
  await assert.rejects(() => loadCatalog({ type: 'm3u', url: 'http://srv/list.m3u' }, net), /içerik bulunamadı/);
});

const XT = { type: 'xtream', server: 'http://x', user: 'u', pass: 'p' };
const xtRoutes = (extra = []) => [
  [/action=get_live_categories/, JSON.stringify([{ category_id: '1', category_name: 'Haber' }])],
  [/action=get_live_streams/, JSON.stringify([{ stream_id: 1, name: 'Haber Türk', category_id: '1', epg_channel_id: 'ht' }])],
  [/action=get_vod_categories/, '[]'],
  [/action=get_vod_streams/, JSON.stringify([{ stream_id: 9, name: 'Film', container_extension: 'mkv' }])],
  [/action=get_series_categories/, '[]'],
  [/action=get_series_info/, JSON.stringify({ info: {}, episodes: { 1: [{ id: 77, title: 'B1', episode_num: 1 }] } })],
  [/action=get_series/, JSON.stringify([{ series_id: 5, name: 'Dizi' }])],
  ...extra,
  [/player_api\.php\?username=u&password=p$/, JSON.stringify({ user_info: { auth: 1, status: 'Active' } })],
];

test('Xtream kaynağı yüklenir', async () => {
  const cat = await loadCatalog(XT, fakeServer(xtRoutes()));
  assert.equal(cat.live[0].group, 'Haber');
  assert.equal(cat.movies[0].ext, 'mkv');
  assert.equal(cat.series[0].seriesId, '5');
  assert.equal(cat.warnings.length, 0);
});

test('Xtream: yanlış şifre ve kısmi hata', async () => {
  const bad = fakeServer([[/player_api/, JSON.stringify({ user_info: { auth: 0 } })]]);
  await assert.rejects(() => loadCatalog(XT, bad), /hatalı/);
  const routes = xtRoutes().filter(([re]) => !/vod_streams/.test(re.source));
  const cat = await loadCatalog(XT, fakeServer(routes));
  assert.equal(cat.movies.length, 0);
  assert.equal(cat.warnings.length, 1);
  assert.ok(cat.live.length);
});

test('arama Türkçe duyarsız, başlayanlar önce', async () => {
  const cat = await loadCatalog({ type: 'm3u', url: 'http://srv/list.m3u' }, fakeServer([[/list/, M3U]]));
  assert.deepEqual(search(cat.live, 'seker').map((i) => i.name), ['Şeker Kanal']);
  assert.deepEqual(search(cat.movies, 'ISIK hizi').map((i) => i.name), ['Işık Hızı']);
  assert.deepEqual(search(cat.live, 'kanal trt'), []);
  assert.equal(search(cat.live, '   ').length, 0);
  const l = [{ name: 'Süper Lig' }, { name: 'Lig Tv' }, { name: 'Ligue' }];
  assert.deepEqual(search(l, 'lig').map((i) => i.name), ['Lig Tv', 'Ligue', 'Süper Lig']);
});

test('gruplar ve süzme', async () => {
  const cat = await loadCatalog({ type: 'm3u', url: 'http://srv/list.m3u' }, fakeServer([[/list/, M3U]]));
  assert.deepEqual(groupList(cat.live), [{ name: 'Ulusal', count: 2 }]);
  assert.equal(inGroup(cat.live, 'Ulusal').length, 2);
  assert.equal(inGroup(cat.live, 'Yok').length, 0);
  assert.equal(groupList(cat.series)[0].name, 'Diğer');
});

test('depolama gidiş-dönüş: arama alanı atılır ve yeniden kurulur', async () => {
  const cat = await loadCatalog({ type: 'm3u', url: 'http://srv/list.m3u' }, fakeServer([[/list/, M3U]]));
  const st = JSON.parse(JSON.stringify(catalogToStorable(cat)));
  assert.equal('f' in st.live[0], false);
  const back = catalogFromStorable(st);
  assert.equal(back.live[0].f, 'trt 1');
  assert.equal(catalogFromStorable({}), null);
});

test('oynatma adresleri', async () => {
  const cat = await loadCatalog(XT, fakeServer(xtRoutes()));
  const t = playTargets(XT, cat.live[0]);
  assert.deepEqual(t.map((x) => x.mime), ['hls', 'ts']);
  assert.match(t[1].url, /\/live\/u\/p\/1\.ts$/);
  assert.match(playTargets(XT, cat.movies[0])[0].url, /\/movie\/u\/p\/9\.mkv$/);
  const info = await loadSeriesInfo(XT, fakeServer(xtRoutes()), cat.series[0]);
  assert.match(playTargets(XT, cat.series[0], info.seasons[0].episodes[0])[0].url, /\/series\/u\/p\/77\.mp4$/);
  const M = { type: 'm3u' };
  assert.equal(playTargets(M, { kind: 'live', url: 'http://a/b.m3u8' })[0].mime, 'hls');
  assert.deepEqual(playTargets(M, { kind: 'live', url: 'http://a/b' }).map((x) => x.mime), ['auto', 'hls']);
  assert.equal(playTargets(M, { kind: 'movie', url: 'http://a/b.mkv' }).length, 1);
  assert.deepEqual(playTargets(M, { kind: 'live' }), []);
});

test('rehber: kanal eşleme ve şimdi/sonraki', async () => {
  const now = Date.UTC(2026, 10, 8, 12, 0, 0);
  const xml = `<tv><channel id="ht"><display-name>Haber Türk</display-name></channel>
<programme start="20261108110000 +0000" stop="20261108130000 +0000" channel="ht"><title>Gündem</title></programme>
<programme start="20261108130000 +0000" stop="20261108140000 +0000" channel="ht"><title>Spor</title></programme>
<programme start="20261108120000 +0000" stop="20261108130000 +0000" channel="baska"><title>X</title></programme></tv>`;
  const net = fakeServer([...xtRoutes([[/xmltv\.php/, xml]])]);
  const cat = await loadCatalog(XT, net);
  const data = await loadEpg(XT, cat, net, { now });
  assert.equal(data.matched, 1);
  assert.deepEqual(Object.keys(data.prog), ['ht']);
  const view = new EpgView(data);
  const r = view.nowNext(cat.live[0], now);
  assert.equal(r.now.t, 'Gündem');
  assert.equal(r.next.t, 'Spor');
  assert.equal(r.progress, 0.5);
  assert.equal(new EpgView(null).ready, false);
  assert.equal(await loadEpg({ type: 'm3u' }, { live: [], epgUrls: [] }, net), null);
});

test('rehber adresi başarısızsa sıradakine geçer, hepsi olmazsa hata verir', async () => {
  const net = fakeServer([[/ok\.xml/, '<tv><programme start="20261108120000 +0000" stop="20261108130000 +0000" channel="a"><title>T</title></programme></tv>']]);
  const cat = { live: [{ id: '1', name: 'A', tvgId: 'a' }], epgUrls: ['http://e/bad.xml', 'http://e/ok.xml'] };
  const d = await loadEpg({ type: 'm3u' }, cat, net, { now: Date.UTC(2026, 10, 8, 12) });
  assert.equal(d.matched, 1);
  await assert.rejects(() => loadEpg({ type: 'm3u' }, { live: [], epgUrls: ['http://e/bad.xml'] }, net));
});

test('dosyadan eklenen M3U: metin doğrudan, yenilemede kayıtlı içerikten okunur', async () => {
  const net = fakeServer([]); // ağa hiç çıkılmamalı
  const a = await loadCatalog({ type: 'm3u', local: true, text: M3U }, net);
  assert.equal(a.live.length, 2);
  assert.equal(a.movies.length, 1);
  const b = await loadCatalog({ id: 'k1', type: 'm3u', local: true }, net, { readFile: async (id) => (id === 'k1' ? M3U : null) });
  assert.equal(b.live.length, 2);
  await assert.rejects(() => loadCatalog({ id: 'yok', type: 'm3u', local: true }, net), /yeniden seçin/);
});

test('yedek adres: kalite ve ülke ekleri yok sayılır, farklı kanallar karışmaz', async () => {
  const { altKey, buildAltIndex, altsOf, playTargets } = await import('../www/js/catalog.js');
  assert.equal(altKey('TR: TRT 1 HD'), 'trt 1');
  assert.equal(altKey('TRT 1 [FHD]'), 'trt 1');
  assert.equal(altKey('TRT 2'), 'trt 2');
  assert.equal(altKey('Star TV (Backup)'), 'star tv');
  assert.equal(altKey('A'), '');
  const list = [
    { id: '1', name: 'TRT 1 HD', url: 'http://h/1.m3u8', kind: 'live' },
    { id: '2', name: 'TRT 1', url: 'http://h/2.m3u8', kind: 'live' },
    { id: '3', name: 'TRT 2', url: 'http://h/3.m3u8', kind: 'live' },
    { id: '4', name: 'TR: TRT 1 FHD', url: 'http://h/4.m3u8', kind: 'live' },
  ];
  const idx = buildAltIndex(list);
  assert.deepEqual(altsOf(idx, list[0]).map((x) => x.id), ['2', '4']);
  assert.deepEqual(altsOf(idx, list[2]), []);
  assert.deepEqual(altsOf(idx, list[0], 1).map((x) => x.id), ['2']);
  const t = playTargets({ type: 'm3u' }, list[0], null, altsOf(idx, list[0]));
  assert.deepEqual(t.map((x) => [x.url, x.alt || null]), [['http://h/1.m3u8', null], ['http://h/2.m3u8', 'TRT 1'], ['http://h/4.m3u8', 'TR: TRT 1 FHD']]);
  assert.equal(playTargets({ type: 'm3u' }, list[0]).length, 1);
});

test('rehberde program adıyla arama: yalnız süren/gelecek programlar, Türkçe harf duyarsız, başlangıca göre sıralı', () => {
  const now = Date.UTC(2026, 10, 9, 12, 0);
  const H = 3600000;
  const view = new EpgView({
    map: { x1: 'a', x2: 'a', x3: 'b' },
    prog: {
      a: [[now - 5 * H, now - 4 * H, 'Eski Maç', ''], [now + 2 * H, now + 3 * H, 'Büyük MAÇ', 'd1'], [now + 9 * H, now + 10 * H, 'Haber', '']],
      b: [[now, now + H, 'Maçın Özeti', ''], [now + H, now + 2 * H, 'Gece Filmi', '']],
      c: [[now, now + H, 'Maç yok kanal', '']],
    },
  });
  const r = view.search('mac', { from: now - H });
  assert.deepEqual(r.map((x) => [x.id, x.p.t]), [['x3', 'Maçın Özeti'], ['x1', 'Büyük MAÇ']], 'ortak rehber kanalından tek kanal; eski ve eşlenmemiş elenir');
  assert.equal(r[1].p.d, 'd1');
  assert.deepEqual(view.search('m', { from: now - H }), [], 'tek harfle aranmaz');
  assert.equal(view.search('film', { from: now - H }).length, 1);
  assert.equal(view.search('maç', { from: now - H, limit: 1 }).length, 1);
});

test('arşiv ve zamanlı kayıt adresleri yalnız Xtream canlı kanalda', () => {
  const src = { type: 'xtream', server: 'http://h:80', user: 'u', pass: 'p' };
  const live = { id: 'x10', streamId: '10', kind: 'live', name: 'TRT', archive: true };
  const p = { s: Date.UTC(2026, 10, 9, 12, 0), e: Date.UTC(2026, 10, 9, 13, 0) };
  const t = archiveTargets(src, live, p, 'UTC');
  assert.equal(t[0].url, 'http://h:80/timeshift/u/p/60/2026-11-09:12-00/10.ts');
  assert.equal(t[1].mime, 'hls');
  assert.deepEqual(archiveTargets(src, { ...live, archive: false }, p), []);
  assert.deepEqual(archiveTargets({ type: 'm3u' }, live, p), []);
  assert.equal(recordTarget(src, live).url, 'http://h:80/live/u/p/10.ts');
  assert.equal(recordTarget({ type: 'm3u' }, { kind: 'live', url: 'http://a/b.m3u8' }), null, 'yalnız HLS olan kanal kaydedilemez');
  assert.equal(recordTarget({ type: 'm3u' }, { kind: 'live', url: 'http://a/b.ts' }).url, 'http://a/b.ts');
});
