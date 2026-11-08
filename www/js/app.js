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
import { sortItems, SORTS, isSortMode } from './sort.js';
import {
  arrange, toggleHidden, move, resetOrderAndHidden, hiddenGroupNames, addFolder, renameFolder, deleteFolder,
  toggleInFolder, folderOf, groupKey, folderKey,
} from './cats.js';
import { initNav, pushLayer, popLayer, topLayer } from './nav.js';
import { nativePlugin as getNativePlugin } from './bridge.js';
import { $, $$, icon, toast, logo, openSheet, fmtAgo } from './ui.js';
import { checkUpdate, fmtMB, shouldAutoCheck, versionCodeOf } from './update.js';

const Cap = window.Capacitor;
const nativePlugin = getNativePlugin('IptvPlayer');
const store = createStore();
const net = createNet(nativePlugin ? { native: nativePlugin, convertFileSrc: (p) => Cap.convertFileSrc(p) } : {});

const CAT_KEY = { live: 'live', movie: 'movies', series: 'series' };
const TAB_KIND = { live: 'live', movies: 'movie', series: 'series' };
// Otomatik yenileme aralıkları (saat) Ayarlar → Otomasyon'dan değişir; 0 = kapalı.
const hoursMs = (k, d) => {
  const h = Number(store.pref(k, d));
  return h > 0 ? h * 3600e3 : Infinity;
};
const staleCatalogMs = () => hoursMs('auto.cat', 12);
const staleEpgMs = () => hoursMs('auto.epg', 6);
const setting = (k, d = true) => store.pref('set.' + k, d);
let VERSION = 'geliştirme';
import('./version.js').then((m) => { VERSION = m.VERSION; if (S.tab === 'sources' && S.source) renderTab(); }).catch(() => {});

const S = {
  source: null,
  cat: emptyCatalog(),
  idx: { live: new Map(), movies: new Map(), series: new Map() },
  groups: { live: [], movie: [], series: [] },
  epg: new EpgView(null),
  epgInfo: null,
  tab: 'home', // her açılış ana ekranla başlar
  split: false, // yatay geniş ekran: canlı TV üç bölmeli
  pv: null, // önizlemede oynayan kanal
  // Kategori ekranı: null = kategori listesi, '__all' / '__recent' / '__cont' = özel listeler, aksi hâlde grup adı
  group: { live: null, movie: null, series: null },
  sort: Object.fromEntries(['live', 'movie', 'series'].map((k) => [k, isSortMode(store.pref('sort.' + k, 'default')) ? store.pref('sort.' + k, 'default') : 'default'])), // kategori içi sıralama (türe göre kalıcı)
  catFilter: '',
  catEdit: false, // kategori düzenleme kipi (sırala / gizle / klasör)
  cats: [],
  listMode: null,
  favKind: 'live',
  query: '',
  items: [],
  list: null,
  loading: false,
  prog: {},
};

let groupLayer = 0; // açık "kategori içi" geri tuşu katmanının kimliği (0 = yok)
let layerSeq = 0;

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
    pref: (k, d) => store.pref(k, d),
    setPref: (k, v) => store.setPref(k, v),
    previewRect,
    onPreviewBack: (item) => {
      if (item && item.kind === 'live') setPv(item);
      layoutPreview();
    },
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
  if ($('#split')) {
    if (st.item && st.item.kind === 'live' && (!S.pv || S.pv.id !== st.item.id)) setPv(st.item); // tam ekranda kanal değişti
    setSpStatus(st);
  }
  if (st.status !== 'idle' || !S.list || !TAB_KIND[S.tab] || !$('#list')) return;
  if (S.listMode === 'cats') refreshList(true);
  else S.list.refreshRows();
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
  pruneGroups();
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
  await pui.endPreview();
  S.pv = null;
  S.source = src;
  S.prog = store.progressAll(id);
  S.epgInfo = null;
  const raw = await store.cache.get('cat:' + id);
  const cached = catalogFromStorable(raw);
  resetGroups();
  setCatalog(cached || emptyCatalog());
  S.epg = new EpgView(await store.cache.get('epg:' + id));
  renderTop();
  renderTab();
  const stale = !cached || Date.now() - cached.fetchedAt > staleCatalogMs();
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
  if (!force && have && Date.now() - have < staleEpgMs()) return;
  const id = S.source.id;
  try {
    const data = await loadEpg(S.source, S.cat, net);
    if (!S.source || S.source.id !== id || !data) return;
    await store.cache.set('epg:' + id, data);
    S.epg = new EpgView(data);
    S.epgInfo = { matched: data.matched, at: data.fetchedAt };
    if (S.list && S.tab === 'live') S.list.refreshRows();
    renderSpInfo();
    pui.refresh();
  } catch (e) {
    S.epgInfo = { error: e.message };
  }
}

// ------------------------------------------------------------------ üst çubuk ve sekmeler

function renderTop() {
  $('#src-name').textContent = S.source ? S.source.name : 'IPTV Oynatıcı';
}

// Ana ekran dışındaki sayfalar bir geçmiş katmanı açar: Android geri tuşu önce ana ekrana döner.
let tabLayer = 0;
function pushTabLayer() {
  const id = ++layerSeq;
  tabLayer = id;
  pushLayer('tab', () => {
    if (tabLayer !== id) return;
    tabLayer = 0;
    if (S.tab !== 'home') {
      clearGroupState();
      S.tab = 'home';
      closeSearch(true);
      renderTab();
    }
  });
}

function setTab(tab) {
  S.tab = tab;
  store.setPref('tab', tab);
  closeSearch(true);
  if (tab === 'home' && tabLayer) {
    // 'tab' katmanını (varsa üstündeki kategori katmanıyla birlikte) tek hamlede kapat; kapanış işleyicileri etkisiz
    groupLayer = 0;
    clearGroupState();
    tabLayer = 0;
    popLayer('tab');
  } else {
    resetGroups();
    if (tab !== 'home' && !tabLayer) pushTabLayer();
  }
  renderTab();
}

