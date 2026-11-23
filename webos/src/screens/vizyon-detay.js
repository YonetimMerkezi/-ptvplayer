// Vizyondaki bir film: afiş, adı/tarihi, fragman ve "listemde ara" düğmeleri.
import { ctx, open, ustCubuk } from '../ctx.js';
import { el, esc, toast } from '../ui.js';
import { fragmanOynat } from '../fragman.js';
import { tarihYaz } from './home.js';

export function vizyonDetayScreen(p) {
  const film = (p && p.film) || { title: '' };
  const kok = el('div', 'screen vd');
  const tarih = tarihYaz(film);
  const duzgun = /^https:\/\//.test(film.poster || '');
  kok.innerHTML =
    ustCubuk('Vizyondakiler', '') +
    '<div class="vd-p"><div class="pr-ph">' + esc(String(film.title || '').charAt(0)) + '</div>' + (duzgun ? '<img class="vd-im" alt="">' : '') + '</div>' +
    '<div class="vd-i"><h2>' + esc(film.title) + '</h2><div class="vd-m">' + (tarih ? 'Vizyon: ' + esc(tarih) : '') + '</div><div class="vd-b"></div>' +
    '<div class="vd-n">Fragman Ayarlar › Fragman testinde seçtiğiniz yolla açılır; “telefonda izle” QR kod gösterir. “Listemde ara” kaynağınızdaki filmlerde bu adı arar.</div></div>' +
    '<div class="hint">▲▼ gezin · OK seç · Kırmızı: fragman · Geri</div>';
  const im = kok.querySelector('.vd-im');
  if (im) {
    im.onload = () => {
      kok.querySelector('.vd-p').className = 'vd-p ok';
    };
    im.src = film.poster;
  }
  const dugmeler = [
    { id: 'trailer', ad: '▶ Fragman' },
    { id: 'trailerqr', ad: 'Fragman: telefonda izle (QR)' },
    { id: 'ara', ad: 'Listemde ara' },
  ];
  const kap = kok.querySelector('.vd-b');
  kap.innerHTML = dugmeler.map((b, i) => '<div class="f-btn" data-i="' + i + '">' + b.ad + '</div>').join('');
  const dom = kap.querySelectorAll('.f-btn');
  let sec = 0;
  const isaretle = () => {
    for (let i = 0; i < dom.length; i++) dom[i].className = 'f-btn' + (i === sec ? ' on' : '');
  };
  const calistir = (id) => {
    if (id === 'trailer') fragmanOynat({ name: film.title, year: film.year }, null, { net: ctx.net, bildir: (t) => toast(t, 3500) });
    else if (id === 'trailerqr') fragmanOynat({ name: film.title, year: film.year }, null, { net: ctx.net, bildir: (t) => toast(t, 3500), yol: 'qr' });
    else open('search', { q: film.title });
  };
  kok.addEventListener('click', (e) => {
    let n = e.target;
    while (n && n !== kok && !(n.getAttribute && n.getAttribute('data-i') !== null && n.className && n.className.indexOf('f-btn') >= 0)) n = n.parentNode;
    if (!n || n === kok) return;
    sec = Number(n.getAttribute('data-i'));
    isaretle();
    calistir(dugmeler[sec].id);
  });
  return {
    el: kok,
    name: 'vizyon',
    onShow: isaretle,
    onKey(a) {
      if (a === 'ok') {
        calistir(dugmeler[sec].id);
        return true;
      }
      if (a === 'red') {
        calistir('trailer');
        return true;
      }
      if (a === 'down') {
        if (sec < dugmeler.length - 1) {
          sec++;
          isaretle();
        }
        return true;
      }
      if (a === 'up' && sec > 0) {
        sec--;
        isaretle();
        return true;
      }
      return a === 'left' || a === 'right'; // ▲ ilk düğmede Geri düğmesine çıkar
    },
  };
}
