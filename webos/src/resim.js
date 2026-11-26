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
const BELLEK_BUTCESI = 10 * 1024 * 1024; // data: adreslerinin toplam uzunluğu (karakter): TV belleğini şişirmesin
const EN_FAZLA_EZAMANLI = 4;
const onbellek = {}; // adres → data: adresi
const sira = []; // onbellek anahtarları, eskiden yeniye
let bellekte = 0;
const basarisiz = {}; // adres → true (aynı adres yeniden denenmez)
const bekleyen = []; // { url, coz, red, hedefler } — en yeni istek (ekranda görünen) önce işlenir
const surenler = {}; // adres → Promise (aynı adres için tek istek)
const isler = {}; // adres → bekleyen/süren iş (aynı adrese bakan <img>'ler hedefler listesinde toplanır)
let calisan = 0;

// <img> hâlâ belgede mi? (kategori değişince çizilen afişler kalkar; onlar için servis çağrısı yapılmaz)
const baglimi = (el) => {
  const d = el && el.ownerDocument;
  return !d || !d.documentElement || d.documentElement.contains(el);
};

const hostOf = (u) => {
  const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(String(u));
  return m ? m[1].toLowerCase() : '';
};

function bellegeAl(url, u) {
  onbellek[url] = u;
  bellekte += u.length;
  sira.push(url);
  while (sira.length > 1 && (sira.length > EN_FAZLA_ONBELLEK || bellekte > BELLEK_BUTCESI)) {
    const eski = sira.shift();
    bellekte -= onbellek[eski].length;
    delete onbellek[eski];
  }
}

function siradaki() {
  while (calisan < EN_FAZLA_EZAMANLI && bekleyen.length) {
    const is = bekleyen.pop();
    // Bekleme sırasında bütün <img>'leri belgeden kalktıysa (başka kategoriye geçildi) servise gitmeden bırakılır; başarısız sayılmaz
    if (is.hedefler.length && is.hedefler.every((h) => !baglimi(h))) {
      delete surenler[is.url];
      delete isler[is.url];
      is.red(new Error('Vazgeçildi'));
      continue;
    }
    calisan++;
    ayar
      .cagir(is.url)
      .then((r) => {
        const u = 'data:' + r.mime + ';base64,' + r.data;
        bellegeAl(is.url, u);
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
        delete isler[is.url];
        siradaki();
      });
  }
}

// Adresi servis üzerinden getirir; dönen: data: adresi. Aynı adres önbellekten, başarısızlar hemen reddedilir.
// hedef: adresi isteyen <img> (varsa); belgeden kalkmış öğeler için bekleyen istek bırakılır.
export function resimYukle(url, hedef) {
  if (onbellek[url]) return Promise.resolve(onbellek[url]);
  if (basarisiz[url]) return Promise.reject(new Error('Daha önce yüklenemedi'));
  if (surenler[url]) {
    if (hedef && isler[url]) isler[url].hedefler.push(hedef);
    return surenler[url];
  }
  surenler[url] = new Promise((coz, red) => {
    const is = { url, coz, red, hedefler: hedef ? [hedef] : [] };
    isler[url] = is;
    bekleyen.push(is);
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
  resimYukle(src, t).then(
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
