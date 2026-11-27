// Favori takımlar: takip listesi, maç eşleştirme ve takip edilen takımların maçları için otomatik hatırlatıcı seçimi.
// Saf mantık (ağ ve ekran yok). Takımlar kaynaklar arasında farklı yazılabildiği için (Galatasaray / Galatasaray SK) eşleştirme teamKeys ile yapılır.
import { teamKeys, norm, isYouthMatch } from './sports.js';
import { canRemind, matchPlanId, makeMatchPlan, MATCH_LEAD_DEFAULT } from './plan.js';

export const FAV_MAX = 30;
export const FAV_KEY = 'sp.favs'; // takip edilen takımlar (kayıtlı ayar)
export const FAV_DONE_KEY = 'sp.favdone'; // otomatik hatırlatıcısı kurulmuş maç kimlikleri (elle kaldırılan yeniden kurulmaz)
export const LEAD_KEY = 'sp.lead'; // maç hatırlatıcısı kaç dakika önce
export const FAV_CHIP = '__fav'; // lig çipi kimliği: yalnız takip edilen takımların maçları
export const AUTO_DONE_MAX = 400;

const keyCache = new Map();
const keysOf = (name) => {
  const core = norm(name);
  let k = keyCache.get(core);
  if (!k) keyCache.set(core, (k = teamKeys(name)));
  return k;
};

// Kayıtlı listeyi temizler: [{ n: takım adı, l: ekranda görünen ad }]; bozuk/yinelenen kayıtlar atılır.
export function cleanFavs(raw) {
  const out = [];
  const seen = new Set();
  for (const x of Array.isArray(raw) ? raw : []) {
    const n = x && typeof x.n === 'string' ? x.n.trim().slice(0, 60) : '';
    const k = norm(n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const rec = { n, l: typeof x.l === 'string' && x.l.trim() ? x.l.trim().slice(0, 60) : n };
    if (typeof x.g === 'string' && /^[a-z0-9.]{2,24}$/.test(x.g)) rec.g = x.g; // takımın ülke ligi (ESPN kimliği): takım sayfası maçlarını hangi ligde arayacağını bilir
    out.push(rec);
    if (out.length >= FAV_MAX) break;
  }
  return out;
}

// İki takım adı aynı takım mı? Kesin adlar paylaşılıyorsa ya da ayırt edici uzun sözcük ortaksa.
export function sameTeam(a, b) {
  if (!a || !b) return false;
  const x = keysOf(a);
  const y = keysOf(b);
  for (const s of x.strong) if (y.strong.has(s)) return true;
  if (x.single && y.words.has(x.single)) return true;
  if (y.single && x.words.has(y.single)) return true;
  return false;
}

// Bir maç tarafı (ESPN / LiveScore / yayın akışı) takip listesinde mi? Hem özgün adı hem Türkçe adı denenir.
export const isFavSide = (favs, side) => !!side && favs.some((f) => sameTeam(f.n, side.name) || (side.label && sameTeam(f.n, side.label)));
export const hasFavMatch = (favs, m) => !!m && favs.length > 0 && (isFavSide(favs, m.home) || isFavSide(favs, m.away));

// Takibi açar/kapatır; yeni listeyi ve durumu döndürür. lg: takımın ülke ligi (biliniyorsa kayda yazılır).
export function toggleFav(favs, side, lg) {
  const list = cleanFavs(favs);
  const i = list.findIndex((f) => sameTeam(f.n, side.name) || (side.label && sameTeam(f.n, side.label)));
  if (i >= 0) return { favs: list.filter((_, j) => j !== i), on: false };
  if (list.length >= FAV_MAX) return { favs: list, on: false, full: true };
  const rec = { n: String(side.name || side.label), l: String(side.label || side.name) };
  if (lg) rec.g = String(lg);
  return { favs: cleanFavs(list.concat(rec)), on: true };
}

// Takip edilen takımların oynanmamış maçları için otomatik hatırlatıcı: daha önce otomatik kurulmuş (done) ya da zaten kurulu (planned) olanlar atlanır,
// böylece kullanıcının elle kaldırdığı hatırlatıcı yeniden kurulmaz. En fazla max maç (yakından uzağa).
export function autoRemindTargets(matches, favs, { now = Date.now(), done = [], planned = [], max = 12, horizon = 8 * 864e5 } = {}) {
  if (!favs.length) return [];
  const skip = new Set([...done, ...planned]);
  const seenId = new Set();
  const out = [];
  for (const m of [...matches].sort((a, b) => a.t - b.t)) {
    if (!canRemind(m, now) || m.t - now > horizon || isYouthMatch(m) || !hasFavMatch(favs, m)) continue;
    const id = matchPlanId(m);
    if (skip.has(id) || seenId.has(id)) continue; // aynı maç iki kaynaktan gelebilir
    seenId.add(id);
    out.push(m);
    if (out.length >= max) break;
  }
  return out;
}

// Otomatik kurulanlar listesi (kayıtlı): yeni kimlikler eklenir, geçmiş maçların kimlikleri (kimlikteki saat) ve fazlalık atılır.
export function nextDone(done, addIds, now = Date.now()) {
  const keep = [...(Array.isArray(done) ? done : []), ...addIds].filter((id) => {
    const t = Number(String(id).split(':')[1]);
    return typeof id === 'string' && (!Number.isFinite(t) || t > now - 864e5);
  });
  return [...new Set(keep)].slice(-AUTO_DONE_MAX);
}

// Otomatik kurulmuş maç kimlikleri (kayıtlı ayardan)
export function readDone(store) {
  const v = store.pref(FAV_DONE_KEY, []);
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

// Takip edilen takımların oynanmamış maçları için hatırlatıcıları kurar; Spor ekranı ve kendiliğinden eşitleme (follow-sync.js) aynı yolu kullanır.
// rem: { list(), set(plan) }; info(m): hatırlatıcıya yazılacak { chId, chName, src }. Döner: kurulan maçların plan kimlikleri.
export function applyAutoRemind({ matches, favs, rem, store, now = Date.now(), info }) {
  if (!rem || !favs.length || !matches.length) return [];
  let planned = [];
  try {
    planned = (rem.list() || []).map((x) => x.id);
  } catch {
    return [];
  }
  const todo = autoRemindTargets(matches, favs, { now, done: readDone(store), planned });
  const lead = Number(store.pref(LEAD_KEY, MATCH_LEAD_DEFAULT));
  const ids = [];
  for (const m of todo) {
    try {
      rem.set(makeMatchPlan(m, { lead, ...info(m) }));
      ids.push(matchPlanId(m));
    } catch {
      /* bu maç için kurulamadı; sonra yeniden denenir */
    }
  }
  if (todo.length || readDone(store).length) {
    try {
      store.setPref(FAV_DONE_KEY, nextDone(readDone(store), ids, now));
    } catch {
      /* kayıt başarısız */
    }
  }
  return ids;
}

// Takımın ülke ligini kayda yazar (takım sayfasında bulunduktan sonra; sonraki açılışta tarama gerekmez). Kayıt yoksa liste aynen döner.
export function setFavLeague(favs, name, lg) {
  const list = cleanFavs(favs);
  const i = list.findIndex((f) => sameTeam(f.n, name));
  if (i < 0 || list[i].g === lg) return list;
  return list.map((f, j) => (j === i ? { ...f, g: lg } : f));
}
