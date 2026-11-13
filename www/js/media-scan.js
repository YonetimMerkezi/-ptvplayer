// Film ve dizi kataloğunu arka planda toplu tarar. Her kayıt kendi kalıcı önbelleğine yazılır.
import { loadMovieMetadata, matchMovieMetadata, parseMovieCatalogTitle } from './movie-metadata.js';
import { loadMovieAdvisories } from './movie-advisories.js';
import { loadVodInfo } from './catalog.js';

const BASE = 'https://v3-cinemeta.strem.io';
const active = new Map();
const clean = (s) => String(s || '').trim();
const yearOf = (s) => { const m = String(s || '').match(/(?:19|20)\d{2}/); return m ? Number(m[0]) : 0; };
const keyOf = (item) => clean(item && (item.name || item.title)).toLocaleLowerCase('tr');

async function loadSeriesMetadata(net, item, store) {
  const parsed = parseMovieCatalogTitle(item.name || item.title || '');
  if (!parsed.title) return null;
  const year = yearOf(item.year || item.release_date) || parsed.year;
  const key = 'series-metadata:v1:' + keyOf({ name: parsed.title }) + ':' + year;
  const cached = await store.cache.get(key).catch(() => null);
  if (cached && cached.savedAt && Date.now() - cached.savedAt < (cached.value ? 30 : 1) * 86400000) return cached.value || null;
  const url = BASE + '/catalog/series/top/search=' + encodeURIComponent(parsed.title) + '.json';
  const catalog = await net.json(url, { fast: true });
  const match = matchMovieMetadata(catalog && catalog.metas, parsed.title, year);
  const id = String(match && (match.imdb_id || match.id) || '');
  if (!/^tt\d+$/.test(id)) {
    await store.cache.set(key, { savedAt: Date.now(), value: null }).catch(() => {});
    return null;
  }
  const detail = await net.json(BASE + '/meta/series/' + encodeURIComponent(id) + '.json', { fast: true });
  const meta = detail && detail.meta;
  if (!meta || String(meta.imdb_id || meta.id || '') !== id) return null;
  const rating = Number(meta.imdbRating);
  const value = { imdbId: id, imdbRating: Number.isFinite(rating) && rating > 0 && rating <= 10 ? rating.toFixed(1) : '', year: yearOf(meta.year) || year, title: meta.name || parsed.title, kind: 'series', source: 'Cinemeta' };
  await store.cache.set(key, { savedAt: Date.now(), value }).catch(() => {});
  return value;
}

export function startMediaScan({ source, catalog, net, store, onProgress = () => {} }) {
  if (!source || !catalog || active.has(source.id)) return active.get(source && source.id) || Promise.resolve();
  const items = [
    ...(Array.isArray(catalog.movies) ? catalog.movies : []).map((item) => ({ item, kind: 'movie' })),
    ...(Array.isArray(catalog.series) ? catalog.series : []).map((item) => ({ item, kind: 'series' })),
  ];
  if (!items.length) return Promise.resolve({ total: 0, done: 0 });
  const task = (async () => {
    let cursor = 0, done = 0, matched = 0, failed = 0;
    const worker = async () => {
      while (cursor < items.length) {
        const row = items[cursor++];
        try {
          if (row.kind === 'movie') {
            const vodInfo = source.type === 'xtream' ? await loadVodInfo(source, net, row.item).catch(() => null) : null;
            const meta = await loadMovieMetadata(net, row.item, vodInfo, store);
            if (meta) {
              matched++;
              await loadMovieAdvisories(net, store, meta, row.item).catch(() => null);
            }
          } else {
            const meta = await loadSeriesMetadata(net, row.item, store);
            if (meta) matched++;
          }
        } catch (_) { failed++; }
        done++;
        if (done === items.length || done % 5 === 0) onProgress({ total: items.length, done, matched, failed, kind: row.kind });
      }
    };
    await Promise.all([worker(), worker()]);
    return { total: items.length, done, matched, failed };
  })().finally(() => active.delete(source.id));
  active.set(source.id, task);
  return task;
}
