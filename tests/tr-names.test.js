import test from 'node:test';
import assert from 'node:assert/strict';
import { trNamesQuery, parseTrNames, loadTrNames, WDQS, BATCH } from '../www/js/tr-names.js';

const row = (imdb, label, alias) => ({ imdb: { value: imdb }, ...(label ? { label: { value: label } } : {}), ...(alias ? { alias: { value: alias } } : {}) });
const mem = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v) }; };

test('SPARQL sorgusu: kimlikler VALUES içinde, Türkçe etiket ve takma ad', () => {
  const q = trNamesQuery(['tt0383574', 'tt0325980']);
  assert.match(q, /VALUES \?imdb \{ "tt0383574" "tt0325980" \}/);
  assert.match(q, /wdt:P345 \?imdb/);
  assert.match(q, /FILTER\(LANG\(\?label\) = "tr"\)/);
  assert.match(q, /skos:altLabel/);
});

test('sonuç ayrıştırma: etiket + takma adlar tekrarsız toplanır; bozuk satır yoksayılır', () => {
  const m = parseTrNames({ results: { bindings: [row('tt1', 'Ölü Gelin', 'Tim Burton’s Ölü Gelin'), row('tt1', 'Ölü Gelin', 'Cesetler Gelini'), row('tt2'), { imdb: { value: 'kötü' } }, row('tt3', ' Hero ')] } });
  assert.deepEqual(m.get('tt1'), ['Ölü Gelin', 'Tim Burton’s Ölü Gelin', 'Cesetler Gelini']);
  assert.deepEqual(m.get('tt2'), [], 'Türkçe adı yok');
  assert.deepEqual(m.get('tt3'), ['Hero']);
  assert.equal(m.has('kötü'), false);
  assert.equal(parseTrNames(null).size, 0);
});

test('yükleme: tek istekte toplu sorgu, sonuç kimlik başına önbelleğe yazılır; ikinci çağrı ağa gitmez', async () => {
  const cache = mem();
  const urls = [];
  const net = { json: async (u) => { urls.push(u); return { results: { bindings: [row('tt1', 'Ölü Gelin'), row('tt2')] } }; } };
  const a = await loadTrNames({ net, cache, ids: ['tt1', 'tt2', 'tt1', 'xx'] });
  assert.equal(urls.length, 1);
  assert.ok(urls[0].startsWith(WDQS + '?format=json&query='));
  assert.deepEqual(a.get('tt1'), ['Ölü Gelin']);
  assert.deepEqual(a.get('tt2'), []);
  const b = await loadTrNames({ net, cache, ids: ['tt1', 'tt2'] });
  assert.equal(urls.length, 1, 'önbellekten');
  assert.deepEqual(b.get('tt1'), ['Ölü Gelin']);
});

test('yükleme: ağ hatasında boş döner ve önbelleğe yazılmaz; kimlikler BATCH\'lik parçalara bölünür', async () => {
  const cache = mem();
  const bad = { json: async () => { throw new Error('ağ yok'); } };
  const r = await loadTrNames({ net: bad, cache, ids: ['tt1'] });
  assert.equal(r.size, 0);
  assert.equal(cache.m.size, 0);
  const ids = Array.from({ length: BATCH + 5 }, (_, i) => 'tt' + (100 + i));
  let calls = 0;
  const net = { json: async () => { calls += 1; return { results: { bindings: [] } }; } };
  await loadTrNames({ net, cache: null, ids });
  assert.equal(calls, 2);
});
