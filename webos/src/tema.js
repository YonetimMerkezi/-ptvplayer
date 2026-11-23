// Tema merkezi: renk paletleri. Chromium 38'de CSS değişkeni olmadığından tv.css'teki varsayılan renkler,
// seçilen paletin renkleriyle değiştirilerek çalışma anında bir <style> olarak uygulanır (varsayılan temada tv.css olduğu gibi kullanılır).
// Paletler Android uygulamasının tema renkleriyle aynıdır (www/css/app.css).

// Paletin rolleri: bg zemin, surface kutu, raised vurgulu kutu, line çizgi, accent vurgu, ink vurgu üzerindeki yazı
export const VARSAYILAN_TEMA = 'canli-renkli';
// tv.css'in özgün (boyanmamış) turkuaz renkleri: artık seçilebilir tema değil; yalnız boyama mantığı bu kimliği "değiştirme" diye tanır.
const ORIJINAL_TEMA = 'varsayilan';

const T = (id, ad, bg, surface, raised, line, accent, ink, ek) => Object.assign({ id, ad, bg, surface, raised, line, accent, ink }, ek || {});

// Hepsi canlı ve çok renkli: gradyan zemin + her karo ayrı parlak renkte dolu. Koyu/tek renkli zemin yok.
// Her temada zemin renkleri beyaz yazıyla ≥ 4,4 karşıtlıkta kalır (test denetler); karo yazısı koyu (vurgu yazı rengi).
const CANLI = { canli: true, multi: true, dolu: true };

export const TEMALAR = [
  // Canlı renkler (varsayılan): orta tonlu doygun mor-pembe zemin, her karo ayrı parlak renkte dolu; yazılar beyaz (canli), vurgu sarı.
  T(VARSAYILAN_TEMA, 'Canlı renkler', '#3a1bb8', '#4a28cc', '#5f36e6', '#b79bff', '#ffd21f', '#1a1400', {
    canli: true,
    multi: true,
    dolu: true,
    p: ['#e4e9ff', '#22d36b', '#ff8a1f', '#b18cff', '#3aa0ff', '#19d3e6', '#ff5ab0', '#ffd21f', '#ff5566'],
    zemin: 'linear-gradient(135deg, #3a1bb8 0%, #7b1fc9 48%, #c71f87 100%)',
  }),
  // Gökkuşağı: mor → mavi → yeşil → turuncu, karolar gökkuşağının sekiz rengi
  T('gokkusagi', 'Gökkuşağı', '#3b2bc9', '#4a3adb', '#5b4af0', '#b8b0ff', '#fff04d', '#1a1600', {
    ...CANLI,
    p: ['#ece9ff', '#ff5566', '#ff9a2e', '#ffe14d', '#3ee07a', '#2ee6e6', '#5aa8ff', '#c08cff', '#ff6ec7'],
    zemin: 'linear-gradient(135deg, #7c1fd1 0%, #1e5ad8 34%, #0b7a63 68%, #c2570c 100%)',
  }),
  // Okyanus esintisi: derin maviden turkuaza; sıcak renkli karolar zeminden ayrılır
  T('okyanus', 'Okyanus esintisi', '#0b4aa8', '#1259c4', '#1f6fe0', '#9ccbff', '#ffd21f', '#1a1400', {
    ...CANLI,
    p: ['#e4f0ff', '#ffd21f', '#ff8a4c', '#ff5ab0', '#7bf29a', '#c9a0ff', '#ff6b6b', '#f5f7ff', '#4de8dc'],
    zemin: 'linear-gradient(135deg, #0a3fa0 0%, #0a78c8 55%, #0f7f7c 100%)',
  }),
  // Gün batımı: turuncudan pembeye ve mora; karolar serin ve açık renkler
  T('gunbatimi', 'Gün batımı', '#a3195f', '#b3226d', '#c42f7d', '#ffb3d1', '#ffe14d', '#2a0a14', {
    ...CANLI,
    p: ['#ffe9f2', '#ffe14d', '#3ee0ff', '#85ff9e', '#d6b8ff', '#ffb86b', '#ffd0e6', '#f4f1ff', '#6fb6ff'],
    zemin: 'linear-gradient(160deg, #c2410c 0%, #be185d 50%, #6d28d9 100%)',
  }),
  // Orman şafağı: zümrütten turkuaza ve maviye
  T('orman', 'Orman şafağı', '#075e5c', '#0b6f6b', '#10807b', '#8ee6cf', '#ffb347', '#1f1200', {
    ...CANLI,
    p: ['#e3fff6', '#ffb347', '#ff6b8a', '#ffe14d', '#c6f55a', '#b79bff', '#5ec8ff', '#f6fff9', '#ff8f6b'],
    zemin: 'linear-gradient(135deg, #047857 0%, #0b6b6a 48%, #1d4ed8 100%)',
  }),
  // Şeker pembesi: pembeden mora ve maviye
  T('seker', 'Şeker pembesi', '#8a1f9e', '#9a2aae', '#ad3bc2', '#f0b5ff', '#ffe14d', '#1f0a24', {
    ...CANLI,
    p: ['#fbe9ff', '#ffe14d', '#6ef2b0', '#47e0ff', '#ff9d5c', '#d9b3ff', '#ff7a8a', '#f6f0ff', '#c6f55a'],
    zemin: 'linear-gradient(135deg, #be185d 0%, #8a1f9e 50%, #1d4ed8 100%)',
  }),
  // Aurora: mordan maviye ve zümrüde; karolar parlak pembe, yeşil ve sarı
  T('aurora', 'Aurora', '#4a1fa8', '#5b2bc2', '#6d3ad8', '#b9a4ff', '#7dffb5', '#06210f', {
    ...CANLI,
    p: ['#efe9ff', '#ff6ec7', '#b6f23c', '#ffd84a', '#ff9a45', '#4fe3ff', '#7dffb5', '#f5f2ff', '#ff6b7a'],
    zemin: 'linear-gradient(135deg, #5b21b6 0%, #1d4ed8 52%, #0f7f7c 100%)',
  }),
];

