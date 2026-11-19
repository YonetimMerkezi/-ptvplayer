// Uygulama: kaynaklar, katalog, listeler, detay sayfaları, favoriler, rehber.
import { esc, fmtDuration, fmtClock, debounce, fold, maskUrl } from './util.js';
import { guideBlocks, guideNameParts, guideCatIconName } from './guide.js';
import { createStore } from './store.js';
import { startI18n, loc, LANG_CHOICES, normalizeLang } from './i18n.js';
import { createNet } from './net.js';
import { loadFreeData, matchFree, mergeEpgData } from './epg-free.js';
import {
  loadCatalog, catalogToStorable, catalogFromStorable, emptyCatalog, search, groupList, inGroup,
  playTargets, buildAltIndex, altsOf, loadSeriesInfo, loadVodInfo, peekVodInfo, loadShortEpg, loadEpg, epgSourceUrls, EpgView,
  loadArchiveEpg, archiveTargets, recordTarget,
} from './catalog.js';
import { makePlan, activePlans, addPlan, removePlan, hasPlan, recConflict, planId, planWhen } from './plan.js';
import { parseXtreamLink, normalizeServer } from './xtream.js';
import { createNativeEngine, createWebEngine } from './engine.js';
import { createPlayer } from './player.js';
import { createPlayerUI } from './player-ui.js';
import { fmtBytes, recItem, recEndMessage, recSub, fmtRecDate, isEmptyRec } from './rec.js';
import { makeBackup, parseBackup, applyBackup, backupFileName } from './backup.js';
import { CHANGELOG, LATEST_ID, unseenEntries } from './changelog.js';
import { VirtualList } from './vlist.js';
import { sortItems, SORTS, isSortMode } from './sort.js';
import {
  arrange, toggleHidden, move, resetOrderAndHidden, hiddenGroupNames, addFolder, renameFolder, deleteFolder,
  toggleInFolder, moveInFolder, folderOf, groupKey, folderKey, isLocked, toggleLocked, lockedGroupNames,
  smartSort, newestItems, topRatedItems, CAT_ORDERS, DEFAULT_CAT_ORDER, normalizeCatOrder,
} from './cats.js';
import { initNav, pushLayer, popLayer, topLayer } from './nav.js';
import { nativePlugin as getNativePlugin } from './bridge.js';
import { $, $$, icon, toast, logo, openSheet, openPage, fmtAgo } from './ui.js';
import { marquee } from './marquee.js';
import { holeClip } from './hole.js';
import { THEMES, DEFAULT_THEME, applyTheme, cleanProThemes, isProTheme, previewUrl } from './theme.js';
import { initDpad } from './dpad.js';
import { createHero, heroModel, heroCellW } from './hero.js';
import { Shelves, shelfSizes, ROW_CAPS, SHELF_CAP, normalizeRowCap } from './shelves.js';
import { TV_MODES, DEFAULT_TV_MODE, normalizeTvMode, resolveTv } from './tvmode.js';
import { BUFFER_LEVELS, DEFAULT_BUFFER, normalizeBuffer } from './buffer.js';
import { DECODER_MODES, DEFAULT_DECODER, normalizeDecoder } from './decoder.js';
import { AUDIO_LANGS, SUB_LANGS, normalizeAudioLang, normalizeSubLang } from './langpref.js';
import { expiryInfo, expiryText, expiryPlan, PLAN_DAYS } from './expiry.js';
import { LITE_MODES, DEFAULT_LITE, normalizeLite, applyLite } from './lite.js';
import { CAPTION_LINES, DEFAULT_CAPTION, CAP_FS, normalizeCaption, captionPx, applyCaption } from './caption.js';
import { RECONNECT_MODES, STALL_LEVELS, DEFAULT_RECONNECT, DEFAULT_STALL, normalizeReconnect, normalizeStall, retryPolicy } from './retry.js';
import { LIVE_FORMATS, DEFAULT_LIVE_FMT, normalizeLiveFmt, cleanFmtMap, rememberFmt, orderLive, preferFor } from './livefmt.js';
import { createPinPad } from './lockui.js';
import { createCastUI } from './cast-ui.js';
import { REMOTE_KEYS } from './cast.js';
import { clampDelay } from './avsync.js';
import { normalizeNight, DEFAULT_NIGHT } from './night.js';
import { DEFAULT_INTRO, normalizeIntro, pickNextMovie } from './nextup.js';
import { subParams, subLabel, DEFAULT_SUB } from './subtitle.js';
import { PLAYER_ACTIONS, HOME_ACTIONS, DEFAULT_PLAYER, DEFAULT_HOME, COLORS, normalizeKeys, actionFor } from './remote.js';
import { watchNextItems, watchNextPayload, parseDeepLink } from './tvhome.js';
import { AFTER_OPTIONS, DEFAULT_AFTER, MIN_LEN, normalizeAfter, isValidPin, makeRecord, checkPin, emptyFail, registerFail, waitMs, fmtWait, shouldLock } from './lock.js';
import { createMultiEngine, createSlotSupervisor, fitSlots } from './multi.js';
import { AUTO_CHECK_MS, LAUNCH_CHECK_MS, UPDATE_BASE, checkUpdate, explainError, fmtMB, isNewer, retry, shouldAutoCheck, versionCodeOf } from './update.js';
import { checkStreamHealth } from './health.js';
import { runInternetSpeedTest } from './speedtest.js';
import { recordResult, lastResult, pruneHist, hideChannels, restoreChannels, applyHidden, hiddenCount } from './hhist.js';
import { KID_KINDS, normalizeAllow, allowSet, filterAllowed, applyKid, toggleAllowed, setAllowed, pruneAllow, hasAllowed, countAllowed, kidActiveOf } from './kid.js';
import { searchAll } from './multisearch.js';
import { PLAYER_TOOLS, normalizeLabels } from './ptools.js';
import { isPlay, loadDist } from './dist.js';
import { finishIntro } from './intro.js';
import { redeem, syncManaged, fetchConfig, giftFor, deviceId, fmtDeviceId, CHECK_MS, LAUNCH_MS } from './managed.js';
import { BIND_URL, subId, bestToken, callClaim, nextBind, bindAllowed, bindDue } from './devbind.js';
import { buildReport, encodeReport, describeReport, pushError } from './report.js';
import { dlId, pickTarget, makeMeta, parseMeta, dlName, buildVersionIndex, versionsOf, pctOf, dlSub, sortJobs, summary, seriesDone, isActive, isDone } from './dl.js';
import { recommendMovies } from './movie-recommendations.js';
import { loadStations, listStations, radioItem, radioFavs, isRadioFav, toggleRadioFav, countClick, RADIO_COUNTRY_KEY, LIST_RADIO_PREFIX } from './radio.js';
import { radioRowHtml, homeRadio, openRadio as openRadioPage } from './radio-ui.js';
import { genreChips, pickMovies, SURPRISE_ID } from './genre-picks.js';
import { catArtId, catArtImg } from './cat-art.js';
import { loadMovieMetadata, parseMovieCatalogTitle, resolveTitleOrigin } from './movie-metadata.js';
import { loadSeriesMetadata } from './media-scan.js';
import { translateToTr } from './translate.js';
import { createFilmResolver } from './film-lookup.js';
import { findTrailerOnYoutube, describeFind } from './yt-search.js';
import { loadVizyon, sourcesNote } from './vizyon.js';
import { loadDetail, peopleOf, searchPerson, loadNewReleases, buildTitleIndex, findInLibrary, hasExactTitle, trailerIds, trailerQuery, trailerTitle } from './cinemeta.js';
import { loadTrNames } from './tr-names.js';
import { loadPersonPhotos, nameKey } from './people-photos.js';
import { createHeroTrailer } from './hero-trailer.js';
import { createHeroStage } from './hero-stage.js';
import { trailerHtml, trailerLockedHtml, wireTrailer, peopleHtml, actorHtml, actorLoadingHtml, titleInfoHtml, releasesRowHtml, releasesPageHtml } from './title-ui.js';
import { LOCAL_SRC, buildPlaylist } from './local-media.js';
import { createLibrary } from './library-ui.js';
import { homeContinue, homeRecent, statusText, RECENT_TABS, recentLatest, recentTabPick } from './home-extras.js';
import { normalizeOrder, moveSection, isDefaultOrder, sectionLabel, HOME_SECTIONS } from './home-order.js';
import { cleanTitle } from './titleclean.js';
import { hueOf } from './music-order.js';
import { PRO_FEATURES, PREVIEWS, TIERS, TRIAL_DAYS, BILLING_READY, setBillingReady, enforced, memberState, canUse, canUseApp, proFeature, stateText, normalizePreview, setProGate, needPro } from './membership.js';
import { PRODUCT_IDS, PLAY_PRODUCTS, nextEnt, offerText } from './billing.js';
import { loadMovieAdvisories, translateScreenwiseText, advisoryKey } from './movie-advisories.js';
import { createWarm, uniqueEntries } from './warm.js';
import { estimateAdvisories, ESTIMATE_LABEL, ESTIMATE_ICON } from './advisory-estimate.js';
import { normalizeFollowed, toggleFollowed, isFollowed } from './series-follow.js';

const Cap = window.Capacitor;
const nativePlugin = getNativePlugin('IptvPlayer');
const store = createStore();
startI18n({ pref: store.pref('set.lang', 'auto'), device: (typeof navigator !== 'undefined' && navigator.language) || '' }); // Türkçe / İngilizce: ekrana basılan metinleri çevirir (i18n.js)
const net = createNet(nativePlugin ? { native: nativePlugin, convertFileSrc: (p) => Cap.convertFileSrc(p) } : {});

const CAT_KEY = { live: 'live', movie: 'movies', series: 'series' };
const CAT_UNIT = { live: 'kanal', movie: 'film', series: 'dizi' }; // kategori kartındaki sayının birimi
// Çocuk profili: açıkken katalog yalnız izinli kategorileri içerir (setCatalog), ayarlar/kaynaklar gizlenir, çıkış çocuk-modu şifresiyle olur.
const kidPinRec = () => store.pref('kid.pin', null);
const kidActive = () => kidActiveOf(store.pref('kid.on', false), kidPinRec());
const kidAllow = () => normalizeAllow(store.pref('kid.allow', {}));
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
// rem'in gerçek karşılığı (16 px'e oranı): TV'de kök yazı 18 px'tir ve yazı boyutu ayarıyla çarpılır. Kutudaki ad alanı CSS'te rem ile
// ölçüldüğünden, kutu yüksekliğini hesaplayan kod da bu oranı kullanır; yoksa ad alanı afişten yer çalar (afiş basık görünür).
const remScale = () => (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;
function applyFontScale() {
  document.documentElement.style.setProperty('--fs', String(fontScale()));
}
applyFontScale();
// ---- Üyelik (membership.js): deneme → Standart → Pro. Satın alma bağlanana kadar kilitler kapalıdır; yönetici açıkken Ayarlar > Üyelik'teki
// önizleme seçimi kilitli hâli yalnız bu cihazda dener.
const memPreview = () => (store.pref('adm.on', false) ? normalizePreview(store.pref('mem.preview', '')) : '');
const memOn = () => enforced(memPreview());
function memState() {
  let start = Number(store.pref('mem.start', 0));
  if (!start) {
    start = Date.now();
    store.setPref('mem.start', start);
  }
  return memberState({ start, ent: store.pref('mem.ent', null), gift: store.pref('mem.gift', null), preview: memPreview() });
}
// Sessiz soru: özellik bu üyelikte açık mı? (kilitler kapalıysa her şey açık)
const proOk = (feature) => !memOn() || canUse(feature, memState());
const memBlocked = () => memOn() && !canUseApp(memState());
// Fragman tümüyle Pro'dur (deneme dahil): Pro değilken ekranda oynatıcı ve YouTube araması yerine kilitli kart çıkar.
// Otomatik oynatma ayrıca "Fragmanı otomatik oynat" ayarına bağlıdır.
const trailerLocked = () => memOn() && !proOk('trailer');
const trailerAutoOn = () => setting('trailerAuto') && proOk('trailer');
// Oyuncu ayrıntıları (fotoğraf, oyuncu sayfası) Pro'dur; kilitliyken kadro adları görünür, başlıkta PRO işareti çıkar.
const actorsLocked = () => memOn() && !proOk('actors');
setProGate((feature, silent) => {
  if (proOk(feature)) return true;
  if (!silent) memberSheet(feature);
  return false;
});
// Google Play aboneliği: etkin abonelik listesi Play'den okunur (açılışta ve uygulama öne gelince); hak değişirse ekran yenilenir.
// Sorgu başarısızsa (çevrimdışı) son hak tolerans süresince korunur. Yalnız Play sürümünde çalışır.
let billingBusy = false;
let billingAgain = false;
// Tek cihaz kuralı: abonelik bir telefona ve bir TV'ye bağlıdır (devbind.js, server/). Başka cihaza bağlıysa bu cihazda hak verilmez
// (mem.bind.other); sunucuya ulaşılamazsa son doğrulamadan sonra 7 gün tolerans. Adres tanımlı değilse kural kapalıdır.
const memBind = () => store.pref('mem.bind', null);
const bindKind = () => (isTvUi() ? 'tv' : 'phone');
async function oneDevice(ent, ids, tokens) {
  if (!BIND_URL) return ent;
  let bind = memBind();
  if (!ent || !ent.play) {
    if (bind && Array.isArray(ids)) store.setPref('mem.bind', null); // abonelik bitti: bağlama anlamsız
    return ent;
  }
  const token = Array.isArray(ids) ? bestToken(ids, tokens) : '';
  if (token) {
    const sub = await subId(token);
    if (!bind || bind.s !== sub || bindDue(bind)) {
      bind = nextBind({ bind, sub, result: await callClaim({ sub, dev: deviceId(store), kind: bindKind() }) });
      store.setPref('mem.bind', bind);
    }
  }
  return bindAllowed(bind) ? ent : null;
}
// "Bu cihazı kullan": üyeliği bu cihaza taşır, öteki cihaz bir sonraki yoklamasında kapanır. → 'ok' | 'limit' | 'none' | 'error' (+ limit için tarih)
async function takeOverMembership() {
  if (!BIND_URL || !nativePlugin) return { status: 'error' };
  let r;
  try {
    r = await nativePlugin.billingState();
  } catch {
    return { status: 'error' };
  }
  const token = bestToken(Array.isArray(r && r.active) ? r.active : [], r && r.tokens);
  if (!token) return { status: 'none' };
  const sub = await subId(token);
  const result = await callClaim({ sub, dev: deviceId(store), kind: bindKind(), take: true });
  if (!result) return { status: 'error' };
  store.setPref('mem.bind', nextBind({ bind: memBind(), sub, result }));
  await syncBilling();
  return { status: result.status === 'ok' ? 'ok' : result.status, next: result.next };
}
// Taşıma düğmeleri (üyelik penceresi ve üyelik duvarı) bunu çağırır; onTaken: taşıma başarılıysa ekranı yenilemek için.
async function takeOverFlow(onTaken) {
  const r = await takeOverMembership();
  if (r.status === 'ok') {
    toast('Üyelik bu cihaza taşındı');
    onTaken && onTaken();
  } else if (r.status === 'limit') {
    toast(`Üyelik son 30 günde 2 kez taşındı. ${new Date(r.next).toLocaleDateString(loc())} tarihinden sonra yeniden taşıyabilirsiniz`, 6000);
  } else if (r.status === 'none') toast('Bu Google hesabında etkin üyelik bulunamadı', 4000);
  else toast('Üyelik sunucusuna ulaşılamadı. İnternetinizi denetleyip yeniden deneyin', 4000);
}
async function syncBilling() {
  if (!BILLING_READY || !nativePlugin) return;
  if (billingBusy) {
    billingAgain = true; // sorgu sürerken yeni istek geldi (ör. satın alma bitti): bitince bir kez daha sor
    return;
  }
  billingBusy = true;
  try {
    let ids = null;
    let tokens = {};
    try {
      const r = await nativePlugin.billingState();
      ids = Array.isArray(r && r.active) ? r.active : [];
      tokens = (r && r.tokens) || {};
    } catch {
      ids = null;
    }
    const cur = store.pref('mem.ent', null);
    const next = await oneDevice(nextEnt({ ids, current: cur }), ids, tokens);
    if (next || cur) store.setPref('mem.ent', next);
    if ((next && next.tier) !== (cur && cur.tier)) {
      applyTheme(themeAllowed(store.pref('set.theme', DEFAULT_THEME)));
      renderTab();
    }
  } finally {
    billingBusy = false;
    if (billingAgain) {
      billingAgain = false;
      syncBilling();
    }
  }
}
// Pro temalar yönetici panelinde işaretlenir; son bilinen liste cihazda saklanır (null: hiç işaretlenmemiş, varsayılan geçerli).
const proThemeList = () => store.pref('cfg.proThemes', null);
const themeLocked = (id) => isProTheme(id, proThemeList()) && !proOk('themes');
const themeAllowed = (id) => (themeLocked(id) ? DEFAULT_THEME : id);
applyTheme(themeAllowed(store.pref('set.theme', DEFAULT_THEME)));
// Hafif mod (animasyon/gölge/bulanıklık kapalı) ve devam çubuklarını gizleme: kök öğede işaret, CSS uygular.
const applyLiteMode = () => applyLite(store.pref('set.lite', DEFAULT_LITE), document, navigator);
const applyViewPrefs = () => {
  document.documentElement.toggleAttribute('data-noprog', !setting('showProg'));
  document.documentElement.toggleAttribute('data-nothumb', !setting('epThumbs'));
};
applyLiteMode();
applyViewPrefs();
applyCaption(store.pref('set.caption', DEFAULT_CAPTION), document);
let VERSION = 'geliştirme';
import('./version.js').then((m) => { VERSION = m.VERSION; restoreUpd(); if (S.tab === 'sources' && S.source) renderTab(); }).catch(() => {});

// Çok renkli temalarda liste öğeleri sırayla paletin altı rengini alır (CSS: html[data-multi] .k0…k5); diğer temalarda etkisizdir.
const kc = (i) => ' k' + (i % 6);

const S = {
  linkErr: false, // son liste yenilemesi başarısız mı (ana ekrandaki bağlantı durumu için)
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
  backCat: null, // kategoriden geri çıkılınca imlecin döneceği kategori: { kind, id } (bir kez kullanılır)
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
engine = nativePlugin ? createNativeEngine(nativePlugin, onEngine, () => normalizeBuffer(store.pref('set.buffer', DEFAULT_BUFFER)), (e) => recEvent(e), () => clampDelay(store.pref('audioDelay', 0)), () => normalizeNight(store.pref('night', DEFAULT_NIGHT)), (e) => dlEvent(e), () => !!store.pref('dialog', false)) : createWebEngine({ video, Hls: window.Hls, on: onEngine });
// Yeniden bağlanma davranışı Genel ayarlar › Yayın bağlantısı'ndan okunur (her denemede güncel değer)
const policy = () => retryPolicy({ reconnect: store.pref('set.reconnect', DEFAULT_RECONNECT), stall: store.pref('set.stall', DEFAULT_STALL) });
// Yedek adres (öteki biçim) kesintisiz oynadıysa kanal için hatırlanır; sonraki açılışta o biçim başa alınır (Genel ayarlar › Canlı yayın biçimi).
const LIVE_FMT_KEY = 'live.fmt';
const onSteady = (target) => {
  const item = player && player.state().item;
  if (!item || item.kind !== 'live' || !target || target.alt) return;
  const map = cleanFmtMap(store.pref(LIVE_FMT_KEY, {}));
  const next = rememberFmt(map, item.id, target.mime);
  if (next !== map) store.setPref(LIVE_FMT_KEY, next);
};
player = createPlayer({ engine, policy, onSteady });
// Altyazı görünümü (boyut, renk, arka plan): kayıtlı seçim açılışta ve her değişiklikte oynatıcı eklentisine iletilir.
const applySubtitleStyle = () => {
  if (engine.setSubtitleStyle) Promise.resolve(engine.setSubtitleStyle(subParams(store.pref('sub', DEFAULT_SUB)))).catch(() => {});
};
applySubtitleStyle();
const pui = createPlayerUI({
  engine,
  player,
  env: {
    native: !!nativePlugin,
    canRecord: !!engine.rec,
    recStart: (item, maxMs) => (needPro('rec') ? engine.rec.start(item.name, maxMs) : Promise.reject(new Error('Kayıt Pro üyelikle açılır'))),
    recStop: () => engine.rec.stop(),
    playRecording: (r, ctx) => startPlay(recItem(r), { ctx }),
    isTv: () => isTvUi() || tvDetected, // TV'de resim içinde resim ve küçük oynatıcı yok
    canCast: () => !!nativePlugin && !isTvUi(),
    castTo: (st, ctx) => castItem(st.item, st.ep, { startMs: st.pos, ctx, closePlayer: true }),
    // Oynatıcıdaki İndir: film ya da dizi bölümü (indirilmiş yerel kopya, canlı ve kayıt hariç)
    canDownload: (st) => dlOk() && !!st.item && (st.item.kind === 'movie' || (st.item.kind === 'series' && !!st.ep)) && !/^file:/i.test(((st.targets || [])[st.idx || 0] || {}).url || ''),
    download: (st) => dlFromPlayer(st),
    epg: (it) => S.epg.nowNext(it),
    shortEpg: (it) => (S.source ? loadShortEpg(S.source, net, it, 4).catch(() => []) : Promise.resolve([])),
    isFav: (it) => (it.radio ? isRadioFav(store, it.id) : it.localMedia && it.audio ? store.isFav(LOCAL_SRC, it.id) : !!S.source && store.isFav(S.source.id, it.id)),
    toggleFav: (it) => toggleFav(it),
    liveCategories: () => playerCategories(),
    liveItems: (key) => (key === '__all' ? visibleAll('live') : itemsOfGroup('live', key)),
    unlockCat: (key) => ensureUnlocked('live', key),
    playLive: (items, index, meta) => playLive(items, index, meta),
    onEpgSheet: (it) => epgSheet(it),
    pref: (k, d) => store.pref(k, d),
    setPref: (k, v) => store.setPref(k, v),
    langPref: () => ({ audio: normalizeAudioLang(store.pref('set.audioLang', 'auto')), sub: normalizeSubLang(store.pref('set.subLang', 'auto')), subIfMissing: setting('subMissing') }),
    autoNext: () => setting('autoNext'),
    autoOrient: () => setting('autoOrient'),
    intro: () => normalizeIntro(store.pref('set.intro', DEFAULT_INTRO)),
    previewRect,
    onMiniPlayer: (active) => {
      S.miniplayer = !!active;
      if (active) scheduleOrientation(900); // yatay kilit kalkınca dönüş bitsin, düzen farklıysa liste yeniden kurulur
      updateMiniPlayerOverlay();
      if (active) setTimeout(layoutPreview, 0);
    },
    onPreviewEnd: () => syncHole(), // önizleme/küçük oynatıcı kapandı: video deliği kapanır
    onPreviewStep: (d) => previewStep(d),
    onClose: () => {
      multiResume(); // tam ekrandan dönünce çoklu ekran kutuları yeniden başlar
      scheduleOrientation(900); // yön kilidi kalkınca dönüş bitsin, sonra düzen farklıysa liste yeniden kurulur
    },
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
  if (item && item.localMedia) { // cihazdaki dosya: kaynak seçili olmasa da kaldığı yer kaydedilir
    store.setProgress(LOCAL_SRC, { id: item.id, kind: item.kind, name: item.name, logo: '' }, pos, dur);
    return;
  }
  if (!S.source) return;
  const e = ep
    ? { id: ep.id, kind: 'episode', name: `${item.name} · ${ep.label}`, logo: item.logo, parent: item.id }
    : { id: item.id, kind: item.kind, name: item.name, logo: item.logo };
  store.setProgress(S.source.id, e, pos, dur);
  S.prog = store.progressAll(S.source.id);
}

player.onProgress((pos, dur, st) => {
  if (st.item.kind === 'live' || st.item.kind === 'recording' || st.item.cast) return;
  if (st.item.localMedia) return saveProgress(st.item, null, pos, dur);
  if (!S.source) return;
  saveProgress(st.item, st.ep, pos, dur);
  if (Date.now() - wnLast >= WN_EVERY_MS) {
    wnLast = Date.now(); // oynarken TV satırı en çok dakikada bir güncellenir
    syncWatchNext();
  }
});

// Açılamayan canlı kanal işaretlenir; yedek adres oynadıysa asıl kanal da işaretlenir, asıl oynarsa işaret kalkar.
player.on((st) => {
  if (!S.source || !st.item || st.item.kind !== 'live' || st.item.cast || st.item.radio || !st.targets) return;
  if (st.status === 'error') {
    if (typeof navigator === 'undefined' || navigator.onLine !== false) markBad(st.item.id, true);
  } else if (st.status === 'playing') {
    const t = st.targets[st.idx];
    markBad(st.item.id, !!(t && t.alt));
  }
});

// Android TV ana ekranı: yarıda bırakılan film ve bölümler "Devam et" satırında görünür (yalnız TV'de; telefonda yapılmaz).
let wnTimer = 0;
let wnLast = 0;
const WN_EVERY_MS = 60000;
function syncWatchNext(now) {
  if (!nativePlugin || !nativePlugin.tvSyncWatchNext || !tvDetected || !S.source) return;
  const kid = kidActive(); // çocuk modunda TV ana ekranına izleme geçmişi taşınmaz (satır boşaltılır)
  clearTimeout(wnTimer);
  const run = () => {
    nativePlugin.tvSyncWatchNext({ items: kid ? [] : watchNextPayload(watchNextItems(store.continueWatching(S.source.id)), S.source.id) }).catch(() => {});
  };
  if (now) run();
  else wnTimer = setTimeout(run, 2500);
}
player.on((st) => st.status === 'idle' && syncWatchNext());
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && syncWatchNext(true));

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
  // Çocuk modunda yalnız izinli kategoriler kalır (liste, arama, favoriler, rehber, yedek kanal hepsi bu kataloğu kullanır).
  // Gizlenen kanallar tüm görünümlerden (kategori sayıları, arama, rehber, yedek kanal) bir arada kalkar; ham katalog saklanır
  const base = kidActive() && S.source ? applyKid(raw, kidAllow(), S.source.id) : raw;
  const hid = hiddenMap();
  const cat = hiddenCount(hid) ? { ...base, live: applyHidden(base.live, hid) } : base;
  S.rawCat = raw;
  S.cat = cat;
  S.altIdx = null;
  S.verIdx = null; // film sürümleri dizini (indirme seçenekleri) yeniden kurulur
  S.idx = {
    live: new Map(cat.live.map((i) => [i.id, i])),
    movies: new Map(cat.movies.map((i) => [i.id, i])),
    series: new Map(cat.series.map((i) => [i.id, i])),
  };
  S.groups = { live: groupList(cat.live), movie: groupList(cat.movies), series: groupList(cat.series) };
  pruneGroups();
  renderKidChrome();
  watchExpiry();
}

// Oynatma adresleri; canlı kanalda aynı adlı kanallar yedek olarak sona eklenir.
function targetsOf(item, ep) {
  if (item.kind !== 'live') return playTargets(S.source, item, ep);
  // canlı: hatırlanan (ya da ayardaki) biçim başa alınır
  const prefer = preferFor(normalizeLiveFmt(store.pref('set.liveFmt', DEFAULT_LIVE_FMT)), cleanFmtMap(store.pref(LIVE_FMT_KEY, {})), item.id);
  if (!setting('altCh')) return orderLive(playTargets(S.source, item, ep), prefer); // Genel ayarlar: yedek kanal denemesi kapalı
  if (!S.altIdx) S.altIdx = buildAltIndex(S.cat.live);
  return orderLive(playTargets(S.source, item, ep, altsOf(S.altIdx, item)), prefer);
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
  if (!f) return null;
  return S.cat[CAT_KEY[kind]].find((i) => (i.f || fold(i.name)) === f) || null;
}

function toggleFav(it) {
  if (it.radio) { // internet radyosu: kaynak favorilerine karışmaz; Radyo & Müzik > Favoriler
    const on = toggleRadioFav(store, it);
    toast(on ? 'Favori radyolara eklendi' : 'Favori radyolardan çıkarıldı', 1600);
    pui.refresh();
    fillHomeRadio();
    return on;
  }
  if (it.localMedia && it.audio) { // cihazdaki şarkı: Medya merkezi > Müzik > Favoriler; kaynak favorilerine karışmaz
    const on = store.toggleFav(LOCAL_SRC, it);
    toast(on ? 'Müzik favorilerine eklendi' : 'Müzik favorilerinden çıkarıldı', 1600);
    pui.refresh();
    return on;
  }
  const on = store.toggleFav(sid(), it);
  toast(on ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı', 1600);
  if (S.list) S.list.refreshRows();
  if (S.tab === 'favs' && !on) refreshList();
  pui.refresh();
  queueAutoSync();
  return on;
}

// Favori değişince birkaç saniye sonra (art arda değişiklikler tek eşitlemede) eşleşmiş TV ile kendiliğinden eşitlenir.
let autoSyncTimer = null;
function queueAutoSync() {
  if (!nativePlugin || isTvUi() || tvDetected) return;
  clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => castUi.autoSync({ force: true }), 20000);
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
  finishIntro(); // açılış animasyonu: arayüz ilk kez çizildi
  const stale = !cached || Date.now() - cached.fetchedAt > staleCatalogMs();
  if (force || stale) await refreshCatalog({ quiet: !!cached && !force });
  else maybeRefreshEpg();
}

// Katalog ya da eşitleme sonrası ekran tazelenir. Liste açıksa baştan kurulmaz: açık kategori ve kaydırma yeri korunur
// (renderTab listeyi yıkıp en üste atardı; kanaldan dönünce kategoriden çıkma / başa dönme buradan geliyordu).
function rerenderKeepingList() {
  const listed = S.list && $('#list') && S.source && (TAB_KIND[S.tab] || S.tab === 'favs');
  if (listed) return refreshList(true);
  renderTab();
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
    S.linkErr = false;
    setCatalog(cat);
    if (S.tab !== 'multi') rerenderKeepingList(); // çoklu ekranda yayınlar kesilmesin
    banner(cat.warnings.length ? cat.warnings[0] : null, { err: cat.warnings.length > 0 });
    if (!quiet) toast(`${cat.live.length} kanal · ${cat.movies.length} film · ${cat.series.length} dizi`);
    maybeRefreshEpg(true);
  } catch (e) {
    S.linkErr = true;
    paintLink();
    banner(`Liste alınamadı: ${e.message}`, { err: true });
    if (S.tab !== 'sources' && S.tab !== 'multi') rerenderKeepingList();
  } finally {
    S.loading = false;
  }
}

async function maybeRefreshEpg(force = false) {
  if (!S.source || !S.cat.live.length) return;
  const have = S.epg.data && S.epg.data.fetchedAt;
  if (!force && have && S.epg.data.kanalDFixVersion === 2 && Date.now() - have < staleEpgMs()) return;
  const id = S.source.id;
  let data = null;
  let providerError = '';
  // Önce kullanıcının kendi EPG kaynağı; ardından eksik kanallar için harici ücretsiz XMLTV havuzu.
  if (epgSourceUrls(S.source, S.cat).length) {
    try {
      data = await loadEpg(S.source, S.cat, net);
    } catch (e) {
      providerError = e.message || String(e);
    }
  }
  try {
    const free = await loadFreeData(net);
    const extra = matchFree(free, S.cat.live);
    data = mergeEpgData(data, extra);
    if (data) {
      data = { ...data, fetchedAt: Date.now(), kanalDFixVersion: 2, free: { via: free.via || 'harici', matched: extra.matched } };
    }
  } catch (e) {
    if (!data) throw new Error([providerError, e.message || String(e)].filter(Boolean).join(' · ') || 'EPG alınamadı');
  }
  if (!S.source || S.source.id !== id || !data) return;
  await store.cache.set('epg:' + id, data);
  S.epg = new EpgView(data);
  S.epgInfo = { matched: data.matched, at: data.fetchedAt, freeMatched: data.free && data.free.matched };
  if (S.list && S.tab === 'live') S.list.refreshRows();
  renderSpInfo();
  pui.refresh();
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
  if (tab === 'sources' && kidActive()) return kidExit(); // çocuk modunda Ayarlar yerine çıkış şifresi sorulur
  if (tab === 'multi' && kidActive()) return;
  if (tab === 'multi' && !needPro('multi')) return;
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
  applyMotionProfile();
  document.documentElement.dataset.sec = S.source ? S.tab : 'home'; // çok renkli temalarda vurgu rengi bölüme göre (CSS: html[data-multi][data-sec])
  if (kidActive() && (S.tab === 'sources' || S.tab === 'multi')) S.tab = 'home'; // çocuk modunda ayarlar ve çoklu ekran yok
  S.list && S.list.destroy();
  S.list = null;
  heroOff();
  const v = $('#view');
  v.onclick = null;
  document.documentElement.toggleAttribute('data-mem', memOn()); // Pro özelliklerinin düğmelerinde "PRO" etiketi
  document.body.classList.toggle('mem-blocked', memBlocked()); // üst çubuktaki arama ve yenileme de kapanır
  if (memBlocked()) return renderPaywall(v); // deneme bitti, üyelik yok: uygulama üyelik ekranında bekler
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
  if (!browse) $('#btn-catedit').hidden = true; // göz atma sekmelerinde kategori çubuğu çizilirken ayarlanır
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

function emptyHtml(title, text, btn, cls = '') {
  return `<div class="empty${cls ? ' ' + cls : ''}"><h3>${esc(title)}</h3><p>${esc(text)}</p>${btn || ''}</div>`;
}

// İlk açılış tanıtımı: uygulamanın ne olduğu üç adımda; üyelik sistemi devredeyse deneme süresi ve sonrası da açıkça yazar.
function renderOnboarding(v) {
  const steps = [
    ['link', 'Kaynağını ekle', 'Xtream hesabı, M3U bağlantısı ya da telefondaki M3U dosyası'],
    ['tv', 'İzle', 'Canlı TV, film ve diziler; telefonda ve TV’de'],
    ['star-on', 'Sana göre', 'Favoriler, izleme listesi, profiller ve temalar'],
  ];
  v.innerHTML = emptyHtml(
    'Hoş geldiniz',
    'Başlamak için Xtream hesap bilgilerinizi, M3U liste bağlantınızı ya da telefondaki bir M3U dosyasını ekleyin. Uygulama içerik sağlamaz; yalnızca erişim hakkınız olan kaynakları ekleyin.',
    `<ol class="ob-steps">${steps.map(([ic, t, d]) => `<li>${icon(ic)}<span><b>${t}</b><small>${d}</small></span></li>`).join('')}</ol>` +
      (memOn() ? `<p class="ob-trial"><b>${TRIAL_DAYS} gün ücretsiz deneme.</b> Sonrasında uygulamayı kullanmak için yıllık Standart üyelik gerekir; ek özellikler Pro üyelikle açılır. <button class="linkbtn" id="ob-mem">Üyelik seçenekleri</button></p>` : '') +
      // TV'de düğmeler adımların üstünde durur (CSS order) ve ekrana sığar; "Telefondan al": telefondaki listeyi QR/kodla TV'ye aktarır (Pro)
      `<div class="ob-act"><button class="btn" id="ob-add">Kaynak ekle</button>${nativePlugin && isTvUi() ? '<button class="btn ghost" id="ob-phone" type="button">Telefondan al</button>' : ''}</div>`,
    'ob',
  );
  $('#ob-add').addEventListener('click', () => sourceForm());
  if ($('#ob-phone')) $('#ob-phone').addEventListener('click', () => needPro('tvlink') && castUi.receiverSheet());
  if ($('#ob-mem')) $('#ob-mem').addEventListener('click', () => memberSheet());
}

// ------------------------------------------------------------------ göz atma (canlı / film / dizi)

// Açık kategorinin (ya da kategori yoksa tüm içeriğin) öğeleri, sıralama uygulanmadan.
function groupItems(kind) {
  return itemsOfGroup(kind, S.group[kind]);
}

function itemsOfGroup(kind, g) {
  if (g === '__recent') return recentItems(kind);
  if (g === '__cont') return continueItems(kind);
  if (g === '__new') return newestItems(visibleAll(kind));
  if (g === '__top') return topRatedItems(visibleAll(kind));
  if (g && g.startsWith('f:')) return folderItems(kind, folderOf(prefsOf(kind), g.slice(2)));
  if (g && g.startsWith('g:')) return inGroup(S.cat[CAT_KEY[kind]], g.slice(2));
  return visibleAll(kind);
}

// Arama açık kategori içinde yapılır (kategori yoksa tümünde); arama sonuçları ilgiye göre, liste seçilen sıraya göre.
function currentItems(kind) {
  const base = groupItems(kind);
  if (S.query) return search(base, S.query);
  const g = S.group[kind];
  return isFixedList(g) ? base : sortItems(base, S.sort[kind]);
}

// Kendi sırası olan özel listeler (son izlenen, devam et, yeni eklenenler, en çok puan alanlar): kullanıcı sıralaması uygulanmaz
function isFixedList(g) {
  return g === '__recent' || g === '__cont' || g === '__new' || g === '__top';
}

function recentItems(kind) {
  return homeRecent(kind, store.recents(sid()), store.progressAll(sid()), (k, e) => resolve(e, k), 500);
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
  return { __all: 'Tümü', __recent: 'Son izlenen', __cont: 'Devam et', __new: 'Yeni eklenenler', __top: 'En çok puan alanlar' }[g] || g;
}

function displayMode(kind) {
  const fallback = kind === 'live' ? 'list' : 'grid';
  const value = store.pref('set.view.' + kind, fallback);
  return value === 'list' || value === 'grid' ? value : fallback;
}
function setDisplayMode(kind, value) {
  if (value !== 'list' && value !== 'grid') return;
  store.setPref('set.view.' + kind, value);
  if (S.list) { S.list.destroy(); S.list = null; }
  refreshList(true);
}
// Kategori listesi düzenlenirken hep satır listesidir: sırala/gizle/kilitle düğmeleri satırdadır (ızgara kutusunda yer yok).
const catsGrid = (kind) => displayMode(kind) === 'grid' && !S.catEdit;
// Kurulu listenin yerleşimi: kip ya da kategori listesinin ızgara/liste hâli değişince liste baştan kurulur.
const listKey = (kind, mode) => (mode === 'cats' ? `cats:${catsGrid(kind) ? 'grid' : 'list'}` : mode);
function browseMode(kind) {
  if (S.query || S.group[kind] != null) return 'items';
  // Vitrinli satır görünümü: kategoriler yatay kayan satırlardır; düzenleme ve kategori süzgeci klasik kategori listesini açar
  return isMv(kind) && !S.catEdit && !S.catFilter && mvView() === 'rows' ? 'rows' : 'cats';
}

// Satırlar: "Tümü" satır olmaz (tüm listenin tek satırı anlamsız; klasik görünümde ve aramada durur), en üst satır "Devam et"tir.
// Kilidi bu oturumda açılmış kategori normal satır olur; boş kategori görünmez; kumandada en altta düzenleme kutusu.
function rowsOf(kind, cats) {
  const out = [];
  for (const c of cats) {
    if (c.id === '__all') continue;
    const row = c.locked && S.unlocked.has(catKey(kind, c.id)) ? { ...c, locked: false } : c;
    if (row.locked || row.count > 0) out.push(row);
  }
  if (isTvUi()) out.push({ id: '__edit', name: 'Düzenle', edit: true }); // kumandada: en alttaki kutu; dokunmatikte: kategori çubuğundaki Düzenle düğmesi
  return out;
}

function rowItems(kind, row) {
  const base = itemsOfGroup(kind, row.id);
  return isFixedList(row.id) ? base : sortItems(base, S.sort[kind]);
}

function shelfTile(kind, row, r, c) {
  const at = `role="button" tabindex="0" data-r="${r}" data-c="${c}"`;
  if (kind === 'lock') return `<div class="sh-more sh-lock" ${at} data-lock><span class="sh-more-i">${icon('lock')}</span><b>Kilitli</b><small>Tamam ile şifre gir</small></div>`;
  if (kind === 'edit') return `<div class="sh-more sh-edit" ${at} data-edit><span class="sh-more-i">${icon('sliders')}</span><b>Kategorileri düzenle</b><small>Sırala, gizle, klasör oluştur</small></div>`;
  return `<div class="sh-more" ${at} data-more><span class="sh-more-i">${icon('chev-r')}</span><b>Tümünü gör</b><small>${row.count}</small></div>`;
}

// Film ve dizi kategorileri: ayar "öne çıkanlar önce" ise öne çıkanlardan başlayan sıra, değilse sağlayıcının sırası. Canlı TV her zaman sağlayıcının sırasıdır.
const catOrderMode = () => normalizeCatOrder(store.pref('set.catOrder', DEFAULT_CAT_ORDER));
const providerGroups = (kind) => (isMv(kind) && catOrderMode() === 'smart' ? smartSort(S.groups[kind]) : S.groups[kind]);

// Varsayılan sıra: klasörler, sonra grupların (öne çıkanlar önce düzeni ya da sağlayıcı) sırası.
// Oynatıcıdaki kanal paneli için: ana ekranla aynı sıra ve gizleme (Tümü, Son izlenen, klasörler, sağlayıcı grupları); boş ve gizli kategori yok.
function playerCategories() {
  const rows = categoryRows('live', { edit: false, filter: '' });
  return rows
    .map((c) => (c.locked && S.unlocked.has(catKey('live', c.id)) ? { ...c, locked: false } : c))
    .filter((c) => c.locked || c.count > 0);
}

function categoryBase(kind) {
  const prefs = prefsOf(kind);
  return [
    ...prefs.folders.map((f) => ({ id: folderKey(f.id), name: f.name, count: folderItems(kind, f).length, folder: true })),
    ...providerGroups(kind).map((g) => ({ id: groupKey(g.name), name: g.name, count: g.count })),
  ];
}

function categoryRows(kind, { edit = S.catEdit, filter = S.catFilter } = {}) {
  const prefs = prefsOf(kind);
  const specials = [{ id: '__all', name: 'Tümü', count: visibleAll(kind).length, special: true }];
  if (kind === 'live') specials.push({ id: '__recent', name: 'Son izlenen', count: recentItems(kind).length, special: true });
  else {
    const n = continueItems(kind).length;
    if (n) specials.push({ id: '__cont', name: 'Devam et', count: n, special: true });
    if (catOrderMode() === 'smart') {
      const nw = newestItems(visibleAll(kind)).length;
      if (nw) specials.push({ id: '__new', name: 'Yeni eklenenler', count: nw, special: true });
      const tp = topRatedItems(visibleAll(kind)).length;
      if (tp) specials.push({ id: '__top', name: 'En çok puan alanlar', count: tp, special: true });
    }
  }
  let rows = arrange(categoryBase(kind), prefs).map((r) => ({ ...r, hidden: prefs.hidden.includes(r.id), lockSet: isLocked(prefs, r.id), locked: lockEnabled() && isLocked(prefs, r.id) }));
  if (!edit) rows = rows.filter((r) => !r.hidden);
  const f = fold(filter);
  const match = (r) => fold(r.name).includes(f);
  return f ? specials.filter(match).concat(rows.filter(match)) : specials.concat(rows);
}

function catRow(c, i, kind) {
  const folderIc = c.folder ? icon('folder') : '';
  const lockIc = c.locked ? icon('lock') : '';
  // Canlı TV, Film ve Dizi: her kategori kendi gerçekçi görseliyle geniş kart (spor, aksiyon, korku…); düzenleme modunda eski sade satır
  if (CAT_KEY[kind] && !S.catEdit) {
    return `<div class="row cat vis${c.special ? ' special' : ''}${c.hidden ? ' hid' : ''}${kc(i)}" role="button" tabindex="0" data-i="${i}">${catArtImg(catArtId(c, kind))}<div class="meta"><div class="nm"><span class="mq-i">${lockIc}${esc(c.name)}</span></div><div class="sub">${c.count} ${CAT_UNIT[kind]}${c.locked ? ' · kilitli' : ''}</div></div><span class="chev" aria-hidden="true">›</span></div>`;
  }
  if (!S.catEdit || c.special) {
    return `<div class="row cat${c.special ? ' special' : ''}${kc(i)}" role="button" tabindex="0" data-i="${i}"><div class="meta"><div class="nm"><span class="mq-i">${lockIc}${folderIc}${esc(c.name)}</span></div></div><span class="n">${c.count}</span><span class="chev" aria-hidden="true">›</span></div>`;
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
        S.backCat = { kind: k, id: S.group[k] };
        S.group[k] = null;
        refreshList();
      }
    });
  }
  refreshList();
  // kumandayla girildiyse imleç üstteki "önceki kategori" düğmesinde değil, listenin ilk öğesinde başlar
  if (dpad.isKbd() && S.list && S.listMode === 'items' && S.items.length) S.list.focusIndex(0);
}

