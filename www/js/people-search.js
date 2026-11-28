// Oyuncu araması (Arama sayfası > Oyuncu sekmesi): Wikidata varlık araması (wbsearchentities) → oyuncu/yönetmen olanlar.
// Fotoğraf people-photos.js ile (Wikidata, ada göre) gelir; seçilen oyuncunun yapımları oyuncu sayfasında (Cinemeta) açılır.
// Saf mantık: ağ (net.json) ve önbellek dışarıdan verilir; ekran app.js'te.
import { fold } from './util.js';

export const SEARCH_TTL = 3 * 86400000;
export const MIN_QUERY = 2;
export const MAX_RESULTS = 12;
const API = 'https://www.wikidata.org/w/api.php';
// Açıklamada meslek geçen varlıklar (İngilizce ve Türkçe): oyuncu, aktör, komedyen, yönetmen, seslendirme
const PERSON_DESC = /\b(actor|actress|comedian|film director|director|filmmaker|film maker|voice|performer|oyuncu|aktör|aktris|komedyen|yönetmen|seslendirme|sunucu|presenter)\b/i;

export const searchUrl = (query, lang = 'en') =>
  `${API}?action=wbsearchentities&format=json&type=item&limit=25&origin=*&language=${lang}&uselang=${lang}&search=${encodeURIComponent(String(query || '').trim())}`;

// Yanıt → [{ id, name, desc }] yalnız kişi olanlar (açıklamada oyunculuk/yönetmenlik geçen), tekrarsız
export function parseSearch(json) {
  const out = [];
  const seen = new Set();
  for (const r of json && Array.isArray(json.search) ? json.search : []) {
    const id = String((r && r.id) || '');
    const name = String((r && r.label) || '').trim();
    const desc = String((r && r.description) || '').trim();
    if (!/^Q\d+$/.test(id) || !name || seen.has(id) || !PERSON_DESC.test(desc)) continue;
    seen.add(id);
    out.push({ id, name, desc });
  }
  return out;
}

// Adı yazılan kişinin sıralaması: adı tam eşleşen önce, ad yazılanla başlayanlar sonra, kalan sıra korunur
export function rankPeople(list, query) {
  const q = fold(query);
  const score = (p) => (fold(p.name) === q ? 0 : fold(p.name).startsWith(q) ? 1 : 2);
  return list.map((p, i) => ({ p, i })).sort((a, b) => score(a.p) - score(b.p) || a.i - b.i).map((x) => x.p);
}

// Arama: İngilizce arama asıl sonuçtur (ad, Cinemeta ve fotoğraf araması için Latin harfli özgün ad); Türkçe açıklama varsa açıklama olarak kullanılır.
export async function searchActors({ net, cache = null, query, now = Date.now() }) {
  const q = String(query || '').trim();
  if (fold(q).length < MIN_QUERY) return [];
  const key = 'people-search:v1:' + fold(q);
  const hit = cache ? await cache.get(key).catch(() => null) : null;
  if (hit && typeof hit.at === 'number' && Array.isArray(hit.value) && now - hit.at < SEARCH_TTL) return hit.value;
  const main = parseSearch(await net.json(searchUrl(q, 'en'), { fast: true }));
  let tr = [];
  try {
    tr = await net.json(searchUrl(q, 'tr'), { fast: true }).then((j) => (j && Array.isArray(j.search) ? j.search : []));
  } catch {
    /* Türkçe açıklama alınamadı: İngilizce açıklama kalır */
  }
  const trDesc = new Map(tr.filter((r) => r && r.id && r.description).map((r) => [String(r.id), String(r.description).trim()]));
  const value = rankPeople(main, q).slice(0, MAX_RESULTS).map((p) => ({ ...p, desc: trDesc.get(p.id) || p.desc }));
  if (cache) await cache.set(key, { at: now, value }).catch(() => {});
  return value;
}
