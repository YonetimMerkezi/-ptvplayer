// Spor (futbol) ekranı: gün/lig seçimi, maç listesi, canlı skor (dakikada bir tazelenir), maçın kanalına tek dokunuşla geçiş.
// Mantık sports.js'te; burada yalnız ekran var. Uygulama ilk açıldığında yüklenmez (ana ekrandan "Spor"a basınca yüklenir).
import { esc, fmtClock } from './util.js';
import { $, icon, openPage, openSheet } from './ui.js';
import {
  ESPN_BASE, loadMatches, findProgram, slicePrograms, broadcasterFor, channelsOfBroadcaster, dayStrip, dayStart, dayLabel,
  matchesOnDay, sections, chipsFor, capSections, hasLive,
} from './sports.js';
import { LS_HOSTS, loadLiveScoreDay, mergeSources } from './sports-ls.js';

const CACHE_KEY = 'sports:v1'; // ESPN maçları
const LS_CACHE_KEY = 'sports-ls:v1'; // LiveScore gün listeleri
const LS_CACHE_DAYS = 5;
const CACHE_MAX_AGE = 6 * 3600e3; // kayıtlı veri bundan eskiyse hiç gösterilmez
const FRESH_MS = 2 * 60e3; // bundan yeni veri yeniden indirilmez
const LS_FUTURE_MS = 30 * 60e3; // ileri günlerin LiveScore listesi bu süre yeni sayılır
const LS_LIVE_MS = 2 * 60e3; // canlı maç varken LiveScore günü en sık bu aralıkla yenilenir (gün yanıtı büyüktür)
const LIVE_REFRESH_MS = 60e3;
const EPG_BEFORE = 90 * 60000;
const EPG_AFTER = 20 * 60000;
const MAX_ROWS = 500;

