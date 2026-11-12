// Puan durumu sayfası: lig seçimi + tablo. Sporlar ekranından ilk dokunuşta yüklenir. Takip edilen takımların satırı ★ ile öne çıkar.
import { esc, fmtClock } from './util.js';
import { $, openPage } from './ui.js';
import { ESPN_BASE } from './sports.js';
import { TABLE_LEAGUES, loadStandings } from './sports-table.js';
import { isFavSide } from './sports-fav.js';

const CACHE_KEY = 'sports-table:v1';
const FRESH_MS = 20 * 60e3;
const MAX_AGE = 12 * 3600e3;

// env: { net, store, toast, base?, now?, favs(): takip listesi, leagueId?: açılışta seçili lig }
export function openStandings(env) {
  const { net, store } = env;
  const base = env.base || ESPN_BASE;
  const now = env.now || (() => Date.now());
  const store$ = new Map(); // lig → { at, groups }
  const pending = new Map();
  const errs = new Map();
  let cur = TABLE_LEAGUES.some((l) => l.id === env.leagueId) ? env.leagueId : TABLE_LEAGUES[0].id;

  const page = openPage({
    title: 'Puan durumu',
    cls: 'sp-pg st-pg',
    html: `<div class="chips" id="st-lgs" role="group" aria-label="Lig"></div><small class="st-upd" id="st-upd" aria-live="polite"></small><div id="st-body" class="st-body"><div class="empty"><p>Puan durumu yükleniyor…</p></div></div>`,
    mount: () => {},
  });
  const root = page.el;
  const q = (s) => $(s, root);

  const num = (v) => (v == null ? '–' : String(v));
  const gd = (v) => (v == null ? '–' : v > 0 ? `+${v}` : String(v));

  function rowHtml(r, favs) {
    const fav = favs.length && isFavSide(favs, { name: r.name, label: r.label });
    const logo = r.logo ? `<img src="${esc(r.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
    return `<tr class="${fav ? 'fav' : ''}"><td class="st-n">${num(r.rank)}</td><td class="st-t"><div class="st-c">${logo}${fav ? '<i class="st-star" aria-label="Takip ediliyor">★</i>' : ''}<span>${esc(r.label)}</span></div></td><td>${num(r.p)}</td><td>${num(r.w)}</td><td>${num(r.d)}</td><td>${num(r.l)}</td><td>${gd(r.gd)}</td><td class="st-p"><b>${num(r.pts)}</b></td></tr>`;
  }

  function tableHtml(groups, favs) {
    return groups
      .map(
        (g) => `${g.name ? `<h4 class="st-gh">${esc(g.name)}</h4>` : ''}<div class="st-wrap"><table class="st-tb"><thead><tr><th>#</th><th class="st-t">Takım</th><th title="Oynanan">O</th><th title="Galibiyet">G</th><th title="Beraberlik">B</th><th title="Mağlubiyet">M</th><th title="Averaj">AV</th><th title="Puan">P</th></tr></thead><tbody>${g.rows.map((r) => rowHtml(r, favs)).join('')}</tbody></table></div>`,
      )
      .join('');
  }

  function draw() {
    if (!page.el.isConnected) return;
    const favs = (env.favs && env.favs()) || [];
    q('#st-lgs').innerHTML = TABLE_LEAGUES.map((l) => `<button class="chip${l.id === cur ? ' on' : ''}" data-lg="${esc(l.id)}"${l.id === cur ? ' data-autofocus' : ''}>${esc(l.name)}</button>`).join('');
    const v = store$.get(cur);
    const body = q('#st-body');
    const upd = q('#st-upd');
    if (v) {
      body.innerHTML = tableHtml(v.groups, favs);
      upd.textContent = errs.has(cur) ? `Güncellenemedi · kayıtlı veri (${fmtClock(v.at)})` : `Son güncelleme ${fmtClock(v.at)}`;
    } else if (pending.has(cur)) {
      body.innerHTML = '<div class="empty"><p>Puan durumu yükleniyor…</p></div>';
      upd.textContent = '';
    } else {
      const e = errs.get(cur);
      body.innerHTML = `<div class="empty"><h3>Puan durumu alınamadı</h3><p>${esc((e && e.message) || 'Bu lig için tablo bulunamadı.')}</p>${e && e.detail ? `<p class="hint sp-detail">${esc(e.detail)}</p>` : ''}<button class="btn" id="st-retry">Yeniden dene</button></div>`;
      upd.textContent = '';
    }
  }

  async function persist() {
    try {
      await store.cache.set(CACHE_KEY, { at: now(), map: [...store$].map(([k, x]) => [k, x]) });
    } catch {
      /* kayıt başarısız olsa da tablo çalışır */
    }
  }

  async function ensure(id, force = false) {
    const v = store$.get(id);
    if (!force && v && now() - v.at < FRESH_MS) return;
    if (pending.has(id)) return;
    const p = (async () => {
      try {
        const groups = await loadStandings({ net, slug: id, base });
        store$.set(id, { at: now(), groups });
        errs.delete(id);
        persist();
      } catch (e) {
        errs.set(id, e);
        if (force && env.toast) env.toast('Puan durumu güncellenemedi', 2200);
      } finally {
        pending.delete(id);
      }
      if (id === cur) draw();
    })();
    pending.set(id, p);
    if (id === cur) draw();
    return p;
  }

  root.addEventListener('click', (e) => {
    const l = e.target.closest('[data-lg]');
    if (l) {
      cur = l.dataset.lg;
      draw();
      const n = q(`#st-lgs [data-lg="${cur}"]`);
      if (n && n.focus) n.focus({ preventScroll: true });
      ensure(cur);
      return;
    }
    if (e.target.closest('#st-retry')) ensure(cur, true);
  });

  (async () => {
    try {
      const c = await store.cache.get(CACHE_KEY);
      if (c && Array.isArray(c.map)) {
        for (const [k, v] of c.map) if (v && Array.isArray(v.groups) && v.at && now() - v.at < MAX_AGE) store$.set(k, v);
      }
    } catch {
      /* kayıtlı veri yok */
    }
    draw();
    ensure(cur);
  })();

  return page;
}
