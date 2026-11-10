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
// Film önerisi (ctx.movie): son 15 sn'den filmin bitişine kadar kart durur, kendiliğinden başlamaz; { show, secs, movie:true }.
export function nextUp(st, ctx, { enabled = true } = {}) {
  const none = { show: false, secs: 0 };
  if (!enabled || !st || !st.item || !ctx || !(ctx.autoNext || ctx.movie) || !Array.isArray(ctx.items)) return none;
  if (st.item.kind === 'live' || st.live) return none;
  if (ctx.index >= ctx.items.length - 1) return none;
  if (!(st.dur >= MIN_DURATION_MS)) return none;
  const left = st.dur - st.pos;
  if (ctx.movie) {
    if (st.status === 'ended') return { show: true, secs: 0, movie: true };
    if (!playing(st) || left <= 0 || left > COUNTDOWN_MS) return none;
    return { show: true, secs: Math.max(1, Math.ceil(left / 1000)), movie: true };
  }
  if (!playing(st)) return none;
  if (left <= 0 || left > COUNTDOWN_MS) return none;
  return { show: true, secs: Math.max(1, Math.ceil(left / 1000)) };
}

// Film önerisi: aynı kategoride bu filmden sonra gelen ilk film; izlenmişleri (%90+) ve skip(x) olanları atlar,
// listenin sonuna gelince başa döner. Uygun film yoksa null.
export const WATCHED_RATIO = 0.9;
export function pickNextMovie(cur, all, progressOf, skip) {
  if (!cur || !Array.isArray(all)) return null;
  const g = cur.group || 'Diğer';
  const same = all.filter((x) => x && x.kind === 'movie' && (x.group || 'Diğer') === g);
  const at = same.findIndex((x) => x.id === cur.id);
  const order = at < 0 ? same : [...same.slice(at + 1), ...same.slice(0, at)];
  for (const x of order) {
    if (x.id === cur.id) continue;
    if (skip && skip(x)) continue;
    const p = progressOf ? progressOf(x) : null;
    if (p && p.dur > 0 && p.pos / p.dur >= WATCHED_RATIO) continue;
    return x;
  }
  return null;
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
