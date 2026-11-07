import test from 'node:test';
import assert from 'node:assert/strict';
import { parseXmltvTime, XmltvParser, buildEpgIndex, resolveEpgId, nowNext } from '../www/js/epg.js';

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
