// Ücretsiz günlük TV yayın akışı. Kaynaklar sınanır, geçerliyse alınır; aynı program birden çok kaynaktan gelirse tekrarsız birleştirilir.
// Bu dosyayı iki yer kullanır: sunucu işi (scripts/epg-build.mjs, GitHub Actions: 3 saatte bir birleşik JSON üretir) ve uygulama
// (önce o JSON'u okur; olmazsa kaynaklara doğrudan gider). Saat dilimi Europe/Istanbul (UTC+3, yaz saati yok).
import { XmltvParser, packProg } from './epg.js';
import { decodeEntities, fold } from './util.js';

export const IST_MS = 3 * 3600e3;
const DAY = 864e5;
export const istDayStart = (now, offset = 0) => Math.floor((now + IST_MS) / DAY) * DAY - IST_MS + offset * DAY;
export const istDate = (now, offset = 0) => new Date(istDayStart(now, offset) + IST_MS).toISOString().slice(0, 10);
// Bugün ve yarın (İstanbul gece yarısından iki gün sonrasına kadar)
export const freeWindow = (now) => ({ from: istDayStart(now, 0), to: istDayStart(now, 2) });

const REPO = 'YonetimMerkezi/-ptvplayer';
export const AGG_URLS = [
  `https://raw.githubusercontent.com/${REPO}/epg-data/epg.json`,
  `https://cdn.jsdelivr.net/gh/${REPO}@epg-data/epg.json`,
];
export const AGG_MAX_AGE = 30 * 3600e3; // birleşik dosya bundan eskiyse güncel sayılmaz, kaynaklara doğrudan gidilir
export const MIN_CHANNELS = 8; // bundan az kanal veren kaynak ya da dosya geçersiz sayılır
const MAX_DESC = 160;

// device: false → çok büyük (46 MB açılmış) olduğundan yalnız sunucu işinde alınır.
export const FREE_SOURCES = [
  {
    id: 'tvdebugun',
    name: 'TV’de Bugün (tvdebugun.net)',
    kind: 'html',
    device: true,
    pages: (now) => [0, 1].map((day) => ({ day, url: `https://tvdebugun.net/yayin-akisi/${istDate(now, day)}/` })),
    // Sitenin “bugün hangi diziler/filmler var” sayfaları: kanalların yayın akışında dizi/film olarak duyurduğu programlar (yalnız bugün)
    lists: [
      { url: 'https://tvdebugun.net/bugun-hangi-diziler-var/', kind: 'Dizi' },
      { url: 'https://tvdebugun.net/bugun-hangi-film-var/', kind: 'Film' },
    ],
  },
  { id: 'openepg', name: 'Open-EPG', kind: 'xmltv', device: true, url: 'https://www.open-epg.com/files/turkey1.xml.gz' },
  { id: 'epgshare', name: 'EPGShare', kind: 'xmltv', device: true, url: 'https://epgshare01.online/epgshare01/epg_ripper_TR1.xml.gz' },
  { id: 'teleonline', name: 'Teleonline', kind: 'xmltv', device: false, country: 'tr', url: 'https://teleonline.github.io/epg/epg.xml.gz' },
];

// ---------------------------------------------------------------- kanal adı standardı

const QUALITY = new Set(['hd', 'fhd', 'uhd', 'sd', '4k', '8k', 'hevc', 'h264', 'h265', '1080', '1080p', '720', '720p', '50fps', '60fps', 'raw']);
const ALIASES = { fox: 'now', foxtv: 'now', nowtv: 'now' };

// "TR: ATV HD", "ATV.tr", "Atv" → "atv"; "STAR TV HD" / "Star" → "star". Boşluk, nokta, kalite eki ve ülke öneki atılır.
export function chanKey(name) {
  let s = fold(name);
  if (!s) return '';
  s = s.replace(/^\|[a-z]{2,3}\|\s*/, '').replace(/^[a-z]{2,3}\s*(?:[:|»>⇒]|-\s)\s*/, '');
  s = s.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/[.\-_/|:⇒»>,]+/g, ' ');
  let toks = s.split(/\s+/).filter(Boolean);
  if (toks.length > 1 && toks[toks.length - 1] === 'tr') toks.pop();
  toks = toks.filter((t) => !QUALITY.has(t));
  let key = toks.join('');
  if (key.endsWith('tv') && key.length - 2 >= 3) key = key.slice(0, -2);
  return ALIASES[key] || key;
}

