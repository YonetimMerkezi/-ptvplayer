// Vizyondaki filmler (ana sayfadaki afiş şeridi). Kaynak: Beyazperde "vizyondakiler" (sinema sayısına göre sıralı); alınamazsa Cinemeta "yeni çıkanlar".
// www/js/vizyon.js Android sürümüdür; Chromium 38 geriye dönük (lookbehind) düzenli ifadeyi desteklemediği için ayrıştırma burada yeniden yazıldı.
import { fold, decodeEntities } from '../../www/js/util.js';
import { loadNewReleases } from '../../www/js/cinemeta.js';

export const VIZYON_TTL = 6 * 3600000;
export const VIZYON_MAX = 40;
export const VIZYON_MIN = 5; // bundan az film gelirse sayfa bozuk sayılır
export const BEYAZPERDE_URL = 'https://www.beyazperde.com/filmler/vizyondakiler/sinema-sayisi/';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36', 'Accept-Language': 'tr-TR,tr;q=0.9' };
const AYLAR = { ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6, temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12 };

const IMG_URL = /(?:https?:)?\/\/[^\s"'<>()]+?\.(?:jpe?g|png|webp)(?:\?[^\s"'<>()]*)?/i;
const kacir = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function attr(tag, ad) {
  const m = new RegExp('(?:^|[^\\w-])' + kacir(ad) + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i').exec(tag);
  return m ? decodeEntities(m[1] !== undefined ? m[1] : m[2]).trim() : '';
}
function imgSrc(tag) {
  const adlar = ['data-src', 'data-original', 'data-lazy-src', 'src'];
  for (let i = 0; i < adlar.length; i++) {
    const v = attr(tag, adlar[i]);
    if (v && !/^data:/i.test(v)) return v;
  }
  const ss = attr(tag, 'srcset') || attr(tag, 'data-srcset');
  const ilk = ss.split(',')[0].trim().split(/\s+/)[0];
  if (ilk && !/^data:/i.test(ilk)) return ilk;
  const herhangi = IMG_URL.exec(String(tag).replace(/^<img\b/i, '').replace(/(?:^|[^\w-])alt\s*=\s*(?:"[^"]*"|'[^']*')/i, ''));
  return herhangi ? decodeEntities(herhangi[0]) : '';
}
const duzMetin = (html) => decodeEntities(String(html || '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
function mutlak(u, kok) {
  const s = String(u || '').trim();
  if (/^https:\/\//i.test(s)) return s;
  if (/^http:\/\//i.test(s)) return 'https://' + s.slice(7);
  if (s.slice(0, 2) === '//') return 'https:' + s;
  return s.charAt(0) === '/' ? kok + s : '';
}
const adTemizle = (s) => String(s || '').replace(/\s*(posteri|afişi|afisi)\s*$/i, '').replace(/\s+/g, ' ').trim();
const kelimeAnahtar = (s) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim();

export function tarihOku(parca) {
  const m = /(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+((?:19|20)\d{2})/i.exec(String(parca || ''));
  if (!m) return { year: 0, date: '' };
  const ay = AYLAR[fold(m[2])];
  const iki = (n) => (n < 10 ? '0' : '') + n;
  return { year: Number(m[3]), date: m[3] + '-' + iki(ay) + '-' + iki(Number(m[1])) };
}

// Hepsi eşleşmeleri sırayla toplar (matchAll yerine exec döngüsü)
function eslesmeler(re, s) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(s))) {
    out.push(m);
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

// Beyazperde kartı: görsel (alt = "<ad> posteri"), başlık bağlantısı (/filmler/film-<kimlik>/), tarih satırı ("13 Kasım 2026 | 1s 21dk | Animasyon").
// Arama önerileri de film sayfasına bağlanır ama kartın başlığından önce "… posteri" görseli yoktur: film sayılmaz.
export function beyazperdeOku(html) {
  const s = String(html || '');
  const imgs = [];
  eslesmeler(/<img\b[^>]*>/gi, s).forEach((m) => {
    const alt = attr(m[0], 'alt');
    if (!/posteri\s*$/i.test(alt)) return;
    imgs.push({ at: m.index, src: mutlak(imgSrc(m[0]), 'https://www.beyazperde.com'), alt: adTemizle(alt) });
  });
  const links = [];
  eslesmeler(/<a\b[^>]*?href\s*=\s*["']([^"']*\/filmler\/film-(\d+)\/?)["'][^>]*>([\s\S]*?)<\/a>/gi, s).forEach((m) => {
    if (/<img\b/i.test(m[3])) return;
    const title = duzMetin(m[3]);
    if (title.length >= 2) links.push({ id: m[2], at: m.index, end: m.index + m[0].length, title });
  });
  const out = [];
  const gorulen = {};
  let onceki = 0;
  for (let i = 0; i < links.length; i++) {
    const l = links[i];
    if (gorulen[l.id]) continue;
    const key = kelimeAnahtar(l.title);
    const pencere = imgs.filter((x) => x.at >= onceki && x.at < l.at);
    const kart = pencere.filter((x) => kelimeAnahtar(x.alt) === key)[0] || pencere[pencere.length - 1];
    if (!kart) continue;
    gorulen[l.id] = 1;
    let sonraki = null;
    for (let j = i + 1; j < links.length; j++) {
      if (!gorulen[links[j].id]) {
        sonraki = links[j];
        break;
      }
    }
    const seg = s.slice(l.end, Math.min(sonraki ? sonraki.at : s.length, l.end + 1500));
    const d = tarihOku(duzMetin(seg));
    out.push({ id: 'v' + l.id, title: l.title, year: d.year, date: d.date, poster: kart.src });
    onceki = l.end;
  }
  return out;
}

// Aynı filmi iki kez göstermemek için
function benzersiz(l) {
  const g = {};
  return l.filter((f) => {
    const k = kelimeAnahtar(f.title);
    if (!k || g[k]) return false;
    g[k] = 1;
    return true;
  });
}

const bekle = () => new Promise((r) => setTimeout(r, 0)); // ayrıştırmalar arasında ekran donmasın

// Dönüş: { films, kaynak: 'beyazperde' | 'cinemeta' | 'onbellek', eski }. depo: { al(), yaz(v) } (kalıcı önbellek)
export async function vizyonYukle({ net, depo = null, simdi = Date.now(), yedek = loadNewReleases } = {}) {
  const hit = depo ? depo.al() : null;
  const var_ = hit && Array.isArray(hit.films) && hit.films.length;
  if (var_ && simdi - Number(hit.at || 0) < VIZYON_TTL) return { films: hit.films, kaynak: 'onbellek', eski: false };
  try {
    const sayfa1 = await net.text(BEYAZPERDE_URL, { timeoutMs: 25000, headers: HEADERS });
    let films = beyazperdeOku(sayfa1);
    if (films.length < VIZYON_MIN) throw new Error('Beyazperde sayfası okunamadı');
    await bekle();
    if (films.length < VIZYON_MAX) {
      try {
        const sayfa2 = await net.text(BEYAZPERDE_URL + '?page=2', { timeoutMs: 25000, headers: HEADERS });
        await bekle();
        films = films.concat(beyazperdeOku(sayfa2));
      } catch (e) {
        /* ikinci sayfa alınamadı: ilk sayfa yeter */
      }
    }
    films = benzersiz(films).slice(0, VIZYON_MAX);
    if (depo) depo.yaz({ at: simdi, films });
    return { films, kaynak: 'beyazperde', eski: false };
  } catch (e) {
    try {
      const r = await yedek({ net, cache: null, now: simdi });
      const films = (r.films || []).map((f) => ({ id: f.imdbId || 'c' + f.name, title: f.name, year: f.year || 0, date: '', poster: f.poster || '', imdbId: f.imdbId || '' }));
      if (films.length) {
        if (depo) depo.yaz({ at: simdi, films });
        return { films, kaynak: 'cinemeta', eski: false };
      }
    } catch (e2) {
      /* yedek de yok */
    }
    if (var_) return { films: hit.films, kaynak: 'onbellek', eski: true };
    throw e;
  }
}
