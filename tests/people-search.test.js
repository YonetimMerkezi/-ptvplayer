import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchUrl, parseSearch, rankPeople, searchActors, MAX_RESULTS } from '../www/js/people-search.js';

const row = (id, label, description) => ({ id, label, description });
const EN = {
  search: [
    row('Q1', 'Tom Hanks', 'American actor and filmmaker'),
    row('Q2', 'Tom Hanks (film)', 'Wikimedia disambiguation page'),
    row('Q1', 'Tom Hanks', 'American actor and filmmaker'),
    row('Q4', 'Tom Hankins', 'British film director'),
    row('Q5', 'Hanks', 'surname'),
  ],
};
const TR = { search: [row('Q1', 'Tom Hanks', 'Amerikalı oyuncu ve film yapımcısı')] };

test('searchUrl: dil, sınır ve kaçışlı arama metni', () => {
  const u = searchUrl(' Kıvanç Tatlıtuğ ', 'tr');
  assert.match(u, /action=wbsearchentities/);
  assert.match(u, /language=tr&uselang=tr/);
  assert.match(u, /search=K%C4%B1van%C3%A7%20Tatl%C4%B1tu%C4%9F$/);
});

test('parseSearch: yalnız oyuncu/yönetmen açıklamalı kişiler, tekrarsız', () => {
  const r = parseSearch(EN);
  assert.deepEqual(r.map((p) => p.id), ['Q1', 'Q4']);
  assert.equal(r[0].name, 'Tom Hanks');
  assert.deepEqual(parseSearch(null), []);
  assert.deepEqual(parseSearch({ search: [{ id: 'x', label: 'a', description: 'actor' }] }), [], 'geçersiz kimlik atılır');
});

test('rankPeople: tam ad önce, sonra ad yazılanla başlayanlar', () => {
  const list = [{ id: 'a', name: 'Hanks Bob' }, { id: 'b', name: 'Tom Hankins' }, { id: 'c', name: 'Tom Hanks' }];
  assert.deepEqual(rankPeople(list, 'tom hanks').map((p) => p.id), ['c', 'a', 'b']);
  assert.deepEqual(rankPeople(list, 'tom han').map((p) => p.id), ['b', 'c', 'a']);
});

test('searchActors: İngilizce sonuç + Türkçe açıklama, önbelleğe yazılır ve oradan okunur', async () => {
  const calls = [];
  const net = { json: async (u) => { calls.push(u); return /language=tr/.test(u) ? TR : EN; } };
  const mem = new Map();
  const cache = { get: async (k) => mem.get(k), set: async (k, v) => void mem.set(k, v) };
  const r = await searchActors({ net, cache, query: 'tom hanks', now: 1000 });
  assert.equal(calls.length, 2);
  assert.deepEqual(r.map((p) => [p.id, p.name, p.desc]), [['Q1', 'Tom Hanks', 'Amerikalı oyuncu ve film yapımcısı'], ['Q4', 'Tom Hankins', 'British film director']]);
  const again = await searchActors({ net, cache, query: 'Tom Hanks', now: 2000 });
  assert.equal(calls.length, 2, 'ikinci arama ağa gitmez');
  assert.deepEqual(again, r);
});

test('searchActors: kısa metin boş; Türkçe açıklama alınamazsa İngilizce kalır; asıl arama hatası yukarı atılır', async () => {
  assert.deepEqual(await searchActors({ net: { json: async () => { throw new Error('x'); } }, query: 'a' }), []);
  const net = { json: async (u) => { if (/language=tr/.test(u)) throw new Error('tr yok'); return EN; } };
  const r = await searchActors({ net, query: 'tom hanks' });
  assert.equal(r[0].desc, 'American actor and filmmaker');
  await assert.rejects(searchActors({ net: { json: async () => { throw new Error('ağ yok'); } }, query: 'tom hanks' }), /ağ yok/);
  const many = { search: Array.from({ length: 30 }, (_, i) => row('Q' + (100 + i), 'Actor ' + i, 'actor')) };
  assert.equal((await searchActors({ net: { json: async () => many }, query: 'actor' })).length, MAX_RESULTS);
});

const kaynak = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('Arama sayfası: Oyuncu sekmesi fotoğraflı liste, seçilince oyuncu sayfası; ana ekranda sesle arama düğmesi', () => {
  const app = kaynak('www/js/app.js');
  assert.match(app, /<button data-k="person">Oyuncu/);
  assert.match(app, /if \(kind === 'person'\) return drawPeople\(\);/);
  assert.match(app, /searchActors\(\{ net, cache: store\.cache, query: t \}\)/);
  assert.match(app, /loadPersonPhotos\(\{ net, cache: store\.cache, names: ppl\.list\.map/);
  assert.match(app, /openActor\(pb\.dataset\.person, '', ppl\.photos\.get\(nameKey\(pb\.dataset\.person\)\) \|\| ''\)/);
  assert.match(app, /av\.outerHTML = avatarHtml\(b\.dataset\.person, u\)/, 'fotoğraf gelince satır yerinde güncellenir: odak kaybolmaz');
  // ana ekran: yalnız konuşma tanıyıcı varken görünür; aramayı açıp mikrofonu hemen başlatır
  assert.match(app, /nativePlugin && nativePlugin\.voiceSearch \? `<button class="icon-btn" id="h-mic" aria-label="Sesle ara">/);
  assert.match(app, /if \(e\.target\.closest\('#h-mic'\)\) return globalSearch\(\{ voice: true \}\);/);
  assert.match(app, /voice && gmic \? voiceInto\(q\) : q\.focus\(\)/);
});
