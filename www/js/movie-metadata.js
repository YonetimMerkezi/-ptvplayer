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
export function parseMovieCatalogTitle(value) {
  const raw = String(value || '').trim();
  const parts = raw.split(/\s*\|\s*/).map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1 && /^(?:19|20)\d{2}$/.test(parts[1])) {
    return { title: parts[0], year: Number(parts[1]) };
  }
  const yearMatch = raw.match(/\s*\((19|20)\d{2}\)\s*$/);
  return { title: raw.replace(/\s*\((?:19|20)\d{2}\)\s*$/, '').trim(), year: yearMatch ? Number(yearMatch[0].match(/\d{4}/)[0]) : 0 };
}

const titleOf = (meta) => [
  meta && meta.name,
  meta && meta.original_name,
  meta && meta.originalTitle,
  meta && meta.title,
  ...(Array.isArray(meta && meta.aliases) ? meta.aliases : []),
  ...(Array.isArray(meta && meta.alternative_titles) ? meta.alternative_titles : []),
].filter((x) => typeof x === 'string' && x.trim());
const titleScore = (a, b) => {
  const x = cleanTitle(a), y = cleanTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const tokens = (s) => new Set(s.split(/[^a-z0-9]+/).filter((v) => v.length > 1));
  const A = tokens(x), B = tokens(y);
  if (!A.size || !B.size) return 0;
  const common = [...A].filter((v) => B.has(v)).length;
  const overlap = common / Math.max(A.size, B.size);
  const compact = (s) => s.replace(/[^a-z0-9]/g, '');
  const cx = compact(x), cy = compact(y);
  const containment = cx.length >= 5 && cy.length >= 5 && (cx.includes(cy) || cy.includes(cx)) ? Math.min(cx.length, cy.length) / Math.max(cx.length, cy.length) : 0;
  return Math.max(overlap, containment);
};

export function matchMovieMetadata(results, title, year = 0) {
  const wanted = cleanTitle(title);
  if (!wanted || !Array.isArray(results)) return null;
  const eligible = results.filter((m) => {
    const y = yearOf(m && (m.year || m.releaseInfo));
    return !year || y === Number(year);
  });
  const exact = eligible.filter((m) => titleOf(m).some((name) => cleanTitle(name) === wanted));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const scored = eligible.map((m) => ({ m, score: Math.max(0, ...titleOf(m).map((name) => titleScore(name, title))) }))
    .filter((x) => x.score >= 0.86)
    .sort((a, b) => b.score - a.score);
  if (!scored.length || (scored[1] && scored[0].score - scored[1].score < 0.08)) return null;
  return scored[0].m;
}


const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const claimValue = (entity, property) => {
  const claim = entity && entity.claims && entity.claims[property] && entity.claims[property][0];
  return claim && claim.mainsnak && claim.mainsnak.datavalue && claim.mainsnak.datavalue.value;
};
const entityTitles = (entity) => {
  const values = [];
  for (const group of [entity && entity.labels, entity && entity.aliases]) {
    if (!group) continue;
    for (const value of Object.values(group)) {
      if (Array.isArray(value)) values.push(...value.map((x) => x && x.value));
      else if (value && value.value) values.push(value.value);
    }
  }
  return values.filter((x) => typeof x === 'string' && x.trim());
};
export async function resolveMovieWithWikidata(net, title, year = 0) {
  const query = String(title || '').trim();
  if (!query) return null;
  const searchUrl = WIKIDATA + '?action=wbsearchentities&search=' + encodeURIComponent(query) + '&language=tr&uselang=tr&format=json&origin=*';
  const search = await net.json(searchUrl, { fast: true });
  const ids = (Array.isArray(search && search.search) ? search.search : [])
    .filter((x) => x && /^Q\d+$/.test(x.id) && /film|movie|sinema|motion picture/i.test(String(x.description || '')))
    .slice(0, 8).map((x) => x.id);
  if (!ids.length) return null;
  const detailUrl = WIKIDATA + '?action=wbgetentities&ids=' + ids.join('|') + '&props=labels|aliases|claims&languages=tr|en&format=json&origin=*';
  const detail = await net.json(detailUrl, { fast: true });
  const candidates = Object.values(detail && detail.entities || {}).map((entity) => {
    const imdb = claimValue(entity, 'P345');
    const date = claimValue(entity, 'P577');
    const entityYear = yearOf(date && date.time);
    const names = entityTitles(entity);
    const exact = names.some((name) => cleanTitle(name) === cleanTitle(query));
    return { imdbId: typeof imdb === 'string' ? imdb : '', year: entityYear, names, exact };
  }).filter((x) => /^tt\d+$/.test(x.imdbId) && (!year || x.year === Number(year)) && x.exact);
  return candidates.length === 1 ? candidates[0] : null;
}

export async function loadMovieMetadata(net, item, vodInfo = null, store = null) {
  const rawTitle = String(item && (item.name || item.title) || '').trim();
  const parsed = parseMovieCatalogTitle(rawTitle);
  const title = parsed.title;
  if (!title) return null;
  const year = yearOf((vodInfo && (vodInfo.year || vodInfo.release_date)) || (item && (item.year || item.release_date)) || parsed.year || title);
  const candidateTitles = [...new Set([
    title,
    item && (item.original_name || item.originalName || item.original_title || item.originalTitle),
    item && (item.title || item.name),
    vodInfo && (vodInfo.original_name || vodInfo.originalName || vodInfo.original_title || vodInfo.originalTitle),
    vodInfo && (vodInfo.name || vodInfo.title),
  ].filter((v) => typeof v === 'string' && v.trim()).map((v) => parseMovieCatalogTitle(v).title))];
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
    let match = null;
    let id = '';
    {
      for (const candidate of candidateTitles) {
        const query = encodeURIComponent(candidate);
        const catalog = await net.json(`${BASE}/catalog/movie/top/search=${query}.json`);
        match = matchMovieMetadata(catalog && catalog.metas, candidate, year);
        if (match) break;
      }
      id = match && String(match.imdb_id || match.id || '');
    }
    if (!/^tt\d+$/.test(id)) return null;

    const detail = await net.json(`${BASE}/meta/movie/${encodeURIComponent(id)}.json`);
    const meta = detail && detail.meta;
    if (!meta || String(meta.imdb_id || meta.id || '') !== id) return null;
    const rating = Number(meta.imdbRating);
    return {
      imdbId: id,
      imdbRating: Number.isFinite(rating) && rating > 0 && rating <= 10 ? rating.toFixed(1) : '',
      year: yearOf(meta.year) || year,
      title: meta.name || (match && match.name) || title,
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
