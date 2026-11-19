// Wikidata SPARQL (query.wikidata.org) istemcisi: tek yerde adres + tanımlayıcı User-Agent (Wikimedia, kimliksiz istekleri kısıtlayabilir).
// Yerelde (Android) başlık gerçekten gönderilir; tarayıcıda fetch User-Agent'ı yok sayar (zararsız).
export const WDQS = 'https://query.wikidata.org/sparql';
export const WIKI_UA = 'IptvPlayerPro/1.0 (https://github.com/YonetimMerkezi/-ptvplayer; Android IPTV oynatici)';

export const sparqlUrl = (query) => `${WDQS}?format=json&query=${encodeURIComponent(query)}`;
export const sparql = (net, query) => net.json(sparqlUrl(query), { fast: true, headers: { 'User-Agent': WIKI_UA, Accept: 'application/sparql-results+json' } });

// SPARQL dizgesi için kaçış ("…" içinde)
export const sparqlStr = (s) => String(s).split('\\').join('\\\\').split('"').join('\\"').replace(/[\r\n]+/g, ' ');

// Satırları ({ ad: { value } }) düz nesnelere çevirir; bozuk yanıt boş liste
export function rowsOf(json) {
  const rows = json && json.results && Array.isArray(json.results.bindings) ? json.results.bindings : [];
  return rows.map((r) => {
    const o = {};
    for (const k of Object.keys(r || {})) o[k] = r[k] && typeof r[k].value === 'string' ? r[k].value : '';
    return o;
  });
}