function renderTab() {
  S.list && S.list.destroy();
  S.list = null;
  const v = $('#view');
  v.onclick = null;
  const split = S.tab === 'live' && S.split && !!S.source;
  if (!split && (pui.isPreviewing() || S.pv)) {
    pui.endPreview().then(syncHole);
    S.pv = null;
  }
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  document.body.classList.toggle('on-home', S.tab === 'home' && !!S.source);
  const browse = S.tab === 'live' || S.tab === 'movies' || S.tab === 'series';
  $('#btn-search').hidden = !browse;
  $('#btn-refresh').hidden = !S.source;
  $('#btn-home').hidden = S.tab === 'home';
  tickClock();
  if (!S.source) return renderOnboarding(v);
  if (S.tab === 'home') return renderHome(v);
  if (S.tab === 'sources') return renderSources(v);
  if (S.tab === 'favs') return renderFavs(v);
  if (split) return renderSplit(v);
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

// Açık kategorinin (ya da kategori yoksa tüm içeriğin) öğeleri, sıralama uygulanmadan.
function groupItems(kind) {
  const g = S.group[kind];
  if (g === '__recent') return recentItems(kind);
  if (g === '__cont') return continueItems(kind);
  if (g && g.startsWith('f:')) return folderItems(kind, folderOf(prefsOf(kind), g.slice(2)));
  if (g && g.startsWith('g:')) return inGroup(S.cat[CAT_KEY[kind]], g.slice(2));
  return visibleAll(kind);
}

// Arama açık kategori içinde yapılır (kategori yoksa tümünde); arama sonuçları ilgiye göre, liste seçilen sıraya göre.
function currentItems(kind) {
  const base = groupItems(kind);
  if (S.query) return search(base, S.query);
  const g = S.group[kind];
  return g === '__recent' || g === '__cont' ? base : sortItems(base, S.sort[kind]);
}

function recentItems(kind) {
  return store.recents(sid()).filter((r) => r.kind === kind).map((r) => resolve(r, kind)).filter(Boolean);
}

// Kategori düzeni (sıra, gizleme, klasörler)
const prefsOf = (kind) => store.catPrefs(sid(), kind);
const savePrefs = (kind, prefs) => store.setCatPrefs(sid(), kind, prefs);

// Gizlenen kategorilerdeki öğeler "Tümü"nde ve aramada görünmez.
function visibleAll(kind) {
  const all = S.cat[CAT_KEY[kind]];
  const hid = hiddenGroupNames(prefsOf(kind));
  return hid.size ? all.filter((it) => !hid.has(it.group || 'Diğer')) : all;
}

function folderItems(kind, folder) {
  if (!folder) return [];
  const m = S.idx[CAT_KEY[kind]];
  return folder.items.map((id) => m.get(id)).filter(Boolean);
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

// Kategori ekranı: her sekme önce kategorileri gösterir, bir kategoriye dokununca içeriği açılır.
// Düzenle kipinde kategoriler sıralanır, gizlenir; özel klasörler oluşturulur.

function groupTitle(kind, g) {
  if (g.startsWith('f:')) {
    const f = folderOf(prefsOf(kind), g.slice(2));
    return f ? f.name : 'Klasör';
  }
  if (g.startsWith('g:')) return g.slice(2);
  return { __all: 'Tümü', __recent: 'Son izlenen', __cont: 'Devam et' }[g] || g;
}

function browseMode(kind) {
  return !S.query && S.group[kind] == null ? 'cats' : 'items';
}

// Varsayılan sıra: klasörler, sonra sağlayıcının grupları.
function categoryBase(kind) {
  const prefs = prefsOf(kind);
  return [
    ...prefs.folders.map((f) => ({ id: folderKey(f.id), name: f.name, count: folderItems(kind, f).length, folder: true })),
    ...S.groups[kind].map((g) => ({ id: groupKey(g.name), name: g.name, count: g.count })),
  ];
}

function categoryRows(kind) {
  const prefs = prefsOf(kind);
  const specials = [{ id: '__all', name: 'Tümü', count: visibleAll(kind).length, special: true }];
  if (kind === 'live') specials.push({ id: '__recent', name: 'Son izlenen', count: recentItems(kind).length, special: true });
  else {
    const n = continueItems(kind).length;
    if (n) specials.push({ id: '__cont', name: 'Devam et', count: n, special: true });
  }
  let rows = arrange(categoryBase(kind), prefs).map((r) => ({ ...r, hidden: prefs.hidden.includes(r.id) }));
  if (!S.catEdit) rows = rows.filter((r) => !r.hidden);
  const f = fold(S.catFilter);
  const match = (r) => fold(r.name).includes(f);
  return f ? specials.filter(match).concat(rows.filter(match)) : specials.concat(rows);
}

function catRow(c, i) {
  const folderIc = c.folder ? icon('folder') : '';
  if (!S.catEdit || c.special) {
    return `<div class="row cat${c.special ? ' special' : ''}" role="button" tabindex="0" data-i="${i}"><div class="meta"><div class="nm">${folderIc}${esc(c.name)}</div></div><span class="n">${c.count}</span><span class="chev" aria-hidden="true">›</span></div>`;
  }
  const move_ = S.catFilter
    ? ''
    : `<button class="act" data-act="top" aria-label="En üste al">${icon('top')}</button><button class="act" data-act="up" aria-label="Yukarı">${icon('up')}</button><button class="act" data-act="down" aria-label="Aşağı">${icon('down')}</button>`;
  return `<div class="row cat edit${c.hidden ? ' hid' : ''}" role="button" tabindex="0" data-i="${i}"><button class="act" data-act="eye" aria-label="${c.hidden ? 'Göster' : 'Gizle'}">${icon(c.hidden ? 'eye-off' : 'eye')}</button><div class="meta"><div class="nm">${folderIc}${esc(c.name)}</div></div><span class="n">${c.count}</span>${move_}</div>`;
}

function onCatTap(kind, i, ev) {
  const c = S.cats[i];
  if (!c) return;
  if (!S.catEdit || c.special) return enterGroup(kind, c.id);
  const act = ev.target.closest('[data-act]');
  if (act) {
    const prefs = prefsOf(kind);
    const next = act.dataset.act === 'eye'
      ? toggleHidden(prefs, c.id)
      : move(prefs, arrange(categoryBase(kind), prefs).map((r) => r.id), c.id, act.dataset.act);
    savePrefs(kind, next);
    return refreshList(true);
  }
  if (c.folder) folderMenu(kind, c.id.slice(2));
}

// Kategoriye gir: Android geri tuşu bir adım geri (kategori listesine) döner.
function enterGroup(kind, g) {
  closeSearch(true);
  S.group[kind] = g;
  if (!groupLayer) {
    const id = ++layerSeq;
    groupLayer = id;
    pushLayer('group', () => {
      if (groupLayer !== id) return;
      groupLayer = 0;
      const k = TAB_KIND[S.tab];
      if (k && S.group[k] != null) {
        S.group[k] = null;
        refreshList();
      }
    });
  }
  refreshList();
}

function leaveGroup(kind) {
  if (groupLayer) return popLayer('group');
  S.group[kind] = null;
  refreshList();
}

function dropGroupLayer() {
  if (!groupLayer) return;
  groupLayer = 0; // eski katmanın onClose'u artık etkisiz
  if (topLayer() === 'group') popLayer('group'); // üstte alt sayfa/oynatıcı varsa onlara dokunma
}

function clearGroupState() {
  S.group = { live: null, movie: null, series: null };
  S.catFilter = '';
  S.catEdit = false;
}

function resetGroups() {
  clearGroupState();
  dropGroupLayer();
}

function groupExists(kind, g) {
  if (g.startsWith('__')) return true;
  if (g.startsWith('f:')) return !!folderOf(prefsOf(kind), g.slice(2));
  if (g.startsWith('g:')) return S.groups[kind].some((x) => groupKey(x.name) === g);
  return false;
}

// Liste yenilenince ya da klasör silinince, artık var olmayan kategoriden çık.
function pruneGroups() {
  for (const k of Object.keys(S.group)) {
    if (S.group[k] && !groupExists(k, S.group[k])) S.group[k] = null;
  }
  if (!Object.values(S.group).some((g) => g != null)) dropGroupLayer();
}

function drawCrumb(kind) {
  const g = S.group[kind];
  $('#crumb').hidden = g == null;
  if (g != null) {
    $('#crumb-t').textContent = groupTitle(kind, g);
    $('#crumb-n').textContent = S.items.length;
    const sortable = !S.query && g !== '__recent' && g !== '__cont';
    $('#crumb-sort').hidden = !sortable;
    $('#crumb-sort').classList.toggle('on', S.sort[kind] !== 'default');
  }
  const label = { live: 'Kanal', movie: 'Film', series: 'Dizi' }[kind];
  qEl.placeholder = g != null ? 'Bu kategoride ara…' : `${label} ara…`;
}

function renderBrowse(v, kind) {
  v.innerHTML = `<div class="crumb" id="crumb" hidden><button class="crumb-back" id="crumb-back" aria-label="Kategorilere dön">${icon('back')}</button><div class="t" id="crumb-t"></div><small id="crumb-n"></small><button class="icon-btn" id="crumb-search" aria-label="Bu kategoride ara">${icon('search')}</button><button class="icon-btn" id="crumb-sort" aria-label="Sırala">${icon('sort')}</button></div><div class="catbar" id="catbar" hidden><label class="field catq" id="catq" hidden><input id="cat-q" type="search" placeholder="Kategori ara…" autocomplete="off"></label><button class="btn sm ghost" id="cat-new" hidden>${icon('plus')}Klasör</button><button class="btn sm ghost" id="cat-reset" hidden>Sıfırla</button><button class="btn sm ghost" id="cat-edit">Düzenle</button></div><div id="list"></div><div id="empty" hidden></div>`;
  $('#crumb-back').addEventListener('click', () => leaveGroup(kind));
  $('#crumb-search').addEventListener('click', () => openSearch());
  $('#crumb-sort').addEventListener('click', () => sortSheet(kind));
  $('#cat-q').value = S.catFilter;
  $('#cat-q').addEventListener(
    'input',
    debounce((e) => {
      S.catFilter = e.target.value.trim();
      refreshList();
    }, 120),
  );
  $('#cat-edit').addEventListener('click', () => {
    S.catEdit = !S.catEdit;
    refreshList(true);
  });
  $('#cat-new').addEventListener('click', () => nameSheet(kind));
  $('#cat-reset').addEventListener('click', () => resetSheet(kind));
  refreshList();
}

function mountList(kind, mode = 'items') {
  const el = $('#list');
  S.listMode = mode;
  const longPress = (i) => S.items[i] && folderSheet(kind, S.items[i]);
  if (mode === 'cats') {
    S.list = new VirtualList(el, {
      rowH: 56,
      render: (c, i) => catRow(c, i),
      onTap: (i, ev) => onCatTap(kind, i, ev),
    });
  } else if (kind === 'live') {
    S.list = new VirtualList(el, {
      rowH: 64,
      render: (it, i) => liveRow(it, i),
      onTap: (i, ev) => {
        const it = S.items[i];
        if (ev.target.closest('[data-fav]')) return toggleFav(it);
        if (ev.target.closest('[data-epg]')) return epgSheet(it);
        if (S.split && S.tab === 'live') return onSplitTap(i);
        playLive(S.items, i);
      },
      onLongPress: longPress,
    });
  } else {
    const gap = 10;
    S.list = new VirtualList(el, {
      minCellW: 104,
      gap,
      cellH: (w, cols) => ((w - 24 - gap * (cols - 1)) / cols) * 1.5 + 42,
      render: (it, i) => card(it, i),
      onTap: (i) => (kind === 'movie' ? openMovie(S.items[i]) : openSeries(S.items[i])),
      onLongPress: longPress,
    });
  }
}

function refreshList(keepScroll = false) {
  if (S.tab === 'favs') return S.list ? refreshFavs() : undefined;
  if (S.tab === 'live' && S.split && $('#split')) return refreshSplit(keepScroll);
  const kind = TAB_KIND[S.tab];
  if (!kind || !$('#list')) return;
  pruneGroups();
  const mode = browseMode(kind);
  if (!S.list || S.listMode !== mode) {
    if (S.list) S.list.destroy();
    mountList(kind, mode);
    keepScroll = false;
  }
  const all = S.cat[CAT_KEY[kind]].length;
  S.items = mode === 'cats' ? [] : currentItems(kind);
  S.cats = mode === 'cats' ? categoryRows(kind) : [];
  const rows = mode === 'cats' ? S.cats : S.items;
  S.list.setItems(rows, keepScroll);
  drawCrumb(kind);
  const empty = $('#empty');
  const none = mode === 'cats' ? !all || !rows.length : !rows.length;
  $('#catbar').hidden = !(mode === 'cats' && all);
  $('#catq').hidden = !(S.groups[kind].length > 8 || S.catFilter);
  $('#cat-new').hidden = $('#cat-reset').hidden = !S.catEdit;
  $('#cat-edit').textContent = S.catEdit ? 'Bitti' : 'Düzenle';
  $('#list').hidden = none;
  empty.hidden = !none;
  if (none) fillEmpty(empty, kind, mode, all);
}

// Liste boşken gösterilecek açıklama
function fillEmpty(empty, kind, mode, all) {
  const label = { live: 'kanal', movie: 'film', series: 'dizi' }[kind];
  const g = S.group[kind];
  if (S.query) empty.innerHTML = emptyHtml('Sonuç yok', `“${S.query}” için ${g != null ? 'bu kategoride ' : ''}${label} bulunamadı.`);
  else if (!all && S.loading) empty.innerHTML = emptyHtml('Yükleniyor…', 'Liste indiriliyor, birazdan hazır olur.');
  else if (!all) empty.innerHTML = emptyHtml(`Bu kaynakta ${label} yok`, 'Listeyi yenilemeyi ya da başka bir kaynak seçmeyi deneyin.', '<button class="btn" id="e-refresh">Listeyi yenile</button>');
  else if (mode === 'cats') empty.innerHTML = emptyHtml('Eşleşen kategori yok', '');
  else if (g === '__recent') empty.innerHTML = emptyHtml('Henüz izlemediniz', 'İzlediğiniz kanallar burada görünür.');
  else if (g === '__cont') empty.innerHTML = emptyHtml('Yarım kalan yok', 'Yarıda bıraktığınız içerikler burada görünür.');
  else if (g && g.startsWith('f:')) empty.innerHTML = emptyHtml('Klasör boş', `Bir ${label} satırına ya da kartına uzun basıp “Klasöre ekle”yi seçin.`);
  else empty.innerHTML = emptyHtml('Bu kategoride öğe yok', '');
  const b = $('#e-refresh');
  if (b) b.addEventListener('click', () => refreshCatalog());
}

// Sıralama seçimi (A→Z, Z→A, eklenme zamanı)
function sortSheet(kind) {
  const hint = S.source && S.source.type === 'xtream' ? '' : '<p class="hint">Bu listede eklenme tarihi bulunmuyor; “eklenme” seçenekleri listedeki sıraya göre çalışır (sona eklenen yeni sayılır).</p>';
  const sh = openSheet({
    title: 'Sırala',
    html: SORTS.map(([k, label]) => `<button class="list-item" data-s="${k}"><span class="t">${esc(label)}</span>${S.sort[kind] === k ? tick() : ''}</button>`).join('') + hint,
    mount: (body) =>
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-s]');
        if (!b || !isSortMode(b.dataset.s)) return;
        S.sort[kind] = b.dataset.s;
        store.setPref('sort.' + kind, b.dataset.s);
        sh.close();
        refreshList();
      }),
  });
}

