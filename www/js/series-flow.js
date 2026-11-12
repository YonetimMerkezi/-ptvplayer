// Dizi akışı: TV dizilerinin haftalık yayın programı (gün, kanal, saat, bölüm). Kaynak: 1001dizi.net (haftalık program + 7 gün sayfası);
// bu hiç sonuç vermezse m.sinemalar.com TV dizileri sayfası denenir. Resmî API değil, herkese açık HTML sayfalarıdır; yapı değişebilir.
// Bu yüzden ayrıştırıcı sınıf adlarına değil sayfanın metin akışına bakar (dizi bağlantısı + görsel alt metni + "Kanal - SS:DD" + "N. Bölüm" + durum)
// ve ne okuduğunu gösteren bir teşhis (diag) döndürür. Saf mantık (ağ dışarıdan verilir); ekran series-flow-ui.js'te.
import { fold } from './util.js';
import { decodeEntities } from './sports-se.js';
import { withTimeout } from './sports.js';
import { loadFreeData, istDayStart, IST_MS, chanKey } from './epg-free.js';
import { kindOf } from './today.js';

export const DIZI_BASE = 'https://1001dizi.net';
export const SINEMALAR_URL = 'https://m.sinemalar.com/mobileweb/tv-dizileri';

// Pazartesi tabanlı hafta (1001dizi sayfaları böyle)
export const WEEKDAYS = [
  ['pazartesi', 'Pazartesi'],
  ['sali', 'Salı'],
  ['carsamba', 'Çarşamba'],
  ['persembe', 'Perşembe'],
  ['cuma', 'Cuma'],
  ['cumartesi', 'Cumartesi'],
  ['pazar', 'Pazar'],
];

export const dayPageUrl = (idx, base = DIZI_BASE) => `${base}/${WEEKDAYS[idx][0]}-gunu-dizileri`;
export const weekPageUrl = (base = DIZI_BASE) => `${base}/haftalik-dizi-programi`;

// Yerel gün → Pazartesi tabanlı sıra (0 = Pazartesi … 6 = Pazar)
export const dayIndex = (ms) => (new Date(ms).getDay() + 6) % 7;

// ---------------------------------------------------------------- HTML → olay akışı
const clean = (s) => decodeEntities(String(s)).replace(/\s+/g, ' ').trim();

function attrOf(attrs, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? clean(m[1] ?? m[2] ?? m[3] ?? '') : '';
}

// Olaylar: { k: 'a', href } bağlantı açılır, { k: '/a' } kapanır, { k: 'alt', t } görsel alt metni, { k: 't', t } metin
export function streamOf(html) {
  const src = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  const out = [];
  const re = /<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>|([^<]+)/gi;
  let m;
  while ((m = re.exec(src))) {
    if (m[4] != null) {
      const t = clean(m[4]);
      if (t) out.push({ k: 't', t });
      continue;
    }
    const close = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (tag === 'a') out.push(close ? { k: '/a' } : { k: 'a', href: attrOf(m[3], 'href') });
    else if (tag === 'img' && !close) {
      const alt = attrOf(m[3], 'alt');
      if (alt) out.push({ k: 'alt', t: alt });
    }
  }
  return out;
}

// ---------------------------------------------------------------- kart ayrıştırma
const TIME = '(?:[01]?\\d|2[0-3])[:.][0-5]\\d';
const RE_TIME = new RegExp(`^${TIME}$`);
const RE_CH_TIME = new RegExp(`^(.*?)\\s*[-–—|·]\\s*(${TIME})$`); // "Show TV - 20:00"
const RE_TIME_CH = new RegExp(`^(${TIME})\\s*[-–—|·]\\s*(.+)$`); // "20:00 - Show TV"
const RE_EP = /(\d+(?:\s*[-–]\s*\d+)?)\s*\.?\s*bolum/;
const RE_EP_BARE = /^\(\s*(\d+(?:\s*[-–]\s*\d+)?)\s*\)$/;
const RE_STATUS = /^(yeni bolum|yeni sezon|yeni|bu hafta yayinlanmiyor|yayinlanmiyor|sezon finali|sezon final|final|tekrar|tekrar bolum|sezon fragmani|dizi finali)$/;

const normTime = (t) => {
  const [h, mm] = String(t).replace('.', ':').split(':');
  return `${h.padStart(2, '0')}:${mm}`;
};

// "BU HAFTA YAYINLANMIYOR" → "Bu hafta yayınlanmıyor"
const sentence = (s) => {
  const t = s.trim();
  const low = t.toLocaleLowerCase('tr');
  return t === t.toLocaleUpperCase('tr') ? low.charAt(0).toLocaleUpperCase('tr') + low.slice(1) : t;
};