function leaveGroup(kind) {
  if (groupLayer) return popLayer('group');
  if (S.group[kind] != null) S.backCat = { kind, id: S.group[kind] };
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
  S.backCat = null;
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
    const sortable = !S.query && !isFixedList(g);
    $('#crumb-sort').hidden = !sortable;
    $('#crumb-sort').classList.toggle('on', S.sort[kind] !== 'default');
  }
  const clearRecent = $('#btn-clear-recent');
  if (clearRecent) clearRecent.hidden = !((kind === 'live' && g === '__recent' && store.recents(sid()).length) || (kind !== 'live' && g === '__cont' && store.continueWatching(sid()).length));
  const label = { live: 'Kanal', movie: 'Film', series: 'Dizi' }[kind];
  qEl.placeholder = g != null ? 'Bu kategoride ara…' : `${label} ara…`;
}

const catbarHtml = () => `<div class="catbar" id="catbar" hidden><label class="field catq" id="catq" hidden><input id="cat-q" type="search" placeholder="Kategori ara…" autocomplete="off"></label><button class="btn sm ghost" id="cat-view" type="button" aria-label="Görünümü değiştir"></button><button class="btn sm ghost" id="cat-new" hidden>${icon('plus')}Klasör</button><button class="btn sm ghost" id="cat-reset" hidden>Sıfırla</button><button class="btn sm ghost" id="cat-edit">Düzenle</button></div>`;

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
  $('#cat-view').addEventListener('click', () => setDisplayMode(kind, displayMode(kind) === 'grid' ? 'list' : 'grid'));
  $('#cat-new').addEventListener('click', () => nameSheet(kind));
  $('#cat-reset').addEventListener('click', () => resetSheet(kind));
}

function drawCatbar(kind, mode, all) {
  // Satırlarda (vitrinli satır görünümü) çubuk yalnız dokunmatikte durur (kategori ara + Düzenle); kumandada Düzenle en alttaki kutudur.
  // Liste/Izgara düğmesi klasik kategori listesi ve kategori içi içindir; satırların görünümü Ayarlar'dan seçilir.
  // Satırlarda (vitrinli satır görünümü) çubuk yoktur: vitrin görselinin üstünü kapatmasın. Telefonda "Kategorileri düzenle" üst çubuktaki
  // düğmedir (#btn-catedit); kumandada en alttaki kutudur. Kategori arama, düzenleme açılınca (klasik liste) görünür.
  const rows = mode === 'rows';
  const visible = (mode === 'cats' || mode === 'items') && all;
  $('#catbar').hidden = !visible;
  $('#btn-catedit').hidden = !(rows && !isTvUi() && all);
  $('#catq').hidden = !(mode === 'cats' && (S.groups[kind].length > 8 || S.catFilter));
  $('#cat-view').hidden = !visible || S.catEdit;
  const view = displayMode(kind);
  $('#cat-view').textContent = view === 'grid' ? '☷ Liste' : '▦ Izgara';
  $('#cat-view').setAttribute('aria-label', view === 'grid' ? 'Liste görünümüne geç' : 'Izgara görünümüne geç');
  $('#cat-new').hidden = $('#cat-reset').hidden = !S.catEdit || mode !== 'cats';
  $('#cat-edit').hidden = mode !== 'cats';
  $('#cat-edit').textContent = S.catEdit ? 'Bitti' : 'Düzenle';
}

function renderBrowse(v, kind) {
  v.innerHTML = `${catbarHtml()}<div id="hero" hidden></div><div id="list"></div><div id="empty" hidden></div>`;
  wireCatbar(kind);
  $('#list').addEventListener('focusin', (e) => {
    if (!heroActive(kind, S.listMode)) return;
    const c = e.target.closest && e.target.closest('.card');
    const it = c && S.items[Number(c.dataset.i)];
    if (it) hero.focus(it);
  });
  refreshList();
}

// ---- TV vitrini (hero.js): kategorinin içinde kumandayla gezilen film/dizi kutusunun geniş arka planı, adı, puanı, özeti.
// Film/dizi kutuları görünürken açık: TV'de kumandayla, telefonda dikeyken (Netflix gibi üstte büyük afiş, altında kayan satırlar).
// Film ve dizi ekranı (Genel ayarlar): vitrinli satırlar / klasik ızgara + TV vitrini / klasik. Otomatik: vitrinli satırlar (telefon dikey ve TV).
const MV_VIEWS = [['auto', 'Otomatik'], ['rows', 'Vitrinli satırlar'], ['hero', 'Klasik + TV vitrini'], ['classic', 'Klasik']];
const isMv = (kind) => kind === 'movie' || kind === 'series';
function mvPref() {
  const p = store.pref('set.mvView', 'auto');
  if (MV_VIEWS.some(([k]) => k === p && k !== 'auto')) return p;
  if (store.pref('set.tvHero', true) === false) return 'classic'; // eski "TV vitrini" anahtarı kapatılmışsa
  return 'rows';
}
// Geçerli görünüm: vitrinli satırlar ve TV vitrini Pro'dur; üyelik yetmiyorsa klasik ızgara gösterilir (ayar silinmez, Pro gelince geri döner).
function mvView() {
  const v = mvPref();
  return v !== 'classic' && !proOk('rows') ? 'classic' : v;
}
// Vitrin alanı: satırlarda ve satırlardan girilen ızgarada; klasik görünümde yalnız TV'de ızgarada. Telefonda dokunmatikken CSS gizler.
const heroActive = (kind, mode) => {
  if (!isMv(kind)) return false;
  const v = mvView();
  if (v === 'rows') return mode === 'rows' || mode === 'items';
  return v === 'hero' && isTvUi() && mode === 'items';
};
const hero = createHero({
  peek: (it) => (S.source ? peekVodInfo(S.source, it) : null),
  canLoad: (it) => !!S.source && S.source.type === 'xtream' && it.kind === 'movie',
  load: (it) => loadVodInfo(S.source, net, it),
  paint: paintHero,
});

function paintHero(it, info, final) {
  const box = $('#hero');
  if (!box || box.hidden) return;
  heroTrailer.focus(it); // TV: odakta bir süre bekleyince fragman başlar
  const m = heroModel(it, info);
  box.innerHTML =
    `<h2 class="hero-t">${esc(m.title)}</h2>` +
    `<div class="hero-m">${m.rating ? `<b class="hero-r">★ ${esc(m.rating)}</b>` : ''}${m.meta.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` +
    (m.cast ? `<p class="hero-c"><b>Oyuncular</b> ${esc(m.cast)}</p>` : '') +
    (m.director ? `<p class="hero-c hero-d"><b>Yönetmen</b> ${esc(m.director)}</p>` : '') +
    (m.plot ? `<p class="hero-p">${esc(m.plot)}</p>` : '') +
    // Telefonda (dokunmatik) vitrinin altında Netflix gibi iki düğme; TV'de CSS gizler, kumanda kutuya odaklanır
    // TV: fragman oynarken görünür; kumandada aşağıdaki ilk kutudan yukarı basınca odaklanır, Tamam sesi açar/kapatır
    `<button class="hero-snd" data-hero="sound" aria-label="${heroStage.muted ? 'Sesi aç' : 'Sesi kapat'}">${icon(heroStage.muted ? 'mute' : 'audio')}<span>${heroStage.muted ? 'Sesi aç' : 'Sesi kapat'}</span></button>` +
    `<div class="hero-btns"><button class="hero-b hero-b-play" data-hero="play">${icon('play')}<span>${it.kind === 'series' ? 'İzle' : 'Oynat'}</span></button><button class="hero-b" data-hero="info">${icon('info')}<span>Bilgi</span></button></div>`;
  // Ayrıntı yoldayken yalnız dikey afiş varsa çizilmez: geniş ekranda kırpık görünüp sonra geniş görsele dönüşüyordu.
  // Geniş görsel gelene (ya da ayrıntı gelmeyeceği anlaşılana) dek önceki arka plan kalır.
  if (final || m.wide) paintHeroBg(m.bg, m.backs);
}

// Arka plan: iki katman çapraz geçer; yeni görsel yüklenene dek eskisi durur (boş/yanıp sönme olmaz). Önce geniş görsel, olmazsa afiş.
let heroBgSeq = 0;
const HERO_IMG_WAIT_MS = 2500; // bir görsel adresi için en çok bekleme
let heroBgUrl = '';
// Dikey afişin bulanık, geniş yansıması: sağda bütün gösterilen afişin arkasında ekranı doldurur, böylece geniş görseli olmayan yapım da
// tam arka planlı görünür. Küçük (16:9) tuvale çizilip CSS ile büyütülür; filtre kullanılmadığından hafif modda ve düşük bellekli TV'de de ucuzdur.
function paintGlow(cv, im) {
  const W = 64;
  const H = 36;
  cv.width = W;
  cv.height = H;
  const w = im.naturalWidth;
  const h = im.naturalHeight;
  if (!w || !h) return;
  const sh = Math.min(h, (w * H) / W); // afişin 16:9'luk üst-orta dilimi
  try {
    cv.getContext('2d').drawImage(im, 0, Math.max(0, (h - sh) * 0.3), w, sh, 0, 0, W, H);
  } catch (_) {
    /* görsel çizilemedi (CORS/bozuk resim): arka plan boş kalır, işlev etkilenmez */
  }
}

function paintHeroBg(urls, nWide = urls.length) {
  const el = $('#hero-bg');
  if (!el) return;
  const seq = ++heroBgSeq;
  const next = (n) => {
    if (seq !== heroBgSeq) return;
    const url = urls[n];
    if (!url) {
      heroBgUrl = '';
      el.classList.remove('has');
      for (const x of el.children) x.classList.remove('on', 'show');
      for (const x of el.querySelectorAll('i')) x.textContent = ''; // görsel bellekte tutulmasın
      return;
    }
    if (url === heroBgUrl) return;
    const im = new Image();
    im.referrerPolicy = 'no-referrer';
    im.alt = '';
    // Yanıt vermeyen bir adres (dizilerde sağlayıcının verdiği geniş görsel sık sık böyledir) ne yüklenir ne hata verir; vitrin görselsiz
    // kalıyordu. Süre dolunca sıradaki adrese (afişe) geçilir.
    let settled = false;
    const giveUp = () => {
      if (settled) return;
      settled = true;
      clearTimeout(wait);
      im.onload = im.onerror = null;
      next(n + 1);
    };
    const wait = setTimeout(giveUp, HERO_IMG_WAIT_MS);
    im.onload = () => {
      if (settled) return;
      if (!im.naturalWidth) return giveUp(); // boş/bozuk görsel
      settled = true;
      clearTimeout(wait);
      if (seq !== heroBgSeq) return;
      const [a, b] = el.querySelectorAll('i');
      const glow = el.querySelector('canvas.glow');
      const to = a.classList.contains('on') ? b : a;
      const from = to === a ? b : a;
      const poster = n >= nWide;
      // Yüklenen görselin kendisi katmana konur (kutulardaki afişlerle aynı yol). CSS arka planı olarak verilince tarayıcı görseli ikinci kez,
      // bu kez yönlendiren (Referer) bilgisiyle istiyordu; bunu reddeden ya da önbelleğe aldırmayan sunucularda vitrin arka plansız kalıyordu.
      to.textContent = '';
      to.appendChild(im);
      to.classList.toggle('poster', poster); // dikey afiş sağda bütün gösterilir (kırpılıp büyütülmez), arkasında bulanık yansıması
      if (poster) to.style.setProperty('--pr', String(im.naturalWidth && im.naturalHeight ? Math.min(1.2, Math.max(0.5, im.naturalWidth / im.naturalHeight)) : 0.667)); // kutu afişin oranında: kenar solması afişin kendi kenarına oturur
      glow.classList.toggle('show', poster);
      if (poster) paintGlow(glow, im);
      to.classList.add('on');
      from.classList.remove('on');
      el.classList.add('has');
      heroBgUrl = url;
    };
    im.onerror = giveUp;
    im.src = url;
  };
  next(0);
}

function heroOff() {
  document.documentElement.classList.remove('hero-on');
  heroTrailer.cancel();
  hero.stop();
  paintHeroBg([]);
}

// Liste (yeniden) çizilince: vitrin bu kategori için açık mı? Açıksa ilk kutu gösterilir (kumandada odak zaten ilk kutuya gelir).
function heroSync(kind, mode) {
  const box = $('#hero');
  if (!box) return;
  const on = heroActive(kind, mode);
  box.hidden = !on;
  document.documentElement.classList.toggle('hero-on', on);
  document.documentElement.classList.toggle('hero-rows', on && mode === 'rows'); // vitrinli satır görünümü: vitrin telefonda (dokunmatik, dikey) da görünür
  // Dokunmatikte vitrine dokunmak öne çıkan yapımı açar (kumandada vitrin odak almaz)
  box.onclick = on ? (e) => {
    const it = hero.current;
    const b = e.target.closest && e.target.closest('[data-hero]');
    if (b && b.dataset.hero === 'sound') return toggleHeroSound();
    if (!it || document.documentElement.classList.contains('kbd')) return;
    if (b && b.dataset.hero === 'play' && kind === 'movie') return startPlay(it, { ctx: movieCtx(it) }); // dizide “İzle” bölümler ekranını açar
    kind === 'movie' ? openMovie(it) : openSeries(it);
  } : null;
  if (!on) {
    box.innerHTML = '';
    return heroOff();
  }
  const rows = mode === 'rows';
  const first = rows ? S.list.firstItem() : S.items[0];
  if (!first) {
    box.innerHTML = '';
    hero.stop();
    return paintHeroBg([]);
  }
  const cur = hero.current;
  if (!cur) hero.reset(); // kategoriye yeni girildi: önceki hatalar yeni denemeyi engellemesin
  // Vitrin her eşitlemede yeniden çizilir: odak, kutu henüz gizliyken (liste kurulurken) geldiyse o çizim atlanmıştır ve görsel hiç gelmezdi.
  const keep = cur && (rows ? S.list.hasItem(cur.id) : S.items.some((x) => x.id === cur.id));
  hero.stop();
  hero.focus(keep ? cur : first);
}

