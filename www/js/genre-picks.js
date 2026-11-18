// Ana sayfa "Ne izleyeceğine karar veremedin mi?": kullanıcının kendi film listesinden türe göre öneri.
// Tür; sağlayıcı bir `genre` alanı verdiyse ondan, yoksa kategori (group) adından çıkarılır ("Aksiyon Filmleri" → aksiyon).
import { fold } from './util.js';

// id, ad, simge, katlanmış (küçük harf, aksansız) metinde aranan kalıp
export const MOVIE_GENRES = [
  { id: 'aksiyon', label: 'Aksiyon', icon: '💥', re: /aksiyon|action|dovus/ },
  { id: 'komedi', label: 'Komedi', icon: '😂', re: /komedi|comedy|gulmece/ },
  { id: 'dram', label: 'Dram', icon: '🎭', re: /\bdram|drama/ },
  { id: 'korku', label: 'Korku', icon: '👻', re: /korku|horror|dehset/ },
  { id: 'gerilim', label: 'Gerilim', icon: '🔪', re: /gerilim|thriller|suspense|gizem|mystery/ },
  { id: 'bilimkurgu', label: 'Bilim Kurgu', icon: '🚀', re: /bilim ?kurgu|sci ?-?fi|science fiction/ },
  { id: 'animasyon', label: 'Animasyon', icon: '🎨', re: /animasyon|animation|cizgi/ },
  { id: 'aile', label: 'Aile', icon: '👨‍👩‍👧', re: /\baile|family|cocuk|kids/ },
  { id: 'romantik', label: 'Romantik', icon: '💕', re: /romant|romance/ },
  { id: 'macera', label: 'Macera', icon: '🧭', re: /macera|adventure/ },
  { id: 'fantastik', label: 'Fantastik', icon: '🧙', re: /fantastik|fantasy|buyu/ },
  { id: 'suc', label: 'Suç', icon: '🕵️', re: /\bsuc\b|crime|polisiye|mafya/ },
  { id: 'savas', label: 'Savaş & Tarih', icon: '⚔️', re: /savas|\bwar\b|tarih|history|biyografi|biography/ },
  { id: 'belgesel', label: 'Belgesel', icon: '🌍', re: /belgesel|documentary/ },
];
export const SURPRISE_ID = 'sasirt';
export const MIN_GENRE = 4; // bir tür çipi için gereken en az film

const cache = new WeakMap();

// Bir filmin türleri (id listesi). Sonuç öğe nesnesine bağlı saklanır.
export function genresOfMovie(item) {
  if (!item || typeof item !== 'object') return [];
  const hit = cache.get(item);
  if (hit) return hit;
  const text = fold(`${item.genre || ''} ${item.group || ''}`);
  const ids = text.trim() ? MOVIE_GENRES.filter((g) => g.re.test(text)).map((g) => g.id) : [];
  cache.set(item, ids);
  return ids;
}

// En çok filmi olan türler önce; az filmi olan tür çıkmaz. Aynı film (key) birkaç kategoride olsa bir sayılır.
export function genreChips(movies, { key = (it) => it.id, min = MIN_GENRE, max = 8 } = {}) {
  const seen = new Map(MOVIE_GENRES.map((g) => [g.id, new Set()]));
  for (const it of Array.isArray(movies) ? movies : []) {
    if (!it || it.kind !== 'movie') continue;
    const k = key(it);
    for (const id of genresOfMovie(it)) seen.get(id).add(k);
  }
  return MOVIE_GENRES.map((g) => ({ id: g.id, label: g.label, icon: g.icon, n: seen.get(g.id).size }))
    .filter((g) => g.n >= min)
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'tr'))
    .slice(0, Math.max(0, max));
}

// Öneri: izlenmemiş filmler önce (daha önce gösterilmeyenler, sonra gösterilenler), izlenenler en sona.
// Her kademe puanı yüksek olana hafif ağırlık verilerek karıştırılır; aynı çipe tekrar basınca farklı seçim gelir.
// watched(item): izlenmeye başlanmış mı. seen: bu çipte daha önce gösterilen id'ler. rng: 0..1 (testte sabitlenir).
export function pickMovies(movies, genreId, { limit = 10, key = (it) => it.id, watched = () => false, seen = [], rng = Math.random } = {}) {
  const shown = new Set(seen);
  const keys = new Set();
  const pool = [];
  for (const it of Array.isArray(movies) ? movies : []) {
    if (!it || it.kind !== 'movie' || !it.name) continue;
    if (genreId && genreId !== SURPRISE_ID && !genresOfMovie(it).includes(genreId)) continue;
    const k = key(it);
    if (k && keys.has(k)) continue; // aynı film başka kategoride
    if (k) keys.add(k);
    pool.push(it);
  }
  const tier = (it) => (watched(it) ? 2 : shown.has(it.id) ? 1 : 0);
  const weight = (it) => rng() + (Number(it.rating) > 0 ? Math.min(Number(it.rating), 5) / 5 * 0.5 : 0);
  return pool
    .map((it) => ({ it, t: tier(it), w: weight(it) }))
    .sort((a, b) => a.t - b.t || b.w - a.w)
    .slice(0, Math.max(0, limit))
    .map((x) => x.it);
}

export const genreMeta = (id) => MOVIE_GENRES.find((g) => g.id === id) || null;
