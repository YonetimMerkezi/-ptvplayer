// Açılış, ekran kaydı, tuş dağıtıcı (uzaktan kumanda) ve saat.
import { ctx, open, pop, top, cikis, geri, geriOdakla, araVar, provider } from './ctx.js';
import { createStore, bellekDepo } from './store.js';
import { createNet } from './net.js';
import { varlik } from './luna.js';
import { actionOfEvent } from './keys.js';
import { saatleriYaz, toast, enYakin, boyutla } from './ui.js';
import { temaUygula, VARSAYILAN_TEMA } from './tema.js';
import * as K from './log.js';
import { resimYedegiKur } from './resim.js';
import { baslat as donukluguIzle } from './donukluk.js';
import { homeScreen } from './screens/home.js';
import { addSourceScreen } from './screens/addsource.js';
import { browseScreen } from './screens/browse.js';
import { detailScreen } from './screens/detail.js';
import { vizyonDetayScreen } from './screens/vizyon-detay.js';
import { searchScreen } from './screens/search.js';
import { settingsScreen, sourcesScreen, logScreen, aboutScreen } from './screens/settings.js';
import { playerScreen } from './screens/player.js';
import { transferScreen } from './screens/transfer.js';
import { temaScreen } from './screens/tema.js';
import { kumandaScreen } from './screens/kumanda.js';
import { sporScreen } from './screens/spor.js';
import { macScreen } from './screens/mac.js';
import { tusTestiScreen } from './screens/tustesti.js';
import { fragmanTestiScreen } from './screens/fragmantesti.js';
import { adScreen } from './screens/ad.js';
import { ayarKaynagi, donusKaynagi, qrKaynagi, VARSAYILAN_BICIM, VARSAYILAN_YOL } from './fragman.js';
import { donusHazirla, donusUygula, bekciyiDurdur, acilisParametreleri } from './donus.js';
import { fragmanQrScreen } from './screens/fragmanqr.js';
import { telefonKumandaScreen } from './screens/telefonkumanda.js';
import { telefonuBaslat } from './telefon.js';
import { guncelleScreen } from './screens/guncelle.js';
import { otomatikDenetle, guncellemeSonrasi } from './guncelle.js';
import { MAGAZA } from './version.js';
import { dilKur } from './dil.js';
import { hoverBagla } from './vurgu.js';

const UZUN_BASMA_MS = 650;

function depoSec() {
  try {
    const d = window.localStorage;
    d.setItem('iptv.t', '1');
    d.removeItem('iptv.t');
    return d;
  } catch (e) {
    K.uyar('Kalıcı depo yok: ayarlar yalnız bu oturumda tutulur');
    return bellekDepo();
  }
}

const yaziOlcegi = () => Number(ctx.store.setting('fontScale', '1')) || 1;

