// Hazır fragman yoksa başlığı YouTube arama sayfasında arar ve ilk uygun resmi fragmanı seçer (anahtarsız; sayfadaki ytInitialData okunur).
// Sayfa düzeni değişirse ya da ağ yoksa boş döner; çağıran "YouTube’da ara" düğmesine düşer. Oynatma resmî gömülü oynatıcıyla yapılır.
import { fold } from './util.js';

export const YT_RESULTS = 'https://www.youtube.com/results';
export const FIND_TTL = 14 * 86400000;
export const FIND_MISS_TTL = 3600000;
// Yerel indirme eklentisi varsayılan olarak mobil tarayıcı kimliği gönderir; YouTube buna farklı (mobil) sayfa verir. Masaüstü kimliği ve onay çerezi
// ile ytInitialData'daki videoRenderer düzeni gelir. (Tarayıcıda user-agent başlığı yok sayılır; sorun değil.)
export const YT_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8',
  cookie: 'SOCS=CAI; CONSENT=YES+1',
};
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

// JS dizge değişmezinin içeriği ('\\x7b\\x22…' gibi kaçışlı) → düz metin
function unescapeJs(body) {
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== '\\') { out += ch; continue; }
    const n = body[++i];
    if (n === 'x') { out += String.fromCharCode(parseInt(body.substr(i + 1, 2), 16)); i += 2; }
    else if (n === 'u') { out += String.fromCharCode(parseInt(body.substr(i + 1, 4), 16)); i += 4; }
    else out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n;
  }
  return out;
}

// Parantez sayarak src[start] ('{') ile başlayan JSON nesnesinin kapanış dizinini bulur (dizge içindeki parantezler atlanır); yoksa -1.
function objectEnd(src, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  return -1;
}

// Sayfadaki her ytInitialData geçişini dener: düz nesne ("= {…}") ya da kaçışlı dizge (JSON.parse('\\x7b…')). İlk çözülen veri döner.
function* initialData(src) {
  for (let from = 0; ; ) {
    const at = src.indexOf('ytInitialData', from);
    if (at < 0) return;
    from = at + 13;
    const m = /^["'\]]*\s*=\s*(JSON\.parse\(\s*(['"])|\{)/.exec(src.slice(from, from + 80));
    if (!m) continue;
    const bodyAt = from + m[0].length;
    try {
      if (m[2]) {
        let end = bodyAt;
        while (end < src.length && src[end] !== m[2]) end += src[end] === '\\' ? 2 : 1;
        yield JSON.parse(unescapeJs(src.slice(bodyAt, end)));
      } else {
        const start = bodyAt - 1;
        const end = objectEnd(src, start);
        if (end > start) yield JSON.parse(src.slice(start, end + 1));
      }
    } catch { /* bu geçiş çözülemedi; sonrakini dene */ }
  }
}

// Masaüstü sayfada videoRenderer; mobil sayfada videoWithContextRenderer (başlık "headline") ya da compactVideoRenderer gelir.
const VIDEO_RENDERERS = ['videoRenderer', 'videoWithContextRenderer', 'compactVideoRenderer'];
const lengthOf = (v) => {
  const direct = secondsOf(text(v.lengthText));
  if (direct) return direct;
  for (const o of Array.isArray(v.thumbnailOverlays) ? v.thumbnailOverlays : []) {
    const t = o && o.thumbnailOverlayTimeStatusRenderer && text(o.thumbnailOverlayTimeStatusRenderer.text);
    if (t) return secondsOf(t);
  }
  return 0;
};

// Arama sayfası HTML'i → [{ id, title, channel, seconds, verified }] (sayfadaki sırayla; kısa video/oynatma listesi/kanal olmayanlar)
export function parseYoutubeResults(html) {
  const src = String(html || '');
  for (const data of initialData(src)) {
    const out = [];
    const seen = new Set();
    const walk = (node, d) => {
      if (!node || typeof node !== 'object' || d > 40) return;
      if (Array.isArray(node)) { for (const x of node) walk(x, d + 1); return; }
      for (const key of VIDEO_RENDERERS) {
        const v = node[key];
        if (v && typeof v.videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v.videoId) && !seen.has(v.videoId)) {
          seen.add(v.videoId);
          const badges = Array.isArray(v.ownerBadges) ? v.ownerBadges : [];
          out.push({
            id: v.videoId,
            title: text(v.title) || text(v.headline),
            channel: text(v.ownerText) || text(v.longBylineText) || text(v.shortBylineText),
            seconds: lengthOf(v),
            verified: badges.some((b) => /VERIFIED|OFFICIAL/i.test(JSON.stringify((b && b.metadataBadgeRenderer) || {}))),
          });
        }
      }
      for (const k of Object.keys(node)) if (!VIDEO_RENDERERS.includes(k)) walk(node[k], d + 1);
    };
    walk(data, 0);
    if (out.length) return out;
  }
  return [];
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

// query ile arar; bulunamayan sonuç yalnız sayfa okunabildiyse (video sayısı > 0) önbelleğe yazılır, ağ hatasında null döner ve yazılmaz.
// onInfo({ read, bytes, error, cached }): ekranda "neden bulunamadı" bilgisi göstermek için.
export async function findTrailerOnYoutube({ net, cache = null, query, wanted = [], now = Date.now(), onInfo = null }) {
  const q = String(query || '').trim();
  if (!q) return [];
  const info = (i) => { if (onInfo) onInfo(i); };
  const key = 'yt-trailer:v2:' + fold(q);
  const hit = cache ? await cache.get(key).catch(() => null) : null;
  if (hit && Array.isArray(hit.picks) && typeof hit.at === 'number' && now - hit.at < (hit.picks.length ? FIND_TTL : FIND_MISS_TTL)) {
    info({ read: Number(hit.read) || hit.picks.length, bytes: 0, error: '', cached: true });
    return hit.picks;
  }
  let html;
  try {
    html = await net.text(resultsUrl(q), { fast: true, headers: YT_HEADERS });
  } catch (e) {
    info({ read: 0, bytes: 0, error: String((e && e.message) || e || 'bağlantı hatası'), cached: false });
    return null;
  }
  const results = parseYoutubeResults(html);
  const picks = pickTrailers(results, wanted);
  info({ read: results.length, bytes: String(html || '').length, error: '', cached: false });
  if (cache && (picks.length || results.length)) await cache.set(key, { at: now, picks, read: results.length }).catch(() => {});
  return picks;
}

// Hiç fragman seçilemediğinde kullanıcıya gösterilecek kısa neden (tüm denemelerin bilgisinden).
export function describeFind(infos) {
  const list = (Array.isArray(infos) ? infos : []).filter(Boolean);
  if (!list.length) return '';
  const read = Math.max(...list.map((i) => Number(i.read) || 0));
  if (read > 0) return `YouTube aramasında ${read} video bulundu, uygun fragman çıkmadı`;
  if (list.every((i) => i.error)) return `YouTube araması yapılamadı: ${String(list[0].error).slice(0, 60)}`;
  const kb = Math.round(Math.max(...list.map((i) => Number(i.bytes) || 0)) / 1024);
  return `YouTube sayfası okunamadı (${kb} KB yanıt, 0 video)`;
}
