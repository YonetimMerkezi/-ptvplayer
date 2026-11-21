// Sağlayıcı arşivinden (Xtream tv_archive) canlı yayında geri sarma: saf hesaplar.
// Chromium 38 uyumlu kalır (Intl yok): sunucu saati, sunucunun bildirdiği "şimdi" ile cihaz saati arasındaki farktan bulunur.
export const DK = 60000;
const GUN = 86400000;
export const CANLI_KENAR_MS = 30000; // hedef canlıya bu kadar yakınsa canlıya dönülür
export const ILERI_MS = 2 * 3600000; // arşiv akışı hedefe göre bu kadar fazlasını ister (akış erken biterse canlıya dönülür)
export const SURE_EN_FAZLA_MS = 12 * 3600000;
export const ADIMLAR = [5, 15, 30, 60, 90]; // panelde sunulan geri sarma dakikaları

// Kanalın arşivinin kapsadığı süre: tv_archive_duration gün; bilinmiyorsa 1 gün.
export const arsivMs = (it) => Math.max(1, Number(it && it.archiveDays) || 1) * GUN;
// Gidilebilecek en eski nokta (canlıdan geri kalma, ms); arşivin ucuna 2 dk pay bırakılır.
export const enFazlaGeri = (it) => arsivMs(it) - 2 * DK;

const iki = (n) => (n < 10 ? '0' : '') + n;

// Sunucunun beklediği başlangıç damgası: "YYYY-MM-DD:HH-MM", sunucunun yerel saatiyle.
export function damga(ms, farkMs) {
  const d = new Date(ms + farkMs);
  return d.getUTCFullYear() + '-' + iki(d.getUTCMonth() + 1) + '-' + iki(d.getUTCDate()) + ':' + iki(d.getUTCHours()) + '-' + iki(d.getUTCMinutes());
}

// server_info { time_now: "YYYY-MM-DD HH:MM:SS" (sunucu yerel saati), timestamp_now: unix sn } → sunucu saatinin UTC'den farkı (ms),
// 15 dakikaya yuvarlanır. Bilgi yoksa ya da bozuksa null.
export function sunucuFark(si) {
  const m = si && /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(si.time_now || ''));
  const ts = Number(si && si.timestamp_now);
  if (!m || !(ts > 0)) return null;
  const yerel = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const fark = yerel - ts * 1000;
  const r = Math.round(fark / (15 * DK)) * 15 * DK;
  return Math.abs(r) <= 14 * 3600000 ? r : null;
}

export const cihazFark = () => -new Date().getTimezoneOffset() * DK;

// geriMs kadar geriye gidilecek: ne açılacak? { canli: true } ya da { canli: false, start (dakikaya aşağı yuvarlı, ms), sureDk }.
export function plan(simdi, geriMs, enFazla) {
  const g = Math.min(Math.max(0, Number(geriMs) || 0), enFazla);
  if (g <= CANLI_KENAR_MS) return { canli: true };
  const start = Math.floor((simdi - g) / DK) * DK;
  const sure = Math.min(SURE_EN_FAZLA_MS, simdi - start + ILERI_MS);
  return { canli: false, start, sureDk: Math.ceil(sure / DK) };
}

// "−5 dk", "−1 sa 15 dk"
export function etiket(ms) {
  const dk = Math.max(0, Math.round(ms / DK));
  if (dk < 60) return '−' + dk + ' dk';
  const sa = Math.floor(dk / 60);
  const k = dk % 60;
  return '−' + sa + ' sa' + (k ? ' ' + k + ' dk' : '');
}
