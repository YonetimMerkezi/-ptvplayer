// Oynatma motorları: Android'de Media3 (yerel eklenti), tarayıcıda <video> + hls.js.
// İkisi de aynı arayüzü sunar: load/pause/resume/seek/stop/tracks/selectTrack/setResize/setImmersive.

const ERR = [
  [/NETWORK_CONNECTION|TIMEOUT|NO_PERMISSION|FILE_NOT_FOUND/, 'Sunucuya bağlanılamadı'],
  [/BAD_HTTP_STATUS/, 'Sunucu yayını vermedi (HTTP hatası)'],
  [/CONTAINER_UNSUPPORTED|MANIFEST_MALFORMED|CONTAINER_MALFORMED/, 'Yayın biçimi okunamadı'],
  [/DECODER_INIT|DECODING_FORMAT|DECODING_FAILED/, 'Bu cihaz yayının görüntü/ses biçimini çözemiyor'],
  [/BEHIND_LIVE_WINDOW/, 'Canlı yayın geride kaldı'],
  [/VIDEO_FROZEN/, 'Görüntü donuyor (cihazın çözücüsü takıldı)'],
];

// Sunucunun HTTP durum koduna göre açıklama: 403/404/5xx farklı sorunlardır (abonelik ya da bağlantı sınırı / kanal yok / sunucu arızası).
function describeHttp(code) {
  if (code === 401 || code === 403 || code === 458 || code === 429) return `Sunucu erişimi reddetti (HTTP ${code}): abonelik süresi ya da eş zamanlı bağlantı sınırı olabilir`;
  if (code === 404 || code === 410) return `Kanal sunucuda bulunamadı (HTTP ${code})`;
  if (code >= 500) return `Sunucu hata verdi (HTTP ${code})`;
  return `Sunucu yayını vermedi (HTTP ${code})`;
}

export function describeError(name, http = 0) {
  const s = String(name || '');
  const code = Number(http) || 0;
  if (code >= 400 && /BAD_HTTP_STATUS/.test(s)) return describeHttp(code);
  for (const [re, msg] of ERR) if (re.test(s)) return msg;
  return 'Yayın oynatılamadı' + (s ? ` (${s.replace(/^ERROR_CODE_/, '')})` : '');
}

