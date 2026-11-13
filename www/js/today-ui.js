// "Bugün TV'de" ekranı: TV rehberinden bugünün (ya da yarının) spor, film ve dizi programları saatleriyle; kanallar seçilebilir.
// Modül ilk kullanımda yüklenir (app.js openToday).
import { esc, fmtClock, fold } from './util.js';
import { $, icon, logo, openPage } from './ui.js';
import { KINDS, todayRows, dayStart, normalizeChannels, channelKind, kindOf } from './today.js';
import { loadSeriesWeek, dayIndex, isSportsChannel } from './series-flow.js';
import { istDayStart, IST_MS } from './epg-free.js';
import { channelsByName } from './sports-tv.js';
import { makePlan, planId } from './plan.js';
import { loadFilmSchedule } from './today-film-source.js';

const KIND_EMPTY = { spor: 'spor', film: 'film', dizi: 'dizi' };

// env: { liveItems(): görünür canlı kanallar, epgReady(), listFor(item): kanalın programları, epgBetween(from, to), programSheet(item, p),
//        channels(): seçili kanal no listesi, setChannels(ids), openFlow?(): Dizi akışı ekranını açar, now? }
export function openToday(env) {
  const now = env.now || (() => Date.now());
  let kind = 'spor';
  let day = 0;
  let past = false;
  let sel = normalizeChannels(env.channels());
  const savedFilmChannels = env.filmChannels ? env.filmChannels() : null;
  let filmSel = savedFilmChannels == null || (Array.isArray(savedFilmChannels) && savedFilmChannels.length === 0) ? null : normalizeChannels(savedFilmChannels);
  let seriesData = null;
  let filmSource = { loaded: false, loading: false, films: [], entries: [], channels: [], error: '' };
  let filmLoadToken = 0;

  async function refreshFilmSource() {
    if (!env.net || filmSource.loading) return;
    const token = ++filmLoadToken;
    filmSource = { ...filmSource, loading: true, error: '' };
    if (root.isConnected) draw();
    try {
      const result = await loadFilmSchedule({ net: env.net });
      const live = env.liveItems() || [];
      const mapped = [];
      const channelIds = new Set();
      const base = new Date(now()); base.setHours(0, 0, 0, 0);
      for (const film of result.films) {
        const match = /^(\d{1,2}):(\d{2})$/.exec(film.time);
        if (!match) continue;
        const startDate = new Date(base);
        startDate.setHours(Number(match[1]), Number(match[2]), 0, 0);
        const start = startDate.getTime();
        const it = channelsByName(live, [film.channel], 14)[0] || null;
        // Film yayını, kullanıcının kanal listesinde bulunmasa da rehberde gösterilir.
        const id = it ? String(it.id) : 'film-source:' + film.channel.toLocaleLowerCase('tr-TR').replace(/[^\\p{L}\\p{N}]+/gu, '-');
        const channel = it ? it.name : film.channel;
        if (it) channelIds.add(String(it.id));
        mapped.push({ id, channel, p: { s: start, e: start + 120 * 60000, t: film.title, d: '', c: 'Film', u: true }, sourceChannel: film.channel, sourceOnly: !it });
      }
      if (token !== filmLoadToken) return;
      filmSource = { loaded: true, loading: false, films: result.films, entries: mapped, channels: [...channelIds], fetchedAt: result.fetchedAt, error: '' };
    } catch (e) {
      if (token !== filmLoadToken) return;
      filmSource = { ...filmSource, loading: false, error: String((e && e.message) || e || 'Kaynak alınamadı') };
    }
    if (root.isConnected) draw();
  }

  const page = openPage({
    title: 'Bugün TV’de',
    cls: 'td-pg',
    html: `<div class="chips" id="td-kinds" role="group" aria-label="Tür"></div>
      <div class="td-bar"><div class="chips" id="td-opts" role="group" aria-label="Süzgeç"></div></div>
      <div id="td-list" class="td-list"></div>`,
    mount: () => {},
  });
  const root = page.el;
  const q = (s) => $(s, root);
  const byId = () => {
    const map = new Map(env.liveItems().map((it) => [String(it.id), it]));
    for (const x of filmSource.entries) {
      if (x.sourceOnly && !map.has(String(x.id))) map.set(String(x.id), { id: String(x.id), name: x.sourceChannel, logo: '' });
    }
    return map;
  };
  function seriesEntries() {
    if (!seriesData || !Array.isArray(seriesData.days)) return [];
    const from = istDayStart(now(), day);
    const idx = dayIndex(from);
    const items = env.liveItems() || [];
    const out = [];
    for (const r of seriesData.days[idx] || []) {
      if (isSportsChannel(r.channel)) continue;
      const it = channelsByName(items, [r.channel])[0];
      if (!it || (sel.length && !sel.includes(it.id))) continue;
      const m = /^(\\d{1,2}):(\\d{2})$/.exec(r.time || '');
      const start = Number.isFinite(Number(r.startAt)) && r.startAt != null ? Number(r.startAt) : m
        ? (() => { const d = new Date(from + IST_MS); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Number(m[1]), Number(m[2])) - IST_MS; })()
        : NaN;
      if (!Number.isFinite(start)) continue;
      const end = r.endAt != null && Number.isFinite(Number(r.endAt)) ? Number(r.endAt) : start + 150 * 60000;
      out.push({ id: it.id, channel: it.name, p: { s: start, e: end, t: r.title, d: [r.ep, r.status].filter(Boolean).join(' · '), c: 'Dizi' } });
    }
    return out;
  }

  function entries() {
    const t = now();
    if (sel.length) {
      const map = byId();
      const out = [];
      for (const id of sel) {
        const it = map.get(id);
        if (it) for (const p of env.listFor(it)) out.push({ id: it.id, channel: it.name, p });
        out.push(...seriesEntries().filter((x) => x.id === id));
      }
      return seriesEntries().concat(out);
    }
    const from = dayStart(t, 0);
    const map = byId();
    return seriesEntries().concat(env.epgBetween(from, from + 3 * 24 * 3600e3).map((h) => ({ id: h.id, channel: (map.get(h.id) || {}).name || '', p: h.p })));
  }

  function reminderIds() {
    try { return new Set(((env.reminders && env.reminders.list()) || []).filter((x) => x && x.kind === 'rem').map((x) => x.id)); }
    catch { return new Set(); }
  }

  function toggleReminder(it, p) {
    if (!env.reminders || !p || !Number.isFinite(p.s) || p.s <= now()) return;
    const id = planId('rem', it.id, p.s, env.sourceId ? env.sourceId() : 'today');
    if (reminderIds().has(id)) {
      env.reminders.remove(id);
      env.toast && env.toast('Hatırlatıcı kaldırıldı', 1800);
    } else {
      const plan = makePlan('rem', it, p, { src: env.sourceId ? env.sourceId() : 'today' });
      env.reminders.set(plan);
      env.toast && env.toast('Film hatırlatıcısı kuruldu', 2000);
    }
    draw();
  }

  function draw() {
    const t = now();
    const ready = env.epgReady() || !!seriesData || (kind === 'film' && day === 0 && filmSource.loaded);
    const allEntries = entries();
    const externalFilmDay = day === 0 && filmSource.loaded && filmSource.entries.length > 0;
    const sourceFilmEntries = externalFilmDay ? filmSource.entries.filter((x) => x.sourceOnly || !sel.length || sel.includes(String(x.id))) : [];
    const filmEntries = externalFilmDay
      ? sourceFilmEntries.filter((x) => filmSel == null || filmSel.includes(String(x.id)))
      : filmSel == null
        ? allEntries.filter((x) => channelKind(x.channel) === 'film' && kindOf(x.p) === 'film')
        : allEntries.filter((x) => filmSel.includes(String(x.id)) && kindOf(x.p) === 'film');
    const resAll = ready ? todayRows({ entries: allEntries, kind, now: t, day, includePast: past && day === 0 }) : { rows: [], counts: { spor: 0, film: 0, dizi: 0 }, truncated: false };
    const resFilm = ready ? todayRows({ entries: filmEntries, kind: 'film', now: t, day, includePast: past && day === 0 }) : { rows: [], counts: { spor: 0, film: 0, dizi: 0 }, truncated: false };
    const res = {
      rows: kind === 'film' ? resFilm.rows : resAll.rows,
      counts: { ...resAll.counts, film: resFilm.counts.film },
      truncated: kind === 'film' ? resFilm.truncated : resAll.truncated,
    };
    q('#td-kinds').innerHTML = KINDS.map(([id, label]) => `<button class="chip${id === kind ? ' on' : ''}" data-kind="${id}"${id === kind ? ' data-autofocus' : ''}>${label}<small>${res.counts[id]}</small></button>`).join('');
    q('#td-opts').innerHTML =
      `<button class="chip${day === 0 ? ' on' : ''}" data-day="0">Bugün</button><button class="chip${day === 1 ? ' on' : ''}" data-day="1">Yarın</button>` +
      (day === 0 ? `<button class="chip${past ? ' on' : ''}" data-past aria-pressed="${past}">Bitenler</button>` : '') +
      `<button class="chip" data-pick>${icon('tv')} Kanallar<small>${sel.length ? sel.length : 'Tümü'}</small></button>` +
      (kind === 'film' ? `<button class="chip" data-film-pick>Film kanalları<small>${filmSel == null ? 'Otomatik' : filmSel.length}</small></button>` : '');
    page.setTitle(`${day ? 'Yarın' : 'Bugün'} TV’de · ${new Date(dayStart(t, day)).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`);
    const el = q('#td-list');
    if (kind === 'film' && day === 0 && filmSource.loading && !filmSource.loaded) {
      el.innerHTML = '<div class="empty"><h3>Film yayın akışı yükleniyor…</h3><p>TV yayın akışı kaynağından bugünün filmleri alınıyor.</p></div>';
      return;
    }
    if (kind === 'film' && day === 0 && filmSource.error && !filmSource.loaded) {
      el.innerHTML = `<div class="empty"><h3>Film yayın akışı alınamadı</h3><p>${esc(filmSource.error)}</p><button class="btn sm" data-film-refresh>Tekrar dene</button></div>`;
      return;
    }
    if (kind === 'film' && day === 0 && filmSource.loaded && filmSource.films.length && !filmSource.entries.length) {
      el.innerHTML = `<div class="empty"><h3>${filmSource.films.length} film bulundu, kanal eşleşmedi</h3><p>Yayın akışı alındı ancak listedeki kanal adları canlı kanal listenizle eşleşmedi. Film kanalları listesini ve kanal adlarını kontrol edin.</p><button class="btn sm" data-film-refresh>Yenile</button></div>`;
      return;
    }
    if (!ready) {
      el.innerHTML = '<div class="empty"><h3>TV rehberi yok</h3><p>Programlar TV rehberinden gelir. Ayarlar &gt; TV rehberi bölümünden rehber adresi ekleyin ya da listenizin rehberini yenileyin.</p></div>';
      return;
    }
    if (!res.rows.length) {
      const what = KIND_EMPTY[kind];
      el.innerHTML = `<div class="empty"><h3>${day ? 'Yarın' : 'Bugün'} ${what} programı yok</h3><p>${sel.length ? 'Seçili kanallarda bulunamadı. “Kanallar” düğmesinden başka kanal seçebilir ya da tümünü gösterebilirsiniz.' : 'Rehberde bu türde program bulunamadı.'}${day === 0 && !past ? ' Bitenleri görmek için “Bitenler”e dokunun.' : ''}</p></div>`;
      return;
    }
    const map = byId();
    const reminders = reminderIds();
    const sourceNote = kind === 'film' && day === 0 && externalFilmDay
      ? '<p class="hint" style="padding:0 12px 8px">Kaynak: TV Yayın Akışı · ' + filmSource.films.length + ' yayın / ' + filmSource.channels.length + ' eşleşen kanal</p>'
      : '';
    const html = res.rows
      .map(({ id, p, state }, i) => {
        const it = map.get(id);
        if (!it) return '';
        const mins = Math.max(1, Math.round((p.e - p.s) / 60000));
        return `<div class="td-r ${state}" role="button" tabindex="0" data-i="${i}">
          <div class="td-t"><time>${fmtClock(p.s)}</time>${state === 'now' ? '<b class="td-now">ŞİMDİ</b>' : `<small>${p.u ? '' : `${mins} dk`}</small>`}</div>
          <div class="td-m"><b>${esc(p.t || 'Program')}</b><span>${esc(it.name)}${p.c ? ` · ${esc(p.c.split(' / ')[0])}` : ''}</span></div>${logo(it.logo, it.name)}</div>`;
      })
      .join('');
    el.innerHTML = sourceNote + html + (res.truncated ? '<p class="hint td-more">Çok program var; ilk 400 gösteriliyor. Kanalları seçerek daraltın.</p>' : '');
    el._rows = res.rows;
  }

  function pick(filmOnly = false) {
    let term = '';
    if (filmOnly && filmSel == null) filmSel = normalizeChannels(filmSource.loaded && filmSource.channels.length ? filmSource.channels : env.liveItems().filter((it) => channelKind(it.name) === 'film').map((it) => it.id));
    const all = () => env.liveItems().filter((it) => env.listFor(it).length > 0);
    const pg = openPage({
      title: filmOnly ? 'Film kanallarını seç' : 'Kanalları seç',
      cls: 'td-pg td-pick',
      html: `<div class="td-ptools"><input id="td-q" type="search" placeholder="Kanal ara…" autocomplete="off"><button class="btn sm ghost" id="td-clear">${filmOnly ? 'Otomatik film kanalları' : 'Tümü (seçimi temizle)'}</button></div><p class="hint" id="td-ph"></p><div id="td-pl" class="td-list"></div>`,
      mount: () => {},
    });
    const pq = (s) => $(s, pg.el);
    const render = () => {
      const t = fold(term);
      const items = all();
      const pickItems = filmOnly && filmSource.loaded
        ? [...new Map([...items, ...env.liveItems().filter((it) => filmSource.channels.includes(String(it.id)))].map((it) => [String(it.id), it])).values()]
        : items;
      const chosen = new Set(filmOnly ? (filmSel || []) : sel);
      const shown = pickItems.filter((it) => !t || fold(it.name).includes(t)).sort((a, b) => Number(chosen.has(b.id)) - Number(chosen.has(a.id))).slice(0, 150);
      pq('#td-ph').textContent = filmOnly ? 'Yalnız seçtiğiniz kanallardaki EPG tarafından açıkça Film/Sinema olarak tanımlanan programlar gösterilir. Tür bilgisi olmayan yayınlar tahminle eklenmez.' : (sel.length ? `${sel.length} kanal seçili. Yalnız bu kanalların programları gösterilir.` : 'Hiçbiri seçili değil: bütün rehber kanalları gösterilir. Rehberi olan kanallar listelenir.');
      pq('#td-pl').innerHTML = shown.length
        ? shown.map((it) => `<div class="td-c${chosen.has(it.id) ? ' on' : ''}" role="button" tabindex="0" data-id="${esc(it.id)}" aria-pressed="${chosen.has(it.id)}">${logo(it.logo, it.name)}<div class="td-m"><b>${esc(it.name)}</b><span>${esc(it.group || '')}</span></div><i class="td-ck">${chosen.has(it.id) ? icon('check') : ''}</i></div>`).join('')
        : '<div class="empty"><p>Kanal bulunamadı. Yalnız TV rehberi bilgisi olan kanallar listelenir.</p></div>';
    };
    pg.el.addEventListener('click', (e) => {
      if (e.target.closest('#td-clear')) {
        if (filmOnly) {
          filmSel = null;
          env.setFilmChannels && env.setFilmChannels(null);
        } else {
          sel = [];
          env.setChannels(sel);
        }
        render();
        draw();
        return;
      }
      const c = e.target.closest('.td-c');
      if (!c) return;
      const id = c.dataset.id;
      if (filmOnly) {
        const chosen = filmSel || [];
        filmSel = chosen.includes(id) ? chosen.filter((x) => x !== id) : normalizeChannels([...chosen, id]);
        env.setFilmChannels && env.setFilmChannels(filmSel);
      } else {
        sel = sel.includes(id) ? sel.filter((x) => x !== id) : normalizeChannels([...sel, id]);
        env.setChannels(sel);
      }
      render();
      draw(); // arkadaki liste hemen yeni seçimle çizilir
    });
    pg.el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('td-c')) {
        e.preventDefault();
        e.target.click();
      }
    });
    pq('#td-q').addEventListener('input', (e) => {
      term = e.target.value;
      render();
    });
    render();
  }

  root.addEventListener('click', (e) => {
    const k = e.target.closest('[data-kind]');
    if (k) {
      kind = k.dataset.kind;
      return draw();
    }
    const d = e.target.closest('[data-day]');
    if (d) {
      day = Number(d.dataset.day);
      if (day) past = false;
      return draw();
    }
    if (e.target.closest('[data-past]')) {
      past = !past;
      return draw();
    }
    if (e.target.closest('[data-pick]')) return pick(false);
    if (e.target.closest('[data-film-refresh]')) return refreshFilmSource();
    if (e.target.closest('[data-film-pick]')) return pick(true);
    const r = e.target.closest('.td-r');
    if (r) {
      const row = (q('#td-list')._rows || [])[Number(r.dataset.i)];
      const it = row && byId().get(row.id);
      if (it && e.target.closest('[data-bell]')) return toggleReminder(it, row.p);
      if (it && !String(it.id).startsWith('film-source:')) env.programSheet(it, row.p);
      else if (it && env.toast) env.toast('Bu yayın akışındaki kanal canlı listenizde bulunmuyor.', 2500);
    }
  });
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('td-r')) {
      e.preventDefault();
      e.target.click();
    }
  });

  draw();
  if (env.net) refreshFilmSource();
  if (env.net) loadSeriesWeek({ net: env.net, nowMs: now() }).then((r) => {
    seriesData = r;
    if (root.isConnected) draw();
  }).catch(() => {});
  // şimdi/biten durumu dakikada bir yenilenir
  const timer = setInterval(() => {
    if (!root.isConnected) return clearInterval(timer);
    draw();
  }, 60e3);
  return page;
}
