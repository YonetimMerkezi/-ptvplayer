// Dördüncü veri kaynağı: Spor Ekranı (sporekrani.com) günlük TV yayın akışı sayfası — maçın Türkiye'de hangi kanalda olduğu.
// Resmî bir API değil, herkese açık HTML sayfasıdır; sayfa yapısı değişebilir. Bu yüzden ayrıştırıcı esnektir (satırın yapılandırılmış
// parçaları ya da düz metni ile çalışır) ve ne okuduğunu gösteren bir teşhis (diag) döndürür. Hiçbir okuma hata atmaz.
// Saf mantık (ağ dışarıdan verilir). Ekran sports-ui.js'te.
import { fold } from './util.js';
import { norm, hasAny, teamPhrases, withTimeout } from './sports.js';

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

const ANCHOR = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*\/home\/match\/(\d+)\/(\d{4})\/(\d{1,2})\/(\d{1,2})\/[^"]*)"|'([^']*\/home\/match\/(\d+)\/(\d{4})\/(\d{1,2})\/(\d{1,2})\/[^']*)')[^>]*>([\s\S]*?)<\/a>/gi;

// Saat (Türkiye saati, UTC+3 sabit) + tarih (bağlantıdan) → ms
export const seTime = (y, mo, d, hh, mm) => Date.parse(`${y}-${pad(mo)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00+03:00`);

// Günlük sayfa HTML'i → { rows: [{ id, t, title, channels }], diag }. rows yalnız futbol ve kanalı bilinen satırlar.
// diag: { bytes, anchors, football, withChannel, sample } — hiç satır çıkmazsa ekranda gösterilir (sayfa yapısı değiştiyse neden anlaşılsın).
export function parseSporEkrani(html) {
  const src = typeof html === 'string' ? html : '';
  const rows = [];
  const seen = new Set();
  const diag = { bytes: src.length, anchors: 0, football: 0, withChannel: 0, sample: '' };
  ANCHOR.lastIndex = 0;
  for (let m = ANCHOR.exec(src); m; m = ANCHOR.exec(src)) {
    try {
      diag.anchors++;
      const id = m[2] || m[7];
      const y = m[3] || m[8];
      const mo = m[4] || m[9];
      const d = m[5] || m[10];
      const tokens = tokensOf(m[11]);
      if (!tokens.length) continue;
      const flat = tokens.join(' ');
      if (!diag.sample) diag.sample = tokens.join(' | ').slice(0, 140);
      if (fold(tokens[0].split(' ')[0]) !== 'futbol') continue; // başka spor
      diag.football++;
      const ti = tokens.findIndex((t) => /^\d{1,2}[:.]\d{2}$/.test(t));
      let hh;
      let mm;
      let after;
      if (ti >= 0) {
        [hh, mm] = tokens[ti].split(/[:.]/).map(Number);
        after = tokens.slice(ti + 1);
      } else {
        const fm = /(?:^|\s)(\d{1,2})[:.](\d{2})(?:\s|$)/.exec(flat);
        if (!fm) continue;
        hh = Number(fm[1]);
        mm = Number(fm[2]);
        after = [flat.slice(flat.indexOf(fm[0]) + fm[0].length).trim()];
      }
      const t = seTime(y, mo, d, hh, mm);
      if (!Number.isFinite(t) || hh > 23 || mm > 59) continue;
      const { channels, rest } = extractChannels(after);
      if (!channels.length) continue;
      diag.withChannel++;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({ id, t, title: rest.join(' ').slice(0, 160), channels });
    } catch {
      /* bozuk satır atlanır */
    }
  }
  return { rows, diag };
}

// Bir günün sayfasını indirir. Döner: { rows, diag, url }; sayfa alınamazsa ya da maç bağlantısı yoksa hata atar (hata.detail: neden).
export async function loadSeDay({ net, dayMs, base = SE_BASE, timeoutMs = 20000 } = {}) {
  const url = seUrl(dayMs, base);
  let html;
  try {
    html = await withTimeout(net.text(url, { fast: true }), timeoutMs);
  } catch (e) {
    const err = new Error('Spor Ekranı sayfası alınamadı.');
    err.detail = String((e && e.message) || e || 'hata').slice(0, 100);
    throw err;
  }
  const r = parseSporEkrani(html);
  if (!r.diag.anchors) {
    const err = new Error('Spor Ekranı sayfa biçimi tanınmadı.');
    err.detail = `${r.diag.bytes} bayt, maç bağlantısı yok`;
    throw err;
  }
  return { ...r, url };
}

// Teşhis özeti (hiç futbol satırı çıkmadıysa): "412 bağlantı, 0 futbol, 0 kanallı; örnek: Tenis | 00:30 | …"
export const seDiagText = (d) => `${d.anchors} bağlantı, ${d.football} futbol, ${d.withChannel} kanallı${d.withChannel ? '' : `; örnek: ${d.sample}`}`;

const women = (s) => /(^| )(kadin|kadinlar|women|womens|bayan|ladies|w)( |$)/.test(s);
const youth = (s) => /(^| )u ?\d{2}( |$)/.test(s);

// Maçın kanalları (tekrarsız): saat ±tolerance içinde, satır başlığında iki takımın da adı geçen satırlar.
export function seChannelsFor(match, rows, { tolerance = 35 * 60000 } = {}) {
  const out = [];
  const own = norm(`${match.home.name} ${match.away.name}`);
  let hp = null;
  let ap = null;
  for (const r of rows || []) {
    if (Math.abs(r.t - match.t) > tolerance) continue;
    const text = norm(r.title);
    if (women(text) !== women(own) || youth(text) !== youth(own)) continue;
    hp = hp || teamPhrases(match.home.name);
    ap = ap || teamPhrases(match.away.name);
    const padded = ` ${text} `;
    if (!hasAny(padded, hp) || !hasAny(padded, ap)) continue;
    for (const c of r.channels) if (!out.includes(c)) out.push(c);
  }
  return out;
}
