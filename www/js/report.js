// Sorun raporu: kullanıcı “Rapor gönder” derse sürüm, cihaz kimliği, liste türü/sunucu adı, kanal sayıları, çalışmayan kanallar ve
// son oynatma hataları tek bir metne çevrilir (WhatsApp/e-postaya yapıştırılır); yönetici panelde içe alır.
// Kimlik bilgileri (kullanıcı adı, şifre, tam liste adresi) rapora ASLA girmez: yalnız beyaz listedeki alanlar alınır,
// serbest metinler (hata iletisi) adreslerden ve gizli değerlerden arındırılır. Saf mantık; depo/ağ yok.
import { b64, unb64, normDevice } from './managed.js';

export const REPORT_PREFIX = 'IPTVRAPOR1:';
export const MAX_CHARS = 9000;
export const MAX_ERRORS = 30;
const MAX_BAD = 40;

const enc = new TextEncoder();
const dec = new TextDecoder();
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n);

// Sunucu adı (+ port): yol, sorgu ve “kullanıcı:şifre@” atılır. Ayrıştırılamazsa ''.
export function hostOf(url) {
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/@?#]*@)?([^/?#:]+)(?::(\d{1,5}))?/i.exec(String(url == null ? '' : url).trim());
  return m ? clip(m[1].toLowerCase() + (m[2] ? ':' + m[2] : ''), 60) : '';
}

// Serbest metindeki adresleri sunucu adına indirir, gizli anahtar=değer çiftlerini kapatır.
export function scrub(text, n = 100) {
  const t = String(text == null ? '' : text)
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, (u) => hostOf(u) || 'adres')
    .replace(/\b(username|user|uname|login|password|pass|passwd|pwd|token|key|apikey|secret|auth|mac)\s*[=:]\s*\S+/gi, '$1=••••');
  return clip(t, n);
}

// Hata halka tamponu: en yeni sonda, en çok MAX_ERRORS kayıt; art arda aynı kanal+ileti tekrar eklenmez.
export function pushError(list, e, now = Date.now()) {
  const cur = Array.isArray(list) ? list : [];
  const rec = { at: now, k: clip(e.k, 8), n: clip(e.n, 40), m: scrub(e.m, 80) };
  const last = cur[cur.length - 1];
  if (last && last.n === rec.n && last.m === rec.m) return cur;
  return [...cur, rec].slice(-MAX_ERRORS);
}

// Rapor nesnesi (kısa anahtarlar; yalnız beyaz liste).
// input: { version, tv, deviceId, sources:[{type,url|server,managed}], counts:{live,movie,series}, bad:[{name,at}], errors:[…], hist:{ok,fail,unknown} }
export function buildReport(input, now = Date.now()) {
  const src = (Array.isArray(input.sources) ? input.sources : []).slice(0, 10).map((s) => ({
    t: s.type === 'xtream' ? 'xtream' : s.local ? 'dosya' : 'm3u',
    h: s.type === 'xtream' ? hostOf(s.server) || hostOf('http://' + s.server) : hostOf(s.url),
    g: s.managed ? 1 : 0,
  }));
  const c = input.counts || {};
  const h = input.hist || {};
  return {
    r: 1,
    at: now,
    v: clip(input.version, 20),
    tv: input.tv ? 1 : 0,
    id: normDevice(input.deviceId).slice(0, 12),
    s: src,
    n: { l: Number(c.live) || 0, m: Number(c.movie) || 0, d: Number(c.series) || 0 },
    q: { ok: Number(h.ok) || 0, fail: Number(h.fail) || 0, unk: Number(h.unknown) || 0 },
    bad: (Array.isArray(input.bad) ? input.bad : []).slice(0, MAX_BAD).map((b) => ({ n: clip(b.name, 40), at: Number(b.at) || 0 })),
    e: (Array.isArray(input.errors) ? input.errors : []).slice(-MAX_ERRORS).map((x) => ({ at: Number(x.at) || 0, k: clip(x.k, 8), n: clip(x.n, 40), m: scrub(x.m, 80) })),
  };
}

const toUrl = (b) => b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromUrl = (s) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return t + '='.repeat((4 - (t.length % 4)) % 4);
};

// Metne çevirir; çok uzunsa önce eski hata kayıtlarını, sonra çalışmayan kanal listesini kırpar.
export function encodeReport(rep) {
  let r = { ...rep, e: [...rep.e], bad: [...rep.bad] };
  const make = () => REPORT_PREFIX + toUrl(b64(enc.encode(JSON.stringify(r)))) + '.'; // sondaki nokta bitişi belirtir (sonrasında yazı olsa da)
  let out = make();
  while (out.length > MAX_CHARS && (r.e.length || r.bad.length)) {
    if (r.e.length > 5) r.e = r.e.slice(Math.ceil(r.e.length / 4));
    else if (r.bad.length > 5) r.bad = r.bad.slice(0, Math.ceil(r.bad.length * 0.75));
    else {
      r.e = [];
      r.bad = [];
    }
    out = make();
  }
  return out;
}

