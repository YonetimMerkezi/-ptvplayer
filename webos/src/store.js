// Kalıcı veri: kaynaklar, favoriler, son izlenenler/kaldığı yer, ayarlar. Depolama dışarıdan verilir (testte sahte).
const ANAHTAR = 'iptv.webos.v1';
const SON_AZAMI = 60;

export function bellekDepo() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => {
      m[k] = String(v);
    },
    removeItem: (k) => {
      delete m[k];
    },
  };
}

const bos = () => ({ sources: [], active: '', favs: {}, recents: {}, settings: {} });

export function createStore(storage) {
  let d = bos();
  try {
    const raw = storage.getItem(ANAHTAR);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') d = Object.assign(bos(), p);
    }
  } catch (e) {
    d = bos();
  }
  const kaydet = () => {
    try {
      storage.setItem(ANAHTAR, JSON.stringify(d));
    } catch (e) {
      /* kota dolu: bellekte devam */
    }
  };
  const yeniId = () => 's' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);

  const api = {
    sources: () => d.sources.slice(),
    activeId: () => d.active,
    active: () => d.sources.filter((s) => s.id === d.active)[0] || d.sources[0] || null,
    addSource(src) {
      const s = Object.assign({}, src, { id: yeniId() });
      d.sources.push(s);
      d.active = s.id;
      kaydet();
      return s;
    },
    setActive(id) {
      if (d.sources.some((s) => s.id === id)) {
        d.active = id;
        kaydet();
      }
    },
    removeSource(id) {
      d.sources = d.sources.filter((s) => s.id !== id);
      delete d.favs[id];
      delete d.recents[id];
      if (d.active === id) d.active = d.sources.length ? d.sources[0].id : '';
      kaydet();
    },
    // Favoriler: kaynak başına öğe özetleri (adı, logosu, oynatmak için gerekenler)
    favs: (sid) => (d.favs[sid] || []).slice(),
    isFav: (sid, id) => (d.favs[sid] || []).some((x) => x.id === id),
    toggleFav(sid, item) {
      const l = d.favs[sid] || (d.favs[sid] = []);
      const i = l.findIndex((x) => x.id === item.id);
      if (i >= 0) l.splice(i, 1);
      else l.unshift(item);
      kaydet();
      return i < 0;
    },
    // Son izlenenler ve kaldığı yer
    recents: (sid) => (d.recents[sid] || []).slice(),
    posOf(sid, id) {
      const r = (d.recents[sid] || []).filter((x) => x.item.id === id)[0];
      return r ? { pos: r.pos || 0, dur: r.dur || 0 } : { pos: 0, dur: 0 };
    },
    touch(sid, item, pos, dur) {
      const l = d.recents[sid] || (d.recents[sid] = []);
      const i = l.findIndex((x) => x.item.id === item.id);
      const kayit = { item, pos: Math.floor(pos || 0), dur: Math.floor(dur || 0), at: Date.now() };
      if (i >= 0) l.splice(i, 1);
      l.unshift(kayit);
      if (l.length > SON_AZAMI) l.length = SON_AZAMI;
      kaydet();
    },
    clearRecents(sid) {
      delete d.recents[sid];
      kaydet();
    },
    setting: (k, v) => (k in d.settings ? d.settings[k] : v),
    setSetting(k, v) {
      d.settings[k] = v;
      kaydet();
    },
  };
  return api;
}
