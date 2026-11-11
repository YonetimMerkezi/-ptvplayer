// Maç ayrıntı sayfası: skor/durum, yayın kanalları, olaylar, istatistik, kadro. Sporlar ekranından lazy yüklenir.
// Yayın bölümü odaklanabilir satırlar içerir ve en üstte durur; altındaki içerik salt okunurdur, böylece kumandada aşağı ok
// sayfayı yarım ekran adımlarla kaydırır (alttaki bir düğmeye sıçramaz).
import { esc, fmtClock } from './util.js';
import { $, icon, openPage } from './ui.js';
import { ESPN_BASE, LEAGUES, findPrograms, dayStart, dayLabel, noScore } from './sports.js';
import { loadSummary, KIND_LABEL, broadcastGroups } from './sports-detail.js';
import { sideLogo, logoHtml } from './sports-logos.js';

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
  const tag = e.detail ? `<small> (${esc(e.detail)})</small>` : '';
  const sc = e.score ? `<small class="sd-sc"> ${esc(e.score)}</small>` : '';
  // Oyuncu değişikliği: giren ve çıkan ayrı ayrı yazılır (yön belli olsun)
  if (e.kind === 'sub') return `<span class="sd-sub"><span class="in"><i aria-hidden="true">▲</i><b>${esc(who || lab)}</b></span>${e.other ? `<span class="out"><i aria-hidden="true">▼</i>${esc(e.other)}</span>` : ''}</span>`;
  if (e.kind === 'own') return `<b>${esc(who)}</b><small> (kendi kalesine)</small>${sc}`;
  if (e.kind === 'penmiss') return `<b>${esc(who)}</b><small> (penaltı kaçtı)</small>`;
  if (e.kind === 'goal') return `<b>${esc(who || lab)}</b>${tag}${sc}`;
  if (who) return `<b>${esc(who)}</b>${tag}`;
  return `<small>${esc(e.text || lab)}${e.detail ? ` (${esc(e.detail)})` : ''}</small>`;
}

const MARK_LABEL = { ht: 'Devre arası', ft: 'Maç sonu' };

