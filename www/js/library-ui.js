// Medya merkezi ekranı: cihaz klasörleri (küçük resimli), ağ paylaşımları (WebDAV, SMB, DLNA), arama, son eklenenler,
// fotoğraf galerisi, müzik ve klasör kilidi. Saf mantık local-library.js'te; oynatma app.js'teki startPlay ile yapılır.
import { esc, hashId } from './util.js';
import { cleanName } from './local-media.js';
import { pushLayer, popLayer } from './nav.js';
import * as L from './local-library.js';

const ROOTS_KEY = 'lib.roots';
const LOCKS_KEY = 'lib.locks';
const INDEX_TTL = 6 * 3600 * 1000;
const NO_NATIVE = 'Medya merkezi Android uygulamasında kullanılabilir';

export function createLibrary({ plugin, store, openPage, openSheet, toast, icon, startPlay, askPin, lockEnabled, createPin, pickFiles }) {
  const indexes = new Map(); // kökId → dizin (yerel klasör ağaçları)
  const unlocked = new Set(); // oturumda şifreyle açılan kilit anahtarları
  const thumbs = new Map();
  const queue = [];
  let busy = 0;

  const roots = () => store.pref(ROOTS_KEY, []);
  const saveRoots = (list) => store.setPref(ROOTS_KEY, list);
  const locks = () => store.pref(LOCKS_KEY, []);
  const safRoots = () => roots().filter((r) => r.type === 'saf');
  const rootOf = (id) => roots().find((r) => r.id === id) || null;

  // ---- kilit ----
  const lockActive = (rootId, dir) => {
    if (!lockEnabled()) return '';
    const by = L.lockedBy(locks(), rootId, dir);
    return by && !unlocked.has(by) ? by : '';
  };
  async function guard(rootId, dir) {
    const by = lockActive(rootId, dir);
    if (!by) return true;
    const ok = await askPin('Kilitli klasör', 'Açmak için uygulama şifresini girin');
    if (ok) unlocked.add(by);
    return ok;
  }
  const allowFile = (f) => !lockActive(f.rootId, f.dir);
  async function toggleDirLock(rootId, dir) {
    const key = L.lockKey(rootId, dir);
    const on = locks().includes(key);
    if (on) {
      if (lockEnabled() && !(await askPin('Kilidi kaldır', 'Klasörün kilidini kaldırmak için şifreyi girin'))) return false;
    } else if (!lockEnabled() && !(await createPin())) return false;
    store.setPref(LOCKS_KEY, L.toggleLock(locks(), key));
    unlocked.delete(key);
    return true;
  }

  // ---- küçük resimler: en çok 3 eşzamanlı istek, bellekte sınırlı önbellek ----
  function pump() {
    while (busy < 3 && queue.length) {
      const job = queue.shift();
      busy++;
      const cached = thumbs.get(job.row.uri);
      (cached !== undefined ? Promise.resolve(cached) : plugin.libThumb({ uri: job.row.uri, kind: job.row.kind, size: 256 }).then((r) => (r && r.data) || '').catch(() => ''))
        .then((d) => {
          if (thumbs.size > 500) thumbs.delete(thumbs.keys().next().value);
          thumbs.set(job.row.uri, d);
          job.done(d);
        })
        .finally(() => {
          busy--;
          pump();
        });
    }
  }
  const thumbOf = (row) => new Promise((done) => (queue.push({ row, done }), pump()));
  function watchThumbs(root) {
    const els = [...root.querySelectorAll('.lb-th[data-uri]')];
    if (!els.length) return;
    const load = async (el) => {
      const d = await thumbOf({ uri: el.dataset.uri, kind: el.dataset.kind });
      if (d && el.isConnected) {
        const img = document.createElement('img');
        img.alt = '';
        img.src = d;
        el.appendChild(img);
      }
    };
    if (typeof IntersectionObserver !== 'function') return els.slice(0, 40).forEach(load);
    const io = new IntersectionObserver(
      (ents) => ents.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        load(e.target);
      }),
      { root, rootMargin: '240px' },
    );
    els.forEach((el) => io.observe(el));
  }

  // ---- yerel klasör dizini ----
  async function ensureIndex(root, force = false) {
    if (!force && indexes.has(root.id)) return indexes.get(root.id);
    const key = 'lib-index:v1:' + root.id;
    if (!force) {
      const c = await store.cache.get(key).catch(() => null);
      if (c && c.savedAt && Date.now() - c.savedAt < INDEX_TTL && Array.isArray(c.files)) {
        const idx = L.buildIndex(c.files, root.id);
        indexes.set(root.id, idx);
        return idx;
      }
    }
    const r = await plugin.libScan({ uri: root.uri });
    const files = Array.isArray(r && r.files) ? r.files : [];
    await store.cache.set(key, { savedAt: Date.now(), files }).catch(() => {});
    const idx = L.buildIndex(files, root.id);
    indexes.set(root.id, idx);
    if (r && r.truncated) toast('Klasör çok büyük: ilk 30.000 dosya listelendi', 3500);
    return idx;
  }
  const allIndex = () => safRoots().flatMap((r) => indexes.get(r.id) || []);

  // ---- oynatma ----
  async function itemOf(row, ctxRoot, siblings) {
    let url = row.uri || row.url || '';
    if (ctxRoot && ctxRoot.type === 'smb') url = (await plugin.netSmbUrl({ host: ctxRoot.host, path: row.path, user: ctxRoot.user || '', pass: ctxRoot.pass || '' })).url;
    const item = { id: row.id, name: row.title || cleanName(row.name), kind: 'movie', mime: 'auto', url, localMedia: true, audio: row.kind === 'audio' };
    if (row.headers) item.headers = row.headers;
    // Şarkının kapak resmi (varsa) müzik çaların kapağında ve arka planında görünür; gelmesi beklenmez, hazır olunca eklenir.
    if (row.kind === 'audio' && row.uri) thumbOf({ uri: row.uri, kind: 'audio' }).then((d) => d && (item.logo = d)).catch(() => {});
    if (row.kind === 'video') {
      try {
        if (!ctxRoot || ctxRoot.type === 'saf') {
          const sub = L.findSubtitle(indexes.get(row.rootId) || [], row);
          if (sub) item.subUri = (await plugin.libPrepareSub({ uri: sub.uri })).uri;
        } else if (siblings) {
          const sub = L.findSiblingSub(siblings, row);
          if (sub && ctxRoot.type === 'dav') item.subUri = sub.url;
          else if (sub && ctxRoot.type === 'smb') item.subUri = (await plugin.netSmbUrl({ host: ctxRoot.host, path: sub.path, user: ctxRoot.user || '', pass: ctxRoot.pass || '' })).url;
        }
      } catch {
        /* altyazı hazırlanamadı: video altyazısız açılır */
      }
    }
    return item;
  }

  // rows: oynatma listesi (aynı klasör, aynı tür), i: açılacak sıra
  async function playList(rows, i, ctxRoot, siblings) {
    const ctx = {
      items: rows.map((r) => ({ id: r.id, name: r.title || cleanName(r.name), group: '' })),
      index: i,
      autoNext: rows.length > 1,
      title: rows[0] && rows[0].kind === 'audio' ? 'Sıradaki şarkılar' : 'Sıradaki videolar',
      nextLabel: rows[0] && rows[0].kind === 'audio' ? 'Sıradaki şarkı' : 'Sıradaki video',
      play: (_it, k) => open(k),
    };
    async function open(k) {
      try {
        const item = await itemOf(rows[k], ctxRoot, siblings);
        ctx.index = k;
        startPlay(item, { local: item.url, ctx: { ...ctx, index: k } });
      } catch (e) {
        toast('Açılamadı: ' + String((e && e.message) || e || ''), 3500);
      }
    }
    return open(i);
  }

  // ---- fotoğraf galerisi ----
  function viewer(rows, start, srcOf) {
    let i = start;
    let timer = 0;
    const el = document.createElement('div');
    el.className = 'lb-view';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Fotoğraf görüntüleyici');
    el.innerHTML =
      '<img class="lb-img" alt=""><div class="lb-vmsg" hidden></div><div class="lb-vcap"></div>' +
      `<button class="lb-vb lb-vp" data-v="prev" aria-label="Önceki">${icon('chev-l')}</button><button class="lb-vb lb-vn" data-v="next" aria-label="Sonraki">${icon('chev-r')}</button>` +
      `<button class="lb-vb lb-vx" data-v="close" aria-label="Kapat">${icon('close')}</button><button class="lb-vb lb-vs" data-v="show" aria-label="Slayt gösterisi">${icon('play')}</button>`;
    document.body.appendChild(el);
    const img = el.querySelector('.lb-img');
    const msg = el.querySelector('.lb-vmsg');
    const id = 'lbv' + Date.now();
    const stop = () => {
      clearInterval(timer);
      timer = 0;
      el.querySelector('.lb-vs').innerHTML = icon('play');
    };
    const close = () => {
      stop();
      document.removeEventListener('keydown', onKey, true);
      el.remove();
    };
    async function show() {
      const r = rows[i];
      el.querySelector('.lb-vcap').textContent = `${r.title || cleanName(r.name)} · ${i + 1}/${rows.length}`;
      msg.hidden = true;
      img.classList.add('loading');
      try {
        const src = await srcOf(r);
        if (rows[i] !== r) return;
        img.onload = () => img.classList.remove('loading');
        img.onerror = () => {
          img.classList.remove('loading');
          msg.hidden = false;
          msg.textContent = 'Fotoğraf açılamadı';
        };
        img.src = src;
      } catch (e) {
        img.classList.remove('loading');
        msg.hidden = false;
        msg.textContent = 'Fotoğraf açılamadı';
      }
    }
    const go = (d) => {
      i = (i + d + rows.length) % rows.length;
      show();
    };
    function onKey(e) {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape' || e.key === 'Backspace') popLayer(id);
      else return;
      e.preventDefault();
      e.stopPropagation();
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      if (b.dataset.v === 'prev') go(-1);
      else if (b.dataset.v === 'next') go(1);
      else if (b.dataset.v === 'close') popLayer(id);
      else if (timer) stop();
      else {
        b.innerHTML = icon('pause');
        timer = setInterval(() => go(1), 5000);
      }
    });
    let x0 = null;
    el.addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
    el.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    });
    document.addEventListener('keydown', onKey, true);
    pushLayer(id, close);
    show();
  }

  // ---- ana ekran ----
  function open() {
    if (!plugin) return toast(NO_NATIVE);
    const st = { view: 'home', rootId: '', dir: '', q: '', remote: null, loading: false };
    const pg = openPage({ title: 'Medya merkezi', cls: 'lb-pg', html: '<div class="lb"></div>' });
    const host = pg.body.querySelector('.lb');
    let token = 0;

    const tile = (f) => `<button class="lb-tile" data-file="${esc(f.id)}"><span class="lb-th" data-uri="${esc(f.uri || '')}" data-kind="${esc(f.kind)}"><i class="lb-kind">${icon(f.kind === 'audio' ? 'audio' : f.kind === 'image' ? 'eye' : 'play')}</i></span><b>${esc(f.title || cleanName(f.name))}</b><small>${esc(L.fmtSize(f.size))}</small></button>`;
    const folderTile = (rootId, fo) => `<button class="lb-tile lb-folder" data-dir="${esc(fo.path)}"><span class="lb-th"${fo.sample ? ` data-uri="${esc(fo.sample.uri)}" data-kind="${esc(fo.sample.kind)}"` : ''}><i class="lb-kind">${icon('folder')}</i></span><b>${esc(fo.name)}${lockActive(rootId, fo.path) || L.lockedBy(locks(), rootId, fo.path) ? ' ' + icon('lock') : ''}</b><small>${fo.count} dosya</small></button>`;

    async function render() {
      const t = ++token;
      host.innerHTML = '<div class="empty">Yükleniyor…</div>';
      let html = '';
      try {
        if (st.view === 'home') html = await homeHtml();
        else if (st.view === 'search') html = searchHtml();
        else if (st.view === 'dir') html = await dirHtml();
        else html = await remoteHtml();
      } catch (e) {
        html = `<div class="empty"><h3>Açılamadı</h3><p>${esc(String((e && e.message) || e || ''))}</p><button class="btn" data-act="home">Geri dön</button></div>`;
      }
      if (t !== token) return;
      host.innerHTML = html;
      watchThumbs(pg.body);
      const q = host.querySelector('#lb-q');
      if (q && st.view !== 'remote') q.value = st.q;
    }

    const searchBar = () => `<div class="lb-search"><input id="lb-q" type="search" placeholder="Ada göre ara (cihaz klasörleri)" autocomplete="off"></div>`;

    async function homeHtml() {
      const sr = safRoots();
      await Promise.all(sr.map((r) => ensureIndex(r).catch(() => null)));
      const net = roots().filter((r) => r.type !== 'saf');
      const lockIc = (id) => (L.lockedBy(locks(), id, '') ? ' ' + icon('lock') : '');
      const rootCard = (r) => `<div class="lb-root"><button class="lb-rbtn" data-root="${esc(r.id)}">${icon(r.type === 'saf' ? 'folder' : 'cast')}<span><b>${esc(r.name)}${lockIc(r.id)}</b><small>${esc(r.type === 'saf' ? (indexes.get(r.id) || []).filter((f) => L.isMedia(f.kind)).length + ' dosya' : { dav: 'WebDAV', smb: 'SMB', upnp: 'DLNA / UPnP' }[r.type])}</small></span></button><button class="icon-btn" data-rootmenu="${esc(r.id)}" aria-label="Seçenekler">${icon('dots')}</button></div>`;
      const recents = L.recentAdded(allIndex(), { allow: allowFile, limit: 12 });
      return (
        searchBar() +
        `<div class="lb-actions"><button class="btn sm" data-act="addfolder">${icon('plus')} Klasör ekle</button><button class="btn sm ghost" data-act="pickfile">${icon('folder')} Dosya seç</button><button class="btn sm ghost" data-act="addnet">${icon('cast')} Ağ paylaşımı</button></div>` +
        (sr.length ? `<h4 class="lb-h">Cihaz klasörleri</h4><div class="lb-roots">${sr.map(rootCard).join('')}</div>` : '<p class="hint">Telefondaki ya da harici kart / USB bellekteki klasörleri ekleyin; videolar küçük resimlerle klasör klasör listelenir. Depolama izni gerekmez.</p>') +
        (net.length ? `<h4 class="lb-h">Ağ paylaşımları</h4><div class="lb-roots">${net.map(rootCard).join('')}</div>` : '') +
        (recents.length ? `<h4 class="lb-h">Son eklenenler</h4><div class="lb-grid">${recents.map(tile).join('')}</div>` : '')
      );
    }

    function searchHtml() {
      const res = L.searchIndex(allIndex(), st.q, { allow: allowFile });
      return searchBar() + `<button class="btn sm ghost lb-back" data-act="home">${icon('back')} Medya merkezi</button><h4 class="lb-h">“${esc(st.q)}” için ${res.length} sonuç</h4>` + (res.length ? `<div class="lb-grid">${res.map(tile).join('')}</div>` : '<p class="hint">Eşleşen dosya yok. Arama yalnızca eklediğiniz cihaz klasörlerinde çalışır.</p>');
    }

    async function dirHtml() {
      const root = rootOf(st.rootId);
      if (!root) return '<div class="empty">Klasör kaldırılmış</div>';
      const idx = await ensureIndex(root);
      const { folders, files } = L.listDir(idx, st.dir);
      const crumbText = [root.name, ...L.crumbs(st.dir).map((c) => c.name)].join(' › ');
      const media = files.filter((f) => L.isMedia(f.kind));
      const lockedHere = locks().includes(L.lockKey(root.id, st.dir));
      const playable = media.filter((f) => f.kind !== 'image');
      return (
        `<div class="lb-bar"><button class="btn sm ghost" data-act="up">${icon('back')} Geri</button><span class="lb-crumb">${esc(crumbText)}</span></div>` +
        `<div class="lb-actions">${playable.length ? `<button class="btn sm" data-act="playall">${icon('play')} Tümünü oynat</button>` : ''}<button class="btn sm ghost" data-act="lock">${icon(lockedHere ? 'lock-open' : 'lock')} ${lockedHere ? 'Kilidi kaldır' : 'Klasörü kilitle'}</button><button class="btn sm ghost" data-act="rescan">${icon('refresh')} Yenile</button></div>` +
        (folders.length ? `<div class="lb-grid">${folders.map((f) => folderTile(root.id, f)).join('')}</div>` : '') +
        (media.length ? `<div class="lb-grid">${media.map(tile).join('')}</div>` : '') +
        (!folders.length && !media.length ? '<p class="hint">Bu klasörde video, müzik ya da fotoğraf yok.</p>' : '')
      );
    }

    // ---- ağ paylaşımı klasörü ----
    async function listRemote(root, frame) {
      if (root.type === 'dav') {
        const r = await plugin.netDavList({ url: frame.url, user: root.user || '', pass: root.pass || '' });
        return L.sortRows((r.entries || []).map((e) => L.davRow(e, r.auth)).filter(Boolean));
      }
      if (root.type === 'upnp') {
        const r = await plugin.netUpnpBrowse({ control: root.control, id: frame.id });
        return L.sortRows((r.entries || []).map(L.upnpRow).filter(Boolean));
      }
      const r = await plugin.netSmbList({ host: root.host, path: frame.path, user: root.user || '', pass: root.pass || '' });
      return L.sortRows((r.entries || []).map((e) => L.smbRow(e, root.host)).filter(Boolean));
    }
    const rootFrame = (root) => (root.type === 'dav' ? { name: root.name, url: root.url } : root.type === 'upnp' ? { name: root.name, id: '0' } : { name: root.name, path: '' });

    async function remoteHtml() {
      const rm = st.remote;
      const root = rootOf(rm.rootId);
      if (!root) return '<div class="empty">Paylaşım kaldırılmış</div>';
      const frame = rm.stack[rm.stack.length - 1];
      rm.rows = await listRemote(root, frame);
      const crumbText = rm.stack.map((f) => f.name).join(' › ');
      const playable = rm.rows.filter((r) => !r.dir && (r.kind === 'video' || r.kind === 'audio'));
      const lockedHere = locks().includes(L.lockKey(root.id, ''));
      const line = (r, i) => r.dir
        ? `<button class="list-item" data-rdir="${i}"><span class="t">${icon('folder')} ${esc(r.name)}</span></button>`
        : r.kind === 'sub' ? '' : `<button class="list-item" data-rfile="${i}"><span class="t">${icon(r.kind === 'audio' ? 'audio' : r.kind === 'image' ? 'eye' : 'play')} ${esc(cleanName(r.name))}<small>${esc(L.fmtSize(r.size))}</small></span></button>`;
      return (
        `<div class="lb-bar"><button class="btn sm ghost" data-act="up">${icon('back')} Geri</button><span class="lb-crumb">${esc(crumbText)}</span></div>` +
        `<div class="lb-actions">${playable.length ? `<button class="btn sm" data-act="playall">${icon('play')} Tümünü oynat</button>` : ''}<button class="btn sm ghost" data-act="lock">${icon(lockedHere ? 'lock-open' : 'lock')} ${lockedHere ? 'Paylaşımın kilidini kaldır' : 'Paylaşımı kilitle'}</button></div>` +
        (rm.rows.some((r) => r.kind !== 'sub') ? `<div class="lb-list">${rm.rows.map(line).join('')}</div>` : '<p class="hint">Bu klasörde video, müzik ya da fotoğraf yok.</p>')
      );
    }

    // ---- ekleme / silme ----
    async function addFolder() {
      try {
        const r = await plugin.libAddFolder();
        if (!r || !r.uri) return;
        if (roots().some((x) => x.type === 'saf' && x.uri === r.uri)) return toast('Bu klasör zaten ekli');
        const root = { id: hashId('saf:' + r.uri), type: 'saf', name: r.name || 'Klasör', uri: r.uri };
        saveRoots([...roots(), root]);
        toast('Klasör taranıyor…', 2500);
        await ensureIndex(root, true);
        render();
      } catch (e) {
        if (!/seçilmedi|cancel|iptal/i.test(String((e && e.message) || e))) toast('Klasör eklenemedi: ' + String((e && e.message) || e));
      }
    }

    function formHtml(fields, hint) {
      return `<div class="lb-form">${fields.map(([n, label, type = 'text', ph = '']) => `<label class="field"><span>${esc(label)}</span><input name="${n}" type="${type}" placeholder="${esc(ph)}" autocomplete="off" autocapitalize="off"></label>`).join('')}${hint ? `<p class="hint">${hint}</p>` : ''}<button class="btn" data-save>Bağlan ve kaydet</button></div>`;
    }

    function addNet() {
      const sh = openSheet({
        title: 'Ağ paylaşımı ekle',
        html: '<button class="list-item" data-t="dav"><span class="t">WebDAV<small>NAS ya da bilgisayardaki WebDAV sunucusu (http/https)</small></span></button><button class="list-item" data-t="smb"><span class="t">SMB (Windows paylaşımı)<small>Bilgisayar ya da NAS paylaşımı; ana makine adı ya da IP</small></span></button><button class="list-item" data-t="upnp"><span class="t">DLNA / UPnP<small>Ağdaki medya sunucularını otomatik bul</small></span></button>',
        mount: (body) => body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-t]');
          if (!b) return;
          sh.close();
          if (b.dataset.t === 'upnp') discover();
          else netForm(b.dataset.t);
        }),
      });
    }

    function netForm(type) {
      const dav = type === 'dav';
      const sh = openSheet({
        title: dav ? 'WebDAV bağlantısı' : 'SMB bağlantısı',
        html: formHtml(dav
          ? [['name', 'Ad', 'text', 'Evdeki NAS'], ['url', 'Adres', 'text', 'http://192.168.1.10:5005/video'], ['user', 'Kullanıcı adı (isteğe bağlı)'], ['pass', 'Şifre', 'password']]
          : [['name', 'Ad', 'text', 'Bilgisayarım'], ['host', 'Ana makine adı ya da IP', 'text', '192.168.1.20'], ['user', 'Kullanıcı adı (boşsa misafir)'], ['pass', 'Şifre', 'password']],
        'Şifre yalnızca bu cihazda saklanır. Bağlantı denenir; başarısızsa kaydedilmez.'),
        mount: (body) => body.querySelector('[data-save]').addEventListener('click', async (e) => {
          const v = (n) => (body.querySelector(`[name="${n}"]`).value || '').trim();
          const btn = e.currentTarget;
          const root = dav
            ? { type: 'dav', url: L.normalizeDavUrl(v('url')), user: v('user'), pass: v('pass') }
            : { type: 'smb', host: L.normalizeSmbHost(v('host')), user: v('user'), pass: v('pass') };
          if (dav ? !root.url : !root.host) return toast(dav ? 'Geçerli bir adres girin' : 'Ana makine adı ya da IP girin');
          root.name = v('name') || (dav ? new URL(root.url).host : root.host);
          root.id = hashId(root.type + ':' + (root.url || root.host) + ':' + root.user);
          btn.disabled = true;
          btn.textContent = 'Bağlanılıyor…';
          try {
            await listRemote(root, rootFrame(root));
            if (!roots().some((x) => x.id === root.id)) saveRoots([...roots(), root]);
            sh.close();
            render();
          } catch (err) {
            toast(String((err && err.message) || err || 'Bağlanılamadı'), 4500);
            btn.disabled = false;
            btn.textContent = 'Bağlan ve kaydet';
          }
        }),
      });
    }

    function discover() {
      const sh = openSheet({
        title: 'Ağdaki medya sunucuları',
        html: '<div class="empty">Aranıyor…</div>',
        mount: async (body) => {
          let servers = [];
          try {
            servers = (await plugin.netUpnpDiscover({ timeoutMs: 4000 })).servers || [];
          } catch (e) {
            body.innerHTML = `<div class="empty"><p>${esc(String((e && e.message) || e))}</p></div>`;
            return;
          }
          body.innerHTML = servers.length
            ? servers.map((s, i) => `<button class="list-item" data-i="${i}"><span class="t">${esc(s.name)}</span></button>`).join('')
            : '<div class="empty"><h3>Sunucu bulunamadı</h3><p>Telefon ve medya sunucusu aynı Wi-Fi ağında olmalı; sunucuda DLNA paylaşımı açık olmalı.</p></div>';
          body.addEventListener('click', (e) => {
            const b = e.target.closest('[data-i]');
            if (!b) return;
            const s = servers[Number(b.dataset.i)];
            const root = { id: hashId('upnp:' + s.control), type: 'upnp', name: s.name, control: s.control };
            if (!roots().some((x) => x.id === root.id)) saveRoots([...roots(), root]);
            sh.close();
            render();
          });
        },
      });
    }

    function rootMenu(id) {
      const r = rootOf(id);
      if (!r) return;
      const sh = openSheet({
        title: r.name,
        html: `${r.type === 'saf' ? '<button class="list-item" data-a="rescan"><span class="t">Yeniden tara</span></button>' : ''}<button class="list-item" data-a="remove"><span class="t">Listeden kaldır<small>Dosyalar silinmez</small></span></button>`,
        mount: (body) => body.addEventListener('click', async (e) => {
          const a = e.target.closest('[data-a]');
          if (!a) return;
          sh.close();
          if (a.dataset.a === 'rescan') {
            toast('Taranıyor…', 2000);
            await ensureIndex(r, true).catch((err) => toast('Taranamadı: ' + String((err && err.message) || err)));
          } else {
            if (L.lockedBy(locks(), id, '') && lockEnabled() && !(await guard(id, ''))) return;
            saveRoots(roots().filter((x) => x.id !== id));
            store.setPref(LOCKS_KEY, locks().filter((k) => !k.startsWith(id + '|')));
            indexes.delete(id);
            store.cache.del && store.cache.del('lib-index:v1:' + id);
          }
          render();
        }),
      });
    }

    // ---- tıklamalar ----
    async function openRoot(id) {
      const r = rootOf(id);
      if (!r) return;
      if (!(await guard(id, ''))) return;
      if (r.type === 'saf') Object.assign(st, { view: 'dir', rootId: id, dir: '', remote: null });
      else Object.assign(st, { view: 'remote', rootId: id, remote: { rootId: id, stack: [rootFrame(r)], rows: [] } });
      render();
    }

    async function onFile(fileId) {
      const idx = st.view === 'dir' ? indexes.get(st.rootId) || [] : allIndex();
      const f = idx.find((x) => x.id === fileId);
      if (!f) return;
      if (f.kind === 'image') {
        const siblings = idx.filter((x) => x.kind === 'image' && x.dir === f.dir && x.rootId === f.rootId).sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }));
        return viewer(siblings, Math.max(0, siblings.findIndex((x) => x.id === f.id)), async (r) => (await plugin.libImage({ uri: r.uri, max: 1800 })).data);
      }
      const same = idx.filter((x) => x.dir === f.dir && x.rootId === f.rootId);
      const pl = L.playlistOf(same, f);
      playList(pl.items, pl.index, rootOf(f.rootId), null);
    }

    function remoteFiles(rm, kinds) {
      return rm.rows.filter((r) => !r.dir && kinds.includes(r.kind));
    }

    async function onRemoteFile(i) {
      const rm = st.remote;
      const root = rootOf(rm.rootId);
      const row = rm.rows[i];
      if (!row || !root) return;
      if (row.kind === 'image') {
        const imgs = remoteFiles(rm, ['image']);
        if (root.type === 'dav' && row.headers) return toast('Şifreli WebDAV paylaşımlarında fotoğraf açılamaz', 3500);
        const srcOf = async (r) => (root.type === 'smb' ? (await plugin.netSmbUrl({ host: root.host, path: r.path, user: root.user || '', pass: root.pass || '' })).url : r.url);
        return viewer(imgs, Math.max(0, imgs.findIndex((x) => x.id === row.id)), srcOf);
      }
      const same = remoteFiles(rm, [row.kind]);
      playList(same, Math.max(0, same.findIndex((x) => x.id === row.id)), root, rm.rows);
    }

    host.addEventListener('click', async (e) => {
      const t = e.target;
      const act = t.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'home') Object.assign(st, { view: 'home', q: '' });
        else if (a === 'addfolder') return addFolder();
        else if (a === 'addnet') return addNet();
        else if (a === 'pickfile') return pickFiles();
        else if (a === 'rescan') {
          toast('Taranıyor…', 2000);
          await ensureIndex(rootOf(st.rootId), true).catch((err) => toast('Taranamadı: ' + String((err && err.message) || err)));
        } else if (a === 'lock') {
          if (!(await toggleDirLock(st.rootId, st.view === 'remote' ? '' : st.dir))) return;
        } else if (a === 'up') {
          if (st.view === 'remote') {
            if (st.remote.stack.length > 1) st.remote.stack.pop();
            else Object.assign(st, { view: 'home', remote: null });
          } else if (st.dir) st.dir = L.parentOf(st.dir);
          else st.view = 'home';
        } else if (a === 'playall') {
          if (st.view === 'remote') {
            const rm = st.remote;
            const first = rm.rows.find((r) => !r.dir && (r.kind === 'video' || r.kind === 'audio'));
            if (!first) return;
            const same = remoteFiles(rm, [first.kind]);
            return playList(same, 0, rootOf(rm.rootId), rm.rows);
          }
          const idx = indexes.get(st.rootId) || [];
          const files = L.listDir(idx, st.dir).files.filter((f) => f.kind !== 'image');
          if (!files.length) return;
          const pl = L.playlistOf(files, files[0]);
          return playList(pl.items, 0, rootOf(st.rootId), null);
        }
        return render();
      }
      const rb = t.closest('[data-root]');
      if (rb) return openRoot(rb.dataset.root);
      const rm = t.closest('[data-rootmenu]');
      if (rm) return rootMenu(rm.dataset.rootmenu);
      const dir = t.closest('[data-dir]');
      if (dir) {
        if (!(await guard(st.rootId, dir.dataset.dir))) return;
        st.dir = dir.dataset.dir;
        return render();
      }
      const file = t.closest('[data-file]');
      if (file) {
        const f = (st.view === 'dir' ? indexes.get(st.rootId) || [] : allIndex()).find((x) => x.id === file.dataset.file);
        if (f && !(await guard(f.rootId, f.dir))) return;
        return onFile(file.dataset.file);
      }
      const rd = t.closest('[data-rdir]');
      if (rd) {
        const row = st.remote.rows[Number(rd.dataset.rdir)];
        const root = rootOf(st.remote.rootId);
        st.remote.stack.push(root.type === 'dav' ? { name: row.name, url: row.url } : root.type === 'upnp' ? { name: row.name, id: row.objectId } : { name: row.name, path: row.path });
        return render();
      }
      const rf = t.closest('[data-rfile]');
      if (rf) return onRemoteFile(Number(rf.dataset.rfile));
    });

    host.addEventListener('input', (e) => {
      if (e.target.id !== 'lb-q') return;
      const q = e.target.value.trim();
      clearTimeout(open.t);
      open.t = setTimeout(() => {
        st.q = q;
        st.view = q ? 'search' : 'home';
        render().then(() => {
          const inp = host.querySelector('#lb-q');
          if (inp) {
            inp.focus();
            inp.setSelectionRange(inp.value.length, inp.value.length);
          }
        });
      }, 250);
    });

    render();
    return pg;
  }

  return { open };
}
