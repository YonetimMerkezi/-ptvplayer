// Tema merkezi: renk paletleri. Chromium 38'de CSS değişkeni olmadığından tv.css'teki varsayılan renkler,
// seçilen paletin renkleriyle değiştirilerek çalışma anında bir <style> olarak uygulanır (varsayılan temada tv.css olduğu gibi kullanılır).
// Paletler Android uygulamasının tema renkleriyle aynıdır (www/css/app.css).

// Paletin rolleri: bg zemin, surface kutu, raised vurgulu kutu, line çizgi, accent vurgu, ink vurgu üzerindeki yazı
export const VARSAYILAN_TEMA = 'varsayilan';

const T = (id, ad, bg, surface, raised, line, accent, ink, ek) => Object.assign({ id, ad, bg, surface, raised, line, accent, ink }, ek || {});
const PAL = ['#a3b3cc', '#4ade80', '#fb923c', '#a78bfa', '#38bdf8', '#22d3ee', '#f472b6', '#fbbf24', '#fb7185'];

export const TEMALAR = [
  T(VARSAYILAN_TEMA, 'Turkuaz (varsayılan)', '#0a0e17', '#151b2b', '#1b2437', '#26324b', '#2dd4bf', '#04141a'),
  T('green', 'Yeşil', '#050f10', '#0b1f1c', '#12302a', '#1d4a3e', '#4ade80', '#032312'),
  T('blue', 'Mavi', '#080d1f', '#111a33', '#1b2546', '#26315a', '#38bdf8', '#04202c'),
  T('cyan', 'Açık turkuaz', '#04141a', '#0a222b', '#103340', '#17505f', '#22d3ee', '#02222a'),
  T('purple', 'Mor', '#0b0818', '#181233', '#251c4d', '#382a73', '#a78bfa', '#170a3a'),
  T('orange', 'Turuncu', '#120a04', '#231508', '#35200d', '#5a3512', '#fb923c', '#2b1203'),
  T('red', 'Kırmızı', '#12060a', '#251016', '#3a1722', '#5c2434', '#fb7185', '#2d0610'),
  T('midnight', 'Gece yarısı', '#070b16', '#111827', '#1e293b', '#334155', '#a5b4fc', '#111337'),
  T('ocean', 'Okyanus', '#03131b', '#08232d', '#103846', '#155568', '#2dd4bf', '#032a2a'),
  T('graphite', 'Grafit', '#101216', '#1b1f25', '#292f38', '#414955', '#cbd5e1', '#18202a'),
  T('rose', 'Gül kurusu', '#160811', '#29101d', '#3b192a', '#633047', '#fb8cae', '#390b20'),
  // Çok renkli temalar: ana sayfadaki her karo kendi renginde
  T('cards', 'Renkli kartlar', '#090c14', '#111623', '#1a2133', '#2a3350', '#a78bfa', '#170a3a', { multi: true, p: PAL }),
  T('solid', 'Dolu renk', '#080b12', '#101521', '#19202f', '#283148', '#a78bfa', '#170a3a', { multi: true, dolu: true, p: PAL }),
  T('neon', 'Neon cam', '#070816', '#0e1124', '#151a36', '#2a3057', '#c4b5fd', '#170a3a', {
    multi: true,
    p: ['#b6c2dd', '#5eead4', '#fdba74', '#d8b4fe', '#7dd3fc', '#67e8f9', '#f9a8d4', '#fde047', '#fda4af'],
    zemin: 'linear-gradient(135deg, #2b0f4d 0%, #0b1840 52%, #3d0f3a 100%)',
  }),
  T('sunset', 'Gün batımı', '#140a14', '#241226', '#341a36', '#5a2c52', '#fda4af', '#2d0610', {
    multi: true,
    dolu: true,
    p: ['#e2d4ec', '#fdba74', '#fde68a', '#d8b4fe', '#c4b5fd', '#f0abfc', '#f9a8d4', '#fcd34d', '#fda4af'],
    zemin: 'linear-gradient(165deg, #3a0f4a 0%, #7a1d4e 42%, #9a3412 100%)',
  }),
];

export const temaBul = (id) => TEMALAR.filter((t) => t.id === id)[0] || TEMALAR[0];

// --- renk yardımcıları
const rgb = (h) => {
  h = String(h).replace('#', '');
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
};
const hex2 = (n) => (n < 16 ? '0' : '') + Math.round(n).toString(16);
// a ile b arasında karışım (t: b'nin payı, 0–1)
export const karistir = (a, b, t) => {
  const x = rgb(a);
  const y = rgb(b);
  return '#' + hex2(x[0] + (y[0] - x[0]) * t) + hex2(x[1] + (y[1] - x[1]) * t) + hex2(x[2] + (y[2] - x[2]) * t);
};

