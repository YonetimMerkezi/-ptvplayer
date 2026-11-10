// TV kumandası / klavye ile gezinme: yön tuşları odağı en yakın öğeye taşır, Tamam öğeye dokunur.
// Saf hesap (pickNext) ayrı tutulur ve sahte dikdörtgenlerle test edilir; DOM yapıştırıcısı initDpad'dadır.

export const FOCUSABLE = 'button, [role="button"], [role="radio"], [tabindex], input, select, textarea, a[href]';
const DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

// cur ve rects: { l, t, r, b } (piksel). Yönde en uygun adayın indeksini verir; yoksa -1.
// Kurallar (Android'in odak bulucusuna benzer):
//  - Aday yön doğrultusunda olmalı; kapsayıcının içindeki aday, kapsayıcıdan yalnız merkez karşılaştırmasıyla seçilir
//    (içinde düğmeleri olan kutu/kart/hücreden o düğmelere geçilebilsin).
//  - Sağ/sol: aynı satırdaki (dikeyde örtüşen) aday, daha yakın ama satır dışındaki adaya her zaman tercih edilir.
//  - Yukarı/aşağı: Android'in odak bulucusu gibi. Kaynakla yatayda örtüşen ("ışındaki") aday, ışın dışındakine ancak kendi yakın kenarı
//    ötekinin uzak kenarından yakınsa üstün gelir; aksi halde 13·(yön mesafesi)² + (merkez kayması)² küçük olan seçilir.
//    Böylece sağa yaslı seçici/düğme satırları, uzaktaki tam genişlik düğmenin gölgesinde kalıp atlanmaz.
//  - Satır dışı yatay adaylar: yön eksenindeki boşluk + dik eksendeki boşluk (ağırlıklı) + merkez kayması.
// Hedef, kaynağın dikey olarak tamamen ötesinde mi (aynı satırdaki komşu değil)?
export function beyond(r, cur, dir) {
  return dir === 'down' ? r.t >= cur.b - 2 : r.b <= cur.t + 2;
}

// Kaydırma alanını dir yönünde bir adım kaydırır (en çok yarım ekran); kaydıracak yer yoksa false.
export function scrollStep(sc, dir) {
  const room = dir === 'down' ? sc.scrollHeight - sc.clientHeight - sc.scrollTop : sc.scrollTop;
  if (room <= 1) return false;
  const step = Math.min(room, Math.max(60, Math.round(sc.clientHeight * 0.5)));
  sc.scrollTop += dir === 'down' ? step : -step;
  return true;
}

