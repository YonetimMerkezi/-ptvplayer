// Uygulama: kaynaklar, katalog, listeler, detay sayfaları, favoriler, rehber.
import { esc, fmtDuration, fmtClock, debounce, fold } from './util.js';
import { createStore } from './store.js';
import { createNet } from './net.js';
import {
  loadCatalog, catalogToStorable, catalogFromStorable, emptyCatalog, search, groupList, inGroup,
  playTargets, loadSeriesInfo, loadVodInfo, loadShortEpg, loadEpg, epgSourceUrls, EpgView,
} from './catalog.js';
import { parseXtreamLink, normalizeServer } from './xtream.js';
import { createNativeEngine, createWebEngine } from './engine.js';
import { createPlayer } from './player.js';
import { createPlayerUI } from './player-ui.js';
import { VirtualList } from './vlist.js';
import { initNav } from './nav.js';
import { nativePlugin as getNativePlugin } from './bridge.js';
import { $, $$, icon, toast, logo, openSheet, fmtAgo } from './ui.js';

const Cap = window.Capacitor;
const nativePlugin = getNativePlugin('IptvPlayer');
const store = createStore();
const net = createNet(nativePlugin ? { native: nativePlugin, convertFileSrc: (p) => Cap.convertFileSrc(p) } : {});

const CAT_KEY = { live: 'live', movie: 'movies', series: 'series' };
const TAB_KIND = { live: 'live', movies: 'movie', series: 'series' };
const STALE_CATALOG_MS = 12 * 3600e3;
const STALE_EPG_MS = 6 * 3600e3;
let VERSION = 'geliştirme';
import('./version.js').then((m) => { VERSION = m.VERSION; if (S.tab === 'sources' && S.source) renderTab(); }).catch(() => {});

const S = {
  source: null,
  cat: emptyCatalog(),
  idx: { live: new Map(), movies: new Map(), series: new Map() },
  groups: { live: [], movie: [], series: [] },
  epg: new EpgView(null),
  epgInfo: null,
  tab: store.pref('tab', 'live'),
  group: { live: null, movie: null, series: null },
  favKind: 'live',
  query: '',
  items: [],
  list: null,
  loading: false,
  prog: {},
};

let player;
let engine;
const video = $('#vid');
const onEngine = (ev) => player.handle(ev);
engine = nativePlugin ? createNativeEngine(nativePlugin, onEngine) : createWebEngine({ video, Hls: window.Hls, on: onEngine });
player = createPlayer({ engine });
const pui = createPlayerUI({
  engine,
  player,
  env: {
    native: !!nativePlugin,
    epg: (it) => S.epg.nowNext(it),
    shortEpg: (it) => (S.source ? loadShortEpg(S.source, net, it, 4).catch(() => []) : Promise.resolve([])),
    isFav: (it) => !!S.source && store.isFav(S.source.id, it.id),
    toggleFav: (it) => toggleFav(it),
    onEpgSheet: (it) => epgSheet(it),
  },
});

player.onProgress((pos, dur, st) => {
  if (!S.source || st.item.kind === 'live') return;
  const e = st.ep
    ? { id: st.ep.id, kind: 'episode', name: `${st.item.name} · ${st.ep.label}`, logo: st.item.logo, parent: st.item.id }
    : { id: st.item.id, kind: st.item.kind, name: st.item.name, logo: st.item.logo };
  store.setProgress(S.source.id, e, pos, dur);
  S.prog = store.progressAll(S.source.id);
});

// Oynatıcı kapanınca "Devam et" çipi ve ilerleme çubukları güncellensin.
player.on((st) => {
  if (st.status !== 'idle' || !S.list || !$('#chips')) return;
  const kind = TAB_KIND[S.tab];
  if (kind) {
    drawChips(kind);
    S.list.refreshRows();
  }
});

// ------------------------------------------------------------------ yardımcılar

const sid = () => (S.source ? S.source.id : '');
const isFav = (it) => store.isFav(sid(), it.id);

function banner(text, { err = false, spin = false } = {}) {
  const b = $('#banner');
  if (!text) {
    b.hidden = true;
    return;
  }
  b.hidden = false;
  b.className = err ? 'err' : '';
  b.innerHTML = (spin ? '<span class="spin"></span>' : '') + `<span>${esc(text)}</span>`;
}

function setCatalog(cat) {
  S.cat = cat;
  S.idx = {
    live: new Map(cat.live.map((i) => [i.id, i])),
    movies: new Map(cat.movies.map((i) => [i.id, i])),
    series: new Map(cat.series.map((i) => [i.id, i])),
  };
  S.groups = { live: groupList(cat.live), movie: groupList(cat.movies), series: groupList(cat.series) };
  S.group = { live: null, movie: null, series: null };
}

