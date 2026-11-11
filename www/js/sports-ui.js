// Spor (futbol) ekranı: gün/lig seçimi, maç listesi, canlı skor (dakikada bir tazelenir), maçın kanalına tek dokunuşla geçiş.
// Mantık sports.js'te; burada yalnız ekran var. Uygulama ilk açıldığında yüklenmez (ana ekrandan "Spor"a basınca yüklenir).
import { esc, fmtClock, fold } from './util.js';
import { $, icon, openPage } from './ui.js';
import { MATCH_LEADS, MATCH_LEAD_DEFAULT, leadLabel, matchPlanId, canRemind, makeMatchPlan } from './plan.js';
import {
  ESPN_BASE, leagueOf, loadMatches, matchRank, findProgram, slicePrograms, dayStrip, dayStart, dayLabel,
  matchesOnDay, sections, chipsFor, capSections, hasLive, noScore,
} from './sports.js';
import { LS_HOSTS, loadLiveScoreDay, mergeSources } from './sports-ls.js';
import { TV_HOSTS, loadTvDay, tvChannelsFor, channelsByName } from './sports-tv.js';
import { SCHED_BASES, loadSchedDay, seInfoFor, mergeSe } from './sports-se.js';
import { BADGE_HOST, badgeSearchUrl, pickBadge, sideLogo, logoHtml, nationFlags } from './sports-logos.js';

const CACHE_KEY = 'sports:v1'; // ESPN maçları
const LS_CACHE_KEY = 'sports-ls:v1'; // LiveScore gün listeleri
const LS_CACHE_DAYS = 5;
const BADGE_CACHE_KEY = 'sports-badges:v1'; // kulüp rozeti arama sonuçları (ad → adres ya da boş)
const BADGE_HIT_MS = 30 * 864e5; // bulunan rozet bu süre geçerli
const BADGE_MISS_MS = 3 * 864e5; // bulunamayan ad bu süre yeniden aranmaz
const BADGE_GAP_MS = 2200; // aramalar arası bekleme (ücretsiz anahtar dakikada ~30 istek)
const BADGE_BACKOFF_MS = 2 * 60e3; // hata/sınır aşımında bu süre aranmaz
const TV_CACHE_KEY = 'sports-tv:v3'; // yayın akışı (gün bazlı): hem takvim hem kanal bilgisi; yedek kaynak yalnız kanal
const TV_FRESH_MS = 3 * 3600e3; // yayın programı sık değişmez
const CACHE_MAX_AGE = 6 * 3600e3; // kayıtlı veri bundan eskiyse hiç gösterilmez
const FRESH_MS = 2 * 60e3; // bundan yeni veri yeniden indirilmez
const LS_FUTURE_MS = 30 * 60e3; // ileri günlerin LiveScore listesi bu süre yeni sayılır
const LS_LIVE_MS = 2 * 60e3; // canlı maç varken LiveScore günü en sık bu aralıkla yenilenir (gün yanıtı büyüktür)
const LIVE_REFRESH_MS = 60e3;
const EPG_BEFORE = 90 * 60000;
const EPG_AFTER = 20 * 60000;
const MAX_ROWS = 500;

