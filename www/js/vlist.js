// Sanal liste/ızgara: yalnız görünen satırlar DOM'da tutulur (on binlerce öğe için).

// Saf hesap: hangi satırlar çizilmeli?
export function visibleRows({ scrollTop, viewH, rowH, count, cols = 1, overscan = 4 }) {
  const rows = Math.ceil(count / cols);
  const first = Math.max(0, Math.floor(scrollTop / rowH) - overscan);
  const last = Math.min(rows - 1, Math.ceil((scrollTop + viewH) / rowH) + overscan);
  return { first, last, rows, total: rows * rowH };
}

export class VirtualList {
  // opts: rowH, minCellW (ızgara için), cellH, render(item, index) -> html, onTap(index, ev), gap,
  //       onLongPress(index, ev, el) (isteğe bağlı: uzun basma / sağ tık / Menü tuşu)
  constructor(el, opts) {
    this.el = el;
    this.o = { gap: 0, ...opts };
    this.items = [];
    this.cols = 1;
    this._raf = 0;
    this._rows = new Map(); // satır no → { el, sig, cells } — DOM yeniden kullanılır, yalnız değişen parça güncellenir
    this._tw = 0; // yumuşak kaydırma çerçevesi
    this._goal = 0;
    el.classList.add('vl');
    el.innerHTML = '<div class="vl-sizer"></div><div class="vl-win"></div>';
    this.sizer = el.firstChild;
    this.win = el.lastChild;
    this._onScroll = () => this._schedule();
    el.addEventListener('scroll', this._onScroll, { passive: true });
    this._onUser = () => this._stopTween();
    el.addEventListener('wheel', this._onUser, { passive: true });
    el.addEventListener('touchstart', this._onUser, { passive: true });
    this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.layout()) : null;
    if (this._ro) this._ro.observe(el);
    this._onKey = (ev) => this._key(ev);
    this._onClick = (ev) => {
      if (this._lpFired) {
        this._lpFired = false; // uzun basmadan sonra gelen tıklama işlenmez
        return;
      }
      const t = ev.target.closest('[data-i]');
      if (t && this.el.contains(t)) this.o.onTap(Number(t.dataset.i), ev, t);
    };
    el.addEventListener('keydown', this._onKey);
    el.addEventListener('click', this._onClick);
    this._lp = { timer: 0, x: 0, y: 0 };
    this._lpFired = false;
    this._lpCancel = () => {
      clearTimeout(this._lp.timer);
      this._lp.timer = 0;
    };
    this._onDown = (ev) => {
      this._lpFired = false;
      if (!this.o.onLongPress || (ev.button != null && ev.button > 0)) return;
      const t = ev.target.closest('[data-i]');
      if (!t || ev.target.closest('button')) return;
      this._lp.x = ev.clientX;
      this._lp.y = ev.clientY;
      this._lpCancel();
      this._lp.timer = setTimeout(() => {
        this._lp.timer = 0;
        this._lpFired = true;
        this.o.onLongPress(Number(t.dataset.i), ev, t);
      }, 550);
    };
    this._onMove = (ev) => {
      if (this._lp.timer && Math.hypot(ev.clientX - this._lp.x, ev.clientY - this._lp.y) > 10) this._lpCancel();
    };
    this._onCtx = (ev) => {
      if (this.o.onLongPress && ev.target.closest('[data-i]')) ev.preventDefault();
    };
    if (opts.onLongPress) {
      el.addEventListener('pointerdown', this._onDown);
      el.addEventListener('pointermove', this._onMove);
      el.addEventListener('pointerup', this._lpCancel);
      el.addEventListener('pointercancel', this._lpCancel);
      el.addEventListener('contextmenu', this._onCtx);
    }
  }

  setItems(items, keepScroll = false) {
    this.items = items;
    if (!keepScroll) this.el.scrollTop = 0;
    this.layout();
  }

  layout() {
    const w = this.el.clientWidth;
    if (this.o.minCellW) this.cols = Math.max(1, Math.floor((w + this.o.gap) / (this.o.minCellW + this.o.gap)));
    this.rowH = this.o.minCellW ? this.o.cellH(w, this.cols) + this.o.gap : this.o.rowH;
    this.cellW = this.o.minCellW ? (w - this.o.gap * (this.cols - 1)) / this.cols : w;
    this.draw();
  }

  _schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.draw();
    });
  }

  // Yalnız görünen aralığı günceller: aynı satır/hücre HTML'i değişmediyse DOM'a dokunulmaz (görsel yeniden yüklenmez,
  // odak ve yer korunur); kaydırınca yalnız giren satırlar eklenir, çıkanlar silinir. Titreme/yanıp sönme böylece olmaz.
  draw() {
    const v = visibleRows({ scrollTop: this.el.scrollTop, viewH: this.el.clientHeight || 600, rowH: this.rowH, count: this.items.length, cols: this.cols });
    this.sizer.style.height = v.total + 'px';
    if (!this.items.length) {
      this.win.textContent = '';
      this._rows.clear();
      return;
    }
    const act = document.activeElement;
    const focused = this.win.contains(act) && act.dataset ? act.dataset.i : null;
    let changed = false;
    for (const [r, o] of this._rows) {
      if (r >= v.first && r <= v.last) continue;
      o.el.remove();
      this._rows.delete(r);
      changed = true;
    }
    const grid = !!this.o.minCellW;
    for (let r = v.first; r <= v.last; r++) {
      const cells = [];
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        if (i >= this.items.length) break;
        cells.push(this.o.render(this.items[i], i));
      }
      const style = `top:${r * this.rowH}px;height:${this.rowH - this.o.gap}px` + (grid ? `;grid-template-columns:repeat(${this.cols},1fr);gap:${this.o.gap}px` : '');
      const old = this._rows.get(r);
      if (old && old.sig === style && old.cells.length === cells.length) {
        // aynı satır: yalnız değişen hücreleri değiştir
        for (let c = 0; c < cells.length; c++) {
          if (old.cells[c] === cells[c]) continue;
          const t = document.createElement('template');
          t.innerHTML = cells[c];
          if (t.content.children.length !== 1 || old.el.children.length !== cells.length) {
            old.sig = ''; // beklenmedik yapı: satırı baştan kur
            break;
          }
          old.el.children[c].replaceWith(t.content.firstElementChild);
          old.cells[c] = cells[c];
          changed = true;
        }
        if (old.sig === style) continue;
      }
      const el = document.createElement('div');
      el.className = grid ? 'vl-row vl-grid' : 'vl-row';
      el.setAttribute('style', style);
      el.innerHTML = cells.join('');
      if (old) old.el.replaceWith(el);
      else {
        let next = null;
        for (let q = r + 1; q <= v.last && !next; q++) next = this._rows.has(q) ? this._rows.get(q).el : null;
        this.win.insertBefore(el, next);
      }
      this._rows.set(r, { el, sig: style, cells });
      changed = true;
    }
    if (focused != null && !this.win.contains(document.activeElement)) {
      const t = this.win.querySelector(`[data-i="${focused}"]`);
      if (t) t.focus({ preventScroll: true });
    }
    if (changed) this.win.dispatchEvent(new CustomEvent('vl-draw', { bubbles: true }));
  }

  // Kumanda/klavye: oklarla satırlar arasında gezinme (görünmeyen satırı önce çizer).
  _key(ev) {
    const cur = ev.target.closest && ev.target.closest('[data-i]');
    if (!cur) return;
    const i = Number(cur.dataset.i);
    if (ev.key === 'ContextMenu' && this.o.onLongPress) {
      ev.preventDefault();
      this.o.onLongPress(i, ev, cur);
      return;
    }
    const step = { ArrowDown: this.cols, ArrowUp: -this.cols, ArrowRight: this.cols > 1 ? 1 : 0, ArrowLeft: this.cols > 1 ? -1 : 0 }[ev.key];
    if (!step) return;
    const n = i + step;
    if (n < 0 || n >= this.items.length) return;
    ev.preventDefault();
    this.focusIndex(n);
  }

  // Odağı n. öğeye taşır; satır görünümün dışına çıkıyorsa yalnız gerektiği kadar (komşu satır görünür kalacak biçimde)
  // ve yumuşakça kaydırır. Uzak atlamada doğrudan konumlanır.
  focusIndex(n) {
    const h = this.el.clientHeight || 600;
    const top = Math.floor(n / this.cols) * this.rowH;
    const cur = this._tw ? this._goal : this.el.scrollTop;
    const m = Math.min(this.rowH, h / 4);
    let to = cur;
    if (top - m < cur) to = top - m;
    else if (top + this.rowH + m > cur + h) to = top + this.rowH + m - h;
    const max = Math.max(0, Math.ceil(this.items.length / this.cols) * this.rowH - h);
    to = Math.min(max, Math.max(0, to));
    const find = () => this.win.querySelector(`[data-i="${n}"]`);
    this.draw();
    let t = find();
    if (!t || Math.abs(to - this.el.scrollTop) > h) {
      this._stopTween();
      this.el.scrollTop = to;
      this.draw();
      t = find();
    } else if (to !== cur) {
      this._tweenTo(to);
    }
    if (t) t.focus({ preventScroll: true });
  }

  _stopTween() {
    if (this._tw) cancelAnimationFrame(this._tw);
    this._tw = 0;
  }

  _tweenTo(y) {
    this._stopTween();
    const from = this.el.scrollTop;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof requestAnimationFrame !== 'function' || Math.abs(y - from) < 1) {
      this.el.scrollTop = y;
      return;
    }
    this._goal = y;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 150);
      this.el.scrollTop = from + (y - from) * (1 - Math.pow(1 - k, 3));
      this._tw = k < 1 ? requestAnimationFrame(step) : 0;
    };
    this._tw = requestAnimationFrame(step);
  }

  refreshRows() {
    this.draw();
  }

  scrollToIndex(i) {
    this._stopTween();
    const row = Math.floor(i / this.cols);
    this.el.scrollTop = Math.max(0, row * this.rowH - this.el.clientHeight / 2 + this.rowH / 2);
  }

  destroy() {
    this._stopTween();
    this.el.removeEventListener('wheel', this._onUser);
    this.el.removeEventListener('touchstart', this._onUser);
    this.el.removeEventListener('scroll', this._onScroll);
    this.el.removeEventListener('keydown', this._onKey);
    this.el.removeEventListener('click', this._onClick);
    this._lpCancel();
    for (const [n, f] of [['pointerdown', this._onDown], ['pointermove', this._onMove], ['pointerup', this._lpCancel], ['pointercancel', this._lpCancel], ['contextmenu', this._onCtx]]) {
      this.el.removeEventListener(n, f);
    }
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._ro) this._ro.disconnect();
  }
}
