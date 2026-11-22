// Kalıcı önbellek (IndexedDB): kategori ve film/dizi listeleri uygulama kapanınca da kalır; açılışta önce kayıtlı liste hemen gösterilir,
// güncel liste arkada indirilip yenilenir. localStorage kullanılmaz: büyük listeler kotayı doldurup favori/ayar kaydını bozardı.
// IndexedDB yoksa ya da hata verirse sessizce çalışmaz (her şey bellek önbelleğiyle eskisi gibi sürer).
const AD = 'iptv-onbellek';
const DEPO = 'liste';
const OMUR_MS = 14 * 24 * 3600 * 1000; // bundan eski kayıt gösterilmez
const EN_COK = 60; // en çok kayıt (en eskiler silinir)

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
    yaz: (anahtar, deger, simdi) => {
      if (!Array.isArray(deger) || !deger.length) return Promise.resolve(false);
      return islem('readwrite', (st) => {
        st.put({ at: simdi || Date.now(), v: deger }, anahtar);
        return null;
      })
        .then(() => budama())
        .then(() => true);
    },
  };
  // Çok kayıt birikirse en eskiler silinir (kayıtlar küçük yazılıp sık okunduğundan basit sayım yeter)
  function budama() {
    return islem('readwrite', (st) => {
      const kayitlar = [];
      const imlec = st.openCursor();
      imlec.onsuccess = () => {
        const c = imlec.result;
        if (c) {
          kayitlar.push({ k: c.key, at: (c.value && c.value.at) || 0 });
          c.continue();
        } else if (kayitlar.length > EN_COK) {
          kayitlar.sort((a, b) => a.at - b.at);
          for (let i = 0; i < kayitlar.length - EN_COK; i++) st.delete(kayitlar[i].k);
        }
      };
      return null;
    });
  }
}

export const onbellek = createOnbellek(() => (typeof window !== 'undefined' ? window.indexedDB : null));