const isMeta = (t) => RE_TIME.test(t) || RE_CH_TIME.test(t) || RE_TIME_CH.test(t) || RE_EP.test(fold(t)) || RE_EP_BARE.test(t) || RE_STATUS.test(fold(t));

// Dizi bağlantısıyla başlayan kartlar: ardışık aynı dizi bağlantıları (görsel + başlık) tek karttır.
function cardsOf(stream, hrefRe) {
  const cards = [];
  let cur = null;
  let inA = false;
  let aSlug = '';
  let anchors = 0;
  for (const e of stream) {
    if (e.k === 'a') {
      inA = true;
      aSlug = '';
      const m = hrefRe.exec(e.href || '');
      if (m) {
        anchors++;
        aSlug = fold(m[1]);
        if (!cur || cur.slug !== aSlug) {
          cur = { slug: aSlug, href: e.href, tokens: [], links: [], alts: [] };
          cards.push(cur);
        }
      }
      continue;
    }
    if (e.k === '/a') {
      inA = false;
      aSlug = '';
      continue;
    }
    if (!cur || cur.tokens.length + cur.alts.length > 14) continue; // kartın ötesindeki metin (altbilgi vb.) sayılmaz
    if (e.k === 'alt') {
      cur.alts.push(e.t);
      continue;
    }
    cur.tokens.push(e.t);
    if (inA && aSlug === cur.slug) cur.links.push(e.t);
  }
  return { cards, anchors };
}

function rowOf(c, base) {
  const toks = c.tokens;
  let time = '';
  let channel = '';
  for (const t of toks) {
    let m = RE_CH_TIME.exec(t);
    if (m) {
      time = normTime(m[2]);
      channel = m[1].trim();
      break;
    }
    m = RE_TIME_CH.exec(t);
    if (m) {
      time = normTime(m[1]);
      channel = m[2].trim();
      break;
    }
  }
  if (!time) {
    const t = toks.find((x) => RE_TIME.test(x));
    if (t) time = normTime(t);
  }
  // Görsel alt metni "Dizi adı, Kanal"
  let altTitle = '';
  let altChannel = '';
  const alt = c.alts.find((a) => a.includes(','));
  if (alt) {
    const i = alt.lastIndexOf(',');
    altTitle = alt.slice(0, i).trim();
    altChannel = alt.slice(i + 1).trim();
  }
  // Görsel alt metni kartın kendi görselidir; metin parçaları ise komşu karttan kayabilir. Kanal adları birbirini içermiyorsa (gerçekten çelişiyorsa) alt metindeki kanal geçerli;
  // afiş/görsel açıklaması gibi görünen alt metinler kanal sayılmaz.
  const aF = fold(altChannel);
  const cF = fold(channel);
  const altIsChannel = altChannel && altChannel.length <= 30 && !/afis|poster|gorsel|resim|kapak|fragman|dizisi$/.test(aF);
  if (altIsChannel && (!channel || (!cF.includes(aF) && !aF.includes(cF)))) channel = altChannel;
  // Başlık: alt metindeki ad ile eşleşen bağlantı metni; yoksa ilk "meta olmayan" bağlantı metni; yoksa alt metindeki ad
  const pool = c.links.length ? c.links : toks;
  let title = '';
  if (altTitle) title = pool.find((t) => fold(t) === fold(altTitle)) || '';
  if (!title) title = pool.find((t) => t.length > 1 && !isMeta(t) && fold(t) !== fold(channel)) || altTitle;
  let ep = '';
  let status = '';
  for (const t of toks) {
    const f = fold(t);
    const em = RE_EP.exec(f);
    if (em && !ep) {
      ep = `${em[1].replace(/\s+/g, '')}. Bölüm`;
      continue;
    }
    const bm = RE_EP_BARE.exec(t);
    if (bm && !ep) {
      ep = `${bm[1].replace(/\s+/g, '')}. Bölüm`;
      continue;
    }
    if (!status && (RE_STATUS.test(f) || /yayinlanmiyor/.test(f))) status = sentence(t);
  }
  if (!title || !(channel || time) || !(ep || time || status)) return null;
  let url = '';
  try {
    url = new URL(c.href, base).href;
  } catch {
    url = '';
  }
  return { slug: c.slug, title, channel, time, ep, status, off: /yayinlanmiyor/.test(fold(status)), url };
}

const sortRows = (rows) => rows.slice().sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || fold(a.title).localeCompare(fold(b.title), 'tr'));

