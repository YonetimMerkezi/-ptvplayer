// Tuş testi: TV'nin gönderdiği her tuş olayı (keydown / keyup / keypress, kod, ad) canlı listelenir.
// Geri tuşu bu ekranda geri gitmez: yalnız algılandığı gösterilir; çıkmak için ▲ ile "‹ Geri" düğmesine çıkıp OK'a basın.
import { ustCubuk } from '../ctx.js';
import { el, esc } from '../ui.js';
import { actionOfEvent } from '../keys.js';
import { durum as donukluk } from '../donukluk.js';

export function tusTestiScreen() {
  const kok = el('div', 'screen tt');
  kok.innerHTML =
    ustCubuk('Tuş testi', '') +
    '<div class="tt-b"><div class="tt-n">Kumandada bir tuşa basın; TV’nin uygulamaya gönderdiği olaylar aşağıda görünür. Geri tuşuna basıp “back” satırı çıkıyor mu bakın.</div><div class="tt-n" id="tt-d"></div><div class="tt-l" id="tt-l"></div></div>' +
    '<div class="hint">Çıkmak için ▲ ile Geri düğmesine çıkıp OK</div>';
  const liste = kok.querySelector('#tt-l');
  const donma = kok.querySelector('#tt-d');
  let donmaT = 0;
  const donmaYaz = () => {
    const d = donukluk();
    donma.innerHTML = 'Arayüz yanıtsızlığı: en uzun <b>' + d.enUzun + ' ms</b> · 0,6 sn’den uzun <b>' + d.sayi + '</b> kez (yükleme sırasında tuşlar işlenmiyorsa burada görünür)';
  };
  const satirlar = [];
  let sayac = 0;
  const yaz = (tur, e) => {
    const a = actionOfEvent(e);
    const ad = String(e.key || e.keyIdentifier || e.code || '');
    sayac++;
    satirlar.unshift('<div class="tt-r' + (a === 'back' ? ' geri' : '') + '"><b>' + sayac + '</b> ' + tur + ' · kod ' + esc(String(e.keyCode)) + (ad ? ' · “' + esc(ad) + '”' : '') + ' → ' + (a ? esc(a) : 'tanımsız') + '</div>');
    if (satirlar.length > 12) satirlar.length = 12;
    liste.innerHTML = satirlar.join('');
  };
  const dinleyici = (tur) => (e) => yaz(tur, e);
  const kd = dinleyici('keydown');
  const ku = dinleyici('keyup');
  const kp = dinleyici('keypress');
  return {
    el: kok,
    name: 'tustesti',
    onShow() {
      donmaYaz();
      donmaT = setInterval(donmaYaz, 1000);
      document.addEventListener('keydown', kd, true);
      document.addEventListener('keyup', ku, true);
      document.addEventListener('keypress', kp, true);
    },
    onHide() {
      clearInterval(donmaT);
      document.removeEventListener('keydown', kd, true);
      document.removeEventListener('keyup', ku, true);
      document.removeEventListener('keypress', kp, true);
    },
    destroy() {
      clearInterval(donmaT);
      document.removeEventListener('keydown', kd, true);
      document.removeEventListener('keyup', ku, true);
      document.removeEventListener('keypress', kp, true);
    },
    onKey(a) {
      // Yön tuşları ile OK dışındaki her şey (Geri dahil) yalnız gösterilir; ▲ üst Geri düğmesine çıkar
      return a !== 'up' && a !== 'ok';
    },
  };
}