function resolve(entry, kind) {
  const m = S.idx[CAT_KEY[kind]];
  const hit = m.get(entry.id);
  if (hit) return hit;
  const f = fold(entry.name);
  return S.cat[CAT_KEY[kind]].find((i) => (i.f || fold(i.name)) === f) || null;
}

function toggleFav(it) {
  const on = store.toggleFav(sid(), it);
  toast(on ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı', 1600);
  if (S.list) S.list.refreshRows();
  if (S.tab === 'favs' && !on) refreshList();
  pui.refresh();
  return on;
}

function progressOf(it) {
  if (it.kind === 'movie') return S.prog[it.id] || null;
  let best = null;
  for (const p of Object.values(S.prog)) if (p.parent === it.id && (!best || p.at > best.at)) best = p;
  return best;
}

// ------------------------------------------------------------------ katalog yükleme

async function activate(id, { force = false } = {}) {
  const src = store.sources().find((s) => s.id === id);
  if (!src) return;
  store.setActive(id);
  S.source = src;
  S.prog = store.progressAll(id);
  S.epgInfo = null;
  const raw = await store.cache.get('cat:' + id);
  const cached = catalogFromStorable(raw);
  setCatalog(cached || emptyCatalog());
  S.epg = new EpgView(await store.cache.get('epg:' + id));
  renderTop();
  renderTab();
  const stale = !cached || Date.now() - cached.fetchedAt > STALE_CATALOG_MS;
  if (force || stale) await refreshCatalog({ quiet: !!cached && !force });
  else maybeRefreshEpg();
}

async function refreshCatalog({ quiet = false } = {}) {
  if (!S.source || S.loading) return;
  S.loading = true;
  const id = S.source.id;
  banner('Liste güncelleniyor…', { spin: true });
  try {
    const cat = await loadCatalog(S.source, net, {
      readFile: (id) => store.cache.get('file:' + id),
      onStage: (t) => banner(t, { spin: true }),
      onProgress: (n) => banner(`Liste indiriliyor… ${(n / 1048576).toFixed(1)} MB`, { spin: true }),
    });
    if (!S.source || S.source.id !== id) return;
    await store.cache.set('cat:' + id, catalogToStorable(cat));
    setCatalog(cat);
    renderTab();
    banner(cat.warnings.length ? cat.warnings[0] : null, { err: cat.warnings.length > 0 });
    if (!quiet) toast(`${cat.live.length} kanal · ${cat.movies.length} film · ${cat.series.length} dizi`);
    maybeRefreshEpg(true);
  } catch (e) {
    banner(`Liste alınamadı: ${e.message}`, { err: true });
    if (S.tab !== 'sources') renderTab();
  } finally {
    S.loading = false;
  }
}

async function maybeRefreshEpg(force = false) {
  if (!S.source || !S.cat.live.length || !epgSourceUrls(S.source, S.cat).length) return;
  const have = S.epg.data && S.epg.data.fetchedAt;
  if (!force && have && Date.now() - have < STALE_EPG_MS) return;
  const id = S.source.id;
  try {
    const data = await loadEpg(S.source, S.cat, net);
    if (!S.source || S.source.id !== id || !data) return;
    await store.cache.set('epg:' + id, data);
    S.epg = new EpgView(data);
    S.epgInfo = { matched: data.matched, at: data.fetchedAt };
    if (S.list && S.tab === 'live') S.list.refreshRows();
    pui.refresh();
  } catch (e) {
    S.epgInfo = { error: e.message };
  }
}

// ------------------------------------------------------------------ üst çubuk ve sekmeler

function renderTop() {
  $('#src-name').textContent = S.source ? S.source.name : 'IPTV Oynatıcı';
}

function setTab(tab) {
  S.tab = tab;
  store.setPref('tab', tab);
  closeSearch(true);
  renderTab();
}

function renderTab() {
  S.list && S.list.destroy();
  S.list = null;
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  const browse = S.tab === 'live' || S.tab === 'movies' || S.tab === 'series';
  $('#btn-search').hidden = !browse;
  $('#btn-refresh').hidden = !S.source;
  const v = $('#view');
  if (!S.source) return renderOnboarding(v);
  if (S.tab === 'sources') return renderSources(v);
  if (S.tab === 'favs') return renderFavs(v);
  renderBrowse(v, TAB_KIND[S.tab]);
}

function emptyHtml(title, text, btn) {
  return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>${btn || ''}</div>`;
}

function renderOnboarding(v) {
  v.innerHTML = emptyHtml(
    'Hoş geldiniz',
    'Başlamak için Xtream hesap bilgilerinizi, M3U liste bağlantınızı ya da telefondaki bir M3U dosyasını ekleyin. Uygulama içerik sağlamaz; yalnızca erişim hakkınız olan kaynakları ekleyin.',
    '<button class="btn" id="ob-add">Kaynak ekle</button>',
  );
  $('#ob-add').addEventListener('click', () => sourceForm());
}

// ------------------------------------------------------------------ göz atma (canlı / film / dizi)

function currentItems(kind) {
  const all = S.cat[CAT_KEY[kind]];
  if (S.query) return search(all, S.query);
  const g = S.group[kind];
  if (g === '__recent') return store.recents(sid()).filter((r) => r.kind === kind).map((r) => resolve(r, kind)).filter(Boolean);
  if (g === '__cont') return continueItems(kind);
  return g ? inGroup(all, g) : all;
}

function continueItems(kind) {
  const seen = new Set();
  const out = [];
  for (const p of store.continueWatching(sid())) {
    const key = kind === 'movie' ? (p.kind === 'movie' ? p.id : null) : p.kind === 'episode' ? p.parent : null;
    if (!key || seen.has(key)) continue;
    const it = S.idx[CAT_KEY[kind]].get(key);
    if (it) {
      seen.add(key);
      out.push(it);
    }
  }
  return out;
}

const MAX_CHIPS = 14;

function drawChips(kind) {
  const el = $('#chips');
  const groups = S.groups[kind];
  const cur = S.group[kind];
  const chip = (val, label, n) =>
    `<button class="chip ${cur === val ? 'on' : ''}" data-g="${esc(val ?? '')}">${esc(label)}${n != null ? `<small>${n}</small>` : ''}</button>`;
  const total = S.cat[CAT_KEY[kind]].length;
  const parts = [chip(null, 'Tümü', total)];
  if (kind === 'live') parts.push(chip('__recent', 'Son izlenen', null));
  else {
    const n = continueItems(kind).length;
    if (n) parts.push(chip('__cont', 'Devam et', n));
  }
  const shown = groups.slice(0, MAX_CHIPS);
  if (cur && !cur.startsWith('__') && !shown.some((g) => g.name === cur)) {
    const g = groups.find((x) => x.name === cur);
    if (g) parts.push(chip(g.name, g.name, g.count));
  }
  for (const g of shown) parts.push(chip(g.name, g.name, g.count));
  if (groups.length > MAX_CHIPS) parts.push('<button class="chip" data-all>Tüm gruplar ▾</button>');
  el.innerHTML = parts.join('');
}

function renderBrowse(v, kind) {
  v.innerHTML = '<div class="chips" id="chips"></div><div id="list"></div><div id="empty" hidden></div>';
  $('#chips').addEventListener('click', (e) => {
    if (e.target.closest('[data-all]')) return groupSheet(kind);
    const b = e.target.closest('[data-g]');
    if (!b) return;
    S.group[kind] = b.dataset.g === '' ? null : b.dataset.g;
    closeSearch(true);
    drawChips(kind);
    refreshList();
  });
  drawChips(kind);
  mountList(kind);
  refreshList();
}

function mountList(kind) {
  const el = $('#list');
  if (kind === 'live') {
    S.list = new VirtualList(el, {
      rowH: 64,
      render: (it, i) => liveRow(it, i),
      onTap: (i, ev) => {
        const it = S.items[i];
        if (ev.target.closest('[data-fav]')) return toggleFav(it);
        if (ev.target.closest('[data-epg]')) return epgSheet(it);
        playLive(S.items, i);
      },
    });
  } else {
    const gap = 10;
    S.list = new VirtualList(el, {
      minCellW: 104,
      gap,
      cellH: (w, cols) => ((w - 24 - gap * (cols - 1)) / cols) * 1.5 + 42,
      render: (it, i) => card(it, i),
      onTap: (i) => (kind === 'movie' ? openMovie(S.items[i]) : openSeries(S.items[i])),
    });
  }
}

function refreshList() {
  if (!S.list) return;
  if (S.tab === 'favs') return refreshFavs();
  const kind = TAB_KIND[S.tab];
  if (!kind) return;
  S.items = currentItems(kind);
  S.list.setItems(S.items);
  const empty = $('#empty');
  const none = !S.items.length;
  $('#list').hidden = none;
  empty.hidden = !none;
  if (none) {
    const all = S.cat[CAT_KEY[kind]].length;
    const label = { live: 'kanal', movie: 'film', series: 'dizi' }[kind];
    if (S.query) empty.innerHTML = emptyHtml('Sonuç yok', `“${S.query}” için ${label} bulunamadı.`);
    else if (!all && S.loading) empty.innerHTML = emptyHtml('Yükleniyor…', 'Liste indiriliyor, birazdan hazır olur.');
    else if (!all) empty.innerHTML = emptyHtml(`Bu kaynakta ${label} yok`, 'Listeyi yenilemeyi ya da başka bir kaynak seçmeyi deneyin.', '<button class="btn" id="e-refresh">Listeyi yenile</button>');
    else if (S.group[kind] === '__recent') empty.innerHTML = emptyHtml('Henüz izlemediniz', 'İzlediğiniz kanallar burada görünür.');
    else if (S.group[kind] === '__cont') empty.innerHTML = emptyHtml('Yarım kalan yok', 'Yarıda bıraktığınız içerikler burada görünür.');
    else empty.innerHTML = emptyHtml('Bu grupta öğe yok', '');
    const b = $('#e-refresh');
    if (b) b.addEventListener('click', () => refreshCatalog());
  }
}

function liveRow(it, i) {
  const nn = S.epg.nowNext(it);
  const fav = isFav(it);
  const sub = nn.now ? nn.now.t : it.group || '';
  return `<div class="row" role="button" tabindex="0" data-i="${i}">${logo(it.logo, it.name)}<div class="meta"><div class="nm">${esc(it.name)}</div><div class="sub">${esc(sub)}</div>${nn.now ? `<div class="bar"><i style="width:${Math.round(nn.progress * 100)}%"></i></div>` : ''}</div><button class="act ${fav ? 'on' : ''}" data-fav aria-label="Favori">${icon(fav ? 'star-on' : 'star')}</button><button class="act" data-epg aria-label="Program rehberi">${icon('list')}</button></div>`;
}

function card(it, i) {
  const p = progressOf(it);
  const pct = p && p.dur > 0 ? Math.round((p.pos / p.dur) * 100) : 0;
  const ph = esc(it.name.slice(0, 2).toUpperCase());
  const img = it.logo ? `<img src="${esc(it.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.parentNode.classList.add('ok')" onerror="this.remove()">` : '';
  return `<div class="card" role="button" tabindex="0" data-i="${i}"><div class="poster"><div class="ph">${ph}</div>${img}${isFav(it) ? `<span class="fav">${icon('star-on')}</span>` : ''}${pct ? `<div class="prog"><i style="width:${pct}%"></i></div>` : ''}</div><div class="cap">${esc(it.name)}</div></div>`;
}

function groupSheet(kind) {
  const groups = S.groups[kind];
  const sh = openSheet({
    title: 'Gruplar',
    html: '<label class="field"><input id="g-q" type="search" placeholder="Grup ara…" autocomplete="off"></label><div id="g-list"></div>',
    mount: (body) => {
      const draw = () => {
        const f = fold($('#g-q', body).value);
        const rows = groups
          .filter((g) => !f || fold(g.name).includes(f))
          .slice(0, 400)
          .map((g) => `<button class="list-item" data-g="${esc(g.name)}"><span class="t">${esc(g.name)}<small>${g.count}</small></span>${S.group[kind] === g.name ? icon('check').replace('class="ic"', 'class="ic ok"') : ''}</button>`);
        $('#g-list', body).innerHTML = rows.join('') || '<p class="empty">Eşleşen grup yok</p>';
      };
      draw();
      $('#g-q', body).addEventListener('input', debounce(draw, 120));
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-g]');
        if (!b) return;
        S.group[kind] = b.dataset.g;
        sh.close();
        closeSearch(true);
        drawChips(kind);
        refreshList();
      });
    },
  });
}

// arama
const qEl = $('#q');
function closeSearch(keepList) {
  const had = !!S.query;
  S.query = '';
  qEl.value = '';
  $('#searchbar').hidden = true;
  if (!keepList && had && S.list) refreshList();
}
$('#btn-search').addEventListener('click', () => {
  const bar = $('#searchbar');
  if (bar.hidden) {
    bar.hidden = false;
    qEl.focus();
  } else closeSearch();
});
$('#q-clear').addEventListener('click', () => closeSearch());
qEl.addEventListener(
  'input',
  debounce(() => {
    S.query = qEl.value.trim();
    refreshList();
  }, 200),
);

// ------------------------------------------------------------------ oynatma

function playLive(items, index) {
  const ctx = { items, index, play: (it, i) => startPlay(it, { ctx: { ...ctx, index: i } }) };
  startPlay(items[index], { ctx });
}

function startPlay(item, { ep = null, ctx = null, startAt } = {}) {
  const targets = playTargets(S.source, item, ep);
  if (!targets.length) return toast('Bu içerik için oynatma adresi bulunamadı');
  if (item.kind !== 'series') store.pushRecent(sid(), item);
  let at = startAt;
  if (at == null) {
    const p = store.progress(sid(), ep ? ep.id : item.id);
    at = p && p.pos > 0 ? Math.max(0, p.pos - 3000) : 0;
  }
  pui.open(item, targets, { ep, startAt: item.kind === 'live' ? 0 : at, ctx });
}

function openMovie(it) {
  const p = store.progress(sid(), it.id);
  const resumeTxt = p ? `Devam et · ${fmtDuration(p.pos)}` : 'Oynat';
  const sh = openSheet({
    title: it.name,
    html: `<div class="detail"><div class="pos">${it.logo ? `<img src="${esc(it.logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : esc(it.name.slice(0, 2).toUpperCase())}</div><div><h2>${esc(it.name)}</h2><div class="m" id="mv-meta">${esc(it.group || '')}${it.rating ? ` · ★ ${it.rating}` : ''}</div></div></div><p class="plot" id="mv-plot"></p><div class="btns" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="mv-play">${icon('play')}${esc(resumeTxt)}</button>${p ? '<button class="btn ghost" id="mv-start">Baştan başlat</button>' : ''}<button class="btn ghost" id="mv-fav">${icon(isFav(it) ? 'star-on' : 'star')}Favori</button></div>`,
    mount: (body) => {
      $('#mv-play', body).addEventListener('click', () => startPlay(it));
      const st = $('#mv-start', body);
      if (st) st.addEventListener('click', () => startPlay(it, { startAt: 0 }));
      $('#mv-fav', body).addEventListener('click', () => {
        toggleFav(it);
        $('#mv-fav', body).innerHTML = icon(isFav(it) ? 'star-on' : 'star') + 'Favori';
      });
      loadVodInfo(S.source, net, it)
        .then((info) => {
          if (!info) return;
          $('#mv-plot', body).textContent = info.plot;
          const meta = [it.group, info.year && String(info.year).slice(0, 4), info.genre, info.durationSec && `${Math.round(info.durationSec / 60)} dk`].filter(Boolean).join(' · ');
          $('#mv-meta', body).textContent = meta;
        })
        .catch(() => {});
    },
  });
  return sh;
}

