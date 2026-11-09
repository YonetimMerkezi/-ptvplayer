// Kumandanın renkli tuşları (kırmızı, yeşil, sarı, mavi): oynatıcıda ve listelerde ayrı ayrı bir eyleme atanır (saf mantık).

// [renk, ad, KeyboardEvent.key]
export const COLORS = [
  ['red', 'Kırmızı', 'ColorF0Red'],
  ['green', 'Yeşil', 'ColorF1Green'],
  ['yellow', 'Sarı', 'ColorF2Yellow'],
  ['blue', 'Mavi', 'ColorF3Blue'],
];

// Oynatıcıda yapılabilecekler: [id, ad, düğme]
export const PLAYER_ACTIONS = [
  ['none', 'Yok', ''],
  ['fav', 'Favoriye ekle / çıkar', '#pl-fav'],
  ['text', 'Altyazı', '#pl-text'],
  ['audio', 'Ses dili', '#pl-audio'],
  ['aspect', 'En-boy kipi', '#pl-aspect'],
  ['sleep', 'Uyku zamanlayıcısı', '#pl-sleep'],
  ['night', 'Gece modu', '#pl-night'],
  ['stats', 'Yayın bilgisi', '#pl-stats'],
  ['sync', 'Ses senkronu', '#pl-sync'],
  ['last', 'Son kanal', '#pl-last'],
  ['epg', 'Program ayrıntısı', '#pl-epg'],
];

// Listelerde (oynatıcı kapalıyken): [id, ad]
export const HOME_ACTIONS = [
  ['none', 'Yok'],
  ['search', 'Ara'],
  ['guide', 'TV Rehberi'],
  ['live', 'Canlı TV'],
  ['movies', 'Filmler'],
  ['series', 'Diziler'],
  ['favs', 'Favoriler'],
  ['recent', 'İzleme listesi'],
  ['multi', 'Çoklu ekran'],
  ['sources', 'Ayarlar'],
];

export const DEFAULT_PLAYER = { red: 'fav', green: 'text', yellow: 'sleep', blue: 'aspect' };
export const DEFAULT_HOME = { red: 'search', green: 'favs', yellow: 'guide', blue: 'sources' };

export const colorOf = (key) => {
  const c = COLORS.find((x) => x[2] === key);
  return c ? c[0] : null;
};

// Kayıtlı atamayı okur: eksik/bozuk değer varsayılana döner.
export function normalizeKeys(v, actions, defaults) {
  const o = v && typeof v === 'object' ? v : {};
  const out = {};
  for (const [color] of COLORS) out[color] = actions.some((a) => a[0] === o[color]) ? o[color] : defaults[color];
  return out;
}

// Basılan tuşa atanmış eylem (id); renkli tuş değilse ya da "Yok" ise null.
export function actionFor(key, map, actions, defaults) {
  const color = colorOf(key);
  if (!color) return null;
  const a = normalizeKeys(map, actions, defaults)[color];
  return a === 'none' ? null : a;
}
