// TV'de sanal imleç: telefondaki fare alanı imleci gezdirir, dokunma altındaki öğeye tıklar, iki parmakla kaydırma
// imlecin altındaki listeyi kaydırır. Kumandası olmayan/uzakta duran TV'de ekranın her yerine ◀▶▲▼ ile adım adım gitmeden ulaşılsın diye.
// İmleç kullanılmayınca kendiliğinden gizlenir; tıklamayı yakalamaz (altındaki öğe hedef olur).
export const HIDE_MS = 5000;
const TEXT_FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]), textarea';
const SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2l17 9-7.5 1.8L9 20z" fill="#fff" stroke="#04141a" stroke-width="1.6" stroke-linejoin="round"/></svg>';

// Elemandan yukarı doğru dikey kaydırılabilen ilk kapsayıcı (yoksa null)
export function scrollParent(el, win = window) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const st = win.getComputedStyle(n);
    if (/(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return null;
}

export function createPointer({ doc = document, win = window, setT = setTimeout, clearT = clearTimeout } = {}) {
  let node = null;
  let x = 0;
  let y = 0;
  let timer = 0;
  const place = () => {
    node.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  };
  const hide = () => {
    if (node) node.style.display = 'none';
  };
  const show = () => {
    if (!node) {
      node = doc.createElement('div');
      node.className = 'vptr';
      node.innerHTML = SVG;
      doc.body.appendChild(node);
      x = (win.innerWidth || 1920) / 2;
      y = (win.innerHeight || 1080) / 2;
    }
    node.style.display = 'block';
    place();
    clearT(timer);
    timer = setT(hide, HIDE_MS);
  };
  const fire = (type, target) => target.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true, view: win, clientX: x, clientY: y }));
  const under = () => doc.elementFromPoint(Math.round(x), Math.round(y));

  return {
    // dx, dy: ekran pikseli. Dönen: imleç konumu
    move(dx, dy) {
      show();
      x = Math.max(0, Math.min((win.innerWidth || 1920) - 1, x + (Number(dx) || 0)));
      y = Math.max(0, Math.min((win.innerHeight || 1080) - 1, y + (Number(dy) || 0)));
      place();
      const h = under();
      if (h) fire('mousemove', h); // fareyle açılan çubuklar için
      return { x, y };
    },
    // Altındaki öğeye tıklar; yazı alanına tıklanırsa odak verilir. Dönen: hedef bulundu mu
    click() {
      show();
      const h = under();
      if (!h) return false;
      fire('mousedown', h);
      fire('mouseup', h);
      if (typeof h.click === 'function') h.click();
      else fire('click', h);
      if (h.matches && h.matches(TEXT_FIELD) && h.focus) h.focus();
      return true;
    },
    // n > 0: parmak aşağı kaydı → liste yukarı gider (telefondaki doğal kaydırma). Dönen: kaydırıldı mı
    scroll(n) {
      show();
      const h = under();
      const sc = (h && scrollParent(h, win)) || doc.scrollingElement;
      if (!sc) return false;
      const once = sc.scrollTop;
      sc.scrollTop = once - (Number(n) || 0);
      return sc.scrollTop !== once;
    },
    hide,
    pos: () => ({ x, y }),
  };
}

// "Yaz" komutu: odaktaki ya da açık arama kutusuna yazar; yoksa üstteki Ara açılır. open: aramayı açan işlev. Dönen: yazıldı mı
export function typeInto(text, { enter = false, doc = document, win = window, open = () => {}, setT = setTimeout } = {}) {
  const visible = (e) => !!e && (e.offsetParent !== null || e === doc.activeElement);
  const field = () => {
    const a = doc.activeElement;
    if (a && a.matches && a.matches(TEXT_FIELD)) return a;
    for (const id of ['gs-q', 'sp-q', 'q']) {
      const e = doc.getElementById(id);
      if (visible(e)) return e;
    }
    return null;
  };
  const fill = (f) => {
    f.value = text;
    f.dispatchEvent(new win.Event('input', { bubbles: true }));
    if (enter) f.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return true;
  };
  const f = field();
  if (f) return fill(f);
  open();
  setT(() => {
    const g = field();
    if (g) fill(g);
  }, 250);
  return false;
}