// Kaldırılan eski temalar (koyu/tek renkli zeminliler) kayıtlıysa en yakın canlı temaya geçer
const ESKI_TEMALAR = { sunset: 'gunbatimi', neon: 'aurora', cards: VARSAYILAN_TEMA, solid: VARSAYILAN_TEMA };

export const temaBul = (id) => {
  const k = ESKI_TEMALAR[id] || id;
  return TEMALAR.filter((t) => t.id === k)[0] || TEMALAR[0];
};

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
  if (t.id !== ORIJINAL_TEMA) {
    // Tek geçişte değiştir: bir rolün yeni rengi başka bir varsayılan renkle çakışsa bile ikinci kez değişmesin
    const harita = {};
    for (let i = 0; i < ESLEME.length; i++) harita[ESLEME[i][0]] = ESLEME[i][1](t);
    if (t.canli) {
      // Soluk griler ve açık yazı renkleri: zeminin tonuna karışmış, parlak ve yüksek karşıtlıklı yazılar
      harita['#e8ecf4'] = harita['#dbe2f2'] = harita['#d7deee'] = '#ffffff';
      harita['#c9d2e6'] = harita['#aab5cc'] = karistir('#ffffff', t.line, 0.1);
      harita['#9aa6bf'] = harita['#8b97b1'] = karistir('#ffffff', t.line, 0.3);
      harita['#7f8aa3'] = harita['#56627d'] = karistir('#ffffff', t.line, 0.45);
    }
    c = c.replace(/#[0-9a-fA-F]{6}\b/g, (m) => {
      const k = m.toLowerCase();
      return Object.prototype.hasOwnProperty.call(harita, k) ? harita[k] : m;
    });
    // Parıltılardaki şeffaf vurgu rengi de paletin vurgusuna döner
    c = c.replace(/rgba\(45, ?212, ?191,/g, 'rgba(' + rgbMetni(t.accent) + ',');
    if (t.canli) {
      // Koyu lacivert katmanlar (afiş altı, ayrıntı perdesi, açık paneller, bildirim) zeminin kendi rengine döner
      c = c.replace(/rgba\(10, ?14, ?23,/g, 'rgba(' + rgbMetni(t.bg) + ',');
      c = c.replace(/rgba\(27, ?36, ?55,/g, 'rgba(' + rgbMetni(t.surface) + ',');
    }
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
  if (t.id === ORIJINAL_TEMA) {
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