// Dışarıdan gelen (güvenilmez) rapor nesnesini aynı beyaz listeyle yeniden kurar.
function cleanReport(j) {
  const arr = (a) => (Array.isArray(a) ? a : []);
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const o = (v) => (v && typeof v === 'object' ? v : {});
  return {
    r: 1,
    at: n(j.at),
    v: clip(j.v, 20),
    tv: j.tv ? 1 : 0,
    id: normDevice(j.id).slice(0, 12),
    s: arr(j.s).slice(0, 10).map((s) => ({ t: s && (s.t === 'xtream' || s.t === 'dosya') ? s.t : 'm3u', h: clip(o(s).h, 60), g: o(s).g ? 1 : 0 })),
    n: { l: n(o(j.n).l), m: n(o(j.n).m), d: n(o(j.n).d) },
    q: { ok: n(o(j.q).ok), fail: n(o(j.q).fail), unk: n(o(j.q).unk) },
    bad: arr(j.bad).slice(0, MAX_BAD).map((b) => ({ n: clip(o(b).n, 40), at: n(o(b).at) })),
    e: arr(j.e).slice(-MAX_ERRORS).map((x) => ({ at: n(o(x).at), k: clip(o(x).k, 8), n: clip(o(x).n, 40), m: scrub(o(x).m, 80) })),
  };
}

// Yapıştırılan metinden raporu bulur (başka yazılar, satır sonları, boşluklar olabilir); geçersizse null.
export function decodeReport(text) {
  const t = String(text == null ? '' : text);
  const i = t.indexOf(REPORT_PREFIX);
  if (i < 0) return null;
  const rest = t.slice(i + REPORT_PREFIX.length);
  const end = rest.indexOf('.');
  // Bitiş noktası varsa arası (satır sonlarıyla bölünmüş olabilir) alınır; yoksa ilk boşluksuz parça.
  const raw = end >= 0 ? rest.slice(0, end).replace(/\s+/g, '') : (/^\S+/.exec(rest) || [''])[0];
  const body = /^[A-Za-z0-9_-]+$/.test(raw) ? [raw] : null;
  if (!body) return null;
  try {
    const j = JSON.parse(dec.decode(unb64(fromUrl(body[0]))));
    if (!j || j.r !== 1) return null;
    const r = cleanReport(j);
    return /^[0-9a-f]{12}$/.test(r.id) ? r : null;
  } catch {
    return null;
  }
}

// Kullanıcıya gönderilmeden önce gösterilen okunur özet.
export function describeReport(r) {
  const lines = [
    `Sürüm: ${r.v || '?'} · ${r.tv ? 'TV' : 'Telefon'} · Cihaz kimliği: ${r.id}`,
    `Liste: ${r.s.map((s) => `${s.t}${s.h ? ' (' + s.h + ')' : ''}${s.g ? ' [kodlu]' : ''}`).join(', ') || '—'}`,
    `Kanal ${r.n.l} · Film ${r.n.m} · Dizi ${r.n.d}`,
    `Yayın denetimi: ${r.q.ok} çalışıyor, ${r.q.fail} çalışmıyor, ${r.q.unk} doğrulanamadı`,
    `Çalışmıyor işaretli kanal: ${r.bad.length}`,
    `Son hata kaydı: ${r.e.length}`,
  ];
  return lines.join('\n');
}

// Yöneticide birikmiş raporlardan özet. Aynı cihazın en yeni raporu sayılır.
export function summarize(reports) {
  const byDev = new Map();
  for (const r of reports) if (!byDev.has(r.id) || byDev.get(r.id).at < r.at) byDev.set(r.id, r);
  const latest = [...byDev.values()];
  const versions = {};
  const fails = new Map();
  let tvs = 0;
  for (const r of latest) {
    versions[r.v || '?'] = (versions[r.v || '?'] || 0) + 1;
    if (r.tv) tvs++;
    const seen = new Set();
    for (const b of r.bad) seen.add(b.n);
    for (const e of r.e) if (e.n) seen.add(e.n);
    for (const n of seen) if (n) fails.set(n, (fails.get(n) || 0) + 1);
  }
  const top = [...fails.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr')).slice(0, 15).map(([name, devices]) => ({ name, devices }));
  return { devices: latest.length, tvs, versions, top };
}

// Birden çok rapor art arda yapıştırılmış olabilir: hepsini ayrı ayrı çözer (geçersizler atlanır).
export function decodeAll(text) {
  return String(text == null ? '' : text)
    .split(REPORT_PREFIX)
    .slice(1)
    .map((p) => decodeReport(REPORT_PREFIX + p))
    .filter(Boolean);
}
