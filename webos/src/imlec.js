// Telefondaki fare alanı: TV ekranında sanal bir imleç gezdirir. Dokunma imlecin altındaki öğeye tıklar, iki parmakla kaydırma ▲/▼ tuşu olur.
// Magic Remote'u olmayan TV'de de ekranın her yerine ◀▶▲▼ ile adım adım gitmeden ulaşılabilsin diye. İmleç kullanılmayınca kendiliğinden gizlenir.
const GIZLE_MS = 5000;
const KAYDIRMA_ADIM = 30; // bu kadar kaydırma birimi bir ▲/▼ tuşu sayılır
const EN_COK_ADIM = 8; // tek komutta en çok bu kadar tuş
const SVG = '<svg viewBox="0 0 24 24"><path d="M3 2l17 9-7.5 1.8L9 20z" fill="#fff" stroke="#04141a" stroke-width="1.6" stroke-linejoin="round"/></svg>';

// tus: (ad) => tuş olayı üretir ('up' | 'down'); doc/win/bekle/iptal test için verilebilir
export function imlecKur({ doc = document, win = window, bekle = setTimeout, iptal = clearTimeout, tus = () => false } = {}) {
  let dugum = null;
  let x = 0;
  let y = 0;
  let zaman = 0;
  let birikim = 0;
  const gen = () => win.innerWidth || 1920;
  const yuk = () => win.innerHeight || 1080;
  const yaz = () => {
    const t = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    dugum.style.webkitTransform = t;
    dugum.style.transform = t;
  };
  const gizle = () => {
    if (dugum) dugum.style.display = 'none';
  };
  const goster = () => {
    if (!dugum) {
      dugum = doc.createElement('div');
      dugum.className = 'sanal-imlec';
      dugum.innerHTML = SVG;
      doc.body.appendChild(dugum);
      x = gen() / 2;
      y = yuk() / 2;
    }
    dugum.style.display = 'block';
    yaz();
    iptal(zaman);
    zaman = bekle(gizle, GIZLE_MS);
  };
  const olay = (tur, hedef) => {
    const e = doc.createEvent('MouseEvents');
    e.initMouseEvent(tur, true, true, win, 1, x, y, x, y, false, false, false, false, 0, null);
    hedef.dispatchEvent(e);
  };
  const altindaki = () => doc.elementFromPoint(Math.round(x), Math.round(y)); // imleç pointer-events:none: hedef olamaz

  return {
    // dx, dy: TV pikseli. Dönen: imleç konumu
    hareket(dx, dy) {
      goster();
      x = Math.max(0, Math.min(gen() - 1, x + (Number(dx) || 0)));
      y = Math.max(0, Math.min(yuk() - 1, y + (Number(dy) || 0)));
      yaz();
      const h = altindaki();
      if (h) olay('mousemove', h); // oynatıcıdaki gibi fareyle açılan çubuklar için
      return { x, y };
    },
    // İmlecin altındaki öğeye tıklar; yazı alanına tıklanırsa odak verir (TV klavyesi açılır). Dönen: hedef bulundu mu
    tikla() {
      goster();
      const h = altindaki();
      if (!h) return false;
      ['mousedown', 'mouseup', 'click'].forEach((t) => olay(t, h));
      if ((h.tagName === 'INPUT' || h.tagName === 'TEXTAREA') && h.focus) h.focus();
      return true;
    },
    // n > 0 (parmak aşağı) listeyi yukarı, n < 0 aşağı götürür (telefondaki doğal kaydırma). Dönen: basılan tuş sayısı
    kaydir(n) {
      goster();
      birikim += Number(n) || 0;
      const adim = Math.trunc ? Math.trunc(birikim / KAYDIRMA_ADIM) : (birikim / KAYDIRMA_ADIM) | 0;
      birikim -= adim * KAYDIRMA_ADIM;
      const say = Math.min(Math.abs(adim), EN_COK_ADIM);
      for (let i = 0; i < say; i++) tus(adim > 0 ? 'up' : 'down');
      return say;
    },
    gizle,
    konum: () => ({ x, y }),
  };
}
