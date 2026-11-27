// Maç haftası kaynağı: TheSportsDB (ücretsiz, resmî olmayan topluluk verisi). Bir ligin N. haftasının tüm maçları tek istekte gelir
// (eventsround.php); güncel hafta numarası eventsnextleague.php'nin ilk maçından okunur. Gün gün tarama (sports-tur.js) bu kaynak
// çalışmazsa yedektir. Saf mantık (ağ dışarıdan verilir); Android (sports-ui.js) ve webOS (spor-veri.js) ortak kullanır.
import { dayStart, withTimeout } from './sports.js';
import { sameTeam, lsStatus } from './sports-ls.js';
import { TV_HOSTS, parseTvTime } from './sports-tv.js';

// Lig kimliği (uygulamadaki) → TheSportsDB lig kimliği. Yalnız hafta numaralı ulusal ligler; kupa/UEFA elemeleri gün gün kurulur.
export const HAFTA_LIGLERI = {
  'tur.1': 4339,
  'tff.1': 4676,
  'tff.2': 4679,
  'eng.1': 4328,
  'esp.1': 4335,
  'ita.1': 4332,
  'ger.1': 4331,
  'fra.1': 4334,
};
export const haftaDestek = (ligId) => !!HAFTA_LIGLERI[ligId];

const TR_LIGLER = new Set(['tur.1', 'tff.1', 'tff.2']);
const str = (v) => (v == null ? '' : String(v)).trim();
const sayi = (v) => {
  const s = str(v);
  if (!/^-?\d+$/.test(s)) return null;
  return Number(s);
};

