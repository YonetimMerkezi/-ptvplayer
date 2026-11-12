// Xtream abonelik bitiş uyarısı: kalan gün, uyarı düzeyi ve bitişten önce çalacak yerel bildirim (plan) — saf mantık; ekran ve zamanlama app.js'te.
export const WARN_DAYS = 7; // son 7 gün: uyarı gösterilir
export const PLAN_DAYS = 14; // son 14 gün: bildirim kurulur (aylar öncesinden Planlananlar'ı doldurmasın)
export const LEAD_DAYS = 3; // bildirim bitişten kaç gün önce
const DAY = 86400000;

export const daysLeft = (expires, now) => Math.ceil((expires - now) / DAY) + 0; // + 0: -0 olmasın

// expires: bitiş zamanı (ms). Döner { days, level: 'ok' | 'soon' | 'expired' } ya da bilgi yoksa null.
export function expiryInfo(expires, now = Date.now()) {
  if (!Number.isFinite(expires) || expires <= 0) return null;
  const days = daysLeft(expires, now);
  return { days, level: days <= 0 ? 'expired' : days <= WARN_DAYS ? 'soon' : 'ok' };
}

export function expiryText(info) {
  if (!info) return '';
  if (info.level === 'expired') return 'süresi doldu';
  return info.days === 1 ? 'son gün' : `${info.days} gün kaldı`;
}

const fmtDay = (ms) => new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

// Bitişten LEAD_DAYS gün önce sabah 10:00'da bildirim; o an geçtiyse ve abonelik sürüyorsa birkaç saniye sonra. Süresi dolmuşsa null.
// Plan türü 'rem' (Planlananlar ve yerel alarm aynı); note, bildirim metnini doğrudan verir.
export function expiryPlan({ srcId, srcName, expires, now = Date.now() }) {
  if (!Number.isFinite(expires) || expires <= now) return null;
  const d = new Date(expires - LEAD_DAYS * DAY);
  d.setHours(10, 0, 0, 0);
  const at = Math.max(d.getTime(), now + 5000);
  const days = Math.round((expires - at) / DAY);
  const note = days <= 0 ? `Aboneliğiniz bugün bitiyor (${fmtDay(expires)})` : days === 1 ? `Aboneliğiniz yarın bitiyor (${fmtDay(expires)})` : `Aboneliğiniz ${days} gün sonra bitiyor (${fmtDay(expires)})`;
  return { id: `exp:${srcId}:${expires}`, kind: 'rem', exp: true, src: String(srcId), chId: '', chName: srcName || '', title: 'Abonelik bitiyor', note, s: expires, e: expires + 3600000, at };
}
