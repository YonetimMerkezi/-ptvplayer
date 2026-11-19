// Oyuncu / yönetmen fotoğrafları. Cinemeta kişi fotoğrafı vermez (yalnız adlar); fotoğraf Wikidata'dan (P18 → Wikimedia Commons) bulunur:
//  1) yapımın IMDb kimliğinden oyuncu kadrosu (P161) ve yönetmenler (P57) — en doğru eşleşme, tek istek;
//  2) hâlâ fotoğrafı olmayan adlar için ada göre (oyuncu / yönetmen mesleği olan insanlar, en çok bağlantılı olan seçilir) — tek istek.
// Sonuçlar kişi başına önbelleğe yazılır (bulunamayan kısa süre). Ağ hatasında sessizce boş döner, önbelleğe yazılmaz.
import { sparql, sparqlStr, rowsOf } from './wdqs.js';
import { fold } from './util.js';

export const PHOTO_TTL = 30 * 86400000;
export const PHOTO_MISS_TTL = 3 * 86400000;
export const MAX_NAMES = 30;
const IMDB_ID = /^tt\d+$/;
const ACTOR = 'wd:Q33999'; // oyuncu (alt meslekleri dahil: film/dizi/ses oyuncusu)
const DIRECTOR = 'wd:Q2526255'; // film yönetmeni

// "Robert Downey Jr." ile "Robert Downey Jr" aynı anahtar
export const nameKey = (s) => fold(String(s || '')).replace(/[^a-z0-9]+/g, ' ').trim();

// Commons dosya adresi → https küçük resim (genişlik 240); başka bir adres kabul edilmez
export function commonsThumb(url) {
  const u = String(url || '').trim();
  const m = /^https?:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/([^?#]+)/i.exec(u);
  return m ? `https://commons.wikimedia.org/wiki/Special:FilePath/${m[1]}?width=240` : '';
}

export function filmCastQuery(imdbId) {
  return `SELECT ?name ?img WHERE { ?film wdt:P345 "${sparqlStr(imdbId)}" . { ?film wdt:P161 ?p } UNION { ?film wdt:P57 ?p } ?p wdt:P18 ?img . ?p rdfs:label ?name . FILTER(LANG(?name) = "en") }`;
}

export function byNameQuery(names) {
  const values = names.map((n) => `"${sparqlStr(n)}"@en`).join(' ');
  return `SELECT ?name ?img ?sl WHERE { VALUES ?name { ${values} } ?p rdfs:label ?name . ?p wdt:P31 wd:Q5 . ?p wdt:P18 ?img . ?p wikibase:sitelinks ?sl . ?p wdt:P106 ?occ . ?occ wdt:P279* ?root . VALUES ?root { ${ACTOR} ${DIRECTOR} } } ORDER BY DESC(?sl)`;
}

// Sonuç satırları → Map(nameKey → fotoğraf adresi); aynı ad için ilk (SPARQL sırası: bağlantısı en çok olan) kalır
export function parsePhotos(json) {
  const out = new Map();
  for (const r of rowsOf(json)) {
    const url = commonsThumb(r.img);
    const k = nameKey(r.name);
    if (url && k && !out.has(k)) out.set(k, url);
  }
  return out;
}

// names: görünen adlar. Dönen Map: nameKey(ad) → https fotoğraf adresi (yalnız bulunanlar)
export async function loadPersonPhotos({ net, cache = null, names, imdbId = '', now = Date.now() }) {
  const uniq = [...new Map((Array.isArray(names) ? names : []).filter((n) => typeof n === 'string' && n.trim()).map((n) => [nameKey(n), n.trim()])).entries()].slice(0, MAX_NAMES);
  const out = new Map();
  let need = [];
  for (const [k, n] of uniq) {
    const hit = cache ? await cache.get('person-photo:v1:' + k).catch(() => null) : null;
    if (hit && typeof hit.at === 'number' && typeof hit.url === 'string' && now - hit.at < (hit.url ? PHOTO_TTL : PHOTO_MISS_TTL)) {
      if (hit.url) out.set(k, hit.url);
    } else need.push([k, n]);
  }
  if (!need.length) return out;
  const found = new Map();
  let failed = false;
  if (IMDB_ID.test(imdbId || '')) {
    try {
      for (const [k, u] of parsePhotos(await sparql(net, filmCastQuery(imdbId)))) found.set(k, u);
    } catch { failed = true; }
  }
  const rest = need.filter(([k]) => !found.has(k));
  if (rest.length) {
    try {
      for (const [k, u] of parsePhotos(await sparql(net, byNameQuery(rest.map(([, n]) => n))))) found.set(k, u);
    } catch { failed = true; }
  }
  for (const [k, n] of need) {
    const url = found.get(k) || '';
    if (url) out.set(k, url);
    // ağ hatası olduysa "yok" diye önbelleğe yazılmaz (sonra yeniden denenir); bulunan her zaman yazılır
    if (cache && (url || !failed)) await cache.set('person-photo:v1:' + k, { at: now, url }).catch(() => {});
  }
  return out;
}
