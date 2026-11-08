// Capacitor çekirdek JS'i paketlenmediği için (derleme adımı yok) yerel eklentiye,
// Android köprüsünün sunduğu nativePromise/addListener ile doğrudan ulaşılır.
// Tarayıcıda (köprü yok) null döner.
export function nativePlugin(name, win = globalThis.window) {
  const C = win && win.Capacitor;
  if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform() || typeof C.nativePromise !== 'function') return null;
  const call = (method) => (opts) => C.nativePromise(name, method, opts || {});
  return {
    addListener: async (event, cb) => C.addListener(name, event, cb),
    play: call('play'),
    pause: call('pause'),
    resume: call('resume'),
    stop: call('stop'),
    seekTo: call('seekTo'),
    setResizeMode: call('setResizeMode'),
    setImmersive: call('setImmersive'),
    setRect: call('setRect'),
    clearRect: call('clearRect'),
    getTracks: call('getTracks'),
    getLevels: call('getLevels'),
    setBrightness: call('setBrightness'),
    setVolume: call('setVolume'),
    selectTrack: call('selectTrack'),
    download: call('download'),
    downloadApk: call('downloadApk'),
    installApk: call('installApk'),
    deleteFile: call('deleteFile'),
  };
}