const istDayIndex = (ms) => (new Date(ms + IST_MS).getUTCDay() + 6) % 7;
const istClock = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function freeDiziDays(free, nowMs) {
  const days = WEEKDAYS.map(() => []);
  const starts = [istDayStart(nowMs, 0), istDayStart(nowMs, 1)];
  for (const channel of Object.values((free && free.ch) || {})) {
    const channelName = String((channel && channel.n) || '').trim();
    if (!channelName) continue;
    for (const p of (channel && channel.p) || []) {
      const startAt = Number(p && p[0]);
      if (!Number.isFinite(startAt)) continue;
      const offset = starts.findIndex((from) => startAt >= from && startAt < from + 864e5);
      if (offset < 0 || kindOf({ t: String(p[2] || ''), c: String(p[4] || '') }) !== 'dizi') continue;
      const title = String(p[2] || '').trim();
      if (!title) continue;
      const status = String(p[6] || '').trim();
      const slug = 'epg-' + fold(title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 56) + '-' + chanKey(channelName);
      days[istDayIndex(starts[offset])].push({
        slug, title, channel: channelName, time: istClock.format(new Date(startAt)),
        ep: String(p[5] || '').trim(), status,
        off: /yayinlanmiyor|iptal/.test(fold(status)),
        url: '', source: 'EPG', startAt,
        endAt: Number.isFinite(Number(p[1])) ? Number(p[1]) : null,
      });
    }
  }
  for (const day of days) {
    const seen = new Set();
    for (let i = day.length - 1; i >= 0; i--) {
      const r = day[i];
      const key = fold(r.title) + '|' + chanKey(r.channel) + '|' + r.startAt;
      if (seen.has(key)) day.splice(i, 1);
      else seen.add(key);
    }
  }
  return days.map(sortRows);
}

function mergeDiziRows(primary, extra) {
  const out = primary.slice();
  for (const row of extra) {
    const same = out.findIndex((x) => fold(x.title) === fold(row.title) && chanKey(x.channel) === chanKey(row.channel) && (!x.time || !row.time || x.time === row.time));
    if (same >= 0) {
      const current = out[same];
      out[same] = { ...current, time: current.time || row.time, startAt: current.startAt || row.startAt, endAt: current.endAt || row.endAt, ep: current.ep || row.ep, status: current.status || row.status, off: current.off || row.off };
    } else out.push(row);
  }
  return sortRows(out);
}

