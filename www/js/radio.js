// Radyo & Müzik: radio-browser.info (topluluk dizini; ücretsiz, anahtarsız) internet radyoları.
// Sunucu listesi DNS ile alınır; WebView'da DNS sorgusu olmadığından bilinen yansılar sırayla denenir.
// Kural: her istekte "uygulamaadı/sürüm" biçiminde User-Agent gider (yerel ağ katmanı iletir). Yayın başlayınca tık sayacı çağrılır (24 saatte bir sayılır).
import { fold } from './util.js';

export const RADIO_MIRRORS = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];
export const RADIO_TTL = 24 * 3600000;
export const RADIO_FAV_KEY = 'radio.favs';
export const RADIO_COUNTRY_KEY = 'radio.country';
export const RADIO_FAV_MAX = 300;
export const RADIO_COUNTRIES = [['TR', 'Türkiye'], ['DE', 'Almanya'], ['NL', 'Hollanda'], ['FR', 'Fransa'], ['GB', 'Birleşik Krallık'], ['AT', 'Avusturya'], ['BE', 'Belçika'], ['CH', 'İsviçre'], ['US', 'ABD'], ['AZ', 'Azerbaycan']];

// Tür çipleri: etiket ya da addan eşleşir (tr-duyarsız). Sıra, çipin gösterim sırasıdır.
export const RADIO_GENRES = [
  { id: 'pop', label: 'Pop', re: /\bpop\b|top ?40|hit(s|ler)?\b/ },
  { id: 'turku', label: 'Türkü & Halk', re: /turku|halk|folk|saz|yoresel/ },
  { id: 'arabesk', label: 'Arabesk', re: /arabesk|fantazi/ },
  { id: 'slow', label: 'Slow & Romantik', re: /slow|romantik|romantic|ask\b/ },
  { id: 'nostalji', label: 'Nostalji', re: /nostalji|oldies|retro|\b(70|80|90)'?s\b|eski/ },
  { id: 'rock', label: 'Rock', re: /rock|metal|punk|alternatif|alternative/ },
  { id: 'rap', label: 'Rap & Hip-Hop', re: /\brap\b|hip.?hop|r&b|rnb/ },
  { id: 'dans', label: 'Dans & Elektronik', re: /dance|\bdans\b|electro|elektronik|house|edm|techno|trance|deep|chill/ },
  { id: 'klasik', label: 'Klasik & Sanat', re: /klasik|classical|sanat muzigi|tsm|tmh|opera/ },
  { id: 'caz', label: 'Caz', re: /jazz|\bcaz\b|blues|soul/ },
  { id: 'dini', label: 'Dini', re: /dini|ilahi|kuran|quran|islam|religio|semerkand|kuran/ },
  { id: 'haber', label: 'Haber & Konuşma', re: /haber|news|talk|konusma|gundem/ },
  { id: 'spor', label: 'Spor', re: /spor\b|sport/ },
  { id: 'cocuk', label: 'Çocuk', re: /cocuk|kids|children|masal/ },
  { id: 'yabanci', label: 'Yabancı', re: /yabanci|foreign|international|english|latin|k-?pop/ },
];
export const RADIO_MIN_GENRE = 3; // bundan az istasyonu olan tür çipi gösterilmez (boş sayfaya düşülmesin)

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const httpUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');
const tagsOf = (raw) => clean(raw).split(',').map((t) => clean(t)).filter(Boolean);

// Dizin kaydı → küçük, saklanabilir istasyon. Çalışmayan (son denetimi başarısız) ya da adresi olmayan kayıt null döner.
export function normalizeStation(raw, country = '') {
  if (!raw || typeof raw !== 'object') return null;
  const url = httpUrl(raw.url_resolved) || httpUrl(raw.url);
  const uuid = clean(raw.stationuuid);
  const name = clean(raw.name).replace(/^(rd|radyo)\s*:\s*/i, '');
  if (!url || !uuid || !name) return null;
  if (raw.lastcheckok !== undefined && Number(raw.lastcheckok) === 0) return null;
  const icon = httpUrl(raw.favicon);
  return {
    id: 'rb:' + uuid,
    name,
    logo: icon && !/^http:\/\//i.test(icon) ? icon : '', // düz http logo https sayfada engellenir; logo yoksa baş harfli kapak çizilir
    url,
    tags: tagsOf(raw.tags).slice(0, 5),
    country: clean(raw.countrycode || country).toUpperCase(),
    codec: clean(raw.codec).toUpperCase(),
    bitrate: Number(raw.bitrate) > 0 ? Number(raw.bitrate) : 0,
    votes: Number(raw.votes) || 0,
    clicks: Number(raw.clickcount) || 0,
  };
}

// Aynı adı taşıyanlardan en çok dinleneni kalır; en çok dinlenen başta.
export function normalizeStations(list, country = '') {
  const best = new Map();
  for (const raw of Array.isArray(list) ? list : []) {
    const st = normalizeStation(raw, country);
    if (!st) continue;
    const key = fold(st.name);
    const old = best.get(key);
    if (!old || st.clicks > old.clicks) best.set(key, st);
  }
  return [...best.values()].sort((a, b) => b.clicks - a.clicks || b.votes - a.votes || fold(a.name).localeCompare(fold(b.name)));
}

const haystack = (st) => fold([st.name, ...(st.tags || [])].join(' | '));
export const genresOf = (st) => RADIO_GENRES.filter((g) => g.re.test(haystack(st))).map((g) => g.id);

// Tür çipleri: yalnız yeterli istasyonu olanlar, istasyon sayısıyla.
export function genreChips(list) {
  const count = new Map();
  for (const st of Array.isArray(list) ? list : []) for (const id of genresOf(st)) count.set(id, (count.get(id) || 0) + 1);
  return RADIO_GENRES.filter((g) => (count.get(g.id) || 0) >= RADIO_MIN_GENRE).map((g) => ({ id: g.id, label: g.label, n: count.get(g.id) }));
}

export function filterStations(list, { genre = '', query = '' } = {}) {
  const q = fold(query);
  return (Array.isArray(list) ? list : []).filter((st) => (!genre || genresOf(st).includes(genre)) && (!q || haystack(st).includes(q)));
}

// Oynatıcı öğesi: canlı yayın gibi davranır (arama çubuğu yok), ses modunda (kapak + arka plan) açılır.
export function radioItem(st) {
  const sub = [(st.tags || []).slice(0, 2).join(' · '), st.bitrate ? `${st.codec || ''} ${st.bitrate} kbps`.trim() : ''].filter(Boolean).join(' · ');
  return { id: st.id, kind: 'live', radio: true, audio: true, name: st.name, logo: st.logo || '', url: st.url, artist: sub, tags: st.tags || [], country: st.country || '' };
}
export const isRadioItem = (it) => !!(it && it.radio);

// Başlık değeri yalnız ASCII olabilir ("geliştirme" gibi bir sürüm adı fetch'i patlatırdı).
const agent = (version) => 'IptvPlayerPro/' + (String(version || '1').replace(/[^\x21-\x7e]/g, '') || '1');

const cacheKey = (cc) => 'radio:' + String(cc || 'TR').toUpperCase();
const searchUrl = (base, cc) => `${base}/json/stations/search?countrycode=${encodeURIComponent(cc)}&hidebroken=true&order=clickcount&reverse=true&limit=600`;

// Liste: 24 saat önbellekten; süresi dolunca ya da zorlanınca yansılardan çekilir. Ağ yoksa eski önbellek kullanılır.
export async function loadStations({ net, cache, country = 'TR', version = '1', now = Date.now(), force = false, mirrors = RADIO_MIRRORS }) {
  const cc = String(country || 'TR').toUpperCase();
  const key = cacheKey(cc);
  const hit = cache ? await cache.get(key).catch(() => null) : null;
  const fresh = hit && Array.isArray(hit.items) && hit.items.length && now - Number(hit.at || 0) < RADIO_TTL;
  if (fresh && !force) return { items: hit.items, at: hit.at, stale: false };
  const headers = { 'User-Agent': agent(version) };
  let lastErr = null;
  for (const base of mirrors) {
    try {
      const raw = await net.json(searchUrl(base, cc), { headers, fast: true });
      const items = normalizeStations(raw, cc);
      if (!items.length) throw new Error('Radyo listesi boş geldi');
      if (cache) await cache.set(key, { at: now, items }).catch(() => {});
      return { items, at: now, stale: false };
    } catch (e) {
      lastErr = e;
    }
  }
  if (hit && Array.isArray(hit.items) && hit.items.length) return { items: hit.items, at: hit.at, stale: true };
  throw lastErr || new Error('Radyo listesi alınamadı');
}

// Yayın başlayınca dizine "dinlendi" bildirimi (sıralamayı besler). Başarısızlık sessizdir.
export function countClick({ net, id, version = '1', mirrors = RADIO_MIRRORS }) {
  const uuid = String(id || '').replace(/^rb:/, '');
  if (!uuid || !mirrors.length) return Promise.resolve(false);
  return net.text(`${mirrors[0]}/json/url/${encodeURIComponent(uuid)}`, { headers: { 'User-Agent': agent(version) }, fast: true }).then(() => true, () => false);
}

// ---- favoriler: tam istasyon kaydı saklanır (adres dahil), böylece ağ yokken de açılır
export const radioFavs = (store) => {
  const v = store.pref(RADIO_FAV_KEY, []);
  return Array.isArray(v) ? v.filter((x) => x && x.id && x.url) : [];
};
export const isRadioFav = (store, id) => radioFavs(store).some((f) => f.id === id);
export function toggleRadioFav(store, st) {
  const list = radioFavs(store);
  const i = list.findIndex((f) => f.id === st.id);
  if (i >= 0) list.splice(i, 1);
  else list.unshift({ id: st.id, name: st.name, logo: st.logo || '', url: st.url, tags: st.tags || [], country: st.country || '', codec: st.codec || '', bitrate: st.bitrate || 0, votes: st.votes || 0, clicks: st.clicks || 0 });
  store.setPref(RADIO_FAV_KEY, list.slice(0, RADIO_FAV_MAX));
  return i < 0;
}
