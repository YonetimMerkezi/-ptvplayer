// Canlı TV kategori kartlarının görselleri: gerçekçi fotoğraf tarzı arka planlar (www/img/cat/<kimlik>.webp, çevrimdışı çalışır).
// Kategori adından tür çıkarılır; bilinmeyen ad "genel" görselini alır. Görseller yapay zekâ ile üretilmiştir (ticari markasız, kişisiz).
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

const SPECIAL_ART = { __all: 'tumu', __recent: 'son', __cont: 'son', __new: 'tumu', __top: 'genel' };
export const CAT_ART_IDS = [...new Set([...CAT_ART_RULES.map((r) => r[0]), 'genel', 'klasor', ...Object.values(SPECIAL_ART)])];

// c: { id, name, special, folder } → görsel kimliği (www/img/cat/<kimlik>.webp)
export function catArtId(c) {
  if (!c) return 'genel';
  if (c.special && SPECIAL_ART[c.id]) return SPECIAL_ART[c.id];
  if (c.folder) return 'klasor';
  const text = fold(c.name);
  for (const [id, re] of CAT_ART_RULES) if (re.test(text)) return id;
  return 'genel';
}

// Görsel dosyası yoksa resim kalkar, kart yine de çalışır.
export const catArtImg = (id) => `<img class="cat-art" src="img/cat/${id}.webp" alt="" decoding="async" draggable="false" onerror="this.remove()">`;
