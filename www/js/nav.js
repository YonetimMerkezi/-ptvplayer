// Üst üste açılan katmanlar (oynatıcı, alt sayfalar) için geçmiş tabanlı geri tuşu yönetimi.
// Android geri tuşu WebView geçmişinde geri gider; her katman bir geçmiş girdisi ekler.
//
// Programatik kapatma (popLayer) katmanı hemen yığından çıkarıp kapatır, geçmiş girdisini ise history.go ile arkadan geri alır.
// Tarayıcı geri adımının hedefini çağrıldığı andaki girdiye göre hesaplar; o sırada pushState yapılırsa geri adım
// yeni girdinin de altına düşer ve yeni katmanı kapatırdı. Bu yüzden geri adım sürerken açılan katmanın geçmiş girdisi,
// geri adım bitene kadar (popstate) bekletilir.

const stack = []; // { name, onClose, pushed }: pushed → geçmiş girdisi yazıldı
// Sürmekte olan programatik geri adımları (her biri için bir popstate beklenir; değer son geçerlilik zamanı).
let expect = [];
let deferred = []; // geri adım bitince geçmiş girdisi yazılacak katmanlar
let timer = 0;
const EXPECT_MS = 1500;
// Sayfa yeniden yüklenince önceki yüklemeden kalan geçmiş girdileri (state.n) bu yüklemenin yığınıyla karışmasın diye
// her girdiye yüklemeye özgü bir imza yazılır; imzası başka olan girdi "katman yok" sayılır.
const SESSION = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function pending() {
  const now = Date.now();
  expect = expect.filter((t) => t > now);
  return expect.length > 0;
}

function commit(layer) {
  history.pushState({ layer: layer.name, n: stack.indexOf(layer) + 1, s: SESSION }, '');
  layer.pushed = true;
}

// Geri adımlar bitince bekleyen katmanların geçmiş girdilerini yazar.
function settle() {
  if (pending()) return;
  const list = deferred;
  deferred = [];
  for (const l of list) if (stack.includes(l)) commit(l);
}

export function pushLayer(name, onClose) {
  const layer = { name, onClose, pushed: false };
  stack.push(layer);
  if (pending()) deferred.push(layer);
  else commit(layer);
}

function close(layer) {
  try {
    layer.onClose();
  } catch {
    /* kapatma hatası akışı bozmasın */
  }
}

// Programatik kapatma: katman (ve varsa üstündekiler) hemen yığından çıkar ve kapanır; geçmiş girdileri arkadan geri alınır.
export function popLayer(name) {
  if (!stack.length) return;
  const idx = name ? stack.findIndex((l) => l.name === name) : stack.length - 1;
  if (idx < 0) return;
  const closing = stack.splice(idx);
  deferred = deferred.filter((l) => !closing.includes(l));
  const steps = closing.filter((l) => l.pushed).length;
  if (steps) {
    expect.push(Date.now() + EXPECT_MS);
    history.go(-steps);
    clearTimeout(timer);
    timer = setTimeout(settle, EXPECT_MS + 20); // popstate gelmezse bekleyen katmanlar yine de yazılır
  }
  for (let i = closing.length - 1; i >= 0; i--) close(closing[i]); // üstteki önce
}

export function topLayer() {
  return stack.length ? stack[stack.length - 1].name : null;
}

export function initNav() {
  window.addEventListener('popstate', () => {
    if (pending()) {
      expect.shift(); // bizim geri adımımız: yığın zaten güncel
      settle();
      return;
    }
    // geri tuşu / geçmişte geri gidiş: yığındaki fazla katmanları kapat
    const st = history.state;
    const want = st && st.s === SESSION ? st.n || 0 : 0;
    while (stack.length > want) close(stack.pop());
  });
}
