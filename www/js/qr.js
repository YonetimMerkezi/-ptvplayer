// QR kodu üretimi (TV eşleştirme ekranı). Kitaplık: qrcode-lib.js (qrcode-generator, MIT). Ağ yok, saf mantık.
import qrcode from './qrcode-lib.js';

// Metni QR kodu olarak SVG dizgesine çevirir: beyaz zemin, koyu kareler, sessiz bölge dahil, kapsayıcıya göre ölçeklenir.
// Hata düzeltme "M": kısa eşleştirme bağlantısı için küçük ve ekrandan okunabilir. Metin ASCII olmalıdır (bağlantı yüzde-kodlanmıştır).
export function qrSvg(text, { margin = 4, label = '' } = {}) {
  const q = qrcode(0, 'M');
  q.addData(String(text), 'Byte');
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: margin * 4, scalable: true, alt: label || undefined });
}

// Ölçek ve doğrulama için: kare sayısı (kenar başına)
export function qrSize(text) {
  const q = qrcode(0, 'M');
  q.addData(String(text), 'Byte');
  q.make();
  return q.getModuleCount();
}
