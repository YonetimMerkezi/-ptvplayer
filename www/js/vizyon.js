// Vizyondaki filmler: Türkiye sinemalarında şu an gösterilen filmler, yerel sinema sitelerinin "vizyonda" listelerinden alınır ve tek listede birleşir.
// Kaynaklar (öncelik sırasıyla): Beyazperde (sinema sayısına göre sıralı, en eksiksiz; sayfalı), Paribu Cineverse (yalnız "Vizyonda" sekmesi), Biletinial.
// Ağ isteği dışarıdan verilir (net.text). Bir kaynak alınamazsa diğerleri yine kullanılır; hepsi alınamazsa eski önbellek, o da yoksa fallback() (Cinemeta kataloğu).
import { fold, decodeEntities } from './util.js';

export const VIZYON_TTL = 6 * 3600000;
export const VIZYON_MAX = 120;
export const VIZYON_MIN = 5; // bundan az film gelirse liste "alınamadı" sayılır (bozuk sayfa)
export const BEYAZPERDE_URL = 'https://www.beyazperde.com/filmler/vizyondakiler/sinema-sayisi/';
export const BEYAZPERDE_PAGES = 6; // sayfa sayısı sayfadaki bağlantılardan okunur; okunamazsa en çok bu kadar sayfa denenir
export const PARIBU_URL = 'https://www.paribucineverse.com/vizyondakiler';
export const BILETINIAL_URL = 'https://www.biletinial.com/tr-tr/sinema';

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36', 'Accept-Language': 'tr-TR,tr;q=0.9' };
const MONTHS = { ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6, temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12 };

