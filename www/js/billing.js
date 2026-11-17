// Google Play abonelikleri: Play'deki ürün kimlikleri ve etkin abonelikten üyelik hakkına çeviri. Saf mantık: ağ, depo ve yerel köprü yok.
// Satın alma Play'de, yerel tarafta (PlayBilling.java) yapılır; burada yalnız sonuç yorumlanır. Sunucu yoktur: hakkı Play'in verdiği
// etkin abonelik listesi belirler, uygulama her açılışta ve öne gelişinde listeyi yeniler.

// Play Console'da oluşturulacak abonelik ürün kimlikleri (yıllık temel plan; Play deneme teklifi eklenirse otomatik gösterilir).
export const PLAY_PRODUCTS = { standard: 'uyelik_standart', pro: 'uyelik_pro' };
export const PRODUCT_IDS = Object.values(PLAY_PRODUCTS);
// Sorgu başarısız olursa (çevrimdışı) son hak bu kadar gün daha geçerli sayılır.
export const OFFLINE_GRACE_DAYS = 7;
const DAY_MS = 86400000;

// Etkin ürün kimliklerinden en yüksek üyelik katmanı: 'pro' | 'standard' | ''.
export function tierFromActive(ids) {
  const list = Array.isArray(ids) ? ids : [];
  if (list.includes(PLAY_PRODUCTS.pro)) return 'pro';
  if (list.includes(PLAY_PRODUCTS.standard)) return 'standard';
  return '';
}

export function entFromActive(ids, now = Date.now()) {
  const tier = tierFromActive(ids);
  return tier ? { tier, until: now + OFFLINE_GRACE_DAYS * DAY_MS, play: true } : null;
}

// Play sorgusunun sonucundan yeni hak. ids dizi: sorgu başarılı, liste güncel (boşsa abonelik yok ya da bitti). ids dizi değilse sorgu
// başarısız (çevrimdışı, Play hizmeti yok): eldeki hak süresi bitene kadar korunur.
export function nextEnt({ ids, current = null, now = Date.now() } = {}) {
  if (!Array.isArray(ids)) return current && Number(current.until) > now ? current : null;
  return entFromActive(ids, now);
}

// ISO 8601 süre (Play faturalama dönemi): P3D, P1W, P1M, P1Y → "3 gün", "1 hafta", "1 ay", "1 yıl".
export function periodText(iso) {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(String(iso || ''));
  if (!m) return '';
  const [, y, mo, w, d] = m;
  const parts = [];
  if (y) parts.push(`${Number(y)} yıl`);
  if (mo) parts.push(`${Number(mo)} ay`);
  if (w) parts.push(`${Number(w)} hafta`);
  if (d) parts.push(`${Number(d)} gün`);
  return parts.join(' ');
}

// Plan kartındaki fiyat satırı. p: { price, period, trial } (yerel taraftan; trial boşsa deneme teklifi yoktur).
export function offerText(p) {
  if (!p || !p.price) return '';
  const per = periodText(p.period);
  const price = per === '1 yıl' ? `${p.price} / yıl` : per ? `${p.price} / ${per}` : p.price;
  const trial = periodText(p.trial);
  return trial ? `${trial} ücretsiz, sonra ${price}` : price;
}
