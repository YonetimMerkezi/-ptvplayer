// Radyo & Müzik ekranı ve ana sayfa satırı (radio.js verisi). Modül ilk kullanımda yüklenir (app.js openRadio).
import { esc, fmtClock, hashId } from './util.js';
import { icon, openPage } from './ui.js';
import { RADIO_COUNTRIES, genreChips, filterStations, radioFavs, isRadioFav, toggleRadioFav } from './radio.js';

const SHOW = 120; // liste bir seferde bu kadar satır çizer; kalanı "Daha fazla" ile gelir
const HOME_MAX = 12;
const hueOf = (name) => parseInt(hashId(String(name || '?')), 36) % 360;

// Kapak: logo varsa logo, yoksa adın baş harfi (rengi addan gelir). Logo yüklenirse baş harfi örter.
export function stationLogo(st) {
  const ch = esc((String(st.name || '?').trim()[0] || '?').toUpperCase());
  const img = st.logo ? `<img src="${esc(st.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.parentNode.classList.add('ok')" onerror="this.remove()">` : '';
  return `<span class="rd-logo" style="--h:${hueOf(st.name)}">${img}<i>${ch}</i></span>`;
}

const subOf = (st) => [(st.tags || []).slice(0, 2).join(' · '), st.bitrate ? `${st.codec || ''} ${st.bitrate} kbps`.trim() : ''].filter(Boolean).join(' · ');

// Ana sayfa satırı: önce favoriler, sonra en çok dinlenenler. Veri yoksa satır çıkmaz.
export function homeRadio(favs, items) {
  const seen = new Set();
  const list = [];
  for (const st of [...(favs || []), ...(items || [])]) {
    if (!st || seen.has(st.id)) continue;
    seen.add(st.id);
    list.push(st);
    if (list.length >= HOME_MAX) break;
  }
  return list;
}

export function radioRowHtml(favs, items) {
  const list = homeRadio(favs, items);
  if (!list.length) return '';
  const cards = list.map((st) => `<div class="card rd-card" role="button" tabindex="0" data-rid="${esc(st.id)}"><div class="poster">${stationLogo(st)}</div><div class="cap">${esc(st.name)}</div></div>`).join('');
  return `<section class="home-row"><div class="home-row-h"><b>📻 Radyo &amp; Müzik</b><button data-go="radio">Tümünü gör</button></div><div class="home-row-s">${cards}</div></section>`;
}