function openSeries(it) {
  openSheet({
    title: it.name,
    html: '<div class="empty"><div class="spinner" style="border-color:#fff3;border-top-color:var(--accent)"></div></div>',
    mount: async (body, api) => {
      let info;
      try {
        info = await loadSeriesInfo(S.source, net, it);
      } catch (e) {
        body.innerHTML = emptyHtml('Bölümler alınamadı', e.message);
        return;
      }
      if (!info.seasons.length) {
        body.innerHTML = emptyHtml('Bölüm bulunamadı', 'Bu dizi için bölüm listesi boş.');
        return;
      }
      const all = [];
      for (const s of info.seasons) for (const e of s.episodes) all.push({ ...e, season: s.season, label: `S${s.season} B${e.episodeNum}` + (e.title && !/^Bölüm/i.test(e.title) ? ` · ${e.title}` : '') });
      let season = info.seasons[0].season;
      const last = progressOf(it);
      if (last) {
        const e = all.find((x) => x.id === last.id);
        if (e) season = e.season;
      }
      const play = (ep) => {
        const index = all.findIndex((x) => x.id === ep.id);
        const ctx = { items: all, index, autoNext: true, play: (e, i) => startPlay(it, { ep: e, ctx: { ...ctx, index: i } }) };
        startPlay(it, { ep, ctx });
      };
      const draw = () => {
        const p = progressOf(it);
        const seasons = info.seasons.map((s) => `<button class="chip ${s.season === season ? 'on' : ''}" data-s="${s.season}">Sezon ${s.season}</button>`).join('');
        const eps = info.seasons.find((s) => s.season === season).episodes;
        const rows = eps
          .map((e) => {
            const pr = S.prog[e.id];
            const pct = pr && pr.dur > 0 ? Math.round((pr.pos / pr.dur) * 100) : 0;
            return `<button class="epi" data-ep="${esc(e.id)}"><b>${e.episodeNum}</b><span class="t">${esc(e.title)}${e.durationSec ? `<small>${Math.round(e.durationSec / 60)} dk</small>` : ''}${pct ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}</span>${icon('play')}</button>`;
          })
          .join('');
        const cont = p ? all.find((x) => x.id === p.id) : null;
        body.innerHTML = `<div class="detail"><div class="pos">${it.logo ? `<img src="${esc(it.logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : esc(it.name.slice(0, 2).toUpperCase())}</div><div><h2>${esc(it.name)}</h2><div class="m">${esc([it.group, info.genre, info.year && String(info.year).slice(0, 4)].filter(Boolean).join(' · '))}</div><div style="display:flex;gap:8px;flex-wrap:wrap">${cont ? `<button class="btn sm" id="sr-cont">${icon('play')}Devam et · ${esc(cont.label.split(' · ')[0])}</button>` : ''}<button class="btn sm ghost" id="sr-fav">${icon(isFav(it) ? 'star-on' : 'star')}Favori</button></div></div></div>${info.plot || it.plot ? `<p class="plot">${esc(info.plot || it.plot)}</p>` : ''}<div class="chips" style="padding-left:0;padding-right:0">${seasons}</div>${rows}`;
        const c = $('#sr-cont', body);
        if (c) c.addEventListener('click', () => play(cont));
        $('#sr-fav', body).addEventListener('click', () => {
          toggleFav(it);
          draw();
        });
      };
      body.addEventListener('click', (e) => {
        const s = e.target.closest('[data-s]');
        if (s) {
          season = Number(s.dataset.s);
          return draw();
        }
        const b = e.target.closest('[data-ep]');
        if (b) play(all.find((x) => x.id === b.dataset.ep));
      });
      api.setTitle(it.name);
      draw();
    },
  });
}

