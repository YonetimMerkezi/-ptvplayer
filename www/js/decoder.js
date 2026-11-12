// Görüntü çözücü: "Otomatik" cihazın donanım çözücüsünü kullanır (hızlı, az pil). Bazı TV kutularının donanım çözücüsü
// belirli yayınlarda (çoğunlukla yüksek bithızlı FHD) bozuk, yeşil/beyaz ya da donuk kare verir; "Yazılım öncelikli"
// yazılım çözücüyü başa alır (daha yavaş, işlemciyi yorar ama bu yayınları genelde düzgün gösterir).
// Değerler Android tarafındaki IptvPlayerPlugin.cleanDecoder ile aynı adlardadır.
export const DECODER_MODES = [
  ['auto', 'Otomatik'],
  ['software', 'Yazılım öncelikli'],
];
export const DEFAULT_DECODER = 'auto';
export const normalizeDecoder = (v) => (DECODER_MODES.some(([id]) => id === v) ? v : DEFAULT_DECODER);
export const decoderLabel = (v) => (DECODER_MODES.find(([id]) => id === v) || DECODER_MODES[0])[1];
