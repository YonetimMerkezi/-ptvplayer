// Film/dizi kutularındaki ad alanı (Ayarlar > Genel ayarlar): kaç satır görünsün; 0 = ad gizli, yalnız afiş.
// Alan yüksekliği CSS'te (--cap-lines) ve ızgara hücre yüksekliğinde (captionPx) aynı formülle hesaplanır.
export const CAPTION_LINES = [
  [0, 'Gizli'],
  [2, '2 satır'],
  [3, '3 satır'],
  [5, '5 satır'],
];
export const DEFAULT_CAPTION = 3;

// Yazı 0,8125 rem (--cap-fs ile değişebilir) × 1,25 satır aralığı; üst/alt boşluk toplam 1,0625 rem
export const CAP_FS = 0.8125;
const LINE_K = 1.25;
const PAD_REM = 1.0625;

export function normalizeCaption(v) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; // null/boş metin 0 sayılmasın
  return CAPTION_LINES.some(([x]) => x === n) ? n : DEFAULT_CAPTION;
}

// Ad alanının piksel yüksekliği (kök yazı 16 px; scale = yazı boyutu çarpanı; fs = ad yazısı, rem). 0 satır = 0.
export function captionPx(lines, scale = 1, fs = CAP_FS) {
  const n = normalizeCaption(lines);
  return n === 0 ? 0 : Math.round((n * LINE_K * fs + PAD_REM) * 16 * scale);
}

export function applyCaption(lines, doc) {
  const n = normalizeCaption(lines);
  const root = doc.documentElement;
  root.style.setProperty('--cap-lines', String(n || DEFAULT_CAPTION));
  if (n === 0) root.dataset.nocap = '1';
  else delete root.dataset.nocap;
  return n;
}
