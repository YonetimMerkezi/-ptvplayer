// Başlık eşleştirme (saf mantık): Türkçe / özgün ad varyantlarını (noktalama, ek, küçük farklar) tolere eden bulanık eşleşme.
// Oyuncu sayfasındaki yapımları (Cinemeta: İngilizce ad + Wikidata'dan Türkçe ad) kullanıcının listesindeki adlarla eşleştirir.
import { fold } from './util.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and']);
const isYear = (t) => /^(?:19|20)\d{2}$/.test(t);
const isNum = (t) => /^\d+$/.test(t) && !isYear(t);

// "Fleet Sokağı'nın" ile "Fleet Sokağının" aynı sayılsın: kesme işaretleri atılır, harfler sadeleşir
export function tokensOf(s) {
  return fold(String(s || '')).replace(/['’ʼ`´]/g, '').split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t) && !isYear(t));
}

// Dice benzerliği (0..1): iki ad ortak sözcüklerle ne kadar örtüşüyor
export function dice(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const t of A) if (B.has(t)) common += 1;
  return (2 * common) / (A.size + B.size);
}

const sameNums = (a, b) => {
  const x = a.filter(isNum).sort().join(',');
  const y = b.filter(isNum).sort().join(',');
  return x === y;
};

// Eşik: iki yıl da biliniyorsa (±1) 0,8; kısa adlarda (3 sözcük altı) 0,9; yıl bilinmiyorsa 0,9 ve sıra numaraları aynı olmalı ("Toy Story" ≠ "Toy Story 2").
// loose (makine çevirisiyle üretilmiş Türkçe tahmin adları): iki yıl biliniyorsa 0,6 (kısa adda 0,8); yıl bilinmiyorsa 0,8 ve sıra numaraları aynı.
export function acceptable(score, a, b, yearA, yearB, loose = false) {
  if (yearA && yearB) {
    if (Math.abs(yearA - yearB) > 1) return false;
    const short = Math.min(new Set(a).size, new Set(b).size) < 3;
    return score >= (loose ? (short ? 0.8 : 0.6) : (short ? 0.9 : 0.8));
  }
  return score >= (loose ? 0.8 : 0.9) && sameNums(a, b);
}

const MAX_POSTING = 3000; // çok yaygın sözcükler ("film", "love") aday toplamayı yavaşlatmasın
const cache = new WeakMap();
// Ad dizini (Map: anahtar → [{ it, year }]) için sözcük → anahtarlar tersine dizini; dizin değişmedikçe bir kez kurulur
function tokenIndex(titleIndex) {
  let t = cache.get(titleIndex);
  if (t) return t;
  const keys = [];
  const post = new Map();
  for (const key of titleIndex.keys()) {
    const tokens = tokensOf(key);
    const at = keys.push({ key, tokens }) - 1;
    for (const tk of new Set(tokens)) {
      if (!post.has(tk)) post.set(tk, []);
      post.get(tk).push(at);
    }
  }
  t = { keys, post };
  cache.set(titleIndex, t);
  return t;
}

// Dizinde ada en çok benzeyen kayıt ({ it, year, score }) ya da null. İki farklı kayıt neredeyse eşit benzerse (belirsiz) null.
export function fuzzyFind(titleIndex, name, year = 0, { loose = false } = {}) {
  if (!titleIndex || !titleIndex.size) return null;
  const a = tokensOf(name);
  if (new Set(a).size < 2) return null; // tek sözcüklü adlar yalnız tam eşleşir
  const { keys, post } = tokenIndex(titleIndex);
  const cand = new Set();
  for (const tk of new Set(a)) {
    const list = post.get(tk);
    if (list && list.length <= MAX_POSTING) for (const i of list) cand.add(i);
  }
  let best = null;
  let second = null;
  for (const i of cand) {
    const { key, tokens } = keys[i];
    const score = dice(a, tokens);
    if (score < (loose ? 0.6 : 0.8)) continue;
    for (const e of titleIndex.get(key)) {
      if (!acceptable(score, a, tokens, year, e.year, loose)) continue;
      const hit = { it: e.it, year: e.year, score };
      if (!best || score > best.score) { second = best; best = hit; } else if (!second || score > second.score) second = hit;
    }
  }
  if (!best) return null;
  if (second && second.it !== best.it && best.score - second.score < 0.04) return null; // belirsiz
  return best;
}