// ---- özel klasörler ----

const tick = () => icon('check').replace('class="ic"', 'class="ic ok"');

// Öğeyi klasörlere ekle/çıkar (uzun basma ve detay sayfası).
function folderSheet(kind, it) {
  if (!it) return;
  openSheet({
    title: 'Klasöre ekle',
    html: `<p class="hint">${esc(it.name)}</p><div id="fl-list"></div><div class="fl-new"><label class="field"><input id="fl-name" type="text" maxlength="60" placeholder="Yeni klasör adı" autocomplete="off"></label><button class="btn" id="fl-add">${icon('plus')}Oluştur ve ekle</button></div>`,
    mount: (body) => {
      const draw = () => {
        const prefs = prefsOf(kind);
        $('#fl-list', body).innerHTML = prefs.folders.length
          ? prefs.folders
              .map((f) => `<button class="list-item" data-f="${esc(f.id)}"><span class="t">${icon('folder').replace('class="ic"', 'class="ic" style="color:var(--gold);vertical-align:-5px;margin-right:8px"')}${esc(f.name)}<small>${f.items.length} öğe</small></span>${f.items.includes(it.id) ? tick() : ''}</button>`)
              .join('')
          : '<p class="hint">Henüz klasör yok. Aşağıdan bir tane oluşturun.</p>';
      };
      const changed = () => {
        draw();
        if (S.list && TAB_KIND[S.tab] === kind) refreshList(true); // klasör içindeyken çıkarılan öğe hemen kaybolsun
      };
      draw();
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-f]');
        if (!b) return;
        const r = toggleInFolder(prefsOf(kind), b.dataset.f, it.id);
        savePrefs(kind, r.prefs);
        toast(r.on ? 'Klasöre eklendi' : 'Klasörden çıkarıldı', 1400);
        changed();
      });
      const add = () => {
        const nameEl = $('#fl-name', body);
        const created = addFolder(prefsOf(kind), nameEl.value);
        if (!created.folder) return nameEl.focus();
        savePrefs(kind, toggleInFolder(created.prefs, created.folder.id, it.id).prefs);
        nameEl.value = '';
        toast('Klasör oluşturuldu', 1400);
        changed();
      };
      $('#fl-add', body).addEventListener('click', add);
      $('#fl-name', body).addEventListener('keydown', (e) => e.key === 'Enter' && add());
    },
  });
}

