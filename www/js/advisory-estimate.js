// Tahmini içerik uyarıları: doğrulanmış kaynak (KTB, Screenwise, TMDB tanımlayıcıları) bir yapım için kayıt vermediğinde, eldeki
// tür, özet ve anahtar kelimelerden hangi içeriklerin bulunabileceği çıkarılır. Türkçe ve İngilizce metinle çalışır; sonuç her zaman
// "tahmini" diye gösterilir ve doğrulanmış uyarının yerini tutmaz. Saf mantık: ağ ve saklama yok.

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, ' ').trim();
const LV = { low: 1, moderate: 2, high: 3 };
const NAME = ['', 'low', 'moderate', 'high'];

// [kategori, düzey, tür deseni | null, özet/anahtar kelime deseni | null, gerekçe]
// Desenler katlanmış metne (küçük harf, aksansız, noktalama boşluk) uygulanır; kelime başından eşleşir.
const RULES = [
  ['violence', 'low', /\b(aksiyon|action|macera|adventure|suc|crime|gerilim|thriller|western|vahsi bati|polisiye|mystery|gizem)\b/, null, 'tür'],
  ['violence', 'moderate', /\b(savas|war|war politics)\b/, /\b(cinayet|katil|oldur|olduru|suikast|silahli|silah|catisma|kan dava|intikam|mafya|teror|silahli saldiri|adam kacir|kacirilan|kacirildi|rehine|cete|infaz|murder|kill|killer|assassin|gunfight|shootout|revenge|mafia|gangster|terroris|kidnap|hostage|hitman|massacre)/, 'özet'],
  ['violence', 'high', null, /\b(seri katil|iskence|katliam|vahset|parcala|kanli|soykirim|serial killer|torture|gore|slasher|brutal|dismember|genocide|cannibal|yamyam)/, 'özet'],
  ['fear', 'low', /\b(gerilim|thriller|gizem|mystery)\b/, null, 'tür'],
  ['fear', 'high', /\b(korku|horror)\b/, null, 'tür'],
  ['fear', 'moderate', null, /\b(hayalet|seytan|cin carp|cinler|musallat|lanet|buyu|zombi|vampir|kurt adam|dogaustu|paranormal|ruh cagir|kabus|ghost|demon|haunt|possess|exorcis|zombie|vampire|werewolf|supernatural|curse|nightmare|monster|canavar)/, 'özet'],
  ['sex', 'moderate', null, /\b(cinsel iliski|cinsellik|seks|erotik|fahise|genelev|sexual|sex|erotic|prostitut|brothel)/, 'özet'],
  ['sex', 'high', /\b(erotik|erotic)\b/, null, 'tür'],
  ['nudity', 'moderate', null, /\b(ciplak|striptiz|nudity|nude|naked|striptease|stripper)/, 'özet'],
  ['sexual_violence', 'high', null, /\b(tecavuz|cinsel saldiri|cinsel istismar|taciz|istismar|rape|sexual assault|sexual abuse|molest|harass)/, 'özet'],
  ['drugs', 'moderate', null, /\b(uyusturucu|eroin|kokain|esrar|madde bagimli|alkolik|torbaci|drug|heroin|cocaine|meth|addict|alcoholi|narco|cartel|kartel|overdose)/, 'özet'],
  ['self_harm', 'high', null, /\b(intihar|kendini oldur|canina kiy|kendine zarar|suicid|self harm)/, 'özet'],
  ['language', 'low', null, /\b(kufur|argo|profanity|strong language|vulgar)/, 'özet'],
  ['negative_examples', 'low', null, /\b(kumar|hirsiz|soygun|dolandir|sahtekar|yolsuzluk|gambl|heist|robbery|thief|theft|fraud|con artist|scam)/, 'özet'],
];

export const ESTIMATE_LABEL = {
  violence: 'Şiddet', fear: 'Korku ve gerilim', sex: 'Cinsellik', nudity: 'Çıplaklık', sexual_violence: 'Cinsel şiddet', drugs: 'Alkol / madde',
  self_harm: 'Kendine zarar', language: 'Ağır dil', negative_examples: 'Olumsuz örnek',
};
export const ESTIMATE_ICON = {
  violence: 'shield-alert', fear: 'brain', sex: 'eye-off', nudity: 'eye-off', sexual_violence: 'alert-triangle', drugs: 'flask-conical',
  self_harm: 'heart-crack', language: 'message-circle-warning', negative_examples: 'alert-triangle',
};

// genres: tür adları (dizi ya da "Dram, Suç" gibi metin); plot: özet; keywords: anahtar kelimeler (TMDB, İngilizce).
// Dönen: [{ category, level: 'low' | 'moderate' | 'high', from: ['tür', 'özet', 'anahtar kelime'] }], düzeyi yüksek olan önce.
export function estimateAdvisories({ genres = [], plot = '', keywords = [] } = {}) {
  const g = ' ' + fold(Array.isArray(genres) ? genres.join(' , ') : genres) + ' ';
  const p = ' ' + fold(plot) + ' ';
  const k = ' ' + fold((Array.isArray(keywords) ? keywords : []).join(' , ')) + ' ';
  const out = new Map();
  const hit = (cat, level, from) => {
    const cur = out.get(cat) || { category: cat, lv: 0, from: [] };
    cur.lv = Math.max(cur.lv, LV[level]);
    if (!cur.from.includes(from)) cur.from.push(from);
    out.set(cat, cur);
  };
  for (const [cat, level, genreRe, textRe] of RULES) {
    if (genreRe && genreRe.test(g)) hit(cat, level, 'tür');
    if (textRe && textRe.test(p)) hit(cat, level, 'özet');
    if (textRe && textRe.test(k)) hit(cat, level, 'anahtar kelime');
  }
  // Çocuk/aile yapımı: türden gelen "düşük şiddet/gerilim" tahmini anlamsızdır; yalnız özet ya da anahtar kelimeden gelen kalır.
  if (/\b(cocuk|aile|family|kids|animasyon|animation)\b/.test(g)) {
    for (const [cat, v] of out) if (v.lv === 1 && v.from.length === 1 && v.from[0] === 'tür') out.delete(cat);
  }
  return [...out.values()].sort((a, b) => b.lv - a.lv).map((v) => ({ category: v.category, level: NAME[v.lv], from: v.from }));
}
