// Telefon ↔ TV eşitleme: iki cihazdaki kaynaklar, favoriler, son izlenenler, izleme ilerlemesi ve kategori düzeni
// karşılıklı birleştirilir. Kural: var olan hiçbir değer değiştirilmez ya da silinmez; her cihaz yalnız diğerinde olup
// kendinde olmayanları ekler. Saf mantık: depo (store) dışarıdan verilir, ağ burada yok.
import { hashId } from './util.js';
import { normalizePrefs } from './cats.js';

export const SYNC_APP = 'iptv-oynatici-sync';
export const SYNC_VERSION = 1;
const PER_SOURCE = ['fav', 'rec', 'prog', 'cats'];
const MAX_RECENTS = 200;
const MAX_PROGRESS = 300;
const MAX_SOURCES = 30;

const str = (v, n = 300) => (typeof v === 'string' ? v.slice(0, n) : '');
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Aynı kaynak iki cihazda ayrı kimlikle eklenmiş olabilir: kimlik adresten (ve Xtream'de kullanıcıdan) çıkarılır.
export function identityOf(s) {
  if (!isObj(s) || s.local) return '';
  if (s.type === 'xtream' && s.server && s.user) return 'x|' + String(s.server).trim().toLowerCase().replace(/\/+$/, '') + '|' + String(s.user).trim();
  if (s.type === 'm3u' && s.url) return 'm|' + String(s.url).trim();
  return '';
}

// Kaynak kaydını düz değerlerle sınırlar (başka bir cihazdan geldiği için güvenilmez sayılır).
function cleanSource(s) {
  if (!isObj(s) || !identityOf(s) || typeof s.id !== 'string' || !s.id || s.id.length > 64) return null;
  const o = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'local' || k.length > 40) continue;
    if (typeof v === 'string') o[k] = v.slice(0, 2000);
    else if (typeof v === 'number' || typeof v === 'boolean') o[k] = v;
  }
  return o;
}

// Bu cihazın eşitlenebilir verisi. Yerel (dosyadan eklenen) listeler ve ayarlar girmez.
export function makeSnapshot(store, now = Date.now()) {
  const sources = store.sources().filter((s) => !s.local && identityOf(s));
  const data = {};
  for (const s of sources) {
    for (const p of PER_SOURCE) {
      const v = store.get(p + '.' + s.id);
      if (v !== undefined) data[p + '.' + s.id] = v;
    }
  }
  return { app: SYNC_APP, v: SYNC_VERSION, at: now, sources, data };
}

// Gelen veriyi (metin ya da nesne) doğrular: { ok, snap } ya da { ok:false, error }.
export function parseSnapshot(input) {
  let b = input;
  if (typeof input === 'string') {
    try {
      b = JSON.parse(input);
    } catch {
      return { ok: false, error: 'Geçersiz eşitleme verisi' };
    }
  }
  if (!isObj(b) || b.app !== SYNC_APP) return { ok: false, error: 'Geçersiz eşitleme verisi' };
  if (!(b.v >= 1) || b.v > SYNC_VERSION) return { ok: false, error: 'Diğer cihazdaki uygulama daha yeni; önce güncelleyin' };
  if (!Array.isArray(b.sources) || b.sources.length > MAX_SOURCES) return { ok: false, error: 'Geçersiz eşitleme verisi' };
  const sources = [];
  const seen = new Set();
  for (const s of b.sources) {
    const c = cleanSource(s);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      sources.push(c);
    }
  }
  return { ok: true, snap: { app: SYNC_APP, v: b.v, at: num(b.at), sources, data: isObj(b.data) ? b.data : {} } };
}

// ---- birleştirme (hepsi yalnız ekler; var olanı değiştirmez) ----

