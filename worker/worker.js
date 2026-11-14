// ptv-meta Worker: başlık → TMDB eşleştirme, yaş sınırı, D1 ortak önbellek.
// Gerekli: D1 binding "DB"; secret'lar: TMDB_KEY, APP_TOKEN, ADMIN_TOKEN.

const TMDB = 'https://api.themoviedb.org/3';
const MAX_ITEMS = 6;            // ücretsiz planda istek başına 50 alt istek sınırı var
const RETRY_NONE_MS = 14 * 86400000;
const AUTO = 0.85, PENDING = 0.6;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,x-app-token,x-admin-token',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS } });

// ---------- metin ----------
const FOLD = { 'ı':'i','İ':'i','I':'i','ş':'s','Ş':'s','ğ':'g','Ğ':'g','ü':'u','Ü':'u','ö':'o','Ö':'o','ç':'c','Ç':'c','â':'a','Â':'a','î':'i','Î':'i','û':'u','Û':'u' };
const fold = (s) => { let o = ''; for (const ch of String(s)) o += FOLD[ch] ?? ch; return o.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
const norm = (s) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim();
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const sim = (a, b) => (!a || !b) ? 0 : a === b ? 1 : 1 - lev(a, b) / Math.max(a.length, b.length);

// ---------- yaş sınırı (Türkiye ölçeği, yukarı yuvarlama) ----------
const tier = (n) => n <= 0 ? 'Genel' : n <= 7 ? '7+' : n <= 13 ? '13+' : n <= 15 ? '15+' : '18+';
const GB = { U: 'Genel', PG: '7+', '12': '13+', '12A': '13+', '15': '15+', '18': '18+', R18: '18+' };
const US = { G: 'Genel', PG: '7+', 'PG-13': '13+', R: '18+', 'NC-17': '18+', 'TV-Y': 'Genel', 'TV-G': 'Genel', 'TV-Y7': '7+', 'TV-PG': '7+', 'TV-14': '15+', 'TV-MA': '18+' };
function normCert(cc, raw) {
  const r = String(raw ?? '').trim().toUpperCase();
  if (!r || ['NR', 'UR', 'UNRATED', 'NOT RATED'].includes(r)) return null;
  if (cc === 'GB') return GB[r] ?? null;
  if (cc === 'US') return US[r] ?? (r.startsWith('TV-Y7') ? '7+' : null);
  if (cc === 'TR' && /GENEL|^G$|^ALL/.test(r)) return 'Genel';
  const m = r.match(/\d+/);           // TR ve DE: rakamlı değerler
  return m ? tier(+m[0]) : null;
}
function pickCert(d, tp) {
  const by = {};
  if (tp === 'movie') {
    for (const c of d.release_dates?.results || []) {
      const cert = (c.release_dates || []).map((x) => x.certification).find(Boolean);
      if (cert) by[c.iso_3166_1] = cert;
    }
  } else {
    for (const c of d.content_ratings?.results || []) if (c.rating) by[c.iso_3166_1] = c.rating;
  }
  for (const cc of ['TR', 'DE', 'GB', 'US']) {
    if (by[cc]) { const n = normCert(cc, by[cc]); if (n) return { cert: n, csrc: cc }; }
  }
  return { cert: null, csrc: null };
}

// ---------- TMDB ----------
async function tmdb(env, path, params) {
  const u = new URL(TMDB + path);
  u.searchParams.set('api_key', env.TMDB_KEY);
  for (const [k, v] of Object.entries(params || {})) if (v != null) u.searchParams.set(k, v);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error('tmdb ' + r.status);
  return r.json();
}
function rank(results, qs, y, kind) {
  const out = [];
  for (const r of results) {
    const tp = r.media_type || kind;
    if (tp !== 'movie' && tp !== 'tv') continue;
    const names = [r.title, r.original_title, r.name, r.original_name].filter(Boolean).map(norm);
    const ts = Math.max(0, ...qs.flatMap((q) => names.map((n) => sim(q, n))));
    const cy = +(r.release_date || r.first_air_date || '').slice(0, 4) || null;
    let ys = 0.5;
    if (y && cy) { const d = Math.abs(cy - y); ys = d === 0 ? 1 : d === 1 ? 0.7 : 0; } else if (y) ys = 0.3;
    const pop = Math.min(1, Math.log10(1 + (r.popularity || 0)) / 2);
    out.push({ id: r.id, tp, ts, cy, ttl: r.title || r.name, conf: 0.65 * ts + 0.25 * ys + 0.1 * pop });
  }
  if (!y) {   // yılsız kayıtta tek net başlık eşleşmesi varsa güveni artır
    const exact = out.filter((c) => c.ts >= 0.95);
    if (exact.length === 1) exact[0].conf += 0.1;
  }
  return out.sort((a, b) => b.conf - a.conf);
}
const parseKind = (k) => (String(k).split('|')[0] === 'tv' ? 'tv' : 'movie');

async function resolve(env, it) {
  const kind = parseKind(it.k);
  const q = norm(it.t);
  const qs = [q];
  if (it.a) { const a = norm(it.a); if (a && a !== q) qs.push(a); }
  const y = it.y || null;
  const attempts = y ? [['tr-TR', y], ['tr-TR', null], ['en-US', null]] : [['tr-TR', null], ['en-US', null]];
  const seen = new Map();
  for (const [language, year] of attempts) {
    const p = { query: it.t, language };
    if (year) p[kind === 'tv' ? 'first_air_date_year' : 'year'] = year;
    const res = await tmdb(env, '/search/' + kind, p);
    for (const c of rank(res.results || [], qs, y, kind)) {
      if (!seen.has(c.id) || seen.get(c.id).conf < c.conf) seen.set(c.id, c);
    }
    const best = [...seen.values()].sort((a, b) => b.conf - a.conf)[0];
    if (best && best.conf >= AUTO) break;
  }
  const cands = [...seen.values()].sort((a, b) => b.conf - a.conf);
  const best = cands[0];
  const base = { k: it.k, tid: null, tp: null, ttl: null, yr: null, cert: null, csrc: null, gen: [], w: {}, conf: best ? +best.conf.toFixed(3) : 0, cands: cands.slice(0, 3).map((c) => ({ id: c.id, tp: c.tp, ttl: c.ttl, yr: c.cy, conf: +c.conf.toFixed(2) })) };
  if (!best || best.conf < PENDING) return { ...base, st: 'none' };
  if (best.conf < AUTO) return { ...base, st: 'pending' };
  const d = await tmdb(env, `/${best.tp}/${best.id}`, { language: 'tr-TR', append_to_response: best.tp === 'movie' ? 'release_dates' : 'content_ratings' });
  const c = pickCert(d, best.tp);
  return { ...base, st: 'ok', tid: best.id, tp: best.tp, ttl: d.title || d.name, yr: best.cy, cert: c.cert, csrc: c.csrc, gen: (d.genres || []).map((g) => g.name) };
}

// ---------- D1 ----------
const COLS = 'k,st,tid,tp,ttl,yr,cert,csrc,gen,w,conf,cands,updated';
const toArgs = (r) => [r.k, r.st, r.tid, r.tp, r.ttl, r.yr, r.cert, r.csrc, JSON.stringify(r.gen || []), JSON.stringify(r.w || {}), r.conf ?? 0, JSON.stringify(r.cands || []), Date.now()];
const SET = COLS.split(',').slice(1).map((c) => `${c}=excluded.${c}`).join(',');
const UPSERT = `INSERT INTO matches (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(k) DO UPDATE SET ${SET}`;
const UPSERT_SAFE = UPSERT + " WHERE matches.st != 'manual'";
const fromRow = (r) => ({ ...r, gen: JSON.parse(r.gen || '[]'), w: JSON.parse(r.w || '{}'), cands: JSON.parse(r.cands || '[]') });
async function getRows(env, keys) {
  if (!keys.length) return [];
  const { results } = await env.DB.prepare(`SELECT ${COLS} FROM matches WHERE k IN (${keys.map(() => '?').join(',')})`).bind(...keys).all();
  return (results || []).map(fromRow);
}
// uygulamaya dönen alanlar (cands ve ayrıntı dönmez)
const pub = (r) => ({ k: r.k, st: r.st, tid: r.tid, tp: r.tp, ttl: r.ttl, yr: r.yr, cert: r.cert, csrc: r.csrc, gen: r.gen, w: r.w, conf: r.conf });

// ---------- yetki ----------
function same(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const WKEYS = ['siddet', 'korku', 'cinsellik', 'ciplaklik', 'olumsuz'];
function cleanW(w) {
  const o = {};
  for (const k of WKEYS) { const v = +w?.[k]; if (Number.isFinite(v) && v > 0) o[k] = Math.min(3, Math.round(v)); }
  return o;
}

// ---------- uçlar ----------
async function lookup(env, req) {
  let body; try { body = await req.json(); } catch { return json({ error: 'json' }, 400); }
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, MAX_ITEMS)
    .filter((i) => i && typeof i.k === 'string' && i.k.length <= 160 && typeof i.t === 'string' && i.t.length >= 1 && i.t.length <= 120 && /^(movie|tv)\|/.test(i.k))
    .map((i) => ({ k: i.k, t: i.t, a: typeof i.a === 'string' ? i.a.slice(0, 120) : null, y: Number.isInteger(i.y) && i.y > 1900 && i.y < 2100 ? i.y : null }));
  const have = new Map((await getRows(env, items.map((i) => i.k))).map((r) => [r.k, r]));
  const out = [], writes = [];
  for (const it of items) {
    const row = have.get(it.k);
    if (row && !(row.st === 'none' && Date.now() - row.updated > RETRY_NONE_MS)) { out.push(pub(row)); continue; }
    try {
      const r = await resolve(env, it);
      writes.push(env.DB.prepare(UPSERT_SAFE).bind(...toArgs(r)));
      out.push(pub(r));
    } catch (e) {
      out.push({ k: it.k, st: 'err' });   // kaydedilmez, uygulama sonra tekrar dener
    }
  }
  if (writes.length) await env.DB.batch(writes);
  return json({ items: out });
}

async function adminSet(env, req) {
  let b; try { b = await req.json(); } catch { return json({ error: 'json' }, 400); }
  if (typeof b.k !== 'string' || !/^(movie|tv)\|/.test(b.k)) return json({ error: 'k' }, 400);
  const cur = (await getRows(env, [b.k]))[0] || { k: b.k, st: 'none', tid: null, tp: null, ttl: null, yr: null, cert: null, csrc: null, gen: [], w: {}, conf: 0, cands: [] };
  let r = { ...cur };
  if (b.tid) {
    const tp = b.tp === 'tv' ? 'tv' : parseKind(b.k);
    const d = await tmdb(env, `/${tp}/${+b.tid}`, { language: 'tr-TR', append_to_response: tp === 'movie' ? 'release_dates' : 'content_ratings' });
    const c = pickCert(d, tp);
    r = { ...r, st: 'manual', tid: d.id, tp, ttl: d.title || d.name, yr: +(d.release_date || d.first_air_date || '').slice(0, 4) || null, cert: c.cert, csrc: c.csrc, gen: (d.genres || []).map((g) => g.name), conf: 1 };
  }
  if (b.cert) { if (!['Genel', '7+', '13+', '15+', '18+'].includes(b.cert)) return json({ error: 'cert' }, 400); r.cert = b.cert; r.csrc = 'MAN'; r.st = 'manual'; }
  if (b.w) { r.w = cleanW(b.w); if (r.st !== 'ok') r.st = 'manual'; }
  if (b.st === 'none') r.st = 'none';
  await env.DB.prepare(UPSERT).bind(...toArgs(r)).run();
  return json(pub(r));
}

async function adminPending(env, url) {
  const limit = Math.min(50, +url.searchParams.get('limit') || 20);
  const { results } = await env.DB.prepare(`SELECT ${COLS} FROM matches WHERE st='pending' ORDER BY updated DESC LIMIT ?`).bind(limit).all();
  return json({ items: (results || []).map(fromRow).map((r) => ({ k: r.k, conf: r.conf, cands: r.cands })) });
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    try {
      if (url.pathname === '/health') return json({ ok: true, db: !!env.DB, tmdb: !!env.TMDB_KEY });
      if (url.pathname === '/lookup' && req.method === 'POST') {
        if (!same(req.headers.get('x-app-token'), env.APP_TOKEN)) return json({ error: 'auth' }, 401);
        return await lookup(env, req);
      }
      if (url.pathname.startsWith('/admin/')) {
        if (!same(req.headers.get('x-admin-token'), env.ADMIN_TOKEN)) return json({ error: 'auth' }, 401);
        if (url.pathname === '/admin/pending' && req.method === 'GET') return await adminPending(env, url);
        if (url.pathname === '/admin/set' && req.method === 'POST') return await adminSet(env, req);
      }
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      return json({ error: 'server' }, 500);
    }
  },
};
