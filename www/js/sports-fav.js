// Favori takımlar: takip listesi, maç eşleştirme ve takip edilen takımların maçları için otomatik hatırlatıcı seçimi.
// Saf mantık (ağ ve ekran yok). Takımlar kaynaklar arasında farklı yazılabildiği için (Galatasaray / Galatasaray SK) eşleştirme teamKeys ile yapılır.
import { teamKeys, norm } from './sports.js';
import { canRemind, matchPlanId } from './plan.js';

export const FAV_MAX = 30;
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
    out.push({ n, l: typeof x.l === 'string' && x.l.trim() ? x.l.trim().slice(0, 60) : n });
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

// Takibi açar/kapatır; yeni listeyi ve durumu döndürür.
export function toggleFav(favs, side) {
  const list = cleanFavs(favs);
  const i = list.findIndex((f) => sameTeam(f.n, side.name) || (side.label && sameTeam(f.n, side.label)));
  if (i >= 0) return { favs: list.filter((_, j) => j !== i), on: false };
  if (list.length >= FAV_MAX) return { favs: list, on: false, full: true };
  return { favs: list.concat({ n: String(side.name || side.label), l: String(side.label || side.name) }), on: true };
}

// Takip edilen takımların oynanmamış maçları için otomatik hatırlatıcı: daha önce otomatik kurulmuş (done) ya da zaten kurulu (planned) olanlar atlanır,
// böylece kullanıcının elle kaldırdığı hatırlatıcı yeniden kurulmaz. En fazla max maç (yakından uzağa).
export function autoRemindTargets(matches, favs, { now = Date.now(), done = [], planned = [], max = 12, horizon = 8 * 864e5 } = {}) {
  if (!favs.length) return [];
  const skip = new Set([...done, ...planned]);
  const seenId = new Set();
  const out = [];
  for (const m of [...matches].sort((a, b) => a.t - b.t)) {
    if (!canRemind(m, now) || m.t - now > horizon || !hasFavMatch(favs, m)) continue;
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
