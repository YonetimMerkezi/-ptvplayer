// TV vitrininde fragman denetleyicisi (saf mantık, DOM yok). Akış:
//   odaktaki yapımda PREFETCH_MS sonra fragman kimliği çözülmeye başlar (hızlı gezerken ağa gidilmez), DWELL_MS dolunca oynar
//   → oynamaya başlayınca CINE_MS sonra ekrandaki bilgiler kaybolur (sinema kipi)
//   → herhangi bir tuş/dokunuş bilgiyi geri getirir, hareketsiz kalınca yine kaybolur → odak başka yapıma geçince ya da video bitince durur.
// resolve(it): Promise<string[]> (YouTube kimlikleri; boşsa fragman yok). start(ids, it): oynatıcıyı kurar. stop(): kaldırır.
// setCine(bool): bilgileri gizler/gösterir. enabled(it): bu yapım için çalışsın mı. timers: sınama için sahte zamanlayıcı.
export const DWELL_MS = 1500;
export const PREFETCH_MS = 400;
export const CINE_MS = 4000;

export function createHeroTrailer({ dwell = DWELL_MS, prefetch = PREFETCH_MS, cine = CINE_MS, resolve, start, stop, setCine, enabled = () => true, timers = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) } }) {
  let cur = null; // odaktaki yapım
  let state = 'idle'; // idle | arming | resolving | loading | playing
  let skip = ''; // bitmiş / başarısız / fragmanı olmayan yapım: odak değişene dek yeniden denenmez
  let cineOn = false;
  let seq = 0;
  let dwellT = null;
  let preT = null;
  let cineT = null;
  const clearTimers = () => {
    if (dwellT) timers.clear(dwellT);
    if (preT) timers.clear(preT);
    if (cineT) timers.clear(cineT);
    dwellT = preT = cineT = null;
  };
  const showInfo = () => {
    if (!cineOn) return;
    cineOn = false;
    setCine(false);
  };
  // Oynatıcıyı ve zamanlayıcıları bırakır; bilgi geri gelir
  const halt = () => {
    clearTimers();
    seq += 1;
    if (state === 'loading' || state === 'playing') stop();
    state = 'idle';
    showInfo();
  };
  const armCine = () => {
    if (cineT) timers.clear(cineT);
    cineT = timers.set(() => {
      cineT = null;
      if (state !== 'playing' || cineOn) return;
      cineOn = true;
      setCine(true);
    }, cine);
  };
  return {
    // Vitrin bir yapımı gösterdi (aynı yapım yeniden boyanırsa süren fragman kesilmez)
    focus(it) {
      if (it && cur && it.id === cur.id) return;
      halt();
      cur = it || null;
      skip = '';
      if (!cur || !enabled(cur)) return;
      state = 'arming';
      const my = seq;
      const target = cur;
      let found = null; // çözme bekleme süresiyle paralel yürür: bekleme dolduğunda sonuç çoktan hazır olabilir
      const lookup = () => (found = found || Promise.resolve().then(() => resolve(target)).then((r) => r || [], () => []));
      preT = timers.set(() => { preT = null; lookup(); }, prefetch);
      dwellT = timers.set(async () => {
        dwellT = null;
        if (my !== seq || state !== 'arming') return;
        state = 'resolving';
        const ids = await lookup();
        if (my !== seq || state !== 'resolving') return;
        if (!ids.length) { state = 'idle'; skip = cur.id; return; }
        state = 'loading';
        start(ids, cur);
      }, dwell);
    },
    // Oynatıcıdan: video oynamaya başladı
    playing() {
      if (state !== 'loading' && state !== 'playing') return;
      state = 'playing';
      armCine();
    },
    // Oynatıcıdan: video bitti ya da hiçbir kimlik oynatılamadı
    ended() {
      if (state === 'idle') return;
      const id = cur && cur.id;
      halt();
      skip = id || '';
    },
    // Kullanıcı tuşa bastı / dokundu: bilgi geri gelir, hareketsizlik sayacı yeniden başlar
    activity() {
      if (state !== 'playing') return;
      showInfo();
      armCine();
    },
    // Vitrin kapandı, sayfa/oynatıcı açıldı, uygulama arka plana gitti
    cancel() {
      halt();
      cur = null;
      skip = '';
    },
    get state() { return state; },
    get cine() { return cineOn; },
  };
}
