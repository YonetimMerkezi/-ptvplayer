// Küçük yardımcılar: Türkçe duyarsız arama metni, kimlik, biçimleme.

// Genel (g bayraklı) düzenli ifadenin tüm eşleşmeleri DİZİ olarak. String.prototype.matchAll yerine kullanılır: LG webOS 3.x'in Chromium'unda matchAll'ın
// döndürdüğü yineleyici for-of/yayma ile okunamaz ("Invalid attempt to iterate non-iterable instance") ve Array.from boş dizi verir.
export function allMatches(re, s) {
  const out = [];
  const str = String(s == null ? '' : s);
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(str))) {
    out.push(m);
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

// Yalnız ASCII içeren adlar (çoğu kanal/film adı) için kısa yol: "tr" yerel ayarlı küçük harf (yavaş) gerekmez, sonuç aynıdır
// (ASCII'de tek fark "I" → "ı" idi ve o zaten sonra "i"ye çevriliyordu). Türkçe harf varsa tam yol: İ → i, küçült, aksan at, ı → i.
const NON_ASCII = /[^\x00-\x7f]/;
export function fold(s) {
  s = String(s ?? '');
  if (!NON_ASCII.test(s)) return s.toLowerCase().replace(/\s+/g, ' ').trim();
  return s
    .replace(/İ/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

// YouTube kimliği: 11 karakterlik kimlik ya da watch/embed/shorts/youtu.be adresi → kimlik; geçersizse ''
export function youtubeIdOf(v) {
  const s = String(v ?? '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
  return m ? m[1] : '';
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
