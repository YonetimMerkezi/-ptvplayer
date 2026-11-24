// Gözatma: solda kategoriler, sağda kanal listesi ya da afiş ızgarası. Canlı TV'de altta şimdi/sonra bilgisi.
import { ctx, provider, open, ustCubuk, ikon } from '../ctx.js';
import { VList } from '../vlist.js';
import { el, esc, px, saat, toast } from '../ui.js';
import * as K from '../log.js';
import { createVitrin } from '../vitrin.js';
import { heroName } from '../../../www/js/hero.js';
import { fragmanOynat } from '../fragman.js';
import { createMenu } from '../menu.js';
import * as D from '../duzen.js';

const BASLIK = { live: 'Canlı TV', guide: 'TV Rehberi', movie: 'Filmler', series: 'Diziler', favs: 'Favoriler', recents: 'Son izlenenler' };
const TUR_AD = { live: 'Canlı', movie: 'Filmler', series: 'Diziler' };
const SUTUN = 5;
const ONYUKLE_ILERI = 6; // seçili kategorinin altındaki, arka planda önceden yüklenen kategori sayısı
const ONYUKLE_GERI = 2; // üstündeki
const ONYUKLE_ZINCIR = 2; // aynı anda çalışan önyükleme sayısı
const SUTUN_VITRIN = 8; // kategoriler gizli olduğundan afişler tüm genişliğe dizilir; altta ikinci satırın başı görünür kalır

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
    (vitrinli ? '<div class="v-zm"></div>' : '') +
    ustCubuk(BASLIK[kind], src ? esc(src.name) : '', false, kind !== 'recents') +
    '<div class="br">' +
    (solVar ? '<div class="cats' + (vitrinli ? ' gizli' : '') + '"></div>' : '') +
    (vitrinli ? '<div class="rt"><div class="vit"></div><div class="content"></div></div>' : '<div class="content' + (solVar ? '' : ' wide') + '"></div>') +
    (canliTur ? '<div class="info"></div>' : '') +
    '</div>' +
    '<div class="hint" id="hint"></div>';

  let catsEl = kok.querySelector('.cats');
  const baslikEl = kok.querySelector('.top h1');
  const katAnahtar = 'kat:' + kind + ':' + sid; // Filmler/Diziler'de son açılan kategori hatırlanır
  // Düzen (kategori sırası, liste sıralaması, klasörler): kaynak ve tür başına saklanır; yalnız canlı/film/dizi gözatmasında
  const duzenli = kind === 'live' || kind === 'movie' || kind === 'series';
  const duzAnahtar = 'duzen:' + sid + ':' + kind;
  let duzen = D.duzenOku(duzenli ? ctx.store.setting(duzAnahtar, null) : null);
  const duzenYaz = (d) => {
    duzen = d;
    ctx.store.setSetting(duzAnahtar, d);
  };
  const duzenle = (l) => (duzenli ? D.kategorileriDuzenle(l, duzen) : l); // sağlayıcı kategorileri → klasörler + kayıtlı sıra
  const sirala = (l) => (duzenli ? D.listeSirala(l, duzen) : l);
  let hamKats = []; // sağlayıcının kategorileri (düzenlenmemiş)
  let bekleyenYenile = false; // ad girişi ekranından dönünce kategori listesi yenilenir
  const baslikYaz = (kat) => {
    if (baslikEl) baslikEl.textContent = BASLIK[kind] + (kat ? ' · ' + kat : '') + (duzenli && duzen.sira !== 'default' ? ' · ' + D.siraKisa(duzen.sira) : '');
  };
  let contEl = kok.querySelector('.content');
  const infoEl = kok.querySelector('.info');
  const hint = kok.querySelector('#hint');
  const vitrin = vitrinli ? createVitrin(kok.querySelector('.vit'), { zemin: kok.querySelector('.v-zm'), saglayici: provider }) : null;
  const menu = createMenu(kok);
  let bolge = solVar && !vitrinli ? 'cats' : 'list'; // Filmler/Diziler'de kategoriler gizli başlar, odak afişlerde
  let cats = null; // VList
  let list = null; // VList
  let yuklendi = false;
  let secilenKat = null;
  let yukSayac = 0;
  let katT = 0;
  let sessiz = false; // geri dönüşte kategori listesi yenilenirken odak olayı içeriği yeniden yüklemesin (liste başa atlıyordu)
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
    hint.innerHTML = (vitrinli ? '▲▼◀▶ gezin · ◀ soldaki sütunda: kategoriler · ' : '▲▼◀▶ gezin · ') + o + (vitrinli ? ' · Kırmızı: fragman' : '') + ' · ' + f + (kind === 'recents' ? '' : ' · Mavi: ara') + (duzenli ? ' · Yeşil: düzenle' : '') + ' · Geri';
  };

  // --- sol: kategoriler
  const katRender = (c) => '<span class="cn">' + (c.klasor ? '<i class="kf">' + ikon.klasor + '</i>' : '') + esc(c.name) + '</span>' + (c.count != null ? '<span class="cc">' + c.count + '</span>' : '');
  const katKur = (liste) => {
    cats = new VList(catsEl, {
      rowH: Math.round(px() * 3.1),
      render: katRender,
      empty: 'Kategori yok',
      onFocus: (c) => {
        if (sessiz) return;
        clearTimeout(katT);
        // Bellekte hazır kategori beklemeden açılır; ağdan gelecek olan, hızlı gezinirken istek yağmasın diye kısa süre bekletilir
        const hazir = c.klasor || (provider() && provider().hazir && provider().hazir(gercekTur, c.id));
        if (hazir) katYukle(c);
        else katT = setTimeout(() => katYukle(c), 160);
      },
      onActivate: () => odak('list'),
    });
    cats.setItems(liste);
    cats.setActive(bolge === 'cats');
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
    list.setActive(bolge === 'list');
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

  // İki liste aynı mı: uzunluk ve ilk/son öğenin kimliği (tam karşılaştırma gereksiz)
  const ayniListe = (a, b) => !!a && !!b && a.length === b.length && (!a.length || (a[0].id === b[0].id && a[a.length - 1].id === b[b.length - 1].id));

  async function katYukle(c, koru) {
    if (!c) return;
    secilenKat = c;
    baslikYaz(vitrinli ? c.name : '');
    if (vitrinli && ctx.store.setting(katAnahtar, '') !== String(c.id)) ctx.store.setSetting(katAnahtar, String(c.id));
    const n = ++yukSayac;
    const izgara = (kind === 'favs' ? c.id : gercekTur) !== 'live';
    if (vitrin) vitrin.temizle();
    if (!list || (list.o.cols > 1) !== izgara) listeKur(izgara);
    list.retry = null;
    if (c.klasor) {
      // Kullanıcı klasörü: içindekiler kayıtlı özetlerden gelir (ağ gerekmez), liste sıralaması uygulanır
      const k = sirala(D.klasorOgeleri(duzen, c.fid));
      list.setItems(k, !!koru);
      if (!k.length) list.setMessage('Bu klasör boş — bir öğenin üzerinde Yeşil tuşa basıp “Klasöre ekle / çıkar” seçin');
      return;
    }
    if (kind === 'favs') {
      list.setItems(ctx.store.favs(sid).filter((x) => x.kind === c.id), !!koru);
      return;
    }
    list.setMessage('Yükleniyor…');
    epgKuyruk = [];
    try {
      // Güncel liste hemen istenir; bu sırada önceki oturumdan kayıtlı liste varsa (kalıcı önbellek) o anında gösterilir, güncel gelince yerini alır.
      const tazeSoz = provider().items(gercekTur, c.id);
      let taze = false;
      let eskiGoruldu = false;
      if (provider().onbellekten) {
        provider()
          .onbellekten(gercekTur, c.id)
          .then((e) => {
            if (!e || !e.length || taze || n !== yukSayac) return;
            eskiGoruldu = true;
            list.setItems(sirala(e));
          })
          .catch(() => {});
      }
      const l = sirala(await tazeSoz);
      taze = true;
      if (n !== yukSayac) return;
      if (!(eskiGoruldu && ayniListe(list.items, l))) list.setItems(l, eskiGoruldu); // kayıtlı liste güncelle aynıysa yeniden çizilmez; farklıysa odak yeri korunur
      if (vitrin && !l.length) vitrin.temizle();
      komsuOnYukle(c);
    } catch (e) {
      if (n !== yukSayac) return;
      K.hata(e);
      list.setMessage('Yüklenemedi: ' + (e && e.message ? e.message : e) + ' — OK ile yeniden dene');
      list.retry = () => katYukle(c);
    }
  }

  // Açık kategorinin altındaki ve üstündeki komşular, ön planı bekletmeden sırayla arka planda önbelleğe alınır:
  // kategoriler arasında gezerken içerik hazır gelir. Aynı anda tek istek; kategori değişince zincir durur.
  let onNo = 0;
  function komsuOnYukle(c) {
    if (kind === 'favs' || kind === 'recents' || kind === 'guide' || !cats || !provider() || provider().type !== 'xtream' || c.klasor) return;
    const no = ++onNo;
    const i = cats.items.findIndex((x) => x.id === c.id);
    if (i < 0) return;
    // Önce aşağıdakiler (en çok gezilen yön), sonra yukarıdakiler; iki zincir birlikte çalışır, her biri bitince sıradakini alır
    const sira = [];
    for (let k = 1; k <= ONYUKLE_ILERI; k++) if (cats.items[i + k]) sira.push(cats.items[i + k]);
    for (let k = 1; k <= ONYUKLE_GERI; k++) if (cats.items[i - k]) sira.splice(k * 2 - 1, 0, cats.items[i - k]);
    const adim = () => {
      if (kapali || no !== onNo || !sira.length) return;
      const x = sira.shift();
      if (x.klasor || (provider().hazir && provider().hazir(gercekTur, x.id))) return adim();
      provider()
        .items(gercekTur, x.id, null)
        .then(
          () => setTimeout(adim, 100),
          () => {
            /* önyükleme başarısız: kategori seçilince normal yoldan yüklenir */
          },
        );
    };
    for (let z = 0; z < ONYUKLE_ZINCIR; z++) setTimeout(adim, 150 + z * 60);
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
    if (vitrinli && catsEl) catsEl.className = 'cats' + (b === 'cats' ? '' : ' gizli'); // kategori sütunu yalnız istenince açılır
  }

  // Kategoriler yüklenirken/yüklenemezken ileti: Filmler/Diziler'de kategori sütunu gizli olduğundan içerik alanında gösterilir
  function kategoriMesaji(html) {
    const hedef = vitrinli ? contEl : catsEl;
    hedef.innerHTML = '<div class="vl-msg" style="display:block">' + html + '</div>';
  }

  const ayniKategoriler = (a, b) => a.length === b.length && a.every((x, i) => String(x.id) === String(b[i].id));

  // --- düzenleme (Yeşil tuş): kategori sırası, liste sıralaması, klasörler
  // Kategori sütununu kayıtlı düzene göre yeniden kurar; odak aynı kategoride kalır, içerik yeniden yüklenmez (odaktaki kategori yoksa yenisi yüklenir)
  function katYenile(odakId) {
    if (!cats) return;
    const liste = duzenle(hamKats);
    const hedef = String(odakId != null ? odakId : cats.cur ? cats.cur.id : '');
    const yeni = el('div', 'cats' + (vitrinli && bolge !== 'cats' ? ' gizli' : ''));
    catsEl.parentNode.replaceChild(yeni, catsEl); // VList dinleyicileri kapsayıcıda durur: eskisini bırakıp yenisini kur
    catsEl = yeni;
    const i = liste.findIndex((x) => String(x.id) === hedef);
    sessiz = true;
    try {
      katKur(liste);
      if (i > 0) cats.setIndex(i);
    } finally {
      sessiz = false;
    }
    if (i >= 0) secilenKat = cats.items[i];
    else if (cats.cur) katYukle(cats.cur);
  }
  // Klasör satırlarının sayıları (öğe eklenip çıkarılınca) — sütunu yeniden kurmadan
  const sayilariTazele = () => {
    if (!cats) return;
    for (let i = 0; i < cats.items.length; i++) {
      const r = cats.items[i];
      if (!r.klasor) continue;
      const f = D.klasorBul(duzen, r.fid);
      if (f) {
        r.count = f.items.length;
        cats.redraw(i);
      }
    }
  };
  const kategoriIslem = (fn, ...arg) => {
    if (!cats || !secilenKat) return;
    duzenYaz(fn(duzen, cats.items, secilenKat, ...arg));
    katYenile(secilenKat.id);
  };
  const siraUygula = (k) => {
    duzenYaz(D.siraDegistir(duzen, k));
    baslikYaz(vitrinli && secilenKat ? secilenKat.name : '');
    if (secilenKat) katYukle(secilenKat);
    toast('Sıralama: ' + D.siraAdi(k));
  };
  const ogeKlasorde = (fid, it) => {
    const r = D.klasorDegistir(duzen, fid, it);
    duzenYaz(r.d);
    const f = D.klasorBul(duzen, fid);
    toast(r.acik ? '“' + (f ? f.name : '') + '” klasörüne eklendi' : 'Klasörden çıkarıldı');
    sayilariTazele();
    if (secilenKat && secilenKat.klasor && secilenKat.fid === fid) katYukle(secilenKat, true);
  };
  // Ad girişi ekranı açılır (menü kapanır); kayıt yapılınca bu ekrana dönülünce sütun yenilenir
  const yeniKlasor = (it) => {
    open('ad', {
      baslik: 'Yeni klasör',
      ipucu: 'Klasör adını yazın; OK ile kaydedin.',
      tamam(ad) {
        const r = D.klasorEkle(duzen, ad);
        if (!r.klasor) return;
        duzenYaz(r.d);
        if (it) {
          const x = D.klasorDegistir(duzen, r.klasor.id, it);
          duzenYaz(x.d);
        }
        bekleyenYenile = true;
        toast(it ? '“' + r.klasor.name + '” oluşturuldu, öğe eklendi' : '“' + r.klasor.name + '” oluşturuldu');
      },
    });
  };
  const klasorAdlandir = () => {
    const c = secilenKat;
    if (!c || !c.klasor) return;
    open('ad', {
      baslik: 'Klasör adı',
      deger: c.name,
      ipucu: 'Yeni adı yazın; OK ile kaydedin.',
      tamam(ad) {
        duzenYaz(D.klasorAdlandir(duzen, c.fid, ad));
        bekleyenYenile = true;
      },
    });
  };
  const klasorSil = () => {
    const c = secilenKat;
    if (!c || !c.klasor) return;
    duzenYaz(D.klasorSil(duzen, c.fid));
    toast('Klasör silindi');
    katYenile(null);
  };

  const siraMenusu = () => {
    const izinli = kind === 'live' ? ['default', 'az', 'za'] : D.SORTS.map((x) => x[0]);
    const liste = D.SORTS.filter((x) => izinli.indexOf(x[0]) >= 0);
    return {
      baslik: 'Liste sıralaması',
      idx: Math.max(0, liste.findIndex((x) => x[0] === duzen.sira)),
      satirlar: () =>
        liste.map((x) => ({
          ad: x[1],
          sag: duzen.sira === x[0] ? '✓' : '',
          calis: () => siraUygula(x[0]),
        })),
    };
  };
  const kategoriMenusu = () => {
    if (vitrinli) odak('cats'); // Filmler/Diziler'de kategori sütunu gizli: taşırken görünsün
    const tasi = (nereye) => () => {
      kategoriIslem(D.kategoriTasi, nereye);
      return 'kal'; // art arda taşınabilsin
    };
    return {
      baslik: 'Kategori sırası',
      not: secilenKat ? 'Seçili: ' + secilenKat.name : '',
      satirlar: [
        { ad: 'Yukarı taşı', calis: tasi('up') },
        { ad: 'Aşağı taşı', calis: tasi('down') },
        { ad: 'En üste al', calis: tasi('top') },
        { ad: 'Ada göre diz (A → Z)', calis: () => kategoriIslem(D.kategoriAzSirala, false) },
        { ad: 'Ada göre diz (Z → A)', calis: () => kategoriIslem(D.kategoriAzSirala, true) },
        { ad: 'Sırayı sıfırla', calis: () => kategoriIslem(D.kategoriSifirla) },
      ],
    };
  };
  const klasorMenusu = () => {
    const l = [{ ad: 'Yeni klasör…', calis: () => yeniKlasor(null) }];
    if (secilenKat && secilenKat.klasor) {
      l.push({ ad: 'Yeniden adlandır…', calis: () => klasorAdlandir() });
      l.push({
        ad: 'Bu klasörü sil',
        calis: () => ({
          baslik: '“' + secilenKat.name + '” silinsin mi?',
          not: 'İçindeki öğeler yalnız klasörden kalkar, kaynağınızdan silinmez.',
          satirlar: [
            { ad: 'Evet, sil', calis: () => klasorSil() },
            { ad: 'Vazgeç', calis: () => undefined },
          ],
        }),
      });
    }
    return { baslik: 'Klasörler', satirlar: l };
  };
  const klasoreEkleMenusu = (it) => ({
    baslik: 'Klasöre ekle / çıkar',
    not: 'OK: ekle ya da çıkar',
    satirlar: () =>
      duzen.klasorler
        .map((f) => ({
          ad: f.name,
          sag: D.klasordeMi(duzen, f.id, it.id) ? '✓ içinde' : '',
          calis: () => {
            ogeKlasorde(f.id, it);
            return 'kal';
          },
        }))
        .concat([{ ad: '＋ Yeni klasör…', calis: () => yeniKlasor(it) }]),
  });
  const duzenMenusu = () => {
    // Listedeyken seçili öğe işlemleri başta, kategori sütunundayken kategori işlemleri
    const it = bolge === 'list' && list && list.items.length ? list.cur : null;
    const ogeUygun = it && (it.kind === 'live' || it.kind === 'movie' || it.kind === 'series');
    menu.ac({
      baslik: 'Düzenle',
      satirlar: () => {
        const l = [];
        if (ogeUygun) l.push({ ad: 'Klasöre ekle / çıkar', calis: () => klasoreEkleMenusu(it) });
        l.push({ ad: 'Liste sıralaması', sag: D.siraAdi(duzen.sira), calis: () => siraMenusu() });
        l.push({ ad: 'Kategori sırası', calis: () => kategoriMenusu() });
        l.push({ ad: 'Klasörler', sag: duzen.klasorler.length ? String(duzen.klasorler.length) : '', calis: () => klasorMenusu() });
        return l;
      },
    });
  };

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
    kategoriMesaji('Yükleniyor…');
    if (vitrinli) {
      // Son açılan kategorinin içeriği, kategori listesi gelmeden istenir (kategori listesiyle paralel)
      const sonKat = String(ctx.store.setting(katAnahtar, ''));
      if (sonKat && sonKat.indexOf('f:') !== 0) provider().items(gercekTur, sonKat).catch(() => {});
    }
    try {
      // Önceki oturumdan kayıtlı kategori listesi varsa hemen gösterilir (güncel liste gelene dek kategori beklenmez)
      let gosterildi = false;
      const kur = (ham) => {
        hamKats = ham;
        const liste = duzenle(ham);
        (vitrinli ? contEl : catsEl).innerHTML = '';
        katKur(liste);
        if (vitrinli) {
          const son = String(ctx.store.setting(katAnahtar, ''));
          const i = liste.findIndex((x) => String(x.id) === son);
          if (i > 0) cats.setIndex(i);
        }
      };
      let taze = false;
      const tazeSoz = provider().categories(gercekTur);
      if (provider().categoriesOnbellekten) {
        provider()
          .categoriesOnbellekten(gercekTur)
          .then((e) => {
            if (!e || !e.length || taze || kapali) return;
            gosterildi = true;
            kur(e);
          })
          .catch(() => {});
      }
      const ham = await tazeSoz;
      taze = true;
      if (!gosterildi) kur(ham);
      else {
        hamKats = ham;
        // Kategori listesi değişmiş: odaktaki kategoriyi koruyarak yeniden kur (içerik yeniden yüklenmesin)
        if (!ayniKategoriler(cats.items, duzenle(ham))) katYenile(cats.cur ? cats.cur.id : null);
      }
    } catch (e) {
      K.hata(e);
      yuklendi = false;
      kategoriMesaji('Yüklenemedi: ' + esc(e && e.message ? e.message : e) + '<br>OK ile yeniden dene');
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
        if (bekleyenYenile) {
          bekleyenYenile = false; // ad girişinden dönüldü: klasör eklendi/adı değişti
          katYenile(secilenKat ? secilenKat.id : null);
        }
        // geri dönüşte (display:none sonrası) boyutları yeniden hesapla; favori/son izlenen değişmiş olabilir
        if (kind === 'recents' && list) list.setItems(ctx.store.recents(sid), true);
        else if (kind === 'favs' && secilenKat) katYukle(secilenKat, true);
        else if (list) list.setItems(list.items, true);
        if (cats) {
          sessiz = true;
          try {
            cats.setItems(cats.items, true);
          } finally {
            sessiz = false;
          }
        }
        odak(bolge);
        rehberOnYukle();
      }
    },
    onLong() {
      if (!menu.acik) favDegis();
    },
    // Ara düğmesi / Mavi tuş: bulunulan bölümde (Filmler, Diziler, Canlı TV) aranır; Favoriler'de tüm katalogda
    araAc() {
      open('search', gercekTur ? { tur: gercekTur } : undefined);
    },
    onKey(a) {
      if (menu.acik) return menu.key(a);
      if (a === 'green' && duzenli) {
        if (cats && hamKats.length) duzenMenusu();
        else toast('Kategoriler yüklenince düzenleyebilirsiniz');
        return true;
      }
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
        this.araAc();
        return true;
      }
      if (!yuklendi && a === 'ok') {
        ilkYukle();
        return true;
      }
      if (bolge === 'cats') {
        if (a === 'back' && vitrinli) {
          odak('list'); // açık kategori sütunu Geri ile kapanır
          return true;
        }
        if (a === 'right' || a === 'ok') {
          if (vitrinli) odak('list');
          else if (list && list.items.length) odak('list');
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
      if (a === 'left' && cats && (!list || list.o.cols === 1 || list.index % list.o.cols === 0)) {
        odak('cats');
        return true;
      }
      return false;
    },
    onHide() {
      menu.kapat();
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
