// Kumanda tuşları: kırmızı / yeşil / sarı / mavi tuşa oynatıcıda ve ana sayfada yapılacak eylem atanır.
import { ctx, ustCubuk } from '../ctx.js';
import { VList } from '../vlist.js';
import { RENKLER, atamalar, eylemAdi, degistir } from '../kumanda.js';
import { el, esc, px } from '../ui.js';

const HEDEFLER = [
  ['oyn', 'Oynatıcıda'],
  ['ana', 'Ana sayfada'],
];
const YARDIM = {
  oyn: 'Bir kanal ya da film açıkken bu renkli tuşa basınca yapılacak eylem.',
  ana: 'Ana sayfadayken bu renkli tuşa basınca açılacak ekran. Diğer sayfalarda renkli tuşlar kendi işini yapar (örn. listelerde Sarı: favori, Mavi: ara).',
};

export function kumandaScreen() {
  const kok = el('div', 'screen lst');
  const src = ctx.store.active();
  kok.innerHTML = ustCubuk('Kumanda tuşları', src ? esc(src.name) : '') + '<div class="l-body"><div class="l-list"></div><div class="l-panel"></div></div><div class="hint">▲▼ gezin · ◀▶ eylemi değiştir · OK: sonraki eylem · Geri</div>';
  const panel = kok.querySelector('.l-panel');
  const satirlar = [];
  for (let h = 0; h < HEDEFLER.length; h++) for (let r = 0; r < RENKLER.length; r++) satirlar.push({ hedef: HEDEFLER[h][0], hedefAd: HEDEFLER[h][1], renk: RENKLER[r][0], renkAd: RENKLER[r][1] });

  const list = new VList(kok.querySelector('.l-list'), {
    rowH: Math.round(px() * 3.8),
    render: (r) => '<span class="nm"><i class="kd d-' + r.renk + '"></i>' + esc(r.hedefAd) + ' · ' + esc(r.renkAd) + '</span><span class="rk">' + esc(eylemAdi(r.hedef, atamalar(ctx.store, r.hedef)[r.renk])) + '</span>',
    onFocus: (r) => {
      panel.innerHTML = '<div class="pn-t">' + esc(r.hedefAd) + ' ' + esc(r.renkAd) + ' tuş</div><div class="pn-d">' + esc(YARDIM[r.hedef]) + '</div>';
    },
    onActivate: (r) => {
      degistir(ctx.store, r.hedef, r.renk, 1);
      list.redraw(list.index);
    },
  });
  list.setActive(true);
  list.setItems(satirlar);

  return {
    el: kok,
    name: 'kumanda',
    onKey(a) {
      if (a === 'left' || a === 'right') {
        const r = list.cur;
        if (r) {
          degistir(ctx.store, r.hedef, r.renk, a === 'right' ? 1 : -1);
          list.redraw(list.index);
        }
        return true;
      }
      return list.key(a);
    },
  };
}
