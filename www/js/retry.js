// Yayın takılınca yeniden bağlanma ayarları (tek oynatıcı ve çoklu ekran kutuları ortak kullanır).
export const LIVE_STALL_MS = 7000; // oynarken ya da yeniden bağlanırken bu kadar sürede yayın gelmezse yeniden dene
export const VOD_STALL_MS = 15000;
export const LIVE_MAX_RECONNECT = 60; // ~2 dk boyunca hızlı denemeler; sonra "Yeniden dene" düğmesi
export const VOD_MAX_RECONNECT = 5;
export const STEADY_MS = 8000; // bu kadar kesintisiz oynarsa deneme sayacı sıfırlanır

// n. denemeden (0'dan başlar) önce beklenecek süre: hemen, sonra 0,6 · 1,2 · 1,8 · 2 sn…
export const reconnectDelay = (n) => (n <= 0 ? 0 : Math.min(600 * n, 2000));

// Ayarlardan seçilen yeniden bağlanma davranışı (Genel ayarlar › Yayın bağlantısı). Tek oynatıcı ve çoklu ekran aynısını kullanır.
export const RECONNECT_MODES = [
  ['normal', 'Normal (yaklaşık 2 dk dener)'],
  ['endless', 'Sürekli (siz durdurana kadar)'],
  ['off', 'Kapalı (hemen hata göster)'],
];
export const STALL_LEVELS = [
  ['fast', 'Hızlı (4 sn)'],
  ['normal', 'Normal (7 sn)'],
  ['patient', 'Sabırlı (12 sn)'],
];
export const DEFAULT_RECONNECT = 'normal';
export const DEFAULT_STALL = 'normal';
export const normalizeReconnect = (v) => (RECONNECT_MODES.some(([id]) => id === v) ? v : DEFAULT_RECONNECT);
export const normalizeStall = (v) => (STALL_LEVELS.some(([id]) => id === v) ? v : DEFAULT_STALL);

// liveMax / vodMax: art arda en çok kaç yeniden bağlanma; liveStallMs / vodStallMs: oynarken yayın gelmezse bekleme.
export function retryPolicy({ reconnect = DEFAULT_RECONNECT, stall = DEFAULT_STALL } = {}) {
  const mode = normalizeReconnect(reconnect);
  const level = normalizeStall(stall);
  const live = { fast: 4000, normal: LIVE_STALL_MS, patient: 12000 }[level];
  const vod = { fast: 8000, normal: VOD_STALL_MS, patient: 25000 }[level];
  const max = { normal: [LIVE_MAX_RECONNECT, VOD_MAX_RECONNECT], endless: [Infinity, Infinity], off: [0, 0] }[mode];
  return { liveMax: max[0], vodMax: max[1], liveStallMs: live, vodStallMs: vod };
}
