// Tema merkezi: renk temalarını gezip OK ile uygular; sağda seçilen temanın küçük önizlemesi görünür.
import { ctx, ustCubuk } from '../ctx.js';
import { VList } from '../vlist.js';
import { TEMALAR, VARSAYILAN_TEMA, temaUygula } from '../tema.js';
import { el, esc, px, toast } from '../ui.js';
import * as K from '../log.js';

const yuvarlak = (t) => (t.multi && t.p ? 'linear-gradient(135deg,' + t.p[1] + ',' + t.p[3] + ',' + t.p[4] + ',' + t.p[6] + ')' : t.accent);

// Seçilen temanın minik ana sayfa görüntüsü (gerçek renklerle)
function onizleme(t) {
  const karo = (i, ad) => {
    const p = t.multi && t.p ? t.p[i] : t.accent;
    const arka = t.multi ? (t.dolu ? p : t.surface) : t.surface;
    const yazi = t.multi && t.dolu ? t.ink : p;
    return '<div class="tm-k" style="background:' + arka + ';color:' + yazi + '">' + ad + '</div>';
  };
  return (
    '<div class="tm-pv" style="background:' + (t.zemin || t.bg) + ';border-color:' + t.line + '">' +
    '<div class="tm-t">Iptv Player Pro</div>' +
    '<div class="tm-ks">' + karo(1, 'Canlı TV') + karo(2, 'Filmler') + karo(3, 'Diziler') + '</div>' +
    '<div class="tm-s" style="background:' + t.accent + ';color:' + t.ink + '">Seçili satır</div>' +
    '<div class="tm-s" style="background:' + t.raised + '">Diğer satır</div>' +
    '<div class="tm-s" style="background:' + t.surface + '">Kutu</div></div>'
  );
}

export function temaScreen() {
  const kok = el('div', 'screen lst');
  const src = ctx.store.active();
  kok.innerHTML = ustCubuk('Tema merkezi', src ? esc(src.name) : '') + '<div class="l-body"><div class="l-list"></div><div class="l-panel"></div></div><div class="hint">▲▼ gezin · OK: temayı uygula · Geri</div>';
  const panel = kok.querySelector('.l-panel');
  const secili = () => ctx.store.setting('theme', VARSAYILAN_TEMA);
  let mesgul = false;

  const list = new VList(kok.querySelector('.l-list'), {
    rowH: Math.round(px() * 3.8),
    render: (t) => '<span class="sw" style="background:' + yuvarlak(t) + '"></span><span class="nm">' + esc(t.ad) + '</span><span class="rk">' + (t.id === secili() ? '● seçili' : t.multi ? 'çok renkli' : '') + '</span>',
    onFocus: (t) => {
      panel.innerHTML = '<div class="pn-t">' + esc(t.ad) + '</div>' + onizleme(t);
    },
    onActivate: async (t) => {
      if (mesgul) return;
      mesgul = true;
      try {
        await temaUygula(t.id);
        ctx.store.setSetting('theme', t.id);
        toast('Tema uygulandı: ' + t.ad);
        list.setItems(TEMALAR, true);
      } catch (e) {
        K.hata(e);
        toast('Tema uygulanamadı: ' + (e && e.message ? e.message : e), 4000);
      } finally {
        mesgul = false;
      }
    },
  });
  list.setActive(true);
  list.setItems(TEMALAR);
  const k = TEMALAR.map((t) => t.id).indexOf(secili());
  if (k > 0) list.setIndex(k);

  return {
    el: kok,
    name: 'tema',
    onShow() {
      list.setItems(TEMALAR, true);
    },
    onKey: (a) => list.key(a),
  };
}
