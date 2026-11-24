// Otomatik Türkçe çeviri: yalnız Cinemeta gibi İngilizce gelen özetler için. Ücretsiz Google çeviri uç noktası (anahtar gerekmez).
// Çeviri alınamazsa (ağ yok, hız sınırı) null döner; çağıran özgün metni göstermeye devam eder. Başarılı çeviriler uzun süre önbellekte kalır.
export const TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';
export const TRANSLATE_TTL = 90 * 86400000;
export const MAX_CHARS = 1500;

const TR_WORDS = new Set(['ve', 'bir', 'bu', 'için', 'ile', 'olan', 'çok', 'gibi', 'daha', 'ama', 'her', 'sonra', 'kadar', 'de', 'da', 'ki', 'mi', 'ne', 'şu', 'var', 'yok', 'olarak', 'değil', 'onun', 'bütün', 'önce', 'sırasında', 'ancak', 'fakat', 'yeni', 'tüm']);
const EN_WORDS = new Set(['the', 'and', 'of', 'to', 'a', 'in', 'is', 'that', 'for', 'with', 'as', 'his', 'her', 'their', 'he', 'she', 'they', 'it', 'on', 'by', 'an', 'are', 'who', 'when', 'after', 'from', 'into', 'while', 'but', 'at', 'be', 'this', 'has', 'have', 'was', 'were', 'its', 'must', 'before', 'one']);

// Özet Türkçeye yalnız uygulama dili Türkçeyken çevrilir; İngilizce seçiliyken Cinemeta'nın İngilizce özeti olduğu gibi kalır.
export const wantsTurkishPlot = (appLang) => appLang !== 'en';

// Metin zaten Türkçe mi? Sık sözcüklerin sayımı + yalnız Türkçede olan harfler (ı, ş, ğ); İngilizce metindeki "ü/ö" (Müller) yanıltmaz.
export function looksTurkish(text) {
  const words = String(text || '').toLowerCase().match(/[a-zçğıöşü]+/g) || [];
  let tr = /[ışğİŞĞ]/.test(String(text || '')) ? 3 : 0;
  let en = 0;
  for (const w of words) {
    if (TR_WORDS.has(w)) tr++;
    if (EN_WORDS.has(w)) en++;
  }
  return tr > en;
}

// Çok uzun özet cümle sınırında kısaltılır (uç noktanın adres uzunluğu sınırı)
export function clipText(text, max = MAX_CHARS) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut).trim();
}

// Uç nokta yanıtı: [[[çeviri, özgün, …], …], …] → çeviri parçalarının birleşimi
export function parseTranslation(json) {
  const segs = Array.isArray(json) && Array.isArray(json[0]) ? json[0] : [];
  const out = segs.map((s) => (Array.isArray(s) && typeof s[0] === 'string' ? s[0] : '')).join('').trim();
  return out;
}

const hashOf = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36) + ':' + s.length;
};

// text → Türkçe metin. Zaten Türkçeyse aynısı; çeviri alınamazsa null.
export async function translateToTr({ net, cache = null, text, now = Date.now() }) {
  const src = clipText(text);
  if (!src) return null;
  if (looksTurkish(src)) return src;
  const key = 'translate:tr:v1:' + hashOf(src);
  const hit = cache ? await cache.get(key).catch(() => null) : null;
  if (hit && typeof hit.text === 'string' && hit.text && typeof hit.at === 'number' && now - hit.at < TRANSLATE_TTL) return hit.text;
  let out = '';
  try {
    out = parseTranslation(await net.json(`${TRANSLATE_URL}?client=gtx&sl=auto&tl=tr&dt=t&q=${encodeURIComponent(src)}`, { fast: true }));
  } catch (_) {
    return null;
  }
  if (!out) return null;
  if (cache) await cache.set(key, { at: now, text: out }).catch(() => {});
  return out;
}
