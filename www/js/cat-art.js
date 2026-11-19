// Canlı TV, Film ve Dizi kategori kartlarının görselleri: gerçekçi fotoğraf tarzı arka planlar (www/img/cat/<kimlik>.webp, çevrimdışı çalışır).
// Kategori adından tür çıkarılır; bilinmeyen ad Canlı TV'de "genel", Film'de "sinema", Dizi'de "dizi" görselini alır. Görseller yapay zekâ ile üretilmiştir (ticari markasız, kişisiz).
import { fold } from './util.js';

// Sıra önemlidir: ilk eşleşen kazanır ("Çocuk Filmleri" → çocuk, "Spor Haber" → spor). Metin fold() ile küçük harf ve aksansızdır.
export const CAT_ART_RULES = [
  ['dini', /\bdini\b|islam|kuran|ilahi|diyanet|\bdin\b|cami/],
  ['cocuk', /cocuk|kids|cizgi|cartoon|bebek|junior|animasyon/],
  ['spor', /spor|sport|futbol|football|soccer|basket|\bnba\b|\bnfl\b|tenis|golf|\blig\b|bein|dazn/],
  ['haber', /haber|news|gundem|ekonomi|finans|bloomberg|\bcnn\b/],
  ['muzik', /muzik|music|radyo|radio|klip|\bmtv\b|konser|sarki/],
  ['belgesel', /belgesel|documentar|\bdoga\b|nature|bilim|discovery|history|tarih|\bwild|\bgeo/],
  ['sinema', /sinema|cinema|film|movie|vizyon|box ?office/],
  ['dizi', /dizi|series|drama|novela|sezon|season/],
  ['uhd', /\b4k\b|uhd|hevc|\bfhd\b|ultra|h\.?265|\bhd\b/],
  ['eglence', /eglence|yar.sma|\bshow\b|komedi|mizah|entertain|reality|\btalk\b/],
  ['ulke', /almanya|german|deutsch|ingiliz|english|\buk\b|\busa\b|amerika|fransa|french|\bital|ispanya|spain|arap|arab|\brus|azerbaycan|balkan|yabanci|foreign|international|world|avrupa|europe|kurt|kurd|persian|iran|\bhint|india|afrika|latin/],
  ['ulusal', /ulusal|national|yerel|local|turk|\btr\b|\btrt\b|genel/],
];

// Film ve Dizi kategorileri: önce tür (aksiyon, komedi, korku…), bulunamazsa ülke, o da yoksa film/dizi genel görseli.
// Aynı sıra kuralı geçerli ("TR | AKSİYON" → aksiyon, "Türk Dizileri" → yerli). "bilim kurgu" belgeselden, "tarih" belgeselden ayrı ele alınır.
export const MOVIE_ART_RULES = [
  ['animasyon', /animasyon|anime|animation|cizgi/],
  ['cocuk', /cocuk|kids|aile|family|cartoon|junior|bebek/],
  ['bilimkurgu', /bilim ?kurgu|sci ?-?fi|science fiction|uzay|\bsf\b/],
  ['belgesel', /belgesel|documentar|\bdoga\b|nature|discovery|biyografi|biography/],
  ['muzik', /muzik|music|konser/],
  ['aksiyon', /aksiyon|action|dovus|martial/],
  ['macera', /macera|adventure/],
  ['komedi', /komedi|comedy|mizah|gulmece/],
  ['korku', /korku|horror|dehset|paranormal|zombi|cadi/],
  ['romantik', /romantik|romance|\bask\b|\baski\b|\blove\b/],
  ['gerilim', /gerilim|thriller|\bsuc\b|crime|polisiye|dedektif|gizem|mystery|casus|\bspy\b/],
  ['savas', /savas|\bwar\b|tarih|history|historical|western|vahsi bati|epik|\bepic\b/],
  ['fantastik', /fantastik|fantasy|buyu|efsane|supernatural/],
  ['dram', /dram|drama|duygusal/],
  ['uhd', /\b4k\b|uhd|hevc|ultra|h\.?265/],
  ['__genel', /dublaj|altyazi|subtitle|dubbed/],
  ['yerli', /yerli|turk|\btr\b|yesilcam|\blocal\b/],
];

const SPECIAL_ART = { __all: 'tumu', __recent: 'son', __cont: 'son', __new: 'tumu', __top: 'genel' };
export const CAT_ART_IDS = [...new Set([...CAT_ART_RULES.map((r) => r[0]), ...MOVIE_ART_RULES.map((r) => r[0]).filter((id) => id !== '__genel'), 'genel', 'klasor', ...Object.values(SPECIAL_ART)])];
const KIND_ART = { live: 'genel', movie: 'sinema', series: 'dizi' };
const COUNTRY_RE = CAT_ART_RULES.find((r) => r[0] === 'ulke')[1];

// c: { id, name, special, folder }, kind: 'live' | 'movie' | 'series' → görsel kimliği (www/img/cat/<kimlik>.webp)
export function catArtId(c, kind = 'live') {
  const fallback = KIND_ART[kind] || 'genel';
  if (!c) return fallback;
  if (c.special && SPECIAL_ART[c.id]) return SPECIAL_ART[c.id];
  if (c.folder) return 'klasor';
  const text = fold(c.name);
  if (kind === 'movie' || kind === 'series') {
    for (const [id, re] of MOVIE_ART_RULES) if (re.test(text)) return id === '__genel' ? fallback : id;
    return COUNTRY_RE.test(text) ? 'ulke' : fallback;
  }
  for (const [id, re] of CAT_ART_RULES) if (re.test(text)) return id;
  return fallback;
}

// Görsel dosyası yoksa resim kalkar, kart yine de çalışır.
export const catArtImg = (id) => `<img class="cat-art" src="img/cat/${id}.webp" alt="" decoding="async" draggable="false" onerror="this.remove()">`;
