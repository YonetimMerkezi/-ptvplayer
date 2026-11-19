// Cinemeta (Stremio) üstverisi: fragman (YouTube kimliği), oyuncu/yönetmen ve bir oyuncunun filmleri.
// Ağ yoksa ya da eşleşme bulunamazsa sessizce boş döner; sonuçlar önbellekte tutulur.
import { fold, youtubeIdOf } from './util.js';
import { cleanTitle } from './titleclean.js';

export const CINEMETA = 'https://v3-cinemeta.strem.io';
export const DETAIL_TTL = 30 * 86400000;
export const MISS_TTL = 6 * 3600000;
export const PERSON_TTL = 7 * 86400000;
export const MAX_CAST = 20;

const IMDB_ID = /^tt\d+$/;
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const yearOf = (v) => {
  const m = String(v ?? '').match(/(?:19|20)\d{2}/);
  return m ? Number(m[0]) : 0;
};
const uniq = (list, keyOf = (x) => x) => {
  const seen = new Set();
  return list.filter((x) => {
    const k = keyOf(x);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

// Cinemeta "meta" nesnesi → uygulamanın kullandığı sade kayıt. Geçersizse null.
export function parseDetail(meta, type = 'movie') {
  if (!meta || typeof meta !== 'object') return null;
  const imdbId = str(meta.imdb_id || meta.id);
  if (!IMDB_ID.test(imdbId)) return null;
  const trailers = uniq([
    ...(Array.isArray(meta.trailers) ? meta.trailers.filter((t) => !t || !t.type || /trailer|teaser/i.test(String(t.type))).map((t) => str(t && t.source)) : []),
    ...(Array.isArray(meta.trailerStreams) ? meta.trailerStreams.map((t) => str(t && t.ytId)) : []),
  ].map(youtubeIdOf).filter(Boolean));
  const links = Array.isArray(meta.links) ? meta.links : [];
  const cast = uniq([
    ...(Array.isArray(meta.cast) ? meta.cast.map(str) : []),
    ...links.filter((l) => l && /^cast$/i.test(String(l.category))).map((l) => str(l.name)),
  ], fold).slice(0, MAX_CAST);
  const director = uniq([
    ...(Array.isArray(meta.director) ? meta.director.map(str) : []),
    ...links.filter((l) => l && /^directors?$/i.test(String(l.category))).map((l) => str(l.name)),
  ], fold).slice(0, 3);
  return {
    imdbId,
    type: type === 'series' ? 'series' : 'movie',
    name: str(meta.name),
    year: yearOf(meta.year || meta.releaseInfo),
    runtime: str(meta.runtime),
    genres: (Array.isArray(meta.genres) ? meta.genres : Array.isArray(meta.genre) ? meta.genre : []).map(str).filter(Boolean).slice(0, 4),
    description: str(meta.description),
    poster: str(meta.poster),
    background: str(meta.background),
    trailers,
    cast,
    director,
  };
}

// Ayrıntı: önbellekten (30 gün; bulunamayan 6 saat), yoksa Cinemeta'dan. Ağ hatası fırlatır (önbelleğe yazılmaz).
export async function loadDetail({ net, cache = null, imdbId, type = 'movie', now = Date.now() }) {
  const id = str(imdbId);
  if (!IMDB_ID.test(id)) return null;
  const t = type === 'series' ? 'series' : 'movie';
  const key = `cinemeta:detail:v1:${t}:${id}`;
  const hit = cache ? await cache.get(key).catch(() => null) : null;
  if (hit && typeof hit.at === 'number' && now - hit.at < (hit.value ? DETAIL_TTL : MISS_TTL)) return hit.value || null;
  const json = await net.json(`${CINEMETA}/meta/${t}/${encodeURIComponent(id)}.json`, { fast: true });
  const value = parseDetail(json && json.meta, t);
  if (cache) await cache.set(key, { at: now, value }).catch(() => {});
  return value;
}

// Oyuncu/yönetmen kartları: önce yönetmen, sonra oyuncular. Cinemeta yoksa sağlayıcının "A, B, C" metni kullanılır.
const splitNames = (s) => String(s || '').split(/[,|/;]+/).map((x) => x.trim()).filter((x) => x.length > 1);
export function peopleOf(detail, provider = {}) {
  const directors = detail && detail.director && detail.director.length ? detail.director : splitNames(provider.director);
  const cast = detail && detail.cast && detail.cast.length ? detail.cast : splitNames(provider.cast);
  // Hem yönetmen hem oyuncu olan kişi bir kez, "Yönetmen" etiketiyle gelir
  return uniq([...directors.map((name) => ({ name, role: 'Yönetmen' })), ...cast.map((name) => ({ name, role: '' }))], (p) => fold(p.name)).slice(0, MAX_CAST + 3);
}

// Arama sonucu → oyuncunun yapımları. Adı başlıkta geçenler (belgesel, röportaj, "Tom Hanks: …") oyuncunun filmi değildir.
export function personFilms(metas, person) {
  const p = fold(person);
  const seen = new Set();
  const out = [];
  for (const m of Array.isArray(metas) ? metas : []) {
    const id = str(m && (m.imdb_id || m.id));
    const name = str(m && m.name);
    if (!IMDB_ID.test(id) || !name || seen.has(id)) continue;
    if (p && fold(name).includes(p)) continue;
    seen.add(id);
    out.push({ imdbId: id, type: m.type === 'series' ? 'series' : 'movie', name, year: yearOf(m.releaseInfo || m.year), poster: str(m.poster) });
  }
  return out;
}

// Cinemeta adla aramada başlık eşleşmelerinden sonra oyuncunun yapımlarını da döndürür (en çok 20). Film ve dizi ayrı aranır.
export async function searchPerson({ net, cache = null, name, now = Date.now() }) {
  const q = str(name);
  if (!q) return { movies: [], series: [] };
  const key = 'cinemeta:person:v1:' + fold(q);
  const hit = cache ? await cache.get(key).catch(() => null) : null;
  if (hit && hit.value && typeof hit.at === 'number' && now - hit.at < PERSON_TTL) return hit.value;
  const get = (type) => net.json(`${CINEMETA}/catalog/${type}/top/search=${encodeURIComponent(q)}.json`, { fast: true }).then((j) => personFilms(j && j.metas, q).map((f) => ({ ...f, type }))); // katalog türü kesindir
  const [m, s] = await Promise.allSettled([get('movie'), get('series')]);
  if (m.status === 'rejected' && s.status === 'rejected') throw m.reason;
  const value = { movies: m.status === 'fulfilled' ? m.value : [], series: s.status === 'fulfilled' ? s.value : [] };
  if (cache && m.status === 'fulfilled' && s.status === 'fulfilled') await cache.set(key, { at: now, value }).catch(() => {});
  return value;
}

// ---- yeni çıkanlar (Cinemeta "New" kataloğu: /catalog/movie/year/genre=<yıl>.json) ----
export const NEW_TTL = 6 * 3600000;
export const NEW_MAX = 24;
export const NEW_MIN = 12; // yıl başında bu kadar film yoksa önceki yıl da eklenir

// Katalog → afişi olan filmler (afişsiz kart boş görünür); en çok NEW_MAX, Cinemeta'nın verdiği sırayla
export function parseNewCatalog(json, type = 'movie') {
  const seen = new Set();
  const out = [];
  for (const m of Array.isArray(json && json.metas) ? json.metas : []) {
    const id = str(m && (m.imdb_id || m.id));
    const name = str(m && m.name);
    const poster = str(m && m.poster);
    if (!IMDB_ID.test(id) || !name || !/^https:\/\//.test(poster) || seen.has(id)) continue;
    seen.add(id);
    out.push({ imdbId: id, type: type === 'series' ? 'series' : 'movie', name, year: yearOf(m.releaseInfo || m.year), poster });
    if (out.length >= NEW_MAX) break;
  }
  return out;
}

// 6 saat önbellekten; ağ hatasında eski önbellek (varsa) kullanılır, yoksa hata fırlatır.
export async function loadNewReleases({ net, cache = null, now = Date.now(), date = new Date(now) } = {}) {
  const year = date.getFullYear();
  const key = `cinemeta:new:v1:${year}`;
  const hit = cache ? await cache.get(key).catch(() => null) : null;
  const ok = hit && Array.isArray(hit.films) && hit.films.length;
  if (ok && now - Number(hit.at || 0) < NEW_TTL) return { films: hit.films, at: hit.at, stale: false };
  const get = (y) => net.json(`${CINEMETA}/catalog/movie/year/genre=${y}.json`, { fast: true }).then((j) => parseNewCatalog(j, 'movie'));
  try {
    let films = await get(year);
    if (films.length < NEW_MIN && date.getMonth() < 3) {
      const prev = await get(year - 1).catch(() => []);
      films = uniq([...films, ...prev], (f) => f.imdbId).slice(0, NEW_MAX);
    }
    if (!films.length) throw new Error('Yeni çıkanlar listesi boş geldi');
    if (cache) await cache.set(key, { at: now, films }).catch(() => {});
    return { films, at: now, stale: false };
  } catch (e) {
    if (ok) return { films: hit.films, at: hit.at, stale: true };
    throw e;
  }
}

// ---- kullanıcının listesiyle eşleştirme ----
// Ad dizini: temizlenmiş ad → [{ it, year }]. Liste adları çoğunlukla özgün adla gelir; Türkçe adlı kayıtlar IMDb dizininden (imdbIndex) bulunur.
export function buildTitleIndex(items) {
  const map = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    const ct = cleanTitle(it && it.name, it && it.year);
    if (!ct.key) continue;
    if (!map.has(ct.key)) map.set(ct.key, []);
    map.get(ct.key).push({ it, year: ct.year || 0 });
  }
  return map;
}

export function findInLibrary(film, { titleIndex = null, imdbIndex = null } = {}) {
  if (!film) return null;
  if (imdbIndex && imdbIndex.has(film.imdbId)) return imdbIndex.get(film.imdbId);
  if (!titleIndex) return null;
  const ct = cleanTitle(film.name, film.year);
  const list = ct.key ? titleIndex.get(ct.key) : null;
  if (!list) return null;
  const hit = list.find((x) => !x.year || !film.year || Math.abs(x.year - film.year) <= 1);
  return hit ? hit.it : null;
}

// Cinemeta türleri İngilizce gelir; ekranda Türkçe gösterilir (bilinmeyen tür olduğu gibi kalır)
export const GENRES_TR = {
  action: 'Aksiyon', adventure: 'Macera', animation: 'Animasyon', biography: 'Biyografi', comedy: 'Komedi', crime: 'Suç', documentary: 'Belgesel', drama: 'Dram',
  family: 'Aile', fantasy: 'Fantastik', 'film-noir': 'Kara film', 'game-show': 'Yarışma', history: 'Tarih', horror: 'Korku', music: 'Müzik', musical: 'Müzikal',
  mystery: 'Gizem', news: 'Haber', 'reality-tv': 'Reality', romance: 'Romantik', 'sci-fi': 'Bilim kurgu', 'science fiction': 'Bilim kurgu', short: 'Kısa',
  sport: 'Spor', 'talk-show': 'Talk show', thriller: 'Gerilim', war: 'Savaş', western: 'Vahşi Batı',
};
export const genreTr = (g) => GENRES_TR[String(g || '').trim().toLowerCase()] || String(g || '').trim();

// ---- YouTube ----
// Fragman kimlikleri: Cinemeta'nınkiler önce, sağlayıcının (Xtream "youtube_trailer") verdiği ardından; yinelenenler atılır.
// Oynatıcı gömmeye izin vermeyen videoda sıradakine geçer, bu yüzden birden fazla kimlik tutulur.
export const MAX_TRAILERS = 4;
export function trailerIds(detail, providerTrailer) {
  const all = [...(detail && Array.isArray(detail.trailers) ? detail.trailers : []), providerTrailer].map(youtubeIdOf).filter(Boolean);
  return [...new Set(all)].slice(0, MAX_TRAILERS);
}

// Fragman bulunamadığında YouTube araması: katalog adındaki dil öneki ("TR | "), kalite etiketleri ve yıl ayıklanır.
export function trailerQuery(name, year, suffix = 'fragman') {
  const t = trailerTitle(name, year);
  return [t.title, t.year || yearOf(year) || '', suffix].filter(Boolean).join(' ');
}
// Katalog adından yalın ad ve (adda varsa) yıl
export function trailerTitle(name, year) {
  const stripped = String(name ?? '').replace(/^\s*[A-Za-z]{2,3}\s*[|⇒»]\s*/, '');
  const c = cleanTitle(stripped, yearOf(year) || undefined);
  return { title: (c.title || stripped).trim(), year: c.year || 0 };
}
export const trailerSearchUrl = (query) => `https://www.youtube.com/results?search_query=${encodeURIComponent(String(query || '').trim())}`;
export const trailerWatchUrl = (id) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
export const trailerThumbUrl = (id) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
// origin: sayfanın kökeni (https://localhost gibi); YouTube gömmeyi (Hata 153) kökenden tanır.
export function trailerEmbedUrl(id, { muted = true, origin = '' } = {}) {
  const q = new URLSearchParams({ autoplay: '1', mute: muted ? '1' : '0', playsinline: '1', rel: '0', modestbranding: '1', enablejsapi: '1', controls: '1' });
  if (/^https?:\/\//.test(origin)) q.set('origin', origin);
  return `https://www.youtube.com/embed/${encodeURIComponent(id)}?${q}`;
}
