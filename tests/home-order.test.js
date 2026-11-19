import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOME_SECTIONS, DEFAULT_ORDER, normalizeOrder, moveSection, isDefaultOrder, sectionLabel } from '../www/js/home-order.js';

test('varsayılan sıra bugünkü ana ekran sırasıdır; kimlikler tekil ve etiketli', () => {
  assert.deepEqual(DEFAULT_ORDER, ['explore', 'tools', 'continue', 'recent', 'fresh', 'picks', 'new', 'radio']);
  assert.equal(new Set(DEFAULT_ORDER).size, DEFAULT_ORDER.length);
  assert.ok(HOME_SECTIONS.every((s) => s.label && s.hint));
  assert.equal(sectionLabel('new'), 'Vizyondaki filmler');
  assert.equal(sectionLabel('yok'), 'yok');
});

test('normalizeOrder: geçerli kayıt korunur; bilinmeyen/tekrar atılır; eksikler varsayılan komşusunun arkasına konur', () => {
  assert.deepEqual(normalizeOrder(DEFAULT_ORDER), DEFAULT_ORDER);
  assert.deepEqual(normalizeOrder(null), DEFAULT_ORDER);
  assert.deepEqual(normalizeOrder('x'), DEFAULT_ORDER);
  assert.deepEqual(normalizeOrder([]), DEFAULT_ORDER);
  const swapped = ['new', 'radio', 'explore', 'tools', 'continue', 'recent', 'fresh', 'picks'];
  assert.deepEqual(normalizeOrder(swapped), swapped);
  const dirty = normalizeOrder(['new', 'new', 'zzz', 7, null, 'explore']);
  assert.deepEqual(dirty.slice(0, 3), ['new', 'radio', 'explore'], 'tekrar ve bilinmeyen atılır; eksik “radio” varsayılan komşusu “new”in arkasına');
  assert.deepEqual([...dirty].sort(), [...DEFAULT_ORDER].sort());
  assert.equal(normalizeOrder(['new', 'new', 'zzz']).length, DEFAULT_ORDER.length);
  // eksik bölüm: kayıtta 'recent' yok → varsayılandaki önceki komşusu 'continue'nun arkasına
  assert.deepEqual(normalizeOrder(['radio', 'continue', 'fresh', 'explore', 'tools', 'picks', 'new']), ['radio', 'continue', 'recent', 'fresh', 'explore', 'tools', 'picks', 'new']);
  // ilk bölüm eksik ve komşusu yok → en başa
  assert.equal(normalizeOrder(DEFAULT_ORDER.slice(1))[0], 'explore');
});

test('moveSection: yukarı, aşağı, en üste, en alta; uçlarda yerinde kalır; bilinmeyen kimlik sırayı bozmaz', () => {
  assert.deepEqual(moveSection(DEFAULT_ORDER, 'new', 'top'), ['new', 'explore', 'tools', 'continue', 'recent', 'fresh', 'picks', 'radio']);
  assert.deepEqual(moveSection(DEFAULT_ORDER, 'explore', 'bottom').slice(-2), ['radio', 'explore']);
  assert.deepEqual(moveSection(DEFAULT_ORDER, 'recent', 'up').slice(2, 5), ['recent', 'continue', 'fresh']);
  assert.deepEqual(moveSection(DEFAULT_ORDER, 'recent', 'down').slice(2, 5), ['continue', 'fresh', 'recent']);
  assert.deepEqual(moveSection(DEFAULT_ORDER, 'explore', 'up'), DEFAULT_ORDER);
  assert.deepEqual(moveSection(DEFAULT_ORDER, 'radio', 'down'), DEFAULT_ORDER);
  assert.deepEqual(moveSection(DEFAULT_ORDER, 'yok', 'top'), DEFAULT_ORDER);
  const once = moveSection(null, 'new', 'top');
  assert.equal(once[0], 'new');
  assert.equal(once.length, DEFAULT_ORDER.length);
  assert.equal(isDefaultOrder(DEFAULT_ORDER), true);
  assert.equal(isDefaultOrder(once), false);
  assert.equal(isDefaultOrder(null), true);
});

test('bağlantı: ana ekran bölümleri kayıtlı sırayla dizilir; ayarlarda sıra sayfası ve sıfırlama var', () => {
  const app = readFileSync(new URL('../www/js/app.js', import.meta.url), 'utf8');
  assert.match(app, /from '\.\/home-order\.js'/);
  assert.match(app, /normalizeOrder\(store\.pref\('set\.homeOrder', \[\]\)\)\.map\(\(id\) => sections\[id\] \|\| ''\)\.join\(''\)/, 'bölümler kayıtlı sırayla birleşir');
  for (const id of DEFAULT_ORDER) assert.match(app, new RegExp(`\\b${id}: `), `renderHome bölümü: ${id}`);
  assert.match(app, /btnRow\('g-hord', 'Bölüm sırası'/);
  assert.match(app, /function homeOrderSheet\(/);
  assert.match(app, /save\(moveSection\(order\(\), row\.dataset\.id, b\.dataset\.m\)\)/);
  assert.match(app, /store\.setPref\('set\.homeOrder', list\)/);
  assert.match(app, /reset\.addEventListener\('click', \(\) => save\(\[\]\)\)/, 'varsayılan sıraya dön');
});
