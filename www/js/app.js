// Uygulama: kaynaklar, katalog, listeler, detay sayfaları, favoriler, rehber.
import { esc, fmtDuration, fmtClock, debounce, fold, maskUrl } from './util.js';
import { guideBlocks } from './guide.js';
import { createStore } from './store.js';
import { createNet } from './net.js';
import {
  loadCatalog, catalogToStorable, catalogFromStorable, emptyCatalog, search, groupList, inGroup,
  playTargets, buildAltIndex, altsOf, loadSeriesInfo, loadVodInfo, loadShortEpg, loadEpg, epgSourceUrls, EpgView,
  loadArchiveEpg, archiveTargets, recordTarget,
} from './catalog.js';
import { makePlan, activePlans, addPlan, removePlan, hasPlan, recConflict, planId, planWhen, REMIND_LEAD_MIN } from './plan.js';
import { parseXtreamLink, normalizeServer } from './xtream.js';
import { createNativeEngine, createWebEngine } from './engine.js';
import { createPlayer } from './player.js';
import { createPlayerUI } from './player-ui.js';
import { fmtBytes, recItem, recEndMessage, recSub, fmtRecDate } from './rec.js';
import { makeBackup, parseBackup, applyBackup, backupFileName } from './backup.js';
import { CHANGELOG, LATEST_ID, unseenEntries } from './changelog.js';
import { VirtualList } from './vlist.js';
import { sortItems, SORTS, isSortMode } from './sort.js';
import {
  arrange, toggleHidden, move, resetOrderAndHidden, hiddenGroupNames, addFolder, renameFolder, deleteFolder,
  toggleInFolder, moveInFolder, folderOf, groupKey, folderKey, isLocked, toggleLocked, lockedGroupNames,
} from './cats.js';
import { initNav, pushLayer, popLayer, topLayer } from './nav.js';
import { nativePlugin as getNativePlugin } from './bridge.js';
import { $, $$, icon, toast, logo, openSheet, openPage, fmtAgo } from './ui.js';
import { marquee } from './marquee.js';
import { holeClip } from './hole.js';
import { THEMES, DEFAULT_THEME, applyTheme } from './theme.js';
import { initDpad } from './dpad.js';
import { TV_MODES, DEFAULT_TV_MODE, normalizeTvMode, resolveTv } from './tvmode.js';
import { BUFFER_LEVELS, DEFAULT_BUFFER, normalizeBuffer } from './buffer.js';
import { RECONNECT_MODES, STALL_LEVELS, DEFAULT_RECONNECT, DEFAULT_STALL, normalizeReconnect, normalizeStall, retryPolicy } from './retry.js';
import { createPinPad } from './lockui.js';
import { createCastUI } from './cast-ui.js';
import { clampDelay } from './avsync.js';
import { AFTER_OPTIONS, DEFAULT_AFTER, MIN_LEN, normalizeAfter, isValidPin, makeRecord, checkPin, emptyFail, registerFail, waitMs, fmtWait, shouldLock } from './lock.js';
import { createMultiEngine, createSlotSupervisor, fitSlots } from './multi.js';
import { checkUpdate, explainError, fmtMB, retry, shouldAutoCheck, versionCodeOf } from './update.js';
import { checkStreamHealth } from './health.js';
import { recordResult, lastResult, pruneHist, hideChannels, restoreChannels, applyHidden, hiddenCount } from './hhist.js';

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
// Yazı boyutu (Ayarlar → Genel ayarlar): tüm metinler rem ile yazıldığından kök ölçek yeter; sabit yükseklikli listeler de ölçeklenir.
const FONT_SCALES = [[90, 'Küçük'], [100, 'Normal'], [115, 'Büyük'], [130, 'Çok büyük'], [150, 'Dev']];
const fontScale = () => {
  const p = Number(store.pref('set.fontScale', 100));
  return p >= 80 && p <= 160 ? p / 100 : 1;
};
const scaled = (n) => Math.round(n * Math.max(1, fontScale()));
function applyFontScale() {
  document.documentElement.style.setProperty('--fs', String(fontScale()));
}
applyFontScale();
applyTheme(store.pref('set.theme', DEFAULT_THEME));
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
  unlocked: new Set(), // şifresi girilmiş kilitli kategoriler (oturum boyunca)
  hiddenAt: null, // uygulama arka plana en son ne zaman gitti
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
engine = nativePlugin ? createNativeEngine(nativePlugin, onEngine, () => normalizeBuffer(store.pref('set.buffer', DEFAULT_BUFFER)), (e) => recEvent(e), () => clampDelay(store.pref('audioDelay', 0))) : createWebEngine({ video, Hls: window.Hls, on: onEngine });
// Yeniden bağlanma davranışı Genel ayarlar › Yayın bağlantısı'ndan okunur (her denemede güncel değer)
const policy = () => retryPolicy({ reconnect: store.pref('set.reconnect', DEFAULT_RECONNECT), stall: store.pref('set.stall', DEFAULT_STALL) });
player = createPlayer({ engine, policy });
const pui = createPlayerUI({
  engine,
  player,
  env: {
    native: !!nativePlugin,
    canRecord: !!engine.rec,
    recStart: (item, maxMs) => engine.rec.start(item.name, maxMs),
    recStop: () => engine.rec.stop(),
    playRecording: (r, ctx) => startPlay(recItem(r), { ctx }),
    canCast: () => !!nativePlugin && !isTvUi(),
    castTo: (st, ctx) => castItem(st.item, st.ep, { startMs: st.pos, ctx, closePlayer: true }),
    epg: (it) => S.epg.nowNext(it),
    shortEpg: (it) => (S.source ? loadShortEpg(S.source, net, it, 4).catch(() => []) : Promise.resolve([])),
    isFav: (it) => !!S.source && store.isFav(S.source.id, it.id),
    toggleFav: (it) => toggleFav(it),
    onEpgSheet: (it) => epgSheet(it),
    pref: (k, d) => store.pref(k, d),
    setPref: (k, v) => store.setPref(k, v),
    previewRect,
    onMiniPlayer: (active) => {
      S.miniplayer = !!active;
      updateMiniPlayerOverlay();
      if (active) setTimeout(layoutPreview, 0);
    },
    onPreviewEnd: () => syncHole(), // önizleme/küçük oynatıcı kapandı: video deliği kapanır
    onPreviewStep: (d) => previewStep(d),
    onClose: () => multiResume(), // tam ekrandan dönünce çoklu ekran kutuları yeniden başlar
    onPreviewBack: (item) => {
      if (item && item.kind === 'live') setPv(item);
      layoutPreview();
    },
  },
});

const miniPlayerOverlay = document.createElement('div');
miniPlayerOverlay.id = 'mini-player-overlay';
miniPlayerOverlay.hidden = true;
miniPlayerOverlay.innerHTML = '<button id="mini-player-expand" aria-label="Oynatıcıyı büyüt"></button><button id="mini-player-close" aria-label="Oynatıcıyı kapat">×</button>';
document.body.appendChild(miniPlayerOverlay);
$('#mini-player-expand').addEventListener('click', () => pui.expand());
$('#mini-player-close').addEventListener('click', async (e) => {
  e.stopPropagation();
  await pui.endPreview();
  multiResume();
});

// İzleme ilerlemesi kaydı (bu cihazda ya da TV'ye gönderilen oynatmada telefon yoklamasından).
function saveProgress(item, ep, pos, dur) {
  if (!S.source) return;
  const e = ep
    ? { id: ep.id, kind: 'episode', name: `${item.name} · ${ep.label}`, logo: item.logo, parent: item.id }
    : { id: item.id, kind: item.kind, name: item.name, logo: item.logo };
  store.setProgress(S.source.id, e, pos, dur);
  S.prog = store.progressAll(S.source.id);
}

player.onProgress((pos, dur, st) => {
  if (!S.source || st.item.kind === 'live' || st.item.kind === 'recording' || st.item.cast) return;
  saveProgress(st.item, st.ep, pos, dur);
});

