// Başlık temizleme: IPTV kayıt adından aranabilir ad + yıl çıkarır.
// Saf fonksiyonlar, DOM/Node bağımlılığı yok (uygulamada ve Worker'da aynı dosya kullanılabilir).

const TAGS = new Set([
  'hd','fhd','uhd','4k','8k','sd','hdr','imax','bluray','brrip','webrip','webdl','dvdrip','hdrip','hdtv','x264','x265','h264','h265','hevc','1080p','720p','480p','2160p',
  'nf','amzn','itun','dsnp','hmax','atvp','pcok','hulu','tod','bein','mubi','tv+',
  'altyazili','altyazı','altyazi','dublaj','turkce','tr.en','yerli','yabanci','dual','izle','fullizle','cd1','cd2',
]);

// "Ç" gibi harflerde Türkçe locale kaydırması olmadan sadeleştir
const MAP = { 'ı':'i','İ':'i','I':'i','ş':'s','Ş':'s','ğ':'g','Ğ':'g','ü':'u','Ü':'u','ö':'o','Ö':'o','ç':'c','Ç':'c','â':'a','Â':'a','î':'i','Î':'i','û':'u','Û':'u' };
export function fold(s) {
  let o = '';
  for (const ch of String(s)) o += MAP[ch] ?? ch;
  return o.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const YEAR_MIN = 1900, YEAR_MAX = new Date().getFullYear() + 1;
const okYear = (n) => n >= YEAR_MIN && n <= YEAR_MAX;

// Dizi bölümü / tarihli yayın kaydı mı? (film eşleştirmeye gönderme)
export function isEpisodeLike(raw, category) {
  const s = String(raw);
  if (/\b\d{1,2}\.\d{1,2}\.20\d{2}\b/.test(s)) return true;          // yayın tarihi
  if (/\bs\d{1,2}\s*e\d{1,3}\b/i.test(s)) return true;                 // S01E02
  if (/\|\s*\d{1,4}\s*\.\s*b[öo]l[üu]m\s*(\||$)/i.test(s)) return true; // "| 230. Bölüm |"
  if (category && /dizileri\s*$/i.test(category) && /b[öo]l[üu]m/i.test(s)) return true;
  return false;
}

export function cleanTitle(raw, yearField) {
  let s = String(raw ?? '').trim();
  let year = okYear(+yearField) ? +yearField : null;

  // Nokta/altçizgi ayraçlı dosya adı biçimi: "The.Virtuoso.2021.tr.en", "Kirik_Hayat_1972"
  s = s.replace(/_+/g, ' ');
  if (!/\s/.test(s)) s = s.replace(/\.+/g, ' ');

  // Pipe'lı biçim: "Ad | 2023 | 7.1 | NF | HD" → ilk parça ad, kalanlardan yıl
  if (s.includes('|')) {
    const parts = s.split('|').map((p) => p.trim()).filter(Boolean);
    s = parts[0] || '';
    if (!year) {
      for (const p of parts.slice(1)) {
        if (/^\d{4}$/.test(p) && okYear(+p)) { year = +p; break; }
      }
    }
  }

  // Parantez / köşeli parantez içi
  s = s.replace(/[\[\(]\s*(\d{4})\s*[\]\)]/g, (m, y) => { if (!year && okYear(+y)) year = +y; return ' '; });
  s = s.replace(/\[[^\]]*\]/g, ' ');
  // Boş kalmayan paranteze dokunma: "Katiller Devri (Jianyu)" alternatif ad olabilir, sonra ayrıca denenir.
  const altMatch = s.match(/\(([^)]{2,})\)/);
  const alt = altMatch ? altMatch[1].trim() : null;
  s = s.replace(/\([^)]*\)/g, ' ');

  // Sondaki / ortadaki etiket kelimeleri ve yıl
  const words = s.split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const f = fold(w).replace(/[^a-z0-9+.]/g, '');
    if (/^(19|20)\d{2}$/.test(f) && okYear(+f) && i > 0) { if (!year) year = +f; continue; }
    if (TAGS.has(f) && i > 0) continue;
    if (/^\d\.\d$/.test(f) && i === words.length - 1 && words.length > 1) continue; // sondaki "6.4" puanı
    if ((f === 'tr' || f === 'en') && i === words.length - 1 && i > 0) continue; // sondaki dil eki
    out.push(w);
  }
  while (out.length > 1 && ['tr', 'en'].includes(fold(out[out.length - 1]))) out.pop(); // "…2021.tr.en" gibi çift dil eki
  s = out.join(' ').replace(/\s*[-–—:]\s*$/, '').replace(/\s+/g, ' ').trim();
  // "Jurassic World 2 : Yıkılmış" → boşluklu iki nokta normalize
  s = s.replace(/\s+:/g, ':');

  return { title: s, year, alt, key: fold(s).replace(/[^a-z0-9]+/g, ' ').trim() };
}

// Önbellek anahtarı: kaynaktan bağımsız
export const cacheKey = (c, kind = 'movie') => `${kind}|${c.key}|${c.year ?? ''}`;
