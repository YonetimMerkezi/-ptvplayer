// Kalıcı önbellek (IndexedDB): kategori ve film/dizi listeleri uygulama kapanınca da kalır; açılışta önce kayıtlı liste hemen gösterilir,
// güncel liste arkada indirilip yenilenir. localStorage kullanılmaz: büyük listeler kotayı doldurup favori/ayar kaydını bozardı.
// IndexedDB yoksa ya da hata verirse sessizce çalışmaz (her şey bellek önbelleğiyle eskisi gibi sürer).
const AD = 'iptv-onbellek';
const DEPO = 'liste';
const OMUR_MS = 14 * 24 * 3600 * 1000; // bundan eski kayıt gösterilmez
const EN_COK = 60; // en çok kayıt (en eskiler silinir)
const KUNYE = '__kunye'; // anahtar → yazılma zamanı tablosu (küçük kayıt; budama bunu okur)

export function createOnbellek(idbFabrika) {
  let dbSoz = null;
  const ac = () => {
    if (dbSoz) return dbSoz;
    dbSoz = new Promise((coz) => {
      try {
        const idb = idbFabrika();
        if (!idb) return coz(null);
        const r = idb.open(AD, 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains(DEPO)) d.createObjectStore(DEPO);
        };
        r.onsuccess = () => coz(r.result);
        r.onerror = () => coz(null);
        r.onblocked = () => coz(null);
      } catch (e) {
        coz(null);
      }
    });
    return dbSoz;
  };
  const islem = (mod, fn) =>
    ac().then(
      (db) =>
        new Promise((coz) => {
          if (!db) return coz(null);
          try {
            const tx = db.transaction(DEPO, mod);
            const st = tx.objectStore(DEPO);
            const sonuc = fn(st);
            tx.oncomplete = () => coz(sonuc && sonuc.result !== undefined ? sonuc.result : null);
            tx.onerror = () => coz(null);
            tx.onabort = () => coz(null);
          } catch (e) {
            coz(null);
          }
        }),
    );
  return {
    // Kayıtlı değer (taze ise) ya da null
    oku: (anahtar, simdi) =>
      islem('readonly', (st) => st.get(anahtar)).then((e) => (e && typeof e === 'object' && Array.isArray(e.v) && (simdi || Date.now()) - e.at < OMUR_MS ? e.v : null)),
    // Kayıt + "hangi anahtar ne zaman yazıldı" künyesi tek işlemde yazılır; budama listeleri okumaz (büyük kayıtları çözmek TV'de ekranı donduruyordu)
    yaz: (anahtar, deger, simdi) => {
      if (!Array.isArray(deger) || !deger.length) return Promise.resolve(false);
      const at = simdi || Date.now();
      return islem('readwrite', (st) => {
        const bitir = (kunye) => {
          kunye[anahtar] = at;
          st.put({ at, v: deger }, anahtar);
          const anahtarlar = Object.keys(kunye);
          if (anahtarlar.length > EN_COK) {
            anahtarlar.sort((x, y) => kunye[x] - kunye[y]);
            for (let i = 0; i < anahtarlar.length - EN_COK; i++) {
              st.delete(anahtarlar[i]);
              delete kunye[anahtarlar[i]];
            }
          }
          st.put({ m: kunye }, KUNYE);
        };
        const okuma = st.get(KUNYE);
        okuma.onsuccess = () => {
          const e = okuma.result;
          if (e && typeof e === 'object' && e.m && typeof e.m === 'object') return bitir(e.m);
          // Künye yok (eski sürümden kalan kayıtlar): yalnız anahtarlar okunur, hepsi "en eski" sayılır
          const kunye = {};
          const imlec = st.openKeyCursor();
          imlec.onsuccess = () => {
            const c = imlec.result;
            if (c) {
              if (c.key !== KUNYE) kunye[c.key] = 0;
              c.continue();
            } else bitir(kunye);
          };
        };
        return null;
      }).then(() => true);
    },
  };
}

export const onbellek = createOnbellek(() => (typeof window !== 'undefined' ? window.indexedDB : null));
