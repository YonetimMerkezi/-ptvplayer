// Deneme amaçlı sahte IPTV sunucusu: M3U listesi, Xtream API, XMLTV ve örnek yayınlar.
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MEDIA = join(dirname(fileURLToPath(import.meta.url)), 'media');
const GROUPS = ['Ulusal', 'Haber', 'Spor', 'Sinema', 'Çocuk', 'Müzik'];
const NAMES = ['Şeker TV', 'Işık Haber', 'Öğretmen Kanalı', 'Çağrı Spor', 'Gündem', 'Ülke Sinema', 'Minik Dünya', 'Nostalji Müzik'];

export function liveChannels(n = 120) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `${NAMES[i % NAMES.length]} ${Math.floor(i / NAMES.length) + 1}`,
    group: GROUPS[i % GROUPS.length],
    tvg: `kanal${i + 1}.tr`,
  }));
}
export const MOVIES = Array.from({ length: 24 }, (_, i) => ({ id: 1000 + i, name: `Film ${i + 1} ${i % 3 ? 'Macerası' : 'Işıkları'}`, group: i % 2 ? 'Aksiyon' : 'Dram' }));
export const SERIES = [
  { id: 1, name: 'Kurtuluş Yolu', seasons: 2, eps: 3 },
  { id: 2, name: 'Sessiz Ev', seasons: 1, eps: 4 },
];

function xmltvTime(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())} +0000`;
}

export function xmltv(now = Date.now(), channels = liveChannels().slice(0, 40)) {
  const base = Math.floor(now / 3600e3) * 3600e3 - 2 * 3600e3;
  const out = ['<?xml version="1.0" encoding="UTF-8"?>\n<tv>'];
  for (const c of channels) out.push(`<channel id="${c.tvg}"><display-name>${c.name}</display-name></channel>`);
  for (const c of channels) {
    for (let h = 0; h < 26; h++) {
      out.push(`<programme start="${xmltvTime(base + h * 3600e3)}" stop="${xmltvTime(base + (h + 1) * 3600e3)}" channel="${c.tvg}"><title lang="tr">${c.name} Program ${h}</title><desc>Açıklama &amp; ayrıntı ${h}</desc></programme>`);
    }
  }
  out.push('</tv>');
  return out.join('\n');
}

export function m3u(base) {
  const lines = [`#EXTM3U url-tvg="${base}/epg.xml.gz"`];
  for (const c of liveChannels()) {
    lines.push(`#EXTINF:-1 tvg-id="${c.tvg}" tvg-name="${c.name}" tvg-logo="${base}/logo/${c.id}.svg" group-title="${c.group}",${c.name}`);
    lines.push(`${base}/live/u/p/${c.id}.m3u8`);
  }
  for (const m of MOVIES.slice(0, 6)) {
    lines.push(`#EXTINF:-1 group-title="${m.group}",${m.name}`);
    lines.push(`${base}/movie/u/p/${m.id}.webm`);
  }
  for (const s of SERIES) {
    for (let se = 1; se <= s.seasons; se++) {
      for (let e = 1; e <= s.eps; e++) {
        lines.push(`#EXTINF:-1 group-title="Diziler",${s.name} S0${se}E0${e}`);
        lines.push(`${base}/series/u/p/${s.id * 100 + se * 10 + e}.webm`);
      }
    }
  }
  return lines.join('\n');
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

function xtream(url, base) {
  const q = url.searchParams;
  if (q.get('username') !== 'u' || q.get('password') !== 'p') return { user_info: { auth: 0 } };
  const cats = (names) => names.map((n, i) => ({ category_id: String(i + 1), category_name: n }));
  switch (q.get('action')) {
    case null:
      return { user_info: { auth: 1, status: 'Active', exp_date: String(Math.floor(Date.now() / 1000) + 86400 * 90), max_connections: '2' }, server_info: { url: base, timezone: 'Europe/Istanbul' } };
    case 'get_live_categories': return cats(GROUPS);
    case 'get_live_streams': return liveChannels().map((c) => ({ num: c.id, name: c.name, stream_id: c.id, stream_icon: `${base}/logo/${c.id}.svg`, epg_channel_id: c.tvg, tv_archive: c.id % 3 === 0 ? 1 : 0, category_id: String(GROUPS.indexOf(c.group) + 1) }));
    case 'get_vod_categories': return cats(['Aksiyon', 'Dram']);
    case 'get_vod_streams': return MOVIES.map((m) => ({ name: m.name, stream_id: m.id, stream_icon: '', category_id: m.group === 'Aksiyon' ? '1' : '2', container_extension: 'webm', rating_5based: 3.5 }));
    case 'get_series_categories': return cats(['Diziler']);
    case 'get_series': return SERIES.map((s) => ({ series_id: s.id, name: s.name, cover: '', category_id: '1', plot: `${s.name} özeti` }));
    case 'get_series_info': {
      const s = SERIES.find((x) => String(x.id) === q.get('series_id')) || SERIES[0];
      const episodes = {};
      for (let se = 1; se <= s.seasons; se++) {
        episodes[se] = Array.from({ length: s.eps }, (_, i) => ({ id: String(s.id * 100 + se * 10 + i + 1), title: `${s.name} - Bölüm ${i + 1}`, episode_num: i + 1, container_extension: 'webm', info: { duration_secs: 40 } }));
      }
      return { info: { plot: `${s.name} hikâyesi`, genre: 'Dram', releaseDate: '2024-01-01' }, episodes };
    }
    case 'get_vod_info': return { info: { plot: 'Filmin konusu burada.', genre: 'Aksiyon', releasedate: '2023-05-01', duration_secs: 40 } };
    case 'get_short_epg': {
      const now = Math.floor(Date.now() / 1000);
      return { epg_listings: [0, 1, 2].map((i) => ({ title: b64(`Kısa Program ${i}`), description: b64('Ayrıntı'), start_timestamp: String(now - 600 + i * 3600), stop_timestamp: String(now + 3000 + i * 3600) })) };
    }
    case 'get_simple_data_table': {
      // Arşivli kanal: son altı saat (arşivde) ve önümüzdeki bir saat
      const h0 = Math.floor(Date.now() / 3600e3) * 3600;
      return { epg_listings: Array.from({ length: 7 }, (_, i) => ({ title: b64(`Arşiv Program ${i}`), description: b64('Arşiv ayrıntısı'), start_timestamp: String(h0 - (6 - i) * 3600), stop_timestamp: String(h0 - (5 - i) * 3600), has_archive: i < 6 ? 1 : 0 })) };
    }
    default: return [];
  }
}

