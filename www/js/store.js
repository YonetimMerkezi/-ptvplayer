// Kalıcı durum: kaynaklar, favoriler, son izlenenler, izleme ilerlemesi (localStorage);
// katalog ve rehber önbelleği (IndexedDB, yoksa bellek).
import { hashId } from './util.js';
import { normalizePrefs } from './cats.js';

class MemStorage {
  constructor() {
    this.m = new Map();
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    this.m.set(k, String(v));
  }
  removeItem(k) {
    this.m.delete(k);
  }
}

function pickStorage() {
  try {
    const s = globalThis.localStorage;
    s.setItem('__t', '1');
    s.removeItem('__t');
    return s;
  } catch {
    return new MemStorage();
  }
}

export function createCache(name = 'iptv-cache') {
  const mem = new Map();
  let dbp = null;
  const db = () => {
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      try {
        if (!globalThis.indexedDB) return resolve(null);
        const req = globalThis.indexedDB.open(name, 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return dbp;
  };
  const tx = async (mode, fn) => {
    const d = await db();
    if (!d) return undefined;
    return new Promise((resolve) => {
      try {
        const t = d.transaction('kv', mode);
        const r = fn(t.objectStore('kv'));
        t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
        t.onerror = () => resolve(undefined);
        t.onabort = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  };
  return {
    async get(key) {
      if (mem.has(key)) return mem.get(key);
      const v = await tx('readonly', (s) => s.get(key));
      return v === undefined ? null : v;
    },
    async set(key, val) {
      mem.set(key, val);
      await tx('readwrite', (s) => s.put(val, key));
    },
    async del(key) {
      mem.delete(key);
      await tx('readwrite', (s) => s.delete(key));
    },
  };
}

export function createStore({ storage = pickStorage(), cache = createCache() } = {}) {
  const P = 'iptv.';
  const read = (k, d) => {
    try {
      const v = storage.getItem(P + k);
      if (v == null) return d;
      const x = JSON.parse(v);
      // Bozulmuş kayıt (beklenen dizi/nesne değilse) varsayılana düşer; listeleri okuyan kod çökmez.
      if (Array.isArray(d)) return Array.isArray(x) ? x : d;
      if (d && typeof d === 'object') return x && typeof x === 'object' && !Array.isArray(x) ? x : d;
      return x;
    } catch {
      return d;
    }
  };
  const write = (k, v) => {
    try {
      storage.setItem(P + k, JSON.stringify(v));
    } catch {
      /* kota dolu: sessizce geç */
    }
  };

  const api = { cache };

  // ---- kaynaklar ----
  api.sources = () => read('sources', []).filter((s) => s && typeof s === 'object' && typeof s.id === 'string');
  api.activeId = () => {
    const id = read('active', null);
    const list = api.sources();
    return list.some((s) => s.id === id) ? id : list[0]?.id ?? null;
  };
  api.setActive = (id) => write('active', id);
  api.activeSource = () => {
    const id = api.activeId();
    return api.sources().find((s) => s.id === id) || null;
  };
  api.saveSource = (src) => {
    const list = api.sources();
    const s = { ...src, id: src.id || 'src' + hashId(Date.now() + Math.random().toString(36)) };
    const i = list.findIndex((x) => x.id === s.id);
    if (i >= 0) list[i] = s;
    else list.push(s);
    write('sources', list);
    return s;
  };
  api.removeSource = (id) => {
    write('sources', api.sources().filter((s) => s.id !== id));
    for (const k of ['fav.', 'rec.', 'prog.', 'cats.']) {
      try {
        storage.removeItem(P + k + id);
      } catch {
        /* yok say */
      }
    }
    cache.del('cat:' + id);
    cache.del('epg:' + id);
    cache.del('file:' + id);
  };

  // ---- kategori düzeni: sıra, gizleme, özel klasörler (kaynak + tür başına) ----
  api.catPrefs = (sid, kind) => normalizePrefs((read('cats.' + sid, {}) || {})[kind]);
  api.setCatPrefs = (sid, kind, prefs) => {
    const all = read('cats.' + sid, {}) || {};
    all[kind] = prefs;
    write('cats.' + sid, all);
  };

  // ---- favoriler ----
  api.favs = (sid) => read('fav.' + sid, []);
  api.isFav = (sid, id) => api.favs(sid).some((f) => f.id === id);
  api.toggleFav = (sid, e) => {
    const list = api.favs(sid);
    const i = list.findIndex((f) => f.id === e.id);
    if (i >= 0) list.splice(i, 1);
    else list.unshift({ id: e.id, kind: e.kind, name: e.name, logo: e.logo || '' });
    write('fav.' + sid, list);
    return i < 0;
  };

  // ---- son izlenenler ----
  api.recents = (sid) => read('rec.' + sid, []);
  api.pushRecent = (sid, e) => {
    const list = api.recents(sid).filter((r) => r.id !== e.id);
    list.unshift({ id: e.id, kind: e.kind, name: e.name, logo: e.logo || '', at: Date.now() });
    const limit = Math.min(200, Math.max(10, Number(api.pref('set.recentLimit', 40)) || 40));
    write('rec.' + sid, list.slice(0, limit));
  };
  api.clearRecents = (sid) => write('rec.' + sid, []);

  // ---- film/dizi ilerlemesi ----
  api.progressAll = (sid) => read('prog.' + sid, {});
  api.progress = (sid, id) => api.progressAll(sid)[id] || null;
  api.setProgress = (sid, e, pos, dur) => {
    const all = api.progressAll(sid);
    if (dur > 0 && pos / dur > 0.95) delete all[e.id];
    else if (pos >= 15000) all[e.id] = { id: e.id, kind: e.kind, name: e.name, logo: e.logo || '', parent: e.parent || null, pos, dur, at: Date.now() };
    else return;
    const keys = Object.keys(all);
    if (keys.length > 300) {
      keys.sort((a, b) => all[a].at - all[b].at);
      for (const k of keys.slice(0, keys.length - 300)) delete all[k];
    }
    write('prog.' + sid, all);
  };
  api.continueWatching = (sid) =>
    Object.values(api.progressAll(sid))
      .filter((p) => p.pos >= 15000 && p.dur > 0 && p.pos / p.dur < 0.95)
      .sort((a, b) => b.at - a.at)
      .slice(0, 30);

  // ---- tercihler ----
  api.pref = (k, d) => read('pref.' + k, d);
  api.setPref = (k, v) => write('pref.' + k, v);

  // ---- ham erişim (yedekle / geri yükle): 'iptv.' önekinden sonraki anahtar adlarıyla ----
  api.keys = () => {
    const out = [];
    try {
      const n = storage.length | 0;
      for (let i = 0; i < n; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(P)) out.push(k.slice(P.length));
      }
    } catch {
      /* sayılamayan depolamada yalnız bilinen anahtarlar kullanılır */
    }
    return out;
  };
  api.get = (k) => read(k, undefined);
  api.put = (k, v) => write(k, v);
  api.drop = (k) => {
    try {
      storage.removeItem(P + k);
    } catch {
      /* yok say */
    }
  };

  return api;
}
