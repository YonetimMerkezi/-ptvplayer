// ptv-meta Worker istemcisi: başlığı temizler, TMDB eşleşmesini (IMDb ID, Türkçe ad, yaş sınırı,
// elle girilmiş uyarılar) Worker'dan alır ve cihazda önbelleğe alır.
// Belirsiz (pending) ya da eşleşmeyen (none) kayıt asla kullanıcıya gösterilmez.
import { cleanTitle, cacheKey, isEpisodeLike } from './titleclean.js';

export const META_WORKER_URL = 'https://ptv-meta.karagozyazilim12.workers.dev';
// Cloudflare'deki APP_TOKEN değerini buraya yapıştır (ADMIN_TOKEN ve TMDB_KEY buraya ASLA girmez).
export const META_APP_TOKEN = 'sedonet23';

const TTL_OK = 3 * 86400000;     // eşleşmiş kayıt
const TTL_MANUAL = 86400000;     // elle düzeltilen uyarılar daha çabuk yenilensin
const TTL_MISS = 86400000;       // pending / none
const inflight = new Map();

const year4 = (v) => { const m = String(v || '').match(/(?:19|20)\d{2}/); return m ? Number(m[0]) : null; };
const configured = () => !!META_APP_TOKEN && !/BURAYA/.test(META_APP_TOKEN);
const hasManual = (r) => !!(r && r.w && Object.keys(r.w).length) || (r && r.st === 'manual');

// kind: 'movie' (varsayılan) ya da 'tv' (dizi). Worker anahtarı "movie|…" / "tv|…" biçimindedir.
export async function lookupMeta(net, store, item, info = null, kind = 'movie') {
  if (!configured()) return null;
  const tv = kind === 'tv';
  const raw = String(item && (item.name || item.title) || '').trim();
  if (!raw || (!tv && isEpisodeLike(raw, item && item.group))) return null;
  const hint = year4(info && (info.year || info.release_date)) || year4(item && (item.year || item.release_date));
  const c = cleanTitle(raw, hint);
  if (!c.title || c.title.length < 2) return null;
  const k = cacheKey(c, tv ? 'tv' : 'movie');
  const ck = 'meta-worker:v1:' + k;
  const cached = store && store.cache ? await store.cache.get(ck).catch(() => null) : null;
  if (cached && cached.at && cached.row) {
    const ttl = hasManual(cached.row) ? TTL_MANUAL : cached.row.st === 'ok' ? TTL_OK : TTL_MISS;
    if (Date.now() - cached.at < ttl) return usable(cached.row);
  }
  if (inflight.has(k)) return inflight.get(k);
  const task = (async () => {
    try {
      const q = '?k=' + encodeURIComponent(k) + '&t=' + encodeURIComponent(c.title) +
        (c.year ? '&y=' + c.year : '') + (c.alt ? '&a=' + encodeURIComponent(c.alt) : '');
      const data = await net.json(META_WORKER_URL + '/lookup' + q, { headers: { 'x-app-token': META_APP_TOKEN }, fast: true });
      const row = data && Array.isArray(data.items) ? data.items[0] : null;
      if (!row || row.st === 'err' || !row.st) return null;          // geçici hata: önbelleğe alma
      if (store && store.cache) await store.cache.set(ck, { at: Date.now(), row }).catch(() => {});
      return usable(row);
    } catch (_) {
      return null;
    } finally {
      inflight.delete(k);
    }
  })();
  inflight.set(k, task);
  return task;
}

// Yalnızca güvenle eşleşmiş (ok) ya da elle onaylanmış (manual) kayıt kullanılır.
function usable(row) {
  return row && (row.st === 'ok' || row.st === 'manual') ? row : null;
}
