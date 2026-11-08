// Oynatıcı ekranı: denetim çubukları, kanal değiştirme, ses/altyazı seçimi, klavye/kumanda.
import { esc, fmtDuration, fmtClock } from './util.js';
import { $, icon, openSheet, toast } from './ui.js';
import { pushLayer, popLayer } from './nav.js';

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

  function showUi(stick) {
    ui.classList.add('show');
    clearTimeout(hideTimer);
    const st = player.state();
    if (!stick && st.status === 'playing') hideTimer = setTimeout(() => ui.classList.remove('show'), 4000);
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

  function render(st) {
    if (!open || !st.item) return;
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
      showUi(false);
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

  function openUi(item, targets, opts) {
    open = true;
    ctx = opts.ctx || null;
    shortEpgFor = null;
    tracksLoadedFor = null;
    root.hidden = false;
    document.body.classList.add('player-open');
    document.documentElement.classList.toggle('native-playing', !!env.native);
    q('#pl-audio').hidden = true;
    q('#pl-text').hidden = true;
    engine.setImmersive(true, true).catch(() => {});
    showUi(true);
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

  async function closeUi() {
    if (!open) return;
    open = false;
    layerOpen = false;
    clearTimeout(hideTimer);
    root.hidden = true;
    document.body.classList.remove('player-open', 'live-mode', 'vod-mode');
    document.documentElement.classList.remove('native-playing');
    await player.close();
    engine.setImmersive(false, false).catch(() => {});
  }

  // ---- olaylar ----
  player.on(render);
  root.addEventListener('click', (e) => {
    if (e.target.closest('button, input, #pl-status .btn')) return;
    if (ui.classList.contains('show') && player.state().status === 'playing') ui.classList.remove('show');
    else showUi(false);
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
    else if (k === 'ArrowLeft' && !live) player.seekBy(-10000);
    else if (k === 'ArrowRight' && !live) player.seekBy(10000);
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
    close: () => popLayer('player'),
    isOpen: () => open,
    refresh: () => render(player.state()),
    toastError: (m) => toast(m),
  };
}
