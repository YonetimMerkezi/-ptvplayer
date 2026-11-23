// Tema renkleri: Ayarlar → Genel ayarlar → Tema rengi. Renkler CSS'te (html[data-theme]) tanımlıdır;
// burada yalnız seçenek listesi, seçimin uygulanması ve tarayıcı çubuğu rengi bulunur.
export const THEMES = [
  // Canlı temalar: her biri çok renklidir (CSS'te html[data-multi] kuralları + --p0…--p8 paleti). vivid = ana kutuların biçimi:
  // 'glass' (renk tonlu cam), 'solid' (dolu gradyan), 'neon' (gradyan çerçeve). swatch seçicideki yuvarlağın arka planıdır.
  { id: 'green', name: 'Yeşil', swatch: 'linear-gradient(135deg, #34d399 0%, #a3e635 50%, #22d3ee 100%)', bar: '#071a17', multi: true, vivid: 'glass' },
  { id: 'blue', name: 'Mavi', swatch: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #22d3ee 100%)', bar: '#0b1226', multi: true, vivid: 'neon' },
  { id: 'cyan', name: 'Turkuaz', swatch: 'linear-gradient(135deg, #06b6d4 0%, #10b981 50%, #3b82f6 100%)', bar: '#06191f', multi: true, vivid: 'solid' },
  { id: 'purple', name: 'Mor', swatch: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 50%, #3b82f6 100%)', bar: '#130d2b', multi: true, vivid: 'glass' },
  { id: 'orange', name: 'Turuncu', swatch: 'linear-gradient(135deg, #f97316 0%, #f43f5e 50%, #f59e0b 100%)', bar: '#1a0f06', multi: true, vivid: 'solid' },
  { id: 'red', name: 'Kırmızı', swatch: 'linear-gradient(135deg, #f43f5e 0%, #f97316 50%, #a855f7 100%)', bar: '#1c0a0f', multi: true, vivid: 'glass' },
  // Eski çok renkli temalar: her ana kutu ve simge kendi renginde (kutu stilleri CSS'te temaya özel).
  { id: 'cards', name: 'Renkli kartlar', swatch: 'conic-gradient(#4ade80, #38bdf8, #a78bfa, #fb7185, #fb923c, #4ade80)', bar: '#0b0f1b', multi: true, pro: true },
  { id: 'solid', name: 'Dolu renk', swatch: 'linear-gradient(135deg, #16a34a 0%, #ea580c 34%, #7c3aed 67%, #0284c7 100%)', bar: '#0a0e19', multi: true, pro: true },
  { id: 'neon', name: 'Neon cam', swatch: 'linear-gradient(135deg, #a855f7 0%, #38bdf8 50%, #ec4899 100%)', bar: '#070816', multi: true, pro: true },
  { id: 'sunset', name: 'Gün batımı', swatch: 'linear-gradient(160deg, #6b21a8 0%, #be185d 50%, #ea580c 100%)', bar: '#3a0f4a', multi: true, pro: true },
  { id: 'midnight', name: 'Gece yarısı', swatch: 'linear-gradient(135deg, #6366f1 0%, #0ea5e9 50%, #ec4899 100%)', bar: '#080d19', multi: true, vivid: 'neon' },
  { id: 'ocean', name: 'Okyanus', swatch: 'linear-gradient(135deg, #14b8a6 0%, #2563eb 50%, #10b981 100%)', bar: '#041923', multi: true, vivid: 'glass' },
  { id: 'graphite', name: 'Grafit', swatch: 'linear-gradient(135deg, #94a3b8 0%, #8b5cf6 50%, #14b8a6 100%)', bar: '#101318', multi: true, vivid: 'solid' },
  { id: 'rose', name: 'Gül kurusu', swatch: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 50%, #fb923c 100%)', bar: '#1b0a14', multi: true, vivid: 'neon' },
];
export const DEFAULT_THEME = 'green';

// Pro temalar: yönetici panelinde (Temalar sekmesi) işaretlenir ve yapılandırma dosyasıyla cihazlara gelir.
// Hiç işaretleme yapılmamışsa eski çok renkli temalar (pro: true) Pro'dur; canlı hale gelen eski tek renkli temalar ücretsiz kalır. Varsayılan tema hiçbir zaman Pro olamaz (kilitli açılış teması olmaz).
export const DEFAULT_PRO_THEMES = THEMES.filter((t) => t.pro).map((t) => t.id);
export const cleanProThemes = (ids) =>
  Array.isArray(ids) ? [...new Set(ids.filter((id) => typeof id === 'string' && id !== DEFAULT_THEME && THEMES.some((t) => t.id === id)))] : null;
export const proThemeIds = (override) => cleanProThemes(override) || DEFAULT_PRO_THEMES;
export const isProTheme = (id, override) => proThemeIds(override).includes(id);
// Kartlardaki gerçek ana ekran görüntüsü (scripts/theme-previews.py üretir).
export const previewUrl = (id) => `img/themes/${themeById(id).id}.webp`;

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

// Seçimi sayfaya uygular (kök öğede data-theme + tarayıcı çubuğu rengi); geçerli kimliği döndürür.
export function applyTheme(id, doc = globalThis.document) {
  const t = themeById(id);
  if (doc && doc.documentElement) {
    doc.documentElement.dataset.theme = t.id;
    if (t.multi) doc.documentElement.dataset.multi = '1';
    else delete doc.documentElement.dataset.multi;
    if (t.vivid) doc.documentElement.dataset.vivid = t.vivid;
    else delete doc.documentElement.dataset.vivid;
    const meta = doc.querySelector && doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.bar);
  }
  return t.id;
}
