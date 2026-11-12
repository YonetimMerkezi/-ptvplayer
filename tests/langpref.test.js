import test from 'node:test';
import assert from 'node:assert/strict';
import { trackLang, decideTracks, normalizeAudioLang, normalizeSubLang, AUDIO_LANGS, SUB_LANGS } from '../www/js/langpref.js';

test('trackLang: kod (bölgeli de) ve ad ile tanır; bilinmeyen boş', () => {
  assert.equal(trackLang({ lang: 'tr' }), 'tr');
  assert.equal(trackLang({ lang: 'tur' }), 'tr');
  assert.equal(trackLang({ lang: 'en-US' }), 'en');
  assert.equal(trackLang({ lang: 'deu' }), 'de');
  assert.equal(trackLang({ label: 'Türkçe' }), 'tr');
  assert.equal(trackLang({ label: 'TUR' }), 'tr');
  assert.equal(trackLang({ label: 'İngilizce (5.1)' }), 'en');
  assert.equal(trackLang({ label: 'English' }), 'en');
  assert.equal(trackLang({ label: 'Arapça' }), 'ar');
  assert.equal(trackLang({ lang: 'und', label: 'Ses 2' }), '');
  assert.equal(trackLang({ label: 'Ses 1' }), '');
  assert.equal(trackLang(null), '');
  // kod ad kalıbından önceliklidir
  assert.equal(trackLang({ lang: 'en', label: 'Türkçe dublaj' }), 'en');
});

const A = (id, lang, sel = false) => ({ id, lang, label: lang, selected: sel });
const T = { audio: [A('0:0', 'tr', true), A('1:0', 'en')], text: [A('2:0', 'tr'), A('3:0', 'en')], textOn: false };

test('decideTracks: varsayılan (otomatik) hiçbir şeye dokunmaz', () => {
  assert.deepEqual(decideTracks(T, { audio: 'auto', sub: 'auto' }), { audio: null, text: null });
  assert.deepEqual(decideTracks(T, undefined), { audio: null, text: null });
});

test('decideTracks: tercih edilen ses seçilir; zaten seçiliyse dokunulmaz', () => {
  assert.deepEqual(decideTracks(T, { audio: 'en', sub: 'auto' }), { audio: '1:0', text: null });
  assert.deepEqual(decideTracks(T, { audio: 'tr', sub: 'auto' }), { audio: null, text: null });
});

test('decideTracks: ses yoksa altyazı (yalnız-yoksa seçeneği açıkken)', () => {
  // Almanca ses yok → Türkçe altyazı açılır
  assert.deepEqual(decideTracks(T, { audio: 'de', sub: 'tr', subIfMissing: true }), { audio: null, text: '2:0' });
  // tercih edilen ses var → altyazı açılmaz
  assert.deepEqual(decideTracks(T, { audio: 'en', sub: 'tr', subIfMissing: true }), { audio: '1:0', text: null });
  // seçenek kapalıysa altyazı hep açılır
  assert.deepEqual(decideTracks(T, { audio: 'en', sub: 'tr', subIfMissing: false }), { audio: '1:0', text: '2:0' });
  // ses tercihi otomatikse altyazı dili doğrudan açılır
  assert.deepEqual(decideTracks(T, { audio: 'auto', sub: 'en', subIfMissing: true }), { audio: null, text: '3:0' });
});

test('decideTracks: izlerin dili hiç bilinmiyorsa “ses yok” denmez; altyazı kapat', () => {
  const unk = { audio: [{ id: '0:0', label: 'Ses 1', selected: true }], text: [A('2:0', 'tr')], textOn: false };
  assert.deepEqual(decideTracks(unk, { audio: 'de', sub: 'tr', subIfMissing: true }), { audio: null, text: null });
  assert.deepEqual(decideTracks({ ...T, textOn: true }, { audio: 'auto', sub: 'off' }), { audio: null, text: 'off' });
  assert.deepEqual(decideTracks({ ...T, textOn: false }, { audio: 'auto', sub: 'off' }), { audio: null, text: null });
  assert.deepEqual(decideTracks({ audio: [], text: [], textOn: false }, { audio: 'en', sub: 'tr' }), { audio: null, text: null });
});

test('normalize: bilinmeyen değer otomatiğe döner', () => {
  assert.equal(normalizeAudioLang('xx'), 'auto');
  assert.equal(normalizeAudioLang('de'), 'de');
  assert.equal(normalizeSubLang('off'), 'off');
  assert.equal(normalizeSubLang(undefined), 'auto');
  assert.ok(AUDIO_LANGS.length === SUB_LANGS.length - 1);
});
