// Açılış, ekran kaydı, tuş dağıtıcı (uzaktan kumanda) ve saat.
import { ctx, open, pop, top, cikis } from './ctx.js';
import { createStore, bellekDepo } from './store.js';
import { createNet } from './net.js';
import { actionOf } from './keys.js';
import { saatleriYaz } from './ui.js';
import * as K from './log.js';
import { homeScreen } from './screens/home.js';
import { addSourceScreen } from './screens/addsource.js';
import { browseScreen } from './screens/browse.js';
import { detailScreen } from './screens/detail.js';
import { searchScreen } from './screens/search.js';
import { settingsScreen, sourcesScreen, logScreen, aboutScreen } from './screens/settings.js';
import { playerScreen } from './screens/player.js';

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

  const aktifGiris = () => {
    const a = doc.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') ? a : null;
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
      if (!pop()) cikis();
    }
  };

  doc.addEventListener('keydown', (e) => {
    const a = actionOf(e.keyCode);
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
  });
  doc.addEventListener('keyup', (e) => {
    if (actionOf(e.keyCode) !== 'ok' || !okAsagida) return;
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
