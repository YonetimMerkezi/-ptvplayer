// IMDb kimliğinden Türkçe ad(lar): Wikidata'da tek SPARQL isteğiyle (P345 = IMDb kimliği; Türkçe etiket + takma adlar).
// Oyuncu / vizyon listelerindeki yapımlar Cinemeta'dan İngilizce adla gelir, kullanıcının listesi ise çoğunlukla Türkçe adlıdır; bu adlar eşleştirmeyi sağlar.
// Ağ yoksa ya da Wikidata yanıt vermezse sessizce boş döner (eşleştirme eskisi gibi çalışır); sonuçlar kimlik başına önbelleğe yazılır.
import { WDQS, sparql } from './wdqs.js';
export { WDQS };
export const TR_TTL = 30 * 86400000;
export const TR_MISS_TTL = 3 * 86400000;
export const BATCH = 40;
const IMDB_ID = /^tt\d+$/;

export function trNamesQuery(ids) {
  const values = ids.map((id) => `"${id}"`).join(' ');
  return `SELECT ?imdb ?label ?alias WHERE { VALUES ?imdb { ${values} } ?item wdt:P345 ?imdb . OPTIONAL { ?item rdfs:label ?label . FILTER(LANG(?label) = "tr") } OPTIONAL { ?item skos:altLabel ?alias . FILTER(LANG(?alias) = "tr") } }`;
}

// SPARQL sonucu → Map(imdbId → [Türkçe adlar]); Wikidata'da kaydı olup Türkçe adı olmayan kimlik boş dizi alır
export function parseTrNames(json) {
  const out = new Map();
  const rows = json && json.results && Array.isArray(json.results.bindings) ? json.results.bindings : [];
  for (const r of rows) {
    const id = r && r.imdb && r.imdb.value;
    if (!IMDB_ID.test(id || '')) continue;
    if (!out.has(id)) out.set(id, []);
    const names = out.get(id);
    for (const k of ['label', 'alias']) {
      const v = r[k] && typeof r[k].value === 'string' ? r[k].value.trim() : '';
      if (v && !names.includes(v)) names.push(v);
    }
  }
  return out;
}

// Yedek yol (SPARQL hizmeti yanıt vermezse): Wikidata API'sinde "haswbstatement:P345=<kimlik>" araması + toplu etiket sorgusu. Kimlik başına bir istek: en çok API_MAX kimlik.
export const WD_API = 'https://www.wikidata.org/w/api.php';
export const API_MAX = 24;
const API_PAR = 4;
export async function namesViaApi(net, ids) {
  const list = ids.slice(0, API_MAX);
  const qids = new Map(); // imdb → Q kimliği
  let at = 0;
  const worker = async () => {
    while (at < list.length) {
      const id = list[at++];
      const j = await net.json(`${WD_API}?action=query&list=search&srsearch=${encodeURIComponent('haswbstatement:P345=' + id)}&srlimit=1&format=json&origin=*`, { fast: true });
      const hit = j && j.query && Array.isArray(j.query.search) ? j.query.search[0] : null;
      if (hit && /^Q\d+$/.test(hit.title || '')) qids.set(id, hit.title);
    }
  };
  await Promise.all(Array.from({ length: Math.min(API_PAR, list.length) }, worker));
  const out = new Map(list.map((id) => [id, []]));
  const q = [...new Set(qids.values())];
  if (!q.length) return out;
  const detail = await net.json(`${WD_API}?action=wbgetentities&ids=${q.join('|')}&props=labels|aliases&languages=tr&format=json&origin=*`, { fast: true });
  const ents = (detail && detail.entities) || {};
  for (const [id, qid] of qids) {
    const e = ents[qid] || {};
    const names = [];
    const label = e.labels && e.labels.tr && e.labels.tr.value;
    if (label) names.push(label);
    for (const a of (e.aliases && e.aliases.tr) || []) if (a && a.value && !names.includes(a.value)) names.push(a.value);
    out.set(id, names);
  }
  return out;
}

// ids: IMDb kimlikleri. Dönen Map: kimlik → [ad…] (bulunamayanlar boş dizi). Önbellekte olanlar için istek yapılmaz.
export async function loadTrNames({ net, cache = null, ids, now = Date.now() }) {
  const want = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => IMDB_ID.test(x || '')))];
  const out = new Map();
  const todo = [];
  for (const id of want) {
    const hit = cache ? await cache.get('tr-names:v1:' + id).catch(() => null) : null;
    if (hit && Array.isArray(hit.names) && typeof hit.at === 'number' && now - hit.at < (hit.names.length ? TR_TTL : TR_MISS_TTL)) out.set(id, hit.names);
    else todo.push(id);
  }
  for (let i = 0; i < todo.length; i += BATCH) {
    const part = todo.slice(i, i + BATCH);
    let found;
    try {
      found = parseTrNames(await sparql(net, trNamesQuery(part)));
    } catch {
      try {
        found = await namesViaApi(net, part); // SPARQL hizmeti yanıt vermedi: API'den (kimlik başına) denenir
      } catch {
        continue; // bu parça için ağ hatası: önbelleğe yazılmaz, sonra yeniden denenir
      }
    }
    for (const id of part) {
      const names = found.get(id) || [];
      out.set(id, names);
      if (cache) await cache.set('tr-names:v1:' + id, { at: now, names }).catch(() => {});
    }
  }
  return out;
}
