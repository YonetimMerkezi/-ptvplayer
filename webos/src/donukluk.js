// Arayüz donma ölçer: 100 ms'lik bir sayaç zamanında çalışamazsa ana iş parçacığı o kadar meşgul kalmıştır;
// bu sürede kumanda tuşları (Geri dahil) işlenemez. Uzun donmalar Hata kaydına yazılır, en uzunu Tuş testi ekranında görünür.
import * as K from './log.js';

const ARALIK = 100;
const ESIK = 600; // bu süreden uzun donmalar kayda geçer
let zamanlayici = 0;
let son = 0;
let enUzun = 0;
let sayi = 0;
let kim = () => '';

// JS yığın kullanımı (teşhis): yığın sınıra yakınsa çöp toplama her büyük ayırmada uzun donmalara yol açar
const bellek = () => {
  try {
    const m = typeof performance !== 'undefined' ? performance.memory : null;
    return m && m.usedJSHeapSize ? ' · bellek ' + Math.round(m.usedJSHeapSize / 1048576) + '/' + Math.round(m.jsHeapSizeLimit / 1048576) + ' MB' : '';
  } catch (e) {
    return '';
  }
};

export function baslat(ekranAdi, saat) {
  if (zamanlayici) return;
  if (ekranAdi) kim = ekranAdi;
  const simdi = saat || Date.now;
  son = simdi();
  zamanlayici = setInterval(() => {
    const s = simdi();
    const gec = s - son - ARALIK;
    son = s;
    if (gec > enUzun) enUzun = gec;
    if (gec >= ESIK) {
      sayi++;
      K.uyar('Arayüz ' + gec + ' ms yanıtsız kaldı (' + kim() + ')' + bellek());
    }
  }, ARALIK);
}

export function durdur() {
  clearInterval(zamanlayici);
  zamanlayici = 0;
}

export const durum = () => ({ enUzun, sayi });
export function sifirla() {
  enUzun = 0;
  sayi = 0;
}
