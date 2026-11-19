// Cinemeta (Stremio) üstverisi: fragman (YouTube kimliği), oyuncu/yönetmen ve bir oyuncunun filmleri.
// Ağ yoksa ya da eşleşme bulunamazsa sessizce boş döner; sonuçlar önbellekte tutulur.
import { fold, youtubeIdOf } from './util.js';
import { cleanTitle } from './titleclean.js';
import { fuzzyFind } from './title-match.js';

export const CINEMETA = 'https://v3-cinemeta.strem.io';
export const DETAIL_TTL = 30 * 86400000;
export const MISS_TTL = 6 * 3600000;
export const PERSON_TTL = 7 * 86400000;
export const MAX_CAST = 20;
const TMDB_IMG = 'https://image.tmdb.org/t/p/w185';

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
// Kişi fotoğrafı: yalnız https adresi ya da TMDB profil yolu ("/abc.jpg") kabul edilir
const photoOf = (p) => {
  const u = str(p && (p.photo || p.profile_photo || p.profile_path));
  if (/^https:\/\//i.test(u)) return u;
  return /^\/[\w.-]+\.(?:jpe?g|png|webp)$/i.test(u) ? TMDB_IMG + u : '';
};
// Cinemeta kişi listeleri (app_extras.cast / directors, credits_cast): [{ name, character, photo }]
const personList = (arr) => (Array.isArray(arr) ? arr : []).map((p) => ({ name: str(p && p.name), character: str(p && p.character), photo: photoOf(p) })).filter((p) => p.name);
const infoFor = (names, lists) => {
  const by = new Map();
  for (const l of lists) for (const p of l) { const k = fold(p.name); const cur = by.get(k); if (!cur) by.set(k, { ...p }); else { if (!cur.photo && p.photo) cur.photo = p.photo; if (!cur.character && p.character) cur.character = p.character; } }
  return names.map((name) => { const p = by.get(fold(name)) || {}; return { name, character: p.character || '', photo: p.photo || '' }; });
};

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
  const extras = meta.app_extras && typeof meta.app_extras === 'object' ? meta.app_extras : {};
  const castLists = [personList(extras.cast), personList(meta.credits_cast)];
  const crew = Array.isArray(meta.credits_crew) ? meta.credits_crew.filter((c) => c && /^director$/i.test(String(c.job))) : [];
  const dirLists = [personList(extras.directors), personList(crew)];
  if (!cast.length) cast.push(...uniq(castLists.flat().map((p) => p.name), fold).slice(0, MAX_CAST)); // meta.cast boşsa kişi listelerinden
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
    castInfo: infoFor(cast, castLists),
    directorInfo: infoFor(director.length ? director : uniq(dirLists.flat().map((p) => p.name), fold).slice(0, 3), dirLists),
  };
}

