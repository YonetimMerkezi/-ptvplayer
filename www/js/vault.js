// Yönetici kasası: kullanıcılar (davet kodları), listeler, süreler ve engelli cihazlar. GitHub’a yalnızca yönetici
// parolasıyla şifrelenmiş olarak yazılır (PBKDF2 300 bin tur + AES-GCM). Burada saf mantık var; ağ yok.
import { seal, unseal, newCode, normalizeCode, sealEntry, buildConfig, codeId, toHex, normDevice } from './managed.js';

export const VAULT_ITERS = 300000;
export const DAY = 86400e3;
export const emptyVault = (now = Date.now()) => ({ v: 1, at: now, users: [], blocked: [] });

export const sealVault = (vault, pass, opts = {}) => seal(vault, pass, { ...opts, iters: VAULT_ITERS, aad: 'vault' });
export async function openVault(sealed, pass, opts = {}) {
  let v;
  try {
    v = await unseal(sealed, pass, { ...opts, aad: 'vault' });
  } catch {
    throw new Error('Parola yanlış ya da kasa bozuk.');
  }
  if (!v || !Array.isArray(v.users)) throw new Error('Kasa biçimi tanınmadı.');
  return { v: 1, at: Number(v.at) || 0, users: v.users, blocked: Array.isArray(v.blocked) ? v.blocked : [] };
}

const str = (v, n = 2000) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

// Formdan gelen kaynak tanımını doğrular; geçersizse null.
export function cleanSourceInput(s) {
  if (!s || typeof s !== 'object') return null;
  if (s.type === 'xtream') {
    const server = str(s.server);
    const user = str(s.user);
    return server && user ? { type: 'xtream', name: str(s.name, 80), server, user, pass: str(s.pass), epgUrl: str(s.epgUrl) } : null;
  }
  if (s.type === 'm3u') {
    const url = str(s.url);
    return /^https?:\/\//i.test(url) ? { type: 'm3u', name: str(s.name, 80), url, epgUrl: str(s.epgUrl) } : null;
  }
  return null;
}

export const expiryFrom = (days, now = Date.now()) => (Number(days) > 0 ? now + Number(days) * DAY : 0);

export function newUser({ name, days = 0, note = '', sources = [] }, { now = Date.now(), rand } = {}) {
  const list = sources.map(cleanSourceInput).filter(Boolean);
  if (!str(name, 80)) throw new Error('Kullanıcı adı gerekli.');
  if (!list.length) throw new Error('En az bir geçerli liste gerekli (M3U adresi ya da Xtream sunucu + kullanıcı).');
  return { code: newCode(rand), name: str(name, 80), x: expiryFrom(days, now), note: str(note, 300), off: false, sources: list, created: now };
}

export function userStatus(u, now = Date.now()) {
  if (u.off) return 'off';
  if (u.x > 0 && now > u.x) return 'expired';
  return 'active';
}

// Süreyi uzatır: bitmişse bugünden, sürüyorsa bitişten; süresiz kullanıcıya dokunmaz.
export function extendUser(u, days, now = Date.now()) {
  if (!(u.x > 0)) return u;
  return { ...u, x: Math.max(u.x, now) + Number(days) * DAY };
}

export function addBlocked(vault, id, note = '') {
  const n = normDevice(id);
  if (!/^[0-9a-f]{12}$/.test(n)) throw new Error('Cihaz kimliği 12 harf/rakamdır (ör. A1B2-C3D4-E5F6).');
  if (vault.blocked.some((b) => b.id === n)) return vault;
  return { ...vault, blocked: [...vault.blocked, { id: n, note: str(note, 100) }] };
}

const payloadOf = (u) => ({ p: 1, n: u.name, x: u.x || 0, s: u.sources });

// Kasadan yayınlanacak config.json üretir. Değişmeyen girişler yeniden şifrelenmez (PBKDF2 yavaş): u.sealed önbelleğidir.
// Kapalı kullanıcılar config’e girmez (cihaz “artık geçerli değil” görür); süresi dolanlar kalır (cihaz “süresi doldu” görür).
export async function buildPublish(vault, { now = Date.now(), subtle, rand } = {}) {
  const s = subtle || globalThis.crypto.subtle;
  const entries = {};
  const users = [];
  for (const u of vault.users) {
    if (u.off) {
      users.push(u);
      continue;
    }
    const payload = payloadOf(u);
    const h = toHex(new Uint8Array(await s.digest('SHA-256', new TextEncoder().encode(u.code + JSON.stringify(payload)))));
    let sealed = u.sealed && u.sealed.h === h ? u.sealed : null;
    if (!sealed) sealed = { h, e: await sealEntry(u.code, payload, { subtle, rand }) };
    entries[await codeId(u.code, subtle)] = sealed.e;
    users.push({ ...u, sealed });
  }
  return { config: buildConfig({ entries, blocked: vault.blocked.map((b) => b.id), at: now }), vault: { ...vault, users, at: now } };
}

// Davet metni: yeni kullanıcıya gönderilecek ileti.
export function inviteText(u, apkUrl) {
  const exp = u.x > 0 ? `\nGeçerlilik: ${new Date(u.x).toLocaleDateString('tr-TR')} tarihine kadar` : '';
  return `Iptv Player Pro daveti\n\n1) Uygulamayı indirip kurun:\n${apkUrl}\n\n2) Uygulamada “Kaynak ekle” ekranında “Kod” seçin ve şu kodu girin:\n${u.code}${exp}\n\nKodu başkasıyla paylaşmayın.`;
}

export { normalizeCode };
