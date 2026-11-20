// Gözatma: solda kategoriler, sağda kanal listesi ya da afiş ızgarası. Canlı TV'de altta şimdi/sonra bilgisi.
import { ctx, provider, open, ustCubuk, ikon } from '../ctx.js';
import { VList } from '../vlist.js';
import { el, esc, px, saat, toast } from '../ui.js';
import * as K from '../log.js';
import { createVitrin } from '../vitrin.js';
import { heroName } from '../../../www/js/hero.js';
import { fragmanOynat } from '../fragman.js';

const BASLIK = { live: 'Canlı TV', guide: 'TV Rehberi', movie: 'Filmler', series: 'Diziler', favs: 'Favoriler', recents: 'Son izlenenler' };
const TUR_AD = { live: 'Canlı', movie: 'Filmler', series: 'Diziler' };
const SUTUN = 5;
const SUTUN_VITRIN = 7; // vitrinli ekranda afişler küçülür, altta ikinci satırın başı görünür kalır

const logoHtml = (u) => (u ? '<img src="' + esc(u) + '" alt="">' : '');
const yildiz = (sid, it) => (ctx.store.isFav(sid, it.id) ? '<i class="star">' + ikon.yildiz + '</i>' : '');

export function browseScreen({ kind }) {
  const kok = el('div', 'screen browse k-' + kind);
  const src = ctx.store.active();
  const sid = src ? src.id : '';
  const gercekTur = kind === 'favs' || kind === 'recents' ? '' : kind === 'guide' ? 'live' : kind;
  const canliTur = kind === 'live' || kind === 'guide'; // sağda şimdi/sonra paneli olan türler
  const solVar = kind !== 'recents';
  const vitrinli = kind === 'movie' || kind === 'series';
  kok.innerHTML =
    ustCubuk(BASLIK[kind], src ? esc(src.name) : '') +
    '<div class="br">' +
    (solVar ? '<div class="cats"></div>' : '') +
    (vitrinli ? '<div class="rt"><div class="vit"></div><div class="content"></div></div>' : '<div class="content' + (solVar ? '' : ' wide') + '"></div>') +
    (canliTur ? '<div class="info"></div>' : '') +
    '</div>' +
    '<div class="hint" id="hint"></div>';

  const catsEl = kok.querySelector('.cats');
  let contEl = kok.querySelector('.content');
  const infoEl = kok.querySelector('.info');
  const hint = kok.querySelector('#hint');
  const vitrin = vitrinli ? createVitrin(kok.querySelector('.vit'), { saglayici: provider }) : null;
  let bolge = solVar ? 'cats' : 'list';
  let cats = null; // VList
  let list = null; // VList
  let yuklendi = false;
  let secilenKat = null;
  let yukSayac = 0;
  let katT = 0;
  let epgT = 0;
  let epgNo = 0;
  let kapali = false;
  // Rehber: satırlarda görünen kanalların programları (kanal kimliği → liste); en çok 3 istek aynı anda
  const epgMap = {};
  const epgIstendi = {};
  let epgKuyruk = [];
  let epgCalisan = 0;

  const ipucu = () => {
    const o = canliTur ? 'OK: izle' : kind === 'recents' ? 'OK: devam et' : 'OK: aç';
    const f = kind === 'recents' ? 'Sarı: geçmişi temizle' : 'Sarı / OK basılı tut: favori';
    hint.innerHTML = '▲▼◀▶ gezin · ' + o + (vitrinli ? ' · Kırmızı: fragman' : '') + ' · ' + f + (kind === 'recents' ? '' : ' · Mavi: ara') + ' · Geri';
  };

  // --- sol: kategoriler
  const katRender = (c) => '<span class="cn">' + esc(c.name) + '</span>' + (c.count != null ? '<span class="cc">' + c.count + '</span>' : '');
  const katKur = (liste) => {
    cats = new VList(catsEl, {
      rowH: Math.round(px() * 3.1),
      render: katRender,
      empty: 'Kategori yok',
      onFocus: (c) => {
        clearTimeout(katT);
        katT = setTimeout(() => katYukle(c), 260);
      },
      onActivate: () => odak('list'),
    });
    cats.setItems(liste);
    cats.setActive(true);
  };

  // --- sağ: içerik
  // Rehber satırının program metni ve ilerleme yüzdesi
  const programSatiri = (it) => {
    if (!provider() || !provider().hasEpg) return { h: '<span class="dim">Bu kaynakta program rehberi yok</span>', y: -1 };
    const l = epgMap[it.id];
    if (!l) return { h: '<span class="dim">…</span>', y: -1 };
    const t = Date.now();
    const simdi = l.filter((e) => e.s <= t && t < e.e)[0];
    const sonra = l.filter((e) => e.s >= t)[0];
    if (!simdi && !sonra) return { h: '<span class="dim">Program bilgisi yok</span>', y: -1 };
    let h = '';
    let y = -1;
    if (simdi) {
      y = Math.max(0, Math.min(100, Math.round(((t - simdi.s) / (simdi.e - simdi.s)) * 100)));
      h += '<b>' + saat(simdi.s) + '</b>' + esc(simdi.t);
    }
    if (sonra) h += '<span class="sn">' + saat(sonra.s) + ' ' + esc(sonra.t) + '</span>';
    return { h, y };
  };
  const rehberRender = (it) => {
    const p = programSatiri(it);
    return (
      '<span class="num">' + (it.num || '') + '</span><span class="logo">' + logoHtml(it.logo) + '</span><span class="g2"><span class="g-n">' + esc(it.name) + '</span><span class="g-p">' + p.h + '</span>' +
      (p.y >= 0 ? '<span class="g-b"><i style="width:' + p.y + '%"></i></span>' : '') +
      '</span>' + yildiz(sid, it)
    );
  };
  const satirRender = (it) => {
    if (kind === 'guide') return rehberRender(it);
    if (it.kind === 'live') {
      return '<span class="num">' + (it.num || '') + '</span><span class="logo">' + logoHtml(it.logo) + '</span><span class="nm">' + esc(it.name) + '</span>' + yildiz(sid, it);
    }
    return '<span class="nm">' + esc(it.name) + '</span>' + yildiz(sid, it);
  };
  const hucreRender = (it) => '<div class="poster">' + logoHtml(it.logo) + '<b>' + esc(it.name.charAt(0)) + '</b></div><div class="ct">' + esc(heroName(it.name, it.year).title) + '</div>' + yildiz(sid, it);
  const sonRender = (r) => {
    const it = r.item;
    const yuzde = r.dur > 0 ? Math.min(100, Math.round((r.pos / r.dur) * 100)) : 0;
    return '<span class="logo">' + logoHtml(it.logo) + '</span><span class="nm">' + esc(it.name) + '</span><span class="rk">' + (TUR_AD[it.kind === 'episode' ? 'series' : it.kind] || '') + (yuzde ? ' · %' + yuzde : '') + '</span>';
  };

  const listeKur = (izgara) => {
    // VList kendi dinleyicilerini kapsayıcıya kurar: türü değişince kapsayıcıyı yenisiyle değiştir
    const yeni = el('div', 'content' + (solVar ? '' : ' wide') + (izgara ? ' grid' : ''));
    contEl.parentNode.replaceChild(yeni, contEl);
    contEl = yeni;
    const sutun = vitrinli ? SUTUN_VITRIN : SUTUN;
    const rowH = izgara ? Math.round((contEl.clientWidth / sutun) * 1.5 + px() * 3.2) : Math.round(px() * (kind === 'guide' ? 6.2 : 4.2));
    list = new VList(contEl, {
      cols: izgara ? sutun : 1,
      rowH,
      render: kind === 'recents' ? sonRender : izgara ? hucreRender : satirRender,
      empty: 'Burada gösterilecek bir şey yok',
      onFocus: (it) => {
        if (it && it.kind === 'live') {
          epgIste(it);
          rehberOnYukle();
        }
        if (vitrin && it && (it.kind === 'movie' || it.kind === 'series')) vitrin.odak(it);
      },
      onActivate: (it, i) => ac(it, i),
    });
  };

  const ac = (it, i) => {
    const kayit = kind === 'recents' ? it : null;
    const o = kayit ? kayit.item : it;
    if (o.kind === 'live') {
      const tum = kind === 'recents' ? list.items.filter((x) => x.item.kind === 'live').map((x) => x.item) : list.items;
      const idx = tum.findIndex((x) => x.id === o.id);
      open('player', { list: tum, index: Math.max(0, idx) });
    } else if (o.kind === 'movie' || o.kind === 'series') {
      open('detail', { item: o });
    } else if (o.kind === 'episode') {
      open('player', { list: [o], index: 0 });
    }
  };

  async function katYukle(c) {
    if (!c) return;
    secilenKat = c;
    const n = ++yukSayac;
    const izgara = (kind === 'favs' ? c.id : gercekTur) !== 'live';
    if (vitrin) vitrin.temizle();
    if (!list || (list.o.cols > 1) !== izgara) listeKur(izgara);
    if (kind === 'favs') {
      list.setItems(ctx.store.favs(sid).filter((x) => x.kind === c.id));
      return;
    }
    list.setMessage('Yükleniyor…');
    epgKuyruk = [];
    try {
      const l = await provider().items(gercekTur, c.id);
      if (n !== yukSayac) return;
      list.setItems(l);
      if (vitrin && !l.length) vitrin.temizle();
    } catch (e) {
      if (n !== yukSayac) return;
      K.hata(e);
      list.setMessage('Yüklenemedi: ' + (e && e.message ? e.message : e) + ' — OK ile yeniden dene');
      list.retry = () => katYukle(c);
    }
  }

  // --- canlı TV: şimdi / sonra
  // Rehber: görünen kanalların programlarını sırayla, en çok 3 istekle ister; gelen satır yeniden çizilir
  function rehberOnYukle() {
    if (kind !== 'guide' || !list || !provider() || !provider().hasEpg) return;
    const bas = Math.max(0, list.index - 2);
    const son = Math.min(list.items.length - 1, list.index + list.visRows + 2);
    epgKuyruk = [];
    for (let i = bas; i <= son; i++) {
      const it = list.items[i];
      if (it && it.kind === 'live' && !epgIstendi[it.id]) epgKuyruk.push(it);
    }
    epgIsle();
  }
  function epgIsle() {
    while (epgCalisan < 3 && epgKuyruk.length) {
      const it = epgKuyruk.shift();
      if (epgIstendi[it.id]) continue;
      epgIstendi[it.id] = 1;
      epgCalisan++;
      provider()
        .shortEpg(it, 4)
        .then(
          (l) => {
            epgMap[it.id] = l;
          },
          () => {
            epgMap[it.id] = [];
            setTimeout(() => {
              delete epgIstendi[it.id]; // başarısız olanlar yarım dakika sonra yeniden denenebilir
              delete epgMap[it.id];
            }, 30000);
          },
        )
        .then(() => {
          epgCalisan--;
          if (!kapali && list) {
            const i = list.items.indexOf(it);
            if (i >= 0) list.redraw(i);
          }
          epgIsle();
        });
    }
  }

  function epgIste(it) {
    if (!infoEl) return;
    clearTimeout(epgT);
    const n = ++epgNo;
    infoEl.innerHTML = '<div class="i-t">' + esc(it.name) + '</div>';
    if (!provider() || !provider().hasEpg) return;
    epgT = setTimeout(async () => {
      try {
        const l = await provider().shortEpg(it, kind === 'guide' ? 8 : 3);
        if (n !== epgNo) return;
        const t = Date.now();
        if (kind === 'guide') {
          // Kanalın yayın akışı: şimdikinden başlayarak sıradaki programlar
          const gelecek = l.filter((e) => e.e > t);
          let g = '<div class="i-t">' + esc(it.name) + '</div>';
          if (!gelecek.length) g += '<div class="i-n dim">Program bilgisi yok</div>';
          for (let i = 0; i < gelecek.length && i < 8; i++) {
            const e = gelecek[i];
            const simdi = e.s <= t;
            g += '<div class="g-s' + (simdi ? ' now' : '') + '"><b>' + saat(e.s) + '</b>' + esc(e.t) + '</div>';
            if (simdi && e.d) g += '<div class="g-d">' + esc(e.d.length > 170 ? e.d.slice(0, 167) + '…' : e.d) + '</div>';
          }
          infoEl.innerHTML = g;
          return;
        }
        const simdi = l.filter((e) => e.s <= t && t < e.e)[0];
        const sonra = l.filter((e) => e.s >= t)[0];
        let h = '<div class="i-t">' + esc(it.name) + '</div>';
        if (simdi) {
          const y = Math.max(0, Math.min(100, Math.round(((t - simdi.s) / (simdi.e - simdi.s)) * 100)));
          h += '<div class="i-n"><b>' + saat(simdi.s) + '–' + saat(simdi.e) + '</b> ' + esc(simdi.t) + '</div><div class="bar"><i style="width:' + y + '%"></i></div>';
        } else h += '<div class="i-n dim">Program bilgisi yok</div>';
        if (sonra) h += '<div class="i-s"><b>' + saat(sonra.s) + '</b> ' + esc(sonra.t) + '</div>';
        infoEl.innerHTML = h;
      } catch (e) {
        /* bilgi alınamadı: sessizce geç */
      }
    }, 380);
  }

  const favDegis = () => {
    if (!list || !list.items.length) return;
    const it = kind === 'recents' ? list.cur.item : list.cur;
    if (!it || (it.kind !== 'live' && it.kind !== 'movie' && it.kind !== 'series')) return toast('Bu öğe favoriye eklenemez');
    const eklendi = ctx.store.toggleFav(sid, it);
    toast(eklendi ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı');
    if (kind === 'favs' && !eklendi) katYukle(secilenKat);
    else list.redraw(list.index);
  };

  function odak(b) {
    bolge = b;
    if (cats) cats.setActive(b === 'cats');
    if (list) list.setActive(b === 'list');
  }

  async function ilkYukle() {
    yuklendi = true;
    if (!src) return;
    if (kind === 'recents') {
      listeKur(false);
      list.setItems(ctx.store.recents(sid));
      list.setActive(true);
      return;
    }
    if (kind === 'favs') {
      const f = ctx.store.favs(sid);
      const say = (t) => f.filter((x) => x.kind === t).length;
      const liste = ['live', 'movie', 'series'].map((t) => ({ id: t, name: TUR_AD[t], count: say(t) }));
      katKur(liste);
      // İçeriği olan ilk türle başla
      const ilk = liste.findIndex((x) => x.count > 0);
      if (ilk > 0) cats.setIndex(ilk);
      return;
    }
    catsEl.innerHTML = '<div class="vl-msg" style="display:block">Yükleniyor…</div>';
    try {
      const liste = await provider().categories(gercekTur);
      catsEl.innerHTML = '';
      katKur(liste);
    } catch (e) {
      K.hata(e);
      yuklendi = false;
      catsEl.innerHTML = '<div class="vl-msg" style="display:block">Yüklenemedi: ' + esc(e && e.message ? e.message : e) + '<br>OK ile yeniden dene</div>';
    }
  }

  return {
    el: kok,
    name: 'browse',
    longOk: true,
    onShow() {
      ipucu();
      if (!yuklendi) ilkYukle();
      else {
        // geri dönüşte (display:none sonrası) boyutları yeniden hesapla; favori/son izlenen değişmiş olabilir
        if (kind === 'recents' && list) list.setItems(ctx.store.recents(sid), true);
        else if (kind === 'favs' && secilenKat) katYukle(secilenKat);
        else if (list) list.setItems(list.items, true);
        if (cats) cats.setItems(cats.items, true);
        odak(bolge);
        rehberOnYukle();
      }
    },
    onLong: favDegis,
    onKey(a) {
      if (a === 'yellow') {
        if (kind === 'recents') {
          ctx.store.clearRecents(sid);
          list.setItems([]);
          toast('Geçmiş temizlendi');
        } else favDegis();
        return true;
      }
      if (a === 'red' && vitrin) {
        const it = list && list.cur;
        if (it && (it.kind === 'movie' || it.kind === 'series')) fragmanOynat(it, vitrin.bilgi(it), { net: ctx.net, bildir: (t) => toast(t, 3500) });
        return true;
      }
      if (a === 'blue' && kind !== 'recents') {
        open('search');
        return true;
      }
      if (!yuklendi && a === 'ok') {
        ilkYukle();
        return true;
      }
      if (bolge === 'cats') {
        if (a === 'right' || a === 'ok') {
          if (list && list.items.length) odak('list');
          else if (list && list.retry) list.retry();
          return true;
        }
        return cats ? cats.key(a) : false;
      }
      // içerik
      if (a === 'ok' && list && !list.items.length && list.retry) {
        list.retry();
        return true;
      }
      if (list && list.key(a)) return true;
      if (a === 'left' && cats && (list.o.cols === 1 || list.index % list.o.cols === 0)) {
        odak('cats');
        return true;
      }
      return false;
    },
    onHide() {
      clearTimeout(katT);
      clearTimeout(epgT);
      epgKuyruk = [];
      if (vitrin) vitrin.temizle(); // geri dönüşte liste yeniden odak verip vitrini çizer
    },
    destroy() {
      kapali = true;
      clearTimeout(katT);
      clearTimeout(epgT);
      epgKuyruk = [];
      if (vitrin) vitrin.temizle();
    },
  };
}
