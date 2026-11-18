// Veri sağlayıcılar: Xtream (kategori kategori yüklenir) ve M3U (liste bir kez indirilip ayrıştırılır).
// Ayrıştırma ve eşleme mantığı Android uygulamasıyla ortaktır (www/js/xtream.js, m3u.js).
import * as X from '../../www/js/xtream.js';
import { M3UParser, groupSeries } from '../../www/js/m3u.js';
import { fold } from '../../www/js/util.js';

const KIND_AKSIYON = {
  live: ['get_live_categories', 'get_live_streams', X.mapLive],
  movie: ['get_vod_categories', 'get_vod_streams', X.mapVod],
  series: ['get_series_categories', 'get_series', X.mapSeries],
};

const bir = (cache, key, fn) => cache[key] || (cache[key] = fn().catch((e) => { delete cache[key]; throw e; }));
const gecerli = (l) => (Array.isArray(l) ? l.filter((c) => c && typeof c === 'object') : []);

export function createXtream(src, net) {
  const cfg = { server: src.server, user: src.user, pass: src.pass };
  const cache = {};
  const J = (action, params) => net.json(X.apiUrl(cfg, action, params), { timeoutMs: 60000 });
  const rawCats = (kind) => bir(cache, 'rc:' + kind, async () => gecerli(await J(KIND_AKSIYON[kind][0])));
  return {
    type: 'xtream',
    auth: async () => X.checkAuth(await J(null)),
    async categories(kind) {
      return (await rawCats(kind)).map((c) => ({ id: String(c.category_id), name: String(c.category_name || '').trim() || 'Diğer' }));
    },
    items: (kind, catId) =>
      bir(cache, 'it:' + kind + ':' + catId, async () => {
        const [, aksiyon, map] = KIND_AKSIYON[kind];
        const cats = await rawCats(kind);
        return map(gecerli(await J(aksiyon, { category_id: catId })), cats);
      }),
    all: (kind) =>
      bir(cache, 'all:' + kind, async () => {
        const [, aksiyon, map] = KIND_AKSIYON[kind];
        const cats = await rawCats(kind);
        return map(gecerli(await J(aksiyon)), cats);
      }),
    seriesInfo: (item) => bir(cache, 'si:' + item.seriesId, async () => X.mapSeriesInfo(await J('get_series_info', { series_id: item.seriesId }))),
    vodInfo: (item) => bir(cache, 'vi:' + item.streamId, async () => X.mapVodInfo(await J('get_vod_info', { vod_id: item.streamId }))),
    shortEpg: (item) => bir(cache, 'ep:' + item.streamId + ':' + Math.floor(Date.now() / 120000), async () => X.mapShortEpg(await J('get_short_epg', { stream_id: item.streamId, limit: 3 }))),
    urlFor(item, fmt) {
      if (item.kind === 'live') return X.liveUrl(cfg, item.streamId, fmt === 'ts' ? 'ts' : 'm3u8');
      if (item.kind === 'movie') return X.movieUrl(cfg, item.streamId, item.ext || 'mp4');
      if (item.kind === 'episode') return X.episodeUrl(cfg, item.episodeId, item.ext || 'mp4');
      return '';
    },
    hasEpg: true,
  };
}

export function createM3u(src, net) {
  let yuk = null;
  const ayrisir = (metin) => {
    const p = new M3UParser();
    const PARCA = 1 << 20;
    for (let i = 0; i < metin.length; i += PARCA) p.push(metin.slice(i, i + PARCA));
    const { items } = p.end();
    const live = items.filter((x) => x.kind === 'live');
    // Dizi adı kalıbı (S01E02) olanlar dizi olur; kalıpsız "dizi" türündekiler film listesine düşer.
    const seri = groupSeries(items.filter((x) => x.kind === 'series'));
    const movie = items.filter((x) => x.kind === 'movie').concat(seri.movies);
    return { live, movie, series: seri.series };
  };
  const yukle = (onProgress) => yuk || (yuk = net.get(src.url, { timeoutMs: 180000, onProgress }).then(ayrisir).catch((e) => { yuk = null; throw e; }));
  const grupAdi = (x) => x.group || 'Diğer';
  return {
    type: 'm3u',
    auth: async () => {
      const d = await yukle();
      const n = d.live.length + d.movie.length + d.series.length;
      return n ? { ok: true, count: n } : { ok: false, reason: 'Listede oynatılabilir öğe bulunamadı.' };
    },
    load: yukle,
    async categories(kind) {
      const d = await yukle();
      const sayac = {};
      const sira = [];
      d[kind].forEach((x) => {
        const g = grupAdi(x);
        if (!(g in sayac)) {
          sayac[g] = 0;
          sira.push(g);
        }
        sayac[g]++;
      });
      return sira.map((g) => ({ id: g, name: g, count: sayac[g] }));
    },
    items: async (kind, catId) => (await yukle())[kind].filter((x) => grupAdi(x) === catId),
    all: async (kind) => (await yukle())[kind],
    seriesInfo: async (item) => ({ plot: '', seasons: item.seasons || [] }),
    vodInfo: async () => ({}),
    shortEpg: async () => [],
    urlFor(item) {
      const u = String(item.url || '');
      const i = u.indexOf('|');
      return i > 0 && /^https?:/i.test(u) ? u.slice(0, i) : u;
    },
    hasEpg: false,
  };
}

export function createProvider(src, net) {
  return src.type === 'm3u' ? createM3u(src, net) : createXtream(src, net);
}

// Arama: katalogdaki tüm türlerde, Türkçe duyarsız alt dize eşleşmesi.
// ilerleme(tür, şimdiyeKadarBulunanlar): her tür taranmadan önce çağrılır (ilk aramada katalog indirilir, uzun sürebilir).
export async function ara(provider, sorgu, limit, ilerleme) {
  const q = fold(sorgu);
  if (!q) return [];
  const out = [];
  const kinds = ['live', 'movie', 'series'];
  for (let k = 0; k < kinds.length; k++) {
    if (ilerleme) ilerleme(kinds[k], out);
    const liste = await provider.all(kinds[k]);
    for (let i = 0; i < liste.length && out.length < (limit || 200); i++) {
      if (fold(liste[i].name).indexOf(q) >= 0) out.push(liste[i]);
    }
  }
  return out;
}
