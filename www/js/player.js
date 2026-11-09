// Oynatma denetleyicisi: motor üstünde yedek adres denemesi, hızlı yeniden bağlanma, takılma bekçisi,
// ilerleme bildirimi. Motordan bağımsızdır (sahte motorla test edilir).
import { STEADY_MS, reconnectDelay, retryPolicy } from './retry.js';

const STALL_MS = 25000; // ilk açılışta yayının gelmesi için
const PROGRESS_EVERY_MS = 10000;
const OPEN_CAP_MS = 90000; // film ilk açılışta veri geliyorsa (tampon büyüyorsa) en çok bu kadar beklenir

export function createPlayer({ engine, policy = () => retryPolicy(), timers = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) }, now = () => Date.now() }) {
  const st = { status: 'idle', item: null, ep: null, pos: 0, dur: -1, live: false, error: '', idx: 0, targets: [], tracksVer: 0, reconnect: 0 };
  const listeners = new Set();
  let progressCb = null;
  let stallTimer = null;
  let reconnects = 0; // art arda yeniden bağlanma denemesi (kesintisiz oynayınca sıfırlanır)
  let retryTimer = null;
  let playingSince = null;
  let everPlayed = false;
  let lastProgressAt = 0;
  let startMs = 0;
  let openedAt = 0;
  let lastBuf = 0; // son görülen tampon konumu: büyüyorsa veri geliyordur, açılış takılmış sayılmaz

  const emit = () => listeners.forEach((f) => f({ ...st }));
  const clearStall = () => {
    if (stallTimer) timers.clear(stallTimer);
    stallTimer = null;
  };
  const clearRetry = () => {
    if (retryTimer) timers.clear(retryTimer);
    retryTimer = null;
  };
  // Oynamış bir yayında takılma kısa sürede yeniden bağlanmayı tetikler; ilk açılışta daha sabırlı bekler.
  const stallMs = () => (!everPlayed ? STALL_MS : st.live ? policy().liveStallMs : policy().vodStallMs);
  // Film dosyası açılıp süresi okunduysa ama görüntü başlamadıysa sorun sunucuda değil, çözme/biçimdedir.
  const stallMessage = () =>
    !everPlayed && !st.live && st.dur > 0
      ? 'Film açıldı ama görüntü başlamadı (cihaz bu biçimi çözemiyor olabilir). “Harici oynatıcı”yı deneyin.'
      : 'Yayın başlamadı (zaman aşımı)';
  const armStall = () => {
    clearStall();
    stallTimer = timers.set(() => fail(stallMessage()), stallMs());
  };
  const setStatus = (s) => {
    st.status = s;
    if (s === 'loading' || s === 'buffering') armStall();
    else clearStall();
  };

  // keep: aynı yayına yeniden bağlanma (süren kayıt kesilmesin); yeni açılışta kayıt biter.
  async function startTarget(resumeAt, keep = false) {
    const t = st.targets[st.idx];
    st.error = '';
    setStatus('loading');
    emit();
    try {
      await engine.load(t, resumeAt, keep);
    } catch (e) {
      fail(e && e.message ? e.message : 'Oynatıcı başlatılamadı');
    }
  }

  // Oynarken kopan ya da takılan yayına hızla yeniden bağlanır; art arda başarısız olursa yedek adrese de geçer.
  function scheduleReconnect() {
    clearStall();
    clearRetry();
    const n = reconnects++;
    if (n >= 2 && st.targets.length > 1) st.idx = (st.idx + 1) % st.targets.length;
    st.status = 'buffering';
    st.reconnect = reconnects;
    st.error = '';
    emit();
    retryTimer = timers.set(() => {
      retryTimer = null;
      if (st.status !== 'idle') startTarget(st.live ? 0 : st.pos, true);
    }, reconnectDelay(n));
  }

  function fail(message) {
    if (st.status === 'idle' || retryTimer) return; // yeniden bağlanma zaten planlı
    if (everPlayed && reconnects < (st.live ? policy().liveMax : policy().vodMax)) return scheduleReconnect();
    if (!everPlayed && st.idx + 1 < st.targets.length) {
      st.idx++;
      startTarget(startMs, true);
      return;
    }
    clearStall();
    clearRetry();
    st.status = 'error';
    st.error = message || 'Yayın oynatılamadı';
    emit();
  }

  function handle(ev) {
    if (st.status === 'idle') return;
    if (ev.type === 'error') return fail(ev.message);
    if (ev.type === 'tracks') {
      st.tracksVer++; // ses/altyazı parçaları değişti: arayüz düğmeleri yeniden okusun
      emit();
      return;
    }
    if (ev.type === 'time') {
      st.pos = ev.pos;
      st.dur = ev.dur;
      // Film ilk açılışta yavaş ama veri geliyorsa (tampon büyüyor) bekçi yeniden kurulur; üst sınır OPEN_CAP_MS.
      if (!everPlayed && !st.live && (st.status === 'loading' || st.status === 'buffering') && ev.buffered > lastBuf + 1000) {
        lastBuf = ev.buffered;
        if (now() - openedAt < OPEN_CAP_MS) armStall();
      }
      if (reconnects && st.status === 'playing' && playingSince !== null && now() - playingSince >= STEADY_MS) reconnects = 0;
      if (progressCb && ev.dur > 0 && now() - lastProgressAt >= PROGRESS_EVERY_MS && st.status === 'playing') {
        lastProgressAt = now();
        progressCb(st.pos, st.dur, st);
      }
      emit();
      return;
    }
    if (ev.type === 'state') {
      st.live = st.item.kind === 'live' || !!ev.live;
      if (ev.state === 'idle') return; // yükleme sırasında gelen geçici durum
      if (retryTimer && ev.state !== 'playing') return; // bağlantı beklenirken gelen geçici durumlar sayacı bozmasın
      if (ev.state === 'playing') {
        if (st.status !== 'playing') playingSince = now();
        everPlayed = true;
        clearRetry();
        st.reconnect = 0;
      }
      if (ev.state === 'ended' && progressCb && st.dur > 0) progressCb(st.dur, st.dur, st);
      setStatus(ev.state);
      emit();
    }
  }

  return {
    state: () => ({ ...st }),
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onProgress(fn) {
      progressCb = fn;
    },
    handle, // motor olaylarını içeri almak için (uygulama bağlar)
    async open(item, targets, { ep = null, startAt = 0 } = {}) {
      Object.assign(st, { item, ep, targets, idx: 0, pos: startAt, dur: -1, live: item.kind === 'live', error: '' });
      everPlayed = false;
      reconnects = 0;
      st.reconnect = 0;
      clearRetry();
      startMs = startAt;
      lastProgressAt = now();
      openedAt = now();
      lastBuf = 0;
      if (!targets.length) {
        st.status = 'error';
        st.error = 'Bu içerik için oynatma adresi yok';
        emit();
        return;
      }
      await startTarget(startAt);
    },
    retry() {
      if (!st.targets.length) return;
      st.idx = 0;
      everPlayed = false;
      reconnects = 0;
      st.reconnect = 0;
      clearRetry();
      openedAt = now();
      lastBuf = 0;
      return startTarget(st.live ? 0 : st.pos, true);
    },
    async toggle() {
      if (st.status === 'playing' || st.status === 'buffering') {
        await engine.pause();
        setStatus('paused');
        emit();
      } else if (st.status === 'paused' || st.status === 'ended') {
        await engine.resume();
      }
    },
    async seek(ms) {
      if (st.live || st.dur <= 0) return;
      const to = Math.min(Math.max(0, ms), st.dur);
      st.pos = to;
      await engine.seek(to);
      emit();
    },
    seekBy(delta) {
      return this.seek(st.pos + delta);
    },
    async close() {
      if (st.status === 'idle') return;
      if (progressCb && st.dur > 0 && st.pos > 0) progressCb(st.pos, st.dur, st);
      clearStall();
      clearRetry();
      st.status = 'idle';
      try {
        await engine.stop();
      } catch {
        /* kapanırken hata önemsiz */
      }
      emit();
    },
  };
}
