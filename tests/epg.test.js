import test from 'node:test';
import assert from 'node:assert/strict';
import { parseXmltvTime, XmltvParser, buildEpgIndex, resolveEpgId, nowNext, parseEpisode, packProg, unpackProg } from '../www/js/epg.js';

const NOW = Date.UTC(2026, 10, 8, 12, 0, 0); // 8 Kasım 2026 12:00 UTC

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<tv generator-info-name="x">
<channel id="trt1.tr"><display-name>TRT 1</display-name><display-name>TRT1 HD</display-name></channel>
<channel id="show.tr"><display-name lang="tr">Show &amp; TV</display-name></channel>
<programme start="20261108110000 +0000" stop="20261108123000 +0000" channel="trt1.tr"><title lang="tr">Öğle Haberi</title><desc>Gün&apos;ün haberleri &amp; analiz</desc></programme>
<programme start="20261108123000 +0000" stop="20261108133000 +0000" channel="trt1.tr"><title><![CDATA[Dizi <1>]]></title></programme>
<programme start="20261108150000 +0300" stop="20261108160000 +0300" channel="show.tr"><title>Film</title></programme>
<programme start="20250101000000 +0000" stop="20250101010000 +0000" channel="trt1.tr"><title>Çok eski</title></programme>
<programme start="20261120000000 +0000" stop="20261120010000 +0000" channel="trt1.tr"><title>Çok ileri</title></programme>
</tv>`;

test('zaman ayrıştırma ve saat dilimi', () => {
  assert.equal(parseXmltvTime('20261108120000 +0000'), NOW);
  assert.equal(parseXmltvTime('20261108150000 +0300'), NOW);
  assert.equal(parseXmltvTime('20261108120000 -0500'), NOW + 5 * 3600e3);
  assert.equal(parseXmltvTime('20261108120000'), NOW);
  assert.equal(parseXmltvTime('202611081200'), NOW);
  assert.ok(Number.isNaN(parseXmltvTime('bozuk')));
});

test('kanallar ve zaman penceresi içindeki programlar', () => {
  const r = new XmltvParser({ now: NOW }).push(XML).end();
  assert.equal(r.channels.get('trt1.tr').names.length, 2);
  assert.equal(r.channels.get('show.tr').name, 'Show & TV');
  const trt = r.byChannel.get('trt1.tr');
  assert.deepEqual(trt.map((p) => p.t), ['Öğle Haberi', 'Dizi <1>']);
  assert.equal(trt[0].d, "Gün'ün haberleri & analiz");
  assert.equal(r.byChannel.get('show.tr')[0].s, NOW);
  assert.equal(r.count, 3);
});

test('rastgele parçalara bölünmüş akış aynı sonucu verir', () => {
  const whole = new XmltvParser({ now: NOW }).push(XML).end();
  for (const step of [1, 5, 17, 64, 500]) {
    const p = new XmltvParser({ now: NOW });
    for (let i = 0; i < XML.length; i += step) p.push(XML.slice(i, i + step));
    const r = p.end();
    assert.equal(r.count, whole.count, `adım ${step}`);
    assert.deepEqual([...r.byChannel.keys()].sort(), [...whole.byChannel.keys()].sort());
    assert.deepEqual(r.byChannel.get('trt1.tr'), whole.byChannel.get('trt1.tr'));
  }
});

test('kanal eşleme: tvg-id, ad, tvg-name', () => {
  const r = new XmltvParser({ now: NOW }).push(XML).end();
  const idx = buildEpgIndex(r);
  assert.equal(resolveEpgId({ tvgId: 'TRT1.TR', name: 'x' }, idx), 'trt1.tr');
  assert.equal(resolveEpgId({ tvgId: '', name: 'Trt1 hd' }, idx), 'trt1.tr');
  assert.equal(resolveEpgId({ tvgId: 'yok', tvgName: 'SHOW & TV', name: 'z' }, idx), 'show.tr');
  assert.equal(resolveEpgId({ tvgId: '', name: 'Bilinmeyen' }, idx), null);
});

test('şimdi ve sonraki', () => {
  const list = [
    { s: 100, e: 200, t: 'A' },
    { s: 200, e: 300, t: 'B' },
    { s: 400, e: 500, t: 'C' },
  ];
  assert.equal(nowNext(list, 250).now.t, 'B');
  assert.equal(nowNext(list, 250).next.t, 'C');
  assert.equal(nowNext(list, 250).progress, 0.5);
  assert.equal(nowNext(list, 350).now, null);
  assert.equal(nowNext(list, 350).next.t, 'C');
  assert.equal(nowNext(list, 50).now, null);
  assert.equal(nowNext(list, 50).next.t, 'A');
  assert.equal(nowNext(list, 600).next, null);
  assert.deepEqual(nowNext([], 1), { now: null, next: null, progress: 0 });
});

test('bölüm bilgisi: yalnız açıkça yazılı biçimler; program kodları ve tahmin yok', () => {
  assert.equal(parseEpisode('1.4.', 'xmltv_ns'), '2. Sezon 5. Bölüm'); // xmltv_ns 0 tabanlıdır
  assert.equal(parseEpisode('0.0.0/1', 'xmltv_ns'), '1. Sezon 1. Bölüm');
  assert.equal(parseEpisode('.12.', 'xmltv_ns'), '13. Bölüm');
  assert.equal(parseEpisode('S02E05', 'onscreen'), '2. Sezon 5. Bölüm');
  assert.equal(parseEpisode('2x05'), '2. Sezon 5. Bölüm');
  assert.equal(parseEpisode('12. Bölüm'), '12. Bölüm');
  assert.equal(parseEpisode('E7'), '7. Bölüm');
  assert.equal(parseEpisode('EP0123.0456', 'dd_progid'), '');
  assert.equal(parseEpisode('rastgele metin', 'onscreen'), '');
  assert.equal(parseEpisode('', 'xmltv_ns'), '');
  assert.equal(parseEpisode('..', 'xmltv_ns'), '');
});

test('XMLTV: bölüm numarası ve yeni/tekrar/canlı etiketi yalnız kaynakta varsa gelir; ülke ve kanal süzgeci', () => {
  const xml = `<tv>
