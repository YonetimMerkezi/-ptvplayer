// Ayarlar, kaynak yönetimi, hata kaydı ve hakkında ekranları.
import { ctx, open, resetTo, ustCubuk, sifirlaSaglayici } from '../ctx.js';
import { VList } from '../vlist.js';
import { createProvider } from '../data.js';
import { varlik } from '../luna.js';
import { SURUM } from '../version.js';
import { el, esc, px, toast, boyutla } from '../ui.js';
import { temaBul, VARSAYILAN_TEMA } from '../tema.js';
import * as K from '../log.js';

const FORMAT = [['m3u8', 'HLS (m3u8)'], ['ts', 'MPEG-TS (ts)']];
const AG = [['auto', 'Otomatik'], ['direct', 'Doğrudan'], ['service', 'TV servisi']];
const YAZI = [['0.9', 'Küçük'], ['1', 'Normal'], ['1.15', 'Büyük'], ['1.3', 'Çok büyük']];
export const ORAN = [['contain', 'Sığdır'], ['cover', 'Doldur (kırp)'], ['fill', 'Uzat']];
const temaAdi = () => temaBul(ctx.store.setting('theme', VARSAYILAN_TEMA)).ad;
const ad = (liste, v) => (liste.filter((x) => x[0] === v)[0] || liste[0])[1];
const sonraki = (liste, v, yon) => {
  let i = 0;
  for (let k = 0; k < liste.length; k++) if (liste[k][0] === v) i = k;
  return liste[(i + (yon || 1) + liste.length) % liste.length][0];
};

function listeEkrani(adi, baslik, hintMetni, opt) {
  const kok = el('div', 'screen lst');
  const src = ctx.store.active();
  kok.innerHTML = ustCubuk(baslik, src ? esc(src.name) : '') + '<div class="l-body"><div class="l-list"></div>' + (opt.panel ? '<div class="l-panel"></div>' : '') + '</div><div class="hint">' + hintMetni + '</div>';
  const list = new VList(kok.querySelector('.l-list'), Object.assign({ rowH: Math.round(px() * 3.8) }, opt.list));
  list.setActive(true);
  return { kok, list, panel: kok.querySelector('.l-panel'), adi };
}

