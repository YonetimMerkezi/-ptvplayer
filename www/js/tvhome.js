// Android TV ana ekranındaki "Devam et" satırı (Watch Next) için liste ve derin bağlantı (saf mantık).

export const WATCH_NEXT_LIMIT = 8;
const SCHEME = 'iptvpro://play';

// Devam edilebilir (yarıda bırakılmış) film ve bölümler: dizide yalnız en son bölüm, en yeni üstte.
// entries: store.continueWatching çıktısı { id, kind: 'movie'|'episode', name, logo, parent, pos, dur, at }
export function watchNextItems(entries, { limit = WATCH_NEXT_LIMIT } = {}) {
  const seen = new Set();
  const out = [];
  const sorted = (entries || []).filter((p) => p && p.id && p.dur > 0 && p.pos >= 15000 && p.pos / p.dur < 0.95).sort((a, b) => (b.at || 0) - (a.at || 0));
  for (const p of sorted) {
    const key = p.kind === 'episode' && p.parent ? 'p:' + p.parent : 'i:' + p.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: String(p.id), kind: p.kind === 'episode' ? 'episode' : 'movie', title: String(p.name || ''), poster: p.logo || '', parent: p.parent ? String(p.parent) : '', pos: Math.round(p.pos), dur: Math.round(p.dur), at: p.at || 0 });
    if (out.length >= limit) break;
  }
  return out;
}

// iptvpro://play?src=..&kind=movie|episode|live&id=..&parent=..&pos=..
export function deepLink({ src = '', kind, id, parent = '', pos = 0 }) {
  const q = new URLSearchParams();
  if (src) q.set('src', src);
  q.set('kind', kind);
  q.set('id', String(id));
  if (parent) q.set('parent', String(parent));
  if (pos > 0) q.set('pos', String(Math.round(pos)));
  return `${SCHEME}?${q.toString()}`;
}

export function parseDeepLink(uri) {
  if (typeof uri !== 'string' || !uri.startsWith(SCHEME)) return null;
  let q;
  try {
    q = new URL(uri.replace('iptvpro://', 'http://x/')).searchParams;
  } catch {
    return null;
  }
  const kind = q.get('kind');
  const id = q.get('id');
  if (!id || !['movie', 'episode', 'live'].includes(kind)) return null;
  const pos = Number(q.get('pos'));
  return { src: q.get('src') || '', kind, id, parent: q.get('parent') || '', pos: Number.isFinite(pos) && pos > 0 ? pos : 0 };
}

// Eklentiye giden satır: derin bağlantı eklenir.
export function watchNextPayload(items, src) {
  return items.map((it) => ({ ...it, uri: deepLink({ src, kind: it.kind, id: it.id, parent: it.parent, pos: it.pos }) }));
}
