// "Bugün TV'de": TV rehberindeki programları tür (spor / film / dizi) ve kanala göre süzer. Saf mantık; ekran today-ui.js'tedir.
import { fold } from './util.js';

export const KINDS = [
  ['spor', 'Spor'],
  ['film', 'Film'],
  ['dizi', 'Dizi'],
];
export const MAX_ROWS = 400;
const DAY_MS = 24 * 3600e3;

// Rehberin <category> bilgisi (p.c) en güvenilir kaynaktır; yoksa (eski önbellek, kategorisiz rehber) başlık ve açıklamadan yalnız çok belirgin kalıplar.
const RE_SERIES_CAT = /\b(dizi|series|serial|soap|sitcom|telenovela|tv show)\b/;
const RE_FILM_CAT = /\b(film|filmi|movie|movies|sinema|cinema|drama|dramatic|comedy|komedi|action|aksiyon|adventure|macera|romance|romantik|thriller|gerilim|horror|korku|western|science fiction|sci-fi|bilim kurgu|animation|animasyon|documentary|belgesel)\b/;
const RE_SPORT_CAT = /\b(spor|sport|sports|futbol|football|soccer|basket|basketbol|basketball|voleybol|volleyball|tenis|tennis|formula|motorsport|boks|boxing|gures|golf|rugby|hentbol)\b/;
const RE_NEWS = /\b(haber|haberleri|bulten|magazin|news)\b/;
const RE_SPORT_TITLE = /\b(maci|macin|maclar|maclari|canli mac|mac ozeti|super lig|premier lig|sampiyonlar ligi|uefa|euroleague|nba|formula 1|f1|la liga|bundesliga|serie a|tff|1\. lig|avrupa ligi|konferans ligi|dunya kupasi|avrupa sampiyonasi)\b/;
const RE_SERIES_TITLE = /(\b\d{1,3}\s*\.?\s*bolum\b|\bsezon\b|\bs\d{1,2}\s*e\d{1,3}\b)/;
const RE_FILM_TITLE = /^(film|sinema)\s*[:\-–]/;
const RE_EPISODE = /\b(\d{1,3}\s*\.?\s*bolum|sezon|s\d{1,2}\s*e\d{1,3})\b/;
const RE_NON_FILM = /\b(haber|haberleri|bulten|news|talk show|sohbet|magazin|magazine|reality|yarismasi|yarisma|cocuk|cocuklar|cizgi film|muzik|music|konser|hava durumu|weather|vaaz|ibadet|egitim|education|game show)\b/;

export function channelKind(name) {
  const n = fold(String(name || '')).replace(/[^a-z0-9]+/g, ' ').trim();
  if (!n) return '';
  // Kanal türü EPG başlığından/kategorisinden üstündür.
  if (n === 'a para' || n.startsWith('a para ')) return 'ignore';
  if (/(^| )fb tv( |$)/.test(n)) return 'spor';
  if (/^(a spor|trt spor|trt spor yildiz|s sport|s sports|bein sport|bein sports|sports tv|sport tv|tivibu spor|eurosport|fb tv|b spor)( |$)/.test(n) || n.includes('b n sp rts') || n.includes('b n sports')) return 'spor';
  if (n === 'bein series' || n.startsWith('bein series ')) return 'dizi';
  if (n.includes('sinema') || n.includes('bein movies') || n.includes('moviesmart') || n.includes('movie smart') || n.includes('filmbox') || n.includes('film box') || n.includes('cinefilm') || n.startsWith('cine 1')) return 'film';
  return '';
}

export function kindOf(p) {
  const c = fold(String((p && p.c) || ''));
  const t = fold(String((p && p.t) || ''));
  const d = fold(String((p && p.d) || ''));

  // EPG kategori ve program başlığı açıkça tür belirtiyorsa kullan.
  if (RE_SPORT_CAT.test(c)) return RE_NEWS.test(c) || RE_NEWS.test(t) ? '' : 'spor';
  if (RE_SERIES_CAT.test(c)) return 'dizi';
  if (RE_NON_FILM.test(c)) return '';
  if (RE_SERIES_TITLE.test(t) || RE_EPISODE.test(d)) return 'dizi';
  if (RE_SPORT_TITLE.test(t) && !RE_NEWS.test(t)) return 'spor';
  if (RE_NEWS.test(c) || RE_NEWS.test(t)) return '';
  if (['film', 'filmi', 'movie', 'movies', 'sinema', 'cinema'].some((word) => c.includes(word)) || RE_FILM_TITLE.test(t) || /\b(film|filmi|movie|movies|sinema|cinema)\b/.test(t)) return 'film';
  const sharedFilmGenre = RE_FILM_CAT.test(c) || RE_FILM_CAT.test(d);
  if (sharedFilmGenre && RE_EPISODE.test(t)) return 'dizi';
  if (RE_NON_FILM.test(c) || RE_NON_FILM.test(t)) return '';
  // Süre tek başına film kanıtı değildir; haber, spor, yarışma ve dizi
  // yayınları uzun sürdükleri için bu yolla yanlış sınıflandırılmamalıdır.
  return '';
}

// Yerel takvim gününün başlangıcı; offset: 0 bugün, 1 yarın
export function dayStart(now, offset = 0) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.getTime();
}

// Seçili kanallar boşsa bütün rehber kanalları. entries: [{ id: kanal öğesi no, p: program }] (aynı program+kanal tekrar etmez).
// Döner: { rows: [{ id, p, kind, state: 'past'|'now'|'next' }] başlangıç sırasıyla, counts: { spor, film, dizi }, truncated }
export function todayRows({ entries, kind, now, day = 0, includePast = false, maxRows = MAX_ROWS }) {
  const from = dayStart(now, day);
  const to = from + DAY_MS;
  const seen = new Set();
  const counts = { spor: 0, film: 0, dizi: 0 };
  const rows = [];
  for (const { id, p, channel } of entries) {
    if (!p || p.s < from || p.s >= to) continue;
    const byChannel = channelKind(channel);
    if (byChannel === 'ignore') continue;
    const k = byChannel || kindOf(p);
    if (!k) continue;
    const key = `${id}|${p.s}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const past = p.e <= now;
    if (!past || includePast) counts[k]++;
    if (k !== kind) continue;
    if (past && !includePast) continue;
    rows.push({ id, p, kind: k, state: past ? 'past' : p.s <= now ? 'now' : 'next' });
  }
  rows.sort((a, b) => a.p.s - b.p.s || String(a.id).localeCompare(String(b.id)));
  return { rows: rows.slice(0, maxRows), counts, truncated: rows.length > maxRows };
}

// Kanal seçimi tercihinde yalnız metin kimlikleri tutulur (bozuk/eski kayıt olursa boş)
export const normalizeChannels = (v) => (Array.isArray(v) ? [...new Set(v.map(String))].slice(0, 200) : []);