const rgbMetni = (h) => rgb(h).join(', ');
const rgba = (h, a) => 'rgba(' + rgbMetni(h) + ', ' + a + ')';
// Odaklanan kartın gölgesi: altta koyu gölge (yükselme) + kendi renginde parıltı. Çerçeve çizilmez (outline Chromium 38'de köşeleri izlemez).
const PARILTI = (h) => 'box-shadow: 0 1.2rem 2.8rem rgba(0, 0, 0, .55), 0 0 2.8rem ' + rgba(h, 0.6) + ';';

// tv.css'teki varsayılan renk → palet rolü
const ESLEME = [
  ['#0a0e17', (t) => t.bg],
  ['#151b2b', (t) => t.surface],
  ['#111827', (t) => t.surface],
  ['#0f1a2a', (t) => karistir(t.surface, t.bg, 0.5)],
  ['#1b2437', (t) => t.raised],
  ['#1f2a40', (t) => t.raised],
  ['#26324b', (t) => t.line],
  ['#364464', (t) => t.line],
  ['#3a4660', (t) => t.line],
  ['#2dd4bf', (t) => t.accent],
  ['#04141a', (t) => t.ink],
  ['#0b3a40', (t) => karistir(t.ink, t.accent, 0.12)],
];

// tv.css metnini palete göre yeniden boyar; çok renkli temalarda karo kuralları ve (varsa) gradyan zemin eklenir.
export function cssUret(css, t) {
  let c = String(css);
  if (t.id !== VARSAYILAN_TEMA) {
    // Tek geçişte değiştir: bir rolün yeni rengi başka bir varsayılan renkle çakışsa bile ikinci kez değişmesin
    const harita = {};
    for (let i = 0; i < ESLEME.length; i++) harita[ESLEME[i][0]] = ESLEME[i][1](t);
    c = c.replace(/#[0-9a-fA-F]{6}\b/g, (m) => {
      const k = m.toLowerCase();
      return Object.prototype.hasOwnProperty.call(harita, k) ? harita[k] : m;
    });
    // Parıltılardaki şeffaf vurgu rengi de paletin vurgusuna döner
    c = c.replace(/rgba\(45, ?212, ?191,/g, 'rgba(' + rgbMetni(t.accent) + ',');
  }
  if (t.zemin) c += '\nhtml, body { background: ' + t.zemin + '; }\n.screen { background: transparent; }\n.player { background: #000; }';
  if (t.multi && t.p) {
    for (let i = 1; i <= 8; i++) {
      const p = t.p[i];
      if (t.dolu) c += '\n.tile.c' + i + ' { background: ' + p + '; color: ' + t.ink + '; }\n.tile.c' + i + '.on { background: ' + p + '; color: ' + t.ink + '; ' + PARILTI(p) + ' }';
      else c += '\n.tile.c' + i + ' { background: ' + karistir(t.surface, p, 0.22) + '; color: ' + p + '; }\n.tile.c' + i + '.on { background: ' + p + '; color: ' + t.ink + '; ' + PARILTI(p) + ' }';
    }
  }
  return c;
}

// --- DOM: stil dosyasını bir kez okur, temayı uygular
let kaynakCss = null;
function cssYukle() {
  if (kaynakCss) return Promise.resolve(kaynakCss);
  return new Promise((coz, red) => {
    const x = new XMLHttpRequest();
    x.open('GET', 'css/tv.css', true);
    x.onload = () => {
      // Uygulama dosyalarında (file://) başarılı yanıtın durumu 0 olabilir
      if ((x.status === 200 || x.status === 0) && x.responseText) {
        kaynakCss = x.responseText;
        coz(kaynakCss);
      } else red(new Error('Stil dosyası okunamadı (' + x.status + ')'));
    };
    x.onerror = () => red(new Error('Stil dosyası okunamadı'));
    x.send();
  });
}

export async function temaUygula(id, doc) {
  doc = doc || document;
  const t = temaBul(id);
  const link = doc.querySelector('link[rel="stylesheet"]');
  let st = doc.getElementById('tema-css');
  if (t.id === VARSAYILAN_TEMA) {
    if (st && st.parentNode) st.parentNode.removeChild(st);
    if (link) link.disabled = false;
    doc.documentElement.className = '';
    return t;
  }
  const css = await cssYukle();
  if (!st) {
    st = doc.createElement('style');
    st.id = 'tema-css';
    doc.head.appendChild(st);
  }
  st.textContent = cssUret(css, t);
  if (link) link.disabled = true;
  doc.documentElement.className = t.multi ? 'multi' : '';
  return t;
}
