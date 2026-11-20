// Canlı yayında geri sarma (arşivli Xtream kanalı) için saf hesaplar.
// Sunucu arşivi dakika duyarlığıyla ("YYYY-MM-DD:HH-MM") ve süreyle (dakika) açılır; bu yüzden sarmak = hedef anı dakikaya yuvarlayıp
// arşiv adresini o andan yeniden açmaktır. Arşiv akışı sarılabiliyorsa (HLS) kalan saniyeler akışın içinde atlanır (skip).
import { fmtDuration } from './util.js';

const MIN = 60000;
const DAY = 86400000;

export const SHIFT_BAR_MS = 6 * 3600000; // sarma çubuğunun kapsadığı son süre (kanalın arşivi daha kısaysa o); daha eskisi program rehberinden
export const LIVE_EDGE_MS = 30000; // hedef canlıya bu kadar yakınsa doğrudan canlıya dönülür
export const SHIFT_AHEAD_MS = 2 * 3600000; // arşiv akışı hedefe göre bu kadar fazlasını ister; akış erken biterse kaldığı yerden sürer
export const SHIFT_SPAN_MAX_MS = 12 * 3600000;

export const floorMin = (ms) => Math.floor(ms / MIN) * MIN;
export const ceilMin = (ms) => Math.ceil(ms / MIN) * MIN;

// Geri sarılabilen kanal: arşivli (tv_archive) Xtream canlı kanalı; radyo ve telefondan yayınlananlar hariç.
export function canShift(item, source) {
  return !!item && item.kind === 'live' && !!item.archive && !item.radio && !item.cast && !!source && source.type === 'xtream';
}

// Kanalın arşiv süresi (ms): tv_archive_duration gün; bilinmiyorsa 1 gün.
export const archiveMs = (item) => Math.max(1, Number(item && item.archiveDays) || 1) * DAY;
export const barMs = (item) => Math.min(SHIFT_BAR_MS, archiveMs(item));

// Arşiv akışındaki konum (ms) → gerçek an; shift = { base, ... } (akışın başladığı dakika).
export const wallOf = (shift, posMs) => shift.base + Math.max(0, Number(posMs) || 0);
export const behindOf = (now, wall) => Math.max(0, now - wall);
export const behindLabel = (ms) => '−' + fmtDuration(ms);

const clampBar = (v) => Math.min(1000, Math.max(0, v));
// Çubuk 0..1000: 1000 = canlı, 0 = pencerenin başı.
export const barValue = (now, wall, windowMs) => clampBar(Math.round(1000 * (1 - (now - wall) / windowMs)));
export const barWall = (now, value, windowMs) => now - (1 - clampBar(Number(value) || 0) / 1000) * windowMs;

// Hedef an → ne açılacak. dir > 0 ileri sarma: dakikaya yukarı yuvarlanır (geri gitmesin); aksi halde aşağı (içerik atlanmasın).
// Dönen: { live: true } ya da { live: false, start, skip, span, p: { s, e } } (p, archiveTargets'a verilen program benzeri aralıktır).
export function shiftPlan(now, target, { dir = -1, archive = DAY } = {}) {
  const t = Math.max(now - archive + 2 * MIN, Number(target) || 0);
  if (now - t <= LIVE_EDGE_MS) return { live: true };
  const start = dir > 0 ? ceilMin(t) : floorMin(t);
  if (now - start <= LIVE_EDGE_MS) return { live: true };
  const span = Math.min(SHIFT_SPAN_MAX_MS, now - start + SHIFT_AHEAD_MS);
  return { live: false, start, skip: dir > 0 ? 0 : Math.max(0, t - start), span, p: { s: start, e: start + span } };
}

// Arşiv akışı bitti: kalınan gerçek an (akış süresi biliniyorsa o, yoksa son konum, o da yoksa istenen süre).
export function endedWall(shift, st) {
  const played = st && st.dur > 0 ? st.dur : st && st.pos > 0 ? st.pos : shift.span;
  return shift.base + played;
}

// Akış bir dakikadan az oynayıp bittiyse aynı yerden yeniden açmak döngüye girer: canlıya dönülür.
export const stalled = (shift, wall) => floorMin(wall) <= shift.base;
