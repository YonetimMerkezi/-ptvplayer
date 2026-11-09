// TV kumandası / klavye ile gezinme: yön tuşları odağı en yakın öğeye taşır, Tamam öğeye dokunur.
// Saf hesap (pickNext) ayrı tutulur ve sahte dikdörtgenlerle test edilir; DOM yapıştırıcısı initDpad'dadır.

export const FOCUSABLE = 'button, [role="button"], [role="radio"], [tabindex], input, select, textarea, a[href]';
const DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

// cur ve rects: { l, t, r, b } (piksel). Yönde en uygun adayın indeksini verir; yoksa -1.
// Kurallar (Android'in odak bulucusuna benzer):
//  - Aday yön doğrultusunda olmalı; kapsayıcının içindeki aday, kapsayıcıdan yalnız merkez karşılaştırmasıyla seçilir
//    (içinde düğmeleri olan kutu/kart/hücreden o düğmelere geçilebilsin).
//  - Sağ/sol: aynı satırdaki (dikeyde örtüşen) aday, daha yakın ama satır dışındaki adaya her zaman tercih edilir.
//  - Yukarı/aşağı ve satır dışı adaylar: yön eksenindeki boşluk + dik eksendeki boşluk (ağırlıklı) + merkez kayması.
export function pickNext(cur, rects, dir) {
  const cx = (cur.l + cur.r) / 2;
  const cy = (cur.t + cur.b) / 2;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r === cur) continue;
    const rx = (r.l + r.r) / 2;
    const ry = (r.t + r.b) / 2;
    const inside = r.l >= cur.l && r.r <= cur.r && r.t >= cur.t && r.b <= cur.b;
    let prim;
    let gap;
    let off;
    if (dir === 'right') {
      if (!(rx > cx && (inside || r.r > cur.r))) continue;
      prim = Math.max(0, r.l - cur.r);
      gap = Math.max(0, Math.max(cur.t, r.t) - Math.min(cur.b, r.b));
      off = Math.abs(ry - cy);
    } else if (dir === 'left') {
      if (!(rx < cx && (inside || r.l < cur.l))) continue;
      prim = Math.max(0, cur.l - r.r);
      gap = Math.max(0, Math.max(cur.t, r.t) - Math.min(cur.b, r.b));
      off = Math.abs(ry - cy);
    } else if (dir === 'down') {
      if (!(ry > cy && (inside || r.b > cur.b))) continue;
      prim = Math.max(0, r.t - cur.b);
      gap = Math.max(0, Math.max(cur.l, r.l) - Math.min(cur.r, r.r));
      off = Math.abs(rx - cx);
    } else {
      if (!(ry < cy && (inside || r.t < cur.t))) continue;
      prim = Math.max(0, cur.t - r.b);
      gap = Math.max(0, Math.max(cur.l, r.l) - Math.min(cur.r, r.r));
      off = Math.abs(rx - cx);
    }
    const horizontal = dir === 'left' || dir === 'right';
    const score = (horizontal && gap > 0 ? 1e6 : 0) + prim + gap * 3 + off * 0.35;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

const rectOf = (el) => {
  const b = el.getBoundingClientRect();
  return { l: b.left, t: b.top, r: b.right, b: b.bottom, el };
};