export function settingsScreen() {
  const satirlar = () => {
    const src = ctx.store.active();
    return [
      { id: 'source', ad: 'Etkin kaynak', deger: () => (src ? src.name : '—'), yardim: 'OK: kaynakları yönet' },
      { id: 'add', ad: 'Kaynak ekle', deger: () => '', yardim: 'Xtream ya da M3U bağlantısı ekler' },
      { id: 'theme', ad: 'Tema merkezi', deger: () => temaAdi(), yardim: 'Renk temaları: turkuaz, mavi, mor, gün batımı, neon …' },
      { id: 'keys', ad: 'Kumanda tuşları', deger: () => '', yardim: 'Kırmızı / yeşil / sarı / mavi tuşlara oynatıcıda ve ana sayfada yapılacak eylemi atayın' },
      { id: 'fontScale', ad: 'Yazı boyutu', deger: () => ad(YAZI, ctx.store.setting('fontScale', '1')), yardim: 'Tüm ekranlardaki yazı ve düğme boyutunu büyütür ya da küçültür' },
      { id: 'aspect', ad: 'Görüntü oranı', deger: () => ad(ORAN, ctx.store.setting('aspect', 'contain')), yardim: 'Videonun ekrana yerleşimi: sığdır, doldur (kenarları kırp) ya da uzat. Oynatıcıda renkli tuşla da değişir' },
      { id: 'autoNext', ad: 'Sıradaki bölüm', deger: () => (ctx.store.setting('autoNext', true) ? 'Açık' : 'Kapalı'), yardim: 'Bölüm bitince sıradaki bölüm kendiliğinden açılır' },
      { id: 'autoplay', ad: 'Açılışta son kanal', deger: () => (ctx.store.setting('autoplay', false) ? 'Açık' : 'Kapalı'), yardim: 'Uygulama açılınca en son izlenen canlı kanalı doğrudan oynatır' },
      { id: 'liveFmt', ad: 'Canlı yayın biçimi', deger: () => ad(FORMAT, ctx.store.setting('liveFmt', 'm3u8')), yardim: 'Yayın açılmıyorsa diğer biçimi deneyin (yalnız Xtream)' },
      { id: 'netMode', ad: 'Ağ yolu', deger: () => ad(AG, ctx.store.setting('netMode', 'auto')), yardim: 'Otomatik: önce doğrudan, olmazsa TV servisi. Liste yüklenmiyorsa “TV servisi”ni deneyin' },
      { id: 'test', ad: 'Bağlantıyı sına', deger: () => '', yardim: 'Etkin kaynağa bağlanıp sonucu ve kullanılan yolu gösterir' },
      { id: 'recents', ad: 'Geçmişi temizle', deger: () => '', yardim: 'Son izlenenleri ve kaldığı yer bilgisini siler' },
      { id: 'log', ad: 'Hata kaydı', deger: () => String(K.kayitlar().length) + ' satır', yardim: 'Sorun bildirirken bu ekranı gösterin' },
      { id: 'about', ad: 'Hakkında', deger: () => 'Sürüm ' + SURUM, yardim: '' },
    ];
  };
  const { kok, list, panel } = listeEkrani('settings', 'Ayarlar', '▲▼ gezin · ◀▶ değiştir · OK: seç · Geri', {
    panel: true,
    list: {
      render: (r) => '<span class="nm">' + esc(r.ad) + '</span><span class="rk">' + esc(r.deger()) + '</span>',
      onFocus: (r) => {
        panel.innerHTML = '<div class="pn-t">' + esc(r.ad) + '</div><div class="pn-d">' + esc(r.yardim) + '</div>';
      },
      onActivate: (r) => etkinles(r, 1),
    },
  });

  async function sina() {
    const src = ctx.store.active();
    if (!src) return toast('Kaynak yok');
    toast('Sınanıyor…', 8000);
    try {
      const p = createProvider(src, ctx.net);
      const r = await p.auth();
      if (!r.ok) throw new Error(r.reason || 'Doğrulanamadı');
      const u = src.type === 'xtream' ? src.server : src.url;
      const host = (/^[a-z]+:\/\/([^/?#]+)/i.exec(u) || [])[1] || '';
      const yol = ctx.net.ogrenilen[String(host).toLowerCase()];
      toast('Bağlantı tamam' + (yol ? ' (' + (yol === 'direct' ? 'doğrudan' : 'TV servisi') + ')' : ''), 4000);
    } catch (e) {
      K.hata(e);
      toast('Bağlanılamadı: ' + (e && e.message ? e.message : e), 6000);
    }
  }

  function etkinles(r, yon) {
    if (r.id === 'source') open('sources');
    else if (r.id === 'add') open('addsource');
    else if (r.id === 'theme') open('tema');
    else if (r.id === 'keys') open('kumanda');
    else if (r.id === 'fontScale') {
      const yeni = sonraki(YAZI, ctx.store.setting('fontScale', '1'), yon);
      ctx.store.setSetting('fontScale', yeni);
      boyutla(Number(yeni));
      // Satır yükseklikleri açılışta ölçüldüğünden ekranlar yeni boyutla yeniden kurulur
      resetTo('home');
      open('settings');
      return;
    } else if (r.id === 'aspect') ctx.store.setSetting('aspect', sonraki(ORAN, ctx.store.setting('aspect', 'contain'), yon));
    else if (r.id === 'autoNext') ctx.store.setSetting('autoNext', !ctx.store.setting('autoNext', true));
    else if (r.id === 'autoplay') ctx.store.setSetting('autoplay', !ctx.store.setting('autoplay', false));
    else if (r.id === 'liveFmt') ctx.store.setSetting('liveFmt', sonraki(FORMAT, ctx.store.setting('liveFmt', 'm3u8'), yon));
    else if (r.id === 'netMode') ctx.store.setSetting('netMode', sonraki(AG, ctx.store.setting('netMode', 'auto'), yon));
    else if (r.id === 'test') sina();
    else if (r.id === 'recents') {
      const src = ctx.store.active();
      if (src) ctx.store.clearRecents(src.id);
      toast('Geçmiş temizlendi');
    } else if (r.id === 'log') open('log');
    else if (r.id === 'about') open('about');
    list.redraw(list.index);
  }

  list.setItems(satirlar());
  return {
    el: kok,
    name: 'settings',
    onShow() {
      list.setItems(satirlar(), true);
    },
    onKey(a) {
      if (a === 'left' || a === 'right') {
        const r = list.cur;
        if (r && /^(liveFmt|netMode|fontScale|aspect|autoNext|autoplay)$/.test(r.id)) etkinles(r, a === 'right' ? 1 : -1);
        return true;
      }
      return list.key(a);
    },
  };
}

export function sourcesScreen() {
  let bekleyen = '';
  let bekT = 0;
  const satirlar = () => ctx.store.sources().map((s) => ({ id: s.id, ad: s.name, tip: s.type === 'm3u' ? 'M3U' : 'Xtream' })).concat([{ id: '+', ad: '＋ Kaynak ekle', tip: '' }]);
  const { kok, list } = listeEkrani('sources', 'Kaynaklar', 'OK: etkin yap · Kırmızı: sil (iki kez bas) · Geri', {
    list: {
      render: (r) => '<span class="nm">' + esc(r.ad) + '</span><span class="rk">' + (r.id === ctx.store.activeId() ? '● etkin ' : '') + esc(r.tip) + '</span>',
      onActivate: (r) => {
        if (r.id === '+') return open('addsource');
        ctx.store.setActive(r.id);
        sifirlaSaglayici();
        toast('Etkin kaynak: ' + r.ad);
        list.setItems(satirlar(), true);
      },
    },
  });
  list.setItems(satirlar());
  const sil = () => {
    const r = list.cur;
    if (!r || r.id === '+') return;
    if (bekleyen !== r.id) {
      bekleyen = r.id;
      clearTimeout(bekT);
      bekT = setTimeout(() => {
        bekleyen = '';
      }, 4000);
      return toast('“' + r.ad + '” silinecek — onaylamak için Kırmızı’ya tekrar basın', 4000);
    }
    bekleyen = '';
    ctx.store.removeSource(r.id);
    sifirlaSaglayici();
    if (!ctx.store.sources().length) return resetTo('addsource', { first: true });
    list.setItems(satirlar());
    toast('Kaynak silindi');
  };
  return {
    el: kok,
    name: 'sources',
    onShow() {
      list.setItems(satirlar(), true);
    },
    onKey(a) {
      if (a === 'red' || a === 'yellow') {
        sil();
        return true;
      }
      return list.key(a);
    },
    destroy() {
      clearTimeout(bekT);
    },
  };
}

export function logScreen() {
  const al = () => K.kayitlar().reverse();
  const { kok, list, panel } = listeEkrani('log', 'Hata kaydı', '▲▼ gezin · Yeşil: yenile · Geri', {
    panel: true,
    list: {
      rowH: Math.round(px() * 2.6),
      render: (s) => '<span class="nm sm">' + esc(s) + '</span>',
      empty: 'Kayıt yok',
      onFocus: (s) => {
        panel.innerHTML = '<div class="pn-d full">' + esc(s) + '</div>';
      },
    },
  });
  list.setItems(al());
  return {
    el: kok,
    name: 'log',
    onShow() {
      list.setItems(al(), true);
    },
    onKey(a) {
      if (a === 'green') {
        list.setItems(al());
        return true;
      }
      return list.key(a);
    },
  };
}

export function aboutScreen() {
  const kok = el('div', 'screen about');
  const m = /Chrome\/(\d+)/.exec(navigator.userAgent);
  const src = ctx.store.active();
  const satir = (a, d) => '<div class="ab-r"><span>' + a + '</span><b>' + esc(d) + '</b></div>';
  kok.innerHTML =
    ustCubuk('Hakkında') +
    '<div class="ab">' +
    '<div class="ab-t">Iptv Player Pro · webOS</div>' +
    satir('Sürüm', SURUM) +
    satir('Motor', m ? 'Chromium ' + m[1] : navigator.userAgent) +
    satir('Ekran', window.innerWidth + '×' + window.innerHeight) +
    satir('TV servisi', varlik() ? 'köprü var' : 'köprü yok (tarayıcı)') +
    satir('Ağ yolu', ad(AG, ctx.store.setting('netMode', 'auto'))) +
    satir('Kaynak', src ? src.name + ' (' + src.type + ')' : '—') +
    '<div class="ab-n">Bu uygulama içerik sağlamaz; yalnızca sizin eklediğiniz kaynakları oynatır.</div></div>' +
    '<div class="hint">Geri: dön</div>';
  return { el: kok, name: 'about', onKey: () => false };
}