// Ayrıntı: önbellekten (30 gün; bulunamayan 6 saat), yoksa Cinemeta'dan. Ağ hatası fırlatır (önbelleğe yazılmaz).
export async function loadDetail({ net, cache = null, imdbId, type = 'movie', now = Date.now() }) {
  const id = str(imdbId);
  if (!IMDB_ID.test(id)) return null;
  const t = type === 'series' ? 'series' : 'movie';
  const key = `cinemeta:detail:v2:${t}:${id}`; // v2: kişi fotoğrafları (castInfo) eklendi
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
  const withInfo = (names, info) => names.map((name) => { const i = (info || []).find((x) => fold(x.name) === fold(name)) || {}; return { name, photo: i.photo || '', character: i.character || '' }; });
  const dirNames = detail && detail.director && detail.director.length ? detail.director : (detail && detail.directorInfo && detail.directorInfo.length ? detail.directorInfo.map((p) => p.name) : splitNames(provider.director));
  const castNames = detail && detail.cast && detail.cast.length ? detail.cast : splitNames(provider.cast);
  // Hem yönetmen hem oyuncu olan kişi bir kez, "Yönetmen" etiketiyle gelir; kartta oyuncunun rolü (karakter) ve fotoğrafı da taşınır
  const all = [...withInfo(dirNames, detail && detail.directorInfo).map((p) => ({ ...p, role: 'Yönetmen' })), ...withInfo(castNames, detail && detail.castInfo).map((p) => ({ ...p, role: '' }))];
  const out = uniq(all, (p) => fold(p.name)).slice(0, MAX_CAST + 3);
  for (const p of out) { // yönetmen olarak gelen kişinin oyuncu fotoğrafı/rolü varsa tamamlanır
    const c = (detail && detail.castInfo || []).find((x) => fold(x.name) === fold(p.name));
    if (c) { if (!p.photo) p.photo = c.photo; if (!p.character) p.character = c.character; }
  }
  return out;
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
    // "Katiller Devri (Jianyu)": parantez içi çoğu zaman özgün ad; "Corpse Bride - Ölü Gelin" gibi ayraçlı adlarda her parça: o adlarla da bulunabilsin
    const extra = new Set();
    const alt = ct.alt ? cleanTitle(ct.alt, ct.year) : null;
    if (alt && alt.key) extra.add(alt.key);
    const parts = String((it && it.name) || '').split(/\s+[-–—\/]\s+/).map((x) => x.trim()).filter(Boolean);
    if (parts.length > 1 && parts.length <= 4) {
      for (const part of parts) {
        const pc = cleanTitle(part, ct.year);
        if (pc.key && /[a-z]/.test(pc.key) && (pc.key.length >= 6 || pc.key.includes(' '))) extra.add(pc.key);
      }
    }
    for (const key of extra) {
      if (key === ct.key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ it, year: ct.year || 0 });
    }
  }
  return map;
}

// Yalnız birebir (temizlenmiş) ad eşleşmesi: bulanık eşleşme yapmaz. TV rehberindeki program adının listede film olarak bulunup bulunmadığına bakmak için (yanlış pozitif istemeyen yerler).
export function hasExactTitle(name, titleIndex) {
  if (!titleIndex || !name) return false;
  const key = cleanTitle(name).key;
  return !!key && titleIndex.has(key);
}

// film.trNames: Wikidata'dan gelen Türkçe adlar; film.trGuess: makine çevirisiyle üretilmiş Türkçe tahmin adları (yalnız gevşek eşikle aranır).
// Önce tam ad eşleşmesi (özgün + Türkçe adlar), sonra bulanık eşleşme (title-match.js), en son tahmin adlarıyla gevşek eşleşme.
export function findInLibrary(film, { titleIndex = null, imdbIndex = null } = {}) {
  if (!film) return null;
  if (imdbIndex && imdbIndex.has(film.imdbId)) return imdbIndex.get(film.imdbId);
  if (!titleIndex) return null;
  const names = [film.name, ...(Array.isArray(film.trNames) ? film.trNames : [])].filter(Boolean);
  const year = Number(film.year) || 0;
  for (const name of names) {
    const ct = cleanTitle(name, film.year);
    const list = ct.key ? titleIndex.get(ct.key) : null;
    const hit = list && list.find((x) => !x.year || !year || Math.abs(x.year - year) <= 1);
    if (hit) return hit.it;
  }
  for (const name of names) {
    const hit = fuzzyFind(titleIndex, cleanTitle(name, film.year).title || name, year);
    if (hit) return hit.it;
  }
  if (year && Array.isArray(film.trGuess)) {
    for (const name of film.trGuess) {
      const hit = fuzzyFind(titleIndex, cleanTitle(name, film.year).title || name, year, { loose: true });
      if (hit) return hit.it;
    }
  }
  return null;
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
// Kontrolsüz: YouTube çubukları, altyazı/ayar düğmeleri, tam ekran ve klavye kapalı; ses ve gösterim uygulamanın kendi düğmelerinden yönetilir.
export function trailerEmbedUrl(id, { muted = true, origin = '' } = {}) {
  const q = new URLSearchParams({ autoplay: '1', mute: muted ? '1' : '0', playsinline: '1', rel: '0', modestbranding: '1', enablejsapi: '1', controls: '0', disablekb: '1', fs: '0', iv_load_policy: '3', cc_load_policy: '0' });
  if (/^https?:\/\//.test(origin)) q.set('origin', origin);
  return `https://www.youtube.com/embed/${encodeURIComponent(id)}?${q}`;
}
