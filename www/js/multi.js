// Çoklu ekran: aynı anda birkaç canlı kanal, her kutu kendi oynatıcısında; yalnız seçili kutu sesli.
// Android'de her kutu ayrı bir Media3 oynatıcısıdır (WebView'ın altında, kutunun dikdörtgenine yerleşir);
// tarayıcıda kutuya bir <video> eklenir.
import { describeError } from './engine.js';
import { LIVE_STALL_MS, LIVE_MAX_RECONNECT, STEADY_MS, reconnectDelay } from './retry.js';

const FIRST_STALL_MS = 15000; // ilk açılışta yayının gelmesi için

// Kayıtlı kanal kimliklerini n kutuya sığdırır (eksikler null).
export const fitSlots = (ids, n) => Array.from({ length: n }, (_, i) => (Array.isArray(ids) && ids[i] != null ? ids[i] : null));

// Kutu bekçisi: takılan ya da kopan kutuyu hızla yeniden bağlar (art arda başarısızsa yedek adrese de geçer).
// restart(slot, rotate): kutuyu yeniden başlat (rotate: sıradaki adrese geç);
// status(slot, 'loading' | 'playing' | 'error', mesaj, deneme): kutunun görünümünü güncelle.
export function createSlotSupervisor({ restart, status, timers = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) }, now = () => Date.now() }) {
  const all = new Map();
  const get = (slot) => {
    let e = all.get(slot);
    if (!e) all.set(slot, (e = { rc: 0, n: 1, retry: null, watch: null, since: null, played: false }));
    return e;
  };
  const clearWatch = (e) => {
    if (e.watch) timers.clear(e.watch);
    e.watch = null;
  };
  const armWatch = (slot, e) => {
    clearWatch(e);
    e.watch = timers.set(() => {
      e.watch = null;
      problem(slot, 'Yayın başlamadı (zaman aşımı)');
    }, e.played ? LIVE_STALL_MS : FIRST_STALL_MS);
  };
  function problem(slot, message) {
    const e = get(slot);
    clearWatch(e);
    if (e.retry) return; // yeniden bağlanma zaten planlı
    if (e.since !== null && now() - e.since >= STEADY_MS) e.rc = 0; // uzun süre sorunsuz oynadı: sayaç sıfır
    e.since = null;
    const n = e.rc++;
    if (n >= LIVE_MAX_RECONNECT) return status(slot, 'error', message || 'Yayın oynatılamadı', n);
    const rotate = e.n > 1 && (!e.played || n >= 2);
    status(slot, 'loading', '', n + 1);
    e.retry = timers.set(() => {
      e.retry = null;
      restart(slot, rotate);
    }, reconnectDelay(n));
  }
  return {
    // Kutu (yeniden) başlatılırken: bekçiyi kur. nTargets: yedek adres sayısı dahil toplam adres.
    begin(slot, nTargets = 1) {
      const e = get(slot);
      e.n = nTargets;
      armWatch(slot, e);
    },
    // Motor olayı: 'playing' | 'buffering' | 'error' | 'ended'
    event(slot, state, message) {
      const e = get(slot);
      if (state === 'playing') {
        clearWatch(e);
        if (e.retry) {
          timers.clear(e.retry);
          e.retry = null;
        }
        e.played = true;
        if (e.since === null) e.since = now();
        return status(slot, 'playing', '', 0);
      }
      if (e.retry) return; // bağlantı beklenirken gelen geçici durumlar sayacı bozmasın
      if (state === 'buffering') {
        if (!e.watch) armWatch(slot, e); // takılma sürerse yeniden bağlan
        return status(slot, e.played ? 'buffering' : 'loading', '', e.rc);
      }
      if (state === 'error' || state === 'ended') return problem(slot, message);
    },
    clear(slot) {
      const e = all.get(slot);
      if (!e) return;
      clearWatch(e);
      if (e.retry) timers.clear(e.retry);
      all.delete(slot);
    },
    clearAll() {
      [...all.keys()].forEach((k) => this.clear(k));
    },
  };
}

export function createMultiEngine({ native, Hls, on }) {
  if (native) {
    native.addListener('multi', (e) => on({ slot: e.slot, state: e.state, message: e.state === 'error' ? describeError(e.message) : '' })).catch(() => {});
    return {
      kind: 'native',
      start: (slot, target, { rect, muted }) =>
        native.multiPlay({ slot, url: target.url, mime: target.mime || 'auto', headers: target.headers || {}, x: rect.x, y: rect.y, w: rect.w, h: rect.h, muted: !!muted }),
      rect: (slot, r) => native.multiRect({ slot, x: r.x, y: r.y, w: r.w, h: r.h }),
      mute: (slot, muted) => native.multiMute({ slot, muted: !!muted }),
      stop: (slot) => native.multiStop({ slot }),
      stopAll: () => native.multiStopAll(),
    };
  }
  const vids = new Map(); // slot -> { video, hls }
  const clean = (slot) => {
    const v = vids.get(slot);
    if (!v) return;
    if (v.hls) v.hls.destroy();
    v.video.removeAttribute('src');
    v.video.load();
    v.video.remove();
    vids.delete(slot);
  };
  return {
    kind: 'web',
    async start(slot, target, { muted, host }) {
      clean(slot);
      const video = document.createElement('video');
      video.className = 'mp-v';
      video.muted = !!muted;
      video.autoplay = true;
      video.playsInline = true;
      host.append(video);
      const rec = { video, hls: null };
      vids.set(slot, rec);
      video.addEventListener('waiting', () => on({ slot, state: 'buffering' }));
      video.addEventListener('playing', () => on({ slot, state: 'playing' }));
      video.addEventListener('error', () => video.getAttribute('src') && on({ slot, state: 'error', message: 'Tarayıcı bu yayını oynatamıyor' }));
      const isHls = target.mime === 'hls' || /\.m3u8(\?|$)/i.test(target.url);
      if (isHls && Hls && Hls.isSupported()) {
        rec.hls = new Hls({ maxBufferLength: 20 });
        rec.hls.on(Hls.Events.ERROR, (_, d) => d && d.fatal && on({ slot, state: 'error', message: d.type === 'networkError' ? 'Sunucuya bağlanılamadı' : 'Yayın oynatılamadı' }));
        rec.hls.loadSource(target.url);
        rec.hls.attachMedia(video);
      } else video.src = target.url;
      on({ slot, state: 'buffering' });
      try {
        await video.play();
      } catch {
        /* sessiz başlatma engellenmez; yine de hata verirse kullanıcı dokunuşunu bekler */
      }
    },
    rect: async () => {},
    mute: async (slot, muted) => {
      const v = vids.get(slot);
      if (v) v.video.muted = !!muted;
    },
    stop: async (slot) => clean(slot),
    stopAll: async () => [...vids.keys()].forEach(clean),
  };
}