// ------------------------------------------------------------------ rehber sayfası

async function epgSheet(it) {
  const sh = openSheet({ title: it.name, html: '<div class="empty">Yükleniyor…</div>' });
  const now = Date.now();
  let list = S.epg.listFor(it).filter((p) => p.e > now - 30 * 60000);
  if (!list.length) {
    try {
      list = (await loadShortEpg(S.source, net, it, 8)).filter((p) => p.e > now);
    } catch {
      /* rehber yok */
    }
  }
  const body = sh.body;
  if (!list.length) {
    body.innerHTML = emptyHtml('Program bilgisi yok', S.source.type === 'xtream' || S.cat.epgUrls.length || S.source.epgUrl ? 'Bu kanal için rehberde program bulunamadı.' : 'Bu kaynakta TV rehberi adresi yok. Kaynaklar sekmesinden bir XMLTV adresi ekleyebilirsiniz.');
    return;
  }
  let day = '';
  body.innerHTML = list
    .slice(0, 60)
    .map((p) => {
      const d = new Date(p.s).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
      const head = d !== day ? `<div class="sect">${esc((day = d))}</div>` : '';
      return `${head}<div class="prog-row ${p.s <= now && p.e > now ? 'now' : ''}"><time>${fmtClock(p.s)}</time><div><b>${esc(p.t)}</b>${p.d ? `<small>${esc(p.d)}</small>` : ''}</div></div>`;
    })
    .join('');
}

