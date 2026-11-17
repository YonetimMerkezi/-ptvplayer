// Oynatma denetleyicisi: motor üstünde yedek adres denemesi, hızlı yeniden bağlanma, takılma bekçisi,
// ilerleme bildirimi. Motordan bağımsızdır (sahte motorla test edilir).
import { STEADY_MS, reconnectDelay, retryPolicy } from './retry.js';
import { targetKind } from './stats.js';

const STALL_MS = 25000; // ilk açılışta yayının gelmesi için
const PROGRESS_EVERY_MS = 10000;
const OPEN_CAP_MS = 90000; // film ilk açılışta veri geliyorsa (tampon büyüyorsa) en çok bu kadar beklenir
const LOG_MAX = 16; // olay kaydının uzunluğu (Yayın bilgisi'nde son satırlar görünür)
const GOOD_MS = 20000; // yedek adres bu kadar kesintisiz oynarsa "bu yayın bu adresle çalışıyor" diye bildirilir
const LIVE_NEED_MS = 4000; // canlıda tampon önde bu kadardan azsa oynatıcı veri bekliyordur (devam eşiği 3 sn); doluyken takılma veri değil çözücü sorunudur

// onSteady(hedef, sıra): ilk adres dışındaki bir adres GOOD_MS boyunca kesintisiz oynadığında bir kez çağrılır (çalışan biçim hatırlansın diye).
export function createPlayer({ engine, policy = () => retryPolicy(), timers = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) }, now = () => Date.now(), onSteady = null }) {
  const st = { status: 'idle', item: null, ep: null, pos: 0, dur: -1, live: false, error: '', idx: 0, targets: [], tracksVer: 0, reconnect: 0, vw: 0, vh: 0, log: [] };
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
  let lastAhead = 0; // canlıda son görülen "önde biriken tampon" (tampon konumu − oynatma konumu); pencere kaysa da doğru kalır
  let waitSince = 0; // kesintisiz açılış/tamponlama beklemesinin başı: veri geliyorsa bekçi uzatılır ama en çok OPEN_CAP_MS
  let opening = false; // bu (yeniden) açılışta henüz 'oynuyor' görülmedi
  let openStart = 0;
  let lastOpenMs = 0; // bu yayının son başarılı açılışının süresi: yeniden açılışa ona göre süre tanınır
  let frozen = 0; // art arda görüntü donması (çözücü takılması) sayısı: ikincisinde yedek adrese geçilir
  let compatNext = false; // bir sonraki açılış uyumlu modda olsun (kullanıcı "görüntü bozuk" dedi)
  let goodSent = false;

  const emit = () => listeners.forEach((f) => f({ ...st }));
  // Olay kaydı: sorun bildirilirken "ne oldu" sorusunun yanıtı. Aynı satır art arda yazılmaz (tamponlama gidip gelirken kayıt dolmasın).
  const note = (text) => {
    const last = st.log[st.log.length - 1];
    if (last && last.text === text) return;
    st.log.push({ t: now(), text });
    if (st.log.length > LOG_MAX) st.log.shift();
  };
  const secs = (ms) => (Math.max(0, ms) / 1000).toFixed(1).replace('.', ',');
  let playLogged = false; // bu açılışta "oynuyor" satırı yazıldı mı
  const clearStall = () => {
    if (stallTimer) timers.clear(stallTimer);
    stallTimer = null;
  };
  const clearRetry = () => {
    if (retryTimer) timers.clear(retryTimer);
    retryTimer = null;
  };
  // Oynamış bir yayında takılma kısa sürede yeniden bağlanmayı tetikler; ilk açılışta daha sabırlı bekler.
  // Yeniden açılış sürerken (henüz oynamadı) bu yayının son açılışı ne kadar sürdüyse onun iki katı (en çok STALL_MS) beklenir:
  // yavaş açılan bir yayında 7 sn'lik bekçi her denemeyi açılış bitmeden keser ve yeniden bağlanma döngüsü sonsuza kadar sürerdi.
  const stallMs = () => {
    if (!everPlayed) return STALL_MS;
    const base = st.live ? policy().liveStallMs : policy().vodStallMs;
    return opening ? Math.min(STALL_MS, Math.max(base, lastOpenMs * 2)) : base;
  };
  // Film dosyası açılıp süresi okunduysa ama görüntü başlamadıysa sorun sunucuda değil, çözme/biçimdedir.
  const stallMessage = () =>
    !everPlayed && !st.live && st.dur > 0
      ? 'Film açıldı ama görüntü başlamadı (cihaz bu biçimi çözemiyor olabilir). “Harici oynatıcı”yı deneyin.'
      : 'Yayın başlamadı (zaman aşımı)';
  const armStall = () => {
    clearStall();
    stallTimer = timers.set(() => {
      note(`zaman aşımı: ${stallMessage()}`);
      fail(stallMessage());
    }, stallMs());
  };
  const waiting = (s) => s === 'loading' || s === 'buffering';
  const setStatus = (s) => {
    if (waiting(s) && !waiting(st.status)) waitSince = now();
    st.status = s;
    if (s === 'loading' || s === 'buffering') armStall();
    else clearStall();
  };

  // keep: aynı yayına yeniden bağlanma (süren kayıt kesilmesin); yeni açılışta kayıt biter.
  async function startTarget(resumeAt, keep = false) {
    const t = st.targets[st.idx];
    st.error = '';
    playLogged = false;
    opening = true;
    openStart = now();
    lastBuf = 0;
    lastAhead = 0;
    note(`açılıyor · adres ${st.idx + 1}/${st.targets.length} · ${targetKind(t) || 'biçim ?'}${compatNext ? ' · uyumlu mod' : ''}${keep ? ' · yeniden bağlanma' : ''}`);
    setStatus('loading');
    emit();
    try {
      const opts = compatNext ? { compat: true } : undefined;
      compatNext = false;
      await engine.load(t, resumeAt, keep, opts);
    } catch (e) {
      fail(e && e.message ? e.message : 'Oynatıcı başlatılamadı');
    }
  }

  // Oynarken kopan ya da takılan yayına hızla yeniden bağlanır; art arda başarısız olursa yedek adrese de geçer.
  function scheduleReconnect(skipNow = false) {
    clearStall();
    clearRetry();
    goodSent = false;
    const n = reconnects++;
    const before = st.idx;
    if ((skipNow || n >= 2) && st.targets.length > 1) st.idx = (st.idx + 1) % st.targets.length;
    note(`yeniden bağlanma ${reconnects}${st.idx !== before ? ` → adres ${st.idx + 1}` : ''}`);
    if (!waiting(st.status)) waitSince = now();
    st.status = 'buffering';
    st.reconnect = reconnects;
    st.error = '';
    emit();
    retryTimer = timers.set(() => {
      retryTimer = null;
      if (st.status !== 'idle') startTarget(st.live ? 0 : st.pos, true);
    }, reconnectDelay(n));
  }

  // isFrozen: yayın "oynuyor" görünürken görüntü donmuş (çözücü takılmış). Aynı adrese bir kez uyumlu modda yeniden bağlanılır;
  // yine donarsa beklemeden yedek adrese (öteki biçim) geçilir.
  function fail(message, isFrozen = false) {
    if (st.status === 'idle' || retryTimer) return; // yeniden bağlanma zaten planlı
    let skip = false;
    if (isFrozen) {
      frozen++;
      if (frozen >= 2) {
        // Uyumlu modda da dondu: varsa yedek yayın adresine geç.
        skip = st.targets.length > 1;
        frozen = 0;
        compatNext = false;
      } else {
        // İlk donmada aynı adresi bir kez Media3 uyumlu modda yeniden aç.
        compatNext = true;
      }
    }
    if (everPlayed && reconnects < (st.live ? policy().liveMax : policy().vodMax)) return scheduleReconnect(skip);
    if (!everPlayed && st.idx + 1 < st.targets.length) {
      goodSent = false;
      st.idx++;
      startTarget(startMs, true);
      return;
    }
    clearStall();
    clearRetry();
    st.status = 'error';
    st.error = message || 'Yayın oynatılamadı';
    note(`vazgeçildi: ${st.error}`);
    emit();
  }

  function handle(ev) {
    if (st.status === 'idle') return;
    if (ev.type === 'error') {
      const more = [ev.rendered != null ? `çizilen kare ${ev.rendered}` : '', ev.decoder ? `çözücü ${ev.decoder}` : '', ev.cause ? `neden ${ev.cause}` : ''].filter(Boolean).join(' · ');
      note(`hata: ${ev.message}${more ? ` (${more})` : ''}`);
      return fail(ev.message, !!ev.frozen);
    }
    if (ev.type === 'videoSize') {
      if (ev.width > 0 && ev.height > 0 && (st.vw !== ev.width || st.vh !== ev.height)) {
        st.vw = ev.width;
        st.vh = ev.height;
        emit();
      }
      return;
    }
    if (ev.type === 'tracks') {
      st.tracksVer++; // ses/altyazı parçaları değişti: arayüz düğmeleri yeniden okusun
      emit();
      return;
    }
    if (ev.type === 'time') {
      st.pos = ev.pos;
      st.dur = ev.dur;
      // Film ilk açılışta yavaş ama veri geliyorsa (tampon büyüyor) bekçi yeniden kurulur; üst sınır OPEN_CAP_MS.
      if (!everPlayed && !st.live && waiting(st.status) && ev.buffered > lastBuf + 1000) {
        lastBuf = ev.buffered;
        if (now() - waitSince < OPEN_CAP_MS) armStall();
      }
      // Canlı yayın yavaş ama veri geliyorsa (önde biriken tampon büyüyor ve hâlâ devam eşiğini bekliyor) ölü sayılmaz: yeniden bağlanmak
      // tamponu ve bağlantıyı atıp açılışı baştan başlatır, beklemekten kötüdür. Tampon doluyken oynatma ilerlemiyorsa sorun veri değildir, bekçi çalışır.
      if (st.live && waiting(st.status)) {
        const ahead = ev.buffered - ev.pos;
        if (ahead > lastAhead + 1000 && ahead <= LIVE_NEED_MS) {
          lastAhead = ahead;
          if (now() - waitSince < OPEN_CAP_MS) armStall();
        } else if (ahead < lastAhead) lastAhead = ahead;
      }
      if (reconnects && st.status === 'playing' && playingSince !== null && now() - playingSince >= STEADY_MS) reconnects = 0;
      if (st.status === 'playing' && playingSince !== null && now() - playingSince >= STEADY_MS) frozen = 0;
      if (onSteady && !goodSent && st.status === 'playing' && playingSince !== null && now() - playingSince >= GOOD_MS) {
        goodSent = true;
        if (st.idx > 0) {
          try {
            onSteady(st.targets[st.idx], st.idx);
          } catch {
            /* hatırlama başarısız olsa da oynatma sürer */
          }
        }
      }
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
        if (opening) {
          lastOpenMs = now() - openStart;
          opening = false;
        }
        if (!playLogged) {
          playLogged = true;
          note(`oynuyor (açılış ${secs(now() - openedAt)} sn)`);
        }
        everPlayed = true;
        clearRetry();
        st.reconnect = 0;
      }
      if (ev.state === 'buffering' && st.status === 'playing') note('tamponluyor (oynarken)');
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
      lastOpenMs = 0;
      Object.assign(st, { item, ep, targets, idx: 0, pos: startAt, dur: -1, live: item.kind === 'live', error: '', vw: 0, vh: 0, log: [] });
      everPlayed = false;
      reconnects = 0;
      frozen = 0;
      goodSent = false;
      compatNext = false;
      st.reconnect = 0;
      clearRetry();
      startMs = startAt;
      lastProgressAt = now();
      openedAt = now();
      waitSince = openedAt;
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
      waitSince = openedAt;
      lastBuf = 0;
      return startTarget(st.live ? 0 : st.pos, true);
    },
    // Kullanıcı "görüntü bozuk/donuyor" dedi: açık yayın aynı adreste uyumlu modda (yazılım çözücü, geniş TS ayrıştırma) yeniden açılır.
    retryCompat() {
      if (!st.targets.length || st.status === 'idle') return;
      note('görüntü bozuk dendi → uyumlu mod');
      compatNext = true;
      everPlayed = false;
      reconnects = 0;
      frozen = 0;
      goodSent = false;
      st.reconnect = 0;
      clearRetry();
      openedAt = now();
      waitSince = openedAt;
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