// Açılamayan canlı kanal işaretlenir; yedek adres oynadıysa asıl kanal da işaretlenir, asıl oynarsa işaret kalkar.
player.on((st) => {
  if (!S.source || !st.item || st.item.kind !== 'live' || st.item.cast || !st.targets) return;
  if (st.status === 'error') {
    if (typeof navigator === 'undefined' || navigator.onLine !== false) markBad(st.item.id, true);
  } else if (st.status === 'playing') {
    const t = st.targets[st.idx];
    markBad(st.item.id, !!(t && t.alt));
  }
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
const isTvUi = () => document.documentElement.classList.contains('tv');
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

function setCatalog(raw) {
  // Gizlenen kanallar tüm görünümlerden (kategori sayıları, arama, rehber, yedek kanal) bir arada kalkar; ham katalog saklanır
  const hid = hiddenMap();
  const cat = hiddenCount(hid) ? { ...raw, live: applyHidden(raw.live, hid) } : raw;
  S.rawCat = raw;
  S.cat = cat;
  S.altIdx = null;
  S.idx = {
    live: new Map(cat.live.map((i) => [i.id, i])),
    movies: new Map(cat.movies.map((i) => [i.id, i])),
    series: new Map(cat.series.map((i) => [i.id, i])),
  };
  S.groups = { live: groupList(cat.live), movie: groupList(cat.movies), series: groupList(cat.series) };
  pruneGroups();
}

// Oynatma adresleri; canlı kanalda aynı adlı kanallar yedek olarak sona eklenir.
function targetsOf(item, ep) {
  if (item.kind !== 'live') return playTargets(S.source, item, ep);
  if (!setting('altCh')) return playTargets(S.source, item, ep); // Genel ayarlar: yedek kanal denemesi kapalı
  if (!S.altIdx) S.altIdx = buildAltIndex(S.cat.live);
  return playTargets(S.source, item, ep, altsOf(S.altIdx, item));
}

// Çalışmayan kanal işareti: son 7 günde açılamayan kanallar listede "Çalışmıyor olabilir" görünür; açılınca kalkar.
const BAD_TTL = 7 * 86400000;
const badKey = () => 'bad.' + sid();
// Gizlenen kanallar (Yayın kalitesi › çalışmayanları gizle): katalog yüklenirken süzülür; { kanalNo: ad }
const hiddenMap = () => store.pref('hidch.' + sid(), {}) || {};
const histKey = () => 'hhist.' + sid();
const isBad = (id) => {
  const t = (store.pref(badKey(), {}) || {})[id];
  return !!t && Date.now() - t < BAD_TTL;
};
function markBad(id, bad) {
  if (isBad(id) === bad) return;
  const now = Date.now();
  const m = {};
  for (const [k, t] of Object.entries(store.pref(badKey(), {}) || {})) if (now - t < BAD_TTL && k !== id) m[k] = t;
  if (bad) m[id] = now;
  store.setPref(badKey(), m);
  if (S.list && TAB_KIND[S.tab]) S.list.refreshRows();
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
    if (S.tab !== 'multi') renderTab(); // çoklu ekranda yayınlar kesilmesin
    banner(cat.warnings.length ? cat.warnings[0] : null, { err: cat.warnings.length > 0 });
    if (!quiet) toast(`${cat.live.length} kanal · ${cat.movies.length} film · ${cat.series.length} dizi`);
    maybeRefreshEpg(true);
  } catch (e) {
    banner(`Liste alınamadı: ${e.message}`, { err: true });
    if (S.tab !== 'sources' && S.tab !== 'multi') renderTab();
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
  $('#src-name').textContent = S.source ? S.source.name : 'Iptv Player Pro';
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
  if (S.tab !== 'multi' && M.on) multiStop();
  if (!split && !S.miniplayer && (pui.isPreviewing() || S.pv)) {
    pui.endPreview().then(syncHole);
    S.pv = null;
  }
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  document.body.classList.toggle('on-home', S.tab === 'home' && !!S.source);
  document.body.classList.toggle('multi-full', S.tab === 'multi' && !!S.source);
  const browse = S.tab === 'live' || S.tab === 'movies' || S.tab === 'series';
  $('#btn-search').hidden = !(browse || S.tab === 'favs');
  $('#btn-refresh').hidden = !S.source;
  $('#btn-home').hidden = S.tab === 'home';
  $('#crumb').hidden = $('#crumb-sort').hidden = true; // kategori başlığını yalnız liste sayfası (drawCrumb) açar
  $('#btn-source').hidden = false;
  tickClock();
  if (!S.source) return renderOnboarding(v);
  if (S.tab === 'home') return renderHome(v);
  if (S.tab === 'sources') return renderSources(v);
  if (S.tab === 'favs') return renderFavs(v);
  if (S.tab === 'multi') {
    if (S.miniplayer && !M.on) pui.endPreview(); // çoklu ekran açılırken küçük oynatıcı kapanır (iki yayın birden ses vermesin)
    return renderMulti(v);
  }
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
  return itemsOfGroup(kind, S.group[kind]);
}

function itemsOfGroup(kind, g) {
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
  const prefs = prefsOf(kind);
  const hid = hiddenGroupNames(prefs);
  // Kilitli kategoriler, şifre girilene kadar (oturum boyunca) gizli gibi davranır.
  if (lockEnabled()) for (const n of lockedGroupNames(prefs)) if (!S.unlocked.has(catKey(kind, groupKey(n)))) hid.add(n);
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
  if (!g) return 'Arama sonuçları'; // kategori seçilmeden aranıyor (bölmeli ekranda başlık satırı kategori adı yerine bunu gösterir)
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
  let rows = arrange(categoryBase(kind), prefs).map((r) => ({ ...r, hidden: prefs.hidden.includes(r.id), lockSet: isLocked(prefs, r.id), locked: lockEnabled() && isLocked(prefs, r.id) }));
  if (!S.catEdit) rows = rows.filter((r) => !r.hidden);
  const f = fold(S.catFilter);
  const match = (r) => fold(r.name).includes(f);
  return f ? specials.filter(match).concat(rows.filter(match)) : specials.concat(rows);
}

function catRow(c, i) {
  const folderIc = c.folder ? icon('folder') : '';
  const lockIc = c.locked ? icon('lock') : '';
  if (!S.catEdit || c.special) {
    return `<div class="row cat${c.special ? ' special' : ''}" role="button" tabindex="0" data-i="${i}"><div class="meta"><div class="nm"><span class="mq-i">${lockIc}${folderIc}${esc(c.name)}</span></div></div><span class="n">${c.count}</span><span class="chev" aria-hidden="true">›</span></div>`;
  }
  const move_ = S.catFilter
    ? ''
    : `<button class="act" data-act="top" aria-label="En üste al">${icon('top')}</button><button class="act" data-act="up" aria-label="Yukarı">${icon('up')}</button><button class="act" data-act="down" aria-label="Aşağı">${icon('down')}</button>`;
  return `<div class="row cat edit${c.hidden ? ' hid' : ''}" role="button" tabindex="0" data-i="${i}"><button class="act" data-act="eye" aria-label="${c.hidden ? 'Göster' : 'Gizle'}">${icon(c.hidden ? 'eye-off' : 'eye')}</button><button class="act" data-act="lock" aria-label="${c.lockSet ? 'Kilidi kaldır' : 'Şifreyle kilitle'}">${icon(c.lockSet ? 'lock' : 'lock-open')}</button><div class="meta"><div class="nm"><span class="mq-i">${folderIc}${esc(c.name)}</span></div></div><span class="n">${c.count}</span>${move_}</div>`;
}

function onCatTap(kind, i, ev) {
  const c = S.cats[i];
  if (!c) return;
  if (!S.catEdit || c.special) return c.locked ? ensureUnlocked(kind, c.id).then((ok) => ok && enterGroup(kind, c.id)) : enterGroup(kind, c.id);
  const act = ev.target.closest('[data-act]');
  if (act) {
    if (act.dataset.act === 'lock') return toggleCatLock(kind, c.id);
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

// Kategori içindeyken üst çubukta kaynak adı yerine kategori adı (ve sayı, sırala) görünür; geri oku tektir.
function drawCrumb(kind) {
  const g = S.group[kind];
  $('#crumb').hidden = g == null;
  $('#btn-source').hidden = g != null;
  if (g == null) $('#crumb-sort').hidden = true;
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

const catbarHtml = () => `<div class="catbar" id="catbar" hidden><label class="field catq" id="catq" hidden><input id="cat-q" type="search" placeholder="Kategori ara…" autocomplete="off"></label><button class="btn sm ghost" id="cat-new" hidden>${icon('plus')}Klasör</button><button class="btn sm ghost" id="cat-reset" hidden>Sıfırla</button><button class="btn sm ghost" id="cat-edit">Düzenle</button></div>`;

// Kategori çubuğu (ara, klasör, sırala/gizle): dikey sayfada ve bölmeli ekranın sol bölmesinde aynı.
function wireCatbar(kind) {
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
}

function drawCatbar(kind, mode, all) {
  $('#catbar').hidden = !(mode === 'cats' && all);
  $('#catq').hidden = !(S.groups[kind].length > 8 || S.catFilter);
  $('#cat-new').hidden = $('#cat-reset').hidden = !S.catEdit;
  $('#cat-edit').textContent = S.catEdit ? 'Bitti' : 'Düzenle';
}

function renderBrowse(v, kind) {
  v.innerHTML = `${catbarHtml()}<div id="list"></div><div id="empty" hidden></div>`;
  wireCatbar(kind);
  refreshList();
}

function mountList(kind, mode = 'items') {
  const el = $('#list');
  S.listMode = mode;
  const longPress = (i) => S.items[i] && folderSheet(kind, S.items[i]);
  if (mode === 'cats') {
    S.list = new VirtualList(el, {
      rowH: scaled(56),
      render: (c, i) => catRow(c, i),
      onTap: (i, ev) => onCatTap(kind, i, ev),
    });
  } else if (kind === 'live') {
    S.list = new VirtualList(el, {
      rowH: scaled(64),
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
      cellH: (w, cols) => ((w - 24 - gap * (cols - 1)) / cols) * 1.5 + Math.round(66 * fontScale()), // 66 px = 3 satırlık ad alanı (4,125 rem)
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
  drawCatbar(kind, mode, all);
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
  const rated = kind !== 'live' && (S.cat[CAT_KEY[kind]] || []).some((i) => Number(i.rating) > 0); // puan yalnız film/dizide ve listede puan varsa
  const sh = openSheet({
    title: 'Sırala',
    html: SORTS.filter(([k]) => k !== 'rate' || rated).map(([k, label]) => `<button class="list-item" data-s="${k}"><span class="t">${esc(label)}</span>${S.sort[kind] === k ? tick() : ''}</button>`).join('') + hint,
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

// Klasör içi sıra: öğeler yukarı/aşağı ya da en üste taşınır; liste "Varsayılan sıra"da bu sırayla görünür.
function folderOrderSheet(kind, id) {
  const LIMIT = 300;
  openSheet({
    title: 'Sırayı düzenle',
    html: '<p class="hint">Klasördeki sıra, listede “Varsayılan sıra” seçiliyken geçerlidir.</p><div id="fo-list"></div>',
    mount: (body) => {
      const box = $('#fo-list', body);
      const draw = () => {
        const f = folderOf(prefsOf(kind), id);
        const items = folderItems(kind, f);
        box.innerHTML = items.slice(0, LIMIT).map((it, i) => `<div class="rec-row fo-row" data-id="${esc(it.id)}"><div class="rec-play"><span class="t">${i + 1}. ${esc(it.name)}</span></div><button class="act" data-m="top" aria-label="En üste al">${icon('top')}</button><button class="act" data-m="up" aria-label="Yukarı">${icon('up')}</button><button class="act" data-m="down" aria-label="Aşağı">${icon('down')}</button></div>`).join('') + (items.length > LIMIT ? `<p class="hint">İlk ${LIMIT} öğe gösteriliyor.</p>` : '');
      };
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-m]');
        const row = b && b.closest('[data-id]');
        if (!row) return;
        savePrefs(kind, moveInFolder(prefsOf(kind), id, row.dataset.id, b.dataset.m));
        draw();
        const again = box.querySelector(`[data-id="${CSS.escape(row.dataset.id)}"] [data-m="${b.dataset.m}"]`);
        if (again && document.documentElement.classList.contains('kbd')) again.focus(); // kumandada odak taşınan satırın aynı düğmesinde kalır
        if (S.list && TAB_KIND[S.tab] === kind) refreshList(true);
      });
      draw();
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
        body.innerHTML = `<p class="hint">${f.items.length} öğe</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="fm-ord"${f.items.length > 1 ? '' : ' disabled'}>${icon('sort')}Sırayı düzenle</button><button class="btn" id="fm-ren">Yeniden adlandır</button><button class="btn ghost danger" id="fm-del">${icon('trash')}Klasörü sil</button></div>`;
        $('#fm-ord', body).addEventListener('click', () => {
          sh.close();
          folderOrderSheet(kind, id);
        });
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
  const bad = isBad(it.id);
  const sub = bad ? 'Çalışmıyor olabilir' : nn.now ? nn.now.t : it.group || '';
  const sel = split && S.pv && S.pv.id === it.id;
  const num = split && setting('numbers') ? `<span class="num">${it.num || i + 1}</span>` : '';
  return `<div class="row${sel ? ' sel' : ''}${bad ? ' bad' : ''}" role="button" tabindex="0" data-i="${i}">${num}${logo(it.logo, it.name)}<div class="meta"><div class="nm"><span class="mq-i">${esc(it.name)}</span></div><div class="sub"><span class="mq-i">${esc(sub)}</span></div>${nn.now ? `<div class="bar"><i style="width:${Math.round(nn.progress * 100)}%"></i></div>` : ''}</div><button class="act ${fav ? 'on' : ''}" data-fav aria-label="Favori">${icon(fav ? 'star-on' : 'star')}</button><button class="act" data-epg aria-label="Program rehberi">${icon('list')}</button></div>`;
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
  const spq = $('#sp-q');
  if (spq) spq.value = '';
  $('#searchbar').hidden = true;
  if (!keepList && had && S.list) refreshList();
}
function openSearch() {
  $('#searchbar').hidden = false;
  qEl.focus();
}
// Üstteki arama: kategori içindeyken o kategoride, değilse tüm içerikte (canlı, film, dizi; tüm kategoriler) arar.
$('#btn-search').addEventListener('click', () => {
  const k = TAB_KIND[S.tab];
  if (k && !S.split && S.group[k] != null) return openSearch();
  globalSearch();
});
$('#crumb-sort').addEventListener('click', () => sortSheet(S.tab === 'favs' ? S.favKind : TAB_KIND[S.tab]));
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
  const isRec = item.kind === 'recording'; // cihazdaki kayıt: yerel dosya, kaynaktan bağımsız
  const targets = isRec ? [{ url: item.url, mime: 'auto' }] : targetsOf(item, ep);
  if (!targets.length) return toast('Bu içerik için oynatma adresi bulunamadı');
  if (item.kind !== 'series' && !isRec) store.pushRecent(sid(), item);
  let at = startAt;
  if (isRec) at = 0;
  else if (at == null) {
    const p = store.progress(sid(), ep ? ep.id : item.id);
    at = p && p.pos > 0 ? Math.max(0, p.pos - 3000) : 0;
  }
  pui.open(item, targets, { ep, startAt: item.kind === 'live' ? 0 : at, ctx });
}

// ---- planlananlar: program hatırlatıcıları ve zamanlı kayıtlar ----
// Liste cihazda saklanır; Android'de alarmlar ve kayıt hizmeti uygulama kapalıyken de çalışır, tarayıcıda hatırlatıcılar sayfa açıkken.

const PLANS_KEY = 'plans';
const readPlans = () => activePlans(store.pref(PLANS_KEY, []));
let webTimers = [];

function webRemind(pl) {
  toast(`${pl.title} başlıyor · ${pl.chName}`, 8000);
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(pl.title, { body: `${pl.chName} · ${fmtClock(pl.s)}` });
  } catch {
    /* bildirim açılamadı: ekrandaki ileti yeter */
  }
}

// Yerel alarmları plan listesiyle eşitler; zamanı geçenler tetiklenmiş sayılır ve yerele gönderilmez (yeniden bildirim olmasın).
function syncPlans() {
  const now = Date.now();
  const list = readPlans();
  if (nativePlugin) {
    nativePlugin.planSync({ plans: list.filter((x) => x.at > now) }).catch(() => {});
    return;
  }
  webTimers.forEach(clearTimeout);
  webTimers = list.filter((x) => x.kind === 'rem' && x.at > now && x.at - now < 2147e6).map((x) => setTimeout(() => webRemind(x), x.at - now));
}

function setPlans(list) {
  store.setPref(PLANS_KEY, list);
  syncPlans();
}

// Bildirim izni (Android 13+) yoksa sistem iznini ister; tam zamanlı alarm ayarı Planlananlar ekranında açılır.
async function ensurePlanPermissions() {
  if (!nativePlugin) {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
    } catch {
      /* izin sorulamadı */
    }
    return;
  }
  try {
    const st = await nativePlugin.planStatus();
    if (st && !st.notify) await nativePlugin.planPermissions();
  } catch {
    /* izin durumu okunamadı */
  }
}

const planIdOf = (kind, it, p) => planId(kind, it.id, p.s, sid());

// Programa hatırlatıcı ya da zamanlı kayıt ekler; planı varsa kaldırır. Dönen değer: plan artık var mı.
function togglePlan(kind, it, p) {
  const list = readPlans();
  const id = planIdOf(kind, it, p);
  if (hasPlan(list, id)) {
    setPlans(removePlan(list, id));
    toast(kind === 'rec' ? 'Zamanlı kayıt kaldırıldı' : 'Hatırlatıcı kaldırıldı', 1800);
    return false;
  }
  const now = Date.now();
  let plan;
  if (kind === 'rec') {
    const rt = recordTarget(S.source, it, null);
    if (!rt) {
      toast('Bu kanal zamanlı kayıt için uygun değil (doğrudan TS adresi gerekir)', 3800);
      return false;
    }
    plan = makePlan('rec', it, p, { url: rt.url, headers: rt.headers, src: sid() });
    plan.at = Math.max(plan.at, now + 4000); // süren program: kayıt hemen başlar
    const clash = recConflict(list, plan);
    if (clash) {
      toast(`Aynı saatte başka kayıt var: “${clash.title}” (${clash.chName})`, 4200);
      return false;
    }
  } else {
    plan = makePlan('rem', it, p, { src: sid() });
    plan.at = Math.max(plan.at, now + 3000); // başlamasına 5 dakikadan az kaldıysa hemen haber verir
  }
  setPlans(addPlan(list, plan));
  ensurePlanPermissions();
  toast(kind === 'rec' ? `Kayıt planlandı · ${fmtClock(p.s)} ${p.t || ''}` : `Hatırlatıcı kuruldu · ${fmtClock(p.s)} ${p.t || ''}`, 2600);
  return true;
}

// Arşivden (catch-up) izleme: bitmiş ya da süren programı baştan açar; oynatıcıdaki "Canlıya dön" kanala geçirir.
function playArchive(it, p) {
  const tz = (S.cat.account && S.cat.account.timezone) || '';
  const targets = archiveTargets(S.source, it, p, tz);
  if (!targets.length) return toast('Bu kanalda arşiv (geriye dönük izleme) yok');
  const item = { id: `arc:${it.id}:${p.s}`, kind: 'recording', name: `${it.name} · ${p.t || 'Program'}`, logo: it.logo };
  const ctx = { items: [it], index: 0, play: (x) => startPlay(x, { ctx: { items: [x], index: 0, play: ctx.play } }) };
  pui.open(item, targets, { ep: null, startAt: 0, ctx });
}

// Bildirime dokununca ilgili kanal açılır (kaynak başkaysa önce o kaynağa geçilir).
async function openPlanChannel(chId, srcId) {
  if (!chId) return;
  if (srcId && srcId !== sid() && store.sources().some((x) => x.id === srcId)) await activate(srcId);
  for (let i = 0; i < 32 && !S.idx.live.has(chId); i++) await new Promise((r) => setTimeout(r, 250)); // açılışta liste yüklenirken bekle
  const it = S.idx.live.get(chId);
  if (it) playLive([it], 0);
  else toast('Kanal bulunamadı');
}

// ---- ayrıntı sayfaları (tam ekran): film ve dizi ----

const posterOf = (it) => (it.logo ? `<img src="${esc(it.logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : esc(it.name.slice(0, 2).toUpperCase()));
const chipsOf = (parts) => parts.filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('');
const factsOf = (rows) => rows.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
const yearOf = (y) => (y ? String(y).slice(0, 4) : '');
const starsOf = (r) => (r ? `★ ${r}` : '');

function openMovie(it) {
  const p = store.progress(sid(), it.id);
  const resumeTxt = p ? `Devam et · ${fmtDuration(p.pos)}` : 'Oynat';
  return openPage({
    cls: 'dt-pg',
    html: `<div class="dt"><div class="dt-pos">${posterOf(it)}</div><div class="dt-head"><h1 class="dt-t">${esc(it.name)}</h1><div class="dt-m" id="mv-meta">${chipsOf([it.group, starsOf(it.rating)])}</div><div class="dt-btns"><button class="btn lg" id="mv-play">${icon('play')}${esc(resumeTxt)}</button>${p ? '<button class="btn ghost" id="mv-start">Baştan başlat</button>' : ''}<button class="btn ghost" id="mv-fav">${icon(isFav(it) ? 'star-on' : 'star')}Favori</button>${nativePlugin && !isTvUi() ? `<button class="btn ghost" id="mv-cast">${icon('cast')}TV’de oynat</button>` : ''}<button class="btn ghost" id="mv-fold">${icon('folder')}Klasör</button></div></div><div class="dt-body"><h2>Film hakkında</h2><p class="dt-plot" id="mv-plot"><span class="dt-load">Yükleniyor…</span></p><dl class="dt-facts" id="mv-facts"></dl></div></div>`,
    mount: (body) => {
      $('#mv-play', body).addEventListener('click', () => startPlay(it));
      const st = $('#mv-start', body);
      if (st) st.addEventListener('click', () => startPlay(it, { startAt: 0 }));
      const cb = $('#mv-cast', body);
      if (cb) cb.addEventListener('click', () => castItem(it, null, { startMs: p && p.pos > 0 ? Math.max(0, p.pos - 3000) : 0 }));
      $('#mv-fold', body).addEventListener('click', () => folderSheet('movie', it));
      $('#mv-fav', body).addEventListener('click', () => {
        toggleFav(it);
        $('#mv-fav', body).innerHTML = icon(isFav(it) ? 'star-on' : 'star') + 'Favori';
      });
      const plot = $('#mv-plot', body);
      loadVodInfo(S.source, net, it)
        .then((info) => {
          if (!info) {
            plot.textContent = it.plot || 'Bu kaynak film özeti sağlamıyor.';
            return;
          }
          plot.textContent = info.plot || it.plot || 'Bu film için özet bulunamadı.';
          $('#mv-meta', body).innerHTML = chipsOf([it.group, yearOf(info.year), info.genre, info.durationSec && `${Math.round(info.durationSec / 60)} dk`, starsOf(info.rating || it.rating)]);
          $('#mv-facts', body).innerHTML = factsOf([['Yönetmen', info.director], ['Oyuncular', info.cast], ['Ülke', info.country], ['Yayın tarihi', info.year]]);
        })
        .catch(() => {
          plot.textContent = 'Özet alınamadı.';
        });
    },
  });
}

function openSeries(it) {
  return openPage({
    cls: 'dt-pg',
    html: '<div class="empty"><div class="spinner" style="border-color:#fff3;border-top-color:var(--accent)"></div></div>',
    mount: async (body) => {
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
      const plotText = info.plot || it.plot || '';
      const draw = () => {
        const p = progressOf(it);
        const cont = p ? all.find((x) => x.id === p.id) : null;
        const seasons = info.seasons.map((s) => `<button class="chip ${s.season === season ? 'on' : ''}" data-s="${s.season}">Sezon ${s.season}</button>`).join('');
        const eps = info.seasons.find((s) => s.season === season).episodes;
        const rows = eps
          .map((e) => {
            const pr = S.prog[e.id];
            const pct = pr && pr.dur > 0 ? Math.round((pr.pos / pr.dur) * 100) : 0;
            return `<button class="epi" data-ep="${esc(e.id)}"><b>${e.episodeNum}</b><span class="t">${esc(e.title)}${e.durationSec ? `<small>${Math.round(e.durationSec / 60)} dk</small>` : ''}${pct ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}</span>${icon('play')}</button>`;
          })
          .join('');
        const scroll = body.scrollTop;
        body.innerHTML = `<div class="dt"><div class="dt-pos">${posterOf(it)}</div><div class="dt-head"><h1 class="dt-t">${esc(it.name)}</h1><div class="dt-m">${chipsOf([it.group, info.genre, yearOf(info.year), starsOf(info.rating || it.rating), `${info.seasons.length} sezon`])}</div><div class="dt-btns">${cont ? `<button class="btn lg" id="sr-cont">${icon('play')}Devam et · ${esc(cont.label.split(' · ')[0])}</button>` : `<button class="btn lg" id="sr-first">${icon('play')}İlk bölümü oynat</button>`}<button class="btn ghost" id="sr-fav">${icon(isFav(it) ? 'star-on' : 'star')}Favori</button><button class="btn ghost" id="sr-fold">${icon('folder')}Klasör</button></div></div><div class="dt-body"><h2>Dizi hakkında</h2><p class="dt-plot">${esc(plotText || 'Bu dizi için özet bulunamadı.')}</p><dl class="dt-facts">${factsOf([['Yönetmen', info.director], ['Oyuncular', info.cast]])}</dl><div class="dt-eps"><div class="chips">${seasons}</div>${rows}</div></div></div>`;
        body.scrollTop = scroll;
        const c = $('#sr-cont', body);
        if (c) c.addEventListener('click', () => play(cont));
        const f = $('#sr-first', body);
        if (f) f.addEventListener('click', () => play(all[0]));
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
      draw();
    },
  });
}

// ------------------------------------------------------------------ rehber sayfası

async function epgSheet(it) {
  const sh = openSheet({ title: it.name, html: '<div class="empty">Yükleniyor…</div>' });
  const now = Date.now();
  // Arşivli kanalda geçmiş günlerin programları da gelir (yalnız Xtream); rehberdeki programlarla birleştirilir.
  const arcP = it.archive && S.source.type === 'xtream' ? loadArchiveEpg(S.source, net, it).catch(() => []) : Promise.resolve([]);
  let list = S.epg.listFor(it).filter((p) => p.e > now - 30 * 60000);
  if (!list.length) {
    try {
      list = (await loadShortEpg(S.source, net, it, 8)).filter((p) => p.e > now);
    } catch {
      /* rehber yok */
    }
  }
  const body = sh.body;
  const mergeArchive = (arc) => {
    const have = new Map(list.map((p) => [p.s, p]));
    for (const a of arc) {
      const cur = have.get(a.s);
      if (cur) cur.archive = a.archive;
      else {
        const n = { ...a };
        list.push(n);
        have.set(a.s, n);
      }
    }
    list.sort((a, b) => a.s - b.s);
  };
  if (!list.length) mergeArchive(await arcP);
  if (!list.length) {
    body.innerHTML = emptyHtml('Program bilgisi yok', S.source.type === 'xtream' || S.cat.epgUrls.length || S.source.epgUrl ? 'Bu kanal için rehberde program bulunamadı.' : 'Bu kaynakta TV rehberi adresi yok. Kaynaklar sekmesinden bir XMLTV adresi ekleyebilirsiniz.');
    return;
  }
  // Programları yerel takvim günlerine ayır; tarih seçimi kumanda ve dokunmatik ile kullanılabilir.
  const dayKey = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  let days = [];
  let selected = null;
  const plan = () => {
    days = [...new Set(list.map((p) => dayKey(p.s)))].sort();
    if (!selected || !days.includes(selected)) selected = days.find((d) => d === dayKey(now)) || days[0];
  };
  plan();
  const draw = () => {
    const dayList = list.filter((p) => dayKey(p.s) === selected).sort((a, b) => a.s - b.s);
    const tabs = days.map((d) => {
      const date = new Date(d + 'T12:00:00');
      const label = dayKey(now) === d ? 'Bugün' : date.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
      return `<button class="chip ${selected === d ? 'on' : ''}" data-day="${d}">${esc(label)}</button>`;
    }).join('');
    const plans = readPlans();
    body.innerHTML = `<div class="chips epg-days" role="group" aria-label="Program günü">${tabs}</div><div class="epg-schedule">${dayList.length ? dayList.map((p) => {
      const active = p.s <= now && p.e > now;
      const past = p.e <= now;
      const mark = hasPlan(plans, planIdOf('rec', it, p)) ? `<span class="epg-mark" title="Kayıt planlı">${icon('rec')}</span>` : hasPlan(plans, planIdOf('rem', it, p)) ? `<span class="epg-mark" title="Hatırlatıcı">${icon('bell')}</span>` : p.archive && past ? `<span class="epg-mark" title="Arşivden izlenebilir">${icon('history')}</span>` : '';
      return `<div class="prog-row tap ${active ? 'now' : ''}${past ? ' past' : ''}" role="button" tabindex="0" data-s="${p.s}"><time>${fmtClock(p.s)}</time><div><b>${esc(p.t)}</b>${p.d ? `<small>${esc(p.d)}</small>` : ''}</div>${active ? '<span class="epg-live">ŞİMDİ</span>' : ''}${mark}</div>`;
    }).join('') : '<div class="empty">Bu gün için program bilgisi yok.</div>'}</div>`;
  };
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (b) {
      selected = b.dataset.day;
      return draw();
    }
    const row = e.target.closest('.prog-row[data-s]');
    const p = row && list.find((x) => x.s === Number(row.dataset.s));
    if (p) guideProgramSheet(it, p, [it], 0, { noDay: true, onChange: draw });
  });
  draw();
  if (list.length) arcP.then((arc) => {
    if (!arc.length || !body.isConnected) return;
    mergeArchive(arc);
    plan();
    draw();
  });
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
  S.items = sortItems(store.favs(sid()).filter((f) => f.kind === kind).map((f) => resolve(f, kind)).filter(Boolean), S.sort[kind]);
  $('#crumb-sort').hidden = false; // favorilerde de üst çubuktaki sırala düğmesi çalışır
  $('#crumb-sort').classList.toggle('on', S.sort[kind] !== 'default');
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
  const grid = `<div class="set-grid"><button class="set-tile" data-set="general">${icon('sliders')}<span>Genel ayarlar</span></button><button class="set-tile" data-set="epg">${icon('cal')}<span>TV rehberi (EPG)</span></button><button class="set-tile" data-set="health">${icon('activity')}<span>Yayın kalitesi</span></button><button class="set-tile" data-set="plans">${icon('bell')}<span>Planlananlar</span></button><button class="set-tile" data-set="auto">${icon('timer')}<span>Otomasyon</span></button><button class="set-tile" data-set="news">${icon('info')}<span>Yenilikler</span></button>${nativePlugin ? `<button class="set-tile" data-set="rec">${icon('rec')}<span>Kayıtlar</span></button><button class="set-tile" data-set="cast">${icon('cast')}<span>Telefondan oynat</span></button>` : ''}<button class="set-tile" data-set="update">${icon('refresh')}<span>${upd && upd.status === 'available' ? 'Yeni sürüm var' : 'Güncellemeyi denetle'}</span></button></div>`;
  v.innerHTML = `<div class="page">${grid}<div class="sect">Kaynaklar</div>${cards}<button class="btn" id="src-add">${icon('plus')}Kaynak ekle</button><div class="sect">Diğer</div><button class="btn ghost sm" id="clr-rec">Son izlenenleri temizle</button><p style="color:var(--muted);font-size:.75rem;margin-top:18px">Iptv Player Pro bir yayın hizmeti değildir ve içerik sağlamaz. Yalnızca yasal olarak erişim hakkınız olan kaynakları kullanın.</p><p style="color:var(--muted);font-size:.75rem">Sürüm ${esc(VERSION)}</p></div>`;
  v.addEventListener('click', onSourcesClick);
}

function onSourcesClick(e) {
  const t = e.target.closest('[data-set]');
  if (t) {
    const k = t.dataset.set;
    if (k === 'general') return generalSheet();
    if (k === 'epg') return epgSettingsSheet();
    if (k === 'health') return healthSheet();
    if (k === 'plans') return plansSheet();
    if (k === 'auto') return autoSheet();
    if (k === 'news') return whatsNewSheet(true);
    if (k === 'rec') return recordingsSheet();
    if (k === 'cast') return castUi.receiverSheet();
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


// Ana ekran kısayol kutusunun simgesi; sayı (favori/izleme) yazıyla yarışmasın diye simgenin köşesinde rozet olur.
const miniIc = (name, n) => `<span class="t-ic">${icon(name)}${n ? `<i class="t-n">${n > 99 ? '99+' : n}</i>` : ''}</span>`;
function renderHome(v) {
  const c = S.cat;
  const src = S.source;
  const exp = c.account && c.account.expires ? fmtDate(new Date(c.account.expires), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const cnt = (n, w) => (n ? `${n} ${w}` : '');
  const favN = store.favs(sid()).length;
  const recN = store.recents(sid()).length;
  const who = src.type === 'xtream' ? src.user : src.local ? 'Dosya' : 'M3U';
  const chip = upd && upd.status === 'available' ? `<button class="btn sm" id="h-upd-chip">${icon('refresh')}Yeni sürüm</button>` : '';
  const catN = S.groups.live.length + S.groups.movie.length + S.groups.series.length;
  v.innerHTML = `<div class="home">
    <div class="home-top"><div class="brand">${icon('tv')}<b>Iptv</b><span>Player Pro</span></div>${chip}<div class="home-clock"><b id="h-clock"></b><small id="h-date"></small></div><button class="icon-btn" id="h-search" aria-label="Ara">${icon('search')}</button><button class="icon-btn" id="h-set" aria-label="Ayarlar">${icon('gear')}</button></div>
    <div class="hero"><div class="hero-t"><small>Hoş Geldiniz</small><b>${esc(src.name)}</b><span id="h-upd"></span></div><button class="re" data-refresh aria-label="Listeyi yenile">${icon('refresh')}<span>Yenile</span></button></div>
    <div class="tiles">
      <button class="tile t-live" data-go="live" data-autofocus>${icon('tv')}<b>Canlı TV</b><small>${cnt(c.live.length, 'kanal')}</small></button>
      <button class="tile t-movie" data-go="movies">${icon('movie')}<b>Filmler</b><small>${cnt(c.movies.length, 'film')}</small></button>
      <button class="tile t-series" data-go="series">${icon('series')}<b>Diziler</b><small>${cnt(c.series.length, 'dizi')}</small></button>
      <button class="tile t-cats" data-go="cats">${icon('folder')}<b>Kategoriler</b><small>${cnt(catN, 'kategori')}</small></button>
    </div>
    <div class="shortcuts${nativePlugin ? ' has-rec' : ''}">
      <button class="tile mini t-guide" data-go="guide">${miniIc('guide')}<b>TV Rehberi</b></button>
      <button class="tile mini t-multi" data-go="multi">${miniIc('grid')}<b>Çoklu ekran</b></button>
      <button class="tile mini t-rec" data-go="recent">${miniIc('history', recN)}<b>İzleme listesi</b></button>
      <button class="tile mini t-fav" data-go="favs">${miniIc('star-on', favN)}<b>Favoriler</b></button>
      ${nativePlugin ? `<button class="tile mini t-recs" data-go="rec">${miniIc('rec')}<b>Kayıtlar</b></button>` : ''}
      <button class="tile mini t-set" data-go="sources">${miniIc('gear')}<b>Ayarlar</b></button>
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
    if (t.dataset.go === 'rec') return recordingsSheet();
    if (t.dataset.go === 'cats') return categoriesPage();
    if (t.dataset.go === 'guide') return guidePage();
    setTab(t.dataset.go);
  };
  tickClock();
}

function showRecent() {
  enterGroup('live', '__recent');
}

// ------------------------------------------------------------------ canlı TV: bölmeli ekran (yatay)

let spObs = null;
const shortEpgCache = new Map();

function previewRect() {
  const el = $('#sp-slot');
  if (el && S.split && S.tab === 'live') {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  }
  if (S.miniplayer) {
    const w = Math.min(220, Math.round(window.innerWidth * 0.43));
    const h = Math.round(w * 9 / 16);
    const bottom = S.tab === 'multi' ? 14 : 78;
    return { x: Math.max(8, Math.round(window.innerWidth - w - 12)), y: Math.max(8, Math.round(window.innerHeight - h - bottom)), w, h };
  }
  return null;
}

function updateMiniPlayerOverlay() {
  const el = $('#mini-player-overlay');
  if (!el) return;
  const r = S.miniplayer ? previewRect() : null;
  el.hidden = !r;
  if (r) Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
}

// Android'de önizleme ve çoklu ekran yerel görünümlerde oynar: sayfa saydam, #bgfill video pencereleri dışındaki her yeri örter.
function holeRects() {
  if (M.on && nativePlugin) return multiRects();
  const r = pui.isPreviewing() ? previewRect() : null;
  return r ? [r] : [];
}

function syncHole() {
  const rects = holeRects();
  $('#bgfill').style.clipPath = holeClip(rects);

  // Küçük oynatıcı, yerel Android video yüzeyinin WebView arkasında çizilmesini kullanır.
  // Yalnız #bgfill'i kesmek yetmez: #app içindeki film kartları ve gezinme çubuğu da
  // videonun üstünde kalır. Küçük oynatıcı dikdörtgenini tüm uygulama katmanından çıkar.
  // mini-player-overlay body altında, #app dışında olduğundan genişlet/kapat denetimleri görünür kalır.
  const mini = S.miniplayer && pui.isPreviewing() ? previewRect() : null;
  $('#app').style.clipPath = mini && mini.w > 0 && mini.h > 0 ? holeClip([mini]) : '';
}

function layoutPreview() {
  pui.syncPreview();
  updateMiniPlayerOverlay();
  if (M.on) layoutMulti();
  else syncHole();
}

function renderSplit(v) {
  if (spObs) spObs.disconnect();
  S.catFilter = '';
  S.catEdit = false;
  // Canlı TV her açılışta kategorilerle başlar (S.group.live null); kategoriye girince kanallar sol bölmede listelenir.
  v.innerHTML = `<div class="split" id="split"><section class="sp-left"><div class="sp-cat"><button class="icon-btn" id="sp-prev" aria-label="Önceki kategori">${icon('chev-l')}</button><button class="sp-name" id="sp-name"><span id="sp-name-t"></span><small id="sp-name-n"></small></button><button class="icon-btn" id="sp-next" aria-label="Sonraki kategori">${icon('chev-r')}</button><button class="icon-btn" id="sp-sort" aria-label="Sırala" hidden>${icon('sort')}</button></div><div class="sp-search"><input id="sp-q" type="search" placeholder="Kanal ara…" aria-label="Kanal ara" autocomplete="off" enterkeyhint="search"></div>${catbarHtml()}<div id="list"></div><div id="empty" hidden></div></section><section class="sp-right"><div class="sp-slot" id="sp-slot" role="button" tabindex="0" aria-label="Tam ekran"><div class="sp-status" id="sp-status"></div></div><div class="sp-info" id="sp-info"></div><div class="sp-epg" id="sp-epg"></div></section></div>`;
  $('#sp-prev').addEventListener('click', () => cycleCat(-1));
  $('#sp-next').addEventListener('click', () => cycleCat(1));
  $('#sp-sort').addEventListener('click', () => sortSheet('live'));
  $('#sp-name').addEventListener('click', () => S.group.live != null && leaveGroup('live'));
  $('#sp-slot').addEventListener('click', onSlotTap);
  // Kalıcı kanal arama alanı: yazdıkça tüm canlı kanallarda (kategori seçiliyse onun içinde) arar
  const spq = $('#sp-q');
  spq.value = S.query;
  spq.addEventListener(
    'input',
    debounce(() => {
      S.query = spq.value.trim();
      qEl.value = S.query;
      refreshList();
    }, 150),
  );
  // Bilgi kartındaki eylem düğmeleri (EPG, kanal bilgisi, favori)
  $('#sp-info').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sp]');
    if (!b || !S.pv) return;
    if (b.dataset.sp === 'epg') return epgSheet(S.pv);
    if (b.dataset.sp === 'info') return channelInfoSheet(S.pv);
    if (b.dataset.sp === 'fav') {
      toggleFav(S.pv);
      renderSpInfo();
      const nb = $('[data-sp=fav]');
      if (nb) nb.focus({ preventScroll: true });
    }
  });
  wireCatbar('live');
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
  const mode = browseMode('live');
  if (!S.list || S.listMode !== mode) {
    if (S.list) S.list.destroy();
    mountList('live', mode);
    keepScroll = false;
  }
  const cats = mode === 'cats';
  const all = S.cat.live.length;
  S.items = cats ? [] : currentItems('live');
  S.cats = cats ? categoryRows('live') : [];
  const rows = cats ? S.cats : S.items;
  S.list.setItems(rows, keepScroll);
  $('#sp-prev').hidden = $('#sp-next').hidden = cats;
  const gl = S.group.live;
  $('#sp-sort').hidden = cats || !!S.query || gl === '__recent' || gl === '__cont'; // sıralama: yalnız kategori içinde, aramada ve özel listelerde değil
  $('#sp-sort').classList.toggle('on', S.sort.live !== 'default');
  $('#sp-name').disabled = cats;
  $('#sp-name').setAttribute('aria-label', cats ? 'Kategoriler' : 'Kategorilere dön');
  $('#sp-name-t').textContent = cats ? 'Kategoriler' : groupTitle('live', S.group.live);
  $('#sp-name-n').textContent = cats ? S.groups.live.length : S.items.length;
  drawCatbar('live', mode, all);
  const none = cats ? !all || !rows.length : !rows.length;
  $('#list').hidden = none;
  const empty = $('#empty');
  empty.hidden = !none;
  if (none) fillEmpty(empty, 'live', mode, all);
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
  const targets = targetsOf(it);
  if (!targets.length) return toast('Bu içerik için oynatma adresi bulunamadı');
  store.pushRecent(sid(), it);
  const ctx = { items, index, play: (x, i) => startPlay(x, { ctx: { ...ctx, index: i } }) };
  S.pv = it;
  pui.preview(it, targets, { ctx });
  layoutPreview();
  S.list && S.list.refreshRows();
  renderSpInfo();
}

// Kumandanın kanal +/- tuşları (önizleme): listedeki sonraki/önceki kanalı önizler
function previewStep(d) {
  if (!S.pv || !S.items) return;
  const cur = S.items.findIndex((x) => x.id === S.pv.id);
  const i = cur + d;
  if (cur < 0 || i < 0 || i >= S.items.length) return;
  previewLive(S.items, i);
  S.list && S.list.scrollToIndex(i);
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
  else if (st.status === 'loading' || st.status === 'buffering') el.innerHTML = '<div><div class="spinner"></div>' + (st.reconnect ? `<div class="rc">Yeniden bağlanılıyor… (${st.reconnect})</div>` : '') + '</div>';
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
  const fav = isFav(it);
  info.innerHTML = `<span class="sp-badge">CANLI TV</span><b>${esc(it.name)}</b>${nn.now ? `<span class="sp-now">${esc(nn.now.t)}</span><span class="sp-time">${fmtClock(nn.now.s)} – ${fmtClock(nn.now.e)}</span>` : ''}<div class="sp-acts"><button class="sp-act" data-sp="epg" aria-label="Program rehberi">${icon('list')}<span>EPG</span></button><button class="sp-act" data-sp="info" aria-label="Kanal bilgisi">${icon('info')}<span>Bilgi</span></button><button class="sp-act${fav ? ' on' : ''}" data-sp="fav" aria-label="${fav ? 'Favorilerden çıkar' : 'Favorilere ekle'}">${icon(fav ? 'star-on' : 'star')}<span>${fav ? 'Favori' : 'Ekle'}</span></button></div>`;
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

// Kanal bilgisi: ad, kategori, numara, şimdi/sonra yayın ve yayın sunucusu (kullanıcı adı/parola gösterilmez)
function channelInfoSheet(it) {
  const nn = S.epg.nowNext(it);
  let host = '';
  try {
    const t = playTargets(S.source, it)[0];
    host = t ? new URL(typeof t === 'string' ? t : t.url).host : '';
  } catch {
    /* adres çözülemedi */
  }
  const rows = [['Kategori', it.group], ['Kanal no', it.num], ['Şimdi', nn.now && `${fmtClock(nn.now.s)} · ${nn.now.t}`], ['Sonra', nn.next && `${fmtClock(nn.next.s)} · ${nn.next.t}`], ['Yayın sunucusu', host]];
  openSheet({
    title: 'Kanal bilgisi',
    html: `<div class="ci-head">${logo(it.logo, it.name)}<b>${esc(it.name)}</b></div><dl class="dt-facts ci-facts">${factsOf(rows)}</dl>`,
  });
}

// Kategori geçişi: ‹ › okları komşu kategoriye atlar; ortadaki ada dokununca kategori listesine dönülür.
function cycleCat(d) {
  const rows = categoryRows('live').filter((r) => (!r.special || r.id !== '__recent' || r.count) && (!r.locked || S.unlocked.has(catKey('live', r.id))));
  if (!rows.length || S.group.live == null) return;
  let i = rows.findIndex((r) => r.id === S.group.live);
  i = (i + d + rows.length) % rows.length;
  S.group.live = rows[i].id;
  refreshList();
}

// ------------------------------------------------------------------ çoklu ekran

// Aynı anda 2 ya da 4 canlı kanal; her kutu kendi oynatıcısında oynar, yalnız seçili kutu sesli.
const M = { on: false, suspended: false, n: 2, sound: 0, fill: true, slots: [], eng: null, obs: null, hideTimer: 0 };
const MAX_SLOTS = 4;

const multiIdsKey = () => 'multi.ids.' + sid();
const cellEl = (i) => $(`.mp-cell[data-c="${i}"]`);
const mpCount = () => M.n;

function multiRects() {
  const out = [];
  for (let i = 0; i < M.n; i++) {
    const sl = M.slots[i];
    const v = sl && sl.item && cellEl(i) ? $('.mp-vid', cellEl(i)) : null;
    if (!v) continue;
    const r = v.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out.push({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), slot: i });
  }
  return out;
}

function layoutMulti() {
  if (!M.on || !M.eng) return;
  if (nativePlugin) for (const r of multiRects()) M.eng.rect(r.slot, r).catch(() => {});
  syncHole();
}

// Takılan ya da kopan kutu hızla yeniden bağlanır (tek oynatıcıdaki gibi); art arda başarısızsa yedek adrese geçilir.
const SUP = createSlotSupervisor({
  policy,
  restart: (i, rotate) => {
    const sl = M.slots[i];
    if (!sl || !sl.item || !M.on || M.suspended) return;
    if (rotate && sl.targets.length > 1) sl.idx = (sl.idx + 1) % sl.targets.length;
    multiStart(i);
  },
  status: (i, status, msg, attempt) => {
    const sl = M.slots[i];
    if (!sl || !sl.item || !M.on) return;
    sl.status = status;
    sl.msg = msg || '';
    sl.attempt = attempt || 0;
    drawCell(i);
  },
});

function multiEvent({ slot, state, message, has, supported, info }) {
  const sl = M.slots[slot];
  if (!sl || !sl.item || !M.on || M.suspended) return;
  SUP.event(slot, state, message, { has, supported, info });
}

function multiStart(i) {
  const sl = M.slots[i];
  const host = cellEl(i);
  if (!sl || !sl.item || !host || !M.on) return;
  sl.status = 'loading';
  sl.msg = '';
  drawCell(i);
  SUP.begin(i, sl.targets.length);
  const vid = $('.mp-vid', host);
  const r = vid.getBoundingClientRect();
  const rect = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  M.eng.start(i, sl.targets[sl.idx], { rect, muted: i !== M.sound, host: vid, fill: M.fill }).catch((e) => multiEvent({ slot: i, state: 'error', message: e && e.message }));
  syncHole();
}

function multiStop() {
  clearTimeout(M.hideTimer);
  M.on = false;
  M.suspended = false;
  if (M.obs) M.obs.disconnect();
  M.obs = null;
  SUP.clearAll();
  if (M.eng) M.eng.stopAll().catch(() => {});
  document.documentElement.classList.remove('native-preview', 'native-multi');
  $('#bgfill').style.clipPath = '';
}

// Tam ekran oynatıcı açılırken ya da uygulama arka plana geçince kutular durdurulur (kanal seçimleri kalır).
function multiSuspend() {
  if (!M.on || M.suspended) return;
  M.suspended = true;
  SUP.clearAll();
  if (M.eng) M.eng.stopAll().catch(() => {});
  for (const sl of M.slots) if (sl && sl.item) sl.status = 'idle';
  document.documentElement.classList.remove('native-preview', 'native-multi');
  $('#bgfill').style.clipPath = '';
}

function multiResume() {
  if (!M.on || !M.suspended || S.tab !== 'multi') return;
  M.suspended = false;
  document.documentElement.classList.toggle('native-preview', !!nativePlugin);
  document.documentElement.classList.toggle('native-multi', !!nativePlugin);
  M.slots.slice(0, M.n).forEach((sl, i) => sl && sl.item && multiStart(i));
}

function persistMulti() {
  store.setPref(multiIdsKey(), M.slots.map((sl) => (sl && sl.item ? sl.item.id : null)));
}

function setSound(i) {
  M.sound = i;
  for (let j = 0; j < M.n; j++) {
    if (M.slots[j] && M.slots[j].item) M.eng.mute(j, j !== i).catch(() => {});
    drawCell(j);
  }
}

function firstFilled() {
  const i = M.slots.slice(0, M.n).findIndex((sl) => sl && sl.item);
  return i < 0 ? 0 : i;
}

function multiAssign(i, item) {
  const targets = targetsOf(item);
  if (!targets.length) return toast('Bu içerik için oynatma adresi bulunamadı');
  const hadSound = M.slots[M.sound] && M.slots[M.sound].item;
  SUP.clear(i);
  M.slots[i] = { item, targets, idx: 0, status: 'loading', msg: '', attempt: 0 };
  if (!hadSound) M.sound = i;
  persistMulti();
  multiStart(i);
  for (let j = 0; j < M.n; j++) drawCell(j);
}

function multiRemove(i) {
  SUP.clear(i);
  M.eng.stop(i).catch(() => {});
  M.slots[i] = null;
  if (M.sound === i) M.sound = firstFilled();
  persistMulti();
  for (let j = 0; j < M.n; j++) drawCell(j);
  syncHole();
}

function multiFull(i) {
  const items = M.slots.slice(0, M.n).filter((sl) => sl && sl.item).map((sl) => sl.item);
  const index = items.findIndex((it) => it.id === M.slots[i].item.id);
  multiSuspend();
  playLive(items, Math.max(0, index));
}

function drawCell(i) {
  const el = cellEl(i);
  if (!el) return;
  const sl = M.slots[i];
  const has = !!(sl && sl.item);
  el.classList.toggle('has', has);
  el.classList.toggle('snd', has && i === M.sound);
  const ovl = $('.mp-ovl', el);
  if (!has) {
    ovl.innerHTML = `<div class="mp-add">${icon('plus')}<span>Kanal ekle</span></div>`;
    return;
  }
  const wait = sl.status === 'loading' || sl.status === 'buffering';
  const st = sl.status === 'error' ? `<div class="mp-st"><span>${esc(sl.msg)}<br><small>Yeniden denemek için dokunun</small></span></div>` : wait ? `<div class="mp-st"><div><div class="spinner"></div>${sl.attempt ? `<div class="rc">Yeniden bağlanılıyor… (${sl.attempt})</div>` : ''}</div></div>` : '';
  ovl.innerHTML = `${st}<div class="mp-top"><span class="mp-snd${i === M.sound ? ' on' : ''}">${icon(i === M.sound ? 'audio' : 'mute')}</span><span class="mp-act"><button data-act="swap" aria-label="Kanalı değiştir">${icon('list')}</button><button data-act="full" aria-label="Tam ekran">${icon('aspect')}</button><button data-act="rm" aria-label="Kaldır">${icon('close')}</button></span></div><div class="mp-name"><span class="mq-i">${esc(sl.item.name)}</span></div>`;
  marquee(ovl);
}

function renderMulti(v) {
  multiStop();
  S.items = [];
  M.n = store.pref('multi.n', 2) === 4 ? 4 : 2;
  const ids = fitSlots(store.pref(multiIdsKey(), []), MAX_SLOTS);
  M.slots = ids.map((id) => {
    const item = id ? S.idx.live.get(id) : null;
    const targets = item ? targetsOf(item) : [];
    return item && targets.length ? { item, targets, idx: 0, status: 'idle', msg: '', attempt: 0 } : null;
  });
  if (!M.slots[M.sound] || M.sound >= M.n) M.sound = firstFilled();
  if (!M.eng) M.eng = createMultiEngine({ native: nativePlugin, Hls: window.Hls, on: multiEvent });
  // Çoklu ekranda yayın oranını koru: portre kutularda yatay görüntüyü kırpma.
  M.fill = false;
  // Tüm ekranı kaplar: üst çubuk ve alt sekmeler gizlenir (body.multi-full); denetimler kısa süre sonra kaybolan düğmelerdir.
  v.innerHTML = `<div class="mp"><div class="mp-grid n${M.n}${M.fill ? ' fill' : ''}" id="mp-grid">${Array.from({ length: M.n }, (_, i) => `<div class="mp-cell" data-c="${i}" role="button" tabindex="0"><div class="mp-vid"></div><div class="mp-ovl"></div></div>`).join('')}</div><div class="mp-chips" id="mp-chips"><button class="mp-chip" id="mp-back" aria-label="Ana ekran">${icon('back')}</button><div class="mp-n" id="mp-n"><button data-n="2" aria-label="2 kutu">2</button><button data-n="4" aria-label="4 kutu">4</button></div><button class="mp-chip txt" id="mp-fit"></button></div></div>`;
  const mark = () => {
    $$('#mp-n button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === M.n));
    $('#mp-fit').textContent = M.fill ? 'Doldur' : 'Sığdır';
    $('#mp-fit').setAttribute('aria-label', M.fill ? 'Görüntü dolduruyor; sığdırmak için dokunun' : 'Görüntü sığdırılıyor; doldurmak için dokunun');
  };
  mark();
  const chips = $('#mp-chips');
  const showChips = () => {
    const root = $('.mp');
    chips.classList.remove('idle');
    root.classList.remove('controls-idle');
    $$( '.mp-top', root).forEach((el) => { el.classList.remove('mp-hidden'); });
    clearTimeout(M.hideTimer);
    M.hideTimer = setTimeout(() => {
      chips.classList.add('idle');
      root.classList.add('controls-idle');
      $$( '.mp-top', root).forEach((el) => { el.classList.add('mp-hidden'); });
    }, 2000);
  };
  showChips();
  // Dokunuş bittikten sonra göster: basarken görünürlerse altındaki düğmenin üstünü örter ve tıklama kaybolur.
  $('.mp').addEventListener('pointerdown', showChips, true);
  $('.mp').addEventListener('touchstart', showChips, { capture: true, passive: true });
  $('.mp').addEventListener('click', showChips, true);
  $('.mp').addEventListener('keydown', showChips, true); // kumandayla odak alt düğmelere geçince görünür kalsın
  $('.mp').addEventListener('focusin', showChips); // odak düğmeye tuşsuz da gelse (örn. kumanda imleci) gizlenmiş denetimler görünür
  $('#mp-back').addEventListener('click', () => setTab('home'));
  $('#mp-fit').addEventListener('click', () => {
    M.fill = !M.fill;
    store.setPref('multi.fill', M.fill);
    $('#mp-grid').classList.toggle('fill', M.fill);
    M.eng.fit(M.fill).catch(() => {});
    mark();
  });
  $('#mp-n').addEventListener('click', (e) => {
    const b = e.target.closest('[data-n]');
    if (!b || Number(b.dataset.n) === M.n) return;
    store.setPref('multi.n', Number(b.dataset.n));
    renderMulti(v);
  });
  $('#mp-grid').addEventListener('click', (e) => {
    const cell = e.target.closest('[data-c]');
    if (!cell) return;
    const i = Number(cell.dataset.c);
    const sl = M.slots[i];
    const act = e.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'rm') return multiRemove(i);
      if (act.dataset.act === 'swap') return channelPicker((it) => multiAssign(i, it));
      if (act.dataset.act === 'full') return multiFull(i);
    }
    if (!sl || !sl.item) return channelPicker((it) => multiAssign(i, it));
    if (sl.status === 'error') {
      SUP.clear(i); // elle yeniden deneme: sayaç baştan
      return multiStart(i);
    }
    if (i !== M.sound) setSound(i);
  });
  M.on = true;
  document.documentElement.classList.toggle('native-preview', !!nativePlugin);
  document.documentElement.classList.toggle('native-multi', !!nativePlugin);
  for (let i = 0; i < M.n; i++) drawCell(i);
  if (window.ResizeObserver) {
    M.obs = new ResizeObserver(() => layoutMulti());
    M.obs.observe($('#mp-grid'));
  }
  M.slots.slice(0, M.n).forEach((sl, i) => sl && multiStart(i));
  layoutMulti();
}

// Sayfayı kapatır, geçmiş geri alındıktan sonra işi yapar: kapanışı beklemeden yeni katman (sekme, kategori, oynatıcı)
// açılırsa, geri alma olayı onları da kapatırdı.
function closeThen(api, fn) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', run);
    fn();
  };
  window.addEventListener('popstate', run); // nav.js'in kendi dinleyicisi önce çalışır: katmanlar zaten kapanmıştır
  setTimeout(run, 600);
  api.close();
}

// Kanal seçici: kategori ve arama ile süzülen tam ekran liste (on binlerce kanal için sanal liste).
function channelPicker(onPick, { guide = false } = {}) {
  openPage({
    title: guide ? 'TV Rehberi (EPG)' : 'Kanal seç',
    cls: 'pk-pg',
    html: '<div class="pk-bar"><select id="pk-cat" aria-label="Kategori"></select><input id="pk-q" type="search" placeholder="Kanal ara…" autocomplete="off"></div><div id="pk-list"></div>',
    mount: (body, api) => {
      const sel = $('#pk-cat', body);
      const q = $('#pk-q', body);
      const rows = categoryRows('live').filter((r) => r.id !== '__recent' || r.count);
      sel.innerHTML = rows.map((r) => `<option value="${esc(r.id)}">${esc(r.name)} (${r.count})</option>`).join('');
      let items = [];
      // Rehber kipinde her satır şimdi/sonra yayınlananı gösterir
      const guideRow = (it, i) => {
        const nn = S.epg.nowNext(it);
        const now = nn.now ? `${fmtClock(nn.now.s)} · ${nn.now.t}` : 'Program bilgisi yok';
        const next = nn.next ? `Sonra ${fmtClock(nn.next.s)} · ${nn.next.t}` : '';
        return `<div class="row gd" role="button" tabindex="0" data-i="${i}">${logo(it.logo, it.name)}<div class="meta"><div class="nm"><span class="mq-i">${esc(it.name)}</span></div><div class="sub"><span class="mq-i">${esc(now)}</span></div>${nn.now ? `<div class="bar"><i style="width:${Math.round(nn.progress * 100)}%"></i></div>` : ''}${next ? `<div class="sub nx"><span class="mq-i">${esc(next)}</span></div>` : ''}</div></div>`;
      };
      const list = new VirtualList($('#pk-list', body), {
        rowH: scaled(guide ? 88 : 60),
        render: guide
          ? guideRow
          : (it, i) => `<div class="row" role="button" tabindex="0" data-i="${i}">${logo(it.logo, it.name)}<div class="meta"><div class="nm"><span class="mq-i">${esc(it.name)}</span></div><div class="sub"><span class="mq-i">${esc(it.group || '')}</span></div></div></div>`,
        onTap: (i) => {
          const it = items[i];
          if (!it) return;
          if (guide) return closeThen(api, () => onPick(it, i, items));
          api.close();
          onPick(it, i, items);
        },
      });
      const draw = () => {
        const base = itemsOfGroup('live', sel.value);
        items = q.value.trim() ? search(base, q.value, 500) : base;
        list.setItems(items);
      };
      sel.addEventListener('change', draw);
      q.addEventListener('input', debounce(draw, 120));
      draw();
    },
  });
}

// TV rehberi: önce kategoriler; kategori seçilince kanallar zaman çizelgesinde görünür
// (sabit kanal sütunu, yarım saatlik zaman cetveli, süresine göre program blokları, "şimdi" çizgisi).
const GUIDE_SPAN = 24 * 60; // çizelgenin kapsadığı süre (dk)
const GUIDE_STEP = 30; // cetvel aralığı (dk)
const GUIDE_CHUNK = 30; // bir seferde çizilen kanal satırı

function guideRowHtml(it, ws, we, now) {
  const blocks = guideBlocks(S.epg.listFor(it), ws, we, now);
  const cells = blocks.length
    ? blocks.map(({ p, m, d, cls }) => `<div class="tl-prog${cls}" role="button" tabindex="0" style="--m:${m.toFixed(2)};--d:${d.toFixed(2)}" data-ch="${esc(it.id)}" data-s="${p.s}" data-e="${p.e}" aria-label="${esc(p.t || 'Program')}, ${fmtClock(p.s)} – ${fmtClock(p.e)}"><span><b>${esc(p.t || '—')}</b><small>${fmtClock(p.s)} – ${fmtClock(p.e)}</small></span></div>`).join('')
    : `<div class="tl-prog none" style="--m:0;--d:${GUIDE_SPAN}"><span><b>Program bilgisi yok</b></span></div>`;
  return `<div class="tl-row"><button class="tl-ch" data-ch="${esc(it.id)}" aria-label="${esc(it.name)}: günlük yayın akışı"><span class="tl-logo">${logo(it.logo, it.name)}</span><span class="tl-name">${esc(it.name)}</span></button><div class="tl-track">${cells}</div></div>`;
}

function guideAxisHtml(ws) {
  let out = '';
  for (let k = 0; k * GUIDE_STEP < GUIDE_SPAN; k++) {
    const t = ws + k * GUIDE_STEP * 60000;
    const hour = new Date(t).getMinutes() === 0;
    const day = hour && new Date(t).getHours() === 0 ? new Date(t).toLocaleDateString('tr-TR', { weekday: 'short' }) + ' ' : '';
    out += `<span class="tl-tick${hour ? '' : ' half'}" style="--m:${k * GUIDE_STEP}">${hour ? esc(day + fmtClock(t)) : ''}</span>`;
  }
  return out;
}

function guideProgramSheet(it, p, items, index, { noDay = false, onChange = null } = {}) {
  const now = Date.now();
  const state = p.s <= now && p.e > now ? 'Şimdi yayında' : p.e <= now ? 'Yayınlandı' : 'Henüz başlamadı';
  const mins = Math.max(1, Math.round((p.e - p.s) / 60000));
  const live = it.kind === 'live';
  const canArchive = live && it.archive && S.source.type === 'xtream' && p.s < now && p.archive !== false;
  const canRemind = live && p.s > now;
  const canRecord = live && !!engine.rec && p.e > now;
  const has = (kind) => hasPlan(readPlans(), planIdOf(kind, it, p));
  const label = (kind) => (kind === 'rem' ? (has('rem') ? 'Hatırlatıcıyı kaldır' : 'Hatırlat') : has('rec') ? 'Kaydı kaldır' : p.s < now ? 'Şimdi kaydet' : 'Kaydet');
  const btn = (a, ic, kind, cls = 'ghost') => `<button class="btn ${cls}" data-a="${a}">${icon(ic)}<span>${label(kind)}</span></button>`;
  const sh = openSheet({
    title: p.t || 'Program',
    html: `<div class="gp"><div class="gp-meta"><b>${esc(it.name)}</b><span>${fmtClock(p.s)} – ${fmtClock(p.e)} · ${mins} dk · ${state}</span></div>${p.d ? `<p class="gp-desc">${esc(p.d)}</p>` : '<p class="gp-desc muted">Bu program için açıklama yok.</p>'}<div class="gp-btns"><button class="btn" data-a="watch">${icon('play')}Kanalı izle</button>${canArchive ? `<button class="btn ghost" data-a="arc">${icon('history')}${p.e > now ? 'Baştan izle' : 'Arşivden izle'}</button>` : ''}${canRemind ? btn('rem', 'bell', 'rem') : ''}${canRecord ? btn('rec', 'rec', 'rec') : ''}${noDay ? '' : '<button class="btn ghost" data-a="day">Günlük akış</button>'}</div></div>`,
  });
  sh.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'rem' || a === 'rec') {
      togglePlan(a, it, p);
      b.querySelector('span').textContent = label(a);
      if (onChange) onChange();
      return;
    }
    closeThen(sh, () => (a === 'day' ? epgSheet(it) : a === 'arc' ? playArchive(it, p) : playLive(items, index)));
    sh.close();
  });
}

