// Puan durumu sayfası: lig seçimi + tablo. Sporlar ekranından ilk dokunuşta yüklenir. Takip edilen takımların satırı ★ ile öne çıkar.
// Her takım satırı odak alır (kumandada aşağı/yukarı satır satır gezer, sayfa kayar); Tamam (OK) / dokunuş takımı takip eder ya da bırakır.
// ★ Takip ettiklerim: takip edilen takımların tüm liglerdeki satırlarını tek listede toplar.
import { esc, fmtClock } from './util.js';
import { $, openPage } from './ui.js';
import { ESPN_BASE } from './sports.js';
import { TABLE_LEAGUES, loadStandings } from './sports-table.js';
import { isFavSide } from './sports-fav.js';

const CACHE_KEY = 'sports-table:v1';
const FRESH_MS = 20 * 60e3;
const MAX_AGE = 12 * 3600e3;

// env: { net, store, toast, base?, now?, favs(): takip listesi, toggleTeam(side, lg): takibi aç/kapat (Spor ekranının işlevi), leagueId?: açılışta seçili lig }
export function openStandings(env) {
  const { net, store } = env;
  const base = env.base || ESPN_BASE;
  const now = env.now || (() => Date.now());
  const store$ = new Map(); // lig → { at, groups }
  const pending = new Map();
  const errs = new Map();
  let cur = TABLE_LEAGUES.some((l) => l.id === env.leagueId) ? env.leagueId : TABLE_LEAGUES[0].id;
  let onlyFav = false; // ★ Takip ettiklerim görünümü

  const page = openPage({
    title: 'Puan durumu',
    cls: 'sp-pg st-pg',
    html: `<div class="chips" id="st-lgs" role="group" aria-label="Lig"></div><small class="st-upd" id="st-hint">Takımı takip etmek ya da bırakmak için satırına dokun / Tamam (OK)</small><small class="st-upd" id="st-upd" aria-live="polite"></small><div id="st-body" class="st-body"><div class="empty"><p>Puan durumu yükleniyor…</p></div></div>`,
    mount: () => {},
  });
  const root = page.el;
  const q = (s) => $(s, root);

  const num = (v) => (v == null ? '–' : String(v));
  const gd = (v) => (v == null ? '–' : v > 0 ? `+${v}` : String(v));

  function rowHtml(r, favs) {
    const fav = favs.length && isFavSide(favs, { name: r.name, label: r.label });
    const logo = r.logo ? `<img src="${esc(r.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
    return `<tr class="st-r${fav ? ' fav' : ''}" tabindex="0" role="button" aria-pressed="${fav ? 'true' : 'false'}" data-n="${esc(r.name)}" data-l="${esc(r.label)}" data-g="${esc(r.lg || '')}"><td class="st-n">${num(r.rank)}</td><td class="st-t"><div class="st-c">${logo}${fav ? '<i class="st-star" aria-label="Takip ediliyor">★</i>' : ''}<span>${esc(r.label)}</span></div></td><td>${num(r.p)}</td><td>${num(r.w)}</td><td>${num(r.d)}</td><td>${num(r.l)}</td><td>${gd(r.gd)}</td><td class="st-p"><b>${num(r.pts)}</b></td></tr>`;
  }

  function tableHtml(groups, favs) {
    return groups
      .map(
        (g) => `${g.name ? `<h4 class="st-gh">${esc(g.name)}</h4>` : ''}<div class="st-wrap"><table class="st-tb"><thead><tr><th>#</th><th class="st-t">Takım</th><th title="Oynanan">O</th><th title="Galibiyet">G</th><th title="Beraberlik">B</th><th title="Mağlubiyet">M</th><th title="Averaj">AV</th><th title="Puan">P</th></tr></thead><tbody>${g.rows.map((r) => rowHtml(r, favs)).join('')}</tbody></table></div>`,
      )
      .join('');
  }

  // Yeniden çizimde odak aynı öğede (çip ya da takım satırı) kalır, kaydırma konumu korunur: kumanda sayfanın başına atmaz
  function focusKey() {
    const a = document.activeElement;
    if (!a || !root.contains(a)) return null;
    if (a.classList.contains('st-r')) return { row: a.dataset.n, i: [...root.querySelectorAll('.st-r')].indexOf(a) };
    if (a.hasAttribute('data-fav')) return { chip: '[data-fav]' };
    if (a.dataset.lg) return { chip: `[data-lg="${a.dataset.lg}"]` };
    return null;
  }
  function restoreFocus(k) {
    if (!k) return;
    let t = null;
    if (k.chip) t = q(`#st-lgs ${k.chip}`);
    else {
      const rows = [...root.querySelectorAll('.st-r')];
      t = rows.find((r) => r.dataset.n === k.row) || rows[Math.min(Math.max(k.i, 0), rows.length - 1)] || q('#st-lgs .chip.on');
    }
    if (t && t.focus) t.focus({ preventScroll: true });
  }

  // ★ Takip ettiklerim: şu ana dek yüklenmiş tüm liglerdeki takip edilen takımların satırları, lig adıyla gruplanır
  function favGroups(favs) {
    const out = [];
    for (const l of TABLE_LEAGUES) {
      const v = store$.get(l.id);
      if (!v) continue;
      const rows = v.groups.flatMap((g) => g.rows).filter((r) => isFavSide(favs, { name: r.name, label: r.label }));
      if (rows.length) out.push({ name: l.name, rows: rows.map((r) => ({ ...r, lg: /^[a-z]{3}\.1$/.test(l.id) ? l.id : '' })) });
    }
    return out;
  }

  function draw() {
    if (!page.el.isConnected) return;
    const keep = focusKey();
    const body = q('#st-body');
    const top = body.scrollTop;
    const favs = (env.favs && env.favs()) || [];
    q('#st-lgs').innerHTML =
      `<button class="chip${onlyFav ? ' on' : ''}" data-fav aria-pressed="${onlyFav}">★ Takip ettiklerim</button>` +
      TABLE_LEAGUES.map((l) => `<button class="chip${!onlyFav && l.id === cur ? ' on' : ''}" data-lg="${esc(l.id)}"${!onlyFav && l.id === cur ? ' data-autofocus' : ''}>${esc(l.name)}</button>`).join('');
    const upd = q('#st-upd');
    if (onlyFav) {
      const gs = favGroups(favs);
      const loading = TABLE_LEAGUES.some((l) => pending.has(l.id) && !store$.has(l.id));
      if (gs.length) body.innerHTML = tableHtml(gs, favs);
      else if (loading) body.innerHTML = '<div class="empty"><p>Puan durumu yükleniyor…</p></div>';
      else body.innerHTML = `<div class="empty"><h3>${favs.length ? 'Takip ettiğin takım bu liglerde yok' : 'Henüz takım takip etmiyorsun'}</h3><p>Bir lig seç, takımın satırında Tamam (OK) tuşuna bas ya da dokun: takip edilir.</p></div>`;
      upd.textContent = loading ? 'Ligler yükleniyor…' : '';
      body.scrollTop = top;
      restoreFocus(keep);
      return;
    }
    const v = store$.get(cur);
    if (v) {
      body.innerHTML = tableHtml(v.groups.map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r, lg: /^[a-z]{3}\.1$/.test(cur) ? cur : '' })) })), favs);
      upd.textContent = errs.has(cur) ? `Güncellenemedi · kayıtlı veri (${fmtClock(v.at)})` : `Son güncelleme ${fmtClock(v.at)}`;
    } else if (pending.has(cur)) {
      body.innerHTML = '<div class="empty"><p>Puan durumu yükleniyor…</p></div>';
      upd.textContent = '';
    } else {
      const e = errs.get(cur);
      body.innerHTML = `<div class="empty"><h3>Puan durumu alınamadı</h3><p>${esc((e && e.message) || 'Bu lig için tablo bulunamadı.')}</p>${e && e.detail ? `<p class="hint sp-detail">${esc(e.detail)}</p>` : ''}<button class="btn" id="st-retry">Yeniden dene</button></div>`;
      upd.textContent = '';
    }
    body.scrollTop = top;
    restoreFocus(keep);
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
      if (id === cur || onlyFav) draw();
    })();
    pending.set(id, p);
    if (id === cur || onlyFav) draw();
    return p;
  }

  root.addEventListener('click', (e) => {
    const r = e.target.closest('.st-r');
    if (r) {
      if (env.toggleTeam) env.toggleTeam({ name: r.dataset.n, label: r.dataset.l }, r.dataset.g || undefined);
      draw(); // ★ ve takip edilenler görünümü güncellenir; odak aynı satırda kalır
      return;
    }
    if (e.target.closest('[data-fav]')) {
      onlyFav = !onlyFav;
      draw();
      if (onlyFav) for (const l of TABLE_LEAGUES) ensure(l.id); // takip edilen takım hangi ligdeyse bulunsun
      return;
    }
    const l = e.target.closest('[data-lg]');
    if (l) {
      cur = l.dataset.lg;
      onlyFav = false;
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
