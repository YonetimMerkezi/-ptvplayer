// Spor: günün maçları (ESPN + LiveScore/Mackolik), lig süzgeci, canlı skor, takım takibi ve maçın yayınlandığı kanalı açma.
import { ctx, provider, open, ustCubuk } from '../ctx.js';
import { VList } from '../vlist.js';
import { el, esc, px, saat, toast, enYakin } from '../ui.js';
import { createSporVeri, kanalAdlari, kullaniciKanallari } from '../spor-veri.js';
import { dayStart, dayStrip, dayLabel, sections, chipsFor, capSections, lgLine, hasLive } from '../../../www/js/sports.js';
import { cleanFavs, toggleFav, isFavSide, hasFavMatch, FAV_KEY, FAV_CHIP } from '../../../www/js/sports-fav.js';
import * as K from '../log.js';

let veri = null; // ekran kapanıp açılınca önbellek korunur
const yenileMs = 60000;

export function sporScreen() {
  const kok = el('div', 'screen browse k-spor');
  const src = ctx.store.active();
  if (!veri) veri = createSporVeri(ctx.net);
  const gunler = dayStrip(Date.now(), 1, 7);
  let gunNo = 1; // bugün
  let chip = '';
  let bolge = 'list'; // 'chips' | 'list'
  let maclar = [];
  let sayac = 0;
  let yenileT = 0;
  let bilgiT = 0;
  let bilgiNo = 0;
  let canliKanallar = null; // kullanıcının canlı kanalları (ilk ihtiyaçta yüklenir)

  kok.innerHTML =
    ustCubuk('Spor', src ? esc(src.name) : '') +
    '<div class="sp-days"></div>' +
    '<div class="br"><div class="cats"></div><div class="content"></div><div class="info"></div></div>' +
    '<div class="hint">▲▼◀▶ gezin · OK: kanalı aç · Kırmızı/Yeşil: gün · Sarı: ev sahibini takip et · Mavi: deplasmanı takip et · Geri</div>';
  const gunEl = kok.querySelector('.sp-days');
  const infoEl = kok.querySelector('.info');

  const favler = () => cleanFavs(ctx.store.setting(FAV_KEY, []));
  const takim = (s) => esc(s.label || s.name) + (isFavSide(favler(), s) ? ' ★' : '');

  const gunCiz = () => {
    gunEl.innerHTML = gunler.map((g, i) => '<span class="sp-d' + (i === gunNo ? ' on' : '') + '" data-d="' + i + '">' + esc(dayLabel(g)) + '</span>').join('');
  };

  const satirRender = (m) => {
    const durum = m.state === 'in' ? '<span class="sp-c live">' + esc(m.text || 'Canlı') + '</span>' : m.state === 'post' || m.off ? '<span class="sp-c">' + esc(m.text || 'MS') + '</span>' : '<span class="sp-c">' + saat(m.t) + '</span>';
    const skor = m.home.score != null && m.away.score != null ? m.home.score + ' - ' + m.away.score : 'v';
    return durum + '<span class="sp-h">' + takim(m.home) + '</span><span class="sp-s">' + skor + '</span><span class="sp-a">' + takim(m.away) + '</span><span class="rk sp-l">' + esc(lgLine(m)) + '</span>';
  };

  const chipRender = (c) => '<span class="cn">' + esc(c.name) + '</span><span class="cc">' + c.count + '</span>';
  const cats = new VList(kok.querySelector('.cats'), {
    rowH: Math.round(px() * 3.1),
    render: chipRender,
    empty: 'Maç yok',
    onFocus: (c) => {
      if (c.id !== chip) {
        chip = c.id;
        satirlariKur();
      }
    },
    onActivate: () => odak('list'),
  });
  const list = new VList(kok.querySelector('.content'), {
    rowH: Math.round(px() * 4.2),
    render: satirRender,
    empty: 'Bu gün için maç bulunamadı',
    onFocus: (m) => bilgiIste(m),
    onActivate: (m) => kanalAc(m),
  });
  cats.setActive(false);
  list.setActive(true);

  function odak(b) {
    bolge = b;
    cats.setActive(b === 'chips');
    list.setActive(b === 'list');
  }

  function satirlariKur() {
    const secili = chip === FAV_CHIP ? maclar.filter((m) => hasFavMatch(favler(), m)) : maclar;
    const secs = capSections(sections(secili, chip === FAV_CHIP ? '' : chip), 500).secs;
    const satirlar = [];
    for (let i = 0; i < secs.length; i++) for (let j = 0; j < secs[i].matches.length; j++) satirlar.push(secs[i].matches[j]);
    list.setItems(satirlar);
    if (!satirlar.length) infoEl.innerHTML = '';
  }

  function chipleriKur() {
    const f = favler();
    const { all, chips } = chipsFor(maclar);
    const fav = maclar.filter((m) => hasFavMatch(f, m)).length;
    const l = [{ id: '', name: 'Tümü', count: all }];
    if (f.length) l.push({ id: FAV_CHIP, name: 'Takip ettiklerim', count: fav });
    for (let i = 0; i < chips.length; i++) l.push(chips[i]);
    cats.setItems(l);
    const k = l.map((c) => c.id).indexOf(chip);
    if (k > 0) cats.setIndex(k);
    else chip = '';
  }

  async function yukle(zorla) {
    const n = ++sayac;
    const gun = gunler[gunNo];
    gunCiz();
    clearTimeout(yenileT);
    if (!zorla) {
      list.setMessage('Maçlar yükleniyor…');
      cats.setItems([]);
    }
    try {
      const m = await veri.maclar(gun, zorla);
      if (n !== sayac) return;
      maclar = m;
      chipleriKur();
      satirlariKur();
      if (gunNo === 1 && hasLive(maclar)) yenileT = setTimeout(() => yukle(true), yenileMs); // canlı maç varsa skorlar dakikada bir tazelenir
    } catch (e) {
      if (n !== sayac) return;
      K.hata(e);
      maclar = [];
      cats.setItems([]);
      list.setMessage('Maç bilgisi alınamadı: ' + (e && e.message ? e.message : e) + '. OK ile yeniden dene');
    }
  }

  function gunDegis(d) {
    const y = Math.max(0, Math.min(gunler.length - 1, gunNo + d));
    if (y === gunNo) return;
    gunNo = y;
    yukle(false);
  }

  // --- sağ panel: maç ayrıntısı ve yayın kanalı
  function bilgiYaz(m, kanallar, durum) {
    const f = favler();
    let h = '<div class="i-t">' + esc(m.home.label || m.home.name) + ' – ' + esc(m.away.label || m.away.name) + '</div>';
    h += '<div class="i-n">' + (m.state === 'in' ? '<b>' + esc(m.text || 'Canlı') + '</b>' : saat(m.t)) + ' · ' + esc(lgLine(m)) + '</div>';
    if (m.venue) h += '<div class="i-s">' + esc(m.venue) + '</div>';
    if (kanallar && kanallar.adlar.length) h += '<div class="i-s"><b>Yayın</b>' + esc(kanallar.adlar.join(', ')) + '</div>';
    else if (durum) h += '<div class="i-s dim">' + esc(durum) + '</div>';
    if (kanallar && kanallar.hits.length) h += '<div class="i-s"><b>OK</b>' + esc(kanallar.hits[0].name) + (kanallar.hits.length > 1 ? ' (+' + (kanallar.hits.length - 1) + ')' : '') + ' kanalını açar</div>';
    h += '<div class="i-s"><b>Sarı</b>' + esc(m.home.label || m.home.name) + (isFavSide(f, m.home) ? ' ★ takipte' : '') + '</div>';
    h += '<div class="i-s"><b>Mavi</b>' + esc(m.away.label || m.away.name) + (isFavSide(f, m.away) ? ' ★ takipte' : '') + '</div>';
    infoEl.innerHTML = h;
  }

  async function kanallariBul(m) {
    const y = await veri.yayin(gunler[gunNo]);
    const adlar = kanalAdlari(m, y);
    if (!adlar.length) return { adlar: [], hits: [], durum: y ? 'Bu maç için yayın kanalı bulunamadı' : 'Yayın bilgisi alınamadı' };
    const p = provider();
    if (!p) return { adlar, hits: [] };
    if (!canliKanallar) canliKanallar = await p.all('live');
    return { adlar, hits: kullaniciKanallari(canliKanallar, adlar) };
  }

  function bilgiIste(m) {
    clearTimeout(bilgiT);
    const n = ++bilgiNo;
    if (!m) return;
    bilgiYaz(m, null, 'Yayın kanalı aranıyor…');
    bilgiT = setTimeout(async () => {
      try {
        const k = await kanallariBul(m);
        if (n !== bilgiNo) return;
        m._k = k;
        bilgiYaz(m, k, k.durum);
      } catch (e) {
        if (n !== bilgiNo) return;
        bilgiYaz(m, null, 'Kanal listesi alınamadı');
      }
    }, 450);
  }

  async function kanalAc(m) {
    if (!m) return;
    let k = m._k;
    if (!k) {
      toast('Yayın kanalı aranıyor…');
      try {
        k = await kanallariBul(m);
      } catch (e) {
        return toast('Kanal listesi alınamadı');
      }
    }
    if (!k.hits.length) return toast(k.adlar.length ? 'Yayınlayan kanal listenizde bulunamadı: ' + k.adlar.join(', ') : 'Bu maçın yayın kanalı bulunamadı', 3500);
    open('player', { list: k.hits, index: 0 });
  }

  function takipDegis(taraf) {
    const m = list.cur;
    if (!m) return;
    const s = taraf === 'home' ? m.home : m.away;
    const r = toggleFav(favler(), s);
    if (r.full) return toast('En çok 30 takım takip edilebilir');
    ctx.store.setSetting(FAV_KEY, r.favs);
    toast((s.label || s.name) + (r.on ? ' takip ediliyor' : ' takipten çıkarıldı'));
    chipleriKur();
    satirlariKur();
  }

  gunEl.addEventListener('click', (e) => {
    const n = enYakin(e.target, '.sp-d', gunEl);
    if (!n) return;
    gunNo = Number(n.getAttribute('data-d'));
    yukle(false);
  });

  return {
    el: kok,
    name: 'spor',
    onShow() {
      yukle(!!maclar.length);
    },
    onKey(a) {
      if (a === 'red') {
        gunDegis(-1);
        return true;
      }
      if (a === 'green') {
        gunDegis(1);
        return true;
      }
      if (a === 'yellow') {
        takipDegis('home');
        return true;
      }
      if (a === 'blue') {
        takipDegis('away');
        return true;
      }
      if (a === 'ok' && !maclar.length && !list.items.length) {
        yukle(false);
        return true;
      }
      if (bolge === 'chips') {
        if (a === 'right' || a === 'ok') {
          if (list.items.length) odak('list');
          return true;
        }
        return cats.key(a);
      }
      if (list.key(a)) return true;
      if (a === 'left') {
        odak('chips');
        return true;
      }
      return false;
    },
    onHide() {
      clearTimeout(yenileT);
      clearTimeout(bilgiT);
    },
    destroy() {
      sayac++;
      bilgiNo++;
      clearTimeout(yenileT);
      clearTimeout(bilgiT);
    },
  };
}
