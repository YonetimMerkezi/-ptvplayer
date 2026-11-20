// Ana iş parçacığı tarafı: büyük yanıtların ayrıştırılıp eşlenmesi arka plan işçisine verilir.
// İşçi kurulamazsa, yanıt vermezse ya da hata verirse çağıran eski yola (ana iş parçacığında ayrıştırma) döner.
import * as K from './log.js';

const BOYUT_ESIGI = 60000; // bundan küçük yanıtlar (kanal kategorileri gibi) işçiye gitmeden doğrudan ayrıştırılır
const ZAMAN_ASIMI_MS = 40000;
let isci = null;
let kapali = false; // işçi çalışmadıysa bir daha denenmez
let no = 0;
const bekleyen = {};

function hepsiniReddet(neden) {
  for (const k in bekleyen) {
    const b = bekleyen[k];
    clearTimeout(b.t);
    delete bekleyen[k];
    b.red(new Error(neden));
  }
}

function kapat(neden) {
  if (!kapali) K.uyar('Arka plan işçisi kapatıldı: ' + neden + ' (ayrıştırma ana iş parçacığında yapılacak)');
  kapali = true;
  try {
    if (isci) isci.terminate();
  } catch (e) {
    /* işçi zaten kapalı */
  }
  isci = null;
  hepsiniReddet(neden);
}

function kur() {
  if (isci || kapali) return;
  if (typeof Worker === 'undefined') return void (kapali = true);
  try {
    isci = new Worker('js/isci.js');
  } catch (e) {
    return kapat((e && e.message) || 'Worker kurulamadı');
  }
  isci.onmessage = (e) => {
    const m = e.data || {};
    const b = bekleyen[m.id];
    if (!b) return;
    clearTimeout(b.t);
    delete bekleyen[m.id];
    if (m.ok) b.coz(m.liste);
    else b.red(new Error(m.hata || 'Ayrıştırılamadı'));
  };
  isci.onerror = (e) => kapat((e && e.message) || 'işçi hatası');
}

export const isciKullanilir = (metin) => !kapali && typeof Worker !== 'undefined' && String(metin).length >= BOYUT_ESIGI;

// Ham JSON metnini işçide ayrıştırıp eşler. Hata/zaman aşımında reddeder (çağıran yedek yola geçer).
export function esle(metin, tur, kategoriler) {
  return new Promise((coz, red) => {
    kur();
    if (!isci) return red(new Error('işçi yok'));
    const id = ++no;
    const t = setTimeout(() => {
      delete bekleyen[id];
      red(new Error('işçi zamanında yanıt vermedi'));
      kapat('zaman aşımı');
    }, ZAMAN_ASIMI_MS);
    bekleyen[id] = { coz, red, t };
    try {
      isci.postMessage({ id, metin, tur, kategoriler });
    } catch (e) {
      clearTimeout(t);
      delete bekleyen[id];
      red(e);
    }
  });
}

// Testler için
export function sifirla() {
  kapat('sıfırlandı');
  kapali = false;
  no = 0;
}
