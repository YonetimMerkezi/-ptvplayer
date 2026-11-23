// Fragman testi: YouTube uygulamasını farklı contentTarget biçimleriyle bir deneme videosuyla açar.
// Videoyu açan biçim seçilir ve kırmızı tuşla fragman açılırken kullanılır (TV sürümüne göre biçim değişir).
import { ctx, ustCubuk } from '../ctx.js';
import { VList } from '../vlist.js';
import { BICIMLER, VARSAYILAN_BICIM, TEST_VIDEO, youtubeAc, sonDeneme } from '../fragman.js';
import { el, esc, px, toast } from '../ui.js';
import * as K from '../log.js';

export function fragmanTestiScreen() {
  const kok = el('div', 'screen lst');
  const src = ctx.store.active();
  kok.innerHTML =
    ustCubuk('Fragman testi', src ? esc(src.name) : '') +
    '<div class="l-body"><div class="l-list"></div><div class="l-panel"></div></div>' +
    '<div class="hint">▲▼ gezin · OK: bu biçimle YouTube’u dene ve seç · Geri</div>';
  const panel = kok.querySelector('.l-panel');
  const secili = () => ctx.store.setting('ytBicim', VARSAYILAN_BICIM);
  const kapat = () => ctx.store.setting('ytKapat', true);
  let mesgul = false;
  const satirlar = () => BICIMLER.map((b) => ({ id: b[0], ad: b[1], tur: 'bicim' })).concat([{ id: 'kapat', ad: 'Açmadan önce YouTube’u kapat', tur: 'kapat' }]);

  // Sağ panel: seçili satırın açıklaması ve (varsa) son denemede TV'nin verdiği ham yanıtlar
  const panelYaz = (r) => {
    const t = sonDeneme();
    panel.innerHTML =
      '<div class="pn-t">' + esc(r.ad) + '</div><div class="pn-d">' +
      (r.tur === 'kapat'
        ? 'Açık: YouTube arka planda açıksa önce kapatılır, böylece video parametresi kaçmaz. OK ile aç/kapat.'
        : 'OK: YouTube bir deneme videosuyla açılır. Video oynuyorsa bu biçim doğrudur ve seçili kalır. Ana sayfa açılırsa uygulamaya dönüp başka biçimi deneyin.') +
      '</div>' +
      (t ? '<div class="pn-d sm">Son deneme (' + esc(t.bicim) + '):<br>' + t.adimlar.map(esc).join('<br>') + (t.hata ? '<br>Hata: ' + esc(t.hata) : '') + '</div>' : '');
  };
  const list = new VList(kok.querySelector('.l-list'), {
    rowH: Math.round(px() * 3.8),
    render: (r) => '<span class="nm">' + esc(r.ad) + '</span><span class="rk">' + (r.tur === 'kapat' ? (kapat() ? 'Açık' : 'Kapalı') : r.id === secili() ? '● seçili' : '') + '</span>',
    onFocus: (r) => panelYaz(r),
    onActivate: async (r) => {
      if (mesgul) return;
      if (r.tur === 'kapat') {
        ctx.store.setSetting('ytKapat', !kapat());
        list.redraw(list.index);
        return;
      }
      mesgul = true;
      try {
        ctx.store.setSetting('ytBicim', r.id);
        list.setItems(satirlar(), true);
        toast('YouTube açılıyor: ' + r.ad, 3500);
        await youtubeAc(TEST_VIDEO, undefined, { bicim: r.id, kapat: kapat() });
      } catch (e) {
        K.hata(e);
        toast('YouTube açılamadı: ' + (e && e.message ? e.message : e), 4500);
      } finally {
        mesgul = false;
        panelYaz(r);
      }
    },
  });
  list.setActive(true);
  list.setItems(satirlar());
  const k = BICIMLER.map((b) => b[0]).indexOf(secili());
  if (k > 0) list.setIndex(k);

  return {
    el: kok,
    name: 'fragmantesti',
    onShow() {
      list.setItems(satirlar(), true);
    },
    onKey: (a) => list.key(a),
  };
}