export function initDpad({ doc = document, win = window, topLayer = () => null, tv = false } = {}) {
  const root = doc.documentElement;
  const memory = new WeakMap(); // kapsam -> son odaklanan öğe (katman kapanınca oraya dönülür)
  let kbd = false;

  const setKbd = (on) => {
    if (kbd === on) return;
    kbd = on;
    root.classList.toggle('kbd', on);
  };
  let isTv = false;
  // TV kipi: odak halkası her zaman görünür, kenar boşlukları genişler (CSS html.tv)
  const setTv = (on) => {
    isTv = !!on;
    root.classList.toggle('tv', isTv);
    if (isTv) setKbd(true);
  };
  setTv(tv);

  // Şu an etkin kapsam: en üstteki alt sayfa/sayfa, tam ekran oynatıcının açık denetimleri ya da uygulama kabuğu.
  function scopeEl() {
    const lock = doc.getElementById('lock'); // şifre ekranı her şeyin üstünde: odak yalnız onun içinde gezer
    if (lock) return lock;
    const layers = doc.querySelectorAll('#sheets > .sheet-back, #sheets > .pg');
    if (layers.length) {
      const top = layers[layers.length - 1];
      return top.classList.contains('sheet-back') ? top.querySelector('.sheet') || top : top;
    }
    if (doc.body.classList.contains('player-open')) return doc.querySelector('#pl-ui.show');
    return doc.getElementById('app');
  }

  const visible = (el) => {
    if (el.disabled || el.hidden || el.closest('[hidden], [inert]')) return false;
    if (el.tagName === 'INPUT' && el.type === 'hidden') return false;
    const b = el.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) return false;
    return win.getComputedStyle(el).visibility !== 'hidden';
  };

  // Öğenin merkezi, kaydırılabilir üst kutularının görünen alanında mı? (görünmeyen satırlara atlamayı önler)
  function inClip(el, scope) {
    const b = el.getBoundingClientRect();
    const x = (b.left + b.right) / 2;
    const y = (b.top + b.bottom) / 2;
    if (x < 0 || y < 0 || x > win.innerWidth || y > win.innerHeight) return false;
    for (let p = el.parentElement; p && p !== scope.parentElement; p = p.parentElement) {
      const o = win.getComputedStyle(p);
      if (o.overflowX === 'visible' && o.overflowY === 'visible') continue;
      const c = p.getBoundingClientRect();
      if (x < c.left - 1 || x > c.right + 1 || y < c.top - 1 || y > c.bottom + 1) return false;
    }
    return true;
  }

  const candidates = (scope) => [...scope.querySelectorAll(FOCUSABLE)].filter((el) => !el.matches('[tabindex="-1"]') && visible(el));

  function focusEl(el, scope) {
    el.focus({ preventScroll: true });
    try {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch {
      /* eski WebView */
    }
    if (scope) memory.set(scope, el);
  }

  function initialIn(scope) {
    const list = candidates(scope);
    const pref = list.find((e) => e.matches('[data-autofocus]'));
    if (pref) return pref;
    const content = list.filter((e) => !e.closest('[data-close], .pg-bar, .sheet-h, #bar, #tabs, #searchbar') && e.tagName !== 'INPUT' && e.tagName !== 'SELECT');
    return content[0] || list[0] || null;
  }

  function move(dir, from) {
    const scope = scopeEl();
    if (!scope) return false;
    const cur = from && scope.contains(from) ? from : null;
    const list = candidates(scope);
    if (!list.length) return false;
    if (!cur) {
      const t = memory.get(scope);
      const first = t && t.isConnected && visible(t) ? t : initialIn(scope);
      if (!first) return false;
      focusEl(first, scope);
      return true;
    }
    const curRect = rectOf(cur);
    const pass = (arr) => {
      const rects = arr.map(rectOf);
      const i = pickNext(curRect, rects, dir);
      return i < 0 ? null : arr[i];
    };
    const target = pass(list.filter((e) => e !== cur && inClip(e, scope))) || pass(list.filter((e) => e !== cur));
    if (!target) return false;
    focusEl(target, scope);
    return true;
  }

  const isText = (el) => el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|email|tel|password|number)$/.test(el.type));

  function onKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const dir = DIRS[e.key];
    if (dir) setKbd(true); // oku başka bileşen (ör. TV rehberi çizelgesi) işlese de kumanda kipi açılır, odak halkası görünür
    if (e.defaultPrevented) return;
    const el = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null;
    if (dir) {
      setKbd(true);
      if (el && isText(el) && (dir === 'left' || dir === 'right')) {
        // metin alanında imleç kenara gelmeden oklar imleci taşır
        const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
        const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
        if (!((dir === 'left' && atStart) || (dir === 'right' && atEnd))) return;
      }
      if (el && el.tagName === 'INPUT' && el.type === 'range' && (dir === 'left' || dir === 'right')) return;
      if (move(dir, el)) e.preventDefault();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && el) {
      setKbd(true);
      // yerel düğme/alan kendi Tamam davranışını bilir; role="button" gibi öğelere biz dokunuruz
      if (!/^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(el.tagName) && el.matches(FOCUSABLE)) {
        e.preventDefault();
        el.click();
      }
      return;
    }
    // Geri: Esc, tarayıcı/TV "geri" tuşu ve metin alanı dışında Backspace bir adım geri gider (Android geri tuşunu MainActivity işler)
    const back = e.key === 'Escape' || e.key === 'BrowserBack' || e.key === 'GoBack' || (e.key === 'Backspace' && !(el && isText(el)));
    if (back && topLayer()) {
      e.preventDefault();
      win.history.back();
    }
  }

  doc.addEventListener('keydown', onKey);
  doc.addEventListener('pointerdown', () => !isTv && setKbd(false), true);
  doc.addEventListener('focusin', (e) => {
    const scope = scopeEl();
    if (scope && scope.contains(e.target)) memory.set(scope, e.target);
  });

  // Ekran/katman değişince odak kaybolursa (öğe silindi) uygun yere taşı; dokunmatikte klavye açılmasın diye yalnız kumanda kipinde.
  let raf = 0;
  const ensure = () => {
    raf = 0;
    if (!kbd) return;
    const scope = scopeEl();
    if (!scope) return;
    const a = doc.activeElement;
    if (a && a !== doc.body && scope.contains(a) && visible(a)) return;
    const t = memory.get(scope);
    const target = t && t.isConnected && visible(t) ? t : initialIn(scope);
    if (target) focusEl(target, scope);
  };
  const schedule = () => {
    if (!raf) raf = win.requestAnimationFrame(ensure);
  };
  const mo = new win.MutationObserver(schedule);
  for (const id of ['app', 'sheets', 'player']) {
    const n = doc.getElementById(id);
    if (n) mo.observe(n, { childList: true, subtree: true });
  }
  doc.addEventListener('keydown', schedule, true);

  return {
    isKbd: () => kbd,
    move,
    ensure,
    setKbd,
    setTv,
    // Yerel kumanda tuşlarını (kanal +/-, medya, menü…) sayfadaki klavye olayına çevirir
    sendKey(key) {
      const target = doc.activeElement || doc;
      target.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    },
  };
}
