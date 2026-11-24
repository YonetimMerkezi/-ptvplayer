// Güncelleme: kurulu ve son sürümü gösterir, denetler ve (TV izin veriyorsa) yeni IPK'yı indirip kurdurmayı dener.
import { ctx, ustCubuk } from '../ctx.js';
import { VList } from '../vlist.js';
import { varlik } from '../luna.js';
import { SURUM } from '../version.js';
import { otomatikDenetle, bekleyenSurum, servisKur } from '../guncelle.js';
import { el, esc, px, toast } from '../ui.js';
import * as K from '../log.js';

const SORU_MS = 1000;
const ONAY_MS = 6000;

export function guncelleScreen() {
  const kok = el('div', 'screen lst');
  const src = ctx.store.active();
  kok.innerHTML =
    ustCubuk('Güncelleme', src ? esc(src.name) : '') +
    '<div class="l-body"><div class="l-list"></div><div class="l-panel"></div></div>' +
    '<div class="hint">▲▼ gezin · OK: seç · Geri</div>';
  const panel = kok.querySelector('.l-panel');
  let denetleniyor = false;
  let islem = null; // servis durumu: { durum, bayt, toplam, mesaj, tani }
  let zaman = 0;
  let onay = 0; // "Şimdi güncelle" için ilk OK'un zamanı
  let kapali = false;
  let sonHata = '';

  const bilgi = () => ctx.store.setting('guncelleBilgi', null);
  const yeni = () => bekleyenSurum(ctx.store);
  const yuzde = () => (islem && islem.toplam > 0 ? Math.min(100, Math.floor((islem.bayt * 100) / islem.toplam)) : 0);
  const islemMetni = () => {
    if (!islem || islem.durum === 'yok') return '';
    if (islem.durum === 'indiriyor') return 'İndiriliyor' + (islem.toplam > 0 ? ' %' + yuzde() : '…');
    if (islem.durum === 'kuruluyor') return 'Kuruluyor…';
    if (islem.durum === 'tamam') return 'Kuruldu — uygulamayı yeniden açın';
    if (islem.durum === 'belirsiz') return 'Sonuç belirsiz';
    return 'Başarısız';
  };
  const calisiyor = () => !!islem && (islem.durum === 'indiriyor' || islem.durum === 'kuruluyor');

  const satirlar = () => [
    { id: 'denetle', ad: 'Güncellemeyi denetle' },
    { id: 'kur', ad: 'Şimdi güncelle' },
    { id: 'otomatik', ad: 'Otomatik denetim' },
  ];
  const deger = (r) => {
    if (r.id === 'denetle') return denetleniyor ? 'Denetleniyor…' : yeni() ? 'Yeni: ' + yeni().surum : bilgi() && bilgi().durum === 'guncel' ? 'Güncel' : sonHata || (bilgi() && bilgi().hata) ? 'Denetlenemedi' : '';
    if (r.id === 'kur') return calisiyor() ? islemMetni() : yeni() ? yeni().surum : '';
    return ctx.store.setting('guncelleDenetim', true) ? 'Açık' : 'Kapalı';
  };

  const panelYaz = (r) => {
    const b = bilgi();
    const son = b && b.son;
    const satir = (a, d) => '<div class="pn-d">' + esc(a) + ': <b>' + esc(d) + '</b></div>';
    let h = '<div class="pn-t">' + esc(r.ad) + '</div>' + satir('Kurulu sürüm', SURUM);
    h += satir('Son sürüm', son ? son.surum + (son.tarih ? ' (' + son.tarih + ')' : '') : 'henüz denetlenmedi');
    const hata = sonHata || (b && b.hata);
    if (hata) h += '<div class="pn-d sm">Denetlenemedi: ' + esc(hata) + '</div>';
    if (r.id === 'kur') {
      h += '<div class="pn-d">' + esc(yeni() ? 'OK: yeni paket indirilir ve TV’nin kurulum servisine verilir. Kurulum sırasında uygulama kapanır; sonra yeniden açın. TV izin vermezse nedeni aşağıda görünür.' : 'Şimdilik yeni sürüm yok.') + '</div>';
    } else if (r.id === 'denetle') {
      h += '<div class="pn-d">OK: GitHub’daki son sürümü sorar.</div>';
    } else {
      h += '<div class="pn-d">Açıkken uygulama günde en çok iki kez sessizce sürüm sorar; yeni sürümde bir kez ileti verir.</div>';
    }
    if (son && son.notlar && r.id !== 'otomatik') h += '<div class="pn-d sm">' + esc(son.notlar) + '</div>';
    if (islem && islem.durum !== 'yok') {
      h += '<div class="pn-d">Güncelleme: <b>' + esc(islemMetni()) + '</b>' + (islem.mesaj && islem.durum === 'hata' ? ' — ' + esc(islem.mesaj) : '') + '</div>';
      if (islem.tani && islem.tani.length) h += '<div class="pn-d sm">' + islem.tani.map(esc).join('<br>') + '</div>';
    }
    panel.innerHTML = h;
  };

  const list = new VList(kok.querySelector('.l-list'), {
    rowH: Math.round(px() * 3.8),
    render: (r) => '<span class="nm">' + esc(r.ad) + '</span><span class="rk">' + esc(deger(r)) + '</span>',
    onFocus: panelYaz,
    onActivate: (r) => etkinles(r),
  });
  list.setActive(true);

  const yenile = () => {
    if (kapali) return;
    list.setItems(satirlar(), true);
    panelYaz(list.cur || satirlar()[0]);
  };

  async function denetle() {
    if (denetleniyor) return;
    denetleniyor = true;
    sonHata = '';
    yenile();
    try {
      const s = await otomatikDenetle({ net: ctx.net, store: ctx.store, bildir: (t) => toast(t, 3500), zorla: true });
      if (s && s.durum === 'hata') sonHata = s.hata;
      else toast(s && s.durum === 'yeni' ? 'Yeni sürüm var: ' + s.son.surum : 'Uygulama güncel', 2500);
    } catch (e) {
      K.hata(e);
      sonHata = e && e.message ? e.message : String(e);
    }
    denetleniyor = false;
    yenile();
  }

  async function sorgula() {
    clearTimeout(zaman);
    if (kapali || !varlik()) return;
    try {
      const r = await servisKur.durum();
      if (r && r.returnValue !== false) islem = r;
    } catch (e) {
      /* servis kapanmış olabilir (kurulum uygulamayı kapattı): son bilinen durum kalır */
    }
    yenile();
    if (calisiyor() && !kapali) zaman = setTimeout(sorgula, SORU_MS);
  }

  async function kur() {
    if (!varlik()) return toast('Bu özellik yalnızca TV’de çalışır');
    const y = yeni();
    if (!y) return toast('Şimdilik yeni sürüm yok');
    if (calisiyor()) return;
    const simdi = Date.now();
    if (!onay || simdi - onay > ONAY_MS) {
      onay = simdi;
      return toast('Güncellemek için OK’a yeniden basın (uygulama kapanabilir)', ONAY_MS);
    }
    onay = 0;
    ctx.store.setSetting('guncelleBeklenen', y.surum);
    try {
      const r = await servisKur.baslat(y.ipk && y.ipk.ozet, y.ipk && y.ipk.guvenilir);
      if (r && r.returnValue === false) throw new Error(r.errorText || 'Servis başlatamadı');
      toast('Güncelleme başladı', 2500);
      sorgula();
    } catch (e) {
      K.hata(e);
      ctx.store.setSetting('guncelleBeklenen', '');
      toast('Başlatılamadı: ' + (e && e.message ? e.message : e), 4500);
    }
  }

  function etkinles(r) {
    if (r.id === 'denetle') denetle();
    else if (r.id === 'kur') kur();
    else {
      ctx.store.setSetting('guncelleDenetim', !ctx.store.setting('guncelleDenetim', true));
      yenile();
    }
  }

  list.setItems(satirlar());
  return {
    el: kok,
    name: 'guncelle',
    onShow() {
      yenile();
      sorgula(); // önceki denemenin sonucu (kurulum uygulamayı kapattıysa) burada görünür
      if (!bilgi()) denetle();
    },
    onKey: (a) => list.key(a),
    destroy() {
      kapali = true;
      clearTimeout(zaman);
    },
  };
}