// ---------------------------------------------------------------- tvdebugun.net ayrıştırıcı

const attrText = (s) => decodeEntities(String(s || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const RE_DUR = /^(?:(\d+)\s*sa)?\s*(?:(\d+)\s*dk)?$/i;

function durationMin(part) {
  const m = RE_DUR.exec(part.trim());
  if (!m || (!m[1] && !m[2])) return null;
  return Number(m[1] || 0) * 60 + Number(m[2] || 0);
}

const FLAGS = { 'YENİ BÖLÜM': 'n', 'YENI BOLUM': 'n', TEKRAR: 'r', CANLI: 'l' };

// Bir gün sayfası → { date: sayfanın gösterdiği gün (yyyy-mm-dd) ya da '', channels: [{ name, list: [{ s, e|null, t, c, f }] }] }
export function parseTvdebugun(html, dayStartMs) {
  const src = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '');
  const dm = /yayin-akisi\/(\d{4}-\d{2}-\d{2})\//.exec(src);
  const out = { date: dm ? dm[1] : '', channels: [] };
  const cards = src.split('<li class="kart">').slice(1);
  for (const card of cards) {
    const nm = /<img[^>]*kanal-logo[^>]*\/?>\s*<a [^>]*>([^<]+)<\/a>/i.exec(card);
    if (!nm) continue;
    const name = attrText(nm[1]);
    const list = [];
    const re = /<li class="akis-satir"[^>]*>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = re.exec(card))) {
      const row = m[1];
      const tm = /<time[^>]*>(\d{1,2}):(\d{2})<\/time>/i.exec(row);
      if (!tm) continue;
      const t = (/class="akis-program-bag"[^>]*>([^<]*)</i.exec(row) || /class="akis-ad"[^>]*>([^<]*)</i.exec(row) || [])[1];
      if (!t) continue;
      const alt = (/class="akis-alt"[^>]*>([^<]*)</i.exec(row) || [])[1] || '';
      let c = '';
      let dur = null;
      for (const part of attrText(alt).split('·').map((x) => x.trim()).filter(Boolean)) {
        const d = durationMin(part);
        if (d != null) dur = d;
        else c = part;
      }
      let f = '';
      const bm = /class="akis-rozet"[^>]*>([^<]+)</i.exec(row);
      if (bm) f = FLAGS[attrText(bm[1]).toLocaleUpperCase('tr')] || '';
      const s = dayStartMs + (Number(tm[1]) * 60 + Number(tm[2])) * 60000;
      let title = attrText(t);
      if (f === 'l') title = title.replace(/^canl[ıi]\s+/i, '') || title; // başlıkta tekrarlanan "CANLI" öneki rozet olarak zaten var
      const p = { s, e: null, t: title, c, f, dur };
      list.push(p);
    }
    list.sort((a, b) => a.s - b.s);
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const next = list[i + 1];
      const byDur = p.dur ? p.s + p.dur * 60000 : null;
      p.e = byDur != null && (!next || byDur <= next.s) ? byDur : next ? next.s : null;
      delete p.dur;
    }
    if (list.length) out.channels.push({ name, list });
  }
  return out;
}

const TR_MONTHS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];

// “Bugün hangi diziler/film var” sayfası → { date: sayfanın günü (yyyy-mm-dd) ya da '', rows: [{ s, t, ch }] }
export function parseTvdebugunList(html, dayStartMs) {
  const src = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '');
  let date = '';
  const dm = />\s*(\d{1,2})\s+([^\s<\d]+)\s+(\d{4})\s*·/.exec(src);
  if (dm) {
    const mi = TR_MONTHS.indexOf(fold(dm[2]));
    if (mi >= 0) date = `${dm[3]}-${String(mi + 1).padStart(2, '0')}-${String(Number(dm[1])).padStart(2, '0')}`;
  }
  const rows = [];
  const re = /<li class="yapim-satir[^"]*">([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(src))) {
    const tm = /class="yapim-saat"[^>]*>\s*(\d{1,2}):(\d{2})/i.exec(m[1]);
    const t = /class="yapim-ad[^"]*"[^>]*>([^<]+)</i.exec(m[1]);
    const ch = /class="yapim-kanal"[\s\S]*?<span>([^<]+)<\/span>/i.exec(m[1]);
    if (!tm || !t || !ch) continue;
    rows.push({ s: dayStartMs + (Number(tm[1]) * 60 + Number(tm[2])) * 60000, t: attrText(t[1]), ch: attrText(ch[1]) });
  }
  return { date, rows };
}

