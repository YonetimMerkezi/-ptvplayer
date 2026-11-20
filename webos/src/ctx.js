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

// Üst çubuktaki "‹ Geri" düğmesinin odak durumu: ekranın üst kenarında ▲ ile oraya çıkılır, ▼ ile içeriğe dönülür.
export const geri = { odak: false };
export function geriOdakla(ac) {
  const t = ust();
  const b = t && t.el && t.el.querySelector ? t.el.querySelector('.top-back') : null;
  geri.odak = false;
  if (!b) return false;
  geri.odak = !!ac;
  b.className = 'top-back' + (ac ? ' on' : '');
  return true;
}

export function push(ekran) {
  geriOdakla(false);
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
  geriOdakla(false);
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
  geriOdakla(false);
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
  spor: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3.2l3.6 2.6-1.4 4.2H9.8L8.4 7.8 12 5.2zM6 12.2l2.6-.1 1.1 3.4-2 2.4A7.9 7.9 0 0 1 6 12.2zm8.2 5.7H9.8l1.1-3.4h2.2l1.1 3.4zm2.1-.3l-2-2.4 1.1-3.4 2.6.1a7.9 7.9 0 0 1-1.7 5.7z"/></svg>',
  rehber: '<svg viewBox="0 0 24 24"><path d="M17 10H7v2h10v-2zm2-7h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H5V8h14v11zm-5-5H7v2h7v-2z"/></svg>',
  ayar: '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/></svg>',
  oynat: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  duraklat: '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
  geri10: '<svg viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>',
  ileri10: '<svg viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>',
  sonraki: '<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>',
  onceki: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>',
  liste: '<svg viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>',
  ses: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
  altyazi: '<svg viewBox="0 0 24 24"><path d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/></svg>',
  ekran: '<svg viewBox="0 0 24 24"><path d="M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z"/></svg>',
  senkron: '<svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>',
  bilgi: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
  uyku: '<svg viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>',
  bicim: '<svg viewBox="0 0 24 24"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>',
  geriOk: '<svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>',
};

// Üst çubuk: solda "‹ Geri" düğmesi ve başlık (kök ekranda düğme yok), sağda kaynak adı ve saat
export function ustCubuk(baslik, alt, kok) {
  return '<div class="top"><div class="top-l">' + (kok ? '' : '<div class="top-back" data-geri="1">‹ Geri</div>') + '<h1>' + baslik + '</h1></div><div class="top-r">' + (alt ? '<span class="top-src">' + alt + '</span>' : '') + '<span class="clock"></span></div></div>';
}
