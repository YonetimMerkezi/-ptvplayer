// Tema renkleri: Ayarlar → Genel ayarlar → Tema rengi. Renkler CSS'te (html[data-theme]) tanımlıdır;
// burada yalnız seçenek listesi, seçimin uygulanması ve tarayıcı çubuğu rengi bulunur.
export const THEMES = [
  { id: 'green', name: 'Yeşil', swatch: '#4ade80', bar: '#071a17' },
  { id: 'blue', name: 'Mavi', swatch: '#38bdf8', bar: '#0b1226' },
  { id: 'cyan', name: 'Turkuaz', swatch: '#22d3ee', bar: '#06191f' },
  { id: 'purple', name: 'Mor', swatch: '#a78bfa', bar: '#130d2b' },
  { id: 'orange', name: 'Turuncu', swatch: '#fb923c', bar: '#1a0f06' },
  { id: 'red', name: 'Kırmızı', swatch: '#fb7185', bar: '#1c0a0f' },
];
export const DEFAULT_THEME = 'green';

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

// Seçimi sayfaya uygular (kök öğede data-theme + tarayıcı çubuğu rengi); geçerli kimliği döndürür.
export function applyTheme(id, doc = globalThis.document) {
  const t = themeById(id);
  if (doc && doc.documentElement) {
    doc.documentElement.dataset.theme = t.id;
    const meta = doc.querySelector && doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.bar);
  }
  return t.id;
}
