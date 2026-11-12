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
const RE_FILM_CAT = /\b(film|filmi|movie|movies|sinema|cinema)\b/;
const RE_SPORT_CAT = /\b(spor|sport|sports|futbol|football|soccer|basket|basketbol|basketball|voleybol|volleyball|tenis|tennis|formula|motorsport|boks|boxing|gures|golf|rugby|hentbol)\b/;
const RE_NEWS = /\b(haber|haberleri|bulten|magazin|news)\b/;
const RE_SPORT_TITLE = /\b(maci|macin|maclar|maclari|canli mac|mac ozeti|super lig|premier lig|sampiyonlar ligi|uefa|euroleague|nba|formula 1|f1|la liga|bundesliga|serie a|tff|1\. lig|avrupa ligi|konferans ligi|dunya kupasi|avrupa sampiyonasi)\b/;
const RE_SERIES_TITLE = /(\b\d{1,3}\s*\.?\s*bolum\b|\bsezon\b|\bs\d{1,2}\s*e\d{1,3}\b)/;
const RE_FILM_TITLE = /^(film|sinema)\s*[:\-–]/;

export function kindOf(p) {
  const c = fold(String((p && p.c) || ''));
  const t = fold(String((p && p.t) || ''));
  if (c) {
    if (RE_SERIES_CAT.test(c)) return 'dizi';
    if (RE_FILM_CAT.test(c)) return 'film';
    if (RE_SPORT_CAT.test(c)) return RE_NEWS.test(c) || RE_NEWS.test(t) ? '' : 'spor';
    return '';
  }
  if (RE_SERIES_TITLE.test(t)) return 'dizi';
  if (RE_FILM_TITLE.test(t)) return 'film';
  if (RE_SPORT_TITLE.test(t) && !RE_NEWS.test(t)) return 'spor';
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
  for (const { id, p } of entries) {
    if (!p || p.s < from || p.s >= to) continue;
    const k = kindOf(p);
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