// Yeni klasör adı
function nameSheet(kind) {
  const sh = openSheet({
    title: 'Yeni klasör',
    html: '<label class="field"><span>Klasör adı</span><input id="nf-name" type="text" maxlength="60" placeholder="Örn. Çocuk kanalları" autocomplete="off"></label><button class="btn" id="nf-go">Oluştur</button>',
    mount: (body) => {
      const go = () => {
        const r = addFolder(prefsOf(kind), $('#nf-name', body).value);
        if (!r.folder) return $('#nf-name', body).focus();
        savePrefs(kind, r.prefs);
        sh.close();
        refreshList(true);
      };
      $('#nf-go', body).addEventListener('click', go);
      $('#nf-name', body).addEventListener('keydown', (e) => e.key === 'Enter' && go());
      setTimeout(() => $('#nf-name', body).focus(), 200);
    },
  });
}

// Klasör: yeniden adlandır / sil (aynı sayfa içinde adım adım)
function folderMenu(kind, id) {
  const f0 = folderOf(prefsOf(kind), id);
  if (!f0) return;
  openSheet({
    title: f0.name,
    mount: (body, sh) => {
      const menu = () => {
        const f = folderOf(prefsOf(kind), id);
        body.innerHTML = `<p class="hint">${f.items.length} öğe</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="fm-ren">Yeniden adlandır</button><button class="btn ghost danger" id="fm-del">${icon('trash')}Klasörü sil</button></div>`;
        $('#fm-ren', body).addEventListener('click', rename);
        $('#fm-del', body).addEventListener('click', confirmDel);
      };
      const rename = () => {
        const f = folderOf(prefsOf(kind), id);
        body.innerHTML = '<label class="field"><span>Klasör adı</span><input id="fm-name" type="text" maxlength="60" autocomplete="off"></label><button class="btn" id="fm-save">Kaydet</button>';
        $('#fm-name', body).value = f.name;
        const save = () => {
          savePrefs(kind, renameFolder(prefsOf(kind), id, $('#fm-name', body).value));
          sh.close();
          refreshList(true);
        };
        $('#fm-save', body).addEventListener('click', save);
        $('#fm-name', body).addEventListener('keydown', (e) => e.key === 'Enter' && save());
        $('#fm-name', body).focus();
      };
      const confirmDel = () => {
        body.innerHTML = '<p>Bu klasör silinsin mi? İçindeki kanal/film/diziler listeden silinmez, yalnız klasör kalkar.</p><div style="display:flex;gap:8px"><button class="btn danger" id="fm-yes">Sil</button><button class="btn ghost" id="fm-no">Vazgeç</button></div>';
        $('#fm-no', body).addEventListener('click', menu);
        $('#fm-yes', body).addEventListener('click', () => {
          savePrefs(kind, deleteFolder(prefsOf(kind), id));
          sh.close();
          refreshList(true);
        });
      };
      menu();
    },
  });
}

// Sıralama ve gizlemeleri sıfırla (klasörler korunur)
function resetSheet(kind) {
  const sh = openSheet({
    title: 'Sıralamayı sıfırla',
    html: '<p>Kategorilerin sırası varsayılana döner ve gizlediğiniz kategoriler yeniden görünür. Klasörleriniz silinmez.</p><div style="display:flex;gap:8px"><button class="btn danger" id="rs-yes">Sıfırla</button><button class="btn ghost" id="rs-no">Vazgeç</button></div>',
    mount: (body) => {
      $('#rs-no', body).addEventListener('click', () => sh.close());
      $('#rs-yes', body).addEventListener('click', () => {
        savePrefs(kind, resetOrderAndHidden(prefsOf(kind)));
        sh.close();
        refreshList(true);
      });
    },
  });
}

function liveRow(it, i) {
  const split = S.split && S.tab === 'live';
  const showEpg = setting('epgRows');
  const nn = showEpg ? S.epg.nowNext(it) : { now: null };
  const fav = isFav(it);
  const sub = nn.now ? nn.now.t : it.group || '';
  const sel = split && S.pv && S.pv.id === it.id;
  const num = split && setting('numbers') ? `<span class="num">${it.num || i + 1}</span>` : '';
  return `<div class="row${sel ? ' sel' : ''}" role="button" tabindex="0" data-i="${i}">${num}${logo(it.logo, it.name)}<div class="meta"><div class="nm">${esc(it.name)}</div><div class="sub">${esc(sub)}</div>${nn.now ? `<div class="bar"><i style="width:${Math.round(nn.progress * 100)}%"></i></div>` : ''}</div><button class="act ${fav ? 'on' : ''}" data-fav aria-label="Favori">${icon(fav ? 'star-on' : 'star')}</button><button class="act" data-epg aria-label="Program rehberi">${icon('list')}</button></div>`;
}