export function pickNext(cur, rects, dir) {
  const cx = (cur.l + cur.r) / 2;
  const cy = (cur.t + cur.b) / 2;
  const vertical = dir === 'up' || dir === 'down';
  let best = -1;
  let bestScore = Infinity;
  let bestC = null; // yalnız dikey hareket: en iyi adayın ölçüleri
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r === cur) continue;
    const rx = (r.l + r.r) / 2;
    const ry = (r.t + r.b) / 2;
    const inside = r.l >= cur.l && r.r <= cur.r && r.t >= cur.t && r.b <= cur.b;
    let prim;
    let gap;
    let off;
    let far = 0; // yön eksenindeki uzak kenara uzaklık (dikey hareketin ışın karşılaştırması için)
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
      far = Math.max(0, r.b - cur.b);
      gap = Math.max(0, Math.max(cur.l, r.l) - Math.min(cur.r, r.r));
      off = Math.abs(rx - cx);
    } else {
      if (!(ry < cy && (inside || r.t < cur.t))) continue;
      prim = Math.max(0, cur.t - r.b);
      far = Math.max(0, cur.t - r.t);
      gap = Math.max(0, Math.max(cur.l, r.l) - Math.min(cur.r, r.r));
      off = Math.abs(rx - cx);
    }
    if (vertical) {
      // Android'in odak bulucusu gibi: kaynağın altındaki/üstündeki "ışında" (yatayda örtüşen) aday, ışın dışındakine ancak ondan belirgin
      // yakınsa üstün gelir; ışın dışı aday daha yakınsa (ör. sağa yaslı seçici satırı, uzaktaki tam genişlik düğme yerine) o seçilir.
      const c = { beam: gap === 0, prim, far, w: 13 * prim * prim + off * off };
      const beats = (a, b) => a.beam && !b.beam && a.prim < b.far;
      if (!bestC || beats(c, bestC) || (!beats(bestC, c) && c.w < bestC.w)) {
        best = i;
        bestC = c;
      }
      continue;
    }
    const score = (gap > 0 ? 1e6 : 0) + prim + gap * 3 + off * 0.35;
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
  const isTextInput = (el) => !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|email|tel|password|number)$/.test(el.type)));

  // TV'de kumandayla gezerken metin alanından geçmek ekran klavyesini açmasın: alan salt okunur kalır, Tamam'a (Enter) ya da dokunmaya basılınca
  // düzenlenir ve klavye açılır; odak alandan çıkınca yeniden salt okunur olur.
  const guardInput = (el) => {
    if (isTv && isTextInput(el) && !el.dataset.editing && !el.readOnly) {
      el.readOnly = true;
      el.dataset.tvRo = '1'; // salt okunurluğu bizim koyduğumuzu ayırt eder
    }
  };
  const ownRo = (el) => isTextInput(el) && !!el.dataset.tvRo && el.readOnly && !el.dataset.editing;
  const guardAll = () => {
    if (isTv) doc.querySelectorAll('input, textarea').forEach(guardInput);
  };
  let restarting = false;
  function beginEdit(el) {
    el.dataset.editing = '1';
    delete el.dataset.tvRo;
    el.readOnly = false;
    restarting = true;
    el.blur();
    el.focus(); // klavyeyi açar
    restarting = false;
    try {
      el.setSelectionRange(el.value.length, el.value.length);
    } catch {
      /* bazı alan türlerinde imleç ayarlanamaz */
    }
  }
  // TV kipi: odak halkası her zaman görünür, kenar boşlukları genişler (CSS html.tv)
  const setTv = (on) => {
    isTv = !!on;
    root.classList.toggle('tv', isTv);
    if (isTv) {
      setKbd(true);
      guardAll();
    } else {
      doc.querySelectorAll('[data-tv-ro]').forEach((el) => {
        el.readOnly = false;
        delete el.dataset.tvRo;
      });
    }
  };
  setTv(tv);

  // Şu an etkin kapsam: en üstteki alt sayfa/sayfa, tam ekran oynatıcının açık denetimleri ya da uygulama kabuğu.
  function scopeEl() {
    const lock = doc.getElementById('lock'); // şifre ekranı her şeyin üstünde: odak yalnız onun içinde gezer
    if (lock) return lock;
    const layers = doc.querySelectorAll('#sheets > .sheet-back, #sheets > .pg');
    const playing = doc.body.classList.contains('player-open');
    if (layers.length) {
      const top = layers[layers.length - 1];
      // Tam ekran oynatıcı açıkken altında kalan sayfa (ör. film ayrıntısı) kumandanın değildir: yalnız oynatıcının üstüne açılan katmanlar kapsam olur.
      if (!playing || top.classList.contains('over-player')) return top.classList.contains('sheet-back') ? top.querySelector('.sheet') || top : top;
    }
    if (playing) return doc.querySelector('#pl-ui.show');
    return doc.getElementById('app');
  }

  const visible = (el) => {
    if (el.disabled || el.hidden || el.closest('[hidden], [inert]')) return false;
    if (el.tagName === 'INPUT' && el.type === 'hidden') return false;
    const b = el.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) return false;
    return win.getComputedStyle(el).visibility !== 'hidden';
  };

  // Öğe şu an görünmese bile bir kaydırma alanını (ya da sayfayı) kaydırarak görünür kılınabiliyorsa ulaşılabilirdir: kumanda ona gidince alan kayar.
  // Kaydırılamayan bir kutu tarafından kırpılan (gizli) öğeler ulaşılamaz sayılır; yalnız başka aday kalmazsa son çare olarak denenirler.
  function reachable(el, scope) {
    const b = el.getBoundingClientRect();
    const x = (b.left + b.right) / 2;
    const y = (b.top + b.bottom) / 2;
    const need = { x: x < 0 || x > win.innerWidth, y: y < 0 || y > win.innerHeight };
    const can = { x: false, y: false };
    for (let p = el.parentElement; p && p !== scope.parentElement; p = p.parentElement) {
      const o = win.getComputedStyle(p);
      const cx = o.overflowX !== 'visible';
      const cy = o.overflowY !== 'visible';
      if (!cx && !cy) continue;
      const c = p.getBoundingClientRect();
      const sx = cx && /auto|scroll/.test(o.overflowX) && p.scrollWidth > p.clientWidth + 1;
      const sy = cy && /auto|scroll/.test(o.overflowY) && p.scrollHeight > p.clientHeight + 1;
      const outX = cx && (x < c.left - 1 || x > c.right + 1);
      const outY = cy && (y < c.top - 1 || y > c.bottom + 1);
      if ((outX && !sx) || (outY && !sy)) return false;
      if (outX) need.x = true;
      if (outY) need.y = true;
      if (sx) can.x = true;
      if (sy) can.y = true;
    }
    const se = doc.scrollingElement || root;
    return (!need.x || can.x || se.scrollWidth > win.innerWidth + 1) && (!need.y || can.y || se.scrollHeight > win.innerHeight + 1);
  }

  // Öğenin en yakın dikey kaydırma alanı (kapsam içinde), yoksa null
  function scrollerOf(el, scope) {
    for (let p = el.parentElement; p && p !== scope.parentElement; p = p.parentElement) {
      if (/auto|scroll/.test(win.getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return null;
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
    let target = null;
    if (dir === 'up' || dir === 'down') {
      // Odak bir kaydırma alanının içindeyse ve alan o yöne hâlâ kayabiliyorsa, alanın kendi (şimdilik görünmeyen) öğeleri alan dışındaki
      // uzak ama görünür düğmelere (başlıktaki kapat tuşu gibi) tercih edilir; yoksa kumanda içeriği atlayıp başlığa sıçrardı.
      const sc = scrollerOf(cur, scope);
      if (sc && (dir === 'down' ? sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1 : sc.scrollTop > 1)) {
        target = pass(list.filter((e) => e !== cur && sc.contains(e) && reachable(e, scope)));
      }
    }
    // Yaklaşım dışlamaları: odaktaki öğeyi içeren kapsayıcı (ör. içinde düğmeler olan satır) komşu düğmeye gitmeden önce seçilmez;
    // yoksa satırdaki göster/gizle düğmesinden sağa basınca kilit düğmesi atlanıp satırın kendisine dönülürdü.
    const notAncestor = (e) => e !== cur && !e.contains(cur);
    target = target || pass(list.filter((e) => notAncestor(e) && reachable(e, scope))) || pass(list.filter(notAncestor)) || pass(list.filter((e) => e !== cur && reachable(e, scope))) || pass(list.filter((e) => e !== cur));
    // Dikey harekette odağı taşıyacak yer yoksa (içerik uzun bir yazı ise) ya da hedef kaydırma alanının dışındaysa, alan hâlâ o yöne kayabiliyorsa alan kaydırılır;
    // odak aynı kalır. Böylece film konusu gibi uzun metin kumandayla aşağı okunabilir ve yukarı basınca en üste dönülür.
    if (dir === 'up' || dir === 'down') {
      const sc = scrollerOf(cur, scope);
      if (sc && (!target || !sc.contains(target) || !beyond(rectOf(target), curRect, dir)) && scrollStep(sc, dir)) return true;
    }
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
      const isRange = !!el && el.tagName === 'INPUT' && el.type === 'range';
      if (isRange && (dir === 'left' || dir === 'right')) return;
      // ↑↓ kaydırıcının değerini oynatmasın (ilerleme çubuğunda film ileri-geri giderdi): odak komşu öğeye geçer, geçecek yer yoksa tuş yutulur
      if (move(dir, el) || isRange) e.preventDefault();
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
    guardInput(e.target); // kod odak verdiyse (ör. arama açılınca) de klavye kendiliğinden açılmasın
    const scope = scopeEl();
    if (scope && scope.contains(e.target)) memory.set(scope, e.target);
  }, true);
  doc.addEventListener('focusout', (e) => {
    const el = e.target;
    if (!restarting && isTv && isTextInput(el) && el.dataset.editing) {
      delete el.dataset.editing;
      guardInput(el);
    }
  });
  // Tamam (Enter): salt okunur metin alanında düzenlemeyi başlatır. Yakalama aşamasında çalışır ki alanın kendi Enter işleyicisi (ör. "ekle") boş alanla tetiklenmesin.
  doc.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Enter' || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = doc.activeElement;
      if (isTv && el && ownRo(el)) {
        e.preventDefault();
        e.stopPropagation();
        beginEdit(el);
      }
    },
    true,
  );
  // dokunma/tıklama alanı açıkça seçmektir: düzenleme başlar
  doc.addEventListener('click', (e) => {
    const el = e.target;
    if (e.isTrusted && isTv && el && ownRo(el)) beginEdit(el);
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
  const mo = new win.MutationObserver(() => {
    guardAll();
    schedule();
  });
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
