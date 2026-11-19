// IMDb kimliğinden Türkçe ad(lar): Wikidata'da tek SPARQL isteğiyle (P345 = IMDb kimliği; Türkçe etiket + takma adlar).
// Oyuncu / vizyon listelerindeki yapımlar Cinemeta'dan İngilizce adla gelir, kullanıcının listesi ise çoğunlukla Türkçe adlıdır; bu adlar eşleştirmeyi sağlar.
// Ağ yoksa ya da Wikidata yanıt vermezse sessizce boş döner (eşleştirme eskisi gibi çalışır); sonuçlar kimlik başına önbelleğe yazılır.
export const WDQS = 'https://query.wikidata.org/sparql';
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
    let json;
    try {
      json = await net.json(`${WDQS}?format=json&query=${encodeURIComponent(trNamesQuery(part))}`, { fast: true });
    } catch {
      continue; // bu parça için ağ hatası: önbelleğe yazılmaz, sonra yeniden denenir
    }
    const found = parseTrNames(json);
    for (const id of part) {
      const names = found.get(id) || [];
      out.set(id, names);
      if (cache) await cache.set('tr-names:v1:' + id, { at: now, names }).catch(() => {});
    }
  }
  return out;
}
