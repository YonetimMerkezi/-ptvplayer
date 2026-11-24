// Veri sağlayıcılar: Xtream (kategori kategori yüklenir) ve M3U (liste bir kez indirilip ayrıştırılır).
// Ayrıştırma ve eşleme mantığı Android uygulamasıyla ortaktır (www/js/xtream.js, m3u.js).
import * as X from '../../www/js/xtream.js';
import { M3UParser, groupSeries } from '../../www/js/m3u.js';
import { fold } from '../../www/js/util.js';
import { esle as isciEsle, isciKullanilir } from './isci-ist.js';
import { AgHatasi } from './net.js';
import * as A from './arsiv.js';
import { onbellek as varsayilanOnbellek } from './onbellek.js';

const KIND_AKSIYON = {
  live: ['get_live_categories', 'get_live_streams', X.mapLive],
  movie: ['get_vod_categories', 'get_vod_streams', X.mapVod],
  series: ['get_series_categories', 'get_series', X.mapSeries],
};

// Aynı anahtar için tek istek; tamamlanan söz hazir işareti alır (ekran, bellekteki içeriği beklemeden açabilsin)
const bir = (cache, key, fn) => {
  if (cache[key]) return cache[key];
  const p = fn().catch((e) => {
    delete cache[key];
    throw e;
  });
  cache[key] = p;
  p.then(() => {
    p.hazir = true;
  }, () => {});
  return p;
};
const gecerli = (l) => (Array.isArray(l) ? l.filter((c) => c && typeof c === 'object') : []);

