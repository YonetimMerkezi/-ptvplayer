// Sanal liste/ızgara: yalnız görünen satırlar DOM'da durur (binlerce kanal 2016 model TV'de bile akıcı kalır).
// cols=1 → liste; cols>1 → ızgara. Odak, elemanın .on sınıfıyla gösterilir.
import { el, enYakin, kuruResim } from './ui.js';

export class VList {
  constructor(kap, opt) {
    this.kap = kap;
    this.o = Object.assign({ cols: 1, rowH: 60, render: () => '', onActivate: null, onFocus: null, empty: 'Liste boş', buffer: 2 }, opt);
    this.items = [];
    this.index = 0;
    this.top = 0; // görünen ilk satır
    this.nodes = {};
    this.active = false;
    kap.className += ' vl';
    this.in = el('div', 'vl-in');
    this.msg = el('div', 'vl-msg');
    kap.appendChild(this.in);
    kap.appendChild(this.msg);
    kuruResim(kap);
    kap.addEventListener('click', (e) => {
      const n = enYakin(e.target, '[data-i]', kap);
      if (!n) return;
      const i = Number(n.getAttribute('data-i'));
      this.setIndex(i);
      this.setActive(true);
      if (this.o.onActivate) this.o.onActivate(this.items[i], i);
    });
    kap.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.move(e.deltaY > 0 ? this.o.cols : -this.o.cols);
    });
  }

  get cellW() {
    return this.o.cellW || Math.floor(this.kap.clientWidth / this.o.cols);
  }
  get rows() {
    return Math.ceil(this.items.length / this.o.cols);
  }
  get visRows() {
    return Math.max(1, Math.floor(this.kap.clientHeight / this.o.rowH));
  }
  get cur() {
    return this.items[this.index];
  }

  setItems(items, keepIndex) {
    this.items = items || [];
    this.index = keepIndex ? Math.min(this.index, Math.max(0, this.items.length - 1)) : 0;
    if (!keepIndex) this.top = 0;
    this.msg.textContent = this.items.length ? '' : this.o.empty;
    this.msg.style.display = this.items.length ? 'none' : 'block';
    this.clear();
    this.fit();
    this.draw();
    this.fire();
  }

  clear() {
    this.in.innerHTML = '';
    this.nodes = {};
  }

  setMessage(t) {
    this.items = [];
    this.clear();
    this.msg.textContent = t;
    this.msg.style.display = 'block';
  }

  setActive(on) {
    this.active = on;
    const n = this.nodes[this.index];
    if (n) n.className = this.cls(this.index);
  }

  cls(i) {
    return 'vl-it' + (i === this.index ? (this.active ? ' on' : ' cur') : '');
  }

  // Odaklı satır görünür kalsın
  fit() {
    const r = Math.floor(this.index / this.o.cols);
    const v = this.visRows;
    if (r < this.top) this.top = r;
    else if (r >= this.top + v) this.top = r - v + 1;
    const maxTop = Math.max(0, this.rows - v);
    if (this.top > maxTop) this.top = maxTop;
    this.in.style.webkitTransform = this.in.style.transform = 'translateY(' + -this.top * this.o.rowH + 'px)';
  }

  draw() {
    const c = this.o.cols;
    const v = this.visRows;
    const b = this.o.buffer;
    const r0 = Math.max(0, this.top - b);
    const r1 = Math.min(this.rows - 1, this.top + v + b);
    const ilk = r0 * c;
    const son = Math.min(this.items.length - 1, (r1 + 1) * c - 1);
    for (const k in this.nodes) {
      const i = Number(k);
      if (i < ilk || i > son) {
        this.in.removeChild(this.nodes[k]);
        delete this.nodes[k];
      }
    }
    const w = this.cellW;
    for (let i = ilk; i <= son; i++) {
      if (this.nodes[i]) continue;
      const n = el('div', this.cls(i), this.o.render(this.items[i], i));
      n.setAttribute('data-i', i);
      const row = Math.floor(i / c);
      const col = i % c;
      n.style.top = row * this.o.rowH + 'px';
      n.style.left = col * w + 'px';
      n.style.width = w + 'px';
      n.style.height = this.o.rowH + 'px';
      this.in.appendChild(n);
      this.nodes[i] = n;
    }
  }

  // Aynı öğeyi yeniden çiz (örn. favori yıldızı değişti)
  redraw(i) {
    const n = this.nodes[i];
    if (n) n.innerHTML = this.o.render(this.items[i], i);
  }

  setIndex(i) {
    if (!this.items.length) return;
    i = Math.max(0, Math.min(this.items.length - 1, i));
    this.index = i;
    this.fit();
    this.draw();
    for (const k in this.nodes) this.nodes[k].className = this.cls(Number(k));
    this.fire();
  }

  fire() {
    if (this.o.onFocus && this.items.length) this.o.onFocus(this.items[this.index], this.index);
  }

  move(d) {
    const i = this.index + d;
    if (i < 0 || i >= this.items.length) return false;
    this.setIndex(i);
    return true;
  }

  // Eylem tüketildiyse true. Kenarlarda false döner: üst katman başka alana geçebilir.
  key(a) {
    const c = this.o.cols;
    const n = this.items.length;
    if (a === 'down') {
      if (this.index + c < n) return this.move(c);
      // Son satırda değilsek (eksik son satır) sonuncuya git
      if (Math.floor(this.index / c) < this.rows - 1) {
        this.setIndex(n - 1);
        return true;
      }
      return false;
    }
    if (a === 'up') return this.move(-c);
    if (a === 'right') return c > 1 && this.index % c < c - 1 && this.move(1);
    if (a === 'left') return c > 1 && this.index % c > 0 && this.move(-1);
    if (a === 'chdown' || a === 'chup') {
      if (!n) return true;
      const d = (a === 'chdown' ? 1 : -1) * this.visRows * c;
      this.setIndex(this.index + d);
      return true;
    }
    if (a === 'ok') {
      if (this.items.length && this.o.onActivate) this.o.onActivate(this.cur, this.index);
      return true;
    }
    return false;
  }
}
