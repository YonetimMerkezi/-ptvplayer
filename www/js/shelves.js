// Netflix tarzı satırlar: her kategori yatayda kayan tek bir şerittir; satırlar dikeyde pencerelenir (yalnız görünenler DOM'da).
// Gezinme kuralları ve ölçüler saf işlevlerdir (test edilir); Shelves sınıfı DOM, kumanda tuşları ve odak hatırlamayı yönetir.
import { visibleRows } from './vlist.js';

export const SHELF_CAP = 24; // satırda en çok bu kadar yapım; fazlası "Tümünü gör" kutusunda

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Ekran ölçüsüne göre kutu ve satır ölçüleri. capPx: kutudaki ad alanı yüksekliği.
// Satır, görünümün ~%80'i kadardır: bir satır tam görünür, altındaki satırın başlığı görünür kalır.
export function shelfSizes({ viewW, viewH, scale = 1, capPx = 46 }) {
  const title = Math.round(34 * scale);
  const pad = Math.round(28 * scale); // şeridin üst+alt iç boşluğu: odak halkası ve büyüme kırpılmasın
  const narrow = viewW < 700; // telefon: ekranda ~3,3 kutu (dördüncüsü yarım görünür, kayacağı belli olur)
  const byWidth = viewW / (narrow ? 3.75 : 8.6);
  const byHeight = (viewH * 0.8 - title - pad - capPx) / 1.5;
  const cw = Math.round(clamp(narrow ? byWidth : Math.min(byWidth, byHeight), 84, 210));
  const ch = Math.round(cw * 1.5 + capPx);
  return { cw, ch, title, pad, rowH: title + pad + ch };
}

// Oka göre sıradaki hücre. lenOf(i): i. satırdaki hücre sayısı. null: kumanda bu tuşu başka yere bıraksın (üstte satır yok).
// stay: kenarda, yer değişmez ama tuş yutulur (odak satırlardan kaçmasın).
export function nextCell(lenOf, rows, r, c, key) {
  if (key === 'ArrowRight') return c + 1 < lenOf(r) ? { r, c: c + 1 } : { r, c, stay: true };
  if (key === 'ArrowLeft') return c > 0 ? { r, c: c - 1 } : { r, c, stay: true };
  if (key === 'ArrowDown') return r + 1 < rows ? { r: r + 1, c: Math.min(c, lenOf(r + 1) - 1) } : { r, c, stay: true };
  if (key === 'ArrowUp') return r > 0 ? { r: r - 1, c: Math.min(c, lenOf(r - 1) - 1) } : null;
  return null;
}

// Yatay kaydırma: odaktaki kutu görünür kalsın, komşu kutudan biraz görünsün (kayacağı belli olur).
export function hTarget({ left, width, view, cur, max }) {
  const m = Math.min(width, view / 4);
  let to = cur;
  if (left - m < cur) to = left - m;
  else if (left + width + m > cur + view) to = left + width + m - view;
  return clamp(to, 0, Math.max(0, max));
}

const reduced = () => document.documentElement.hasAttribute('data-lite') || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

// kaydırma yumuşatma: eleman başına tek canlı animasyon
function animate(el, prop, to, instant) {
  if (el.__tw) cancelAnimationFrame(el.__tw.raf);
  el.__tw = null;
  const from = el[prop];
  if (instant || reduced() || typeof requestAnimationFrame !== 'function' || Math.abs(to - from) < 1) {
    el[prop] = to;
    return;
  }
  const t0 = performance.now();
  const tw = { goal: to, raf: 0 };
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 150);
    el[prop] = from + (to - from) * (1 - Math.pow(1 - k, 3));
    tw.raf = k < 1 ? requestAnimationFrame(step) : 0;
    if (k >= 1) el.__tw = null;
  };
  el.__tw = tw;
  tw.raf = requestAnimationFrame(step);
}

const TILE_SEL = '[data-more],[data-lock],[data-edit]';

