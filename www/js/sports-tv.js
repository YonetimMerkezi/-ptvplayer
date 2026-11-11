// Üçüncü veri kaynağı: TheSportsDB'nin ücretsiz TV yayın listesi (maçın Türkiye'de hangi kanalda gösterildiği).
// Resmî olmayan topluluk verisidir; kapsamı eksik olabilir, her alan yoksa/değişmişse bozuk kayıt atlanır, hiçbir okuma hata atmaz.
// Saf mantık (ağ dışarıdan verilir). Ekran sports-ui.js'te.
import { norm, withTimeout } from './sports.js';
import { sameTeam } from './sports-ls.js';

export const TV_HOSTS = ['https://www.thesportsdb.com/api/v1/json/123', 'https://www.thesportsdb.com/api/v1/json/3'];
export const TV_COUNTRY = 'Turkey';

const pad = (n) => String(n).padStart(2, '0');

// Yerel takvim gününün YYYY-MM-DD anahtarı
export const tvDateKey = (dayMs) => {
  const d = new Date(dayMs);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Gün için denenecek adresler (önce güncel anahtar, sonra eski ücretsiz anahtar).
export function tvUrls(dayMs, hosts = TV_HOSTS, country = TV_COUNTRY) {
  const hs = Array.isArray(hosts) ? hosts : [hosts];
  return hs.map((h) => `${h}/eventstv.php?d=${tvDateKey(dayMs)}&a=${encodeURIComponent(country)}`);
}

const str = (v) => (v == null ? '' : String(v)).trim();

// "2026-11-12T17:00:00+00:00" / "2026-11-12 17:00:00" (saat dilimi yoksa UTC) → ms; geçersizse null
export function parseTvTime(ts, date, time) {
  let s = str(ts);
  if (!s && date) s = `${str(date)}T${str(time) || '00:00:00'}`;
  if (!s) return null;
  s = s.replace(' ', 'T');
  if (!/(z|[+-]\d\d:?\d\d)$/i.test(s)) s += 'Z';
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

// "Armenia vs Cyprus" / "Armenia v Cyprus" / "Armenia - Cyprus" → [ev sahibi, deplasman] ya da null
export function splitEvent(name) {
  const parts = str(name).split(/\s+(?:vs\.?|v)\s+|\s+[-–]\s+/i);
  return parts.length === 2 && parts[0].trim() && parts[1].trim() ? [parts[0].trim(), parts[1].trim()] : null;
}

// TheSportsDB yanıtı → [{ home, away, channel, t }] (yalnız futbol, yalnız Türkiye yayınları)
export function parseTv(json) {
  const list = (json && (json.tvevents || json.tvevent || json.events)) || [];
  const out = [];
  const seen = new Set();
  for (const e of Array.isArray(list) ? list : []) {
    try {
      if (!e) continue;
      if (str(e.strSport) && !/^(soccer|football \(soccer\))$/i.test(str(e.strSport))) continue;
      const country = norm(e.strCountry);
      if (country && country !== 'turkey' && country !== 'turkiye') continue;
      const channel = str(e.strChannel);
      const teams = splitEvent(e.strEvent);
      if (!channel || !teams) continue;
      const key = `${norm(teams[0])}|${norm(teams[1])}|${norm(channel)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ home: teams[0], away: teams[1], channel: channel.slice(0, 40), t: parseTvTime(e.strTimeStamp, e.dateEvent, e.strTime) });
    } catch {
      /* bozuk kayıt atlanır */
    }
  }
  return out;
}

// Bir günün yayın listesi. Döner: { events }; hiçbir adres çalışmazsa hata atar (hata.detail: ilk neden).
export async function loadTvDay({ net, dayMs, hosts = TV_HOSTS, timeoutMs = 15000 } = {}) {
  const urls = tvUrls(dayMs, hosts);
  const errs = [];
  for (const url of urls) {
    try {
      const json = await withTimeout(net.json(url, { fast: true }), timeoutMs);
      if (!json || typeof json !== 'object') throw new Error('Boş yanıt');
      if (!('tvevents' in json || 'tvevent' in json || 'events' in json)) throw new Error('Beklenmeyen yanıt biçimi');
      return { events: parseTv(json), url };
    } catch (e) {
      errs.push(String((e && e.message) || e || 'hata').slice(0, 100));
    }
  }
  const err = new Error('Yayın listesi alınamadı.');
  err.detail = errs[0] ? `${errs[0]}${errs.length > 1 ? ` (${errs.length} adres denendi)` : ''}` : 'hata';
  throw err;
}

// Maçın Türkiye'deki kanalları (tekrarsız ad listesi). Saat varsa ±3 saat, yoksa yalnız takımlar eşleşirse (aynı gün listesinden geldiği için) kabul edilir.
export function tvChannelsFor(match, events, { tolerance = 3 * 3600e3 } = {}) {
  const out = [];
  for (const e of events || []) {
    if (e.t != null && Math.abs(e.t - match.t) > tolerance) continue;
    const same = (sameTeam(match.home.name, e.home) && sameTeam(match.away.name, e.away)) || (sameTeam(match.home.name, e.away) && sameTeam(match.away.name, e.home));
    if (same && !out.includes(e.channel)) out.push(e.channel);
  }
  return out;
}

const NOISE = new Set(['tr', 'turkey', 'turkiye', 'hd', 'fhd', 'uhd', 'sd', '4k', 'hevc', 'h265', 'kanal', 'channel', 'canli', 'live', 'tv', 'raw', 'hq', 'lq', '50fps', '60fps', '1080p', '720p', 'backup', 'yedek']);
const core = (name) => norm(name).split(' ').filter((w) => w && !NOISE.has(w)).map((w) => (w === 'sports' ? 'sport' : w)).join(' ');
const tok = (name) => core(name).split(' ').filter(Boolean);

// Bitişik sözcükler birleştirilince anahtara eşit olan bir pencere var mı? ("tivibu spor 1" ↔ "tivibuspor 1": boşluk farkı önemsiz)
function windowEq(tokens, key) {
  for (let i = 0; i < tokens.length; i++) {
    let s = '';
    for (let j = i; j < tokens.length; j++) {
      s += tokens[j];
      if (s === key) return true;
      if (s.length >= key.length) break;
    }
  }
  return false;
}

// TV listesindeki kanal adlarına karşılık gelen kullanıcı kanalları. Sadeleşmiş TV adı (en az 2 harf: "ATV", "A2", "TV8") kanal adında
// tam sözcük (ya da bitişik sözcüklerin birleşimi: "Tivibu Spor 1" = "TIVIBUSPOR 1") olarak geçerse eşleşir; kanal adı TV adının içinde
// geçiyorsa yalnız her ikisi de en az 4 harfliyse (kısa adlar yanlış eşleşmesin).
// Sınır aşılırsa adı birebir tutan kanallar korunur (çok sayıda "BEIN SPORTS 1 …" varyantı arasında kesilmesinler); sıra listedeki gibidir.
export function channelsByName(items, names, max = 14) {
  const wants = (names || []).map((n) => { const t = tok(n); return { t, k: t.join('') }; }).filter((w) => w.k.length >= 2);
  if (!wants.length) return [];
  const hits = [];
  for (const it of items || []) {
    const t = tok(it.name);
    if (!t.length) continue;
    const k = t.join('');
    let kind = 0;
    for (const w of wants) {
      if (k === w.k) { kind = 2; break; }
      if (windowEq(t, w.k) || (w.k.length >= 4 && k.length >= 4 && windowEq(w.t, k))) kind = 1;
    }
    if (kind) hits.push({ it, exact: kind === 2 });
  }
  if (hits.length <= max) return hits.map((h) => h.it);
  const keep = new Set([...hits.filter((h) => h.exact), ...hits.filter((h) => !h.exact)].slice(0, max));
  return hits.filter((h) => keep.has(h)).map((h) => h.it);
}
