import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTitle, isEpisodeLike, cacheKey, fold } from '../www/js/titleclean.js';
import { lookupMeta } from '../www/js/meta-worker.js';

test('pipe, nokta ve altçizgi biçimlerinden ad ve yıl çıkarır', () => {
  assert.deepEqual([cleanTitle('Adalet 3 | 2023 | 7.1 | Altyazılı | HD').title, cleanTitle('Adalet 3 | 2023 | 7.1 | Altyazılı | HD').year], ['Adalet 3', 2023]);
  const v = cleanTitle('The.Virtuoso.2021.tr.en');
  assert.deepEqual([v.title, v.year], ['The Virtuoso', 2021]);
  const k = cleanTitle('Kirik_Hayat_1972');
  assert.deepEqual([k.title, k.year], ['Kirik Hayat', 1972]);
  assert.equal(cleanTitle('Jurassic World 2 : Yıkılmış Krallık (2018)').title, 'Jurassic World 2: Yıkılmış Krallık');
});

test('devam filmi numarası ve çizgi film adı korunur', () => {
  assert.equal(cleanTitle('Galaksinin Koruyucuları 3 | 2023').title, 'Galaksinin Koruyucuları 3');
  assert.equal(cleanTitle('Cizgi Film - Pamuk Prenses').title, 'Cizgi Film - Pamuk Prenses');
});

test('Türkçe karakterler sadeleşir, anahtar kaynaktan bağımsızdır', () => {
  assert.equal(fold('IŞIK İSTANBUL Çağrı'), 'isik istanbul cagri');
  assert.equal(cacheKey(cleanTitle('Geçmiş Olsun', 2012)), cacheKey(cleanTitle('GECMIS.OLSUN.2012')));
});

test('bölüm kayıtları elenir, "Bölüm" içeren filmler elenmez', () => {
  assert.equal(isEpisodeLike('Gönül Dağı | 230. Bölüm | 07.11.2026'), true);
  assert.equal(isEpisodeLike('Star Wars: Bölüm VIII'), false);
  assert.equal(isEpisodeLike('Alaycı Kuş Bölüm 1 | 2014'), false);
});

test('APP_TOKEN girilmemişse ağ isteği yapılmaz', async () => {
  let calls = 0;
  const net = { json: async () => { calls++; return {}; } };
  assert.equal(await lookupMeta(net, { cache: { get: async () => null, set: async () => {} } }, { name: 'Alita' }), null);
  assert.equal(calls, 0);
});