function sendFile(req, res, file, type) {
  if (!existsSync(file)) {
    res.writeHead(404).end('yok');
    return;
  }
  const size = statSync(file).size;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size });
    createReadStream(file).pipe(res);
  }
}

export function startMock(port = 0) {
  const hits = [];
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    const base = `http://127.0.0.1:${server.address().port}`;
    const url = new URL(req.url, base);
    hits.push(url.pathname + url.search);
    const p = url.pathname;
    if (p === '/alt.m3u') {
      const L = ['#EXTM3U'];
      const add = (name, group, u) => L.push(`#EXTINF:-1 group-title="${group}",${name}`, u);
      add('Yedekli Kanal HD', 'Haber', `${base}/live/u/p/bozuk.m3u8`);
      add('Yedekli Kanal', 'Yedek', `${base}/live/u/p/7.m3u8`);
      add('Başka Kanal', 'Haber', `${base}/live/u/p/8.m3u8`);
      return res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' }).end(L.join('\n') + '\n');
    }
    if (p === '/list.m3u') return res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' }).end(m3u(base));
    if (p === '/player_api.php') return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(xtream(url, base)));
    if (p === '/epg.xml.gz') return res.writeHead(200, { 'Content-Type': 'application/gzip' }).end(gzipSync(xtmlCache()));
    if (p === '/xmltv.php' || p === '/epg.xml') return res.writeHead(200, { 'Content-Type': 'application/xml' }).end(xtmlCache());
    if (p.startsWith('/logo/')) return res.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#38bdf8"/></svg>`);
    if (/^\/live\/u\/p\/\d+\.m3u8$/.test(p)) return sendFile(req, res, join(MEDIA, 'hls', 'index.m3u8'), 'application/vnd.apple.mpegurl');
    if (/^\/live\/u\/p\/\d+\.ts$/.test(p)) return res.writeHead(404).end('ts yok');
    // Arşiv (catch-up): /timeshift/kullanıcı/şifre/süre/başlangıç/kanal.(ts|m3u8)
    if (/^\/timeshift\/u\/p\/\d+\/[\d:-]+\/\d+\.m3u8$/.test(p)) return sendFile(req, res, join(MEDIA, 'hls', 'index.m3u8'), 'application/vnd.apple.mpegurl');
    if (/^\/timeshift\/u\/p\/\d+\/[\d:-]+\/\d+\.ts$/.test(p)) return res.writeHead(404).end('ts yok');
    const tseg = /^\/timeshift\/u\/p\/\d+\/[\d:-]+\/(init\.mp4|seg\d+\.m4s)$/.exec(p);
    if (tseg) return sendFile(req, res, join(MEDIA, 'hls', tseg[1]), tseg[1].endsWith('.mp4') ? 'video/mp4' : 'video/iso.segment');
    if (p === '/live/u/p/bozuk.m3u8') return res.writeHead(404).end('yok');
    const seg = /^\/live\/u\/p\/(init\.mp4|seg\d+\.m4s)$/.exec(p);
    if (seg) return sendFile(req, res, join(MEDIA, 'hls', seg[1]), seg[1].endsWith('.mp4') ? 'video/mp4' : 'video/iso.segment');
    if (/^\/(movie|series)\/u\/p\/\d+\.webm$/.test(p)) return sendFile(req, res, join(MEDIA, 'clip.webm'), 'video/webm');
    res.writeHead(404).end('yok');
  });
  let cache = null;
  function xtmlCache() {
    return cache || (cache = xmltv());
  }
  return new Promise((resolve) =>
    server.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, port: server.address().port, hits, close: () => new Promise((r) => server.close(r)) })),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startMock(Number(process.env.PORT || 8099));
  console.log('sahte IPTV sunucusu:', s.url);
}