export function tuslariBagla(doc) {
  let okAsagida = false;
  let okUzun = false;
  let okT = 0;
  let geriBasildi = false; // Geri için keydown görüldü mü (bazı yazılımlarda yalnız keyup gelir)
  let sonKokGeri = 0;
  let izSayac = 0;
  let sonGeriT = 0; // son Geri tuşu olayının zamanı (geçmiş adımıyla yinelenmesin)

  const aktifGiris = () => {
    const a = doc.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') ? a : null;
  };
  // Geri ve tanınmayan tuşların kodu Hata kaydına yazılır: TV'nin ne gönderdiği ekrandan okunabilsin
  const iz = (tur, e, a) => {
    if (izSayac >= 60 || aktifGiris()) return;
    if (a && a !== 'back') return;
    izSayac++;
    K.bilgi('Tuş ' + tur + ' ' + e.keyCode + (a ? ' → ' + a : ' (tanımsız)'));
  };
  // Kök ekranda Geri: kazara çıkmasın diye iki kez basılması istenir
  const kokGeri = () => {
    const s = Date.now();
    if (sonKokGeri && s - sonKokGeri < 2500) {
      sonKokGeri = 0;
      cikis();
      return;
    }
    sonKokGeri = s;
    toast('Çıkmak için Geri tuşuna tekrar basın');
  };
  const geriGit = () => {
    if (!pop()) kokGeri();
  };
  // Üst çubuktaki Ara düğmesi: ekran kapsamı biliyorsa (Filmler → yalnız filmler) ona göre, yoksa tüm katalogda arar
  const araAc = (t) => {
    if (t && t.araAc) t.araAc();
    else open('search');
  };
  const gonder = (t, a) => {
    if (!t) return;
    if (geri.odak) {
      // Odak üst çubuktaki Geri düğmesinde: OK/Geri geri döner, ▼ içeriğe iner, yön tuşları yerinde kalır
      if (a === 'ok' && geri.dugme === 'ara') {
        geriOdakla(false);
        araAc(t);
        return;
      }
      if (a === 'ok' || a === 'back') {
        geriOdakla(false);
        geriGit();
        return;
      }
      if (a === 'down') {
        geriOdakla(false);
        return;
      }
      // ◀▶ Geri ile Ara arasında gezer (Ara yoksa yerinde kalır)
      if (a === 'right' && geri.dugme === 'geri' && araVar()) geriOdakla(true, 'ara');
      else if (a === 'left' && geri.dugme === 'ara') geriOdakla(true, 'geri');
      if (a === 'up' || a === 'left' || a === 'right') return;
      geriOdakla(false);
    }
    let tuketildi = false;
    try {
      tuketildi = t.onKey ? !!t.onKey(a) : false;
    } catch (e) {
      K.hata(e);
    }
    if (tuketildi) return;
    // Ekranın üst kenarında ▲: odak Geri düğmesine çıkar
    if (a === 'up' && t.name !== 'player' && geriOdakla(true)) return;
    if (a === 'back') geriGit();
  };
  // keydown gövdesi; Geri keyup ile gelirse aynı yoldan geçirilir
  const isle = (e, a) => {
    const t = top();
    if (!t) return;
    const giris = aktifGiris();
    if (giris) {
      // Ekran klavyesi açıkken harfler girişe gider; yalnız ekranın istediği tuşlar yakalanır
      if (a && t.onInputKey && t.onInputKey(a, e, giris)) e.preventDefault();
      return;
    }
    if (!a) return;
    e.preventDefault();
    if (a === 'back' && e.repeat) return; // tuşa basılı tutmak art arda çıkış sayılmasın
    if (a === 'ok') {
      if (t.longOk) {
        if (!okAsagida) {
          okAsagida = true;
          okUzun = false;
          okT = setTimeout(() => {
            okUzun = true;
            try {
              if (t.onLong) t.onLong();
            } catch (er) {
              K.hata(er);
            }
          }, UZUN_BASMA_MS);
        }
        return;
      }
      if (e.repeat) return;
    }
    gonder(t, a);
  };

  // Yakalama aşamasında dinlenir: hiçbir öğe olayı durduramadan uygulamaya ulaşır
  doc.addEventListener('keydown', (e) => {
    const a = actionOfEvent(e);
    iz('keydown', e, a);
    if (a === 'back') {
      geriBasildi = true;
      sonGeriT = Date.now();
    }
    isle(e, a);
  }, true);
  // Magic Remote imleci / fare: Geri düğmesine tıklama
  doc.addEventListener('click', (e) => {
    if (enYakin(e.target, '.top-ara', doc.documentElement || null)) {
      geriOdakla(false);
      araAc(top());
      return;
    }
    if (!enYakin(e.target, '.top-back', doc.documentElement || null)) return;
    geriOdakla(false);
    gonder(top(), 'back');
  });
  doc.addEventListener('keyup', (e) => {
    const a = actionOfEvent(e);
    if (a === 'back') {
      const gordu = geriBasildi;
      geriBasildi = false;
      if (!gordu) {
        sonGeriT = Date.now();
        iz('keyup', e, a);
        isle(e, a);
      }
      return;
    }
    if (a !== 'ok' || !okAsagida) return;
    okAsagida = false;
    clearTimeout(okT);
    const uzundu = okUzun;
    okUzun = false;
    if (!uzundu) gonder(top(), 'ok');
  });
}

export function kaydet() {
  ctx.reg = {
    home: homeScreen,
    addsource: addSourceScreen,
    transfer: transferScreen,
    tema: temaScreen,
    kumanda: kumandaScreen,
    spor: sporScreen,
    mac: macScreen,
    tustesti: tusTestiScreen,
    fragmantesti: fragmanTestiScreen,
    fragmanqr: fragmanQrScreen,
    telefonkumanda: telefonKumandaScreen,
    guncelle: MAGAZA ? null : guncelleScreen,
    ad: adScreen,
    browse: browseScreen,
    detail: detailScreen,
    vizyon: vizyonDetayScreen,
    search: searchScreen,
    settings: settingsScreen,
    sources: sourcesScreen,
    log: logScreen,
    about: aboutScreen,
    player: playerScreen,
  };
}