// env: { net, store, toast, liveItems(): görünür canlı kanallar, epgBetween(from, to), play(items, index), reminders?: { list(), set(plan), remove(id) }, sourceId?(), base?, lsHosts?, tvHosts?, schedBases?, now? }
export function openSports(env) {
  const { net, store, toast, liveItems, epgBetween, play } = env;
  const rem = env.reminders || null; // maç hatırlatıcıları (plan listesi uygulamada tutulur)
  const base = env.base || ESPN_BASE;
  const lsHosts = env.lsHosts || LS_HOSTS;
  const tvHosts = env.tvHosts || TV_HOSTS;
  const badgeHost = env.badgeHost || BADGE_HOST;
  const schedBases = env.schedBases || SCHED_BASES;
  const now = env.now || (() => Date.now());

  let matches = []; // birleşik liste (ESPN + diğer kaynaklarda olup ESPN'de olmayanlar)
  let espn = [];
  const lsDays = new Map(); // gün → { at, matches } (LiveScore)
  const lsPending = new Map(); // gün → devam eden indirme
  let lsBusy = 0;
  let lsErr = '';
  let lsDetail = '';
  let espnErr = '';
  let espnDetail = '';
  const tvDays = new Map(); // gün → { at, src: 'se'|'tsdb', rows (Spor Ekranı) | events (TheSportsDB), seNote? }
  const tvPending = new Map();
  const tvFailAt = new Map(); // gün → son başarısız deneme (art arda denenmez)
  let tvErr = '';
  let tvDetail = '';
  let tvFor = new Map(); // maç kimliği → yayın listesindeki kanal adları
  let tvLogo = new Map(); // maç kimliği → { kanal adı (sadeleşmiş): logo adresi }
  const logoByName = new Map(); // kanal adı → listenizdeki karşılığının logosu
  const badges = new Map(); // takım adı (sadeleşmiş) → { u: rozet adresi | '', at }
  const badgeQ = []; // aranacak takım adları
  let badgeBusy = false;
  let badgePause = 0;
  let badgeSaveT = 0;
  let showDiag = false; // durum satırına dokununca teknik ayrıntı açılır
  let fetchedAt = 0;
  let failed = [];
  let err = '';
  let errDetail = '';
  let loading = false;
  let day = dayStart(now());
  let lg = '';
  let chan = new Map(); // maç kimliği → { item, p }
  let byId = new Map();
  let timer = 0;
  let firstPick = true;

  const page = openPage({
    title: 'Spor · Futbol',
    cls: 'sp-pg',
    html: `<div class="sp-top"><small id="sp-upd" aria-live="polite"></small><button class="icon-btn" id="sp-ref" aria-label="Skorları yenile">${icon('refresh')}</button></div>
      <div class="chips" id="sp-days" role="group" aria-label="Gün"></div>
      <div class="chips" id="sp-lgs" role="group" aria-label="Lig"></div>
      <div id="sp-list" class="sp-list"><div class="empty"><p>Maçlar yükleniyor…</p></div></div>`,
    mount: () => {},
  });
  const root = page.el;
  const q = (s) => $(s, root);

  // ---- kanal eşleştirme: TV rehberindeki program başlığından ----
  function matchChannels() {
    matchTv();
    chan = new Map();
    const items = liveItems() || [];
    byId = new Map(items.map((i) => [i.id, i]));
    const t0 = now();
    const upcoming = matches.filter((m) => m.state !== 'post' && !m.off);
    if (!upcoming.length || !byId.size) return;
    const from = Math.min(...upcoming.map((m) => m.t)) - EPG_BEFORE;
    const to = Math.max(...upcoming.map((m) => m.t)) + EPG_AFTER;
    let hits = [];
    try {
      hits = (epgBetween(Math.max(from, t0 - 6 * 3600e3), to) || []).filter((h) => byId.has(h.id));
    } catch {
      hits = [];
    }
    if (!hits.length) return;
    hits.sort((a, b) => a.p.s - b.p.s);
    for (const m of upcoming) {
      const found = findProgram(m, slicePrograms(hits, m.t - EPG_BEFORE, m.t + EPG_AFTER));
      if (found) chan.set(m.id, { item: byId.get(found.id), p: found.p });
    }
  }

  // ---- çizim ----
  const score = (m) => {
    if (m.home.score == null || m.away.score == null) return '';
    const pen = m.home.pen != null && m.away.pen != null && m.state === 'post' ? `<small> (${m.home.pen}-${m.away.pen})</small>` : '';
    return `<b class="sp-sc">${m.home.score} – ${m.away.score}${pen}</b>`;
  };
  const lgLine = (m) => [m.lgName || (leagueOf(m.lg) || {}).name || '', m.round].filter(Boolean).join(' · ');

  // Listenizde bu adla bulunan kanalın logosu (ad başına bir kez aranır)
  function playlistLogo(name) {
    if (!logoByName.has(name)) {
      let logo = '';
      try {
        const it = channelsByName(liveItems() || [], [name], 1)[0];
        logo = (it && it.logo) || '';
      } catch {
        logo = '';
      }
      logoByName.set(name, logo);
    }
    return logoByName.get(name);
  }

  // Sağdaki kutu: kanalın logosu (yoksa adı); bilgi yoksa "Yayın yok". Biten maçta kutu yok.
  function chBox(m) {
    if (m.state === 'post' || m.off) return '';
    const ch = chan.get(m.id);
    const names = tvFor.get(m.id) || [];
    let label = '';
    let logo = '';
    if (ch) {
      label = ch.item.name;
      logo = ch.item.logo || '';
    } else if (names.length) {
      label = names[0];
      logo = (tvLogo.get(m.id) || {})[fold(names[0])] || playlistLogo(names[0]);
    }
    if (!label) return '<div class="sp-cb none">Yayın yok</div>';
    const more = !ch && names.length > 1 ? `<small>+${names.length - 1}</small>` : '';
    const body = logo
      ? `<img src="${esc(logo)}" alt="${esc(label)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode(this.alt))">`
      : `<span>${esc(label)}</span>`;
    return `<div class="sp-cb" title="${esc(names.length ? names.join(', ') : label)}">${body}${more}</div>`;
  }

  // ---- takım simgeleri: bayrak (milli takım) / ESPN logosu / rozet araması ----
  const bkey = (name) => fold(name);
  // Rozet adresi; boyut eki: satırda '/tiny' (50px), ayrıntı başlığında '/small' (200px)
  const badgeOf = (name, size = 'tiny') => {
    const e = badges.get(bkey(name));
    return e && e.u ? `${e.u}/${size}` : '';
  };
  const asked = new Set(); // bu oturumda aranan (ya da kuyruktaki) adlar
  function saveBadgesSoon() {
    clearTimeout(badgeSaveT);
    badgeSaveT = setTimeout(() => {
      const map = {};
      for (const [k, v] of [...badges].slice(-600)) map[k] = [v.u, v.at];
      Promise.resolve(store.cache.set(BADGE_CACHE_KEY, { at: now(), map })).catch(() => {});
    }, 1500);
  }
  let redrawT = 0;
  function redrawSoon() {
    clearTimeout(redrawT);
    redrawT = setTimeout(() => {
      if (page.el.isConnected) drawList();
    }, 400);
  }
  async function runBadges() {
    if (badgeBusy) return;
    badgeBusy = true;
    try {
      while (badgeQ.length && page.el.isConnected && now() >= badgePause) {
        const name = badgeQ.shift();
        try {
          const json = await net.json(badgeSearchUrl(name, badgeHost), { fast: true });
          badges.set(bkey(name), { u: pickBadge(json, name), at: now() });
          saveBadgesSoon();
          redrawSoon();
        } catch {
          // sınır aşımı/ağ hatası: bir süre aranmaz, sonuç kaydedilmez (sonra yeniden denenir)
          badgePause = now() + BADGE_BACKOFF_MS;
          asked.delete(bkey(name));
          for (const n of badgeQ.splice(0)) asked.delete(bkey(n));
          break;
        }
        await new Promise((r) => setTimeout(r, env.badgeGapMs ?? globalThis.__sportsBadgeGapMs ?? BADGE_GAP_MS)); // __sportsBadgeGapMs: yalnız testler için
      }
    } finally {
      badgeBusy = false;
    }
  }
  // Görünen maçlarda logosu olmayan kulüpler için rozet araması (milli takım maçlarında bayrak olduğu için aranmaz)
  function queueBadges(rows) {
    // oynanmamış/canlı maçlar önce (biten maçın rozeti sonra aranır)
    for (const m of [...rows.filter((x) => x.state !== 'post'), ...rows.filter((x) => x.state === 'post')]) {
      if (nationFlags(m.home.name, m.away.name)) continue;
      for (const side of [m.home, m.away]) {
        const k = bkey(side.name);
        if (side.logo || asked.has(k) || !k) continue;
        const e = badges.get(k);
        if (e && now() - e.at < (e.u ? BADGE_HIT_MS : BADGE_MISS_MS)) continue;
        asked.add(k);
        badgeQ.push(side.name);
      }
    }
    if (badgeQ.length) runBadges();
  }
  const teamHtml = (side, other) => `<span class="sp-tm">${logoHtml(sideLogo(side, other, badgeOf), side.label, esc)}<span>${esc(side.label)}</span></span>`;

  // ---- maç hatırlatıcısı: satırdaki zil (dokunmatik; kumandada ayrıntı sayfasındaki seçeneklerle kurulur) ----
  const LEAD_KEY = 'sp.lead';
  let remIds = new Set();
  const bellAttrs = (on) => `aria-label="${on ? 'Hatırlatıcıyı kaldır' : 'Maç için hatırlat'}" title="${on ? 'Hatırlatıcıyı kaldır' : 'Maç için hatırlat'}"`;
  const bellHtml = (m) => (rem && canRemind(m, now()) ? `<button class="sp-bell${remIds.has(matchPlanId(m)) ? ' on' : ''}" tabindex="-1" data-bell ${bellAttrs(remIds.has(matchPlanId(m)))}>${icon('bell')}</button>` : '');

  function loadRem() {
    try {
      remIds = new Set(((rem && rem.list()) || []).map((x) => x.id));
    } catch {
      remIds = new Set();
    }
  }

  // Listedeki zilleri kurulu hatırlatıcılara göre tazeler (yeniden çizmeden: kaydırma yeri bozulmaz)
  function syncBells() {
    loadRem();
    for (const row of root.querySelectorAll('.sp-m')) {
      const b = row.querySelector('.sp-bell');
      const m = b && matches.find((x) => x.id === row.dataset.id);
      if (!m) continue;
      const on = remIds.has(matchPlanId(m));
      b.classList.toggle('on', on);
      b.setAttribute('aria-label', on ? 'Hatırlatıcıyı kaldır' : 'Maç için hatırlat');
      b.setAttribute('title', on ? 'Hatırlatıcıyı kaldır' : 'Maç için hatırlat');
    }
  }

  // Hatırlatıcıda dokununca açılacak kanal ve bildirimde görünecek yayıncı: rehberdeki eşleşme, yoksa yayın listesindeki ad; yayın bilgisi yoksa lig adı
  function remindInfo(m) {
    const ch = chan.get(m.id);
    const names = tvFor.get(m.id) || [];
    let item = ch && ch.item;
    if (!item && names.length) item = channelsByName(liveItems() || [], names, 1)[0];
    return { chId: item ? item.id : '', chName: names[0] || (item && item.name) || lgLine(m), src: env.sourceId ? env.sourceId() : '' };
  }

  function setReminder(m, lead) {
    if (!canRemind(m, now())) {
      toast('Bu maç başladı ya da bitti; hatırlatıcı kurulamaz', 2600);
      return null;
    }
    const plan = rem.set(makeMatchPlan(m, { lead, ...remindInfo(m) }));
    try {
      store.setPref(LEAD_KEY, lead);
    } catch {
      /* son seçim kaydedilemedi */
    }
    const when = m.t - lead * 60000;
    toast(when - now() < 5000 ? 'Maç yakında başlıyor; hemen haber verilir' : `Hatırlatıcı kuruldu · ${fmtClock(when)} (${leadLabel(lead)})`, 2800);
    syncBells();
    return plan;
  }

  function clearReminder(m) {
    rem.remove(matchPlanId(m));
    toast('Hatırlatıcı kaldırıldı', 1800);
    syncBells();
  }

  function toggleBell(m) {
    if (remIds.has(matchPlanId(m))) clearReminder(m);
    else setReminder(m, Number(store.pref(LEAD_KEY, MATCH_LEAD_DEFAULT)));
  }

  function rowHtml(m) {
    const when = m.state === 'in' ? `<span class="sp-live">${esc(m.text)}</span>` : m.state === 'post' || m.off ? `<span class="sp-ft">${esc(m.text)}</span>` : noScore(m, now()) ? `<span class="sp-ft">Skor yok</span>` : `<time>${fmtClock(m.t)}</time>${bellHtml(m)}`;
    const sc = score(m);
    const title = `${teamHtml(m.home, m.away)}<span class="sp-vs">${sc ? ` ${sc} ` : ' - '}</span>${teamHtml(m.away, m.home)}`;
    const lgl = lgLine(m);
    return `<div class="sp-m${m.state === 'in' ? ' on' : ''}" role="button" tabindex="0" data-id="${esc(m.id)}">
      <div class="sp-main"><div class="sp-l1"><span class="sp-when">${when}</span><span class="sp-tt">${title}</span></div>${lgl ? `<div class="sp-l2">${esc(lgl)}</div>` : ''}</div>${chBox(m)}</div>`;
  }

  // Çizimler odağı korur ve içerik değişmediyse DOM'a dokunmaz: rozet/logo geldikçe yinelenen yeniden çizim, kumandada odaktaki satırı yok edip
  // bir sonraki tuşta odağı gün çiplerine fırlatıyordu.
  const drawn = new Map();
  function put(el, html) {
    if (drawn.get(el) === html && el.isConnected) return false;
    drawn.set(el, html);
    el.innerHTML = html;
    return true;
  }
  const drawChips = () => keepFocus(drawChipsNow);
  const drawList = () => keepFocus(drawListNow);

  function drawChipsNow() {
    const t = now();
    const strip = dayStrip(t);
    put(q('#sp-days'), strip
      .map((d) => {
        const n = chipsFor(matchesOnDay(matches, d)).all; // “Tümü” sayısıyla aynı (diğer ülkeler hariç)
        return `<button class="chip${d === day ? ' on' : ''}" data-day="${d}"${d === day ? ' data-autofocus' : ''}>${esc(dayLabel(d, t))}${n ? `<small>${n}</small>` : ''}</button>`;
      })
      .join(''));
    const { all, chips } = chipsFor(matchesOnDay(matches, day));
    if (lg && !chips.some((c) => c.id === lg)) lg = '';
    put(q('#sp-lgs'),
      `<button class="chip${lg === '' ? ' on' : ''}" data-lg="">Tümü<small>${all}</small></button>` +
      chips.map((c) => `<button class="chip${lg === c.id ? ' on' : ''}" data-lg="${esc(c.id)}">${esc(c.name)}<small>${c.count}</small></button>`).join(''));
    const on = q('#sp-days .chip.on');
    if (on && on.scrollIntoView && !on.dataset.seen) {
      on.dataset.seen = '1'; // yalnız seçili gün değişince ortala (her çizimde kaydırma yerini bozmasın)
      on.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }

  function drawStatus() {
    const el = q('#sp-upd');
    if (!el) return;
    const have = matches.length > 0;
    const at = lastAt();
    let text;
    if (loading && !at && !have) text = 'Maçlar yükleniyor…';
    else if (loading) text = 'Güncelleniyor…';
    else if (err && !have) text = err;
    else if (err && at) text = `Güncellenemedi · kayıtlı veri (${fmtClock(at)})`;
    else if (at) text = `Son güncelleme ${fmtClock(at)}${espnErr || failed.length ? ' · bazı veriler alınamadı' : ''}`;
    else if (lsBusy || tvPending.size) text = 'Maçlar yükleniyor…';
    else text = '';
    el.textContent = text;
  }

  // Teknik ayrıntı (kaynak adlarıyla): yalnız durum satırına dokununca görünür; sorun bildirirken ekran görüntüsü için.
  function sourceNote() {
    const bits = [];
    if (espnErr && matches.length) bits.push(`ESPN: ${espnDetail || espnErr}`);
    if (lsErr && !lsBusy && !lsDays.has(day)) bits.push(`LiveScore: ${lsDetail || lsErr}`);
    if (tvErr && !tvDays.has(day)) bits.push(tvDetail || tvErr);
    const tvd = tvDays.get(day);
    if (tvd && tvd.seNote) bits.push(`Yayın akışı: ${tvd.seNote}`);
    return bits.length ? `<p class="hint sp-detail sp-src"${showDiag ? '' : ' hidden'}>${bits.map(esc).join(' · ')}</p>` : '';
  }

  function drawListNow() {
    const list = q('#sp-list');
    if (!list) return;
    const { secs, hidden } = capSections(sections(matchesOnDay(matches, day), lg), MAX_ROWS);
    if (!secs.length) {
      // Gün için yayın akışı henüz indirilmediyse (ya da iniyorsa) “Maç yok” yerine “yükleniyor”: takvim oradan da gelebilir
      const waiting = loading || lsBusy || tvPending.has(day) || (!tvDays.has(day) && !tvFailAt.has(day));
      put(list, waiting
        ? '<div class="empty"><p>Maçlar yükleniyor…</p></div>'
        : err
          ? `<div class="empty"><h3>Maçlar alınamadı</h3><p>${esc(err)}</p>${errDetail ? `<p class="hint sp-detail">Ayrıntı: ${esc(errDetail)}</p>` : ''}<button class="btn" id="sp-retry">Yeniden dene</button></div>`
          : `<div class="empty"><h3>Maç yok</h3><p>${esc(dayLabel(day, now()))} için seçili liglerde maç bulunamadı.</p></div>${sourceNote()}`);
      return;
    }
    loadRem();
    const rows = secs.flatMap((x) => x.matches).sort((a, b) => a.t - b.t || matchRank(a) - matchRank(b) || a.id.localeCompare(b.id));
    put(list,
      sourceNote() +
      rows.map(rowHtml).join('') +
      (hidden ? `<p class="hint sp-more">… ve ${hidden} maç daha. Listeyi daraltmak için yukarıdan bir lig seçin.</p>` : ''));
    queueBadges(rows);
  }

  function draw() {
    drawChips();
    drawStatus();
    drawList();
  }

  // ---- veri ----
  async function readCache() {
    let e = null;
    try {
      const c = await store.cache.get(CACHE_KEY);
      if (c && Array.isArray(c.matches) && c.at && now() - c.at < CACHE_MAX_AGE) e = c;
    } catch {
      /* kayıtlı veri yok */
    }
    try {
      const c = await store.cache.get(LS_CACHE_KEY);
      if (c && Array.isArray(c.days)) {
        for (const [d, v] of c.days) if (v && Array.isArray(v.matches) && v.at && now() - v.at < CACHE_MAX_AGE) lsDays.set(Number(d), v);
      }
    } catch {
      /* kayıtlı veri yok */
    }
    try {
      const c = await store.cache.get(BADGE_CACHE_KEY);
      if (c && c.map && typeof c.map === 'object') {
        for (const [k, v] of Object.entries(c.map)) if (Array.isArray(v) && typeof v[1] === 'number') badges.set(k, { u: typeof v[0] === 'string' ? v[0] : '', at: v[1] });
      }
    } catch {
      /* kayıtlı rozet yok */
    }
    try {
      const c = await store.cache.get(TV_CACHE_KEY);
      if (c && Array.isArray(c.days)) {
        for (const [d, v] of c.days) if (v && (v.src === 'se' ? Array.isArray(v.rows) : Array.isArray(v.events)) && v.at && now() - v.at < CACHE_MAX_AGE) tvDays.set(Number(d), v);
      }
    } catch {
      /* kayıtlı veri yok */
    }
    return e;
  }

  // Birleşik liste: ESPN + diğer kaynaklarda olup ESPN'de karşılığı bulunmayan maçlar (yayın akışı sayfasındaki satırlar dahil).
  function recompute() {
    const ls = [];
    for (const v of lsDays.values()) ls.push(...v.matches);
    const base = ls.length ? mergeSources(espn, ls).matches : espn;
    const rows = [];
    for (const v of tvDays.values()) if (v.src === 'se') rows.push(...v.rows);
    matches = rows.length ? mergeSe(base, rows) : base;
  }

  // Yayın akışındaki kanal adlarını maçlara eşler (yalnız oynanmamış maçlar). Yayın akışından gelen maçların kanalı kendi üzerindedir.
  function matchTv() {
    tvFor = new Map();
    tvLogo = new Map();
    for (const m of matches) {
      if (m.src === 'se' && m.channels && m.channels.length) {
        tvFor.set(m.id, m.channels);
        tvLogo.set(m.id, m.logos || {});
      }
    }
    for (const [d, v] of tvDays) {
      const items = v.src === 'se' ? v.rows : v.events;
      if (!items || !items.length) continue;
      for (const m of matchesOnDay(matches, d)) {
        if (m.state === 'post' || m.off || m.src === 'se') continue;
        if (v.src === 'se') {
          const r = seInfoFor(m, items);
          if (r.channels.length) {
            tvFor.set(m.id, r.channels);
            tvLogo.set(m.id, r.logos);
          }
        } else if (!tvFor.has(m.id)) {
          const names = tvChannelsFor(m, items);
          if (names.length) tvFor.set(m.id, names);
        }
      }
    }
  }

  // Önce yayın akışı siteleri (maç takvimi + Türkiye'ye özel kanal bilgisi; biri alınamazsa sıradaki denenir); hiçbiri olmazsa ya da futbol kaydı yoksa yedek olarak TheSportsDB (yalnız kanal).
  function loadTv(d) {
    if (tvPending.has(d)) return tvPending.get(d);
    const p = (async () => {
      let seNote = '';
      try {
        const r = await loadSchedDay({ net, dayMs: d, bases: schedBases, nowMs: now() });
        seNote = r.note;
        if (r.rows.length) {
          await saveTv(d, { at: now(), src: 'se', via: r.via, rows: r.rows, seNote });
          return;
        }
      } catch (e) {
        seNote = (e && e.detail) || (e && e.message) || 'hata';
      }
      try {
        const r = await loadTvDay({ net, dayMs: d, hosts: tvHosts });
        const old = tvDays.get(d);
        const oldLen = old ? (old.src === 'se' ? old.rows.length : old.events.length) : 0;
        if (!r.events.length && oldLen) return; // yedek kaynakta da bir şey yok: önceki (iyi) liste korunur
        await saveTv(d, { at: now(), src: 'tsdb', events: r.events, seNote });
      } catch (e) {
        tvErr = (e && e.message) || 'Yayın listesi alınamadı';
        tvDetail = `${seNote} · TheSportsDB: ${(e && e.detail) || tvErr}`;
        tvFailAt.set(d, now());
      }
    })().finally(() => tvPending.delete(d));
    tvPending.set(d, p);
    return p;
  }

  async function saveTv(d, entry) {
    tvDays.delete(d);
    tvDays.set(d, entry);
    tvErr = '';
    tvDetail = '';
    try {
      await store.cache.set(TV_CACHE_KEY, { at: now(), days: [...tvDays].slice(-LS_CACHE_DAYS) });
    } catch {
      /* kayıt başarısız olsa da liste çalışır */
    }
  }

  // Günün yayın listesi eskiyse indirilir; ana liste beklemez, gelince satırlar tazelenir.
  async function ensureTv(d, force = false) {
    const v = tvDays.get(d);
    if (!force && v && now() - v.at < TV_FRESH_MS) return;
    if (tvPending.has(d)) {
      await tvPending.get(d); // indirmeyi başlatan çağrı ekranı tazeler; burada yalnız beklenir
      return;
    }
    if (tvFailAt.has(d) && now() - tvFailAt.get(d) < 10 * 60e3) return; // başarısızsa 10 dakika sonra yeniden
    await loadTv(d);
    if (!page.el.isConnected) return;
    recompute(); // yayın akışındaki maçlar takvime eklenir
    matchChannels();
    pickFirstDay();
    if (matches.length) {
      err = '';
      errDetail = '';
    }
    keepFocus(draw);
  }

  const lastAt = () => Math.max(fetchedAt, ...[...lsDays.values()].map((v) => v.at), ...[...tvDays.values()].map((v) => v.at));

  async function loadEspn() {
    try {
      const r = await loadMatches({ net, now: now(), base });
      espn = r.matches;
      failed = r.failed;
      fetchedAt = now();
      espnErr = '';
      espnDetail = '';
      try {
        await store.cache.set(CACHE_KEY, { at: fetchedAt, matches: espn });
      } catch {
        /* kayıt başarısız olsa da liste çalışır */
      }
    } catch (e) {
      espnErr = (e && e.message) || 'Maç bilgisi alınamadı';
      espnDetail = (e && e.detail) || '';
    }
  }

  // Bir günün LiveScore listesi. Aynı gün için indirme sürüyorsa onu bekler.
  function loadLs(d) {
    if (lsPending.has(d)) return lsPending.get(d);
    lsBusy++;
    const p = (async () => {
      try {
        const r = await loadLiveScoreDay({ net, dayMs: d, now: now(), hosts: lsHosts });
        lsDays.delete(d);
        lsDays.set(d, { at: now(), matches: r.matches });
        lsErr = '';
        lsDetail = '';
        try {
          await store.cache.set(LS_CACHE_KEY, { at: now(), days: [...lsDays].slice(-LS_CACHE_DAYS) });
        } catch {
          /* kayıt başarısız olsa da liste çalışır */
        }
      } catch (e) {
        lsErr = (e && e.message) || 'LiveScore verisi alınamadı';
        lsDetail = (e && e.detail) || '';
      } finally {
        lsBusy--;
        lsPending.delete(d);
      }
    })();
    lsPending.set(d, p);
    return p;
  }

  // Günün LiveScore listesi eskiyse (ya da hiç yoksa) indirir; gelince ekranı tazeler. Odak, düğme yeniden çizilse de korunur.
  function lsStale(d) {
    const v = lsDays.get(d);
    if (!v) return true;
    const t0 = dayStart(now());
    const age = now() - v.at;
    return age > (d < t0 ? CACHE_MAX_AGE : d === t0 ? FRESH_MS : LS_FUTURE_MS);
  }

  async function ensureLs(d) {
    if (!lsStale(d) || lsPending.has(d)) return;
    drawStatus();
    if (!matchesOnDay(matches, d).length) drawList();
    await loadLs(d);
    if (!page.el.isConnected) return;
    recompute();
    matchChannels();
    pickFirstDay();
    keepFocus(draw);
  }

  // Yeniden çizimde odaktaki düğme/satır kaybolmasın (kumanda).
  function keepFocus(fn) {
    const a = document.activeElement;
    const had = a && a !== document.body && root.contains(a);
    const key = had ? { day: a.dataset.day, lg: a.dataset.lg, id: a.dataset.id, ref: a.id } : null;
    fn();
    if (!key || (document.activeElement && document.activeElement !== document.body && root.contains(document.activeElement))) return;
    const sel = key.day ? `[data-day="${key.day}"]` : key.lg != null ? `[data-lg="${key.lg}"]` : key.id ? `[data-id="${key.id}"]` : key.ref ? `#${key.ref}` : '';
    const el = sel && root.querySelector(sel);
    if (el && el.focus) el.focus({ preventScroll: true });
  }

  const lsLiveDay = (d) => matchesOnDay(matches, d).some((m) => m.src === 'ls' && (m.state === 'in' || (m.state === 'pre' && m.t - now() < 10 * 60e3 && m.t - now() > -60e3)));

  async function refresh({ quiet = false } = {}) {
    if (loading) return;
    loading = true;
    err = '';
    errDetail = '';
    if (!quiet) drawStatus();
    const d0 = day;
    if (!quiet) tvFailAt.clear(); // elle yenilemede yayın listesi de yeniden denenir
    const lsDue = !quiet || (lsLiveDay(d0) && now() - ((lsDays.get(d0) || {}).at || 0) >= LS_LIVE_MS);
    try {
      await Promise.all([loadEspn(), lsDue ? loadLs(d0) : null]);
    } finally {
      loading = false;
    }
    const lsAny = [...lsDays.values()].some((v) => v.matches.length);
    if (espnErr && !lsAny) {
      // ESPN yok ve ikinci kaynaktan da maç gelmedi: kayıtlı veri varsa onu gösterir, yoksa (yayın akışı da maç getirmezse) hata ekranı
      err = espnErr;
      errDetail = [espnDetail || espnErr, lsErr && (lsDetail || lsErr)].filter(Boolean).join(' · ');
      if (fetchedAt && !quiet) toast('Skorlar güncellenemedi', 2200);
    } else if (lsDays.size) {
      fetchedAt = Math.max(fetchedAt, lastAt());
    }
    if (!page.el.isConnected) return;
    recompute();
    matchChannels();
    pickFirstDay();
    const tvP = ensureTv(day, !quiet); // elle yenilemede yayın akışı da yeniden indirilir
    if (err && !matches.length) await tvP; // maç yoksa yayın akışı (takvim olarak) gelene kadar hata ekranı gösterilmez
    if (!page.el.isConnected) return;
    if (matches.length) {
      err = '';
      errDetail = '';
    }
    keepFocus(draw);
    if (day !== d0) ensureLs(day);
  }

  // İlk açılışta bugün maç yoksa maçı olan ilk güne geçilir.
  function pickFirstDay() {
    if (!firstPick || !matches.length) return;
    firstPick = false;
    const t = dayStart(now());
    if (matchesOnDay(matches, t).length) return;
    const next = dayStrip(now()).find((d) => d >= t && matchesOnDay(matches, d).length);
    if (next) day = next;
  }

  function tick() {
    if (!page.el.isConnected) {
      clearInterval(timer);
      return;
    }
    const soon = matches.some((m) => m.src !== 'se' && m.state === 'pre' && m.t - now() < 10 * 60e3 && m.t - now() > -60e3);
    if (hasLive(matches) || soon) refresh({ quiet: true });
  }

  // ---- dokunmalar ----
  // Maça dokununca ayrıntı ekranı açılır; yayın kanalları (rehber, yayın akışı) o ekrandadır.
  // Maç ayrıntısı (olaylar, istatistik, kadro, yayın kanalları): ayrı modül, ilk dokunuşta yüklenir.
  async function openDetail(m) {
    try {
      const mod = await import('./sports-detail-ui.js');
      mod.openMatchDetail(
        {
          net, toast, liveItems, epgBetween, play, base, now,
          badgeOf: (name) => badgeOf(name, 'small'),
          tvOf: (x) => tvFor.get(x.id) || [],
          ensureTv: (x) => ensureTv(dayStart(x.t)),
          remind: rem
            ? {
              leads: MATCH_LEADS,
              label: leadLabel,
              can: (x) => canRemind(x, now()),
              get: (x) => (rem.list() || []).find((p) => p.id === matchPlanId(x)) || null,
              set: (x, lead) => setReminder(x, lead),
              clear: (x) => clearReminder(x),
              last: () => Number(store.pref(LEAD_KEY, MATCH_LEAD_DEFAULT)),
            }
            : null,
        },
        m,
      );
    } catch (e) {
      toast('Ayrıntı açılamadı: ' + ((e && e.message) || e), 3000);
    }
  }

  root.addEventListener('click', (e) => {
    const d = e.target.closest('[data-day]');
    if (d) {
      day = Number(d.dataset.day);
      draw();
      const nd = q(`#sp-days [data-day="${day}"]`);
      if (nd && nd.focus) nd.focus({ preventScroll: true });
      ensureLs(day);
      ensureTv(day);
      return;
    }
    const l = e.target.closest('[data-lg]');
    if (l) {
      lg = l.dataset.lg;
      draw();
      const nl = q(`#sp-lgs [data-lg="${lg}"]`);
      if (nl && nl.focus) nl.focus({ preventScroll: true });
      return;
    }
    if (e.target.closest('#sp-ref') || e.target.closest('#sp-retry')) return refresh();
    if (e.target.closest('#sp-upd')) {
      showDiag = !showDiag;
      const n = q('.sp-src');
      if (n) n.hidden = !showDiag;
      return;
    }
    const row = e.target.closest('.sp-m');
    if (row) {
      const m = matches.find((x) => x.id === row.dataset.id);
      if (!m) return;
      if (e.target.closest('[data-bell]')) return rem && toggleBell(m);
      openDetail(m);
    }
  });
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.sp-m')) {
      e.preventDefault();
      e.target.click();
    }
  });

  // ---- açılış: kayıtlı veri hemen, ardından güncel veri ----
  (async () => {
    const c = await readCache();
    if (c && !espn.length) {
      espn = c.matches;
      fetchedAt = c.at;
    }
    if (c || lsDays.size) {
      recompute();
      if (!fetchedAt) fetchedAt = lastAt();
      matchChannels();
      pickFirstDay();
    }
    // İndirme çizimden önce başlar: ilk çizimde "yükleniyor" görünür ("Maç yok" yanıp sönmez).
    if (!c || now() - c.at > FRESH_MS || lsStale(day)) refresh({ quiet: !!(c || lsDays.size) });
    draw();
    ensureTv(day);
    timer = setInterval(tick, LIVE_REFRESH_MS);
  })();

  return page;
}

