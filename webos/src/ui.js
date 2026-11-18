// Küçük DOM yardımcıları (Chromium 38: closest/append/NodeList.forEach yok; yalnız eski ve güvenli API'ler).
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

const eslesir = (e, sel) => (e.matches || e.webkitMatchesSelector || e.msMatchesSelector).call(e, sel);

export function enYakin(e, sel, kok) {
  while (e && e !== kok && e.nodeType === 1) {
    if (eslesir(e, sel)) return e;
    e = e.parentNode;
  }
  return null;
}

export const px = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 20; // 1rem kaç piksel

const iki = (n) => (n < 10 ? '0' : '') + n;
export const saat = (ms) => {
  const d = new Date(ms);
  return iki(d.getHours()) + ':' + iki(d.getMinutes());
};
export function sure(ms) {
  if (!(ms >= 0) || ms === Infinity) return '0:00';
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? h + ':' + iki(m) + ':' + iki(s) : m + ':' + iki(s);
}

let toastT = 0;
export function toast(metin, ms) {
  let t = document.getElementById('toast');
  if (!t) {
    t = el('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = metin;
  t.className = 'on';
  clearTimeout(toastT);
  toastT = setTimeout(() => {
    t.className = '';
  }, ms || 2600);
}

export function kuruResim(kok) {
  // Yüklenemeyen resimleri gizle (olay kabarmaz: yakalama aşamasında dinlenir)
  kok.addEventListener(
    'error',
    (e) => {
      if (e.target && e.target.tagName === 'IMG') e.target.style.visibility = 'hidden';
    },
    true,
  );
}

// Her .clock öğesine şimdiki saati yazar (ekran açılınca ve dakikada birkaç kez çağrılır).
export function saatleriYaz() {
  const t = saat(Date.now());
  const l = document.querySelectorAll('.clock');
  for (let i = 0; i < l.length; i++) l[i].textContent = t;
}
