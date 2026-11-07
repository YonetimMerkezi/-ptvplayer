// Oynatma denetleyicisi: motor üstünde yedek adres denemesi, yeniden bağlanma, takılma bekçisi,
// ilerleme bildirimi. Motordan bağımsızdır (sahte motorla test edilir).

const STALL_MS = 25000;
const PROGRESS_EVERY_MS = 10000;

export function createPlayer({ engine, timers = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) }, now = () => Date.now() }) {
  const st = { status: 'idle', item: null, ep: null, pos: 0, dur: -1, live: false, error: '', idx: 0, targets: [] };
  const listeners = new Set();
  let progressCb = null;
  let stallTimer = null;
  let retries = 0;
  let everPlayed = false;
  let lastProgressAt = 0;
  let startMs = 0;

  const emit = () => listeners.forEach((f) => f({ ...st }));
  const clearStall = () => {
    if (stallTimer) timers.clear(stallTimer);
    stallTimer = null;
  };
  const armStall = () => {
    clearStall();
    stallTimer = timers.set(() => fail('Yayın başlamadı (zaman aşımı)'), STALL_MS);
  };
  const setStatus = (s) => {
    st.status = s;
    if (s === 'loading' || s === 'buffering') armStall();
    else clearStall();
  };

  async function startTarget(resumeAt) {
    const t = st.targets[st.idx];
    st.error = '';
    setStatus('loading');
    emit();
    try {
      await engine.load(t, resumeAt);
    } catch (e) {
      fail(e && e.message ? e.message : 'Oynatıcı başlatılamadı');
    }
  }

  function fail(message) {
    if (st.status === 'idle') return;
    if (everPlayed && retries > 0) {
      retries--;
      startTarget(st.live ? 0 : st.pos);
      return;
    }
    if (st.idx + 1 < st.targets.length) {
      st.idx++;
      startTarget(startMs);
      return;
    }
    clearStall();
    st.status = 'error';
    st.error = message || 'Yayın oynatılamadı';
    emit();
  }

  function handle(ev) {
    if (st.status === 'idle') return;
    if (ev.type === 'error') return fail(ev.message);
    if (ev.type === 'time') {
      st.pos = ev.pos;
      st.dur = ev.dur;
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
      if (ev.state === 'playing') {
        everPlayed = true;
        retries = 2;
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
      retries = 0;
      startMs = startAt;
      lastProgressAt = now();
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
      retries = 0;
      return startTarget(st.live ? 0 : st.pos);
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
