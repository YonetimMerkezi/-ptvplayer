// Xtream Codes API: adres kurma ve yanıtları ortak biçime çevirme.
import { decodeBase64Utf8 } from './util.js';

export function normalizeServer(server) {
  let s = String(server || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  s = s.replace(/\/(player_api|get|xmltv|panel_api)\.php.*$/i, '');
  return s.replace(/\/+$/, '');
}

// Kullanıcının yapıştırdığı "http://host:port/get.php?username=..&password=.." bağlantısından alanları çıkarır.
export function parseXtreamLink(link) {
  try {
    const u = new URL(String(link).trim());
    const user = u.searchParams.get('username');
    const pass = u.searchParams.get('password');
    if (user && pass) return { server: u.origin + u.pathname.replace(/\/[^/]*\.php$/i, '').replace(/\/+$/, ''), user, pass };
  } catch {
    /* geçersiz bağlantı */
  }
  return null;
}

const q = encodeURIComponent;

export function apiUrl(cfg, action, params = {}) {
  const base = normalizeServer(cfg.server);
  let u = `${base}/player_api.php?username=${q(cfg.user)}&password=${q(cfg.pass)}`;
  if (action) u += `&action=${action}`;
  for (const [k, v] of Object.entries(params)) u += `&${k}=${q(v)}`;
  return u;
}

export function xmltvUrl(cfg) {
  return `${normalizeServer(cfg.server)}/xmltv.php?username=${q(cfg.user)}&password=${q(cfg.pass)}`;
}

export function liveUrl(cfg, streamId, ext = 'm3u8') {
  return `${normalizeServer(cfg.server)}/live/${q(cfg.user)}/${q(cfg.pass)}/${streamId}.${ext}`;
}

export function movieUrl(cfg, streamId, ext = 'mp4') {
  return `${normalizeServer(cfg.server)}/movie/${q(cfg.user)}/${q(cfg.pass)}/${streamId}.${ext || 'mp4'}`;
}

export function episodeUrl(cfg, episodeId, ext = 'mp4') {
  return `${normalizeServer(cfg.server)}/series/${q(cfg.user)}/${q(cfg.pass)}/${episodeId}.${ext || 'mp4'}`;
}

export function checkAuth(json) {
  const info = json && json.user_info;
  if (!info || typeof info !== 'object') return { ok: false, reason: 'Sunucu geçerli bir Xtream yanıtı vermedi.' };
  const auth = /^(1|true)$/i.test(String(info.auth)); // bazı paneller 1 yerine true döndürür
  if (!auth) return { ok: false, reason: 'Kullanıcı adı veya şifre hatalı.' };
  const status = String(info.status || 'Active');
  if (/disabled|banned/i.test(status)) return { ok: false, reason: 'Hesap devre dışı.' };
  if (/expired/i.test(status)) return { ok: false, reason: 'Abonelik süresi dolmuş.' };
  const exp = Number(info.exp_date);
  return {
    ok: true,
    expires: Number.isFinite(exp) && exp > 0 ? exp * 1000 : null,
    maxConnections: Number(info.max_connections) || null,
  };
}

// Sunucular listelerde null/bozuk öğe döndürebilir; yalnız nesneler işlenir.
const objs = (list) => (Array.isArray(list) ? list.filter((x) => x && typeof x === 'object') : []);

function catMap(list) {
  const m = new Map();
  for (const c of objs(list)) m.set(String(c.category_id), String(c.category_name || '').trim());
  return m;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function mapLive(list, cats) {
  const cm = catMap(cats);
  return objs(list).map((s) => ({
    id: 'x' + s.stream_id,
    streamId: String(s.stream_id),
    kind: 'live',
    name: String(s.name || '').trim(),
    logo: s.stream_icon || '',
    group: cm.get(String(s.category_id)) || '',
    tvgId: s.epg_channel_id || '',
    num: num(s.num),
    archive: num(s.tv_archive) === 1,
  }));
}

export function mapVod(list, cats) {
  const cm = catMap(cats);
  return objs(list).map((s) => ({
    id: 'm' + s.stream_id,
    streamId: String(s.stream_id),
    kind: 'movie',
    name: String(s.name || '').trim(),
    logo: s.stream_icon || '',
    group: cm.get(String(s.category_id)) || '',
    ext: s.container_extension || 'mp4',
    rating: num(s.rating_5based || s.rating),
    added: num(s.added),
  }));
}

export function mapSeries(list, cats) {
  const cm = catMap(cats);
  return objs(list).map((s) => ({
    id: 'e' + s.series_id,
    seriesId: String(s.series_id),
    kind: 'series',
    name: String(s.name || '').trim(),
    logo: s.cover || '',
    group: cm.get(String(s.category_id)) || '',
    plot: s.plot || '',
    rating: num(s.rating_5based || s.rating),
    added: num(s.last_modified),
  }));
}

export function mapSeriesInfo(json) {
  const info = (json && json.info) || {};
  const raw = (json && json.episodes) || {};
  const seasonsRaw = Array.isArray(raw) ? raw.map((eps, i) => [String(i + 1), eps]) : Object.entries(raw);
  const seasons = seasonsRaw
    .map(([season, eps]) => ({
      season: num(season),
      episodes: objs(eps).map((e) => ({
        id: 'ep' + e.id,
        episodeId: String(e.id),
        title: String(e.title || `Bölüm ${e.episode_num}`).trim(),
        episodeNum: num(e.episode_num),
        ext: e.container_extension || 'mp4',
        durationSec: num(e.info && e.info.duration_secs),
        plot: (e.info && e.info.plot) || '',
        logo: (e.info && e.info.movie_image) || '',
      })),
    }))
    .filter((s) => s.episodes.length)
    .sort((a, b) => a.season - b.season);
  for (const s of seasons) s.episodes.sort((a, b) => a.episodeNum - b.episodeNum);
  return {
    plot: info.plot || '',
    cast: info.cast || '',
    director: info.director || '',
    genre: info.genre || '',
    year: info.releaseDate || info.release_date || '',
    rating: info.rating_5based || info.rating || '',
    logo: info.cover || '',
    seasons,
  };
}

export function mapVodInfo(json) {
  const i = (json && json.info) || {};
  return {
    plot: i.plot || i.description || '',
    cast: i.cast || i.actors || '',
    director: i.director || '',
    genre: i.genre || '',
    year: i.releasedate || i.release_date || '',
    country: i.country || '',
    rating: i.rating_5based || i.rating || '',
    durationSec: num(i.duration_secs),
    logo: i.movie_image || (Array.isArray(i.backdrop_path) ? i.backdrop_path[0] : '') || '',
  };
}

export function mapShortEpg(json) {
  return objs(json && json.epg_listings)
    .map((e) => ({
      s: num(e.start_timestamp) * 1000,
      e: num(e.stop_timestamp || e.end_timestamp) * 1000,
      t: decodeBase64Utf8(e.title),
      d: decodeBase64Utf8(e.description),
    }))
    .filter((e) => e.s && e.e)
    .sort((a, b) => a.s - b.s);
}
