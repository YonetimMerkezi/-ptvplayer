// Cihazdaki yerel medya yardımcıları: kararlı kimlik, doğal sıralama, oynatma listesi.
// Saf işlevler: Android köprüsüne ve arayüze bağlı değildir, birim testle doğrulanır.

// Yerel videoların ilerleme kaydı bu anahtar altında tutulur (kaynaktan bağımsız).
export const LOCAL_SRC = 'local';

// Aynı dosya her seçimde aynı kimliği alsın ki kaldığı yer eşleşsin (FNV-1a, 32 bit).
export function localId(uri) {
  let h = 0x811c9dc5;
  const s = String(uri || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'local:' + h.toString(16).padStart(8, '0');
}

// "Bölüm 2" < "Bölüm 10": sayılar sayı gibi, harfler Türkçe duyarsız karşılaştırılır.
export const naturalCompare = (a, b) => String(a || '').localeCompare(String(b || ''), 'tr', { numeric: true, sensitivity: 'base' });

// Dosya adından uzantıyı atar ("film.mkv" → "film"); yalnız bilinen medya uzantıları.
const EXT = /\.(mp4|m4v|mkv|webm|avi|mov|wmv|flv|ts|m2ts|3gp|mpg|mpeg|mp3|m4a|aac|flac|ogg|opus|wav)$/i;
export const cleanName = (name) => String(name || '').replace(EXT, '').trim() || 'Cihaz medyası';

// Köprüden gelen {uri, name, mime} kaydını oynatıcı öğesine çevirir.
export function toLocalItem(p) {
  if (!p || !p.uri) return null;
  return {
    id: localId(p.uri),
    name: cleanName(p.name),
    kind: 'movie',
    mime: p.mime || 'auto',
    url: p.uri,
    localMedia: true,
  };
}

// Seçilen dosyalardan oynatma listesi: geçersizler ve yinelenenler atılır, ada göre doğal sırada dizilir.
export function buildPlaylist(picked) {
  const seen = new Set();
  const items = [];
  for (const p of Array.isArray(picked) ? picked : []) {
    const it = toLocalItem(p);
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    items.push(it);
  }
  return items.sort((a, b) => naturalCompare(a.name, b.name));
}
