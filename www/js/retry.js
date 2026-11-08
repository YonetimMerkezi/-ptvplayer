// Yayın takılınca yeniden bağlanma ayarları (tek oynatıcı ve çoklu ekran kutuları ortak kullanır).
export const LIVE_STALL_MS = 7000; // oynarken ya da yeniden bağlanırken bu kadar sürede yayın gelmezse yeniden dene
export const VOD_STALL_MS = 15000;
export const LIVE_MAX_RECONNECT = 60; // ~2 dk boyunca hızlı denemeler; sonra "Yeniden dene" düğmesi
export const VOD_MAX_RECONNECT = 5;
export const STEADY_MS = 8000; // bu kadar kesintisiz oynarsa deneme sayacı sıfırlanır

// n. denemeden (0'dan başlar) önce beklenecek süre: hemen, sonra 0,6 · 1,2 · 1,8 · 2 sn…
export const reconnectDelay = (n) => (n <= 0 ? 0 : Math.min(600 * n, 2000));
