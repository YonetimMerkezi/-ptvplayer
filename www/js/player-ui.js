// Oynatıcı ekranı: denetim çubukları, kanal değiştirme, ses/altyazı seçimi, klavye/kumanda.
import { esc, fmtDuration, fmtClock, fold } from './util.js';
import { VirtualList } from './vlist.js';
import { $, icon, openSheet, toast } from './ui.js';
import { pushLayer, popLayer } from './nav.js';
import { normalizeLabels } from './ptools.js';
import { classify, seekDelta, seekTarget, levelFrom, seekStep, fmtDelta, pinchMode, dist2 } from './gestures.js';
import { channelNumber, resolveChannel, createChannelNumber } from './chnum.js';
import { SLEEP_OPTIONS, createSleepTimer, fmtRemaining } from './sleep.js';
import { REC_LIMITS, fmtElapsed } from './rec.js';
import { DELAY_PRESETS, clampDelay, stepDelay, fmtDelay, describeDelay } from './avsync.js';
import { statsRows } from './stats.js';
import { NIGHT_LEVELS, normalizeNight, nightLabel, DEFAULT_NIGHT } from './night.js';
import { decideTracks } from './langpref.js';
import { nextUp, introSkip, DEFAULT_INTRO } from './nextup.js';
import { PLAYER_ACTIONS, DEFAULT_PLAYER, colorOf, actionFor } from './remote.js';
import { nextIndex, nextRepeat, normalizeRepeat, REPEAT_LABEL, hueOf } from './music-order.js';
import { SUB_SIZES, SUB_COLORS, SUB_BGS, SUB_POS, DEFAULT_SUB, normalizeSub, subParams, subPreviewStyle } from './subtitle.js';

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
  // KÖK NEDEN DÜZELTMESİ: müzikte geri çıkınca video penceresi (mini oynatıcı/PiP) açılmaz; arayüz kapanır, müzik normal bir müzik çalar gibi
  // arka planda sürer (bildirim ve durum çubuğundan yönetilir). bgMusic: arayüz kapalı ama müzik çalıyor.
  let bgMusic = false;
  let quietUntil = 0; // bu süre dolmadan başlayan sıradaki parça arayüzü yeniden açmaz (go() koyar; kullanıcının kendi seçimi etkilenmez)
  let bgAdvanced = null;
  const keepsPlaying = (cur) => !!(env.native && cur && cur.item && cur.item.audio && !onTv() && cur.status !== 'idle' && cur.status !== 'error' && cur.status !== 'ended');
  let playerLocked = false;
  const dockQuery = window.matchMedia('(orientation: portrait)');
  // Dikey kip (YouTube düzeni): video üstte, altta başlık + araç düğmeleri + içerik. Araç düğmeleri ve yayın satırı bu kipte
  // videonun altındaki bilgi alanına taşınır (kontrol katmanı gizlense de görünür kalır); aksi halde kendi yerlerine döner.
  // Öğeler taşınır, kopyalanmaz: kimlikleri ve dinleyicileri korunur.
  function syncDock() {
    const bot = root.querySelector('.pl-bot');
    const tools = root.querySelector('.pl-tools') || document.querySelector('.pl-tools');
    const line = $('#pl-epgline');
    const toolsHost = $('#pl-info-tools');
    const lineHost = $('#pl-info-line');
    if (!bot || !tools || !line || !toolsHost || !lineHost) return;
    const on = open && dockQuery.matches && (root.classList.contains('portrait-split') || root.classList.contains('vod-portrait'));
    if (on) {
      if (tools.parentNode !== toolsHost) {
        lineHost.append(line);
        toolsHost.append(tools);
      }
    } else if (tools.parentNode !== bot) {
      bot.append(line, tools); // özgün sıra: ilerleme çubuğu, yayın satırı, araçlar
    }
    // Yayın bilgisi penceresi: dikey kipte araç düğmelerinin altında, sayfanın akışında durur (videoyu, başlığı ve düğmeleri kapatmaz);
    // yatayda videonun üstünde yüzen penceredir.
    const stats = document.getElementById('pl-stats-box');
    const info = $('#pl-info');
    if (stats && info) {
      if (on && stats.parentNode !== info) info.append(stats);
      else if (!on && stats.parentNode !== root) root.append(stats);
    }
  }
  const setPlayerLocked = (on) => {
    playerLocked = !!on;
    root.classList.toggle('locked', playerLocked);
    q('#pl-lock').innerHTML = icon(playerLocked ? 'lock-open' : 'lock') + '<span>' + (playerLocked ? 'Kilidi aç' : 'Kilitle') + '</span>';
    q('#pl-lock').setAttribute('aria-label', playerLocked ? 'Oynatıcı kilidini aç' : 'Oynatıcıyı kilitle');
    q('#pl-unlock').hidden = !playerLocked;
    q('#pl-epg-panel').hidden = playerLocked || !window.matchMedia('(orientation: portrait)').matches || player.state().item?.kind !== 'live';
    if (playerLocked) setPortraitSplit(false);
    else if (open && player.state().item) renderPortraitEpg(player.state());
    clearTimeout(hideTimer);
  };
  let resizeIdx = Math.max(0, RESIZE.findIndex(([id]) => id === (env.pref ? env.pref('resize', 'fit') : 'fit')));
  let seeking = false;
  let shortEpgFor = null;
  let tracksLoadedFor = null;

  // ---- kaydırma hareketleri: sol yarı dikey = parlaklık, sağ yarı dikey = ses, yatay = sarma ----
  // Tam ekran ↔ küçük ekran düğmesi: oturum boyunca "Telefon oynatıcı yönü" ayarının üstüne yazar; oynatıcı kapanınca sıfırlanır.
  let orientOverride = null;
  // Videoya göre otomatik yön: 'portrait' = dikey tam ekran, 'landscape' = yatay tam ekran. Elle seçim (orientOverride) her zaman önceliklidir.
  let autoDir = null;
  let autoFor = null;
  const autoOrientOn = () => !!env.autoOrient && env.autoOrient() && !onTv();
  // Ekran dönemiyorsa (TV, projeksiyon) ya da kullanıcı yatayı seçtiyse dikey video uzatılmaz: kayıtlı "uzat/doldur" tercihi bu video için yok sayılır, şeritli sığdırma kullanılır.
  let fitFor = null;
  function fitPortraitVideo(st) {
    if (!open || !st.item || st.item.kind === 'live' || st.item.kind === 'recording' || st.item.cast) return;
    if (!(st.vh > st.vw) || (!orientOverride && autoDir === 'portrait')) return;
    const key = st.item.id + '|' + (st.ep ? st.ep.id : '');
    if (fitFor === key) return;
    fitFor = key;
    if (RESIZE[resizeIdx][0] !== 'fit') engine.setResize('fit').catch(() => {});
  }
  function autoOrient(st) {
    if (!open || !st.item || orientOverride || playerLocked || !autoOrientOn()) return;
    if (st.item.kind === 'live' || st.item.kind === 'recording' || st.item.cast) return;
    if (!(st.vw > 0 && st.vh > 0)) return;
    const key = st.item.id + '|' + (st.ep ? st.ep.id : '');
    if (autoFor === key) return; // her video için bir kez
    autoFor = key;
    const dir = st.vh > st.vw ? 'portrait' : 'landscape';
    if (dir === autoDir && !root.classList.contains('vod-portrait')) return;
    autoDir = dir;
    hud('aspect', dir === 'portrait' ? 'Dikey video' : 'Yatay video'); // ekranda görünür: yön kendiliğinden seçildi
    root.classList.remove('vod-portrait'); // otomatik yön hep tam ekrandır (küçük ekran yerleşimi değil)
    engine.setImmersive(true, dir === 'landscape').catch(() => {}); // yatay kilit ↔ dikey kilit
    if (engine.kind === 'native') engine.clearRect().catch(() => {}); // küçük ekran yuvası kalkar, görüntü tüm ekranı kaplar
    syncDock();
    syncOrientBtn(st.item);
    render(st);
  }
  // Otomatik yön (autoDir) tam ekran demektir: küçük ekran (dikey yerleşim) yalnız ayardan ya da elle seçimden gelir
  // Müzik (medya merkezindeki ses dosyaları) telefonda hep dikey müzik çalar ekranında açılır: üstte kapak, altında denetimler ve şarkı listesi.
  // TV'de ekran dönmediğinden olağan oynatıcı kalır. musicNow: açık olan öğe müzik mi.
  const isMusic = (item) => !!(item && item.audio && !item.cast) && !onTv();
  // Küçük ekran (üstte 16:9 video kutusu, altında denetimler) canlı dışındaki her yerel öğede vardır: film, dizi, müzik ve kayıt.
  // Kayıt bunun dışında kalınca "Dikey" ayarı ekranı dikeye kilitliyor ama kutu kurulmuyor; 16:9 görüntü tüm dikey ekrana gerilip bozuluyordu.
  const hasSmallScreen = (item) => !!item && (item.kind !== 'live' || !!item.radio) && !item.cast; // radyo canlı akıştır ama müzik çalar gibi küçük ekran düzeninde açılır
  let musicNow = false;
  const orientNow = () => (musicNow ? 'portrait' : orientOverride || (autoDir ? 'landscape' : env.pref ? env.pref('set.playerOrientation', 'landscape') : 'landscape'));
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

  // ---- iki parmakla yakınlaştırma: açınca bir üst görünüm kipi (sığdır → yakınlaştır → doldur), kısınca bir alt kip ----
  const pts = new Map();
  let pinch = null;
  function pinchDown(e) {
    if (!open || e.pointerType === 'mouse') return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d0: dist2(a, b), done: false };
      gest.id = null; // tek parmak hareketi (kaydırma/dokunma) iptal
      gest.mode = null;
    }
  }
  function pinchMove(e) {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!pinch || pinch.done || pts.size !== 2 || !(pinch.d0 > 0)) return;
    const [a, b] = [...pts.values()];
    const n = pinchMode(dist2(a, b) / pinch.d0, resizeIdx, RESIZE.length);
    if (n !== resizeIdx) {
      pinch.done = true; // bir tutuşta tek kip değişir
      applyResize(n, true);
    }
  }
  function pinchEnd(e) {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
  }

  // En-boy kipi: seçim kalıcıdır, her yayın açılışında yeniden uygulanır.
  function applyResize(idx, announce = false) {
    resizeIdx = idx;
    engine.setResize(RESIZE[idx][0]).catch(() => {});
    q('#pl-aspect-l').textContent = RESIZE[idx][1];
    if (announce) {
      if (env.setPref) env.setPref('resize', RESIZE[idx][0]);
      hud('aspect', RESIZE[idx][1]);
    }
  }

  function applyLevel(kind, v) {
    if (kind === 'brightness') engine.setBrightness(v).catch(() => {});
    else engine.setVolume(v).catch(() => {});
  }

  function gestureStart(e) {
    gest.swallow = false;
    const stacked = dockQuery.matches && (root.classList.contains('portrait-split') || root.classList.contains('vod-portrait'));
    // Dikey kipte yerel görüntü #pl-video-frame kutusundadır (#vid gizli); kaydırma hareketleri yalnız bu kutuda çalışır
    let videoRect = (stacked ? q('#pl-video-frame') : q('#vid')).getBoundingClientRect();
    // KÖK NEDEN DÜZELTMESİ: Android'de yerel oynatma sırasında `html.native-playing #vid { display: none }` olduğundan #vid ölçüsü 0×0 döner;
    // her dokunuş "video dışı" sayılıp kaydırma (ileri-geri sarma, parlaklık, ses) hiç başlamıyordu. Tam ekran yatay kipte görüntü zaten
    // tüm oynatıcıyı kapladığı için ölçü boşsa oynatıcı kökü kullanılır.
    if (!(videoRect.width > 0 && videoRect.height > 0)) videoRect = root.getBoundingClientRect();
    if (playerLocked || pts.size >= 2 || !open || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('button, input, #pl-status .btn') ||
        e.clientX < videoRect.left || e.clientX > videoRect.right || e.clientY < videoRect.top || e.clientY > videoRect.bottom) {
      gest.id = null;
      return;
    }
    Object.assign(gest, { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: Date.now(), mode: null, target: null, videoRect });
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
      if (m === 'h' && musicNow) {
        gest.mode = 'swipe'; // müzik çalar: yatay kaydırma şarkı değiştirir
      } else if (m === 'h') {
        if (st.live || !(st.dur > 0)) {
          gest.mode = 'none';
          return hud('info', 'Canlı yayında sarma yok');
        }
        gest.mode = 'h';
        gest.base = st.pos;
      } else {
        gest.mode = 'v';
        gest.kind = gest.x0 < gest.videoRect.left + gest.videoRect.width / 2 ? 'brightness' : 'volume';
        gest.start = levels[gest.kind];
      }
    }
    if (gest.mode === 'swipe') {
      dragArt(dx);
    } else if (gest.mode === 'h') {
      const st = player.state();
      const sec = seekDelta(dx, gest.videoRect.width);
      gest.target = seekTarget(gest.base, sec, st.dur);
      const real = (gest.target - gest.base) / 1000;
      hud(real >= 0 ? 'fwd' : 'rew', `${fmtDelta(real)} · ${fmtDuration(gest.target)}`);
    } else if (gest.mode === 'v') {
      const v = levelFrom(gest.start, dy, gest.videoRect.height);
      levels[gest.kind] = v;
      const now = Date.now();
      if (now - gest.applied > 40) {
        gest.applied = now;
        applyLevel(gest.kind, v);
      }
      hud(gest.kind === 'brightness' ? 'sun' : 'audio', `${gest.kind === 'brightness' ? 'Parlaklık' : 'Ses'} ${Math.round(v * 100)}%`, v);
    }
  }

  // Müzik çalar: yukarı kaydırınca üst alan (küçük kapak, düğmeler, ilerleme) küçülür ve şarkı listesi büyür; listenin başında
  // aşağı çekince ya da yukarı kaydırmayı geri alınca eski haline döner. Durum şarkılar arasında korunur, çalar kapanınca sıfırlanır.
  let musicCompact = false;
  function setMusicCompact(on) {
    if (musicCompact === on) return;
    musicCompact = on;
    root.classList.toggle('music-min', musicNow && on);
  }

  // Müzik çalar: kapak parmakla birlikte kayar; yeterince uzağa ya da hızlı bırakılırsa şarkı değişir (sola: sonraki, sağa: önceki).
  // Kaydırma yetmezse kapak yerine döner. Kapak, yeni şarkı için karşı taraftan kayarak gelir.
  const musicArt = () => q('#pl-music .pm-art');
  function dragArt(dx) {
    const a = musicArt();
    a.style.transition = 'none';
    a.style.setProperty('--sx', dx * 0.7 + 'px');
    a.style.opacity = String(Math.max(0.35, 1 - Math.abs(dx) / 480));
  }
  function finishSwipe(dx, ended) {
    const a = musicArt();
    const w = (gest.videoRect && gest.videoRect.width) || 360;
    const dir = dx < 0 ? 1 : -1;
    const fast = Math.abs(dx) > 30 && Math.abs(dx) / Math.max(1, Date.now() - gest.t0) > 0.5;
    const can = ended && !!ctx && Array.isArray(ctx.items) && ctx.items.length > 1 && (Math.abs(dx) > Math.max(60, w * 0.18) || fast);
    const settled = () => setTimeout(() => (a.style.transition = ''), 280); // satır içi geçiş kalmasın: küçülme animasyonu CSS'ten gelir
    if (!can) {
      a.style.transition = 'transform .18s ease-out, opacity .18s ease-out';
      a.style.setProperty('--sx', '0px');
      a.style.opacity = '';
      settled();
      return;
    }
    a.style.transition = 'transform .14s ease-in, opacity .14s ease-in';
    a.style.setProperty('--sx', -dir * w * 0.7 + 'px');
    a.style.opacity = '0';
    setTimeout(() => {
      go(dir);
      a.style.transition = 'none';
      a.style.setProperty('--sx', dir * w * 0.35 + 'px');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        a.style.transition = 'transform .22s ease-out, opacity .22s ease-out';
        a.style.setProperty('--sx', '0px');
        a.style.opacity = '';
        settled();
      }));
    }, 140);
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
    if (gest.mode === 'swipe') finishSwipe(e.clientX - gest.x0, e.type === 'pointerup');
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
      if (seeking || musicNow) return; // müzik çalarda denetimler hep görünür
      ui.classList.remove('show');
      if (ui.contains(document.activeElement)) document.activeElement.blur(); // gizli düğmede odak kalmasın: oklar yine kanal/sarma yapsın
    }, HIDE_MS);
  }

  function showUi(stick) {
    if (playerLocked) return;
    ui.classList.add('show');
    clearTimeout(hideTimer);
    if (!stick && player.state().status === 'playing') scheduleHide();
    refreshTip();
  }

  function title(st) {
    if (st.ep) return { name: st.item.name, sub: st.ep.label || st.ep.title };
    if (st.item.cast) return { name: st.item.name, sub: 'Telefondan oynatılıyor' };
    if (st.item.radio) return { name: st.item.name, sub: st.item.artist || 'Canlı radyo' }; // tür · biçim; kanal numarası yok
    if (st.item.kind === 'live' && ctx && ctx.items.length > 1) return { name: st.item.name, sub: 'Kanal ' + channelNumber(st.item, ctx.index) };
    if (st.item.audio) return { name: st.item.name, sub: [st.item.artist, st.item.album].filter(Boolean).join(' · ') }; // müzik: sanatçı · albüm (etiketten)
    return { name: st.item.name, sub: '' };
  }

  let panelEpgFor = '';
  let splitVideo = false;
  function setPortraitSplit(enabled) {
    const next = !!enabled && !playerLocked;
    root.classList.toggle('portrait-split', next);
    syncDock();
    if (splitVideo === next) return;
    splitVideo = next;
    if (engine.kind === 'native') {
      if (next) {
        requestAnimationFrame(() => {
          const v = q('#pl-video-frame').getBoundingClientRect();
          if (v.width > 0 && v.height > 0) engine.setRect({ x: v.left, y: v.top, w: v.width, h: v.height }).catch(() => {});
        });
      } else {
        engine.clearRect().catch(() => {});
      }
    }
  }
  function renderPortraitEpg(st) {
    const panel = q('#pl-epg-panel');
    const enabled = !!st.item && st.item.kind === 'live' && !st.item.cast && window.matchMedia('(orientation: portrait)').matches;
    setPortraitSplit(enabled);
    panel.hidden = !enabled || playerLocked;
    if (!enabled) { panelEpgFor = ''; return; }
    q('#pl-epg-channel').textContent = st.item.name || '';
    if (panelEpgFor === st.item.id) return;
    panelEpgFor = st.item.id;
    q('#pl-epg-programs').innerHTML = '<p class="hint">Program bilgisi yükleniyor…</p>';
    env.shortEpg(st.item).then((list) => {
      const cur = player.state();
      if (!open || !cur.item || cur.item.id !== st.item.id || !window.matchMedia('(orientation: portrait)').matches) return;
      const now = Date.now();
      const rows = (list || []).filter((p) => p.e > now - 60 * 60 * 1000).slice(0, 8);
      q('#pl-epg-programs').innerHTML = rows.length ? rows.map((p) => {
        const active = p.s <= now && p.e > now;
        return `<div class="pl-epg-row${active ? ' active' : ''}"><span class="pl-epg-time">${fmtClock(p.s)}</span><span class="pl-epg-name">${esc(p.t || 'Program')}</span><span class="pl-epg-state">${active ? 'Şimdi' : fmtClock(p.e)}</span></div>`;
      }).join('') : '<p class="hint">Bu kanal için yayın akışı bulunamadı.</p>';
    }).catch(() => { q('#pl-epg-programs').innerHTML = '<p class="hint">Yayın akışı alınamadı.</p>'; });
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
  let altShown = '';
  // Alt düğmeler tek satırda ve ortada; yalnız Ayarlar'da seçilenlerin adı yazar, diğerleri simge (adı aria-label'de kalır; üzerine gelince/odaklanınca etiket çıkar).
  let labelSig = '';
  function scheduleFit() {
    const bar = q('.pl-tools');
    if (!bar) return;
    const on = new Set(normalizeLabels(env.pref ? env.pref('pl.labels', []) : []));
    // Yalnızca seçim ya da düğme yazıları değişince uygulanır (her çizimde DOM'a dokunulmaz)
    const sig = [...on].join(',') + '|' + [...bar.children].map((b) => b.textContent.trim()).join('/');
    if (sig === labelSig) return;
    labelSig = sig;
    for (const b of bar.querySelectorAll('.tool')) {
      b.classList.toggle('lbl', on.has(b.id.replace(/^pl-/, '')));
      const t = b.querySelector('span');
      const name = t ? t.textContent.trim() : '';
      if (name) b.setAttribute('aria-label', name); // ad etiketini #pl-tip gösterir (yerel title ikinci bir balon açardı)
    }
  }

  let shelfSig = '';
  let shelfRev = 0; // müzik kuyruğunda sonradan gelen kapakların sürümü (ctx.cover.rev)
  let shelfSeason = null; // listede gösterilen sezon (kullanıcı seçer; oynayan bölümün sezonu değişince ona geçer)
  let shelfCurSeason = null;
  function renderVodShelf(st) {
    const shelf = q('#pl-vod-shelf');
    const title = q('#pl-vod-shelf-title');
    const row = q('#pl-vod-shelf-row');
    const isSeries = st.item && st.item.kind === 'series';
    const items = ctx && Array.isArray(ctx.items) ? ctx.items : [];
    if (!st.item || st.item.kind === 'live' || st.item.kind === 'recording' || st.item.cast || !items.length) {
      shelf.hidden = true;
      row.innerHTML = '';
      shelfSig = '';
      return;
    }
    shelf.hidden = false;
    title.textContent = ctx.title || (isSeries ? 'Bölümler' : 'Önerilen filmler');
    // Durum her güncellendiğinde (saniyede birkaç kez) yeniden çizilirse liste kaydırma konumunu yitirir; yalnız içerik değişince çizilir.
    const currentId = st.ep && st.ep.id || st.item.id;
    const seasons = isSeries ? [...new Set(items.map((e) => e.season).filter((x) => x != null))] : [];
    const curEp = isSeries ? items.find((e) => e.id === currentId) : null;
    const curSeason = curEp && curEp.season != null ? curEp.season : seasons[0];
    if (isSeries && curSeason !== shelfCurSeason) {
      shelfCurSeason = curSeason;
      shelfSeason = curSeason; // başka sezondan bölüm açılınca liste o sezona geçer
    }
    const shown = seasons.length > 1 ? (seasons.includes(shelfSeason) ? shelfSeason : curSeason) : null;
    const seasonBtn = q('#pl-season');
    seasonBtn.hidden = shown == null;
    if (shown != null) seasonBtn.innerHTML = 'Sezon ' + esc(shown) + icon('down');
    // Müzik kuyruğunda kapaklar sonradan yüklenir: liste yeniden çizilmeden (kaydırma konumu bozulmadan) kartlara eklenir.
    const rev = ctx.cover ? ctx.cover.rev : 0;
    if (rev !== shelfRev) {
      shelfRev = rev;
      row.querySelectorAll('.pl-vod-card[data-vod-index]').forEach((card) => {
        const it = items[Number(card.dataset.vodIndex)];
        const th = card.querySelector('.pl-vod-thumb');
        if (it && it.logo && th && !th.querySelector('img')) th.innerHTML = '<img src="' + esc(it.logo) + '" alt="" loading="lazy">';
      });
    }
    const sig = (isSeries ? 's' : 'm') + '|' + currentId + '|' + shown + '|' + items.map((x) => x.id).join(',');
    if (sig === shelfSig) return;
    shelfSig = sig;
    row.innerHTML = items.map((item, i) => {
      const current = item.id === currentId;
      if (shown != null && item.season !== shown) return ''; // yalnız seçili sezonun bölümleri (dizin özgün sırayı korur)
      if (!isSeries && current) return ''; // Önerilen filmler: oynayan film listede yinelenmez (dizin özgün sırayı korur)
      const label = isSeries ? (item.label || item.title || item.name || 'Bölüm') : (item.name || 'Film');
      const sub = isSeries ? (item.durationSec ? Math.round(item.durationSec / 60) + ' dk' : '') : (item.group || '');
      return '<button class="pl-vod-card' + (isSeries ? ' is-episode' : ' is-movie') + (current ? ' active' : '') + '" data-vod-index="' + i + '"><span class="pl-vod-thumb">' + (item.logo ? '<img src="' + esc(item.logo) + '" alt="" loading="lazy">' : '<span>' + esc(label.slice(0,2).toUpperCase()) + '</span>') + '</span><span class="pl-vod-copy"><b>' + esc(label) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><span class="pl-vod-action">' + icon('play') + '</span></button>';
    }).join('');
    // Dizide oynayan bölüm listede görünür alana getirilir
    const act = isSeries ? row.querySelector('.pl-vod-card.active') : null;
    if (act) requestAnimationFrame(() => act.scrollIntoView({ block: 'center' }));
    else row.scrollTop = 0;
  }

  function render(st) {
    if (!open || !st.item) return;
    const prev = lastStatus;
    lastStatus = st.status;
    const t = title(st);
    q('#pl-name').textContent = t.name;
    q('#pl-sub').textContent = t.sub;
    q('#pl-info-name').textContent = t.name;
    q('#pl-info-sub').textContent = t.sub;
    const live = st.live;
    document.body.classList.toggle('live-mode', live);
    document.body.classList.toggle('vod-mode', !live);
    musicNow = isMusic(st.item);
    if (!musicNow) musicCompact = false;
    root.classList.toggle('music', musicNow);
    root.classList.toggle('music-min', musicNow && musicCompact);
    const vodPortrait = hasSmallScreen(st.item) && orientNow() === 'portrait';
    root.classList.toggle('vod-portrait', vodPortrait);
    syncDock();
    syncOrientBtn(st.item);
    if (vodPortrait && env.native) requestAnimationFrame(() => {
      if (!open || !root.classList.contains('vod-portrait')) return;
      const v = q('#pl-video-frame').getBoundingClientRect();
      if (v.width > 0 && v.height > 0) engine.setRect({ x: v.left, y: v.top, w: v.width, h: v.height }).catch(() => {});
    });
    autoOrient(st);
    fitPortraitVideo(st);
    renderVodShelf(st);
    q('#pl-prog').classList.toggle('live', live);
    const pausing = st.status === 'playing' || st.status === 'buffering' || st.status === 'loading';
    q('#pl-play').innerHTML = icon(pausing ? 'pause' : 'play');
    q('#pl-play').setAttribute('aria-label', pausing ? 'Duraklat' : 'Oynat');
    q('#pl-fav').innerHTML = icon(env.isFav(st.item) ? 'star-on' : 'star');
    q('#pl-fav').setAttribute('aria-label', env.isFav(st.item) ? 'Favoriden çıkar' : 'Favoriye ekle');
    q('#pl-fav').style.color = env.isFav(st.item) ? 'var(--gold)' : '';
    // Dikey kipte favori düğmesi videonun altındaki başlık satırındadır; aynı durumu gösterir
    q('#pl-info-fav').innerHTML = q('#pl-fav').innerHTML;
    q('#pl-info-fav').setAttribute('aria-label', q('#pl-fav').getAttribute('aria-label'));
    q('#pl-info-fav').style.color = q('#pl-fav').style.color;
    q('#pl-epg').hidden = st.item.kind !== 'live' || !!st.item.cast || !!st.item.radio; // radyoda program rehberi yok
    if (!live && !seeking) {
      q('#pl-pos').textContent = fmtDuration(st.pos);
      q('#pl-dur').textContent = st.dur > 0 ? fmtDuration(st.dur) : '';
      q('#pl-seek').value = st.dur > 0 ? Math.round((st.pos / st.dur) * 1000) : 0;
    }
    if (live) q('#pl-pos').textContent = '';
    renderMusicButtons();
    renderMusicArt(st);
    const hasNav = !!ctx && ctx.items.length > 1;
    q('#pl-prev').hidden = !hasNav;
    q('#pl-next').hidden = !hasNav;
    q('#pl-last').hidden = !(live && lastIndex() >= 0);
    q('#pl-chs').hidden = !(live && !st.item.radio && chpAvailable());
    q('#pl-fav').hidden = st.item.kind === 'recording' || !!st.item.cast;
    q('#pl-info-fav').hidden = q('#pl-fav').hidden;
    q('#pl-tv').hidden = !(env.canCast && env.canCast()) || st.item.kind === 'recording' || !!st.item.cast;
    q('#pl-dl').hidden = !(env.canDownload && env.canDownload(st));
    renderSyncLabel();
    renderNightLabel();
    q('#pl-golive').hidden = !(st.item.kind === 'recording' && ctx && ctx.items[ctx.index] && ctx.items[ctx.index].kind === 'live');
    renderRec(st);
    renderSleepLabel();
    scheduleFit();

    const s = q('#pl-status');
    // Yükleniyor ya da hata kutusu ekranın ortasındadır: oynat/duraklat düğmesi o sırada gizlenir (üst üste binmesinler).
    // Yalnız dönen halka varsa kutunun zemini olmaz (bare); yazı varsa pencere görünümündedir.
    const busy = st.status === 'loading' || st.status === 'buffering';
    root.classList.toggle('busy', busy || st.status === 'error');
    s.classList.toggle('bare', busy && !st.reconnect);
    if (busy) {
      s.hidden = false;
      s.innerHTML = '<div class="spinner"></div>' + (st.reconnect ? `<div class="rc">Yeniden bağlanılıyor… (${st.reconnect})</div>` : '');
    } else if (st.status === 'error') {
      s.hidden = false;
      s.innerHTML = `<div>${esc(st.error)}</div><button class="btn" id="pl-retry">Yeniden dene</button>`;
      showUi(true);
    } else {
      s.hidden = true;
    }
    if (st.status === 'playing') {
      const tg = st.targets && st.targets[st.idx];
      const altKey = tg && tg.alt ? st.item.id + ':' + st.idx : '';
      if (altKey && altShown !== altKey) toast('Yedek kaynak kullanılıyor: ' + tg.alt, 3000);
      altShown = altKey;
      renderEpgLine(st);
    renderPortraitEpg(st);
      loadTrackButtons(st);
      // Gizleme sayacı her zaman güncellemesinde (saniyede birkaç kez) değil, yalnız oynatma başlayınca kurulur;
      // yoksa sayaç hiç dolmaz ve denetimler ekranda kalır. Yeniden arabelleğe almada denetimler tekrar açılmaz.
      if (prev !== 'playing' && ui.classList.contains('show')) scheduleHide();
    } else if (st.status !== 'error') {
      renderEpgLine(st);
    }
    renderNextUp(st);
    renderIntro(st);
    if (st.status === 'ended' && musicNow && !st.item.radio) {
      if (prev !== 'ended') musicGo(1, true); // bitişte bir kez: sıradaki şarkı, karışık seçim ya da tekrar
    } else if (st.status === 'ended' && ctx && ctx.autoNext && autoNextOn() && epKey(st) !== nextDismissed && ctx.index < ctx.items.length - 1) go(1);
  }

  // ---- sonraki bölüm geri sayımı ve intro atla ----
  let nextDismissed = '';
  let introDone = '';
  const epKey = (st) => (st && st.item ? st.item.id + ':' + (st.ep ? st.ep.id : '') : '');
  const autoNextOn = () => (env.autoNext ? env.autoNext() : true);
  function renderNextUp(st) {
    const card = q('#pl-nextup');
    const r = epKey(st) === nextDismissed ? { show: false } : nextUp(st, ctx, { enabled: ctx && ctx.movie ? true : autoNextOn() });
    card.hidden = !r.show;
    if (!r.show) return;
    const nxt = ctx.items[ctx.index + 1];
    q('#nu-name').textContent = (nxt && (nxt.label || nxt.title || nxt.name)) || '';
    // Film önerisi kendiliğinden başlamaz: sayaç yok, düğme yalnız "Oynat"
    q('#nu-h').textContent = r.movie ? 'Sıradaki film önerisi' : ctx.nextLabel || 'Sonraki bölüm';
    q('#nu-l').textContent = r.movie ? 'Oynat' : 'Şimdi oynat · ';
    q('#nu-s').textContent = r.movie ? '' : r.secs + ' sn';
    q('#nu-no').textContent = r.movie ? 'Kapat' : 'İptal';
  }
  function renderIntro(st) {
    const b = q('#pl-intro');
    const r = epKey(st) === introDone ? { show: false } : introSkip(st, { sec: env.intro ? env.intro() : DEFAULT_INTRO });
    b.hidden = !r.show;
    if (r.show) b.dataset.to = String(r.to);
  }

  // Son okunan ses/altyazı izleri (telefon kumandasına bildirilir; her okumada yerel eklentiye sorulmaz)
  const noTracks = () => ({ audio: [], audioBad: [], text: [], textOn: false });
  let trackCache = noTracks();
  const cacheTracks = (t) => (trackCache = { audio: (t && t.audio) || [], audioBad: (t && t.audioBad) || [], text: (t && t.text) || [], textOn: !!(t && t.textOn) });

  // Tercih edilen ses/altyazı dili (Oynatıcı ayarları): her yayın/bölüm için ses ve altyazı ayrı ayrı bir kez uygulanır;
  // sonrasında kullanıcı elle değiştirirse bozulmaz. Döner: izlerden biri değiştirildi mi.
  let langDone = { key: '', audio: false, text: false };
  async function applyLangPref(st, t) {
    const pref = env.langPref ? env.langPref() : null;
    if (!pref || (pref.audio === 'auto' && pref.sub === 'auto')) return false;
    const key = st.item.id + (st.ep ? st.ep.id : '');
    if (langDone.key !== key) langDone = { key, audio: false, text: false };
    const r = decideTracks(t, pref);
    let changed = false;
    if (!langDone.audio && t.audio && t.audio.length) {
      langDone.audio = true;
      if (r.audio !== null) {
        await Promise.resolve(engine.selectTrack('audio', r.audio)).catch(() => {});
        changed = true;
      }
    }
    if (!langDone.text && t.text && t.text.length) {
      langDone.text = true;
      if (r.text !== null) {
        await Promise.resolve(engine.selectTrack('text', r.text === 'off' ? '' : r.text)).catch(() => {});
        changed = true;
      }
    }
    return changed;
  }

  async function loadTrackButtons(st) {
    const key = st.item.id + (st.ep ? st.ep.id : '') + ':' + st.tracksVer;
    if (!env.native || tracksLoadedFor === key) return;
    tracksLoadedFor = key;
    trackCache = noTracks();
    try {
      let t = await engine.tracks();
      cacheTracks(t);
      if (await applyLangPref(st, t)) {
        t = await engine.tracks();
        cacheTracks(t);
      }
      // KÖK NEDEN DÜZELTMESİ: Cihazın çözemediği ses izleri de sayılır; yoksa tek izi AC3/DTS olan yayında düğme hiç çıkmaz, ses de nedensiz yoktu.
      const good = (t.audio || []).length;
      const bad = (t.audioBad || []).length;
      q('#pl-audio').hidden = !(good > 1 || bad > 0);
      // Cihazın çözemediği ses biçimi (AC3/DTS vb.): her kanalda ekranın ortasına uyarı çıkmaz; Ses düğmesi işaretlenir, ayrıntı
      // düğmeye dokununca açılan "Ses dili" penceresinde yazar.
      const noAudio = good === 0 && bad > 0;
      q('#pl-audio').classList.toggle('warn', noAudio);
      q('#pl-audio span').textContent = noAudio ? 'Ses çözülemiyor' : 'Ses';
      q('#pl-audio').setAttribute('aria-label', noAudio ? 'Ses: bu cihaz yayının ses biçimini çözemiyor' : 'Ses dili');
      q('#pl-text').hidden = !(t.text && t.text.length > 0);
    } catch {
      /* iz bilgisi yoksa düğmeler gizli kalır */
    }
  }

  // ---- altyazı görünümü: boyut, renk, arka plan, konum; seçim kalıcı, oynatıcıya anında iletilir (yalnız Android) ----
  const subNow = () => normalizeSub(env.pref('sub', DEFAULT_SUB));
  function subtitleSheet(onChange = () => {}) {
    const groups = [
      ['size', 'Boyut', SUB_SIZES],
      ['color', 'Renk', SUB_COLORS],
      ['bg', 'Arka plan', SUB_BGS],
      ['pos', 'Konum', SUB_POS],
    ];
    const grp = ([key, label, list]) => `<div class="sub-grp"><b>${label}</b><div class="seg sub-seg" data-g="${key}">${list.map(([id, name]) => `<button data-v="${id}">${esc(name)}</button>`).join('')}</div></div>`;
    openSheet({
      title: 'Altyazı görünümü',
      html: `<div class="sub-prev"><span id="sub-pv">Örnek altyazı metni</span></div>${groups.map(grp).join('')}<button class="btn ghost sub-reset" data-r>Varsayılana dön</button>`,
      mount: (body) => {
        const draw = () => {
          const cur = subNow();
          body.querySelectorAll('.sub-seg').forEach((g) => g.querySelectorAll('button').forEach((b) => b.classList.toggle('on', cur[g.dataset.g] === b.dataset.v)));
          $('#sub-pv', body).setAttribute('style', subPreviewStyle(cur));
        };
        const save = (v) => {
          env.setPref('sub', v);
          draw();
          if (engine.setSubtitleStyle) Promise.resolve(engine.setSubtitleStyle(subParams(v))).catch(() => toast('Altyazı görünümü uygulanamadı', 2500));
          onChange();
        };
        body.addEventListener('click', (e) => {
          const b = e.target.closest('.sub-seg [data-v]');
          if (b) return save({ ...subNow(), [b.closest('.sub-seg').dataset.g]: b.dataset.v });
          if (e.target.closest('[data-r]')) save({ ...DEFAULT_SUB });
        });
        draw();
      },
    });
  }

  // ---- gece modu (yalnız Android): sessiz konuşmayı yükseltir, patlamaları bastırır; seçim kalıcıdır ----
  const nightNow = () => normalizeNight(env.pref('night', DEFAULT_NIGHT));
  function renderNightLabel() {
    const b = q('#pl-night');
    b.hidden = !engine.setNightMode;
    const n = nightNow();
    q('#pl-night-l').textContent = n === 'off' ? 'Gece modu' : 'Gece: ' + nightLabel(n);
    b.classList.toggle('on', n !== 'off');
    b.setAttribute('aria-pressed', String(n !== 'off'));
  }
  function nightSheet() {
    if (!engine.setNightMode) return;
    const cur = nightNow();
    const rows = NIGHT_LEVELS.map(([id, label]) => `<button class="list-item" data-n="${id}"><span class="t">${esc(label)}</span>${id === cur ? icon('check').replace('class="ic"', 'class="ic ok"') : ''}</button>`).join('');
    const sh = openSheet({
      title: 'Gece modu',
      html: `${rows}<p class="hint">Gece modu sessiz konuşmaları yükseltir, patlama ve müziği bastırır; komşuyu uyandırmadan izlemek içindir. Açıkken Dolby/DTS sesler çözülerek işlenir; ilk açışta yayın yeniden açılır.</p>`,
      mount: (body) =>
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-n]');
          if (!b) return;
          const level = normalizeNight(b.dataset.n);
          env.setPref('night', level);
          renderNightLabel();
          Promise.resolve(engine.setNightMode(level)).catch(() => toast('Gece modu uygulanamadı', 2500));
          sh.close();
        }),
    });
  }

  // ---- Oynatıcı ayarları: Ses / Altyazı / Görüntü & Hız sekmeleri tek pencerede ----
  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  let speedNow = 1;
  let speedFor = '';
  const itemKey = () => {
    const st = player.state();
    return st.item ? st.item.id + (st.ep ? st.ep.id : '') : '';
  };
  const curSpeed = () => (speedFor === itemKey() ? speedNow : 1); // yeni içerik normal hızda açılır
  const dialogNow = () => !!env.pref('dialog', false);

  async function playerSettings(startTab = 'audio') {
    let tab = startTab;
    let t = await engine.tracks().catch(() => noTracks());
    const live = !!player.state().live;
    const chip = (on, attrs, label) => `<button class="ps-chip${on ? ' on' : ''}" ${attrs}>${on ? icon('check') : ''}<span>${esc(label)}</span></button>`;
    const sw = (key, title, desc, on) => `<div class="ps-sw"><span><b>${esc(title)}</b><small>${esc(desc)}</small></span><button class="ps-switch${on ? ' on' : ''}" data-sw="${key}" role="switch" aria-checked="${on}" aria-label="${esc(title)}"><i></i></button></div>`;
    const audioHtml = () => {
      const list = t.audio || [];
      const bad = t.audioBad || [];
      const rows = list.map((x) => `<button class="ps-row${x.selected ? ' on' : ''}" data-aud="${esc(x.id)}"><span>${esc(x.label)}</span>${x.selected ? icon('check') : ''}</button>`).join('');
      const badRows = bad.map((x) => `<button class="ps-row dis" data-bad="1" aria-disabled="true"><span>${esc(x.label)}<small>Bu cihaz çözemiyor${x.codec ? ' (' + esc(x.codec.replace(/^audio\//, '')) + ')' : ''}</small></span></button>`).join('');
      const langs = rows || badRows ? `<h4 class="ps-h">Mevcut ses dilleri</h4>${rows}${badRows}<hr class="ps-hr">` : '';
      const night = nightNow();
      const dyn = engine.setNightMode || engine.setDialogBoost
        ? `<h4 class="ps-h">Dinamik ses iyileştirme ayarları</h4>${engine.setNightMode ? sw('night', 'Gece modu', 'Sesleri daha yumuşak ve rahat dinlenebilir hale getir', night !== 'off') : ''}${engine.setNightMode && night !== 'off' ? `<div class="ps-chips">${NIGHT_LEVELS.filter(([id]) => id !== 'off').map(([id, label]) => chip(id === night, `data-nl="${id}"`, label)).join('')}</div>` : ''}${engine.setDialogBoost ? sw('dialog', 'Diyalog vurgulama', 'Konuşma ve diyalogları daha net öne çıkar', dialogNow()) : ''}`
        : '';
      return langs + dyn || '<p class="hint">Bu cihazda ses ayarı yok.</p>';
    };
    const textHtml = () => {
      const list = t.text || [];
      const off = list.length ? `<button class="ps-row${t.textOn ? '' : ' on'}" data-sub-id=""><span>Kapalı</span>${t.textOn ? '' : icon('check')}</button>` : '';
      const rows = list.map((x) => `<button class="ps-row${x.selected ? ' on' : ''}" data-sub-id="${esc(x.id)}"><span>${esc(x.label)}</span>${x.selected ? icon('check') : ''}</button>`).join('');
      const tracks = list.length ? `<h4 class="ps-h">Mevcut altyazılar</h4>${off}${rows}<hr class="ps-hr">` : '<p class="hint">Bu içerikte altyazı izi yok. Cihaz videolarında aynı klasördeki .srt dosyası otomatik yüklenir.</p>';
      if (!engine.setSubtitleStyle) return tracks;
      const cur = subNow();
      const grp = (key, title, items, label) => `<h4 class="ps-h">${title}</h4><div class="ps-chips">${items.map(([id, name, v]) => chip(cur[key] === id, `data-sk="${key}" data-sv="${id}"`, label ? label(name, v) : name)).join('')}</div>`;
      return tracks + grp('size', 'Altyazı boyutu', SUB_SIZES, (name, v) => `${Math.round(16 * v)} (${name})`) + grp('color', 'Altyazı rengi', SUB_COLORS) + grp('bg', 'Arka plan', SUB_BGS) + grp('pos', 'Konum', SUB_POS);
    };
    const displayHtml = () => {
      const sp = curSpeed();
      const aspect = `<h4 class="ps-h">Görüntü oranı</h4><div class="ps-chips">${RESIZE.map(([, label], i) => chip(i === resizeIdx, `data-rz="${i}"`, label)).join('')}</div>`;
      const speed = !engine.setSpeed ? '' : live ? '<h4 class="ps-h">Oynatma hızı</h4><p class="hint">Canlı yayında oynatma hızı değiştirilemez.</p>' : `<h4 class="ps-h">Oynatma hızı</h4><div class="ps-chips">${SPEEDS.map((v) => chip(v === sp, `data-sp="${v}"`, v === 1 ? 'Normal (1x)' : v + 'x')).join('')}</div>`;
      return aspect + speed;
    };
    const behaviorHtml = () => {
      const mini = !!env.pref('miniOnBack', true);
      const bg = !!env.pref('backgroundAudio', !!(player.state().item && player.state().item.audio));
      const miniRow = env.native
        ? sw('mini', 'Geri çıkınca mini oynatıcı', 'Geri tuşuna bastığında yayın küçük pencerede devam etsin', mini)
        : '<p class="hint">Mini oynatıcı tercihi Android uygulamasında kullanılabilir.</p>';
      const bgRow = engine.setBackgroundAudio
        ? sw('bgAudio', 'Arka planda ses', 'Uygulamadan çıktığında veya ekran kapandığında ses devam etsin', bg)
        : '<p class="hint">Arka planda ses özelliği Android uygulamasında kullanılabilir.</p>';
      return `<section class="ps-behavior"><h4 class="ps-h">Geri çıkış davranışı</h4>${miniRow}<h4 class="ps-h">Arka planda oynatma</h4>${bgRow}<p class="ps-note">Mini oynatıcı uygulama içinde görünür kalır. Arka planda ses ise görüntü ekranda değilken ses akışını sürdürür.</p></section>`;
    };
    const sh = openSheet({
      title: 'Oynatıcı Ayarları',
      className: 'player-sheet',
      html: '<div class="ps"></div>',
      mount: (body) => {
        const root = body.querySelector('.ps');
        const draw = () => {
          const scroll = root.querySelector('.ps-body');
          const keep = scroll ? scroll.scrollTop : 0;
          const tabs = [['audio', 'Ses', (t.audio || []).length], ['text', 'Altyazı', (t.text || []).length], ['display', 'Görüntü & Hız', null], ['behavior', 'Davranış', null]];
          root.innerHTML = `<div class="ps-tabs" role="tablist">${tabs.map(([id, label, n]) => `<button class="ps-tab${id === tab ? ' on' : ''}" role="tab" aria-selected="${id === tab}" data-tab="${id}">${label}${n == null ? '' : ` (${n})`}</button>`).join('')}</div><div class="ps-body">${tab === 'audio' ? audioHtml() : tab === 'text' ? textHtml() : tab === 'display' ? displayHtml() : behaviorHtml()}</div><button class="btn ps-ok" data-ok>TAMAM</button>`;
          root.querySelector('.ps-body').scrollTop = keep;
        };
        root.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.ok !== undefined) return sh.close();
          if (b.dataset.tab) {
            tab = b.dataset.tab;
            return draw();
          }
          if (b.dataset.bad) return toast('Bu ses biçimi bu cihazda çözülemiyor', 2500);
          if (b.dataset.aud !== undefined) {
            await engine.selectTrack('audio', b.dataset.aud).catch(() => {});
            t = await engine.tracks().catch(() => t);
          } else if (b.dataset.subId !== undefined) {
            await engine.selectTrack('text', b.dataset.subId).catch(() => {});
            t = await engine.tracks().catch(() => t);
          } else if (b.dataset.sw === 'night') {
            const level = nightNow() === 'off' ? normalizeNight('medium') : 'off';
            env.setPref('night', level);
            renderNightLabel();
            Promise.resolve(engine.setNightMode(level)).catch(() => toast('Gece modu uygulanamadı', 2500));
          } else if (b.dataset.nl) {
            const level = normalizeNight(b.dataset.nl);
            env.setPref('night', level);
            renderNightLabel();
            Promise.resolve(engine.setNightMode(level)).catch(() => toast('Gece modu uygulanamadı', 2500));
          } else if (b.dataset.sw === 'dialog') {
            const on = !dialogNow();
            env.setPref('dialog', on);
            Promise.resolve(engine.setDialogBoost(on)).catch(() => toast('Diyalog vurgulama uygulanamadı', 2500));
          } else if (b.dataset.sw === 'mini') {
            const on = !env.pref('miniOnBack', true);
            env.setPref('miniOnBack', on);
            toast(on ? 'Geri çıkınca mini oynatıcı açılacak' : 'Geri çıkınca oynatma duracak');
          } else if (b.dataset.sw === 'bgAudio') {
            const st = player.state();
            const on = !env.pref('backgroundAudio', !!(st.item && st.item.audio));
            env.setPref('backgroundAudio', on);
            if (st.targets) st.targets.forEach((target) => { target.bgAudio = on; target.title = st.item ? st.item.name : ''; });
            await engine.setBackgroundAudio(on, st.item ? st.item.name : '').catch(() => toast('Arka planda ses ayarı uygulanamadı', 3000));
            toast(on ? 'Arka planda ses açıldı' : 'Arka planda ses kapatıldı');
          } else if (b.dataset.sk) {
            const v = { ...subNow(), [b.dataset.sk]: b.dataset.sv };
            env.setPref('sub', v);
            Promise.resolve(engine.setSubtitleStyle(subParams(v))).catch(() => toast('Altyazı görünümü uygulanamadı', 2500));
          } else if (b.dataset.rz !== undefined) {
            applyResize(Number(b.dataset.rz), true);
          } else if (b.dataset.sp !== undefined) {
            speedNow = Number(b.dataset.sp);
            speedFor = itemKey();
            Promise.resolve(engine.setSpeed(speedNow)).catch(() => toast('Oynatma hızı uygulanamadı', 2500));
          } else return;
          draw();
        });
        draw();
      },
    });
  }

  // ---- müzik: karışık çalma ve tekrarlama (music-order.js). Ayarlar kalıcıdır; çalınanlar kümesi liste değişince sıfırlanır.
  const musicShuffle = () => !!(env.pref && env.pref('music.shuffle', false));
  const musicRepeat = () => normalizeRepeat(env.pref ? env.pref('music.repeat', 'off') : 'off');
  let musicList = null;
  let musicPlayed = new Set();
  // auto: şarkı kendiliğinden bitti. Dönen: yeni bir şarkı (ya da aynı şarkı baştan) başladı mı.
  function musicGo(delta, auto) {
    if (!ctx || !ctx.items || !ctx.items.length) return false;
    if (musicList !== ctx.items) {
      musicList = ctx.items;
      musicPlayed = new Set();
    }
    musicPlayed.add(ctx.index);
    const i = nextIndex({ index: ctx.index, count: ctx.items.length, delta, repeat: musicRepeat(), shuffle: musicShuffle(), auto, played: [...musicPlayed] });
    if (i < 0) return false;
    if (musicPlayed.size >= ctx.items.length) musicPlayed = new Set(); // karışık çalmada tur bitti: yeni tur
    if (bgMusic && !open) quietUntil = Date.now() + 8000; // arka plandaki müzikte sıradaki parça arayüz açmadan başlar
    const st = player.state();
    if (i === ctx.index && st.item) {
      player.open(st.item, st.targets, { startAt: 0 }); // aynı şarkı baştan (kayıtlı konumdan değil)
      return true;
    }
    ctx.index = i;
    ctx.play(ctx.items[i], i);
    return true;
  }
  function renderMusicButtons() {
    const sh = q('#pl-shuffle');
    const rp = q('#pl-repeat');
    const cur = player.state().item;
    sh.hidden = rp.hidden = !musicNow || !!(cur && cur.radio); // radyoda karışık/tekrar yok (canlı akış)
    if (!musicNow) return;
    const on = musicShuffle();
    const mode = musicRepeat();
    sh.classList.toggle('on', on);
    sh.setAttribute('aria-pressed', String(on));
    rp.classList.toggle('on', mode !== 'off');
    rp.innerHTML = icon(mode === 'one' ? 'repeat1' : 'repeat');
    rp.setAttribute('aria-label', REPEAT_LABEL[mode]);
  }
  // Müzik çaların arka planı ve kapağı: şarkıya özgü renk; şarkının kapak resmi varsa (item.logo) kapakta ve bulanık arka planda o görünür.
  let musicArtFor = null;
  function renderMusicArt(st) {
    const box = q('#pl-music');
    box.hidden = !musicNow;
    if (!musicNow) return void (musicArtFor = null);
    const key = st.item.id + '|' + (st.item.logo || '');
    if (musicArtFor === key) return;
    musicArtFor = key;
    q('#pl-info-name').parentElement.classList.remove('open'); // yeni şarkıda başlık yeniden kısaltılır
    box.style.setProperty('--mh', String(hueOf(st.item.name)));
    for (const id of ['#pm-img', '#pm-bgimg']) {
      const im = q(id);
      im.hidden = !st.item.logo;
      if (st.item.logo) im.src = st.item.logo;
      else im.removeAttribute('src');
    }
    box.classList.toggle('has-art', !!st.item.logo);
  }

  function go(delta) {
    if (!ctx || !ctx.items || !ctx.items.length) return;
    const cur = player.state().item;
    if (isMusic(cur) && !cur.radio) return void musicGo(delta, false); // radyo: canlı gibi döngüyle önceki/sonraki istasyon
    let i = ctx.index + delta;
    if (player.state().live) i = (i + ctx.items.length) % ctx.items.length;
    else if (i < 0 || i >= ctx.items.length) return;
    ctx.index = i;
    if (bgMusic && !open) quietUntil = Date.now() + 8000; // arka plandaki müzikte sıradaki parça arayüz açmadan başlar
    ctx.play(ctx.items[i], i);
  }

  // ---- son kanal / rakamla kanal ----
  // Tam ekran ya da önizlemede oynayan son iki canlı kanal hatırlanır; "Son kanal" ikisi arasında geçiş yapar.
  let curLive = null;
  let prevLive = null;
  player.on((st) => {
    if (st.item && st.item.kind === 'live' && !st.item.radio && (!curLive || curLive.id !== st.item.id)) {
      prevLive = curLive;
      curLive = st.item;
    }
  });
  const lastIndex = () => (ctx && prevLive ? ctx.items.findIndex((x) => x.id === prevLive.id) : -1);

  function lastChannel() {
    const i = lastIndex();
    if (i < 0) return hud('info', 'Son kanal yok');
    ctx.index = i;
    ctx.play(ctx.items[i], i);
  }

  const numEl = q('#pl-num');
  let numHide = 0;
  function showNum(html, ms) {
    numEl.innerHTML = html;
    numEl.hidden = !html;
    clearTimeout(numHide);
    if (html && ms) numHide = setTimeout(() => (numEl.hidden = true), ms);
  }
  const num = createChannelNumber({
    onChange: (buf) => showNum(buf ? esc(buf) : ''),
    onCommit: (n) => {
      const i = ctx ? resolveChannel(ctx.items, n) : -1;
      if (i < 0) return showNum(`${n}<small>Böyle bir kanal yok</small>`, 1400);
      showNum(`${n}<small>${esc(ctx.items[i].name)}</small>`, 1200);
      if (i === ctx.index) return;
      ctx.index = i;
      ctx.play(ctx.items[i], i);
    },
    onLast: lastChannel,
  });

  // ---- yayın kaydı (yalnız Android) ----
  let rec = null; // süren kayıt: { active, elapsedMs, bytes } | null
  let recLabel = '';
  function renderRec(st) {
    const btn = q('#pl-rec');
    const can = !!env.canRecord && st && st.item && st.item.kind === 'live';
    btn.hidden = !can && !rec;
    btn.classList.toggle('rec-on', !!rec);
    const t = rec ? fmtElapsed(rec.elapsedMs || 0) : 'Kaydet';
    if (t === recLabel) return;
    recLabel = t;
    q('#pl-rec-l').textContent = t;
  }

  function recSheet() {
    const st = player.state();
    if (!st.item) return;
    if (!rec) {
      const rows = REC_LIMITS.map(([m, label]) => `<button class="list-item" data-m="${m}"><span class="t">${esc(label)}</span></button>`).join('');
      const sh = openSheet({
        title: 'Yayını kaydet',
        html: `<p class="hint">Yayın izlerken cihaza kaydedilir (ikinci bağlantı açılmaz). Kaydı Ana ekran › Kayıtlar'dan izleyip istediğiniz yere sarabilirsiniz. Yayından çıkınca ya da başka kanala geçince kayıt biter.</p>${rows}`,
        mount: (body) =>
          body.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-m]');
            if (!b) return;
            sh.close();
            try {
              await env.recStart(st.item, Number(b.dataset.m) * 60000);
              toast('Kayıt başladı');
            } catch (err) {
              const why = String((err && err.message) || err || 'Kayıt başlatılamadı');
              toast(why, why.length > 90 ? 12000 : 4000); // uzun tanılama mesajı okunabilsin
            }
          }),
      });
      return;
    }
    const sh = openSheet({
      title: 'Kayıt sürüyor · ' + fmtElapsed(rec.elapsedMs || 0),
      html: `<button class="list-item" data-a="stop"><span class="t">Kaydı durdur</span></button><button class="list-item" data-a="watch"><span class="t">Durdur ve baştan izle</span></button><p class="hint">“Baştan izle”de kayıt biter ve kaydedilen yayın başından oynar; canlıya dön düğmesiyle yayına geri dönebilirsiniz.</p>`,
      mount: (body) =>
        body.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-a]');
          if (!b) return;
          sh.close();
          try {
            const r = await env.recStop();
            if (b.dataset.a === 'watch' && r && r.url) env.playRecording(r, ctx);
          } catch (err) {
            toast(String((err && err.message) || err || 'Kayıt durdurulamadı'), 4000);
          }
        }),
    });
  }

  // ---- uyku zamanlayıcısı ----
  const sleep = createSleepTimer({
    onWarn: () => toast('30 saniye sonra oynatma duracak'),
    onFire: () => {
      toast('Uyku zamanlayıcısı: oynatma durduruldu');
      if (open) {
        stopRequested = true;
        popLayer('player');
      } else if (previewing) endPreview();
      else if (bgMusic) {
        bgMusic = false; // arka plan müziği de uyku zamanlayıcısıyla durur
        player.close();
      }
      renderSleepLabel();
    },
  });
  let sleepLabel = '';
  function renderSleepLabel() {
    const t = sleep.active() ? fmtRemaining(sleep.remaining()) : 'Uyku';
    if (t === sleepLabel) return;
    sleepLabel = t;
    q('#pl-sleep-l').textContent = t;
  }

  // ---- ses senkronu (yalnız Android): sesi görüntüye göre geciktirir ya da öne alır; değer kalıcıdır ----
  const audioDelay = () => clampDelay(env.pref('audioDelay', 0));
  function renderSyncLabel() {
    q('#pl-sync').hidden = !engine.setAudioDelay;
    const d = audioDelay();
    q('#pl-sync-l').textContent = d ? fmtDelay(d) : 'Ses senkronu';
  }

  function syncSheet() {
    if (!engine.setAudioDelay) return;
    let timer = 0;
    let box = null;
    // Her dokunuş değeri hemen kaydeder; oynatıcıya kısa bir bekleyişten sonra, art arda dokunuşlar tek seferde iletilir.
    const send = () => {
      clearTimeout(timer);
      timer = setTimeout(() => engine.setAudioDelay(audioDelay()).catch(() => toast('Ses senkronu uygulanamadı', 2500)), 400);
    };
    const set = (ms) => {
      env.setPref('audioDelay', ms);
      draw();
      renderSyncLabel();
      send();
    };
    const btn = (d) => `<button class="btn ghost" data-d="${d}">${d > 0 ? '+' : '−'}${Math.abs(d)}</button>`;
    openSheet({
      title: 'Ses senkronu',
      className: 'player-sheet sync-player-sheet',
      html: `<p class="hint">Ses görüntüden önce geliyorsa + yönüne (geciktir), sonra geliyorsa − yönüne (öne al) ayarlayın. Değer tüm yayınlarda geçerlidir.</p><div class="sy-val" id="sy-val" aria-live="polite"></div><p class="hint" id="sy-desc"></p><label class="sy-manual-label" for="sy-range">Hassas ayar · 10 ms adım</label><input id="sy-range" class="sy-range" type="range" min="-1000" max="2000" step="10" value="${audioDelay()}"><div class="sy-manual"><input id="sy-manual" type="number" min="-1000" max="2000" step="10" value="${audioDelay()}" inputmode="numeric" aria-label="Ses senkronu milisaniye"><span>ms</span></div><div class="sy-btns">${DELAY_PRESETS.map(btn).join('')}</div><button class="btn ghost sy-reset" data-r>Sıfırla</button><p class="hint">Eksi değer sesi öne alır, artı değer geciktirir. Hassas aralık: −1000 ile +2000 ms.</p><p class="hint">Gecikme ayarlıyken Dolby/DTS sesler çözülerek işlenir. İlk ayarda yayın yeniden açılır.</p>`,
      mount: (body) => {
        box = body;
        body.addEventListener('click', (e) => {
          const d = e.target.closest('[data-d]');
          if (d) return set(stepDelay(audioDelay(), Number(d.dataset.d)));
          if (e.target.closest('[data-r]')) set(0);
        });
        const range = $('#sy-range', body);
        const manual = $('#sy-manual', body);
        range.addEventListener('input', () => set(Number(range.value)));
        manual.addEventListener('change', () => {
          const value = Number(manual.value);
          if (manual.value.trim() !== '' && Number.isFinite(value)) set(value);
          else draw();
        });
        draw();
      },
    });
    function draw() {
      const value = audioDelay();
      $('#sy-val', box).textContent = fmtDelay(value);
      $('#sy-desc', box).textContent = describeDelay(value);
      $('#sy-range', box).value = String(value);
      $('#sy-manual', box).value = String(value);
    }
  }

  function sleepSheet() {
    const cur = sleep.minutes();
    const rows = SLEEP_OPTIONS.map(
      ([m, label]) => `<button class="list-item" data-m="${m}"><span class="t">${esc(label)}</span>${m === cur ? icon('check').replace('class="ic"', 'class="ic ok"') : ''}</button>`,
    ).join('');
    const hint = sleep.active() ? `<p class="hint">Kalan süre: ${fmtRemaining(sleep.remaining())}. Süre dolunca oynatma durur.</p>` : '<p class="hint">Süre dolunca oynatma durur ve uygulama listeye döner.</p>';
    const sh = openSheet({
      title: 'Uyku zamanlayıcısı',
      html: hint + rows,
      mount: (body) =>
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-m]');
          if (!b) return;
          const m = Number(b.dataset.m);
          sleep.set(m);
          renderSleepLabel();
          sh.close();
          toast(m ? `Uyku zamanlayıcısı: ${b.querySelector('.t').textContent}` : 'Uyku zamanlayıcısı kapatıldı');
        }),
    });
  }

  // Tam ekran ↔ küçük ekran düğmesi (telefon): küçükte video üstte + altta liste (dikey), tam ekranda yatay kilitli tam ekran.
  function syncOrientBtn(item) {
    const b = q('#pl-orient');
    if (!b) return;
    const it = item || player.state().item;
    b.hidden = onTv() || !it || !!it.cast || isMusic(it); // müzik çalar hep dikeydir
    const autoPortrait = !orientOverride && autoDir === 'portrait';
    const small = !autoPortrait && !(autoDir && !orientOverride) && orientNow() === 'portrait';
    const label = autoPortrait ? 'Yatay çevir' : small ? 'Tam ekran' : 'Küçük ekran';
    b.innerHTML = icon(small || autoPortrait ? 'expand' : 'shrink');
    b.setAttribute('aria-label', label);
    b.title = label;
  }
  function toggleOrient() {
    const st = player.state();
    if (!open || !st.item || playerLocked || musicNow) return;
    // Otomatik dikey tam ekrandayken düğme yatay çevirir; otomatik yatayda küçük ekrana geçer
    orientOverride = autoDir ? (autoDir === 'portrait' ? 'landscape' : 'portrait') : orientNow() === 'portrait' ? 'landscape' : 'portrait';
    autoDir = null;
    const portrait = orientOverride === 'portrait';
    const vod = hasSmallScreen(st.item);
    root.classList.toggle('vod-portrait', vod && portrait);
    engine.setImmersive(true, !portrait).catch(() => {}); // yönü döndürür (yatay kilit ↔ dikey kilit)
    if (vod && !portrait && engine.kind === 'native') engine.clearRect().catch(() => {}); // küçük ekran yuvası kalkar, görüntü tüm ekranı kaplar
    syncDock();
    syncOrientBtn(st.item);
    render(st); // dikeyde yerel görüntü yuvası yeniden ölçülür
    hud('aspect', portrait ? 'Küçük ekran' : 'Tam ekran');
    showUi(false);
  }

  // Tam ekran arayüzü: görüntü yerel görünümde (Android) ya da <video>'da (tarayıcı) tüm ekranı kaplar.
  function enterFullscreen(item) {
    open = true;
    musicNow = isMusic(item);
    root.classList.toggle('music', musicNow);
    const vodPortrait = hasSmallScreen(item) && orientNow() === 'portrait';
    root.classList.toggle('vod-portrait', vodPortrait);
    syncDock();
    syncOrientBtn(item);
    shelfSig = '';
    shelfSeason = null;
    shelfCurSeason = null;
    setPlayerLocked(false);
    lastStatus = '';
    shortEpgFor = null;
    tracksLoadedFor = null;
    root.hidden = false;
    document.body.classList.add('player-open');
    document.documentElement.classList.toggle('native-playing', !!env.native);
    q('#pl-audio').hidden = true;
    q('#pl-audio').classList.remove('warn'); // yeni yayın: önceki yayının ses uyarısı taşınmaz
    q('#pl-audio span').textContent = 'Ses';
    q('#pl-text').hidden = true;
    q('#pl-hud').hidden = true;
    q('#pl-nextup').hidden = true;
    q('#pl-intro').hidden = true;
    q('#pl-pip').hidden = engine.kind !== 'native' || onTv() || !!(item && item.audio); // TV'de ve müzikte resim içinde resim yok
    applyResize(resizeIdx);
    loadLevels();
    const landscape = onTv() || (!vodPortrait && orientNow() !== 'portrait');
    engine.setImmersive(true, landscape).catch(() => {});
    showUi(true);
  }

  function openUi(item, targets, opts) {
    ctx = opts.ctx || null;
    autoDir = null;
    autoFor = null;
    fitFor = null;
    leavePreview();
    enterFullscreen(item);
    player.open(item, targets, { ep: opts.ep || null, startAt: opts.startAt || 0 });
  }

  let layerOpen = false;
  // ---- mini müzik çalar: müzik arka planda çalarken (arayüz kapalı) sekmelerin üstünde durur ----
  const mini = document.getElementById('mini-music');
  function renderMiniMusic(st) {
    if (!mini) return;
    const show = bgMusic && !open && !!st.item && !!st.item.audio && st.status !== 'idle' && st.status !== 'error';
    mini.hidden = !show;
    if (!show) return;
    $('#mm-name', mini).textContent = st.item.name || '';
    $('#mm-sub', mini).textContent = st.status === 'paused' ? 'Duraklatıldı' : st.status === 'playing' ? 'Çalıyor' : 'Yükleniyor…';
    $('#mm-play', mini).innerHTML = icon(st.status === 'playing' ? 'pause' : 'play');
  }
  // Arka plandaki müziğin tam ekran çaları yeniden açılır; şarkı kesilmez.
  function reopenMusic() {
    const st = player.state();
    if (!st.item) return;
    bgMusic = false;
    quietUntil = 0;
    if (!layerOpen) {
      layerOpen = true;
      pushLayer('player', closeUi);
    }
    enterFullscreen(st.item);
    render(st);
    renderMiniMusic(st);
  }
  if (mini) {
    $('#mm-open', mini).addEventListener('click', reopenMusic);
    $('#mm-play', mini).addEventListener('click', () => player.toggle());
    $('#mm-next', mini).addEventListener('click', () => go(1));
    $('#mm-close', mini).addEventListener('click', () => {
      bgMusic = false;
      player.close();
      renderMiniMusic(player.state());
    });
  }
  function openWithLayer(item, targets, opts) {
    if (bgMusic && !open && quietUntil > Date.now() && item && item.audio) {
      // Arka planda çalan müzikte sıradaki parça: yalnız oynatıcı yeni parçaya geçer, tam ekran arayüz açılmaz.
      quietUntil = 0;
      ctx = opts.ctx || null;
      player.open(item, targets, { ep: opts.ep || null, startAt: opts.startAt || 0 });
      return;
    }
    bgMusic = false;
    quietUntil = 0;
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

  const onTv = () => !!(env.isTv && env.isTv());

  // Uygulama içi küçük oynatıcı (geri tuşuyla küçülen yayın): durumu uygulamaya tek yerden bildirilir.
  let miniActive = false;
  function setMini(on) {
    if (miniActive === on) return;
    miniActive = on;
    if (env.onMiniPlayer) env.onMiniPlayer(on);
  }

  // Önizleme durumundan çıkar (yayına dokunmaz).
  function leavePreview() {
    setMini(false);
    if (!previewing) return;
    previewing = false;
    clearRect();
    root.classList.remove('preview');
    document.documentElement.classList.remove('native-preview');
    fromPreview = true;
  }

  function previewUi(item, targets, opts) {
    if (open) return;
    setMini(false);
    ctx = opts.ctx || null;
    enterPreview();
    player.open(item, targets, { ep: null, startAt: 0 });
  }

  async function endPreview() {
    if (!previewing) return;
    previewing = false;
    fromPreview = false;
    setMini(false);
    clearRect();
    root.classList.remove('preview');
    root.hidden = true;
    document.documentElement.classList.remove('native-preview');
    await player.close();
    if (env.onPreviewEnd) env.onPreviewEnd();
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

  // ---- yayın bilgisi: saniyede bir ölçüm (tampon, çözünürlük, bit hızı, bağlantı hızı, düşen kare) ----
  let statsOn = false;
  let statsTimer = 0;
  async function drawStats() {
    if (!statsOn || !open) return;
    let raw = null;
    try {
      raw = engine.stats ? await engine.stats() : null;
    } catch {
      /* ölçüm okunamadı: yalnız durum satırları görünür */
    }
    if (!statsOn || !open) return;
    q('#pl-stats-rows').innerHTML = statsRows(player.state(), raw).map((r) => `<div${r.level ? ` class="lv-${r.level}"` : ''}><span>${esc(r.k)}</span><b>${esc(r.v)}</b></div>`).join('');
  }
  function setStats(on) {
    statsOn = on;
    clearInterval(statsTimer);
    q('#pl-stats').classList.toggle('on', on);
    q('#pl-stats').setAttribute('aria-pressed', String(on));
    q('#pl-stats-box').hidden = !on;
    if (on) {
      drawStats();
      statsTimer = setInterval(drawStats, 1000);
    }
  }

  // Geri tuşu yayını mini oynatıcıya küçültür; kilit, uyku zamanlayıcısı, TV'ye gönderme ve TV'de durdurma ise yayını tamamen kapatır.
  let stopRequested = false;
  async function closeUi() {
    const stopping = stopRequested;
    stopRequested = false;
    if (!open) return;
    open = false;
    if (chp.open) chpHide();
    setPlayerLocked(false);
    layerOpen = false;
    hideTip();
    setStats(false);
    clearTimeout(hideTimer);
    num.cancel();
    sleep.cancel();
    renderSleepLabel();
    root.hidden = true;
    autoDir = null;
    autoFor = null;
    fitFor = null;
    orientOverride = null; // oturumluk tam ekran/küçük ekran seçimi biter; ayardaki yön geçerli olur
    root.classList.remove('vod-portrait');
    setPortraitSplit(false);
    syncDock(); // open artık false: araç düğmeleri kendi yerine döner
    document.body.classList.remove('player-open', 'live-mode', 'vod-mode');
    document.documentElement.classList.remove('native-playing');
    q('#pl-hud').hidden = true;
    q('#pl-nextup').hidden = true;
    q('#pl-intro').hidden = true;
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
    const current = player.state();
    // Müzik: geri çıkışta video penceresi açılmaz, müzik arka planda sürer (Kapat bildirimden). Kullanıcı kapatmayı seçtiyse (stopping) durur.
    if (!stopping && keepsPlaying(current)) {
      bgMusic = true;
      renderMiniMusic(current);
      engine.setImmersive(false, false).catch(() => {});
      if (env.onClose) env.onClose();
      return;
    }
    bgMusic = false;
    // Android'de geri çıkışta yayını kapatma: uygulama içinde yüzen mini oynatıcıya küçült.
    // Uygulama arka plana alınırsa Android'in sistem PiP akışı ayrıca çalışır.
    if (env.native && current.item && !stopping && !onTv() && env.pref('miniOnBack', true)) {
      setMini(true);
      enterPreview();
      engine.setImmersive(false, false).catch(() => {});
      setTimeout(() => previewing && applyRect(), 250);
      return;
    }
    await player.close();
    engine.setImmersive(false, false).catch(() => {});
    if (env.onClose) env.onClose();
  }


  // ---- iki seviyeli kanal paneli: Kanallar ↔ Kategoriler ----
  // Kanallar: başlıkta kategori adı, solunda ↑ Kategoriler. Kategoriler: ana ekranla aynı sıra, kanal sayısı, çalan kanalın kategorisi vurgulu.
  // Geri/Esc önce kategorilerden kanallara döner, sonra paneli kapatır (nav katmanları: 'chp' ve 'chp-cats').
  const chp = { el: null, open: false, level: 'ch', key: null, name: '', items: [], cats: [], filter: '' };
  let chpCatLayer = false;
  const chpAvailable = () => !!(env.liveCategories && env.liveItems && ctx && Array.isArray(ctx.items) && player.state().live);
  const chpCurKey = () => {
    if (ctx && ctx.catKey) return ctx.catKey;
    const it = player.state().item;
    return it && it.group ? 'g:' + it.group : null;
  };
  function chpEnsureEl() {
    if (chp.el) return chp.el;
    const el = document.createElement('section');
    el.id = 'pl-chpanel';
    el.className = 'pl-chpanel';
    el.hidden = true;
    el.setAttribute('aria-label', 'Kanal listesi');
    el.addEventListener('click', chpClick);
    el.addEventListener('input', (e) => {
      if (e.target.id !== 'chp-q') return;
      chp.filter = e.target.value.trim();
      chpRenderList(false);
    });
    root.appendChild(el);
    chp.el = el;
    return el;
  }
  function chpHide() {
    chp.open = false;
    chpDropList();
    chpCatLayer = false;
    chp.level = 'ch';
    chp.filter = '';
    if (chp.el) chp.el.hidden = true;
  }
  const chpDismiss = () => chp.open && popLayer('chp');
  function chpOpen() {
    if (!chpAvailable() || chp.open) return;
    const it = player.state().item;
    chp.level = 'ch';
    chp.key = ctx.catKey || null;
    chp.name = ctx.catName || (it && it.group) || 'Kanallar';
    chp.items = ctx.items;
    chp.filter = '';
    chp.open = true;
    chpEnsureEl().hidden = false;
    pushLayer('chp', chpHide);
    chpRender();
  }
  function chpShowCats() {
    if (!chp.open || chp.level === 'cat') return;
    chp.cats = env.liveCategories() || [];
    chp.level = 'cat';
    chp.filter = '';
    chpCatLayer = true;
    pushLayer('chp-cats', () => {
      if (!chpCatLayer) return;
      chpCatLayer = false;
      chp.level = 'ch';
      chp.filter = '';
      if (chp.open) chpRender();
    });
    chpRender();
  }
  async function chpPickCat(id) {
    const row = chp.cats.find((r) => r.id === id);
    if (!row) return;
    if (row.locked && env.unlockCat && !(await env.unlockCat(id))) return; // ana ekrandaki PIN kapısı aynen
    chp.key = id;
    chp.name = row.name;
    chp.items = env.liveItems(id) || [];
    if (chpCatLayer) popLayer('chp-cats');
    else {
      chp.level = 'ch';
      chpRender();
    }
  }
  function chpPlay(index) {
    const item = chp.items[index];
    if (!item) return;
    if (chp.items === ctx.items && ctx.play) ctx.play(item, index);
    else if (env.playLive) env.playLive(chp.items, index, { catKey: chp.key, catName: chp.name }); // ctx yeni kategorinin kanallarıyla yenilenir
    chpDismiss();
  }
  function chpRender() {
    const el = chpEnsureEl();
    const x = icon('close');
    if (chp.level === 'cat') {
      el.innerHTML = `<div class="chp-head"><b>Kategoriler</b><button class="icon-btn" data-chp="close" aria-label="Paneli kapat">${x}</button></div>` +
        (chp.cats.length > 8 ? `<label class="field chp-q"><input id="chp-q" type="search" placeholder="Kategori ara…" autocomplete="off" value="${esc(chp.filter)}"></label>` : '') +
        '<div class="chp-list" id="chp-list"></div>';
    } else {
      el.innerHTML = `<div class="chp-head"><button class="btn sm ghost chp-up" data-chp="up" aria-label="Kategoriler">${icon('up')}<span>Kategoriler</span></button><b>${esc(chp.name)}</b><button class="icon-btn" data-chp="close" aria-label="Paneli kapat">${x}</button></div><div class="chp-list" id="chp-list"></div>`;
    }
    chpRenderList(true);
  }
  // Yavaş TV kutuları ve projeksiyonlar için sanal liste: yalnız görünen ~12 satır DOM'da durur (binlerce kanal olsa da)
  let chpVl = null;
  function chpDropList() {
    if (chpVl) chpVl.destroy();
    chpVl = null;
  }
  function chpRow(it, i) {
    if (chp.level === 'cat') {
      const cur = chpCurKey();
      return `<div class="row chp-row${it.id === cur ? ' active' : ''}" role="button" tabindex="0" data-i="${i}">${it.locked ? icon('lock') : ''}${it.folder ? icon('folder') : ''}<span class="chp-n">${esc(it.name)}</span><small>${it.count}</small></div>`;
    }
    const curId = player.state().item && player.state().item.id;
    return `<div class="row chp-row${it.id === curId ? ' active' : ''}" role="button" tabindex="0" data-i="${i}"><small class="chp-num">${channelNumber(it, i)}</small><span class="chp-n">${esc(it.name)}</span></div>`;
  }
  function chpRenderList(focus) {
    const host = chp.el && chp.el.querySelector('#chp-list');
    if (!host) return;
    chpDropList();
    let rows;
    if (chp.level === 'cat') {
      const f = fold(chp.filter);
      rows = f ? chp.cats.filter((r) => fold(r.name).includes(f)) : chp.cats;
    } else rows = chp.items;
    chp.rows = rows;
    if (!rows.length) {
      host.innerHTML = `<p class="hint">${chp.level === 'cat' ? 'Kategori bulunamadı' : 'Bu kategoride kanal yok'}</p>`;
      return;
    }
    chpVl = new VirtualList(host, {
      rowH: 48,
      render: chpRow,
      onTap: (i) => (chp.level === 'cat' ? chpPickCat(chp.rows[i] && chp.rows[i].id) : chpPlay(i)),
    });
    chpVl.setItems(rows);
    const cur = chp.level === 'cat' ? chpCurKey() : (player.state().item || {}).id;
    const at = chp.level === 'cat' && chp.filter ? -1 : rows.findIndex((r) => r.id === cur);
    if (at >= 0) chpVl.scrollToIndex(at); // çalan kanal / kategori ortalanır
    if (focus && kbdMode()) requestAnimationFrame(() => chpVl && chpVl.focusIndex(Math.max(0, at)));
  }
  function chpClick(e) {
    const b = e.target.closest('[data-chp]');
    if (!b) return;
    if (b.dataset.chp === 'close') return chpDismiss();
    if (b.dataset.chp === 'up') return chpShowCats();
  }

  // ---- olaylar ----
  player.on(render);
  player.on(renderMiniMusic);
  // Arayüz kapalıyken (arka plan müziği) parça bitince sıradakine geçer; liste bitince oynatıcıyı kapatır (hayalet bildirim kalmasın).
  player.on((st) => {
    if (!bgMusic || open) return;
    if (!st.item || !st.item.audio || st.status === 'idle') {
      bgMusic = false;
      return;
    }
    if (st.item.radio) return; // radyo akışı bitmez; kopunca canlı yeniden bağlanma devreye girer, sıradaki istasyona geçilmez
    if (st.status !== 'ended' || bgAdvanced === st.item.id) return;
    bgAdvanced = st.item.id;
    if (!musicGo(1, true)) {
      bgMusic = false;
      player.close();
    }
  });
  q('#pl-chs').addEventListener('click', chpOpen);
  q('#pl-season').addEventListener('click', () => {
    const items = ctx && Array.isArray(ctx.items) ? ctx.items : [];
    const seasons = [...new Set(items.map((e) => e.season).filter((x) => x != null))];
    if (seasons.length < 2) return;
    const shown = seasons.includes(shelfSeason) ? shelfSeason : seasons[0];
    const sh = openSheet({
      title: 'Sezon seç',
      html: seasons.map((n) => `<button class="list-item" data-season="${esc(n)}"><span class="t">Sezon ${esc(n)}<small>${items.filter((e) => e.season === n).length} bölüm</small></span>${n === shown ? icon('check').replace('class="ic"', 'class="ic ok"') : ''}</button>`).join(''),
      mount: (body) => body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-season]');
        if (!b) return;
        shelfSeason = seasons.find((n) => String(n) === b.dataset.season);
        shelfSig = '';
        sh.close();
        renderVodShelf(player.state());
      }),
    });
  });
  q('#pl-vod-shelf-row').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vod-index]');
    if (!b || !ctx || !Array.isArray(ctx.items)) return;
    const index = Number(b.dataset.vodIndex);
    const item = ctx.items[index];
    if (item && ctx.play) ctx.play(item, index);
  });
  root.addEventListener('pointerdown', pinchDown);
  root.addEventListener('pointerdown', gestureStart);
  root.addEventListener('pointermove', pinchMove);
  root.addEventListener('pointermove', gestureMove);
  root.addEventListener('pointerup', pinchEnd);
  root.addEventListener('pointerup', gestureEnd);
  root.addEventListener('pointercancel', pinchEnd);
  root.addEventListener('pointercancel', gestureEnd);
  root.addEventListener('click', (e) => {
    // Düğme tıklamaları (geri oku, kapat vb.) kök dinleyiciye de ulaşır; düğme oynatıcıyı bölmeli ekran önizlemesine
    // döndürmüşse, aynı tıklama önizlemeyi hemen yeniden tam ekran yapmasın.
    if (playerLocked || e.target.closest('button, input, #pl-status .btn, #pl-below')) return;
    if (previewing) return expand();
    if (gest.swallow) {
      gest.swallow = false; // kaydırmadan sonra gelen tıklama arayüzü açıp kapatmasın
      return;
    }
    if (Date.now() - gest.tapAt < 600) return; // bu dokunuş pointer olaylarından zaten işlendi
    toggleUi();
  });
  // Ekrandaki geri oku oynatıcıyı kapatır (yayın durur); telefonun geri hareketi ise yayını mini oynatıcıya küçültür.
  q('#pl-back').addEventListener('click', () => {
    if (open && !keepsPlaying(player.state())) stopRequested = true; // müzikte geri oku da arayüzü kapatır ama müziği durdurmaz
    popLayer('player');
  });
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
  q('#pl-shuffle').addEventListener('click', () => {
    const on = !musicShuffle();
    if (env.setPref) env.setPref('music.shuffle', on);
    musicPlayed = new Set();
    renderMusicButtons();
    toast(on ? 'Karışık çalma açık' : 'Karışık çalma kapalı', 1500);
  });
  q('#pl-repeat').addEventListener('click', () => {
    const mode = nextRepeat(musicRepeat());
    if (env.setPref) env.setPref('music.repeat', mode);
    renderMusicButtons();
    toast(REPEAT_LABEL[mode], 1500);
  });
  q('#pl-prev').addEventListener('click', () => go(-1));
  q('#pl-next').addEventListener('click', () => go(1));
  q('#pl-fav').addEventListener('click', () => {
    const st = player.state();
    env.toggleFav(st.item);
    render(st);
  });
  q('#pl-info-fav').addEventListener('click', () => q('#pl-fav').click());
  // Alt alanda yukarı kaydırma / yukarı sürükleme: üst alan küçülür; listenin başında aşağı çekme: yeniden büyür.
  {
    const below = q('#pl-below');
    const row = q('#pl-vod-shelf-row');
    let ty = null;
    row.addEventListener('scroll', () => {
      if (musicNow && row.scrollTop > 12) setMusicCompact(true);
    }, { passive: true });
    below.addEventListener('touchstart', (e) => {
      ty = e.touches.length === 1 ? e.touches[0].clientY : null;
    }, { passive: true });
    below.addEventListener('touchmove', (e) => {
      if (!musicNow || ty == null) return;
      const y = e.touches[0].clientY;
      if (row.scrollTop > 0) return void (ty = y); // liste kayıyor: çekme ancak listenin başında sayılır
      if (y - ty < -24) setMusicCompact(true), (ty = y);
      else if (y - ty > 48) setMusicCompact(false), (ty = y);
    }, { passive: true });
    below.addEventListener('touchend', () => (ty = null), { passive: true });
    below.addEventListener('wheel', (e) => {
      if (!musicNow) return;
      if (e.deltaY > 0) setMusicCompact(true);
      else if (e.deltaY < 0 && row.scrollTop <= 0) setMusicCompact(false);
    }, { passive: true });
  }
  // Müzik çalarda uzun şarkı adı kısaltılır; başlığa dokununca tamamı görünür, tekrar dokununca kısalır.
  q('#pl-info-name').addEventListener('click', () => {
    if (musicNow) q('#pl-info-name').parentElement.classList.toggle('open');
  });
  q('#pl-epg').addEventListener('click', () => env.onEpgSheet(player.state().item));
  q('#pl-epg-remind').addEventListener('click', () => {
    const st = player.state();
    if (st.item && st.item.kind === 'live') env.onEpgSheet(st.item);
  });
  const portraitQuery = window.matchMedia('(orientation: portrait)');
  portraitQuery.addEventListener?.('change', () => {
    panelEpgFor = '';
    const st = player.state();
    if (open && st.item) renderPortraitEpg(st);
    else setPortraitSplit(false);
    syncDock();
  });
  window.addEventListener('resize', () => {
    if (!open) return;
    const st = player.state();
    if (st.item) renderPortraitEpg(st);
  });
  q('#pl-orient').addEventListener('click', toggleOrient);
  q('#pl-lock').addEventListener('click', () => setPlayerLocked(true));
  q('#pl-unlock').addEventListener('click', () => {
    setPlayerLocked(false);
    showUi(true);
  });
  q('#pl-last').addEventListener('click', () => {
    lastChannel();
    showUi(false);
  });
  q('#pl-sleep').addEventListener('click', () => sleepSheet());
  q('#pl-stats-x').addEventListener('click', () => setStats(false));
  q('#pl-stats').addEventListener('click', () => {
    setStats(!statsOn);
    showUi(false);
  });
  // Görüntü bozuk/donuk: aynı yayın uyumlu modda (yazılım çözücü, geniş TS ayrıştırma) yeniden açılır. Yalnız Android'de (Media3) anlamlı.
  q('#pl-fix').hidden = engine.kind !== 'native';
  q('#pl-fix').addEventListener('click', () => {
    if (!player.retryCompat) return;
    toast('Uyumlu modda yeniden açılıyor…', 2200);
    player.retryCompat();
    showUi(false);
  });
  q('#pl-sync').addEventListener('click', () => syncSheet());
  q('#pl-rec').addEventListener('click', () => recSheet());
  q('#pl-pip').hidden = engine.kind !== 'native';
  q('#pl-pip').addEventListener('click', async () => {
    try {
      await engine.enterPip();
    } catch (e) {
      toast(e && e.message ? e.message : 'PiP açılamadı');
    }
  });
  if (engine.onPipChannel) {
    engine.onPipChannel((e) => {
      const st = player.state();
      if (st.item && st.item.kind === 'live') go(Number(e.direction) || 0);
    });
  }
  // Kilit ekranı, bildirim paneli ve Bluetooth/kulaklık tuşları: yerel katman oynat/duraklat/sarmayı kendisi yapar, sıra ve kapatma burada.
  if (engine.onMediaCmd) {
    engine.onMediaCmd((e) => {
      const st = player.state();
      if (!st.item) return;
      const act = e && e.action;
      if (act === 'close') {
        // Oynatma yerelde zaten durdu; arayüz de kapanır (mini oynatıcı ya da tam ekran fark etmez).
        if (open) {
          stopRequested = true;
          popLayer('player');
        } else {
          bgMusic = false;
          player.close();
        }
        return;
      }
      if (st.item.kind === 'live') return; // canlı TV'de önceki/sonraki anlamsız
      if (act === 'next') go(1);
      else if (act === 'prev') {
        if (st.pos > 3000) player.seek(0); // parçanın başında değilse önce başa sar, sonra önceki parçaya geç
        else go(-1);
      }
    });
  }
  q('#pl-external').hidden = engine.kind !== 'native';
  q('#pl-external').addEventListener('click', async () => {
    const st = player.state();
    const target = st.targets && st.targets[st.idx];
    if (!target) return toast('Oynatma adresi bulunamadı');
    if (target.headers && Object.keys(target.headers).length) return toast('Bu yayın özel başlık gerektiriyor; harici oynatıcıya aktarılamaz');
    try { await engine.openExternal({ ...target, audio: !!(st.item && st.item.audio) }); showUi(false); }
    catch (e) { toast(e && e.message ? e.message : 'Harici oynatıcı açılamadı'); }
  });
  q('#pl-tv').addEventListener('click', () => {
    const st = player.state();
    if (st.item && env.castTo) env.castTo(st, ctx);
  });
  q('#pl-dl').addEventListener('click', () => {
    const st = player.state();
    if (st.item && env.download) env.download(st);
  });
  q('#pl-golive').addEventListener('click', () => {
    if (ctx && ctx.items[ctx.index]) ctx.play(ctx.items[ctx.index], ctx.index);
  });
  q('#pl-audio').addEventListener('click', () => playerSettings('audio'));
  q('#pl-text').addEventListener('click', () => playerSettings('text'));
  q('#pl-settings').addEventListener('click', () => playerSettings('audio'));
  q('#pl-night').addEventListener('click', nightSheet);
  q('#nu-now').addEventListener('click', () => go(1));
  q('#nu-no').addEventListener('click', () => {
    nextDismissed = epKey(player.state());
    q('#pl-nextup').hidden = true;
  });
  q('#pl-intro').addEventListener('click', () => {
    const st = player.state();
    const to = Number(q('#pl-intro').dataset.to);
    introDone = epKey(st);
    q('#pl-intro').hidden = true;
    if (to > 0) player.seek(to);
  });
  q('#pl-aspect').addEventListener('click', () => applyResize((resizeIdx + 1) % RESIZE.length, true));
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

  // Kumanda/klavye. Denetimler kapalıyken: ↑↓ kanal (canlı), ←→ sarma (film), Tamam denetimleri açar.
  // Denetimler odaktayken oklar düğmeler arasında gezinir (gezinmeyi dpad.js yapar); arama çubuğunda ←→ sarar.
  const kbdMode = () => document.documentElement.classList.contains('kbd');
  const revealControls = () => {
    showUi(false);
    if (kbdMode()) q('#pl-play').focus({ preventScroll: true });
  };
  // Kumandanın medya/kanal tuşları önizlemede (bölmeli canlı TV) de çalışır; oklar ve Tamam orada listeye aittir.
  const MEDIA_KEYS = new Set(['MediaPlayPause', 'MediaPlay', 'MediaPause', 'ChannelUp', 'ChannelDown', 'MediaTrackNext', 'MediaTrackPrevious']);
  document.addEventListener('keydown', (e) => {
    if (!open && !(previewing && MEDIA_KEYS.has(e.key))) return;
    if (e.target.matches && e.target.matches('input[type=search], input[type=text]')) return;
    const st = player.state();
    const live = st.live;
    const k = e.key;
    // Oynatıcının üstünde (over-player) alt sayfa/sayfa/şifre ekranı açıkken oklar, Tamam, boşluk ve rakamlar onlarındır (odak içinde gezer); oynatıcı yayına dokunmaz
    if (open && (k.startsWith('Arrow') || k === 'Enter' || k === ' ' || /^[0-9]$/.test(k)) && (document.getElementById('lock') || document.querySelector('#sheets > .over-player') || chp.open)) return;
    if (!open) {
      // önizleme: kanal tuşları listedeki bir sonraki/önceki kanalı önizler (tam ekranı açmaz)
      const step = k === 'ChannelUp' || k === 'MediaTrackNext' ? 1 : k === 'ChannelDown' || k === 'MediaTrackPrevious' ? -1 : 0;
      if (step) {
        if (env.onPreviewStep) env.onPreviewStep(step);
        e.preventDefault();
        return;
      }
    }
    if (open && live && !e.altKey && !e.ctrlKey && !e.metaKey) {
      if (/^[0-9]$/.test(k)) {
        num.digit(k);
        showUi(false);
        e.preventDefault();
        return;
      }
      if (k === 'Enter' && num.active()) {
        num.commit();
        e.preventDefault();
        return;
      }
      if (k === 'LastChannel') {
        lastChannel();
        showUi(false);
        e.preventDefault();
        return;
      }
    }
    const inCtl = open && ui.classList.contains('show') && !!e.target.closest && !!e.target.closest('#pl-ui');
    if (inCtl && k.startsWith('Arrow')) {
      if (e.target.id === 'pl-seek' && !live && (k === 'ArrowLeft' || k === 'ArrowRight')) {
        keySeek(k === 'ArrowLeft' ? -1 : 1);
        showUi(false);
        e.preventDefault();
      } else showUi(false); // gezinme dpad.js'te; denetimler açık kalsın
      return;
    }
    const seekKey = k === 'MediaFastForward' || k === 'FastForward' || k === 'MediaSkipForward' ? 1 : k === 'MediaRewind' || k === 'Rewind' || k === 'MediaSkipBackward' ? -1 : 0;
    const visibleBtn = (id) => !q(id).hidden && !q(id).disabled;
    // Yön tuşları denetimler kapalıyken (ya da odak denetimlerde değilken) yalnız denetimleri açar: yayın durmaz, kanal/konum değişmez.
    // Sonra oklar düğmeler arasında gezer, Tamam odaktaki düğmeye basar (duraklat dahil). Kanal için kanal +/- ve rakam tuşları, sarma için ileri/geri tuşları kullanılır.
    if (k.startsWith('Arrow')) revealControls();
    else if (k === 'ChannelDown' && live) go(-1);
    else if (k === 'ChannelUp' && live) go(1);
    else if (seekKey && !live) keySeek(seekKey);
    else if (seekKey) hud('info', 'Canlı yayında sarma yok');
    else if (k === 'ChannelUp' || k === 'ChannelDown') go(k === 'ChannelUp' ? 1 : -1);
    else if (k === 'PageUp' || k === 'MediaTrackPrevious') go(-1);
    else if (k === 'PageDown' || k === 'MediaTrackNext') go(1);
    else if (k === ' ' || k === 'MediaPlayPause') player.toggle();
    else if (k === 'MediaPlay') {
      if (st.status === 'paused' || st.status === 'ended') player.toggle();
    } else if (k === 'MediaPause') {
      if (st.status === 'playing' || st.status === 'buffering') player.toggle();
    } else if (k === 'MediaStop') {
      stopRequested = true;
      popLayer('player');
    } else if (k === 'Info') showUi(true);
    else if (k === 'Guide' && live) env.onEpgSheet(st.item);
    else if (k === 'Captions' && visibleBtn('#pl-text')) playerSettings('text');
    else if (k === 'AudioTrack' && visibleBtn('#pl-audio')) playerSettings('audio');
    else if (colorOf(k)) {
      // renkli tuşlar: Genel ayarlar > Kumanda renkli tuşları'nda atanan iş (varsayılan: kırmızı favori, yeşil altyazı, sarı uyku, mavi en-boy)
      const act = actionFor(k, env.pref ? env.pref('remote.player', null) : null, PLAYER_ACTIONS, DEFAULT_PLAYER);
      const btn = act && PLAYER_ACTIONS.find((a) => a[0] === act)[2];
      if (btn && visibleBtn(btn)) q(btn).click();
      else if (btn) hud('info', 'Bu tuş şu an kullanılamıyor');
    }
    else if (k === 'Enter' && !e.target.closest('button') && !ui.classList.contains('show') && !q('#pl-intro').hidden) q('#pl-intro').click(); // kumanda: Tamam, görünen intro düğmesine basar
    else if (k === 'Enter' && !e.target.closest('button') && !ui.classList.contains('show') && !q('#pl-nextup').hidden) q('#nu-now').click(); // kumanda: Tamam, sonraki bölümü hemen açar
    else if (k === 'Enter' && !e.target.closest('button')) {
      if (ui.classList.contains('show')) player.toggle();
      else revealControls();
    } else return;
    if (open) showUi(false);
    if (k !== 'Enter') e.preventDefault();
  });

  // ---- simge düğmelerinin üstünde küçük ad etiketi: fare üzerine gelince ve kumanda odağında ----
  // Tek bir yüzen öğe kullanılır (kaydırmalı araç satırı etiketi kırpmasın); düğmenin üstüne, sığmazsa altına konur.
  const tipEl = document.createElement('div');
  tipEl.className = 'pl-tip';
  tipEl.hidden = true;
  tipEl.setAttribute('aria-hidden', 'true');
  root.appendChild(tipEl);
  let tipFor = null;
  function tipOf(b) {
    switch (b.id) {
      case 'pl-aspect':
        return 'En-boy: ' + RESIZE[resizeIdx][1];
      case 'pl-sleep':
        return sleep.active() ? 'Uyku zamanlayıcısı: ' + fmtRemaining(sleep.remaining()) : 'Uyku zamanlayıcısı';
      case 'pl-night': {
        const n = nightNow();
        return n === 'off' ? 'Gece modu' : 'Gece modu: ' + nightLabel(n);
      }
      case 'pl-stats':
        return 'Yayın bilgisi';
      default: {
        const l = b.getAttribute('aria-label');
        if (l) return l;
        const sp = b.querySelector('span');
        return sp ? sp.textContent.trim() : '';
      }
    }
  }
  function hideTip() {
    tipFor = null;
    tipEl.hidden = true;
  }
  function showTip(b) {
    const text = b && !b.hidden ? tipOf(b) : '';
    if (!text) return hideTip();
    tipFor = b;
    tipEl.textContent = text;
    tipEl.hidden = false;
    const r = b.getBoundingClientRect();
    const o = root.getBoundingClientRect();
    const w = tipEl.offsetWidth;
    const h = tipEl.offsetHeight;
    const x = Math.max(8, Math.min(o.width - w - 8, r.left - o.left + r.width / 2 - w / 2));
    let y = r.top - o.top - h - 10;
    if (y < 8) y = r.bottom - o.top + 10; // üst çubuktaki düğmelerin etiketi altına
    tipEl.style.left = x + 'px';
    tipEl.style.top = y + 'px';
  }
  const tipBtn = (t) => (t && t.closest ? t.closest('#pl-ui button') : null);
  function refreshTip() {
    const a = document.activeElement;
    if (open && kbdMode() && tipBtn(a)) showTip(a);
  }
  ui.addEventListener('pointerover', (e) => {
    const b = e.pointerType === 'mouse' ? tipBtn(e.target) : null;
    if (b) showTip(b);
  });
  ui.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'mouse' && tipBtn(e.target) !== tipBtn(e.relatedTarget)) hideTip();
  });
  ui.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') hideTip(); // dokunmada etiket gerekmez; fare tıklamasında kalır ve yeni adla güncellenir
  });
  ui.addEventListener('focusin', (e) => {
    const b = kbdMode() ? tipBtn(e.target) : null;
    if (b) showTip(b);
    else hideTip();
  });
  ui.addEventListener('focusout', hideTip);
  // düğme adı tıklamayla değişir (Oynat ↔ Duraklat, en-boy kipi…): etiket yeni adla yenilenir
  ui.addEventListener('click', (e) => {
    const b = tipBtn(e.target);
    if (b && tipFor === b) setTimeout(() => tipFor === b && showTip(b), 60);
  });
  // denetimler gizlenince etiket de gider
  new MutationObserver(() => {
    if (!ui.classList.contains('show')) hideTip();
  }).observe(ui, { attributes: true, attributeFilter: ['class'] });

  // ---- telefondan uzaktan kumanda: TV'deki oynatıcının durumu ve denetimleri ----

  // Açık oynatıcının telefona bildirilecek durumu; oynatıcı kapalıysa null.
  function remoteExt() {
    if (!open) return null;
    const st = player.state();
    if (!st.item) return null;
    return {
      can: {
        prev: !!ctx && ctx.index > 0,
        next: !!ctx && ctx.index < ctx.items.length - 1,
        last: st.item.kind === 'live' && lastIndex() >= 0,
        golive: !q('#pl-golive').hidden,
        fav: !q('#pl-fav').hidden,
        audio: trackCache.audio.length > 1 || trackCache.audioBad.length > 0,
        text: trackCache.text.length > 0,
        night: !!engine.setNightMode,
        sleep: true,
        aspect: true,
        stats: true,
      },
      fav: !!env.isFav(st.item),
      stats: statsOn,
      aspect: RESIZE[resizeIdx][1],
      night: nightNow(),
      sleep: { min: sleep.minutes(), left: sleep.active() ? sleep.remaining() : 0 },
      audio: trackCache.audio,
      text: trackCache.text,
      textOn: trackCache.textOn,
      epg: q('#pl-epgline').textContent || '',
    };
  }

  // Telefondan gelen (doğrulanmış) komutu, ekrandaki düğmeye dokunmuş gibi uygular. → uygulandı mı
  function remoteCmd(c) {
    if (!open || !c) return false;
    switch (c.a) {
      case 'next':
        go(1);
        return true;
      case 'prev':
        go(-1);
        return true;
      case 'last':
        lastChannel();
        return true;
      case 'golive':
        if (q('#pl-golive').hidden) return false;
        q('#pl-golive').click();
        return true;
      case 'fav':
        if (q('#pl-fav').hidden) return false;
        q('#pl-fav').click();
        return true;
      case 'aspect':
        applyResize(Number.isInteger(c.v) && c.v >= 0 && c.v < RESIZE.length ? c.v : (resizeIdx + 1) % RESIZE.length, true);
        return true;
      case 'stats':
        setStats(!statsOn);
        return true;
      case 'night': {
        if (!engine.setNightMode) return false;
        const level = normalizeNight(c.v);
        env.setPref('night', level);
        renderNightLabel();
        Promise.resolve(engine.setNightMode(level)).catch(() => toast('Gece modu uygulanamadı', 2500));
        hud('info', 'Gece modu: ' + nightLabel(level));
        return true;
      }
      case 'sleep': {
        const m = Number(c.v);
        const opt = SLEEP_OPTIONS.find(([x]) => x === m);
        if (!opt) return false;
        sleep.set(m);
        renderSleepLabel();
        toast(m ? `Uyku zamanlayıcısı: ${opt[1]}` : 'Uyku zamanlayıcısı kapatıldı');
        return true;
      }
      case 'audio':
      case 'text': {
        const list = c.a === 'audio' ? trackCache.audio : trackCache.text;
        if (c.v && !list.some((x) => String(x.id) === c.v)) return false; // bilinmeyen iz (liste TV'de değişmiş olabilir)
        Promise.resolve(engine.selectTrack(c.a, c.v))
          .then(() => engine.tracks())
          .then(cacheTracks)
          .catch(() => toast('İz seçilemedi', 2500));
        return true;
      }
      default:
        return false;
    }
  }

  return {
    remote: { ext: remoteExt, cmd: remoteCmd },
    open: openWithLayer,
    preview: previewUi,
    expand,
    endPreview,
    isMini: () => miniActive,
    syncPreview: () => previewing && applyRect(),
    isPreviewing: () => previewing,
    close: () => {
      if (open) stopRequested = true;
      popLayer('player');
    },
    isOpen: () => open,
    refresh: () => render(player.state()),
    // yerel eklentiden gelen kayıt olayı (süren kaydın süresi, bitişi)
    recording: (e) => {
      rec = e && e.active ? e : null;
      renderRec(player.state());
    },
    toastError: (m) => toast(m),
    subtitleSheet,
  };
}
