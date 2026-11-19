// Film/dizi ekranı ek parçaları: fragman bloğu, oyuncu kartları, oyuncu sayfası ve "listede yok" bilgi ekranı.
// Burası yalnız HTML üretir ve fragman oynatıcısını denetler; sayfaları app.js açar (kütüphane eşleşmesi oradadır).
import { esc } from './util.js';
import { trailerEmbedUrl, trailerWatchUrl, trailerThumbUrl, trailerSearchUrl, genreTr } from './cinemeta.js';

const ic = (n) => `<svg class="ic"><use href="#i-${n}"/></svg>`;

// Ad → iki harf (kart yuvarlağı) ve addan gelen renk tonu
export function initialsOf(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  const first = [...w[0]][0] || '?';
  const last = w.length > 1 ? [...w[w.length - 1]][0] || '' : '';
  return (first + last).toLocaleUpperCase('tr-TR');
}
export function hueOfName(name) {
  let h = 0;
  for (const c of String(name || '')) h = (h * 31 + c.codePointAt(0)) % 360;
  return h;
}

// ---- fragman ----
const frameHtml = (id, { muted, origin }) => `<iframe class="tr-frame" src="${esc(trailerEmbedUrl(id, { muted, origin }))}" title="Fragman" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
const thumbHtml = (id) => `<button class="tr-thumb" data-tr="play" aria-label="Fragmanı oynat"><img src="${esc(trailerThumbUrl(id))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"><span class="tr-play">${ic('play')}</span></button>`;
const searchBtn = (query, cls) => `<a class="${cls}" href="${esc(trailerSearchUrl(query))}" target="_blank" rel="noopener">${ic('search')}`;
const failHtml = (query) => `<div class="tr-fail"><p>Fragman uygulamada oynatılamıyor; video sahibi gömmeyi kapatmış olabilir.</p>${query ? `${searchBtn(query, 'btn sm')}YouTube’da ara</a>` : ''}</div>`;

const foundNote = (f) => (f ? `YouTube ${f.good === false ? 'sonucu' : 'aramasıyla bulundu'}: ${f.title}${f.channel ? ' · ' + f.channel : ''}` : '');
const clock = (s) => {
  const n = Math.max(0, Math.floor(Number(s) || 0));
  return n >= 3600 ? `${Math.floor(n / 3600)}:${String(Math.floor((n % 3600) / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};
// Yatay kaydırılan sonuç şeridi: her kart bir YouTube sonucu; dokununca üstteki oynatıcıda açılır (yanlış ya da gömülemeyen videoda başkası seçilir).
const stripHtml = (found, on) => `<div class="tr-rs"><p class="tr-rh">YouTube sonuçları</p><div class="tr-rl" role="list">${found.map((f) => `<button class="tr-r${f.id === on ? ' on' : ''}" role="listitem" data-tr="pick" data-id="${esc(f.id)}" aria-label="${esc(f.title)}"><span class="tr-rt"><img src="${esc(trailerThumbUrl(f.id))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">${f.seconds ? `<i class="tr-d">${clock(f.seconds)}</i>` : ''}</span><b>${esc(f.title)}</b><small>${esc(f.channel || '')}</small></button>`).join('')}</div></div>`;

// ids: YouTube kimlikleri (ilki oynar; gömmeye izin vermeyen videoda sıradakine geçilir). auto: sessiz otomatik başlar, değilse küçük resim.
// found: YouTube aramasıyla bulunan [{ id, title, channel }]; oynayan videonun adı altta görünür (yanlışsa kullanıcı fark eder).
// Kimlik yoksa: searching ise "aranıyor", yoksa query varsa "YouTube’da fragman ara" bağlantısı; hiçbiri yoksa boş.
export function trailerHtml(ids, { auto = false, origin = '', query = '', searching = false, found = null, diag = '' } = {}) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  const id = list[0];
  if (!id) {
    if (searching) return '<section class="tr tr-none"><h2>Fragman</h2><div class="tr-wait" role="status">YouTube’da fragman aranıyor…</div></section>';
    return query ? `<section class="tr tr-none"><h2>Fragman</h2>${searchBtn(query, 'tr-find')}<span><b>YouTube’da fragman ara</b><small>Bu yapım için hazır fragman bulunamadı</small></span></a>${diag ? `<p class="tr-note tr-diag">${esc(diag)}</p>` : ''}</section>` : '';
  }
  const watch = esc(trailerWatchUrl(id));
  const media = auto ? frameHtml(id, { muted: true, origin }) : thumbHtml(id);
  const unmute = auto ? `<button class="btn sm tr-unmute" data-tr="unmute" hidden>${ic('audio')}Sesi aç</button>` : '';
  const notes = found && found.length ? list.map((x) => foundNote(found.find((f) => f.id === x))) : [];
  const note = notes[0] ? `<p class="tr-note">${esc(notes[0])}</p>` : '';
  const strip = found && found.length > 1 ? stripHtml(found, id) : '';
  return `<section class="tr" data-id="${esc(id)}" data-ids="${esc(list.join(','))}" data-origin="${esc(origin)}" data-q="${esc(query)}"${notes.length ? ` data-notes="${esc(JSON.stringify(notes))}"` : ''}><h2>Fragman</h2><div class="tr-box">${media}</div>${note}<div class="tr-bar">${unmute}<a class="btn sm ghost tr-open" href="${watch}" target="_blank" rel="noopener">${ic('link')}YouTube’da aç</a></div>${strip}</section>`;
}

// Fragman denetleyicisi: sessiz otomatik oynatma, "Sesi aç", hata → sıradaki fragman (hepsi bitince açıklama + YouTube araması), uygulama oynatıcısı açılınca durdurma.
// host: .tr bölümü. win: iframe mesajlarını dinleyen pencere. Dönen işlev denetleyiciyi bırakır.
export function wireTrailer(host, { win = typeof window !== 'undefined' ? window : null, doc = typeof document !== 'undefined' ? document : null } = {}) {
  if (!host || !win) return () => {};
  const frame = () => host.querySelector('.tr-frame');
  const post = (cmd) => {
    const f = frame();
    if (f && f.contentWindow) f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: cmd, args: [] }), '*');
  };
  const ids = () => String(host.dataset.ids || host.dataset.id || '').split(',').filter(Boolean);
  const origin = host.dataset.origin || '';
  let at = 0; // oynayan fragmanın sırası
  let muted = !!frame(); // sessiz otomatik başladıysa sıradaki de sessiz başlar; dokunarak başlatılan sesli devam eder
  const showUnmute = () => {
    const u = host.querySelector('.tr-unmute');
    if (u && u.dataset.done !== '1') u.hidden = false;
  };
  const setNote = () => {
    const n = host.querySelector('.tr-note');
    if (!n || !host.dataset.notes) return;
    try { n.textContent = JSON.parse(host.dataset.notes)[at] || ''; } catch { /* bozuk not */ }
  };
  // Şeritte oynayan kartı vurgular ve "YouTube’da aç" bağlantısını oynayan videoya çevirir
  const mark = () => {
    const id = host.dataset.id;
    const cards = host.querySelectorAll ? host.querySelectorAll('.tr-r') : [];
    for (const c of cards) {
      c.classList.toggle('on', c.dataset.id === id);
      if (c.dataset.id === id && c.scrollIntoView) c.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
    const a = host.querySelector('.tr-open');
    if (a) a.href = trailerWatchUrl(id);
  };
  const bindFrame = (f) => {
    if (f) f.addEventListener('load', () => { try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); } catch { /* çapraz köken */ } showUnmute(); });
  };
  const toThumb = () => {
    if (!frame()) return;
    host.querySelector('.tr-box').innerHTML = thumbHtml(host.dataset.id);
    const u = host.querySelector('.tr-unmute');
    if (u) u.hidden = true;
  };
  const nextOrFail = () => {
    const list = ids();
    const u = host.querySelector('.tr-unmute');
    if (u) u.hidden = true;
    if (at + 1 < list.length) {
      at += 1;
      host.dataset.id = list[at];
      setNote();
      mark();
      host.querySelector('.tr-box').innerHTML = frameHtml(list[at], { muted, origin });
      bindFrame(frame());
      return;
    }
    host.querySelector('.tr-box').innerHTML = failHtml(host.dataset.q || '');
    const n = host.querySelector('.tr-note');
    if (n) n.remove();
  };
  let obs = null;
  const dispose = () => {
    win.removeEventListener('message', onMsg);
    if (obs) obs.disconnect();
  };
  function onMsg(e) {
    if (!host.isConnected) return dispose(); // sayfa kapandı
    const f = frame();
    if (!f || e.source !== f.contentWindow) return;
    let d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
    if (!d || typeof d !== 'object') return;
    if (d.event === 'onError') { nextOrFail(); return; }
    if (d.event === 'onReady' || d.event === 'initialDelivery' || d.event === 'infoDelivery') showUnmute();
  }
  win.addEventListener('message', onMsg);
  bindFrame(frame());
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tr]');
    if (!b) return;
    if (b.dataset.tr === 'unmute') {
      post('unMute');
      muted = false;
      b.dataset.done = '1';
      b.hidden = true;
    } else if (b.dataset.tr === 'pick') {
      const i = ids().indexOf(b.dataset.id);
      if (i < 0) return;
      at = i;
      muted = false; // dokunarak seçildi: sesli başlar
      host.dataset.id = b.dataset.id;
      const u = host.querySelector('.tr-unmute');
      if (u) {
        u.hidden = true;
        u.dataset.done = '1'; // video sesli açılıyor; yükleme bitince “Sesi aç” yeniden çıkmasın
      }
      setNote();
      mark();
      host.querySelector('.tr-box').innerHTML = frameHtml(b.dataset.id, { muted: false, origin });
      bindFrame(frame());
    } else if (b.dataset.tr === 'play') {
      muted = false;
      host.querySelector('.tr-box').innerHTML = frameHtml(host.dataset.id, { muted: false, origin });
      bindFrame(frame());
    }
  });
  // Uygulama oynatıcısı açılınca fragman sesi kesilsin
  if (doc && typeof MutationObserver !== 'undefined') {
    obs = new MutationObserver(() => {
      if (!host.isConnected) return dispose();
      if (doc.body.classList.contains('player-open')) toThumb();
    });
    obs.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
  }
  return dispose;
}

