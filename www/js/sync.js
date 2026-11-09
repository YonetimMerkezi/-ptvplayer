// Telefon ↔ TV eşitleme: iki cihazdaki kaynaklar, favoriler, son izlenenler, izleme ilerlemesi ve kategori düzeni
// karşılıklı birleştirilir. Kaynaklar, son izlenenler ve kategori düzeni yalnız eklenir (var olan değişmez).
// Favoriler ve izleme ilerlemesinde EN YENİ karar kazanır: her favori ekleme zamanını, her silme bir silme izini
// (kimlik → zaman) taşır; izleme ilerlemesinde zamanı yeni olan kayıt geçerlidir, bitirilen filmin silme izi yayılır.
// Saf mantık: depo (store) dışarıdan verilir, ağ burada yok.
import { hashId } from './util.js';
import { normalizePrefs } from './cats.js';

export const SYNC_APP = 'iptv-oynatici-sync';
export const SYNC_VERSION = 1;
const PER_SOURCE = ['fav', 'favx', 'rec', 'prog', 'progx', 'cats'];
const MAX_TOMBS = 500;
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

// Silme izleri: { kimlik: zaman }. İki tarafın izleri birleşince her kimlik için en yeni zaman kalır.
const cleanTombs = (v) => {
  const o = {};
  if (!isObj(v)) return o;
  for (const [k, t] of Object.entries(v)) {
    if (k && k.length <= 200 && k !== '__proto__' && num(t) > 0) o[k] = num(t);
  }
  return o;
};
const unionTombs = (a, b) => {
  const out = cleanTombs(a);
  for (const [k, t] of Object.entries(cleanTombs(b))) if (!(out[k] >= t)) out[k] = t;
  return out;
};
// En yeni MAX_TOMBS iz kalır.
const pruneTombs = (t) => {
  const keys = Object.keys(t);
  if (keys.length <= MAX_TOMBS) return t;
  keys.sort((x, y) => t[y] - t[x]);
  const o = {};
  for (const k of keys.slice(0, MAX_TOMBS)) o[k] = t[k];
  return o;
};
const sameTombs = (a, b) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

// Favoriler: aynı kimlik için "ekleme zamanı" (at; eski kayıtlarda 0) ile silme izi karşılaştırılır, yeni olan kazanır.
function mergeFavs(local, remote, localDel, remoteDel) {
  const dl = cleanTombs(localDel);
  const del = unionTombs(dl, remoteDel);
  const out = [];
  const ids = new Set();
  let removed = 0;
  let added = 0;
  for (const f of Array.isArray(local) ? local : []) {
    if (!isObj(f)) continue;
    if (typeof f.id === 'string' && del[f.id] > num(f.at)) {
      removed++;
      continue;
    }
    out.push(f);
    ids.add(f.id);
  }
  for (const r of Array.isArray(remote) ? remote : []) {
    if (!isObj(r) || typeof r.id !== 'string' || !r.id || !str(r.name) || ids.has(r.id)) continue;
    if (del[r.id] > num(r.at)) continue; // eklendikten sonra silinmiş
    ids.add(r.id);
    const e = { id: r.id.slice(0, 200), kind: str(r.kind, 20), name: str(r.name, 200), logo: str(r.logo, 500) };
    if (num(r.at) > 0) e.at = num(r.at);
    out.push(e);
    added++;
  }
  // Silinmesinden sonra yeniden eklenen favorinin eski izi gereksiz
  for (const f of out) if (del[f.id] !== undefined && num(f.at) >= del[f.id]) delete del[f.id];
  const tombs = pruneTombs(del);
  return { value: out, added, removed, tombs, changed: added > 0 || removed > 0 || !sameTombs(tombs, dl) };
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

// İzleme ilerlemesi: aynı kimlikte zamanı yeni olan kazanır; bir cihazda bitirilen (silme izi) film diğerinde de kalkar.
function mergeProgress(local, remote, localDel, remoteDel) {
  const dl = cleanTombs(localDel);
  const del = unionTombs(dl, remoteDel);
  const out = {};
  let removed = 0;
  if (isObj(local)) {
    for (const [k, v] of Object.entries(local)) {
      if (isObj(v) && del[v.id] > num(v.at)) removed++;
      else out[k] = v;
    }
  }
  const fresh = [];
  let updated = 0;
  if (isObj(remote)) {
    for (const r of Object.values(remote)) {
      if (!isObj(r) || typeof r.id !== 'string' || !r.id || r.id === '__proto__' || !(num(r.pos) > 0) || !str(r.name)) continue;
      if (del[r.id] >= num(r.at)) continue;
      const mine = Object.prototype.hasOwnProperty.call(out, r.id) ? out[r.id] : null;
      if (mine && num(mine.at) >= num(r.at)) continue;
      const e = { id: r.id.slice(0, 200), kind: str(r.kind, 20), name: str(r.name, 200), logo: str(r.logo, 500), parent: typeof r.parent === 'string' ? r.parent.slice(0, 200) : null, pos: num(r.pos), dur: num(r.dur), at: num(r.at) };
      if (mine) {
        out[r.id] = e;
        updated++;
      } else fresh.push(e);
    }
  }
  // Sınır aşılırsa yalnız eklenenlerin en eskileri atılır; mevcut kayıtlara dokunulmaz.
  fresh.sort((a, b) => b.at - a.at);
  const room = Math.max(0, MAX_PROGRESS - Object.keys(out).length);
  const take = fresh.slice(0, room);
  for (const p of take) out[p.id] = p;
  // Yeniden izlenmeye başlanan filmin eski silme izi gereksiz
  for (const p of Object.values(out)) if (del[p.id] !== undefined && num(p.at) > del[p.id]) delete del[p.id];
  const tombs = pruneTombs(del);
  const added = take.length + updated;
  return { value: out, added, removed, tombs, changed: added > 0 || removed > 0 || !sameTombs(tombs, dl) };
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

export const emptyAdded = () => ({ sources: 0, favs: 0, recents: 0, progress: 0, folders: 0, removed: 0 });

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
    // Favori/ilerleme: silme izleri ayrı anahtarda ('favx' / 'progx') tutulur.
    if (rd('fav') !== undefined || rd('favx') !== undefined) {
      const m = mergeFavs(store.get('fav.' + lid), rd('fav'), store.get('favx.' + lid), rd('favx'));
      if (m.changed) {
        store.put('fav.' + lid, m.value);
        store.put('favx.' + lid, m.tombs);
      }
      added.favs += m.added;
      added.removed += m.removed;
    }
    if (rd('rec') !== undefined) added.recents += put('rec', mergeRecents(store.get('rec.' + lid), rd('rec')));
    if (rd('prog') !== undefined || rd('progx') !== undefined) {
      const m = mergeProgress(store.get('prog.' + lid), rd('prog'), store.get('progx.' + lid), rd('progx'));
      if (m.changed) {
        store.put('prog.' + lid, m.value);
        store.put('progx.' + lid, m.tombs);
      }
      added.progress += m.added;
      added.removed += m.removed;
    }
    if (rd('cats') !== undefined) {
      const m = mergeCats(store.get('cats.' + lid), rd('cats'));
      put('cats', m, m.changed);
      added.folders += m.added;
    }
  }
  return added;
}

export const addedTotal = (a) => a.sources + a.favs + a.recents + a.progress + a.folders + (a.removed || 0);

const LABELS = [
  ['sources', 'kaynak'],
  ['favs', 'favori'],
  ['recents', 'son izlenen'],
  ['progress', 'ilerleme'],
  ['folders', 'klasör'],
  ['removed', 'silme'],
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
