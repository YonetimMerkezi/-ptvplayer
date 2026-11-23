// Fragmanı telefonda izle: ekranda QR kod gösterilir, telefonun kamerasıyla okutulunca YouTube bağlantısı telefonda açılır.
// Her TV'de çalışır (TV'nin YouTube uygulamasına ya da tarayıcısına bağlı değildir).
import { pop, ustCubuk } from '../ctx.js';
import { el, esc } from '../ui.js';
import { qrSvg } from '../qr.js';

// p: { url, ad }
export function fragmanQrScreen(p) {
  const kok = el('div', 'screen qr');
  let svg = '';
  let hata = '';
  try {
    svg = qrSvg(p.url, 0);
  } catch (e) {
    hata = String(e && e.message ? e.message : e);
  }
  kok.innerHTML =
    ustCubuk('Fragmanı telefonda izle', esc(p.ad || '')) +
    '<div class="qr-w"><div class="qr-k">' + (svg || '<div class="qr-h">' + esc(hata) + '</div>') + '</div>' +
    '<div class="qr-t"><h2>Telefonunuzla okutun</h2>' +
    '<p>Telefonun kamerasını QR koda tutun ve çıkan bağlantıya dokunun; fragman telefonda açılır.</p>' +
    '<p class="qr-u">' + esc(p.url) + '</p></div></div>' +
    '<div class="hint">OK ya da Geri: kapat</div>';
  return {
    el: kok,
    name: 'fragmanqr',
    onKey(a) {
      if (a === 'ok' || a === 'back') {
        pop();
        return true;
      }
      return false;
    },
  };
}