export class Shelves {
  // opts: sizes(viewW, viewH) → shelfSizes sonucu, itemsOf(row) → öğe listesi (sıralı), titleHtml(row),
  //       renderCard(item, r, c) → html, renderTile(kind, row, r, c) → html (kind: more | lock | edit),
  //       onOpen(item, row, ev), onMore(row), onLock(row), onEdit(), onFocusItem(item, row), onLongPress(item, ev, el)
  constructor(el, opts) {
    this.el = el;
    this.o = opts;
    this.items = []; // satırlar: { id, name, count, locked?, edit? }
    this._rows = new Map(); // satır no → { el, sig }
    this._cache = new Map(); // satır kimliği → { top, total }
    this._h = new Map(); // satır kimliği → yatay kaydırma
    this._cur = null; // son odaklanan { id, c }
    this._raf = 0;
    this.rowH = 300;
    el.classList.add('sh');
    el.innerHTML = '<div class="sh-sizer"></div><div class="sh-win"></div>';
    this.sizer = el.firstChild;
    this.win = el.lastChild;
    this._onScroll = () => this._schedule();
    el.addEventListener('scroll', this._onScroll, { passive: true });
    this._onKey = (ev) => this._key(ev);
    el.addEventListener('keydown', this._onKey);
    this._onClick = (ev) => this._click(ev);
    el.addEventListener('click', this._onClick);
    this._onFocusIn = (ev) => this._focusIn(ev);
    el.addEventListener('focusin', this._onFocusIn);
    this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.layout()) : null;
    if (this._ro) this._ro.observe(el);
    this._lp = { timer: 0, x: 0, y: 0 };
    this._lpFired = false;
    this._lpCancel = () => {
      clearTimeout(this._lp.timer);
      this._lp.timer = 0;
    };
    this._onDown = (ev) => {
      this._lpFired = false;
      if (!this.o.onLongPress || (ev.button != null && ev.button > 0)) return;
      const t = ev.target.closest('[data-r]');
      if (!t || t.matches(TILE_SEL)) return;
      this._lp.x = ev.clientX;
      this._lp.y = ev.clientY;
      this._lpCancel();
      this._lp.timer = setTimeout(() => {
        this._lp.timer = 0;
        const it = this._itemOf(t);
        if (!it) return;
        this._lpFired = true;
        this.o.onLongPress(it, ev, t);
      }, 550);
    };
    this._onMove = (ev) => {
      if (this._lp.timer && Math.hypot(ev.clientX - this._lp.x, ev.clientY - this._lp.y) > 10) this._lpCancel();
    };
    this._onCtx = (ev) => {
      if (this.o.onLongPress && ev.target.closest('[data-r]') && !ev.target.closest(TILE_SEL)) ev.preventDefault();
    };
    el.addEventListener('pointerdown', this._onDown);
    el.addEventListener('pointermove', this._onMove);
    el.addEventListener('pointerup', this._lpCancel);
    el.addEventListener('pointercancel', this._lpCancel);
    el.addEventListener('contextmenu', this._onCtx);
  }

  // ---- veri
  setItems(rows, keepScroll = false) {
    const focus = this._focusedCell();
    this.items = rows;
    this._cache.clear();
    if (!keepScroll) {
      this.el.scrollTop = 0;
      this._h.clear();
    }
    for (const o of this._rows.values()) this._saveH(o);
    this.win.textContent = '';
    this._rows.clear();
    this.layout();
    if (focus) this._refocus(focus);
  }

  // satırdaki hücreler: { top: öğeler, total, tile: 'more'|'lock'|'edit'|null, len }
  _cells(r) {
    const row = this.items[r];
    if (!row) return { top: [], total: 0, tile: null, len: 0 };
    if (row.edit) return { top: [], total: 0, tile: 'edit', len: 1 };
    if (row.locked) return { top: [], total: 0, tile: 'lock', len: 1 };
    let c = this._cache.get(row.id);
    if (!c) {
      const all = this.o.itemsOf(row) || [];
      c = { top: all.slice(0, SHELF_CAP), total: all.length };
      this._cache.set(row.id, c);
    }
    const tile = c.total > SHELF_CAP ? 'more' : null;
    return { top: c.top, total: c.total, tile, len: c.top.length + (tile ? 1 : 0) };
  }

  _itemOf(el) {
    if (!el || el.matches(TILE_SEL)) return null;
    return this._cells(Number(el.dataset.r)).top[Number(el.dataset.c)] || null;
  }

  itemAt(r, c) {
    return this._cells(r).top[c] || null;
  }

  firstItem() {
    for (let r = 0; r < this.items.length; r++) {
      const it = this._cells(r).top[0];
      if (it) return it;
    }
    return null;
  }

  // yalnız hesaplanmış (görünen) satırlara bakar: tüm kategorileri sıralamak gerekmez
  hasItem(id) {
    for (const c of this._cache.values()) if (c.top.some((x) => x.id === id)) return true;
    return false;
  }

  // ---- çizim
  layout() {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    if (!w || !h) return;
    const s = this.o.sizes(w, h);
    // ölçü aynıysa satırlar yerinde kalır (ilk ResizeObserver çağrısı kurulu satırları ve odağı bozmasın)
    const same = this.sz && this._rows.size && ['cw', 'ch', 'title', 'pad', 'rowH'].every((k) => this.sz[k] === s[k]);
    this.rowH = s.rowH;
    this.sz = s;
    if (same) return this.draw();
    const focus = this._focusedCell();
    const st = this.el.style;
    st.setProperty('--sh-w', s.cw + 'px');
    st.setProperty('--sh-h', s.ch + 'px');
    st.setProperty('--sh-title', s.title + 'px');
    st.setProperty('--sh-pad', s.pad + 'px');
    // ölçü değiştiyse satırlar yeni ölçüyle baştan kurulur
    for (const o of this._rows.values()) this._saveH(o);
    this.win.textContent = '';
    this._rows.clear();
    this.draw();
    if (focus) this._refocus(focus);
  }

  _schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.draw();
    });
  }

  _saveH(o) {
    const strip = o.el.querySelector('.sh-strip');
    if (strip && o.id != null) this._h.set(o.id, strip.scrollLeft);
  }

  _rowHtml(r) {
    const row = this.items[r];
    const cells = this._cells(r);
    let html = '';
    if (cells.tile === 'edit' || cells.tile === 'lock') html = this.o.renderTile(cells.tile, row, r, 0);
    else {
      cells.top.forEach((it, c) => (html += this.o.renderCard(it, r, c)));
      if (cells.tile === 'more') html += this.o.renderTile('more', { ...row, count: cells.total }, r, cells.top.length);
    }
    const count = row.edit ? '' : `<small>${cells.total || row.count || ''}</small>`;
    return `<h3 class="sh-t">${this.o.titleHtml(row)}${count}</h3><div class="sh-strip">${html}</div>`;
  }

  _mount(r) {
    const row = this.items[r];
    if (!row || this._rows.has(r)) return;
    const el = document.createElement('section');
    el.className = 'sh-row';
    el.dataset.row = r;
    el.setAttribute('style', `top:${r * this.rowH}px;height:${this.rowH}px`);
    el.innerHTML = this._rowHtml(r);
    let next = null;
    for (const [q, o] of this._rows) if (q > r && (!next || q < next.q)) next = { q, el: o.el };
    this.win.insertBefore(el, next ? next.el : null);
    const strip = el.querySelector('.sh-strip');
    const saved = this._h.get(row.id);
    if (saved) strip.scrollLeft = saved;
    this._rows.set(r, { el, id: row.id, html: el.innerHTML });
  }

  draw() {
    if (!this.rowH) return;
    const v = visibleRows({ scrollTop: this.el.scrollTop, viewH: this.el.clientHeight || 600, rowH: this.rowH, count: this.items.length, cols: 1, overscan: 2 });
    this.sizer.style.height = v.total + 'px';
    const act = document.activeElement;
    const focus = this.win.contains(act) ? this._cellOf(act) : null;
    for (const [r, o] of this._rows) {
      if (r >= v.first && r <= v.last) continue;
      this._saveH(o);
      o.el.remove();
      this._rows.delete(r);
    }
    for (let r = v.first; r <= v.last; r++) this._mount(r);
    if (focus && !this.win.contains(document.activeElement)) this._refocus(focus);
  }

  // Beğeni/ilerleme gibi kart içeriği değişince görünen satırları günceller (kaydırma ve odak korunur)
  refreshRows() {
    const act = document.activeElement;
    const focus = this.win.contains(act) ? this._cellOf(act) : null;
    for (const [r, o] of [...this._rows]) {
      const tmp = document.createElement('div');
      tmp.innerHTML = this._rowHtml(r);
      if (tmp.innerHTML === o.html) continue;
      const strip = o.el.querySelector('.sh-strip');
      const left = strip.scrollLeft;
      o.el.innerHTML = tmp.innerHTML;
      o.el.querySelector('.sh-strip').scrollLeft = left;
      o.html = o.el.innerHTML;
    }
    if (focus && !this.win.contains(document.activeElement)) this._refocus(focus);
  }

  // ---- odak
  _cellOf(el) {
    const t = el && el.closest && el.closest('[data-r]');
    if (!t || !this.win.contains(t)) return null;
    const row = this.items[Number(t.dataset.r)];
    return row ? { id: row.id, c: Number(t.dataset.c) } : null;
  }

  _focusedCell() {
    const act = document.activeElement;
    return this.win.contains(act) ? this._cellOf(act) : null;
  }

  _refocus(cell) {
    const r = this.items.findIndex((x) => x.id === cell.id);
    if (r < 0) return;
    this._mount(r);
    const t = this._find(r, Math.min(cell.c, this._cells(r).len - 1));
    if (t) t.focus({ preventScroll: true });
  }

  _find(r, c) {
    const o = this._rows.get(r);
    return o ? o.el.querySelector(`[data-c="${c}"]`) : null;
  }

  // r. satırın c. hücresine odak verir; satır üste oturur, kutu yatayda görünür kalır. hızlı: uzak atlamada anında konumlanır.
  focusCell(r, c) {
    if (r < 0 || r >= this.items.length) return false;
    const len = this._cells(r).len;
    if (!len) return false;
    c = clamp(c, 0, len - 1);
    const h = this.el.clientHeight || 400;
    const max = Math.max(0, this.items.length * this.rowH - h);
    const to = clamp(r * this.rowH, 0, max);
    const near = Math.abs(to - this.el.scrollTop) <= h * 1.5;
    if (!near) animate(this.el, 'scrollTop', to, true);
    this.draw();
    this._mount(r); // pencere dışındaysa yine de kur (uzak atlama dışında olmaz)
    const t = this._find(r, c);
    if (!t) return false;
    t.focus({ preventScroll: true });
    if (near && to !== this.el.scrollTop) animate(this.el, 'scrollTop', to, false);
    this._show(t);
    return true;
  }

  // kutu şeritte görünür kalsın
  _show(t) {
    const strip = t.parentElement;
    if (!strip || !strip.classList.contains('sh-strip')) return;
    const cur = strip.__tw ? strip.__tw.goal : strip.scrollLeft;
    const to = hTarget({ left: t.offsetLeft, width: t.offsetWidth, view: strip.clientWidth, cur, max: strip.scrollWidth - strip.clientWidth });
    if (Math.abs(to - cur) >= 1) animate(strip, 'scrollLeft', to, false);
  }

  // VirtualList uyumu: i. satırın ilk (ya da son) hücresi
  focusIndex(i, last = false) {
    const row = this.items[i];
    if (!row) return false;
    return this.focusCell(i, last ? this._cells(i).len - 1 : 0);
  }

  scrollToIndex(i) {
    const h = this.el.clientHeight || 400;
    const max = Math.max(0, this.items.length * this.rowH - h);
    animate(this.el, 'scrollTop', clamp(i * this.rowH, 0, max), true);
    this.draw();
  }

  _focusIn(ev) {
    const t = ev.target.closest && ev.target.closest('[data-r]');
    if (!t || !this.win.contains(t)) return;
    const r = Number(t.dataset.r);
    this._show(t);
    const it = this._itemOf(t);
    if (it && this.o.onFocusItem) this.o.onFocusItem(it, this.items[r]);
  }

  _key(ev) {
    const t = ev.target.closest && ev.target.closest('[data-r]');
    if (!t || !this.win.contains(t)) return;
    const r = Number(t.dataset.r);
    const c = Number(t.dataset.c);
    if (ev.key === 'ContextMenu' && this.o.onLongPress) {
      const it = this._itemOf(t);
      if (it) {
        ev.preventDefault();
        this.o.onLongPress(it, ev, t);
      }
      return;
    }
    if (!/^Arrow(Left|Right|Up|Down)$/.test(ev.key) || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const n = nextCell((i) => this._cells(i).len, this.items.length, r, c, ev.key);
    if (!n) return; // üst satır yok: kumandanın genel gezinmesi üst çubuğa geçirir
    ev.preventDefault();
    if (!n.stay) this.focusCell(n.r, n.c);
  }

  _click(ev) {
    if (this._lpFired) {
      this._lpFired = false; // uzun basmadan sonra gelen tıklama işlenmez
      return;
    }
    const t = ev.target.closest && ev.target.closest('[data-r]');
    if (!t || !this.win.contains(t)) return;
    const row = this.items[Number(t.dataset.r)];
    if (!row) return;
    if (t.dataset.edit != null) return this.o.onEdit && this.o.onEdit();
    if (t.dataset.lock != null) return this.o.onLock && this.o.onLock(row);
    if (t.dataset.more != null) return this.o.onMore && this.o.onMore(row);
    const it = this._itemOf(t);
    if (it) this.o.onOpen(it, row, ev);
  }

  destroy() {
    this.el.removeEventListener('scroll', this._onScroll);
    this.el.removeEventListener('keydown', this._onKey);
    this.el.removeEventListener('click', this._onClick);
    this.el.removeEventListener('focusin', this._onFocusIn);
    this.el.removeEventListener('pointerdown', this._onDown);
    this.el.removeEventListener('pointermove', this._onMove);
    this.el.removeEventListener('pointerup', this._lpCancel);
    this.el.removeEventListener('pointercancel', this._lpCancel);
    this.el.removeEventListener('contextmenu', this._onCtx);
    this._lpCancel();
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this.el.__tw) cancelAnimationFrame(this.el.__tw.raf);
    if (this._ro) this._ro.disconnect();
  }
}