// env: { store, country(), setCountry(cc), load(cc, force) → { items, at, stale }, play(station, list), toast(msg), playingId?() }
export function openRadio(env) {
  let all = [];
  let loading = true;
  let error = '';
  let stale = false;
  let at = 0;
  let genre = ''; // '' tümü, 'fav' favoriler, ya da tür kimliği
  let query = '';
  let shown = SHOW;
  let country = env.country();

  const page = openPage({
    title: 'Radyo & Müzik',
    cls: 'rd-pg',
    html: `<div class="gd-search"><label class="gd-sbox">${icon('search')}<input id="rd-q" type="search" placeholder="Radyo ara" autocomplete="off" enterkeyhint="search"></label><select id="rd-cc" class="rd-cc" aria-label="Ülke">${RADIO_COUNTRIES.map(([cc, n]) => `<option value="${cc}"${cc === country ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div><div class="chips" id="rd-chips" role="group" aria-label="Tür"></div><small class="rd-upd" id="rd-upd" aria-live="polite"></small><div class="rd-list" id="rd-list"></div>`,
  });
  const q = (s) => page.el.querySelector(s);

  const favs = () => radioFavs(env.store);
  const base = () => (genre === 'fav' ? favs() : all);
  const current = () => filterStations(base(), { genre: genre === 'fav' ? '' : genre, query });

  function drawChips() {
    const fav = favs().length;
    const chips = [`<button class="chip${genre === '' ? ' on' : ''}" data-g="">Tümü${all.length ? `<small>${all.length}</small>` : ''}</button>`, `<button class="chip${genre === 'fav' ? ' on' : ''}" data-g="fav">${icon('star')}Favoriler${fav ? `<small>${fav}</small>` : ''}</button>`];
    for (const g of genreChips(all)) chips.push(`<button class="chip${genre === g.id ? ' on' : ''}" data-g="${g.id}">${esc(g.label)}<small>${g.n}</small></button>`);
    q('#rd-chips').innerHTML = chips.join('');
  }

  function row(st, i) {
    const on = env.playingId && env.playingId() === st.id;
    const fav = isRadioFav(env.store, st.id);
    return `<div class="row rd-row k${i % 6}${on ? ' now' : ''}" role="button" tabindex="0" data-id="${esc(st.id)}">${stationLogo(st)}<div class="meta"><div class="nm">${esc(st.name)}</div><div class="sub">${esc(subOf(st))}</div></div><button class="act${fav ? ' on' : ''}" data-fav aria-label="${fav ? 'Favoriden çıkar' : 'Favoriye ekle'}">${icon(fav ? 'star-on' : 'star')}</button></div>`;
  }

  function drawList() {
    const box = q('#rd-list');
    const upd = q('#rd-upd');
    if (loading) {
      upd.textContent = '';
      box.innerHTML = '<p class="rd-msg">Radyolar yükleniyor…</p>';
      return;
    }
    if (error) {
      upd.textContent = '';
      box.innerHTML = `<p class="rd-msg">${esc(error)}</p><button class="btn" data-retry>Tekrar dene</button>`;
      return;
    }
    const list = current();
    upd.textContent = stale ? `Çevrimdışı liste · ${fmtClock(at)}` : at ? `${all.length} radyo · liste ${fmtClock(at)}` : '';
    if (!list.length) {
      box.innerHTML = `<p class="rd-msg">${genre === 'fav' ? 'Henüz favori radyo yok. Yıldıza dokunarak ekle.' : 'Bu aramayla radyo bulunamadı.'}</p>`;
      return;
    }
    const part = list.slice(0, shown);
    box.innerHTML = part.map(row).join('') + (list.length > shown ? `<button class="btn rd-more" data-more>Daha fazla göster (${list.length - shown})</button>` : '');
  }

  async function load(force) {
    loading = true;
    error = '';
    drawList();
    try {
      const r = await env.load(country, !!force);
      all = r.items;
      at = r.at;
      stale = !!r.stale;
      if (stale) env.toast('İnternet yok: kayıtlı radyo listesi gösteriliyor', 2800);
    } catch (e) {
      all = [];
      error = 'Radyo listesi alınamadı. İnternet bağlantını kontrol et.';
    }
    loading = false;
    drawChips();
    drawList();
  }

  page.el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-g]');
    if (c) {
      genre = c.dataset.g;
      shown = SHOW;
      drawChips();
      return drawList();
    }
    if (e.target.closest('[data-retry]')) return load(true);
    if (e.target.closest('[data-more]')) {
      shown += SHOW;
      return drawList();
    }
    const r = e.target.closest('.rd-row');
    if (!r) return;
    const st = base().find((x) => x.id === r.dataset.id) || all.find((x) => x.id === r.dataset.id);
    if (!st) return;
    if (e.target.closest('[data-fav]')) {
      const on = toggleRadioFav(env.store, st);
      env.toast(on ? 'Favori radyolara eklendi' : 'Favori radyolardan çıkarıldı', 1600);
      drawChips();
      return drawList();
    }
    const list = current();
    env.play(st, list.length > 300 ? list.slice(0, 300) : list);
  });
  page.el.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('rd-row')) {
      e.preventDefault();
      e.target.click();
    }
  });
  q('#rd-q').addEventListener('input', (e) => {
    query = e.target.value;
    shown = SHOW;
    drawList();
  });
  q('#rd-cc').addEventListener('change', (e) => {
    country = e.target.value;
    env.setCountry(country);
    genre = '';
    query = '';
    q('#rd-q').value = '';
    load(false);
  });

  drawChips();
  load(false);
  return page;
}
