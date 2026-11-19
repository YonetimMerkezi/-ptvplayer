// TV vitrininin fragman katmanı: tam ekran, kontrolsüz YouTube oynatıcısı (DOM). Denetleyici (hero-trailer.js) ne zaman başlayıp duracağını söyler.
// Ses: önce sesli denenir (TV'de kumandaya basmak oynatmaya izin verir); belirli sürede oynamazsa sessiz yeniden denenir; o da olmazsa sıradaki kimliğe geçilir.
import { trailerEmbedUrl } from './cinemeta.js';

export const SOUND_WAIT_MS = 4500;

export function createHeroStage({ host, win = typeof window !== 'undefined' ? window : null, origin = '', onPlaying = () => {}, onEnded = () => {}, soundWait = SOUND_WAIT_MS, timers = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) } }) {
  let ids = [];
  let at = 0;
  let muted = false;
  let frame = null;
  let waitT = null;
  let live = false;
  const clearWait = () => {
    if (waitT) timers.clear(waitT);
    waitT = null;
  };
  const html = (id) => `<iframe class="ht-frame" src="${trailerEmbedUrl(id, { muted, origin }).replace(/&/g, '&amp;')}" title="" tabindex="-1" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  const setLive = (v) => {
    live = v;
    if (host.classList) host.classList.toggle('live', v);
  };
  const mount = () => {
    clearWait();
    setLive(false);
    host.innerHTML = html(ids[at]);
    frame = host.querySelector('iframe');
    if (frame) {
      frame.addEventListener('load', () => {
        try { frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); } catch { /* çapraz köken */ }
      });
    }
    waitT = timers.set(retry, soundWait);
  };
  // Oynamadı: sesliyse sessiz yeniden dene, sessizse sıradaki kimlik; kimlik kalmadıysa bitir
  function retry() {
    waitT = null;
    if (!muted) { muted = true; mount(); return; }
    next();
  }
  function next() {
    if (at + 1 < ids.length) {
      at += 1;
      mount();
      return;
    }
    stop();
    onEnded();
  }
  function onMsg(e) {
    if (!frame || e.source !== frame.contentWindow) return;
    let d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
    if (!d || typeof d !== 'object') return;
    if (d.event === 'onError') { clearWait(); next(); return; }
    const st = d.event === 'onStateChange' ? d.info : d.info && d.info.playerState;
    if (st === 1 && !live) { clearWait(); setLive(true); onPlaying(); } else if (st === 0) { stop(); onEnded(); }
  }
  if (win) win.addEventListener('message', onMsg);
  function stop() {
    clearWait();
    setLive(false);
    frame = null;
    host.innerHTML = '';
  }
  return {
    start(list) {
      ids = (list || []).filter(Boolean);
      at = 0;
      muted = false;
      if (!ids.length) return onEnded();
      mount();
    },
    stop,
    destroy() {
      stop();
      if (win) win.removeEventListener('message', onMsg);
    },
    get live() { return live; },
    get muted() { return muted; },
    get index() { return at; },
  };
}
