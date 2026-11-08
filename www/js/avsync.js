// Ses senkronu (dudak uyumu): sesi görüntüye göre geciktirir (+) ya da öne alır (−). Değer ms, her yayında geçerli.
export const DELAY_MIN = -1000;
export const DELAY_MAX = 2000;
export const DELAY_STEP = 50;
export const DELAY_PRESETS = [-250, -50, 50, 250]; // sayfadaki hızlı adım düğmeleri

export function clampDelay(v) {
  const n = Math.round(Number(v) / DELAY_STEP) * DELAY_STEP;
  return Number.isFinite(n) ? Math.max(DELAY_MIN, Math.min(DELAY_MAX, n)) : 0;
}

export const stepDelay = (cur, d) => clampDelay(clampDelay(cur) + d);

export const fmtDelay = (ms) => (ms === 0 ? 'Ayarsız' : `${ms > 0 ? '+' : '−'}${Math.abs(ms)} ms`);

export function describeDelay(ms) {
  if (ms === 0) return 'Ses ve görüntü olduğu gibi';
  return ms > 0 ? 'Ses geciktirildi (ses görüntüden önce geliyorsa)' : 'Ses öne alındı (ses görüntüden sonra geliyorsa)';
}
