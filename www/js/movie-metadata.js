// Harici film kimliği ve IMDb puanı eşleştirmesi. Yalnız kesin başlık/yıl eşleşmesi gösterilir.
import { fold } from './util.js';

const BASE = 'https://v3-cinemeta.strem.io';
const CACHE_TTL = 30 * 86400000;
const done = new Map();
const busy = new Map();
const cleanTitle = (value) => fold(String(value || '').replace(/\s*\(\d{4}\)\s*$/, '').replace(/[._:]+/g, ' ').replace(/\s+/g, ' ').trim());
const yearOf = (value) => {
  const m = String(value || '').match(/(?:19|20)\d{2}/);
  return m ? Number(m[0]) : 0;
};
const titleOf = (meta) => [meta && meta.name, ...(Array.isArray(meta && meta.aliases) ? meta.aliases : [])].filter(Boolean);

export function matchMovieMetadata(results, title, year = 0) {
  const wanted = cleanTitle(title);
  if (!wanted || !Array.isArray(results)) return null;
  const exact = results.filter((m) => titleOf(m).some((name) => cleanTitle(name) === wanted));
  if (year) {
    const sameYear = exact.filter((m) => yearOf(m.year) === Number(year));
    return sameYear.length === 1 ? sameYear[0] : null;
  }
  return exact.length === 1 ? exact[0] : null;
}

export async function loadMovieMetadata(net, item, vodInfo = null, store = null) {
  const title = String(item && (item.name || item.title) || '').trim();
  if (!title) return null;
  const year = yearOf((vodInfo && vodInfo.year) || (item && item.year) || title);
  const key = `${cleanTitle(title)}|${year || 0}`;
  const persistentKey = 'movie-metadata:v1:' + key;
  const cached = store && store.cache ? await store.cache.get(persistentKey).catch(() => null) : null;
  if (cached && cached.savedAt && Date.now() - cached.savedAt < CACHE_TTL && cached.value) {
    done.set(key, cached.value);
    return cached.value;
  }
  if (done.has(key)) return done.get(key);
  if (busy.has(key)) return busy.get(key);

  const task = (async () => {
    const query = encodeURIComponent(title.replace(/\s*\(\d{4}\)\s*$/, '').trim());
    const catalog = await net.json(`${BASE}/catalog/movie/top/search=${query}.json`);
    const match = matchMovieMetadata(catalog && catalog.metas, title, year);
    const id = match && String(match.imdb_id || match.id || '');
    if (!/^tt\d+$/.test(id)) return null;

    const detail = await net.json(`${BASE}/meta/movie/${encodeURIComponent(id)}.json`);
    const meta = detail && detail.meta;
    if (!meta || String(meta.imdb_id || meta.id || '') !== id) return null;
    const rating = Number(meta.imdbRating);
    return {
      imdbId: id,
      imdbRating: Number.isFinite(rating) && rating > 0 && rating <= 10 ? rating.toFixed(1) : '',
      year: yearOf(meta.year) || year,
      title: meta.name || match.name || title,
      source: 'Cinemeta',
    };
  })();

  busy.set(key, task);
  return task.then(async (value) => {
    if (value) {
      done.set(key, value);
      while (done.size > 500) done.delete(done.keys().next().value);
      if (store && store.cache) await store.cache.set(persistentKey, { savedAt: Date.now(), value }).catch(() => {});
    }
    return value;
  }).finally(() => busy.delete(key));
}
