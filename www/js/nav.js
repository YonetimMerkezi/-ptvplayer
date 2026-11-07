// Üst üste açılan katmanlar (oynatıcı, alt sayfalar) için geçmiş tabanlı geri tuşu yönetimi.
// Android geri tuşu WebView geçmişinde geri gider; her katman bir geçmiş girdisi ekler.

const stack = [];
let busy = 0;

export function pushLayer(name, onClose) {
  history.pushState({ layer: name, n: stack.length + 1 }, '');
  stack.push({ name, onClose });
}

// Programatik kapatma: geçmişi geri alır, popstate kapatmayı yürütür.
export function popLayer(name) {
  if (!stack.length) return;
  if (name && stack[stack.length - 1].name !== name) {
    // üstte başka katman var: ona kadar kapat
    const idx = stack.findIndex((l) => l.name === name);
    if (idx < 0) return;
    busy += stack.length - idx;
    history.go(-(stack.length - idx));
    return;
  }
  history.back();
}

export function topLayer() {
  return stack.length ? stack[stack.length - 1].name : null;
}

export function initNav() {
  window.addEventListener('popstate', () => {
    // geçmişte geri gidilince, yığındaki fazla katmanları kapat
    const want = (history.state && history.state.n) || 0;
    while (stack.length > want) {
      const l = stack.pop();
      try {
        l.onClose();
      } catch {
        /* kapatma hatası akışı bozmasın */
      }
    }
    busy = 0;
  });
}