// ---- TV vitrininde fragman (hero-trailer.js denetler, hero-stage.js oynatır): odakta ~3,5 sn bekleyince tam ekran, kontrolsüz oynar;
// oynarken ~6 sn sonra ekrandaki tüm bilgi solar (html.hero-cine); tuş/dokunuş bilgiyi geri getirir; odak başka yapıma geçince ya da video bitince durur.
// Sayfa/oynatıcı açıkken ve uygulama arka plandayken çalışmaz. Ayar: "Fragmanı otomatik oynat" (kapalıyken vitrin eskisi gibi).
const heroBusy = () => !!document.querySelector('#sheets > *') || document.body.classList.contains('player-open') || document.documentElement.classList.contains('native-playing');
// Telefon: dikey ekranda vitrinli satırlar açıkken de çalışır (üstteki yapımda bekleyince vitrin alanında sessiz oynar; sinema kipi yok, liste kaydırılabilir kalır)
const phoneVitrin = () => !isTvUi() && document.documentElement.classList.contains('hero-on') && document.documentElement.classList.contains('hero-rows') && !!(window.matchMedia && window.matchMedia('(orientation: portrait)').matches);
const heroTrailerOn = () => (isTvUi() || phoneVitrin()) && !kidActive() && trailerAutoOn() && !heroBusy() && document.visibilityState !== 'hidden';
// Fragman kimlikleri: sağlayıcı → Cinemeta → YouTube araması (ayar açıksa). Hepsi önbellekli; aynı yapıma yeniden odaklanınca anında gelir.
async function heroTrailerIds(it) {
  const info = S.source ? peekVodInfo(S.source, it) : null;
  const year = (info && info.year) || it.year;
  const type = it.kind === 'series' ? 'series' : 'movie';
  const meta = await (type === 'series' ? loadSeriesMetadata(net, it, store) : loadMovieMetadata(net, it, info, store)).catch(() => null);
  const { detail, origin } = await new Promise((res) => loadTitleExtras(it, meta && meta.imdbId, type, (d, o) => res({ detail: d, origin: o }), year));
  const ids = trailerIds(detail, (info && info.trailer) || it.trailer);
  if (ids.length) return ids;
  if (!setting('trailerFind')) return [];
  const t = trailerSearch(it.name, year, origin);
  for (const q of t.finds.filter(Boolean)) {
    const picks = await findTrailerOnYoutube({ net, cache: store.cache, query: q, wanted: t.wanted, year: t.year }).catch(() => null);
    const good = (picks || []).filter((p) => p.good);
    if (good.length) return good.map((p) => p.id);
  }
  return [];
}
const heroLive = (on) => document.documentElement.classList.toggle('hero-live', on); // fragman oynuyor: vitrinde ses düğmesi görünür
const heroStage = createHeroStage({ host: $('#hero-tr'), origin: location.origin, onPlaying: () => { heroLive(true); heroTrailer.playing(); }, onEnded: () => heroTrailer.ended() });
// Ses: vitrindeki düğmeden (Tamam) ya da kumandada Oynat/Duraklat (ya da M) tuşundan
function toggleHeroSound() {
  const muted = heroStage.toggleMute();
  if (muted === null) return;
  const b = $('#hero .hero-snd');
  if (b) {
    b.setAttribute('aria-label', muted ? 'Sesi aç' : 'Sesi kapat');
    b.innerHTML = icon(muted ? 'mute' : 'audio') + `<span>${muted ? 'Sesi aç' : 'Sesi kapat'}</span>`;
  }
}
const heroTrailer = createHeroTrailer({
  enabled: () => heroTrailerOn(),
  resolve: heroTrailerIds,
  start: (ids) => heroStage.start(ids, { muted: !isTvUi() }),
  stop: () => { heroStage.stop(); heroLive(false); },
  setCine: (on) => { if (isTvUi() || !on) document.documentElement.classList.toggle('hero-cine', on); }, // telefonda bilgi gizlenmez
});
for (const ev of ['keydown', 'pointerdown', 'touchstart']) document.addEventListener(ev, () => heroTrailer.activity(), { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') heroTrailer.cancel(); });
if (window.matchMedia) {
  // Telefon yatay çevrilince vitrin kapanır: fragman da kesilir; dikeye dönünce vitrin yine odaktaki yapımı gösteriyorsa bekleme yeniden başlar
  window.matchMedia('(orientation: portrait)').addEventListener('change', () => {
    if (!heroTrailerOn()) heroTrailer.cancel();
    else if (hero.current && heroTrailer.state === 'idle') heroTrailer.focus(hero.current);
  });
}
document.addEventListener('keydown', (e) => {
  if (heroTrailer.state !== 'playing' || e.repeat || (e.key !== 'MediaPlayPause' && e.key !== 'm' && e.key !== 'M')) return;
  if (/^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '')) return;
  e.preventDefault();
  toggleHeroSound();
});
{
  // Sayfa/oynatıcı açılınca fragman kesilir; kapanınca vitrin yine odaktaki yapımı gösteriyorsa bekleme yeniden başlar
  let wasBusy = false;
  const sync = () => {
    const busy = heroBusy();
    if (busy === wasBusy) return;
    wasBusy = busy;
    if (busy) heroTrailer.cancel();
    else if (document.documentElement.classList.contains('hero-on') && hero.current) heroTrailer.focus(hero.current);
  };
  const mo = new MutationObserver(sync);
  mo.observe($('#sheets'), { childList: true });
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

function recentItemSheet(it) {
  const sh = openSheet({
    title: 'Son izlenenlerden kaldır',
    html: `<p class="hint">${esc(it.name || 'Bu kanal')} son izlenenler listesinden kaldırılacak. Favorilerinden veya kanal listesinden silinmez.</p><button class="btn danger" id="recent-remove-one">${icon('trash')}Son izlenenlerden kaldır</button>`,
    mount: (body) => {
      $('#recent-remove-one', body).addEventListener('click', () => {
        store.removeRecent(sid(), it.id);
        sh.close();
        refreshList(true);
        toast('Son izlenenlerden kaldırıldı');
      });
    },
  });
}

function clearRecentSheet() {
  const kind = TAB_KIND[S.tab];
  const isContinue = !!kind && kind !== 'live' && S.group[kind] === '__cont';
  const title = isContinue ? 'Devam et listesini temizle' : 'Son izlenenleri temizle';
  const message = isContinue
    ? 'Film ve dizi izleme geçmişindeki devam kayıtları kaldırılacak. Favoriler ve katalog etkilenmez.'
    : 'Son izlenenler listesindeki tüm kanallar kaldırılacak. Favoriler ve kanal listen etkilenmez.';
  const action = isContinue ? 'Devam et listesini temizle' : 'Tüm son izlenenleri temizle';
  const sh = openSheet({
    title,
    html: `<p class="hint">${message}</p><button class="btn danger" id="recent-clear-all">${action}</button>`,
    mount: (body) => {
      $('#recent-clear-all', body).addEventListener('click', () => {
        if (isContinue) store.clearProgress(sid());
        else store.clearRecents(sid());
        sh.close();
        refreshList(true);
        toast(isContinue ? 'Devam et listesi temizlendi' : 'Son izlenenler temizlendi');
      });
    },
  });
}

function mountList(kind, mode = 'items') {
  const el = $('#list');
  S.listMode = mode;
  S.listKey = listKey(kind, mode);
  // ad alanı ölçüleri görünüme özeldir: satırların bıraktığı değer ızgaraya taşınmasın
  el.style.removeProperty('--cap-lines');
  el.style.removeProperty('--cap-fs');
  const GRID_PAD = isTvUi() ? 14 : 8; // ızgaranın üst/alt boşluğu: ilk ve son satırda odaktaki kutunun büyümesi (%4) ve halkası (5 px) kırpılmaz
  const longPress = (i) => {
    const it = S.items[i];
    if (!it) return;
    if (kind === 'live' && S.group.live === '__recent') return recentItemSheet(it);
    return folderSheet(kind, it);
  };
  if (mode === 'rows') {
    const want = normalizeCaption(store.pref('set.caption', DEFAULT_CAPTION));
    S.list = new Shelves(el, {
      cap: normalizeRowCap(store.pref('set.rowCap', SHELF_CAP)),
      sizes: (w, h) => {
        // geniş ekranda vitrin tam adı gösterir: ad en çok 2 satır. Dar ekranda (telefon) vitrin yok: ad ayardaki satır sayısı kadar, biraz küçük yazıyla
        const narrow = w < 700;
        const lines = narrow ? want : Math.min(2, want);
        const fs = narrow ? 0.75 : CAP_FS;
        el.style.setProperty('--cap-lines', String(lines || DEFAULT_CAPTION));
        el.style.setProperty('--cap-fs', fs + 'rem');
        return shelfSizes({ viewW: w, viewH: h, scale: Math.max(1, remScale()), capPx: captionPx(lines, remScale(), fs) });
      },
      itemsOf: (row) => rowItems(kind, row),
      titleHtml: (row) => `${row.locked ? icon('lock') : ''}${row.folder ? icon('folder') : ''}<span>${esc(row.name)}</span>`,
      renderCard: (it, r, c) => card(it, r, `data-r="${r}" data-c="${c}"`),
      renderTile: shelfTile.bind(null),
      onOpen: (it) => (kind === 'movie' ? openMovie(it) : openSeries(it)),
      onMore: (row) => enterGroup(kind, row.id),
      onLock: (row) => ensureUnlocked(kind, row.id).then((ok) => ok && refreshList(true)),
      onEdit: () => {
        S.catEdit = true;
        refreshList();
      },
      onFocusItem: (it) => heroActive(kind, 'rows') && hero.focus(it),
      // Dokunmatikte (telefon) odak yoktur: vitrin, en üstteki satırın ilk yapımını gösterir ve kaydırdıkça değişir
      onTopItem: (it) => !isTvUi() && !document.documentElement.classList.contains('kbd') && heroActive(kind, 'rows') && hero.focus(it),
      onLongPress: (it) => folderSheet(kind, it),
    });
  } else if (mode === 'cats') {
    const grid = catsGrid(kind);
    const gap = 10;
    S.list = new VirtualList(el, {
      ...(grid ? {
        minCellW: 132, gap, pad: GRID_PAD,
        cellH: (w, cols) => Math.max(86, Math.min(124, (w - 24 - gap * (cols - 1)) / cols * 0.72)),
        render: (c, i) => categoryTile(c, i, kind),
      } : {
        rowH: scaled(CAT_KEY[kind] && !S.catEdit ? 92 : 56),
        render: (c, i) => catRow(c, i, kind),
      }),
      onTap: (i, ev) => onCatTap(kind, i, ev),
    });
  } else if (kind === 'live') {
    const grid = displayMode(kind) === 'grid';
    const gap = 10;
    S.list = new VirtualList(el, {
      ...(grid ? {
        minCellW: 116, gap, pad: GRID_PAD,
        // Kutu, içeriği kadar yüksek olmalı: iç boşluk 20 + logo 54 + ara 8 + iki satır ad (0,8rem × 1,25 × 2) + pay. Dar kutuda ve büyük
        // yazı ayarında genişliğin 0,92'si yetmiyor, adın ikinci satırı alttan kesiliyordu.
        cellH: (w, cols) => Math.max(((w - 24 - gap * (cols - 1)) / cols) * 0.92, Math.ceil(86 + 32 * remScale())),
        render: (it, i) => liveTile(it, i),
      } : {
        rowH: scaled(64),
        render: (it, i) => liveRow(it, i),
      }),
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
    const grid = displayMode(kind) === 'grid';
    const gap = 10;
    // TV vitrini açıkken liste alanı alçaktır: ad en çok 2 satır (tam ad vitrinde yazar) ve bir satır kutu her zaman ekrana sığar
    const heroGrid = grid && isTvUi() && heroActive(kind, mode);
    const want = normalizeCaption(store.pref('set.caption', DEFAULT_CAPTION));
    const lines = heroGrid ? Math.min(2, want) : want;
    if (heroGrid) el.style.setProperty('--cap-lines', String(lines || DEFAULT_CAPTION));
    S.list = new VirtualList(el, {
      ...(grid ? {
        minCellW: heroGrid ? heroCellW(window.innerWidth) : 104,
        gap, pad: GRID_PAD, fitRow: heroGrid, snapRow: heroGrid,
        cellH: (w, cols) => ((w - 24 - gap * (cols - 1)) / cols) * 1.5 + captionPx(lines, remScale()),
        render: (it, i) => card(it, i),
      } : {
        rowH: scaled(68),
        render: (it, i) => mediaRow(it, i),
      }),
      onTap: (i) => (kind === 'movie' ? openMovie(S.items[i]) : openSeries(S.items[i])),
      onLongPress: longPress,
    });
  }
}

// Kategoriden geri çıkınca liste en üste değil, en son girilen kategoriye konumlanır; kumanda kipindeyse imleç de orada durur.
function restoreCatCursor(kind) {
  const b = S.backCat;
  S.backCat = null;
  if (!b || b.kind !== kind || !S.list || (S.listMode !== 'cats' && S.listMode !== 'rows')) return;
  const i = S.cats.findIndex((c) => c.id === b.id);
  if (i < 0) return;
  S.list.scrollToIndex(i);
  if (dpad.isKbd()) S.list.focusIndex(i, S.listMode === 'rows'); // satırlarda imleç "Tümünü gör" kutusuna döner
  else S.list.draw();
}

function refreshList(keepScroll = false) {
  if (S.tab === 'favs') return S.list ? refreshFavs(keepScroll) : undefined;
  if (S.tab === 'live' && S.split && $('#split')) return refreshSplit(keepScroll);
  const kind = TAB_KIND[S.tab];
  if (!kind || !$('#list')) return;
  pruneGroups();
  const mode = browseMode(kind);
  if (!S.list || S.listMode !== mode || S.listKey !== listKey(kind, mode)) {
    if (S.list) S.list.destroy();
    mountList(kind, mode);
    keepScroll = false;
  }
  const all = S.cat[CAT_KEY[kind]].length;
  S.items = mode === 'items' ? currentItems(kind) : [];
  S.cats = mode === 'items' ? [] : categoryRows(kind);
  if (mode === 'rows') S.cats = rowsOf(kind, S.cats);
  const rows = mode === 'items' ? S.items : S.cats;
  S.list.setItems(rows, keepScroll);
  heroSync(kind, mode);
  restoreCatCursor(kind);
  drawCrumb(kind);
  const empty = $('#empty');
  const none = mode === 'items' ? !rows.length : mode === 'rows' ? !all || !S.cats.some((r) => !r.edit) : !all || !rows.length;
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
  else if (mode !== 'items') empty.innerHTML = emptyHtml('Eşleşen kategori yok', '');
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
  return `<div class="row${sel ? ' sel' : ''}${bad ? ' bad' : ''}${kc(i)}" role="button" tabindex="0" data-i="${i}">${num}${logo(it.logo, it.name)}<div class="meta"><div class="nm"><span class="mq-i">${esc(it.name)}</span></div><div class="sub"><span class="mq-i">${esc(sub)}</span></div>${nn.now ? `<div class="bar"><i style="width:${Math.round(nn.progress * 100)}%"></i></div>` : ''}</div><button class="act ${fav ? 'on' : ''}" data-fav aria-label="Favori">${icon(fav ? 'star-on' : 'star')}</button><button class="act" data-epg aria-label="Program rehberi">${icon('list')}</button></div>`;
}

function categoryTile(c, i, kind) {
  const folderIc = c.folder ? icon('folder') : c.locked ? icon('lock') : icon('list');
  if (CAT_KEY[kind] && !(S.catEdit && !c.special)) {
    return `<div class="cat-tile vis${c.hidden ? ' hidden' : ''}${kc(i)}" role="button" tabindex="0" data-i="${i}">${catArtImg(catArtId(c, kind))}<b>${esc(c.name)}</b><small>${c.count} ${CAT_UNIT[kind]}</small>${c.locked ? '<span class="cat-tile-lock">Kilitli</span>' : ''}</div>`;
  }
  if (S.catEdit && !c.special) {
    const move_ = S.catFilter ? '' : `<button class="cat-tile-act" data-act="top" aria-label="En üste al">${icon('top')}</button><button class="cat-tile-act" data-act="up" aria-label="Yukarı">${icon('up')}</button><button class="cat-tile-act" data-act="down" aria-label="Aşağı">${icon('down')}</button>`;
    return `<div class="cat-tile editing${c.hidden ? ' hidden' : ''}" role="button" tabindex="0" data-i="${i}"><span class="cat-tile-ic">${folderIc}</span><b>${esc(c.name)}</b><small>${c.count} öğe</small><div class="cat-tile-actions"><button class="cat-tile-act" data-act="eye" aria-label="${c.hidden ? 'Göster' : 'Gizle'}">${icon(c.hidden ? 'eye-off' : 'eye')}</button><button class="cat-tile-act" data-act="lock" aria-label="${c.lockSet ? 'Kilidi kaldır' : 'Şifreyle kilitle'}">${icon(c.lockSet ? 'lock' : 'lock-open')}</button>${move_}</div></div>`;
  }
  return `<div class="cat-tile${c.hidden ? ' hidden' : ''}${kc(i)}" role="button" tabindex="0" data-i="${i}"><span class="cat-tile-ic">${folderIc}</span><b>${esc(c.name)}</b><small>${c.count} öğe</small>${c.locked ? '<span class="cat-tile-lock">Kilitli</span>' : ''}</div>`;
}
function liveTile(it, i) {
  const fav = isFav(it);
  const logoHtml = it.logo ? `<img src="${esc(it.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span>${esc(it.name.slice(0, 2).toUpperCase())}</span>`;
  return `<div class="live-tile" role="button" tabindex="0" data-i="${i}"><div class="live-tile-logo">${logoHtml}</div><b>${esc(it.name)}</b><button class="live-tile-fav${fav ? ' on' : ''}" data-fav aria-label="Favori">${icon(fav ? 'star-on' : 'star')}</button></div>`;
}
function mediaRow(it, i) {
  const img = it.logo ? `<img src="${esc(it.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span>${esc(it.name.slice(0, 2).toUpperCase())}</span>`;
  const p = progressOf(it);
  const pct = p && p.dur > 0 ? Math.round((p.pos / p.dur) * 100) : 0;
  return `<div class="media-row" role="button" tabindex="0" data-i="${i}"><span class="media-row-img">${img}</span><span class="media-row-text"><b>${esc(it.name)}</b>${pct ? `<i><u style="width:${pct}%"></u></i>` : ''}</span><span class="media-row-go">›</span></div>`;
}
// ---- afişsiz filmlere afiş: sağlayıcı afiş adresi vermediyse film, ayrıntı sayfasındaki eşleştirmeyle (yerel katalog, olmazsa Cinemeta)
// bulunur ve afişi oradan gelir. Yalnız ekranda çizilen kutular için, aynı anda en çok 2 istekle çalışır; bulunamayan film harfli kutuda kalır.
const posterUrl = (imdbId) => `https://images.metahub.space/poster/medium/${imdbId}/img`;
const posterImg = (src) => `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.parentNode.classList.add('ok')" onerror="this.remove()">`;
const posterAsked = new Set();
const posterQueue = [];
let posterBusy = 0;
function posterFill(it) {
  if (posterAsked.has(it.id) || posterAsked.size > 800) return;
  posterAsked.add(it.id);
  posterQueue.push(it);
  if (posterQueue.length > 60) posterAsked.delete(posterQueue.shift().id); // hızlı kaydırmada eskiler düşer; yeniden görünürse tekrar sorulur
  posterPump();
}
function posterPump() {
  while (posterBusy < 2 && posterQueue.length) {
    const it = posterQueue.pop(); // en son görünen önce
    posterBusy++;
    loadMovieMetadata(net, it, null, store)
      .then((m) => {
        if (!m || !/^tt\d+$/.test(m.imdbId || '') || it.logo) return;
        it.logo = posterUrl(m.imdbId);
        for (const c of document.querySelectorAll('.card[data-pf]')) {
          if (c.dataset.pf !== String(it.id)) continue;
          const ph = c.querySelector('.poster .ph');
          if (ph && !c.querySelector('.poster img')) ph.insertAdjacentHTML('afterend', posterImg(it.logo));
          c.removeAttribute('data-pf');
        }
      })
      .catch(() => {})
      .finally(() => {
        posterBusy--;
        posterPump();
      });
  }
}

function card(it, i, attrs = `data-i="${i}"`, meta = null) {
  if (!it.logo && it.kind === 'movie' && !it.localMedia) {
    posterFill(it);
    attrs += ` data-pf="${esc(it.id)}"`;
  }
  const p = progressOf(it);
  const pct = p && p.dur > 0 ? Math.round((p.pos / p.dur) * 100) : 0;
  const ph = esc(it.name.slice(0, 2).toUpperCase());
  const img = it.logo ? posterImg(it.logo) : '';
  return `<div class="card${it.kind === 'live' ? ' is-live' : ''}" role="button" tabindex="0" ${attrs}><div class="poster"><div class="ph">${ph}</div>${img}${isFav(it) ? `<span class="fav">${icon('star-on')}</span>` : ''}${pct ? `<div class="prog"><i style="width:${pct}%"></i></div>` : ''}${meta && pct ? `<span class="pct">%${pct}</span>` : ''}</div><div class="cap">${meta ? `<span class="cap-full">${esc(it.name)}</span><span class="cap-clean">${esc(meta.title)}</span><small class="cap-m">${esc(meta.sub)}</small>` : esc(it.name)}</div></div>`;
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
$('#btn-clear-recent').addEventListener('click', () => clearRecentSheet());
$('#q-clear').addEventListener('click', () => closeSearch());

// Sesli arama (Android): cihazın konuşma tanıyıcısı açılır, söylenen metin arama kutusuna yazılır. İptalde sessiz kalır.
async function voiceInto(input) {
  if (!nativePlugin || !nativePlugin.voiceSearch) return;
  try {
    const r = await nativePlugin.voiceSearch();
    const text = r && r.text ? String(r.text).trim() : '';
    if (!text) return;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  } catch (e) {
    toast(e && /yok/i.test(String(e.message)) ? 'Bu cihazda sesli arama yok' : 'Sesli arama açılamadı');
  }
}
if (nativePlugin && nativePlugin.voiceSearch) {
  $('#q-mic').hidden = false;
  $('#q-mic').addEventListener('click', () => voiceInto(qEl));
}

// Kumandanın renkli tuşları (oynatıcı kapalıyken): Genel ayarlar > Kumanda renkli tuşları'nda atanan iş. Oynatıcıda player-ui.js ele alır.
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || pui.isOpen() || pad.isOpen()) return;
  const a = actionFor(e.key, store.pref('remote.home', null), HOME_ACTIONS, DEFAULT_HOME);
  if (!a) return;
  if (e.target && e.target.matches && e.target.matches('input, textarea, select')) return;
  if (document.querySelector('.sheet-back, .pg')) return;
  if (!S.source && a !== 'sources') return;
  e.preventDefault();
  if (a === 'search') $('#btn-search').click();
  else goTo(a);
});
qEl.addEventListener(
  'input',
  debounce(() => {
    S.query = qEl.value.trim();
    refreshList();
  }, 120),
);


// Medya merkezi: cihaz klasörleri, ağ paylaşımları, müzik, fotoğraf (library-ui.js). Şifre işlevleri çağrı anında okunur.
let library = null;
function openLibrary() {
  if (!library) {
    library = createLibrary({
      plugin: nativePlugin,
      store,
      openPage,
      openSheet,
      toast,
      icon,
      startPlay: (item, opts) => startPlay(item, opts),
      askPin: (title, hint) => askPin(title, hint),
      lockEnabled: () => lockEnabled(),
      createPin: () => createPin(),
      pickFiles: () => playLocalMedia(),
      refreshPlayer: () => pui.refresh(),
    });
  }
  library.open();
}

async function playLocalMedia() {
  if (!nativePlugin || typeof nativePlugin.pickLocalMedia !== 'function') {
    toast('Cihazdan medya seçimi Android uygulamasında kullanılabilir');
    return;
  }
  try {
    const picked = await nativePlugin.pickLocalMedia();
    // Yeni köprü seçilen dosyaları items dizisinde döndürür; eski sürüm tek {uri, name, mime} verir.
    const rows = picked && Array.isArray(picked.items) && picked.items.length ? picked.items : picked && picked.uri ? [picked] : [];
    const items = buildPlaylist(rows);
    if (!items.length) return;
    const first = rows.length === 1 ? items[0] : items.find((x) => x.url === rows[0].uri) || items[0];
    const ctx = {
      items,
      index: items.indexOf(first),
      autoNext: items.length > 1,
      title: 'Sıradaki videolar',
      nextLabel: 'Sıradaki video',
      play: (it, i) => startPlay(it, { local: it.url, ctx: { ...ctx, index: i } }),
    };
    startPlay(first, { local: first.url, ctx });
  } catch (e) {
    const message = String(e && (e.message || e) || '');
    if (!/cancel|iptal|dosya seçilmedi/i.test(message)) toast('Medya açılamadı: ' + message);
  }
}

// ------------------------------------------------------------------ oynatma

function playLive(items, index, meta = {}) {
  // meta: { catKey, catName } — kanal panelinden seçilen kategori; kanal ↑↓ ve son kanal o kategoride sürer
  const ctx = { items, index, ...meta, play: (it, i) => startPlay(it, { ctx: { ...ctx, index: i } }) };
  startPlay(items[index], { ctx });
}

// Radyo adresleri: listedeki radyo kendi kaynağının yayın adresleriyle (biçim yedeği dahil) çalar; internet radyosu ve favoriler kayıtlı adrese gider.
function radioTargets(item) {
  const own = item.listId && S.source && String(item.id).startsWith(`${LIST_RADIO_PREFIX}${S.source.id}:`) ? S.cat.live.find((x) => String(x.id) === item.listId) : null;
  const t = own ? playTargets(S.source, own) : [];
  return t.length ? t.map((x) => ({ ...x, live: true })) : [{ url: item.url, mime: 'auto', live: true }];
}

function startPlay(item, { ep = null, ctx = null, startAt, local = '' } = {}) {
  const isRec = item.kind === 'recording'; // cihazdaki kayıt: yerel dosya, kaynaktan bağımsız
  const isRadio = !!item.radio; // internet radyosu: doğrudan adres, kaynaktan bağımsız; canlı gibi çalar ama ses (müzik çalar) ekranında açılır
  const localUrl = local || (ep && ep.dlUrl) || ''; // indirilmiş film/bölüm: ağsız yerel dosyadan oynar, ilerleme yine kaynağın öğesine yazılır
  let targets = isRec ? [{ url: item.url, mime: 'auto' }] : isRadio ? radioTargets(item) : localUrl ? [{ url: localUrl, mime: 'auto', headers: item.headers || undefined, subUri: item.subUri || '' }] : targetsOf(item, ep);
  const bgAudio = !!store.pref('backgroundAudio', !!item.audio);
  targets = targets.map((target) => ({ ...target, bgAudio, title: item.name }));
  if (!targets.length) return toast('Bu içerik için oynatma adresi bulunamadı');
  if (!isRec && !isRadio && !item.localMedia) store.pushRecent(sid(), item);
  if (isRadio) countClick({ net, id: item.id, version: VERSION }); // dizine "dinlendi" bildirimi (sıralamayı besler; sessizce başarısız olabilir)
  // Film nereden açılırsa açılsın (son izlenenler, bağlantı, indirilenler) oynatıcının altında önerilen filmler listesi olsun
  if (!ctx && item.kind === 'movie' && !isRec) ctx = movieCtx(item);
  // KÖK NEDEN DÜZELTMESİ: yerel katman müziği (audioOnly) video saymasın (PiP açılmasın, medya oturumu açılsın); önceki/sonraki düğmeleri
  // yalnız gerçek bir liste varken (müzik/video/bölüm) gösterilsin. Canlı TV ve "önerilen filmler" listesinde bu düğmeler anlamsız.
  const navList = !!ctx && Array.isArray(ctx.items) && ctx.items.length > 1 && (item.kind !== 'live' || isRadio) && !ctx.movie;
  const nav = { audioOnly: !!item.audio, canPrev: navList && ctx.index > 0, canNext: navList && ctx.index < ctx.items.length - 1 };
  targets = targets.map((target) => ({ ...target, ...nav }));
  let at = startAt;
  if (isRec || isRadio) at = 0;
  else if (at == null) {
    const p = store.progress(item.localMedia ? LOCAL_SRC : sid(), ep ? ep.id : item.id);
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
  toast(pl.note ? `${pl.title} · ${pl.note}` : `${pl.title} başlıyor · ${pl.chName}`, 8000);
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(pl.title, { body: pl.note || `${pl.chName} · ${fmtClock(pl.s)}` });
  } catch {
    /* bildirim açılamadı: ekrandaki ileti yeter */
  }
}

// Abonelik bitiş uyarısı (yalnız Xtream; çocuk modunda yok): son 7 günde ekranda günde bir kez uyarı, son 14 günde bitişten 3 gün önce
// sabah 10'da bildirim (Planlananlar'da görünür). Aynı bitiş için bildirim bir kez kurulur; abonelik yenilenirse (yeni bitiş tarihi) yeniden.
function watchExpiry(now = Date.now()) {
  const src = S.source;
  const exp = S.cat && S.cat.account && S.cat.account.expires;
  if (!src || src.type !== 'xtream' || kidActive()) return;
  const info = expiryInfo(exp, now);
  if (!info) return;
  const key = `${src.id}:${exp}`;
  const date = new Date(exp).toLocaleDateString(loc(), { day: 'numeric', month: 'long' });
  const day = new Date(now).toDateString();
  const seen = store.pref('exp.seen', null);
  if (info.level !== 'ok' && !(seen && seen.key === key && seen.day === day)) {
    store.setPref('exp.seen', { key, day });
    toast(info.level === 'expired' ? `“${src.name}” aboneliği sona ermiş (${date})` : `“${src.name}” aboneliği ${info.days === 1 ? 'yarın' : info.days + ' gün sonra'} bitiyor (${date})`, 7000);
  }
  const prefix = `exp:${src.id}:`;
  const list = readPlans();
  const plan = info.days <= PLAN_DAYS ? expiryPlan({ srcId: src.id, srcName: src.name, expires: exp, now }) : null;
  const planned = store.pref('exp.planned', null) === key;
  const stale = list.filter((x) => String(x.id).startsWith(prefix) && (!plan || x.id !== plan.id));
  if (stale.length) setPlans(list.filter((x) => !stale.includes(x)));
  if (plan && !planned) {
    store.setPref('exp.planned', key);
    setPlans(addPlan(readPlans(), plan));
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
  if (!needPro(kind === 'rec' ? 'rec' : 'remind')) return false;
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
  const it = await waitItem('live', chId, srcId);
  if (it) playLive([it], 0);
  else toast('Kanal bulunamadı');
}

// Açılışta liste yüklenirken bekleyerek içeriği bulur (kaynak başkaysa önce o kaynağa geçilir).
async function waitItem(key, id, srcId) {
  if (srcId && srcId !== sid() && store.sources().some((x) => x.id === srcId)) await activate(srcId);
  for (let i = 0; i < 32 && !S.idx[key].has(id); i++) await new Promise((r) => setTimeout(r, 250));
  return S.idx[key].get(id);
}

// Android TV ana ekranındaki "Devam et" satırından (iptvpro://play?…) gelen bağlantı: film, dizi bölümü ya da kanal doğrudan açılır.
async function openDeepLink(link) {
  const key = link.kind === 'live' ? 'live' : link.kind === 'movie' ? 'movies' : 'series';
  const it = await waitItem(key, link.kind === 'episode' ? link.parent : link.id, link.src);
  if (!it) return toast('İçerik bulunamadı');
  const startAt = link.pos > 0 ? Math.max(0, link.pos - 3000) : undefined;
  if (link.kind === 'live') return playLive([it], 0);
  if (link.kind === 'movie') return startPlay(it, { startAt });
  try {
    const all = episodesOf(await loadSeriesInfo(S.source, net, it));
    const ep = all.find((x) => x.id === link.id);
    if (!ep) return toast('Bölüm bulunamadı');
    seriesPlayer(it, all)(ep, startAt);
  } catch {
    toast('Bölüm açılamadı');
  }
}

// ---- ayrıntı sayfaları (tam ekran): film ve dizi ----

const posterOf = (it) => (it.logo ? `<img src="${esc(it.logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : esc(it.name.slice(0, 2).toUpperCase()));
const chipsOf = (parts) => parts.filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('');
const factsOf = (rows) => rows.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
const yearOf = (y) => (y ? String(y).slice(0, 4) : '');
const starsOf = (r) => (r ? `★ ${r}` : '');

// Film bitince (ya da son 15 sn'de) aynı kategoriden bir sonraki izlenmemiş film önerilir; kendiliğinden başlamaz.
function movieCtx(it) {
  const done = (x) => S.prog[x.id] || null;
  const picks = recommendMovies(it, { genre: it.genre || '', cast: it.cast || '', director: it.director || '' }, visibleAll('movie'), { limit: 12, excludeIds: Object.keys(S.prog).filter((id) => S.prog[id] && S.prog[id].pos > 0).concat([it.id]) }).filter((x) => !isBad(x.id));
  const sug = pickNextMovie(it, visibleAll('movie'), done, (x) => isBad(x.id));
  const items = picks.length ? [it, ...picks] : [it, ...(sug ? [sug] : [])];
  if (items.length < 2) return null;
  return { items, index: 0, movie: true, autoNext: false, play: (m) => startPlay(m, { ctx: movieCtx(m) }) };
}

// Film içerik uyarıları: kaynak toplayıcı sonuçları IndexedDB'de movie-advisory:<IMDb ID> anahtarıyla saklar.
const advisoryLabel = (v) => ({ violence: 'Şiddet', fear: 'Korku', language: 'Ağır dil', sex: 'Cinsellik', nudity: 'Çıplaklık', drugs: 'Alkol / madde', self_harm: 'Kendine zarar', discrimination: 'Ayrımcılık', flashing: 'Yanıp sönen ışıklar' }[String(v || '').toLowerCase()] || String(v || '').trim());
const advisoryLevel = (v) => ({ low: 'Düşük', moderate: 'Orta', high: 'Yüksek', severe: 'Çok yüksek' }[String(v || '').toLowerCase()] || '');
const advisorySmart = (warning) => {
  const raw = String([warning && warning.category, warning && warning.label, warning && warning.details, warning && warning.description].filter(Boolean).join(' ')).toLowerCase();
  if (/language|strong language|profan|swear|r-rating|heavy language|argo|küfür/.test(raw)) return { label: 'Ağır dil ve küfür', icon: 'message-circle-warning', level: 'Orta' };
  if (/physically intense|gore|injur|accident|violence|violent|şiddet|kanlı|yaralanma/.test(raw)) return { label: 'Şiddet ve rahatsız edici sahneler', icon: 'shield-alert', level: 'Yüksek' };
  if (/anxiety|anxious|fear|scary|terror|gerilim|kaygı|korku/.test(raw)) return { label: 'Yoğun kaygı ve korku', icon: 'brain', level: 'Orta' };
  if (/sex|sexual|nudity|cinsellik|çıplak/.test(raw)) return { label: 'Cinsellik ve çıplaklık', icon: 'eye-off', level: 'Orta' };
  if (/drug|alcohol|substance|madde|alkol/.test(raw)) return { label: 'Alkol ve madde kullanımı', icon: 'flask-conical', level: 'Orta' };
  if (/self.harm|suicide|kendine zarar|intihar/.test(raw)) return { label: 'Kendine zarar verme', icon: 'heart-crack', level: 'Yüksek' };
  if (/discriminat|racis|ayrımcılık|ırkçılık/.test(raw)) return { label: 'Ayrımcılık', icon: 'users', level: 'Orta' };
  if (/negative.example|harmful.behavio|olumsuz örnek/.test(raw)) return { label: 'Olumsuz davranış örnekleri', icon: 'alert-triangle', level: 'Orta' };
  return { label: 'İçerik hassasiyeti', icon: 'info', level: '' };
};
const advisoryTr = (value) => translateScreenwiseText(String(value || '').replace(/\*\*/g, '').trim());

// Bir filmin katalog eşleşmesi (yerel katalog/Cinemeta) ve uyarı aramasında kullanılacak künye. Ayrıntı sayfası ile önden indirme aynı yolu kullanır.
async function resolveAdvisoryMeta(it, info) {
  const meta = await loadMovieMetadata(net, it, info || null, store).catch(() => null);
  const advisoryMeta = meta || { title: (info && (info.original_name || info.original_title || info.name || info.title)) || it.name, year: yearOf((info && (info.year || info.release_date)) || it.year) };
  return { meta, advisoryMeta };
}

// ctx: { genres, plot } — sağlayıcının verdiği tür ve özet; doğrulanmış kayıt olmayan içerikler için tahmini uyarılar buradan çıkarılır.
// Tahminler ayrı ve "Tahmini" etiketiyle gösterilir.
async function paintMovieAdvisories(body, meta, failure = '', kind = 'movie', ctx = null) {
  const host = $('#mv-advisories', body);
  if (!host || !body.isConnected) return;
  let record = null;
  if (meta) {
    const key = advisoryKey(meta, kind);
    try { record = await store.cache.get(key); } catch { /* önbellek yok */ }
  }
  if (!body.isConnected || !host.isConnected) return;
  const warnings = Array.isArray(record && record.warnings) ? record.warnings.filter((w) => w && (w.category || w.type)) : [];
  const ratings = Array.isArray(record && record.ratings) ? record.ratings : [];
  const unique = [...new Map(warnings.map((w) => [String(w.category || w.type).toLowerCase(), w])).values()];
  const sourceNames = { ktb: 'T.C. Kültür ve Turizm Bakanlığı', screenwise: 'Screenwise aile rehberi' };
  // Tahmini uyarılar: doğrulanmış kaynakların zaten bildirdiği kategoriler yinelenmez.
  const known = new Set(unique.map((w) => String(w.category || w.type).toLowerCase()));
  const estimated = estimateAdvisories({ genres: (ctx && ctx.genres) || '', plot: (ctx && ctx.plot) || '' }).filter((e) => !known.has(e.category));
  const estChip = (e) => '<span class="mv-warning-chip mv-est-chip">' + icon(ESTIMATE_ICON[e.category]) + esc(ESTIMATE_LABEL[e.category]) + ' · ' + esc(advisoryLevel(e.level)) + ' <i>tahmini</i></span>';
  const hasRecord = !!(warnings.length || ratings.length || (record && record.guidance));
  host.innerHTML = (hasRecord || estimated.length
    ? ratings.map((r) => '<span class="mv-warning-chip mv-rating-chip">' + (r.est ? 'Tahmini yaş sınırı' : 'TR sınıflandırma') + ' · ' + esc(r.value) + '</span>').join('') + unique.slice(0, 5).map((w) => {
        const smart = advisorySmart(w);
        const label = smart.label;
        const level = advisoryLevel(w.level || w.severity) || smart.level;
        return '<span class="mv-warning-chip">' + icon(w.icon || advisorySmart(w).icon) + esc(label) + (level ? ' · ' + esc(level) : '') + '</span>';
      }).join('') + estimated.slice(0, Math.max(0, 5 - unique.length)).map(estChip).join('')
    : '<span class="mv-warning-checked">' + (record ? 'Henüz doğrulanmış içerik uyarısı bulunamadı' : (failure || 'İçerik uyarıları kontrol ediliyor')) + '</span>') +
    '<button class="mv-warning-info" id="mv-warning-info" type="button" aria-label="Ayrıntılı içerik uyarılarını göster">' + icon('info') + 'Detaylı uyarılar</button>';
  host.hidden = false;
  $('#mv-warning-info', host).addEventListener('click', () => {
    const ratingRows = ratings.map((r) => '<article class="mv-warning-detail"><div><b>' + (r.est ? 'Tahmini yaş sınırı' : 'Türkiye yaş sınıflandırması') + '</b><span>' + esc(r.value) + '</span></div><small>' + esc(r.source || 'Resmî kaynak') + '</small></article>').join('');
    const rows = ratingRows + warnings.map((w) => {
      const smart = advisorySmart(w);
      const label = smart.label;
      const level = advisoryLevel(w.level || w.severity) || smart.level;
      const detail = advisoryTr(w.details || w.description || w.summary || '');
      const source = w.source || 'Kaynak belirtilmemiş';
      const glyph = icon(w.icon || smart.icon);
      return '<article class="mv-warning-detail"><div><b>' + glyph + esc(label) + '</b>' + (level ? '<span>' + esc(level) + '</span>' : '') + '</div>' + (detail ? '<p>' + esc(detail) + '</p>' : '') + '<small>' + esc(source) + (w.url ? ' · <a href="' + esc(w.url) + '" target="_blank" rel="noopener">Kaynağı aç</a>' : '') + '</small></article>';
    }).join('');
    const sourceRows = Object.entries(record && record.sources || {}).map(([k, v]) => '<p class="mv-warning-checked">' + esc(sourceNames[k] || k) + ': ' + esc(v.status === 'found' ? 'Kayıt bulundu' : v.status === 'no_data' ? 'Kayıt bulunamadı' : v.status === 'unavailable' ? 'Kaynak sayfası veri sunmadı' : 'Kontrol edilemedi') + (v.message ? ' (' + esc(v.message) + ')' : '') + '</p>').join('');
    const checked = record && record.checkedAt ? new Date(record.checkedAt).toLocaleDateString(loc()) : '';
    const guidance = record && record.guidance ? '<article class="mv-warning-detail"><b>Screenwise aile rehberi</b>' + (record.guidance.summary ? '<p>' + esc(advisoryTr(record.guidance.summary)) + '</p>' : '') + (record.guidance.ageFit ? '<p>' + esc(advisoryTr(record.guidance.ageFit)) + '</p>' : '') + (record.guidance.score != null ? '<small>Rehber puanı: ' + esc(record.guidance.score) + '/100</small>' : '') + '</article>' : '';
    const estRows = estimated.length
      ? '<h4 class="mv-warning-h">Tahmini uyarılar</h4><p class="mv-warning-checked">Tür, özet ve anahtar kelimelerden çıkarılmıştır; doğrulanmış kayıt değildir, eksik ya da hatalı olabilir.</p>' +
        estimated.map((e) => '<article class="mv-warning-detail mv-est"><div><b>' + icon(ESTIMATE_ICON[e.category]) + esc(ESTIMATE_LABEL[e.category]) + '</b><span>' + esc(advisoryLevel(e.level)) + '</span></div><small>Tahmin · kaynak: ' + esc(e.from.join(', ')) + '</small></article>').join('')
      : '';
    const empty = !rows && !guidance ? '<p>Bu içerik için doğrulanmış bir sınıflandırma veya içerik uyarısı henüz alınamadı. Bu, yapımda sakıncalı içerik bulunmadığı anlamına gelmez.</p>' : '';
    openSheet({ title: 'İçerik uyarıları', html: '<div class="mv-warning-list">' + rows + guidance + empty + estRows + '</div>' + sourceRows + (checked ? '<p class="mv-warning-checked">Son kontrol: ' + esc(checked) + '</p>' : '') });
  });
}

// ---- fragman, oyuncu kartları, oyuncu sayfası ve listede olmayan yapımın bilgi ekranı (Cinemeta; cinemeta.js veri, title-ui.js HTML) ----
// Listeyle eşleştirme: ad dizini katalog değişince yenilenir; IMDb dizini ekranlar açıldıkça dolar (Türkçe adlı kayıtlar için).
let libIdx = { stamp: '', src: '', movie: null, series: null, byImdb: new Map() };
function libraryIndex() {
  const mv = visibleAll('movie');
  const sr = visibleAll('series');
  const src = S.source ? S.source.id : '';
  const stamp = `${src}:${mv.length}:${sr.length}`;
  if (libIdx.stamp !== stamp) libIdx = { stamp, src, movie: buildTitleIndex(mv), series: buildTitleIndex(sr), byImdb: libIdx.src === src ? libIdx.byImdb : new Map() };
  return libIdx;
}
// Yerel kanıt: program adı listenizde film olarak (ve dizi olarak değil) birebir geçiyorsa film sayılır.
const filmMemo = { stamp: '', map: new Map() };
function libraryFilm(title) {
  const ix = libraryIndex();
  if (filmMemo.stamp !== ix.stamp) { filmMemo.stamp = ix.stamp; filmMemo.map = new Map(); }
  const k = String(title || '');
  if (!filmMemo.map.has(k)) filmMemo.map.set(k, hasExactTitle(k, ix.movie) && !hasExactTitle(k, ix.series));
  return filmMemo.map.get(k);
}
// Türü boş TV rehberi programlarının film olup olmadığı: kütüphane + Wikidata/Cinemeta araması (film-lookup.js); sonuçlar önbellekte.
const filmResolver = createFilmResolver({ net, cache: store.cache, local: libraryFilm });
const inLibrary = (film) => {
  const ix = libraryIndex();
  return findInLibrary(film, { titleIndex: film.type === 'series' ? ix.series : ix.movie, imdbIndex: ix.byImdb });
};
// Cinemeta'dan İngilizce adla gelen yapımlar listenin Türkçe adlarıyla eşleştirilir; her aşamada eşleşme değişirse onChange çağrılır (ekran yeniden boyanır):
//  1) Wikidata'dan Türkçe adlar (tr-names.js; SPARQL, olmazsa API) — tam ve bulanık eşleşme;
//  2) hâlâ listede olmayan, yılı bilinen yapımların adı makine çevirisiyle Türkçeye çevrilir (en çok 24, 4 paralel) — yıl şartlı gevşek eşleşme (trGuess).
// Ağ yoksa sessizce hiçbir şey yapmaz.
async function enrichTrNames(films, onChange = () => {}) {
  const snap = () => films.map((f) => !!inLibrary(f));
  const changed = (before) => films.some((f, i) => !!inLibrary(f) !== before[i]);
  const need = films.filter((f) => !Array.isArray(f.trNames));
  if (need.length) {
    const before = snap();
    const map = await loadTrNames({ net, cache: store.cache, ids: need.map((f) => f.imdbId) }).catch(() => null);
    if (map && map.size) {
      for (const f of need) if (map.has(f.imdbId)) f.trNames = map.get(f.imdbId);
      if (changed(before)) onChange();
    }
  }
  const rest = films.filter((f) => f.year && !Array.isArray(f.trGuess) && !inLibrary(f)).slice(0, 24);
  if (rest.length) {
    const before = snap();
    for (const f of rest) f.trGuess = []; // aynı yapım için ikinci bir çağrı çeviriyi yinelemez
    let at = 0;
    const worker = async () => {
      while (at < rest.length) {
        const f = rest[at++];
        const t = await translateToTr({ net, cache: store.cache, text: f.name }).catch(() => null);
        if (t && t !== f.name) f.trGuess = [t];
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, rest.length) }, worker));
    if (changed(before)) onChange();
  }
}
const trailerOn = () => !kidActive() && !isTvUi(); // TV'de kumanda odağı iframe'e takılır; çocuk modunda dış video yok

// Fragman ve oyuncu kartlarını boyar. detail yoksa (IMDb eşleşmesi ya da ağ yok) yalnız sağlayıcının oyuncu listesi kartlanır.
// Fragman: Cinemeta'nınkiler önce, sağlayıcının (provider.trailer) ardından; hiçbiri yoksa query ile "YouTube’da fragman ara" bağlantısı (Türk yapımlarında Cinemeta'da çoğu zaman fragman yok).
// Hazır fragman yoksa (ve "Fragmanı otomatik ara" açıksa) başlık YouTube'da aranır; bulunan resmî fragman uygulama içinde oynar, bulunamazsa arama düğmesi kalır.
// onFound: aramayla fragman bulununca çağrılır (dizi ekranı yeniden çizildiğinde otomatik başlamasın diye).
// Sayfa ızgarası fragman alanının durumunu bilir (CSS .dt[data-tr]): stage = sahne üstte, card = "fragman ara" kartı, boş = eski düzen.
function stageMode(tr) {
  const dt = tr.closest && tr.closest('.dt');
  if (!dt) return;
  const sec = tr.firstElementChild;
  if (!sec) delete dt.dataset.tr;
  else dt.dataset.tr = sec.querySelector('.tr-hero') ? 'stage' : 'card';
}
function paintTitleExtras(body, detail, provider, { trailer, people, auto = true, query = '', finds = [], wanted = [], year = 0, bg = '', onFound = null }) {
  if (!body.isConnected) return;
  const tr = trailer ? $(trailer, body) : null;
  const pp = $(people, body);
  if (tr) {
    const ids = trailerIds(detail, provider && provider.trailer);
    const autoPlay = auto && trailerAutoOn();
    const locked = trailerLocked();
    const find = trailerOn() && !locked && !ids.length && finds.length > 0 && setting('trailerFind');
    const stageBg = (detail && detail.background) || bg; // sahnenin gölgeli afişi: geniş arka plan görseli (yoksa videonun küçük resmi)
    const lockedCard = trailerOn() && locked && (ids.length > 0 || !!query || finds.length > 0);
    tr.innerHTML = !trailerOn() ? '' : locked ? (lockedCard ? trailerLockedHtml() : '') : trailerHtml(ids, { auto: autoPlay, origin: location.origin, query, searching: !!find, bg: stageBg });
    stageMode(tr);
    if (lockedCard) $('[data-tr=lock]', tr).addEventListener('click', () => needPro('trailer')); // kilitli kart: Pro sayfası açılır
    else if (tr.firstElementChild) wireTrailer(tr.firstElementChild);
    const token = (tr._find = (tr._find || 0) + 1); // sonradan yapılan yeni boyama eski aramanın sonucunu geçersiz kılar
    if (find) {
      (async () => {
        let picks = [];
        const infos = [];
        for (const q of finds) {
          const r = await findTrailerOnYoutube({ net, cache: store.cache, query: q, wanted, year, onInfo: (i) => infos.push(i) }).catch((e) => { infos.push({ error: String((e && e.message) || e) }); return null; });
          if (r && r.length && !picks.length) picks = r; // ilk sonuç listesi yedek kalır
          if (r && r.some((p) => p.good)) { picks = r; break; } // en alakalı fragman bulunduysa dur
        }
        if (!tr.isConnected || tr._find !== token) return;
        const good = picks.length > 0 && picks[0].good; // en alakalı fragman ilk sırada: otomatik oynar; yoksa sonuçlar şeritte, kullanıcı seçer
        tr.innerHTML = trailerHtml(picks.map((p) => p.id), { auto: autoPlay && good, origin: location.origin, query, found: picks, bg: stageBg, diag: picks.length ? '' : describeFind(infos) });
        stageMode(tr);
        if (tr.firstElementChild) wireTrailer(tr.firstElementChild);
        if (good && onFound) onFound();
      })();
    }
  }
  if (pp) {
    const people = kidActive() ? [] : peopleOf(detail, provider);
    pp.innerHTML = peopleHtml(people, actorsLocked());
    if (!actorsLocked()) paintPhotos(pp, people, detail && detail.imdbId);
  }
}

// Oyuncu fotoğrafları (Wikidata; Cinemeta yalnız ad verir): kartlar önce baş harflerle çizilir, fotoğraflar gelince yeniden boyanır (yatay kaydırma korunur).
function paintPhotos(pp, people, imdbId) {
  if (!pp || !people.length) return;
  const token = (pp._ph = (pp._ph || 0) + 1); // sonradan yapılan boyama eski sonucu geçersiz kılar
  loadPersonPhotos({ net, cache: store.cache, names: people.map((p) => p.name), imdbId: imdbId || '' }).then((map) => {
    if (!pp.isConnected || pp._ph !== token || !map.size) return;
    let changed = false;
    for (const p of people) {
      const u = !p.photo && map.get(nameKey(p.name));
      if (u) { p.photo = u; changed = true; }
    }
    if (!changed) return;
    const row = $('.pp-row', pp);
    const left = row ? row.scrollLeft : 0;
    pp.innerHTML = peopleHtml(people, actorsLocked());
    const nrow = $('.pp-row', pp);
    if (nrow) nrow.scrollLeft = left;
  }).catch(() => {});
}

// Kütüphane öğesinin ekranında: IMDb kimliği çözülünce ayrıntıyı alır, onDetail ile boyar.
// IMDb eşleşmesi yoksa (Türkçe adlı yabancı yapımlar) Türkçe ad Wikidata'dan özgün ada ve IMDb kimliğine çevrilir; yalnız fragman/oyuncu için (içerik uyarıları sıkı eşleşmeyle kalır).
// onDetail(detail, origin): origin = { imdbId, year, original } | null — YouTube aramasında özgün ad kullanılır.
function loadTitleExtras(it, imdbId, type, onDetail, year = '') {
  if (imdbId) libraryIndex().byImdb.set(imdbId, it);
  const detailOf = (id, origin) => loadDetail({ net, cache: store.cache, imdbId: id, type }).catch(() => null).then((d) => onDetail(d, origin));
  if (imdbId) return detailOf(imdbId, null);
  resolveTitleOrigin(net, it.name, year, store).catch(() => null).then((origin) => (origin && origin.imdbId ? detailOf(origin.imdbId, origin) : onDetail(null, origin)));
}
// Fragman araması: YouTube Türkçe adla da doğru sonucu verir, bu yüzden önce katalog adı ("… 2022 fragman"), sonra bilinen özgün ad ("… official trailer").
// query: "YouTube’da ara" düğmesi; finds: uygulamanın kendi aramaları (sırayla); wanted: bulunan videonun başlığıyla karşılaştırılacak adlar.
function trailerSearch(name, year, origin) {
  const t = trailerTitle(name, year);
  const y = t.year || Number((/\b(?:19|20)\d{2}\b/.exec(String(year ?? '')) || [])[0]) || 0;
  const original = origin && origin.original ? origin.original : '';
  const oy = (origin && origin.year) || y;
  // Türkçe adla yılsız aranır ("Asla Teslim Olma fragman"): YouTube adı filmle eşleştirir, "2026 fragman" gibi genel sözcükler başka filmleri öne çıkarır.
  // Özgün adlı aramada yıl kalır (yabancı adlar zaten ayırt edicidir).
  const query = `${t.title} fragman`;
  const finds = [query, original ? trailerQuery(original, oy || '', 'official trailer') : ''].filter(Boolean);
  return { query, finds: [...new Set(finds)], wanted: [t.title, original].filter(Boolean), year: oy };
}

const personOf = (b) => ({ name: b.dataset.person, role: b.dataset.role || '', photo: b.dataset.photo || '' });

// Oyuncu sayfası: kişinin film ve dizileri; listede olanlar "Oynat", olmayanlar soluk "Listende yok".
function openActor(name, role = '', photo = '') {
  if (!needPro('actors')) return undefined; // Pro özelliği: Pro sayfası açılır
  return openPage({
    cls: 'dt-pg ac-pg',
    title: name,
    html: actorLoadingHtml(name, photo),
    mount: async (body) => {
      let found;
      try {
        found = await searchPerson({ net, cache: store.cache, name });
      } catch {
        if (body.isConnected) body.innerHTML = emptyHtml('Yapımlar alınamadı', 'İnternet bağlantınızı kontrol edin.');
        return;
      }
      if (!body.isConnected) return;
      const films = [...found.movies, ...found.series].sort((a, b) => b.year - a.year);
      let painted = false;
      const paint = () => {
        for (const f of films) f.inLib = !!inLibrary(f);
        const top = body.scrollTop;
        body.innerHTML = actorHtml(name, role, films, photo);
        body.scrollTop = top;
        painted = true;
      };
      paint();
      if (!photo) { // karttan fotoğraf gelmediyse (henüz yüklenmemiş / sağlayıcı kadrosu) kişinin kendi fotoğrafı aranır
        loadPersonPhotos({ net, cache: store.cache, names: [name] }).then((m) => {
          const u = m.get(nameKey(name));
          if (u && body.isConnected) { photo = u; if (painted) paint(); }
        }).catch(() => {});
      }
      body.addEventListener('click', (e) => {
        const c = e.target.closest('[data-film]');
        const film = c && films.find((f) => (f.id || f.imdbId) === c.dataset.film);
        if (film) openTitleInfo(film);
      });
      enrichTrNames(films, () => { if (body.isConnected) paint(); }); // Türkçe adlar gelince eşleşenler "Oynat"a döner
    },
  });
}

// Vizyondaki filmler (Türkiye sinema siteleri: Beyazperde, Paribu Cineverse, Biletinial; vizyon.js — alınamazsa Cinemeta "yeni çıkanlar"): ana sayfa satırı oturumda bir kez doldurulur, 6 saat saklanır; kart yapımın ekranını açar (listedeyse Oynat, değilse fragmanlı bilgi). Çocuk modunda yok.
let newHome = null;
let newBusy = false;
const loadVizyonList = () => loadVizyon({ net, cache: store.cache, fallback: () => loadNewReleases({ net, cache: store.cache }) });
function fillHomeNew() {
  const el = $('#home-new');
  if (el) el.innerHTML = kidActive() || !newHome ? '' : releasesRowHtml(newHome.films, (f) => !!inLibrary(f));
}
function ensureHomeNew() {
  if (kidActive() || newBusy) return;
  if (newHome) return fillHomeNew();
  newBusy = true;
  loadVizyonList().then((r) => { newHome = r; }, () => {}).finally(() => {
    newBusy = false;
    fillHomeNew();
    if (newHome) enrichTrNames(newHome.films, fillHomeNew);
  });
}
function openNewReleases() {
  if (kidActive()) return;
  return openPage({
    cls: 'dt-pg ac-pg',
    title: 'Vizyondaki filmler',
    html: actorLoadingHtml('Vizyondaki filmler'),
    mount: async (body) => {
      try {
        if (!newHome) newHome = await loadVizyonList();
      } catch {
        if (body.isConnected) body.innerHTML = emptyHtml('Filmler alınamadı', 'İnternet bağlantınızı kontrol edin.');
        return;
      }
      if (!body.isConnected) return;
      const films = newHome.films;
      const paint = () => {
        for (const f of films) f.inLib = !!inLibrary(f);
        const top = body.scrollTop;
        body.innerHTML = releasesPageHtml(films, { sources: sourcesNote(newHome.sources), stale: newHome.stale, fallback: newHome.fallback });
        body.scrollTop = top;
      };
      paint();
      body.addEventListener('click', (e) => {
        const c = e.target.closest('[data-film]');
        const film = c && films.find((f) => f.imdbId === c.dataset.film);
        if (film) openTitleInfo(film);
      });
      enrichTrNames(films, () => { if (body.isConnected) paint(); });
    },
  });
}

// Bir yapımın ekranı: listedeyse kendi film/dizi ekranı (Oynat), değilse "Listende yok" bilgi ekranı (önce fragman).
// Cinemeta özeti İngilizce gelir: önce özgün metin görünür, çeviri gelince yerini alır; "Özgün metni göster" ile geri dönülür. Çeviri alınamazsa özgün metin kalır.
function translatePlot(body, text) {
  const p = $('.dt-plot', body);
  if (!p || !text) return;
  translateToTr({ net, cache: store.cache, text }).then((tr) => {
    if (!body.isConnected || !p.isConnected || !tr || tr === text) return;
    p.dataset.en = text;
    p.dataset.tr = tr;
    p.dataset.lang = 'tr';
    p.textContent = tr;
    p.insertAdjacentHTML('afterend', '<button class="dt-orig" type="button" data-orig>Özgün metni göster</button>');
  });
}
function togglePlot(body) {
  const p = $('.dt-plot', body);
  const o = $('[data-orig]', body);
  if (!p || !o || !p.dataset.tr) return;
  const toEn = p.dataset.lang === 'tr';
  p.dataset.lang = toEn ? 'en' : 'tr';
  p.textContent = toEn ? p.dataset.en : p.dataset.tr;
  o.textContent = toEn ? 'Türkçe çeviriyi göster' : 'Özgün metni göster';
}

function openTitleInfo(film) {
  const own = inLibrary(film);
  if (own) return film.type === 'series' ? openSeries(own) : openMovie(own);
  return openPage({
    cls: 'dt-pg',
    html: titleInfoHtml(film, null, true),
    mount: (body) => {
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-person]');
        if (b) openActor(personOf(b).name, personOf(b).role, personOf(b).photo);
        const o = e.target.closest('[data-orig]');
        if (o) togglePlot(body);
      });
      // Sinema sitelerinden gelen filmin IMDb kaydı yoktur: Türkçe ad + yıl ile Wikidata'dan bulunur (bulunamazsa fragman Türkçe adla aranır, özet yoktur)
      const originOf = film.imdbId ? Promise.resolve(null) : resolveTitleOrigin(net, film.name, film.year, store).catch(() => null);
      originOf.then((origin) => {
        if (origin && origin.imdbId) film.imdbId = origin.imdbId;
        const detail = film.imdbId ? loadDetail({ net, cache: store.cache, imdbId: film.imdbId, type: film.type }).catch(() => null) : null;
        return Promise.resolve(detail).then((d) => [d, origin]);
      }).then(([detail, origin]) => {
        if (!body.isConnected) return;
        body.innerHTML = titleInfoHtml(film, detail);
        paintTitleExtras(body, detail, {}, { trailer: '#ti-trailer', people: '#ti-people', ...trailerSearch(film.name, film.year, origin) });
        translatePlot(body, detail && detail.description);
      });
    },
  });
}

function openMovie(it) {
  const p = store.progress(sid(), it.id);
  const resumeTxt = p ? `Devam et · ${fmtDuration(p.pos)}` : 'Oynat';
  return openPage({
    cls: 'dt-pg',
    html: `<div class="dt"><div class="dt-tr" id="mv-trailer"></div><div class="dt-pos">${posterOf(it)}</div><div class="dt-head"><h1 class="dt-t">${esc(it.name)}</h1><div class="dt-m" id="mv-meta">${chipsOf([it.group, starsOf(it.rating)])}</div><div class="mv-advisories" id="mv-advisories" hidden></div><div class="dt-btns"><button class="btn lg" id="mv-play">${icon('play')}${esc(resumeTxt)}</button>${p ? '<button class="btn ghost" id="mv-start">Baştan başlat</button>' : ''}<button class="btn ghost" id="mv-fav">${icon(isFav(it) ? 'star-on' : 'star')}Favori</button>${dlOk() ? '<button class="btn ghost" id="mv-dl"></button>' : ''}${nativePlugin && !isTvUi() ? `<button class="btn ghost" id="mv-cast">${icon('cast')}TV’de oynat</button>` : ''}<button class="btn ghost" id="mv-fold">${icon('folder')}Klasör</button></div></div><div class="dt-body"><h2>Film hakkında</h2><p class="dt-plot" id="mv-plot"><span class="dt-load">Yükleniyor…</span></p><dl class="dt-facts" id="mv-facts"></dl><div class="dt-pp" id="mv-people"></div><section class="mv-similar" id="mv-similar" hidden><h2>Bunları da beğenebilirsiniz</h2><div class="mv-similar-row" id="mv-similar-row"></div></section></div></div>`,
    mount: (body) => {
      paintMovieAdvisories(body, null);
      $('#mv-play', body).addEventListener('click', () => startPlay(it, { ctx: movieCtx(it) }));
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-person]');
        if (b) openActor(personOf(b).name, personOf(b).role, personOf(b).photo);
      });
      $('#mv-similar-row', body).addEventListener('click', (e) => {
        const b = e.target.closest('[data-similar]');
        if (!b) return;
        const next = visibleAll('movie').find((x) => x.id === b.dataset.similar);
        if (next) openMovie(next);
      });
      const st = $('#mv-start', body);
      if (st) st.addEventListener('click', () => startPlay(it, { startAt: 0, ctx: movieCtx(it) }));
      const cb = $('#mv-cast', body);
      if (cb) cb.addEventListener('click', () => castItem(it, null, { startMs: p && p.pos > 0 ? Math.max(0, p.pos - 3000) : 0 }));
      $('#mv-fold', body).addEventListener('click', () => folderSheet('movie', it));
      $('#mv-fav', body).addEventListener('click', () => {
        toggleFav(it);
        $('#mv-fav', body).innerHTML = icon(isFav(it) ? 'star-on' : 'star') + 'Favori';
      });
      if (dlOk()) {
        const paintDl = () => {
          const b = $('#mv-dl', body);
          if (!b) return;
          const j = dlMovieJob(it);
          b.innerHTML = dlBtnLabel(j);
          b.classList.toggle('on', !!j && j.state === 'done');
        };
        paintDl();
        watchDl(body, paintDl);
        $('#mv-dl', body).addEventListener('click', () => dlToggle(it, null));
      }
      // İçerik uyarıları: film bilgisi alınamasa bile başlıkla aranır (bir kez başlatılır).
      let advStarted = false;
      const startAdvisories = (info) => {
        if (advStarted) return;
        advStarted = true;
        // Yerel katalog eşleşmesi ve içerik uyarıları; puan gösterilmez.
        const provider = { cast: (info && info.cast) || it.cast, director: (info && info.director) || it.director, trailer: (info && info.trailer) || it.trailer };
        const extrasOf = (meta, origin) => ({ trailer: '#mv-trailer', people: '#mv-people', bg: (info && info.backdrop) || it.backdrop || '', ...trailerSearch(it.name, (info && info.year) || (meta && meta.year), origin) });
        resolveAdvisoryMeta(it, info).then(({ meta, advisoryMeta }) => {
          if (!body.isConnected) return;
          loadTitleExtras(it, meta && meta.imdbId, 'movie', (detail, origin) => paintTitleExtras(body, detail, provider, extrasOf(meta, origin)), (info && info.year) || (meta && meta.year));
          const advCtx = { genres: (info && info.genre) || it.genre || '', plot: (info && info.plot) || it.plot || '' };
          loadMovieAdvisories(net, store, advisoryMeta, it).then(() => paintMovieAdvisories(body, advisoryMeta, meta ? '' : 'Katalog eşleşmesi bulunamadı; başlık üzerinden içerik uyarıları arandı.', 'movie', advCtx)).catch(() => paintMovieAdvisories(body, advisoryMeta, 'İçerik uyarısı kaynağına erişilemedi.', wk, 'movie', advCtx));
          if (info) {
            const chips = [it.group, yearOf((info && info.year) || (meta && meta.year)), info && info.genre, info && info.durationSec && `${Math.round(info.durationSec / 60)} dk`, starsOf(info && (info.rating || it.rating))];
            $('#mv-meta', body).innerHTML = chipsOf(chips);
          }
        }).catch(() => {
          if (!body.isConnected) return;
          paintTitleExtras(body, null, provider, extrasOf(null, null)); // eşleşme çözülemese de sağlayıcı fragmanı / YouTube araması gösterilir
          paintMovieAdvisories(body, null, 'İçerik uyarıları alınamadı; internet bağlantınızı kontrol edin.');
        });
      };
      const plot = $('#mv-plot', body);
      loadVodInfo(S.source, net, it)
        .then((info) => {
          plot.textContent = (info && info.plot) || it.plot || 'Bu kaynak film özeti sağlamıyor.';
          if (info) {
            $('#mv-meta', body).innerHTML = chipsOf([it.group, yearOf(info.year), info.genre, info.durationSec && `${Math.round(info.durationSec / 60)} dk`, starsOf(info.rating || it.rating)]);
            $('#mv-facts', body).innerHTML = factsOf([['Yönetmen', info.director], ['Oyuncular', info.cast], ['Ülke', info.country], ['Yayın tarihi', info.year]]);
          }
          startAdvisories(info);
          const picks = recommendMovies(it, info || {}, visibleAll('movie'), { limit: 12, excludeIds: Object.keys(S.prog).filter((id) => S.prog[id] && S.prog[id].pos > 0) });
          const section = $('#mv-similar', body);
          const row = $('#mv-similar-row', body);
          if (picks.length) {
            row.innerHTML = picks.map((x) => `<button class="mv-similar-card" data-similar="${esc(x.id)}" aria-label="${esc(x.name)}"><span class="mv-similar-poster">${posterOf(x)}</span><b>${esc(x.name)}</b>${x.group ? `<small>${esc(x.group)}</small>` : ''}</button>`).join('');
            section.hidden = false;
          }
        })
        .catch(() => {
          plot.textContent = 'Özet alınamadı.';
          startAdvisories(null);
        });
    },
  });
}

// Dizinin tüm bölümleri (sezon sırasıyla) ve bölüm açan işlev: ayrıntı sayfası ile TV ana ekranından devam etme aynı yolu kullanır.
function episodesOf(info) {
  const all = [];
  for (const s of info.seasons) for (const e of s.episodes) all.push({ ...e, season: s.season, label: `S${s.season} B${e.episodeNum}` + (e.title && !/^Bölüm/i.test(e.title) ? ` · ${e.title}` : '') });
  return all;
}

function seriesPlayer(it, all) {
  return (ep, startAt) => {
    const index = all.findIndex((x) => x.id === ep.id);
    const ctx = { items: all, index, autoNext: true, play: (e, i) => startPlay(it, { ep: e, ctx: { ...ctx, index: i } }) };
    startPlay(it, { ep, ctx, startAt });
  };
}

function openSeries(it) {
  return openPage({
    cls: 'dt-pg dt-sp',
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
      const all = episodesOf(info);
      let season = info.seasons[0].season;
      const last = progressOf(it);
      if (last) {
        const e = all.find((x) => x.id === last.id);
        if (e) season = e.season;
      }
      const play = seriesPlayer(it, all);
      const plotText = info.plot || it.plot || '';
      const dlUi = dlOk();
      const byId = new Map(all.map((e) => [e.id, e]));
      // Bölüm simgeleri ve “Sezonu indir” düğmesi: sayfa yeniden çizilmeden yerinde güncellenir (odak/kaydırma bozulmasın)
      const paintDl = () => {
        for (const b of $$('[data-dl]', body)) {
          const j = dlJobOf(it, byId.get(b.dataset.dl));
          b.innerHTML = dlEpGlyph(j);
          b.setAttribute('aria-label', dlEpAria(j));
          b.classList.toggle('on', !!j && j.state === 'done');
        }
        const sb = $('#sr-dls', body);
        if (!sb) return;
        const eps = all.filter((x) => x.season === season);
        const done = eps.filter((x) => isDone(dlJobOf(it, x))).length;
        sb.innerHTML = done === eps.length ? `${icon('check')}Sezon ${season} indirildi` : done || eps.some((x) => isActive(dlJobOf(it, x))) ? `${icon('dl')}Sezon ${season} · ${done}/${eps.length} indirildi` : `${icon('dl')}Sezonu indir`;
      };
      if (dlUi) watchDl(body, paintDl);
      // İçerik uyarıları (dizi): sayfa her yeniden çizildiğinde (sezon/favori) son durum yeniden boyanır.
      let adv = { meta: null, failure: '', wk: null };
      // Fragman ve oyuncu kartları: sayfa yeniden çizilince fragman yeniden başlamasın diye otomatik oynatma yalnız ilk boyamada olur.
      // Fragman, eşleşme çözülene kadar (ready) boyanmaz: önce sağlayıcınınki, sonra Cinemeta'nınki gelirse video değişip yeniden başlardı.
      const extras = { detail: null, origin: null, ready: false, shown: false, provider: { cast: info.cast || it.cast, director: info.director || it.director, trailer: info.trailer || it.trailer } };
      const paintExtras = () => {
        paintTitleExtras(body, extras.detail, extras.provider, { trailer: extras.ready ? '#sr-trailer' : '', people: '#sr-people', bg: info.backdrop || it.backdrop || '', auto: !extras.shown, onFound: () => { extras.shown = true; }, ...trailerSearch(it.name, info.year || it.year, extras.origin) });
        if (extras.ready && trailerIds(extras.detail, extras.provider.trailer).length && trailerOn()) extras.shown = true;
      };
      const paintAdv = () => paintMovieAdvisories(body, adv.meta, adv.failure, 'series', { genres: (info && info.genre) || it.genre || '', plot: (info && info.plot) || it.plot || '' });
      const draw = () => {
        const p = progressOf(it);
        const cont = p ? all.find((x) => x.id === p.id) : null;
        const seasons = info.seasons.map((s) => `<button class="chip ${s.season === season ? 'on' : ''}" data-s="${s.season}">Sezon ${s.season}</button>`).join('');
        const eps = info.seasons.find((s) => s.season === season).episodes;
        const rows = eps
          .map((e) => {
            const pr = S.prog[e.id];
            const pct = pr && pr.dur > 0 ? Math.round((pr.pos / pr.dur) * 100) : 0;
            const th = e.logo ? `<span class="epi-th"><img src="${esc(e.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></span>` : '';
            const row = `<button class="epi${th ? ' has-th' : ''}" data-ep="${esc(e.id)}"><b>${e.episodeNum}</b>${th}<span class="t">${esc(e.title)}${e.durationSec ? `<small>${Math.round(e.durationSec / 60)} dk</small>` : ''}${pct ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}</span>${icon('play')}</button>`;
            return dlUi ? `<div class="epi-w">${row}<button class="icon-btn epi-dl" data-dl="${esc(e.id)}"></button></div>` : row;
          })
          .join('');
        const scroll = body.scrollTop;
        body.innerHTML = `<div class="dt"><div class="dt-tr" id="sr-trailer"></div><div class="dt-pos">${posterOf(it)}</div><div class="dt-head"><h1 class="dt-t">${esc(it.name)}</h1><div class="dt-m">${chipsOf([it.group, info.genre, yearOf(info.year), starsOf(info.rating || it.rating), `${info.seasons.length} sezon`])}</div><div class="mv-advisories" id="mv-advisories" hidden></div><div class="dt-btns">${cont ? `<button class="btn lg" id="sr-cont">${icon('play')}Devam et · ${esc(cont.label.split(' · ')[0])}</button>` : `<button class="btn lg" id="sr-first">${icon('play')}İlk bölümü oynat</button>`}<button class="btn ghost" id="sr-fav">${icon(isFav(it) ? 'star-on' : 'star')}Favori</button><button class="btn ghost" id="sr-fold">${icon('folder')}Klasör</button></div></div><div class="dt-body"><h2>Dizi hakkında</h2><p class="dt-plot">${esc(plotText || 'Bu dizi için özet bulunamadı.')}</p><dl class="dt-facts">${factsOf([['Yönetmen', info.director], ['Oyuncular', info.cast]])}</dl><div class="dt-pp" id="sr-people"></div><div class="dt-eps"><h3 class="dt-eps-h">${season}. SEZON <small>· ${eps.length} BÖLÜM</small></h3><div class="chips">${seasons}</div>${dlUi ? '<div class="dt-dlrow"><button class="btn sm ghost" id="sr-dls"></button></div>' : ''}${rows}</div></div></div>`;
        body.scrollTop = scroll;
        paintAdv();
        paintExtras();
        if (dlUi) paintDl();
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
        const pp = e.target.closest('[data-person]');
        if (pp) return openActor(personOf(pp).name, personOf(pp).role, personOf(pp).photo);
        const s = e.target.closest('[data-s]');
        if (s) {
          season = Number(s.dataset.s);
          return draw();
        }
        const d = e.target.closest('[data-dl]');
        if (d) return dlToggle(it, byId.get(d.dataset.dl));
        if (e.target.closest('#sr-dls')) return dlAsk(it, { eps: all.filter((x) => x.season === season), season });
        const b = e.target.closest('[data-ep]');
        if (b) play(all.find((x) => x.id === b.dataset.ep));
      });
      draw();
      // Cinemeta (IMDb kimliği) + Screenwise; KTB film sitesi diziler için kullanılmaz.
      loadSeriesMetadata(net, it, store).catch(() => null).then((meta) => {
        if (!body.isConnected) return;
        loadTitleExtras(it, meta && meta.imdbId, 'series', (detail, origin) => { extras.detail = detail; extras.origin = origin; extras.ready = true; paintExtras(); }, info.year || it.year);
        const parsed = parseMovieCatalogTitle(it.name || '');
        const base = meta || { title: parsed.title || it.name, year: yearOf(info.year || it.year) || parsed.year || 0 };
        const advisoryMeta = { ...base, kind: 'series' };
        adv = { meta: advisoryMeta, failure: meta ? '' : 'Katalog eşleşmesi bulunamadı; başlık üzerinden içerik uyarıları arandı.' };
        return loadMovieAdvisories(net, store, advisoryMeta, it, 'series').catch(() => { adv.failure = 'İçerik uyarısı kaynağına erişilemedi.'; }).then(() => { if (body.isConnected) paintAdv(); });
      }).catch(() => {
        adv = { ...adv, failure: 'İçerik uyarıları alınamadı; internet bağlantınızı kontrol edin.' };
        if (!body.isConnected) return;
        if (!extras.ready) { extras.ready = true; paintExtras(); } // eşleşme çözülemese de sağlayıcı fragmanı / YouTube araması gösterilir
        paintAdv();
      });
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
      const label = dayKey(now) === d ? 'Bugün' : date.toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short' });
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

