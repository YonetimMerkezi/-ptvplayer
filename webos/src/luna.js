// webOS servis köprüsü (webOSTV.js gerektirmez): luna://… çağrısı → Promise.
// Köprü yoksa (masaüstü tarayıcı) varlik() false döner.
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
    try {
      const b = new B();
      b.onservicecallback = (msg) => {
        if (bitti) return;
        bitti = true;
        clearTimeout(t);
        let r;
        try {
          r = JSON.parse(msg);
        } catch (e) {
          return red(new Error('Servis yanıtı okunamadı'));
        }
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
