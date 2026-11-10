// Spor (futbol) ekranı: gün/lig seçimi, maç listesi, canlı skor (dakikada bir tazelenir), maçın kanalına tek dokunuşla geçiş.
// Mantık sports.js'te; burada yalnız ekran var. Uygulama ilk açıldığında yüklenmez (ana ekrandan "Spor"a basınca yüklenir).
import { esc, fmtClock } from './util.js';
import { $, icon, openPage, openSheet } from './ui.js';
import {
  LEAGUES, ESPN_BASE, loadMatches, findProgram, slicePrograms, broadcasterFor, channelsOfBroadcaster, dayStrip, dayStart, dayLabel,
  matchesOnDay, sections, hasLive,
} from './sports.js';

const CACHE_KEY = 'sports:v1';
const CACHE_MAX_AGE = 6 * 3600e3; // kayıtlı veri bundan eskiyse hiç gösterilmez
const FRESH_MS = 2 * 60e3; // bundan yeni veri yeniden indirilmez
const LIVE_REFRESH_MS = 60e3;
const EPG_BEFORE = 90 * 60000;
const EPG_AFTER = 20 * 60000;

// env: { net, store, toast, liveItems(): görünür canlı kanallar, epgBetween(from, to), play(items, index), base?, now? }
export function openSports(env) {
  const { net, store, toast, liveItems, epgBetween, play } = env;
  const base = env.base || ESPN_BASE;
  const now = env.now || (() => Date.now());

  let matches = [];
  let fetchedAt = 0;
  let failed = [];
  let err = '';
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
      </div></div>`;
  }

  function drawChips() {
    const t = now();
    const strip = dayStrip(t);
    q('#sp-days').innerHTML = strip
      .map((d) => {
        const n = matchesOnDay(matches, d).length;
        return `<button class="chip${d === day ? ' on' : ''}" data-day="${d}"${d === day ? ' data-autofocus' : ''}>${esc(dayLabel(d, t))}${n ? `<small>${n}</small>` : ''}</button>`;
      })
      .join('');
    const today = matchesOnDay(matches, day);
    if (lg && !today.some((m) => m.lg === lg)) lg = '';
    const counts = new Map();
    for (const m of today) counts.set(m.lg, (counts.get(m.lg) || 0) + 1);
    q('#sp-lgs').innerHTML =
      `<button class="chip${lg === '' ? ' on' : ''}" data-lg="">Tümü<small>${today.length}</small></button>` +
      LEAGUES.filter((l) => counts.has(l.id))
        .map((l) => `<button class="chip${lg === l.id ? ' on' : ''}" data-lg="${l.id}">${esc(l.name)}<small>${counts.get(l.id)}</small></button>`)
        .join('');
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
    else if (failed.length) text = `Son güncelleme ${fmtClock(fetchedAt)} · ${failed.length} lig alınamadı`;
    else if (fetchedAt) text = `Son güncelleme ${fmtClock(fetchedAt)}`;
    else text = '';
    el.textContent = text;
  }

  function drawList() {
    const list = q('#sp-list');
    if (!list) return;
    const secs = sections(matchesOnDay(matches, day), lg);
    if (!secs.length) {
      list.innerHTML = loading && !fetchedAt
        ? '<div class="empty"><p>Maçlar yükleniyor…</p></div>'
        : err && !fetchedAt
          ? `<div class="empty"><h3>Maçlar alınamadı</h3><p>${esc(err)}</p><button class="btn" id="sp-retry">Yeniden dene</button></div>`
          : `<div class="empty"><h3>Maç yok</h3><p>${esc(dayLabel(day, now()))} için seçili liglerde maç bulunamadı.</p></div>`;
      return;
    }
    list.innerHTML = secs.map((s) => `<h4 class="sp-lg-h">${esc(s.lg.name)}</h4>${s.matches.map(rowHtml).join('')}`).join('');
  }

  function draw() {
    drawChips();
    drawStatus();
    drawList();
  }

  // ---- veri ----
  async function readCache() {
    try {
      const c = await store.cache.get(CACHE_KEY);
      if (c && Array.isArray(c.matches) && c.at && now() - c.at < CACHE_MAX_AGE) return c;
    } catch {
      /* kayıtlı veri yok */
    }
    return null;
  }

  async function refresh({ quiet = false } = {}) {
    if (loading) return;
    loading = true;
    err = '';
    if (!quiet) drawStatus();
    try {
      const r = await loadMatches({ net, now: now(), base });
      matches = r.matches;
      failed = r.failed;
      fetchedAt = now();
      try {
        await store.cache.set(CACHE_KEY, { at: fetchedAt, matches });
      } catch {
        /* kayıt başarısız olsa da liste çalışır */
      }
    } catch (e) {
      err = (e && e.message) || 'Maç bilgisi alınamadı';
      if (fetchedAt && !quiet) toast('Skorlar güncellenemedi', 2200);
    } finally {
      loading = false;
    }
    if (!page.el.isConnected) return;
    matchChannels();
    pickFirstDay();
    draw();
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
    if (m.state === 'post') return toast('Maç sona erdi', 1600);
    if (m.off) return toast(m.text, 1600);
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

  root.addEventListener('click', (e) => {
    const d = e.target.closest('[data-day]');
    if (d) {
      day = Number(d.dataset.day);
      draw();
      const nd = q(`#sp-days [data-day="${day}"]`);
      if (nd && nd.focus) nd.focus({ preventScroll: true });
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
    if (c && !matches.length) {
      matches = c.matches;
      fetchedAt = c.at;
      matchChannels();
      pickFirstDay();
    }
    // İndirme çizimden önce başlar: ilk çizimde "yükleniyor" görünür ("Maç yok" yanıp sönmez).
    if (!c || now() - c.at > FRESH_MS) refresh({ quiet: !!c });
    draw();
    timer = setInterval(tick, LIVE_REFRESH_MS);
  })();

  return page;
}

