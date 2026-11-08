// Android'de video WebView'ın altındaki yerel görünümlerde oynar. Sayfa saydam olur, #bgfill ise ekranı opak örter;
// video pencerelerinin yerinde delik açmak için clip-path çokgeni üretilir (evenodd).
//
// rects: [{ x, y, w, h }] (CSS piksel). Her delikten sonra başlangıç köşesine (0 0) dönülür; böylece bağlantı
// kenarları ikişer kez (gidiş-dönüş) çizilir, alanı sıfır olur ve evenodd'da fazladan dolu/boş bölge oluşmaz.
export function holeClip(rects) {
  const list = (rects || []).filter((r) => r && r.w > 0 && r.h > 0);
  if (!list.length) return '';
  const outer = '0 0, 100% 0, 100% 100%, 0 100%, 0 0';
  const holes = list.map((r) => `${r.x}px ${r.y}px, ${r.x}px ${r.y + r.h}px, ${r.x + r.w}px ${r.y + r.h}px, ${r.x + r.w}px ${r.y}px, ${r.x}px ${r.y}px, 0 0`);
  return `polygon(evenodd, ${[outer, ...holes].join(', ')})`;
}