// ---------------------------------------------------------------- kaynak alma

// Bitişi başlangıçtan önce/aynı olan kayıt (ör. süresiz "canlı yayın" satırı) sonraki programın başlangıcına kadar sürer; sonraki yoksa atılır.
function sane(list) {
  const a = [...list].sort((x, y) => x.s - y.s);
  const out = [];
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    if (p.e > p.s) out.push(p);
    else {
      const next = a.slice(i + 1).find((q) => q.s > p.s);
      if (next) out.push({ ...p, e: next.s });
    }
  }
  return out;
}

const lastStartOf = (chs) => chs.reduce((m, c) => c.list.reduce((a, p) => Math.max(a, p.s), m), 0);

function stats(chs, now, win) {
  let pr = 0;
  let onAir = 0;
  let tomorrow = false;
  let ep = 0;
  let flagged = 0;
  const samples = [];
  for (const c of chs) {
    pr += c.list.length;
    if (c.list.some((p) => p.s <= now && p.e > now)) onAir++;
    for (const p of c.list) {
      if (p.s >= istDayStart(now, 1) && p.s < win.to) tomorrow = true;
      if (p.x) ep++;
      if (p.f) flagged++;
      if (p.x && samples.length < 3) samples.push(p.x);
    }
  }
  return { ch: chs.length, pr, onAir, tomorrow, withEpisode: ep, flagged, lastStart: lastStartOf(chs), episodeSamples: samples };
}

async function fetchXmltv(src, net, now) {
  const win = freeWindow(now);
  const parser = new XmltvParser({
    from: win.from,
    to: win.to,
    maxDesc: MAX_DESC,
    accept: src.country ? (id) => fold((parser.channels.get(id) || {}).country) === src.country : null,
  });
  let bytes = 0;
  await net.read(src.url, { onText: (t) => parser.push(t), onProgress: (n) => (bytes = n) });
  const r = parser.end();
  const countries = {};
  for (const ch of r.channels.values()) countries[ch.country || '?'] = (countries[ch.country || '?'] || 0) + 1;
  const chs = [];
  for (const [id, list] of r.byChannel) {
    if (!list.length) continue;
    const ch = r.channels.get(id);
    const name = String((ch && ch.name) || id).replace(/\.tr$/i, '').trim();
    chs.push({ name, list: list.map((p) => ({ s: p.s, e: p.e, t: p.t, d: p.d, c: p.c, x: p.x || '', f: p.f || '' })) });
  }
  return { channels: chs, bytes, total: r.channels.size, countries };
}

