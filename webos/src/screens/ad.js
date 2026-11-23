// Ad girişi (klasör adı vb.): yazı alanı TV'nin ekran klavyesini açar; Enter ya da Kaydet ile tamamlanır.
import { ctx, ustCubuk, pop } from '../ctx.js';
import { el, esc, toast } from '../ui.js';

// p: { baslik, deger?, ipucu?, tamam(ad) }
export function adScreen(p) {
  const kok = el('div', 'screen search');
  const src = ctx.store.active();
  kok.innerHTML =
    ustCubuk(p.baslik, src ? esc(src.name) : '') +
    '<div class="s-in"><input id="q" type="text" maxlength="40" placeholder="Ad yazın" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><div class="f-btn" id="s-go">Kaydet</div></div>' +
    '<div class="s-st">' + esc(p.ipucu || 'Yazmak için OK’a basın; bitince Enter.') + '</div>' +
    '<div class="hint">OK: yaz / kaydet · Geri</div>';
  const inp = kok.querySelector('#q');
  if (p.deger) inp.value = String(p.deger);
  let bitti = false;

  const kaydet = () => {
    const ad = inp.value.replace(/\s+/g, ' ').trim();
    if (!ad) return toast('Bir ad yazın');
    if (bitti) return;
    bitti = true;
    p.tamam(ad);
    pop();
  };
  kok.querySelector('#s-go').addEventListener('click', kaydet);
  inp.addEventListener('click', () => inp.focus());

  return {
    el: kok,
    name: 'ad',
    onShow() {
      // Açılışta alan boşsa doğrudan yazmaya başlanır
      if (!inp.value) setTimeout(() => inp.focus(), 80);
    },
    onKey(a) {
      if (a === 'ok') {
        if (inp.value.trim()) kaydet();
        else inp.focus();
        return true;
      }
      return a === 'left' || a === 'right' || a === 'down';
    },
    // Yazı alanı odaktayken: Enter kaydeder, Geri klavyeyi kapatır
    onInputKey(a, e, alan) {
      if (a === 'ok') {
        alan.blur();
        kaydet();
        return true;
      }
      if (a === 'back') {
        alan.blur();
        return true;
      }
      return false;
    },
  };
}
