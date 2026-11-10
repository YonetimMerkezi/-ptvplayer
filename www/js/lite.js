// Hafif mod: animasyon, gölge ve bulanıklığı kapatır; az belleği olan TV kutularında ve eski telefonlarda arayüz akıcı kalır.
// "Otomatik": cihaz belleği 2 GB ve altındaysa açılır (WebView'in bildirdiği navigator.deviceMemory).
export const LITE_MODES = [
  ['auto', 'Otomatik'],
  ['on', 'Açık'],
  ['off', 'Kapalı'],
];
export const DEFAULT_LITE = 'auto';
export const LOW_RAM_GB = 2;

export const normalizeLite = (v) => (LITE_MODES.some(([id]) => id === v) ? v : DEFAULT_LITE);

export function isLowRam(nav) {
  const m = nav && nav.deviceMemory;
  return typeof m === 'number' && m > 0 && m <= LOW_RAM_GB;
}

export function liteOn(mode, nav) {
  const m = normalizeLite(mode);
  return m === 'on' || (m === 'auto' && isLowRam(nav));
}

// Kök öğeye data-lite koyar/kaldırır; açık mı döndürür.
export function applyLite(mode, doc, nav) {
  const on = liteOn(mode, nav);
  if (on) doc.documentElement.dataset.lite = '1';
  else delete doc.documentElement.dataset.lite;
  return on;
}