async function fetchHtml(src, net, now) {
  const win = freeWindow(now);
  const byName = new Map();
  const notes = [];
  let pages = 0;
  let bytes = 0;
  for (const pg of src.pages(now)) {
    try {
      const html = await net.text(pg.url);
      bytes += html.length;
      const r = parseTvdebugun(html, istDayStart(now, pg.day));
      // Site istenen günü değil başka günü döndürürse (ya da tarih yoksa) o sayfa kullanılmaz
      if (r.date !== istDate(now, pg.day)) {
        notes.push(`${istDate(now, pg.day)} sayfası farklı gün gösteriyor`);
        continue;
      }
      pages++;
      for (const c of r.channels) {
        const k = chanKey(c.name) || c.name;
        const cur = byName.get(k);
        if (cur) cur.list.push(...c.list);
        else byName.set(k, { name: c.name, list: [...c.list] });
      }
    } catch (e) {
      notes.push(`${istDate(now, pg.day)}: ${e.message || e}`);
    }
  }
  if (!pages) throw new Error(notes.join('; ') || 'Gün sayfası alınamadı');

  // Tür: sitenin dizi/film listelerinde geçen programlar o türde işaretlenir (kaynakta tür yazıyorsa dokunulmaz).
  let typed = 0;
  let inferred = 0;
  const todayAired = [];
  for (const lst of src.lists || []) {
    try {
      const r = parseTvdebugunList(await net.text(lst.url), istDayStart(now, 0));
      if (r.date !== istDate(now, 0)) {
        notes.push(`${lst.kind} listesi farklı gün gösteriyor`);
        continue;
      }
      for (const row of r.rows) {
        const key = chanKey(row.ch) || row.ch;
        const ch = byName.get(key);
        if (!ch) continue;
        const near = ch.list
          .filter((p) => Math.abs(p.s - row.s) <= 2 * 60e3 && (titlesCompatible(p.t, row.t) || Math.abs(p.s - row.s) <= 60e3))
          .sort((a, b) => Math.abs(a.s - row.s) - Math.abs(b.s - row.s))[0];
        if (near && !near.c) {
          near.c = lst.kind;
          typed++;
        }
        // Kaynak programı başka türde yazmışsa (ör. "Belgesel") yarına tür taşınmaz
        if (near && near.c === lst.kind) todayAired.push({ key, tk: tkey(row.t), kind: lst.kind });
      }
    } catch (e) {
      notes.push(`${lst.kind} listesi: ${e.message || e}`);
    }
  }
  // Yarın için site liste vermez (hafta günü sayfaları geçmiş haftalardan derlenir). Bugün dizi/film listesinde geçen aynı ad ve aynı
  // kanaldaki yarınki programlar aynı türde sayılır.
  const tomorrow = istDayStart(now, 1);
  for (const a of todayAired) {
    if (!a.tk) continue;
    for (const p of byName.get(a.key).list) {
      if (p.s >= tomorrow && !p.c && tkey(p.t) === a.tk) {
        p.c = a.kind;
        inferred++;
      }
    }
  }
  const chs = [];
  for (const c of byName.values()) {
    c.list.sort((a, b) => a.s - b.s);
    // Günün son programının bitişi ertesi günün ilk programına kadardır; o da yoksa pencere sonu
    for (let i = 0; i < c.list.length; i++) {
      const p = c.list[i];
      if (p.e == null) p.e = c.list[i + 1] ? c.list[i + 1].s : win.to;
      p.d = '';
      p.x = '';
    }
    chs.push(c);
  }
  return { channels: chs, bytes, note: notes.join('; '), typed, inferred };
}