function refreshFavs(keepScroll = false) {
  const kind = S.favKind;
  S.items = sortItems(store.favs(sid()).filter((f) => f.kind === kind).map((f) => resolve(f, kind)).filter(Boolean), S.sort[kind]);
  $('#crumb-sort').hidden = false; // favorilerde de üst çubuktaki sırala düğmesi çalışır
  $('#crumb-sort').classList.toggle('on', S.sort[kind] !== 'default');
  S.list.setItems(S.items, keepScroll);
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
      if (s.managed) lines.push('Davet koduyla eklendi');
      else if (s.type === 'xtream') lines.push(`${esc(normalizeServer(s.server))} · ${esc(s.user)}`);
      else if (s.local) lines.push(`Dosya: ${esc(s.fileName || s.name)}`);
      else lines.push(esc(s.url));
      if (act) {
        lines.push(`${c.live.length} kanal · ${c.movies.length} film · ${c.series.length} dizi`);
        lines.push(`Son güncelleme: ${fmtAgo(c.fetchedAt)}`);
        if (c.account && c.account.expires) lines.push(`Abonelik bitişi: ${new Date(c.account.expires).toLocaleDateString(loc())}`);
        if (c.account && c.account.maxConnections) lines.push(`Aynı anda en çok ${c.account.maxConnections} cihaz`);
        if (S.epgInfo && S.epgInfo.error) lines.push(`TV rehberi alınamadı: ${esc(S.epgInfo.error)}`);
        else if (S.epg.ready) lines.push(`TV rehberi: ${Object.keys(S.epg.data.map).length} kanal eşleşti`);
        else if (epgSourceUrls(s, c).length) lines.push('TV rehberi henüz yüklenmedi');
        else lines.push('TV rehberi adresi yok');
      }
      return `<div class="src ${act ? 'active' : ''}"><h4>${esc(s.name)}${act ? '<span class="badge">Etkin</span>' : ''}</h4>${lines.map((l) => `<p>${l}</p>`).join('')}<div class="btns">${act ? '<button class="btn sm" data-a="refresh">Yenile</button>' : `<button class="btn sm" data-a="use" data-id="${esc(s.id)}">Kullan</button>`}${s.managed ? '' : `<button class="btn sm ghost" data-a="edit" data-id="${esc(s.id)}">Düzenle</button>`}<button class="btn sm danger" data-a="del" data-id="${esc(s.id)}">Sil</button></div></div>`;
    })
    .join('');
  const grid = `<div class="set-grid"><button class="set-tile" data-set="general">${icon('sliders')}<span>Genel ayarlar</span></button><button class="set-tile" data-set="theme">${icon('palette')}<span>Uygulama teması</span></button><button class="set-tile" data-set="motion">${icon('activity')}<span>Görünüm ve animasyonlar</span></button><button class="set-tile" data-set="player">${icon('play')}<span>Oynatıcı ayarları</span></button><button class="set-tile" data-set="epg">${icon('cal')}<span>TV rehberi (EPG)</span></button><button class="set-tile" data-set="health">${icon('activity')}<span>Yayın kalitesi</span></button><button class="set-tile" data-set="speedtest">${icon('activity')}<span>İnternet hız testi</span></button><button class="set-tile" data-set="plans">${icon('bell')}<span>Planlananlar</span></button><button class="set-tile" data-set="auto">${icon('timer')}<span>Otomasyon</span></button><button class="set-tile" data-set="kid">${icon('lock')}<span>Çocuk profili</span></button><button class="set-tile" data-set="news">${icon('info')}<span>Yenilikler</span></button>${nativePlugin ? `<button class="set-tile" data-set="rec">${icon('rec')}<span>Kayıtlar</span></button><button class="set-tile" data-set="dl">${icon('dl')}<span>İndirilenler</span></button><button class="set-tile" data-set="cast">${icon('cast')}<span>Telefondan oynat</span></button>` : ''}${kidActive() ? '' : `<button class="set-tile" data-set="profiles">${icon('home')}<span>${store.profileId() ? `Profil: ${esc(store.profile().name)}` : 'Profiller'}</span></button>`}${memOn() || store.pref('adm.on', false) ? `<button class="set-tile" data-set="member">${icon('star-on')}<span>Üyelik</span></button>` : ''}${store.pref('adm.on', false) && !isPlay() ? `<button class="set-tile" data-set="admin">${icon('lock')}<span>Yönetici</span></button>` : ''}${isPlay() ? '' : `<button class="set-tile" data-set="update">${icon('refresh')}<span>${upd && upd.status === 'available' ? 'Yeni sürüm var' : 'Güncellemeyi denetle'}</span></button>`}</div>`;
  v.innerHTML = `<div class="page">${grid}<div class="sect">Kaynaklar</div>${cards}<button class="btn" id="src-add">${icon('plus')}Kaynak ekle</button><div class="sect">Diğer</div><button class="btn ghost sm" id="clr-rec">Son izlenenleri temizle</button><a class="btn ghost sm" id="privacy-link" href="https://github.com/YonetimMerkezi/-ptvplayer/blob/main/gizlilik-politikasi.md" target="_blank" rel="noopener">Gizlilik politikası</a><p style="color:var(--muted);font-size:.75rem;margin-top:18px">Iptv Player Pro bir yayın hizmeti değildir ve içerik sağlamaz. Yalnızca yasal olarak erişim hakkınız olan kaynakları kullanın.</p><p id="ver-tap" style="color:var(--muted);font-size:.75rem">Sürüm ${esc(VERSION)}</p></div>`;
  v.addEventListener('click', onSourcesClick);
}

// Sürüm satırına art arda 7 dokunuş yönetici panelini açar/gizler (güvenlik gizlilikten değil, token ve paroladan gelir).
let verTaps = 0;
let verTapAt = 0;
function verTap() {
  const now = Date.now();
  if (isPlay()) return;
  verTaps = now - verTapAt < 1500 ? verTaps + 1 : 1;
  verTapAt = now;
  if (verTaps < 7) return;
  verTaps = 0;
  const on = !store.pref('adm.on', false);
  store.setPref('adm.on', on);
  toast(on ? 'Yönetici paneli açıldı' : 'Yönetici paneli gizlendi');
  renderTab();
}

// Spor (futbol): maç takvimi ve skorlar; maçın kanalı TV rehberinden bulunur. Modül ilk kullanımda yüklenir.
async function openSportsPage() {
  try {
    const m = await import('./sports-ui.js');
    m.openSports({
      net,
      store,
      toast,
      liveItems: () => visibleAll('live'),
      epgBetween: (from, to) => S.epg.between(from, to),
      play: (items, index) => playLive(items, index),
      sourceId: () => sid(),
      // Maç hatırlatıcıları, program hatırlatıcılarıyla aynı plan listesinde durur (Planlananlar ekranında görünür, alarm uygulama kapalıyken de çalışır)
      reminders: {
        list: () => readPlans(),
        set: (plan) => {
          const p = { ...plan, at: Math.max(plan.at, Date.now() + 3000) }; // başlamasına az kaldıysa hemen haber verir
          setPlans(addPlan(readPlans(), p));
          ensurePlanPermissions();
          return p;
        },
        remove: (id) => setPlans(removePlan(readPlans(), id)),
      },
    });
  } catch (e) {
    toast('Spor ekranı açılamadı: ' + ((e && e.message) || e));
  }
}

// Bugün TV'de: TV rehberinden bugünün spor, film ve dizi programları (seçilen kanallara göre). Modül ilk kullanımda yüklenir.
// ---- Radyo & Müzik (radio.js veri, radio-ui.js ekran). Önce kullanıcının listesindeki radyo kanalları; internet dizini (24 saat saklanır) yedektir ve yalnız listede radyo yoksa ya da kullanıcı seçerse yüklenir.
let listRadioMemo = { key: '', items: [] };
function listRadios() {
  if (!S.source) return [];
  const live = visibleAll('live');
  const key = `${S.source.id}:${live.length}`;
  if (listRadioMemo.key !== key) listRadioMemo = { key, items: listStations(live, { sid: S.source.id, urlOf: (it) => (playTargets(S.source, it)[0] || {}).url || it.url || '' }) };
  return listRadioMemo.items;
}
const homeRadioItems = () => {
  const own = listRadios();
  return own.length ? own : radioHome ? radioHome.items : [];
};
const radioCountry = () => String(store.pref(RADIO_COUNTRY_KEY, 'TR') || 'TR');
const radioLoad = (cc, force) => loadStations({ net, cache: store.cache, country: cc, version: VERSION, force });
let radioHome = null;
let radioBusy = false;
function fillHomeRadio() {
  const el = $('#home-radio');
  if (el) el.innerHTML = kidActive() ? '' : radioRowHtml(radioFavs(store), homeRadioItems());
}
function ensureHomeRadio() {
  if (kidActive() || radioBusy) return;
  if (radioHome || listRadios().length) return fillHomeRadio(); // listede radyo varsa internet dizinine gidilmez
  radioBusy = true;
  radioLoad(radioCountry(), false).then((r) => { radioHome = r; }, () => {}).finally(() => { radioBusy = false; fillHomeRadio(); });
}
function playRadio(st, list) {
  const items = (Array.isArray(list) && list.length ? list : [st]).map(radioItem);
  const index = Math.max(0, items.findIndex((x) => x.id === st.id));
  const ctx = { items, index, radio: true, play: (it, i) => startPlay(it, { ctx: { ...ctx, index: i } }) };
  startPlay(items[index], { ctx });
}
function openRadio() {
  if (kidActive()) return; // radyo içeriği süzülemediğinden çocuk modunda yok
  openRadioPage({ store, country: radioCountry, setCountry: (cc) => { store.setPref(RADIO_COUNTRY_KEY, cc); radioHome = null; }, load: radioLoad, play: playRadio, toast, listStations: listRadios });
}

async function openToday() {
  try {
    const m = await import('./today-ui.js');
    m.openToday({
      net,
      liveItems: () => visibleAll('live'),
      epgReady: () => S.epg.ready,
      films: filmResolver,
      ensureEpg: () => maybeRefreshEpg(),
      listFor: (it) => S.epg.listFor(it),
      epgBetween: (from, to) => S.epg.between(from, to),
      programSheet: (it, p) => guideProgramSheet(it, p, [it], 0),
      channels: () => store.pref('today.ch.' + sid(), []),
      setChannels: (ids) => store.setPref('today.ch.' + sid(), ids),
      filmChannels: () => store.pref('today.film.ch.' + sid(), null),
      setFilmChannels: (ids) => store.setPref('today.film.ch.' + sid(), ids),
      sourceId: () => sid(),
      toast,
      reminders: {
        list: () => readPlans(),
        set: (plan) => {
          const p = { ...plan, at: Math.max(plan.at, Date.now() + 3000) };
          setPlans(addPlan(readPlans(), p));
          ensurePlanPermissions();
          return p;
        },
        remove: (id) => setPlans(removePlan(readPlans(), id)),
      },
      openFlow: openSeriesFlow,
    });
  } catch (e) {
    toast('Bugün ekranı açılamadı: ' + ((e && e.message) || e));
  }
}

// Dizi akışı: 1001dizi.net / sinemalar.com haftalık dizi programı (kanal, saat, bölüm). Modül ilk kullanımda yüklenir.
async function openSeriesFlow() {
  try {
    const m = await import('./series-flow-ui.js');
    m.openSeriesFlow({
      net,
      store,
      toast,
      liveItems: () => visibleAll('live'),
      play: (items, index) => playLive(items, index),
      // Hatırlatıcılar maç hatırlatıcılarıyla aynı plan listesinde durur (Planlananlar ekranında görünür)
      reminders: {
        list: () => readPlans(),
        set: (plan) => {
          const p = { ...plan, at: Math.max(plan.at, Date.now() + 3000) };
          setPlans(addPlan(readPlans(), p));
          ensurePlanPermissions();
          return p;
        },
        remove: (id) => setPlans(removePlan(readPlans(), id)),
      },
    });
  } catch (e) {
    toast('Dizi akışı açılamadı: ' + ((e && e.message) || e));
  }
}

async function openAdmin() {
  try {
    const m = await import('./admin-ui.js');
    m.openAdmin({ store, net, apkUrl: UPDATE_BASE + 'iptv-oynatici.apk', shareOrCopy, readClipboard });
  } catch (e) {
    toast('Yönetici paneli açılamadı: ' + (e.message || e));
  }
}

function motionProfileChoice() {
  const v = store.pref('motion.profile', 'auto');
  return ['auto', 'full', 'light', 'off'].includes(v) ? v : 'auto';
}

function applyMotionProfile() {
  const root = document.documentElement;
  const choice = motionProfileChoice();
  const dm = Number(navigator.deviceMemory || 0);
  const cores = Number(navigator.hardwareConcurrency || 0);
  const lowPower = root.classList.contains('tv') || (dm > 0 && dm <= 2) || (cores > 0 && cores <= 4);
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const effective = reduced ? 'off' : choice === 'auto' ? (lowPower ? 'light' : 'full') : choice;
  const speed = [0.5, 0.75, 1, 1.25, 1.5, 2].includes(Number(store.pref('motion.speed', 1))) ? Number(store.pref('motion.speed', 1)) : 1;
  const duration = (base) => `${Math.max(1, Math.round(base / speed))}ms`;
  root.style.setProperty('--motion-view-full', duration(220));
  root.style.setProperty('--motion-view-light', duration(110));
  root.style.setProperty('--motion-page-full', duration(230));
  root.style.setProperty('--motion-page-exit', duration(190));
  root.style.setProperty('--motion-sheet-fade', duration(180));
  root.style.setProperty('--motion-sheet-full', duration(220));
  root.style.setProperty('--motion-sheet-exit', duration(190));
  root.style.setProperty('--motion-sheet-light', duration(100));
  root.dataset.motionChoice = choice;
  root.dataset.motionSpeed = String(speed);
  root.dataset.motion = effective;
}

function motionSettingsSheet() {
  applyMotionProfile();
  const current = motionProfileChoice();
  const sh = openSheet({
    title: 'Görünüm ve animasyonlar',
    html:
      noteRow('Geçiş efektlerini cihazının gücüne göre seç. TV ve düşük donanımlı cihazlarda hafif mod önerilir.') +
      setCard('Animasyon', 'activity', [
        selRow('motion-profile', 'Animasyon profili', 'Akıllı mod, TV ve düşük donanımlı cihazlarda hafif geçişleri otomatik seçer.', optionsHtml([['auto', 'Akıllı (önerilen)'], ['full', 'Tam animasyon'], ['light', 'Hafif animasyon'], ['off', 'Animasyonsuz']], current), true, 'motion-help'),
        selRow('motion-speed', 'Animasyon hızı', 'Animasyon süresini değiştirir; profil seçimiyle birlikte çalışır.', optionsHtml([[0.5, 'Çok yavaş (0,5×)'], [0.75, 'Yavaş (0,75×)'], [1, 'Normal (1×)'], [1.25, 'Biraz hızlı (1,25×)'], [1.5, 'Hızlı (1,5×)'], [2, 'Çok hızlı (2×)']], Number(store.pref('motion.speed', 1))), true),
      ]) +
      '<div class="motion-preview"><span class="motion-preview-dot"></span><div><b>Sayfa geçişleri</b><small>Menüler ve açılır pencereler bu tercihe göre hareket eder.</small></div></div>',
    mount: (body) => {
      const select = $('#motion-profile', body);
      const speedSelect = $('#motion-speed', body);
      const help = $('#motion-help', body);
      speedSelect.addEventListener('change', () => {
        store.setPref('motion.speed', Number(speedSelect.value));
        applyMotionProfile();
        toast('Animasyon hızı kaydedildi');
      });
      select.addEventListener('change', () => {
        store.setPref('motion.profile', select.value);
        applyMotionProfile();
        help.textContent = select.value === 'auto'
          ? 'Cihazın TV veya düşük donanımlıysa hafif, diğer cihazlarda tam animasyon kullanılır.'
          : select.value === 'full' ? 'Tüm sayfa ve pencere geçişleri akıcı hareketlerle gösterilir.'
          : select.value === 'light' ? 'Kısa ve hafif belirme efektleri kullanılır; ağır hareketler kapalıdır.'
          : 'Tüm geçiş animasyonları kapatılır.';
        toast('Animasyon tercihi kaydedildi');
      });
    },
  });
  return sh;
}

