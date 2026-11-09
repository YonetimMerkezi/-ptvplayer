// Oynatıcının alt düğmeleri: hangilerinin adı (etiketi) simgenin yanında yazacak. Ayarlar › Genel ayarlar › Oynatıcı düğme etiketleri.
// Seçilmeyen düğmeler yalnız simge gösterir; düğmeler ortalanmış tek satırdadır.

// [kimlik (#pl-<kimlik>), görünen ad]
export const PLAYER_TOOLS = [
  ['audio', 'Ses'],
  ['text', 'Altyazı'],
  ['sync', 'Ses senkronu'],
  ['pip', 'Resim içinde resim'],
  ['external', 'Harici oynatıcı'],
  ['tv', "TV'de oynat"],
  ['dl', 'İndir'],
  ['rec', 'Kaydet'],
  ['golive', 'Canlıya dön'],
  ['last', 'Son kanal'],
  ['stats', 'Bilgi'],
  ['night', 'Gece modu'],
  ['sleep', 'Uyku'],
  ['aspect', 'Sığdır'],
];

const KNOWN = new Set(PLAYER_TOOLS.map(([id]) => id));

// Kayıtlı değerden bilinen kimlikleri (tekrarsız, sıralı) süzer; bozuk/eski veri boş liste olur.
export function normalizeLabels(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set(v.filter((x) => typeof x === 'string' && KNOWN.has(x)));
  return PLAYER_TOOLS.map(([id]) => id).filter((id) => seen.has(id));
}
