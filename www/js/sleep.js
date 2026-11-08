// Uyku zamanlayıcısı: süre dolunca oynatma kapanır; bitimden 30 sn önce uyarır.
export const SLEEP_OPTIONS = [
  [0, 'Kapalı'],
  [15, '15 dakika'],
  [30, '30 dakika'],
  [45, '45 dakika'],
  [60, '1 saat'],
  [90, '1,5 saat'],
  [120, '2 saat'],
];
export const WARN_MS = 30000;

// Kalan süreyi "12 dk" / "45 sn" biçiminde yazar.
export function fmtRemaining(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 60) return Math.ceil(s / 60) + ' dk';
  return s + ' sn';
}

export function createSleepTimer({ timers = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) }, now = () => Date.now(), onWarn, onFire }) {
  let endAt = 0;
  let minutes = 0;
  let warnT = null;
  let fireT = null;
  const clear = () => {
    if (warnT) timers.clear(warnT);
    if (fireT) timers.clear(fireT);
    warnT = fireT = null;
  };
  return {
    set(min) {
      clear();
      minutes = min > 0 ? min : 0;
      endAt = minutes ? now() + minutes * 60000 : 0;
      if (!minutes) return;
      const total = minutes * 60000;
      if (total > WARN_MS * 2) warnT = timers.set(() => onWarn && onWarn(), total - WARN_MS);
      fireT = timers.set(() => {
        clear();
        endAt = 0;
        minutes = 0;
        onFire();
      }, total);
    },
    cancel() {
      clear();
      endAt = 0;
      minutes = 0;
    },
    active: () => endAt > 0,
    minutes: () => minutes,
    remaining: () => (endAt ? Math.max(0, endAt - now()) : 0),
  };
}
