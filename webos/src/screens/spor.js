// Spor: sekmeler — Canlı · Lig (haftalık program) · Puan durumu · Takımlarım · Liglerim.
// Ekran açılınca hiçbir şey indirilmez; veri yalnız kullanıcı bir sekmeyi/ligi/takımı seçip OK basınca yüklenir (yavaş TV'de arayüz donmasın).
// İstekler tek tek atılır; yanıtlar servisten budanmış gelir; kanal eşleme küçük dilimlerle yapılır.
import { ctx, open, ustCubuk } from '../ctx.js';
import { VList } from '../vlist.js';
import { el, esc, px, saat, toast, enYakin } from '../ui.js';
import { sporVeri, kanalHaritasi, haftaBasi, haftaKaydir, haftaGunleri, haftaEtiketi, ULKE_LIGLERI, TABLOLU_LIGLER, TUM_LIGLER, ligBul, ikinciLigMi } from '../spor-veri.js';
import { dayStart, dayLabel, dayMonth, sections, lgLine } from '../../../www/js/sports.js';
import { cleanFavs, toggleFav, setFavLeague, isFavSide, FAV_KEY } from '../../../www/js/sports-fav.js';
import { lang } from '../../../www/js/i18n.js';
import * as K from '../log.js';

const TABLAR = ['Canlı', 'Lig', 'Puan durumu', 'Takımlarım', 'Liglerim'];
const CANLI = 0;
const LIG = 1;
const PUAN = 2;
const TAKIM = 3;
const LIGLER = 4;
const LIG_KEY = 'sp.lig'; // son seçilen lig
const FAVLIG_KEY = 'sp.favlig'; // favori ligler (kayıt yoksa Süper Lig)
const SEKME_KEY = 'sp.sekme2'; // son açık sekme (sekme sırası değişince anahtar yenilendi)
const CANLI_YENILE_MS = 90000;
const TUS_BEKLE_MS = 4000; // canlı otomatik yenileme: son tuştan bu kadar sonra (gezinirken liste altından çekilmesin)

const HINT = {
  tab: '◀▶ sekme · OK: aç / yükle · ▼ içeriğe geç · Geri',
  alt: '◀▶ gezin · OK: seç · Kırmızı/Yeşil: önceki/sonraki hafta · ▼ liste · Geri',
  mac: '▲▼ gezin · OK: maç sayfası · Sarı: ev sahibini takip et · Mavi: deplasmanı takip et · Geri',
  lig: '▲▼ gezin · OK: maç sayfası · Kırmızı/Yeşil: hafta · Sarı/Mavi: takip · Geri',
  tablo: '▲▼ gezin · OK/Sarı: takımı takip et · Geri',
  takim: '▲▼ gezin · OK: takımın maçları · Sarı: takipten çıkar · Geri',
  ligler: '▲▼ gezin · OK: ligi aç · Sarı: favoriden çıkar · Geri',
  sec: '▲▼ gezin · OK: seç · Sarı: favori ligi aç/kapat · Geri',
};

// Listeden başlık satırlarını atlayarak yön yönünde bir adım (kenarda false: üst katman başka alana geçer)
function adim(l, yon) {
  let i = l.index + yon;
  while (i >= 0 && i < l.items.length && l.items[i].baslik) i += yon;
  if (i < 0 || i >= l.items.length) return false;
  l.setIndex(i);
  return true;
}
// Listenin ilk başlık-olmayan satırına (ya da verilen indekse) odaklanır
function ilkSatir(l, tercih) {
  let i = tercih >= 0 ? tercih : 0;
  while (i < l.items.length && l.items[i].baslik) i++;
  if (i >= l.items.length) i = 0;
  if (l.items.length) l.setIndex(i);
}