// ---- HTML yardımcıları (kaynak sayfaların işaretlemesi değişse de çalışsın diye yalnız sıra ve bağlantı/görsel desenlerine dayanır) ----
const IMG_URL = /(?:https?:)?\/\/[^\s"'<>()]+?\.(?:jpe?g|png|webp)(?:\?[^\s"'<>()]*)?/i;
const attr = (tag, name) => {
  const m = new RegExp('(?<![\\w-])' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i').exec(tag);
  return m ? decodeEntities(m[1] !== undefined ? m[1] : m[2]).trim() : '';
};
const imgSrc = (tag) => {
  for (const n of ['data-src', 'data-original', 'data-lazy-src', 'src']) {
    const v = attr(tag, n);
    if (v && !/^data:/i.test(v)) return v;
  }
  const ss = attr(tag, 'srcset') || attr(tag, 'data-srcset');
  const first = ss.split(',')[0].trim().split(/\s+/)[0];
  if (first && !/^data:/i.test(first)) return first;
  const any = IMG_URL.exec(String(tag).replace(/^<img\b/i, '').replace(/(?<![\w-])alt\s*=\s*(?:"[^"]*"|'[^']*')/i, '')); // tembel yükleme başka bir öznitelikteyse (alt metni hariç) etikette geçen görsel adresi
  return any ? decodeEntities(any[0]) : '';
};
const textOf = (html) => decodeEntities(String(html || '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const absUrl = (u, origin) => {
  const s = String(u || '').trim();
  if (/^https:\/\//i.test(s)) return s;
  if (/^http:\/\//i.test(s)) return 'https://' + s.slice(7);
  if (s.startsWith('//')) return 'https:' + s;
  return s.startsWith('/') ? origin + s : '';
};
const cleanName = (s) => String(s || '').replace(/\s*(posteri|afişi|afisi)\s*$/i, '').replace(/\s+/g, ' ').trim();
const wordKey = (s) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim();

function dateOf(segment) {
  const m = /(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+((?:19|20)\d{2})/i.exec(String(segment || ''));
  if (!m) return { year: 0, date: '' };
  const mo = MONTHS[fold(m[2])];
  return { year: Number(m[3]), date: `${m[3]}-${String(mo).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}` };
}

// ---- Beyazperde ----
// Kart: görsel (alt = "<ad> posteri"), başlık bağlantısı (/filmler/film-<kimlik>/), tarih satırı ("13 Kasım 2026 | 1s 21dk | Animasyon").
// "Seanslar!" bağlantısı (/filmler/film-<kimlik>/seanslar/) ve oyuncu bağlantıları başlık sayılmaz.
// Sayfa başındaki arama önerileri de film sayfasına bağlantıdır ("Dijital Esaret", "Indiana Jones 5"…) ama kart değildir: kartın başlığından hemen önce "… posteri" görseli yoksa film sayılmaz.
export function parseBeyazperde(html) {
  const s = String(html || '');
  const imgs = [];
  for (const m of s.matchAll(/<img\b[^>]*>/gi)) {
    const rawAlt = attr(m[0], 'alt');
    if (!/posteri\s*$/i.test(rawAlt)) continue; // yalnız film kartı afişleri
    imgs.push({ at: m.index, src: absUrl(imgSrc(m[0]), 'https://www.beyazperde.com'), alt: cleanName(rawAlt) });
  }
  const links = [];
  for (const m of s.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']*\/filmler\/film-(\d+)\/?)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (/<img\b/i.test(m[3])) continue;
    const title = textOf(m[3]);
    if (title.length >= 2) links.push({ id: m[2], at: m.index, end: m.index + m[0].length, title });
  }
  const out = [];
  const seen = new Set();
  let prev = 0;
  links.forEach((l, i) => {
    if (seen.has(l.id)) return;
    const key = wordKey(l.title);
    const win = imgs.filter((x) => x.at >= prev && x.at < l.at); // önceki kartın başlığından bu başlığa kadar olan afişler
    const card = win.find((x) => wordKey(x.alt) === key) || win[win.length - 1];
    if (!card) return; // afişi yok: üst menü / arama önerisi / kenar çubuğu bağlantısı
    seen.add(l.id);
    const next = links.slice(i + 1).find((x) => !seen.has(x.id));
    const seg = s.slice(l.end, Math.min(next ? next.at : s.length, l.end + 1500));
    const d = dateOf(textOf(seg));
    out.push({ title: l.title, year: d.year, date: d.date, poster: card.src });
    prev = l.end;
  });
  return out;
}

// Sayfadaki "?page=N" bağlantılarından en büyük sayfa numarası (yoksa 1)
export function lastPage(html) {
  let max = 1;
  for (const m of String(html || '').matchAll(/[?&;]page=(\d{1,3})/gi)) max = Math.max(max, Number(m[1]));
  return max;
}

// ---- Paribu Cineverse ----
// "Vizyonda" kartı: afiş (cdn-web.marsgate.tr), başlık (başlık etiketi), "İncele" bağlantısı (/<tür>-filmleri/<ad>-filmi-izle). "Yakında" sekmesindekilerin afişi yoktur: alınmaz.
export function parseParibu(html) {
  const s = String(html || '');
  const posters = [];
  for (const m of s.matchAll(/<img\b[^>]*>/gi)) {
    const src = imgSrc(m[0]);
    if (/marsgate\.tr/i.test(src) && /(movie_posters|\/poster\/)/i.test(src)) posters.push({ at: m.index, src, alt: cleanName(attr(m[0], 'alt')), title: attr(m[0], 'title') });
  }
  const out = [];
  const seen = new Set();
  posters.forEach((p, i) => {
    const end = i + 1 < posters.length ? posters[i + 1].at : Math.min(s.length, p.at + 3000);
    const seg = s.slice(p.at, end);
    const head = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(seg);
    const link = /href\s*=\s*["']([^"']*-filmi-izle[^"']*)["']/i.exec(seg);
    const generic = (t) => !t || /^(poster|afiş|afis|film)$/i.test(t);
    const title = textOf(head ? head[1] : '') || (generic(p.alt) ? '' : p.alt) || (generic(p.title) ? '' : p.title);
    const key = wordKey(title);
    if (!title || !key || seen.has(key)) return;
    seen.add(key);
    out.push({ title, year: 0, date: '', poster: p.src, url: link ? absUrl(link[1], 'https://www.paribucineverse.com') : '' });
  });
  return out;
}

// ---- Biletinial ----
// Kart: görsel bağlantısı <a href=".../tr-tr/sinema/<ad>" title="<Ad>"><img alt="<Ad>" src=".../Uploads/Films/…"></a> ve aynı adrese başlık bağlantısı.
export function parseBiletinial(html) {
  const s = String(html || '');
  const out = [];
  const seen = new Set();
  for (const m of s.matchAll(/<a\b([^>]*?)href\s*=\s*["']([^"']*\/tr-tr\/sinema\/([a-z0-9-]+))\/?["']([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const img = /<img\b[^>]*>/i.exec(m[5]);
    if (!img) continue;
    const poster = imgSrc(img[0]);
    if (!/Uploads\/Films\//i.test(poster)) continue;
    const title = cleanName(attr(img[0], 'alt') || attr(m[1] + ' ' + m[4], 'title'));
    if (!title || seen.has(m[3])) continue;
    seen.add(m[3]);
    out.push({ title, year: 0, date: '', poster, url: absUrl(m[2], 'https://biletinial.com') });
  }
  return out;
}

// ---- birleştirme ----
const STOP = new Set(['the', 'a', 'an']);
export function filmKey(title) {
  const w = wordKey(title).split(' ').filter(Boolean);
  if (w.length > 1 && STOP.has(w[0])) w.shift();
  return w.join(' ');
}
const hasNum = (k) => k.split(' ').some((w) => /^\d+$/.test(w));
const sansNum = (k) => k.split(' ').filter((w) => !/^\d+$/.test(w)).join(' ');
// Aynı film: ad aynı ("The Odyssey" ↔ "Odyssey") ya da yalnız bir tarafta sıra numarası var ("Pırıl 3: Kayıp Anahtarın Gizemi" ↔ "Pırıl: Kayıp Anahtarın Gizemi")
export function sameFilm(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const x = sansNum(a);
  return x.length >= 5 && x === sansNum(b) && hasNum(a) !== hasNum(b);
}

// lists: [{ id, items: [{ title, year, date, poster }] }] — öncelik sırasıyla. Çıktı: uygulamanın film kayıtları (Cinemeta kaydı yok: imdbId boş, kimlik "v:<ad>").
export function mergeLists(lists, max = VIZYON_MAX) {
  const films = [];
  for (const list of lists) {
    for (const it of list.items || []) {
      const name = String(it.title || '').trim();
      const key = filmKey(name);
      if (!name || !key) continue;
      const hit = films.find((f) => sameFilm(f._key, key));
      if (hit) {
        if (!hit.src.includes(list.id)) hit.src.push(list.id);
        if (!hit.poster && it.poster) hit.poster = it.poster;
        if (!hit.year && it.year) hit.year = it.year;
        if (!hit.date && it.date) hit.date = it.date;
        continue;
      }
      films.push({ _key: key, id: 'v:' + key.replace(/ /g, '-'), imdbId: '', type: 'movie', name, year: it.year || 0, date: it.date || '', poster: it.poster || '', trNames: [name], trGuess: [], local: true, src: [list.id] });
    }
  }
  return films.slice(0, max).map(({ _key, ...f }) => f);
}

// ---- yükleme ----
const withTimeout = (p, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('Sunucu zamanında yanıt vermedi')), ms);
  p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});
const getText = (net, url) => net.text(url, { fast: true, headers: HEADERS });

async function loadBeyazperde(net) {
  const first = await getText(net, BEYAZPERDE_URL);
  const items = parseBeyazperde(first);
  const last = Math.min(10, Math.max(lastPage(first), items.length >= 10 ? BEYAZPERDE_PAGES : 1));
  const pages = await Promise.allSettled(Array.from({ length: Math.max(0, last - 1) }, (_, i) => getText(net, `${BEYAZPERDE_URL}?page=${i + 2}`)));
  for (const p of pages) if (p.status === 'fulfilled') items.push(...parseBeyazperde(p.value));
  return items;
}

export const SOURCES = [
  { id: 'beyazperde', name: 'Beyazperde', load: loadBeyazperde },
  { id: 'paribu', name: 'Paribu Cineverse', load: async (net) => parseParibu(await getText(net, PARIBU_URL)) },
  { id: 'biletinial', name: 'Biletinial', load: async (net) => parseBiletinial(await getText(net, BILETINIAL_URL)) },
];

// Dönüş: { films, at, stale, sources: [{ id, name, count, error }], fallback }
// 6 saat önbellekten; hiçbir kaynak film vermezse eski önbellek (stale), o da yoksa fallback() (Cinemeta "yeni çıkanlar"), o da yoksa hata.
export async function loadVizyon({ net, cache = null, now = Date.now(), fallback = null, sources = SOURCES, timeoutMs = 25000 } = {}) {
  const key = 'vizyon:v2'; // v2: arama önerileri film sayılmıyor (v1 önbelleği "Dijital Esaret" gibi afişsiz kayıtlar içerir)
  const hit = cache ? await cache.get(key).catch(() => null) : null;
  const ok = hit && Array.isArray(hit.films) && hit.films.length;
  if (ok && now - Number(hit.at || 0) < VIZYON_TTL) return { films: hit.films, at: hit.at, stale: false, sources: hit.sources || [], fallback: false };
  const results = await Promise.allSettled(sources.map((s) => withTimeout(Promise.resolve().then(() => s.load(net)), timeoutMs)));
  const info = sources.map((s, i) => {
    const r = results[i];
    return r.status === 'fulfilled'
      ? { id: s.id, name: s.name, count: r.value.length, error: r.value.length ? '' : 'Film bulunamadı' }
      : { id: s.id, name: s.name, count: 0, error: String((r.reason && r.reason.message) || r.reason || 'hata').slice(0, 80) };
  });
  const lists = sources.map((s, i) => ({ id: s.id, items: results[i].status === 'fulfilled' ? results[i].value : [] }));
  const films = mergeLists(lists);
  if (films.length >= VIZYON_MIN) {
    if (cache) await cache.set(key, { at: now, films, sources: info }).catch(() => {});
    return { films, at: now, stale: false, sources: info, fallback: false };
  }
  if (ok) return { films: hit.films, at: hit.at, stale: true, sources: info, fallback: false };
  if (fallback) {
    const r = await fallback();
    return { ...r, sources: info, fallback: true };
  }
  const err = new Error('Vizyondaki filmler alınamadı');
  err.sources = info;
  throw err;
}

// "Beyazperde 62 · Paribu Cineverse 31 · Biletinial alınamadı (HTTP 403)"
export function sourcesNote(sources) {
  return (Array.isArray(sources) ? sources : []).map((s) => (s.error ? `${s.name} alınamadı (${s.error})` : `${s.name} ${s.count}`)).join(' · ');
}

// Sinema sitesinden afişi gelmeyen filmlerin afişini, bilgi ekranının kullandığı kaynaktan (IMDb kaydı) tamamlar.
// resolve(film) → { imdbId } | null; posterOf(imdbId, film) → https adresi | ''. Filmi yerinde günceller; eklenen afiş sayısını döner.
export async function fillPosters(films, { resolve, posterOf, max = 24, concurrency = 3 } = {}) {
  const need = (Array.isArray(films) ? films : []).filter((f) => f && f.local && !f.poster).slice(0, max);
  let added = 0;
  let next = 0;
  const work = async () => {
    while (next < need.length) {
      const f = need[next++];
      try {
        const o = f.imdbId ? { imdbId: f.imdbId } : await resolve(f);
        if (!o || !o.imdbId) continue;
        if (!f.imdbId) f.imdbId = o.imdbId;
        const url = await posterOf(f.imdbId, f);
        if (/^https:\/\//.test(String(url || ''))) {
          f.poster = url;
          added++;
        }
      } catch {
        /* bu filmin afişi bulunamadı: baş harfler kalır */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, need.length) }, work));
  return added;
}
