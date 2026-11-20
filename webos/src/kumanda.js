// Kumandanın renkli tuşları: oynatıcıda ve ana sayfada ayrı ayrı bir eyleme atanır (Ayarlar › Kumanda tuşları).
// Atama ve doğrulama mantığı Android uygulamasıyla ortaktır (www/js/remote.js).
import { normalizeKeys } from '../../www/js/remote.js';

export const RENKLER = [
  ['red', 'Kırmızı'],
  ['green', 'Yeşil'],
  ['yellow', 'Sarı'],
  ['blue', 'Mavi'],
];

export const OYNATICI = [
  ['none', 'Yok'],
  ['fav', 'Favoriye ekle / çıkar'],
  ['aspect', 'Görüntü oranı'],
  ['fmt', 'Canlı yayın biçimi (HLS / TS)'],
  ['list', 'Kanal listesi'],
  ['sleep', 'Uyku zamanlayıcısı'],
  ['last', 'Önceki kanal'],
  ['info', 'Program bilgisi'],
];
export const ANA = [
  ['none', 'Yok'],
  ['search', 'Ara'],
  ['guide', 'TV Rehberi'],
  ['live', 'Canlı TV'],
  ['movie', 'Filmler'],
  ['series', 'Diziler'],
  ['favs', 'Favoriler'],
  ['recents', 'Son izlenenler'],
  ['settings', 'Ayarlar'],
];
export const VARSAYILAN = {
  oyn: { red: 'fav', green: 'aspect', yellow: 'fmt', blue: 'sleep' },
  ana: { red: 'search', green: 'favs', yellow: 'guide', blue: 'settings' },
};
const LISTE = { oyn: OYNATICI, ana: ANA };

// hedef: 'oyn' (oynatıcı) ya da 'ana' (ana sayfa). Dönen: { red, green, yellow, blue } → eylem kimliği
export const atamalar = (store, hedef) => normalizeKeys(store.setting('keys.' + hedef, null), LISTE[hedef], VARSAYILAN[hedef]);

// Basılan renkli tuşa ('red'…) atanmış eylem; "Yok" ise null
export function eylemi(store, hedef, renk) {
  const a = atamalar(store, hedef)[renk];
  return a && a !== 'none' ? a : null;
}

export const eylemAdi = (hedef, id) => (LISTE[hedef].filter((x) => x[0] === id)[0] || LISTE[hedef][0])[1];

// Atamayı bir sonraki (yon=1) ya da önceki eyleme çevirip kaydeder
export function degistir(store, hedef, renk, yon) {
  const l = LISTE[hedef];
  const mevcut = atamalar(store, hedef);
  let i = 0;
  for (let k = 0; k < l.length; k++) if (l[k][0] === mevcut[renk]) i = k;
  mevcut[renk] = l[(i + (yon || 1) + l.length) % l.length][0];
  store.setSetting('keys.' + hedef, mevcut);
  return mevcut[renk];
}