function onSourcesClick(e) {
  if (e.target.closest('#ver-tap')) return verTap();
  const t = e.target.closest('[data-set]');
  if (t) {
    const k = t.dataset.set;
    if (k === 'general') return generalSheet();
    if (k === 'theme') return themeSheet();
    if (k === 'motion') return motionSettingsSheet();
    if (k === 'admin') return openAdmin();
    if (k === 'player') return playerSheet();
    if (k === 'epg') return epgSettingsSheet();
    if (k === 'health') return healthSheet();
    if (k === 'speedtest') return internetSpeedTestPage();
    if (k === 'plans') return plansSheet();
    if (k === 'auto') return autoSheet();
    if (k === 'kid') return kidSheet();
    if (k === 'news') return whatsNewSheet(true);
    if (k === 'rec') return recordingsSheet();
    if (k === 'dl') return downloadsSheet();
    if (k === 'cast') return needPro('cast') ? castUi.receiverSheet() : undefined;
    if (k === 'member') return memberSheet();
    if (k === 'profiles') return profilesSheet();
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
        store.setPref('kid.allow', pruneAllow(kidAllow(), store.sources().map((x) => x.id))); // silinen kaynağın çocuk izinleri de kalkar
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
  if (!edit && store.sources().length >= 1 && !needPro('sources')) return; // ilk kaynak herkese açık; sonrakiler Pro
  let type = edit ? (edit.local ? 'file' : edit.type) : 'xtream';
  const v = (k) => esc((edit && edit[k]) || '');
  const sh = openSheet({
    full: true, // TV'de tam sayfa
    title: edit ? 'Kaynağı düzenle' : 'Kaynak ekle',
    html: `<div class="seg" id="f-type" style="padding:0 0 12px"><button data-t="xtream">Xtream</button><button data-t="m3u">M3U bağlantısı</button><button data-t="file">Dosyadan</button>${isPlay() ? '' : '<button data-t="code">Kod</button>'}${!edit && nativePlugin && isTvUi() ? '<button data-t="phone">Telefondan al</button>' : ''}</div>
<form id="f" autocomplete="off">
<div data-for="xtream m3u file"><label class="field"><span>Ad (isteğe bağlı)</span><input name="name" value="${v('name')}" placeholder="Örn. Evdeki liste"></label></div>
<div data-for="m3u"><label class="field"><span>M3U / M3U8 liste bağlantısı</span><input name="url" inputmode="url" value="${v('url')}" placeholder="http://…/liste.m3u"></label></div>
<div data-for="xtream"><label class="field"><span>Sunucu adresi</span><input name="server" inputmode="url" value="${v('server')}" placeholder="http://sunucu.com:8080"></label>
<label class="field"><span>Kullanıcı adı</span><input name="user" value="${v('user')}" autocapitalize="none"></label>
<label class="field"><span>Şifre</span><input name="pass" value="${v('pass')}" autocapitalize="none"></label></div>
<div data-for="file"><label class="field"><span>M3U / M3U8 dosyası</span><input name="file" type="file"><small>${edit && edit.local ? `Kayıtlı dosya: ${esc(edit.fileName || edit.name)}. Değiştirmek için yeni dosya seçin.` : 'Telefondaki liste dosyasını seçin.'}</small></label></div>
<div data-for="xtream m3u file"><label class="field"><span>TV rehberi (XMLTV) bağlantısı — isteğe bağlı</span><input name="epgUrl" inputmode="url" value="${v('epgUrl')}" placeholder="Boş bırakırsanız kaynaktaki adres kullanılır"><small>.xml veya .xml.gz olabilir.</small></label></div>
<div data-for="code"><label class="field"><span>Davet kodu</span><input name="code" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="24" placeholder="ABCD-EFGH-JKMN-PQRS"><small>Size liste veren kişinin gönderdiği 16 harflik kod.</small></label></div>
<div data-for="phone"><p class="hint">Listenizi telefondan aktarın: telefondaki uygulamada Ayarlar › Yedekle / geri yükle › TV ile eşitle’ye dokunun, bu ekrandaki QR kodu tarayın (ya da 6 haneli kodu girin). Liste ve favorileriniz buraya gelir. Telefon ve TV aynı Wi‑Fi ağında olmalı.</p><button class="btn" type="button" id="f-phone" style="width:100%">QR kodu ve kodu göster</button></div>
<p class="err-text" id="f-err" hidden></p>
<button class="btn" id="f-go" type="submit" style="width:100%">Kaydet ve yükle</button>
</form>`,
    mount: (body) => {
      const form = $('#f', body);
      const err = $('#f-err', body);
      const setType = (t) => {
        type = t;
        $$('#f-type button', body).forEach((b) => b.classList.toggle('on', b.dataset.t === t));
        $$('[data-for]', body).forEach((d) => (d.hidden = !d.dataset.for.split(' ').includes(t)));
        $('#f-go', body).textContent = t === 'code' ? 'Kodu doğrula ve yükle' : 'Kaydet ve yükle';
        $('#f-go', body).hidden = t === 'phone';
      };
      setType(type);
      const fphone = $('#f-phone', body);
      if (fphone) fphone.addEventListener('click', () => needPro('tvlink') && castUi.receiverSheet()); // Pro özelliği
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
        if (type === 'code') {
          const go = $('#f-go', body);
          go.disabled = true;
          go.textContent = 'Kod denetleniyor…';
          try {
            const r = await redeem({ code: f.code, store, net, deviceId: deviceId(store), now: Date.now() });
            sh.close();
            toast(r.name ? `${r.name} için ${r.ids.length} liste eklendi` : `${r.ids.length} liste eklendi`);
            await activate(r.ids[0], { force: true });
            renderTab();
          } catch (ex) {
            fail(ex.message || 'Kod doğrulanamadı');
            go.disabled = false;
            go.textContent = 'Kodu doğrula ve yükle';
          }
          return;
        }
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

const fmtDate = (d, o) => d.toLocaleDateString(loc(), o);

// Ana ekrandaki bağlantı durumu: sabit "Bağlı" yerine gerçek durum (çevrimdışı, son yenileme hatası, boş liste).
function linkState() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { text: 'Çevrimdışı', ok: false };
  if (S.linkErr) return { text: 'Bağlantı hatası', ok: false };
  const c = S.cat;
  if (c && !(c.live.length + c.movies.length + c.series.length)) return { text: 'Liste boş', ok: false };
  return { text: 'Bağlı', ok: true };
}
function paintLink() {
  const st = linkState();
  document.querySelectorAll('.home-source-state, .hp-state').forEach((el) => {
    el.textContent = st.text;
    el.classList.toggle('bad', !st.ok);
  });
  document.querySelectorAll('.home-source-indicator, .hp-dot').forEach((el) => el.classList.toggle('bad', !st.ok));
}
window.addEventListener('online', paintLink);
window.addEventListener('offline', paintLink);

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
  const hd = document.querySelector('.hp-date');
  if (hd) {
    hd.textContent = fmtDate(now, { day: 'numeric', month: 'long', year: 'numeric' });
    document.querySelector('.hp-time').textContent = t;
  }
  paintLink();
}


// Ana ekran kısayol kutusunun simgesi; sayı (favori/izleme) yazıyla yarışmasın diye simgenin köşesinde rozet olur.
const miniIc = (name, n) => `<span class="t-ic">${icon(name)}${n ? `<i class="t-n">${n > 99 ? '99+' : n}</i>` : ''}</span>`;
// ---- Ana ekran: "Ne izleyeceğine karar veremedin mi?" — kendi film listenden türe göre öneri. Tür çipine dokun; aynı çipe yine dokunursan başka filmler gelir.
const picksKey = (it) => {
  const ct = cleanTitle(it.name, it.year);
  return ct.key ? `${ct.key}|${ct.year || ''}` : it.id;
};
const homePick = { src: '', genre: '', ids: [], seen: new Map() };
const pickWatched = (it) => !!(S.prog[it.id] && S.prog[it.id].pos > 0);
const PICKS_MAX = 3; // bir türde en fazla 3 öneri; "Şaşırt beni" tek film önerir
function repickHome(genre) {
  const seen = homePick.seen.get(genre) || new Set();
  const picks = pickMovies(visibleAll('movie'), genre, { limit: genre === SURPRISE_ID ? 1 : PICKS_MAX, key: picksKey, watched: pickWatched, seen: [...seen] });
  for (const it of picks) seen.add(it.id);
  homePick.seen.set(genre, seen);
  homePick.genre = genre;
  homePick.ids = picks.map((it) => it.id);
}
function homePicksHtml() {
  const movies = visibleAll('movie');
  const chips = genreChips(movies, { key: picksKey });
  if (!chips.length || movies.length < 8) return '';
  if (homePick.src !== sid()) Object.assign(homePick, { src: sid(), genre: '', ids: [], seen: new Map() });
  if (homePick.genre !== SURPRISE_ID && !chips.some((c) => c.id === homePick.genre)) repickHome(chips[0].id);
  const idx = S.idx.movies;
  const pickedList = () => homePick.ids.map((id) => idx.get(id)).filter(Boolean);
  if (!pickedList().length) repickHome(homePick.genre); // liste yenilenmiş/boşalmışsa yeniden seç
  const list = pickedList();
  const chip = (id, label, icon) => `<button class="chip${homePick.genre === id ? ' on' : ''}" data-pick="${id}"><span aria-hidden="true">${icon}</span> ${esc(label)}</button>`;
  const cards = list
    .map((it, i) => {
      const ct = cleanTitle(it.name, it.year);
      return card(it, i, `data-hk="movie" data-hid="${esc(it.id)}"`, { title: ct.title || it.name, sub: ['Film', ct.year].filter(Boolean).join(' · ') });
    })
    .join('');
  return `<section class="home-row hp-picks"><div class="home-row-h"><b>🤔 Ne izleyeceğine karar veremedin mi?</b><button data-pick-again aria-label="Başka filmler öner">Başka öner</button></div><div class="chips hp-chips" role="group" aria-label="Tür">${chip(SURPRISE_ID, 'Şaşırt beni', '🎲')}${chips.map((c) => chip(c.id, c.label, c.icon)).join('')}</div>${cards ? `<div class="home-row-s">${cards}</div>` : `<p class="hint">Bu türde film yok.</p>`}</section>`;
}
function fillHomePicks() {
  const el = $('#home-picks');
  if (!el) return;
  const sc = el.querySelector('.hp-chips');
  const left = sc ? sc.scrollLeft : 0;
  // Bölüm yeniden çizilince odaktaki çip/düğme silinir; kumanda odağı sayfanın başına atmasın ve sayfa yukarı kaymasın diye
  // odak aynı çipe/düğmeye geri verilir, sayfanın kaydırma konumu da korunur.
  const a = document.activeElement;
  const had = a && el.contains(a) ? (a.dataset.pick ? `[data-pick="${a.dataset.pick}"]` : a.hasAttribute('data-pick-again') ? '[data-pick-again]' : '') : '';
  const page = el.closest('.home');
  const top = page ? page.scrollTop : 0;
  el.innerHTML = homePicksHtml();
  const sc2 = el.querySelector('.hp-chips');
  if (sc2) sc2.scrollLeft = left;
  if (had) {
    const t = el.querySelector(had);
    if (t) t.focus({ preventScroll: true });
  }
  if (page) page.scrollTop = top;
}

// Ana ekran satırları: kaldığın yerden devam (film + dizi), son izlenenler (sekmeli) ve en son eklenen filmler; boşsa satır çıkmaz.
const rowCards = (list) =>
  list
    .map(({ kind, it }, i) => {
      if (kind === 'live') return card(it, i, `data-hk="live" data-hid="${esc(it.id)}"`, { title: it.name, sub: 'Canlı TV' });
      const ct = cleanTitle(it.name, it.year);
      const sub = [kind === 'series' ? 'Dizi' : 'Film', ct.year].filter(Boolean).join(' · ');
      return card(it, i, `data-hk="${kind}" data-hid="${esc(it.id)}"`, { title: ct.title || it.name, sub });
    })
    .join('');
const homeRow = (title, list, all) => (list.length ? `<section class="home-row"><div class="home-row-h"><b>${title}</b>${all ? `<button data-go="${all}">Tümünü gör</button>` : ''}</div><div class="home-row-s">${rowCards(list)}</div></section>` : '');
// Son izlenenler: canlı kanal, film ve dizi tek bölümde sekmeli (her sekmede en yeni önce); boş sekme çıkmaz
const lastSeen = (kind) => recentItems(kind).slice(0, 12).map((it) => ({ kind, it }));
const homeRecentState = { tab: '' }; // kullanıcının seçtiği sekme; seçmediyse en son izlemenin olduğu sekme açılır
function homeRecentHtml() {
  const lists = { live: lastSeen('live'), movie: lastSeen('movie'), series: lastSeen('series') };
  const tabs = RECENT_TABS.filter((t) => lists[t.kind].length);
  const counts = { live: lists.live.length, movie: lists.movie.length, series: lists.series.length };
  const on = recentTabPick(counts, recentLatest(store.recents(sid()), store.progressAll(sid())), homeRecentState.tab);
  if (!on) return '';
  const cur = tabs.find((t) => t.kind === on);
  const chips = tabs.map((t) => `<button class="chip${t.kind === on ? ' on' : ''}" role="tab" aria-selected="${t.kind === on}" data-rtab="${t.kind}"><span aria-hidden="true">${t.icon}</span> ${t.label}</button>`).join('');
  return `<section class="home-row hp-recent"><div class="home-row-h"><b>🕘 Son izlenenler</b><button data-go="${cur.go}">Tümünü gör</button></div><div class="chips hp-chips" role="tablist" aria-label="Son izlenenler">${chips}</div><div class="home-row-s" role="tabpanel">${rowCards(lists[on])}</div></section>`;
}
function fillHomeRecent() {
  const el = $('#home-recent');
  if (!el) return;
  const focused = el.contains(document.activeElement); // kumandada odak seçilen sekmede kalır
  el.innerHTML = homeRecentHtml();
  if (focused) {
    const t = el.querySelector('[data-rtab].on');
    if (t) t.focus();
  }
}

function renderHome(v) {
  const c = S.cat;
  const src = S.source;
  const exp = c.account && c.account.expires ? fmtDate(new Date(c.account.expires), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const expInfo = c.account && c.account.expires ? expiryInfo(c.account.expires) : null;
  const cnt = (n, w) => (n ? `${n} ${w}` : '');
  const favN = store.favs(sid()).length;
  const who = src.type === 'xtream' ? src.user : src.local ? 'Dosya' : 'M3U';
  const cont = homeContinue(store.continueWatching(sid()), (k, id) => S.idx[CAT_KEY[k]].get(id));
  // aynı film/dizi listede birkaç kez bulunabilir (farklı kategori/kalite): ana ekranda adı ve yılı aynı olan tek kutu olur
  const freshOf = (kind) => {
    const seen = new Set();
    return newestItems(visibleAll(kind))
      .filter((it) => {
        const ct = cleanTitle(it.name, it.year);
        const k = `${ct.key}|${ct.year || ''}`;
        return !ct.key || (!seen.has(k) && !!seen.add(k));
      })
      .slice(0, 12)
      .map((it) => ({ kind, it }));
  };
  const fresh = freshOf('movie');
  const freshSeries = freshOf('series');
  const status = statusText({ live: c.live.length, vod: c.movies.length + c.series.length, lists: store.sources().length });
  // Ana ekran bölümleri; sırası Ayarlar → Genel → “Bölüm sırası”ndan değişir (durum çubuğu ve alt bilgi hep sabit).
  const sections = {
    explore: `<div class="home-section-head"><b>Keşfet</b><span>Yayın ve içerikler</span></div>
    <div class="tiles home-primary">
      <button class="tile t-live" data-go="live" data-autofocus>${icon('tv')}<b>Canlı TV</b><small>${cnt(c.live.length, 'kanal')}</small></button>
      <button class="tile t-movie" data-go="movies">${icon('movie')}<b>Filmler</b><small>${cnt(c.movies.length, 'film')}</small></button>
      <button class="tile t-series" data-go="series">${icon('series')}<b>Diziler</b><small>${cnt(c.series.length, 'dizi')}</small></button>
      <button class="tile t-today" data-go="today">${icon('cal')}<b>Bugün TV’de</b><small>Spor · Film · Dizi</small></button>
    </div>`,
    tools: `<div class="home-section-head home-tools-head"><b>Hızlı erişim</b><span>Araçlar</span></div>
    <div class="shortcuts${nativePlugin ? ' has-rec has-dl' : ''}">
      <button class="tile mini t-guide" data-go="guide">${miniIc('guide')}<b>TV Rehberi</b></button>
      <button class="tile mini t-multi" data-go="multi">${miniIc('grid')}<b>Çoklu ekran</b></button>
      ${kidActive() ? '' : `<button class="tile mini t-radio" data-go="radio">${miniIc('radio', radioFavs(store).length)}<b>Radyo &amp; Müzik</b></button>`}
      <button class="tile mini t-fav" data-go="favs">${miniIc('star-on', favN)}<b>Favoriler</b></button>
      <button class="tile mini t-sport" data-go="sport">${miniIc('ball')}<b>Spor</b></button>
      ${nativePlugin ? `<button class="tile mini t-recs" data-go="rec">${miniIc('rec')}<b>Kayıtlar</b></button><button class="tile mini t-dl" data-go="dl">${miniIc('dl', summary([...DL.values()]).active)}<b>İndirilenler</b></button>` : ''}
      ${nativePlugin ? `<button class="tile mini t-local" data-go="local">${miniIc('folder')}<b>Medya merkezi</b></button>` : `<button class="tile mini t-set" data-go="sources">${miniIc(kidActive() ? 'lock' : 'gear')}<b>${kidActive() ? 'Çıkış' : 'Ayarlar'}</b></button>`}
    </div>`,
    continue: homeRow('▶️ Kaldığın yerden devam et', cont, 'continue'),
    recent: `<div id="home-recent">${homeRecentHtml()}</div>`,
    fresh: homeRow('✨ Son eklenen filmler', fresh, 'movies') + homeRow('📺 Son eklenen diziler', freshSeries, 'series'),
    picks: `<div id="home-picks">${homePicksHtml()}</div>`,
    new: `<div id="home-new">${kidActive() || !newHome ? '' : releasesRowHtml(newHome.films, (f) => !!inLibrary(f))}</div>`,
    radio: `<div id="home-radio">${kidActive() ? '' : radioRowHtml(radioFavs(store), homeRadioItems())}</div>`,
  };
  v.innerHTML = `<div class="home">
    <div class="home-top"><div class="brand">${icon('tv')}${memOn() && memState().tier === 'pro' ? '<div class="brand-col"><b>Iptv</b><i class="brand-pro">★ PRO</i></div>' : '<b>Iptv</b>'}<span>Player${memOn() ? '' : ' <em>Pro</em>'}</span></div><div class="home-pill ls-only" id="h-pill" role="button" tabindex="0" aria-label="Kaynak değiştir"><i class="hp-dot"></i><b class="hp-name">${esc(src.name)}</b><em class="hp-state">${linkState().text}</em><i class="hp-sep"></i>${icon('cal')}<span class="hp-date"></span><i class="hp-sep"></i>${icon('clock')}<span class="hp-time"></span></div><div class="home-clock"><b id="h-clock"></b><small id="h-date"></small></div>${kidActive() ? '' : `<button class="icon-btn ps-only" id="h-add" aria-label="Kaynak ekle">${icon('plus')}</button><button class="icon-btn ps-only" id="h-swap" aria-label="Kaynak değiştir">${icon('swap')}</button>`}<button class="icon-btn ls-only" data-refresh aria-label="Listeyi yenile">${icon('refresh')}</button><button class="icon-btn" id="h-search" aria-label="Ara">${icon('search')}</button>${kidActive() ? '' : `<button class="icon-btn ls-only" id="h-bell" aria-label="Planlananlar">${icon('bell')}${readPlans().length ? '<i class="bell-dot"></i>' : ''}</button>`}<button class="icon-btn" id="h-set" aria-label="Ayarlar">${icon('gear')}</button></div>
    <div class="home-sourcebar"><span class="home-source-indicator"></span><span class="home-source-name">${esc(src.name)}</span><span class="home-source-state">${linkState().text}</span><button data-refresh aria-label="Listeyi yenile">${icon('refresh')} Yenile</button></div>
    ${normalizeOrder(store.pref('set.homeOrder', [])).map((id) => sections[id] || '').join('')}
    <div class="home-status">${icon('check')}<span><b>Bağlantı ve liste durumu</b><small>${esc(src.name)} · ${esc(status)}</small></span></div>
    <div class="home-foot"><span${expInfo && expInfo.level !== 'ok' ? ' class="exp-warn"' : ''}>${exp ? 'Bitiş Tarihi: ' + esc(exp) + (expInfo ? ' · ' + expiryText(expInfo) : '') : ''}</span><button id="h-src">${icon('down')}<span>${esc(src.name)}</span></button><span>Giriş: ${esc(who)}</span></div>
  </div>`;
  ensureHomeRadio();
  ensureHomeNew();
  v.onclick = (e) => {
    if (e.target.closest('[data-refresh]')) {
      e.stopPropagation();
      return refreshCatalog();
    }
    if (e.target.closest('#h-search')) return globalSearch();
    const rc = e.target.closest('[data-rid]');
    if (rc) {
      const list = homeRadio(radioFavs(store), homeRadioItems());
      const st = list.find((x) => x.id === rc.dataset.rid);
      if (st) return playRadio(st, list);
    }
    if (e.target.closest('#h-add')) return sourceForm();
    if (e.target.closest('#h-swap')) return store.sources().length ? sourceSwitcher() : sourceForm();
    const pk = e.target.closest('[data-pick], [data-pick-again]');
    if (pk) {
      repickHome(pk.dataset.pick || homePick.genre); // seçili çipe yeniden dokunmak ya da "Başka öner" farklı filmler getirir
      return fillHomePicks();
    }
    const rt = e.target.closest('[data-rtab]');
    if (rt) {
      homeRecentState.tab = rt.dataset.rtab;
      return fillHomeRecent();
    }
    const nc = e.target.closest('[data-nid]');
    if (nc) {
      const film = newHome && newHome.films.find((f) => (f.id || f.imdbId) === nc.dataset.nid);
      if (film) return openTitleInfo(film);
    }
    const hc = e.target.closest('[data-hid]');
    if (hc) {
      const it = S.idx[CAT_KEY[hc.dataset.hk]].get(hc.dataset.hid);
      if (it) return hc.dataset.hk === 'live' ? playLive([it], 0) : hc.dataset.hk === 'series' ? openSeries(it) : openMovie(it);
    }
    if (e.target.closest('#h-set')) return setTab('sources');
    if (e.target.closest('#h-bell')) return plansSheet();
    if (e.target.closest('#h-src, #h-pill')) return kidActive() ? undefined : store.sources().length ? sourceSwitcher() : sourceForm();
    const t = e.target.closest('[data-go]');
    if (t) goTo(t.dataset.go);
  };
  tickClock();
}

// Ana ekran kutuları ve kumanda renkli tuşları aynı yoldan açar.
function goTo(go) {
  if (go === 'continue') {
    setTab('movies');
    return enterGroup('movie', '__cont');
  }
  if (go === 'recent') {
    setTab('live');
    return showRecent();
  }
  if (go === 'recent-movie' || go === 'recent-series') {
    const kind = go === 'recent-movie' ? 'movie' : 'series';
    setTab(kind === 'movie' ? 'movies' : 'series');
    return enterGroup(kind, '__recent');
  }
  if (kidActive() && (go === 'rec' || go === 'multi' || go === 'dl')) return; // çocuk modunda kayıtlar, indirilenler ve çoklu ekran yok
  if (go === 'local') return openLibrary();
  if (go === 'rec') return recordingsSheet();
  if (go === 'dl') return downloadsSheet();
  if (go === 'speedtest') return internetSpeedTestPage();
  if (go === 'guide') return guidePage();
  if (go === 'sport') return openSportsPage();
  if (go === 'today') return openToday();
  if (go === 'radio') return openRadio();
  if (go === 'new') return openNewReleases();
  setTab(go);
}

function internetSpeedTestPage() {
  const page = openPage({
    title: 'İnternet hız testi',
    cls: 'speed-page-shell',
    html: `
      <div class="speed-page">
        <section class="speed-hero">
          <div class="speed-hero-top"><span class="speed-kicker">BAĞLANTI ANALİZİ</span><span class="speed-server"><i></i> Cloudflare test ağı</span></div>
          <div class="speed-meter" id="speed-meter" style="--speed-angle:0deg">
            <div class="speed-meter-core"><small>İNDİRME</small><b id="speed-main">—</b><span>Mbps</span></div>
          </div>
          <div class="speed-state" id="speed-state">Bağlantını ölçmeye hazır mısın?</div>
          <p class="speed-sub" id="speed-sub">Gecikme, indirme ve yükleme hızını tek testte ölç.</p>
          <div class="speed-progress"><i id="speed-progress"></i></div>
        </section>
        <section class="speed-metrics">
          <div class="speed-metric"><span><i class="sm-ping"></i> Gecikme</span><b id="speed-ping">— <small>ms</small></b><small>Sunucu yanıt süresi</small></div>
          <div class="speed-metric"><span><i class="sm-down"></i> İndirme</span><b id="speed-down">— <small>Mbps</small></b><small>İçerik alma hızı</small></div>
          <div class="speed-metric"><span><i class="sm-up"></i> Yükleme</span><b id="speed-up">— <small>Mbps</small></b><small>Veri gönderme hızı</small></div>
        </section>
        <section class="speed-verdict" id="speed-verdict">
          <div class="speed-verdict-icon">${icon('activity')}</div>
          <div><b id="speed-verdict-title">Teste hazır</b><p id="speed-verdict-text">Test sırasında diğer indirme ve yayınları durdurman daha doğru sonuç verir.</p></div>
        </section>
        <button class="btn lg speed-start" id="speed-start">${icon('play')} Testi başlat</button>
        <button class="btn ghost speed-cancel" id="speed-cancel" hidden>Testi iptal et</button>
        <p class="speed-footnote">Ücretsiz test sunucusu · Bir test yaklaşık 9 MB veri kullanır. Sonuçlar bağlantı koşullarına göre değişebilir.</p>
      </div>`,
    mount: (body, api) => {
      const $id = (id) => body.querySelector('#' + id);
      const start = $id('speed-start');
      const cancel = $id('speed-cancel');
      const meter = $id('speed-meter');
      let controller = null;
      let running = false;
      const setMetric = (id, value, unit) => { $id(id).innerHTML = value + ' <small>' + unit + '</small>'; };
      const verdict = (r) => {
        const title = r.downloadMbps >= 50 && r.pingMs < 40 ? 'Çok iyi bağlantı' : r.downloadMbps >= 15 ? 'Yayın için uygun' : r.downloadMbps >= 5 ? 'HD yayın için yeterli' : 'Bağlantı sınırlı';
        const message = r.downloadMbps >= 15
          ? 'İndirme hızın HD ve çoğu Full HD yayın için yeterli. Wi-Fi sinyali ve sunucu yoğunluğu yine de etkileyebilir.'
          : r.downloadMbps >= 5
            ? 'HD yayın mümkün; yüksek çözünürlükte ara belleğe alma yaşanabilir.'
            : 'Canlı yayınlarda donma görülebilir. Modeme yaklaşmayı veya ağdaki yoğun indirmeleri durdurmayı dene.';
        $id('speed-verdict-title').textContent = title;
        $id('speed-verdict-text').textContent = message;
      };
      const stopUi = () => { running = false; start.disabled = false; start.innerHTML = `${icon('refresh')} Yeniden test et`; cancel.hidden = true; };
      const cancelTest = () => { if (controller) controller.abort(); };
      cancel.addEventListener('click', cancelTest);
      api.el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) cancelTest(); });
      start.addEventListener('click', async () => {
        if (running) return;
        running = true;
        controller = new AbortController();
        start.disabled = true;
        start.textContent = 'Test çalışıyor…';
        cancel.hidden = false;
        $id('speed-state').textContent = 'Bağlantı ölçülüyor';
        $id('speed-sub').textContent = 'Lütfen test bitene kadar bu ekranı açık tut.';
        $id('speed-verdict-title').textContent = 'Ölçüm devam ediyor';
        $id('speed-verdict-text').textContent = 'Önce gecikme, ardından indirme ve yükleme hızı ölçülüyor.';
        setMetric('speed-ping', '—', 'ms');
        setMetric('speed-down', '—', 'Mbps');
        setMetric('speed-up', '—', 'Mbps');
        $id('speed-main').textContent = '…';
        meter.style.setProperty('--speed-angle', '0deg');
        $id('speed-progress').style.width = '0%';
        try {
          const result = await runInternetSpeedTest({
            signal: controller.signal,
            onProgress: (p) => {
              $id('speed-state').textContent = p.message;
              $id('speed-progress').style.width = p.percent + '%';
              if (p.phase === 'download' && p.transferred) {
                const partial = Math.min(999, p.transferred / 1_000_000);
                $id('speed-main').textContent = partial.toFixed(1);
                meter.style.setProperty('--speed-angle', Math.min(360, partial / 300 * 360) + 'deg');
              }
            },
          });
          setMetric('speed-ping', String(result.pingMs), 'ms');
          setMetric('speed-down', result.downloadMbps.toFixed(1), 'Mbps');
          setMetric('speed-up', result.uploadMbps.toFixed(1), 'Mbps');
          $id('speed-main').textContent = result.downloadMbps.toFixed(1);
          meter.style.setProperty('--speed-angle', Math.min(360, result.downloadMbps / 300 * 360) + 'deg');
          $id('speed-state').textContent = 'Test tamamlandı';
          $id('speed-sub').textContent = 'Ölçüm ' + new Date(result.testedAt).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }) + ' saatinde tamamlandı.';
          verdict(result);
        } catch (error) {
          const cancelled = error && error.name === 'AbortError';
          $id('speed-state').textContent = cancelled ? 'Test iptal edildi' : 'Test tamamlanamadı';
          $id('speed-sub').textContent = cancelled ? 'İstediğinde yeniden başlatabilirsin.' : 'Sunucuya erişilemedi. İnternet bağlantını kontrol edip yeniden dene.';
          $id('speed-verdict-title').textContent = cancelled ? 'Ölçüm durduruldu' : 'Bağlantı ölçülemedi';
          $id('speed-verdict-text').textContent = cancelled ? 'Herhangi bir sonuç kaydedilmedi.' : (error && error.message) || 'Bilinmeyen ağ hatası';
          $id('speed-progress').style.width = '0%';
          $id('speed-main').textContent = '—';
        } finally {
          controller = null;
          stopUi();
        }
      });
    },
  });
  return page;
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
  restoreCatCursor('live');
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
        return `<div class="row gd${kc(i)}" role="button" tabindex="0" data-i="${i}">${logo(it.logo, it.name)}<div class="meta"><div class="nm"><span class="mq-i">${esc(it.name)}</span></div><div class="sub"><span class="mq-i">${esc(now)}</span></div>${nn.now ? `<div class="bar"><i style="width:${Math.round(nn.progress * 100)}%"></i></div>` : ''}${next ? `<div class="sub nx"><span class="mq-i">${esc(next)}</span></div>` : ''}</div></div>`;
      };
      const list = new VirtualList($('#pk-list', body), {
        rowH: scaled(guide ? 88 : 60),
        render: guide
          ? guideRow
          : (it, i) => `<div class="row${kc(i)}" role="button" tabindex="0" data-i="${i}">${logo(it.logo, it.name)}<div class="meta"><div class="nm"><span class="mq-i">${esc(it.name)}</span></div><div class="sub"><span class="mq-i">${esc(it.group || '')}</span></div></div></div>`,
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
    ? blocks.map(({ p, m, d, cls }) => {
      const pct = cls === ' now' ? Math.min(100, Math.max(0, ((now - p.s) / Math.max(1, p.e - p.s)) * 100)).toFixed(1) : 0;
      return `<div class="tl-prog${cls}" role="button" tabindex="0" style="--m:${m.toFixed(2)};--d:${d.toFixed(2)};--p:${pct}%" data-ch="${esc(it.id)}" data-s="${p.s}" data-e="${p.e}" aria-label="${esc(p.t || 'Program')}, ${fmtClock(p.s)} – ${fmtClock(p.e)}"><span><b>${esc(p.t || '—')}</b><small>${fmtClock(p.s)} – ${fmtClock(p.e)}</small></span><i class="tl-pr"><u></u></i></div>`;
    }).join('')
    : `<div class="tl-prog none" style="--m:0;--d:${GUIDE_SPAN}"><span><b>Program bilgisi yok</b></span></div>`;
  const [nm, qual] = guideNameParts(it.name);
  return `<div class="tl-row"><button class="tl-ch" data-ch="${esc(it.id)}" aria-label="${esc(it.name)}: günlük yayın akışı"><span class="tl-logo">${logo(it.logo, it.name)}</span><span class="tl-name"><b>${esc(nm)}</b>${qual ? `<small>${esc(qual)}</small>` : ''}</span></button><div class="tl-track">${cells}</div></div>`;
}

// Kategori satırı simgesi: adına göre (index.html simgeleri); "4K" metin rozetidir.
function guideCatIcon(c) {
  const n = guideCatIconName(c.name, { id: c.id, folder: !!c.folder });
  return n === '4k' ? '<span class="gc-4k">4K</span>' : icon(n);
}

// "Tümü", "Favoriler", "Son izlenen": kategori olmadan doğrudan zaman çizelgesine açılan görünümler
const GUIDE_VIEWS = [{ id: '__all', name: 'Tümü' }, { id: '__fav', name: 'Favoriler' }, { id: '__recent', name: 'Son izlenen' }];
const GUIDE_DAYS = 7; // gün seçicide bugünden başlayarak gösterilen gün sayısı
const GUIDE_DAY_SHOW = 3; // aynı anda görünen gün düğmesi

function guideItems(id) {
  if (id === '__fav') return store.favs(sid()).filter((f) => f.kind === 'live').map((f) => resolve(f, 'live')).filter(Boolean);
  return itemsOfGroup('live', id);
}

function guideAxisHtml(ws) {
  let out = '';
  for (let k = 0; k * GUIDE_STEP < GUIDE_SPAN; k++) {
    const t = ws + k * GUIDE_STEP * 60000;
    const hour = new Date(t).getMinutes() === 0;
    const day = hour && new Date(t).getHours() === 0 ? new Date(t).toLocaleDateString(loc(), { weekday: 'short' }) + ' ' : '';
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
  const isSeries = /\b(dizi|series|serial|soap|sitcom|telenovela|tv show)\b/i.test(String(p.c || '')) || /\b(\d{1,3}\s*\.?\s*bolum|sezon|s\d{1,2}\s*e\d{1,3})\b/i.test(String(p.t || ''));
  const followKey = 'series.followed.v1';
  let followed = normalizeFollowed(store.pref(followKey, []));
  const following = isSeries && isFollowed(followed, p.t);
  const has = (kind) => hasPlan(readPlans(), planIdOf(kind, it, p));
  const label = (kind) => (kind === 'rem' ? (has('rem') ? 'Hatırlatıcıyı kaldır' : 'Hatırlat') : has('rec') ? 'Kaydı kaldır' : p.s < now ? 'Şimdi kaydet' : 'Kaydet');
  const btn = (a, ic, kind, cls = 'ghost') => `<button class="btn ${cls}" data-a="${a}">${icon(ic)}<span>${label(kind)}</span></button>`;
  const sh = openSheet({
    title: p.t || 'Program',
    html: `<div class="gp"><div class="gp-meta"><b>${esc(it.name)}</b><span>${fmtClock(p.s)} – ${fmtClock(p.e)} · ${mins} dk · ${state}</span></div>${p.d ? `<p class="gp-desc">${esc(p.d)}</p>` : '<p class="gp-desc muted">Bu program için açıklama yok.</p>'}<div class="gp-btns"><button class="btn" data-a="watch">${icon('play')}Kanalı izle</button>${canArchive ? `<button class="btn ghost" data-a="arc">${icon('history')}${p.e > now ? 'Baştan izle' : 'Arşivden izle'}</button>` : ''}${canRemind ? btn('rem', 'bell', 'rem') : ''}${canRecord ? btn('rec', 'rec', 'rec') : ''}${isSeries ? `<button class="btn ghost" data-a="follow" aria-pressed="${following}">${icon(following ? 'star-on' : 'star')}<span>${following ? 'Dizi takibini bırak' : 'Diziyi takip et'}</span></button>` : ''}${noDay ? '' : '<button class="btn ghost" data-a="day">Günlük akış</button>'}</div></div>`,
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
    if (a === 'follow') {
      followed = toggleFollowed(followed, { title: p.t || 'Dizi', channel: it.name });
      store.setPref(followKey, followed);
      const on = isFollowed(followed, p.t);
      b.setAttribute('aria-pressed', String(on));
      b.innerHTML = icon(on ? 'star-on' : 'star') + '<span>' + (on ? 'Dizi takibini bırak' : 'Diziyi takip et') + '</span>';
      toast(on ? 'Dizi takibe alındı · yeni bölüm bildirimi açık' : 'Dizi takibi bırakıldı', 2200);
      return;
    }
    closeThen(sh, () => (a === 'day' ? epgSheet(it) : a === 'arc' ? playArchive(it, p) : playLive(items, index)));
    sh.close();
  });
}

function guidePage() {
  openPage({
    title: 'TV Rehberi',
    sub: 'Tüm kanallar ve yayın akışı',
    cls: 'guide-pg',
    html: `<div class="gd-search" id="guide-search"><label class="gd-sbox">${icon('search')}<input id="guide-q" type="search" placeholder="Kanal, kategori veya program ara…" autocomplete="off" aria-label="Kanal, kategori veya program ara"></label><button class="gd-fbtn" id="guide-mode" data-g="mode" aria-pressed="false" aria-label="Program ara" title="Program ara">${icon('filter')}</button></div>
      <div class="chips gd-views" id="guide-views" role="group" aria-label="Görünüm"><button class="chip on" data-view="">${icon('guide')} Kategoriler</button><button class="chip" data-view="__all">${icon('tv')} Tümü</button><button class="chip" data-view="__fav">${icon('star')} Favoriler</button><button class="chip" data-view="__recent">${icon('clock')} Son İzlenen</button></div>
      <div class="guide-now" id="guide-nowbar">${icon('tv')}<span id="guide-now"></span></div>
      <div class="gd-days" id="guide-days" hidden></div>
      <div class="chips gd-shift" id="guide-shift" hidden><button class="chip" id="guide-back" aria-label="3 saat geri">${icon('chev-l')} 3 sa</button><button class="chip on" id="guide-today">Şimdi</button><button class="chip" id="guide-fwd" aria-label="3 saat ileri">3 sa ${icon('chev-r')}</button></div>
      <div id="guide-list" class="guide-categories"></div>`,
    mount: (body, api) => {
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
      let dayOff = 0; // zaman çizelgesinde seçili gün (0: bugün)
      let dayBase = 0; // gün şeridindeki ilk gün
      let searchOpen = false; // zaman çizelgesinde arama satırı açık mı
      let refreshing = false;
      let headKey = ''; // üst çubuğun hangi görünümde çizildiği: 'list' ya da 'tl:<kategori>'
      const kbd = () => document.documentElement.classList.contains('kbd');
      const scroller = () => $('.tl-scroll', list);
      const ppm = () => {
        const t = $('.tl', list);
        return (t && parseFloat(getComputedStyle(t).getPropertyValue('--tl-ppm'))) || 4;
      };
      const nowX = () => ((Date.now() - ws) / 60000) * ppm();
      const clock = () => {
        nowLabel.innerHTML = '<b class="gn-l">ŞİMDİ</b><time>' + fmtClock(Date.now()) + '</time>' + (expanded || progMode ? '' : '<i class="gn-sep"></i><span class="gn-h">Yayın akışını kategori seçerek görüntüleyin</span>');
      };
      // "Şimdi" düğmesi, görünüm şimdiye yakınken vurgulanır
      const syncToday = () => {
        const sc = scroller();
        const b = $('#guide-today', body);
        if (b) b.classList.toggle('on', !!sc && dayOff === 0 && Math.abs(sc.scrollLeft - Math.max(0, nowX() - 16)) < 24 * ppm());
      };
      // Zaman ilerledikçe şimdi çizgisi, blokların şimdi/geçmiş durumu ve ilerleme çubukları güncellenir
      const tickNow = () => {
        clock();
        const t = $('.tl', list);
        if (!t) return;
        const now = Date.now();
        t.style.setProperty('--now', ((now - ws) / 60000).toFixed(2));
        t.classList.toggle('no-now', now < ws || now > ws + GUIDE_SPAN * 60000);
        const tag = $('.tl-tag', t);
        if (tag) tag.dataset.t = fmtClock(now);
        $$('.tl-prog[data-s]', t).forEach((b) => {
          const s0 = Number(b.dataset.s);
          const e0 = Number(b.dataset.e);
          const live = s0 <= now && e0 > now;
          b.classList.toggle('now', live);
          b.classList.toggle('past', e0 <= now);
          if (live) b.style.setProperty('--p', Math.min(100, Math.max(0, ((now - s0) / Math.max(1, e0 - s0)) * 100)).toFixed(1) + '%');
        });
        syncToday();
      };
      // Üst çubuk: kategori listesinde simge + arama/yenile; zaman çizelgesinde kategori simgesi + ara/gün/seçenekler
      const drawActions = (tl) => {
        api.setActions(tl
          ? `<button class="icon-btn pg-hb" data-g="search" aria-label="Kanal ara">${icon('search')}</button><button class="icon-btn pg-hb" data-g="cal" aria-label="Gün seç">${icon('cal')}</button><button class="icon-btn pg-hb" data-g="more" aria-label="Seçenekler">${icon('dots')}</button>`
          : `<button class="icon-btn pg-hb" data-g="search" aria-label="Ara">${icon('search')}</button><button class="icon-btn pg-hb${refreshing ? ' spin' : ''}" data-g="refresh" aria-label="EPG yenile"${refreshing ? ' disabled' : ''}>${icon('refresh')}</button>`);
      };
      const drawDays = () => {
        const base = new Date();
        base.setHours(0, 0, 0, 0);
        const cells = [];
        for (let d = dayBase; d < Math.min(GUIDE_DAYS, dayBase + GUIDE_DAY_SHOW); d++) {
          const t = new Date(base);
          t.setDate(t.getDate() + d);
          const name = d === 0 ? 'Bugün' : d === 1 ? 'Yarın' : t.toLocaleDateString(loc(), { weekday: 'short' });
          const date = t.toLocaleDateString(loc(), { day: 'numeric', month: 'long' }) + (d === 0 ? ' ' + t.toLocaleDateString(loc(), { weekday: 'short' }) : '');
          cells.push(`<button class="gd-day${d === dayOff ? ' on' : ''}" data-day="${d}"><b>${esc(name)}</b><small>${esc(date)}</small></button>`);
        }
        $('#guide-days', body).innerHTML = `<button class="gd-arr" data-days="-1" aria-label="Önceki günler"${dayBase <= 0 ? ' disabled' : ''}>${icon('chev-l')}</button>${cells.join('')}<button class="gd-arr" data-days="1" aria-label="Sonraki günler"${dayBase + GUIDE_DAY_SHOW >= GUIDE_DAYS ? ' disabled' : ''}>${icon('chev-r')}</button>`;
      };
      const layout = (tl, cat, term) => {
        const key = tl ? 'tl:' + cat.id : 'list';
        $('#guide-search', body).hidden = tl && !searchOpen && !term;
        $('#guide-views', body).hidden = tl;
        $('#guide-nowbar', body).hidden = tl;
        $('#guide-days', body).hidden = !tl;
        $('#guide-shift', body).hidden = !tl;
        if (key !== headKey) {
          headKey = key;
          api.setTitle(tl ? cat.name : 'TV Rehberi');
          api.setSub(tl ? 'Yayın akışı' : 'Tüm kanallar ve yayın akışı');
          api.setLead(`<span class="pg-ico" aria-hidden="true">${tl ? guideCatIcon(cat) : icon('guide')}</span>`);
          drawActions(tl);
        }
        if (tl) drawDays();
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
        const now = Date.now();
        if (dayOff) {
          const d0 = new Date(now);
          d0.setHours(0, 0, 0, 0);
          d0.setDate(d0.getDate() + dayOff);
          ws = d0.getTime();
        } else ws = Math.floor((now - 45 * 60000) / (GUIDE_STEP * 60000)) * GUIDE_STEP * 60000;
        const cat = expanded && (categories.find((c) => c.id === expanded) || GUIDE_VIEWS.find((v) => v.id === expanded));
        if (expanded && !cat) {
          expanded = null;
          if (catLayer) popLayer('guide-cat');
        }
        const tlMode = !!cat && !progMode;
        list.classList.toggle('tlmode', tlMode);
        layout(tlMode, cat, term);
        if (progMode) {
          rows = [];
          drawPrograms(term);
          return;
        }
        if (cat) {
          const all = guideItems(cat.id);
          rows = term ? all.filter((it) => fold(it.name).includes(term)) : all;
          if (term && !rows.length && fold(cat.name).includes(term)) rows = all; // kategori adıyla eşleşti: tüm kanalları göster
          api.setSub(rows.length + ' kanal · Yayın akışı');
          const we = ws + GUIDE_SPAN * 60000;
          const noNow = now < ws || now > we;
          list.innerHTML = rows.length
            ? `<div class="tl${noNow ? ' no-now' : ''}" style="--span:${GUIDE_SPAN};--now:${((now - ws) / 60000).toFixed(2)}"><div class="tl-scroll"><div class="tl-inner"><div class="tl-head"><div class="tl-corner"></div><div class="tl-axis">${guideAxisHtml(ws)}<i class="tl-tag" data-t="${fmtClock(now)}"></i></div></div><div class="tl-body">${rows.slice(0, shown).map((it) => guideRowHtml(it, ws, we, now)).join('')}</div>${rows.length > shown ? `<button class="tl-more btn sm ghost">Daha fazla kanal (${rows.length - shown})</button>` : ''}<div class="tl-nowline"></div></div></div></div>`
            : '<div class="empty">Eşleşen kanal bulunamadı.</div>';
        } else {
          rows = [];
          const filtered = categories.filter((c) => !term || fold(c.name).includes(term) ||
            itemsOfGroup('live', c.id).some((it) => fold(it.name).includes(term)));
          list.innerHTML = filtered.map((c) => '<button class="guide-category-head" data-category="' + esc(c.id) + '">' +
            '<span class="guide-category-icon">' + guideCatIcon(c) + '</span><span class="guide-category-title">' + esc(c.name) + '</span>' +
            '<span class="guide-category-count">' + c.count + ' kanal</span><span class="chev">' + icon('chev-r') + '</span></button>').join('') ||
            '<div class="empty">Kategori veya kanal bulunamadı.</div>';
        }
        clock();
        const sc = scroller();
        if (sc) {
          sc.scrollLeft = scrollX == null ? (dayOff ? 0 : Math.max(0, nowX() - 16)) : scrollX;
          let raf = 0;
          sc.addEventListener('scroll', () => {
            if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 160) moreRows();
            if (!raf) raf = requestAnimationFrame(() => {
              raf = 0;
              syncToday();
            });
          }, { passive: true });
          syncToday();
        }
      };
      const dayWord = (ts) => {
        const d0 = new Date().setHours(0, 0, 0, 0);
        const diff = Math.round((new Date(ts).setHours(0, 0, 0, 0) - d0) / 86400000);
        return diff === 0 ? 'Bugün' : diff === 1 ? 'Yarın' : diff === -1 ? 'Dün' : new Date(ts).toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short' });
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
        dayOff = 0;
        dayBase = 0;
        searchOpen = false;
        if (!body.isConnected) return;
        draw();
        const back = id && $('[data-category="' + CSS.escape(id) + '"]', list);
        if (back && kbd()) back.focus({ preventScroll: false }); // kumandada odak açtığımız kategoriye döner
      };
      const openCat = (id) => {
        expanded = id;
        shown = GUIDE_CHUNK;
        scrollX = null;
        dayOff = 0;
        dayBase = 0;
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
        if (dayOff) {
          dayOff = 0;
          dayBase = 0;
          scrollX = null;
          return draw();
        }
        const sc = scroller();
        if (sc) sc.scrollTo({ left: Math.max(0, nowX() - 16), top: 0, behavior: 'smooth' });
      });
      const timer = setInterval(() => (body.isConnected ? tickNow() : clearInterval(timer)), 30000);
      const modeBtn = $('#guide-mode', body);
      const toggleMode = () => {
        progMode = !progMode;
        modeBtn.setAttribute('aria-pressed', String(progMode));
        modeBtn.classList.toggle('on', progMode);
        q.placeholder = progMode ? 'Program adı ara… (örn. haber, maç)' : 'Kanal, kategori veya program ara…';
        visIds = null;
        draw(true);
        if (!progMode) scrollX = null;
      };
      async function refreshEpg() {
        if (refreshing) return;
        refreshing = true;
        const rb = $('[data-g="refresh"]', api.el);
        if (rb) {
          rb.classList.add('spin');
          rb.disabled = true;
        }
        try {
          await maybeRefreshEpg(true);
          categories = categoryRows('live').filter((r) => !r.special && r.count > 0);
          if (body.isConnected) draw(true);
        } catch (error) {
          toast('EPG yenilenemedi: ' + ((error && error.message) || 'Bilinmeyen hata'), 3500);
        } finally {
          refreshing = false;
          const b2 = $('[data-g="refresh"]', api.el);
          if (b2) {
            b2.classList.remove('spin');
            b2.disabled = false;
          }
        }
      }
      function pickDay() {
        const base = new Date();
        base.setHours(0, 0, 0, 0);
        const sh = openSheet({
          title: 'Gün seç',
          html: Array.from({ length: GUIDE_DAYS }, (_, d) => {
            const t = new Date(base);
            t.setDate(t.getDate() + d);
            const name = d === 0 ? 'Bugün' : d === 1 ? 'Yarın' : t.toLocaleDateString(loc(), { weekday: 'long' });
            return `<button class="list-item" data-pickday="${d}"><span class="t">${esc(name)}<small>${esc(t.toLocaleDateString(loc(), { day: 'numeric', month: 'long', weekday: 'long' }))}</small></span>${d === dayOff ? icon('check').replace('class="ic"', 'class="ic ok"') : ''}</button>`;
          }).join(''),
        });
        sh.el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-pickday]');
          if (!b) return;
          dayOff = Number(b.dataset.pickday);
          dayBase = Math.min(Math.max(0, dayOff - 1), GUIDE_DAYS - GUIDE_DAY_SHOW);
          scrollX = null;
          sh.close();
          draw();
        });
      }
      function moreMenu() {
        const sh = openSheet({
          title: 'Seçenekler',
          html: `<button class="list-item" data-opt="mode"><span class="t">Program ara<small>Arama kutusu kanal yerine program adlarında arar</small></span></button><button class="list-item" data-opt="refresh"><span class="t">EPG’yi yenile<small>TV rehberi verisini yeniden indirir</small></span></button>`,
        });
        sh.el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-opt]');
          if (!b) return;
          sh.close();
          if (b.dataset.opt === 'mode') {
            searchOpen = true;
            toggleMode();
            q.focus();
          } else refreshEpg();
        });
      }
      // Üst çubuk, arama satırı, görünüm çipleri ve gün şeridi (hepsi yeniden çizilebildiği için olay yetkilendirmesi)
      api.onBack = () => {
        if (!expanded || progMode) return false;
        popLayer('guide-cat');
        return true;
      };
      api.el.addEventListener('click', (e) => {
        const g = e.target.closest('[data-g]');
        if (g) {
          const act = g.dataset.g;
          if (act === 'mode') return toggleMode();
          if (act === 'refresh') return refreshEpg();
          if (act === 'cal') return pickDay();
          if (act === 'more') return moreMenu();
          if (act === 'search') {
            const bar = $('#guide-search', body);
            if (headKey === 'list' || bar.hidden) {
              searchOpen = true;
              bar.hidden = false;
              return q.focus();
            }
            if (!q.value) {
              searchOpen = false;
              bar.hidden = true;
              return;
            }
            q.value = '';
            shown = GUIDE_CHUNK;
            searchOpen = false;
            return draw();
          }
        }
        const v = e.target.closest('[data-view]');
        if (v) {
          if (v.dataset.view) openCat(v.dataset.view);
          return;
        }
        const dd = e.target.closest('[data-day]');
        if (dd && dd.closest('#guide-days')) {
          dayOff = Number(dd.dataset.day);
          scrollX = null;
          return draw();
        }
        const da = e.target.closest('[data-days]');
        if (da) {
          dayBase = Math.min(Math.max(0, dayBase + Number(da.dataset.days)), GUIDE_DAYS - GUIDE_DAY_SHOW);
          drawDays();
        }
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
    html: '<div class="gs-q"><input id="gs-q" type="search" placeholder="Kanal, film veya dizi ara…" autocomplete="off" enterkeyhint="search">' + (nativePlugin && nativePlugin.voiceSearch ? `<button class="icon-btn" id="gs-mic" aria-label="Sesle ara">${icon('mic')}</button>` : '') + '</div><div class="seg" id="gs-kind"><button data-k="all" class="on">Tümü</button><button data-k="live">Canlı</button><button data-k="movie">Film</button><button data-k="series">Dizi</button></div>' + (store.sources().length > 1 ? '<div class="seg" id="gs-scope"><button data-s="one" class="on">Bu kaynak</button><button data-s="all">Tüm kaynaklar</button></div>' : '') + '<div id="gs-res"></div>',
    mount: (body) => {
      const q = $('#gs-q', body);
      const res = $('#gs-res', body);
      let scope = 'one'; // 'one' = etkin kaynak, 'all' = kayıtlı tüm kaynakların önbellekteki listeleri
      let found = { live: [], movie: [], series: [] }; // [{ it, src }]
      const cats = new Map(); // kaynak kimliği → yüklenmiş katalog (yalnız bu sayfa açıkken)
      let loading = false;
      let missing = 0; // listesi henüz hiç indirilmemiş kaynak sayısı
      const srcLabel = (src) => (store.sources().length > 1 && scope === 'all' ? ` · ${esc(src.name)}` : '');
      const row = (e, k, i) => `<button class="list-item" data-k="${k}" data-i="${i}">${logo(e.it.logo, e.it.name)}<span class="t">${esc(e.it.name)}<small>${esc(e.it.group || '')}${srcLabel(e.src)}</small></span></button>`;
      // Başka kaynakta gizli/kilitli kategoriler, gizlenen kanallar ve çocuk modu izinleri burada da geçerlidir.
      const visibleIn = (src) => (kind, list) => {
        if (src.id === sid()) return visibleAll(kind);
        const prefs = store.catPrefs(src.id, kind);
        const hid = hiddenGroupNames(prefs);
        if (lockEnabled()) for (const n of lockedGroupNames(prefs)) hid.add(n); // kilitli kategoriler başka kaynakta açılamaz
        let out = hid.size ? list.filter((it) => !hid.has(it.group || 'Diğer')) : list;
        if (kind === 'live') {
          const hm = store.pref('hidch.' + src.id, {}) || {};
          if (hiddenCount(hm)) out = applyHidden(out, hm);
        }
        if (kidActive()) out = filterAllowed(out, allowSet(kidAllow(), src.id, kind));
        return out;
      };
      const loadAll = async () => {
        loading = true;
        missing = 0;
        draw();
        for (const src of store.sources()) {
          if (src.id === sid() || cats.has(src.id)) continue;
          let cat = null;
          try {
            cat = catalogFromStorable(await store.cache.get('cat:' + src.id));
          } catch {
            cat = null;
          }
          if (cat) cats.set(src.id, cat);
        }
        missing = store.sources().filter((x) => x.id !== sid() && !cats.has(x.id)).length;
        loading = false;
        draw();
      };
      const entries = () => {
        if (!S.source) return [];
        const list = [{ src: S.source, cat: S.cat, visible: visibleIn(S.source) }];
        if (scope === 'all') for (const src of store.sources()) if (src.id !== sid() && cats.has(src.id)) list.push({ src, cat: cats.get(src.id), visible: visibleIn(src) });
        return list;
      };
      const draw = () => {
        const t = q.value.trim();
        if (!t) {
          res.innerHTML = `<div class="empty">${scope === 'all' ? 'Kayıtlı tüm kaynaklarda' : 'Tüm canlı kanallar, filmler ve dizilerde'} aramak için yazın</div>`;
          return;
        }
        if (scope === 'all' && loading) {
          res.innerHTML = '<div class="empty">Kaynakların listeleri yükleniyor…</div>';
          return;
        }
        // Arama açık kategoriyle sınırlı değildir: tüm kategorilerdeki canlı, film ve dizilerde yapılır.
        found = searchAll(entries(), t, CAP);
        const parts = KINDS.filter(([k]) => kind === 'all' || kind === k).map(([k, title]) => {
          const list = found[k];
          if (!list.length) return '';
          const cap = kind === 'all' ? SHOW_ALL : SHOW_ONE;
          const n = `${list.length}${list.length >= CAP ? '+' : ''}`;
          const more = list.length > cap && kind === 'all' ? `<button class="list-item more" data-more="${k}">${n} sonucun tamamını göster</button>` : '';
          return `<div class="sect">${title}<small>${n}</small></div>${list.slice(0, cap).map((e, i) => row(e, k, i)).join('')}${more}`;
        });
        const note = scope === 'all' && missing ? `<p class="hint">${missing} kaynağın listesi henüz indirilmediği için aranamadı; o kaynağı bir kez açın.</p>` : '';
        res.innerHTML = (parts.join('') || '<div class="empty">Sonuç yok</div>') + note;
      };
      $('#gs-kind', body).addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        kind = b.dataset.k;
        $$('#gs-kind button', body).forEach((x) => x.classList.toggle('on', x === b));
        draw();
      });
      const sc = $('#gs-scope', body);
      if (sc) {
        sc.addEventListener('click', (e) => {
          const b = e.target.closest('[data-s]');
          if (!b || b.dataset.s === scope) return;
          scope = b.dataset.s;
          $$('#gs-scope button', body).forEach((x) => x.classList.toggle('on', x === b));
          if (scope === 'all') loadAll();
          else draw();
        });
      }
      q.addEventListener('input', debounce(draw, 150));
      const gmic = $('#gs-mic', body);
      if (gmic) gmic.addEventListener('click', () => voiceInto(q));
      // Başka kaynağın sonucuna dokununca o kaynağa geçilir, sonra içerik açılır (arama sayfası açık kalır).
      const open = async (k, i) => {
        const e = found[k][i];
        if (!e) return;
        let it = e.it;
        if (e.src.id !== sid()) {
          toast(`Kaynak: ${e.src.name}`, 1800);
          await activate(e.src.id);
          it = S.idx[CAT_KEY[k]].get(e.it.id);
          if (!it) return toast('İçerik bulunamadı');
        }
        if (k === 'live') {
          const same = found.live.filter((x) => x.src.id === e.src.id).map((x) => S.idx.live.get(x.it.id)).filter(Boolean);
          const at = same.indexOf(it);
          return at >= 0 ? playLive(same, at) : playLive([it], 0);
        }
        if (k === 'movie') return openMovie(it);
        return openSeries(it);
      };
      res.addEventListener('click', (e) => {
        const more = e.target.closest('[data-more]');
        if (more) {
          kind = more.dataset.more;
          $$('#gs-kind button', body).forEach((x) => x.classList.toggle('on', x.dataset.k === kind));
          return draw();
        }
        const b = e.target.closest('[data-k]');
        if (b) open(b.dataset.k, Number(b.dataset.i));
      });
      draw();
      setTimeout(() => q.focus(), 60);
    },
  });
}