// ------------------------------------------------------------------ favoriler

function renderFavs(v) {
  v.innerHTML = '<div class="seg" id="fseg"><button data-k="live">Canlı</button><button data-k="movie">Film</button><button data-k="series">Dizi</button></div><div id="list"></div><div id="empty" hidden></div>';
  const mark = () => $$('#fseg button').forEach((b) => b.classList.toggle('on', b.dataset.k === S.favKind));
  $('#fseg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    S.favKind = b.dataset.k;
    mark();
    mountFavList();
  });
  mark();
  mountFavList();
}

function mountFavList() {
  S.list && S.list.destroy();
  mountList(S.favKind);
  refreshFavs();
}

function refreshFavs() {
  const kind = S.favKind;
  S.items = store.favs(sid()).filter((f) => f.kind === kind).map((f) => resolve(f, kind)).filter(Boolean);
  S.list.setItems(S.items);
  const none = !S.items.length;
  $('#list').hidden = none;
  $('#empty').hidden = !none;
  if (none) $('#empty').innerHTML = emptyHtml('Henüz favori yok', 'Listelerde yıldız simgesine dokunarak favori ekleyin.');
}

// ------------------------------------------------------------------ kaynaklar

function renderSources(v) {
  const cards = store
    .sources()
    .map((s) => {
      const act = s.id === S.source.id;
      const c = S.cat;
      const lines = [];
      if (s.type === 'xtream') lines.push(`${esc(normalizeServer(s.server))} · ${esc(s.user)}`);
      else if (s.local) lines.push(`Dosya: ${esc(s.fileName || s.name)}`);
      else lines.push(esc(s.url));
      if (act) {
        lines.push(`${c.live.length} kanal · ${c.movies.length} film · ${c.series.length} dizi`);
        lines.push(`Son güncelleme: ${fmtAgo(c.fetchedAt)}`);
        if (c.account && c.account.expires) lines.push(`Abonelik bitişi: ${new Date(c.account.expires).toLocaleDateString('tr-TR')}`);
        if (c.account && c.account.maxConnections) lines.push(`Aynı anda en çok ${c.account.maxConnections} cihaz`);
        if (S.epgInfo && S.epgInfo.error) lines.push(`TV rehberi alınamadı: ${esc(S.epgInfo.error)}`);
        else if (S.epg.ready) lines.push(`TV rehberi: ${Object.keys(S.epg.data.map).length} kanal eşleşti`);
        else if (epgSourceUrls(s, c).length) lines.push('TV rehberi henüz yüklenmedi');
        else lines.push('TV rehberi adresi yok');
      }
      return `<div class="src ${act ? 'active' : ''}"><h4>${esc(s.name)}${act ? '<span class="badge">Etkin</span>' : ''}</h4>${lines.map((l) => `<p>${l}</p>`).join('')}<div class="btns">${act ? '<button class="btn sm" data-a="refresh">Yenile</button>' : `<button class="btn sm" data-a="use" data-id="${esc(s.id)}">Kullan</button>`}<button class="btn sm ghost" data-a="edit" data-id="${esc(s.id)}">Düzenle</button><button class="btn sm danger" data-a="del" data-id="${esc(s.id)}">Sil</button></div></div>`;
    })
    .join('');
  v.innerHTML = `<div class="page"><div class="sect">Kaynaklar</div>${cards}<button class="btn" id="src-add">${icon('plus')}Kaynak ekle</button><div class="sect">Diğer</div><button class="btn ghost sm" id="clr-rec">Son izlenenleri temizle</button><p style="color:var(--muted);font-size:12px;margin-top:18px">IPTV Oynatıcı bir yayın hizmeti değildir ve içerik sağlamaz. Yalnızca yasal olarak erişim hakkınız olan kaynakları kullanın.</p><p style="color:var(--muted);font-size:12px">Sürüm ${esc(VERSION)}</p></div>`;
  v.addEventListener('click', onSourcesClick);
}

