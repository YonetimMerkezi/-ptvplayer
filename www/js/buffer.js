// Yayın önbelleği (oynatıcının önden indirip biriktirdiği süre): büyüdükçe ağ dalgalanmasında takılma azalır,
// ancak kanal açılışı biraz gecikir ve bellek kullanımı artar. Sayılar yerel eklentide (IptvPlayerPlugin.loadControlFor) uygulanır.
export const BUFFER_LEVELS = [
  ['normal', 'Normal'],
  ['high', 'Yüksek'],
  ['max', 'Çok yüksek'],
];
export const DEFAULT_BUFFER = 'high';

export function normalizeBuffer(level) {
  return BUFFER_LEVELS.some(([id]) => id === level) ? level : DEFAULT_BUFFER;
}
