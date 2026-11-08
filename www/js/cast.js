// Telefondan TV'ye oynatma: saf mantık (ağ ve ekran dışarıda; yerel eklenti `request` ile verilir).
// Telefon, TV'deki alıcıya (yerel ağ, HTTP) yayın adresini gönderir; TV kendi oynatıcısında açar,
// telefon yoklama ile durumu (ad, süre, konum) okuyup uzaktan kumanda olur.
import { hashId } from './util.js';

export const CAST_PORT = 8765;
export const CODE_LEN = 6;
export const POLL_MS = 1000;
export const LOST_AFTER = 3; // üst üste bu kadar yoklama başarısızsa TV'ye ulaşılamıyor sayılır
export const GRACE_MS = 15000; // gönderdikten sonra TV'nin oynatmaya başlaması için tanınan süre
const MAX_TARGETS = 5;

const clean = (s, n) => String(s == null ? '' : s).slice(0, n);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Oynatılacak şeyi TV'ye gidecek isteğe çevirir. targets: [{url, mime?, headers?, alt?}] (asıl adres önce, yedekler sonra).
export function buildCast({ item, ep = null, targets, startMs = 0 }) {
  const live = item.kind === 'live';
  const title = ep ? `${item.name} · ${ep.label || ''}`.replace(/ · $/, '') : item.name;
  return {
    title: clean(title, 200),
    kind: live ? 'live' : 'vod',
    logo: /^https?:\/\//i.test(item.logo || '') ? clean(item.logo, 500) : '',
    startMs: live ? 0 : Math.max(0, Math.floor(num(startMs))),
    targets: targets.slice(0, MAX_TARGETS).map((t) => {
      const o = { url: t.url, mime: t.mime || 'auto' };
      if (t.headers && Object.keys(t.headers).length) o.headers = t.headers;
      if (t.alt) o.alt = t.alt;
      return o;
    }),
  };
}

// TV tarafı: gelen isteği doğrular ve oynatıcının anlayacağı biçime çevirir; geçersizse null.
export function parseCast(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.targets)) return null;
  const targets = [];
  for (const t of p.targets.slice(0, MAX_TARGETS)) {
    if (!t || typeof t.url !== 'string' || t.url.length > 4096 || !/^https?:\/\//i.test(t.url)) continue;
    const o = { url: t.url, mime: typeof t.mime === 'string' && t.mime ? clean(t.mime, 60) : 'auto' };
    if (t.headers && typeof t.headers === 'object') {
      const h = {};
      let n = 0;
      for (const [k, v] of Object.entries(t.headers)) {
        if (n >= 8) break;
        if (typeof v === 'string' && k) {
          h[clean(k, 60)] = clean(v, 512);
          n++;
        }
      }
      if (n) o.headers = h;
    }
    if (typeof t.alt === 'string' && t.alt) o.alt = clean(t.alt, 80);
    targets.push(o);
  }
  if (!targets.length) return null;
  const live = p.kind === 'live';
  const item = {
    id: 'cast:' + hashId(targets[0].url),
    kind: live ? 'live' : 'movie',
    name: clean(p.title, 200).trim() || 'Telefondan',
    logo: typeof p.logo === 'string' && /^https?:\/\//i.test(p.logo) ? clean(p.logo, 500) : '',
    cast: true,
  };
  return { item, targets, startAt: live ? 0 : Math.max(0, Math.floor(num(p.startMs))) };
}

// ---- kayıtlı TV'ler (telefonda) ----

export function createDevices(store, key = 'cast.tvs') {
  const read = () => {
    const v = store.pref(key, []);
    return Array.isArray(v) ? v.filter((d) => d && d.id && d.host && d.token) : [];
  };
  return {
    list: read,
    get: (id) => read().find((d) => d.id === id) || null,
    save(dev) {
      const rest = read().filter((d) => d.id !== dev.id);
      store.setPref(key, [dev, ...rest].slice(0, 8));
    },
    forget(id) {
      store.setPref(key, read().filter((d) => d.id !== id));
    },
  };
}

// Kayıtlı TV'ler ile aramada bulunanları birleştirir: [{ id, name, host, port, token?, saved, online }]
export function mergeDevices(saved, found) {
  const out = [];
  const byId = new Map();
  for (const f of found || []) {
    if (f && f.id && !byId.has(f.id)) byId.set(f.id, f); // aynı TV birden çok adresten yanıt verebilir
  }
  for (const d of saved || []) {
    const f = byId.get(d.id);
    out.push({ ...d, ...(f ? { name: f.name || d.name, host: f.host, port: f.port || d.port } : {}), saved: true, online: !!f });
    byId.delete(d.id);
  }
  for (const f of byId.values()) out.push({ id: f.id, name: f.name || 'TV', host: f.host, port: f.port || CAST_PORT, saved: false, online: true });
  return out;
}