function onSourcesClick(e) {
  const b = e.target.closest('[data-a], #src-add, #clr-rec');
  if (!b) return;
  if (b.id === 'src-add') return sourceForm();
  if (b.id === 'clr-rec') {
    store.clearRecents(sid());
    return toast('Son izlenenler temizlendi');
  }
  const id = b.dataset.id;
  if (b.dataset.a === 'refresh') return refreshCatalog();
  if (b.dataset.a === 'use') return activate(id).then(() => renderTab());
  if (b.dataset.a === 'edit') return sourceForm(store.sources().find((s) => s.id === id));
  if (b.dataset.a === 'del') return confirmDelete(id);
}

function confirmDelete(id) {
  const src = store.sources().find((s) => s.id === id);
  const sh = openSheet({
    title: 'Kaynağı sil',
    html: `<p>“${esc(src.name)}” kaynağı, favorileri ve izleme geçmişiyle birlikte silinecek.</p><div style="display:flex;gap:8px"><button class="btn danger" id="del-ok">Sil</button><button class="btn ghost" id="del-no">Vazgeç</button></div>`,
    mount: (body) => {
      $('#del-no', body).addEventListener('click', () => sh.close());
      $('#del-ok', body).addEventListener('click', async () => {
        sh.close();
        store.removeSource(id);
        const next = store.activeSource();
        if (next) await activate(next.id);
        else {
          S.source = null;
          setCatalog(emptyCatalog());
          renderTop();
          renderTab();
        }
        toast('Kaynak silindi');
      });
    },
  });
}

