// Fragman testi: fragmanın hangi yolla açılacağını seçer ve bir deneme videosuyla dener.
//  Yol 1: bu uygulamanın penceresi YouTube TV sayfasına gider (video oynarsa en iyisi; çıkınca uygulama yeniden açılır).
//  Yol 2: TV'nin YouTube uygulaması farklı contentTarget biçimleriyle açılır (bazı TV'ler parametreyi yok sayıp ana sayfayı gösterir).
//  Yol 3: ekranda QR kod çıkar, telefonla okutulur.
// Çalışan yol seçili kalır ve kırmızı tuşla fragman açılırken kullanılır.
import { ctx, ustCubuk } from '../ctx.js';
import { VList } from '../vlist.js';
import { YOLLAR, VARSAYILAN_YOL, BICIMLER, VARSAYILAN_BICIM, TEST_VIDEO, youtubeAc, yolAc, sonDeneme } from '../fragman.js';
import { el, esc, px, toast } from '../ui.js';
import { luna, SERVIS } from '../luna.js';
import * as K from '../log.js';

export function fragmanTestiScreen() {
  const kok = el('div', 'screen lst');
  const src = ctx.store.active();
  kok.innerHTML =
    ustCubuk('Fragman testi', src ? esc(src.name) : '') +
    '<div class="l-body"><div class="l-list"></div><div class="l-panel"></div></div>' +
    '<div class="hint">▲▼ gezin · OK: dene ve seç · Geri</div>';
  const panel = kok.querySelector('.l-panel');
  const seciliYol = () => ctx.store.setting('ytYol', VARSAYILAN_YOL);
  const seciliBicim = () => ctx.store.setting('ytBicim2', VARSAYILAN_BICIM);
  const kapat = () => ctx.store.setting('ytKapat', true);
  const ikinci = () => ctx.store.setting('ytIkinci', false);
  let mesgul = false;
  let donusTani = null; // TV servisindeki dönüş bekçisinin son notları (YouTube sayfasından dönüşü tanılamak için)
  const satirlar = () =>
    YOLLAR.map((y) => ({ id: y[0], ad: y[1], tur: 'yol' }))
      .concat(BICIMLER.map((b) => ({ id: b[0], ad: 'YouTube uygulaması · ' + b[1], tur: 'bicim' })))
      .concat([
        { id: 'kapat', ad: 'Açmadan önce YouTube’u kapat', tur: 'kapat' },
        { id: 'ikinci', ad: 'Açma çağrısını bir kez daha yinele', tur: 'ikinci' },
      ]);
  const durum = (r) => {
    if (r.tur === 'kapat') return kapat() ? 'Açık' : 'Kapalı';
    if (r.tur === 'ikinci') return ikinci() ? 'Açık' : 'Kapalı';
    if (r.tur === 'yol') return r.id === seciliYol() ? '● seçili' : '';
    return seciliYol() === 'uygulama' && r.id === seciliBicim() ? '● seçili' : '';
  };
  const aciklama = (r) => {
    if (r.tur === 'kapat') return 'Açık: YouTube arka planda açıksa önce kapatılır, böylece video parametresi kaçmaz. OK ile aç/kapat.';
    if (r.tur === 'ikinci') return 'Kapalı (önerilen): açma çağrısı bir kez yapılır. Açık: YouTube kapatılamadıysa çağrı 2,4 sn sonra yinelenir. OK ile aç/kapat.';
    if (r.tur === 'yol') {
      if (r.id === 'sayfa') return 'OK: bu uygulama YouTube TV sayfasına gider ve deneme videosunu oynatır. Geri ile çıkınca uygulama kapanır; TV servisi onu birkaç saniye içinde kendiliğinden yeniden açar ve bu ekrana döndürür. Dönmezse aşağıdaki “Dönüş notları” nedenini gösterir.';
      if (r.id === 'qr') return 'OK: ekranda QR kod çıkar. Telefonun kamerasıyla okutun; fragman telefonda açılır. Her TV’de çalışır.';
      return 'Aşağıdaki biçimlerden birini seçin: TV’nin YouTube uygulaması o biçimle açılır.';
    }
    return 'OK: TV’nin YouTube uygulaması bu biçimle bir deneme videosuyla açılır. Video oynuyorsa biçim doğrudur ve seçili kalır. Ana sayfa ya da “Kim izliyor?” ekranı açılırsa OK ile profili seçin; yine video yoksa uygulamaya dönüp başka biçimi deneyin.';
  };

  // Sağ panel: seçili satırın açıklaması ve (varsa) son YouTube uygulaması denemesinde TV'nin verdiği ham yanıtlar
  const panelYaz = (r) => {
    const t = sonDeneme();
    panel.innerHTML =
      '<div class="pn-t">' + esc(r.ad) + '</div><div class="pn-d">' + esc(aciklama(r)) + '</div>' +
      (r.tur === 'yol' && r.id === 'sayfa' && donusTani ? '<div class="pn-d sm">Dönüş notları (' + esc(donusTani.durum) + '):<br>' + donusTani.tani.map(esc).join('<br>') + '</div>' : '') +
      (t ? '<div class="pn-d sm">Son deneme (' + esc(t.bicim) + '):<br>' + t.adimlar.map(esc).join('<br>') + (t.hata ? '<br>Hata: ' + esc(t.hata) : '') + '</div>' : '');
  };
  const list = new VList(kok.querySelector('.l-list'), {
    rowH: Math.round(px() * 3.8),
    render: (r) => '<span class="nm">' + esc(r.ad) + '</span><span class="rk">' + durum(r) + '</span>',
    onFocus: (r) => panelYaz(r),
    onActivate: async (r) => {
      if (mesgul) return;
      if (r.tur === 'kapat' || r.tur === 'ikinci') {
        if (r.tur === 'kapat') ctx.store.setSetting('ytKapat', !kapat());
        else ctx.store.setSetting('ytIkinci', !ikinci());
        list.redraw(list.index);
        return;
      }
      mesgul = true;
      try {
        if (r.tur === 'yol') {
          ctx.store.setSetting('ytYol', r.id);
          list.setItems(satirlar(), true);
          if (r.id !== 'uygulama') await yolAc(r.id, TEST_VIDEO, { ad: 'Deneme videosu', bildir: (t) => toast(t, 3500) });
          else toast('Aşağıdan bir YouTube uygulaması biçimi seçin', 3500);
        } else {
          ctx.store.setSetting('ytYol', 'uygulama');
          ctx.store.setSetting('ytBicim2', r.id);
          list.setItems(satirlar(), true);
          toast('YouTube açılıyor: ' + r.ad, 3500);
          await youtubeAc(TEST_VIDEO, undefined, { bicim: r.id, kapat: kapat(), ikinci: ikinci() });
        }
      } catch (e) {
        K.hata(e);
        toast('Açılamadı: ' + (e && e.message ? e.message : e), 4500);
      } finally {
        mesgul = false;
        panelYaz(r);
      }
    },
  });
  list.setActive(true);
  list.setItems(satirlar());
  const kodlar = satirlar().map((x) => (x.tur === 'bicim' || x.tur === 'yol' ? x.tur + ':' + x.id : ''));
  const k = kodlar.indexOf(seciliYol() === 'uygulama' ? 'bicim:' + seciliBicim() : 'yol:' + seciliYol());
  if (k > 0) list.setIndex(k);

  return {
    el: kok,
    name: 'fragmantesti',
    onShow() {
      list.setItems(satirlar(), true);
      luna(SERVIS + 'donusDurum', {}, 4000)
        .then((d) => {
          if (d && d.returnValue !== false && d.durum && d.durum !== 'yok') {
            donusTani = { durum: String(d.durum), tani: (d.tani || []).map(String) };
            panelYaz(satirlar()[list.index] || satirlar()[0]);
          }
        })
        .catch(() => {});
    },
    onKey: (a) => list.key(a),
  };
}
