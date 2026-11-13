// "Dizi akışı" ekranı: haftalık 1001dizi takvimi, bugün/yarın için ücretsiz EPG tamamlaması ve hatırlatıcılar.
// Satıra dokununca kanal kullanıcının listesinde bulunursa açılır; zil dizi başlamadan önce hatırlatıcı kurar (Planlananlar'da görünür).
import { esc, fmtClock } from './util.js';
import { $, icon, openPage } from './ui.js';
import { WEEKDAYS, dayIndex, loadSeriesWeek, isSportsChannel } from './series-flow.js';
import { istDayStart, IST_MS } from './epg-free.js';
import { channelsByName } from './sports-tv.js';
import { MATCH_LEAD_DEFAULT, leadLabel } from './plan.js';

const CACHE_KEY = 'series-flow:v1';
const FRESH_MS = 3 * 3600e3;
const MAX_AGE = 8 * 864e5; // yalnız aynı yayın haftasının önbelleği kullanılabilir
const SHOW_MS = 150 * 60e3; // dizi en çok bu kadar sürüyor sayılır ("şimdi" göstergesi)
const REM_PREFIX = 'drem:';

const istDateKey = (ms) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const part = (type) => parts.find((x) => x.type === type)?.value || '';
  return part('year') + '-' + part('month') + '-' + part('day');
};
const weekKey = (ms) => {
  const d = new Date(istDateKey(ms) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

// env: { net, store, toast, liveItems(), play(items, index), reminders: { list(), set(plan), remove(id) }, now?, base? }
export function openSeriesFlow(env) {
  const { net, store } = env;
  const now = env.now || (() => Date.now());
  let data = null; // { at, days, via, failed, note, coverageDays, weekKey }
  let busy = false;
  let err = null;
  let pos = 0; // 0 = bugün … 6 = bugünden 6 gün sonra
  let alignToNow = true;
  let chan = ''; // kanal süzgeci ('' = hepsi)
  let showDiag = false; // kaynak ayrıntısı (neden yedek kaynak, ayrıştırıcının gördüğü ham kartlar)

  const page = openPage({
    title: 'Dizi akışı',
    cls: 'td-pg sf-pg',
    html: `<div class="chips" id="sf-days" role="group" aria-label="Gün"></div><div class="chips" id="sf-chs" role="group" aria-label="Kanal"></div><small class="st-upd" id="sf-note" aria-live="polite"></small><div class="hint sp-detail sf-diag" id="sf-diag" hidden></div><div id="sf-list" class="td-list"></div>`,
    mount: () => {},
  });
  const root = page.el;
  const q = (s) => $(s, root);

  // Pozisyon p için: İstanbul takviminde Pazartesi tabanlı gün sırası ve gün başlangıcı.
  const dayOf = (p) => {
    const from = istDayStart(now(), p);
    return { idx: dayIndex(from), from };
  };
  const startOf = (from, time) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(time || '');
    if (!m) return null;
    const d = new Date(from + IST_MS);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Number(m[1]), Number(m[2])) - IST_MS;
  };

  const remIds = () => {
    try {
      return new Set(((env.reminders && env.reminders.list()) || []).filter((x) => x && typeof x.id === 'string' && x.id.startsWith(REM_PREFIX)).map((x) => x.id));
    } catch {
      return new Set();
    }
  };

  function rowsOfDay() {
    if (!data) return [];
    const { idx } = dayOf(pos);
    return (data.days[idx] || []).filter((r) => !isSportsChannel(r.channel) && (!chan || r.channel === chan));
  }

  function draw() {
    if (!page.el.isConnected) return;
    const t = now();
    const days = data ? data.days : WEEKDAYS.map(() => []);
    q('#sf-days').innerHTML =
      Array.from({ length: 7 }, (_, p) => {
        const { idx } = dayOf(p);
        const label = p === 0 ? 'Bugün' : p === 1 ? 'Yarın' : WEEKDAYS[idx][1];
        return `<button class="chip${p === pos ? ' on' : ''}" data-pos="${p}"${p === pos ? ' data-autofocus' : ''}>${label}${data ? `<small>${days[idx].length}</small>` : ''}</button>`;
      }).join('') + `<button class="chip" data-refresh aria-label="Yenile"${busy ? ' disabled' : ''}>${icon('refresh')}${busy ? 'Yükleniyor…' : 'Yenile'}</button>`;

    const { idx, from } = dayOf(pos);
    const all = data ? (data.days[idx] || []).filter((r) => !isSportsChannel(r.channel)) : [];
    const chs = [...new Set(all.map((r) => r.channel).filter(Boolean))].sort((a, b) => all.filter((r) => r.channel === b).length - all.filter((r) => r.channel === a).length || a.localeCompare(b, 'tr')).slice(0, 14);
    if (chan && !chs.includes(chan)) chan = '';
    q('#sf-chs').innerHTML = chs.length > 1 ? `<button class="chip${chan ? '' : ' on'}" data-chan="">Tümü</button>` + chs.map((c) => `<button class="chip${c === chan ? ' on' : ''}" data-chan="${esc(c)}">${esc(c)}</button>`).join('') : '';

    const when = new Date(from).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long', day: 'numeric', month: 'long' });
    page.setTitle(`Dizi akışı · ${when}`);
    const note = q('#sf-note');
    const diag = q('#sf-diag');
    const hasDiag = !!(data && (data.coverageDays === 2 || (data.failed && data.failed.length)) && data.note);
    if (data) {
      const base = data.coverageDays === 2 ? `Bugün + yarın (${data.via}) · ` : `${data.via} · `;
      const text = err ? `Güncellenemedi · kayıtlı veri (${fmtClock(data.at)})` : `${base}Son güncelleme ${fmtClock(data.at)}${data.failed && data.failed.length ? ` · ${data.failed.length} gün alınamadı` : ''}`;
      note.innerHTML = `${esc(text)}${hasDiag ? ` <button class="chip" data-diag>${showDiag ? 'Ayrıntıyı gizle' : 'Ayrıntı'}</button>` : ''}`;
    } else note.textContent = '';
    diag.hidden = !(hasDiag && showDiag);
    diag.textContent = hasDiag && showDiag ? [data.note].filter(Boolean).join('\n') : '';

    const el = q('#sf-list');
    if (!data) {
      el.innerHTML = busy
        ? '<div class="empty"><p>Dizi akışı yükleniyor…</p></div>'
        : `<div class="empty"><h3>Dizi akışı alınamadı</h3><p>${esc((err && err.message) || 'Sayfalara ulaşılamadı.')}</p>${err && err.detail ? `<p class="hint sp-detail">${esc(err.detail)}</p>` : ''}<button class="btn" id="sf-retry">Yeniden dene</button></div>`;
      return;
    }
    const rows = rowsOfDay();
    if (!rows.length) {
      el.innerHTML = `<div class="empty"><h3>${pos === 0 ? 'Bugün' : esc(WEEKDAYS[idx][1])} için dizi bulunamadı</h3><p>${chan ? 'Seçili kanalda dizi yok; “Tümü”ne dokunun.' : data.coverageDays === 2 && pos > 1 ? 'Ücretsiz EPG kaynağı yalnızca bugün ve yarın için dizi bilgisi sağlıyor.' : 'Bu gün sayfası boş geldi ya da alınamadı. “Yenile” ile tekrar deneyin.'}</p>${data.note ? `<p class="hint sp-detail">${esc(data.note)}</p>` : ''}</div>`;
      el._rows = [];
      return;
    }
    const ids = remIds();
    el.innerHTML = rows
      .map((r, i) => {
        const s = r.startAt || startOf(from, r.time);
        const endAt = r.endAt || (s == null ? null : s + SHOW_MS);
        const state = pos !== 0 || s == null ? '' : t >= endAt ? 'past' : t >= s ? 'now' : '';
        const canBell = env.reminders && s != null && s > t && !r.off;
        const on = ids.has(REM_PREFIX + s + ':' + r.slug);
        const sub = [r.ep, r.status].filter(Boolean).join(' · ');
        const channelItem = channelsByName(env.liveItems ? env.liveItems() : [], [r.channel])[0];
        const channelMark = channelItem ? `<span class="sf-channel">${channelItem.logo ? `<img src="${esc(channelItem.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<span>${esc(r.channel)}</span></span>` : `<span>${esc(r.channel)}</span>`;
        return `<div class="td-r sf-r ${state}${r.off ? ' off' : ''}" role="button" tabindex="0" data-i="${i}">
          <div class="td-t"><time>${esc(r.time || '—')}</time>${state === 'now' ? '<b class="td-now">ŞİMDİ</b>' : ''}</div>
          <div class="td-m"><b>${esc(r.title)}</b><span>${channelMark}${sub ? ` · ${esc(sub)}` : ''}</span></div>${canBell ? `<button class="sp-bell${on ? ' on' : ''}" tabindex="0" data-bell aria-label="${on ? 'Hatırlatıcıyı kaldır' : 'Dizi için hatırlat'}" title="${on ? 'Hatırlatıcıyı kaldır' : 'Dizi için hatırlat'}">${icon('bell')}</button>` : ''}</div>`;
      })
      .join('');
    el._rows = rows;
    // Bugünün ekranı ilk açıldığında görünüm şu anki yayına hizalanır.
    // Geçmiş kayıtlar listenin üstünde kalır; kullanıcı yukarı kaydırarak geriye gidebilir.
    if (pos === 0 && alignToNow) {
      const target = el.querySelector('.sf-r.now') || [...el.querySelectorAll('.sf-r')].find((node) => {
        const row = rows[Number(node.dataset.i)];
        const start = row && (row.startAt || startOf(from, row.time));
        return start != null && start >= t;
      });
      if (target) el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top;
      alignToNow = false;
    }
  }

  async function persist() {
    try {
      await store.cache.set(CACHE_KEY, { at: data.at, weekKey: weekKey(data.at), dateKey: istDateKey(data.at), data: { ...data, weekKey: weekKey(data.at) } });
    } catch {
      /* kayıt başarısız olsa da liste çalışır */
    }
  }

  async function refresh(force = false) {
    if (busy) return;
    busy = true;
    draw();
    try {
      const r = await loadSeriesWeek({ net, base: env.base, nowMs: now() });
      // İki günlük EPG yedeği, aynı haftanın geçerli 7 günlük önbelleğini asla ezmez.
      if (r.coverageDays === 2 && data && data.coverageDays !== 2 && data.weekKey === weekKey(now())) throw Object.assign(new Error('Yalnız bugün ve yarının listesi alınabildi'), { detail: r.note });
      data = { at: now(), weekKey: weekKey(now()), ...r };
      err = null;
      persist();
    } catch (e) {
      err = e;
      if (force && env.toast) env.toast('Dizi akışı güncellenemedi', 2200);
    } finally {
      busy = false;
    }
    draw();
  }

  function toggleBell(r, from) {
    const s = r.startAt || startOf(from, r.time);
    if (s == null || !env.reminders) return;
    const id = REM_PREFIX + s + ':' + r.slug;
    if (remIds().has(id)) {
      env.reminders.remove(id);
      env.toast && env.toast('Hatırlatıcı kaldırıldı', 1800);
    } else {
      const it = channelsByName(env.liveItems ? env.liveItems() : [], [r.channel])[0];
      const lead = MATCH_LEAD_DEFAULT;
      env.reminders.set({
        id, kind: 'rem', src: 'dizi', lead, chId: it ? it.id : '', chName: r.channel,
        title: r.ep ? `${r.title} · ${r.ep}` : r.title,
        s, e: r.endAt || s + SHOW_MS, at: s - lead * 60000,
      });
      env.toast && env.toast(`Hatırlatıcı kuruldu · ${leadLabel(lead)}`, 2000);
    }
    draw();
  }

  root.addEventListener('click', (e) => {
    const d = e.target.closest('[data-pos]');
    if (d) {
      pos = Number(d.dataset.pos);
      alignToNow = pos === 0;
      return draw();
    }
    const c = e.target.closest('[data-chan]');
    if (c) {
      chan = c.dataset.chan;
      return draw();
    }
    if (e.target.closest('[data-diag]')) {
      showDiag = !showDiag;
      return draw();
    }
    if (e.target.closest('[data-refresh]')) return refresh(true);
    if (e.target.closest('#sf-retry')) return refresh(true);
    const row = e.target.closest('.sf-r');
    if (!row) return;
    const r = (q('#sf-list')._rows || [])[Number(row.dataset.i)];
    if (!r) return;
    if (e.target.closest('[data-bell]')) return toggleBell(r, dayOf(pos).from);
    const items = channelsByName(env.liveItems ? env.liveItems() : [], [r.channel]);
    if (!items.length) return env.toast && env.toast(`${r.channel || 'Kanal'} listenizde bulunamadı`, 2400);
    env.play(items, 0);
  });
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('sf-r')) {
      e.preventDefault();
      e.target.click();
    }
  });

  (async () => {
    try {
      const c = await store.cache.get(CACHE_KEY);
      if (c && c.data && Array.isArray(c.data.days) && c.data.days.length === 7 && c.at && now() - c.at < MAX_AGE) {
        const coverage = c.data.coverageDays || (c.data.todayOnly ? 1 : 7);
        const savedWeek = c.weekKey || weekKey(c.at);
        const valid = coverage === 2 ? c.dateKey === istDateKey(now()) : coverage === 7 && !c.data.todayOnly && savedWeek === weekKey(now());
        if (valid) data = { ...c.data, coverageDays: coverage, weekKey: savedWeek };
      }
    } catch {
      /* kayıtlı veri yok */
    }
    draw();
    if (!data || now() - data.at > FRESH_MS) refresh();
  })();

  // şimdi/biten durumu dakikada bir yenilenir
  const timer = setInterval(() => {
    if (!root.isConnected) return clearInterval(timer);
    draw();
  }, 60e3);
  return page;
}
