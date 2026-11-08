// Oynatıcı ekranı: denetim çubukları, kanal değiştirme, ses/altyazı seçimi, klavye/kumanda.
import { esc, fmtDuration, fmtClock } from './util.js';
import { $, icon, openSheet, toast } from './ui.js';
import { pushLayer, popLayer } from './nav.js';
import { classify, seekDelta, seekTarget, levelFrom, seekStep, fmtDelta } from './gestures.js';

// Denetimler son dokunuştan sonra bu kadar süre görünür kalır.
const HIDE_MS = 2500;

const RESIZE = [
  ['fit', 'Sığdır'],
  ['zoom', 'Yakınlaştır'],
  ['fill', 'Doldur'],
];

export function createPlayerUI({ engine, player, env }) {
  // env: { epg(item), shortEpg(item) -> Promise, isFav(item), toggleFav(item), onEpgSheet(item), native }
  const root = $('#player');
  const ui = $('#pl-ui');
  const q = (id) => $(id);
  let hideTimer = 0;
  let ctx = null; // { list, index } | { eps: [...], index }
  let open = false;
  let resizeIdx = 0;
  let seeking = false;
  let shortEpgFor = null;
  let tracksLoadedFor = null;

  // ---- kaydırma hareketleri: sol yarı dikey = parlaklık, sağ yarı dikey = ses, yatay = sarma ----
  const levels = { brightness: 0.5, volume: 0.5 };
  let hudTimer = 0;
  const gest = { id: null, x0: 0, y0: 0, t0: 0, mode: null, kind: '', start: 0, base: 0, target: null, swallow: false, applied: 0, tapAt: 0 };

  // kind: simge adı (sun | audio | fwd | rew | info); frac: 0..1 çubuk (yoksa gizli)
  function hud(kind, text, frac) {
    const el = q('#pl-hud');
    el.hidden = false;
    el.querySelector('use').setAttribute('href', '#i-' + kind);
    el.querySelector('.hud-t').textContent = text;
    const bar = el.querySelector('.hud-bar');
    bar.hidden = frac == null;
    if (frac != null) bar.firstElementChild.style.width = Math.round(frac * 100) + '%';
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => {
      el.hidden = true;
    }, 900);
  }

  async function loadLevels() {
    try {
      const l = await engine.levels();
      if (typeof l.brightness === 'number') levels.brightness = l.brightness;
      if (typeof l.volume === 'number') levels.volume = l.volume;
    } catch {
      /* düzeyler okunamazsa varsayılanlarla devam */
    }
    const saved = env.pref ? env.pref('brightness', null) : null;
    if (typeof saved === 'number') {
      levels.brightness = saved;
      engine.setBrightness(saved).catch(() => {});
    }
  }

  function applyLevel(kind, v) {
    if (kind === 'brightness') engine.setBrightness(v).catch(() => {});
    else engine.setVolume(v).catch(() => {});
  }

  function gestureStart(e) {
    gest.swallow = false;
    if (!open || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('button, input, #pl-status .btn')) {
      gest.id = null;
      return;
    }
    Object.assign(gest, { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: Date.now(), mode: null, target: null });
  }

  function gestureMove(e) {
    if (e.pointerId !== gest.id) return;
    const dx = e.clientX - gest.x0;
    const dy = e.clientY - gest.y0;
    if (!gest.mode) {
      const m = classify(dx, dy);
      if (!m) return;
      try {
        root.setPointerCapture(e.pointerId);
      } catch {
        /* yakalama desteklenmiyorsa olaylar yine gelir */
      }
      gest.swallow = true;
      const st = player.state();
      if (m === 'h') {
        if (st.live || !(st.dur > 0)) {
          gest.mode = 'none';
          return hud('info', 'Canlı yayında sarma yok');
        }
        gest.mode = 'h';
        gest.base = st.pos;
      } else {
        gest.mode = 'v';
        gest.kind = gest.x0 < root.clientWidth / 2 ? 'brightness' : 'volume';
        gest.start = levels[gest.kind];
      }
    }
    if (gest.mode === 'h') {
      const st = player.state();
      const sec = seekDelta(dx, root.clientWidth);
      gest.target = seekTarget(gest.base, sec, st.dur);
      const real = (gest.target - gest.base) / 1000;
      hud(real >= 0 ? 'fwd' : 'rew', `${fmtDelta(real)} · ${fmtDuration(gest.target / 1000)}`);
    } else if (gest.mode === 'v') {
      const v = levelFrom(gest.start, dy, root.clientHeight);
      levels[gest.kind] = v;
      const now = Date.now();
      if (now - gest.applied > 40) {
        gest.applied = now;
        applyLevel(gest.kind, v);
      }
      hud(gest.kind === 'brightness' ? 'sun' : 'audio', `${gest.kind === 'brightness' ? 'Parlaklık' : 'Ses'} ${Math.round(v * 100)}%`, v);
    }
  }

  // Denetimleri aç/kapat: kaydırmadan hemen sonraki dokunuşta tarayıcı "tıklama" üretmeyebiliyor
  // (kaydırma sonrası dokunuş bastırılır); bu yüzden kısa, hareketsiz dokunuş pointer olaylarından da algılanır.
  function toggleUi() {
    if (ui.classList.contains('show') && player.state().status !== 'error') {
      clearTimeout(hideTimer);
      ui.classList.remove('show');
    } else showUi(false);
  }

  function gestureEnd(e) {
    if (e.pointerId !== gest.id) return;
    gest.id = null;
    const tap = gest.mode == null && e.type === 'pointerup' && Date.now() - gest.t0 < 500 && Math.hypot(e.clientX - gest.x0, e.clientY - gest.y0) < 12;
    if (tap) {
      gest.tapAt = Date.now();
      toggleUi();
    }
    if (gest.mode === 'h' && gest.target != null) player.seek(gest.target);
    if (gest.mode === 'v') {
      applyLevel(gest.kind, levels[gest.kind]);
      if (gest.kind === 'brightness' && env.setPref) env.setPref('brightness', levels.brightness);
    }
    gest.mode = null;
  }

  // Kumanda: art arda sağ/sol (ya da ileri/geri sar tuşları) sarar, basılı tutuldukça adım büyür.
  let keyStreak = 0;
  let keyAt = 0;
  let keyTotal = 0;
  function keySeek(dir) {
    const now = Date.now();
    const chained = now - keyAt < 700;
    keyStreak = chained ? keyStreak + 1 : 1;
    const step = dir * seekStep(keyStreak);
    keyTotal = (chained ? keyTotal : 0) + step;
    keyAt = now;
    player.seekBy(step * 1000);
    hud(dir > 0 ? 'fwd' : 'rew', fmtDelta(keyTotal));
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!seeking) ui.classList.remove('show');
    }, HIDE_MS);
  }

  function showUi(stick) {
    ui.classList.add('show');
    clearTimeout(hideTimer);
    if (!stick && player.state().status === 'playing') scheduleHide();
  }

  function title(st) {
    if (st.ep) return { name: st.item.name, sub: st.ep.label || st.ep.title };
    return { name: st.item.name, sub: '' };
  }

  function renderEpgLine(st) {
    const el = q('#pl-epgline');
    if (!st.item || st.item.kind !== 'live') {
      el.innerHTML = '';
      return;
    }
    const nn = env.epg(st.item);
    if (nn.now) {
      el.innerHTML = `<b>${esc(nn.now.t)}</b> · ${fmtClock(nn.now.s)}–${fmtClock(nn.now.e)}${nn.next ? ` &nbsp;›&nbsp; ${fmtClock(nn.next.s)} ${esc(nn.next.t)}` : ''}<div class="bar"><i style="width:${Math.round(nn.progress * 100)}%"></i></div>`;
    } else {
      el.innerHTML = '';
      if (shortEpgFor !== st.item.id) {
        shortEpgFor = st.item.id;
        env.shortEpg(st.item).then((list) => {
          const cur = player.state();
          if (!open || !cur.item || cur.item.id !== st.item.id || !list || !list.length) return;
          const now = Date.now();
          const n = list.find((p) => p.s <= now && p.e > now);
          if (n) q('#pl-epgline').innerHTML = `<b>${esc(n.t)}</b> · ${fmtClock(n.s)}–${fmtClock(n.e)}`;
        });
      }
    }
  }

  let lastStatus = '';
  function render(st) {
    if (!open || !st.item) return;
    const prev = lastStatus;
    lastStatus = st.status;
    const t = title(st);
    q('#pl-name').textContent = t.name;
    q('#pl-sub').textContent = t.sub;
    const live = st.live;
    document.body.classList.toggle('live-mode', live);
    document.body.classList.toggle('vod-mode', !live);
    q('#pl-prog').classList.toggle('live', live);
    q('#pl-play').innerHTML = icon(st.status === 'playing' || st.status === 'buffering' || st.status === 'loading' ? 'pause' : 'play');
    q('#pl-fav').innerHTML = icon(env.isFav(st.item) ? 'star-on' : 'star');
    q('#pl-fav').style.color = env.isFav(st.item) ? 'var(--gold)' : '';
    q('#pl-epg').hidden = st.item.kind !== 'live';
    if (!live && !seeking) {
      q('#pl-pos').textContent = fmtDuration(st.pos);
      q('#pl-dur').textContent = st.dur > 0 ? fmtDuration(st.dur) : '';
      q('#pl-seek').value = st.dur > 0 ? Math.round((st.pos / st.dur) * 1000) : 0;
    }
    if (live) q('#pl-pos').textContent = '';
    const hasNav = !!ctx && ctx.items.length > 1;
    q('#pl-prev').hidden = !hasNav;
    q('#pl-next').hidden = !hasNav;

    const s = q('#pl-status');
    if (st.status === 'loading' || st.status === 'buffering') {
      s.hidden = false;
      s.innerHTML = '<div class="spinner"></div>';
    } else if (st.status === 'error') {
      s.hidden = false;
      s.innerHTML = `<div>${esc(st.error)}</div><button class="btn" id="pl-retry">Yeniden dene</button>`;
      showUi(true);
    } else {
      s.hidden = true;
    }
    if (st.status === 'playing') {
      renderEpgLine(st);
      loadTrackButtons(st);
      // Gizleme sayacı her zaman güncellemesinde (saniyede birkaç kez) değil, yalnız oynatma başlayınca kurulur;
      // yoksa sayaç hiç dolmaz ve denetimler ekranda kalır. Yeniden arabelleğe almada denetimler tekrar açılmaz.
      if (prev !== 'playing' && ui.classList.contains('show')) scheduleHide();
    } else if (st.status !== 'error') {
      renderEpgLine(st);
    }
    if (st.status === 'ended' && ctx && ctx.autoNext && ctx.index < ctx.items.length - 1) go(1);
  }

  async function loadTrackButtons(st) {
    const key = st.item.id + (st.ep ? st.ep.id : '') + ':' + st.tracksVer;
    if (!env.native || tracksLoadedFor === key) return;
    tracksLoadedFor = key;
    try {
      const t = await engine.tracks();
      q('#pl-audio').hidden = !(t.audio && t.audio.length > 1);
      q('#pl-text').hidden = !(t.text && t.text.length > 0);
    } catch {
      /* iz bilgisi yoksa düğmeler gizli kalır */
    }
  }

  async function trackSheet(type) {
    const t = await engine.tracks();
    const list = type === 'audio' ? t.audio : t.text;
    const rows = list
      .map((x) => `<button class="list-item" data-id="${esc(x.id)}"><span class="t">${esc(x.label)}</span>${x.selected ? icon('check').replace('class="ic"', 'class="ic ok"') : ''}</button>`)
      .join('');
    const off = type === 'text' ? `<button class="list-item" data-id=""><span class="t">Kapalı</span>${t.textOn ? '' : icon('check').replace('class="ic"', 'class="ic ok"')}</button>` : '';
    const sh = openSheet({
      title: type === 'audio' ? 'Ses dili' : 'Altyazı',
      html: off + rows,
      mount: (body) =>
        body.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-id]');
          if (!b) return;
          await engine.selectTrack(type, b.dataset.id);
          sh.close();
        }),
    });
  }

  function go(delta) {
    if (!ctx) return;
    const i = ctx.index + delta;
    if (i < 0 || i >= ctx.items.length) return;
    ctx.index = i;
    ctx.play(ctx.items[i], i);
  }

  // Tam ekran arayüzü: görüntü yerel görünümde (Android) ya da <video>'da (tarayıcı) tüm ekranı kaplar.
  function enterFullscreen() {
    open = true;
    lastStatus = '';
    shortEpgFor = null;
    tracksLoadedFor = null;
    root.hidden = false;
    document.body.classList.add('player-open');
    document.documentElement.classList.toggle('native-playing', !!env.native);
    q('#pl-audio').hidden = true;
    q('#pl-text').hidden = true;
    q('#pl-hud').hidden = true;
    loadLevels();
    engine.setImmersive(true, true).catch(() => {});
    showUi(true);
  }

  function openUi(item, targets, opts) {
    ctx = opts.ctx || null;
    leavePreview();
    enterFullscreen();
    player.open(item, targets, { ep: opts.ep || null, startAt: opts.startAt || 0 });
  }

  let layerOpen = false;
  function openWithLayer(item, targets, opts) {
    if (!layerOpen) {
      layerOpen = true;
      pushLayer('player', closeUi);
    }
    openUi(item, targets, opts);
  }

  // ---- önizleme penceresi (canlı TV bölmeli ekranı): yayın küçük bir yuvada oynar, dokununca tam ekran olur ----
  let previewing = false;
  let fromPreview = false; // tam ekrana önizlemeden geçildi: kapanınca önizlemeye dönülür

  function applyRect() {
    const r = env.previewRect ? env.previewRect() : null;
    if (!r) return false;
    if (env.native) engine.setRect(r).catch(() => {});
    else Object.assign(root.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    return true;
  }

  function clearRect() {
    Object.assign(root.style, { left: '', top: '', width: '', height: '' });
    if (env.native) engine.clearRect().catch(() => {});
  }

  function enterPreview() {
    previewing = true;
    root.classList.add('preview');
    root.hidden = !!env.native; // Android'de görüntü yerel görünümde; web katmanı gerekmez
    document.documentElement.classList.toggle('native-preview', !!env.native);
    document.documentElement.classList.remove('native-playing');
    applyRect();
  }

  // Önizleme durumundan çıkar (yayına dokunmaz).
  function leavePreview() {
    if (!previewing) return;
    previewing = false;
    clearRect();
    root.classList.remove('preview');
    document.documentElement.classList.remove('native-preview');
    fromPreview = true;
  }

  function previewUi(item, targets, opts) {
    if (open) return;
    ctx = opts.ctx || null;
    enterPreview();
    player.open(item, targets, { ep: null, startAt: 0 });
  }

  async function endPreview() {
    if (!previewing) return;
    previewing = false;
    fromPreview = false;
    clearRect();
    root.classList.remove('preview');
    root.hidden = true;
    document.documentElement.classList.remove('native-preview');
    await player.close();
  }

  function expand() {
    if (!previewing) return;
    leavePreview();
    if (!layerOpen) {
      layerOpen = true;
      pushLayer('player', closeUi);
    }
    enterFullscreen();
    render(player.state());
  }

  async function closeUi() {
    if (!open) return;
    open = false;
    layerOpen = false;
    clearTimeout(hideTimer);
    root.hidden = true;
    document.body.classList.remove('player-open', 'live-mode', 'vod-mode');
    document.documentElement.classList.remove('native-playing');
    q('#pl-hud').hidden = true;
    engine.setBrightness(-1).catch(() => {}); // oynatıcıdan çıkınca sistem parlaklığına dön
    if (fromPreview && env.previewRect && env.previewRect()) {
      // bölmeli ekrandan gelindi: yayın sürsün, önizleme yuvasına geri dön
      fromPreview = false;
      enterPreview();
      engine.setImmersive(false, false).catch(() => {});
      setTimeout(() => previewing && applyRect(), 350); // sistem çubukları dönünce yuva yeniden ölçülür
      if (env.onPreviewBack) env.onPreviewBack(player.state().item);
      return;
    }
    fromPreview = false;
    await player.close();
    engine.setImmersive(false, false).catch(() => {});
    if (env.onClose) env.onClose();
  }

  // ---- olaylar ----
  player.on(render);
  root.addEventListener('pointerdown', gestureStart);
  root.addEventListener('pointermove', gestureMove);
  root.addEventListener('pointerup', gestureEnd);
  root.addEventListener('pointercancel', gestureEnd);
  root.addEventListener('click', (e) => {
    if (previewing) return expand();
    if (gest.swallow) {
      gest.swallow = false; // kaydırmadan sonra gelen tıklama arayüzü açıp kapatmasın
      return;
    }
    if (e.target.closest('button, input, #pl-status .btn')) return;
    if (Date.now() - gest.tapAt < 600) return; // bu dokunuş pointer olaylarından zaten işlendi
    toggleUi();
  });
  q('#pl-back').addEventListener('click', () => popLayer('player'));
  q('#pl-play').addEventListener('click', () => {
    player.toggle();
    showUi(false);
  });
  q('#pl-rew').addEventListener('click', () => {
    player.seekBy(-10000);
    showUi(false);
  });
  q('#pl-fwd').addEventListener('click', () => {
    player.seekBy(10000);
    showUi(false);
  });
  q('#pl-prev').addEventListener('click', () => go(-1));
  q('#pl-next').addEventListener('click', () => go(1));
  q('#pl-fav').addEventListener('click', () => {
    const st = player.state();
    env.toggleFav(st.item);
    render(st);
  });
  q('#pl-epg').addEventListener('click', () => env.onEpgSheet(player.state().item));
  q('#pl-audio').addEventListener('click', () => trackSheet('audio'));
  q('#pl-text').addEventListener('click', () => trackSheet('text'));
  q('#pl-aspect').addEventListener('click', async () => {
    resizeIdx = (resizeIdx + 1) % RESIZE.length;
    await engine.setResize(RESIZE[resizeIdx][0]);
    q('#pl-aspect-l').textContent = RESIZE[resizeIdx][1];
  });
  q('#pl-status').addEventListener('click', (e) => {
    if (e.target.id === 'pl-retry') player.retry();
  });
  const seek = q('#pl-seek');
  seek.addEventListener('input', () => {
    seeking = true;
    const st = player.state();
    q('#pl-pos').textContent = fmtDuration((seek.value / 1000) * st.dur);
    showUi(true);
  });
  seek.addEventListener('change', () => {
    const st = player.state();
    seeking = false;
    player.seek((seek.value / 1000) * st.dur);
    showUi(false);
  });

  document.addEventListener('keydown', (e) => {
    if (!open || e.target.matches('input[type=search], input[type=text]')) return;
    const st = player.state();
    const live = st.live;
    const k = e.key;
    if (k === 'ArrowUp' && live) go(-1);
    else if (k === 'ArrowDown' && live) go(1);
    else if ((k === 'ArrowLeft' || k === 'MediaRewind' || k === 'Rewind') && !live) keySeek(-1);
    else if ((k === 'ArrowRight' || k === 'MediaFastForward' || k === 'FastForward') && !live) keySeek(1);
    else if ((k === 'ArrowLeft' || k === 'ArrowRight') && live) hud('info', 'Canlı yayında sarma yok');
    else if (k === 'PageUp' || k === 'MediaTrackPrevious') go(-1);
    else if (k === 'PageDown' || k === 'MediaTrackNext') go(1);
    else if (k === ' ' || k === 'MediaPlayPause') player.toggle();
    else if (k === 'Enter' && !e.target.closest('button')) {
      if (ui.classList.contains('show')) player.toggle();
    } else return;
    showUi(false);
    if (k !== 'Enter') e.preventDefault();
  });

  return {
    open: openWithLayer,
    preview: previewUi,
    expand,
    endPreview,
    syncPreview: () => previewing && applyRect(),
    isPreviewing: () => previewing,
    close: () => popLayer('player'),
    isOpen: () => open,
    refresh: () => render(player.state()),
    toastError: (m) => toast(m),
  };
}
