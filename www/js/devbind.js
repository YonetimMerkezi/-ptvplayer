// Tek cihaz kuralı (istemci): bir Google Play aboneliği aynı anda bir telefonda ve bir TV'de kullanılır. Uygulama her açılışta ve öne
// gelişinde üyelik sunucusuna (server/) abonelik jetonunun tek yönlü özetini ve cihaz kimliğini bildirir; abonelik başka cihaza bağlıysa
// bu cihazda Pro/Standart açılmaz, kullanıcı "Bu cihazı kullan" ile üyeliği taşıyabilir (ayda en çok 2 kez, kural sunucudadır).
// Burada saf mantık ve tek bir ağ çağrısı var; saklama ve ekranlar app.js'tedir.
import { PLAY_PRODUCTS } from './billing.js';

// Üyelik sunucusunun adresi (server/README.md). Boşken kural kapalıdır: üyelik yalnız Google Play'e bakar.
export const BIND_URL = 'https://iptv-uyelik.karagozyazilim12.workers.dev';
export const GRACE_DAYS = 7; // sunucuya ulaşılamazsa son başarılı doğrulamadan sonra bu kadar gün üyelik geçerli sayılır
export const RECHECK_MS = 3600e3; // sorun yokken en çok saatte bir sorulur (taşınan üyelik öteki cihazda en geç bu sürede kapanır)
export const BLOCKED_RECHECK_MS = 10 * 60e3; // başka cihaza bağlıyken daha sık bakılır (taşıma hemen fark edilsin)
const DAY_MS = 86400000;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Abonelik kimliği: jetonun SHA-256 özeti; jetonun kendisi hiçbir yere gönderilmez.
export async function subId(token, subtle = globalThis.crypto && globalThis.crypto.subtle) {
  return hex(await subtle.digest('SHA-256', new TextEncoder().encode('iptv-uyelik:' + String(token))));
}

// Etkin ürünler arasında en yüksek katmanın jetonu (Pro, yoksa Standart); yoksa ''.
export function bestToken(ids, tokens) {
  const list = Array.isArray(ids) ? ids : [];
  const map = tokens && typeof tokens === 'object' ? tokens : {};
  for (const tier of ['pro', 'standard']) {
    const id = PLAY_PRODUCTS[tier];
    if (list.includes(id) && typeof map[id] === 'string' && map[id]) return map[id];
  }
  return '';
}

// Sunucuya sorar. → { status: 'ok' | 'other' | 'limit', since?, next?, moved? } ya da ulaşılamadı/anlaşılamadı ise null.
export async function callClaim({ sub, dev, kind, take = false }, { url = BIND_URL, fetchImpl = (...a) => globalThis.fetch(...a), timeoutMs = 8000 } = {}) {
  if (!url) return null;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url.replace(/\/+$/, '') + '/v1/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ s: sub, d: dev, k: kind === 'tv' ? 'tv' : 'phone', take: take === true }),
      ...(ctl ? { signal: ctl.signal } : {}),
    });
    const j = await res.json();
    if (!j || !['ok', 'other', 'limit'].includes(j.status)) return null;
    return { status: j.status, since: Number(j.since) || 0, next: Number(j.next) || 0, moved: j.moved === true };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Bu cihazdaki bağlama durumu: { s: abonelik kimliği, first: ilk deneme, at: son başarılı doğrulama, other: başka cihaza bağlı, since, next } | null.
// Sunucudan gelen sonuca göre yeni durum; sonuç null ise (ulaşılamadı) durum aynen kalır. Abonelik değiştiyse (yeni jeton) sıfırdan başlar.
export function nextBind({ bind, sub, result, now = Date.now() }) {
  const base = bind && bind.s === sub ? bind : { s: sub, first: now, at: 0, other: false, since: 0, next: 0 };
  if (result && result.status === 'ok') return { ...base, at: now, other: false, since: 0, next: 0 };
  if (result && result.status === 'other') return { ...base, other: true, since: result.since || 0, next: 0 };
  if (result && result.status === 'limit') return { ...base, other: true, next: result.next || 0 };
  return base;
}

// Üyelik bu cihazda geçerli mi? Başka cihaza bağlıysa hayır. Sunucuya ulaşılamıyorsa son başarılı doğrulamadan (hiç yoksa ilk denemeden)
// GRACE_DAYS gün tolerans verilir.
export function bindAllowed(bind, now = Date.now()) {
  if (!bind) return true;
  if (bind.other) return false;
  return now - (bind.at || bind.first || now) <= GRACE_DAYS * DAY_MS;
}

// Sunucuya yeniden sorma zamanı geldi mi?
export const bindDue = (bind, now = Date.now()) => !bind || now - (bind.at || 0) > (bind.other ? BLOCKED_RECHECK_MS : RECHECK_MS);
