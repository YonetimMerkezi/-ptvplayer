// Hazır fragman yoksa başlığı YouTube arama sayfasında arar ve ilk uygun resmi fragmanı seçer (anahtarsız; sayfadaki ytInitialData okunur).
// Sayfa düzeni değişirse ya da ağ yoksa boş döner; çağıran "YouTube’da ara" düğmesine düşer. Oynatma resmî gömülü oynatıcıyla yapılır.
import { fold } from './util.js';

export const YT_RESULTS = 'https://www.youtube.com/results';
export const FIND_TTL = 14 * 86400000;
export const FIND_MISS_TTL = 6 * 3600000;
export const MAX_FOUND = 3;
export const MIN_SECONDS = 15;
export const MAX_SECONDS = 330; // fragman 5,5 dakikadan uzun değildir; uzunlar çoğunlukla tam film/özet

const trailerish = /trailer|fragman|teaser|tizer|resmi|official/i;
const unwanted = /reaction|tepki|anlatt|özet|ozet|recap|review|inceleme|yorum|bölüm|bolum|episode|sahne|scene|soundtrack|müzik|muzik|ending|explained|analiz|vlog|parody|parodi|fan[ -]?made|tiktok|shorts|tek parça|tek parca|film izle|full movie|tüm film|izle\b/i;
const officialChannel = /netflix|hbo|\bmax\b|disney|warner|sony|universal|paramount|prime video|amazon|apple tv|marvel|lucasfilm|lionsgate|a24|mgm|focus features|trt|tabii|exxen|gain|blutv|puhu|kanal d|show tv|star tv|\batv\b|tv8|yapım|yapim|film|pictures|studios/i;

const text = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v.simpleText === 'string') return v.simpleText;
  return Array.isArray(v.runs) ? v.runs.map((r) => (r && r.text) || '').join('') : '';
};
const secondsOf = (s) => {
  const parts = String(s || '').trim().split(':').map(Number);
  if (!parts.length || parts.length > 3 || parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((a, n) => a * 60 + n, 0);
};
const tokens = (s) => fold(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1);

// Arama sayfası HTML'i → [{ id, title, channel, seconds, verified }] (sayfadaki sırayla; kısa video/oynatma listesi/kanal olmayanlar)
export function parseYoutubeResults(html) {
  const src = String(html || '');
  const at = src.indexOf('ytInitialData');
  if (at < 0) return [];
  const start = src.indexOf('{', at);
  if (start < 0) return [];
  // JSON nesnesinin sonunu parantez sayarak bul (dizge içindeki parantezler atlanır)
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) { end = i; break; }
  }
  if (end < 0) return [];
  let data;
  try { data = JSON.parse(src.slice(start, end + 1)); } catch { return []; }
  const out = [];
  const seen = new Set();
  const walk = (node, d) => {
    if (!node || typeof node !== 'object' || d > 40) return;
    if (Array.isArray(node)) { for (const x of node) walk(x, d + 1); return; }
    const v = node.videoRenderer;
    if (v && typeof v.videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v.videoId) && !seen.has(v.videoId)) {
      seen.add(v.videoId);
      const badges = Array.isArray(v.ownerBadges) ? v.ownerBadges : [];
      out.push({
        id: v.videoId,
        title: text(v.title),
        channel: text(v.ownerText) || text(v.longBylineText) || text(v.shortBylineText),
        seconds: secondsOf(text(v.lengthText)),
        verified: badges.some((b) => /VERIFIED|OFFICIAL/i.test(JSON.stringify(b && b.metadataBadgeRenderer || {}))),
      });
    }
    for (const k of Object.keys(node)) if (k !== 'videoRenderer') walk(node[k], d + 1);
  };
  walk(data, 0);
  return out;
}

// Sonuçlardan en uygun fragmanlar. wanted: aranan adlar (Türkçe ve özgün); başlık bunlarla örtüşüyorsa ya da ilk sıralardaki resmî (doğrulanmış/stüdyo/platform) kanalsa kabul edilir.
export function pickTrailers(results, wanted = []) {
  const names = (Array.isArray(wanted) ? wanted : [wanted]).map(tokens).filter((t) => t.length);
  const overlap = (title) => {
    const have = new Set(tokens(title));
    return Math.max(0, ...names.map((n) => n.filter((t) => have.has(t)).length / n.length));
  };
  return (Array.isArray(results) ? results : [])
    .map((r, i) => {
      const official = !!r.verified || officialChannel.test(r.channel || '');
      return { r, i, official, ov: overlap(r.title) };
    })
    .filter(({ r, i, official, ov }) => trailerish.test(r.title) && !unwanted.test(r.title) && r.seconds >= MIN_SECONDS && r.seconds <= MAX_SECONDS && (ov >= 0.6 || (official && i < 3)))
    .map((x) => ({ ...x, score: 20 - x.i + (x.ov >= 0.6 ? 6 : 0) + (x.official ? 4 : 0) + (/official trailer|resmi fragman/i.test(x.r.title) ? 2 : 0) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, MAX_FOUND)
    .map(({ r }) => ({ id: r.id, title: r.title, channel: r.channel }));
}

export const resultsUrl = (query) => `${YT_RESULTS}?search_query=${encodeURIComponent(String(query || '').trim())}&sp=EgIQAQ%253D%253D`; // sp: yalnız videolar

// query ile arar; sonuç (boş dahi) önbelleğe yazılır, ağ hatasında null döner ve yazılmaz.
export async function findTrailerOnYoutube({ net, cache = null, query, wanted = [], now = Date.now() }) {
  const q = String(query || '').trim();
  if (!q) return [];
  const key = 'yt-trailer:v1:' + fold(q);
  const hit = cache ? await cache.get(key).catch(() => null) : null;
  if (hit && Array.isArray(hit.picks) && typeof hit.at === 'number' && now - hit.at < (hit.picks.length ? FIND_TTL : FIND_MISS_TTL)) return hit.picks;
  let html;
  try {
    html = await net.text(resultsUrl(q), { fast: true, headers: { 'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8' } });
  } catch (_) {
    return null;
  }
  const picks = pickTrailers(parseYoutubeResults(html), wanted);
  if (cache) await cache.set(key, { at: now, picks }).catch(() => {});
  return picks;
}
