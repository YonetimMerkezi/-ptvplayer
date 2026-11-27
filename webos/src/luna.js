// webOS servis köprüsü (webOSTV.js gerektirmez): luna://… çağrısı → Promise.
// Köprü yoksa (masaüstü tarayıcı) varlik() false döner.
import * as K from './log.js';
const Kopru = () => (typeof window !== 'undefined' ? window.WebOSServiceBridge || window.PalmServiceBridge : undefined);

export const varlik = () => !!Kopru();

export function luna(uri, params, zamanAsimiMs) {
  return new Promise((coz, red) => {
    const B = Kopru();
    if (!B) return red(new Error('webOS servis köprüsü yok'));
    let bitti = false;
    const t = setTimeout(() => {
      if (bitti) return;
      bitti = true;
      red(new Error('Servis yanıt vermedi'));
    }, zamanAsimiMs || 60000);
    const basla = Date.now();
    try {
      const b = new B();
      b.onservicecallback = (msg) => {
        if (bitti) return;
        bitti = true;
        clearTimeout(t);
        let r;
        const t0 = Date.now();
        try {
          r = JSON.parse(msg);
        } catch (e) {
          return red(new Error('Servis yanıtı okunamadı'));
        }
        // Büyük köprü iletileri TV'de arayüzü donduruyor: boyut ve çözme süresi kayda yazılır (teşhis)
        if (msg && msg.length > 60000) K.bilgi('Köprü iletisi: ' + Math.round(msg.length / 1024) + ' KB, çözme ' + (Date.now() - t0) + ' ms, gidiş-dönüş ' + (t0 - basla) + ' ms · ' + String(uri).split('/').pop());
        coz(r);
      };
      b.call(uri, JSON.stringify(params || {}));
    } catch (e) {
      bitti = true;
      clearTimeout(t);
      red(e);
    }
  });
}

export const SERVIS = 'luna://com.koruk.iptv.webos.service/';
