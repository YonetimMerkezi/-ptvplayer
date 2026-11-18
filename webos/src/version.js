// Sürüm derleme sırasında (esbuild define) package.json'dan gelir; geliştirme/test ortamında yedek değer kullanılır.
/* global __VERSION__ */
export const SURUM = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '1.0.0';