// ------------------------------------------------------------------ ayarlar: genel, EPG, otomasyon

// pro: Pro özellik kimliği; verilirse etiketin yanında PRO işareti çıkar, Pro açık değilken kutu kapalı görünür.
const chkRow = (k, label, sub, pro = '') => `<button class="chk${setting(k) && (!pro || proOk(pro)) ? ' on' : ''}" data-k="${k}"><i>${icon('check')}</i><span class="t">${esc(label)}${pro && memOn() ? '<em class="set-pro">PRO</em>' : ''}${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;
// Ayar kartı (başlık + satırlar). Satır açıklaması düz metindir; HTML gerekiyorsa { html } verilir.
// selRow: sağda seçim kutusu (stack = seçim kutusu açıklamanın altına geçer); btnRow: sağda düğme; numRow: sağda sayı kutusu; noteRow: kart içi not.
const setCard = (title, ic, rows) => `<section class="set-card"><h3>${icon(ic)}<span>${esc(title)}</span></h3>${rows.filter(Boolean).join('')}</section>`;
const subHtml = (sub) => (sub && typeof sub === 'object' ? sub.html : esc(sub || ''));
const rowText = (label, sub, subId) => `<span class="t">${esc(label)}${sub ? `<small${subId ? ` id="${subId}"` : ''}>${subHtml(sub)}</small>` : ''}</span>`;
const selRow = (id, label, sub, opts, stack = false, subId = '') => `<div class="sel-row${stack ? ' stack' : ''}">${rowText(label, sub, subId)}<select id="${id}" aria-label="${esc(label)}">${opts}</select></div>`;
const btnRow = (id, label, sub, text, subId = '') => `<div class="sel-row">${rowText(label, sub, subId)}<button class="btn sm ghost" id="${id}" type="button">${esc(text)}</button></div>`;
const numRow = (id, label, sub, attrs) => `<div class="sel-row">${rowText(label, sub)}<input id="${id}" type="number" inputmode="numeric" aria-label="${esc(label)}" ${attrs}></div>`;
const noteRow = (text) => `<p class="set-note">${subHtml(text)}</p>`;
const optionsHtml = (pairs, cur) => pairs.map(([v, t]) => `<option value="${v}"${String(cur) === String(v) ? ' selected' : ''}>${t}</option>`).join('');

// Kumandanın renkli tuşları: oynatıcıda ve listelerde ayrı ayrı bir işe atanır.
function remoteSheet() {
  const scopes = {
    player: ['remote.player', PLAYER_ACTIONS, DEFAULT_PLAYER],
    home: ['remote.home', HOME_ACTIONS, DEFAULT_HOME],
  };
  const group = (scope, title) => {
    const [key, acts, def] = scopes[scope];
    const map = normalizeKeys(store.pref(key, null), acts, def);
    const opts = acts.map((a) => [a[0], a[1]]);
    return `<div class="sect">${title}</div>` + COLORS.map(([c, n]) => `<div class="sel-row"><span style="white-space:nowrap"><i class="rm-dot rm-${c}"></i>${n}</span><select data-rm="${scope}" data-c="${c}" aria-label="${title}: ${n} tuş">${optionsHtml(opts, map[c])}</select></div>`).join('');
  };
  openSheet({
    title: 'Kumanda renkli tuşları',
    html: group('player', 'Oynatıcıda') + group('home', 'Listelerde') + '<div style="margin-top:14px"><button class="btn ghost sm" id="rm-reset">Varsayılana dön</button></div>',
    mount: (body) => {
      body.addEventListener('change', (e) => {
        const sel = e.target.closest('select[data-rm]');
        if (!sel) return;
        const [key, acts, def] = scopes[sel.dataset.rm];
        store.setPref(key, { ...normalizeKeys(store.pref(key, null), acts, def), [sel.dataset.c]: sel.value });
      });
      $('#rm-reset', body).addEventListener('click', () => {
        for (const [key, , def] of Object.values(scopes)) store.setPref(key, { ...def });
        $$('select[data-rm]', body).forEach((sel) => (sel.value = scopes[sel.dataset.rm][2][sel.dataset.c]));
        toast('Varsayılan atamalar geri yüklendi');
      });
    },
  });
}

// Oynatıcı ayarları: yayın bağlantısı, bölüm geçişi, altyazı, kumanda ve alt düğme etiketleri (eskiden Genel ayarlar'daydı).
const plLabels = () => new Set(normalizeLabels(store.pref('pl.labels', [])));
function playerSheet() {
  openSheet({
    full: true, // TV'de tam sayfa
    title: 'Oynatıcı ayarları',
    html:
      (nativePlugin
        ? setCard('Performans', 'activity', [
            selRow('g-perf', 'Otomatik performans yöneticisi', 'Düşük donanımda çözünürlüğü ve yayın belleğini sınırlar. Otomatik cihazı algılar; seçim hemen uygulanır', optionsHtml([['auto', 'Otomatik'], ['low', 'Düşük'], ['balanced', 'Dengeli'], ['high', 'Yüksek']], store.pref('set.performance', 'auto'))),
            btnRow('g-perf-info', 'Cihaz performans bilgileri', 'Bellek, işlemci ve video çözücüleri', 'Görüntüle'),
            selRow('g-buf', 'Yayın önbelleği', 'Hızlı: kanal çabuk açılır, takılma artabilir. Yüksek: daha az takılma, kanal biraz geç açılır. Sonraki açılışta geçerli olur', optionsHtml(BUFFER_LEVELS, normalizeBuffer(store.pref('set.buffer', DEFAULT_BUFFER))), true),
            selRow('g-dec', 'Görüntü çözücü', 'Otomatik cihazın seçimini kullanır. Donanım öncelikli: Mi Stick gibi TV kutularında ilk deneme. Görüntü bozuksa yazılım öncelikliyi deneyin (işlemciyi daha çok kullanır). Seçim açık yayını yeniden açar', optionsHtml(DECODER_MODES, normalizeDecoder(store.pref('set.decoder', DEFAULT_DECODER))), true),
            !isPlay() ? selRow('g-saud', 'Yazılım ses çözücüsü (deneysel)', { html: 'Telefonunuz bir kanalın sesini çözemiyorsa (AC3, E-AC3, DTS: “Ses çözülemiyor”) uygulamanın kendi çözücüsüyle çalar. Seçim açık yayını yeniden açar.' + (store.pref('set.softAudioCrashed', false) ? ' Önceki denemede uygulama kapandığı için kapatıldı; yine de deneyebilirsiniz.' + (store.pref('set.softAudioInfo', '') ? '<br>Kapanma kaydı: ' + esc(String(store.pref('set.softAudioInfo', ''))) : '') : '') }, optionsHtml([['off', 'Kapalı'], ['on', 'Açık']], store.pref('set.softAudio', 'off') === 'on' ? 'on' : 'off'), true) : '',
          ])
        : setCard('Performans', 'activity', [selRow('g-buf', 'Yayın önbelleği', 'Hızlı: kanal çabuk açılır, takılma artabilir. Yüksek: daha az takılma, kanal biraz geç açılır. Sonraki açılışta geçerli olur', optionsHtml(BUFFER_LEVELS, normalizeBuffer(store.pref('set.buffer', DEFAULT_BUFFER))), true)])) +
      (warm
        ? setCard('Önbellek', 'dl', [
            selRow('g-warm', 'Önceden indirme (Wi-Fi)', 'Wi-Fi’dayken favori, devam eden ve son eklenen filmlerin afişleri, içerik uyarıları ve bugünün maçlarının takım simgeleri arka planda indirilir. Mobil veride indirmez', optionsHtml([['on', 'Açık'], ['off', 'Kapalı']], store.pref('set.warm', 'on') === 'off' ? 'off' : 'on'), true),
            btnRow('g-ic', 'Görsel önbelleği', 'Hesaplanıyor…', 'Temizle', 'g-ic-s'),
          ])
        : '') +
      setCard('Bağlantı', 'link', [
        selRow('g-rc', 'Yayın koparsa', 'Oynarken bağlantı kesilirse yeniden bağlanma davranışı', optionsHtml(RECONNECT_MODES, normalizeReconnect(store.pref('set.reconnect', DEFAULT_RECONNECT)))),
        selRow('g-stall', 'Takılma bekleme süresi', 'Yayın bu kadar gelmezse yeniden bağlanılır', optionsHtml(STALL_LEVELS, normalizeStall(store.pref('set.stall', DEFAULT_STALL)))),
        selRow('g-lfmt', 'Canlı yayın biçimi', 'Kanallar donuyor ya da bozuk görünüyorsa “TS önce”yi deneyin. Otomatik: bir kanal öteki biçimle düzgün oynarsa o kanal için hatırlanır', optionsHtml(LIVE_FORMATS, normalizeLiveFmt(store.pref('set.liveFmt', DEFAULT_LIVE_FMT))), true),
        chkRow('altCh', 'Yedek kanalı dene', 'Açılmayan kanal yerine, listede aynı adlı başka kanal varsa otomatik denenir'),
      ]) +
      setCard('Oynatma', 'play', [
        chkRow('autoNext', 'Sonraki bölümü otomatik oynat', 'Bölüm bitmeden 15 sn önce geri sayım kartı çıkar; kartta iptal edebilirsiniz'),
        chkRow('movieNext', 'Film bitince öneri göster', 'Aynı kategoriden izlemediğiniz bir sonraki film önerilir; siz basmadan başlamaz'),
        chkRow('autoOrient', 'Yönü videoya göre seç', 'Dikey videolar dikey, yatay videolar yatay tam ekran açılır. Elle yön düğmesine basınca o oturumda seçiminiz geçerli olur'),
        selRow('g-porient', 'Telefon oynatıcı yönü', 'Dikey: telefon dik tutulurken oynatıcı açılır. TV modu her zaman yatay kalır', optionsHtml([['portrait', 'Dikey'], ['landscape', 'Yatay']], store.pref('set.playerOrientation', 'landscape'))),
        nativePlugin ? chkRow('autoFrameRate', 'Otomatik kare hızı (AFR)', 'Destekleyen Android cihaz ve ekranlarda yayın kare hızına uyum sağlar') : '',
        numRow('g-intro', 'Intro atla süresi', 'Dizi bölümünde atlama düğmesinin ileri saracağı süre (0–240 saniye; 0 kapalı)', `min="0" max="240" step="1" value="${normalizeIntro(store.pref('set.intro', DEFAULT_INTRO))}"`),
      ]) +
      (nativePlugin
        ? setCard('Ses ve altyazı', 'audio', [
            selRow('g-alang', 'Tercih edilen ses dili', 'Birden çok ses izi olan film ve yayınlarda açılışta bu dil seçilir', optionsHtml(AUDIO_LANGS, normalizeAudioLang(store.pref('set.audioLang', 'auto')))),
            selRow('g-slang', 'Altyazı dili', 'Açılışta bu dilde altyazı açılır; Kapalı seçilirse hiç açılmaz', optionsHtml(SUB_LANGS, normalizeSubLang(store.pref('set.subLang', 'auto')))),
            chkRow('subMissing', 'Altyazıyı yalnız tercih ettiğim ses yoksa aç', 'Örn. ses dili Türkçe seçiliyken film Türkçe değilse Türkçe altyazı açılır; Türkçe ses varsa açılmaz'),
            btnRow('g-sub', 'Altyazı görünümü', subLabel(store.pref('sub', DEFAULT_SUB)), 'Ayarla', 'g-sub-s'),
          ])
        : '') +
      setCard('Kumanda', 'tv', [btnRow('g-rm', 'Renkli tuşlar', 'Kırmızı, yeşil, sarı, mavi tuşa oynatıcıda ve listelerde yapılacak işi seçin', 'Ayarla')]) +
      setCard('Alt düğmelerde adı yazsın', 'list', [
        noteRow('İşaretlenenlerin simgesinin yanında adı da yazar; diğerleri yalnız simge olur. Düğmeler ortada, tek satırdadır.'),
        ...PLAYER_TOOLS.map(([id, name]) => `<button class="chk${plLabels().has(id) ? ' on' : ''}" data-pl="${id}" role="switch" aria-checked="${plLabels().has(id)}"><i>${icon('check')}</i><span class="t">${esc(name)}</span></button>`),
      ]),
    mount: (body) => {
      body.addEventListener('click', (e) => {
        const t = e.target.closest('[data-pl]');
        if (t) {
          const cur = plLabels();
          if (cur.has(t.dataset.pl)) cur.delete(t.dataset.pl);
          else cur.add(t.dataset.pl);
          store.setPref('pl.labels', normalizeLabels([...cur]));
          t.classList.toggle('on', cur.has(t.dataset.pl));
          t.setAttribute('aria-checked', String(cur.has(t.dataset.pl)));
          return;
        }
        const c = e.target.closest('.chk[data-k]');
        if (c) {
          const on = !setting(c.dataset.k);
          store.setPref('set.' + c.dataset.k, on);
          c.classList.toggle('on', on);
          if (c.dataset.k === 'autoFrameRate') applyAutoFrameRate();
        }
      });
      $('#g-rm', body).addEventListener('click', () => remoteSheet());
      const orient = $('#g-porient', body);
      if (orient) orient.addEventListener('change', (e) => {
        store.setPref('set.playerOrientation', e.target.value === 'portrait' ? 'portrait' : 'landscape');
      });
      $('#g-buf', body).addEventListener('change', (e) => store.setPref('set.buffer', normalizeBuffer(e.target.value)));
      const perfInfo = $('#g-perf-info', body);
      if (perfInfo) perfInfo.addEventListener('click', async () => {
        perfInfo.disabled = true;
        try {
          const d = await nativePlugin.getPerformanceProfile();
          const decoders = Array.isArray(d.videoDecoders) ? d.videoDecoders : [];
          const decoderRows = decoders.map((x) => {
            const types = Array.isArray(x.types) ? x.types.join(', ') : '';
            return `<div class="sel-row"><span>${esc(x.name || 'Bilinmeyen çözücü')}<small>${esc(types)} · ${x.hardwareAccelerated === true ? 'Donanım hızlandırmalı' : x.hardwareAccelerated === false ? 'Yazılım çözücü' : 'Türü belirlenemedi'}</small></span></div>`;
          }).join('');
          openSheet({
            title: 'Cihaz performans bilgisi',
            html: `<div class="sel-row"><span>Cihaz<small>${esc([d.manufacturer, d.model].filter(Boolean).join(' ') || 'Bilinmiyor')}</small></span></div>
              <div class="sel-row"><span>Android<small>${esc(d.androidVersion || 'Bilinmiyor')} · API ${Number(d.androidSdk) || '-'}</small></span></div>
              <div class="sel-row"><span>RAM<small>${Number(d.totalRamMb) || 0} MB toplam · ${Number(d.availableRamMb) || 0} MB kullanılabilir</small></span></div>
              <div class="sel-row"><span>Uygulama belleği<small>${Number(d.memoryClassMb) || 0} MB sınıf · ${Number(d.maxHeapMb) || 0} MB heap</small></span></div>
              <div class="sel-row"><span>İşlemci<small>${Number(d.cores) || 0} çekirdek · ${d.lowRamDevice ? 'Düşük RAM cihazı' : 'Standart RAM sınıfı'}</small></span></div>
              <div class="sect">Video çözücüleri (${decoders.length})</div>${decoderRows || '<p class="hint">Video çözücü bilgisi alınamadı.</p>'}`,
          });
        } catch {
          toast('Cihaz bilgileri alınamadı', 2500);
        } finally {
          perfInfo.disabled = false;
        }
      });
      const gperf = $('#g-perf', body);
      if (gperf) gperf.addEventListener('change', (e) => {
        const mode = ['auto', 'low', 'balanced', 'high'].includes(e.target.value) ? e.target.value : 'auto';
        store.setPref('set.performance', mode);
        if (nativePlugin && nativePlugin.setPerformanceProfile) nativePlugin.setPerformanceProfile({ mode }).then((r) => toast('Performans profili uygulandı: ' + (r.maxVideo || r.active), 2500)).catch(() => toast('Performans profili uygulanamadı', 2500));
      });
      const galang = $('#g-alang', body);
      if (galang) galang.addEventListener('change', (e) => store.setPref('set.audioLang', normalizeAudioLang(e.target.value)));
      const gslang = $('#g-slang', body);
      if (gslang) gslang.addEventListener('change', (e) => store.setPref('set.subLang', normalizeSubLang(e.target.value)));
      const gdec = $('#g-dec', body);
      if (gdec) gdec.addEventListener('change', (e) => {
        store.setPref('set.decoder', normalizeDecoder(e.target.value));
        applyDecoder();
      });
      const gsaud = $('#g-saud', body);
      if (gsaud) gsaud.addEventListener('change', (e) => {
        const on = e.target.value === 'on';
        store.setPref('set.softAudio', on ? 'on' : 'off');
        store.setPref('set.softAudioCrashed', false);
        if (nativePlugin && nativePlugin.setSoftAudio) nativePlugin.setSoftAudio({ on }).catch(() => toast('Yazılım ses çözücüsü uygulanamadı', 2500));
      });
      const gwarm = $('#g-warm', body);
      if (gwarm) {
        gwarm.addEventListener('change', (e) => store.setPref('set.warm', e.target.value === 'off' ? 'off' : 'on'));
        const paintIc = () => nativePlugin.imageCacheInfo().then((i) => { const el = $('#g-ic-s', body); if (el) el.textContent = `${i.count || 0} görsel · ${fmtBytes(i.bytes || 0)} (afişler, logolar, takım simgeleri; en çok 160 MB)`; }).catch(() => {});
        paintIc();
        $('#g-ic', body).addEventListener('click', () => nativePlugin.clearImageCache().then(() => { toast('Görsel önbelleği temizlendi'); paintIc(); }).catch(() => toast('Temizlenemedi', 2500)));
      }
      $('#g-rc', body).addEventListener('change', (e) => store.setPref('set.reconnect', normalizeReconnect(e.target.value)));
      $('#g-stall', body).addEventListener('change', (e) => store.setPref('set.stall', normalizeStall(e.target.value)));
      $('#g-lfmt', body).addEventListener('change', (e) => {
        store.setPref('set.liveFmt', normalizeLiveFmt(e.target.value));
        if (e.target.value !== 'auto') store.setPref(LIVE_FMT_KEY, {}); // açık seçim, kanal başına hatırlananların önüne geçsin
      });
      $('#g-intro', body).addEventListener('change', (e) => {
        const value = normalizeIntro(e.target.value);
        e.target.value = String(value);
        store.setPref('set.intro', value);
        toast(value ? `Intro atlama süresi: ${value} sn` : 'Intro atlama kapatıldı');
      });
      const gsub = $('#g-sub', body);
      if (gsub) gsub.addEventListener('click', () => pui.subtitleSheet(() => ($('#g-sub-s', body).textContent = subLabel(store.pref('sub', DEFAULT_SUB)))));
    },
  });
}

// Uygulama teması: kartlar uygulamanın gerçek ana ekran görüntüleridir; dokununca tema hemen uygulanır (Uygula düğmesi yok).
// Pro olarak işaretli temalar üyelik yetmiyorsa kilitlidir: dokununca Pro sayfası açılır, tema değişmez.
function themeSheet() {
  let selected = themeAllowed(store.pref('set.theme', DEFAULT_THEME));
  const card = (t) => {
    const pro = isProTheme(t.id, proThemeList());
    const lock = themeLocked(t.id);
    return `
    <button class="theme-choice${t.id === selected ? ' on' : ''}${lock ? ' locked' : ''}" type="button" data-theme-choice="${esc(t.id)}" aria-pressed="${t.id === selected}" aria-label="${esc(t.name + (pro ? ', Pro' : ''))}">
      <span class="theme-shot"><img src="${esc(previewUrl(t.id))}" alt="" loading="lazy" decoding="async"></span>
      <span class="theme-choice-foot"><span class="theme-choice-name">${esc(t.name)}</span>${pro ? `<span class="theme-pro">${lock ? icon('lock') : ''}PRO</span>` : ''}<span class="theme-choice-check" aria-hidden="true">✓</span></span>
    </button>`;
  };
  return openPage({
    title: 'Uygulama teması',
    cls: 'theme-picker-page',
    html: `
      <p class="theme-picker-intro">Dokunduğunuz tema hemen uygulanır.</p>
      <div class="theme-choice-grid" id="theme-choice-grid">${THEMES.map(card).join('')}</div>`,
    mount: (body) => {
      $('#theme-choice-grid', body).addEventListener('click', (e) => {
        const el = e.target.closest('[data-theme-choice]');
        if (!el || el.dataset.themeChoice === selected) return;
        if (isProTheme(el.dataset.themeChoice, proThemeList()) && !needPro('themes')) return;
        selected = applyTheme(el.dataset.themeChoice);
        store.setPref('set.theme', selected);
        body.querySelectorAll('.theme-choice').forEach((x) => {
          const active = x.dataset.themeChoice === selected;
          x.classList.toggle('on', active);
          x.setAttribute('aria-pressed', String(active));
        });
      });
    },
  });
}

function generalSheet() {
  const lim = Number(store.pref('set.recentLimit', 40));
  openSheet({
    full: true, // TV'de tam sayfa
    title: 'Genel ayarlar',
    html:
      // Bölümlere ayrılmış kartlar: her satır başlığı + tek satırlık açıklaması + sağda anahtar/seçim/düğme
      setCard('Canlı TV', 'tv', [
        chkRow('epgRows', 'Program bilgisi', 'Kanal listesinde şu an yayındaki program ve ilerleme çubuğu'),
        chkRow('numbers', 'Kanal numaraları', 'Yatay ekrandaki Canlı TV listesinde'),
        chkRow('autoPreview', 'Önizleme oynat', 'Yatay ekranda kanala dokununca küçük pencerede açılır; kapalıyken doğrudan tam ekran'),
      ]) +
      setCard('Film ve diziler', 'movie', [
        selRow('g-mv', 'Film ve dizi ekranı', 'Otomatik: Vitrinli satırlar (telefonda dikeyken ve TV’de). Vitrinli satırlar: yatay kayan kategoriler, üstte odaktaki yapımın vitrini', optionsHtml(MV_VIEWS, MV_VIEWS.some(([k]) => k === store.pref('set.mvView', 'auto')) ? store.pref('set.mvView', 'auto') : 'auto'), true),
        selRow('g-cord', 'Kategori sırası', 'Öne çıkanlar önce: yeni, platform ve Türkçe içerik üstte, yetişkin kategoriler en sonda. Kendi verdiğiniz sıra her zaman önceliklidir', optionsHtml(CAT_ORDERS, catOrderMode()), true),
        selRow('g-rcap', 'Satırdaki yapım sayısı', 'Vitrinli satırda en çok kaç kutu dizilir; fazlası “Tümünü gör” kutusunda', optionsHtml(ROW_CAPS, normalizeRowCap(store.pref('set.rowCap', SHELF_CAP)))),
        selRow('g-cap', 'Kutudaki ad', 'Afişin altında kaç satır görünsün', optionsHtml(CAPTION_LINES, normalizeCaption(store.pref('set.caption', DEFAULT_CAPTION)))),
        chkRow('showProg', 'Devam çubukları', 'Film ve dizi kutularında ve bölümlerde izleme ilerlemesi'),
        chkRow('epThumbs', 'Bölüm küçük resimleri', 'Yatay ekranda dizi bölümlerinin yanındaki resim; kapatınca satırlar sıkışık olur'),
        chkRow('trailerFind', 'Fragmanı otomatik ara', 'Hazır fragman yoksa başlığı YouTube’da arar ve bulduğu resmî fragmanı ekranda gösterir; kapalıyken “YouTube’da ara” düğmesi çıkar', 'trailer'),
        chkRow('trailerAuto', 'Fragmanı otomatik oynat', 'Film ve dizi ekranında ve vitrinde fragman sessiz başlar, “Sesi aç” ile açılır; kapalıyken küçük resme dokununca oynar. Çocuk modunda fragman gösterilmez', 'trailer'),
      ]) +
      setCard('Görünüm ve cihaz', 'gear', [
        selRow('g-lang', 'Dil / Language', 'Uygulamanın dili; değişince uygulama yeniden başlar', LANG_CHOICES.map(([v, name]) => `<option value="${v}"${normalizeLang(store.pref('set.lang', 'auto')) === v ? ' selected' : ''}${v === 'auto' ? '' : ' translate="no"'}>${name}</option>`).join('')),
        selRow('g-fs', 'Yazı boyutu', '', optionsHtml(FONT_SCALES, Math.round(fontScale() * 100))),
        selRow('g-lite', 'Hafif mod', 'Animasyon, gölge ve bulanıklığı kapatır; otomatikte 2 GB ve altı bellekli cihazda açılır', optionsHtml(LITE_MODES, normalizeLite(store.pref('set.lite', DEFAULT_LITE)))),
        selRow('g-tv', 'TV modu', 'Kumanda ile kullanım: yatay, tam ekran, büyük yazı', optionsHtml(TV_MODES, normalizeTvMode(store.pref('set.tvmode', DEFAULT_TV_MODE)))),
      ]) +
      setCard('Ana ekran', 'home', [
        btnRow('g-hord', 'Bölüm sırası', isDefaultOrder(normalizeOrder(store.pref('set.homeOrder', []))) ? 'Varsayılan sıra; örn. Vizyondakileri üste taşıyabilirsiniz' : 'Özel sıra', 'Düzenle'),
      ]) +
      setCard('Son izlenenler', 'history', [
        selRow('g-lim', 'Saklanan sayı', 'Son izlenenler listesinin sınırı', optionsHtml([[20, '20'], [40, '40'], [100, '100']], lim)),
        btnRow('g-clr', 'Listeyi temizle', 'Bu kaynağın son izlenenlerini siler', 'Temizle'),
      ]) +
      setCard('Güvenlik ve yedek', 'lock', [
        btnRow('g-lock', 'Uygulama şifresi', lockEnabled() ? 'Açık' : 'Kapalı', 'Ayarla', 'g-lock-s'),
        btnRow('g-bk', 'Yedekle / geri yükle', 'Kaynaklar, favoriler, kategori düzeni, ayarlar', 'Aç'),
      ]) +
      setCard('Destek', 'info', [
        btnRow('g-dev', 'Cihaz kimliği', fmtDeviceId(deviceId(store)), 'Kopyala', 'g-dev-s'),
        btnRow('g-rep', 'Sorun raporu', 'Yöneticinize gönderilecek bilgileri önizleyin', 'Gönder'),
      ]),
    mount: (body) => {
      body.addEventListener('click', (e) => {
        const c = e.target.closest('.chk');
        if (c) {
          const pk = c.dataset.k === 'trailerAuto' || c.dataset.k === 'trailerFind' ? 'trailer' : '';
          const on = pk && !proOk(pk) ? true : !setting(c.dataset.k);
          if (on && pk && !needPro(pk)) return; // Pro olmadan açılmaz: Pro sayfası açılır
          store.setPref('set.' + c.dataset.k, on);
          c.classList.toggle('on', on);
          if (c.dataset.k === 'showProg' || c.dataset.k === 'epThumbs') applyViewPrefs();
          S.list && S.list.refreshRows();
        } else if (e.target.id === 'g-clr') {
          store.clearRecents(sid());
          toast('Son izlenenler temizlendi');
        }
      });
      $('#g-cap', body).addEventListener('change', (e) => {
        store.setPref('set.caption', applyCaption(e.target.value, document));
        renderTab(); // ızgara hücre yüksekliği değişti: liste yeniden kurulur
      });
      $('#g-rcap', body).addEventListener('change', (e) => {
        store.setPref('set.rowCap', normalizeRowCap(e.target.value));
        renderTab(); // satırlar yeniden kurulur
      });
      $('#g-cord', body).addEventListener('change', (e) => {
        store.setPref('set.catOrder', normalizeCatOrder(e.target.value));
        renderTab(); // kategoriler yeni sırayla yeniden kurulur
      });
      $('#g-mv', body).addEventListener('change', (e) => {
        if ((e.target.value === 'rows' || e.target.value === 'hero') && !needPro('rows')) {
          e.target.value = store.pref('set.mvView', 'auto');
          return;
        }
        store.setPref('set.mvView', MV_VIEWS.some(([k]) => k === e.target.value) ? e.target.value : 'auto');
        renderTab(); // satırlar ↔ ızgara: görünüm baştan kurulur
      });
      $('#g-lite', body).addEventListener('change', (e) => {
        store.setPref('set.lite', normalizeLite(e.target.value));
        applyLiteMode();
      });
      $('#g-lang', body).addEventListener('change', (e) => {
        store.setPref('set.lang', normalizeLang(e.target.value));
        toast('Dil değiştiriliyor…', 1500);
        setTimeout(() => location.reload(), 350); // metinler baştan çizilir; Türkçe'ye dönüş için yeniden yükleme gerekir
      });
      $('#g-tv', body).addEventListener('change', (e) => {
        store.setPref('set.tvmode', normalizeTvMode(e.target.value));
        applyTvMode();
      });
      $('#g-hord', body).addEventListener('click', () => homeOrderSheet());
      $('#g-lock', body).addEventListener('click', () => lockSheet());
      $('#g-bk', body).addEventListener('click', () => backupSheet());
      $('#g-dev', body).addEventListener('click', async () => toast((await copyText(fmtDeviceId(deviceId(store)))) ? 'Cihaz kimliği kopyalandı' : 'Kopyalanamadı'));
      $('#g-rep', body).addEventListener('click', () => reportSheet());
      $('#g-lim', body).addEventListener('change', (e) => store.setPref('set.recentLimit', Number(e.target.value)));
      $('#g-fs', body).addEventListener('change', (e) => {
        store.setPref('set.fontScale', Number(e.target.value));
        applyFontScale();
        renderTab(); // sabit yükseklikli listeler yeni ölçüyle yeniden kurulur
      });
    },
  });
}

// ------------------------------------------------------------------ paylaşma, sorun raporu, davet kodlu (yönetilen) listeler

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
async function readClipboard() {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return '';
  }
}
// Android’de paylaşım menüsü (WhatsApp, e-posta…); olmazsa panoya kopyalar.
async function shareOrCopy(text, title) {
  if (nativePlugin && nativePlugin.shareText) {
    try {
      await nativePlugin.shareText({ text, title });
      return 'share';
    } catch {
      /* kullanıcı paylaşımı kapattı ya da menü açılamadı: panoya kopyalamaya düşülür */
    }
  }
  if (await copyText(text)) {
    toast('Panoya kopyalandı');
    return 'copy';
  }
  toast('Paylaşılamadı');
  return '';
}

function reportInput() {
  const names = new Map();
  for (const it of S.cat.live) names.set(String(it.id), it.name);
  const bad = Object.entries(store.pref(badKey(), {}) || {})
    .sort((a, b) => b[1] - a[1])
    .map(([id, at]) => ({ name: names.get(String(id)) || 'Kanal ' + id, at }));
  const hv = Object.values(store.pref(histKey(), {}) || {});
  const hist = { ok: hv.filter((r) => r[0] === 1).length, fail: hv.filter((r) => r[0] === 0).length, unknown: hv.filter((r) => r[0] === -1).length };
  // Üyelik: gerçek durum (yönetici önizlemesi sayılmaz). Satın alma bağlı değilse (doğrudan APK) üyelik yoktur.
  const mem = BILLING_READY ? memberState({ start: Number(store.pref('mem.start', 0)), ent: store.pref('mem.ent', null) }) : null;
  return {
    version: VERSION,
    tv: isTvUi(),
    deviceId: deviceId(store),
    tier: mem ? mem.tier : '',
    tierDays: mem ? mem.daysLeft : 0,
    sources: store.sources(),
    counts: { live: S.cat.live.length, movie: S.cat.movies.length, series: S.cat.series.length },
    bad,
    errors: store.pref('errlog', []) || [],
    hist,
  };
}

function reportSheet() {
  const rep = buildReport(reportInput());
  const text = 'Iptv Player Pro sorun raporu\n\n' + encodeReport(rep);
  const sh = openSheet({
    title: 'Sorun raporu',
    html: `<p>Yöneticinize yardımcı olmak için aşağıdaki bilgiler gönderilir. Şifre, kullanıcı adı ve liste adresi gönderilmez.</p><pre id="rp-view" style="white-space:pre-wrap;font:inherit;font-size:.8rem;color:var(--muted);margin:10px 0">${esc(describeReport(rep))}</pre><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="rp-send">Gönder</button><button class="btn ghost" id="rp-copy">Kopyala</button></div>`,
    mount: (body) => {
      $('#rp-send', body).addEventListener('click', async () => {
        if (await shareOrCopy(text, 'Sorun raporu gönder')) sh.close();
      });
      $('#rp-copy', body).addEventListener('click', async () => toast((await copyText(text)) ? 'Rapor kopyalandı' : 'Kopyalanamadı'));
    },
  });
}

// Oynatma hataları rapora girmek üzere kısa bir halka tamponunda tutulur (adresler ve gizli değerler süzülür).
let lastPlayErr = '';
player.on((st) => {
  if (st.status !== 'error' || !st.item) {
    if (st.status !== 'error') lastPlayErr = '';
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return; // internet yokken oluşan hata kanalın suçu değil
  const key = st.item.id + '|' + st.error;
  if (key === lastPlayErr) return;
  lastPlayErr = key;
  store.setPref('errlog', pushError(store.pref('errlog', []), { k: st.item.kind, n: st.item.name, m: st.error }));
});

// Yönetici dosyasından (config.json) iki şey okunur: Pro olarak işaretli temalar ve bu cihaza verilmiş hediye üyelik (cihaz kimliğiyle eşleşir).
// Yalnız kilitler çalışırken sorulur; ağ yoksa son bilinen değerler kalır. Seçili tema Pro olduysa ve üyelik yetmiyorsa varsayılana dönülür.
// → true: hediye üyelik değişti (ekran yenilendi).
let cfgBusy = false;
async function refreshRemoteConfig({ launch = false, force = false } = {}) {
  if (cfgBusy || !memOn() || (!force && !shouldAutoCheck(store.pref('cfg.at', 0), Date.now(), launch ? LAUNCH_MS : CHECK_MS))) return false;
  cfgBusy = true;
  try {
    const cfg = await fetchConfig(net);
    store.setPref('cfg.at', Date.now());
    let changed = false;
    let giftChanged = false;
    const next = cleanProThemes(cfg.pt);
    if (JSON.stringify(next) !== JSON.stringify(proThemeList())) {
      store.setPref('cfg.proThemes', next);
      changed = true;
    }
    const gift = giftFor(cfg, deviceId(store));
    const had = store.pref('mem.gift', null);
    if (JSON.stringify(gift) !== JSON.stringify(had)) {
      store.setPref('mem.gift', gift); // dosyada yoksa kaldırılır: yönetici hediyeyi her an geri alabilir
      changed = giftChanged = true;
      if (gift && (!had || had.tier !== gift.tier)) toast(`Hediye üyelik etkin: ${TIERS[gift.tier]} (${memState().daysLeft} gün)`, 4000);
    }
    if (changed) applyTheme(themeAllowed(store.pref('set.theme', DEFAULT_THEME)));
    if (giftChanged) renderTab();
    return giftChanged;
  } catch {
    /* çevrimdışı ya da dosya yok: son bilinen değerler geçerli */
    return false;
  } finally {
    cfgBusy = false;
  }
}

// Davet koduyla gelen kaynakları yönetici dosyasıyla eşitler: değişiklikler uygulanır, erişimi biten kaynaklar kaldırılır.
let mgBusy = false;
async function refreshManaged({ launch = false, force = false } = {}) {
  if (isPlay() || mgBusy || !store.sources().some((s) => s.managed && s.code)) return;
  if (!force && !shouldAutoCheck(store.pref('mg.at', 0), Date.now(), launch ? LAUNCH_MS : CHECK_MS)) return;
  mgBusy = true;
  try {
    store.setPref('mg.at', Date.now());
    const r = await syncManaged({ store, net, deviceId: deviceId(store), now: Date.now() });
    if (!r || !r.changed) return;
    const cur = S.source && store.sources().find((s) => s.id === S.source.id);
    if (!cur) {
      const next = store.activeSource();
      if (next) await activate(next.id);
      else {
        S.source = null;
        setCatalog(emptyCatalog());
        renderTop();
        renderTab();
        sourceForm();
      }
    } else if (r.updated) await activate(cur.id, { force: true });
    else if (S.tab === 'sources') renderTab();
    if (r.removed.length) mgNotice(r.removed);
  } finally {
    mgBusy = false;
  }
}
function mgNotice(removed) {
  const sh = openSheet({
    title: 'Liste erişimi sona erdi',
    html: removed.map((x) => `<p>${esc(x.reason)}${x.names && x.names.length ? `<br><small>Kaldırılan: ${esc(x.names.join(', '))}</small>` : ''}</p>`).join('') + '<p>Yeni bir kod için listeyi size veren kişiyle görüşün.</p><button class="btn" id="mg-ok" style="width:100%">Tamam</button>',
    mount: (body) => $('#mg-ok', body).addEventListener('click', () => sh.close()),
  });
}

function autoSheet() {
  openSheet({
    full: true, // TV'de tam sayfa
    title: 'Otomasyon',
    html:
      setCard('Otomatik yenileme', 'timer', [
        selRow('a-cat', 'Canlı, film ve dizi listesi', 'Listeyi ne sıklıkla yenilesin', optionsHtml([[0, 'Kapalı'], [6, '6 saatte bir'], [12, '12 saatte bir'], [24, 'Günde bir'], [48, '2 günde bir'], [168, 'Haftada bir']], store.pref('auto.cat', 12))),
        selRow('a-epg', 'TV rehberi (EPG)', 'Program bilgisini ne sıklıkla yenilesin', optionsHtml([[0, 'Kapalı'], [3, '3 saatte bir'], [6, '6 saatte bir'], [12, '12 saatte bir'], [24, 'Günde bir']], store.pref('auto.epg', 6))),
      ]) +
      noteRow('Uygulama açılırken ya da öne geldiğinde, son yenilemeden bu kadar süre geçmişse liste kendiliğinden güncellenir. İstediğiniz an ana ekrandaki yenile düğmesine de dokunabilirsiniz.'),
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
    const info = (label, sub, extra = '') => `<div class="list-item"><span class="t">${esc(label)}<small${extra}>${esc(sub)}</small></span></div>`;
    body.innerHTML =
      setCard('Kaynak', 'tv', [info(s.name, status), info('Son güncelleme', when), ...urls.map((u) => info('Adres', maskUrl(u), ' style="word-break:break-all"'))]) +
      setCard('İşlemler', 'refresh', [
        `<div class="sel-row">${rowText('Şimdi yenile', 'TV rehberini kaynaktan yeniden indirir')}<button class="btn sm" id="e-now" type="button"${urls.length ? '' : ' disabled'}>${icon('refresh')}Yenile</button></div>`,
        btnRow('e-edit', 'Kaynak ayarları', 'Adı, adresi ve TV rehberi bağlantısını değiştirir', 'Düzenle'),
      ]);
    $('#e-now', body).addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      e.currentTarget.textContent = 'Yenileniyor…';
      await maybeRefreshEpg(true);
      if (body.isConnected) draw(body);
    });
    $('#e-edit', body).addEventListener('click', () => sourceForm(s));
  };
  openSheet({ full: true, title: 'TV rehberi (EPG)', mount: (body) => draw(body) });
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
let updNoteOff = false; // şerit bu açılış için kapatıldı

// Yeni sürüm varsa ekranın üstünde bildirim şeridi: “Güncelle” pencereyi açar, × bu açılış için gizler.
function updNote() {
  const el = $('#upd-note');
  if (!el) return;
  const show = !!upd && upd.status === 'available' && !updNoteOff; // çocuk modunda CSS gizler
  el.hidden = !show;
  el.innerHTML = show
    ? `<span class="un-t">${icon('refresh')}<span>Yeni sürüm <b>${esc(upd.name)}</b> hazır</span></span><button class="btn sm" id="upd-note-go">Güncelle</button><button class="btn sm ghost" id="upd-note-x" aria-label="Kapat">${icon('close')}</button>`
    : '';
}

// Önceki denetimde bulunan yeni sürüm hatırlanır: şerit açılışta hemen (ağ beklemeden) görünür.
function restoreUpd() {
  const last = store.pref('upd.last', null);
  if (!last || upd || !isNewer(last.code, versionCodeOf(VERSION))) return;
  upd = { status: 'available', local: versionCodeOf(VERSION), ...last };
  updNote();
}

// launch: açılışta denetler (yalnız son denetim bir dakikadan eskiyse); uygulamaya geri dönüşlerde 6 saatte bir.
async function checkForUpdate({ manual = false, launch = false } = {}) {
  if (updBusy || isPlay()) return; // Play sürümünü Google Play günceller
  if (!nativePlugin) return manual ? toast('Güncelleme yalnızca Android uygulamasında kullanılır') : undefined;
  if (!manual && !shouldAutoCheck(store.pref('upd.at', 0), Date.now(), launch ? LAUNCH_CHECK_MS : AUTO_CHECK_MS)) return;
  updBusy = true;
  try {
    const r = await checkUpdate({ net, localVersion: VERSION });
    store.setPref('upd.at', Date.now());
    if (r.status === 'unsupported') return manual ? toast('Bu geliştirme sürümünde güncelleme denetimi yok') : undefined;
    upd = r;
    store.setPref('upd.last', r.status === 'available' ? { code: r.code, name: r.name, size: r.size, notes: r.notes, apkUrl: r.apkUrl } : null);
    updNote();
    if (manual) {
      if (r.status === 'available') updateSheet(r);
      else toast(`Uygulama güncel (sürüm ${r.name})`);
    }
  } catch (e) {
    if (manual) toast('Güncelleme denetlenemedi: ' + explainError(e), 4500);
  } finally {
    updBusy = false;
  }
}

$('#upd-note').addEventListener('click', (e) => {
  if (e.target.closest('#upd-note-x')) {
    updNoteOff = true;
    return updNote();
  }
  if (e.target.closest('#upd-note-go') && upd) updateSheet(upd);
});

function updateSheet(info) {
  let path = null;
  let busy = false;
  openSheet({
    full: true, // TV'de tam sayfa
    title: 'Yeni sürüm hazır',
    html: `<p>Sürüm <b>${esc(info.name)}</b> yayında (şu an ${esc(VERSION)}).${info.size ? ` Boyut: ${fmtMB(info.size)}.` : ''}</p>${info.notes ? `<p class="hint" style="white-space:pre-line">${esc(info.notes)}</p>` : ''}<div id="up-bar" hidden style="height:6px;border-radius:3px;background:var(--line);overflow:hidden;margin:10px 0"><i style="display:block;height:100%;width:0;background:var(--accent)"></i></div><p id="up-msg" class="hint"></p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="up-go">${icon('refresh')}Şimdi güncelle</button><button class="btn ghost" id="up-later">Sonra</button></div><p class="hint" style="margin-top:12px">Güncelleme mevcut uygulamanın üstüne kurulur; kaynaklarınız ve favorileriniz korunur.</p>`,
    mount: (body, api) => {
      const go = $('#up-go', body);
      const bar = $('#up-bar', body);
      const msg = $('#up-msg', body);
      $('#up-later', body).addEventListener('click', () => api.close());
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
    full: true, // TV'de tam sayfa
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
          if (isEmptyRec(r)) return toast('Bu kayıt boş (yayından veri yazılamamış); silebilirsiniz', 3500);
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

// ------------------------------------------------------------------ çevrimdışı indirmeler (Android)
// Film ve bölümler tek dosya olarak telefona iner (arka plan hizmeti, sırayla, kaldığı yerden sürer) ve internetsiz oynatılır.
// Dosya olduğu gibi iner: ses dili ve altyazı izlerken oynatıcıdan seçilir. Parçalı (m3u8) yayınlar indirilemez.

const DL = new Map(); // indirme kimliği → işin son durumu (yerel hizmetten gelir)
const dlWatchers = new Set(); // açık ekranlar: durum değişince kendini günceller
const dlOk = () => !!engine.dl && !kidActive();
const dlWifi = () => store.pref('dl.wifi', true) !== false;
const dlFast = () => store.pref('dl.fast', false) === true; // hızlı indirme: aynı dosya birkaç bağlantıyla; varsayılan kapalı (sağlayıcı bağlantı sınırı)
const dlJobOf = (it, ep) => DL.get(dlId(sid(), it.id, ep ? ep.id : ''));
// Filmin indirmesi: başka bir sürümü (4K/FHD/SD kopyası) indirilmişse o da bu filmin durumu sayılır
function dlMovieJob(it) {
  const own = dlJobOf(it);
  if (own) return own;
  for (const v of versionsOf(S.verIdx || (S.verIdx = buildVersionIndex(S.cat.movies)), it)) {
    const j = dlJobOf(v.it);
    if (j) return j;
  }
  return null;
}

// Ekran kapanınca (öğe belgeden ayrılınca) izleyici kendini kaldırır
function watchDl(el, fn) {
  const f = (e) => {
    if (!el.isConnected) return void dlWatchers.delete(f);
    fn(e);
  };
  dlWatchers.add(f);
}
const dlTouch = (e) => [...dlWatchers].forEach((f) => f(e));

// Yerel hizmetten gelen durum/ilerleme olayı
function dlEvent(e) {
  if (!e || !e.id) return;
  const prev = DL.get(e.id);
  if (e.state === 'removed') DL.delete(e.id);
  else DL.set(e.id, e);
  if (e.state === 'done' && (!prev || prev.state !== 'done')) toast(`İndirildi: ${e.name}`, 3200);
  else if (e.state === 'error' && (!prev || prev.state !== 'error')) toast(`İndirilemedi: ${e.name} · ${e.error}`, 4800);
  dlTouch(e);
}

async function dlLoad() {
  if (!engine.dl) return null;
  const res = await engine.dl.list();
  DL.clear();
  for (const j of res.items || []) DL.set(j.id, j);
  dlTouch(null);
  return res;
}

const dlBtnLabel = (j) => {
  if (!j) return `${icon('dl')}İndir`;
  switch (j.state) {
    case 'done':
      return `${icon('check')}İndirildi · Oynat`;
    case 'downloading':
      return `${icon('dl')}İndiriliyor %${pctOf(j)}`;
    case 'queued':
      return `${icon('timer')}İndirme sırasında`;
    case 'waiting':
      return `${icon('timer')}Wi-Fi bekleniyor`;
    case 'paused':
      return `${icon('pause')}Duraklatıldı · Sürdür`;
    default:
      return `${icon('refresh')}İndirilemedi · Tekrar dene`;
  }
};
const dlEpGlyph = (j) => {
  if (!j) return icon('dl');
  if (j.state === 'done') return icon('check');
  if (j.state === 'downloading') return `<small class="dl-pct">%${pctOf(j)}</small>`;
  if (j.state === 'queued' || j.state === 'waiting') return icon('timer');
  return icon(j.state === 'paused' ? 'pause' : 'refresh');
};
const dlEpAria = (j) => (!j ? 'İndir' : { done: 'İndirildi, oynat', downloading: 'İndiriliyor, duraklat', queued: 'Sırada, duraklat', waiting: 'Wi-Fi bekleniyor, duraklat', paused: 'Duraklatıldı, sürdür' }[j.state] || 'İndirilemedi, tekrar dene');

// Film düğmesi / bölüm simgesi: duruma göre başlatır, oynatır, sürdürür ya da durdurur.
function dlToggle(it, ep) {
  if (!dlOk()) return;
  const j = ep ? dlJobOf(it, ep) : dlMovieJob(it);
  if (!j) return dlAsk(it, ep ? { eps: [ep] } : {});
  if (j.state === 'done') return playDownload(j);
  if (j.state === 'paused' || j.state === 'error') return void engine.dl.resume(j.id).catch(() => {});
  if (ep) return void engine.dl.pause(j.id).catch(() => {}); // bölüm simgesine tekrar dokunmak duraklatır
  downloadsSheet();
}

// Oynatıcıdaki İndir düğmesi: daha önce eklenmişse İndirilenler açılır, değilse indirme seçenekleri (tek bölümde doğrudan sıraya).
function dlFromPlayer(st) {
  if (!dlOk() || !st.item) return;
  const j = st.ep ? dlJobOf(st.item, st.ep) : dlMovieJob(st.item);
  if (j) return downloadsSheet();
  dlAsk(st.item, st.ep ? { eps: [st.ep] } : {});
}

// Tek bölüm ilk seferden sonra sormadan eklenir; film ve sezon için (sürüm, Wi-Fi, uyarı) seçenek sayfası açılır.
function dlAsk(it, { eps = null, season = null } = {}) {
  if (!dlOk()) return;
  if (!needPro('dl')) return;
  if (eps && season == null && store.pref('dl.ack', false)) return void dlQueueToast(eps.map((ep) => ({ item: it, ep })));
  dlSheet(it, { eps, season });
}

async function dlQueueToast(entries) {
  const r = await dlQueue(entries);
  if (r.ok) toast(r.ok === 1 ? 'İndirme sıraya eklendi' : `${r.ok} indirme sıraya eklendi`, 2400);
  if (r.bad) toast(r.why || 'İndirilemedi', 4200);
}

// Her kayıt { item, ep } için oynatma adresini bulup yerel hizmete verir (sırayla iner).
async function dlQueue(entries) {
  const wifiOnly = dlWifi();
  const fast = dlFast();
  let ok = 0;
  let bad = 0;
  let why = '';
  ensurePlanPermissions(); // Android 13+: ilerleme bildirimi için bildirim izni
  for (const { item, ep } of entries) {
    const t = pickTarget(playTargets(S.source, item, ep), (ep && ep.ext) || item.ext);
    if (!t) {
      bad++;
      why = why || 'Bu içerik indirilemez (parçalı/m3u8 yayın)';
      continue;
    }
    const id = dlId(sid(), item.id, ep ? ep.id : '');
    try {
      DL.set(id, await engine.dl.start({ id, url: t.url, headers: t.headers ? JSON.stringify(t.headers) : '', name: dlName({ item, ep }), ext: t.ext, meta: makeMeta({ src: sid(), item, ep }), wifiOnly, fast }));
      ok++;
    } catch (e) {
      bad++;
      why = why || String((e && e.message) || e);
      if (/depolama/i.test(why)) break; // yer yoksa kalanları denemenin anlamı yok
    }
  }
  dlTouch(null);
  return { ok, bad, why };
}

const DL_TOS = 'İndirme yalnızca sağlayıcınızın izin verdiği durumlarda ve kişisel kullanım içindir. Sağlayıcı şartlarınızı kontrol edin; indirilen dosyaları paylaşmayın.';

// İndirme seçenekleri: sürüm (kalite), yalnız Wi-Fi, boş alan ve sağlayıcı uyarısı
function dlSheet(it, { eps = null, season = null } = {}) {
  const movie = !eps;
  const versions = movie ? versionsOf(S.verIdx || (S.verIdx = buildVersionIndex(S.cat.movies)), it) : [];
  const todo = movie ? [] : eps.filter((e) => !isActive(dlJobOf(it, e)) && !isDone(dlJobOf(it, e)));
  const title = movie ? 'Filmi indir' : season != null ? `Sezon ${season} · indir` : 'Bölümü indir';
  const what = movie ? esc(it.name) : season != null ? `${esc(it.name)}<small>${todo.length} bölüm indirilecek${eps.length > todo.length ? ` · ${eps.length - todo.length} bölüm zaten indirildi ya da sırada` : ''}</small>` : `${esc(it.name)}<small>${esc(eps[0].label || 'Bölüm')}</small>`;
  let pick = it.id;
  const verRows = () =>
    versions
      .map((v) => `<button class="list-item" role="radio" aria-checked="${v.it.id === pick}" data-v="${esc(v.it.id)}"><span class="t">${esc(v.label)}<small>${esc(v.it.name)}${v.group ? ' · ' + esc(v.group) : ''}</small></span>${v.it.id === pick ? icon('check').replace('class="ic"', 'class="ic ok"') : ''}</button>`)
      .join('');
  const sh = openSheet({
    title,
    html: `<div class="dl-sheet"><p class="dl-what">${what}</p>${versions.length > 1 ? `<h4 class="dl-h">Sürüm</h4><div id="dl-vers" role="radiogroup" aria-label="Sürüm">${verRows()}</div>` : ''}<button class="chk${dlWifi() ? ' on' : ''}" id="dl-wifi" role="switch" aria-checked="${dlWifi()}"><i>${icon('check')}</i><span class="t">Yalnız Wi-Fi’de indir<small>Mobil veride indirmez; Wi-Fi gelince sürer</small></span></button><button class="chk${dlFast() ? ' on' : ''}" id="dl-fast" role="switch" aria-checked="${dlFast()}"><i>${icon('check')}</i><span class="t">Hızlı indirme<small>Aynı dosyayı birkaç bağlantıyla indirir; sağlayıcı sınırlarsa tek bağlantıya döner</small></span></button><p class="hint" id="dl-free"></p><p class="hint">Dosya olduğu gibi iner. Ses dili ve altyazıyı izlerken oynatıcıdan seçersiniz.</p><p class="hint dl-tos">${esc(DL_TOS)}</p><div class="dl-btns">${movie || todo.length ? '<button class="btn" id="dl-go">İndir</button>' : ''}<button class="btn ghost" id="dl-no">${movie || todo.length ? 'Vazgeç' : 'Kapat'}</button></div></div>`,
    mount: (body) => {
      $('#dl-no', body).addEventListener('click', () => sh.close());
      $('#dl-wifi', body).addEventListener('click', (e) => {
        const on = !dlWifi();
        store.setPref('dl.wifi', on);
        e.currentTarget.classList.toggle('on', on);
        e.currentTarget.setAttribute('aria-checked', String(on));
      });
      $('#dl-fast', body).addEventListener('click', (e) => {
        const on = !dlFast();
        store.setPref('dl.fast', on);
        e.currentTarget.classList.toggle('on', on);
        e.currentTarget.setAttribute('aria-checked', String(on));
        if (on) toast('Sağlayıcınız aynı anda tek bağlantıya izin veriyorsa canlı yayın kesilebilir', 4500);
      });
      const vers = $('#dl-vers', body);
      if (vers) {
        vers.addEventListener('click', (e) => {
          const b = e.target.closest('[data-v]');
          if (!b) return;
          pick = b.dataset.v;
          vers.innerHTML = verRows();
        });
      }
      engine.dl
        .list()
        .then((r) => {
          const f = $('#dl-free', body);
          if (f) f.textContent = `Boş alan: ${fmtBytes(r.freeBytes || 0)}`;
        })
        .catch(() => {});
      const go = $('#dl-go', body);
      if (go) {
        go.addEventListener('click', () => {
          store.setPref('dl.ack', true);
          sh.close();
          const entries = movie ? [{ item: (versions.find((v) => v.it.id === pick) || { it }).it, ep: null }] : todo.map((ep) => ({ item: it, ep }));
          dlQueueToast(entries);
        });
      }
    },
  });
}

// Çevrimdışı oynat: asıl öğenin kimliğiyle (ilerleme ve “Devam et” kaynağın öğesine yazılır). Kaynak silinmişse düz yerel dosya olarak açılır.
async function playDownload(job) {
  if (!job || !job.url) return toast('İndirilen dosya bulunamadı');
  const m = parseMeta(job.meta);
  const haveSrc = !!m && store.sources().some((s) => s.id === m.src);
  if (!haveSrc) return startPlay({ id: 'dl:' + job.id, kind: 'recording', name: job.name, logo: (m && m.item.logo) || '', url: job.url });
  if (m.src !== sid()) await activate(m.src);
  const item = m.item;
  if (!m.ep) return startPlay(item, { local: job.url });
  // Bölüm: aynı dizinin indirilmiş bölümleri sırayla (otomatik sonraki bölüm de çevrimdışı çalışır)
  const eps = seriesDone([...DL.values()], m.src, item.id).map((x) => ({ ...x.meta.ep, dlUrl: x.job.url }));
  const index = Math.max(0, eps.findIndex((e) => e.id === m.ep.id));
  const ctx = { items: eps, index, autoNext: true, play: (e, i) => startPlay(item, { ep: e, ctx: { ...ctx, index: i } }) };
  startPlay(item, { ep: eps[index], ctx });
}

function downloadsSheet() {
  if (!engine.dl) return toast('İndirme yalnız Android uygulamasında çalışır');
  const sh = openSheet({
    full: true, // TV'de tam sayfa
    title: 'İndirilenler',
    html: '<div id="dl-body"><p class="hint">Yükleniyor…</p></div>',
    mount: (body) => {
      const box = $('#dl-body', body);
      let stat = { free: 0, used: 0 };
      let shape = '';
      const jobs = () => sortJobs([...DL.values()]);
      const shapeOf = () => jobs().map((j) => j.id + j.state).join();
      const rowHtml = (j) => {
        const act = isActive(j);
        const done = j.state === 'done';
        const tg = act ? ['pause', 'Duraklat'] : j.state === 'error' ? ['refresh', 'Tekrar dene'] : ['play', 'Sürdür'];
        return `<div class="rec-row dl-row${act ? ' on' : ''}" data-row="${esc(j.id)}"><button class="rec-play" data-main="${esc(j.id)}"><span class="t">${esc(j.name)}</span><small class="dl-sub">${esc(dlSub(j))}</small>${done ? '' : `<span class="dl-bar"><i style="width:${pctOf(j)}%"></i></span>`}</button>${done ? '' : `<button class="icon-btn" data-tg="${esc(j.id)}" aria-label="${tg[1]}">${icon(tg[0])}</button>`}<button class="icon-btn" data-del="${esc(j.id)}" aria-label="Sil">${icon('trash')}</button></div>`;
      };
      const info = () => {
        const el = $('#dl-info', box);
        if (el) el.textContent = `İndirilenler: ${fmtBytes(stat.used)} · Boş alan: ${fmtBytes(stat.free)}`;
      };
      const draw = () => {
        if (!box.isConnected) return;
        const list = jobs();
        const sum = summary(list);
        shape = shapeOf();
        const bulk = sum.active ? '<button class="btn sm ghost" id="dl-pall">Tümünü duraklat</button>' : sum.paused || sum.failed ? '<button class="btn sm ghost" id="dl-rall">Tümünü sürdür</button>' : '';
        box.innerHTML = `<div class="dl-head"><button class="chk${dlWifi() ? ' on' : ''}" id="dl-wifi" role="switch" aria-checked="${dlWifi()}"><i>${icon('check')}</i><span class="t">Yalnız Wi-Fi’de indir<small>Yeni indirmeler için</small></span></button><button class="chk${dlFast() ? ' on' : ''}" id="dl-fast" role="switch" aria-checked="${dlFast()}"><i>${icon('check')}</i><span class="t">Hızlı indirme<small>Birkaç bağlantıyla; yeni indirmeler için</small></span></button>${bulk}</div>${list.length ? list.map(rowHtml).join('') : '<p class="hint">Henüz indirme yok. Bir film ya da dizi bölümünün sayfasındaki “İndir” ile çevrimdışı izlemek üzere indirin.</p>'}<p class="rec-info" id="dl-info"></p><p class="rec-info">${esc(DL_TOS)}</p>`;
        info();
      };
      // İlerleme olayı: satır sayısı/durumu aynıysa yalnız metin ve çubuk güncellenir (odak bozulmaz)
      watchDl(box, (e) => {
        if (shapeOf() !== shape) return draw();
        const j = e && e.id && DL.get(e.id);
        const row = j && box.querySelector(`[data-row="${CSS.escape(j.id)}"]`);
        if (!row) return;
        $('.dl-sub', row).textContent = dlSub(j);
        const bar = $('.dl-bar i', row);
        if (bar) bar.style.width = pctOf(j) + '%';
      });
      body.addEventListener('click', (e) => {
        if (e.target.closest('#dl-wifi')) {
          store.setPref('dl.wifi', !dlWifi());
          return draw();
        }
        if (e.target.closest('#dl-fast')) {
          store.setPref('dl.fast', !dlFast());
          if (dlFast()) toast('Sağlayıcınız aynı anda tek bağlantıya izin veriyorsa canlı yayın kesilebilir', 4500);
          return draw();
        }
        if (e.target.closest('#dl-pall')) return void engine.dl.pauseAll().catch(() => {});
        if (e.target.closest('#dl-rall')) return void engine.dl.resumeAll(true).catch(() => {});
        const del = e.target.closest('[data-del]');
        if (del) return deleteDownloadSheet(DL.get(del.dataset.del));
        const tg = e.target.closest('[data-tg]');
        const main = e.target.closest('[data-main]');
        const j = tg || main ? DL.get(tg ? tg.dataset.tg : main.dataset.main) : null;
        if (!j) return;
        if (j.state === 'done') {
          if (main) {
            sh.close();
            playDownload(j);
          }
          return;
        }
        if (isActive(j)) engine.dl.pause(j.id).catch(() => {});
        else engine.dl.resume(j.id).catch(() => {});
      });
      dlLoad()
        .then((r) => {
          stat = { free: (r && r.freeBytes) || 0, used: (r && r.usedBytes) || 0 };
          draw();
          engine.dl.resumeAll(false).catch(() => {}); // Wi-Fi gelmiş olabilir: bekleyenler yeniden denenir
        })
        .catch(() => {
          box.innerHTML = '<p class="err-text">İndirilenler okunamadı</p>';
        });
    },
  });
}

function deleteDownloadSheet(j) {
  if (!j) return;
  const sh = openSheet({
    title: 'İndirmeyi sil',
    html: `<p>“${esc(j.name)}” ${isActive(j) || j.state === 'paused' ? 'indirmesi iptal edilip' : 'cihazdan'} silinecek.</p><div style="display:flex;gap:8px"><button class="btn danger" id="dd-yes">Sil</button><button class="btn ghost" id="dd-no">Vazgeç</button></div>`,
    mount: (body) => {
      $('#dd-no', body).addEventListener('click', () => sh.close());
      $('#dd-yes', body).addEventListener('click', async () => {
        sh.close();
        try {
          await engine.dl.remove(j.id);
          toast('İndirme silindi', 1800);
        } catch (err) {
          toast(String((err && err.message) || 'Silinemedi'), 3000);
        }
      });
    },
  });
}

// Planlananlar: bekleyen hatırlatıcılar ve zamanlı kayıtlar; izin durumu ve kaldırma burada.
function plansSheet() {
  const sh = openSheet({
    full: true, // TV'de tam sayfa
    title: 'Planlananlar',
    html: '<div id="pl-body"><p class="set-note">Yükleniyor…</p></div>',
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
        const warn = needs.length ? setCard('İzinler', 'bell', [`<div class="pl-warn"><p>${needs.map(esc).join(' ')}</p><button class="btn sm" data-a="perm" type="button">İzni aç</button></div>`]) : '';
        const rows = list.map((x) => {
          const fired = x.at <= now;
          const what = x.kind === 'rec' ? (fired ? 'Kayıt sürüyor ya da bitti' : 'Zamanlı kayıt') : fired ? 'Hatırlatıldı' : 'Hatırlatıcı';
          return `<div class="rec-row pl-row${fired ? ' on' : ''}"><button class="rec-play" data-open="${esc(x.id)}"><span class="t">${icon(x.kind === 'rec' ? 'rec' : 'bell')}${esc(x.title)}</span><small>${esc(x.chName)} · ${esc(planWhen(x, now))} · ${what}</small></button><button class="icon-btn" data-del="${esc(x.id)}" aria-label="Kaldır">${icon('trash')}</button></div>`;
        });
        const list2 = rows.length ? setCard('Bekleyen planlar', 'timer', rows) : setCard('Bekleyen planlar', 'timer', [noteRow('Henüz plan yok. TV Rehberi’nde bir programa dokunup “Hatırlat” ya da “Kaydet”i seçin; Spor’da maç satırındaki zile dokunarak maç hatırlatıcısı kurabilirsiniz.')]);
        const note = nativePlugin ? '' : noteRow('Tarayıcıda hatırlatıcılar yalnız sayfa açıkken çalışır; zamanlı kayıt Android uygulamasındadır.');
        box.innerHTML = `${warn}${list2}${note}`;
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
    full: true, // TV'de tam sayfa
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

async function saveMovieCatalogFile() {
  const catalog = S.rawCat || S.cat;
  const sourceMovies = Array.isArray(catalog && catalog.movies) ? catalog.movies : [];
  const movies = sourceMovies.map((item, index) => {
    const title = String(item && (item.name || item.title) || '').trim();
    const embeddedYear = title.match(/(?:\((?:19|20)\d{2}\)|\|\s*(?:19|20)\d{2})\s*$/);
    const yearValue = Number(item && item.year) || (embeddedYear ? Number(embeddedYear[0].match(/\d{4}/)[0]) : 0);
    const providerRating = Number(item && item.rating);
    return {
      recordNumber: index + 1,
      title,
      originalTitle: String(item && (item.original_name || item.original_title || item.originalTitle) || '').trim() || null,
      year: yearValue || null,
      category: String(item && item.group || '').trim() || null,
      providerRating: Number.isFinite(providerRating) && providerRating > 0 ? providerRating : null,
    };
  }).filter((item) => item.title);

  if (!movies.length) {
    toast('Film kataloğu bulunamadı. Önce film listesini yükleyin.', 3500);
    return;
  }

  const payload = {
    format: 'iptv-player-movie-catalog',
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceType: S.source && S.source.type === 'xtream' ? 'xtream' : 'm3u',
    movieCount: movies.length,
    notes: {
      providerRating: 'IPTV sağlayıcısının gönderdiği ham puandır; IMDb puanı olarak değerlendirilmemelidir.',
      privacy: 'Kullanıcı adı, parola, sunucu adresi, yayın URLsi, poster URLsi ve stream ID dışa aktarılmaz.',
    },
    movies,
  };
  const text = JSON.stringify(payload, null, 2);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = 'film-katalogu-' + stamp + '.json';

  if (nativePlugin) {
    const result = await nativePlugin.saveText({ name, text, mime: 'application/json' });
    toast('Film kataloğu kaydedildi: ' + ((result && result.where) || 'cihaz'), 4000);
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(movies.length + ' film kaydı dışa aktarıldı.', 3500);
}

// ---- Profiller: her aile üyesinin kendi favorileri, son izlenenleri ve kaldığı yeri (store.js). Kaynaklar ve ayarlar ortaktır.
// Profil değişince uygulama yeniden yüklenir: bellekteki bütün listeler yeni profile göre baştan kurulur.
function profilesSheet() {
  const cur = store.profileId();
  const list = store.profiles();
  const full = list.length >= store.MAX_PROFILES;
  const sh = openSheet({
    title: 'Profiller',
    html:
      noteRow('Her profilin favorileri, izleme listesi ve kaldığı yer ayrıdır. Kaynaklar ve ayarlar ortaktır.') +
      setCard('Profiller', 'users', list.map((p) => `<div class="prof-row${p.id === cur ? ' on' : ''}"><button class="prof-pick" data-pick="${esc(p.id)}"><i class="prof-av" style="--h:${hueOf(p.name)}">${esc(p.name.slice(0, 1).toUpperCase())}</i><span>${esc(p.name)}<small>${p.id === cur ? 'Etkin profil' : 'Geçmek için dokun'}</small></span></button><button class="icon-btn" data-ren="${esc(p.id)}" aria-label="Adını değiştir">${icon('sliders')}</button>${p.id ? `<button class="icon-btn" data-del="${esc(p.id)}" aria-label="Profili sil">${icon('trash')}</button>` : ''}</div>`)) +
      (full ? noteRow(`En çok ${store.MAX_PROFILES} profil olabilir.`) : `<button class="btn" id="prof-add" type="button">${icon('plus')} Profil ekle</button>`),
    mount: (body) => {
      body.addEventListener('click', (e) => {
        const pick = e.target.closest('[data-pick]');
        const ren = e.target.closest('[data-ren]');
        const del = e.target.closest('[data-del]');
        if (e.target.closest('#prof-add')) {
          if (!needPro('profiles')) return;
          sh.close();
          return profileNameSheet(null);
        }
        if (ren) {
          sh.close();
          return profileNameSheet(list.find((p) => p.id === ren.dataset.ren));
        }
        if (del) {
          const p = list.find((x) => x.id === del.dataset.del);
          if (del.dataset.sure !== '1') {
            del.dataset.sure = '1';
            return toast(`“${p.name}” ve kayıtları silinecek. Silmek için çöp kutusuna yeniden dokunun.`, 3500);
          }
          const wasActive = p.id === cur;
          store.removeProfile(p.id);
          sh.close();
          if (wasActive) return location.reload();
          return profilesSheet();
        }
        if (pick && pick.dataset.pick !== cur) {
          if (pick.dataset.pick && !needPro('profiles')) return;
          store.setProfile(pick.dataset.pick);
          location.reload();
        }
      });
    },
  });
  return sh;
}
// Profil adı: p verilirse ad değişir, verilmezse yeni profil eklenir.
function profileNameSheet(p) {
  const sh = openSheet({
    title: p ? 'Profil adı' : 'Yeni profil',
    html: `<form id="prof-f" autocomplete="off">${setCard('Profil', 'users', [`<label class="field"><span>Ad</span><input name="name" maxlength="24" value="${p ? esc(p.name) : ''}" placeholder="Örn. Elif" data-autofocus></label>`])}<button class="btn primary" type="submit">${p ? 'Kaydet' : 'Ekle'}</button></form>`,
    mount: (body) => {
      $('#prof-f', body).addEventListener('submit', (e) => {
        e.preventDefault();
        const name = e.target.elements.name.value;
        const saved = store.saveProfile({ id: p ? p.id : null, name });
        if (!saved) return toast(name.trim() ? `En çok ${store.MAX_PROFILES} profil olabilir` : 'Bir ad yazın');
        sh.close();
        renderTab();
        profilesSheet();
      });
    },
  });
  return sh;
}

// ---- Üyelik ekranları ----
// Üyelik sayfası: durum, iki yıllık plan ve Pro özellikleri. feature verilirse (kilitli özelliğe dokunuldu) en üstte o özellik anılır.
// Satın alma düğmeleri Google Play faturalandırması bağlanana kadar kapalıdır.
function memberSheet(feature = '') {
  const st = memState();
  const f = proFeature(feature);
  const admin = store.pref('adm.on', false);
  const other = !!BIND_URL && !!(memBind() && memBind().other); // abonelik başka cihaza bağlı: yeniden satın almak yerine taşıma sunulur
  const buy = (tier, label) => (other ? '' : `<button class="btn${tier === 'pro' ? ' primary' : ''}" data-buy="${tier}"${BILLING_READY ? '' : ' disabled'}>${label}</button>`);
  const sh = openSheet({
    full: true, // TV'de tam sayfa
    title: 'Üyelik',
    html:
      (f ? `<p class="mem-need">${icon('lock')}<span><b>${esc(f.name)}</b> Pro üyelikle açılır.</span></p>` : '') +
      (other ? `<div class="mem-other"><b>Bu üyelik başka bir cihazda kullanılıyor</b><span>Üyelik aynı anda bir telefonda ve bir TV’de kullanılabilir. Burada kullanmak için üyeliği bu cihaza taşıyın; diğer cihazda kapanır. Ayda en çok 2 kez taşınabilir.</span><button class="btn primary" data-take>Bu cihazı kullan</button></div>` : '') +
      `<div class="mem-st mem-${st.tier}"><b>${esc(memOn() ? TIERS[st.tier] : 'Tüm özellikler açık')}</b><span>${esc(memOn() ? stateText(st) : 'Üyelik sistemi henüz devrede değil')}</span></div>` +
      `<div class="mem-plan"><h4>Standart <small>yıllık</small></h4><p class="hint">Canlı TV, film ve dizi, favoriler, TV rehberi ve tek kaynak. ${TRIAL_DAYS} günlük deneme bittikten sonra uygulamayı kullanmak için gerekir.</p><p class="mem-price" data-price="standard"></p>${st.tier === 'standard' || st.tier === 'pro' ? '<p class="mem-have">Üyeliğiniz var</p>' : buy('standard', 'Standart üyelik al')}</div>` +
      `<div class="mem-plan mem-pro"><h4>Pro <small>yıllık</small></h4><p class="hint">Standart üyeliğin her şeyi ve aşağıdaki özellikler.</p><p class="mem-price" data-price="pro"></p><ul class="mem-feats">${PRO_FEATURES.map((x) => `<li${f && f.id === x.id ? ' class="on"' : ''}><b>${esc(x.name)}</b><small>${esc(x.desc)}</small></li>`).join('')}</ul>${st.tier === 'pro' ? '<p class="mem-have">Pro üyeliğiniz var</p>' : buy('pro', 'Pro üyelik al')}</div>` +
      (BILLING_READY
        ? noteRow(`Abonelik yıllık yenilenir. Google Play'de Abonelikler bölümünden istediğiniz zaman iptal edebilirsiniz; iptal edince dönem sonuna kadar kullanırsınız.${BIND_URL ? ' Üyelik aynı anda bir telefonda ve bir TV’de kullanılabilir; yeni cihaza geçince üyeliği Üyelik penceresinden taşıyabilirsiniz (ayda en çok 2 kez).' : ''}`) + (st.play ? '<button class="btn" data-manage type="button">Aboneliği yönet</button>' : '')
        : noteRow('Satın alma, uygulamanın Google Play sürümüyle açılacak.')) +
      (BILLING_READY || admin
        ? setCard('Cihaz', 'info', [
            BILLING_READY ? btnRow('mem-devc', 'Cihaz kimliği', fmtDeviceId(deviceId(store)), 'Kopyala', 'mem-dev') : '',
            BILLING_READY ? noteRow('Destek ya da hediye üyelik için bu kimliği iletin; hediye üyelik bu pencere açılınca ya da uygulama açılınca kendiliğinden gelir.') : '',
            admin ? selRow('mem-pv', 'Önizleme (yönetici)', 'Kilitli hâli yalnız bu cihazda dener; diğer kullanıcılar etkilenmez', optionsHtml(PREVIEWS, memPreview()), true) : '',
          ])
        : ''),
    mount: (body) => {
      const dc = $('#mem-devc', body);
      if (dc) dc.addEventListener('click', async () => toast((await copyText(fmtDeviceId(deviceId(store)))) ? 'Cihaz kimliği kopyalandı' : 'Kopyalanamadı'));
      refreshRemoteConfig({ force: true }).then((g) => g && sh.close()); // pencere açılınca hediye üyelik hemen sorulur
      if (BILLING_READY && nativePlugin) {
        // Fiyatlar ve deneme teklifi Play'den gelir (bölgeye göre para birimi); gelmezse düğmeler yine de dener.
        nativePlugin.billingProducts({ ids: PRODUCT_IDS }).then((r) => {
          for (const tier of ['standard', 'pro']) {
            const p = ((r && r.products) || []).find((x) => x.id === PLAY_PRODUCTS[tier]);
            const el = $(`[data-price="${tier}"]`, body);
            if (p && el) el.textContent = offerText(p);
          }
        }).catch(() => {});
        body.addEventListener('click', async (e) => {
          const take = e.target.closest('[data-take]');
          if (take) {
            take.disabled = true;
            await takeOverFlow(() => {
              sh.close();
              renderTab();
            });
            take.disabled = false;
            return;
          }
          const manage = e.target.closest('[data-manage]');
          if (manage) return nativePlugin.billingManage().catch((err) => toast(String((err && err.message) || err)));
          const b = e.target.closest('[data-buy]');
          if (!b || b.disabled) return;
          b.disabled = true;
          try {
            const r = await nativePlugin.billingBuy({ id: PLAY_PRODUCTS[b.dataset.buy] });
            if (r && r.result === 'pending') toast('Ödemeniz onay bekliyor; onaylanınca üyeliğiniz açılır');
            else if (r && r.result === 'canceled') toast('Satın alma iptal edildi');
            await syncBilling();
            if (r && (r.result === 'purchased' || r.result === 'owned')) {
              toast('Üyeliğiniz etkin');
              sh.close();
              if (memOn() && memState().tier !== 'expired') renderTab();
            }
          } catch (err) {
            toast(String((err && err.message) || err));
          } finally {
            b.disabled = false;
          }
        });
      }
      const pv = $('#mem-pv', body);
      if (pv) {
        pv.addEventListener('change', () => {
          store.setPref('mem.preview', normalizePreview(pv.value));
          sh.close();
          applyTheme(themeAllowed(store.pref('set.theme', DEFAULT_THEME)));
          renderTab();
          toast(memOn() ? `Üyelik önizlemesi: ${PREVIEWS.find(([k]) => k === memPreview())[1]}` : 'Üyelik önizlemesi kapandı');
        });
      }
    },
  });
  return sh;
}

