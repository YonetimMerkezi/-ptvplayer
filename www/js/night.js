// Gece modu: sessiz diyalogları yükseltir, patlamaları bastırır (dinamik aralık sıkıştırma). Düzeyler Android tarafındaki
// NightCompressor ile aynı adlardadır.
export const NIGHT_LEVELS = [
  ['off', 'Kapalı'],
  ['light', 'Hafif'],
  ['medium', 'Orta'],
  ['strong', 'Güçlü'],
];
export const DEFAULT_NIGHT = 'off';
export const normalizeNight = (v) => (NIGHT_LEVELS.some(([id]) => id === v) ? v : DEFAULT_NIGHT);
export const nightLabel = (v) => (NIGHT_LEVELS.find(([id]) => id === v) || NIGHT_LEVELS[0])[1];