export function start() {
  K.yakala(window);
  donukluguIzle(() => (top() ? top().name : ''));
  ctx.store = createStore(depoSec());
  dilKur(ctx.store);
  ctx.net = createNet({ ayar: () => ctx.store.setting('netMode', 'auto') });
  ctx.root = document.getElementById('app');
  kaydet();
  boyutla(yaziOlcegi());
  window.addEventListener('resize', () => boyutla(yaziOlcegi()));
  ayarKaynagi(() => ({ bicim: ctx.store.setting('ytBicim2', VARSAYILAN_BICIM), kapat: ctx.store.setting('ytKapat', true), ikinci: ctx.store.setting('ytIkinci', false), yol: ctx.store.setting('ytYol', VARSAYILAN_YOL) }));
  qrKaynagi((p) => open('fragmanqr', p));
  donusKaynagi(() => donusHazirla());
  const tema = ctx.store.setting('theme', VARSAYILAN_TEMA);
  temaUygula(tema).catch((e) => K.hata(e)); // varsayılan tema da boyanmış CSS ister; kaldırılmış (tek renkli) kayıtlı tema varsayılana döner
  tuslariBagla(document);
  hoverBagla(document); // Magic Remote / telefon imleci üzerine gelince vurgu
  resimYedegiKur(document); // yüklenemeyen logo: servis yedeği, olmazsa gizle (kırık simge görünmez)
  setInterval(saatleriYaz, 15000);
  K.bilgi('Açıldı: ' + window.innerWidth + '×' + window.innerHeight);
  if (ctx.store.active()) {
    open('home');
    // Fragman sayfasından dönüş: kapanmadan önceki ekranlar geri kurulur (kayıt varsa; elle açıldıysa bekçi sessizce durdurulur)
    const dn = donusUygula();
    const bekciAcmadi = dn.kayit && !acilisParametreleri().donus; // fragmandan çıkıldı ama TV servisindeki bekçi uygulamayı açmadı (elle açıldı)
    if (bekciAcmadi) bekciyiDurdur(); // ikinci kez açmasın
    if (dn.donus) {
      K.bilgi('Fragmandan dönüldü: ' + dn.acilan + ' ekran açıldı' + (dn.tani ? ' · ' + dn.tani : ''));
      if (!bekciAcmadi) setTimeout(() => toast('Fragmandan döndünüz', 2500), 600);
    }
    // Açılışta son kanal: en son izlenen canlı kanal doğrudan oynar (Geri ana sayfaya döner)
    if (!dn.donus && ctx.store.setting('autoplay', false)) {
      const son = ctx.store.recents(ctx.store.active().id).filter((r) => r.item && r.item.kind === 'live')[0];
      if (son) open('player', { list: [son.item], index: 0 });
    }
  } else open('addsource', { first: true });
  saatleriYaz();
  const b = document.getElementById('boot');
  if (b && b.parentNode) b.parentNode.removeChild(b);
  if (!MAGAZA) {
    guncellemeSonrasi({ store: ctx.store, bildir: (t) => setTimeout(() => toast(t, 4000), 800) });
    setTimeout(() => {
      if (varlik()) otomatikDenetle({ net: ctx.net, store: ctx.store, bildir: (t) => toast(t, 5000) }).catch((e) => K.hata(e)); // arka planda, en çok 12 saatte bir
    }, 25000);
  }
  setTimeout(telefonuBaslat, 1500); // telefon kumandası açık bırakıldıysa sunucu ve yoklama başlar
  setTimeout(isit, 3000); // ana sayfa çizildikten sonra Filmler/Diziler'in açılacağı kategori arka planda önbelleğe alınır
}

// Filmler ve Diziler'de son açılan (yoksa ilk) kategorinin içeriği önceden indirilir: bölüme girince liste hazır gelir.
// Yalnız Xtream; sırayla ve arka planda (grup yok: kullanıcı başka kategoriye geçse de kesilmez); hata sessizce geçilir.
function isit() {
  try {
    const src = ctx.store.active();
    const p = provider();
    if (!src || !p || p.type !== 'xtream') return;
    ['movie', 'series'].reduce(
      (zincir, tur) =>
        zincir
          .then(() => p.categories(tur))
          .then((cats) => {
            const son = String(ctx.store.setting('kat:' + tur + ':' + src.id, ''));
            const c = cats.filter((x) => String(x.id) === son)[0] || cats[0];
            return c ? p.items(tur, c.id, null) : null;
          })
          .catch(() => {}),
      Promise.resolve(),
    );
  } catch (e) {
    /* ısınma başarısız: bölüm açılınca normal yoldan yüklenir */
  }
}
