// Açılır seçenek menüsü (kumanda ile): başlık + satırlar; ▲▼ gezer, OK çalıştırır, Geri kapatır/bir üst menüye döner.
// Arka plan yarı saydamdır (arkadaki ekran seçilir kalır). Satır: { ad, sag?, calis() }.
//   calis() dönüşü: undefined → menü kapanır · 'kal' → açık kalır, satırlar yeniden çizilir · { baslik, satirlar } → alt menü açılır (Geri ile dönülür)
import { el, esc, px } from './ui.js';

// Ekrana sığan satır sayısı: büyük yazı boyutunda azalır (liste kayarak gezilir)
const gorunen = () => {
  const n = Math.floor(((typeof innerHeight === 'number' ? innerHeight : 0) / px() - 20) / 3.6);
  return n > 0 ? Math.max(4, Math.min(9, n)) : 9;
};

export function createMenu(host) {
  const kok = el('div', 'mn');
  host.appendChild(kok);
  let yigin = []; // açık menüler (sonuncusu görünen)
  let ust = 0;

  const simdi = () => yigin[yigin.length - 1] || null;
  const satirlar = (m) => (typeof m.satirlar === 'function' ? m.satirlar() : m.satirlar);

  function ciz() {
    const m = simdi();
    if (!m) {
      kok.className = 'mn';
      return;
    }
    const l = satirlar(m);
    m.idx = Math.max(0, Math.min(l.length - 1, m.idx || 0));
    if (m.idx < ust) ust = m.idx;
    const G = gorunen();
    if (m.idx >= ust + G) ust = m.idx - G + 1;
    ust = Math.max(0, Math.min(Math.max(0, l.length - G), ust));
    let h = '<div class="mn-t">' + esc(m.baslik) + '</div>';
    for (let i = ust; i < Math.min(l.length, ust + G); i++) {
      h += '<div class="mn-r' + (i === m.idx ? ' on' : '') + '"><span>' + esc(l[i].ad) + '</span>' + (l[i].sag ? '<b>' + esc(l[i].sag) + '</b>' : '') + '</div>';
    }
    if (l.length > G) h += '<div class="mn-n">' + (m.idx + 1) + ' / ' + l.length + '</div>';
    if (m.not) h += '<div class="mn-n">' + esc(m.not) + '</div>';
    kok.innerHTML = h;
    kok.className = 'mn on';
  }

  return {
    get acik() {
      return yigin.length > 0;
    },
    ac(m) {
      yigin = [m];
      ust = 0;
      ciz();
    },
    kapat() {
      yigin = [];
      ciz();
    },
    // Menü açıkken tüm tuşları o alır
    key(a) {
      const m = simdi();
      if (!m) return false;
      const l = satirlar(m);
      if (a === 'up') m.idx = Math.max(0, (m.idx || 0) - 1);
      else if (a === 'down') m.idx = Math.min(l.length - 1, (m.idx || 0) + 1);
      else if (a === 'back') {
        if (yigin.length > 1) yigin.pop();
        else yigin = [];
        ust = 0;
      } else if (a === 'ok') {
        const r = l[m.idx || 0];
        if (!r) return true;
        const s = r.calis ? r.calis() : undefined;
        if (s === 'kal') {
          /* aynı menü yeniden çizilir */
        } else if (s && typeof s === 'object') {
          yigin.push(s);
          ust = 0;
        } else yigin = [];
      }
      ciz();
      return true;
    },
  };
}
