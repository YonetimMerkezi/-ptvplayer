// Açılış animasyonunun kapanışı. Animasyonun kendisi index.html + app.css'tedir (betik yüklenmeden de oynar);
// burada yalnız "arayüz hazır" bildirimi vardır: animasyon sayfa açılalı en az INTRO_MIN_MS sürer, sonra solarak kalkar.
// Uygulamayı geciktirmez: arayüz daha geç hazırsa beklenmez, daha erken hazırsa yalnız animasyonun bitmesi beklenir.

export const INTRO_MIN_MS = 1250; // logo belirir + ışık geçer, ardından kalkar
export const INTRO_FADE_MS = 400; // app.css #intro.out geçişiyle aynı

// Animasyonun kalkmasına kalan süre: sayfa açılalı geçen süre (ms) en az `min` olmalı.
export const introWait = (elapsed, min = INTRO_MIN_MS) => Math.max(0, min - Math.max(0, Number(elapsed) || 0));

// Arayüz ilk kez çizildi: animasyonu kaldır. Tekrar çağrılması zararsızdır (öğe kalkınca bir şey yapmaz).
export function finishIntro(doc = document, elapsed = typeof performance !== 'undefined' ? performance.now() : INTRO_MIN_MS) {
  const el = doc.getElementById('intro');
  if (!el || el.dataset.ending) return;
  el.dataset.ending = '1';
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), INTRO_FADE_MS + 80);
  }, introWait(elapsed));
}