export function sporScreen() {
  const kok = el('div', 'screen k-spor');
  const src = ctx.store.active();
  const veri = sporVeri(ctx.net); // ekran kapanıp açılınca önbellek paylaşılır
  const BUGUN = dayStart(Date.now());
  const AYAR = (k, v) => ctx.store.setting(k, v);

  let sekme = Math.max(0, Math.min(TABLAR.length - 1, Number(AYAR(SEKME_KEY, CANLI)) || 0));
  let bolge = 'tab'; // 'tab' | 'alt' | 'liste' | 'tablo'
  let altNo = 0;
  let kapali = false;
  let gorunur = true;
  let sonTus = 0;
  let favC = null;
  let cizildi = false;

  // Canlı
  let canliM = null; // null: yüklenmedi
  let canliHata = '';
  let canliYuk = false;
  let canliN = 0;
  let canliT = 0;
  // Lig
  let ligId = String(AYAR(LIG_KEY, '') || '');
  if (!ligBul(ligId)) ligId = '';
  let hafta = haftaBasi(Date.now());
  let progM = null; // null: yüklenmedi
  let progHata = '';
  let progYuk = false;
  let tabloG = null; // null: yüklenmedi; []: tablo yok
  let tabloHata = '';
  let tabloYuk = false;
  let ligN = 0;
  let puanN = 0;
  let yayinT = 0;
  let haftaT = 0;
  // Yayın kanalları (isteğe bağlı)
  let kanallar = {};
  let kanalHazir = {};
  let yayinN = 0;
  let yayinDurum = ''; // '' | 'Yayın 2/5…' | 'Yayın: tamam' …
  // Takımlarım
  let takimV = null; // { fav, matches, durum: 'yukleniyor' | '' | 'hata', iletisi }
  let takimN = 0;
  // Seçici (açılır liste)
  let sec = null; // { mod: 'lig' | 'favlig', list }

  kok.innerHTML =
    ustCubuk('Spor', src ? esc(src.name) : '') +
    '<div class="sp-days"><div class="sp-in" id="sp-t"></div></div>' +
    '<div class="sp-chips"><div class="sp-in" id="sp-a"></div></div>' +
    '<div class="sp-body"><div class="sp-p1"><div class="content"></div></div><div class="sp-p2"><div class="st-hd" id="st-h"></div><div class="st-lst"></div></div></div>' +
    '<div class="sp-pick" id="sp-pk" style="display:none"><div class="sp-pk-box"><h3 class="sp-pk-t" id="sp-pkt"></h3><div class="sp-pk-l"></div><div class="sp-pk-h" id="sp-pkh"></div></div></div>' +
    '<div class="hint" id="sp-hint"></div>';
  const tabIc = kok.querySelector('#sp-t');
  const altIc = kok.querySelector('#sp-a');
  const altKap = kok.querySelector('.sp-chips');
  const govde = kok.querySelector('.sp-body');
  const hintEl = kok.querySelector('#sp-hint');
  const pickEl = kok.querySelector('#sp-pk');
  // puan tablosu başlığı: sütun kısaltmaları dile göre (tek harflik metinler çeviri sözlüğüne girmez)
  const tabloBaslikCiz = () => {
    const en = lang() === 'en';
    const c = en ? [['P', 'Played'], ['W', 'Wins'], ['D', 'Draws'], ['L', 'Losses'], ['GD', 'Goal difference'], ['Pts']] : [['O', 'Oynanan'], ['G', 'Galibiyet'], ['B', 'Beraberlik'], ['M', 'Mağlubiyet'], ['AV', 'Averaj'], ['P']];
    kok.querySelector('#st-h').innerHTML = '<span class="st-n">#</span><span class="st-t">' + (en ? 'Team' : 'Takım') + '</span>' + c.map((x, i) => '<span class="' + (i < 5 ? 'st-v' : 'st-p') + '"' + (x[1] ? ' title="' + x[1] + '"' : '') + '>' + x[0] + '</span>').join('');
  };
  tabloBaslikCiz();

  // ---- ortak yardımcılar ----
  const favler = () => favC || (favC = cleanFavs(ctx.store.setting(FAV_KEY, [])));
  const favDegisti = () => {
    favC = null;
  };
  const takimAdi = (s) => esc(s.label || s.name) + (isFavSide(favler(), s) ? ' ★' : '');
  const favLigler = () => {
    const v = AYAR(FAVLIG_KEY, null);
    return (Array.isArray(v) ? v : ['tur.1']).filter((id) => !!ligBul(id));
  };
  const ligAdi = (id) => (ligBul(id) || {}).name || '';
  const gunBasligi = (g) => {
    const e = dayLabel(g);
    return esc(e + (/\d/.test(e) ? '' : ' · ' + dayMonth(g)));
  };

  // Gün başlıklı maç satırları: [{ baslik }, maç, maç, { baslik }, …]; ilk güncel maçın indeksi de döner
  function gunlu(maclar) {
    const out = [];
    let son = -1;
    let ilk = -1;
    const simdi = Date.now();
    for (let i = 0; i < maclar.length; i++) {
      const m = maclar[i];
      const g = dayStart(m.t);
      if (g !== son) {
        son = g;
        out.push({ baslik: gunBasligi(g) });
      }
      if (ilk < 0 && (m.state === 'in' || m.t >= simdi - 3 * 3600e3)) ilk = out.length;
      out.push(m);
    }
    return { out, ilk };
  }

  // ---- listeler ----
  // Alt liglerde (2. Lig: Beyaz/Kırmızı Grup) grup adı satırda görünür; maçın yarışma adından alınır ("Türkiye · 2. Lig: Beyaz Grup")
  const grupAdi = (m) => (ikinciLigMi(ligId) && m.lgName && m.lgName.indexOf(':') > 0 ? m.lgName.split(':').slice(1).join(':').trim() : '');
  const kanalYazi = (a) => a.slice(0, 2).join(' · ') + (a.length > 2 ? ' +' + (a.length - 2) : '');
  const macSatiri = (m, dar) => {
    const durum = m.state === 'in' ? '<span class="sp-c live">' + esc(m.text || 'Canlı') + '</span>' : m.state === 'post' || m.off ? '<span class="sp-c">' + esc(m.text || 'MS') + '</span>' : '<span class="sp-c">' + saat(m.t) + '</span>';
    const skor = m.home.score != null && m.away.score != null ? m.home.score + ' - ' + m.away.score : 'v';
    const kn = kanallar[m.id];
    const alt = dar ? [grupAdi(m), m.round].filter(Boolean).join(' · ') : lgLine(m);
    return durum + '<span class="sp-h">' + takimAdi(m.home) + '</span><span class="sp-s">' + skor + '</span><span class="sp-a">' + takimAdi(m.away) + '</span>' + (kn || alt ? '<span class="sp-r">' + (kn ? '<b class="sp-k">' + esc(kanalYazi(kn)) + '</b>' : '') + '<i>' + esc(alt) + '</i></span>' : '');
  };
  const satirRender = (it) => {
    if (it.baslik) return '<span class="sp-hd">' + it.baslik + '</span>';
    if (it.fav) {
      const lg = it.fav.g ? ligAdi(it.fav.g) : '';
      return '<span class="nm">★ ' + esc(it.fav.l || it.fav.n) + '</span>' + (lg ? '<span class="cc">' + esc(lg) + '</span>' : '');
    }
    if (it.lgId) return '<span class="nm">★ ' + esc(ligAdi(it.lgId)) + '</span>';
    if (it.ekle) return '<span class="nm sp-ekle">＋ Lig ekle / çıkar</span>';
    return macSatiri(it, sekme === LIG);
  };
  const liste = new VList(kok.querySelector('.sp-p1 .content'), {
    rowH: Math.round(px() * 4.2),
    render: satirRender,
    empty: '',
    onActivate: (it) => listeOk(it),
  });
  const tablo = new VList(kok.querySelector('.st-lst'), {
    rowH: Math.round(px() * 3.4),
    render: (it) => {
      if (it.baslik) return '<span class="sp-hd">' + esc(it.baslik) + '</span>';
      const r = it.r;
      const f = isFavSide(favler(), { name: r.name, label: r.label });
      const v = (x) => (x == null ? '' : String(Math.round(x * 100) / 100));
      return '<span class="st-n">' + v(r.rank) + '</span><span class="st-t">' + esc(r.label || r.name) + (f ? ' ★' : '') + '</span><span class="st-v">' + v(r.p) + '</span><span class="st-v">' + v(r.w) + '</span><span class="st-v">' + v(r.d) + '</span><span class="st-v">' + v(r.l) + '</span><span class="st-v">' + v(r.gd) + '</span><span class="st-p">' + v(r.pts) + '</span>';
    },
    empty: '',
    onActivate: (it) => tabloOk(it),
  });

  // ---- çizim ----
  const sekmeCiz = () => {
    tabIc.innerHTML = TABLAR.map((t, i) => '<span class="sp-d' + (i === sekme ? (bolge === 'tab' ? ' on' : ' sel') : '') + '" data-t="' + i + '">' + esc(t) + '</span>').join('');
  };
  const altChipleri = () => {
    if (sekme === PUAN) return [{ ad: (ligId ? ligAdi(ligId) : 'Lig seçin') + ' ▾' }];
    if (sekme !== LIG) return [];
    return [
      { ad: (ligId ? ligAdi(ligId) : 'Lig seçin') + ' ▾' },
      { ad: '‹ Önceki' },
      { ad: haftaEtiketi(hafta) + (progYuk ? ' …' : ''), dim: true },
      { ad: 'Sonraki ›' },
      { ad: yayinDurum || 'Yayın kanalları' },
    ];
  };
  const altCiz = () => {
    const l = altChipleri();
    altKap.style.display = l.length ? '' : 'none';
    if (altNo >= l.length) altNo = 0;
    altIc.innerHTML = l.map((c, i) => '<span class="sp-d' + (i === altNo ? (bolge === 'alt' ? ' on' : ' sel') : '') + (c.dim ? ' dim' : '') + '" data-a="' + i + '">' + esc(c.ad) + '</span>').join('');
  };
  const hintCiz = () => {
    let h = HINT.tab;
    if (bolge === 'alt') h = HINT.alt;
    else if (bolge === 'tablo') h = HINT.tablo;
    else if (bolge === 'liste') h = sekme === LIG ? HINT.lig : sekme === TAKIM && !takimV ? HINT.takim : sekme === LIGLER ? HINT.ligler : HINT.mac;
    if (sec) h = HINT.sec;
    hintEl.textContent = h;
  };
  const odakCiz = () => {
    liste.setActive(bolge === 'liste' && !sec);
    tablo.setActive(bolge === 'tablo' && !sec);
    sekmeCiz();
    altCiz();
    hintCiz();
  };
  const duzen = () => {
    govde.className = 'sp-body' + (sekme === LIG ? ' lig' : sekme === PUAN ? ' puan' : '');
    odakCiz();
  };

  // Canlı: lig başlıklı liste
  function canliCiz() {
    if (sekme !== CANLI) return;
    if (canliYuk && !canliM) return liste.setMessage('Canlı maçlar yükleniyor…');
    if (canliHata && !canliM) return liste.setMessage(canliHata + '. OK ile yeniden dene');
    if (!canliM) return liste.setMessage("Canlı maçları yüklemek için OK'a basın");
    if (!canliM.length) return liste.setMessage('Şu an canlı maç yok. OK ile yenile');
    const secs = sections(canliM, '').concat(sections(canliM, 'g:oth'));
    const items = [];
    for (let i = 0; i < secs.length; i++) {
      items.push({ baslik: esc(secs[i].lg.name) });
      for (let j = 0; j < secs[i].matches.length; j++) items.push(secs[i].matches[j]);
    }
    const onceki = liste.cur && liste.cur.id;
    let k = -1;
    for (let i = 0; i < items.length && onceki; i++) if (items[i].id === onceki) k = i;
    liste.setItems(items, false);
    ilkSatir(liste, k);
  }

  // Lig haftası: günlere ayrılmış program
  function progCiz(korumak) {
    if (sekme !== LIG) return;
    if (!ligId) return liste.setMessage('Önce bir lig seçin: yukarıdaki Lig düğmesi, OK');
    if (progYuk && (!progM || !progM.length)) return liste.setMessage(ligAdi(ligId) + ': hafta yükleniyor…');
    if (progHata && !progM) return liste.setMessage(progHata + '. OK ile yeniden dene');
    if (!progM) return liste.setMessage(ligAdi(ligId) + " için haftalık programı yüklemek için OK'a basın");
    if (!progM.length) return liste.setMessage('Bu hafta ' + ligAdi(ligId) + ' maçı yok. Kırmızı/Yeşil: başka hafta');
    const g = gunlu(progM);
    const onceki = korumak && liste.cur && liste.cur.id;
    let k = g.ilk;
    for (let i = 0; i < g.out.length && onceki; i++) if (g.out[i].id === onceki) k = i;
    liste.setItems(g.out, false);
    ilkSatir(liste, k);
    kanalIsle();
  }
  function tabloCiz() {
    if (sekme !== PUAN) return;
    if (!ligId) return tablo.setMessage('Önce bir lig seçin: yukarıdaki Lig düğmesi, OK');
    if (tabloYuk && !tabloG) return tablo.setMessage('Puan durumu yükleniyor…');
    if (tabloHata && !tabloG) return tablo.setMessage('Puan durumu alınamadı. OK ile yeniden dene');
    if (!tabloG) return tablo.setMessage(TABLOLU_LIGLER.indexOf(ligId) >= 0 ? 'Puan durumu OK ile yüklenir' : 'Bu lig için puan durumu yok');
    if (!tabloG.length) return tablo.setMessage('Bu lig için puan durumu yok');
    const items = [];
    for (let i = 0; i < tabloG.length; i++) {
      if (tabloG[i].name) items.push({ baslik: tabloG[i].name });
      for (let j = 0; j < tabloG[i].rows.length; j++) items.push({ r: tabloG[i].rows[j] });
    }
    tablo.setItems(items, false);
    ilkSatir(tablo, 0);
  }

  // Takımlarım: takım listesi ya da seçilen takımın maçları
  function takimCiz() {
    if (sekme !== TAKIM) return;
    if (takimV) {
      if (takimV.durum === 'yukleniyor' && !takimV.matches.length) return liste.setMessage(esc(takimV.fav.l || takimV.fav.n) + ': maçlar yükleniyor…');
      if (takimV.durum === 'hata' && !takimV.matches.length) return liste.setMessage(takimV.mesaj + '. OK ile yeniden dene');
      if (!takimV.matches.length) return liste.setMessage('Yakın tarihte maç bulunamadı. Geri: takım listesi');
      const g = gunlu(takimV.matches);
      liste.setItems(g.out, false);
      return ilkSatir(liste, g.ilk);
    }
    const f = favler();
    if (!f.length) return liste.setMessage('Henüz takip ettiğiniz takım yok. Lig sayfasında puan durumundan ya da maç listesinde Sarı/Mavi tuşuyla takım ekleyin');
    liste.setItems(f.map((x) => ({ fav: x })), false);
  }
  function liglerCiz() {
    if (sekme !== LIGLER) return;
    const items = favLigler().map((id) => ({ lgId: id }));
    items.push({ ekle: true });
    liste.setItems(items, false);
  }
  function icerikCiz() {
    duzen(); // önce yerleşim: gizli kapta ölçülen liste satırları daralmasın
    tablo.setMessage('');
    tablo.items = [];
    if (sekme === CANLI) canliCiz();
    else if (sekme === LIG) progCiz();
    else if (sekme === PUAN) tabloCiz();
    else if (sekme === TAKIM) takimCiz();
    else liglerCiz();
    duzen();
  }

  // ---- yükleme ----
  async function canliYukle(sessiz) {
    const n = ++canliN;
    clearTimeout(canliT);
    canliYuk = true;
    canliHata = '';
    if (!sessiz) canliCiz();
    try {
      const m = await veri.canli(!!canliM);
      if (n !== canliN || kapali) return;
      canliM = m;
    } catch (e) {
      if (n !== canliN || kapali) return;
      K.uyar('Canlı maçlar: ' + (e && e.message ? e.message : e));
      if (!canliM) canliHata = String((e && e.message) || 'Canlı maç bilgisi alınamadı').replace(/\.+$/, '');
      else toast('Canlı skorlar güncellenemedi');
    }
    canliYuk = false;
    canliCiz();
    duzen();
    canliZamanla();
  }
  function canliZamanla() {
    clearTimeout(canliT);
    if (kapali || !gorunur || sekme !== CANLI || !canliM) return;
    canliT = setTimeout(canliTazele, CANLI_YENILE_MS);
  }
  function canliTazele() {
    if (kapali || !gorunur || sekme !== CANLI) return;
    if (Date.now() - sonTus < TUS_BEKLE_MS) {
      canliT = setTimeout(canliTazele, 5000); // kullanıcı gezerken liste altından çekilmez
      return;
    }
    canliYukle(true);
  }

  // Lig (ya da hafta) seçildi: önce ESPN haftası, sonra eksik günler ikinci kaynaktan (liste geldikçe tazelenir), sonra puan durumu, sonra yayın kanalları — hepsi sırayla, tek tek
  async function ligYukle(zorla) {
    if (!ligId) return seciciAc('lig');
    const n = ++ligN;
    clearTimeout(yayinT);
    yayinIptal();
    progYuk = true;
    progHata = '';
    progM = null;
    progCiz();
    duzen();
    let ham = null;
    try {
      ham = await veri.hafta(ligId, hafta, !!zorla);
    } catch (e) {
      if (n !== ligN || kapali) return;
      progHata = String((e && e.message) || 'Maç bilgisi alınamadı').replace(/\.+$/, '');
    }
    if (n !== ligN || kapali) return;
    if (ham) {
      progM = ham;
      progCiz();
      duzen();
    }
    // ESPN haftayı hiç vermediyse (alt ligler, ağ sorunu) ya da eksik verdiyse maçsız günler LiveScore/Mackolik'ten eklenir
    try {
      const ml = await veri.haftaEk(ligId, hafta, ham || [], {
        aktif: () => n === ligN && !kapali && sekme === LIG,
        onPart: (ml) => {
          if (n !== ligN || kapali) return;
          progM = ml;
          progHata = '';
          progCiz(true);
          duzen();
        },
      });
      if (n === ligN && !kapali && ml && ml.length) {
        progM = ml;
        progHata = '';
      }
    } catch (err) {
      K.uyar('Hafta tamamlama: ' + (err && err.message ? err.message : err));
    }
    if (n !== ligN || kapali) return;
    progYuk = false;
    if (sekme !== LIG) {
      progM = null; // sekme değişince yarım kalan liste saklanmaz: dönüşte yeniden kurulur (önbellekten hızlı)
      return;
    }
    if (!progM && !progHata) progM = [];
    progCiz();
    duzen();
    if (!tabloG && !tabloYuk) await puanYukle(false, true); // puan durumu sekmesi açıldığında hazır olsun (tek hafif istek)
    if (n !== ligN || kapali) return;
    yayinZamanla(n);
  }
  // Puan durumu (Puan durumu sekmesi): tek ESPN isteği; alt liglerde yok
  async function puanYukle(zorla, sessiz) {
    if (!ligId) return seciciAc('lig');
    if (TABLOLU_LIGLER.indexOf(ligId) < 0) {
      tabloG = [];
      tabloCiz();
      return;
    }
    const n = ++puanN;
    tabloYuk = true;
    tabloHata = '';
    if (!sessiz) {
      tabloCiz();
      duzen();
    }
    try {
      const g = await veri.tablo(ligId, !!zorla);
      if (n !== puanN || kapali) return;
      tabloG = g || [];
    } catch (e) {
      if (n !== puanN || kapali) return;
      K.uyar('Puan durumu: ' + (e && e.message ? e.message : e));
      tabloHata = String((e && e.message) || 'Puan durumu alınamadı');
    }
    tabloYuk = false;
    tabloCiz();
    duzen();
  }
  // Program geldikten sonra yayın kanalları kendiliğinden aranır; kullanıcı tuşa basıyorsa beklenir (gezinirken arayüz donmasın)
  function yayinZamanla(n) {
    clearTimeout(yayinT);
    const dene = () => {
      if (kapali || n !== ligN || sekme !== LIG) return;
      if (Date.now() - sonTus < 1500) {
        yayinT = setTimeout(dene, 1000);
        return;
      }
      yayinGetir(true);
    };
    yayinT = setTimeout(dene, 1200);
  }
  function ligSec(id, yukle) {
    if (!ligBul(id)) return;
    ligId = id;
    ctx.store.setSetting(LIG_KEY, id);
    hafta = haftaBasi(Date.now());
    progM = null;
    progHata = '';
    tabloG = null;
    tabloHata = '';
    kanallar = {};
    kanalHazir = {};
    yayinDurum = '';
    ++ligN;
    ++puanN;
    clearTimeout(yayinT);
    if (sekme !== PUAN) sekme = LIG; // Puan durumu sekmesindeyken lig değişirse o sekmede kalınır
    bolge = sekme === PUAN ? 'tablo' : 'liste';
    altNo = 0;
    ctx.store.setSetting(SEKME_KEY, sekme);
    icerikCiz();
    if (yukle) {
      if (sekme === PUAN) puanYukle(false);
      else ligYukle(false);
    }
  }
  function haftaDegis(d) {
    if (!ligId) return;
    hafta = haftaKaydir(hafta, d);
    clearTimeout(haftaT);
    ++ligN;
    yayinIptal();
    progM = null;
    progHata = '';
    progYuk = true;
    progCiz();
    altCiz();
    haftaT = setTimeout(() => ligYukle(false), 350); // art arda basışta her haftaya istek atılmaz (puan durumu ligle aynı: yüklüyse yeniden alınmaz)
  }

  // Yayın kanalları: yalnız istenince; haftanın oynanmamış maçı olan günleri sırayla (yakın gün önce), her gün tek ağır sayfa
  function yayinIptal() {
    yayinN++;
    if (/…$/.test(yayinDurum)) yayinDurum = '';
  }
  async function yayinGetir(sessiz) {
    if (!progM || !progM.length) return sessiz ? undefined : toast('Önce haftalık programı yükleyin');
    const n = ++yayinN;
    const simdi = dayStart(Date.now());
    const gunler = haftaGunleri(hafta).filter((g) => progM.some((m) => dayStart(m.t) === g && m.state !== 'post' && !m.off) && g >= simdi);
    if (!gunler.length) return sessiz ? undefined : toast('Bu haftada yayını aranacak maç yok');
    let bos = 0;
    for (let i = 0; i < gunler.length; i++) {
      if (n !== yayinN || kapali || sekme !== LIG) return;
      yayinDurum = 'Yayın ' + (i + 1) + '/' + gunler.length + '…';
      altCiz();
      let y = null;
      try {
        y = await veri.yayin(gunler[i]);
      } catch (e) {
        K.uyar('Yayın akışı: ' + (e && e.message ? e.message : e));
      }
      if (n !== yayinN || kapali || sekme !== LIG) return;
      if (!y) bos++;
      await kanalIsle(gunler[i], y, n);
    }
    if (n !== yayinN || kapali) return;
    yayinDurum = bos === gunler.length ? 'Yayın alınamadı' : 'Yayın kanalları ✓';
    altCiz();
  }
  // Önceden alınmış (taze) yayınlar ağa gitmeden satırlara yazılır; gün verilirse yalnız o günün maçları
  async function kanalIsle(gun, yayin, n) {
    if (sekme !== LIG || !progM) return;
    const gunler = gun != null ? [gun] : haftaGunleri(hafta);
    for (let i = 0; i < gunler.length; i++) {
      const y = gun != null ? yayin : veri.yayinVar(gunler[i]);
      if (!y) continue;
      const g = gunler[i];
      const maclar = progM.filter((m) => dayStart(m.t) === g);
      const kimlik = n != null ? n : yayinN;
      await kanalHaritasi(maclar, y, {
        hedef: kanallar,
        hazir: kanalHazir,
        aktif: () => kimlik === yayinN && !kapali && sekme === LIG,
        parca: (idler) => {
          const k = {};
          for (let j = 0; j < idler.length; j++) k[idler[j]] = true;
          for (const no in liste.nodes) {
            const mc = liste.items[Number(no)];
            if (mc && k[mc.id]) liste.redraw(Number(no));
          }
        },
      }).catch((e) => K.uyar('Kanal eşleme: ' + (e && e.message ? e.message : e)));
    }
  }

  // Takımın maçları: ülke ligi ve Avrupa kupaları sırayla, geldikçe liste büyür
  async function takimAc(fav) {
    const n = ++takimN;
    takimV = { fav, matches: [], durum: 'yukleniyor', mesaj: '' };
    takimCiz();
    duzen();
    try {
      const r = await veri.takim(fav, {
        onPart: (ml) => {
          if (n !== takimN || kapali || !takimV) return;
          takimV.matches = ml;
          takimCiz();
        },
      });
      if (n !== takimN || kapali || !takimV) return;
      takimV.matches = r.matches;
      takimV.durum = '';
      if (r.lg && fav.g !== r.lg) ctx.store.setSetting(FAV_KEY, setFavLeague(favler(), fav.n, r.lg)), favDegisti(); // ülke ligi öğrenildi: sonraki açılışta tarama yok
    } catch (e) {
      if (n !== takimN || kapali || !takimV) return;
      takimV.durum = 'hata';
      takimV.mesaj = String((e && e.message) || 'Maç bilgisi alınamadı').replace(/\.+$/, '');
    }
    takimCiz();
    duzen();
  }
  function takimKapat() {
    takimN++;
    takimV = null;
    takimCiz();
    duzen();
  }

  // ---- seçici (açılır liste) ----
  function seciciAc(mod) {
    const favs = favLigler();
    const sira = mod === 'lig' ? TUM_LIGLER.filter((l) => favs.indexOf(l.id) >= 0).concat(TUM_LIGLER.filter((l) => favs.indexOf(l.id) < 0)) : TUM_LIGLER.slice();
    pickEl.style.display = 'block';
    kok.querySelector('#sp-pkt').textContent = mod === 'lig' ? 'Lig seçin' : 'Favori ligler';
    kok.querySelector('#sp-pkh').textContent = mod === 'lig' ? 'OK: aç · Sarı: favori · Geri: kapat' : 'OK: favori yap / çıkar · Geri: kapat';
    const eski = kok.querySelector('.sp-pk-l');
    const yeni = el('div', 'sp-pk-l'); // her açılışta yeni kap: VList dinleyicileri birikmez
    eski.parentNode.replaceChild(yeni, eski);
    const l = new VList(yeni, {
      rowH: Math.round(px() * 3.8),
      render: (x) => '<span class="nm">' + (favLigler().indexOf(x.id) >= 0 ? '★ ' : '☆ ') + esc(x.name) + '</span>',
      empty: '',
      onActivate: (x) => seciciOk(x),
    });
    sec = { mod, list: l };
    l.setItems(sira, false);
    l.setActive(true);
    const k = ligId ? sira.map((x) => x.id).indexOf(ligId) : -1;
    if (mod === 'lig' && k > 0) l.setIndex(k);
    odakCiz();
  }
  function seciciKapat() {
    if (!sec) return;
    sec = null;
    pickEl.style.display = 'none';
    odakCiz();
  }
  function favLigDegis(id) {
    const f = favLigler();
    const i = f.indexOf(id);
    ctx.store.setSetting(FAVLIG_KEY, i >= 0 ? f.filter((x) => x !== id) : f.concat(id));
    toast(ligAdi(id) + (i >= 0 ? ' favorilerden çıkarıldı' : ' favorilere eklendi'));
    if (sec) sec.list.setItems(sec.list.items, true);
    if (sekme === LIGLER) liglerCiz();
  }
  function seciciOk(x) {
    if (!x) return;
    if (sec.mod === 'favlig') return favLigDegis(x.id);
    seciciKapat();
    ligSec(x.id, true);
  }

  // ---- eylemler ----
  function macAc(m) {
    if (m && m.home) open('mac', { m, gun: dayStart(m.t), veri });
  }
  function listeOk(it) {
    if (!it || it.baslik) return;
    if (it.fav) return takimAc(it.fav);
    if (it.lgId) {
      sekme = LIG; // Liglerim'den bir lig açılınca haftalık program açılır
      return ligSec(it.lgId, true);
    }
    if (it.ekle) return seciciAc('favlig');
    macAc(it);
  }
  function tabloOk(it) {
    if (!it || !it.r) return;
    const s = { name: it.r.name, label: it.r.label };
    const r = toggleFav(favler(), s, ULKE_LIGLERI.indexOf(ligId) >= 0 ? ligId : '');
    if (r.full) return toast('En çok 30 takım takip edilebilir');
    ctx.store.setSetting(FAV_KEY, r.favs);
    favDegisti();
    toast((s.label || s.name) + (r.on ? ' takip ediliyor' : ' takipten çıkarıldı'));
    tablo.setItems(tablo.items, true);
    if (liste.items.length) liste.setItems(liste.items, true);
  }
  function takipDegis(taraf) {
    const m = bolge === 'liste' ? liste.cur : null;
    if (sekme === TAKIM && !takimV && m && m.fav) {
      const f = favler().filter((x) => x.n !== m.fav.n);
      ctx.store.setSetting(FAV_KEY, f);
      favDegisti();
      toast((m.fav.l || m.fav.n) + ' takipten çıkarıldı');
      return takimCiz();
    }
    if (sekme === LIGLER && m && m.lgId) return favLigDegis(m.lgId);
    if (bolge === 'tablo') return tabloOk(tablo.cur);
    if (!m || !m.home) return toast('Takip için listeden bir maç seçin');
    const s = taraf === 'home' ? m.home : m.away;
    const r = toggleFav(favler(), s, ULKE_LIGLERI.indexOf(m.lg) >= 0 ? m.lg : '');
    if (r.full) return toast('En çok 30 takım takip edilebilir');
    ctx.store.setSetting(FAV_KEY, r.favs);
    favDegisti();
    toast((s.label || s.name) + (r.on ? ' takip ediliyor' : ' takipten çıkarıldı'));
    liste.setItems(liste.items, true);
  }

  function sekmeSec(i) {
    if (i === sekme) return;
    clearTimeout(haftaT);
    clearTimeout(canliT);
    clearTimeout(yayinT);
    if (sekme === LIG) yayinIptal(); // Lig sekmesinden çıkınca kanal araması durur
    sekme = i;
    ctx.store.setSetting(SEKME_KEY, i);
    if (i !== TAKIM && takimV) {
      takimN++;
      takimV = null;
    }
    icerikCiz();
    if (i === CANLI) canliZamanla();
    // Lig sekmesine dönülünce yarım kalan kanal araması sürer
    if (i === LIG && progM && progM.length && !progYuk && !/[✓]|alınamadı/.test(yayinDurum)) yayinZamanla(ligN);
  }
  // Sekmede OK: sekmenin verisi yüklenmediyse yükler, yüklüyse içeriğe iner
  function sekmeOk() {
    if (sekme === CANLI) {
      if (!canliM && !canliYuk) return void canliYukle(false);
      if (canliM && canliM.length) bolge = 'liste';
      else return void canliYukle(false);
    } else if (sekme === LIG) {
      if (!ligId) return seciciAc('lig');
      if (!progM && !progYuk) return void ligYukle(false);
      bolge = 'liste';
    } else if (sekme === PUAN) {
      if (!ligId) return seciciAc('lig');
      if (!tabloG && !tabloYuk) return void puanYukle(false);
      bolge = 'tablo';
    } else bolge = 'liste';
    odakCiz();
  }
  function altOk(i) {
    if (i === 0) return seciciAc('lig');
    if (sekme === PUAN) return;
    if (i === 1) return haftaDegis(-1);
    if (i === 2) {
      if (hafta !== haftaBasi(Date.now())) {
        hafta = haftaBasi(Date.now());
        clearTimeout(haftaT);
        if (ligId) ligYukle(false);
        altCiz();
      } else if (!progM && !progYuk) ligYukle(false);
      return;
    }
    if (i === 3) return haftaDegis(1);
    if (!yayinDurum || !/…$/.test(yayinDurum)) yayinGetir();
  }

  // ---- olaylar ----
  tabIc.addEventListener('click', (e) => {
    const n = enYakin(e.target, '[data-t]', tabIc);
    if (!n) return;
    bolge = 'tab';
    sekmeSec(Number(n.getAttribute('data-t')));
    sekmeOk();
  });
  altIc.addEventListener('click', (e) => {
    const n = enYakin(e.target, '[data-a]', altIc);
    if (!n) return;
    altNo = Number(n.getAttribute('data-a'));
    bolge = 'alt';
    odakCiz();
    altOk(altNo);
  });

  function seciciTus(a) {
    const l = sec.list;
    if (a === 'back') return seciciKapat(), true;
    if (a === 'yellow') {
      if (l.cur) favLigDegis(l.cur.id);
      return true;
    }
    if (a === 'ok') {
      seciciOk(l.cur);
      return true;
    }
    l.key(a);
    return true; // seçici açıkken tuşlar altındaki ekrana geçmez
  }

  return {
    el: kok,
    name: 'spor',
    // ◀ en soldayken soldaki menüye geçer
    solKenar: () => !sec && ((bolge === 'tab' && sekme === 0) || (bolge === 'alt' && altNo === 0) || bolge === 'liste' || bolge === 'tablo'),
    onShow() {
      gorunur = true;
      tabloBaslikCiz();
      favDegisti();
      if (!cizildi) {
        cizildi = true;
        icerikCiz(); // ağ yok: ekran yalnız bellekteki veriyi çizer
      } else {
        // maç sayfasından dönüş: imleç yerinde kalır, yalnız satırlar (takip yıldızları) tazelenir
        if (liste.items.length) liste.setItems(liste.items, true);
        if (tablo.items.length) tablo.setItems(tablo.items, true);
        duzen();
      }
      canliZamanla();
    },
    onKey(a) {
      sonTus = Date.now();
      if (sec) return seciciTus(a);
      if (a === 'red' || a === 'green') {
        if (sekme === LIG && ligId) haftaDegis(a === 'red' ? -1 : 1);
        else if (sekme === CANLI && a === 'green') canliYukle(false);
        return true;
      }
      if (a === 'yellow' || a === 'blue') {
        takipDegis(a === 'yellow' ? 'home' : 'away');
        return true;
      }
      if (bolge === 'tab') {
        if (a === 'left' || a === 'right') {
          const i = Math.max(0, Math.min(TABLAR.length - 1, sekme + (a === 'right' ? 1 : -1)));
          if (i !== sekme) sekmeSec(i);
          return true;
        }
        if (a === 'down') {
          bolge = sekme === LIG || sekme === PUAN ? 'alt' : 'liste';
          odakCiz();
          return true;
        }
        if (a === 'ok') {
          sekmeOk();
          return true;
        }
        return false; // ▲ ve Geri: üst çubuk / çıkış
      }
      if (bolge === 'alt') {
        const n = altChipleri().length;
        if (a === 'left' || a === 'right') {
          altNo = Math.max(0, Math.min(n - 1, altNo + (a === 'right' ? 1 : -1)));
          altCiz();
          return true;
        }
        if (a === 'ok') {
          altOk(altNo);
          return true;
        }
        if (a === 'down') {
          bolge = sekme === PUAN ? 'tablo' : 'liste';
          odakCiz();
          return true;
        }
        if (a === 'up') {
          bolge = 'tab';
          odakCiz();
          return true;
        }
        return false;
      }
      if (bolge === 'tablo') {
        if (a === 'left') return true;
        if (a === 'up') {
          if (!adim(tablo, -1)) {
            bolge = 'alt';
            odakCiz();
          }
          return true;
        }
        if (a === 'down') {
          adim(tablo, 1);
          return true;
        }
        if (a === 'ok') {
          tabloOk(tablo.cur);
          return true;
        }
        return a === 'right';
      }
      // bolge === 'liste'
      if (a === 'back' && takimV) {
        takimKapat();
        return true;
      }
      if (a === 'ok' && !liste.items.length) {
        if (sekme === CANLI && !canliYuk) canliYukle(false);
        else if (sekme === LIG && !progYuk) ligYukle(false);
        else if (sekme === TAKIM && takimV && takimV.durum !== 'yukleniyor') takimAc(takimV.fav);
        return true;
      }
      if (a === 'up') {
        if (!adim(liste, -1)) {
          bolge = sekme === LIG ? 'alt' : 'tab';
          odakCiz();
        }
        return true;
      }
      if (a === 'down') {
        adim(liste, 1);
        return true;
      }
      if (a === 'right') return true;
      if (a === 'left') return true;
      if (a === 'ok') {
        listeOk(liste.cur);
        return true;
      }
      return liste.key(a);
    },
    onHide() {
      gorunur = false;
      clearTimeout(canliT);
      clearTimeout(haftaT);
      clearTimeout(yayinT);
    },
    destroy() {
      kapali = true;
      canliN++;
      ligN++;
      takimN++;
      yayinN++;
      puanN++;
      clearTimeout(canliT);
      clearTimeout(haftaT);
      clearTimeout(yayinT);
    },
  };
}
