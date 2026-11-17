// Önden indirme: açılıştan bir süre sonra, ölçüsüz (Wi-Fi/ethernet) ağdayken sık bakılan içeriklerin afişleri ve içerik uyarıları ile
// bugünün maçlarının takım simgeleri cihaza indirilir; sayfalar açılınca beklemez, çevrimdışıyken de görünür.
// Görseller yerel görsel önbelleğine (ImageCache) iner, uyarılar ve film bilgisi her zamanki önbelleğe (store.cache).
// Saf mantık: yerel eklenti, ağ ve uyarı çekici dışarıdan verilir (sahte nesnelerle test edilir).
import { loadMatches } from './sports.js';
import { sideLogo } from './sports-logos.js';

export const WARM_GAP_MS = 6 * 3600e3; // iki önden indirme arası en az bu kadar süre
export const MAX_IMAGES = 160; // bir turda indirilecek en çok görsel
export const MAX_ADVISORIES = 24; // bir turda uyarıları hazırlanacak en çok film
export const WARM_PREF = 'warm.at';

export const httpUrls = (list) => [...new Set((list || []).map((u) => String(u || '').trim()).filter((u) => /^https?:\/\//i.test(u)))];

// Bugünün maçlarındaki takımların simgeleri (milli takımda bayrak, kulüpte kaynağın logosu); rozet araması gerektirenler görüntülenince önbelleğe girer.
export const matchLogoUrls = (matches) => httpUrls((matches || []).flatMap((m) => [sideLogo(m.home, m.away).src, sideLogo(m.away, m.home).src]));

// Seçili öğeleri kaynak sırasına göre, aynı kimlik bir kez olacak biçimde birleştirir.
export function uniqueEntries(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const e of list || []) {
      if (!e || !e.it || seen.has(e.it.id)) continue;
      seen.add(e.it.id);
      out.push(e);
    }
  }
  return out;
}

export function createWarm({ native, store, net, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let running = false;
  const unmetered = async () => {
    try {
      const i = await native.imageCacheInfo();
      return !!(i && i.unmetered);
    } catch {
      return false;
    }
  };
  // Görselleri 20'şerlik parçalarla indirir; her parçadan önce ağ hâlâ ölçüsüz mü ve iş durdurulmuş mu bakılır.
  async function images(urls, stop) {
    const list = httpUrls(urls).slice(0, MAX_IMAGES);
    let added = 0;
    for (let i = 0; i < list.length; i += 20) {
      if (stop() || !(await unmetered())) return { added, stopped: true };
      try {
        const r = await native.warmImages({ urls: list.slice(i, i + 20) });
        added += (r && r.added) || 0;
      } catch {
        return { added, stopped: true };
      }
    }
    return { added, stopped: false };
  }
  return {
    // items: [{ logo }] afişi/logosu indirilecek öğeler; movies: [öğe] uyarıları hazırlanacak filmler; advise(öğe): bir filmin uyarılarını çekip önbelleğe alır;
    // sports: bugünün maç simgeleri de indirilsin; busy(): oynatma vb. sürüyorsa true (iş durur, bir sonraki açılışta yeniden denenir).
    async run({ items = [], movies = [], advise = null, sports = true, busy = () => false, force = false } = {}) {
      if (!native || running) return { skipped: running ? 'running' : 'web' };
      if (!force && now() - Number(store.pref(WARM_PREF, 0)) < WARM_GAP_MS) return { skipped: 'recent' };
      running = true; // ağ sorgusundan önce: aynı anda gelen ikinci çağrı da elenir
      const res = { images: 0, advisories: 0, matches: 0, stopped: false };
      try {
        if (!(await unmetered())) return { skipped: 'metered' };
        const a = await images(items.map((it) => it && it.logo), busy);
        res.images += a.added;
        res.stopped = a.stopped;
        if (advise) {
          for (const it of movies.slice(0, MAX_ADVISORIES)) {
            if (res.stopped || busy() || !(await unmetered())) {
              res.stopped = true;
              break;
            }
            try {
              await advise(it);
              res.advisories++;
            } catch {
              /* bir filmin uyarısı alınamadıysa sıradakine geçilir; ayrıntı sayfası açılınca yeniden denenir */
            }
            await sleep(400); // ücretsiz kaynaklara (KTB, Screenwise) yük bindirmemek için aralıklı
          }
        }
        if (sports && net && !res.stopped) {
          let ms = [];
          try {
            ms = (await loadMatches({ net, now: now(), back: 0, ahead: 0, budgetMs: 30000, timeoutMs: 8000 })).matches || [];
          } catch {
            /* maç listesi alınamadıysa yalnız bu adım atlanır */
          }
          res.matches = ms.length;
          const s = await images(matchLogoUrls(ms), busy);
          res.images += s.added;
          res.stopped = res.stopped || s.stopped;
        }
        if (!res.stopped) store.setPref(WARM_PREF, now());
      } finally {
        running = false;
      }
      return res;
    },
  };
}