// ---- oyuncu kartları ----
export function peopleHtml(people) {
  if (!people || !people.length) return '';
  return `<section class="pp"><h2>Oyuncular ve ekip</h2><div class="pp-row">${people.map((p) => `<button class="pp-card" data-person="${esc(p.name)}" aria-label="${esc(p.name)}${p.role ? ', ' + esc(p.role) : ''}"><span class="pp-av" style="--h:${hueOfName(p.name)}">${esc(initialsOf(p.name))}</span><b>${esc(p.name)}</b>${p.role ? `<small>${esc(p.role)}</small>` : ''}</button>`).join('')}</div></section>`;
}

// ---- oyuncu sayfası ----
// films: [{ imdbId, type, name, year, poster, inLib: bool }]
export function filmCardHtml(f, i = 0) {
  const img = f.poster ? `<img src="${esc(f.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  const meta = [f.type === 'series' ? 'Dizi' : 'Film', f.year || ''].filter(Boolean).join(' · ');
  return `<button class="ac-card k${i % 6}${f.inLib ? ' lib' : ' off'}" data-film="${esc(f.imdbId)}" data-type="${esc(f.type)}" aria-label="${esc(f.name)}${f.inLib ? '' : ', listende yok'}"><span class="ac-poster"><i>${esc(initialsOf(f.name))}</i>${img}</span><b>${esc(f.name)}</b><small>${esc(meta)}</small><em>${f.inLib ? `${ic('play')}Oynat` : 'Listende yok'}</em></button>`;
}

export function actorHtml(name, role, films) {
  const lib = films.filter((f) => f.inLib);
  const rest = films.filter((f) => !f.inLib);
  const grid = (list) => `<div class="ac-grid">${list.map((f, i) => filmCardHtml(f, i)).join('')}</div>`;
  const body = films.length
    ? (lib.length ? `<h2>Listenizde bulunanlar <small>${lib.length}</small></h2>${grid(lib)}` : '') + (rest.length ? `<h2>Diğer yapımları <small>${rest.length}</small></h2>${grid(rest)}` : '')
    : '<div class="empty"><p>Bu kişi için başka yapım bulunamadı.</p></div>';
  return `<div class="ac"><div class="ac-head"><span class="pp-av lg" style="--h:${hueOfName(name)}">${esc(initialsOf(name))}</span><div><h1 class="dt-t">${esc(name)}</h1>${role ? `<div class="dt-m"><span>${esc(role)}</span></div>` : ''}</div></div>${body}</div>`;
}

export const actorLoadingHtml = (name) => `<div class="ac"><div class="ac-head"><span class="pp-av lg" style="--h:${hueOfName(name)}">${esc(initialsOf(name))}</span><div><h1 class="dt-t">${esc(name)}</h1></div></div><div class="empty"><div class="spinner" style="border-color:#fff3;border-top-color:var(--accent)"></div></div></div>`;

// ---- vizyondaki filmler: ana sayfa satırı ve tüm liste ----
// films: [{ imdbId, type, name, year, poster }]; inLibOf(film) → listede mi
export function releasesRowHtml(films, inLibOf = () => false) {
  if (!films || !films.length) return '';
  const cards = films.slice(0, 12).map((f) => `<div class="card nw" role="button" tabindex="0" data-nid="${esc(f.imdbId)}" aria-label="${esc(f.name)}"><div class="poster"><div class="ph">${esc(initialsOf(f.name))}</div><img src="${esc(f.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.parentNode.classList.add('ok')" onerror="this.remove()">${inLibOf(f) ? '<span class="nw-tag">Listende</span>' : ''}</div><div class="cap">${esc(f.name)}</div></div>`).join('');
  return `<section class="home-row nw-row"><div class="home-row-h"><b>🎬 Vizyondaki filmler</b><button data-go="new">Tümünü gör</button></div><div class="home-row-s">${cards}</div></section>`;
}

// films: [{ ..., inLib }]
export function releasesPageHtml(films) {
  if (!films || !films.length) return '<div class="ac"><div class="empty"><p>Şu an gösterilecek film bulunamadı.</p></div></div>';
  return `<div class="ac"><p class="ac-note">Yeni çıkan filmler. Listendekiler “Oynat”; olmayanlara dokununca fragman ve bilgi açılır.</p><div class="ac-grid">${films.map((f, i) => filmCardHtml(f, i)).join('')}</div></div>`;
}

// ---- listede olmayan yapım için bilgi ekranı (Cinemeta ayrıntısından) ----
export function titleInfoHtml(film, detail, loading = false) {
  const d = detail || {};
  const poster = d.poster || film.poster;
  const posterHtml = poster ? `<img src="${esc(poster)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : esc(initialsOf(film.name));
  const chips = [film.type === 'series' ? 'Dizi' : 'Film', d.year || film.year || '', String(d.runtime || '').replace(/\s*min\b/i, ' dk'), ...(d.genres || []).map(genreTr)].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('');
  return `<div class="dt"><div class="dt-pos">${posterHtml}</div><div class="dt-head"><h1 class="dt-t">${esc(d.name || film.name)}</h1><div class="dt-m">${chips}</div><div class="dt-btns"><button class="btn lg" disabled>${ic('alert-triangle')}Listenizde yok</button></div></div><div class="dt-body"><div class="dt-tr" id="ti-trailer"></div><h2>Hakkında</h2><p class="dt-plot">${loading ? '<span class="dt-load">Yükleniyor…</span>' : esc(d.description || 'Bu yapım için özet bulunamadı.')}</p><div class="dt-pp" id="ti-people"></div></div></div>`;
}
