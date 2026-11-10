// Davet kodu ile gelen “yönetilen” kaynaklar: yönetici listeyi bir koda bağlar, kullanıcı kodu girince liste eklenir.
// Sunucu yok: veri GitHub’daki herkese açık `data` dalında durur (config.json). Her giriş AES-GCM ile şifrelidir ve
// anahtarı koddan türer (PBKDF2); kodu bilmeyen kimse ne listeyi ne kullanıcı adını okuyabilir.
// Saf mantık: ağ (net), depo (store) ve şifreleme (subtle) dışarıdan verilir; tarayıcıda ve Node’da aynı çalışır.
import { isTransient, retry } from './update.js';

export const CONFIG_BASES = ['https://raw.githubusercontent.com/YonetimMerkezi/-ptvplayer/data/'];
export const CONFIG_FILE = 'config.json';
export const CONFIG_VERSION = 1;
export const PBKDF2_ITERS = 100000;
export const CHECK_MS = 6 * 3600e3; // yönetilen kaynaklar en çok 6 saatte bir (açılışta dakikada bir) denetlenir
export const LAUNCH_MS = 60e3;

// 32 harf: I, O, 0, 1 yok (okurken karışmasın). 16 karakter = 80 bit.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 16;

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtleOf = (s) => s || globalThis.crypto.subtle;
const randOf = (r) => r || ((n) => globalThis.crypto.getRandomValues(new Uint8Array(n)));

export const toHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
export function b64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s) {
  const bin = atob(String(s));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

// ---- kod -------------------------------------------------------------------------------------------------------
export function newCode(rand) {
  const bytes = randOf(rand)(CODE_LEN);
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[bytes[i] % ALPHABET.length]; // 256 % 32 = 0 → eğilimsiz
  return formatCode(s);
}
export const formatCode = (norm) => (norm.match(/.{1,4}/g) || []).join('-');
// Kullanıcının yazdığı kodu (küçük harf, tire, boşluk) sadeleştirir; geçersizse ''.
export function normalizeCode(s) {
  const n = String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return n.length === CODE_LEN && [...n].every((c) => ALPHABET.includes(c)) ? n : '';
}
export async function codeId(code, subtle) {
  const norm = normalizeCode(code);
  if (!norm) throw new Error('Kod geçersiz');
  return toHex(new Uint8Array(await subtleOf(subtle).digest('SHA-256', enc.encode('iptv-id:' + norm)))).slice(0, 20);
}

// ---- şifreleme -------------------------------------------------------------------------------------------------
export async function deriveKey(secret, salt, iters, subtle) {
  const s = subtleOf(subtle);
  const base = await s.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return s.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iters }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
// Düz nesneyi parola/kodla şifreler → { s, i, c, it? } (base64).
export async function seal(obj, secret, { subtle, rand, iters = PBKDF2_ITERS, aad = '' } = {}) {
  const s = subtleOf(subtle);
  const r = randOf(rand);
  const salt = r(16);
  const iv = r(12);
  const key = await deriveKey(secret, salt, iters, s);
  const ct = new Uint8Array(await s.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(JSON.stringify(obj))));
  return { s: b64(salt), i: b64(iv), c: b64(ct), it: iters };
}
export async function unseal(sealed, secret, { subtle, aad = '' } = {}) {
  try {
    const iters = Number(sealed.it) > 0 && Number(sealed.it) <= 2e6 ? Number(sealed.it) : PBKDF2_ITERS;
    const s = subtleOf(subtle);
    const key = await deriveKey(secret, unb64(sealed.s), iters, s);
    const pt = await s.decrypt({ name: 'AES-GCM', iv: unb64(sealed.i), additionalData: enc.encode(aad) }, key, unb64(sealed.c));
    return JSON.parse(dec.decode(pt));
  } catch {
    throw new Error('Çözülemedi');
  }
}

// Bir kullanıcının yükü: { p:1, n:ad, x:bitişMs|0, s:[{type,name,url|server,user,pass,epgUrl}] }
export async function sealEntry(code, payload, opts = {}) {
  const id = await codeId(code, opts.subtle);
  return seal(payload, normalizeCode(code), { ...opts, aad: id });
}
export async function openEntry(code, entry, opts = {}) {
  const id = await codeId(code, opts.subtle);
  return unseal(entry, normalizeCode(code), { ...opts, aad: id });
}