function guidePage() {
  openPage({
    title: 'TV Rehberi',
    cls: 'guide-pg',
    html: '<div class="guide-tools"><input id="guide-q" type="search" placeholder="Kanal veya kategori ara…" autocomplete="off"><button class="btn sm ghost" id="guide-mode" aria-pressed="false">Program ara</button><button class="btn sm ghost" id="guide-refresh">EPG yenile</button></div><div class="guide-now"><span id="guide-now"></span><span class="guide-nav"><button class="btn sm ghost" id="guide-back" aria-label="3 saat geri">‹ 3 sa</button><button class="btn sm ghost" id="guide-today">Şimdi</button><button class="btn sm ghost" id="guide-fwd" aria-label="3 saat ileri">3 sa ›</button></span></div><div id="guide-list" class="guide-categories"></div>',
    mount: (body) => {
      const q = $('#guide-q', body);
      const list = $('#guide-list', body);
      const nowLabel = $('#guide-now', body);
      let expanded = null; // açık kategori: kanallar zaman çizelgesinde, sayfada tek kaydırma alanı
      let catLayer = false; // açık kategori geri tuşunun bir adımıdır (Geri → kategori listesi)
      let shown = GUIDE_CHUNK; // açık kategoride çizilen kanal sayısı
      let scrollX = null; // null → şimdiye kaydır
      let ws = 0;
      let rows = []; // açık kategorinin süzülmüş kanalları
      let progMode = false; // "Program ara": arama kutusu kanal yerine program adlarında arar
      let progHits = [];
      let visIds = null; // gizli/kilitli kategorilerdeki kanallar program aramasında çıkmaz
      let categories = categoryRows('live').filter((r) => !r.special && r.count > 0);
      const kbd = () => document.documentElement.classList.contains('kbd');
      const scroller = () => $('.tl-scroll', list);
      const ppm = () => {
        const t = $('.tl', list);
        return (t && parseFloat(getComputedStyle(t).getPropertyValue('--tl-ppm'))) || 4;
      };
      const nowX = () => ((Date.now() - ws) / 60000) * ppm();
      const clock = () => {
        nowLabel.textContent = 'ŞİMDİ · ' + fmtClock(Date.now()) + (expanded || progMode ? '' : '  ·  Kategori seçerek yayın akışını görüntüleyin');
      };
      // Zaman ilerledikçe şimdi çizgisi ve blokların şimdi/geçmiş durumu güncellenir
      const tickNow = () => {
        clock();
        const t = $('.tl', list);
        if (!t) return;
        const now = Date.now();
        t.style.setProperty('--now', ((now - ws) / 60000).toFixed(2));
        $$('.tl-prog[data-s]', t).forEach((b) => {
          b.classList.toggle('now', Number(b.dataset.s) <= now && Number(b.dataset.e) > now);
          b.classList.toggle('past', Number(b.dataset.e) <= now);
        });
      };
      const moreRows = () => {
        const sc = scroller();
        if (!sc || shown >= rows.length) return false;
        const from = shown;
        shown = Math.min(rows.length, shown + GUIDE_CHUNK);
        const now = Date.now();
        $('.tl-body', sc).insertAdjacentHTML('beforeend', rows.slice(from, shown).map((it) => guideRowHtml(it, ws, ws + GUIDE_SPAN * 60000, now)).join(''));
        if (shown >= rows.length) $('.tl-more', sc)?.remove();
        return true;
      };
      const draw = (keepScroll = false) => {
        const old = scroller();
        if (keepScroll && old) scrollX = old.scrollLeft;
        const term = fold(q.value.trim());
        ws = Math.floor((Date.now() - 45 * 60000) / (GUIDE_STEP * 60000)) * GUIDE_STEP * 60000;
        const now = Date.now();
        const cat = expanded && categories.find((c) => c.id === expanded);
        if (expanded && !cat) {
          expanded = null;
          if (catLayer) popLayer('guide-cat');
        }
        list.classList.toggle('tlmode', !!cat && !progMode);
        if (progMode) {
          rows = [];
          drawPrograms(term);
          return;
        }
        if (cat) {
          const all = itemsOfGroup('live', cat.id);
          rows = term ? all.filter((it) => fold(it.name).includes(term)) : all;
          if (term && !rows.length && fold(cat.name).includes(term)) rows = all; // kategori adıyla eşleşti: tüm kanalları göster
          const we = ws + GUIDE_SPAN * 60000;
          const timeline = rows.length
            ? `<div class="tl" style="--span:${GUIDE_SPAN};--now:${((now - ws) / 60000).toFixed(2)}"><div class="tl-scroll"><div class="tl-inner"><div class="tl-head"><div class="tl-corner"></div><div class="tl-axis">${guideAxisHtml(ws)}</div></div><div class="tl-body">${rows.slice(0, shown).map((it) => guideRowHtml(it, ws, we, now)).join('')}</div>${rows.length > shown ? `<button class="tl-more btn sm ghost">Daha fazla kanal (${rows.length - shown})</button>` : ''}<div class="tl-nowline"></div></div></div></div>`
            : '<div class="empty">Eşleşen kanal bulunamadı.</div>';
          list.innerHTML = `<button class="guide-category-head open" data-back aria-label="Kategorilere dön"><span class="chev">‹</span><span class="guide-category-icon">${icon('folder')}</span><span class="guide-category-title">${esc(cat.name)}</span><span class="guide-category-count">${rows.length} kanal</span></button>${timeline}`;
        } else {
          rows = [];
          const filtered = categories.filter((c) => !term || fold(c.name).includes(term) ||
            itemsOfGroup('live', c.id).some((it) => fold(it.name).includes(term)));
          list.innerHTML = filtered.map((c) => '<button class="guide-category-head" data-category="' + esc(c.id) + '">' +
            '<span class="guide-category-icon">' + icon('folder') + '</span><span class="guide-category-title">' + esc(c.name) + '</span>' +
            '<span class="guide-category-count">' + c.count + ' kanal</span><span class="chev">›</span></button>').join('') ||
            '<div class="empty">Kategori veya kanal bulunamadı.</div>';
        }
        clock();
        const sc = scroller();
        if (sc) {
          sc.scrollLeft = scrollX == null ? Math.max(0, nowX() - 16) : scrollX;
          sc.addEventListener('scroll', () => {
            if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 160) moreRows();
          }, { passive: true });
        }
      };
      const dayWord = (ts) => {
        const d0 = new Date().setHours(0, 0, 0, 0);
        const diff = Math.round((new Date(ts).setHours(0, 0, 0, 0) - d0) / 86400000);
        return diff === 0 ? 'Bugün' : diff === 1 ? 'Yarın' : diff === -1 ? 'Dün' : new Date(ts).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
      };
      const drawPrograms = (term) => {
        progHits = [];
        let html;
        if (fold(term).length < 2) html = '<div class="empty"><p>Programlarda aramak için adının en az 2 harfini yazın.</p></div>';
        else {
          if (!visIds) visIds = new Set(visibleAll('live').map((x) => x.id));
          progHits = S.epg.search(term, { limit: 400 }).filter((h) => visIds.has(h.id)).slice(0, 120);
          html = progHits.length
            ? progHits.map((h, i) => `<div class="prog-row tap" role="button" tabindex="0" data-hit="${i}"><time>${fmtClock(h.p.s)}</time><div><b>${esc(h.p.t)}</b><small>${esc(S.idx.live.get(h.id).name)} · ${esc(dayWord(h.p.s))}</small></div></div>`).join('')
            : '<div class="empty">Eşleşen program bulunamadı.</div>';
        }
        list.innerHTML = html;
        clock();
      };
      const closeCat = () => {
        const id = expanded;
        catLayer = false;
        expanded = null;
        shown = GUIDE_CHUNK;
        scrollX = null;
        if (!body.isConnected) return;
        draw();
        const back = id && $('[data-category="' + CSS.escape(id) + '"]', list);
        if (back && kbd()) back.focus({ preventScroll: false }); // kumandada odak açtığımız kategoriye döner
      };
      const openCat = (id) => {
        expanded = id;
        shown = GUIDE_CHUNK;
        scrollX = null;
        if (!catLayer) {
          catLayer = true;
          pushLayer('guide-cat', closeCat);
        }
        draw();
        if (kbd()) {
          const first = $('.tl-prog.now', list) || $('.tl-prog[data-s]', list) || $('.tl-ch', list);
          if (first) focusTl(first);
        }
      };

      // ---- kumanda: yön tuşlarıyla satır/program gezinmesi ----
      // Zaman çizelgesinin görünen alanı: sabit kanal sütunu ve zaman cetveli hariç
      const view = () => {
        const sc = scroller();
        const r = sc.getBoundingClientRect();
        return { sc, left: r.left + $('.tl-corner', sc).getBoundingClientRect().width, right: r.right, top: r.top + $('.tl-head', sc).getBoundingClientRect().height, bottom: r.bottom };
      };
      const reveal = (el) => {
        const v = view();
        const b = el.getBoundingClientRect();
        if (el.classList.contains('tl-prog')) {
          if (b.left < v.left + 4) v.sc.scrollLeft -= v.left + 4 - b.left;
          else if (b.right > v.right) v.sc.scrollLeft += Math.min(b.right - v.right + 4, b.left - v.left - 4); // başlangıcı görünür kalsın
        }
        if (b.top < v.top) v.sc.scrollTop -= v.top - b.top;
        else if (b.bottom > v.bottom) v.sc.scrollTop += b.bottom - v.bottom;
      };
      function focusTl(el) {
        el.focus({ preventScroll: true });
        reveal(el);
      }
      const progsOf = (row) => $$('.tl-prog[data-s]', row);
      // Hedef satırda, verilen yatay konumdaki (yoksa en yakın) program
      const nearestProg = (row, x) => {
        let best = null;
        let bd = Infinity;
        for (const p of progsOf(row)) {
          const b = p.getBoundingClientRect();
          const d = x >= b.left && x <= b.right ? 0 : Math.min(Math.abs(b.left - x), Math.abs(b.right - x));
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
        return best;
      };
      const rowKey = (e) => {
        const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
        const el = e.target.closest && e.target.closest('.tl-prog, .tl-ch');
        if (!dir || !el || e.altKey || e.ctrlKey || e.metaKey) return false;
        const row = el.closest('.tl-row');
        const isCh = el.classList.contains('tl-ch');
        const v = view();
        if (dir === 'left' || dir === 'right') {
          if (isCh) {
            if (dir === 'left') return false;
            const first = progsOf(row).find((p) => p.getBoundingClientRect().right > v.left + 8);
            if (!first) return false;
            focusTl(first);
            return true;
          }
          if (!el.dataset.s) return true;
          const ps = progsOf(row);
          const i = ps.indexOf(el);
          if (dir === 'right') {
            if (ps[i + 1]) focusTl(ps[i + 1]);
            return true; // satır sonu: yerinde kal
          }
          if (ps[i - 1]) focusTl(ps[i - 1]);
          else focusTl($('.tl-ch', row));
          return true;
        }
        let target = dir === 'down' ? row.nextElementSibling : row.previousElementSibling;
        if (!target && dir === 'down' && moreRows()) target = row.nextElementSibling;
        if (!target || !target.classList.contains('tl-row')) return dir === 'down'; // üstte satır yok: üstteki denetimlere geç
        const x = Math.max(el.getBoundingClientRect().left, v.left) + 1;
        focusTl(isCh ? $('.tl-ch', target) : nearestProg(target, x) || $('.tl-ch', target));
        return true;
      };
      list.addEventListener('keydown', (e) => {
        if (e.defaultPrevented) return;
        if (e.key === 'MediaFastForward' || e.key === 'MediaRewind') {
          e.preventDefault();
          return step(e.key === 'MediaFastForward' ? 1 : -1);
        }
        if (rowKey(e)) e.preventDefault(); // dpad.js defaultPrevented görünce yalnız kumanda kipini açar, odağı bize bırakır
      });

      list.addEventListener('click', (e) => {
        const hit = e.target.closest('[data-hit]');
        if (hit && progHits[Number(hit.dataset.hit)]) {
          const h = progHits[Number(hit.dataset.hit)];
          const ch = S.idx.live.get(h.id);
          return ch && guideProgramSheet(ch, h.p, [ch], 0);
        }
        if (e.target.closest('[data-back]')) return popLayer('guide-cat');
        const head = e.target.closest('[data-category]');
        if (head) return openCat(head.dataset.category);
        if (e.target.closest('.tl-more')) {
          moreRows();
          return;
        }
        const cell = e.target.closest('.tl-prog[data-s]');
        const ch = e.target.closest('.tl-ch');
        const id = (cell || ch) && (cell || ch).dataset.ch;
        const idx = rows.findIndex((it) => it.id === id);
        if (idx < 0) return;
        if (cell) {
          const s = Number(cell.dataset.s);
          const p = S.epg.listFor(rows[idx]).find((x) => x.s === s);
          if (p) guideProgramSheet(rows[idx], p, rows, idx);
        } else epgSheet(rows[idx]);
      });
      q.addEventListener('input', debounce(() => {
        shown = GUIDE_CHUNK;
        draw(true);
      }, 160));
      function step(dir) {
        const sc = scroller();
        if (!sc) return;
        sc.scrollBy({ left: dir * 180 * ppm(), behavior: 'smooth' });
        const f = document.activeElement;
        if (f && f.classList && f.classList.contains('tl-prog')) setTimeout(() => nearestVisible(f), 350);
      }
      // 3 saat kayınca odaklı program görünümden çıktıysa odak görünen en yakın programa taşınır
      function nearestVisible(f) {
        if (!f.isConnected) return;
        const v = view();
        const b = f.getBoundingClientRect();
        if (b.right > v.left && b.left < v.right) return;
        const row = f.closest('.tl-row');
        const p = nearestProg(row, b.right <= v.left ? v.left + 1 : v.right - 1);
        if (p) p.focus({ preventScroll: true });
      }
      $('#guide-back', body).addEventListener('click', () => step(-1));
      $('#guide-fwd', body).addEventListener('click', () => step(1));
      $('#guide-today', body).addEventListener('click', () => {
        const sc = scroller();
        if (sc) sc.scrollTo({ left: Math.max(0, nowX() - 16), top: 0, behavior: 'smooth' });
      });
      const timer = setInterval(() => (body.isConnected ? tickNow() : clearInterval(timer)), 30000);
      const modeBtn = $('#guide-mode', body);
      modeBtn.addEventListener('click', () => {
        progMode = !progMode;
        modeBtn.setAttribute('aria-pressed', String(progMode));
        modeBtn.classList.toggle('on', progMode);
        q.placeholder = progMode ? 'Program adı ara… (örn. haber, maç)' : 'Kanal veya kategori ara…';
        visIds = null;
        draw(true);
        if (!progMode) scrollX = null;
      });
      const refreshButton = $('#guide-refresh', body);
      refreshButton.addEventListener('click', async () => {
        if (refreshButton.disabled) return;
        refreshButton.disabled = true;
        refreshButton.textContent = 'Yenileniyor…';
        try {
          await maybeRefreshEpg(true);
          categories = categoryRows('live').filter((r) => !r.special && r.count > 0);
          if (body.isConnected) draw(true);
        } catch (error) {
          toast('EPG yenilenemedi: ' + ((error && error.message) || 'Bilinmeyen hata'), 3500);
        } finally {
          if (body.isConnected && refreshButton.isConnected) {
            refreshButton.disabled = false;
            refreshButton.textContent = 'EPG yenile';
          }
        }
      });
      draw();
    },
  });
}

