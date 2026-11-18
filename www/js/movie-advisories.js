// Ücretsiz içerik uyarısı toplayıcısı.
// Resmî KTB işaretleri ile Screenwise aile rehberliği ayrı kaynaklar olarak saklanır.
// Bir kaynağın yanıt vermemesi "uyarı yok" anlamına gelmez.
const KTB = 'https://filmsiniflandirma.ktb.gov.tr';
const SCREENWISE = 'https://screenwiseapp.com';
const TTL_FOUND = 30 * 86400000;
const TTL_EMPTY = 6 * 3600000; // eşleşmeyen içerikleri alternatif kaynak güncellemeleri için daha sık yeniden tara
const TTL_ERROR = 5 * 60000;   // kaynak hata verdiyse "uyarı yok" diye günlerce saklama; kısa süre sonra yeniden dene
const foldText = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, ' ').trim();
// Önbellek anahtarı: arayüz (app.js) ile toplayıcı aynı anahtarı kullanır.
export function advisoryKey(meta, kind = 'movie') {
  const m = meta || {};
  return 'movie-advisory:v4:' + (kind === 'series' ? 'series:' : '') + (m.imdbId || foldText(m.title) + ':' + (Number(m.year) || 0));
}
const warningRules = [
  ['violence', /siddet|korku unsurlar/i, 'Şiddet veya korku'],
  ['sex', /cinsellik|ciplaklik/i, 'Cinsellik veya çıplaklık'],
  ['negative_examples', /olumsuz ornek/i, 'Olumsuz örnek oluşturabilecek davranışlar'],
];
const ageRules = [
  [/18\s*yas|18\+/, '18+'], [/16\s*yas|16\+/, '16+'], [/13\s*yas|13\+/, '13+'],
  [/10\s*yas|10\+/, '10+'], [/6\s*yas|6\+/, '6+'],
];
function decodeHtml(s) {
  return String(s || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
export function parseKtbClassification(html, title, year = 0) {
  const raw = decodeHtml(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
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

const screenwiseTranslations = [
  [/The \*\*R-rating is earned\*\* through heavy language and the persistent, bone-deep anxiety of the situation\./i, 'R yaş sınıfı; yoğun argo ve filmin yarattığı sürekli, derin gerilimden kaynaklanıyor.'],
  [/Some scenes involving the construction site accident that reveals the bomb are \*\*physically intense\*\* and potentially triggering for those sensitive to workplace gore\./i, 'Bombanın ortaya çıktığı inşaat kazasını içeren bazı sahneler fiziksel açıdan yoğun ve iş kazası görüntülerine hassas izleyiciler için rahatsız edici olabilir.'],
  [/Fuze is a solid, mid-tier thriller that trades in realism rather than spectacle\. It’s the kind of movie that makes you look at every construction pit in the city a little differently\./i, 'Fuze, gösterişten çok gerçekçiliğe dayanan, orta tempolu başarılı bir gerilim filmi. Şehirdeki inşaat alanlarına bundan sonra farklı gözle bakmanıza neden olabilir.'],
  [/If you’re looking for a family movie, keep scrolling\. But if you have a 16-year-old who is into history or high-stakes procedural dramas, this is a sharp, well-acted choice that avoids the typical Hollywood fluff\./i, 'Ailece izlenecek bir film arıyorsanız başka bir seçeneğe yönelin. Ancak tarih veya yüksek riskli operasyon dramalarını seven 16 yaşında bir genç için güçlü oyunculukları olan, nitelikli bir tercih olabilir.'],
  [/This is strictly for the \*\*older teen and adult\*\* crowd\./i, 'Bu film daha büyük yaştaki gençlere ve yetişkinlere yöneliktir.'],
  [/The R-rating isn’t just for show[—-]it’s a/i, 'R yaş sınıfı yalnızca formalite değil; filmde'],
  [/The R-rating isn't just for show[—-]it is a mature, stressful thriller that will likely bore younger viewers\\./i, 'R yaş sınıflandırması, genç izleyicileri sıkabilecek yetişkinlere yönelik ve gerilim dozu yüksek bir filmi işaret ediyor.'],
  [/heavy language/ig, 'yoğun argo ve ağır dil'],
  [/persistent, bone-deep anxiety/ig, 'sürekli ve derin gerilim'],
  [/physically intense/ig, 'fiziksel açıdan yoğun'],
  [/workplace gore/ig, 'iş kazası ve yaralanma görüntüleri'],
  [/construction site accident/ig, 'inşaat alanındaki kaza'],
  [/older teen and adult/ig, 'ileri yaştaki gençler ve yetişkinler'],
  [/mid-tier thriller/ig, 'orta tempolu gerilim filmi'],
  [/family movie/ig, 'ailece izlenecek film'],
];
export function translateScreenwiseText(value) {
  let text = String(value || '').replace(/\\*\\*/g, '').trim();
  for (const [pattern, replacement] of screenwiseTranslations) text = text.replace(pattern, replacement);
  const phrases = [
    [/The R-rating is earned/ig, 'R yaş sınıfının nedeni'],
    [/through heavy language/ig, 'yoğun argo ve küfür kullanımıdır'],
    [/and the persistent, bone-deep anxiety of the situation/ig, 've olayların yarattığı sürekli, derin gerilimdir'],
    [/Some scenes involving/ig, 'Bazı sahneler'],
    [/the construction site accident that reveals the bomb/ig, 'bombanın ortaya çıktığı inşaat kazasını içeren'],
    [/are physically intense/ig, 'fiziksel açıdan yoğun'],
    [/and potentially triggering for those sensitive to workplace gore/ig, 've iş kazası/yaralanma görüntülerine duyarlı izleyiciler için rahatsız edici olabilir'],
    [/Fuze is a solid, mid-tier thriller that trades in realism rather than spectacle/ig, 'Fuze, gösterişten çok gerçekçiliğe odaklanan, orta tempolu bir gerilim filmidir'],
    [/It’s the kind of movie that makes you look at every construction pit in the city a little differently/ig, 'Film, şehirdeki inşaat alanlarına bundan sonra farklı gözle bakmanıza neden olabilir'],
    [/If you’re looking for a family movie, keep scrolling/ig, 'Ailece izlenecek bir film arıyorsanız başka bir seçeneğe yönelin'],
    [/But if you have a 16-year-old who is into history or high-stakes procedural dramas/ig, 'Ancak tarih veya yüksek riskli operasyon dramalarını seven 16 yaşında bir genç için'],
    [/this is a sharp, well-acted choice that avoids the typical Hollywood fluff/ig, 'bu, güçlü oyunculuklara sahip ve klişelerden uzak başarılı bir tercih olabilir'],
    [/This is strictly for the older teen and adult crowd/ig, 'Bu film yalnızca daha büyük yaştaki gençlere ve yetişkinlere yöneliktir'],
    [/The R-rating isn’t just for show/ig, 'R yaş sınıflandırması yalnızca biçimsel bir uyarı değildir'],
    [/mature, stressful thriller/ig, 'yetişkinlere yönelik, stresli bir gerilim filmi'],
    [/will likely bore younger viewers/ig, 'genç yaştaki izleyicileri sıkabilir'],
    [/older teen and adult/ig, 'daha büyük yaştaki gençler ve yetişkinler'],
    [/16-year-old/ig, '16 yaşındaki genç'],
    [/family movie/ig, 'ailece izlenecek film'],
    [/heavy language/ig, 'yoğun argo ve küfür'],
    [/bone-deep anxiety/ig, 'derin kaygı'],
    [/physically intense/ig, 'fiziksel açıdan yoğun'],
    [/workplace gore/ig, 'iş kazası ve yaralanma görüntüleri'],
    [/construction pit/ig, 'inşaat alanı'],
    [/construction site/ig, 'inşaat alanı'],
    [/mid-tier thriller/ig, 'orta tempolu gerilim filmi'],
    [/rather than spectacle/ig, 'gösterişten çok gerçekçiliğe odaklanan'],
    [/procedural dramas/ig, 'operasyon dramaları'],
    [/well-acted/ig, 'başarılı oyunculuklara sahip'],
  ];
  for (const [pattern, translated] of phrases) text = text.replace(pattern, translated);
  return text;
}
export function classifyScreenwiseWarning(value, index = 0) {
  const s = String(value || '').toLowerCase();
  if (/language|profan|swear|heavy language|argo|küfür/.test(s)) return { category: 'language', label: 'Ağır dil ve argo', icon: 'message-circle-warning' };
  if (/violence|gore|blood|injur|physically intense|accident|cyborg|limb|sever|brutal|şiddet|yaralan|kaza/.test(s)) return { category: 'violence', label: 'Şiddet ve yaralanma', icon: 'shield-alert' };
  if (/anxiety|fear|scary|disturb|upset|animal|dog|gerilim|korku|rahatsız|üzebilir/.test(s)) return { category: 'fear', label: 'Korku ve yoğun gerilim', icon: 'brain' };
  if (/sex|sexual|nudity|cinsellik|çıplak/.test(s)) return { category: 'sex', label: 'Cinsellik ve çıplaklık', icon: 'eye-off' };
  if (/drug|alcohol|substance|madde|alkol/.test(s)) return { category: 'drugs', label: 'Alkol ve madde kullanımı', icon: 'flask-conical' };
  if (/discriminat|racis|class inequality|exploitation|sınıf eşitsizliği|sömürü|ayrımcılık|ırkç/.test(s)) return { category: 'social', label: 'Toplumsal temalar', icon: 'users' };
  if (/romance subplot|romance|romantic|romantik/.test(s)) return { category: 'romance', label: 'Romantik içerik', icon: 'heart' };
  if (/cliffhanger|sequel|final|devam fil/i.test(s)) return { category: 'ending', label: 'Final ve devam hikâyesi', icon: 'flag' };
  return { category: 'general', label: 'İçerik uyarısı ' + (index + 1), icon: 'info' };
}

function asTextList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((x) => typeof x === 'string' ? x : x && (x.text || x.title || x.description)).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
}
export function parseScreenwiseMedia(media, sourceUrl = SCREENWISE) {
  if (!media || typeof media !== 'object') return null;
  const copy = media.wise && media.wise.parentCopy || {};
  const watchFor = asTextList(copy.watchFor);
  const warnings = watchFor.map((rawDetails, i) => {
    const kind = classifyScreenwiseWarning(rawDetails, i);
    return { ...kind, details: translateScreenwiseText(rawDetails), originalDetails: rawDetails, source: 'Screenwise aile rehberi', url: media.url || sourceUrl };
  });
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

const translationCache = new Map();
function fallbackTranslate(value) {
  let s = translateScreenwiseText(value);
  const rules = [
    [/Intense violence throughout/ig, 'Film boyunca yoğun şiddet'],
    [/cyborg bodies are torn apart/ig, 'sibernetik bedenler parçalanıyor'],
    [/limbs severed/ig, 'uzuvlar koparılıyor'],
    [/faces crushed/ig, 'yüzler eziliyor'],
    [/minimal blood but maximum brutality/ig, 'kan az olsa da şiddet son derece sert'],
    [/A disturbing scene involving a dog/ig, 'Bir köpeğin yer aldığı rahatsız edici bir sahne'],
    [/may upset animal-loving kids/ig, 'hayvanları seven çocukları üzebilir'],
    [/Dark dystopian themes of class inequality and exploitation/ig, 'Sınıf eşitsizliği ve sömürü üzerine karanlık distopik temalar'],
    [/The romance subplot feels a bit forced and may make teens roll their eyes/ig, 'Romantik yan hikâye biraz zorlama hissettirebilir ve gençlere yapay gelebilir'],
    [/Ends on a cliffhanger that never got resolved/ig, 'Film, devamı gelmeyen ve çözüme kavuşmayan bir finalle sona eriyor'],
    [/sequel unlikely at this point/ig, 'bu aşamada devam filminin gelmesi beklenmiyor'],
    [/violence throughout/ig, 'film boyunca şiddet'],
    [/animal-loving kids/ig, 'hayvanları seven çocuklar'],
    [/class inequality/ig, 'sınıf eşitsizliği'],
    [/exploitation/ig, 'sömürü'],
    [/romance subplot/ig, 'romantik yan hikâye'],
    [/cliffhanger/ig, 'ucu açık final'],
    [/severed/ig, 'koparılmış'],
    [/crushed/ig, 'ezilmiş'],
    [/disturbing scene/ig, 'rahatsız edici sahne'],
    [/Intense violence throughout[—-]?/ig, 'Film boyunca yoğun şiddet: '],
    [/cyborg bodies/ig, 'sibernetik bedenler'],
    [/are torn apart/ig, 'parçalara ayrılıyor'],
    [/limbs severed/ig, 'uzuvlar koparılıyor'],
    [/faces crushed/ig, 'yüzler eziliyor'],
    [/minimal blood but maximum brutality/ig, 'kan az olsa da şiddet son derece sert'],
    [/A disturbing scene involving a dog/ig, 'Bir köpeğin yer aldığı rahatsız edici bir sahne'],
    [/that may upset animal-loving kids/ig, 'hayvanları seven çocukları üzebilir'],
    [/Dark dystopian themes of class inequality and exploitation/ig, 'Sınıf eşitsizliği ve sömürü üzerine karanlık distopik temalar'],
    [/The romance subplot feels a bit forced and may make teens roll their eyes/ig, 'Romantik yan hikâye biraz zorlama hissettirebilir ve gençlere yapay gelebilir'],
    [/Ends on a cliffhanger that never got resolved/ig, 'Film, çözüme kavuşmayan ucu açık bir finalle sona eriyor'],
    [/sequel unlikely at this point/ig, 'bu aşamada devam filminin gelmesi beklenmiyor'],
    [/Intense violence/ig, 'Yoğun şiddet'],
    [/throughout/ig, 'film boyunca'],
    [/cyborg/ig, 'sibernetik'],
    [/bodies/ig, 'bedenler'],
    [/torn apart/ig, 'parçalara ayrılmış'],
    [/limbs/ig, 'uzuvlar'],
    [/faces/ig, 'yüzler'],
    [/brutality/ig, 'acımasızlık'],
    [/A disturbing scene/ig, 'Rahatsız edici bir sahne'],
    [/involving a dog/ig, 'bir köpeğin yer aldığı'],
    [/may upset/ig, 'üzebilir'],
    [/animal-loving kids/ig, 'hayvanları seven çocuklar'],
    [/Dark dystopian themes/ig, 'Karanlık distopik temalar'],
    [/class inequality/ig, 'sınıf eşitsizliği'],
    [/romance subplot/ig, 'romantik yan hikâye'],
    [/feels a bit forced/ig, 'biraz zorlama hissettiriyor'],
    [/may make teens roll their eyes/ig, 'gençlere yapay gelebilir'],
    [/Ends on a cliffhanger/ig, 'Ucu açık bir finalle sona eriyor'],
    [/that never got resolved/ig, 'çözüme kavuşmayan'],
    [/sequel unlikely at this point/ig, 'bu aşamada devam filminin gelmesi beklenmiyor'],

  ];
  for (const [re, tr] of rules) s = s.replace(re, tr);
  return s;
}
export async function translateAdvisoryText(net, value) {
  const original = String(value || '').trim();
  if (!original || !/[a-z]{3}/i.test(original)) return original;
  if (translationCache.has(original)) return translationCache.get(original);
  try {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=' + encodeURIComponent(original.slice(0, 1800));
    const data = await net.json(url, { fast: true });
    const translated = Array.isArray(data) && Array.isArray(data[0])
      ? data[0].map((part) => Array.isArray(part) ? part[0] : '').join('').trim()
      : '';
    if (translated && translated.length > 2) {
      translationCache.set(original, translated);
      return translated;
    }
  } catch (_) { /* çevrimdışı veya servis hatasında yerel sözlük devreye girer */ }
  const translated = fallbackTranslate(original);
  translationCache.set(original, translated);
  return translated;
}

const advisoryTitleScore = (a, b) => {
  const x = foldText(a), y = foldText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const compact = (v) => v.replace(/\\s/g, '');
  const cx = compact(x), cy = compact(y);
  if (cx.length >= 5 && cy.length >= 5 && (cx.includes(cy) || cy.includes(cx))) return Math.min(cx.length, cy.length) / Math.max(cx.length, cy.length);
  const A = new Set(x.split(' ').filter((v) => v.length > 1)), B = new Set(y.split(' ').filter((v) => v.length > 1));
  return A.size && B.size ? [...A].filter((v) => B.has(v)).length / Math.max(A.size, B.size) : 0;
};

async function loadScreenwise(net, meta, title, record, series = false) {
  const wantedType = series ? 'show' : 'movie';
  const typeOk = (t) => !t || (series ? /^(show|series|tv)$/i.test(String(t)) : /^movie$/i.test(String(t)));
  const titles = [...new Set([title, meta && meta.trTitle, meta && meta.originalTitle, meta && meta.original_title,
    meta && meta.originalName, meta && meta.original_name, meta && meta.altTitle]
    .filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()))];
  const year = Number(meta && meta.year) || 0;
  const queries = [];
  if (meta && meta.imdbId) queries.push('imdb_id=' + encodeURIComponent(meta.imdbId));
  for (const candidate of titles) {
    queries.push('q=' + encodeURIComponent(candidate) + (year ? '&year=' + year : ''));
    queries.push('q=' + encodeURIComponent(candidate));
  }
  const tried = new Set();
  let match = null, matchedQuery = '';
  for (const query of queries) {
    if (tried.has(query) || tried.size >= 8) continue;
    tried.add(query);
    const search = await net.json(SCREENWISE + '/api/v1/media/search?' + query + '&type=' + wantedType, { fast: true });
    const candidates = Array.isArray(search && search.results) ? search.results.filter((x) =>
      x && x.media && x.media.slug && typeOk(x.media.type)) : [];
    const ranked = candidates.map((x) => {
      const nameScore = Math.max(0, ...[x.media.title, x.media.name, x.title].filter(Boolean)
        .flatMap((name) => titles.map((wanted) => advisoryTitleScore(name, wanted))));
      return { item: x, confidence: Number(x.matchConfidence) || 0, nameScore };
    }).sort((a, b) => (b.confidence * 0.65 + b.nameScore * 0.35) - (a.confidence * 0.65 + a.nameScore * 0.35));
    const best = ranked[0];
    if (best && (best.confidence >= 0.75 || (best.confidence >= 0.6 && best.nameScore >= 0.85))) {
      match = best.item; matchedQuery = query; break;
    }
  }
  if (!match) {
    record.sources.screenwise = { status: 'no_data', checkedAt: Date.now(), url: SCREENWISE + '/developers', attempts: tried.size };
    return;
  }
  const media = await net.json(SCREENWISE + '/api/v1/media/' + encodeURIComponent(match.media.slug), { fast: true });
  const parsed = parseScreenwiseMedia(media);
  if (!parsed) {
    record.sources.screenwise = { status: 'no_data', checkedAt: Date.now(), url: SCREENWISE + '/developers', attempts: tried.size };
    return;
  }
  record.sources.screenwise = { status: 'found', checkedAt: Date.now(), url: parsed.url, matchConfidence: Number(match.matchConfidence), title: parsed.title || title, matchedQuery };
  for (const warning of parsed.warnings) warning.details = await translateAdvisoryText(net, warning.originalDetails || warning.details);
  record.warnings.push(...parsed.warnings);
  if (parsed.wise) record.guidance = { source: 'Screenwise', url: parsed.url, score: parsed.wise.overall, summary: await translateAdvisoryText(net, parsed.wise.oneLiner), ageFit: await translateAdvisoryText(net, parsed.wise.ageFit) };
  const imdbScore = Number(media && media.externalRatings && media.externalRatings.imdb && media.externalRatings.imdb.score);
  if (Number.isFinite(imdbScore) && imdbScore > 0 && imdbScore <= 10) record.imdbRating = imdbScore.toFixed(1);
}
export async function loadMovieAdvisories(net, store, meta, item, kind = '') {
  if (!meta) return null;
  const series = kind === 'series' || meta.kind === 'series';
  const title = String(meta.title || (item && item.name) || '').trim();
  const year = Number(meta.year) || 0;
  if (!title) return null;
  const key = advisoryKey({ ...meta, title }, series ? 'series' : 'movie');
  const cached = await store.cache.get(key).catch(() => null);
  const hasUsefulData = (r) => !!(r && ((r.warnings && r.warnings.length) || (r.ratings && r.ratings.length) || r.guidance || r.imdbRating));
  const hasError = (r) => !!(r && r.sources && Object.values(r.sources).some((s) => s && s.status === 'error'));
  const ttl = hasError(cached) ? TTL_ERROR : hasUsefulData(cached) ? TTL_FOUND : TTL_EMPTY;
  if (cached && cached.checkedAt && Date.now() - cached.checkedAt < ttl) return cached;
  const record = { imdbId: meta.imdbId || '', title, year, kind: series ? 'series' : 'movie', checkedAt: Date.now(), sources: {}, warnings: [], ratings: [] };
  // KTB film sınıflandırma sitesi yalnız filmleri kapsar; diziler için Screenwise kullanılır.
  if (!series) {
    try {
      const ktbTitles = [...new Set([meta.trTitle, title, meta.originalTitle, meta.original_title, meta.originalName]
        .filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()))];
      let found = null, lastHtml = '', searched = [];
      for (const ktbTitle of ktbTitles.slice(0, 5)) {
        searched.push(ktbTitle);
        const url = KTB + '/browse?search=' + encodeURIComponent(ktbTitle);
        lastHtml = await net.text(url, { fast: true });
        found = parseKtbClassification(lastHtml, ktbTitle, meta.year);
        if (found) break;
      }
      if (found) {
        record.sources.ktb = { status: 'found', checkedAt: record.checkedAt, url: found.url, matchedTitle: found.matchedTitle, searched };
        record.warnings.push(...found.warnings);
        if (found.ageRating) record.ratings.push({ value: found.ageRating, source: found.source, country: 'TR' });
      } else record.sources.ktb = {
        status: /sayfa yukleniyor|page loading/i.test(foldText(lastHtml)) ? 'unavailable' : 'no_data',
        checkedAt: record.checkedAt, url: KTB + '/browse', searched,
      };
    } catch (e) {
      record.sources.ktb = { status: 'error', message: String(e && e.message || e), checkedAt: Date.now() };
    }
  }
  try { await loadScreenwise(net, meta, title, record, series); }
  catch (e) { record.sources.screenwise = { status: 'error', message: String(e && e.message || e), checkedAt: Date.now(), url: SCREENWISE + '/developers' }; }
  await store.cache.set(key, record).catch(() => {});
  return record;
}
