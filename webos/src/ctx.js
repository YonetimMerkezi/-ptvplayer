// Ortak bağlam: depo, ağ, etkin kaynağın veri sağlayıcısı ve ekran yığını.
import { createProvider } from './data.js';
import { saatleriYaz } from './ui.js';
import { luna } from './luna.js';
import * as K from './log.js';

export const ctx = {
  store: null,
  net: null,
  root: null,
  stack: [],
  reg: {}, // ekran adı → kurucu işlev
  _prov: null,
  _provId: '',
};

export function provider() {
  const s = ctx.store.active();
  if (!s) return null;
  if (!ctx._prov || ctx._provId !== s.id) {
    ctx._prov = createProvider(s, ctx.net);
    ctx._provId = s.id;
    K.bilgi('Kaynak: ' + s.name + ' (' + s.type + ')');
  }
  return ctx._prov;
}
export function sifirlaSaglayici() {
  ctx._prov = null;
  ctx._provId = '';
}

// Kaynağı doğrular (giriş yapılabiliyor mu) ve ekler; olmazsa hata fırlatır.
// Elle ekleme ve telefondan aktarma aynı yolu kullanır.
export async function kaynakEkle(src) {
  const p = createProvider(src, ctx.net);
  const r = await p.auth();
  if (!r.ok) throw new Error(r.reason || 'Doğrulanamadı');
  const kaydedilen = ctx.store.addSource(src);
  sifirlaSaglayici();
  K.bilgi('Kaynak eklendi: ' + kaydedilen.name);
  return kaydedilen;
}

const ust = () => ctx.stack[ctx.stack.length - 1];

export function push(ekran) {
  const t = ust();
  if (t) {
    if (t.onHide) t.onHide();
    t.el.style.display = 'none';
  }
  ctx.stack.push(ekran);
  ctx.root.appendChild(ekran.el);
  saatleriYaz();
  if (ekran.onShow) ekran.onShow();
}

export function pop() {
  if (ctx.stack.length <= 1) return false;
  const e = ctx.stack.pop();
  if (e.onHide) e.onHide();
  if (e.destroy) e.destroy();
  ctx.root.removeChild(e.el);
  const t = ust();
  if (t) {
    t.el.style.display = '';
    if (t.onShow) t.onShow();
  }
  return true;
}

export function open(ad, arg) {
  if (!ctx.reg[ad]) throw new Error('Ekran yok: ' + ad);
  push(ctx.reg[ad](arg));
}

// Yığını tek ekrana indir (örn. kaynak değişince ana sayfaya dön)
export function resetTo(ad, arg) {
  while (ctx.stack.length) {
    const e = ctx.stack.pop();
    if (e.onHide) e.onHide();
    if (e.destroy) e.destroy();
    if (e.el.parentNode) e.el.parentNode.removeChild(e.el);
  }
  open(ad, arg);
}

export const top = ust;

// Uygulamadan çıkış. TV yazılımına göre işe yarayan yol değiştiği için sırayla denenir:
// platformBack → window.close → (hâlâ açıksak) TV ana ekranını açma.
export function cikis() {
  let yontem = 'yok';
  try {
    if (window.PalmSystem && window.PalmSystem.platformBack) {
      window.PalmSystem.platformBack();
      yontem = 'platformBack';
    }
  } catch (e) {
    K.hata(e);
  }
  K.bilgi('Çıkış istendi (' + yontem + ')');
  setTimeout(() => {
    try {
      window.close();
    } catch (e) {
      /* yoksay */
    }
  }, 250);
  setTimeout(() => {
    // Buraya gelindiyse uygulama kapanmamıştır; en azından TV ana ekranına dön
    K.uyar('Uygulama kapanmadı; ana ekran açılıyor');
    luna('luna://com.webos.applicationManager/launch', { id: 'com.webos.app.home' }, 5000).catch((e) => K.hata(e));
  }, 1000);
}

export const ikon = {
  tv: '<svg viewBox="0 0 24 24"><path d="M21 3H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5v2h8v-2h5a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 14H3V5h18v12z"/></svg>',
  film: '<svg viewBox="0 0 24 24"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4h-4z"/></svg>',
  dizi: '<svg viewBox="0 0 24 24"><path d="M4 6H2v14a2 2 0 0 0 2 2h14v-2H4V6zm16-4H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/></svg>',
  yildiz: '<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
  gecmis: '<svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 1 1 2.05 4.95l-1.42 1.42A9 9 0 1 0 13 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>',
  ara: '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
  ayar: '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/></svg>',
};

// Üst çubuk: başlık solda, kaynak adı ve saat sağda
export function ustCubuk(baslik, alt) {
  return '<div class="top"><h1>' + baslik + '</h1><div class="top-r">' + (alt ? '<span class="top-src">' + alt + '</span>' : '') + '<span class="clock"></span></div></div>';
}
