// Maç ayrıntı sayfası: skor/durum, yayın kanalları, olaylar, istatistik, kadro. Sporlar ekranından lazy yüklenir.
// Yayın bölümü odaklanabilir satırlar içerir ve en üstte durur; altındaki içerik salt okunurdur, böylece kumandada aşağı ok
// sayfayı yarım ekran adımlarla kaydırır (alttaki bir düğmeye sıçramaz).
import { esc, fmtClock } from './util.js';
import { $, icon, openPage } from './ui.js';
import { ESPN_BASE, LEAGUES, findPrograms, dayStart, dayLabel } from './sports.js';
import { loadSummary, KIND_LABEL, broadcastGroups } from './sports-detail.js';

const EPG_BEFORE = 90 * 60000;
const EPG_AFTER = 20 * 60000;
const LIVE_MS = 45e3;

// Kullanıcının kanallarından, rehberinde bu maç görünenlerin hepsi (en yakın başlangıçtan uzağa).
export function channelsFor(env, m) {
  const items = (env.liveItems && env.liveItems()) || [];
  const byId = new Map(items.map((i) => [i.id, i]));
  if (!byId.size || !env.epgBetween) return [];
  let hits = [];
  try {
    hits = (env.epgBetween(m.t - EPG_BEFORE, m.t + EPG_AFTER) || []).filter((h) => byId.has(h.id));
  } catch {
    hits = [];
  }
  const seen = new Set();
  const out = [];
  for (const h of findPrograms(m, hits)) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    out.push({ item: byId.get(h.id), p: h.p });
    if (out.length >= 12) break;
  }
  return out;
}

const flag = (side) => `<span class="sp-flag">${side.logo ? `<img src="${esc(side.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;

function eventIcon(kind) {
  if (kind === 'yellow') return '<i class="sd-card y" aria-hidden="true"></i>';
  if (kind === 'red') return '<i class="sd-card r" aria-hidden="true"></i>';
  if (kind === 'sub') return icon('swap');
  if (kind === 'var') return '<b class="sd-var">VAR</b>';
  return `<span class="sd-ball${kind === 'penmiss' ? ' miss' : ''}">${icon('ball')}</span>`;
}

function eventText(e) {
  const who = e.player;
  const lab = KIND_LABEL[e.kind] || '';
  if (e.kind === 'sub') return `<b>${esc(who || lab)}</b>${e.other ? `<small> ⇄ ${esc(e.other)}</small>` : ''}`;
  if (e.kind === 'own') return `<b>${esc(who)}</b><small> (kendi kalesine)</small>`;
  if (e.kind === 'penmiss') return `<b>${esc(who)}</b><small> (penaltı kaçtı)</small>`;
  if (who) return `<b>${esc(who)}</b>`;
  return `<small>${esc(e.text || lab)}</small>`;
}

