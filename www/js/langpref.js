// Tercih edilen ses ve altyazı dili: film/yayın açılınca uygun iz kendiliğinden seçilir (yalnız Android oynatıcı; izler motordan gelir).
// Eklenti iz dilini kod olarak (lang) verir; yoksa iz adından (“Türkçe”, “TUR”, “English”…) tanınır.
import { fold } from './util.js';

// [kod, ad, dil kodları, ad kalıbı]
export const LANGS = [
  ['tr', 'Türkçe', ['tr', 'tur'], /\b(turk|turkce|turkish|tur|tr)\b/],
  ['en', 'İngilizce', ['en', 'eng'], /\b(ingiliz|ingilizce|english|eng|en)\b/],
  ['de', 'Almanca', ['de', 'deu', 'ger'], /\b(alman|almanca|german|deutsch|ger|deu|de)\b/],
  ['ar', 'Arapça', ['ar', 'ara'], /\b(arap|arapca|arabic|ara|ar)\b/],
  ['ru', 'Rusça', ['ru', 'rus'], /\b(rus|rusca|russian|rus|ru)\b/],
  ['fr', 'Fransızca', ['fr', 'fra', 'fre'], /\b(fransiz|fransizca|french|francais|fra|fre|fr)\b/],
];
export const AUDIO_LANGS = [['auto', 'Otomatik (cihaz seçer)'], ...LANGS.map(([id, name]) => [id, name])];
export const SUB_LANGS = [['auto', 'Otomatik (dokunma)'], ['off', 'Kapalı'], ...LANGS.map(([id, name]) => [id, name])];
export const normalizeAudioLang = (v) => (AUDIO_LANGS.some(([id]) => id === v) ? v : 'auto');
export const normalizeSubLang = (v) => (SUB_LANGS.some(([id]) => id === v) ? v : 'auto');

// İzin dili: kod varsa koddan (tr-TR → tr), yoksa addan; tanınmazsa ''.
export function trackLang(track) {
  const code = String((track && track.lang) || '').toLowerCase().split(/[-_]/)[0];
  if (code && code !== 'und') {
    const hit = LANGS.find(([, , codes]) => codes.includes(code));
    if (hit) return hit[0];
  }
  const label = fold((track && track.label) || '');
  const hit = label && LANGS.find(([, , , re]) => re.test(label));
  return hit ? hit[0] : '';
}

// t: { audio, text, textOn } (motordan), pref: { audio, sub, subIfMissing }. Döner { audio: iz no | null, text: iz no | 'off' | null }; null = dokunma.
export function decideTracks(t, pref) {
  const audioPref = normalizeAudioLang(pref && pref.audio);
  const subPref = normalizeSubLang(pref && pref.sub);
  const audio = (t && t.audio) || [];
  const text = (t && t.text) || [];
  const out = { audio: null, text: null };
  let missing = false;
  if (audioPref !== 'auto' && audio.length) {
    const hit = audio.find((x) => trackLang(x) === audioPref);
    if (hit) {
      if (!hit.selected) out.audio = hit.id;
    } else if (audio.some((x) => trackLang(x))) missing = true; // hiçbir izin dili bilinmiyorsa "yok" denemez
  }
  if (subPref === 'off') {
    if (t && t.textOn) out.text = 'off';
  } else if (subPref !== 'auto' && text.length) {
    const only = !pref || pref.subIfMissing !== false;
    if (!only || audioPref === 'auto' || missing) {
      const hit = text.find((x) => trackLang(x) === subPref);
      if (hit && !hit.selected) out.text = hit.id;
    }
  }
  return out;
}
