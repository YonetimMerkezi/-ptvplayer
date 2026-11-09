// Altyazı görünümü (boyut, renk, arka plan, konum): seçimler kalıcıdır, oynatıcıya sayısal değer olarak iletilir (saf mantık).

export const SUB_SIZES = [
  ['small', 'Küçük', 0.8],
  ['normal', 'Normal', 1],
  ['large', 'Büyük', 1.3],
  ['xlarge', 'Çok büyük', 1.7],
];
export const SUB_COLORS = [
  ['white', 'Beyaz', '#FFFFFF'],
  ['yellow', 'Sarı', '#FFE14D'],
  ['cyan', 'Turkuaz', '#6EE7F2'],
  ['green', 'Yeşil', '#8CF08C'],
];
export const SUB_BGS = [
  ['none', 'Yok', 0],
  ['soft', 'Yarı saydam', 0.55],
  ['solid', 'Siyah', 1],
];
export const SUB_POS = [
  ['low', 'Alçak', 0.03],
  ['normal', 'Normal', 0.08],
  ['high', 'Yüksek', 0.18],
];
export const DEFAULT_SUB = { size: 'normal', color: 'white', bg: 'soft', pos: 'normal' };

// Media3 SubtitleView.DEFAULT_TEXT_SIZE_FRACTION
const BASE_FRACTION = 0.0533;

const pick = (list, id, fallback) => (list.some((x) => x[0] === id) ? id : fallback);

export function normalizeSub(v) {
  const o = v && typeof v === 'object' ? v : {};
  return {
    size: pick(SUB_SIZES, o.size, DEFAULT_SUB.size),
    color: pick(SUB_COLORS, o.color, DEFAULT_SUB.color),
    bg: pick(SUB_BGS, o.bg, DEFAULT_SUB.bg),
    pos: pick(SUB_POS, o.pos, DEFAULT_SUB.pos),
  };
}

const find = (list, id) => list.find((x) => x[0] === id);

// Oynatıcıya giden değerler: boyut (ekran yüksekliğine oran), renk (#RRGGBB), arka plan saydamsızlığı (0..1),
// alt boşluk oranı; arka plan yokken okunaklılık için kenar çizgisi açılır.
export function subParams(v) {
  const s = normalizeSub(v);
  const alpha = find(SUB_BGS, s.bg)[2];
  return {
    size: Number((BASE_FRACTION * find(SUB_SIZES, s.size)[2]).toFixed(4)),
    color: find(SUB_COLORS, s.color)[2],
    bgAlpha: alpha,
    bottom: find(SUB_POS, s.pos)[2],
    outline: alpha === 0,
  };
}

// Ön izleme kutusu için satır içi biçim.
export function subPreviewStyle(v) {
  const s = normalizeSub(v);
  const p = subParams(s);
  const mult = find(SUB_SIZES, s.size)[2];
  const bg = p.bgAlpha > 0 ? `background:rgba(0,0,0,${p.bgAlpha});` : 'background:transparent;';
  const edge = p.outline ? 'text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;' : '';
  return `color:${p.color};${bg}${edge}font-size:${(1.05 * mult).toFixed(2)}rem;`;
}

export const subLabel = (v) => {
  const s = normalizeSub(v);
  return [find(SUB_SIZES, s.size)[1], find(SUB_COLORS, s.color)[1], find(SUB_BGS, s.bg)[1] === 'Yok' ? 'arka plansız' : find(SUB_BGS, s.bg)[1].toLowerCase() + ' zemin'].join(' · ');
};