// env: { net, store, toast, liveItems(): görünür canlı kanallar, epgBetween(from, to), play(items, index), base?, lsHosts?, now? }
export function openSports(env) {
  const { net, store, toast, liveItems, epgBetween, play } = env;
  const base = env.base || ESPN_BASE;
  const lsHosts = env.lsHosts || LS_HOSTS;
  const now = env.now || (() => Date.now());

  let matches = []; // birleşik liste (ESPN + LiveScore'ta olup ESPN'de olmayanlar)
  let espn = [];
  const lsDays = new Map(); // gün → { at, matches } (LiveScore)
  const lsPending = new Map(); // gün → devam eden indirme
  let lsBusy = 0;
  let lsErr = '';
  let lsDetail = '';
  let espnErr = '';
  let espnDetail = '';
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
  const flag = (side) => `<span class="sp-flag">${side.logo ? `<img src="${esc(side.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
  const score = (side, m) => (side.score == null ? '' : `<b class="sp-sc">${side.score}${side.pen != null && m.state === 'post' ? `<small> (${side.pen})</small>` : ''}</b>`);

  function rowHtml(m) {
    const ch = chan.get(m.id);
    const win = m.state === 'post' && m.home.score != null && m.away.score != null && m.home.score !== m.away.score ? (m.home.score > m.away.score ? 'h' : 'a') : '';
    const when = m.state === 'in' ? `<span class="sp-live">${esc(m.text)}</span>` : m.state === 'post' ? `<span class="sp-ft">${esc(m.text)}</span>` : m.off ? `<span class="sp-ft">${esc(m.text)}</span>` : `<time>${fmtClock(m.t)}</time>`;
    let foot = '';
    if (m.state !== 'post' && !m.off) {
      const bc = broadcasterFor(m);
      if (ch) foot = `<div class="sp-ch">${icon('play')}<span>${esc(ch.item.name)}</span></div>`;
      else if (bc) foot = `<div class="sp-bc">Yayıncı: ${esc(bc.names)} <small>(tahmini)</small></div>`;
      else foot = '<div class="sp-bc"><small>Yayıncı bilgisi yok</small></div>';
    }
    return `<div class="sp-m${m.state === 'in' ? ' on' : ''}" role="button" tabindex="0" data-id="${esc(m.id)}">
      <div class="sp-when">${when}</div>
      <div class="sp-teams">
        <div class="sp-t${win === 'h' ? ' win' : ''}">${flag(m.home)}<span class="sp-n">${esc(m.home.label)}</span>${score(m.home, m)}</div>
        <div class="sp-t${win === 'a' ? ' win' : ''}">${flag(m.away)}<span class="sp-n">${esc(m.away.label)}</span>${score(m.away, m)}</div>
        ${foot}
      </div><button class="sp-i" data-info aria-label="Maç ayrıntıları: ${esc(m.home.label)} – ${esc(m.away.label)}">${icon('info')}</button></div>`;
  }

  function drawChips() {
    const t = now();
    const strip = dayStrip(t);
    q('#sp-days').innerHTML = strip
      .map((d) => {
        const n = chipsFor(matchesOnDay(matches, d)).all; // “Tümü” sayısıyla aynı (diğer ülkeler hariç)
        return `<button class="chip${d === day ? ' on' : ''}" data-day="${d}"${d === day ? ' data-autofocus' : ''}>${esc(dayLabel(d, t))}${n ? `<small>${n}</small>` : ''}</button>`;
      })
      .join('');
    const { all, chips } = chipsFor(matchesOnDay(matches, day));
    if (lg && !chips.some((c) => c.id === lg)) lg = '';
    q('#sp-lgs').innerHTML =
      `<button class="chip${lg === '' ? ' on' : ''}" data-lg="">Tümü<small>${all}</small></button>` +
      chips.map((c) => `<button class="chip${lg === c.id ? ' on' : ''}" data-lg="${esc(c.id)}">${esc(c.name)}<small>${c.count}</small></button>`).join('');
    const on = q('#sp-days .chip.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function drawStatus() {
    const el = q('#sp-upd');
    if (!el) return;
    let text;
    if (loading && !fetchedAt) text = 'Maçlar yükleniyor…';
    else if (loading) text = 'Güncelleniyor…';
    else if (err && fetchedAt) text = `Güncellenemedi · kayıtlı veri (${fmtClock(fetchedAt)})`;
    else if (err) text = err;
    else if (fetchedAt) {
      text = `Son güncelleme ${fmtClock(fetchedAt)}`;
      const notes = [];
      if (espnErr) notes.push('ESPN alınamadı');
      else if (failed.length) notes.push(`${failed.length} lig alınamadı`);
      if (lsBusy) notes.push('LiveScore yükleniyor…');
      else if (lsErr) notes.push('LiveScore alınamadı');
      else {
        const extra = matchesOnDay(matches, day).filter((m) => m.src === 'ls').length;
        if (extra) notes.push(`LiveScore'dan +${extra} maç`);
      }
      if (notes.length) text += ' · ' + notes.join(' · ');
    } else if (lsBusy) text = 'LiveScore yükleniyor…';
    else text = '';
    el.textContent = text;
  }

  // Kaynaklardan biri alınamadıysa neden listenin üstünde görünür (telefondan bildirilen ekran görüntüsünde teşhis için).
  function sourceNote() {
    const bits = [];
    if (espnErr && matches.length) bits.push(`ESPN: ${espnDetail || espnErr}`);
    if (lsErr && !lsBusy && !lsDays.has(day)) bits.push(`LiveScore: ${lsDetail || lsErr}`);
    return bits.length ? `<p class="hint sp-detail sp-src">${bits.map(esc).join(' · ')}</p>` : '';
  }

  function drawList() {
    const list = q('#sp-list');
    if (!list) return;
    const { secs, hidden } = capSections(sections(matchesOnDay(matches, day), lg), MAX_ROWS);
    if (!secs.length) {
      list.innerHTML = loading && !fetchedAt
        ? '<div class="empty"><p>Maçlar yükleniyor…</p></div>'
        : err && !fetchedAt
          ? `<div class="empty"><h3>Maçlar alınamadı</h3><p>${esc(err)}</p>${errDetail ? `<p class="hint sp-detail">Ayrıntı: ${esc(errDetail)}</p>` : ''}<button class="btn" id="sp-retry">Yeniden dene</button></div>`
          : lsBusy
            ? '<div class="empty"><p>LiveScore’dan maçlar yükleniyor…</p></div>'
            : `<div class="empty"><h3>Maç yok</h3><p>${esc(dayLabel(day, now()))} için seçili liglerde maç bulunamadı.</p></div>${sourceNote()}`;
      return;
    }
    list.innerHTML =
      sourceNote() +
      secs.map((s) => `<h4 class="sp-lg-h">${esc(s.lg.name)}</h4>${s.matches.map(rowHtml).join('')}`).join('') +
      (hidden ? `<p class="hint sp-more">… ve ${hidden} maç daha. Listeyi daraltmak için yukarıdan bir lig seçin.</p>` : '');
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
    return e;
  }

  // Birleşik liste: ESPN + LiveScore'ta olup ESPN'de bulunmayanlar.
  function recompute() {
    const ls = [];
    for (const v of lsDays.values()) ls.push(...v.matches);
    matches = ls.length ? mergeSources(espn, ls).matches : espn;
  }

  const lastAt = () => Math.max(fetchedAt, ...[...lsDays.values()].map((v) => v.at));

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
    const lsDue = !quiet || (lsLiveDay(d0) && now() - ((lsDays.get(d0) || {}).at || 0) >= LS_LIVE_MS);
    try {
      await Promise.all([loadEspn(), lsDue ? loadLs(d0) : null]);
    } finally {
      loading = false;
    }
    const lsAny = [...lsDays.values()].some((v) => v.matches.length);
    if (espnErr && !lsAny) {
      // ESPN yok ve LiveScore'tan da maç gelmedi: eski davranış (kayıtlı veri varsa onu gösterir, yoksa hata ekranı)
      err = espnErr;
      errDetail = [`ESPN: ${espnDetail || espnErr}`, lsErr && `LiveScore: ${lsDetail || lsErr}`].filter(Boolean).join(' · ');
      if (fetchedAt && !quiet) toast('Skorlar güncellenemedi', 2200);
    } else if (lsDays.size) {
      fetchedAt = Math.max(fetchedAt, lastAt());
    }
    if (!page.el.isConnected) return;
    recompute();
    matchChannels();
    pickFirstDay();
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
    const soon = matches.some((m) => m.state === 'pre' && m.t - now() < 10 * 60e3 && m.t - now() > -60e3);
    if (hasLive(matches) || soon) refresh({ quiet: true });
  }

  // ---- dokunmalar ----
  function openMatch(m) {
    const ch = chan.get(m.id);
    if (ch) return play([ch.item], 0);
    if (m.state === 'post') return openDetail(m); // biten maçta açılacak kanal yok: olaylar/istatistik
    if (m.off) return toast(m.text, 1600);
    if (!broadcasterFor(m)) return openDetail(m);
    openCandidates(m);
  }

  // Rehberde eşleşme yokken: yayıncının (tahmini) kanallarından birini seçtirir.
  function openCandidates(m) {
    const bc = broadcasterFor(m);
    if (!bc) return toast('Bu maçın yayıncısı belli değil', 2600);
    const cands = channelsOfBroadcaster(liveItems() || [], bc.keys);
    if (!cands.length) return toast(`Listenizde ${bc.names} kanalı bulunamadı`, 3200);
    openSheet({
      title: `${bc.names} kanalları`,
      html: `<p class="sp-hint">${esc(m.home.label)} – ${esc(m.away.label)} maçı için rehberde eşleşme bulunamadı. Yayıncının kanallarından birini açabilirsiniz.</p><div class="sp-cands">${cands
        .map((c, i) => `<div class="row" role="button" tabindex="0" data-i="${i}"><div class="meta"><div class="nm"><span>${esc(c.name)}</span></div></div></div>`)
        .join('')}</div>`,
      mount: (body, api) => {
        body.addEventListener('click', (e) => {
          const r = e.target.closest('[data-i]');
          if (!r) return;
          api.close();
          play(cands, Number(r.dataset.i));
        });
        body.addEventListener('keydown', (e) => {
          if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-i]')) {
            e.preventDefault();
            e.target.click();
          }
        });
      },
    });
  }

  // Maç ayrıntısı (olaylar, istatistik, kadro, tüm yayın kanalları): ayrı modül, ilk dokunuşta yüklenir.
  async function openDetail(m) {
    try {
      const mod = await import('./sports-detail-ui.js');
      mod.openMatchDetail({ net, toast, liveItems, epgBetween, play, base, now, openCandidates }, m);
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
    const info = e.target.closest('[data-info]');
    if (info) {
      const m = matches.find((x) => x.id === (info.closest('.sp-m') || {}).dataset.id);
      if (m) openDetail(m);
      return;
    }
    const row = e.target.closest('.sp-m');
    if (row) {
      const m = matches.find((x) => x.id === row.dataset.id);
      if (m) openMatch(m);
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
    timer = setInterval(tick, LIVE_REFRESH_MS);
  })();

  return page;
}

