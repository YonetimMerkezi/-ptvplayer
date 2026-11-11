// TV vitrini: kumandayla gezilen film/dizi kutusunun ayrıntısı (ad, puan, özet, oyuncular) ve geniş arka planı.
// Burada yalnız saf mantık var (bekleme, iptal, tek istek, hata kapama, görünüm modeli); DOM işi app.js'tedir.

export const HERO_DELAY_MS = 300; // odakta bu kadar durulursa ayrıntı istenir (hızlı gezerken ağa gidilmez)
export const HERO_MAX_FAILS = 3; // üst üste bu kadar hatadan sonra o oturumda istek atılmaz

const uniq = (list) => [...new Set(list.filter(Boolean))];

// Vitrin açıkken kutu genişliği ekrana oranlı: 960×540'ta ~8, 1280×720'de ~9, 1920×1080'de ~9 sütun; altta 1-2 satır görünür kalır.
export function heroCellW(viewW) {
  return Math.max(96, Math.min(190, Math.round(viewW / 10.5)));
}

// Vitrinde gösterilecek alanlar. info: get_vod_info sonucu (olmayabilir); it: listedeki öğe.
export function heroModel(it, info) {
  const i = info || {};
  const rating = i.rating || it.rating || '';
  const year = i.year ? String(i.year).slice(0, 4) : '';
  const mins = i.durationSec > 0 ? Math.round(i.durationSec / 60) : 0;
  return {
    title: it.name || '',
    rating: rating ? String(rating) : '',
    meta: [year, mins ? `${mins} dk` : '', i.genre || ''].filter(Boolean),
    cast: i.cast || '',
    director: i.director || '',
    plot: i.plot || it.plot || '',
    // geniş görsel önce, afiş yedek: biri yüklenmezse sıradaki denenir
    bg: uniq([i.backdrop, it.backdrop, i.logo, it.logo]),
    wide: !!(i.backdrop || it.backdrop),
  };
}

// Odak değişince çağrılan denetleyici.
//   peek(it) → bellekteki ayrıntı ya da null     canLoad(it) → bu öğe için ayrıntı istenebilir mi
//   load(it) → Promise<ayrıntı|null>             paint(it, info) → ekrana çiz (info olmayabilir)
export function createHero({ peek, canLoad, load, paint, delay = HERO_DELAY_MS, maxFails = HERO_MAX_FAILS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let cur = null; // şu an odaktaki öğe
  let wanted = null; // bekleme dolmuş, ayrıntısı istenen öğe
  let timer = 0;
  let inflight = false;
  let fails = 0;

  const needs = (it) => !!it && canLoad(it) && !peek(it);

  function pump() {
    if (inflight || !wanted || fails >= maxFails) return;
    const it = wanted;
    if (!needs(it)) return;
    inflight = true;
    load(it)
      .then((info) => {
        fails = 0;
        if (cur === it) paint(it, info || peek(it) || null);
      })
      .catch(() => {
        fails++;
      })
      .finally(() => {
        inflight = false;
        // yoldayken odak başka kutuya geçip beklemesini doldurduysa sırası gelir
        if (wanted && wanted !== it) pump();
      });
  }

  return {
    focus(it) {
      if (!it || it === cur) return;
      cur = it;
      wanted = null;
      clearTimer(timer);
      timer = 0;
      paint(it, peek(it) || null); // listedeki bilgi ve bellekteki ayrıntı hemen
      if (!needs(it) || fails >= maxFails) return;
      timer = setTimer(() => {
        timer = 0;
        wanted = it;
        pump();
      }, delay);
    },
    // vitrin kapanır (liste yok oldu, kategoriden çıkıldı)
    stop() {
      cur = null;
      wanted = null;
      clearTimer(timer);
      timer = 0;
    },
    // kaynak değişti ya da kullanıcı yeniden denemek istiyor
    reset() {
      fails = 0;
    },
    get current() {
      return cur;
    },
    get disabled() {
      return fails >= maxFails;
    },
  };
}
