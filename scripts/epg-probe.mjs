// Ücretsiz TV rehberi kaynaklarını GERÇEKTEN dener (GitHub Actions'ta çalışır): ulaşım, biçim, güncellik, kanal kapsamı.
// Çıktı (epg-out/): report.json + her kaynağın ham örneği (HTML ayrıştırıcıları yazılırken gerçek yapıyı görmek için).
// Kullanım: node scripts/epg-probe.mjs [çıktı-klasörü]
import { mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const OUT = process.argv[2] || 'epg-out';
const UA = 'Mozilla/5.0 (Linux; Android 11; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const SOURCES = [
  { id: 'openepg', type: 'xmltv', url: 'https://www.open-epg.com/files/turkey1.xml.gz' },
  { id: 'epgshare', type: 'xmltv', url: 'https://epgshare01.online/epgshare01/epg_ripper_TR1.xml.gz' },
  { id: 'githubepg', type: 'xmltv', url: 'https://raw.githubusercontent.com/ahmethascelik/epghost/main/xmltv.xml' },
  { id: 'teleonline', type: 'xmltv', url: 'https://teleonline.github.io/epg/epg.xml.gz' },
  { id: 'nebilgi', type: 'html', url: 'https://www.nebilgi.com/' },
  { id: 'tvdebugun', type: 'html', url: 'https://tvdebugun.net/' },
  { id: 'tvdebugun-gun', type: 'html', url: () => `https://tvdebugun.net/yayin-akisi/${istDate(0)}/` },
  { id: 'tvdebugun-yarin', type: 'html', url: () => `https://tvdebugun.net/yayin-akisi/${istDate(1)}/` },
  { id: 'tvakisi', type: 'html', url: 'https://tvakisi.com/' },
  { id: 'tvakisi-rehber', type: 'html', url: 'https://tvakisi.com/tv-rehberi' },
  { id: 'tvakisi-canli', type: 'html', url: 'https://tvakisi.com/canli-yayin-akisi' },
  { id: 'tvyayinlari', type: 'html', url: 'https://tvyayinlari.com/' },
];

// Europe/Istanbul (UTC+3, yaz saati yok)
const IST = 3 * 3600e3;
const istDate = (offsetDays) => new Date(Date.now() + IST + offsetDays * 864e5).toISOString().slice(0, 10);

function xmltvMs(s) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?\s*([+-]\d{4}|Z)?/.exec(String(s || '').trim());
  if (!m) return NaN;
  let ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  if (m[7] && m[7] !== 'Z') ms -= (m[7][0] === '-' ? -1 : 1) * (parseInt(m[7].slice(1, 3), 10) * 60 + parseInt(m[7].slice(3, 5), 10)) * 60000;
  return ms;
}

async function fetchBytes(url) {
  const t0 = Date.now();
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*', 'accept-language': 'tr-TR,tr;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(90000) });
  const buf = Buffer.from(await res.arrayBuffer());
  return { res, buf, ms: Date.now() - t0 };
}

async function probe(src) {
  const url = typeof src.url === 'function' ? src.url() : src.url;
  const r = { id: src.id, type: src.type, url };
  try {
    const { res, buf, ms } = await fetchBytes(url);
    r.http = res.status;
    r.ms = ms;
    r.bytes = buf.length;
    r.contentType = res.headers.get('content-type');
    r.lastModified = res.headers.get('last-modified');
    r.finalUrl = res.url;
    if (!res.ok) return r;
    let body = buf;
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      r.gzip = true;
      body = gunzipSync(buf);
      r.decodedBytes = body.length;
    }
    const text = body.toString('utf8');
    await writeFile(`${OUT}/${src.id}.sample.txt`, text.slice(0, src.type === 'html' ? 450000 : 6000));
    if (src.type === 'xmltv') {
      const channels = [...text.matchAll(/<channel\s+id="([^"]*)"/g)].map((m) => m[1]);
      const names = [...text.matchAll(/<display-name[^>]*>([^<]*)<\/display-name>/g)].map((m) => m[1]);
      let n = 0;
      let min = Infinity;
      let max = -Infinity;
      const perCh = new Map();
      const now = Date.now();
      const live = new Set();
      for (const m of text.matchAll(/<programme\s+([^>]*)>/g)) {
        const a = m[1];
        const s = xmltvMs(/start="([^"]*)"/.exec(a)?.[1]);
        const e = xmltvMs(/stop="([^"]*)"/.exec(a)?.[1]);
        const ch = /channel="([^"]*)"/.exec(a)?.[1];
        if (!Number.isFinite(s)) continue;
        n++;
        if (s < min) min = s;
        if (s > max) max = s;
        if (ch) perCh.set(ch, (perCh.get(ch) || 0) + 1);
        if (ch && s <= now && e > now) live.add(ch);
      }
      Object.assign(r, {
        channels: channels.length,
        programmes: n,
        channelsWithProgrammes: perCh.size,
        firstStart: Number.isFinite(min) ? new Date(min).toISOString() : null,
        lastStart: Number.isFinite(max) ? new Date(max).toISOString() : null,
        channelsOnAirNow: live.size,
        sampleChannelNames: names.slice(0, 60),
        generator: /<tv[^>]*generator-info-name="([^"]*)"/.exec(text)?.[1] || null,
        hasEpisodeNum: /<episode-num/.test(text),
        hasNew: /<new\s*\/>/.test(text),
        hasPreviouslyShown: /<previously-shown/.test(text),
        hasCategory: /<category/.test(text),
      });
    } else {
      r.title = /<title[^>]*>([^<]*)/i.exec(text)?.[1]?.trim() || null;
      r.htmlBytes = text.length;
    }
  } catch (e) {
    r.error = String(e && e.cause ? `${e.message}: ${e.cause.code || e.cause.message}` : e && e.message);
  }
  return r;
}

await mkdir(OUT, { recursive: true });
const startedAt = new Date().toISOString();
const results = [];
for (const s of SOURCES) {
  const r = await probe(s);
  results.push(r);
  console.log(JSON.stringify({ ...r, sampleChannelNames: undefined }));
}
await writeFile(`${OUT}/report.json`, JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), istanbulToday: istDate(0), results }, null, 1));