export function createNativeEngine(plugin, on, getBuffer = () => 'high', onRec = () => {}, getDelay = () => 0, getNight = () => 'off', onDl = () => {}) {
  const handles = [];
  const add = async (name, fn) => handles.push(await plugin.addListener(name, fn));
  add('state', (e) => on({ type: 'state', state: e.state, live: !!e.live }));
  add('time', (e) => on({ type: 'time', pos: e.pos, dur: e.dur, buffered: e.buffered }));
  add('error', (e) => on({ type: 'error', message: describeError(e.message, e.http), frozen: /VIDEO_FROZEN/.test(String(e.message || '')), cause: e.cause, decoder: e.decoder, rendered: e.rendered }));
  add('tracks', () => on({ type: 'tracks' }));
  add('recording', (e) => onRec(e));
  add('dlProgress', (e) => onDl(e));
  return {
    kind: 'native',
    enterPip: () => plugin.enterPip(),
    openExternal: (target) => plugin.openExternal({ url: target.url, mime: target.mime === 'hls' || /\\.m3u8(\\?|$)/i.test(target.url) ? 'application/vnd.apple.mpegurl' : target.mime === 'dash' || /\\.mpd(\\?|$)/i.test(target.url) ? 'application/dash+xml' : /^video\\//i.test(target.mime || '') ? target.mime : 'video/*' }),
    onPipChannel: (fn) => plugin.addListener('pipChannel', fn),
    // keepRecording: aynı yayına yeniden bağlanılıyor, süren kayıt kesilmesin.
    // opts.compat: uyumlu mod (yazılım çözücü başta, geniş TS ayrıştırma). target.live: canlı yayın (progressive .ts'te Media3 canlı olduğunu bilmez;
    // tampon eşikleri ve yeniden kurulumda konum buna göre seçilir).
    load: (target, startMs = 0, keepRecording = false, opts = null) =>
      plugin.play({ url: target.url, mime: target.mime || 'auto', headers: target.headers || {}, startMs: Math.max(0, Math.floor(startMs)), buffer: getBuffer(), keepRecording, audioDelay: getDelay(), night: getNight(), live: !!target.live, compat: !!(opts && opts.compat) }),
    // Yayın kaydı (yalnız Android): izlenen yayın cihaza .ts olarak yazılır.
    rec: {
      start: (name, maxMs) => plugin.recordStart({ name, maxMs: maxMs || 0 }),
      stop: () => plugin.recordStop(),
      list: () => plugin.recordList(),
      remove: (id) => plugin.recordDelete({ id }),
    },
    // Çevrimdışı indirmeler (yalnız Android): arka plan hizmeti sırayla indirir, ilerleme 'dlProgress' olayıyla gelir.
    dl: {
      start: (job) => plugin.dlStart(job),
      list: () => plugin.dlList(),
      pause: (id) => plugin.dlPause({ id }),
      pauseAll: () => plugin.dlPauseAll(),
      resume: (id) => plugin.dlResume({ id }),
      resumeAll: (paused = false) => plugin.dlResumeAll({ paused }),
      remove: (id) => plugin.dlRemove({ id }),
    },
    // Ses senkronu (ms): açık oynatıcıya anında uygulanır (yalnız Android)
    setAudioDelay: (ms) => plugin.setAudioDelay({ ms }),
    // Gece modu (off | light | medium | strong): açık oynatıcıya anında uygulanır (yalnız Android)
    setNightMode: (level) => plugin.setNightMode({ level }),
    // Altyazı görünümü: { size, color, bgAlpha, bottom, outline } (yalnız Android)
    setSubtitleStyle: (p) => plugin.setSubtitleStyle(p),
    pause: () => plugin.pause(),
    resume: () => plugin.resume(),
    seek: (ms) => plugin.seekTo({ ms: Math.max(0, Math.floor(ms)) }),
    stop: () => plugin.stop(),
    setResize: (mode) => plugin.setResizeMode({ mode }),
    setImmersive: (on_, landscape = on_) => plugin.setImmersive({ on: on_, landscape }),
    // önizleme: yerel görüntüyü CSS piksel cinsinden bir dikdörtgene sığdırır / tam ekrana döndürür
    setRect: async (r) => plugin.setRect({ x: r.x, y: r.y, w: r.w, h: r.h }),
    clearRect: async () => plugin.clearRect(),
    tracks: () => plugin.getTracks(),
    selectTrack: (type, id) => plugin.selectTrack({ type, id: id || '' }),
    // async: eklentide metot yoksa bile eşzamanlı hata fırlatmak yerine reddedilen söz döner
    levels: async () => plugin.getLevels(),
    // Yayın bilgisi: tampon, çözünürlük, bit hızı, bağlantı hızı, düşen kare (Media3'ten)
    stats: async () => plugin.getStats(),
    setBrightness: async (v) => plugin.setBrightness({ value: v }),
    setVolume: async (v) => plugin.setVolume({ value: v }),
    destroy: () => {
      for (const h of handles) h && h.remove && h.remove();
    },
  };
}

export function createWebEngine({ video, Hls, on }) {
  let hls = null;
  let webBrightness = 1;
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
    enterPip: async () => { throw new Error('PiP yalnız Android uygulamasında kullanılabilir'); },
    onPipChannel: () => ({ remove() {} }),
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
    setRect: async () => {},
    clearRect: async () => {},
    tracks: async () => ({ audio: [], text: [], textOn: false }),
    selectTrack: async () => {},
    // Tarayıcıda ekran parlaklığı ayarlanamaz: videoya parlaklık süzgeci uygulanır (negatif → kaldır).
    levels: async () => ({ brightness: webBrightness, volume: video.volume }),
    // Yayın bilgisi: <video> ve hls.js'ten okunabilenler
    stats: async () => {
      const t = video.currentTime;
      let ahead = 0;
      for (let i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= t + 0.2 && video.buffered.end(i) >= t) ahead = (video.buffered.end(i) - t) * 1000;
      const q = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null;
      const lv = hls && hls.levels && hls.currentLevel >= 0 ? hls.levels[hls.currentLevel] : null;
      return {
        bufferMs: ahead,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        dropped: q ? q.droppedVideoFrames : undefined,
        rendered: q ? q.totalVideoFrames - q.droppedVideoFrames : undefined,
        bandwidthBps: hls && hls.bandwidthEstimate > 0 ? hls.bandwidthEstimate : undefined,
        videoBps: lv ? lv.bitrate : undefined,
        videoCodec: lv ? lv.videoCodec : undefined,
        audioCodec: lv ? lv.audioCodec : undefined,
      };
    },
    setBrightness: async (v) => {
      webBrightness = v < 0 ? 1 : v;
      video.style.filter = v < 0 ? '' : `brightness(${(0.25 + 0.75 * v).toFixed(2)})`;
    },
    setVolume: async (v) => {
      video.volume = Math.min(1, Math.max(0, v));
      video.muted = v <= 0;
    },
    destroy: () => clean(),
  };
}