// env: { net, toast, liveItems, epgBetween, play(items, index), tvOf(m), tvSrcOf(m), seNearOf(m), ensureTv(m), base?, now? }
export function openMatchDetail(env, m) {
  const base = env.base || ESPN_BASE;
  const now = env.now || (() => Date.now());
  const lgName = (LEAGUES.find((l) => l.id === m.lg) || {}).name || m.lgName || '';
  const ls = m.src === 'ls'; // ikinci kaynak: olay/istatistik/kadro ayrıntısı yok, yalnız skor, durum ve yayın
  let data = null;
  let loading = false;
  let err = '';
  let errDetail = '';
  let fetchedAt = 0;
  let timer = 0;
  let chans = [];
  let groups = [];
  let showAll = false;
  let wasDone = m.state === 'post' || !!m.off;

  const page = openPage({
    title: 'Maç ayrıntısı',
    cls: 'sd-pg',
    html: `<div class="sd">
      <div class="sd-head"><button class="icon-btn" id="sd-ref" aria-label="Ayrıntıyı yenile">${icon('refresh')}</button><div id="sd-top"></div></div>
      <section class="sd-sec" id="sd-bc"></section>
      <div id="sd-body"></div>
      <small class="sd-upd" id="sd-upd" aria-live="polite"></small>
    </div>`,
    mount: () => {},
  });
  const root = page.el;
  const q = (s) => $(s, root);
  const live = () => (data && data.status ? data.status.state : m.state);

  function drawTop() {
    const st = data && data.status ? data.status : { state: m.state, text: m.text, off: m.off };
    const sc = (side) => {
      const v = data && data[side] && data[side].score != null ? data[side].score : m[side].score;
      return v == null ? '' : String(v);
    };
    const hs = sc('home');
    const as = sc('away');
    const mid = hs !== '' && as !== '' ? `<b class="sd-score">${esc(hs)} – ${esc(as)}</b>` : `<b class="sd-score sd-vs">${fmtClock(m.t)}</b>`;
    const pen = m.home.pen != null && m.away.pen != null && st.state === 'post' ? `<small class="sd-pen">Penaltılar ${m.home.pen}–${m.away.pen}</small>` : '';
    const stClass = st.state === 'in' ? 'sd-st live' : 'sd-st';
    const stText = st.state === 'pre' && !st.off ? `${esc(dayLabel(dayStart(m.t), now()))} · ${fmtClock(m.t)}` : esc(st.text || '');
    const where = [(data && data.venue) || m.venue, data && data.city].filter(Boolean).join(', ');
    const meta = [where, data && data.referee ? `Hakem: ${data.referee}` : '', data && data.attendance ? `Seyirci: ${data.attendance.toLocaleString('tr-TR')}` : ''].filter(Boolean);
    q('#sd-top').innerHTML = `<div class="sd-lg">${esc(lgName)}${m.round ? ` <small>· ${esc(m.round)}</small>` : ''}</div>
      <div class="sd-teams"><div class="sd-team">${flag(m.home)}<span>${esc(m.home.label)}</span></div>
        <div class="sd-mid">${mid}<span class="${stClass}">${stText}</span>${pen}</div>
        <div class="sd-team">${flag(m.away)}<span>${esc(m.away.label)}</span></div></div>
      ${meta.length ? `<div class="sd-meta">${meta.map(esc).join(' · ')}</div>` : ''}`;
  }

  // Yayın bölümü: kaynağa göre gruplanmış kanal satırları (rehber, yayın listesi, tahmini yayıncı, diğer spor kanalları). Satırlar odaklanabilir;
  // yenilemede yeniden çizilmez (kumanda odağı kaybolmasın), yalnız maç bitince ya da yayın listesi sonradan gelince tazelenir.
  const tvKey = () => JSON.stringify((env.tvOf && env.tvOf(m)) || []);
  let drawnTv = '';
  function groupHtml(g, gi) {
    const rows = g.channels
      .map((c, i) => `<div class="row sd-ch" role="button" tabindex="0" data-g="${gi}" data-ch="${i}"><div class="meta"><div class="nm"><span>${esc(c.item.name)}</span></div>${c.p ? `<div class="sub">${fmtClock(c.p.s)} · ${esc(c.p.t || '')}</div>` : ''}</div>${icon('play')}</div>`)
      .join('');
    return `<div class="sd-grp"><h5>${esc(g.title)}</h5>${g.note ? `<p class="sd-note">${esc(g.note)}</p>` : ''}${rows ? `<div class="sd-chans">${rows}</div>` : ''}</div>`;
  }

  function nearHtml() {
    const near = (env.seNearOf && env.seNearOf(m)) || [];
    if (!near.length || groups.some((g) => (g.id === 'epg' || g.id === 'tv') && g.channels.length) || ((env.tvOf && env.tvOf(m)) || []).length) return '';
    return `<div class="sd-grp"><h5>Aynı saatteki yayınlar (Spor Ekranı)</h5><p class="sd-note">Bu maç listede bulunamadı; yakın saatteki futbol yayınları:</p><ul class="sd-near">${near
      .map((n) => `<li><b>${esc(n.title)}</b> <small>${esc(n.channels.join(', '))}</small></li>`)
      .join('')}</ul></div>`;
  }

  function drawBroadcast() {
    const el = q('#sd-bc');
    const done = (data && data.status ? data.status.state : m.state) === 'post' || m.off;
    let html = '<h4>Yayın</h4>';
    if (done) {
      html += `<p class="sd-note">${m.off ? esc(m.text) : 'Maç sona erdi.'}</p>`;
      groups = [];
    } else {
      drawnTv = tvKey();
      groups = broadcastGroups({ match: m, epgChans: chans, tvNames: (env.tvOf && env.tvOf(m)) || [], tvSrc: (env.tvSrcOf && env.tvSrcOf(m)) || '', items: (env.liveItems && env.liveItems()) || [] });
      groups.forEach((g, gi) => {
        if (g.id === 'all' && g.collapsed && !showAll) {
          if (g.channels.length) html += `<button class="btn ghost" id="sd-all">${icon('list')}Diğer spor kanallarını göster (${g.channels.length})</button>`;
        } else html += groupHtml(g, gi);
      });
      html += nearHtml();
    }
    html += '<div id="sd-intl"></div>';
    el.innerHTML = html;
    drawIntl();
  }

  function drawIntl() {
    const el = q('#sd-intl');
    if (!el) return;
    const list = (data && data.intl && data.intl.length ? data.intl : m.intl) || [];
    el.innerHTML = list.length
      ? `<p class="sd-note sd-intl">Diğer yayıncılar (ESPN): ${list.map((b) => `${esc(b.name)}${b.region ? ` <small>(${esc(b.region)})</small>` : ''}`).join(', ')}</p>`
      : '';
  }

  function eventsHtml(d) {
    if (!d.events.length) return '';
    const rows = d.events
      .map((e) => {
        const txt = `<div class="sd-et">${eventIcon(e.kind)}<span>${eventText(e)}</span></div>`;
        return `<div class="sd-e ${e.side || 'mid'}"><div class="sd-eh">${e.side === 'home' ? txt : ''}</div><div class="sd-em">${esc(e.minute)}</div><div class="sd-ea">${e.side === 'away' ? txt : ''}${e.side === '' ? txt : ''}</div></div>`;
      })
      .join('');
    return `<section class="sd-sec"><h4>Olaylar</h4><div class="sd-evs">${rows}</div></section>`;
  }

  function statsHtml(d) {
    if (!d.stats.length) return '';
    const rows = d.stats
      .map((s) => {
        const tot = s.hv + s.av;
        const hp = tot > 0 ? Math.round((s.hv / tot) * 100) : 50;
        return `<div class="sd-s"><div class="sd-sv"><b>${esc(s.home)}</b><span>${esc(s.label)}</span><b>${esc(s.away)}</b></div><div class="sd-bar" aria-hidden="true"><i style="width:${hp}%"></i></div></div>`;
      })
      .join('');
    return `<section class="sd-sec"><h4>İstatistik</h4>${rows}</section>`;
  }

  function lineupHtml(d) {
    const col = (side, team) => {
      const l = d.lineups[side];
      if (!l) return '';
      const li = (p) => `<li><span class="n">${esc(p.n)}</span>${esc(p.name)}${p.pos ? ` <small>${esc(p.pos)}</small>` : ''}</li>`;
      return `<div class="sd-lu"><h5>${esc(team.label)}${l.formation ? ` <small>${esc(l.formation)}</small>` : ''}</h5><ul>${l.starters.map(li).join('')}</ul>${l.subs.length ? `<p class="sd-subs"><b>Yedekler:</b> ${l.subs.map((p) => esc(p.name)).join(', ')}</p>` : ''}</div>`;
    };
    const h = col('home', m.home);
    const a = col('away', m.away);
    return h || a ? `<section class="sd-sec"><h4>Kadro</h4><div class="sd-lus">${h}${a}</div></section>` : '';
  }

  function drawBody() {
    const el = q('#sd-body');
    if (!data) {
      el.innerHTML = loading
        ? '<p class="sd-note">Ayrıntılar yükleniyor…</p>'
        : err
          ? `<div class="empty"><h3>Ayrıntı alınamadı</h3><p>${esc(err)}</p>${errDetail ? `<p class="hint sp-detail">Ayrıntı: ${esc(errDetail)}</p>` : ''}<button class="btn" id="sd-retry">Yeniden dene</button></div>`
          : '';
      return;
    }
    const pre = live() === 'pre';
    el.innerHTML =
      eventsHtml(data) + statsHtml(data) + lineupHtml(data) +
      (data.lsOnly
        ? '<p class="sd-note">Bu maç LiveScore kaynağından geliyor; olay, istatistik ve kadro ayrıntısı bu maç için sunulmuyor.</p>'
        : data.empty ? `<p class="sd-note">${pre ? 'Maç başlayınca olaylar, istatistikler ve kadro burada görünür.' : 'Bu maç için ayrıntı verisi bulunamadı.'}</p>` : '');
  }

  function drawStatus() {
    const el = q('#sd-upd');
    if (!el) return;
    el.textContent = loading && fetchedAt ? 'Güncelleniyor…' : err && fetchedAt ? `Güncellenemedi · son veri ${fmtClock(fetchedAt)}` : fetchedAt ? `Son güncelleme ${fmtClock(fetchedAt)}${live() === 'in' ? ' · canlı maçta 45 sn’de bir yenilenir' : ''}` : '';
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    err = '';
    errDetail = '';
    if (!data) drawBody();
    drawStatus();
    try {
      if (ls) {
        data = { status: null, home: { score: null }, away: { score: null }, venue: '', city: '', attendance: 0, referee: '', events: [], stats: [], lineups: {}, intl: [], empty: true, lsOnly: true };
      } else data = await loadSummary({ net: env.net, match: m, base });
      fetchedAt = now();
    } catch (e) {
      err = (e && e.message) || 'Maç ayrıntısı alınamadı';
      errDetail = (e && e.detail) || '';
      if (data && env.toast) env.toast('Ayrıntı güncellenemedi', 2000);
    } finally {
      loading = false;
    }
    if (!root.isConnected) return;
    drawTop();
    const done = live() === 'post' || !!m.off;
    if (done !== wasDone) {
      wasDone = done;
      drawBroadcast(); // maç bitti: kanal satırları yerine "sona erdi" notu
    }
    drawIntl();
    drawBody();
    drawStatus();
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('#sd-ref') || e.target.closest('#sd-retry')) return refresh();
    if (e.target.closest('#sd-all')) {
      showAll = true;
      drawBroadcast();
      const first = q('#sd-bc .sd-grp:last-of-type .sd-ch');
      if (first && first.focus) first.focus({ preventScroll: false });
      return;
    }
    const r = e.target.closest('[data-ch]');
    if (r) {
      const g = groups[Number(r.dataset.g)];
      if (g) env.play(g.channels.map((c) => c.item), Number(r.dataset.ch));
    }
  });
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-ch]')) {
      e.preventDefault();
      e.target.click();
    }
  });

  chans = channelsFor(env, m);
  drawTop();
  drawBroadcast();
  drawBody();
  refresh();
  // yayın listesi sonradan gelirse (ya da tazelenirse) yayın bölümü yenilenir
  if (env.ensureTv) {
    Promise.resolve(env.ensureTv(m))
      .then(() => {
        if (root.isConnected && tvKey() !== drawnTv) drawBroadcast();
      })
      .catch(() => {});
  }
  timer = setInterval(() => {
    if (!root.isConnected) return clearInterval(timer);
    if (live() === 'in' || (live() === 'pre' && m.t - now() < 10 * 60e3)) refresh();
  }, LIVE_MS);

  return page;
}
