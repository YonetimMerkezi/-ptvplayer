// Çocuk profili: kaynak başına izinli kategoriler (beyaz liste). Çocuk modu açıkken katalog yalnız bu kategorileri içerir;
// ayarlar ve kaynaklar gizlenir, çıkış için ayrı bir çocuk-modu şifresi gerekir. Saf mantık: ağ ya da ekran yok.

export const KID_KINDS = [
  ['live', 'Canlı TV'],
  ['movie', 'Filmler'],
  ['series', 'Diziler'],
];
export const CAT_KEYS = { live: 'live', movie: 'movies', series: 'series' }; // tür → katalog alanı

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const MAX_NAMES = 2000;

// Depodan gelen değeri { kaynakKimliği: { live: [ad], movie: [ad], series: [ad] } } biçimine sokar (bozuk girdiler atılır).
export function normalizeAllow(v) {
  const out = {};
  if (!isObj(v)) return out;
  for (const [sid, kinds] of Object.entries(v)) {
    if (!sid || sid === '__proto__' || !isObj(kinds)) continue;
    const o = {};
    for (const [k] of KID_KINDS) {
      const names = Array.isArray(kinds[k]) ? kinds[k].filter((n) => typeof n === 'string' && n.length <= 200) : [];
      o[k] = [...new Set(names)].slice(0, MAX_NAMES);
    }
    out[sid] = o;
  }
  return out;
}

export const groupOf = (it) => (it && it.group) || 'Diğer';

export function allowSet(allow, sid, kind) {
  const a = isObj(allow) && isObj(allow[sid]) ? allow[sid][kind] : null;
  return new Set(Array.isArray(a) ? a : []);
}

export const countAllowed = (allow, sid, kind) => allowSet(allow, sid, kind).size;
export const hasAllowed = (allow, sid) => KID_KINDS.some(([k]) => countAllowed(allow, sid, k) > 0);

// Yalnız izinli kategorilerdeki öğeler.
export function filterAllowed(list, set) {
  if (!set || !set.size) return [];
  return (list || []).filter((it) => set.has(groupOf(it)));
}

// Ham katalogdan (live/movies/series) çocuğa açık olan katalog.
export function applyKid(raw, allow, sid) {
  return {
    ...raw,
    live: filterAllowed(raw.live, allowSet(allow, sid, 'live')),
    movies: filterAllowed(raw.movies, allowSet(allow, sid, 'movie')),
    series: filterAllowed(raw.series, allowSet(allow, sid, 'series')),
  };
}

function withNames(allow, sid, kind, names) {
  const base = normalizeAllow(allow);
  const cur = base[sid] || { live: [], movie: [], series: [] };
  base[sid] = { ...cur, [kind]: [...new Set(names)].slice(0, MAX_NAMES) };
  return base;
}

export function toggleAllowed(allow, sid, kind, name) {
  const set = allowSet(allow, sid, kind);
  if (set.has(name)) set.delete(name);
  else set.add(name);
  return withNames(allow, sid, kind, [...set]);
}

export const setAllowed = (allow, sid, kind, names) => withNames(allow, sid, kind, names);

// Silinen kaynakların kayıtları temizlenir.
export function pruneAllow(allow, sids) {
  const keep = new Set(sids);
  const out = {};
  for (const [sid, v] of Object.entries(normalizeAllow(allow))) if (keep.has(sid)) out[sid] = v;
  return out;
}

// Çocuk modu geçerli mi: açık işaretli ve çıkış şifresi var.
export const kidActiveOf = (on, pinRec) => !!on && !!(pinRec && pinRec.hash);
