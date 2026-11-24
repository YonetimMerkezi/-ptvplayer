// Sürüm derleme sırasında (esbuild define) package.json'dan gelir; geliştirme/test ortamında yedek değer kullanılır.
/* global __VERSION__, __MAGAZA__, __BUILD__ */
export const SURUM = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '1.0.0';
// LG Content Store sürümü (WEBOS_MAGAZA=1 ile derlenir): mağaza güncellemeyi kendisi yaptığı için kendi kendine güncelleme çıkarılır.
export const MAGAZA = typeof __MAGAZA__ !== 'undefined' && __MAGAZA__ === true;
// Derleme kimliği (servise de yazılır): güncelleme sonrası eski servis süreci canlı kalmışsa uyuşmaz ve servis yeniden başlatılır.
export const YAPI = typeof __BUILD__ !== 'undefined' ? __BUILD__ : '';