<channel id="a" country="tr"><display-name>A</display-name></channel>
<channel id="b" country="es"><display-name>B</display-name></channel>
<programme start="20261108120000 +0000" stop="20261108130000 +0000" channel="a"><title>Dizi</title><episode-num system="xmltv_ns">1.4.</episode-num><new/></programme>
<programme start="20261108130000 +0000" stop="20261108140000 +0000" channel="a"><title>Tekrar</title><episode-num system="onscreen">S03E01</episode-num><previously-shown/></programme>
<programme start="20261108140000 +0000" stop="20261108150000 +0000" channel="a"><title>Canlı</title><live/></programme>
<programme start="20261108150000 +0000" stop="20261108160000 +0000" channel="a"><title>Düz</title><episode-num system="dd_progid">EP00123.0001</episode-num></programme>
<programme start="20261108120000 +0000" stop="20261108130000 +0000" channel="b"><title>İspanyolca</title></programme>
</tv>`;
  const parser = new XmltvParser({ now: NOW, accept: (id) => parser.channels.get(id)?.country === 'tr' });
  const r = parser.push(xml).end();
  assert.equal(r.channels.get('a').country, 'tr');
  assert.deepEqual([...r.byChannel.keys()], ['a']);
  const [d, t, c, plain] = r.byChannel.get('a');
  assert.equal(d.x, '2. Sezon 5. Bölüm');
  assert.equal(d.f, 'n');
  assert.equal(t.x, '3. Sezon 1. Bölüm');
  assert.equal(t.f, 'r');
  assert.equal(c.f, 'l');
  assert.equal(plain.x, undefined);
  assert.equal(plain.f, undefined);
});

test('program satırı: etiket/bölüm yoksa eski 5 alanlı biçim aynen kalır', () => {
  const plain = { s: 1, e: 2, t: 'A', d: 'd', c: 'Dizi' };
  assert.deepEqual(packProg(plain), [1, 2, 'A', 'd', 'Dizi']);
  assert.deepEqual(unpackProg([1, 2, 'A', 'd', 'Dizi']), plain);
  const full = { ...plain, x: '1. Bölüm', f: 'n' };
  assert.deepEqual(packProg(full), [1, 2, 'A', 'd', 'Dizi', '1. Bölüm', 'n']);
  assert.deepEqual(unpackProg(packProg(full)), full);
  assert.deepEqual(unpackProg([1, 2, 'A']), { s: 1, e: 2, t: 'A', d: undefined, c: '' });
});
