// Yayın akışı siteleri: maç takvimi (saat, takımlar, yarışma) ve maçın Türkiye'deki kanalları.
// Birincil: Spor Ekranı (sporekrani.com). Yedekler sırayla: Maç Rehberi (macrehberi.com, aynı yayıncının günlük sayfası), Sahadan (yalnız bugün),
// LiveSoccerTV. Resmî API değil, herkese açık HTML sayfalarıdır; sayfa yapısı değişebilir. Bu yüzden ayrıştırıcılar esnektir (satırın yapılandırılmış
// parçaları ya da düz metni ile çalışır) ve ne okuduklarını gösteren bir teşhis (diag) döndürür. Hiçbir okuma hata atmaz.
// Saf mantık (ağ dışarıdan verilir). Ekran sports-ui.js'te.
import { fold } from './util.js';
import { norm, hasAny, teamPhrases, teamLabel, withTimeout } from './sports.js';

export const SE_BASE = 'https://www.sporekrani.com';

const pad = (n) => String(n).padStart(2, '0');

// Yerel takvim gününün YYYY-MM-DD anahtarı
export const seDateKey = (dayMs) => {
  const d = new Date(dayMs);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const seUrl = (dayMs, base = SE_BASE) => `${base}/home/day/${seDateKey(dayMs)}`;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

// Bağlantının iç HTML'i → metin parçaları (etiketler ayraç; <img alt="…"> da bir parça)
export function tokensOf(inner) {
  const withAlt = String(inner).replace(/<img\b[^>]*?\balt\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi, (m, a, b) => `\n${a ?? b ?? ''}\n`);
  return decodeEntities(withAlt.replace(/<[^>]*>/g, '\n'))
    .split('\n')
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const eqTok = (a, b) => fold(a) === fold(b);

// Bağlantının iç HTML'indeki <img> etiketleri → [{ alt, url }]. Adres: boyutlandırılmış srcset varsa onun ilki, yoksa tembel yükleme (data-src) ya da src.
export function imgsOf(inner, base = SE_BASE) {
  const out = [];
  for (const m of String(inner).matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = (re) => {
      const x = re.exec(tag) || [];
      return decodeEntities(x[1] ?? x[2] ?? '').trim();
    };
    const alt = attr(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const srcset = attr(/\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/i).split(',')[0].trim().split(/\s+/)[0];
    const raw = srcset || attr(/\bdata-(?:src|lazy-src|original)\s*=\s*(?:"([^"]*)"|'([^']*)')/i) || attr(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (!raw || raw.startsWith('data:')) continue;
    try {
      const u = new URL(raw, base);
      if (u.protocol === 'https:' || u.protocol === 'http:') out.push({ alt, url: u.href });
    } catch {
      /* geçersiz adres atlanır */
    }
  }
  return out;
}

// <img> etiketlerinden ad → logo adresi (alt metni kanal adıdır)
export function logosOf(inner, base = SE_BASE) {
  const out = {};
  for (const { alt, url } of imgsOf(inner, base)) if (alt) out[fold(alt)] = url;
  return out;
}

// "Yayın Yok" kanal değildir
const noChannel = (c) => /^yayin yok$/.test(norm(c));

// Yarışma adının başladığı yerler (başlık tek parça gelirse "A - B UEFA Uluslar Ligi" ayrıştırılır)
const COMP_START = /(?:^|\s)(UEFA|TFF|S[üu]per Lig|[123]\. Lig|Premier Lig|La Liga|Serie [AB]|Bundesliga|Ligue [12]|Eredivisie|Haz[ıi]rl[ıi]k|D[üu]nya Kupas[ıi]|Avrupa|[ŞS]ampiyonlar|Konferans|T[üu]rkiye Kupas[ıi]|[İI]spanya|[İI]ngiltere|Almanya|[İI]talya|Fransa|Hollanda|Portekiz|Brezilya|Arjantin|Suudi|Kad[ıi]nlar|MLS|CONMEBOL|AFC|CAF|Kupa)/i;

// Başlık parçaları ("A - B", yarışma…) → { teams: [A, B] | null, comp }
export function splitTitle(rest) {
  const toks = rest.map((t) => String(t).trim()).filter(Boolean);
  const ti = toks.findIndex((t) => / [-–] /.test(t));
  if (ti < 0) return { teams: null, comp: '' };
  let head = toks[ti];
  let comp = toks.slice(ti + 1).join(' ');
  if (!comp) {
    const i0 = head.search(/ [-–] /);
    const tail = head.slice(i0 + 3);
    let cut = -1;
    for (let k = 1; k < tail.length && cut < 0; k++) {
      if (tail[k - 1] !== ' ') continue;
      const m = COMP_START.exec(tail.slice(k - 1));
      if (m && m.index === 0) cut = k;
    }
    if (cut > 1) {
      comp = tail.slice(cut).trim();
      head = head.slice(0, i0 + 3) + tail.slice(0, cut).trim();
    }
  }
  const parts = head.split(/ [-–] /);
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) return { teams: null, comp };
  return { teams: [parts[0].trim(), parts[1].trim()], comp: comp.trim() };
}

// Kanal adı sözcüklerinin başladığı yerler (düz metinde bitişik yazılmış kanallar bölünürken)
const BRANDS = new Set(['bein', 'trt', 'atv', 'a2', 'tivibu', 'tabii', 'exxen', 'disney', 'prime', 'youtube', 'tod', 'eurosport', 'dazn', 'nba', 'digiturk', 'tv8', 'nesine']);
export function splitChannels(words) {
  const out = [];
  words.forEach((w, i) => {
    const f = fold(w);
    const n = fold(words[i + 1] || '');
    const start = BRANDS.has(f) || (f === 's' && n === 'sport') || (f === 'a' && (n === 'spor' || n === 'haber'));
    if (start || !out.length) out.push([w]);
    else out[out.length - 1].push(w);
  });
  return out.map((x) => x.join(' '));
}

// Parçaların sonundan kanal listesini çıkarır. Sayfada her kanal adı iki kez geçer ("Tivibu Spor 1 Tivibu Spor 1";
// "S Sport Plus S Sport 2 S Sport Plus S Sport 2"): sondaki "X X" tekrarı kanal listesidir. Döner: { channels, rest } (rest: kanalsız baş kısım).
export function extractChannels(tokens) {
  const n = tokens.length;
  // a) bitişik çiftler ("A A B B"): en az iki çift varsa kesin (tek çift aşağıdaki "X X" ile aynı sonucu verir)
  const pairs = [];
  let i = n - 1;
  while (i >= 1 && eqTok(tokens[i], tokens[i - 1])) {
    pairs.unshift(tokens[i]);
    i -= 2;
  }
  if (pairs.length >= 2) return { channels: dedupe(pairs), rest: tokens.slice(0, i + 1) };
  // b) parça düzeyinde "X X" tekrarı
  for (let k = Math.min(6, n >> 1); k >= 1; k--) {
    let same = true;
    for (let j = 0; j < k; j++) if (!eqTok(tokens[n - k + j], tokens[n - 2 * k + j])) same = false;
    if (same) return { channels: dedupe(tokens.slice(n - k)), rest: tokens.slice(0, n - 2 * k) };
  }
  // c) düz metin: sözcük düzeyinde "X X" tekrarı
  const words = tokens.join(' ').split(' ').filter(Boolean);
  const m = words.length;
  for (let k = Math.min(10, m >> 1); k >= 1; k--) {
    let same = true;
    for (let j = 0; j < k; j++) if (fold(words[m - k + j]) !== fold(words[m - 2 * k + j])) same = false;
    if (same) return { channels: dedupe(splitChannels(words.slice(m - k))), rest: [words.slice(0, m - 2 * k).join(' ')] };
  }
  // d) kanal adları tekrarsız yazılmışsa: sondaki parçalardan bilinen kanal markasıyla başlayanlar
  const isChan = (t) => {
    const w = t.split(' ');
    const f = fold(w[0]);
    const nx = fold(w[1] || '');
    return BRANDS.has(f) || (f === 's' && nx === 'sport') || (f === 'a' && (nx === 'spor' || nx === 'haber'));
  };
  let j = n;
  while (j > 1 && isChan(tokens[j - 1])) j--;
  if (j < n && j >= 1) return { channels: dedupe(tokens.slice(j)), rest: tokens.slice(0, j) };
  return { channels: [], rest: tokens };
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const k = fold(c);
    if (c && c.length <= 40 && !seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  }
  return out.slice(0, 6);
}

const hrefRe = (path) => new RegExp(`<a\\b[^>]*?\\bhref\\s*=\\s*(?:"([^"]*${path}[^"]*)"|'([^']*${path}[^']*)')[^>]*>([\\s\\S]*?)<\\/a>`, 'gi');
// Spor Ekranı: /home/match/{id}/{Y}/{M}/{D}/slug; Maç Rehberi: /mac/{id}/{Y}/{M}/{D}/slug
const SE_ANCHOR = '/(?:home/match|mac)/(\\d+)/(\\d{4})/(\\d{1,2})/(\\d{1,2})/';

// Saat (Türkiye saati, UTC+3 sabit) + tarih → ms
export const seTime = (y, mo, d, hh, mm) => Date.parse(`${y}-${pad(mo)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00+03:00`);

const isTime = (t) => /^\d{1,2}[:.]\d{2}$/.test(t);

// Satır futbol mu: spor simgesi (alt metni "Futbol"; Sahadan'da simge adresi .../sports/1.png) ya da simge yoksa ilk sözcük
function isFootball(imgs, tokens) {
  const sp = imgs.find((i) => /\/sports\//.test(i.url));
  if (sp) return /\/icons\/sports\/1\.png/.test(sp.url) || fold(sp.alt) === 'futbol';
  return fold((tokens[0] || '').split(' ')[0]) === 'futbol';
}

// Bir bağlantının iç HTML'i → { teams, comp, channels, logos, title, hh, mm } | null (futbol değil / okunamadı).
// Kanallar varsa görsellerinden (alt metni kanal adı) okunur; görseller yoksa metindeki "X X" tekrarlarından çıkarılır.
function rowOf(inner, base, diag) {
  const tokens = tokensOf(inner).filter((t) => !/^[a-z]+(?:_[a-z]+)+$/.test(t)); // simge yazı tipi adları (chevron_right…) metin değildir
  if (!tokens.length) return null;
  const flat = tokens.join(' ');
  const imgs = imgsOf(inner, base);
  if (!diag.sample) diag.sample = tokens.join(' | ').slice(0, 140);
  if (!isFootball(imgs, tokens)) return null; // başka spor ya da program
  diag.football++;
  const chImgs = imgs.filter((i) => /\/(?:channels|providers)\//.test(i.url));
  const skip = new Set(imgs.map((i) => fold(i.alt)));
  const toks = chImgs.length ? tokens.filter((t) => !skip.has(fold(t))) : tokens;
  const ti = toks.findIndex(isTime);
  let hh;
  let mm;
  let after;
  if (ti >= 0) {
    [hh, mm] = toks[ti].split(/[:.]/).map(Number);
    after = toks.slice(ti + 1);
  } else {
    const fm = /(?:^|\s)(\d{1,2})[:.](\d{2})(?:\s|$)/.exec(flat);
    if (!fm) return null;
    hh = Number(fm[1]);
    mm = Number(fm[2]);
    after = [flat.slice(flat.indexOf(fm[0]) + fm[0].length).trim()];
  }
  if (!(hh <= 23 && mm <= 59)) return null;
  let channels;
  let rest;
  if (chImgs.length) {
    channels = dedupe(chImgs.map((i) => i.alt)).filter((c) => !noChannel(c));
    rest = after.filter((c) => !noChannel(c));
  } else {
    const ex = extractChannels(after);
    channels = ex.channels.filter((c) => !noChannel(c));
    rest = ex.rest.filter((c) => !noChannel(c));
  }
  diag.fsample = diag.fsample || tokens.join(' | ').slice(0, 160);
  const { teams, comp } = splitTitle(rest);
  if (!teams) return null;
  if (channels.length) diag.withChannel++;
  return { teams, comp: comp.slice(0, 80), channels, logos: logosOf(inner, base), title: rest.join(' ').slice(0, 160), hh, mm };
}

const newDiag = (src) => ({ bytes: src.length, anchors: 0, football: 0, withChannel: 0, sample: '', fsample: '' });

// Günlük sayfa HTML'i (Spor Ekranı / Maç Rehberi) → { rows: [{ id, t, title, teams, comp, channels, logos }], diag }. rows: takımları okunan futbol
// satırları (kanalı olmayanlar da; channels boş). diag: { bytes, anchors, football, withChannel, sample, fsample } — sayfa yapısı değiştiyse neden anlaşılsın.
export function parseSporEkrani(html, base = SE_BASE) {
  const src = typeof html === 'string' ? html : '';
  const rows = [];
  const seen = new Set();
  const diag = newDiag(src);
  const re = hrefRe(SE_ANCHOR);
  for (let m = re.exec(src); m; m = re.exec(src)) {
    try {
      diag.anchors++;
      const id = m[2] || m[7];
      const y = m[3] || m[8];
      const mo = m[4] || m[9];
      const d = m[5] || m[10];
      const r = rowOf(m[11], base, diag);
      if (!r) continue;
      const t = seTime(y, mo, d, r.hh, r.mm);
      if (!Number.isFinite(t) || seen.has(id)) continue;
      seen.add(id);
      rows.push({ id, t, title: r.title, teams: r.teams, comp: r.comp, channels: r.channels, logos: r.logos });
    } catch {
      /* bozuk satır atlanır */
    }
  }
  return { rows, diag };
}

const TR_MONTHS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];

// Sahadan TV programı: yalnız bugünü gösterir (sayfadaki "11 Kasım 2026" başlığı istenen günle uyuşmalı). Satır bağlantısı /mac/{ad}-vs-{ad}/{kod}; yarışma adı yok.
export function parseSahadan(html, base = 'https://www.sahadan.com', dayMs = Date.now()) {
  const src = typeof html === 'string' ? html : '';
  const rows = [];
  const diag = newDiag(src);
  const day = new Date(dayMs);
  const hm = /(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})/i.exec(decodeEntities(src.replace(/<[^>]*>/g, ' ')));
  if (hm) {
    const mi = TR_MONTHS.indexOf(fold(hm[2]));
    if (Number(hm[1]) !== day.getDate() || mi !== day.getMonth() || Number(hm[3]) !== day.getFullYear()) {
      diag.sample = `sayfa günü: ${hm[0]}`;
      return { rows, diag };
    }
  }
  const re = hrefRe('/mac/[a-z0-9-]+/[a-z0-9]{10,}');
  const seen = new Set();
  for (let m = re.exec(src); m; m = re.exec(src)) {
    try {
      diag.anchors++;
      const href = m[1] || m[2];
      const id = href.split('/').pop();
      const r = rowOf(m[3], base, diag);
      if (!r || seen.has(id)) continue;
      const t = seTime(day.getFullYear(), day.getMonth() + 1, day.getDate(), r.hh, r.mm);
      seen.add(id);
      rows.push({ id, t, title: r.title, teams: r.teams, comp: '', channels: r.channels, logos: {} });
    } catch {
      /* bozuk satır atlanır */
    }
  }
  return { rows, diag };
}

const REGIONS = new Set(['avrupa', 'dunya', 'asya', 'afrika', 'kuzey amerika', 'guney amerika', 'orta amerika', 'okyanusya', 'uluslararasi', 'uluslararasi kulupler']);

// LiveSoccerTV günlük program: yarışma başlık satırları (tr.sortable_comp) ve maç satırları (tr.matchrow; kickoff UTC ms: dv='…'). Yalnız futbol.
// Kanallar sayfayı isteyen kişinin ülkesine göredir (Türkiye'den açılınca Türkiye'deki kanallar).
export function parseLiveSoccerTv(html, base = 'https://www.livesoccertv.com') {
  const src = typeof html === 'string' ? html : '';
  const rows = [];
  const diag = newDiag(src);
  const seen = new Set();
  let comp = '';
  const text = (x) => decodeEntities(String(x).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  for (const m of src.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    try {
      const attrs = m[1];
      const inner = m[2];
      if (/\bclass\s*=\s*["'][^"']*sortable_comp/i.test(attrs)) {
        const c = /class="r_complink"[^>]*>([\s\S]*?)<\/a>/i.exec(inner);
        const name = c ? text(c[1]) : '';
        const i = name.indexOf(' - ');
        const region = i > 0 ? name.slice(0, i) : '';
        comp = i > 0 ? (REGIONS.has(norm(region)) ? name.slice(i + 3) : `${region} ${name.slice(i + 3)}`) : name;
        continue;
      }
      if (!/\bclass\s*=\s*["'][^"']*matchrow/i.test(attrs)) continue;
      diag.anchors++;
      diag.football++;
      const id = (/\bid\s*=\s*"?(\d+)/i.exec(attrs) || [])[1];
      const dv = /\bdv\s*=\s*['"](\d{10,})['"]/i.exec(inner);
      const link = /<a\b[^>]*href\s*=\s*"[^"]*\/match\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(inner);
      const title = (link && /\btitle\s*=\s*"([^"]*)"/i.exec(link[0])) || [];
      const name = decodeEntities(title[1] || (link ? text(link[1]) : '')).trim();
      const teams = name.split(/\s+vs?\.?\s+/i).map((x) => x.trim());
      if (!id || !dv || teams.length !== 2 || !teams[0] || !teams[1] || seen.has(id)) continue;
      const chans = [];
      for (const c of inner.matchAll(/<a\b[^>]*href\s*=\s*"[^"]*\/channels\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) chans.push(text(c[1]));
      const channels = dedupe(chans);
      if (channels.length) diag.withChannel++;
      diag.fsample = diag.fsample || `${name} | ${channels.join(', ')}`.slice(0, 160);
      seen.add(id);
      rows.push({ id, t: Number(dv[1]), title: name.slice(0, 160), teams, comp: comp.slice(0, 80), channels, logos: {} });
    } catch {
      /* bozuk satır atlanır */
    }
  }
  return { rows, diag };
}

// Yayın akışı kaynakları (sırayla denenir: ilk satır veren kullanılır)
export const SCHED_BASES = { se: SE_BASE, mr: 'https://www.macrehberi.com', sd: 'https://www.sahadan.com', lst: 'https://www.livesoccertv.com' };
const SCHED = [
  { key: 'se', label: 'Spor Ekranı', url: (d, b) => seUrl(d, b.se), parse: (h, b) => parseSporEkrani(h, b.se) },
  { key: 'mr', label: 'Maç Rehberi', url: (d, b) => `${b.mr}/gun/${seDateKey(d)}`, parse: (h, b) => parseSporEkrani(h, b.mr) },
  { key: 'sd', label: 'Sahadan', todayOnly: true, url: (d, b) => `${b.sd}/tv-programi`, parse: (h, b, d) => parseSahadan(h, b.sd, d) },
  { key: 'lst', label: 'LiveSoccerTV', url: (d, b) => `${b.lst}/tr/schedules/${seDateKey(d)}/`, parse: (h, b) => parseLiveSoccerTv(h, b.lst) },
];

// Bir günün yayın akışı: kaynaklar sırayla denenir, ilk satır veren kullanılır. Döner: { rows, diag, url, via, note }; sayfa tanınan ama futbol satırı olmayan
// bir kaynak varsa boş sonuç döner; hiçbir kaynak alınamazsa hata atar (hata.detail: her kaynağın nedeni).
export async function loadSchedDay({ net, dayMs, bases = SCHED_BASES, timeoutMs = 20000, nowMs = Date.now() } = {}) {
  const notes = [];
  let empty = null;
  for (const src of SCHED) {
    if (src.todayOnly && seDateKey(dayMs) !== seDateKey(nowMs)) continue;
    const url = src.url(dayMs, bases);
    try {
      const html = await withTimeout(net.text(url, { fast: true }), timeoutMs);
      const r = src.parse(html, bases, dayMs);
      if (r.rows.length) return { ...r, url, via: src.key, note: [...notes, `${src.label}: ${seDiagText(r.diag, r.rows.length)}`].join(' · ') };
      notes.push(`${src.label}: ${r.diag.anchors ? seDiagText(r.diag, 0) : `${r.diag.bytes} bayt, maç bağlantısı yok`}`);
      if (r.diag.anchors && !empty) empty = { ...r, url, via: src.key };
    } catch (e) {
      notes.push(`${src.label}: ${String((e && e.message) || e || 'hata').slice(0, 100)}`);
    }
  }
  if (empty) return { ...empty, note: notes.join(' · ') };
  const err = new Error('Yayın akışı alınamadı.');
  err.detail = notes.join(' · ').slice(0, 300) || 'hata';
  throw err;
}

// Teşhis özeti (hiç futbol satırı çıkmadıysa): "412 bağlantı, 0 futbol, 0 kanallı; örnek: Tenis | 00:30 | …"
export const seDiagText = (d, rows = null) => `${d.anchors} bağlantı, ${d.football} futbol${rows ? `, ${rows} maç` : ''}, ${d.withChannel} kanallı; örnek: ${d.fsample || d.sample}`;

const women = (s) => /(^| )(kadin|kadinlar|women|womens|bayan|ladies|w)( |$)/.test(s);
const youth = (s) => /(^| )u ?\d{2}( |$)/.test(s);

// Satır bu maçın satırı mı: iki takımın adı da satır başlığında geçer; kadın/genç işaretleri aynıdır.
function rowIsMatch(match, r, ph) {
  const text = norm(r.title);
  const own = ph.own;
  if (women(text) !== women(own) || youth(text) !== youth(own)) return false;
  const padded = ` ${text} `;
  return hasAny(padded, ph.hp) && hasAny(padded, ph.ap);
}
const phrasesOf = (match) => ({ own: norm(`${match.home.name} ${match.away.name}`), hp: teamPhrases(match.home.name), ap: teamPhrases(match.away.name) });

// Maçın yayın bilgisi: saat ±tolerance içinde, satır başlığında iki takımın da adı geçen satırların kanalları (tekrarsız) ve logoları.
export function seInfoFor(match, rows, { tolerance = 35 * 60000 } = {}) {
  const channels = [];
  const logos = {};
  let ph = null;
  for (const r of rows || []) {
    if (Math.abs(r.t - match.t) > tolerance || !r.channels.length) continue;
    ph = ph || phrasesOf(match);
    if (!rowIsMatch(match, r, ph)) continue;
    for (const c of r.channels) if (!channels.includes(c)) channels.push(c);
    Object.assign(logos, r.logos || {});
  }
  return { channels, logos };
}
export const seChannelsFor = (match, rows, opts) => seInfoFor(match, rows, opts).channels;

// ---- takvim: ESPN/ikinci kaynakta karşılığı olmayan satırlar maç olarak eklenir ----

const TR_FIX = [[/Hazirlik/g, 'Hazırlık'], [/Maçi\b/g, 'Maçı'], [/Kupasi/g, 'Kupası'], [/Kadinlar/g, 'Kadınlar'], [/Turkiye/g, 'Türkiye'], [/Ispanya/g, 'İspanya'], [/Italya/g, 'İtalya'], [/Ingiltere/g, 'İngiltere'], [/Sampiyon/g, 'Şampiyon']];
export const fixTr = (s) => TR_FIX.reduce((x, [re, to]) => x.replace(re, to), String(s || '').trim());

// Yarışma adından grup: 'tr' (Türkiye), 'int' (milli takım), 'eu' (UEFA ve büyük ligler), 'oth'
export function compGroup(comp) {
  const n = norm(comp);
  if (!n) return 'oth';
  if (/(^| )(tff|super lig|turkiye kupasi|super kupa|ziraat)( |$)|^[123] lig/.test(n)) return 'tr';
  if (/^(brezilya|arjantin|meksika|abd|japonya|cin|guney kore|avustralya|suudi|katar|misir|rusya|ukrayna|polonya|romanya|bulgaristan|sirbistan|hirvatistan|yunanistan|isvec|norvec|danimarka|finlandiya|isvicre|avusturya|cekya|macaristan|kolombiya|sili|peru|uruguay|ekvador|azerbaycan|gurcistan)( |$)/.test(n)) return 'oth';
  if (/uluslar|hazirlik|dunya kupasi|eleme|avrupa sampiyonasi|milli|olimpiyat|afrika uluslar|asya kupasi|copa america|altin kupa/.test(n)) return 'int';
  if (/uefa|sampiyonlar ligi|avrupa ligi|konferans|premier|la liga|serie a|bundesliga|ligue 1|eredivisie|primeira|ingiltere|ispanya|italya|almanya|fransa|hollanda|portekiz|belcika|iskocya|fa cup|kral kupasi|dfb|coppa|league cup/.test(n)) return 'eu';
  return 'oth';
}
const compOrd = (comp, grp) => {
  if (grp !== 'tr') return 5;
  const n = norm(comp);
  return /super lig/.test(n) ? 0 : /kupa/.test(n) ? 1 : /(^| )1 lig/.test(n) ? 2 : 3;
};
const slug = (s) => norm(s).replace(/ /g, '-');
const side = (name) => ({ name, label: teamLabel(name), abbr: '', logo: '', score: null, pen: null });

// Spor Ekranı satırları → maç nesneleri (skor/dakika yok; kanallar ve logolar satırdan gelir)
export function seMatches(rows) {
  const out = [];
  for (const r of rows || []) {
    if (!r || !r.teams) continue;
    const comp = fixTr(r.comp);
    const grp = compGroup(comp);
    out.push({
      id: `se:${r.id}`,
      lg: `se:${slug(comp) || 'futbol'}`,
      lgName: comp || 'Futbol',
      grp,
      ord: compOrd(comp, grp),
      src: 'se',
      t: r.t,
      state: 'pre',
      text: '',
      off: false,
      home: side(r.teams[0]),
      away: side(r.teams[1]),
      venue: '',
      intl: [],
      round: '',
      channels: r.channels || [],
      logos: r.logos || {},
    });
  }
  return out;
}

// Birleşik liste: mevcut maçlar (ESPN + ikinci kaynak) + karşılığı olmayan Spor Ekranı satırları.
export function mergeSe(base, rows, { tolerance = 90 * 60000 } = {}) {
  const have = new Set(base.map((m) => m.id));
  const extra = [];
  const phs = new Map();
  for (const r of rows || []) {
    if (!r || !r.teams || have.has(`se:${r.id}`)) continue;
    const covered = base.some((m) => {
      if (Math.abs(m.t - r.t) > tolerance) return false;
      let ph = phs.get(m.id);
      if (!ph) phs.set(m.id, (ph = phrasesOf(m)));
      return rowIsMatch(m, r, ph);
    });
    if (!covered) extra.push(r);
  }
  const added = seMatches(extra);
  if (!added.length) return base;
  return [...base, ...added].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
}
