// Android Media3 görüntü çözücü tercihleri.
// Otomatik cihazın kendi sıralamasını kullanır; diğer kipler donanım/yazılım çözücü sırasını değiştirir.
export const DECODER_MODES = [
  ['auto', 'Otomatik'],
  ['hardware', 'Donanım öncelikli'],
  ['software', 'Yazılım öncelikli'],
];
export const DEFAULT_DECODER = 'auto';
export const normalizeDecoder = (v) => (DECODER_MODES.some(([id]) => id === v) ? v : DEFAULT_DECODER);
export const decoderLabel = (v) => (DECODER_MODES.find(([id]) => id === v) || DECODER_MODES[0])[1];
