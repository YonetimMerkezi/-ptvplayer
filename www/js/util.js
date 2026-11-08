// Küçük yardımcılar: Türkçe duyarsız arama metni, kimlik, biçimleme.

export function fold(s) {
  return String(s ?? '')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hashId(s) {
  let h = 0x811c9dc5;
  const str = String(s ?? '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function fmtClock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function debounce(fn, ms) {
  let t = null;
  const w = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  w.cancel = () => clearTimeout(t);
  return w;
}

export function decodeBase64Utf8(b64) {
  if (!b64) return '';
  try {
    const bin = atob(String(b64));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return String(b64);
  }
}

export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, g) => {
    const k = g.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    const cp = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
  });
}

// Ekranda gösterilecek adreste gizli bilgileri (kullanıcı adı, şifre, anahtar) noktalarla kapatır.
// Sorgudaki username/password/token vb. değerleri ve "kullanıcı:şifre@" önekini gizler; yol ve sunucu adı kalır.
const SECRET_KEYS = /^(username|user|uname|login|password|pass|passwd|pwd|token|key|apikey|api_key|secret|auth|mac)$/i;
export function maskUrl(u) {
  return String(u == null ? '' : u)
    .replace(/\/\/[^/@\s?#]+@/, '//••••@')
    .replace(/([?&;])([^=&#\s]+)=([^&#\s]*)/g, (m, sep, k, v) => (SECRET_KEYS.test(k) ? `${sep}${k}=••••` : m));
}
