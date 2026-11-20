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
  // ---- profiller: her aile üyesinin kendi favorileri, son izlenenleri ve kaldığı yeri. Ana profil ('') eski anahtarları kullanır (taşıma yok);
  // diğer profillerde bu anahtarların başına 'p.<kimlik>.' gelir. Kaynaklar, ayarlar ve kategori düzeni ortaktır.
  const SCOPED = ['fav.', 'favx.', 'rec.', 'prog.', 'progx.'];
  let pid = '';
  const keyOf = (k) => P + (pid && SCOPED.some((x) => k.startsWith(x)) ? 'p.' + pid + '.' + k : k);
  // Bellek önbelleği: depodaki her kayıt (ayarlar, favoriler, son izlenenler, ilerleme…) ilk okunuşta bir kez ayrıştırılıp bellekte tutulur;
  // sonraki okumalar depoya ve JSON.parse'a gitmez (ekran çizimlerinde yüzlerce kez okunuyordu; zayıf TV kutusunda kasıyordu).
  // Yazma ve silme kaydı önbellekten düşürür, bir sonraki okuma depodakini yeniden alır: bellek her zaman depoyla aynıdır.
  // Okuyana önbelleğin kendisi değil sığ kopyası verilir (dizi/nesne üzerinde sıralama, ekleme, silme depoyu bozmasın).
  const MISSING = Symbol('yok'); // depoda yok ya da bozuk
  const memo = new Map(); // tam anahtar → ayrıştırılmış değer | MISSING
  const parsed = (full) => {
    if (memo.has(full)) return memo.get(full);
    let x = MISSING;
    try {
      const v = storage.getItem(full);
      if (v != null) x = JSON.parse(v);
    } catch {
      x = MISSING;
    }
    memo.set(full, x);
    return x;
  };
  const copyOf = (x) => (Array.isArray(x) ? x.slice() : x && typeof x === 'object' ? { ...x } : x);
  const read = (k, d) => {
    const x = parsed(keyOf(k));
    if (x === MISSING) return d;
    // Bozulmuş kayıt (beklenen dizi/nesne değilse) varsayılana düşer; listeleri okuyan kod çökmez.
    if (Array.isArray(d)) return Array.isArray(x) ? copyOf(x) : d;
    if (d && typeof d === 'object') return x && typeof x === 'object' && !Array.isArray(x) ? copyOf(x) : d;
    return copyOf(x);
  };
  const write = (k, v) => {
    const full = keyOf(k);
    memo.delete(full);
    try {
      storage.setItem(full, JSON.stringify(v));
    } catch {
      /* kota dolu: sessizce geç */
    }
  };
  const remove = (full) => {
    memo.delete(full);
    try {
      storage.removeItem(full);
    } catch {
      /* yok say */
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
    for (const k of ['fav.', 'favx.', 'rec.', 'prog.', 'progx.', 'cats.', 'pref.bad.', 'pref.hidch.', 'pref.hhist.']) remove(P + k + id);
    for (const pr of extraProfiles()) dropScoped(pr.id, id); // diğer profillerdeki favori/son izlenen/ilerleme de gider
    cache.del('cat:' + id);
    cache.del('epg:' + id);
    cache.del('file:' + id);
  };

  // ---- profiller ----
  const MAX_PROFILES = 6;
  const extraProfiles = () => read('profiles', []).filter((x) => x && typeof x.id === 'string' && x.id && typeof x.name === 'string');
  const dropScoped = (profileId, sid) => {
    for (const k of SCOPED) remove(P + 'p.' + profileId + '.' + k + sid);
  };
  api.MAX_PROFILES = MAX_PROFILES;
  api.profiles = () => [{ id: '', name: String(read('profile.main', '') || 'Ana profil') }, ...extraProfiles().map((x) => ({ id: x.id, name: x.name }))];
  api.profileId = () => pid;
  api.profile = () => api.profiles().find((x) => x.id === pid) || api.profiles()[0];
  api.setProfile = (id) => {
    pid = api.profiles().some((x) => x.id === id) ? id : '';
    write('profile', pid);
    return pid;
  };
  // Ad verir ya da yeni profil ekler. Dönen: profil; sınır dolduysa ya da ad boşsa null.
  api.saveProfile = ({ id = null, name = '' } = {}) => {
    const nm = String(name || '').trim().slice(0, 24);
    if (!nm) return null;
    if (id === '') {
      write('profile.main', nm);
      return { id: '', name: nm };
    }
    const list = extraProfiles();
    const cur = id ? list.find((x) => x.id === id) : null;
    if (cur) cur.name = nm;
    else {
      if (list.length + 1 >= MAX_PROFILES) return null;
      list.push({ id: 'p' + hashId(Date.now() + Math.random().toString(36)), name: nm });
    }
    write('profiles', list);
    return cur ? { id: cur.id, name: nm } : { ...list[list.length - 1] };
  };
  // Profili ve ona ait favori/son izlenen/ilerleme kayıtlarını siler. Ana profil silinmez.
  api.removeProfile = (id) => {
    if (!id || !extraProfiles().some((x) => x.id === id)) return false;
    for (const s of api.sources()) dropScoped(id, s.id);
    write('profiles', extraProfiles().filter((x) => x.id !== id));
    if (pid === id) api.setProfile('');
    return true;
  };
  pid = (() => {
    const id = read('profile', '');
    return typeof id === 'string' && extraProfiles().some((x) => x.id === id) ? id : '';
  })();

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
  // Silme izleri (kimlik → zaman): TV ile eşitlemede "silindi" kararının yayılması için; en yeni 500 iz tutulur.
  const markGone = (key, id) => {
    const t = read(key, {}) || {};
    t[id] = Date.now();
    const ks = Object.keys(t);
    if (ks.length > 500) {
      ks.sort((a, b) => t[a] - t[b]);
      for (const k of ks.slice(0, ks.length - 500)) delete t[k];
    }
    write(key, t);
  };
  const unmarkGone = (key, id) => {
    const t = read(key, null);
    if (t && Object.prototype.hasOwnProperty.call(t, id)) {
      delete t[id];
      write(key, t);
    }
  };
  api.toggleFav = (sid, e) => {
    const list = api.favs(sid);
    const i = list.findIndex((f) => f.id === e.id);
    if (i >= 0) {
      list.splice(i, 1);
      markGone('favx.' + sid, e.id);
    } else {
      list.unshift({ id: e.id, kind: e.kind, name: e.name, logo: e.logo || '', at: Date.now() });
      unmarkGone('favx.' + sid, e.id);
    }
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
  api.removeRecent = (sid, id) => write('rec.' + sid, api.recents(sid).filter((r) => r.id !== id));
  api.clearRecents = (sid) => write('rec.' + sid, []);

  // ---- film/dizi ilerlemesi ----
  api.progressAll = (sid) => read('prog.' + sid, {});
  api.progress = (sid, id) => api.progressAll(sid)[id] || null;
  api.clearProgress = (sid) => {
    const all = api.progressAll(sid);
    for (const id of Object.keys(all)) markGone('progx.' + sid, id);
    write('prog.' + sid, {});
  };
  api.setProgress = (sid, e, pos, dur) => {
    const all = api.progressAll(sid);
    if (dur > 0 && pos / dur > 0.95) {
      if (all[e.id]) markGone('progx.' + sid, e.id); // izleme bitti: diğer cihazda da "devam et"ten kalksın
      delete all[e.id];
    } else if (pos >= 15000) {
      all[e.id] = { id: e.id, kind: e.kind, name: e.name, logo: e.logo || '', parent: e.parent || null, pos, dur, at: Date.now() };
      unmarkGone('progx.' + sid, e.id);
    } else return;
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

  // ---- bellek önbelleği denetimi ----
  // reload: depo bu store dışından değiştiyse bellek bırakılır; sonraki okuma depodakini alır.
  api.reload = () => memo.clear();
  // preload: tüm kayıtları belleğe alır (açılışta ve ara sıra). Kısa parçalar halinde çalışır, arada arayüze nefes aldırır;
  // onProgress(biten, toplam). reload: önce belleği bırakır (ara sıra tazeleme). Dönen: kayıt sayısı.
  api.preload = async ({ reload = false, onProgress = () => {}, chunk = 25, tick = () => new Promise((r) => setTimeout(r, 0)) } = {}) => {
    if (reload) memo.clear();
    const keys = api.keys();
    for (let i = 0; i < keys.length; i += chunk) {
      for (const k of keys.slice(i, i + chunk)) parsed(P + k);
      onProgress(Math.min(keys.length, i + chunk), keys.length);
      await tick();
    }
    onProgress(keys.length, keys.length);
    return keys.length;
  };

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
  api.drop = (k) => remove(P + k);

  return api;
}