function mergeFavs(local, remote) {
  const out = Array.isArray(local) ? local.slice() : [];
  const ids = new Set(out.map((f) => f && f.id));
  let added = 0;
  for (const r of Array.isArray(remote) ? remote : []) {
    if (!isObj(r) || typeof r.id !== 'string' || !r.id || !str(r.name) || ids.has(r.id)) continue;
    ids.add(r.id);
    out.push({ id: r.id.slice(0, 200), kind: str(r.kind, 20), name: str(r.name, 200), logo: str(r.logo, 500) });
    added++;
  }
  return { value: out, added };
}

// Son izlenenler yeniden eskiye sıralıdır: eksikler zamanlarına göre araya girer, yerel sıra bozulmaz.
function mergeRecents(local, remote) {
  const out = Array.isArray(local) ? local.slice() : [];
  const ids = new Set(out.map((f) => f && f.id));
  const fresh = [];
  for (const r of Array.isArray(remote) ? remote : []) {
    if (!isObj(r) || typeof r.id !== 'string' || !r.id || !str(r.name) || ids.has(r.id)) continue;
    ids.add(r.id);
    fresh.push({ id: r.id.slice(0, 200), kind: str(r.kind, 20), name: str(r.name, 200), logo: str(r.logo, 500), at: num(r.at) });
  }
  if (!fresh.length) return { value: out, added: 0 };
  const merged = out
    .map((e, i) => ({ e, i, at: num(e && e.at), mine: true }))
    .concat(fresh.map((e, i) => ({ e, i: out.length + i, at: e.at, mine: false })))
    .sort((a, b) => b.at - a.at || a.i - b.i);
  const kept = merged.slice(0, Math.max(MAX_RECENTS, out.length));
  return { value: kept.map((x) => x.e), added: kept.filter((x) => !x.mine).length };
}

function mergeProgress(local, remote) {
  const out = isObj(local) ? { ...local } : {};
  const fresh = [];
  if (isObj(remote)) {
    for (const r of Object.values(remote)) {
      if (!isObj(r) || typeof r.id !== 'string' || !r.id || r.id === '__proto__' || Object.prototype.hasOwnProperty.call(out, r.id) || !(num(r.pos) > 0) || !str(r.name)) continue;
      fresh.push({ id: r.id.slice(0, 200), kind: str(r.kind, 20), name: str(r.name, 200), logo: str(r.logo, 500), parent: typeof r.parent === 'string' ? r.parent.slice(0, 200) : null, pos: num(r.pos), dur: num(r.dur), at: num(r.at) });
    }
  }
  // Sınır aşılırsa yalnız eklenenlerin en eskileri atılır; mevcut kayıtlara dokunulmaz.
  fresh.sort((a, b) => b.at - a.at);
  const room = Math.max(0, MAX_PROGRESS - Object.keys(out).length);
  const take = fresh.slice(0, room);
  for (const p of take) out[p.id] = p;
  return { value: out, added: take.length };
}

// Kategori düzeni: boş olan alanlar diğer cihazdan doldurulur, klasörler ada göre birleşir (aynı adlı klasöre eksik öğeler eklenir).
function mergePrefs(local, remote) {
  const loc = normalizePrefs(local);
  const rem = normalizePrefs(remote);
  const out = { ...loc, folders: loc.folders.map((f) => ({ ...f, items: f.items.slice() })) };
  let added = 0;
  let changed = false;
  const idMap = new Map();
  for (const rf of rem.folders) {
    const lf = out.folders.find((f) => f.name === rf.name);
    if (lf) {
      idMap.set(rf.id, lf.id);
      for (const it of rf.items) {
        if (!lf.items.includes(it)) {
          lf.items.push(it);
          changed = true;
        }
      }
    } else {
      let id = rf.id;
      if (out.folders.some((f) => f.id === id)) id = rf.id + '-' + hashId(rf.name);
      out.folders.push({ id, name: rf.name, items: rf.items.slice() });
      idMap.set(rf.id, id);
      added++;
      changed = true;
    }
  }
  const mapId = (x) => (x.startsWith('f:') && idMap.has(x.slice(2)) ? 'f:' + idMap.get(x.slice(2)) : x);
  for (const f of ['order', 'hidden', 'locked']) {
    if (!out[f].length && rem[f].length) {
      out[f] = [...new Set(rem[f].map(mapId))];
      changed = true;
    }
  }
  return { value: out, added, changed };
}

