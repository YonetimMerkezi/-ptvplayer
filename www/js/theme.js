// Tema renkleri: Ayarlar → Genel ayarlar → Tema rengi. Renkler CSS'te (html[data-theme]) tanımlıdır;
// burada yalnız seçenek listesi, seçimin uygulanması ve tarayıcı çubuğu rengi bulunur.
export const THEMES = [
  { id: 'green', name: 'Yeşil', swatch: '#4ade80', bar: '#071a17' },
  { id: 'blue', name: 'Mavi', swatch: '#38bdf8', bar: '#0b1226' },
  { id: 'cyan', name: 'Turkuaz', swatch: '#22d3ee', bar: '#06191f' },
  { id: 'purple', name: 'Mor', swatch: '#a78bfa', bar: '#130d2b' },
  { id: 'orange', name: 'Turuncu', swatch: '#fb923c', bar: '#1a0f06' },
  { id: 'red', name: 'Kırmızı', swatch: '#fb7185', bar: '#1c0a0f' },
  // Çok renkli temalar: her ana kutu ve simge kendi renginde (CSS'te html[data-multi] kuralları + --p0…--p8 paleti).
  // swatch burada tek renk değil, seçicideki yuvarlağın arka planıdır.
  { id: 'cards', name: 'Renkli kartlar', previewAccent: '#4ade80', swatch: 'conic-gradient(#4ade80, #38bdf8, #a78bfa, #fb7185, #fb923c, #4ade80)', bar: '#0b0f1b', multi: true },
  { id: 'solid', name: 'Dolu renk', previewAccent: '#16a34a', swatch: 'linear-gradient(135deg, #16a34a 0%, #ea580c 34%, #7c3aed 67%, #0284c7 100%)', bar: '#0a0e19', multi: true },
  { id: 'neon', name: 'Neon cam', previewAccent: '#38bdf8', swatch: 'linear-gradient(135deg, #a855f7 0%, #38bdf8 50%, #ec4899 100%)', bar: '#070816', multi: true },
  { id: 'sunset', name: 'Gün batımı', previewAccent: '#be185d', swatch: 'linear-gradient(160deg, #6b21a8 0%, #be185d 50%, #ea580c 100%)', bar: '#3a0f4a', multi: true },
  { id: 'midnight', name: 'Gece yarısı', swatch: '#a5b4fc', bar: '#080d19' },
  { id: 'ocean', name: 'Okyanus', swatch: '#2dd4bf', bar: '#041923' },
  { id: 'graphite', name: 'Grafit', swatch: '#cbd5e1', bar: '#101318' },
  { id: 'rose', name: 'Gül kurusu', swatch: '#fb8cae', bar: '#1b0a14' },
];
export const DEFAULT_THEME = 'green';

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

// Seçimi sayfaya uygular (kök öğede data-theme + tarayıcı çubuğu rengi); geçerli kimliği döndürür.
export function applyTheme(id, doc = globalThis.document) {
  const t = themeById(id);
  if (doc && doc.documentElement) {
    doc.documentElement.dataset.theme = t.id;
    if (t.multi) doc.documentElement.dataset.multi = '1';
    else delete doc.documentElement.dataset.multi;
    const meta = doc.querySelector && doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.bar);
  }
  return t.id;
}