function card(it, i) {
  const p = progressOf(it);
  const pct = p && p.dur > 0 ? Math.round((p.pos / p.dur) * 100) : 0;
  const ph = esc(it.name.slice(0, 2).toUpperCase());
  const img = it.logo ? `<img src="${esc(it.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.parentNode.classList.add('ok')" onerror="this.remove()">` : '';
  return `<div class="card" role="button" tabindex="0" data-i="${i}"><div class="poster"><div class="ph">${ph}</div>${img}${isFav(it) ? `<span class="fav">${icon('star-on')}</span>` : ''}${pct ? `<div class="prog"><i style="width:${pct}%"></i></div>` : ''}</div><div class="cap">${esc(it.name)}</div></div>`;
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
function openSearch() {
  $('#searchbar').hidden = false;
  qEl.focus();
}
$('#btn-search').addEventListener('click', () => {
  if ($('#searchbar').hidden) openSearch();
  else closeSearch();
});
$('#q-clear').addEventListener('click', () => closeSearch());
qEl.addEventListener(
  'input',
  debounce(() => {
    S.query = qEl.value.trim();
    refreshList();
  }, 120),
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
    html: `<div class="detail"><div class="pos">${it.logo ? `<img src="${esc(it.logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : esc(it.name.slice(0, 2).toUpperCase())}</div><div><h2>${esc(it.name)}</h2><div class="m" id="mv-meta">${esc(it.group || '')}${it.rating ? ` · ★ ${it.rating}` : ''}</div></div></div><p class="plot" id="mv-plot"></p><div class="btns" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="mv-play">${icon('play')}${esc(resumeTxt)}</button>${p ? '<button class="btn ghost" id="mv-start">Baştan başlat</button>' : ''}<button class="btn ghost" id="mv-fav">${icon(isFav(it) ? 'star-on' : 'star')}Favori</button><button class="btn ghost" id="mv-fold">${icon('folder')}Klasör</button></div>`,
    mount: (body) => {
      $('#mv-play', body).addEventListener('click', () => startPlay(it));
      const st = $('#mv-start', body);
      if (st) st.addEventListener('click', () => startPlay(it, { startAt: 0 }));
      $('#mv-fold', body).addEventListener('click', () => folderSheet('movie', it));
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
        body.innerHTML = `<div class="detail"><div class="pos">${it.logo ? `<img src="${esc(it.logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : esc(it.name.slice(0, 2).toUpperCase())}</div><div><h2>${esc(it.name)}</h2><div class="m">${esc([it.group, info.genre, info.year && String(info.year).slice(0, 4)].filter(Boolean).join(' · '))}</div><div style="display:flex;gap:8px;flex-wrap:wrap">${cont ? `<button class="btn sm" id="sr-cont">${icon('play')}Devam et · ${esc(cont.label.split(' · ')[0])}</button>` : ''}<button class="btn sm ghost" id="sr-fav">${icon(isFav(it) ? 'star-on' : 'star')}Favori</button><button class="btn sm ghost" id="sr-fold">${icon('folder')}Klasör</button></div></div></div>${info.plot || it.plot ? `<p class="plot">${esc(info.plot || it.plot)}</p>` : ''}<div class="chips" style="padding-left:0;padding-right:0">${seasons}</div>${rows}`;
        const c = $('#sr-cont', body);
        if (c) c.addEventListener('click', () => play(cont));
        $('#sr-fold', body).addEventListener('click', () => folderSheet('series', it));
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
  const grid = `<div class="set-grid"><button class="set-tile" data-set="general">${icon('sliders')}<span>Genel ayarlar</span></button><button class="set-tile" data-set="epg">${icon('cal')}<span>TV rehberi (EPG)</span></button><button class="set-tile" data-set="auto">${icon('timer')}<span>Otomasyon</span></button><button class="set-tile" data-set="update">${icon('refresh')}<span>${upd && upd.status === 'available' ? 'Yeni sürüm var' : 'Güncellemeyi denetle'}</span></button></div>`;
  v.innerHTML = `<div class="page">${grid}<div class="sect">Kaynaklar</div>${cards}<button class="btn" id="src-add">${icon('plus')}Kaynak ekle</button><div class="sect">Diğer</div><button class="btn ghost sm" id="clr-rec">Son izlenenleri temizle</button><p style="color:var(--muted);font-size:12px;margin-top:18px">IPTV Oynatıcı bir yayın hizmeti değildir ve içerik sağlamaz. Yalnızca yasal olarak erişim hakkınız olan kaynakları kullanın.</p><p style="color:var(--muted);font-size:12px">Sürüm ${esc(VERSION)}</p></div>`;
  v.addEventListener('click', onSourcesClick);
}

function onSourcesClick(e) {
  const t = e.target.closest('[data-set]');
  if (t) {
    const k = t.dataset.set;
    if (k === 'general') return generalSheet();
    if (k === 'epg') return epgSettingsSheet();
    if (k === 'auto') return autoSheet();
    if (k === 'update') return upd && upd.status === 'available' ? updateSheet(upd) : checkForUpdate({ manual: true });
  }
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

// ------------------------------------------------------------------ ana ekran

const fmtDate = (d, o) => d.toLocaleDateString('tr-TR', o);

function tickClock() {
  const now = new Date();
  const t = fmtClock(now.getTime());
  const bc = $('#bar-clock');
  if (bc) bc.textContent = `${t}  ${fmtDate(now, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const hc = $('#h-clock');
  if (hc) {
    hc.textContent = t;
    $('#h-date').textContent = fmtDate(now, { day: '2-digit', month: 'long', year: 'numeric' });
  }
  const u = $('#h-upd');
  if (u) u.textContent = 'Son güncelleme: ' + fmtAgo(S.cat.fetchedAt);
}

function renderHome(v) {
  const c = S.cat;
  const src = S.source;
  const exp = c.account && c.account.expires ? fmtDate(new Date(c.account.expires), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const cnt = (n, w) => (n ? `${n} ${w}` : '');
  const favN = store.favs(sid()).length;
  const recN = store.recents(sid()).length;
  const who = src.type === 'xtream' ? src.user : src.local ? 'Dosya' : 'M3U';
  const chip = upd && upd.status === 'available' ? `<button class="btn sm" id="h-upd-chip">${icon('refresh')}Yeni sürüm</button>` : '';
  v.innerHTML = `<div class="home">
    <div class="home-top"><div class="brand">${icon('tv')}<b>IPTV</b><span>Oynatıcı</span></div>${chip}<div class="home-clock"><b id="h-clock"></b><small id="h-date"></small></div><button class="icon-btn" id="h-search" aria-label="Ara">${icon('search')}</button><button class="icon-btn" id="h-set" aria-label="Ayarlar">${icon('gear')}</button></div>
    <div class="tiles">
      <div class="tile t-live has-upd" role="button" tabindex="0" data-go="live">${icon('tv')}<b>Canlı TV</b><small>${cnt(c.live.length, 'kanal')}</small><div class="upd"><span id="h-upd"></span><button class="re" data-refresh aria-label="Listeyi yenile">${icon('refresh')}</button></div></div>
      <button class="tile t-movie" data-go="movies">${icon('movie')}<b>Filmler</b><small>${cnt(c.movies.length, 'film')}</small></button>
      <button class="tile t-series" data-go="series">${icon('series')}<b>Diziler</b><small>${cnt(c.series.length, 'dizi')}</small></button>
      <button class="tile mini t-fav" data-go="favs">${icon('star-on')}<b>Favoriler</b><small>${favN || ''}</small></button>
      <button class="tile mini t-rec" data-go="recent">${icon('history')}<b>Son izlenen</b><small>${recN || ''}</small></button>
      <button class="tile mini t-set" data-go="sources">${icon('gear')}<b>Ayarlar</b></button>
    </div>
    <div class="home-foot"><span>${exp ? 'Bitiş Tarihi: ' + esc(exp) : ''}</span><button id="h-src">${icon('down')}<span>${esc(src.name)}</span></button><span>Giriş: ${esc(who)}</span></div>
  </div>`;
  v.onclick = (e) => {
    if (e.target.closest('[data-refresh]')) {
      e.stopPropagation();
      return refreshCatalog();
    }
    if (e.target.closest('#h-search')) return globalSearch();
    if (e.target.closest('#h-set')) return setTab('sources');
    if (e.target.closest('#h-upd-chip')) return upd && updateSheet(upd);
    if (e.target.closest('#h-src')) return store.sources().length ? sourceSwitcher() : sourceForm();
    const t = e.target.closest('[data-go]');
    if (!t) return;
    if (t.dataset.go === 'recent') {
      setTab('live');
      return showRecent();
    }
    setTab(t.dataset.go);
  };
  tickClock();
}

function showRecent() {
  if (S.split) {
    S.group.live = '__recent';
    refreshList();
  } else enterGroup('live', '__recent');
}

// ------------------------------------------------------------------ canlı TV: bölmeli ekran (yatay)

let spObs = null;
const shortEpgCache = new Map();

function previewRect() {
  const el = $('#sp-slot');
  if (!el || !S.split || S.tab !== 'live') return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null;
}

// Android'de önizleme yerel görünümde oynar: sayfa saydam, #bgfill önizleme yuvası dışındaki her yeri örter.
function syncHole() {
  const bg = $('#bgfill');
  const r = pui.isPreviewing() ? previewRect() : null;
  bg.style.clipPath = r
    ? `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${r.x}px ${r.y}px, ${r.x}px ${r.y + r.h}px, ${r.x + r.w}px ${r.y + r.h}px, ${r.x + r.w}px ${r.y}px, ${r.x}px ${r.y}px)`
    : '';
}

function layoutPreview() {
  pui.syncPreview();
  syncHole();
}

function renderSplit(v) {
  if (spObs) spObs.disconnect();
  S.catFilter = '';
  S.catEdit = false;
  if (S.group.live == null) {
    const g = store.pref('live.cat', '__all');
    S.group.live = groupExists('live', g) ? g : '__all';
  }
  v.innerHTML = `<div class="split" id="split"><section class="sp-left"><div class="sp-cat"><button class="icon-btn" id="sp-prev" aria-label="Önceki kategori">${icon('chev-l')}</button><button class="sp-name" id="sp-name" aria-label="Kategori seç"><span id="sp-name-t"></span><small id="sp-name-n"></small></button><button class="icon-btn" id="sp-next" aria-label="Sonraki kategori">${icon('chev-r')}</button></div><div id="list"></div><div id="empty" hidden></div></section><section class="sp-right"><div class="sp-slot" id="sp-slot" role="button" tabindex="0" aria-label="Tam ekran"><div class="sp-status" id="sp-status"></div></div><div class="sp-info" id="sp-info"></div><div class="sp-epg" id="sp-epg"></div></section></div>`;
  $('#sp-prev').addEventListener('click', () => cycleCat(-1));
  $('#sp-next').addEventListener('click', () => cycleCat(1));
  $('#sp-name').addEventListener('click', catPicker);
  $('#sp-slot').addEventListener('click', onSlotTap);
  if (window.ResizeObserver) {
    spObs = new ResizeObserver(() => layoutPreview());
    spObs.observe($('#sp-slot'));
  }
  setSpStatus({ status: 'idle' });
  refreshList();
  renderSpInfo();
  layoutPreview();
}

function refreshSplit(keepScroll = false) {
  pruneGroups();
  if (S.group.live == null) S.group.live = '__all';
  if (!S.list) mountList('live', 'items');
  S.items = currentItems('live');
  S.list.setItems(S.items, keepScroll);
  $('#sp-name-t').textContent = groupTitle('live', S.group.live);
  $('#sp-name-n').textContent = S.items.length;
  const none = !S.items.length;
  $('#list').hidden = none;
  const empty = $('#empty');
  empty.hidden = !none;
  if (none) fillEmpty(empty, 'live', 'items', S.cat.live.length);
}

function onSplitTap(i) {
  const it = S.items[i];
  if (!it) return;
  if (!setting('autoPreview')) return playLive(S.items, i);
  if (S.pv && S.pv.id === it.id && pui.isPreviewing()) return pui.expand();
  previewLive(S.items, i);
}

function previewLive(items, index) {
  const it = items[index];
  const targets = playTargets(S.source, it);
  if (!targets.length) return toast('Bu içerik için oynatma adresi bulunamadı');
  store.pushRecent(sid(), it);
  const ctx = { items, index, play: (x, i) => startPlay(x, { ctx: { ...ctx, index: i } }) };
  S.pv = it;
  pui.preview(it, targets, { ctx });
  layoutPreview();
  S.list && S.list.refreshRows();
  renderSpInfo();
}

function onSlotTap() {
  if (pui.isPreviewing()) return pui.expand();
  toast('Önizleme için bir kanala dokunun', 1800);
}

// Önizlenen kanalı değiştir (tam ekranda kanal değişince ya da önizlemeye dönünce)
function setPv(it) {
  S.pv = it;
  if (S.list) {
    S.list.refreshRows();
    const i = S.items.findIndex((x) => x.id === it.id);
    if (i >= 0) S.list.scrollToIndex(i);
  }
  renderSpInfo();
}

function setSpStatus(st) {
  const el = $('#sp-status');
  if (!el) return;
  if (!pui.isPreviewing()) el.innerHTML = S.pv ? '' : '<span class="sp-hint">Önizleme için bir kanala dokunun</span>';
  else if (st.status === 'loading' || st.status === 'buffering') el.innerHTML = '<div class="spinner"></div>';
  else if (st.status === 'error') el.innerHTML = `<span>${esc(st.error)}<br><small>Tam ekran için dokunun</small></span>`;
  else el.innerHTML = '';
}

function renderSpInfo() {
  const info = $('#sp-info');
  const epgEl = $('#sp-epg');
  if (!info || !epgEl) return;
  const it = S.pv;
  if (!it) {
    info.innerHTML = '<span class="sp-badge">CANLI TV</span><span class="sp-hint">Bir kanala dokunun</span>';
    epgEl.innerHTML = '';
    return;
  }
  const nn = S.epg.nowNext(it);
  info.innerHTML = `<span class="sp-badge">CANLI TV</span><b>${esc(it.name)}</b>${nn.now ? `<span class="sp-now">${esc(nn.now.t)}</span><span class="sp-time">${fmtClock(nn.now.s)} – ${fmtClock(nn.now.e)}</span>` : ''}`;
  const draw = (list) => {
    const now = Date.now();
    epgEl.innerHTML = list.length
      ? list.map((p) => `<div class="prog-row ${p.s <= now && p.e > now ? 'now' : ''}"><time>${fmtClock(p.s)}</time><div><b>${esc(p.t)}</b></div></div>`).join('')
      : '<div class="sp-hint">Program bilgisi yok</div>';
  };
  const now = Date.now();
  const list = S.epg.listFor(it).filter((p) => p.e > now).slice(0, 8);
  draw(list);
  if (!list.length && S.source) {
    const key = sid() + ':' + it.id;
    const done = (l) => S.pv && S.pv.id === it.id && $('#sp-epg') && draw((l || []).filter((p) => p.e > Date.now()).slice(0, 8));
    if (shortEpgCache.has(key)) done(shortEpgCache.get(key));
    else {
      loadShortEpg(S.source, net, it, 6)
        .then((l) => {
          shortEpgCache.set(key, l);
          done(l);
        })
        .catch(() => {});
    }
  }
}

// Kategori geçişi: ‹ › okları ve ortadaki ada dokununca açılan liste
function setSplitCat(id) {
  S.group.live = id;
  store.setPref('live.cat', id);
  closeSearch(true);
  refreshList();
}

function cycleCat(d) {
  const rows = categoryRows('live');
  if (!rows.length) return;
  let i = rows.findIndex((r) => r.id === (S.group.live || '__all'));
  i = (i + d + rows.length) % rows.length;
  setSplitCat(rows[i].id);
}

function catPicker() {
  openSheet({
    title: 'Kategori seç',
    html: '<div class="sp-picker-q"><input id="cp-q" type="search" placeholder="Kategorilerde ara" autocomplete="off"></div><div id="cp-list"></div>',
    mount: (body, api) => {
      const q = $('#cp-q', body);
      const list = $('#cp-list', body);
      const draw = () => {
        const f = fold(q.value);
        const cur = S.group.live || '__all';
        list.innerHTML = categoryRows('live')
          .filter((r) => !f || fold(r.name).includes(f))
          .map((r) => `<button class="list-item" data-id="${esc(r.id)}"><span class="t">${r.folder ? icon('folder') : ''}${esc(r.name)}</span><span class="n">${r.count}</span>${r.id === cur ? icon('check').replace('class="ic"', 'class="ic ok"') : ''}</button>`)
          .join('') || '<div class="empty">Eşleşen kategori yok</div>';
      };
      q.addEventListener('input', debounce(draw, 100));
      list.addEventListener('click', (e) => {
        const b = e.target.closest('[data-id]');
        if (!b) return;
        api.close();
        setSplitCat(b.dataset.id);
      });
      draw();
    },
  });
}

// ------------------------------------------------------------------ genel arama (ana ekran)

function globalSearch() {
  openSheet({
    title: 'Ara',
    html: '<div class="sp-picker-q"><input id="gs-q" type="search" placeholder="Kanal, film veya dizi ara…" autocomplete="off"></div><div id="gs-res"></div>',
    mount: (body) => {
      const q = $('#gs-q', body);
      const res = $('#gs-res', body);
      let found = { live: [], movie: [], series: [] };
      const row = (it, k, i) => `<button class="list-item" data-k="${k}" data-i="${i}">${logo(it.logo, it.name)}<span class="t">${esc(it.name)}<small>${esc(it.group || '')}</small></span></button>`;
      const draw = () => {
        const t = q.value.trim();
        if (!t) {
          res.innerHTML = '<div class="empty">Aramak için yazın</div>';
          return;
        }
        found = { live: search(visibleAll('live'), t, 20), movie: search(visibleAll('movie'), t, 20), series: search(visibleAll('series'), t, 20) };
        const sec = (title, k) => (found[k].length ? `<div class="sect">${title}</div>` + found[k].map((it, i) => row(it, k, i)).join('') : '');
        res.innerHTML = sec('Canlı TV', 'live') + sec('Filmler', 'movie') + sec('Diziler', 'series') || '<div class="empty">Sonuç yok</div>';
      };
      q.addEventListener('input', debounce(draw, 150));
      res.addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        const i = Number(b.dataset.i);
        const it = found[b.dataset.k][i];
        if (!it) return;
        // Arama sayfası açık kalır: oynatıcı ya da ayrıntı üstüne açılır, geri dönünce sonuçlar durur.
        if (b.dataset.k === 'live') playLive(found.live, i);
        else if (b.dataset.k === 'movie') openMovie(it);
        else openSeries(it);
      });
      draw();
      setTimeout(() => q.focus(), 60);
    },
  });
}

// ------------------------------------------------------------------ ayarlar: genel, EPG, otomasyon

const chkRow = (k, label, sub) => `<button class="chk${setting(k) ? ' on' : ''}" data-k="${k}"><i>${icon('check')}</i><span class="t">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;
const optionsHtml = (pairs, cur) => pairs.map(([v, t]) => `<option value="${v}"${Number(cur) === v ? ' selected' : ''}>${t}</option>`).join('');

function generalSheet() {
  const lim = Number(store.pref('set.recentLimit', 40));
  openSheet({
    title: 'Genel ayarlar',
    html:
      chkRow('epgRows', 'Kanal listesinde program bilgisini göster', 'Şu an yayındaki program ve ilerleme çubuğu') +
      chkRow('numbers', 'Kanal numaralarını göster', 'Yatay ekrandaki Canlı TV listesinde') +
      chkRow('autoPreview', 'Canlı TV’de önizleme oynat', 'Yatay ekranda kanala dokununca küçük pencerede açılır; kapalıyken doğrudan tam ekran') +
      `<div class="sel-row"><span>Son izlenen sınırı</span><select id="g-lim">${optionsHtml([[20, '20'], [40, '40'], [100, '100']], lim)}</select></div><div style="margin-top:14px"><button class="btn ghost sm" id="g-clr">Son izlenenleri temizle</button></div>`,
    mount: (body) => {
      body.addEventListener('click', (e) => {
        const c = e.target.closest('.chk');
        if (c) {
          const on = !setting(c.dataset.k);
          store.setPref('set.' + c.dataset.k, on);
          c.classList.toggle('on', on);
          S.list && S.list.refreshRows();
        } else if (e.target.id === 'g-clr') {
          store.clearRecents(sid());
          toast('Son izlenenler temizlendi');
        }
      });
      $('#g-lim', body).addEventListener('change', (e) => store.setPref('set.recentLimit', Number(e.target.value)));
    },
  });
}

function autoSheet() {
  openSheet({
    title: 'Otomasyon',
    html: `<div class="sel-row"><span>Canlı, film ve dizi listesini yenile</span><select id="a-cat">${optionsHtml([[0, 'Kapalı'], [6, '6 saatte bir'], [12, '12 saatte bir'], [24, 'Günde bir'], [48, '2 günde bir'], [168, 'Haftada bir']], store.pref('auto.cat', 12))}</select></div><div class="sel-row"><span>TV rehberini (EPG) yenile</span><select id="a-epg">${optionsHtml([[0, 'Kapalı'], [3, '3 saatte bir'], [6, '6 saatte bir'], [12, '12 saatte bir'], [24, 'Günde bir']], store.pref('auto.epg', 6))}</select></div><p class="hint" style="margin-top:12px">Uygulama açılırken ya da öne geldiğinde, son yenilemeden bu kadar süre geçmişse liste kendiliğinden güncellenir. İstediğiniz an ana ekrandaki yenile düğmesine de dokunabilirsiniz.</p>`,
    mount: (body) => {
      $('#a-cat', body).addEventListener('change', (e) => store.setPref('auto.cat', Number(e.target.value)));
      $('#a-epg', body).addEventListener('change', (e) => store.setPref('auto.epg', Number(e.target.value)));
    },
  });
}

function epgSettingsSheet() {
  const s = S.source;
  const draw = (body) => {
    const urls = epgSourceUrls(s, S.cat);
    const when = S.epg.data && S.epg.data.fetchedAt ? fmtAgo(S.epg.data.fetchedAt) : 'hiç';
    const status = S.epgInfo && S.epgInfo.error ? `Alınamadı: ${S.epgInfo.error}` : S.epg.ready ? `${Object.keys(S.epg.data.map).length} kanal için program var` : urls.length ? 'Henüz yüklenmedi' : 'Bu kaynakta TV rehberi adresi yok';
    body.innerHTML = `<div class="list-item"><span class="t">${esc(s.name)}<small>${esc(status)}</small></span></div><div class="list-item"><span class="t">Son güncelleme<small>${esc(when)}</small></span></div>${urls.map((u) => `<div class="list-item"><span class="t">Adres<small style="word-break:break-all">${esc(u)}</small></span></div>`).join('')}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn sm" id="e-now"${urls.length ? '' : ' disabled'}>${icon('refresh')}EPG’yi şimdi yenile</button><button class="btn sm ghost" id="e-edit">Kaynağı düzenle</button></div>`;
    $('#e-now', body).addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      e.currentTarget.textContent = 'Yenileniyor…';
      await maybeRefreshEpg(true);
      if (body.isConnected) draw(body);
    });
    $('#e-edit', body).addEventListener('click', () => sourceForm(s));
  };
  openSheet({ title: 'TV rehberi (EPG)', mount: (body) => draw(body) });
}

// ------------------------------------------------------------------ uygulama içi güncelleme

let upd = null; // son denetimin sonucu
let updBusy = false;

async function checkForUpdate({ manual = false } = {}) {
  if (updBusy) return;
  if (!nativePlugin) return manual ? toast('Güncelleme yalnızca Android uygulamasında kullanılır') : undefined;
  if (!manual && !shouldAutoCheck(store.pref('upd.at', 0))) return;
  updBusy = true;
  try {
    const r = await checkUpdate({ net, localVersion: VERSION });
    store.setPref('upd.at', Date.now());
    if (r.status === 'unsupported') return manual ? toast('Bu geliştirme sürümünde güncelleme denetimi yok') : undefined;
    upd = r;
    if (r.status === 'available') {
      if (S.tab === 'home' && S.source) renderTab(); // “Yeni sürüm” düğmesi görünsün
      const busy = pui.isOpen() || pui.isPreviewing();
      if (manual || (!busy && store.pref('upd.skip', 0) !== r.code)) updateSheet(r);
    } else if (manual) toast(`Uygulama güncel (sürüm ${r.name})`);
  } catch (e) {
    if (manual) toast('Güncelleme denetlenemedi: ' + e.message, 4000);
  } finally {
    updBusy = false;
  }
}

function updateSheet(info) {
  let path = null;
  let busy = false;
  openSheet({
    title: 'Yeni sürüm hazır',
    html: `<p>Sürüm <b>${esc(info.name)}</b> yayında (şu an ${esc(VERSION)}).${info.size ? ` Boyut: ${fmtMB(info.size)}.` : ''}</p>${info.notes ? `<p class="hint">${esc(info.notes)}</p>` : ''}<div id="up-bar" hidden style="height:6px;border-radius:3px;background:var(--line);overflow:hidden;margin:10px 0"><i style="display:block;height:100%;width:0;background:var(--accent)"></i></div><p id="up-msg" class="hint"></p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="up-go">${icon('refresh')}Şimdi güncelle</button><button class="btn ghost" id="up-later">Sonra</button></div><p class="hint" style="margin-top:12px">Güncelleme mevcut uygulamanın üstüne kurulur; kaynaklarınız ve favorileriniz korunur.</p>`,
    mount: (body, api) => {
      const go = $('#up-go', body);
      const bar = $('#up-bar', body);
      const msg = $('#up-msg', body);
      $('#up-later', body).addEventListener('click', () => {
        store.setPref('upd.skip', info.code);
        api.close();
      });
      const install = async () => {
        go.disabled = true;
        try {
          const r = await nativePlugin.installApk({ path });
          msg.textContent = r && r.needsPermission
            ? 'Android, bu uygulamaya “bilinmeyen uygulamaları yükleme” izni verilmesini istiyor. Açılan ekranda izni verip geri dönün, sonra “Yüklemeyi başlat”a dokunun.'
            : 'Kurulum ekranı açıldı. Onaylayınca uygulama güncellenip yeniden başlar.';
          go.textContent = 'Yüklemeyi başlat';
        } catch (e) {
          msg.textContent = 'Kurulum başlatılamadı: ' + e.message;
        }
        go.disabled = false;
      };
      go.addEventListener('click', async () => {
        if (busy) return;
        if (path) return install();
        busy = true;
        go.disabled = true;
        bar.hidden = false;
        msg.textContent = 'İndiriliyor…';
        let handle = null;
        try {
          handle = await nativePlugin.addListener('apkProgress', (e) => {
            const f = e.total > 0 ? e.loaded / e.total : 0;
            bar.firstElementChild.style.width = Math.round(f * 100) + '%';
            msg.textContent = `İndiriliyor… ${e.total > 0 ? Math.round(f * 100) + '% · ' : ''}${fmtMB(e.loaded)}`;
          });
          path = (await nativePlugin.downloadApk({ url: info.apkUrl })).path;
        } catch (e) {
          msg.textContent = 'İndirilemedi: ' + e.message;
          go.disabled = false;
          go.textContent = 'Yeniden dene';
          busy = false;
          return;
        } finally {
          if (handle && handle.remove) handle.remove();
        }
        busy = false;
        bar.firstElementChild.style.width = '100%';
        msg.textContent = 'İndirildi, kurulum başlatılıyor…';
        install();
      });
    },
  });
}

// ------------------------------------------------------------------ olaylar ve başlangıç

$('#btn-source').addEventListener('click', () => (store.sources().length ? sourceSwitcher() : sourceForm()));
$('#btn-refresh').addEventListener('click', () => refreshCatalog());
$('#btn-home').addEventListener('click', () => setTab('home'));
// Yatay geniş ekranda canlı TV üç bölmeli olur; yön değişince yeniden kurulur.
const mqSplit = window.matchMedia('(orientation: landscape) and (min-width: 640px)');
S.split = mqSplit.matches;
mqSplit.addEventListener('change', () => {
  const was = S.split;
  S.split = mqSplit.matches;
  if (was === S.split || !S.source) return;
  if (S.tab === 'live') {
    resetGroups();
    renderTab();
  }
});
window.addEventListener('resize', layoutPreview);
setInterval(tickClock, 20000);
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
  if (document.visibilityState !== 'visible') return;
  if (S.source && !S.loading && S.cat.fetchedAt && Date.now() - S.cat.fetchedAt > staleCatalogMs()) refreshCatalog({ quiet: true });
  checkForUpdate();
});
setInterval(() => {
  if (S.list && S.tab === 'live' && document.visibilityState === 'visible' && !pui.isOpen()) S.list.refreshRows();
}, 60000);

initNav();
window.__iptv = { S, store, net, setVersion: (v) => (VERSION = v) }; // hata ayıklama ve uçtan uca testler için

(async function boot() {
  const src = store.activeSource();
  if (!src) {
    // İlk açılış: doğrudan kaynak ekleme sayfası (Xtream / M3U bağlantısı / dosyadan).
    renderTop();
    S.tab = 'home';
    renderTab();
    return sourceForm();
  }
  setTimeout(() => checkForUpdate(), 4000); // açılışta sessizce yeni sürüm var mı bak
  await activate(src.id);
})();