// env: { net, toast, liveItems, epgBetween, play(items, index), tvOf(m), ensureTv(m), badgeOf?(takım adı), remind?: { leads, label(dk), can(m), get(m), set(m, dk), clear(m), last() }, base?, now? }
export function openMatchDetail(env, m) {
  const base = env.base || ESPN_BASE;
  const now = env.now || (() => Date.now());
  const teamLogo = (side, other) => logoHtml(sideLogo(side, other, env.badgeOf), side.label, esc);
  const lgName = (LEAGUES.find((l) => l.id === m.lg) || {}).name || m.lgName || '';
  const lite = m.src === 'ls' || m.src === 'se'; // ESPN dışı maç: olay/istatistik/kadro ayrıntısı yok, yalnız skor, durum ve yayın
  let data = null;
  let loading = false;
  let err = '';
  let errDetail = '';
  let fetchedAt = 0;
  let timer = 0;
  let chans = [];
  let groups = [];
  let wasDone = m.state === 'post' || !!m.off;

  const page = openPage({
    title: 'Maç ayrıntısı',
    cls: 'sd-pg',
    html: `<div class="sd">
      <div class="sd-head"><button class="icon-btn" id="sd-ref" aria-label="Ayrıntıyı yenile">${icon('refresh')}</button><div id="sd-top"></div><div class="sd-rem" id="sd-rem"></div></div>
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
    const none = noScore(m, now()); // yalnız takvimden gelen, saati çoktan geçmiş maç: skor bilinmiyor
    const mid = hs !== '' && as !== '' ? `<b class="sd-score">${esc(hs)} – ${esc(as)}</b>` : `<b class="sd-score sd-vs">${none ? '– –' : fmtClock(m.t)}</b>`;
    const pen = m.home.pen != null && m.away.pen != null && st.state === 'post' ? `<small class="sd-pen">Penaltılar ${m.home.pen}–${m.away.pen}</small>` : '';
    const stClass = st.state === 'in' ? 'sd-st live' : 'sd-st';
    const stText = none && st.state === 'pre' ? `Skor alınamadı · ${esc(dayLabel(dayStart(m.t), now()))} ${fmtClock(m.t)}` : st.state === 'pre' && !st.off ? `${esc(dayLabel(dayStart(m.t), now()))} · ${fmtClock(m.t)}` : esc(st.text || '');
    const where = [(data && data.venue) || m.venue, data && data.city].filter(Boolean).join(', ');
    const meta = [where, data && data.referee ? `Hakem: ${data.referee}` : '', data && data.attendance ? `Seyirci: ${data.attendance.toLocaleString('tr-TR')}` : ''].filter(Boolean);
    q('#sd-top').innerHTML = `<div class="sd-lg">${esc(lgName)}${m.round ? ` <small>· ${esc(m.round)}</small>` : ''}</div>
      <div class="sd-teams"><div class="sd-team">${teamLogo(m.home, m.away)}<span>${esc(m.home.label)}</span></div>
        <div class="sd-mid">${mid}<span class="${stClass}">${stText}</span>${pen}</div>
        <div class="sd-team">${teamLogo(m.away, m.home)}<span>${esc(m.away.label)}</span></div></div>
      ${meta.length ? `<div class="sd-meta">${meta.map(esc).join(' · ')}</div>` : ''}`;
  }

  // Hatırlatıcı: maçtan ne kadar önce haber verileceği (seçili süreye dokunmak kaldırır). Yalnız başlamamış maçta görünür;
  // yenilemede değişmediyse yeniden çizilmez (kumanda odağı kaybolmasın).
  const rem = env.remind || null;
  let drawnRem = '';
  function drawRemind(focusLead) {
    const el = q('#sd-rem');
    if (!el) return;
    const st = data && data.status ? data.status.state : m.state;
    let html = '';
    if (rem && st === 'pre' && !m.off && rem.can(m)) {
      const cur = rem.get(m);
      const chips = rem.leads.map((min) => `<button class="chip${cur && cur.lead === min ? ' on' : ''}" data-lead="${min}">${esc(rem.label(min))}</button>`).join('');
      const note = cur ? `Hatırlatıcı kurulu · ${fmtClock(cur.s - cur.lead * 60000)}` : 'Maçtan ne kadar önce hatırlatılsın?';
      html = `<div class="sd-rem-h">${icon('bell')}<span>${esc(note)}</span></div><div class="chips sd-rem-c">${chips}</div>`;
    }
    if (html === drawnRem) return;
    drawnRem = html;
    el.innerHTML = html;
    if (focusLead != null) {
      const f = el.querySelector(`[data-lead="${focusLead}"]`);
      if (f && f.focus) f.focus({ preventScroll: true });
    }
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

  function drawBroadcast() {
    const el = q('#sd-bc');
    const done = (data && data.status ? data.status.state : m.state) === 'post' || m.off;
    let html = '<h4>Yayın</h4>';
    if (done) {
      html += `<p class="sd-note">${m.off ? esc(m.text) : 'Maç sona erdi.'}</p>`;
      groups = [];
    } else {
      drawnTv = tvKey();
      groups = broadcastGroups({ epgChans: chans, tvNames: (env.tvOf && env.tvOf(m)) || [], items: (env.liveItems && env.liveItems()) || [] });
      html += groups.length ? groups.map(groupHtml).join('') : '<p class="sd-note">Bu maç için yayın bilgisi bulunamadı.</p>';
    }
    el.innerHTML = html;
  }

  function eventsHtml(d) {
    if (!d.events.length) return '';
    const rows = d.events
      .map((e) => {
        if (e.mark) return `<div class="sd-e mark"><div class="sd-mk">${esc(MARK_LABEL[e.kind] || '')}${e.score ? ` · ${esc(e.score)}` : ''}</div></div>`;
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
        ? '<p class="sd-note">Bu maç için olay, istatistik ve kadro bilgisi yok.</p>'
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
      if (lite) {
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
    drawRemind();
    const done = live() === 'post' || !!m.off;
    if (done !== wasDone) {
      wasDone = done;
      drawBroadcast(); // maç bitti: kanal satırları yerine "sona erdi" notu
    }
    drawBody();
    drawStatus();
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('#sd-ref') || e.target.closest('#sd-retry')) return refresh();
    const ld = rem && e.target.closest('[data-lead]');
    if (ld) {
      const min = Number(ld.dataset.lead);
      const cur = rem.get(m);
      if (cur && cur.lead === min) rem.clear(m);
      else rem.set(m, min);
      return drawRemind(min);
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
  drawRemind();
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