export function createXtream(src, net, kalici = varsayilanOnbellek) {
  const cfg = { server: src.server, user: src.user, pass: src.pass };
  const cache = {};
  // Kalıcı önbellek anahtarı: kaynak başına ayrı (başka kaynağın listesi gösterilmesin)
  const kAnahtar = (ek) => 'x:' + (src.id || src.server + '|' + src.user) + ':' + ek;
  // Yazma ekran çizildikten sonra yapılır (büyük listenin kopyalanması eski TV'de kısa takılma yapar); canlı kanal listeleri kaydedilmez
  const kaydet = (ek, l) => {
    if (ek.indexOf('it:live:') === 0) return l;
    setTimeout(() => kalici.yaz(kAnahtar(ek), l).catch(() => {}), 1500);
    return l;
  };
  const J = (action, params) => net.json(X.apiUrl(cfg, action, params), { timeoutMs: 60000 });
  // Büyük liste yanıtı: önce ham metin alınır, ayrıştırma ve eşleme arka plan işçisinde yapılır (kumanda tuşları takılmasın).
  // grup: aynı gruptaki yeni istek (kullanıcı başka kategoriye geçti) öncekini keser.
  // cats: kategori dizisi ya da onu verecek söz; liste isteğiyle birlikte paralel beklenir (ardışık iki gidiş-dönüş yerine bir).
  const liste = async (kind, params, catsSozu, grup) => {
    const [, aksiyon, map] = KIND_AKSIYON[kind];
    const sonuc = await Promise.all([net.get(X.apiUrl(cfg, aksiyon, params), { timeoutMs: 60000, grup }), catsSozu]);
    const metin = sonuc[0];
    const cats = sonuc[1];
    if (isciKullanilir(metin)) {
      try {
        return await isciEsle(metin, kind, cats);
      } catch (e) {
        /* işçi çalışmadı: ana iş parçacığında ayrıştır */
      }
    }
    let json;
    try {
      json = JSON.parse(metin);
    } catch (e) {
      throw new AgHatasi('Sunucu geçerli bir yanıt vermedi', 0);
    }
    return map(gecerli(json), cats);
  };
  const rawCats = (kind) => bir(cache, 'rc:' + kind, async () => kaydet('rc:' + kind, gecerli(await J(KIND_AKSIYON[kind][0]))));
  const adlandir = (l) => l.map((c) => ({ id: String(c.category_id), name: String(c.category_name || '').trim() || 'Diğer' }));
  const epgOnbellek = {}; // kanal:adet → { at, p }; 2 dakika taze sayılır
  let farkOnbellek = null; // sunucu saatinin UTC'den farkı (ms): bir kez sorulur; alınamazsa cihaz saati
  const sunucuFarki = () =>
    farkOnbellek ||
    (farkOnbellek = J(null)
      .then((j) => {
        const f = A.sunucuFark(j && j.server_info);
        return f == null ? A.cihazFark() : f;
      })
      .catch(() => {
        farkOnbellek = null; // bir sonraki sarmada yeniden sorulur
        return A.cihazFark();
      }));
  return {
    type: 'xtream',
    auth: async () => X.checkAuth(await J(null)),
    async categories(kind) {
      return adlandir(await rawCats(kind));
    },
    // Kalıcı önbellekteki (önceki oturumdan) kategori listesi ve kategori içeriği: yoksa null. Ekran önce bunu gösterir, güncel liste arkadan gelir.
    categoriesOnbellekten: (kind) => kalici.oku(kAnahtar('rc:' + kind)).then((l) => (l ? adlandir(gecerli(l)) : null)).catch(() => null),
    onbellekten: (kind, catId) => kalici.oku(kAnahtar('it:' + kind + ':' + catId)).catch(() => null),
    // Kategori içeriği bu oturumda zaten bellekte mi (açılışta ağ beklenmez)
    hazir: (kind, catId) => !!(cache['it:' + kind + ':' + catId] && cache['it:' + kind + ':' + catId].hazir),
    // grup: aynı gruptaki yeni istek öncekini keser (varsayılan 'kat'); null = kesilmez (arka plan önyüklemesi)
    items: (kind, catId, grup) =>
      bir(cache, 'it:' + kind + ':' + catId, () => liste(kind, { category_id: catId }, rawCats(kind), grup === undefined ? 'kat' : grup).then((l) => kaydet('it:' + kind + ':' + catId, l))),
    all: (kind) => bir(cache, 'all:' + kind, () => liste(kind, undefined, rawCats(kind))),
    seriesInfo: (item) => bir(cache, 'si:' + item.seriesId, async () => X.mapSeriesInfo(await J('get_series_info', { series_id: item.seriesId }))),
    vodInfo: (item) => bir(cache, 'vi:' + item.streamId, async () => X.mapVodInfo(await J('get_vod_info', { vod_id: item.streamId }))),
    // Kanalın şimdiki ve sonraki programları (adet: kaç program; varsayılan 3)
    shortEpg(item, adet) {
      const n = adet || 3;
      const k = item.streamId + ':' + n;
      const e = epgOnbellek[k];
      if (e && Date.now() - e.at < 120000) return e.p;
      const p = J('get_short_epg', { stream_id: item.streamId, limit: n }).then(X.mapShortEpg);
      epgOnbellek[k] = { at: Date.now(), p };
      p.catch(() => {
        if (epgOnbellek[k] && epgOnbellek[k].p === p) delete epgOnbellek[k];
      });
      return p;
    },
    urlFor(item, fmt) {
      if (item.kind === 'live') return X.liveUrl(cfg, item.streamId, fmt === 'ts' ? 'ts' : 'm3u8');
      if (item.kind === 'movie') return X.movieUrl(cfg, item.streamId, item.ext || 'mp4');
      if (item.kind === 'episode') return X.episodeUrl(cfg, item.episodeId, item.ext || 'mp4');
      return '';
    },
    hasEpg: true,
    // Arşivden (catch-up) oynatma adresi: başlangıç sunucu saatiyle dakika duyarlığında, süre dakika olarak
    async arsivUrl(item, baslangicMs, sureDk) {
      const fark = await sunucuFarki();
      const kok = X.normalizeServer(cfg.server) + '/timeshift/' + encodeURIComponent(cfg.user) + '/' + encodeURIComponent(cfg.pass);
      return kok + '/' + Math.max(1, Math.round(sureDk)) + '/' + A.damga(baslangicMs, fark) + '/' + item.streamId + '.ts';
    },
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
// turler: yalnız bu türlerde ara (örn. ['movie']); verilmezse üçünde de.
// Katalogdaki adların küçültülmüş (fold) hâli listeye bağlı bir kez hesaplanır: yazdıkça arama her tuşta yüz binlerce adı yeniden
// çevirseydi 2016 model TV'de saniyeler sürerdi. İlk hesap süre dilimlerine bölünür (en çok ~12 ms'de bir ekrana nefes verilir):
// uzun listede de kumanda tuşları (Geri dahil) donmadan çalışır.
const katlanmis = new WeakMap();
const DILIM_MS = 12;
const nefes = () => new Promise((r) => setTimeout(r, 0));
function adlariKatla(liste) {
  const c = katlanmis.get(liste);
  if (c && c.n === liste.length) return c.p;
  const n = liste.length;
  const f = new Array(n);
  const p = (async () => {
    let t0 = Date.now();
    for (let i = 0; i < n; i++) {
      f[i] = fold(liste[i].name);
      if ((i & 127) === 127 && Date.now() - t0 > DILIM_MS) {
        await nefes();
        t0 = Date.now();
      }
    }
    return f;
  })();
  katlanmis.set(liste, { n, p });
  p.catch(() => katlanmis.delete(liste));
  return p;
}

// Tek türde arama: liste yüklenmemişse indirilir (aynı anda gelen istekler tek indirmeyi paylaşır).
export async function araTur(provider, sorgu, tur, limit) {
  const q = fold(sorgu);
  if (!q) return [];
  const liste = await provider.all(tur);
  const f = await adlariKatla(liste);
  const out = [];
  const en = limit || 200;
  for (let i = 0; i < f.length && out.length < en; i++) {
    if (f[i].indexOf(q) >= 0) out.push(liste[i]);
  }
  return out;
}

// Yeni sorgu öncekinin devamıysa ("gor" → "gora") ve önceki sonuç eksiksizse (üst sınıra varmadıysa) listeyi yeniden aramadan süzer; değilse null.
export function sonuclariSuz(onceki, oncekiSorgu, sorgu, limit) {
  const a = fold(oncekiSorgu);
  const b = fold(sorgu);
  if (!a || !b || !Array.isArray(onceki) || onceki.length >= limit || b.indexOf(a) !== 0) return null;
  return onceki.filter((x) => fold(x.name).indexOf(b) >= 0);
}

// Arama ekranı açılır açılmaz çağrılır: seçili kapsamdaki listeler (indirme + ad küçültme) arka planda hazırlanır; kullanıcı yazarken hazır olur.
export function aramayaHazirla(provider, turler) {
  (turler || []).forEach((t) => {
    Promise.resolve()
      .then(() => provider.all(t))
      .then(adlariKatla)
      .catch(() => {});
  });
}

export async function ara(provider, sorgu, limit, ilerleme, turler) {
  if (!fold(sorgu)) return [];
  const out = [];
  const kinds = ['live', 'movie', 'series'].filter((k) => !turler || !turler.length || turler.indexOf(k) >= 0);
  const en = limit || 200;
  for (let k = 0; k < kinds.length && out.length < en; k++) {
    if (ilerleme) ilerleme(kinds[k], out);
    const r = await araTur(provider, sorgu, kinds[k], en - out.length);
    for (let i = 0; i < r.length; i++) out.push(r[i]);
  }
  return out;
}
