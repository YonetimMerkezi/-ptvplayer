// Oynatma motorları: Android'de Media3 (yerel eklenti), tarayıcıda <video> + hls.js.
// İkisi de aynı arayüzü sunar: load/pause/resume/seek/stop/tracks/selectTrack/setResize/setImmersive.

const ERR = [
  [/NETWORK_CONNECTION|TIMEOUT|NO_PERMISSION|FILE_NOT_FOUND/, 'Sunucuya bağlanılamadı'],
  [/BAD_HTTP_STATUS/, 'Sunucu yayını vermedi (HTTP hatası)'],
  [/CONTAINER_UNSUPPORTED|MANIFEST_MALFORMED|CONTAINER_MALFORMED/, 'Yayın biçimi okunamadı'],
  [/DECODER_INIT|DECODING_FORMAT|DECODING_FAILED/, 'Bu cihaz yayının görüntü/ses biçimini çözemiyor'],
  [/BEHIND_LIVE_WINDOW/, 'Canlı yayın geride kaldı'],
];

export function describeError(name) {
  const s = String(name || '');
  for (const [re, msg] of ERR) if (re.test(s)) return msg;
  return 'Yayın oynatılamadı' + (s ? ` (${s.replace(/^ERROR_CODE_/, '')})` : '');
}

export function createNativeEngine(plugin, on) {
  const handles = [];
  const add = async (name, fn) => handles.push(await plugin.addListener(name, fn));
  add('state', (e) => on({ type: 'state', state: e.state, live: !!e.live }));
  add('time', (e) => on({ type: 'time', pos: e.pos, dur: e.dur, buffered: e.buffered }));
  add('error', (e) => on({ type: 'error', message: describeError(e.message) }));
  add('tracks', () => on({ type: 'tracks' }));
  return {
    kind: 'native',
    load: (target, startMs = 0) =>
      plugin.play({ url: target.url, mime: target.mime || 'auto', headers: target.headers || {}, startMs: Math.max(0, Math.floor(startMs)) }),
    pause: () => plugin.pause(),
    resume: () => plugin.resume(),
    seek: (ms) => plugin.seekTo({ ms: Math.max(0, Math.floor(ms)) }),
    stop: () => plugin.stop(),
    setResize: (mode) => plugin.setResizeMode({ mode }),
    setImmersive: (on_, landscape = on_) => plugin.setImmersive({ on: on_, landscape }),
    tracks: () => plugin.getTracks(),
    selectTrack: (type, id) => plugin.selectTrack({ type, id: id || '' }),
    destroy: () => {
      for (const h of handles) h && h.remove && h.remove();
    },
  };
}

export function createWebEngine({ video, Hls, on }) {
  let hls = null;
  const clean = () => {
    if (hls) {
      hls.destroy();
      hls = null;
    }
    video.removeAttribute('src');
    video.load();
  };
  const fire = (state) => on({ type: 'state', state, live: video.duration === Infinity });
  video.addEventListener('waiting', () => fire('buffering'));
  video.addEventListener('playing', () => fire('playing'));
  video.addEventListener('pause', () => fire(video.ended ? 'ended' : 'paused'));
  video.addEventListener('ended', () => fire('ended'));
  video.addEventListener('error', () => {
    if (!video.getAttribute('src') && !hls) return;
    on({ type: 'error', message: 'Tarayıcı bu yayını oynatamıyor' });
  });
  video.addEventListener('timeupdate', () =>
    on({ type: 'time', pos: video.currentTime * 1000, dur: Number.isFinite(video.duration) ? video.duration * 1000 : -1, buffered: 0 }),
  );
  return {
    kind: 'web',
    async load(target, startMs = 0) {
      clean();
      const isHls = target.mime === 'hls' || /\.m3u8(\?|$)/i.test(target.url);
      if (isHls && Hls && Hls.isSupported()) {
        hls = new Hls({ maxBufferLength: 30, startPosition: startMs > 0 ? startMs / 1000 : -1 });
        hls.on(Hls.Events.ERROR, (_, d) => {
          if (d && d.fatal) on({ type: 'error', message: d.type === 'networkError' ? 'Sunucuya bağlanılamadı' : 'Yayın oynatılamadı' });
        });
        hls.loadSource(target.url);
        hls.attachMedia(video);
      } else {
        video.src = target.url;
        if (startMs > 0) video.currentTime = startMs / 1000;
      }
      fire('buffering');
      try {
        await video.play();
      } catch {
        /* otomatik oynatma engellendiyse kullanıcı dokunuşunu bekler */
      }
    },
    pause: async () => video.pause(),
    resume: async () => video.play().catch(() => {}),
    seek: async (ms) => {
      video.currentTime = ms / 1000;
    },
    stop: async () => clean(),
    setResize: async (mode) => {
      video.style.objectFit = mode === 'fill' ? 'fill' : mode === 'zoom' ? 'cover' : 'contain';
    },
    setImmersive: async () => {},
    tracks: async () => ({ audio: [], text: [], textOn: false }),
    selectTrack: async () => {},
    destroy: () => clean(),
  };
}
