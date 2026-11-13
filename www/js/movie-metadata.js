// Harici film kimliği ve IMDb puanı eşleştirmesi. Yalnız kesin başlık/yıl eşleşmesi gösterilir.
import { fold } from './util.js';

const BASE = 'https://v3-cinemeta.strem.io';
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
    if (sameYear.length === 1) return sameYear[0];
    if (sameYear.length > 1) return null;
    return null;
  }
  return exact.length === 1 ? exact[0] : null;
}

export function loadMovieMetadata(net, item, vodInfo = null) {
  const title = String(item && (item.name || item.title) || '').trim();
  if (!title) return Promise.resolve(null);
  const year = yearOf((vodInfo && vodInfo.year) || (item && item.year) || title);
  const query = encodeURIComponent(title.replace(/\s*\(\d{4}\)\s*$/, '').trim());
  const catalog = await net.json(`${BASE}/catalog/movie/top/search=${query}.json`);
  const metas = catalog && catalog.metas;
  const match = matchMovieMetadata(metas, title, year);
  if (!match || !/^tt\d+$/.test(String(match.imdb_id || match.id || ''))) return null;
  const id = String(match.imdb_id || match.id);
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
  return task.then((value) => {
    done.set(key, value);
    while (done.size > 500) done.delete(done.keys().next().value);
    return value;
  }).finally(() => busy.delete(key));
}
