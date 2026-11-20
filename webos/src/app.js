// Açılış, ekran kaydı, tuş dağıtıcı (uzaktan kumanda) ve saat.
import { ctx, open, pop, top, cikis } from './ctx.js';
import { createStore, bellekDepo } from './store.js';
import { createNet } from './net.js';
import { actionOf } from './keys.js';
import { saatleriYaz, toast } from './ui.js';
import * as K from './log.js';
import { homeScreen } from './screens/home.js';
import { addSourceScreen } from './screens/addsource.js';
import { browseScreen } from './screens/browse.js';
import { detailScreen } from './screens/detail.js';
import { searchScreen } from './screens/search.js';
import { settingsScreen, sourcesScreen, logScreen, aboutScreen } from './screens/settings.js';
import { playerScreen } from './screens/player.js';
import { transferScreen } from './screens/transfer.js';

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

// 1rem = ekran yüksekliğinin 1/54'ü → 1080p'de 20px; tüm ölçüler rem ile yazıldığı için her çözünürlükte aynı görünür.
function boyutla() {
  const h = window.innerHeight || 720;
  document.documentElement.style.fontSize = h / 54 + 'px';
}

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
  const gonder = (t, a) => {
    if (!t) return;
    let tuketildi = false;
    try {
      tuketildi = t.onKey ? !!t.onKey(a) : false;
    } catch (e) {
      K.hata(e);
    }
    if (!tuketildi && a === 'back') {
      if (!pop()) kokGeri();
    }
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
  boyutla();
  window.addEventListener('resize', boyutla);
  tuslariBagla(document);
  setInterval(saatleriYaz, 15000);
  K.bilgi('Açıldı: ' + window.innerWidth + '×' + window.innerHeight);
  if (ctx.store.active()) open('home');
  else open('addsource', { first: true });
  saatleriYaz();
  const b = document.getElementById('boot');
  if (b && b.parentNode) b.parentNode.removeChild(b);
}