function mergeCats(local, remote) {
  const out = isObj(local) ? { ...local } : {};
  let added = 0;
  let changed = false;
  if (isObj(remote)) {
    for (const kind of ['live', 'movie', 'series']) {
      if (!isObj(remote[kind])) continue;
      const m = mergePrefs(out[kind], remote[kind]);
      if (m.changed) {
        out[kind] = m.value;
        added += m.added;
        changed = true;
      }
    }
  }
  return { value: out, added, changed };
}

export const emptyAdded = () => ({ sources: 0, favs: 0, recents: 0, progress: 0, folders: 0 });

// Diğer cihazın verisini bu cihaza ekler (var olanı değiştirmeden). Eklenenlerin sayısını döndürür.
export function applySnapshot(store, snap) {
  const added = emptyAdded();
  const local = store.sources();
  const byIdent = new Map();
  const ids = new Set(local.map((s) => s.id));
  for (const s of local) {
    const k = identityOf(s);
    if (k && !byIdent.has(k)) byIdent.set(k, s);
  }
  const map = new Map(); // diğer cihazdaki kimlik → bu cihazdaki kimlik
  const fresh = [];
  for (const r of snap.sources) {
    const k = identityOf(r);
    const m = byIdent.get(k);
    if (m) {
      map.set(r.id, m.id);
      continue;
    }
    let id = r.id;
    if (ids.has(id)) id = 'src' + hashId(k + ':' + Date.now());
    ids.add(id);
    const s = { ...r, id };
    fresh.push(s);
    byIdent.set(k, s);
    map.set(r.id, id);
    added.sources++;
  }
  if (fresh.length) store.put('sources', local.concat(fresh));
  for (const [rid, lid] of map) {
    const put = (prefix, m, changed = m.added > 0) => {
      if (changed) store.put(prefix + '.' + lid, m.value);
      return m.added;
    };
    const rd = (p) => snap.data[p + '.' + rid];
    if (rd('fav') !== undefined) added.favs += put('fav', mergeFavs(store.get('fav.' + lid), rd('fav')));
    if (rd('rec') !== undefined) added.recents += put('rec', mergeRecents(store.get('rec.' + lid), rd('rec')));
    if (rd('prog') !== undefined) added.progress += put('prog', mergeProgress(store.get('prog.' + lid), rd('prog')));
    if (rd('cats') !== undefined) {
      const m = mergeCats(store.get('cats.' + lid), rd('cats'));
      put('cats', m, m.changed);
      added.folders += m.added;
    }
  }
  return added;
}

export const addedTotal = (a) => a.sources + a.favs + a.recents + a.progress + a.folders;

const LABELS = [
  ['sources', 'kaynak'],
  ['favs', 'favori'],
  ['recents', 'son izlenen'],
  ['progress', 'ilerleme'],
  ['folders', 'klasör'],
];

// "2 kaynak, 5 favori" ya da boşsa "yeni bir şey yok"
export function describeAdded(a) {
  const parts = LABELS.filter(([k]) => a[k] > 0).map(([k, n]) => `${a[k]} ${n}`);
  return parts.length ? parts.join(', ') : 'yeni bir şey yok';
}

// Eşitleme sonucu iletisi: tv → TV'ye eklenenler, phone → telefona eklenenler.
export function syncMessage(tv, phone) {
  if (!addedTotal(tv) && !addedTotal(phone)) return 'Zaten eşit: iki cihazda da aynı veriler var';
  return `TV’ye eklenen: ${describeAdded(tv)}. Telefona eklenen: ${describeAdded(phone)}.`;
}
