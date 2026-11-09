// Sonraki bölüm geri sayımı ve intro atlama (saf mantık).

// Bölümün sonuna bu kadar kala "Sonraki bölüm" kartı açılır.
export const COUNTDOWN_MS = 15000;
// Bu süreden kısa içeriklerde (fragman, klip) geri sayım gösterilmez.
export const MIN_DURATION_MS = 120000;
// Intro düğmesi bölümün bu ilk kısmında görünür; çok kısa bölümlerde hiç görünmez.
export const INTRO_WINDOW_MS = 240000;
export const INTRO_MIN_DURATION_MS = 600000;
export const INTRO_OPTIONS = [
  [0, 'Kapalı'],
  [30, '30 sn'],
  [60, '1 dk'],
  [85, '85 sn'],
  [90, '90 sn'],
  [120, '2 dk'],
];
export const DEFAULT_INTRO = 85;

export const normalizeIntro = (v) => (INTRO_OPTIONS.some(([s]) => s === Number(v)) ? Number(v) : DEFAULT_INTRO);

const playing = (st) => st.status === 'playing' || st.status === 'buffering' || st.status === 'paused';

// Sonraki bölüm kartı: { show, secs } — ctx.items listesinde sonraki öğe varsa ve süre bitmeye 15 sn kala.
export function nextUp(st, ctx, { enabled = true } = {}) {
  const none = { show: false, secs: 0 };
  if (!enabled || !st || !st.item || !ctx || !ctx.autoNext || !Array.isArray(ctx.items)) return none;
  if (st.item.kind === 'live' || st.live || !playing(st)) return none;
  if (ctx.index >= ctx.items.length - 1) return none;
  if (!(st.dur >= MIN_DURATION_MS)) return none;
  const left = st.dur - st.pos;
  if (left <= 0 || left > COUNTDOWN_MS) return none;
  return { show: true, secs: Math.max(1, Math.ceil(left / 1000)) };
}

// Intro atla düğmesi: dizi bölümünde, başlangıçta; { show, to } — to: atlanacak konum (ms).
export function introSkip(st, { sec = DEFAULT_INTRO } = {}) {
  const none = { show: false, to: 0 };
  if (!st || !st.item || !st.ep || st.live || !playing(st) || !(sec > 0)) return none;
  if (!(st.dur >= INTRO_MIN_DURATION_MS)) return none;
  if (st.pos < 3000 || st.pos > INTRO_WINDOW_MS) return none;
  const to = Math.min(st.dur - 60000, st.pos + sec * 1000);
  return to > st.pos ? { show: true, to } : none;
}
