// Açılış, ekran kaydı, tuş dağıtıcı (uzaktan kumanda) ve saat.
import { ctx, open, pop, top, cikis, geri, geriOdakla } from './ctx.js';
import { createStore, bellekDepo } from './store.js';
import { createNet } from './net.js';
import { actionOf } from './keys.js';
import { saatleriYaz, toast, enYakin, boyutla } from './ui.js';
import { temaUygula, VARSAYILAN_TEMA } from './tema.js';
import * as K from './log.js';
import { homeScreen } from './screens/home.js';
import { addSourceScreen } from './screens/addsource.js';
import { browseScreen } from './screens/browse.js';
import { detailScreen } from './screens/detail.js';
import { searchScreen } from './screens/search.js';
import { settingsScreen, sourcesScreen, logScreen, aboutScreen } from './screens/settings.js';
import { playerScreen } from './screens/player.js';
import { transferScreen } from './screens/transfer.js';
import { temaScreen } from './screens/tema.js';
import { kumandaScreen } from './screens/kumanda.js';

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
  const gonder = (t, a) => {
    if (!t) return;
    if (geri.odak) {
      // Odak üst çubuktaki Geri düğmesinde: OK/Geri geri döner, ▼ içeriğe iner, yön tuşları yerinde kalır
      if (a === 'ok' || a === 'back') {
        geriOdakla(false);
        geriGit();
        return;
      }
      if (a === 'down') {
        geriOdakla(false);
        return;
      }
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

  doc.addEventListener('keydown', (e) => {
    const a = actionOf(e.keyCode);
    iz('keydown', e, a);
    if (a === 'back') geriBasildi = true;
    isle(e, a);
  });
  // Magic Remote imleci / fare: Geri düğmesine tıklama
  doc.addEventListener('click', (e) => {
    if (!enYakin(e.target, '.top-back', doc.documentElement || null)) return;
    geriOdakla(false);
    gonder(top(), 'back');
  });
  doc.addEventListener('keyup', (e) => {
    const a = actionOf(e.keyCode);
    if (a === 'back') {
      const gordu = geriBasildi;
      geriBasildi = false;
      if (!gordu) {
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
    browse: browseScreen,
    detail: detailScreen,
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
  ctx.store = createStore(depoSec());
  ctx.net = createNet({ ayar: () => ctx.store.setting('netMode', 'auto') });
  ctx.root = document.getElementById('app');
  kaydet();
  boyutla(yaziOlcegi());
  window.addEventListener('resize', () => boyutla(yaziOlcegi()));
  const tema = ctx.store.setting('theme', VARSAYILAN_TEMA);
  if (tema !== VARSAYILAN_TEMA) temaUygula(tema).catch((e) => K.hata(e));
  tuslariBagla(document);
  setInterval(saatleriYaz, 15000);
  K.bilgi('Açıldı: ' + window.innerWidth + '×' + window.innerHeight);
  if (ctx.store.active()) {
    open('home');
    // Açılışta son kanal: en son izlenen canlı kanal doğrudan oynar (Geri ana sayfaya döner)
    if (ctx.store.setting('autoplay', false)) {
      const son = ctx.store.recents(ctx.store.active().id).filter((r) => r.item && r.item.kind === 'live')[0];
      if (son) open('player', { list: [son.item], index: 0 });
    }
  } else open('addsource', { first: true });
  saatleriYaz();
  const b = document.getElementById('boot');
  if (b && b.parentNode) b.parentNode.removeChild(b);
}