// Ana ekran "Kategoriler": üç türün tüm kategorileri tek yerde; seçilince o tür açılıp kategoriye girilir.
function categoriesPage() {
  const KINDS = [['live', 'Canlı TV', 'live'], ['movie', 'Filmler', 'movies'], ['series', 'Diziler', 'series']];
  let kind = 'live';
  openPage({
    title: 'Kategoriler',
    cls: 'pk-pg',
    html: `<div class="seg" id="kc-seg">${KINDS.map(([k, t]) => `<button data-k="${k}">${t}</button>`).join('')}</div><div id="kc-list"></div>`,
    mount: (body, api) => {
      let rows = [];
      const list = new VirtualList($('#kc-list', body), {
        rowH: scaled(56),
        render: (c, i) => `<div class="row cat${c.special ? ' special' : ''}" role="button" tabindex="0" data-i="${i}"><div class="meta"><div class="nm"><span class="mq-i">${esc(c.name)}</span></div></div><span class="n">${c.count}</span><span class="chev" aria-hidden="true">›</span></div>`,
        onTap: (i) => {
          const c = rows[i];
          if (!c) return;
          const tab = KINDS.find(([k]) => k === kind)[2];
          closeThen(api, () => {
            setTab(tab);
            enterGroup(kind, c.id);
          });
        },
      });
      const draw = () => {
        $$('#kc-seg button', body).forEach((b) => b.classList.toggle('on', b.dataset.k === kind));
        rows = categoryRows(kind).filter((r) => r.id !== '__recent' || r.count);
        list.setItems(rows);
      };
      $('#kc-seg', body).addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        kind = b.dataset.k;
        draw();
      });
      draw();
    },
  });
}

