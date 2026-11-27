import { SURUM, YAPI } from './version.js';

// Tema merkezi: renk paletleri. Chromium 38'de CSS değişkeni olmadığından tv.css'teki varsayılan renkler,
// seçilen paletin renkleriyle değiştirilerek çalışma anında bir <style> olarak uygulanır (varsayılan temada tv.css olduğu gibi kullanılır).
// Paletler Android uygulamasının tema renkleriyle aynıdır (www/css/app.css).

// Paletin rolleri: bg zemin, surface kutu, raised vurgulu kutu, line çizgi, accent vurgu, ink vurgu üzerindeki yazı
export const VARSAYILAN_TEMA = 'canli-renkli';

// tv.css'in özgün (boyanmamış) turkuaz renkleri: artık seçilebilir tema değil; yalnız boyama mantığı bu kimliği "değiştirme" diye tanır.
const ORIJINAL_TEMA = 'varsayilan';

const T = (id, ad, bg, surface, raised, line, accent, ink, ek) => Object.assign({ id, ad, bg, surface, raised, line, accent, ink }, ek || {});

// Canlı paket: gradyan zemin + her karo ayrı parlak renkte dolu. Her temada zemin renkleri beyaz yazıyla ≥ 4,4 karşıtlıkta kalır
// (test denetler); karo yazısı koyu (vurgu yazı rengi).
const CANLI = { canli: true, multi: true, dolu: true };
// Koyu paket: koyu zemin, karolar zeminin biraz açığı ve kendi renginde yazı; odaklanan karo o renkle dolar. Özgün açık yazı renkleri korunur.
const KOYU = { koyu: true, multi: true };

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
  // --- Koyu tema paketi (gözü yormayan, karanlık odada rahat; son iki tema AMOLED/TV panelleri için en koyu)
  // Gece mavisi: uygulamanın özgün lacivert zemini, turkuaz vurgu
  T('gece-mavisi', 'Gece mavisi', '#0b1020', '#161d31', '#212c47', '#31416a', '#34e0c8', '#03161a', {
    ...KOYU,
    p: ['#e8ecf4', '#2dd4bf', '#fbbf24', '#b9a5ff', '#7dbaff', '#34d399', '#f78bc4', '#fb923c', '#ff8c8c'],
    zemin: 'linear-gradient(135deg, #0b1020 0%, #111c38 55%, #0b2433 100%)',
  }),
  // Kömür: nötr koyu gri, mavi vurgu
  T('komur', 'Kömür', '#0f1012', '#1a1c20', '#262930', '#3a3e47', '#60a5fa', '#04101f', {
    ...KOYU,
    p: ['#eceef2', '#7dbaff', '#fbbf24', '#4ade80', '#ff8a9c', '#c4b5fd', '#fb923c', '#2dd4bf', '#f08cfb'],
    zemin: 'linear-gradient(135deg, #0c0d0f 0%, #14161a 55%, #181b21 100%)',
  }),
  // AMOLED siyah: saf siyah zemin (ışık sızdırmaz, enerji harcamaz), camgöbeği vurgu
  T('amoled', 'AMOLED siyah', '#000000', '#0c0c0e', '#18181c', '#2a2a31', '#22d3ee', '#00181d', {
    ...KOYU,
    p: ['#f1f3f7', '#22d3ee', '#a3e635', '#ff8a9c', '#fbbf24', '#818cf8', '#34d399', '#f78bc4', '#fb923c'],
  }),
  // Mor gece: derin mordan koyu indigoya
  T('mor-gece', 'Mor gece', '#0f0a1f', '#1a1233', '#2a1d4d', '#41306f', '#a78bfa', '#14082e', {
    ...KOYU,
    p: ['#ede9fe', '#b9a5ff', '#f78bc4', '#38bdf8', '#fbbf24', '#34d399', '#ff8a9c', '#67e8f9', '#fdba74'],
    zemin: 'linear-gradient(135deg, #0f0a1f 0%, #1c1040 55%, #2a1052 100%)',
  }),
  // Zümrüt gece: koyu ormandan petrol mavisine
  T('zumrut-gece', 'Zümrüt gece', '#06130e', '#0d2119', '#143328', '#1f4d3b', '#34d399', '#03140d', {
    ...KOYU,
    p: ['#e6faf1', '#34d399', '#fbbf24', '#7dbaff', '#f78bc4', '#a3e635', '#fb923c', '#c4b5fd', '#2dd4bf'],
    zemin: 'linear-gradient(135deg, #06130e 0%, #0b2a1f 55%, #0a2530 100%)',
  }),
  // Bordo gece: koyu şaraptan erik rengine
  T('bordo-gece', 'Bordo gece', '#14080c', '#25101a', '#38182a', '#5a2640', '#fb7185', '#2a0610', {
    ...KOYU,
    p: ['#ffe8ee', '#ff8a9c', '#fbbf24', '#f9a8d4', '#fdba74', '#a5b4fc', '#5eead4', '#fde68a', '#cb94ff'],
    zemin: 'linear-gradient(135deg, #14080c 0%, #2a0f1f 55%, #3a1226 100%)',
  }),
  // Derin deniz: gece lacivertinden denizin dibine
  T('derin-deniz', 'Derin deniz', '#04121c', '#0a2233', '#10324a', '#1b4a6b', '#38bdf8', '#021520', {
    ...KOYU,
    p: ['#e4f4ff', '#38bdf8', '#fbbf24', '#34d399', '#f78bc4', '#b9a5ff', '#fb923c', '#5eead4', '#ff8a9c'],
    zemin: 'linear-gradient(135deg, #04121c 0%, #08283f 55%, #06303a 100%)',
  }),
  // Altın gece: siyaha yakın kahveden koyu altına; altın ve sıcak tonlar
  T('altin-gece', 'Altın gece', '#0d0b06', '#1c1810', '#2c2516', '#4a3f22', '#fbbf24', '#1a1100', {
    ...KOYU,
    p: ['#fff4d6', '#fbbf24', '#fb923c', '#fde68a', '#ff8c8c', '#a3e635', '#f9a8d4', '#e9d5ff', '#67e8f9'],
    zemin: 'linear-gradient(135deg, #0d0b06 0%, #1d1708 55%, #2a1d06 100%)',
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
    // Koyu lacivert katmanlar (afiş altı, ayrıntı perdesi, açık paneller, soldaki menü, bildirim) temanın kendi zemin ve kutu rengine döner
    c = c.replace(/rgba\(10, ?14, ?23,/g, 'rgba(' + rgbMetni(t.bg) + ',');
    c = c.replace(/rgba\(27, ?36, ?55,/g, 'rgba(' + rgbMetni(t.surface) + ',');
  }
  if (t.zemin) c += '\nhtml, body { background: ' + t.zemin + '; }\n.screen { background: transparent; }\n.player { background: #000; }';
  if (t.multi && t.p) {
    for (let i = 1; i <= 8; i++) {
      const p = t.p[i];
      if (t.dolu) c += '\n.tile.c' + i + ' { background: ' + p + '; color: ' + t.ink + '; }\n.tile.c' + i + '.on { background: ' + p + '; color: ' + t.ink + '; ' + PARILTI(p) + ' }';
      else c += '\n.tile.c' + i + ' { background: ' + karistir(t.surface, p, 0.22) + '; color: ' + p + '; }\n.tile.c' + i + '.on { background: ' + p + '; color: ' + t.ink + '; ' + PARILTI(p) + ' }';
      // Soldaki menü: simge ve yazı bölümün paletteki rengini taşır; odaklanınca/üzerine gelince o renkle dolar
      c += '\n.rl-it.c' + i + ' { color: ' + p + '; }\n.rl-it.c' + i + '.on, .rl-it.c' + i + '.hv { background: ' + p + '; color: ' + t.ink + '; ' + PARILTI(p) + ' }';
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

// Üretilen CSS (sürüm + tema kimliği anahtarıyla) kalıcı yazılır: sonraki açılışta ilk çizimden önce eşzamanlı uygulanır,
// böylece ana sayfa önce varsayılan renkte açılıp birkaç saniye sonra seçili temaya dönmez.
const OB_CSS = 'iptv.temaCss';
const OB_ANAHTAR = 'iptv.temaCss.k';
const obAnahtar = (t) => SURUM + '|' + YAPI + '|' + t.id;
const depo = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (e) {
    return null;
  }
};

function stilYaz(doc, link, t, css) {
  let st = doc.getElementById('tema-css');
  if (!st) {
    st = doc.createElement('style');
    st.id = 'tema-css';
    doc.head.appendChild(st);
  }
  st.textContent = css;
  if (link) link.disabled = true;
  doc.documentElement.className = t.multi ? 'multi' : '';
}

// Önbellekteki CSS bu tema ve bu sürüm için varsa eşzamanlı uygular (true); yoksa false.
export function temaHizli(id, doc) {
  doc = doc || document;
  const t = temaBul(id);
  if (t.id === ORIJINAL_TEMA) return false;
  const d = depo();
  if (!d) return false;
  try {
    if (d.getItem(OB_ANAHTAR) !== obAnahtar(t)) return false;
    const css = d.getItem(OB_CSS);
    if (!css) return false;
    stilYaz(doc, doc.querySelector('link[rel="stylesheet"]'), t, css);
    return true;
  } catch (e) {
    return false;
  }
}

export async function temaUygula(id, doc) {
  doc = doc || document;
  const t = temaBul(id);
  const link = doc.querySelector('link[rel="stylesheet"]');
  const st = doc.getElementById('tema-css');
  if (t.id === ORIJINAL_TEMA) {
    if (st && st.parentNode) st.parentNode.removeChild(st);
    if (link) link.disabled = false;
    doc.documentElement.className = '';
    return t;
  }
  if (temaHizli(id, doc)) return t;
  const css = cssUret(await cssYukle(), t);
  stilYaz(doc, link, t, css);
  const d = depo();
  if (d) {
    try {
      d.setItem(OB_CSS, css);
      d.setItem(OB_ANAHTAR, obAnahtar(t));
    } catch (e) {
      /* kota dolu: sonraki açılışta yeniden üretilir */
    }
  }
  return t;
}
