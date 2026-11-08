// Sanal liste/ızgara: yalnız görünen satırlar DOM'da tutulur (on binlerce öğe için).

// Saf hesap: hangi satırlar çizilmeli?
export function visibleRows({ scrollTop, viewH, rowH, count, cols = 1, overscan = 4 }) {
  const rows = Math.ceil(count / cols);
  const first = Math.max(0, Math.floor(scrollTop / rowH) - overscan);
  const last = Math.min(rows - 1, Math.ceil((scrollTop + viewH) / rowH) + overscan);
  return { first, last, rows, total: rows * rowH };
}

export class VirtualList {
  // opts: rowH, minCellW (ızgara için), cellH, render(item, index) -> html, onTap(index, ev), gap
  constructor(el, opts) {
    this.el = el;
    this.o = { gap: 0, ...opts };
    this.items = [];
    this.cols = 1;
    this._raf = 0;
    el.classList.add('vl');
    el.innerHTML = '<div class="vl-sizer"></div><div class="vl-win"></div>';
    this.sizer = el.firstChild;
    this.win = el.lastChild;
    this._onScroll = () => this._schedule();
    el.addEventListener('scroll', this._onScroll, { passive: true });
    this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.layout()) : null;
    if (this._ro) this._ro.observe(el);
    this._onKey = (ev) => this._key(ev);
    this._onClick = (ev) => {
      const t = ev.target.closest('[data-i]');
      if (t && this.el.contains(t)) this.o.onTap(Number(t.dataset.i), ev, t);
    };
    el.addEventListener('keydown', this._onKey);
    el.addEventListener('click', this._onClick);
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

  draw() {
    const v = visibleRows({ scrollTop: this.el.scrollTop, viewH: this.el.clientHeight || 600, rowH: this.rowH, count: this.items.length, cols: this.cols });
    this.sizer.style.height = v.total + 'px';
    if (!this.items.length) {
      this.win.innerHTML = '';
      return;
    }
    const parts = [];
    for (let r = v.first; r <= v.last; r++) {
      const cells = [];
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        if (i >= this.items.length) break;
        cells.push(this.o.render(this.items[i], i));
      }
      const style = `top:${r * this.rowH}px;height:${this.rowH - this.o.gap}px`;
      parts.push(
        this.o.minCellW
          ? `<div class="vl-row vl-grid" style="${style};grid-template-columns:repeat(${this.cols},1fr);gap:${this.o.gap}px">${cells.join('')}</div>`
          : `<div class="vl-row" style="${style}">${cells.join('')}</div>`,
      );
    }
    const focused = this.win.contains(document.activeElement) && document.activeElement.dataset ? document.activeElement.dataset.i : null;
    this.win.innerHTML = parts.join('');
    if (focused != null) {
      const t = this.win.querySelector(`[data-i="${focused}"]`);
      if (t) t.focus({ preventScroll: true });
    }
    this.win.dispatchEvent(new CustomEvent('vl-draw', { bubbles: true }));
  }

  // Kumanda/klavye: oklarla satırlar arasında gezinme (görünmeyen satırı önce çizer).
  _key(ev) {
    const cur = ev.target.closest && ev.target.closest('[data-i]');
    if (!cur) return;
    const i = Number(cur.dataset.i);
    const step = { ArrowDown: this.cols, ArrowUp: -this.cols, ArrowRight: this.cols > 1 ? 1 : 0, ArrowLeft: this.cols > 1 ? -1 : 0 }[ev.key];
    if (!step) return;
    const n = i + step;
    if (n < 0 || n >= this.items.length) return;
    ev.preventDefault();
    this.focusIndex(n);
  }

  focusIndex(n) {
    const top = Math.floor(n / this.cols) * this.rowH;
    if (top < this.el.scrollTop || top + this.rowH > this.el.scrollTop + this.el.clientHeight) {
      this.el.scrollTop = Math.max(0, top - this.el.clientHeight / 2 + this.rowH / 2);
    }
    this.draw();
    const t = this.win.querySelector(`[data-i="${n}"]`);
    if (t) t.focus({ preventScroll: true });
  }

  refreshRows() {
    this.draw();
  }

  scrollToIndex(i) {
    const row = Math.floor(i / this.cols);
    this.el.scrollTop = Math.max(0, row * this.rowH - this.el.clientHeight / 2 + this.rowH / 2);
  }

  destroy() {
    this.el.removeEventListener('scroll', this._onScroll);
    this.el.removeEventListener('keydown', this._onKey);
    this.el.removeEventListener('click', this._onClick);
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._ro) this._ro.disconnect();
  }
}