// ---- yanıtların yorumu ----

export function parseJson(text) {
  try {
    const v = JSON.parse(String(text || ''));
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

export function pairResult(r) {
  if (r && r.status === 200) {
    const j = parseJson(r.body);
    if (j && j.token) return { ok: true, token: j.token, id: j.id || '', name: j.name || '' };
  }
  if (r && r.status === 403) {
    const j = parseJson(r.body) || {};
    if (j.error === 'closed') return { ok: false, closed: true, msg: 'TV’de eşleştirme açık değil. TV’de Ayarlar › Telefondan oynat ekranını açın.' };
    return { ok: false, msg: 'Kod yanlış' };
  }
  return { ok: false, msg: 'TV’ye ulaşılamadı' };
}

export function sendResult(r) {
  if (r && r.status === 200) return { ok: true };
  if (r && r.status === 401) return { ok: false, unpaired: true, msg: 'Bu telefonun TV ile eşleşmesi kaldırılmış. Yeniden eşleştirin.' };
  if (r && r.status === 422) {
    const j = parseJson(r.body) || {};
    return { ok: false, msg: j.error ? String(j.error) : 'TV isteği kabul etmedi' };
  }
  return { ok: false, msg: 'TV’ye ulaşılamadı' };
}

// ---- uzaktan kumanda ekranı için durum ----

const STATE_TEXT = { playing: 'Oynatılıyor', paused: 'Duraklatıldı', buffering: 'Yükleniyor…', ended: 'Bitti', idle: 'Hazırlanıyor…' };

export function viewOf(st, sent = null) {
  const s = st || {};
  const live = sent ? sent.kind === 'live' : !!s.live;
  const dur = num(s.dur, -1);
  const pos = Math.max(0, num(s.pos));
  const vol = s.vol && typeof s.vol === 'object' ? s.vol : {};
  const max = num(vol.max);
  return {
    active: !!s.active,
    title: clean(s.title, 200) || (sent && sent.title) || '',
    live,
    state: s.state || 'idle',
    text: s.active ? STATE_TEXT[s.state] || STATE_TEXT.idle : 'TV’de oynatılan yok',
    paused: s.state === 'paused' || s.state === 'ended',
    pos,
    dur,
    pct: !live && dur > 0 ? Math.min(1, pos / dur) : 0,
    canSeek: !live && dur > 0,
    canVol: max > 0 && !vol.fixed,
    vol: max > 0 ? Math.round((num(vol.cur) / max) * 100) : 0,
  };
}

// Uzaktan kumanda: durumu yoklar, komut gönderir. request(path, method, body) → Promise<{status, body}>.
export function createRemote({ request, sent = null, onView, onEnd, onLost, onUnpaired, setT = setTimeout, clearT = clearTimeout, now = Date.now, pollMs = POLL_MS, lostAfter = LOST_AFTER, grace = GRACE_MS }) {
  let stopped = true;
  let timer = 0;
  let fails = 0;
  let idle = 0;
  let sawActive = false;
  let startedAt = 0;

  const schedule = (ms = pollMs) => {
    clearT(timer);
    if (!stopped) timer = setT(poll, ms);
  };

  function stop() {
    stopped = true;
    clearT(timer);
  }

  async function poll() {
    if (stopped) return;
    let r;
    try {
      r = await request('/state', 'GET');
    } catch {
      r = { status: 0 };
    }
    if (stopped) return;
    if (r.status === 401) {
      stop();
      if (onUnpaired) onUnpaired();
      return;
    }
    if (r.status !== 200) {
      if (++fails >= lostAfter) {
        stop();
        if (onLost) onLost();
        return;
      }
      return schedule();
    }
    fails = 0;
    const st = parseJson(r.body);
    if (st) {
      if (onView) onView(viewOf(st, sent));
      if (st.active) {
        sawActive = true;
        idle = 0;
      } else if (sawActive) {
        if (++idle >= 2) {
          stop();
          if (onEnd) onEnd('stopped');
          return;
        }
      } else if (now() - startedAt > grace) {
        stop();
        if (onEnd) onEnd('never');
        return;
      }
    }
    schedule();
  }

  return {
    start() {
      stopped = false;
      fails = 0;
      idle = 0;
      sawActive = false;
      startedAt = now();
      poll();
    },
    stop,
    // Komut gönderir (örn. { a: 'seekBy', v: 10000 }); kısa süre sonra durum yeniden okunur.
    async send(cmd) {
      let r;
      try {
        r = await request('/cmd', 'POST', JSON.stringify(cmd));
      } catch {
        r = { status: 0 };
      }
      const res = sendResult(r);
      if (!stopped) schedule(280);
      return res;
    },
  };
}
