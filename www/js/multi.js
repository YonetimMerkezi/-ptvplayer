// Çoklu ekran: aynı anda birkaç canlı kanal, her kutu kendi oynatıcısında; yalnız seçili kutu sesli.
// Android'de her kutu ayrı bir Media3 oynatıcısıdır (WebView'ın altında, kutunun dikdörtgenine yerleşir);
// tarayıcıda kutuya bir <video> eklenir.
import { describeError } from './engine.js';

// Kayıtlı kanal kimliklerini n kutuya sığdırır (eksikler null).
export const fitSlots = (ids, n) => Array.from({ length: n }, (_, i) => (Array.isArray(ids) && ids[i] != null ? ids[i] : null));

// Kutu hatasında sıradaki oynatma adresinin indeksi; kalmadıysa -1.
export const nextTargetIdx = (idx, count) => (idx + 1 < count ? idx + 1 : -1);

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
