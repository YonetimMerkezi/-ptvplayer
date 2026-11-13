// Ücretsiz içerik uyarısı toplayıcısı. Resmî KTB Film Sınıflandırma portalı aranır;
// bulunamayan kayıtlar uyarı varmış gibi yorumlanmaz. Sonuçlar IndexedDB'de cihazda saklanır.
const KTB = 'https://filmsiniflandirma.ktb.gov.tr';
const TTL = 30 * 86400000;
const foldText = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, ' ').trim();
const warningRules = [
  ['violence', /şiddet|siddet|korku unsurlar/i, 'Şiddet veya korku'],
  ['sex', /cinsellik|çıplaklık|ciplaklik/i, 'Cinsellik veya çıplaklık'],
  ['negative_examples', /olumsuz örnek|olumsuz ornek/i, 'Olumsuz örnek oluşturabilecek davranışlar'],
];
const ageRules = [
  [/18\s*yaş|18\+/i, '18+'], [/16\s*yaş|16\+/i, '16+'], [/13\s*yaş|13\+/i, '13+'],
  [/10\s*yaş|10\+/i, '10+'], [/6\s*yaş|6\+/i, '6+'],
];
function decodeHtml(s) {
  return String(s || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
export function parseKtbClassification(html, title, year = 0) {
  const raw = decodeHtml(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  const wanted = foldText(title);
  if (!wanted || !raw) return null;
  const at = foldText(raw).indexOf(wanted);
  if (at < 0) return null;
  // Başlık eşleşmesinin yakınındaki metin kart içeriğidir; sayfanın diğer filmlerini karıştırma.
  const from = Math.max(0, at - 180);
  const excerpt = raw.slice(from, Math.min(raw.length, from + title.length + 900));
  const normalized = foldText(excerpt);
  if (!normalized.includes(wanted)) return null;
  const warnings = warningRules.filter(([, re]) => re.test(excerpt)).map(([category, , label]) => ({
    category, label, details: label + ' işareti resmî sınıflandırma kaydında yer alıyor.',
    source: 'T.C. Kültür ve Turizm Bakanlığı', url: KTB + '/browse',
  }));
  const age = ageRules.find(([re]) => re.test(excerpt));
  return { ageRating: age ? age[1] : '', warnings, source: 'T.C. Kültür ve Turizm Bakanlığı', url: KTB + '/browse', matchedTitle: title, year: Number(year) || 0 };
}
export async function loadMovieAdvisories(net, store, meta, item) {
  if (!meta || !/^tt\d+$/.test(String(meta.imdbId || ''))) return null;
  const key = 'movie-advisory:' + meta.imdbId;
  const cached = await store.cache.get(key).catch(() => null);
  if (cached && cached.checkedAt && Date.now() - cached.checkedAt < TTL) return cached;
  const title = String(meta.title || (item && item.name) || '').trim();
  if (!title) return cached || null;
  const record = {
    imdbId: meta.imdbId, title, year: Number(meta.year) || 0,
    checkedAt: Date.now(), sources: {}, warnings: [], ratings: [],
  };
  try {
    // Portalın herkese açık liste/arama ekranı; kimlik doğrulama veya özel uç nokta kullanılmaz.
    const url = KTB + '/browse?search=' + encodeURIComponent(title);
    const html = await net.text(url, { fast: true });
    const found = parseKtbClassification(html, title, meta.year);
    if (found) {
      record.sources.ktb = { status: 'found', checkedAt: record.checkedAt, url: found.url };
      record.warnings.push(...found.warnings);
      if (found.ageRating) record.ratings.push({ value: found.ageRating, source: found.source, country: 'TR' });
    } else record.sources.ktb = { status: 'no_data', checkedAt: record.checkedAt, url: KTB + '/browse' };
  } catch (e) {
    record.sources.ktb = { status: 'error', message: String(e && e.message || e), checkedAt: record.checkedAt };
  }
  await store.cache.set(key, record).catch(() => {});
  return record;
}
