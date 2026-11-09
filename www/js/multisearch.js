// Çok kaynaklı birleşik arama: kayıtlı tüm kaynakların katalogları aynı anda aranır, sonuç kaynak adıyla etiketlenir.
// Saf mantık: katalogları yükleme ve görünürlük süzgeci dışarıdan verilir.
import { search } from './catalog.js';
import { fold } from './util.js';

const KEYS = { live: 'live', movie: 'movies', series: 'series' }; // tür → katalog alanı

// entries: [{ src: { id, name }, cat, visible(kind, list) }] — ilk sıradaki (etkin) kaynağın sonuçları eşitlikte öne gelir.
// → { live: [{ it, src }], movie: [...], series: [...] }; her tür en çok `cap` sonuç.
export function searchAll(entries, query, cap = 3000) {
  const out = { live: [], movie: [], series: [] };
  const terms = fold(String(query || '')).split(' ').filter(Boolean);
  if (!terms.length) return out;
  for (const kind of Object.keys(out)) {
    const starts = [];
    const rest = [];
    for (const e of entries) {
      if (!e || !e.cat) continue;
      const list = e.visible ? e.visible(kind, e.cat[KEYS[kind]] || []) : e.cat[KEYS[kind]] || [];
      for (const it of search(list, query, cap)) {
        const f = it.f ?? fold(it.name);
        (f.startsWith(terms[0]) ? starts : rest).push({ it, src: e.src });
      }
    }
    out[kind] = starts.concat(rest).slice(0, cap);
  }
  return out;
}

// Sonuç sayısı
export const totalOf = (r) => r.live.length + r.movie.length + r.series.length;
