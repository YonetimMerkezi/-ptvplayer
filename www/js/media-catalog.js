// Lisansına uygun hazırlanmış, uygulama içinden aranan ortak katalog katmanı.
// Katalog dosyaları statiktir; özel API/sunucu veya kullanıcı hesabı gerektirmez.
const ROOT = new URL('../data/media-catalog/', import.meta.url);
const MANIFEST_URL = new URL('manifest.json', ROOT).href;
const CACHE_KEY = 'media-catalog:bundle:v1';
const NORMALIZE = (v) => String(v || '').normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, ' ').trim();
let memory = null;
let loading = null;

async function readBundle() {
  if (memory) return memory;
  if (loading) return loading;
  loading = (async () => {
    let data = null;
    try {
      const response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
      if (response.ok) {
        const manifest = await response.json();
        const file = manifest && manifest.file;
        if (file && /^[a-zA-Z0-9._-]+\\.json$/.test(file)) {
          const body = await fetch(new URL(file, ROOT).href, { cache: 'force-cache' });
          if (body.ok) data = await body.json();
        }
      }
    } catch (_) { /* çevrimdışı durumda yerel önbelleğe dön */ }
    if (!data) {
      try { data = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) {}
    }
    memory = data && Array.isArray(data.records) ? data : { version: 0, records: [] };
    if (data && data.records) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (_) {} }
    return memory;
  })().finally(() => { loading = null; });
  return loading;
}

export async function findBundledMedia(title, year = 0, kind = '') {
  const bundle = await readBundle();
  const wanted = NORMALIZE(title);
  if (!wanted) return null;
  const hits = [];
  for (const row of bundle.records) {
    if (!row || (kind && row.kind && row.kind !== kind)) continue;
    if (year && row.year && Number(row.year) !== Number(year)) continue;
    const names = [row.title, row.originalTitle, ...(Array.isArray(row.aliases) ? row.aliases : [])];
    if (names.some((name) => NORMALIZE(name) === wanted)) hits.push(row);
    if (hits.length > 1) return null;
  }
  if (hits.length !== 1) return null;
  const row = hits[0];
  return { imdbId: /^tt\\d+$/.test(String(row.imdbId || '')) ? row.imdbId : '', title: row.title, originalTitle: row.originalTitle || '', aliases: row.aliases || [], year: Number(row.year) || Number(year) || 0, kind: row.kind || kind, advisories: Array.isArray(row.advisories) ? row.advisories : [], advisoryStatus: row.advisoryStatus || 'unknown' };
}

export async function mediaCatalogStatus() {
  const bundle = await readBundle();
  return { version: Number(bundle.version) || 0, updatedAt: bundle.updatedAt || null, count: bundle.records.length };
}
