// Oynatıcı kaydırma hareketleri ve kumanda ile sarma için saf hesaplar.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Parmak eşiği aşınca yön: yatay ('h') ya da dikey ('v'); henüz karar verilemediyse null.
export function classify(dx, dy, threshold = 14) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < threshold) return null;
  return ax >= ay ? 'h' : 'v';
}

// Yatay kaydırma → saniye. Ekran genişliğinin tamamı ≈ perScreen saniye.
export function seekDelta(dxPx, widthPx, perScreen = 120) {
  if (!(widthPx > 0)) return 0;
  return (dxPx / widthPx) * perScreen;
}

// Hedef konumu (ms) 0..dur aralığında tutar.
export function seekTarget(posMs, deltaSec, durMs) {
  return clamp(posMs + deltaSec * 1000, 0, durMs > 0 ? durMs : posMs);
}

// Dikey kaydırma → 0..1 düzey (parlaklık/ses). Yukarı kaydırınca artar; ekran yüksekliğinin ~%85'i tam aralık.
export function levelFrom(start, dyPx, heightPx, span = 0.85) {
  if (!(heightPx > 0)) return clamp(start, 0, 1);
  return clamp(start - dyPx / (heightPx * span), 0, 1);
}

// Art arda gelen (basılı tutulan) sağ-sol tuşlarında adım (sn): ilk 3 basış 10, sonra 20, 30, 60.
export const seekStep = (streak) => (streak <= 3 ? 10 : streak <= 6 ? 20 : streak <= 9 ? 30 : 60);

export const fmtDelta = (sec) => `${sec >= 0 ? '+' : '−'}${Math.abs(Math.round(sec))} sn`;