// ------------------------------------------------------------------ genel arama (ana ekran)

function globalSearch() {
  const KINDS = [['live', 'Canlı TV'], ['movie', 'Filmler'], ['series', 'Diziler']];
  const SHOW_ALL = 40; // “Tümü” görünümünde her türden en çok bu kadar sonuç
  const SHOW_ONE = 300; // tek tür seçilince
  const CAP = 3000;
  let kind = 'all';
  openPage({
    title: 'Ara',
    cls: 'gs-pg',
    html: '<div class="gs-q"><input id="gs-q" type="search" placeholder="Kanal, film veya dizi ara…" autocomplete="off" enterkeyhint="search"></div><div class="seg" id="gs-kind"><button data-k="all" class="on">Tümü</button><button data-k="live">Canlı</button><button data-k="movie">Film</button><button data-k="series">Dizi</button></div><div id="gs-res"></div>',
    mount: (body) => {
      const q = $('#gs-q', body);
      const res = $('#gs-res', body);
      let found = { live: [], movie: [], series: [] };
      const row = (it, k, i) => `<button class="list-item" data-k="${k}" data-i="${i}">${logo(it.logo, it.name)}<span class="t">${esc(it.name)}<small>${esc(it.group || '')}</small></span></button>`;
      const draw = () => {
        const t = q.value.trim();
        if (!t) {
          res.innerHTML = '<div class="empty">Tüm canlı kanallar, filmler ve dizilerde aramak için yazın</div>';
          return;
        }
        // Arama açık kategoriyle sınırlı değildir: tüm kategorilerdeki canlı, film ve dizilerde yapılır.
        found = { live: search(visibleAll('live'), t, CAP), movie: search(visibleAll('movie'), t, CAP), series: search(visibleAll('series'), t, CAP) };
        const parts = KINDS.filter(([k]) => kind === 'all' || kind === k).map(([k, title]) => {
          const list = found[k];
          if (!list.length) return '';
          const cap = kind === 'all' ? SHOW_ALL : SHOW_ONE;
          const n = `${list.length}${list.length >= CAP ? '+' : ''}`;
          const more = list.length > cap && kind === 'all' ? `<button class="list-item more" data-more="${k}">${n} sonucun tamamını göster</button>` : '';
          return `<div class="sect">${title}<small>${n}</small></div>${list.slice(0, cap).map((it, i) => row(it, k, i)).join('')}${more}`;
        });
        res.innerHTML = parts.join('') || '<div class="empty">Sonuç yok</div>';
      };
      $('#gs-kind', body).addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        kind = b.dataset.k;
        $$('#gs-kind button', body).forEach((x) => x.classList.toggle('on', x === b));
        draw();
      });
      q.addEventListener('input', debounce(draw, 150));
      res.addEventListener('click', (e) => {
        const more = e.target.closest('[data-more]');
        if (more) {
          kind = more.dataset.more;
          $$('#gs-kind button', body).forEach((x) => x.classList.toggle('on', x.dataset.k === kind));
          return draw();
        }
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
const optionsHtml = (pairs, cur) => pairs.map(([v, t]) => `<option value="${v}"${String(cur) === String(v) ? ' selected' : ''}>${t}</option>`).join('');

function generalSheet() {
  const lim = Number(store.pref('set.recentLimit', 40));
  openSheet({
    title: 'Genel ayarlar',
    html:
      chkRow('epgRows', 'Kanal listesinde program bilgisini göster', 'Şu an yayındaki program ve ilerleme çubuğu') +
      chkRow('numbers', 'Kanal numaralarını göster', 'Yatay ekrandaki Canlı TV listesinde') +
      chkRow('autoPreview', 'Canlı TV’de önizleme oynat', 'Yatay ekranda kanala dokununca küçük pencerede açılır; kapalıyken doğrudan tam ekran') +
      `<div class="sel-row sel-col"><span>Tema rengi</span><div class="swatches" id="g-theme" role="radiogroup" aria-label="Tema rengi">${THEMES.map((t) => `<button class="swatch${t.id === store.pref('set.theme', DEFAULT_THEME) ? ' on' : ''}" role="radio" aria-checked="${t.id === store.pref('set.theme', DEFAULT_THEME)}" data-theme="${t.id}" style="--sw:${t.swatch}"><i></i><span>${esc(t.name)}</span></button>`).join('')}</div></div>` +
      `<div class="sel-row"><span>TV modu<small>Kumanda ile kullanım: yatay, tam ekran, büyük yazı</small></span><select id="g-tv">${optionsHtml(TV_MODES, normalizeTvMode(store.pref('set.tvmode', DEFAULT_TV_MODE)))}</select></div>` +
      `<div class="sel-row"><span>Yayın önbelleği<small>Yüksek: daha az takılma, kanal biraz geç açılır. Sonraki açılışta geçerli olur</small></span><select id="g-buf">${optionsHtml(BUFFER_LEVELS, normalizeBuffer(store.pref('set.buffer', DEFAULT_BUFFER)))}</select></div>` +
      `<div class="sel-row"><span>Yayın koparsa<small>Oynarken bağlantı kesilirse yeniden bağlanma davranışı</small></span><select id="g-rc">${optionsHtml(RECONNECT_MODES, normalizeReconnect(store.pref('set.reconnect', DEFAULT_RECONNECT)))}</select></div>` +
      `<div class="sel-row"><span>Takılma bekleme süresi<small>Yayın bu kadar gelmezse yeniden bağlanılır</small></span><select id="g-stall">${optionsHtml(STALL_LEVELS, normalizeStall(store.pref('set.stall', DEFAULT_STALL)))}</select></div>` +
      chkRow('altCh', 'Açılmayan kanal yerine yedek kanalı dene', 'Listede aynı adlı başka kanal varsa otomatik denenir') +
      `<div class="sel-row"><span>Uygulama şifresi<small id="g-lock-s">${lockEnabled() ? 'Açık' : 'Kapalı'}</small></span><button class="btn sm ghost" id="g-lock">Ayarla</button></div>` +
      `<div class="sel-row"><span>Yedekle / geri yükle<small>Kaynaklar, favoriler, kategori düzeni, ayarlar</small></span><button class="btn sm ghost" id="g-bk">Aç</button></div>` +
      `<div class="sel-row"><span>Yazı boyutu</span><select id="g-fs">${optionsHtml(FONT_SCALES, Math.round(fontScale() * 100))}</select></div><div class="sel-row"><span>Son izlenen sınırı</span><select id="g-lim">${optionsHtml([[20, '20'], [40, '40'], [100, '100']], lim)}</select></div><div style="margin-top:14px"><button class="btn ghost sm" id="g-clr">Son izlenenleri temizle</button></div>`,
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
      $('#g-theme', body).addEventListener('click', (e) => {
        const b = e.target.closest('[data-theme]');
        if (!b) return;
        store.setPref('set.theme', applyTheme(b.dataset.theme));
        $$('#g-theme .swatch', body).forEach((x) => {
          x.classList.toggle('on', x === b);
          x.setAttribute('aria-checked', String(x === b));
        });
      });
      $('#g-tv', body).addEventListener('change', (e) => {
        store.setPref('set.tvmode', normalizeTvMode(e.target.value));
        applyTvMode();
      });
      $('#g-lock', body).addEventListener('click', () => lockSheet());
      $('#g-bk', body).addEventListener('click', () => backupSheet());
      $('#g-buf', body).addEventListener('change', (e) => store.setPref('set.buffer', normalizeBuffer(e.target.value)));
      $('#g-rc', body).addEventListener('change', (e) => store.setPref('set.reconnect', normalizeReconnect(e.target.value)));
      $('#g-stall', body).addEventListener('change', (e) => store.setPref('set.stall', normalizeStall(e.target.value)));
      $('#g-lim', body).addEventListener('change', (e) => store.setPref('set.recentLimit', Number(e.target.value)));
      $('#g-fs', body).addEventListener('change', (e) => {
        store.setPref('set.fontScale', Number(e.target.value));
        applyFontScale();
        renderTab(); // sabit yükseklikli listeler yeni ölçüyle yeniden kurulur
      });
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
    body.innerHTML = `<div class="list-item"><span class="t">${esc(s.name)}<small>${esc(status)}</small></span></div><div class="list-item"><span class="t">Son güncelleme<small>${esc(when)}</small></span></div>${urls.map((u) => `<div class="list-item"><span class="t">Adres<small style="word-break:break-all">${esc(maskUrl(u))}</small></span></div>`).join('')}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn sm" id="e-now"${urls.length ? '' : ' disabled'}>${icon('refresh')}EPG’yi şimdi yenile</button><button class="btn sm ghost" id="e-edit">Kaynağı düzenle</button></div>`;
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

// ------------------------------------------------------------------ yayın kalitesi tanılama
// Kategori + arama ile süzülen kanal listesi. Kanala dokununca o kanal sınanır; "Kategoriyi test et" listedeki tüm kanalları
// sırayla sınar, her satırda sonuç görünür. Android'de istek yerel katmandan atılır: WebView'in fetch'i CORS yüzünden çoğu
// IPTV sunucusuna ulaşamaz ve her kanalı yanlışlıkla "başarısız" gösterirdi.
const HEALTH_PARALLEL = 2; // toplu testte eşzamanlı istek: bağlantı sınırlı hesapları zorlamamak için düşük tutulur
const HEALTH_BULK_MS = 6000; // toplu testte kanal başına bekleme

async function probeChannel(item, { all = false, max = 3, timeoutMs = 8000 } = {}) {
  const targets = targetsOf(item).slice(0, max);
  if (!targets.length) throw new Error('Bu kanal için oynatma adresi bulunamadı');
  const probe = nativePlugin && nativePlugin.probe ? (o) => nativePlugin.probe(o) : null;
  let checks;
  if (all) checks = await Promise.all(targets.map((t) => checkStreamHealth(t, { probe, timeoutMs })));
  else {
    checks = [];
    for (const t of targets) {
      const c = await checkStreamHealth(t, { probe, timeoutMs });
      checks.push(c);
      if (c.ok === true) break; // ilk çalışan adres yeter
    }
  }
  const best = checks.find((x) => x.ok === true) || checks.find((x) => x.ok === null) || checks[0];
  return { best, checks };
}

const healthStatus = (r) => (!r ? '' : r.busy ? 'busy' : r.ok === true ? 'ok' : r.ok === false ? 'bad' : 'unk');

function healthSheet() {
  openPage({
    title: 'Yayın kalitesi',
    cls: 'pk-pg health-pg',
    html: '<p class="hint">Kategori seçip kanala dokunarak ya da “Kategoriyi test et” ile sunucu yanıtını ve süreyi sınayın; sonuç satırda saklanır, çalışmayanlar gizlenebilir. Codec çözümlemesi garanti edilmez; toplu test oynayan yayını kesebilir.</p><div class="pk-bar"><select id="health-cat" aria-label="Kategori"></select><input id="health-q" type="search" placeholder="Kanal ara…" autocomplete="off"></div><div class="health-run"><button class="btn sm" id="health-all">Kategoriyi test et</button><button class="btn sm ghost" id="health-hide" hidden></button><button class="btn sm ghost" id="health-hidden" hidden></button><span class="health-sum" id="health-sum" aria-live="polite"></span></div><div class="health-prog" id="health-prog" hidden><i></i></div><div class="seg" id="health-f"><button data-f="all" class="on">Tümü</button><button data-f="ok">Çalışan</button><button data-f="bad">Çalışmayan</button></div><div id="health-list"></div>',
    mount: (body) => {
      const sel = $('#health-cat', body);
      const q = $('#health-q', body);
      const runBtn = $('#health-all', body);
      const sum = $('#health-sum', body);
      const prog = $('#health-prog', body);
      const results = new Map(); // kanal no → { busy } | { ok, status, ms, format, message }
      let hist = pruneHist(store.pref(histKey(), {})); // önceki oturumların sonuçları: kanal no → [durum, ms, zaman]
      const eff = (id) => results.get(id) || lastResult(hist, id); // bu oturumdaki sonuç, yoksa son kayıtlı
      let saveT = 0;
      const note = (id, r) => {
        hist = recordResult(hist, id, r);
        clearTimeout(saveT);
        saveT = setTimeout(() => store.setPref(histKey(), hist), 1500);
      };
      const hideBtn = $('#health-hide', body);
      const hiddenBtn = $('#health-hidden', body);
      const cats = categoryRows('live').filter((r) => r.id !== '__recent' || r.count);
      sel.innerHTML = cats.map((r) => `<option value="${esc(r.id)}">${esc(r.name)} (${r.count})</option>`).join('');
      let items = []; // kategori + arama
      let shown = []; // + sonuç süzgeci
      let filter = 'all';
      let runner = null;
      const line = (r) => (r.hist ? `Son test ${fmtAgo(r.at)} · ${r.ok === true ? 'çalışıyordu' + (r.ms == null ? '' : ' · ' + r.ms + ' ms') : r.ok === false ? 'çalışmıyordu' : 'doğrulanamadı'}` : r.busy ? 'Test ediliyor…' : r.ok === true ? `Çalışıyor · ${r.ms == null ? '?' : r.ms + ' ms'} · ${r.format || ''}` : r.ok === false ? `Çalışmıyor · ${r.message || ''}` : r.message || 'HTTP ile doğrulanamadı');
      const list = new VirtualList($('#health-list', body), {
        rowH: scaled(60),
        render: (it, i) => {
          const r = eff(it.id);
          const st = healthStatus(r);
          return `<div class="row hs ${st}${r && r.hist ? ' old' : ''}" role="button" tabindex="0" data-i="${i}">${logo(it.logo, it.name)}<div class="meta"><div class="nm"><span class="mq-i">${esc(it.name)}</span></div><div class="sub"><span class="mq-i">${esc(r ? line(r) : it.group || '')}</span></div></div>${st ? `<span class="hs-dot ${st}" aria-hidden="true"></span>` : ''}</div>`;
        },
        onTap: (i) => {
          const it = shown[i];
          if (it) healthDetail(it, results, () => redraw(true), note);
        },
      });
      const tally = () => {
        let ok = 0;
        let bad = 0;
        let ms = 0;
        for (const it of items) {
          const r = eff(it.id);
          if (!r || r.busy) continue;
          if (r.ok === true) {
            ok++;
            ms += r.ms || 0;
          } else if (r.ok === false) bad++;
        }
        return { ok, bad, avg: ok ? Math.round(ms / ok) : 0 };
      };
      const summary = () => {
        const t = tally();
        sum.textContent = t.ok + t.bad ? `Çalışan ${t.ok} · Çalışmayan ${t.bad}${t.ok ? ' · ort. ' + t.avg + ' ms' : ''}` : '';
        hideBtn.hidden = !t.bad || !!runner;
        hideBtn.textContent = `Çalışmayanları gizle (${t.bad})`;
        const hn = hiddenCount(hiddenMap());
        hiddenBtn.hidden = !hn;
        hiddenBtn.textContent = `Gizlenenler (${hn})`;
      };
      const applyFilter = () => {
        shown = filter === 'all' ? items : items.filter((it) => {
          const r = eff(it.id);
          return !!r && !r.busy && (filter === 'ok' ? r.ok === true : r.ok === false);
        });
      };
      const label = () => {
        if (runner) return;
        runBtn.textContent = (q.value.trim() ? 'Sonuçları test et' : 'Kategoriyi test et') + (items.length ? ` (${items.length})` : '');
        runBtn.disabled = !items.length;
      };
      let raf = 0;
      function redraw(keepScroll = true) {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (!body.isConnected) return;
          applyFilter();
          list.setItems(shown, keepScroll);
          summary();
        });
      }
      const draw = () => {
        const base = itemsOfGroup('live', sel.value);
        items = q.value.trim() ? search(base, q.value, 500) : base;
        label();
        applyFilter();
        list.setItems(shown);
        summary();
      };
      const finish = (stopped) => {
        runner = null;
        prog.hidden = true;
        label();
        const t = tally();
        if (stopped) toast('Test durduruldu');
        else toast(`Test bitti: ${t.ok} çalışan, ${t.bad} çalışmayan`, 3500);
        redraw(true);
      };
      const runAll = async () => {
        if (runner) {
          runner.stop = true;
          runBtn.disabled = true;
          runBtn.textContent = 'Durduruluyor…';
          return;
        }
        const todo = items.slice();
        if (!todo.length) return;
        const token = { stop: false };
        runner = token;
        for (const it of todo) results.delete(it.id);
        let idx = 0;
        let done = 0;
        runBtn.textContent = 'Durdur';
        prog.hidden = false;
        const bar = $('i', prog);
        const tick = () => {
          bar.style.width = ((done / todo.length) * 100).toFixed(1) + '%';
          sum.textContent = `${done}/${todo.length} sınandı`;
        };
        tick();
        const worker = async () => {
          while (!token.stop && idx < todo.length && body.isConnected) {
            const it = todo[idx++];
            results.set(it.id, { busy: true });
            redraw(true);
            try {
              const { best } = await probeChannel(it, { max: 2, timeoutMs: HEALTH_BULK_MS });
              results.set(it.id, { ok: best.ok, status: best.status, ms: best.latencyMs, format: best.format, message: best.message });
            } catch (e) {
              results.set(it.id, { ok: false, message: (e && e.message) || 'Test başarısız' });
            }
            note(it.id, results.get(it.id));
            done++;
            tick();
            redraw(true);
          }
        };
        await Promise.all(Array.from({ length: Math.min(HEALTH_PARALLEL, todo.length) }, worker));
        if (body.isConnected) {
          finish(token.stop);
          summary();
        }
      };
      runBtn.addEventListener('click', runAll);
      sel.addEventListener('change', () => {
        if (runner) runner.stop = true; // kategori değişince süren test durur
        draw();
      });
      q.addEventListener('input', debounce(draw, 120));
      $('#health-f', body).addEventListener('click', (e) => {
        const b = e.target.closest('[data-f]');
        if (!b) return;
        filter = b.dataset.f;
        $$('#health-f button', body).forEach((x) => x.classList.toggle('on', x === b));
        applyFilter();
        list.setItems(shown);
      });
      // Çalışmayanları gizle: listedeki (kategori + arama) çalışmadığı bilinen kanallar katalogdan süzülür; "Gizlenenler"den geri gelir.
      const afterHideChange = () => {
        const keep = sel.value;
        const rows = categoryRows('live').filter((r) => r.id !== '__recent' || r.count);
        sel.innerHTML = rows.map((r) => `<option value="${esc(r.id)}">${esc(r.name)} (${r.count})</option>`).join('');
        sel.value = rows.some((r) => r.id === keep) ? keep : (rows[0] && rows[0].id) || '';
        draw();
      };
      hideBtn.addEventListener('click', () => {
        const bad = items.filter((it) => {
          const r = eff(it.id);
          return !!r && !r.busy && r.ok === false;
        });
        if (!bad.length) return;
        const sh = openSheet({
          title: 'Çalışmayanları gizle',
          html: `<p>${bad.length} çalışmayan kanal listeden, aramadan ve rehberden kalkacak. Kaynağı silmez; <b>Gizlenenler</b>’den istediğiniz an geri getirebilirsiniz. Liste yenilense de gizli kalırlar.</p><div style="display:flex;gap:8px"><button class="btn danger" id="hh-yes">Gizle</button><button class="btn ghost" id="hh-no">Vazgeç</button></div>`,
          mount: (b2) => {
            $('#hh-no', b2).addEventListener('click', () => sh.close());
            $('#hh-yes', b2).addEventListener('click', () => {
              sh.close();
              hideChannelsNow(bad);
              toast(`${bad.length} kanal gizlendi`, 2500);
              afterHideChange();
            });
          },
        });
      });
      hiddenBtn.addEventListener('click', () => hiddenChannelsSheet(afterHideChange));
      draw();
    },
  });
}

// Gizlenen kanalları kaydeder ve katalog görünümünü yeniler.
function hideChannelsNow(items) {
  store.setPref('hidch.' + sid(), hideChannels(hiddenMap(), items));
  setCatalog(S.rawCat);
  if (S.tab !== 'multi') renderTab();
}

// Gizlenen kanallar: tek tek ya da hepsi birden geri getirilir.
function hiddenChannelsSheet(changed) {
  const LIMIT = 300;
  const sh = openSheet({
    title: 'Gizlenen kanallar',
    html: '<div id="hc-body"></div>',
    mount: (body) => {
      const box = $('#hc-body', body);
      const draw = () => {
        const entries = Object.entries(hiddenMap());
        if (!entries.length) {
          box.innerHTML = '<p class="hint">Gizlenen kanal yok.</p>';
          return;
        }
        box.innerHTML = `<div style="margin:0 0 8px"><button class="btn sm" id="hc-all">Hepsini geri getir (${entries.length})</button></div>${entries.slice(0, LIMIT).map(([id, name]) => `<div class="rec-row"><div class="rec-play"><span class="t">${esc(name || id)}</span></div><button class="btn sm ghost" data-back="${esc(id)}">Geri getir</button></div>`).join('')}${entries.length > LIMIT ? `<p class="hint">İlk ${LIMIT} kanal gösteriliyor.</p>` : ''}`;
      };
      const apply = (map) => {
        store.setPref('hidch.' + sid(), map);
        setCatalog(S.rawCat);
        if (S.tab !== 'multi') renderTab();
        draw();
        changed();
        if (!hiddenCount(map)) setTimeout(() => body.isConnected && sh.close(), 400);
      };
      body.addEventListener('click', (e) => {
        const one = e.target.closest('[data-back]');
        if (one) return apply(restoreChannels(hiddenMap(), [one.dataset.back]));
        if (e.target.closest('#hc-all')) {
          toast('Gizlenen kanalların hepsi geri getirildi', 2200);
          apply(restoreChannels(hiddenMap()));
        }
      });
      draw();
    },
  });
}

// Tek kanalın ayrıntılı sonucu: üç adrese birden bakılır; sonuç listedeki satıra da yansır.
function healthDetail(item, results, changed, note = () => {}) {
  openSheet({
    title: item.name,
    html: '<div id="hd-res" class="health-result"></div><button class="btn" id="hd-run">Yeniden test et</button>',
    mount: (body) => {
      const result = $('#hd-res', body);
      const run = $('#hd-run', body);
      const go = async () => {
        run.disabled = true;
        run.textContent = 'Test ediliyor…';
        result.innerHTML = '<div class="empty">Yayın sunucusu kontrol ediliyor…</div>';
        results.set(item.id, { busy: true });
        changed();
        try {
          const { best, checks } = await probeChannel(item, { all: true });
          results.set(item.id, { ok: best.ok, status: best.status, ms: best.latencyMs, format: best.format, message: best.message });
          note(item.id, results.get(item.id));
          if (!body.isConnected) return;
          result.innerHTML = `<div class="list-item"><span class="t">${best.ok === true ? 'Sunucu yanıt veriyor' : best.ok === false ? 'Bağlantı başarısız' : 'HTTP ile doğrulanamadı'}<small>${esc(item.group || '')}</small></span></div><div class="list-item"><span class="t">Bağlantı süresi<small>${best.latencyMs == null ? 'Ölçülemedi' : best.latencyMs + ' ms'}</small></span></div><div class="list-item"><span class="t">HTTP yanıtı<small>${best.status == null ? 'Yok' : best.status}</small></span></div><div class="list-item"><span class="t">Yayın biçimi<small>${esc(best.format || 'Bilinmiyor')}</small></span></div><p class="hint">${esc(best.message || '')}</p>${checks.length > 1 ? `<p class="hint">${checks.length} adres denendi; ${checks.filter((x) => x.ok === true).length} adres yanıt verdi.</p>` : ''}`;
        } catch (error) {
          results.set(item.id, { ok: false, message: (error && error.message) || 'Test başarısız' });
          note(item.id, results.get(item.id));
          if (body.isConnected) result.innerHTML = `<div class="empty">${esc((error && error.message) || 'Test başarısız')}</div>`;
        } finally {
          changed();
          if (body.isConnected) {
            run.disabled = false;
            run.textContent = 'Yeniden test et';
          }
        }
      };
      run.addEventListener('click', go);
      go();
    },
  });
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
    if (manual) toast('Güncelleme denetlenemedi: ' + explainError(e), 4500);
  } finally {
    updBusy = false;
  }
}

function updateSheet(info) {
  let path = null;
  let busy = false;
  openSheet({
    title: 'Yeni sürüm hazır',
    html: `<p>Sürüm <b>${esc(info.name)}</b> yayında (şu an ${esc(VERSION)}).${info.size ? ` Boyut: ${fmtMB(info.size)}.` : ''}</p>${info.notes ? `<p class="hint" style="white-space:pre-line">${esc(info.notes)}</p>` : ''}<div id="up-bar" hidden style="height:6px;border-radius:3px;background:var(--line);overflow:hidden;margin:10px 0"><i style="display:block;height:100%;width:0;background:var(--accent)"></i></div><p id="up-msg" class="hint"></p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="up-go">${icon('refresh')}Şimdi güncelle</button><button class="btn ghost" id="up-later">Sonra</button></div><p class="hint" style="margin-top:12px">Güncelleme mevcut uygulamanın üstüne kurulur; kaynaklarınız ve favorileriniz korunur.</p>`,
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
          path = (await retry(() => nativePlugin.downloadApk({ url: info.apkUrl }))).path;
        } catch (e) {
          msg.textContent = 'İndirilemedi: ' + explainError(e);
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

// ------------------------------------------------------------------ yayın kayıtları (Android)

let recSheetApi = null;

// Yerel eklentiden gelen kayıt olayı: oynatıcıdaki düğme güncellenir, kayıt bitince bilgi verilir.
function recEvent(e) {
  if (!e) return;
  pui.recording(e);
  if (e.active) return;
  toast(recEndMessage(e), 3500);
  if (recSheetApi && recSheetApi.draw) recSheetApi.draw();
}

// Kayıtlar: izle (başından, sarılabilir) ve sil. Kayıtlar uygulamanın kendi klasöründe durur.
function recordingsSheet() {
  if (!engine.rec) return toast('Kayıt yalnız Android uygulamasında çalışır');
  const sh = openSheet({
    title: 'Kayıtlar',
    html: '<div id="rec-body"><p class="hint">Yükleniyor…</p></div>',
    mount: (body, api) => {
      const box = $('#rec-body', body);
      let items = [];
      const draw = async () => {
        if (!box.isConnected) return;
        let res;
        try {
          res = await engine.rec.list();
        } catch (err) {
          box.innerHTML = `<p class="err-text">${esc(String((err && err.message) || 'Kayıtlar okunamadı'))}</p>`;
          return;
        }
        items = res.items || [];
        const rows = items
          .map(
            (r, i) =>
              `<div class="rec-row${r.active ? ' on' : ''}"><button class="rec-play" data-i="${i}"><span class="t">${esc(r.name)}</span><small>${esc(recSub(r))}</small></button>${r.active ? '' : `<button class="icon-btn" data-del="${i}" aria-label="Sil">${icon('trash')}</button>`}</div>`,
          )
          .join('');
        box.innerHTML = (rows || '<p class="hint">Henüz kayıt yok. Canlı yayın açıkken oynatıcıdaki “Kaydet” düğmesiyle kayıt başlatın.</p>') + `<p class="rec-info">Kayıtlar: ${fmtBytes(res.usedBytes || 0)} · Boş alan: ${fmtBytes(res.freeBytes || 0)}</p>`;
      };
      api.draw = draw;
      recSheetApi = api;
      body.addEventListener('click', (e) => {
        const del = e.target.closest('[data-del]');
        const play = e.target.closest('[data-i]');
        if (del) return deleteRecSheet(items[Number(del.dataset.del)], draw);
        if (play && items[Number(play.dataset.i)]) {
          const r = items[Number(play.dataset.i)];
          if (r.active) return toast('Kayıt sürüyor');
          sh.close();
          startPlay(recItem(r));
        }
      });
      draw();
    },
  });
}

function deleteRecSheet(r, after) {
  if (!r) return;
  const sh = openSheet({
    title: 'Kaydı sil',
    html: `<p>“${esc(r.name)}” kaydı cihazdan silinecek.</p><div style="display:flex;gap:8px"><button class="btn danger" id="rd-yes">Sil</button><button class="btn ghost" id="rd-no">Vazgeç</button></div>`,
    mount: (body) => {
      $('#rd-no', body).addEventListener('click', () => sh.close());
      $('#rd-yes', body).addEventListener('click', async () => {
        sh.close();
        try {
          await engine.rec.remove(r.id);
          toast('Kayıt silindi', 1800);
        } catch (err) {
          toast(String((err && err.message) || 'Kayıt silinemedi'), 3000);
        }
        after();
      });
    },
  });
}

// Planlananlar: bekleyen hatırlatıcılar ve zamanlı kayıtlar; izin durumu ve kaldırma burada.
function plansSheet() {
  const sh = openSheet({
    title: 'Planlananlar',
    html: '<div id="pl-body"><p class="hint">Yükleniyor…</p></div>',
    mount: (body) => {
      const box = $('#pl-body', body);
      const draw = async () => {
        if (!box.isConnected) return;
        const list = readPlans();
        const now = Date.now();
        let st = null;
        if (nativePlugin) {
          try {
            st = await nativePlugin.planStatus();
          } catch {
            /* durum okunamadı */
          }
        }
        if (!box.isConnected) return;
        const needs = [];
        if (st && !st.notify) needs.push('Bildirim izni kapalı: hatırlatıcı ve kayıt bildirimi görünmez.');
        if (st && st.notify && !st.exact) needs.push('Tam zamanlı alarm izni kapalı: hatırlatıcı ve kayıt birkaç dakika kayabilir.');
        const warn = needs.length ? `<div class="pl-warn"><p>${needs.map(esc).join(' ')}</p><button class="btn sm" data-a="perm">İzni aç</button></div>` : '';
        const rows = list.map((x) => {
          const fired = x.at <= now;
          const what = x.kind === 'rec' ? (fired ? 'Kayıt sürüyor ya da bitti' : 'Zamanlı kayıt') : fired ? 'Hatırlatıldı' : 'Hatırlatıcı';
          return `<div class="rec-row pl-row${fired ? ' on' : ''}"><button class="rec-play" data-open="${esc(x.id)}"><span class="t">${icon(x.kind === 'rec' ? 'rec' : 'bell')}${esc(x.title)}</span><small>${esc(x.chName)} · ${esc(planWhen(x, now))} · ${what}</small></button><button class="icon-btn" data-del="${esc(x.id)}" aria-label="Kaldır">${icon('trash')}</button></div>`;
        }).join('');
        const note = nativePlugin ? '' : '<p class="hint">Tarayıcıda hatırlatıcılar yalnız sayfa açıkken çalışır; zamanlı kayıt Android uygulamasındadır.</p>';
        box.innerHTML = `${warn}${rows || '<p class="hint">Henüz plan yok. TV Rehberi’nde bir programa dokunup “Hatırlat” ya da “Kaydet”i seçin.</p>'}${note}`;
      };
      body.addEventListener('click', async (e) => {
        const del = e.target.closest('[data-del]');
        if (del) {
          setPlans(removePlan(readPlans(), del.dataset.del));
          toast('Plan kaldırıldı', 1600);
          return draw();
        }
        if (e.target.closest('[data-a="perm"]')) {
          if (nativePlugin) await nativePlugin.planPermissions().catch(() => {});
          else await ensurePlanPermissions();
          return setTimeout(draw, 600);
        }
        const open = e.target.closest('[data-open]');
        const x = open && readPlans().find((y) => y.id === open.dataset.open);
        if (x) closeThen(sh, () => openPlanChannel(x.chId, x.src));
      });
      draw();
    },
  });
}

// ------------------------------------------------------------------ yenilikler

// Güncellemeden sonra görülmemiş yenilikleri bir kez gösterir (all: son kayıtların hepsini, elle açılışta).
function whatsNewSheet(all = false) {
  const list = all ? CHANGELOG.slice(0, 6) : unseenEntries(store.pref('seen.changelog', null), store.sources().length > 0);
  store.setPref('seen.changelog', LATEST_ID);
  if (!list.length) return all ? toast('Gösterilecek yenilik yok') : undefined;
  openSheet({
    title: 'Yenilikler',
    html: list.map((e) => `<div class="wn"><b>${esc(e.title)}</b><ul>${e.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join(''),
  });
}

// Açılışta (şifre ekranı, oynatıcı ya da başka pencere yokken) yenilikleri göster.
function maybeWhatsNew() {
  if (pad.isOpen() || pui.isOpen() || pui.isPreviewing() || document.querySelector('.sheet-back, .pg')) return;
  if (store.pref('seen.changelog', null) === LATEST_ID) return;
  whatsNewSheet();
}

// ------------------------------------------------------------------ yedekle / geri yükle

// Yedek dosyasında kullanıcı adı/parola bulunur: uygulama şifresi açıksa hem kaydetmek hem geri yüklemek şifre ister.
async function backupGuard() {
  return !lockEnabled() || askPin('Şifre', 'Yedekleme için uygulama şifrenizi girin');
}

async function saveBackupFile() {
  const text = JSON.stringify(makeBackup(store), null, 1);
  const name = backupFileName();
  if (nativePlugin) {
    const r = await nativePlugin.saveText({ name, text, mime: 'application/json' });
    return toast('Yedek kaydedildi: ' + ((r && r.where) || 'cihaz'), 4000);
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Yedek indirildi', 3000);
}

function backupSheet() {
  const sh = openSheet({
    title: 'Yedekle / geri yükle',
    html: `<p class="hint">Kaynaklar (kullanıcı adı ve parola dahil), favoriler, kategori düzeni, izleme geçmişi ve ayarlar tek dosyaya kaydedilir. Dosyayı başkasıyla paylaşmayın. Uygulama şifresi ve dosyadan eklenen listeler yedeğe girmez.</p><button class="list-item" id="bk-save"><span class="t">Yedeği kaydet</span></button>${nativePlugin && !isTvUi() ? '<button class="list-item" id="bk-sync"><span class="t">TV ile eşitle<small>Aynı Wi‑Fi’deki TV ile kaynak, favori, izleme geçmişi ve kategori düzenini karşılıklı tamamlar; iki cihazda var olan hiçbir şey değişmez</small></span></button>' : ''}<label class="field"><span>Yedekten geri yükle</span><input id="bk-file" type="file" accept=".json,application/json"><small>Daha önce kaydettiğiniz yedek dosyasını seçin.</small></label><div id="bk-sum"></div>`,
    mount: (body) => {
      const syncBtn = $('#bk-sync', body);
      if (syncBtn) {
        syncBtn.addEventListener('click', () => {
          sh.close();
          castUi.syncWithTv();
        });
      }
      $('#bk-save', body).addEventListener('click', async () => {
        if (!(await backupGuard())) return;
        try {
          await saveBackupFile();
        } catch (err) {
          toast('Yedek kaydedilemedi: ' + String((err && err.message) || err), 4000);
        }
      });
      $('#bk-file', body).addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        const box = $('#bk-sum', body);
        box.innerHTML = '';
        if (!file) return;
        let parsed;
        try {
          parsed = parseBackup(await file.text());
        } catch {
          parsed = { ok: false, error: 'Dosya okunamadı' };
        }
        if (!parsed.ok) {
          box.innerHTML = `<p class="err-text">${esc(parsed.error)}</p>`;
          return;
        }
        const m = parsed.summary;
        box.innerHTML = `<p>${m.sources} kaynak · ${m.favs} favori · ${m.folders} klasör · ${m.prefs} ayar${m.at ? ` (${esc(fmtRecDate(m.at))})` : ''}</p><p class="hint">Şu anki kaynaklar, favoriler, kategori düzeni ve ayarlar bunlarla değiştirilir.</p><button class="btn danger" id="bk-go">Geri yükle</button>`;
        $('#bk-go', box).addEventListener('click', async () => {
          if (!(await backupGuard())) return;
          applyBackup(store, parsed.backup);
          sh.close();
          toast('Yedek geri yüklendi, uygulama yenileniyor…', 2500);
          setTimeout(() => location.reload(), 700);
        });
      });
    },
  });
}

// ------------------------------------------------------------------ uygulama şifresi

const pad = createPinPad();

// ------------------------------------------------------------------ telefondan TV'ye oynatma

// Gönderen (telefon): seçilen TV'de oynatır, kumanda sayfasını açar. Alıcı (TV): gelen isteği oynatıcıda açar.
const castUi = createCastUI({
  plugin: nativePlugin,
  store,
  pad,
  toast,
  icon,
  esc,
  openSheet,
  openPage,
  fmtDuration,
  isTv: () => isTvUi() || tvDetected,
  playCast: ({ item, targets, startAt }) => pui.open(item, targets, { ep: null, startAt, ctx: null }),
  stopCast: () => {
    if (pui.isOpen()) pui.close();
  },
  guard: () => backupGuard(),
  onSynced: () => afterSync(),
});

// Eşitlemeden sonra ekran yeni veriyle tazelenir (kaynak hiç yoktuysa uygulama yenilenir, yedek geri yüklemedeki gibi).
function afterSync() {
  if (!S.source && store.sources().length) {
    toast('Veriler eşitlendi, uygulama yenileniyor…', 2500);
    setTimeout(() => location.reload(), 700);
    return;
  }
  if (S.source) S.prog = store.progressAll(S.source.id);
  renderTab();
}

function castItem(item, ep, { startMs = 0, ctx = null, closePlayer = false } = {}) {
  const targets = targetsOf(item, ep);
  if (!targets.length) return toast('Bu içerik için oynatma adresi bulunamadı');
  if (item.kind !== 'series' && item.kind !== 'recording') store.pushRecent(sid(), item);
  const live = item.kind === 'live';
  let idx = ctx && live ? ctx.index : -1;
  castUi.sendToTv({
    item,
    ep,
    targets,
    startMs: live ? 0 : startMs,
    onSent: async () => {
      if (!closePlayer || !pui.isOpen()) return;
      pui.close();
    },
    onProgress: live ? null : (pos, dur) => saveProgress(item, ep, pos, dur),
    // canlıda telefondan kanal değiştirme: bulunduğumuz listede bir önceki/sonraki kanal
    step:
      ctx && live && ctx.items.length > 1
        ? (d) => {
            const i = idx + d;
            if (i < 0 || i >= ctx.items.length) return null;
            const it = ctx.items[i];
            const t = targetsOf(it);
            if (!t.length) return null;
            idx = i;
            return { item: it, targets: t };
          }
        : null,
  });
}
const pinRec = () => store.pref('lock.pin', null);
const lockEnabled = () => !!(pinRec() && pinRec().hash);
const catKey = (kind, id) => kind + '|' + id;

// Şifre denemesi: art arda yanlışta bekleme süresi (yeniden başlatınca da sürer).
async function pinCheck(pin) {
  const st = store.pref('lock.fail', emptyFail());
  const w = waitMs(st);
  if (w > 0) return { ok: false, msg: `Çok fazla yanlış deneme. ${fmtWait(w)} sonra deneyin.` };
  if (await checkPin(pin, pinRec())) {
    store.setPref('lock.fail', emptyFail());
    return { ok: true };
  }
  const next = registerFail(st);
  store.setPref('lock.fail', next);
  const w2 = waitMs(next);
  return { ok: false, msg: w2 > 0 ? `Çok fazla yanlış deneme. ${fmtWait(w2)} sonra deneyin.` : `Yanlış şifre (${5 - (next.n % 5)} deneme hakkı kaldı)` };
}

// Mevcut şifreyi sorar; doğru girilirse true.
const askPin = (title, hint, cancelable = true) => pad.prompt({ title, hint, len: pinRec().len, cancelable, check: pinCheck }).then((p) => p != null);

// Yeni şifre: iki kez girilir. Kaydedildiyse true.
async function createPin() {
  const a = await pad.prompt({ title: 'Yeni şifre', hint: `${MIN_LEN}–6 rakam girin, sonra ✓ tuşuna basın`, check: (p) => (isValidPin(p) ? { ok: true } : { ok: false, msg: `En az ${MIN_LEN} rakam girin` }) });
  if (a == null) return false;
  const b = await pad.prompt({ title: 'Şifreyi tekrar girin', hint: 'Aynı şifreyi yeniden yazın, sonra ✓', check: (p) => (p === a ? { ok: true } : { ok: false, msg: 'Şifreler uyuşmuyor, yeniden deneyin' }) });
  if (b == null) return false;
  store.setPref('lock.pin', await makeRecord(a));
  store.setPref('lock.fail', emptyFail());
  return true;
}

let appLocked = false;
// Uygulamayı kilitler: oynatıcı kapanır, şifre girilene kadar hiçbir şey görünmez.
async function lockApp() {
  if (appLocked || !lockEnabled()) return;
  appLocked = true;
  if (pui.isOpen()) pui.close();
  if (pui.isPreviewing()) {
    await pui.endPreview();
    S.pv = null;
    renderSpInfo();
  }
  multiSuspend();
  S.unlocked.clear();
  await askPin('Şifre', 'Uygulama şifrenizi girin', false);
  appLocked = false;
  S.hiddenAt = null;
  if (!pui.isOpen()) multiResume();
  if (S.source) refreshList(true);
  setTimeout(() => maybeWhatsNew(), 600);
}

// Kilitli kategoriye girmeden önce (oturumda bir kez) şifre sorar.
async function ensureUnlocked(kind, id) {
  if (!lockEnabled() || !isLocked(prefsOf(kind), id) || S.unlocked.has(catKey(kind, id))) return true;
  const ok = await askPin('Kilitli kategori', 'Açmak için uygulama şifresini girin');
  if (ok) S.unlocked.add(catKey(kind, id));
  return ok;
}

// Düzenle kipinde kilit düğmesi: şifre yoksa önce şifre oluşturulur; kilidi kaldırmak şifre ister.
async function toggleCatLock(kind, id) {
  const prefs = prefsOf(kind);
  if (isLocked(prefs, id)) {
    if (lockEnabled() && !(await askPin('Kilidi kaldır', 'Kategorinin kilidini kaldırmak için şifreyi girin'))) return;
  } else if (!lockEnabled() && !(await createPin())) return;
  const wasLocked = isLocked(prefs, id);
  savePrefs(kind, toggleLocked(prefs, id));
  if (!wasLocked) S.unlocked.delete(catKey(kind, id));
  refreshList(true);
}

function lockSheet() {
  const on = lockEnabled();
  const sh = openSheet({
    title: 'Uygulama şifresi',
    html: on
      ? `<p class="hint">Uygulama açılırken ve arka plandan dönünce şifre istenir. Kategorileri kilitlemek için Ayarlar yerine kategori listesinde “Düzenle”yi kullanın. Şifreyi unutursanız uygulama verilerini Android ayarlarından silmeniz gerekir.</p><div class="sel-row"><span>Şifre isteme zamanı</span><select id="lk-after">${optionsHtml(AFTER_OPTIONS, normalizeAfter(store.pref('lock.after', DEFAULT_AFTER)))}</select></div><button class="list-item" id="lk-change"><span class="t">Şifreyi değiştir</span></button><button class="list-item" id="lk-off"><span class="t">Şifreyi kaldır</span></button>`
      : `<p class="hint">Uygulamayı ve seçtiğiniz kategorileri (çocuk kilidi) şifreyle koruyun. Şifre ${MIN_LEN}–6 rakamdır. Şifreyi unutursanız uygulama verilerini Android ayarlarından silmeniz gerekir.</p><button class="list-item" id="lk-on"><span class="t">Şifre belirle</span></button>`,
    mount: (body) => {
      body.addEventListener('click', async (e) => {
        const id = e.target.closest('button') && e.target.closest('button').id;
        if (id === 'lk-on') {
          if (await createPin()) {
            sh.close();
            toast('Uygulama şifresi açıldı');
          }
        } else if (id === 'lk-change') {
          if ((await askPin('Mevcut şifre', 'Önce şu anki şifrenizi girin')) && (await createPin())) {
            sh.close();
            toast('Şifre değiştirildi');
          }
        } else if (id === 'lk-off') {
          if (await askPin('Şifreyi kaldır', 'Kaldırmak için şifrenizi girin')) {
            store.setPref('lock.pin', null);
            sh.close();
            toast('Uygulama şifresi kaldırıldı');
            refreshList(true);
          }
        }
      });
      const af = $('#lk-after', body);
      if (af) af.addEventListener('change', (e) => store.setPref('lock.after', normalizeAfter(e.target.value)));
    },
  });
}

// ------------------------------------------------------------------ olaylar ve başlangıç

$('#btn-source').addEventListener('click', () => (store.sources().length ? sourceSwitcher() : sourceForm()));
$('#btn-refresh').addEventListener('click', () => refreshCatalog());
$('#btn-home').addEventListener('click', () => {
  const k = TAB_KIND[S.tab];
  if (k && S.group[k] != null) return leaveGroup(k); // tek geri oku: önce kategori listesine, sonra ana ekrana
  setTab('home');
});
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
// Listeler yalnız görünen satırları çizer; her çizimden sonra sığmayan adlar kayan yazıya çevrilir.
document.addEventListener('vl-draw', (e) => marquee(e.target));
setInterval(tickClock, 20000);
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) setTab(b.dataset.tab);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    S.hiddenAt = Date.now();
    return multiSuspend(); // arka planda kutu oynatıcıları (ses dahil) durur
  }
  if (shouldLock({ enabled: lockEnabled(), after: store.pref('lock.after', DEFAULT_AFTER), hiddenAt: S.hiddenAt })) return lockApp();
  if (!pui.isOpen()) multiResume();
  if (S.source && !S.loading && S.cat.fetchedAt && Date.now() - S.cat.fetchedAt > staleCatalogMs()) refreshCatalog({ quiet: true });
  checkForUpdate();
});
setInterval(() => {
  if (S.list && S.tab === 'live' && document.visibilityState === 'visible' && !pui.isOpen()) S.list.refreshRows();
}, 60000);

// Kamera çentiği payı: Android'de eklentiden gerçek ölçü gelir (WebView'in env() değeri dönüşte bayat kalabiliyor).
// Yan şeritlerin daha az yer kaplaması için çentik payının bir kısmı kartların iç boşluğuna bırakılır.
const NOTCH_TRIM = 10;
function applyInsets(i) {
  if (!i) return;
  const st = document.documentElement.style;
  for (const k of ['l', 't', 'r', 'b']) st.setProperty('--na-' + k, Math.max(0, Math.round((Number(i[k]) || 0) - NOTCH_TRIM)) + 'px');
  layoutPreview();
}
if (nativePlugin) {
  nativePlugin.getInsets().then(applyInsets).catch(() => {});
  nativePlugin.addListener('insets', applyInsets).catch(() => {});
}

// TV kumandası / klavye: yön tuşlarıyla gezinme, Tamam ile dokunma. Android TV'de (ya da ?tv=1 ile) kumanda kipi baştan açıktır.
const dpad = initDpad({ topLayer });
let tvDetected = /[?&]tv=1\b/.test(location.search);
// TV modu (ayarlardan Otomatik/Açık/Kapalı): açıkken kumanda kipi, büyük yazı ve geniş kenar boşlukları; yerelde ayrıca yatay kilit.
function applyTvMode() {
  const on = resolveTv(store.pref('set.tvmode', DEFAULT_TV_MODE), tvDetected);
  dpad.setTv(on);
  if (nativePlugin) nativePlugin.setTvMode({ on }).catch(() => {});
  layoutPreview();
}
applyTvMode();
if (nativePlugin) {
  nativePlugin.isTv().then((r) => {
    tvDetected = tvDetected || !!(r && r.tv);
    applyTvMode();
    castUi.startReceiver(); // TV'de varsayılan açık: telefondan gelen oynatma isteklerini karşılar
  }).catch(() => {});
  nativePlugin.addListener('remote', (e) => e && e.key && dpad.sendKey(e.key)).catch(() => {}); // kanal +/-, medya, menü tuşları
  // Sistem PiP penceresinden uygulamaya dönünce küçük pencere ve video deliği yeniden ölçülür
  nativePlugin.addListener('pip', (e) => {
    if (e && !e.active) setTimeout(() => { layoutPreview(); syncHole(); }, 150);
  }).catch(() => {});
  castUi.listen();
  player.on((st) => castUi.nowPlaying(st));
  // Bildirime dokunulunca (uygulama açıkken olay, kapalıyken açılışta sorgu) kanal açılır
  const launchPlan = (e) => e && e.ch && openPlanChannel(e.ch, e.src);
  nativePlugin.addListener('planLaunch', launchPlan).catch(() => {});
  setTimeout(() => nativePlugin.planLaunch().then(launchPlan).catch(() => {}), 1500);
}
setTimeout(syncPlans, 2500); // alarmları kayıtlı listeyle eşitle (yeniden başlatma, güncelleme sonrası)

initNav();
window.__iptv = { S, store, net, setVersion: (v) => (VERSION = v) }; // hata ayıklama ve uçtan uca testler için

(async function boot() {
  if (lockEnabled()) lockApp(); // açılışta şifre ekranı
  const src = store.activeSource();
  if (!src) {
    // İlk açılış: doğrudan kaynak ekleme sayfası (Xtream / M3U bağlantısı / dosyadan).
    renderTop();
    S.tab = 'home';
    renderTab();
    return sourceForm();
  }
  setTimeout(() => checkForUpdate(), 4000); // açılışta sessizce yeni sürüm var mı bak
  setTimeout(() => maybeWhatsNew(), 1800);
  await activate(src.id);
})();
