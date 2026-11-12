// Canlı yayın biçimi (Xtream: HLS ya da TS). Otomatik: HLS önce denenir; bir kanal HLS'te donup TS'te düzgün oynarsa (ya da tersi) çalışan biçim
// kanal için hatırlanır ve sonraki açılışta o biçim başa alınır. "TS önce" / "HLS önce" ayarı hatırlanan kanal dışındakilerin sırasını belirler.
export const LIVE_FORMATS = [
  ['auto', 'Otomatik (sorunlu kanalı hatırlar)'],
  ['hls', 'HLS önce'],
  ['ts', 'TS önce'],
];
export const DEFAULT_LIVE_FMT = 'auto';
export const normalizeLiveFmt = (v) => (LIVE_FORMATS.some(([id]) => id === v) ? v : DEFAULT_LIVE_FMT);

export const FMT_MAX = 300; // hatırlanan en çok kanal sayısı (en eskiler atılır)
const OK = new Set(['hls', 'ts']);

// Kayıtlı harita: { kanalKimliği: 'hls' | 'ts' } (bozuk kayıtlar atılır)
export function cleanFmtMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) if (k && OK.has(v)) out[k] = v;
  return out;
}

// Hatırlanan biçimi günceller (yeni kayıt sona gider, sınır aşılırsa en eski atılır); değişmediyse aynı nesneyi döndürür.
export function rememberFmt(map, key, mime) {
  if (!key || !OK.has(mime)) return map;
  if (map[key] === mime) return map;
  const next = { ...map };
  delete next[key];
  next[key] = mime;
  const keys = Object.keys(next);
  for (let i = 0; i < keys.length - FMT_MAX; i++) delete next[keys[i]];
  return next;
}

// Hedef listesini biçim tercihine göre dizer: tercih edilen biçimli ilk (yedek kanal olmayan) hedef başa alınır; diğer sıra korunur.
export function orderLive(targets, prefer) {
  if (!OK.has(prefer)) return targets;
  const i = targets.findIndex((t) => !t.alt && t.mime === prefer);
  if (i <= 0) return targets;
  return [targets[i], ...targets.slice(0, i), ...targets.slice(i + 1)];
}

// Uygulamanın kullanacağı tercih: kanal için hatırlanan biçim, yoksa ayardaki (otomatik değilse) biçim.
export const preferFor = (fmt, map, itemId) => map[itemId] || (fmt === 'auto' ? '' : fmt);
