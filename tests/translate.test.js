import test from 'node:test';
import assert from 'node:assert/strict';
import { looksTurkish, clipText, parseTranslation, translateToTr, TRANSLATE_URL, TRANSLATE_TTL, MAX_CHARS } from '../www/js/translate.js';

const EN = 'Hundreds of years before Pennywise, three youngsters venture into the Western Wood where they encounter a terrifying ancient spirit.';
const TR = 'Güçlü bir siyasetçi olan James’in eşi Sophie’nin ayrıcalıklı hayatı, skandal yaratacak sırların ortaya çıkması ve James’e yöneltilen suçlamayla altüst olur.';
const memCache = () => { const m = new Map(); return { m, get: async (k) => m.get(k), set: async (k, v) => { m.set(k, v); } }; };

test('looksTurkish: Türkçe özet tanınır; İngilizce (ü/ö’lü adlar dahil) ve boş metin Türkçe sayılmaz', () => {
  assert.equal(looksTurkish(TR), true);
  assert.equal(looksTurkish(EN), false);
  assert.equal(looksTurkish('Müller returns to Berlin after the war.'), false);
  assert.equal(looksTurkish('Drama'), false);
  assert.equal(looksTurkish(''), false);
  assert.equal(looksTurkish(null), false);
});

test('parseTranslation: parçalar birleşir; beklenmedik yanıt boş döner', () => {
  assert.equal(parseTranslation([[['Merhaba dünya. ', 'Hello world. ', null, null, 10], ['İkinci cümle.', 'Second.']], null, 'en']), 'Merhaba dünya. İkinci cümle.');
  for (const bad of [null, {}, [], [null], [[]], [[[1, 2]]], 'x']) assert.equal(parseTranslation(bad), '');
});

test('clipText: uzun metin cümle sınırında kısalır, kısa metin aynen kalır', () => {
  assert.equal(clipText('  Kısa metin.  '), 'Kısa metin.');
  const long = 'Bir cümle burada. '.repeat(200);
  const c = clipText(long);
  assert.ok(c.length <= MAX_CHARS);
  assert.ok(c.endsWith('.'), 'cümle ortasında kesilmez');
  assert.ok(clipText('x'.repeat(5000)).length === MAX_CHARS, 'cümle sınırı yoksa düz keser');
});

test('translateToTr: çevirir, önbelleğe yazar, ikinci çağrı ağa gitmez; adres kaçışlıdır', async () => {
  const calls = [];
  const net = { json: async (url) => { calls.push(url); return [[['Yüzyıllar önce…', EN]], null, 'en']; } };
  const cache = memCache();
  assert.equal(await translateToTr({ net, cache, text: EN }), 'Yüzyıllar önce…');
  assert.ok(calls[0].startsWith(TRANSLATE_URL + '?client=gtx&sl=auto&tl=tr&dt=t&q=Hundreds%20of%20years'));
  assert.equal(await translateToTr({ net, cache, text: EN }), 'Yüzyıllar önce…');
  assert.equal(calls.length, 1);
  const later = Date.now() + TRANSLATE_TTL + 1000;
  assert.equal(await translateToTr({ net, cache, text: EN, now: later }), 'Yüzyıllar önce…');
  assert.equal(calls.length, 2, 'süresi dolan önbellek yenilenir');
});

test('translateToTr: Türkçe metin ağa gitmez; ağ hatası ya da boş yanıt null döner ve önbelleğe yazılmaz', async () => {
  let n = 0;
  const net = { json: async () => { n++; throw new Error('ağ yok'); } };
  assert.equal(await translateToTr({ net, text: TR }), TR);
  assert.equal(n, 0);
  const cache = memCache();
  assert.equal(await translateToTr({ net, cache, text: EN }), null);
  assert.equal(await translateToTr({ net: { json: async () => [[]] }, cache, text: EN }), null);
  assert.equal(cache.m.size, 0);
  assert.equal(await translateToTr({ net, text: '   ' }), null);
});
