// Uygulama şifresi (PIN): saf mantık. Şifre düz metin saklanmaz; tuzlu SHA-256 özeti saklanır.
// Yanlış denemelerde bekleme süresi artar. Arayüz lockui.js'te, bağlantı app.js'tedir.

export const MIN_LEN = 4;
export const MAX_LEN = 6;
// Arka plandan dönünce şifre isteme zamanı (saniye); -1: yalnız uygulama açılırken.
export const AFTER_OPTIONS = [
  [0, 'Her seferinde'],
  [60, '1 dakika sonra'],
  [300, '5 dakika sonra'],
  [900, '15 dakika sonra'],
  [-1, 'Yalnızca uygulama açılırken'],
];
export const DEFAULT_AFTER = 60;

export const isValidPin = (p) => typeof p === 'string' && /^\d+$/.test(p) && p.length >= MIN_LEN && p.length <= MAX_LEN;
export const normalizeAfter = (v) => (AFTER_OPTIONS.some(([k]) => k === Number(v)) ? Number(v) : DEFAULT_AFTER);

export function newSalt(rand = () => Math.random()) {
  let s = '';
  for (let i = 0; i < 16; i++) s += Math.floor(rand() * 16).toString(16);
  return s;
}

// subtle yoksa (eski WebView / düz http) çok turlu basit bir özetle devam edilir.
function fallbackHash(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let round = 0; round < 2000; round++) {
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  }
  return 'f' + (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

export async function hashPin(pin, salt, subtle = globalThis.crypto && globalThis.crypto.subtle) {
  const text = `iptv:${salt}:${pin}`;
  if (subtle && typeof subtle.digest === 'function') {
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return 's' + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return fallbackHash(text);
}

export async function makeRecord(pin, { salt = newSalt(), subtle } = {}) {
  return { salt, hash: await hashPin(pin, salt, subtle), len: pin.length };
}

export async function checkPin(pin, rec, subtle) {
  if (!rec || !rec.salt || !rec.hash || typeof pin !== 'string') return false;
  const h = await hashPin(pin, rec.salt, subtle);
  let diff = h.length ^ rec.hash.length;
  for (let i = 0; i < Math.max(h.length, rec.hash.length); i++) diff |= (h.charCodeAt(i) || 0) ^ (rec.hash.charCodeAt(i) || 0);
  return diff === 0;
}

// ---- yanlış deneme sınırı: her 5 ardışık hatadan sonra 30 sn, sonra ikiye katlanır (en çok 10 dk) ----
export const emptyFail = () => ({ n: 0, until: 0 });

export function registerFail(st, now = Date.now()) {
  const n = ((st && st.n) || 0) + 1;
  if (n % 5 !== 0) return { n, until: (st && st.until) || 0 };
  const wait = Math.min(600000, 30000 * 2 ** (n / 5 - 1));
  return { n, until: now + wait };
}

export const waitMs = (st, now = Date.now()) => Math.max(0, ((st && st.until) || 0) - now);

export const fmtWait = (ms) => {
  const s = Math.ceil(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} dk ${s % 60} sn` : `${s} sn`;
};

// Uygulama arka plandan dönünce kilit gerekir mi?
export function shouldLock({ enabled, after, hiddenAt, now = Date.now() }) {
  if (!enabled || hiddenAt == null) return false;
  const a = normalizeAfter(after);
  if (a === -1) return false;
  return a === 0 || now - hiddenAt >= a * 1000;
}
