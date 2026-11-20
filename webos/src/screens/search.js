// Arama: yazı alanı TV'nin ekran klavyesini açar; Enter ile katalogda aranır.
import { ctx, provider, open, ustCubuk, geriOdakla } from '../ctx.js';
import { VList } from '../vlist.js';
import { ara } from '../data.js';
import { el, esc, px, toast } from '../ui.js';
import * as K from '../log.js';

const TUR = { live: 'Canlı', movie: 'Film', series: 'Dizi' };
const SIRA = { live: 'Canlı TV', movie: 'Filmler', series: 'Diziler' };

export function searchScreen(p) {
  const kok = el('div', 'screen search');
  const src = ctx.store.active();
  kok.innerHTML =
    ustCubuk('Ara', src ? esc(src.name) : '') +
    '<div class="s-in"><input id="q" type="text" placeholder="Kanal, film ya da dizi adı" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><div class="f-btn" id="s-go">Ara</div></div>' +
    '<div class="s-st" id="s-st">Yazmak için OK’a basın.</div>' +
    '<div class="s-res"></div><div class="hint" id="hint">OK: yaz / aç · ▲▼ gezin · Geri</div>';
  const inp = kok.querySelector('#q');
  const st = kok.querySelector('#s-st');
  const resEl = kok.querySelector('.s-res');
  let bolge = 'input'; // input | list
  let sayac = 0;
  let list = null;
  let otomatik = !!(p && p.q); // başka ekrandan hazır sorguyla açıldıysa ilk gösterimde aranır
  if (otomatik) inp.value = String(p.q);

  const kur = () => {
    list = new VList(resEl, {
      rowH: Math.round(px() * 3.6),
      render: (it) => '<span class="nm">' + esc(it.name) + '</span><span class="rk">' + TUR[it.kind] + '</span>',
      empty: 'Sonuç yok',
      onActivate: (it) => {
        if (it.kind === 'live') {
          const tum = list.items.filter((x) => x.kind === 'live');
          open('player', { list: tum, index: Math.max(0, tum.indexOf(it)) });
        } else open('detail', { item: it });
      },
    });
  };
  kur();

  async function calistir() {
    const q = inp.value.trim();
    if (!q) return toast('Aranacak bir şey yazın');
    const n = ++sayac;
    if (!provider()) return;
    list.setMessage('Aranıyor…');
    st.textContent = '“' + q + '” aranıyor…';
    try {
      const r = await ara(
        provider(),
        q,
        300,
        (tur) => {
          if (n === sayac) st.textContent = SIRA[tur] + ' taranıyor… (ilk aramada katalog indirilir, uzun sürebilir)';
        },
      );
      if (n !== sayac) return;
      list.setItems(r);
      st.textContent = r.length ? r.length + ' sonuç' + (r.length >= 300 ? ' (ilk 300)' : '') : '“' + q + '” için sonuç yok';
      if (r.length) odak('list');
    } catch (e) {
      if (n !== sayac) return;
      K.hata(e);
      list.setMessage('Arama başarısız');
      st.textContent = 'Arama başarısız: ' + (e && e.message ? e.message : e);
    }
  }

  function odak(b) {
    bolge = b;
    list.setActive(b === 'list');
    inp.parentNode.className = 's-in' + (b === 'input' ? ' on2' : '');
  }
  kok.querySelector('#s-go').addEventListener('click', calistir);
  inp.addEventListener('click', () => inp.focus());

  return {
    el: kok,
    name: 'search',
    onShow() {
      odak(bolge);
      if (otomatik) {
        otomatik = false;
        calistir();
      }
      if (list.items.length) list.setItems(list.items, true);
    },
    onKey(a) {
      if (bolge === 'input') {
        if (a === 'ok') {
          inp.focus();
          return true;
        }
        if (a === 'down' && list.items.length) {
          odak('list');
          return true;
        }
        return a === 'left' || a === 'right'; // ▲ ayrılır: Geri düğmesine çıkılır
      }
      if (a === 'up' && list.index === 0) {
        odak('input');
        return true;
      }
      return list.key(a);
    },
    onInputKey(a, e, giris) {
      if (a === 'ok') {
        giris.blur();
        calistir();
        return true;
      }
      if (a === 'back' || a === 'down') {
        giris.blur();
        return true;
      }
      if (a === 'up') {
        giris.blur();
        geriOdakla(true);
        return true;
      }
      return false;
    },
    destroy() {
      sayac++;
    },
  };
}
