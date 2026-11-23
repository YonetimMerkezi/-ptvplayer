// Resim yedeği: bir <img> yüklenemezse (2016-2017 TV'lerin kök sertifika listesi eski, bazı sunucular başvuranı denetler)
// resmi TV içindeki servis getirir ve data: adresi olarak verir. Yüklenemeyen resim kırık simge yerine gizlenir.
import { luna, SERVIS, varlik } from './luna.js';
import * as K from './log.js';

export const ayar = {
  // Test için değiştirilebilir: (adres) → Promise<{ mime, data(base64) }>
  cagir: (url) =>
    luna(SERVIS + 'resim', { url }, 20000).then((r) => {
      if (!r || r.returnValue === false) throw new Error((r && r.errorText) || 'Resim alınamadı');
      return r;
    }),
};

const EN_FAZLA_ONBELLEK = 300;
const EN_FAZLA_EZAMANLI = 3;
const onbellek = {}; // adres → data: adresi
const sira = []; // onbellek anahtarları, eskiden yeniye
const basarisiz = {}; // adres → true (aynı adres yeniden denenmez)
const bekleyen = []; // { url, coz, red }
const surenler = {}; // adres → Promise (aynı adres için tek istek)
let calisan = 0;

const hostOf = (u) => {
  const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(String(u));
  return m ? m[1].toLowerCase() : '';
};

function siradaki() {
  while (calisan < EN_FAZLA_EZAMANLI && bekleyen.length) {
    const is = bekleyen.shift();
    calisan++;
    ayar
      .cagir(is.url)
      .then((r) => {
        const u = 'data:' + r.mime + ';base64,' + r.data;
        onbellek[is.url] = u;
        sira.push(is.url);
        while (sira.length > EN_FAZLA_ONBELLEK) delete onbellek[sira.shift()];
        is.coz(u);
      })
      .catch((e) => {
        basarisiz[is.url] = true;
        K.uyar('Logo yüklenemedi: ' + hostOf(is.url) + ' (' + ((e && e.message) || 'hata') + ')');
        is.red(e);
      })
      .then(() => {
        calisan--;
        delete surenler[is.url];
        siradaki();
      });
  }
}

// Adresi servis üzerinden getirir; dönen: data: adresi. Aynı adres önbellekten, başarısızlar hemen reddedilir.
export function resimYukle(url) {
  if (onbellek[url]) return Promise.resolve(onbellek[url]);
  if (basarisiz[url]) return Promise.reject(new Error('Daha önce yüklenemedi'));
  if (surenler[url]) return surenler[url];
  surenler[url] = new Promise((coz, red) => {
    bekleyen.push({ url, coz, red });
    siradaki();
  });
  return surenler[url];
}

const gizle = (t) => {
  t.style.display = 'none';
};

// Belgede herhangi bir <img> yüklenemediğinde: önce servis yedeği, o da olmazsa resim gizlenir.
export function resimHatasi(t) {
  if (!t || String(t.tagName).toUpperCase() !== 'IMG') return;
  const src = t.getAttribute('src') || '';
  if (!/^https?:\/\//i.test(src) || t.getAttribute('data-r')) return gizle(t); // data: adresi de yüklenemedi ya da yedek denendi
  t.setAttribute('data-r', '1');
  if (!varlik()) return gizle(t); // masaüstü tarayıcı: servis yok
  resimYukle(src).then(
    (u) => {
      if (t.getAttribute('src') === src) t.setAttribute('src', u);
    },
    () => gizle(t)
  );
}

export function resimYedegiKur(belge) {
  // "error" olayı kabarmaz: yakalama aşamasında dinlenir
  belge.addEventListener('error', (e) => resimHatasi(e && e.target), true);
}