// Ağustos–Temmuz sezonu: Temmuz ve sonrası "2026-2027", öncesi "2025-2026"
export function tsdbSezon(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const y = d.getFullYear();
  return d.getMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

export function haftaUrls(ligId, no, sezon, hosts = TV_HOSTS) {
  const hs = Array.isArray(hosts) ? hosts : [hosts];
  return hs.map((h) => `${h}/eventsround.php?id=${HAFTA_LIGLERI[ligId]}&r=${Number(no)}&s=${encodeURIComponent(sezon)}`);
}
export function sonrakiUrls(ligId, hosts = TV_HOSTS) {
  const hs = Array.isArray(hosts) ? hosts : [hosts];
  return hs.map((h) => `${h}/eventsnextleague.php?id=${HAFTA_LIGLERI[ligId]}`);
}

// TheSportsDB durum metni → LiveScore durum koduna (lsStatus ortak yorumlar): "Match Finished" → FT, "Not Started" → NS …
function durumKodu(raw, postponed) {
  const s = str(raw);
  if (/^yes$/i.test(str(postponed))) return 'POSTP';
  if (/finished|^full ?time$/i.test(s)) return 'FT';
  if (/after extra|^aet$/i.test(s)) return 'AET';
  if (/penalt|^pen$/i.test(s)) return 'PEN';
  if (/not started|^ns$|^$/i.test(s)) return 'NS';
  if (/postpone|^pst$/i.test(s)) return 'POSTP';
  if (/cancel|^canc/i.test(s)) return 'CANC';
  if (/abandon|^abd$/i.test(s)) return 'ABD';
  if (/half ?time|^ht$|^break/i.test(s)) return 'HT';
  if (/extra time|^et$/i.test(s)) return 'ET';
  if (/first half|^1h$|second half|^2h$|in play|^live$/i.test(s)) return 'LIVE';
  return s;
}

// TheSportsDB olayı → uygulamanın maç biçimi (yanlış/eksik kayıt null). Hiçbir okuma hata atmaz.
export function parseOlay(e, ligId, { now = Date.now(), lgName = '' } = {}) {
  try {
    if (!e) return null;
    const ev = str(e.strEvent);
    const parts = ev ? ev.split(/\s+(?:vs\.?|v)\s+/i) : [];
    const h = str(e.strHomeTeam) || (parts.length === 2 ? parts[0].trim() : '');
    const a = str(e.strAwayTeam) || (parts.length === 2 ? parts[1].trim() : '');
    const t = parseTvTime(e.strTimestamp || e.strTimeStamp, e.dateEvent, e.strTime);
    if (!h || !a || t == null) return null;
    const hs = sayi(e.intHomeScore);
    const as = sayi(e.intAwayScore);
    const scored = hs != null && as != null;
    let durum = lsStatus(durumKodu(e.strStatus, e.strPostponed), { t, now, scored });
    if (durum.state === 'pre' && !durum.off && scored && now - t > 3.5 * 3600e3) durum = { state: 'post', text: 'MS' }; // durum alanı güncellenmemiş ama skoru olan eski maç bitmiştir
    const state = durum.state;
    const rn = sayi(e.intRound);
    const logo = (u) => (/^https?:\/\//i.test(str(u)) ? str(u) + '/small' : '');
    const side = (name, score, badge) => {
      const x = { name, label: name, score: state === 'pre' ? null : score };
      const l = logo(badge);
      if (l) x.logo = l;
      return x;
    };
    return {
      id: `tsdb:${str(e.idEvent) || `${t}:${h}:${a}`}`,
      lg: ligId,
      ligId,
      lgName,
      grp: TR_LIGLER.has(ligId) ? 'tr' : 'eu',
      ord: 0,
      src: 'tsdb',
      t,
      state,
      text: durum.text || '',
      off: !!durum.off,
      home: side(h, hs, e.strHomeTeamBadge),
      away: side(a, as, e.strAwayTeamBadge),
      venue: str(e.strVenue),
      intl: [],
      round: rn ? `${rn}. hafta` : '',
    };
  } catch {
    return null;
  }
}

// Yanıt → saat sırasıyla maçlar (bozuk kayıtlar atlanır, aynı olay tekrarlanmaz)
export function parseHafta(json, ligId, opt = {}) {
  const list = json && json.events;
  const out = [];
  const seen = new Set();
  for (const e of Array.isArray(list) ? list : []) {
    const m = parseOlay(e, ligId, opt);
    if (m && !seen.has(m.id)) {
      seen.add(m.id);
      out.push(m);
    }
  }
  return out.sort((x, y) => x.t - y.t || x.id.localeCompare(y.id));
}

// Maç listesi → tur nesnesi (sports-tur.js'in döndürdüğü biçim: no, bas, son, maclar, tam)
export function haftaTur(no, maclar, sezon = '') {
  const s = [...maclar].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return { no, tahmin: false, bas: dayStart(s[0].t), son: dayStart(s[s.length - 1].t), maclar: s, tam: true, kaynak: 'tsdb', sezon };
}

async function ilkYanit(net, urls, timeoutMs, kontrol) {
  const errs = [];
  for (const url of urls) {
    try {
      const json = await withTimeout(net.json(url, { fast: true, proje: 'tsdb-hafta' }), timeoutMs);
      if (!json || typeof json !== 'object') throw new Error('Boş yanıt');
      if (!kontrol(json)) throw new Error('Beklenmeyen yanıt biçimi');
      return json;
    } catch (e) {
      errs.push(String((e && e.message) || e || 'hata').slice(0, 100));
    }
  }
  const err = new Error('Hafta listesi alınamadı.');
  err.detail = errs[0] ? `${errs[0]}${errs.length > 1 ? ` (${errs.length} adres denendi)` : ''}` : 'hata';
  throw err;
}

// Bir ligin N. haftası. Hafta yoksa (sezon sonu ötesi) maclar boş döner; hiçbir adres çalışmazsa hata atar.
export async function haftaAl({ net, ligId, no, sezon, now = Date.now(), hosts = TV_HOSTS, lgName = '', timeoutMs = 15000 }) {
  const json = await ilkYanit(net, haftaUrls(ligId, no, sezon, hosts), timeoutMs, (j) => 'events' in j);
  return { no, sezon, maclar: parseHafta(json, ligId, { now, lgName }) };
}

// Güncel (ya da yaklaşan) hafta: ligin sıradaki maçının numarası ve sezonu. Bilinmiyorsa null; hiçbir adres çalışmazsa hata atar.
export async function guncelHafta({ net, ligId, hosts = TV_HOSTS, timeoutMs = 15000 }) {
  const json = await ilkYanit(net, sonrakiUrls(ligId, hosts), timeoutMs, (j) => 'events' in j);
  const list = Array.isArray(json.events) ? json.events : [];
  for (const e of list) {
    const no = sayi(e && e.intRound);
    if (no && no > 0) return { no, sezon: str(e.strSeason) || '' };
  }
  return null;
}

// Önbellek ömrü: oynanmamış maçı olan hafta kısa (skorlar/saatler değişir), tamamen bitmiş hafta uzun
const omur = (maclar) => (maclar.some((m) => m.state !== 'post') ? 10 * 60e3 : 6 * 3600e3);

// İstenen haftayı çözer: no = 0 ise güncel hafta. Dönüş: { tur, yok } (yok: o numarada hafta yok) ya da null (bu lig/yön için kaynak uygun değil).
// Ağ hatasında hata atar: çağıran gün gün yönteme döner. onbellek: Map (ligId|sezon|no → { at, maclar }).
export async function haftaCoz({ net, ligId, no = 0, yon = 0, sezon = '', now = Date.now(), hosts = TV_HOSTS, lgName = '', onbellek = new Map(), zorla = false }) {
  if (!haftaDestek(ligId)) return null;
  if (!no) {
    if (yon !== 0) return null; // numara bilinmeden haftalar arasında gezilemez
    const g = await guncelHafta({ net, ligId, hosts });
    if (!g) return null;
    no = g.no;
    sezon = g.sezon || sezon;
  }
  if (no < 1) return { tur: null, yok: true };
  sezon = sezon || tsdbSezon(now);
  const anahtar = `${ligId}|${sezon}|${no}`;
  let v = zorla ? null : onbellek.get(anahtar);
  if (!v || now - v.at > omur(v.maclar)) {
    const r = await haftaAl({ net, ligId, no, sezon, now, hosts, lgName });
    v = { at: now, maclar: r.maclar };
    onbellek.set(anahtar, v);
  }
  if (!v.maclar.length) return { tur: null, yok: true };
  return { tur: haftaTur(no, v.maclar, sezon), yok: false };
}

const ayniMacTakim = (a, b) => (sameTeam(a.home.name, b.home.name) && sameTeam(a.away.name, b.away.name)) || (sameTeam(a.home.name, b.away.name) && sameTeam(a.away.name, b.home.name));
const birTakim = (a, b) => [a.home.name, a.away.name].some((x) => [b.home.name, b.away.name].some((y) => sameTeam(x, y)));

// Hafta listesindeki bir maçın canlı kaynaklardaki (ESPN, LiveScore, Mackolik, yayın akışı) karşılığı: skor, durum, kanal, ayrıntı orada.
// İki takım da eşleşirse ±3 saat, yalnız biri eşleşirse ±90 dk içinde (bir takım aynı anda iki maçta oynayamaz). En yakın saatli seçilir.
export function eslestir(m, adaylar) {
  let best = null;
  for (const c of adaylar || []) {
    if (!c || c === m || c.src === 'tsdb') continue;
    const d = Math.abs(c.t - m.t);
    if (d > 3 * 3600e3) continue;
    if (!(ayniMacTakim(m, c) || (d <= 90 * 60000 && birTakim(m, c)))) continue;
    if (!best || d < Math.abs(best.t - m.t)) best = c;
  }
  return best;
}