function sourceForm(edit) {
  let type = edit ? (edit.local ? 'file' : edit.type) : 'xtream';
  const v = (k) => esc((edit && edit[k]) || '');
  const sh = openSheet({
    title: edit ? 'Kaynağı düzenle' : 'Kaynak ekle',
    html: `<div class="seg" id="f-type" style="padding:0 0 12px"><button data-t="xtream">Xtream</button><button data-t="m3u">M3U bağlantısı</button><button data-t="file">Dosyadan</button></div>
<form id="f" autocomplete="off">
<label class="field"><span>Ad (isteğe bağlı)</span><input name="name" value="${v('name')}" placeholder="Örn. Evdeki liste"></label>
<div data-for="m3u"><label class="field"><span>M3U / M3U8 liste bağlantısı</span><input name="url" inputmode="url" value="${v('url')}" placeholder="http://…/liste.m3u"></label></div>
<div data-for="xtream"><label class="field"><span>Sunucu adresi</span><input name="server" inputmode="url" value="${v('server')}" placeholder="http://sunucu.com:8080"></label>
<label class="field"><span>Kullanıcı adı</span><input name="user" value="${v('user')}" autocapitalize="none"></label>
<label class="field"><span>Şifre</span><input name="pass" value="${v('pass')}" autocapitalize="none"></label></div>
<div data-for="file"><label class="field"><span>M3U / M3U8 dosyası</span><input name="file" type="file"><small>${edit && edit.local ? `Kayıtlı dosya: ${esc(edit.fileName || edit.name)}. Değiştirmek için yeni dosya seçin.` : 'Telefondaki liste dosyasını seçin.'}</small></label></div>
<label class="field"><span>TV rehberi (XMLTV) bağlantısı — isteğe bağlı</span><input name="epgUrl" inputmode="url" value="${v('epgUrl')}" placeholder="Boş bırakırsanız kaynaktaki adres kullanılır"><small>.xml veya .xml.gz olabilir.</small></label>
<p class="err-text" id="f-err" hidden></p>
<button class="btn" id="f-go" type="submit" style="width:100%">Kaydet ve yükle</button>
</form>`,
    mount: (body) => {
      const form = $('#f', body);
      const err = $('#f-err', body);
      const setType = (t) => {
        type = t;
        $$('#f-type button', body).forEach((b) => b.classList.toggle('on', b.dataset.t === t));
        $$('[data-for]', body).forEach((d) => (d.hidden = d.dataset.for !== t));
      };
      setType(type);
      $('#f-type', body).addEventListener('click', (e) => {
        const b = e.target.closest('[data-t]');
        if (b) setType(b.dataset.t);
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(form));
        const fail = (m) => {
          err.hidden = false;
          err.textContent = m;
        };
        err.hidden = true;
        let src = { id: edit && edit.id, type, name: (f.name || '').trim(), epgUrl: (f.epgUrl || '').trim() };
        let text = null;
        if (type === 'file') {
          const file = form.elements.file.files[0];
          if (!file && !(edit && edit.local)) return fail('Bir liste dosyası seçin.');
          Object.assign(src, { type: 'm3u', local: true, fileName: file ? file.name : edit.fileName });
          if (file) text = await file.text();
        } else if (type === 'm3u') {
          const url = (f.url || '').trim();
          if (!/^https?:\/\//i.test(url)) return fail('Liste bağlantısı http:// veya https:// ile başlamalı.');
          const x = parseXtreamLink(url);
          if (x) {
            src = { ...src, type: 'xtream', ...x };
            toast('Bağlantıdan Xtream hesabı algılandı');
          } else src.url = url;
        } else {
          const server = normalizeServer(f.server);
          if (!server || !f.user.trim() || !f.pass.trim()) return fail('Sunucu, kullanıcı adı ve şifre gerekli.');
          Object.assign(src, { server, user: f.user.trim(), pass: f.pass.trim() });
        }
        if (!src.name) {
          try {
            src.name = src.local ? String(src.fileName || 'Liste').replace(/\.[^.]+$/, '') : new URL(src.type === 'xtream' ? src.server : src.url).hostname;
          } catch {
            src.name = 'Kaynak';
          }
        }
        const go = $('#f-go', body);
        go.disabled = true;
        go.textContent = 'Yükleniyor…';
        try {
          const cat = await loadCatalog(text != null ? { ...src, text } : src, net, {
            readFile: (id) => store.cache.get('file:' + id),
            onStage: (t) => (go.textContent = t),
            onProgress: (n) => (go.textContent = `İndiriliyor… ${(n / 1048576).toFixed(1)} MB`),
          });
          const saved = store.saveSource(src);
          if (text != null) await store.cache.set('file:' + saved.id, text);
          await store.cache.set('cat:' + saved.id, catalogToStorable(cat));
          store.setActive(saved.id);
          S.source = saved;
          S.prog = store.progressAll(saved.id);
          setCatalog(cat);
          S.epg = new EpgView(await store.cache.get('epg:' + saved.id));
          sh.close();
          renderTop();
          renderTab();
          toast(`${cat.live.length} kanal · ${cat.movies.length} film · ${cat.series.length} dizi yüklendi`);
          maybeRefreshEpg(true);
        } catch (ex) {
          fail(ex.message || 'Kaynak yüklenemedi');
          go.disabled = false;
          go.textContent = 'Kaydet ve yükle';
        }
      });
    },
  });
}

