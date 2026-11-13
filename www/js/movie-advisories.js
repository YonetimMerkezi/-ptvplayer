// Ücretsiz içerik uyarısı toplayıcısı.
// Resmî KTB işaretleri ile Screenwise aile rehberliği ayrı kaynaklar olarak saklanır.
// Bir kaynağın yanıt vermemesi "uyarı yok" anlamına gelmez.
const KTB = 'https://filmsiniflandirma.ktb.gov.tr';
const SCREENWISE = 'https://screenwiseapp.com';
const TTL_FOUND = 30 * 86400000;
const TTL_EMPTY = 24 * 3600000;
const foldText = (s) => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, ' ').trim();
const warningRules = [
  ['violence', /siddet|korku unsurlar/i, 'Şiddet veya korku'],
  ['sex', /cinsellik|ciplaklik/i, 'Cinsellik veya çıplaklık'],
  ['negative_examples', /olumsuz ornek/i, 'Olumsuz örnek oluşturabilecek davranışlar'],
];
const ageRules = [
  [/18\\s*yas|18\\+/, '18+'], [/16\\s*yas|16\\+/, '16+'], [/13\\s*yas|13\\+/, '13+'],
  [/10\\s*yas|10\\+/, '10+'], [/6\\s*yas|6\\+/, '6+'],
];
function decodeHtml(s) {
  return String(s || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
export function parseKtbClassification(html, title, year = 0) {
  const raw = decodeHtml(String(html || '').replace(/<script[\\s\\S]*?<\\/script>/gi, ' ').replace(/<style[\\s\\S]*?<\\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' '));
  const normalized = foldText(raw);
  const wanted = foldText(title);
  if (!wanted || !normalized) return null;
  const at = normalized.indexOf(wanted);
  if (at < 0) return null;
  const excerpt = normalized.slice(Math.max(0, at - 180), at + wanted.length + 900);
  if (!excerpt.includes(wanted) || !ageRules.some(([re]) => re.test(excerpt)) && !warningRules.some(([, re]) => re.test(excerpt))) return null;
  const warnings = warningRules.filter(([, re]) => re.test(excerpt)).map(([category, , label]) => ({
    category, label, details: label + ' işareti resmî sınıflandırma kaydında yer alıyor.',
    source: 'T.C. Kültür ve Turizm Bakanlığı', url: KTB + '/browse',
  }));
  const age = ageRules.find(([re]) => re.test(excerpt));
  return { ageRating: age ? age[1] : '', warnings, source: 'T.C. Kültür ve Turizm Bakanlığı', url: KTB + '/browse', matchedTitle: title, year: Number(year) || 0 };
}
function asTextList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((x) => typeof x === 'string' ? x : x && (x.text || x.title || x.description)).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
}
export function parseScreenwiseMedia(media, sourceUrl = SCREENWISE) {
  if (!media || typeof media !== 'object') return null;
  const copy = media.wise && media.wise.parentCopy || {};
  const watchFor = asTextList(copy.watchFor);
  const warnings = watchFor.map((details, i) => ({
    category: 'family_guidance_' + (i + 1),
    label: details.length > 72 ? details.slice(0, 69).trimEnd() + '…' : details,
    details, source: 'Screenwise aile rehberi', url: media.url || sourceUrl,
  }));
  return {
    title: media.title || '', url: media.url || sourceUrl,
    wise: media.wise ? {
      overall: Number.isFinite(Number(media.wise.overall)) ? Number(media.wise.overall) : null,
      oneLiner: String(media.wise.oneLiner || copy.verdict || '').trim(),
      ageFit: String(copy.ageFitNote || '').trim(),
    } : null,
    warnings,
  };
}
async function loadScreenwise(net, meta, title, record) {
  const searchUrl = SCREENWISE + '/api/v1/media/search?imdb_id=' + encodeURIComponent(meta.imdbId) + '&type=movie';
  const search = await net.json(searchUrl, { fast: true });
  const candidates = Array.isArray(search && search.results) ? search.results : [];
  const match = candidates.find((x) => x && x.media && x.media.slug && Number(x.matchConfidence) >= 0.75 && (!x.media.type || x.media.type === 'movie'));
  if (!match) {
    record.sources.screenwise = { status: 'no_data', checkedAt: Date.now(), url: SCREENWISE + '/developers' };
    return;
  }
  const media = await net.json(SCREENWISE + '/api/v1/media/' + encodeURIComponent(match.media.slug), { fast: true });
  const parsed = parseScreenwiseMedia(media);
  if (!parsed) {
    record.sources.screenwise = { status: 'no_data', checkedAt: Date.now(), url: SCREENWISE + '/developers' };
    return;
  }
  record.sources.screenwise = { status: 'found', checkedAt: Date.now(), url: parsed.url, matchConfidence: Number(match.matchConfidence), title: parsed.title || title };
  record.warnings.push(...parsed.warnings);
  if (parsed.wise) record.guidance = { source: 'Screenwise', url: parsed.url, score: parsed.wise.overall, summary: parsed.wise.oneLiner, ageFit: parsed.wise.ageFit };
}
export async function loadMovieAdvisories(net, store, meta, item) {
  if (!meta || !/^tt\\d+$/.test(String(meta.imdbId || ''))) return null;
  const key = 'movie-advisory:v2:' + meta.imdbId;
  const cached = await store.cache.get(key).catch(() => null);
  const hasUsefulData = (r) => !!(r && ((r.warnings && r.warnings.length) || (r.ratings && r.ratings.length) || r.guidance));
  const ttl = hasUsefulData(cached) ? TTL_FOUND : TTL_EMPTY;
  if (cached && cached.checkedAt && Date.now() - cached.checkedAt < ttl) return cached;
  const title = String(meta.title || (item && item.name) || '').trim();
  if (!title) return cached || null;
  const record = { imdbId: meta.imdbId, title, year: Number(meta.year) || 0, checkedAt: Date.now(), sources: {}, warnings: [], ratings: [] };
  try {
    const url = KTB + '/browse?search=' + encodeURIComponent(title);
    const html = await net.text(url, { fast: true });
    const found = parseKtbClassification(html, title, meta.year);
    if (found) {
      record.sources.ktb = { status: 'found', checkedAt: record.checkedAt, url: found.url };
      record.warnings.push(...found.warnings);
      if (found.ageRating) record.ratings.push({ value: found.ageRating, source: found.source, country: 'TR' });
    } else record.sources.ktb = {
      status: /sayfa yukleniyor|page loading/i.test(foldText(html)) ? 'unavailable' : 'no_data',
      checkedAt: record.checkedAt, url: KTB + '/browse',
    };
  } catch (e) {
    record.sources.ktb = { status: 'error', message: String(e && e.message || e), checkedAt: Date.now() };
  }
  try { await loadScreenwise(net, meta, title, record); }
  catch (e) { record.sources.screenwise = { status: 'error', message: String(e && e.message || e), checkedAt: Date.now(), url: SCREENWISE + '/developers' }; }
  await store.cache.set(key, record).catch(() => {});
  return record;
}