function parseCards(html, hrefRe, base) {
  const stream = streamOf(html);
  const { cards, anchors } = cardsOf(stream, hrefRe);
  const seen = new Set();
  const rows = [];
  for (const c of cards) {
    const r = rowOf(c, base);
    if (!r) continue;
    const key = `${r.slug}|${fold(r.channel)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(r);
  }
  const sample = rows[0] ? `${rows[0].title} | ${rows[0].channel} | ${rows[0].time || '—'}` : (cards[0] && cards[0].tokens.slice(0, 4).join(' | ')) || '';
  // Ham kartlar (ilk 6): ayrıştırıcının gördüğü metin ve görsel alt metinleri — yanlış eşleşme olunca nedeni buradan okunur
  const raw = cards.slice(0, 6).map((c) => `${c.slug}: ${c.tokens.slice(0, 8).join(' | ')}${c.alts.length ? ` [alt: ${c.alts.slice(0, 2).join(' | ')}]` : ''}`);
  return { rows: sortRows(rows), diag: { bytes: String(html || '').length, anchors, cards: cards.length, sample, raw } };
}

// 1001dizi.net: dizi bağlantıları /dizi-<ad> biçimindedir
const RE_1001 = /\/dizi-([a-z0-9][a-z0-9-]*)/i;
export const parse1001 = (html, base = DIZI_BASE) => parseCards(html, RE_1001, base);

// m.sinemalar.com: yapıyı bilmediğimiz için yalnız "dizi" yol parçası olan bağlantılar kart sayılır; aynı kart kuralları geçerlidir
const RE_SINEMALAR = /\/(?:tv-)?dizi[a-z-]*\/([a-z0-9%][a-z0-9%_-]*)/i;
export const parseSinemalar = (html, base = SINEMALAR_URL) => parseCards(html, RE_SINEMALAR, base);

// ---------------------------------------------------------------- saat birleştirme
// Gün sayfalarında saat olmayabilir; haftalık sayfadaki saat dizi (+kanal) anahtarıyla gün satırlarına eklenir.
export function timeMap(rows) {
  const m = new Map();
  for (const r of rows) {
    if (!r.time) continue;
    const k = `${r.slug}|${fold(r.channel)}`;
    if (!m.has(k)) m.set(k, r.time);
    if (!m.has(r.slug)) m.set(r.slug, r.time);
  }
  return m;
}

export function fillTimes(rows, map) {
  return sortRows(rows.map((r) => (r.time ? r : { ...r, time: map.get(`${r.slug}|${fold(r.channel)}`) || map.get(r.slug) || '' })));
}

// ---------------------------------------------------------------- yükleme
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const msg = (e) => String((e && e.message) || e || 'hata').slice(0, 100);

// Döner: { days: [7 dizi satırı listesi, Pazartesi…Pazar], via, note, failed: [alınamayan gün sıraları], today?: true }
// 1001dizi'den hiç satır gelmezse sinemalar denenir (gün bilgisi olmadığından yalnız "bugün" listesi: today = satırlar). Hiçbiri olmazsa hata atar (detail: nedenler).
export async function loadSeriesWeek({ net, base = DIZI_BASE, timeoutMs = 20000, parallel = 4, nowMs = Date.now(), freeLoader = loadFreeData } = {}) {
  const get = (url) => withTimeout(net.text(url, { fast: true }), timeoutMs);
  const jobs = [{ key: 'week', url: weekPageUrl(base) }, ...WEEKDAYS.map((_, i) => ({ key: i, url: dayPageUrl(i, base) }))];
  const res = await pool(jobs, parallel, async (j) => {
    try { return { j, r: parse1001(await get(j.url), base) }; }
    catch (e) { return { j, err: msg(e) }; }
  });
  const notes = [];
  const week = res[0];
  const map = week.r ? timeMap(week.r.rows) : new Map();
  if (week.err) notes.push('haftalık: ' + week.err);
  const days = WEEKDAYS.map(() => []);
  const failed = [];
  for (const x of res.slice(1)) {
    if (x.err) { failed.push(x.j.key); notes.push(WEEKDAYS[x.j.key][1] + ': ' + x.err); }
    else days[x.j.key] = fillTimes(x.r.rows, map);
  }
  const total = days.reduce((n, d) => n + d.length, 0);
  const d1001 = week.r ? (week.r.diag.cards + ' kart, ' + week.r.diag.anchors + ' dizi bağlantısı; örnek: ' + (week.r.diag.sample || '—')) : (week.err || '');
  let freeDays = WEEKDAYS.map(() => []);
  let freeError = '';
  try { freeDays = freeDiziDays(await freeLoader(net, { now: nowMs }), nowMs); }
  catch (e) { freeError = msg(e); notes.push('ücretsiz EPG: ' + freeError); }
  const freeCount = freeDays.reduce((n, d) => n + d.length, 0);
  const todayIdx = istDayIndex(nowMs);
  const tomorrowIdx = (todayIdx + 1) % 7;
  if (total) {
    const before = days[todayIdx].length + days[tomorrowIdx].length;
    days[todayIdx] = mergeDiziRows(days[todayIdx], freeDays[todayIdx]);
    days[tomorrowIdx] = mergeDiziRows(days[tomorrowIdx], freeDays[tomorrowIdx]);
    const added = days[todayIdx].length + days[tomorrowIdx].length - before;
    return {
      days, via: freeCount ? '1001dizi + ücretsiz EPG' : '1001dizi', failed, coverageDays: 7,
      note: '1001dizi: ' + total + ' satır' + (failed.length ? ', ' + failed.length + ' gün alınamadı' : '') + (freeCount ? '; EPG: ' + freeCount + ' dizi kaydı' : freeError ? '; EPG yedeği: ' + freeError : ''),
      epgCount: freeCount, epgAdded: Math.max(0, added),
    };
  }
  if (freeCount) {
    const epgTotal = freeDays[todayIdx].length + freeDays[tomorrowIdx].length;
    notes.unshift('1001dizi: satır yok (' + (d1001 || 'kaynak yanıt vermedi') + ')');
    return { days: freeDays, via: 'ücretsiz EPG', failed, coverageDays: 2, note: 'Ücretsiz EPG: bugün ve yarın için ' + epgTotal + ' dizi kaydı', epgCount: freeCount, limitedDays: true };
  }
  notes.unshift('1001dizi: satır yok (' + (d1001 || 'kaynak yanıt vermedi') + ')');
  if (!freeError) notes.push('ücretsiz EPG: dizi kategorisinde güncel kayıt bulunamadı');
  const err = new Error('Dizi akışı alınamadı.');
  err.detail = notes.join(' · ').slice(0, 500);
  throw err;
}
