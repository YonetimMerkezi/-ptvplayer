// TV rehberi zaman çizelgesi: bir kanalın programlarını pencereye (ws..we, ms) oturtur.
import { fold } from './util.js';

// Çıktı blokları birbirine binmez; başlangıç/süre dakika cinsindendir (pencere başından).
export function guideBlocks(list, ws, we, now = Date.now()) {
  const out = [];
  let cursor = ws;
  for (const p of list || []) {
    if (!p || !Number.isFinite(p.s) || !Number.isFinite(p.e)) continue;
    const s = Math.max(p.s, cursor);
    const e = Math.min(p.e, we);
    if (!(e - s >= 60000)) continue; // pencere dışında ya da başka programın içinde kalan / 1 dakikadan kısa
    cursor = e;
    out.push({ p, m: (s - ws) / 60000, d: (e - s) / 60000, cls: p.s <= now && p.e > now ? ' now' : p.e <= now ? ' past' : '' });
  }
  return out;
}

// Kanal adı: sondaki kalite etiketi (HEVC, UHD, FHD, HD, 4K, SD, RAW) ikinci satıra alınır. Dönen: [ad, etiket ('' olabilir)]
export function guideNameParts(name) {
  const text = String(name == null ? '' : name).trim();
  const m = /^(.*?)[\s|\-–]*\b(HEVC|UHD|FHD|HD|4K|SD|RAW)\b\s*$/i.exec(text);
  return m && m[1].trim() ? [m[1].trim(), m[2].toUpperCase()] : [text, ''];
}

// Kategori satırının simgesi (adına göre): index.html'deki simge adı ya da '4k' (metin rozeti).
export function guideCatIconName(name, { id = '', folder = false } = {}) {
  if (id === '__all') return 'tv';
  if (id === '__fav') return 'star';
  if (id === '__recent') return 'clock';
  const n = fold(name);
  if (/\b(4k|uhd)\b/.test(n)) return '4k';
  if (/\b(haber|haberleri|news)\b/.test(n)) return 'news';
  if (/\bfeed\b/.test(n)) return 'rss';
  if (/(^|[^a-z0-9])s sports?\b/.test(n)) return 'trophy';
  if (/spor/.test(n)) return 'ball';
  if (/\b(tabii|exxen|film|filmler|sinema|cinema|movie|movies|dizi|diziler|series|gain|netflix|blu)\b/.test(n)) return 'movie';
  if (/\b(ulusal|national|yerel|local)\b/.test(n)) return 'broadcast';
  return folder ? 'folder' : 'tv';
}