// ---- config.json -----------------------------------------------------------------------------------------------
// Cihaz kimliği (12 hex) karşılaştırması için sadeleştirir: "ab12-CD34" → "ab12cd34".
export const normDevice = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-f0-9]/g, '');

export function buildConfig({ entries = {}, blocked = [], at = Date.now() } = {}) {
  return { v: CONFIG_VERSION, at, blocked: [...new Set(blocked.map(normDevice).filter(Boolean))], entries };
}
// Ağdan gelen config.json’u doğrular; bozuksa null.
export function parseConfig(j) {
  if (!j || typeof j !== 'object' || j.v !== CONFIG_VERSION || typeof j.entries !== 'object' || !j.entries) return null;
  const entries = {};
  for (const [id, e] of Object.entries(j.entries)) {
    if (/^[0-9a-f]{20}$/.test(id) && e && typeof e.s === 'string' && typeof e.i === 'string' && typeof e.c === 'string') entries[id] = { s: e.s, i: e.i, c: e.c, it: e.it };
  }
  return { at: Number(j.at) > 0 ? Number(j.at) : 0, blocked: (Array.isArray(j.blocked) ? j.blocked : []).map(normDevice).filter(Boolean), entries };
}
export async function fetchConfig(net, { bases = CONFIG_BASES, sleep } = {}) {
  let last;
  for (const b of bases) {
    try {
      const j = await retry(() => net.json(b + CONFIG_FILE + '?check=' + Date.now()), { sleep });
      const cfg = parseConfig(j);
      if (!cfg) throw Object.assign(new Error('Yapılandırma dosyası okunamadı'), { permanent: true });
      return cfg;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

// ---- çözümleme -------------------------------------------------------------------------------------------------
const str = (v, n = 2000) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

// Yükteki kaynak tanımlarını depo kaynaklarına çevirir; kimlikler kodla sabittir (tekrar eklemez, güncellenir).
export function toSources(payload, id, norm) {
  const out = [];
  (Array.isArray(payload && payload.s) ? payload.s : []).slice(0, 10).forEach((s, n) => {
    if (!s || typeof s !== 'object') return;
    const base = { id: `m${id.slice(0, 12)}-${n}`, name: str(s.name, 80) || str(payload.n, 80) || 'Liste', epgUrl: str(s.epgUrl), managed: true, code: norm };
    if (s.type === 'xtream' && str(s.server) && str(s.user)) out.push({ ...base, type: 'xtream', server: str(s.server), user: str(s.user), pass: str(s.pass) });
    else if (s.type === 'm3u' && str(s.url)) out.push({ ...base, type: 'm3u', url: str(s.url) });
  });
  return out;
}

// → { status: 'ok'|'blocked'|'missing'|'expired'|'bad', payload?, sources? }
export async function resolveCode(code, cfg, { deviceId = '', now = Date.now(), subtle } = {}) {
  const norm = normalizeCode(code);
  if (!norm) return { status: 'bad' };
  if (deviceId && cfg.blocked.includes(normDevice(deviceId))) return { status: 'blocked' };
  const id = await codeId(norm, subtle);
  const entry = cfg.entries[id];
  if (!entry) return { status: 'missing' };
  let payload;
  try {
    payload = await openEntry(norm, entry, { subtle });
  } catch {
    return { status: 'bad' };
  }
  const t = Math.max(now, cfg.at || 0); // cihaz saati geri alınsa bile yayın zamanından geri gidilmez
  if (Number(payload.x) > 0 && t > Number(payload.x)) return { status: 'expired', payload };
  const sources = toSources(payload, id, norm);
  if (!sources.length) return { status: 'bad' };
  return { status: 'ok', payload, sources };
}

const sameSource = (a, b) => ['type', 'name', 'url', 'server', 'user', 'pass', 'epgUrl'].every((k) => (a[k] || '') === (b[k] || ''));

// Çözülen kaynakları depoya işler (yoksa ekler, değiştiyse günceller, artık olmayanları kaldırır). → { added, updated, removed }
function applySources(store, norm, sources) {
  let added = 0;
  let updated = 0;
  let removed = 0;
  const have = store.sources().filter((s) => s.managed && s.code === norm);
  for (const s of sources) {
    const cur = have.find((h) => h.id === s.id);
    if (!cur) {
      store.saveSource(s);
      added++;
    } else if (!sameSource(cur, s)) {
      store.saveSource({ ...cur, ...s });
      updated++;
    }
  }
  for (const h of have) if (!sources.some((s) => s.id === h.id)) {
    store.removeSource(h.id);
    removed++;
  }
  return { added, updated, removed };
}
function dropCode(store, norm) {
  let n = 0;
  for (const s of store.sources()) if (s.managed && s.code === norm) {
    store.removeSource(s.id);
    n++;
  }
  return n;
}

export const REASON = {
  blocked: 'Bu cihazın erişimi kapatıldı.',
  missing: 'Davet kodunuz artık geçerli değil.',
  expired: 'Davet kodunuzun süresi doldu.',
};

// Kodu girer: config’i alır, çözer, kaynakları ekler. Hata metni kullanıcıya gösterilecek biçimdedir.
export async function redeem({ code, store, net, deviceId, now, subtle, sleep }) {
  const norm = normalizeCode(code);
  if (!norm) throw new Error('Kod 16 harf/rakamdır (ör. ABCD-EFGH-JKMN-PQRS).');
  let cfg;
  try {
    cfg = await fetchConfig(net, { sleep });
  } catch (e) {
    throw new Error(isTransient(e) ? 'Sunucuya ulaşılamadı. İnternetinizi denetleyip yeniden deneyin.' : 'Yönetim dosyası okunamadı.');
  }
  const r = await resolveCode(norm, cfg, { deviceId, now, subtle });
  if (r.status === 'blocked') throw new Error(REASON.blocked);
  if (r.status === 'missing') throw new Error('Bu kod bulunamadı. Kodu denetleyin ya da yöneticinizden yenisini isteyin.');
  if (r.status === 'expired') throw new Error(REASON.expired);
  if (r.status !== 'ok') throw new Error('Kod okunamadı.');
  const stats = applySources(store, norm, r.sources);
  return { name: r.payload.n || '', expires: Number(r.payload.x) || 0, ids: r.sources.map((s) => s.id), ...stats };
}

// Kayıtlı yönetilen kaynakları config ile eşitler. Ağ hatasında hiçbir şey silinmez.
// → { skipped:true } | { error } | { changed:boolean, removed:[{reason}], updated, added, active:boolean }
export async function syncManaged({ store, net, deviceId, now, subtle, sleep }) {
  const mine = store.sources().filter((s) => s.managed && s.code);
  if (!mine.length) return { skipped: true };
  let cfg;
  try {
    cfg = await fetchConfig(net, { sleep });
  } catch (e) {
    return { error: e };
  }
  const out = { changed: false, removed: [], updated: 0, added: 0, errors: 0 };
  for (const norm of [...new Set(mine.map((s) => s.code))]) {
    const r = await resolveCode(norm, cfg, { deviceId, now, subtle });
    if (r.status === 'ok') {
      const a = applySources(store, norm, r.sources);
      out.added += a.added;
      out.updated += a.updated;
      if (a.added || a.updated || a.removed) out.changed = true;
    } else if (r.status === 'bad') {
      out.errors++; // çözülemeyen giriş: bozuk indirme olabilir, silme
    } else {
      const names = store.sources().filter((s) => s.managed && s.code === norm).map((s) => s.name);
      if (dropCode(store, norm)) {
        out.changed = true;
        out.removed.push({ reason: REASON[r.status], names });
      }
    }
  }
  return out;
}

// ---- cihaz kimliği ---------------------------------------------------------------------------------------------
export function deviceId(store, rand) {
  let id = store.pref('dev.id', '');
  if (!/^[0-9a-f]{12}$/.test(id)) {
    id = toHex(randOf(rand)(6));
    store.setPref('dev.id', id);
  }
  return id;
}
export const fmtDeviceId = (id) => (String(id).toUpperCase().match(/.{1,4}/g) || []).join('-');