// Deneme bitti ve üyelik yok: sekmelerin yerinde bu ekran durur.
function renderPaywall(v) {
  const other = !!BIND_URL && !!(memBind() && memBind().other); // üyelik var ama başka cihaza bağlı
  v.innerHTML = other
    ? `<div class="page mem-wall">${icon('lock')}<h2>Üyelik başka bir cihazda</h2><p>Bu üyelik şu an başka bir cihazda kullanılıyor. Üyelik aynı anda bir telefonda ve bir TV’de kullanılabilir. Burada kullanmak için üyeliği bu cihaza taşıyın; diğer cihazda kapanır. Ayda en çok 2 kez taşınabilir.</p><button class="btn primary" id="mw-take" data-autofocus>Bu cihazı kullan</button><button class="btn ghost" id="mw-open">Üyelik seçenekleri</button></div>`
    : `<div class="page mem-wall">${icon('lock')}<h2>Deneme süreniz doldu</h2><p>Iptv Player Pro’yu kullanmaya devam etmek için yıllık üyelik gerekir. Kaynaklarınız, favorileriniz ve ayarlarınız duruyor.</p><button class="btn primary" id="mw-open" data-autofocus>Üyelik seçenekleri</button></div>`;
  v.onclick = async (e) => {
    if (e.target.closest('#mw-open')) return memberSheet();
    const t = e.target.closest('#mw-take');
    if (!t) return;
    t.disabled = true;
    await takeOverFlow(() => renderTab());
    t.disabled = false;
  };
}

