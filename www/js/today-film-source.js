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

// Belirli bir CSS sınıfına sahip elemanları, iç içe aynı etiketler olsa da doğru kapatır.
function classElements(html, className) {
  const source = String(html || '');
  const opening = /<([a-z][\w:-]*)\b([^>]*)>/gi;
  const found = [];
  let match;
  while ((match = opening.exec(source))) {
    const attrs = match[2] || '';
    const classMatch = /\bclass\s*=\s*(["'])(.*?)\1/i.exec(attrs);
    if (!classMatch || !classMatch[2].split(/\s+/).includes(className)) continue;
    const tag = match[1];
    if (/\/\s*$/.test(attrs)) {
      found.push('');
      continue;
    }
    const token = new RegExp('<\\/?' + tag + '\\b[^>]*>', 'gi');
    token.lastIndex = opening.lastIndex;
    let depth = 1, end = -1, t;
    while ((t = token.exec(source))) {
      if (/^<\//.test(t[0])) depth--;
      else if (!/\/\s*>$/.test(t[0])) depth++;
      if (depth === 0) { end = t.index; break; }
    }
    if (end < 0) continue;
    found.push(source.slice(opening.lastIndex, end));
    opening.lastIndex = token.lastIndex;
  }
  return found;
}

function classText(html, names) {
  for (const name of names) {
    const blocks = classElements(html, name);
    if (blocks.length) return decodeHtml(blocks[0]);
  }
  return '';
}

export function parseFilmSchedule(html) {
  const source = String(html || '');
  const out = [];
  const seen = new Set();
  // Site zaman zaman li yerine div/article kullanabiliyor; sınıf adına göre kapsayıcıyı bul.
  const items = classElements(source, 'channel-flow-list__item');
  for (const item of items) {
    const time = classText(item, ['time', 'channel-flow-list__time', 'program-time']);
    const title = classText(item, ['title', 'channel-flow-list__title', 'program-title']);
    const channel = classText(item, ['channel-name', 'channel', 'channel-flow-list__channel']);
    const hrefMatch = /class=["'][^"']*\b(?:channel-name|channel|channel-flow-list__channel)\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["']/i.exec(item);
    if (!/^\d{1,2}:\d{2}$/.test(time) || !title || !channel) continue;
    const key = time + '|' + title.toLocaleLowerCase('tr-TR') + '|' + channel.toLocaleLowerCase('tr-TR');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ time, title, channel, channelUrl: hrefMatch ? hrefMatch[1] : '' });
  }
  // Sınıf adları değişse bile yayıncı kanal bağlantılarını esas al.
  if (!out.length) {
    const anchors = [...source.matchAll(/<a\b([^>]*href=["'][^"']*yayin-akisi[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)];
    const timeRe = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
    for (const a of anchors) {
      const before = source.slice(Math.max(0, a.index - 1400), a.index);
      const times = [...before.matchAll(timeRe)];
      const tm = times[times.length - 1];
      if (!tm) continue;
      const timeEnd = Math.max(0, a.index - 1400) + tm.index + tm[0].length;
      const rawTitle = source.slice(timeEnd, a.index);
      const title = decodeHtml(rawTitle)
        .replace(/^(?:bugünün filmleri|yarının filmleri|filtre|değiştir)\s*/i, '')
        .replace(/\s+/g, ' ').trim();
      const channel = decodeHtml(a[2]);
      if (!title || !channel || title.length > 180 || channel.length > 90) continue;
      // Aradaki alan başka bir program kartını içeriyorsa yanlış eşleşmeyi atla.
      if (/<a\b/i.test(rawTitle) || /\b(?:filtre|menü|kanallar)\b/i.test(title)) continue;
      const time = tm[0];
      const key = time + '|' + title.toLocaleLowerCase('tr-TR') + '|' + channel.toLocaleLowerCase('tr-TR');
      if (seen.has(key)) continue;
      seen.add(key);
      const href = /href=["']([^"']+)["']/i.exec(a[1]);
      out.push({ time, title, channel, channelUrl: href ? href[1] : '' });
    }
  }
  return out;
}

export async function loadFilmSchedule({ net, url = FILM_SCHEDULE_URL } = {}) {
  if (!net || typeof net.text !== 'function') throw new Error('Ağ katmanı kullanılamıyor');
  const html = await net.text(url, { fast: true, headers: { Accept: 'text/html' } });
  const films = parseFilmSchedule(html);
  if (!films.length) {
    const bytes = html.length;
    const times = (html.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g) || []).length;
    const channels = (html.match(/yayin-akisi/gi) || []).length;
    throw new Error(`Film kaydı ayrıştırılamadı (HTML: ${bytes} karakter, saat: ${times}, kanal bağlantısı: ${channels}). Kaynak yanıtını kontrol edin.`);
  }
  return { films, fetchedAt: Date.now(), url };
}
