// Ana sayfa: büyük karolar; kumanda okları ızgarada gezer.
import { ctx, open, ikon, ustCubuk } from '../ctx.js';
import { el, esc, enYakin } from '../ui.js';

const KAROLAR = [
  { id: 'live', ad: 'Canlı TV', ic: ikon.tv, ekran: ['browse', { kind: 'live' }] },
  { id: 'guide', ad: 'TV Rehberi', ic: ikon.rehber, ekran: ['browse', { kind: 'guide' }] },
  { id: 'movie', ad: 'Filmler', ic: ikon.film, ekran: ['browse', { kind: 'movie' }] },
  { id: 'series', ad: 'Diziler', ic: ikon.dizi, ekran: ['browse', { kind: 'series' }] },
  { id: 'favs', ad: 'Favoriler', ic: ikon.yildiz, ekran: ['browse', { kind: 'favs' }] },
  { id: 'recents', ad: 'Son izlenenler', ic: ikon.gecmis, ekran: ['browse', { kind: 'recents' }] },
  { id: 'search', ad: 'Ara', ic: ikon.ara, ekran: ['search'] },
  { id: 'settings', ad: 'Ayarlar', ic: ikon.ayar, ekran: ['settings'] },
];
const SUTUN = 5;

export function homeScreen() {
  const kok = el('div', 'screen home');
  const src = ctx.store.active();
  kok.innerHTML =
    ustCubuk('Iptv Player Pro', src ? esc(src.name) : '', true) +
    '<div class="tiles">' +
    KAROLAR.map((k, i) => '<div class="tile" data-i="' + i + '"><i class="ic">' + k.ic + '</i><span>' + k.ad + '</span></div>').join('') +
    '</div><div class="hint">Gezin: ▲▼◀▶ · Seç: OK · Çıkış: Geri ×2</div>';
  let sec = 0;
  const dugumler = kok.querySelectorAll('.tile');
  const isaretle = () => {
    for (let i = 0; i < dugumler.length; i++) dugumler[i].className = 'tile' + (i === sec ? ' on' : '');
  };
  const ac = (i) => {
    const k = KAROLAR[i];
    open(k.ekran[0], k.ekran[1]);
  };
  kok.addEventListener('click', (e) => {
    const n = enYakin(e.target, '.tile', kok);
    if (n) {
      sec = Number(n.getAttribute('data-i'));
      isaretle();
      ac(sec);
    }
  });
  return {
    el: kok,
    name: 'home',
    onShow: isaretle,
    onKey(a) {
      let i = sec;
      if (a === 'right') i = sec + 1;
      else if (a === 'left') i = sec - 1;
      else if (a === 'down') i = sec + SUTUN;
      else if (a === 'up') i = sec - SUTUN;
      else if (a === 'ok') {
        ac(sec);
        return true;
      } else return false;
      if (i >= 0 && i < KAROLAR.length) {
        sec = i;
        isaretle();
      } else if (a === 'down' && sec < KAROLAR.length - 1) {
        sec = KAROLAR.length - 1;
        isaretle();
      }
      return true;
    },
  };
}
