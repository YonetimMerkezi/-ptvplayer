import test from 'node:test';
import assert from 'node:assert/strict';
import { parseM3U, M3UParser, groupSeries, splitPipeHeaders, classify } from '../www/js/m3u.js';

const SAMPLE = `﻿#EXTM3U url-tvg="http://epg.example/a.xml.gz, https://epg.example/b.xml"
#EXTINF:-1 tvg-id="trt1.tr" tvg-name="TRT 1 HD" tvg-logo="http://l/trt1.png" group-title="Ulusal, Haber",TRT 1 HD
http://host:8080/live/u/p/101.m3u8
#EXTINF:-1 tvg-id="" group-title="Spor",Spor "Özel" Kanal
#EXTVLCOPT:http-user-agent=VLC/3.0
#EXTVLCOPT:http-referrer=http://ref.example/
http://host/spor.m3u8
#EXTGRP:Belgesel
#EXTINF:-1,Doğa Kanalı
http://host/doga.ts
#EXTINF:-1 group-title="Filmler",Matrix (1999)
http://host:8080/movie/u/p/555.mkv
#EXTINF:-1 group-title="Diziler",Kurtlar Vadisi S01E02
http://host:8080/series/u/p/777.mp4
http://host/yalin.m3u8|User-Agent=Foo&Referer=http%3A%2F%2Fx.example%2F
`;

test('başlık, epg adresleri, BOM', () => {
  const { items, epgUrls } = parseM3U(SAMPLE);
  assert.deepEqual(epgUrls, ['http://epg.example/a.xml.gz', 'https://epg.example/b.xml']);
  assert.equal(items.length, 6);
});

test('EXTINF öznitelikleri ve virgül içeren grup', () => {
  const [a] = parseM3U(SAMPLE).items;
  assert.equal(a.name, 'TRT 1 HD');
  assert.equal(a.group, 'Ulusal, Haber');
  assert.equal(a.tvgId, 'trt1.tr');
  assert.equal(a.logo, 'http://l/trt1.png');
  assert.equal(a.kind, 'live');
});

test('EXTVLCOPT başlıkları, EXTGRP, adsız satır', () => {
  const items = parseM3U(SAMPLE).items;
  assert.equal(items[1].name, 'Spor "Özel" Kanal');
  assert.deepEqual(items[1].headers, { 'User-Agent': 'VLC/3.0', Referer: 'http://ref.example/' });
  assert.equal(items[2].group, 'Belgesel');
  assert.equal(items[2].headers, null);
});

test('tür sınıflandırma', () => {
  const items = parseM3U(SAMPLE).items;
  assert.equal(items[3].kind, 'movie');
  assert.equal(items[4].kind, 'series');
  assert.equal(classify('http://h/x/y.mp4', 'Bir Film', 'Aksiyon'), 'movie');
  assert.equal(classify('http://h/x/y.mp4', 'Show S02E05', ''), 'series');
  assert.equal(classify('http://h/live/a/b/1', 'k', ''), 'live');
});

test('pipe başlıkları ayrılır', () => {
  const { url, headers } = splitPipeHeaders('http://a/b.m3u8|User-Agent=Foo&Referer=http%3A%2F%2Fx%2F');
  assert.equal(url, 'http://a/b.m3u8');
  assert.deepEqual(headers, { 'User-Agent': 'Foo', Referer: 'http://x/' });
  assert.deepEqual(parseM3U(SAMPLE).items[5].headers, { 'User-Agent': 'Foo', Referer: 'http://x.example/' });
});

test('parçalı besleme tek seferlik ile aynı sonucu verir', () => {
  const whole = parseM3U(SAMPLE).items;
  for (const step of [1, 7, 33]) {
    const p = new M3UParser();
    for (let i = 0; i < SAMPLE.length; i += step) p.push(SAMPLE.slice(i, i + step));
    assert.deepEqual(p.end().items, whole, `adım ${step}`);
  }
});

test('CRLF ve boş satırlar', () => {
  const { items } = parseM3U('#EXTM3U\r\n\r\n#EXTINF:-1,A\r\nhttp://a/1\r\n\r\n#EXTINF:-1,B\r\nhttp://a/2');
  assert.deepEqual(items.map((i) => i.name), ['A', 'B']);
});

test('dizi bölümleri gruplanır, eşleşmeyen film olur', () => {
  const items = parseM3U(`#EXTM3U
#EXTINF:-1,Dizi S01E02
http://h/series/u/p/2.mp4
#EXTINF:-1,Dizi S01E01
http://h/series/u/p/1.mp4
#EXTINF:-1,Dizi S02E01
http://h/series/u/p/3.mp4
#EXTINF:-1,Tek Parça
http://h/series/u/p/9.mp4`).items;
  const { series, movies } = groupSeries(items);
  assert.equal(movies.length, 1);
  assert.equal(movies[0].kind, 'movie');
  assert.equal(series.length, 1);
  assert.deepEqual(series[0].seasons.map((s) => s.season), [1, 2]);
  assert.deepEqual(series[0].seasons[0].episodes.map((e) => e.episodeNum), [1, 2]);
});

test('tvg-chno kanal numarası okunur, yoksa 0', () => {
  const r = parseM3U('#EXTM3U\n#EXTINF:-1 tvg-chno="105" group-title="A",Bir\nhttp://x/live/u/p/1.m3u8\n#EXTINF:-1,İki\nhttp://x/live/u/p/2.m3u8\n');
  assert.equal(r.items[0].num, 105);
  assert.equal(r.items[1].num, 0);
});