function sourceSwitcher() {
  const list = store.sources();
  const sh = openSheet({
    title: 'Kaynak seç',
    html: list.map((s) => `<button class="list-item" data-id="${esc(s.id)}"><span class="t">${esc(s.name)}<small>${s.type === 'xtream' ? 'Xtream' : 'M3U'}</small></span>${S.source && s.id === S.source.id ? icon('check').replace('class="ic"', 'class="ic ok"') : ''}</button>`).join('') + `<button class="list-item" data-add><span class="t">Kaynak ekle…</span>${icon('plus')}</button>`,
    mount: (body) =>
      body.addEventListener('click', async (e) => {
        if (e.target.closest('[data-add]')) {
          sh.close();
          return sourceForm();
        }
        const b = e.target.closest('[data-id]');
        if (!b) return;
        sh.close();
        if (!S.source || b.dataset.id !== S.source.id) await activate(b.dataset.id);
      }),
  });
}

// ------------------------------------------------------------------ olaylar ve başlangıç

$('#btn-source').addEventListener('click', () => (store.sources().length ? sourceSwitcher() : sourceForm()));
$('#btn-refresh').addEventListener('click', () => refreshCatalog());
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) setTab(b.dataset.tab);
});
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && t.getAttribute && t.getAttribute('role') === 'button' && !t.matches('input,textarea')) {
    e.preventDefault();
    t.click();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.source && !S.loading && S.cat.fetchedAt && Date.now() - S.cat.fetchedAt > STALE_CATALOG_MS) refreshCatalog({ quiet: true });
});
setInterval(() => {
  if (S.list && S.tab === 'live' && document.visibilityState === 'visible' && !pui.isOpen()) S.list.refreshRows();
}, 60000);

initNav();
window.__iptv = { S, store, net }; // hata ayıklama ve uçtan uca testler için

(async function boot() {
  const src = store.activeSource();
  if (!src) {
    // İlk açılış: doğrudan kaynak ekleme sayfası (Xtream / M3U bağlantısı / dosyadan).
    renderTop();
    S.tab = 'live';
    renderTab();
    return sourceForm();
  }
  await activate(src.id);
})();