// Tek kaynağı alır ve sınar. Dönüş: { id, name, ok, error?, ms, bytes, ch, pr, lastStart, tomorrow, onAir, channels }
export async function fetchSource(src, net, now = Date.now()) {
  const t0 = Date.now();
  const res = { id: src.id, name: src.name, ok: false, ms: 0, bytes: 0, ch: 0, pr: 0, lastStart: 0, tomorrow: false, onAir: 0, channels: [] };
  try {
    const win = freeWindow(now);
    const got = src.kind === 'html' ? await fetchHtml(src, net, now) : await fetchXmltv(src, net, now);
    const chs = got.channels
      .map((c) => ({ name: c.name, list: sane(c.list).filter((p) => p.e > win.from && p.s < win.to && p.t) }))
      .filter((c) => c.list.length);
    Object.assign(res, { channels: chs, bytes: got.bytes, note: got.note || '', typed: got.typed || 0, inferred: got.inferred || 0 }, stats(chs, now, win));
    if (src.country && !res.ch) {
      const top = Object.entries(got.countries || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ${n}`).join(', ');
      throw new Error(`“${src.country}” ülke kanalı yok (kaynakta ${got.total || 0} kanal; ülkeler: ${top || '—'})`);
    }
    if (res.ch < MIN_CHANNELS) throw new Error(res.ch ? `çok az kanal (${res.ch})` : 'bugün için program yok (güncel değil)');
    if (res.onAir / res.ch < 0.5) throw new Error(`güncel değil: şu an yayında görünen kanal ${res.onAir}/${res.ch}`);
    res.ok = true;
  } catch (e) {
    res.error = String((e && e.message) || e);
    res.ok = false;
  }
  res.ms = Date.now() - t0;
  return res;
}

// ---------------------------------------------------------------- birleştirme

const GAP_OVERLAP = 5 * 60e3;
const tkey = (t) =>
  fold(t)
    .replace(/\b\d+\s*\.?\s*(?:bolum|bol)\b/g, ' ')
    .replace(/\bs\d{1,2}\s*e\d{1,3}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');

function titlesCompatible(a, b) {
  const x = tkey(a);
  const y = tkey(b);
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x)));
}

// Aynı yayın dilimi: başlangıçlar neredeyse aynıysa (bir kanalda aynı anda iki program olamaz) ya da biraz kaymış ama adlar uyumluysa
export function sameSlot(a, b) {
  const d = Math.abs(a.s - b.s);
  if (d <= 15 * 60e3 && titlesCompatible(a.t, b.t)) return true;
  // Başlangıçlar neredeyse aynı: süreleri de benzemeli (2 dakikalık "İstiklal Marşı" 45 dakikalık programın kopyası değildir)
  const da = Math.max(1, a.e - a.s);
  const db = Math.max(1, b.e - b.s);
  return d <= 2 * 60e3 && Math.min(da, db) / Math.max(da, db) >= 0.5;
}

function coverage(list, win) {
  let sum = 0;
  for (const p of list) sum += Math.max(0, Math.min(p.e, win.to) - Math.max(p.s, win.from));
  return sum;
}

// Bir kanalın kaynaklarındaki programları tek listede toplar. En çok yayın süresini kapsayan kaynak temel olur ve olduğu gibi alınır;
// diğer kaynaklar yalnız başka kaynaktaki karşılığını bulursa onu tamamlar (boş açıklama/tür/bölüm/etiket) ya da temelde boş kalan
// aralığı doldurur. Çakışan kopya eklenmez. Bir kaynak kendi içinde asla "kopya" sayılmaz (araya giren kısa programlar korunur).
export function mergePrograms(lists, win, stat = null) {
  const order = lists.map((l, i) => ({ ...l, i, cov: coverage(l.list, win) })).sort((a, b) => b.cov - a.cov || a.i - b.i);
  const out = [];
  const clip = (a, b) => Math.min(a.e, b.e) - Math.max(a.s, b.s);
  for (const [n, src] of order.entries()) {
    for (const p of src.list) {
      const cands = out.filter((q) => q.src !== src.id && sameSlot(q, p));
      if (cands.length) {
        cands.sort((a, b) => Number(!titlesCompatible(a.t, p.t)) - Number(!titlesCompatible(b.t, p.t)) || Math.abs(a.s - p.s) - Math.abs(b.s - p.s));
        const hit = cands[0];
        if (stat) stat.dup++;
        for (const k of ['d', 'c', 'x', 'f']) {
          if (!hit[k] && p[k]) {
            hit[k] = p[k];
            if (stat) stat.filled++;
          }
        }
        continue;
      }
      if (n > 0) {
        const dur = Math.max(1, p.e - p.s);
        const clash = out.some((q) => clip(q, p) > GAP_OVERLAP || clip(q, p) > dur / 2);
        if (clash) {
          if (stat) stat.clash++;
          continue;
        }
      }
      out.push({ s: p.s, e: p.e, t: p.t, d: p.d || '', c: p.c || '', x: p.x || '', f: p.f || '', src: src.id });
    }
  }
  out.sort((a, b) => a.s - b.s || a.e - b.e);
  if (stat) stat.base = order[0] ? order[0].id : '';
  return out.filter((p) => p.e > win.from && p.s < win.to).map(({ src, ...rest }) => rest);
}

const srcMeta = (r, used) => ({
  id: r.id,
  name: r.name,
  ok: !!r.ok,
  ...(r.error ? { error: r.error } : {}),
  ch: r.ch || 0,
  pr: r.pr || 0,
  ...(r.lastStart ? { lastStart: r.lastStart } : {}),
  ...(r.updated ? { updated: r.updated } : {}),
  tomorrow: !!r.tomorrow,
  withEpisode: r.withEpisode || 0,
  flagged: r.flagged || 0,
  ...(r.typed ? { typed: r.typed } : {}),
  ...(r.inferred ? { inferred: r.inferred } : {}),
  ...(r.note ? { note: r.note } : {}),
  ...(r.episodeSamples && r.episodeSamples.length ? { episodeSamples: r.episodeSamples } : {}),
  used: used || 0,
  ms: r.ms || 0,
});

// Sınanmış kaynak sonuçlarından birleşik veri: { v, at, from, to, tz, sources, ch: { anahtar: { n: ad, p: [satırlar] } } }
export function buildFreeData(results, now = Date.now(), { detail = false } = {}) {
  const win = freeWindow(now);
  const byKey = new Map();
  const nameFrom = new Map();
  const used = new Map();
  for (const r of results) {
    if (!r.ok) continue;
    const mine = new Map(); // aynı kaynakta aynı anahtara düşen kanallardan programı çok olan kalır
    for (const c of r.channels) {
      const k = chanKey(c.name);
      if (!k || k.length < 2) continue;
      const cur = mine.get(k);
      if (!cur || c.list.length > cur.list.length) mine.set(k, c);
    }
    for (const [k, c] of mine) {
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push({ id: r.id, list: c.list, raw: c.name });
      // Ad: html kaynağı (düzgün yazılmış) önce, yoksa ilk gelen
      if (!nameFrom.has(k) || r.id === 'tvdebugun') nameFrom.set(k, c.name);
      used.set(r.id, (used.get(r.id) || 0) + 1);
    }
  }
  const ch = {};
  const info = {};
  for (const [k, lists] of byKey) {
    const stat = { dup: 0, filled: 0, clash: 0, base: '' };
    // Kanal D için EPGShare saatleri, diğer kaynaklardaki hatalı/uzatılmış program sürelerinden daha tutarlı.
    // Özellikle Ana Haber ve Beyaz'la Joker bitişleri yanlışlıkla bir sonraki güne kadar uzatılabiliyor.
    const preferredKanalD = k === 'kanald'
      ? (lists.find((l) => l.id === 'epgshare') || lists.find((l) => l.id === 'openepg') || lists.find((l) => l.id === 'tvdebugun'))
      : null;
    const merged = preferredKanalD
      ? mergePrograms([preferredKanalD], win, detail ? stat : null)
      : mergePrograms(lists, win, detail ? stat : null);
    if (!merged.length) continue;
    ch[k] = { n: nameFrom.get(k), p: merged.map(packProg) };
    if (detail) info[k] = { n: nameFrom.get(k), src: Object.fromEntries(lists.map((l) => [l.id, l.list.length])), names: Object.fromEntries(lists.map((l) => [l.id, l.raw])), out: merged.length, ...stat };
  }
  const data = { v: 1, at: now, from: win.from, to: win.to, tz: 'Europe/Istanbul', sources: results.map((r) => srcMeta(r, used.get(r.id))), ch };
  return detail ? { data, info } : data;
}

// Birleşik veri kullanılabilir mi? (biçim, kanal sayısı, yaş, pencere şimdiyi kapsıyor mu)
export function validateFree(data, now = Date.now()) {
  if (!data || typeof data !== 'object' || data.v !== 1 || !data.ch || typeof data.ch !== 'object') return { ok: false, error: 'Beklenmeyen biçim' };
  const n = Object.keys(data.ch).length;
  if (n < MIN_CHANNELS) return { ok: false, error: `Çok az kanal (${n})` };
  if (!Number.isFinite(data.at) || data.at > now + 15 * 60e3) return { ok: false, error: 'Geçersiz tarih' };
  if (now - data.at > AGG_MAX_AGE) return { ok: false, error: `Eski (${Math.round((now - data.at) / 3600e3)} sa önce)` };
  if (!(data.from <= now && now < data.to)) return { ok: false, error: 'Bugünü kapsamıyor' };
  return { ok: true };
}

// ---------------------------------------------------------------- uygulama tarafı

// Kullanıcının canlı kanallarını birleşik verideki kanallarla eşler; EPG verisi biçiminde ({ map, prog }) döner.
// Rehber kanal kimliği "~anahtar" olur (sağlayıcının kendi XMLTV kimlikleriyle çakışmaz).
export function matchFree(free, live) {
  const map = {};
  const prog = {};
  for (const it of live) {
    let k = '';
    for (const n of [it.tvgName, it.name]) {
      const key = chanKey(n);
      if (key && free.ch[key]) {
        k = key;
        break;
      }
    }
    if (!k) continue;
    const eid = '~' + k;
    map[it.id] = eid;
    if (!prog[eid]) prog[eid] = free.ch[k].p;
  }
  return { map, prog, matched: Object.keys(map).length };
}

// Sağlayıcı rehberi (varsa) önceliklidir; ücretsiz rehber yalnız onda programı olmayan kanalları doldurur.
export function mergeEpgData(base, extra) {
  if (!extra) return base;
  if (!base) return extra;
  const map = { ...base.map };
  const prog = { ...base.prog };
  for (const [id, eid] of Object.entries(extra.map)) {
    // Kanal D'de sağlayıcı XMLTV'si bazen haber/yarışma sürelerini hatalı uzatıyor.
    // Birleşik EPG'deki doğrulanmış EPGShare akışını bu kanal için de uygula.
    if (eid === '~kanald' && extra.prog[eid] && extra.prog[eid].length) {
      map[id] = eid;
      prog[eid] = extra.prog[eid];
      continue;
    }
    if (map[id] && prog[map[id]] && prog[map[id]].length) continue;
    map[id] = eid;
    prog[eid] = extra.prog[eid];
  }
  const free = extra.free || base.free;
  return { ...base, map, prog, matched: Object.keys(map).length, ...(free ? { free } : {}) };
}

// Ücretsiz rehberi getirir. Sıra: 1) sunucu işinin birleşik JSON'u (iki adres), 2) kaynaklara doğrudan (yalnız cihazda alınabilenler).
// En az bir yol geçerli veri verirse döner; hiçbiri vermezse nedenleriyle hata atar.
export async function loadFreeData(net, { now = Date.now(), sources = FREE_SOURCES, aggUrls = AGG_URLS } = {}) {
  const why = [];
  for (const url of aggUrls) {
    try {
      const data = await net.json(`${url}?t=${Math.floor(now / 600e3)}`, { fast: true });
      const v = validateFree(data, now);
      if (v.ok) return { ...data, via: 'sunucu' };
      why.push(`${new URL(url).hostname}: ${v.error}`);
    } catch (e) {
      why.push(`${new URL(url).hostname}: ${e.message || e}`);
    }
  }
  const results = [];
  for (const src of sources.filter((s) => s.device)) results.push(await fetchSource(src, net, now));
  if (results.some((r) => r.ok)) return { ...buildFreeData(results, now), via: 'doğrudan' };
  for (const r of results) why.push(`${r.name}: ${r.error}`);
  throw new Error('Ücretsiz rehber kaynaklarının hiçbiri alınamadı');
}

// "Kaynakları dene": her yolu ayrı ayrı sınar; sonuç satırları ekranda gösterilir.
export async function probeFreeSources(net, { now = Date.now(), sources = FREE_SOURCES, aggUrls = AGG_URLS } = {}) {
  const rows = [];
  for (const url of aggUrls) {
    const t0 = Date.now();
    const host = new URL(url).hostname;
    try {
      const data = await net.json(`${url}?t=${now}`, { fast: true });
      const v = validateFree(data, now);
      rows.push({ id: host, name: `Birleşik özet (${host})`, ok: v.ok, error: v.error, ch: Object.keys((data && data.ch) || {}).length, at: data && data.at, ms: Date.now() - t0 });
    } catch (e) {
      rows.push({ id: host, name: `Birleşik özet (${host})`, ok: false, error: String(e.message || e), ms: Date.now() - t0 });
    }
  }
  for (const src of sources) {
    if (!src.device) {
      rows.push({ id: src.id, name: src.name, ok: null, error: 'Çok büyük; yalnız sunucu işinde alınır' });
      continue;
    }
    const r = await fetchSource(src, net, now);
    rows.push({ id: r.id, name: r.name, ok: r.ok, error: r.error, ch: r.ch, pr: r.pr, lastStart: r.lastStart, ms: r.ms, tomorrow: r.tomorrow });
  }
  return rows;
}