function backupSheet() {
  if (!needPro('backup')) return;
  const sh = openSheet({
    title: 'Yedekle / geri yükle',
    html:
      noteRow('Kaynaklar (kullanıcı adı ve parola dahil), favoriler, kategori düzeni, izleme geçmişi ve ayarlar tek dosyaya kaydedilir. Dosyayı başkasıyla paylaşmayın. Uygulama şifresi ve dosyadan eklenen listeler yedeğe girmez.') +
      setCard('Dışa aktar', 'dl', [
        btnRow('bk-save', 'Yedeği kaydet', 'Tüm kaynak, favori ve ayarlar tek dosyada', 'Kaydet'),
        btnRow('bk-movies', 'Film kataloğunu dışa aktar', 'Yalnızca film bilgileri; hesap bilgileri ve yayın adresleri eklenmez', 'Aktar'),
      ]) +
      (nativePlugin && !isTvUi()
        ? setCard('TV ile eşitle', 'refresh', [
            btnRow('bk-sync', 'Şimdi eşitle', 'Aynı Wi‑Fi’deki TV ile kaynak, favori (silmeler dahil), izleme ilerlemesi ve kategori düzenini karşılıklı eşitler. Favori ve ilerlemede en yeni değişiklik geçerli olur', 'Eşitle'),
            `<button class="chk${store.pref('sync.auto', true) !== false ? ' on' : ''}" id="bk-auto" role="switch" aria-checked="${store.pref('sync.auto', true) !== false}"><i>${icon('check')}</i><span class="t">Kendiliğinden eşitle<small>Uygulama açılınca ve öne gelince, eşleşmiş TV aynı ağdaysa sessizce eşitler</small></span></button>`,
          ])
        : '') +
      setCard('Geri yükle', 'history', [
        `<label class="field"><span>Yedek dosyası</span><input id="bk-file" type="file" accept=".json,application/json"><small>Daha önce kaydettiğiniz yedek dosyasını seçin.</small></label>`,
        '<div class="bk-sum" id="bk-sum"></div>',
      ]),
    mount: (body) => {
      const autoBtn = $('#bk-auto', body);
      if (autoBtn) {
        autoBtn.addEventListener('click', () => {
          const on = store.pref('sync.auto', true) === false;
          store.setPref('sync.auto', on);
          autoBtn.classList.toggle('on', on);
          autoBtn.setAttribute('aria-checked', String(on));
          if (on) castUi.autoSync({ force: true });
        });
      }
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
      $('#bk-movies', body).addEventListener('click', async () => {
        try {
          await saveMovieCatalogFile();
        } catch (err) {
          toast('Film kataloğu dışa aktarılamadı: ' + String((err && err.message) || err), 4000);
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
  // Telefon kumandası: oynatıcı denetimleri ve yön tuşları (sayfa içinde gezinme)
  remoteExt: () => pui.remote.ext(),
  remoteCmd: (c) => (c.a === 'key' ? dpad.sendKey(REMOTE_KEYS[c.v]) : pui.remote.cmd(c)),
  guard: () => backupGuard(),
  busy: () => pui.isOpen(),
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
  rerenderKeepingList();
}

function castItem(item, ep, { startMs = 0, ctx = null, closePlayer = false } = {}) {
  if (!needPro('cast')) return;
  const targets = targetsOf(item, ep);
  if (!targets.length) return toast('Bu içerik için oynatma adresi bulunamadı');
  if (item.kind !== 'recording') store.pushRecent(sid(), item);
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
const pinCheckOf = (recKey, failKey) => async (pin) => {
  const st = store.pref(failKey, emptyFail());
  const w = waitMs(st);
  if (w > 0) return { ok: false, msg: `Çok fazla yanlış deneme. ${fmtWait(w)} sonra deneyin.` };
  if (await checkPin(pin, store.pref(recKey, null))) {
    store.setPref(failKey, emptyFail());
    return { ok: true };
  }
  const next = registerFail(st);
  store.setPref(failKey, next);
  const w2 = waitMs(next);
  return { ok: false, msg: w2 > 0 ? `Çok fazla yanlış deneme. ${fmtWait(w2)} sonra deneyin.` : `Yanlış şifre (${5 - (next.n % 5)} deneme hakkı kaldı)` };
};
const pinCheck = pinCheckOf('lock.pin', 'lock.fail');
const kidPinCheck = pinCheckOf('kid.pin', 'kid.fail'); // çocuk modu şifresi uygulama şifresinden ayrıdır

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

// ------------------------------------------------------------------ çocuk profili

// Çocuk-modu şifresi: iki kez girilir. Kaydedildiyse true.
async function createKidPin() {
  const a = await pad.prompt({ title: 'Çocuk modu şifresi', hint: `Çocuk modundan çıkmak için ${MIN_LEN}–6 rakamlı bir şifre belirleyin, sonra ✓`, check: (p) => (isValidPin(p) ? { ok: true } : { ok: false, msg: `En az ${MIN_LEN} rakam girin` }) });
  if (a == null) return false;
  const b = await pad.prompt({ title: 'Şifreyi tekrar girin', hint: 'Aynı şifreyi yeniden yazın, sonra ✓', check: (p) => (p === a ? { ok: true } : { ok: false, msg: 'Şifreler uyuşmuyor, yeniden deneyin' }) });
  if (b == null) return false;
  store.setPref('kid.pin', await makeRecord(a));
  store.setPref('kid.fail', emptyFail());
  return true;
}

const askKidPin = (title, hint) => pad.prompt({ title, hint, len: (kidPinRec() || {}).len, cancelable: true, check: kidPinCheck }).then((p) => p != null);

// Çocuk modunun ekran kabuğu: Ayarlar sekmesi "Çıkış" olur, izinli içeriği olmayan türlerin sekmeleri kalkar.
function renderKidChrome() {
  const on = kidActive();
  document.body.classList.toggle('kid-mode', on);
  const t = $('#tabs [data-tab=sources]');
  if (t) {
    t.querySelector('span').textContent = on ? 'Çıkış' : 'Ayarlar';
    t.querySelector('use').setAttribute('href', on ? '#i-lock' : '#i-gear');
  }
  for (const [tab, kind] of Object.entries(TAB_KIND)) {
    const b = $(`#tabs [data-tab=${tab}]`);
    if (b) b.hidden = on && !(S.cat && (S.cat[CAT_KEY[kind]] || []).length);
  }
}

// Çocuk modunu açar/kapatır: katalog yeniden süzülür, ana ekrana dönülür.
function applyKidMode(go = 'home') {
  if (S.rawCat) setCatalog(S.rawCat);
  renderKidChrome();
  clearGroupState();
  setTab(go);
}

async function kidEnter() {
  if (!S.source) return toast('Önce bir kaynak ekleyin');
  if (!hasAllowed(kidAllow(), sid())) return toast('Önce en az bir kategori seçin');
  if (!(kidPinRec() && kidPinRec().hash) && !(await createKidPin())) return;
  store.setPref('kid.on', true);
  if (pui.isOpen()) pui.close();
  applyKidMode('home');
  toast('Çocuk modu açık', 2500);
}

async function kidExit() {
  if (!(await askKidPin('Çocuk modundan çık', 'Çıkmak için çocuk modu şifresini girin'))) return;
  store.setPref('kid.on', false);
  applyKidMode('sources');
  toast('Çocuk modundan çıkıldı', 2500);
}

// Bir türün izinli kategorilerini seçtirir (etkin kaynak için).
function kidGroups(kind, title, done) {
  const src = S.source;
  const raw = (S.rawCat || S.cat)[CAT_KEY[kind]] || [];
  const groups = groupList(raw).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const LIMIT = 300;
  openSheet({
    title: `${title}: izinli kategoriler`,
    html: `<section class="set-card kg-tools"><div class="sel-row"><input id="kg-q" type="search" placeholder="Kategori ara…" autocomplete="off" aria-label="Kategori ara"></div><div class="sel-row kg-btns"><button class="btn ghost sm" id="kg-all" type="button">Görünenlerin hepsini seç</button><button class="btn ghost sm" id="kg-none" type="button">Hiçbirini seçme</button></div></section><section class="set-card" id="kg-list"></section>`,
    mount: (body) => {
      const list = $('#kg-list', body);
      const q = $('#kg-q', body);
      let shown = [];
      const draw = () => {
        const f = fold(q.value);
        const all = groups.filter((g) => !f || fold(g.name).includes(f));
        shown = all.slice(0, LIMIT);
        const on = allowSet(kidAllow(), src.id, kind);
        list.innerHTML =
          (shown.map((g, i) => `<button class="chk${on.has(g.name) ? ' on' : ''}" data-i="${i}" role="switch" aria-checked="${on.has(g.name)}"><i>${icon('check')}</i><span class="t">${esc(g.name)}<small>${g.count} öğe</small></span></button>`).join('') || '<div class="empty">Kategori yok</div>') +
          (all.length > LIMIT ? `<p class="set-note">${all.length - LIMIT} kategori daha var; aramayla daraltın.</p>` : '');
      };
      const save = (names) => {
        store.setPref('kid.allow', setAllowed(kidAllow(), src.id, kind, names));
        draw();
        if (done) done();
      };
      list.addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        const g = b && shown[Number(b.dataset.i)];
        if (!g) return;
        store.setPref('kid.allow', toggleAllowed(kidAllow(), src.id, kind, g.name));
        b.classList.toggle('on');
        b.setAttribute('aria-checked', String(b.classList.contains('on')));
        if (done) done();
      });
      $('#kg-all', body).addEventListener('click', () => save([...new Set([...allowSet(kidAllow(), src.id, kind), ...shown.map((g) => g.name)])]));
      $('#kg-none', body).addEventListener('click', () => save([]));
      q.addEventListener('input', debounce(draw, 120));
      draw();
    },
  });
}

function kidSheet() {
  if (!S.source) return toast('Önce bir kaynak ekleyin');
  if (!kidActive() && !needPro('kid')) return;
  const sh = openSheet({
    full: true, // TV'de tam sayfa
    title: 'Çocuk profili',
    html: '<div id="kd-body"></div>',
    mount: (body) => {
      const box = $('#kd-body', body);
      const draw = () => {
        const allow = kidAllow();
        const hasPin = !!(kidPinRec() && kidPinRec().hash);
        const rows = KID_KINDS.map(([k, t]) => {
          const n = countAllowed(allow, sid(), k);
          return `<button class="list-item" data-kind="${k}"><span class="t">${t}<small>${n ? `${n} kategori izinli` : 'Hiçbiri izinli değil'}</small></span><i class="chev">${icon('chev-r')}</i></button>`;
        });
        box.innerHTML =
          noteRow(`Çocuk moduna geçince yalnız seçtiğiniz kategoriler görünür; ayarlar, kaynaklar ve diğer içerikler gizlenir. Çıkmak için ayrı bir çocuk modu şifresi gerekir. Seçimler “${esc(S.source.name)}” kaynağı içindir; başka kaynak için o kaynağı seçip buraya yeniden gelin.`) +
          setCard('İzinli kategoriler', 'list', rows) +
          setCard('Şifre', 'lock', [`<button class="list-item" id="kd-pin"><span class="t">${hasPin ? 'Çocuk modu şifresini değiştir' : 'Çocuk modu şifresi belirle'}<small>${hasPin ? 'Önce mevcut şifre sorulur' : 'Çocuk modundan çıkmak için gerekir; uygulama şifresinden ayrıdır'}</small></span><i class="chev">${icon('chev-r')}</i></button>`]) +
          `<div class="set-actions"><button class="btn primary" id="kd-go" type="button">${icon('lock')}Çocuk moduna geç</button>${hasPin || hasAllowed(allow, sid()) ? '<button class="btn ghost sm" id="kd-reset" type="button">Çocuk profilini sıfırla</button>' : ''}</div>`;
      };
      box.addEventListener('click', async (e) => {
        const k = e.target.closest('[data-kind]');
        if (k) return kidGroups(k.dataset.kind, KID_KINDS.find(([x]) => x === k.dataset.kind)[1], draw);
        if (e.target.closest('#kd-pin')) {
          const had = !!(kidPinRec() && kidPinRec().hash);
          if (had && !(await askKidPin('Çocuk modu şifresi', 'Önce mevcut çocuk modu şifresini girin'))) return;
          if (await createKidPin()) toast('Çocuk modu şifresi kaydedildi', 2500);
          return draw();
        }
        if (e.target.closest('#kd-reset')) {
          if (kidPinRec() && kidPinRec().hash && !(await askKidPin('Çocuk profilini sıfırla', 'Çocuk modu şifresini girin'))) return;
          store.setPref('kid.allow', {});
          store.setPref('kid.pin', null);
          store.setPref('kid.fail', emptyFail());
          store.setPref('kid.on', false);
          toast('Çocuk profili sıfırlandı', 2500);
          return draw();
        }
        if (e.target.closest('#kd-go')) {
          if (!hasAllowed(kidAllow(), sid())) return toast('Önce en az bir kategori seçin');
          sh.close();
          kidEnter();
        }
      });
      draw();
    },
  });
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

// Ana ekran bölümlerinin sırası: bölümler yukarı/aşağı ya da en üste taşınır; ana ekran bir sonraki açılışta (ya da şu an açıksa hemen) yeni sırayla çizilir.
function homeOrderSheet() {
  const order = () => normalizeOrder(store.pref('set.homeOrder', []));
  openSheet({
    title: 'Ana ekran bölüm sırası',
    html: '<p class="hint">Bölümleri yukarı, aşağı ya da en üste taşıyın. Bağlantı durumu ve alt bilgi her zaman en altta kalır.</p><div id="ho-list"></div><div class="ho-foot"><button class="btn ghost" id="ho-reset" type="button">Varsayılan sıra</button></div>',
    mount: (body) => {
      const box = $('#ho-list', body);
      const reset = $('#ho-reset', body);
      const draw = () => {
        box.innerHTML = order()
          .map((id, i) => `<div class="rec-row fo-row ho-row" data-id="${id}"><div class="rec-play"><span class="t">${i + 1}. ${esc(sectionLabel(id))}</span><small>${esc((HOME_SECTIONS.find((x) => x.id === id) || {}).hint || '')}</small></div><button class="act" data-m="top" aria-label="En üste al">${icon('top')}</button><button class="act" data-m="up" aria-label="Yukarı">${icon('up')}</button><button class="act" data-m="down" aria-label="Aşağı">${icon('down')}</button></div>`)
          .join('');
        reset.disabled = isDefaultOrder(order());
      };
      const save = (list) => {
        store.setPref('set.homeOrder', list);
        draw();
        if (S.tab === 'home') renderTab();
      };
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-m]');
        const row = b && b.closest('[data-id]');
        if (!row) return;
        save(moveSection(order(), row.dataset.id, b.dataset.m));
        const again = box.querySelector(`[data-id="${CSS.escape(row.dataset.id)}"] [data-m="${b.dataset.m}"]`);
        if (again && document.documentElement.classList.contains('kbd')) again.focus(); // kumandada odak taşınan satırın aynı düğmesinde kalır
      });
      reset.addEventListener('click', () => save([]));
      draw();
    },
  });
}

function lockSheet() {
  const on = lockEnabled();
  const sh = openSheet({
    title: 'Uygulama şifresi',
    html: on
      ? noteRow('Uygulama açılırken ve arka plandan dönünce şifre istenir. Kategorileri kilitlemek için Ayarlar yerine kategori listesinde “Düzenle”yi kullanın. Şifreyi unutursanız uygulama verilerini Android ayarlarından silmeniz gerekir.') +
        setCard('Şifre', 'lock', [
          selRow('lk-after', 'Şifre isteme zamanı', 'Arka plandan dönünce ne kadar sonra yeniden sorulsun', optionsHtml(AFTER_OPTIONS, normalizeAfter(store.pref('lock.after', DEFAULT_AFTER)))),
          btnRow('lk-change', 'Şifreyi değiştir', 'Önce mevcut şifre sorulur', 'Değiştir'),
          btnRow('lk-off', 'Şifreyi kaldır', 'Uygulama şifresiz açılır', 'Kaldır'),
        ])
      : noteRow(`Uygulamayı ve seçtiğiniz kategorileri (çocuk kilidi) şifreyle koruyun. Şifre ${MIN_LEN}–6 rakamdır. Şifreyi unutursanız uygulama verilerini Android ayarlarından silmeniz gerekir.`) +
        setCard('Şifre', 'lock', [btnRow('lk-on', 'Şifre belirle', `${MIN_LEN}–6 rakamlı uygulama şifresi`, 'Belirle')]),
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

$('#btn-source').addEventListener('click', () => !kidActive() && (store.sources().length ? sourceSwitcher() : sourceForm()));
$('#btn-refresh').addEventListener('click', () => refreshCatalog());
$('#btn-catedit').addEventListener('click', () => $('#cat-edit') && $('#cat-edit').click());
$('#btn-home').addEventListener('click', () => {
  const k = TAB_KIND[S.tab];
  if (k && S.group[k] != null) return leaveGroup(k); // tek geri oku: önce kategori listesine, sonra ana ekrana
  setTab('home');
});
// Yatay geniş ekranda canlı TV üç bölmeli olur; yön değişince yeniden kurulur.
const mqSplit = window.matchMedia('(orientation: landscape) and (min-width: 640px)');
S.split = mqSplit.matches;
// Oynatıcı telefonu yatay kilitler: kanal açınca ve kapatınca yön iki kez değişir. O sırada liste yeniden kurulursa
// açık kategori kapanır ve liste en üste döner. Bu yüzden S.split, görünümün en son hangi düzenle kurulduğunu tutar;
// düzen yalnız oynatıcı kapalıyken ve gerçekten farklıysa (kısa bir bekleme sonrası) yeniden kurulur, açık kategori korunur.
let orientTimer = 0;
function scheduleOrientation(ms = 350) {
  clearTimeout(orientTimer);
  orientTimer = setTimeout(applyOrientation, ms);
}
function applyOrientation() {
  if (pui.isOpen()) return; // oynatıcı kapanınca (onClose) yeniden denenir
  const now = mqSplit.matches;
  if (S.split === now) return; // dönüp aynı düzene geri geldi: dokunma
  S.split = now;
  if (S.source && S.tab === 'live') renderTab();
}
mqSplit.addEventListener('change', () => scheduleOrientation());
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
  castUi.autoSync();
  if (S.source && !S.loading && S.cat.fetchedAt && Date.now() - S.cat.fetchedAt > staleCatalogMs()) refreshCatalog({ quiet: true });
  checkForUpdate();
  refreshManaged();
  refreshRemoteConfig();
  syncBilling();
});
setInterval(() => document.visibilityState === 'visible' && castUi.autoSync(), 10 * 60 * 1000);
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
let lastTvUi = null;
function applyTvMode() {
  const on = resolveTv(store.pref('set.tvmode', DEFAULT_TV_MODE), tvDetected);
  dpad.setTv(on);
  if (lastTvUi !== null && lastTvUi !== isTvUi() && S.source && (S.tab === 'movies' || S.tab === 'series')) renderTab(); // TV kipi açılıp kapanınca vitrin ve kutu boyutu uyar
  lastTvUi = isTvUi();
  if (nativePlugin) nativePlugin.setTvMode({ on }).catch(() => {});
  layoutPreview();
}
applyTvMode();
// Android performans yöneticisi: cihaz profili her açılışta belirlenir, kullanıcı seçimi kalıcıdır.
function applyPerformanceProfile() {
  if (nativePlugin && nativePlugin.setPerformanceProfile) nativePlugin.setPerformanceProfile({ mode: store.pref('set.performance', 'auto') }).catch(() => toast('Performans profili uygulanamadı', 2500));
}
applyPerformanceProfile();
// Görüntü çözücü tercihi yerel oynatıcıya bildirilir (açılışta ve ayar değişince); açık yayın varsa yeniden kurulur.
function applyDecoder() {
  if (nativePlugin) nativePlugin.setDecoder({ mode: normalizeDecoder(store.pref('set.decoder', DEFAULT_DECODER)) }).catch(() => toast('Görüntü çözücü uygulanamadı', 2500));
}
applyDecoder();
// Yazılım ses çözücüsü: esas olan yerel durumdur (çökme sonrası kendiliğinden kapanmış olabilir); JS yalnız yansıtır, açılışta yerele geri yazmaz.
function syncSoftAudio() {
  if (!nativePlugin || !nativePlugin.getSoftAudio) return;
  nativePlugin.getSoftAudio().then((r) => {
    store.setPref('set.softAudio', r && r.on ? 'on' : 'off');
    store.setPref('set.softAudioCrashed', !!(r && r.crashed));
    store.setPref('set.softAudioInfo', r && r.crashed && r.info ? String(r.info) : '');
  }).catch(() => {});
}
syncSoftAudio();
function applyAutoFrameRate() {
  if (nativePlugin && nativePlugin.setAutoFrameRate) {
    nativePlugin.setAutoFrameRate({ on: !!store.pref('set.autoFrameRate', false) }).catch(() => toast('Otomatik kare hızı uygulanamadı', 2500));
  }
}
applyAutoFrameRate();
if (nativePlugin) {
  nativePlugin.isTv().then((r) => {
    tvDetected = tvDetected || !!(r && r.tv);
    applyTvMode();
    setTimeout(() => syncWatchNext(true), 4000);
    setTimeout(() => castUi.autoSync(), 6000); // telefonda: eşleşmiş TV aynı ağdaysa sessizce eşitle (TV'de işlem yapmaz)
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
  const launchPlan = (e) => {
    if (!e) return;
    const link = e.uri ? parseDeepLink(e.uri) : null;
    if (link) openDeepLink(link);
    else if (e.ch) openPlanChannel(e.ch, e.src);
  };
  nativePlugin.addListener('planLaunch', launchPlan).catch(() => {});
  setTimeout(() => nativePlugin.planLaunch().then(launchPlan).catch(() => {}), 1500);
}
setTimeout(syncPlans, 2500); // alarmları kayıtlı listeyle eşitle (yeniden başlatma, güncelleme sonrası)
// Yarım kalan indirmeler (süreç öldürülmüş ya da telefon yeniden başlamış) uygulama açılınca kaldığı yerden sürer
if (nativePlugin) setTimeout(() => dlLoad().then(() => engine.dl.resumeAll(false)).catch(() => {}), 2000);

initNav();
window.__iptv = { S, store, net, setVersion: (v) => (VERSION = v), checkForUpdate, restoreUpd, refreshManaged, watchExpiry }; // hata ayıklama ve uçtan uca testler için

// Önden indirme (yalnız Wi-Fi gibi ölçüsüz ağda, açılıştan sonra): favori, devam eden ve son eklenen filmlerin afişleri ile içerik uyarıları ve bugünün maçlarının
// takım simgeleri cihaza iner. Görseller yerel görsel önbelleğine, uyarılar her zamanki önbelleğe girer; ayrıntı sayfaları ve spor ekranı bunları bekletmeden gösterir.
const warm = nativePlugin && nativePlugin.warmImages ? createWarm({ native: nativePlugin, store, net }) : null;
async function warmAdvise(it) {
  const info = await loadVodInfo(S.source, net, it).catch(() => null);
  const { advisoryMeta } = await resolveAdvisoryMeta(it, info);
  await loadMovieAdvisories(net, store, advisoryMeta, it);
}
function warmStart(tries = 0) {
  if (!warm || !S.source || store.pref('set.warm', 'on') === 'off') return;
  const c = S.cat;
  if (!c || !(c.live.length + c.movies.length + c.series.length)) {
    if (tries < 4) setTimeout(() => warmStart(tries + 1), 20000); // liste henüz yüklenmediyse biraz sonra yeniden bak
    return;
  }
  const favs = store.favs(sid()).slice(0, 60).map((f) => ({ kind: f.kind, it: resolve(f, f.kind) })).filter((e) => e.it);
  const cont = homeContinue(store.continueWatching(sid()), (k, id) => S.idx[CAT_KEY[k]].get(id));
  const seen = new Set();
  const fresh = newestItems(visibleAll('movie'))
    .filter((it) => {
      const ct = cleanTitle(it.name, it.year);
      const k = `${ct.key}|${ct.year || ''}`;
      return !ct.key || (!seen.has(k) && !!seen.add(k));
    })
    .slice(0, 24)
    .map((it) => ({ kind: 'movie', it }));
  const entries = uniqueEntries(cont, favs, fresh);
  warm
    .run({ items: entries.map((e) => e.it), movies: entries.filter((e) => e.kind === 'movie').map((e) => e.it), advise: warmAdvise, busy: () => !!player && player.state().status !== 'idle' })
    .catch(() => {});
}

(async function boot() {
  await loadDist(nativePlugin); // Google Play sürümünde güncelleme/yönetici/davet kodu/FFmpeg yok: ilk ekran çizilmeden öğrenilir
  setBillingReady(isPlay()); // üyelik kilitleri ve satın alma yalnız Google Play sürümünde devrede; doğrudan APK tamamen açık
  syncBilling();
  if (lockEnabled()) lockApp(); // açılışta şifre ekranı
  const src = store.activeSource();
  if (!src) {
    // İlk açılış: doğrudan kaynak ekleme sayfası (Xtream / M3U bağlantısı / dosyadan).
    renderTop();
    S.tab = 'home';
    renderTab();
    finishIntro();
    return sourceForm();
  }
  setTimeout(() => checkForUpdate({ launch: true }), 2500); // açılışta yeni sürüm var mı bak; varsa üstte şerit çıkar
  setTimeout(() => refreshManaged({ launch: true }), 4000); // davet koduyla gelen listeler hâlâ geçerli mi
  setTimeout(() => refreshRemoteConfig({ launch: true }), 5000); // Pro temaların güncel listesi ve bu cihaza verilmiş hediye üyelik
  setTimeout(() => maybeWhatsNew(), 1800);
  await activate(src.id);
  setTimeout(() => warmStart(), 15000); // arayüz yerleştikten sonra, arka planda
})();
