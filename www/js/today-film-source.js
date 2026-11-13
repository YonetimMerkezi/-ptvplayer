// tvyayinakisi.com film yayın akışı ayrıştırıcısı. Ağ isteği UI katmanından verilir.
export const FILM_SCHEDULE_URL = 'https://www.tvyayinakisi.com/film-yayin-akisi/';

function decodeHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function classText(html, className) {
  const re = new RegExp(`<([a-z][\\w:-]*)\\b[^>]*class=[\"'][^\"']*\\b${className}\\b[^\"']*[\"'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i');
  const m = re.exec(html);
  return m ? decodeHtml(m[2]) : '';
}

export function parseFilmSchedule(html) {
  const source = String(html || '');
  const out = [];
  const seen = new Set();
  const re = /<li\b[^>]*class=["'][^"']*\bchannel-flow-list__item\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(source))) {
    const item = m[1];
    const time = classText(item, 'time');
    const title = classText(item, 'title');
    const channel = classText(item, 'channel-name');
    const hrefMatch = /class=["'][^"']*\bchannel-name\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["']/i.exec(item);
    if (!/^\d{1,2}:\d{2}$/.test(time) || !title || !channel) continue;
    const key = time + '|' + title.toLocaleLowerCase('tr-TR') + '|' + channel.toLocaleLowerCase('tr-TR');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ time, title, channel, channelUrl: hrefMatch ? hrefMatch[1] : '' });
  }
  return out;
}

export async function loadFilmSchedule({ net, url = FILM_SCHEDULE_URL } = {}) {
  if (!net || typeof net.text !== 'function') throw new Error('Ağ katmanı kullanılamıyor');
  const html = await net.text(url, { fast: true, headers: { Accept: 'text/html' } });
  const films = parseFilmSchedule(html);
  if (!films.length) throw new Error('Film yayın akışında kayıt bulunamadı');
  return { films, fetchedAt: Date.now(), url };
}
