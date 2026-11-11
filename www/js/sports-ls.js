// İkinci veri kaynağı: LiveScore gün listesi. ESPN'de olmayan lig, kupa, alt lig ve milli maçları tamamlar.
// Resmî olmayan, belgesiz bir API'dir: her alan eksik/değişmiş olabilir kabul edilir, bozuk kayıt atlanır, hiçbir okuma hata atmaz.
// Saf mantık (ağ dışarıdan verilir). Ekran sports-ui.js'te.
import { teamLabel, teamKeys, norm, withTimeout } from './sports.js';

export const LS_HOSTS = ['https://prod-public-api.livescore.com', 'https://prod-cdn-public-api.livescore.com'];
const PATH = '/v1/api/app/date/soccer/';

const pad = (n) => String(n).padStart(2, '0');

// Yerel takvim gününün LiveScore anahtarı (YYYYMMDD)
export const lsDateKey = (dayMs) => {
  const d = new Date(dayMs);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};

// Saat dilimi farkı (saat; yarım saatlik dilimlerde 5.5): günün ortasından okunur, yaz saati geçişi şaşırtmaz.
export const lsTz = (dayMs) => String(-new Date(dayMs + 12 * 3600e3).getTimezoneOffset() / 60);

// Gün için denenecek adresler: ana adres, yedek adres, ana adres (sorgusuz).
export function lsUrls(dayMs, hosts = LS_HOSTS) {
  const path = `${PATH}${lsDateKey(dayMs)}/${lsTz(dayMs)}`;
  const q = '?countryCode=TR&locale=en&MD=1';
  const hs = Array.isArray(hosts) ? hosts : [hosts];
  const urls = hs.map((h) => `${h}${path}${q}`);
  urls.push(`${hs[0]}${path}`);
  return urls;
}

// Esd: 14 haneli yerel zaman (20260115200000). Geçersizse null.
export function parseEsd(v) {
  const s = String(v == null ? '' : v).replace(/\D/g, '');
  if (s.length < 12) return null;
  const n = (a, b) => parseInt(s.slice(a, b), 10);
  const d = new Date(n(0, 4), n(4, 6) - 1, n(6, 8), n(8, 10), n(10, 12), s.length >= 14 ? n(12, 14) : 0);
  const t = d.getTime();
  return Number.isFinite(t) && d.getFullYear() === n(0, 4) ? t : null;
}

// LiveScore durum kodu (Eps) → { state: 'pre'|'in'|'post', text, off? }. Bilinmeyen kod, skor ve saate bakılarak yorumlanır.
export function lsStatus(raw, { t = 0, now = Date.now(), scored = false } = {}) {
  const s = String(raw == null ? '' : raw).trim();
  const u = s.toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ');
  if (!u || u === 'NS' || u === 'TBA' || u === 'TBD') return { state: 'pre', text: '' };
  if (/^POSTP|^PPD|^DELAYED?$/.test(u)) return { state: 'pre', text: u.startsWith('DELAY') ? 'Gecikmeli' : 'Ertelendi', off: !u.startsWith('DELAY') };
  if (/^CANC|^CNL/.test(u)) return { state: 'post', text: 'İptal', off: true };
  if (/^ABD|^ABAN|^ABN|^SUSP|^INT$|^INTERR/.test(u)) return { state: 'post', text: 'Yarıda kaldı', off: true };
  if (u === 'FT') return { state: 'post', text: 'MS' };
  if (u === 'AET') return { state: 'post', text: 'MS (uzatma)' };
  if (/^(AP|PEN|FT ?PEN|AFTER PEN)/.test(u)) return { state: 'post', text: 'MS (pen.)' };
  if (u === 'HT') return { state: 'in', text: 'Devre arası' };
  if (u === 'ET' || /^EXTRA/.test(u)) return { state: 'in', text: 'Uzatma' };
  if (/^PENS?$|^PSO$|^PENALT/.test(u)) return { state: 'in', text: 'Penaltılar' };
  if (u === 'BT' || u === 'BREAK') return { state: 'in', text: 'Ara' };
  const mm = /^(\d{1,3})(\+\d{1,2})?'?$/.exec(u);
  if (mm) return { state: 'in', text: `${mm[1]}${mm[2] || ''}'` };
  if (u === 'LIVE' || u === '1H' || u === '2H') return { state: 'in', text: 'Canlı' };
  // tanınmayan kod: skoru olan eski maç bitmiş, yeni maç sürüyor sayılır
  if (scored) return now - t > 3.5 * 3600e3 ? { state: 'post', text: 'MS' } : { state: 'in', text: s.slice(0, 12) || 'Canlı' };
  return { state: 'pre', text: '' };
}

const intOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};
const str = (v) => (v == null ? '' : String(v)).trim();
const arr = (v) => (Array.isArray(v) ? v : []);

const TR_COUNTRY = {
  turkey: 'Türkiye', england: 'İngiltere', spain: 'İspanya', germany: 'Almanya', france: 'Fransa', italy: 'İtalya', portugal: 'Portekiz',
  netherlands: 'Hollanda', belgium: 'Belçika', scotland: 'İskoçya', greece: 'Yunanistan', russia: 'Rusya', brazil: 'Brezilya', argentina: 'Arjantin',
  usa: 'ABD', europe: 'Avrupa', world: 'Dünya', switzerland: 'İsviçre', austria: 'Avusturya', denmark: 'Danimarka', sweden: 'İsveç', norway: 'Norveç',
  poland: 'Polonya', ukraine: 'Ukrayna', croatia: 'Hırvatistan', serbia: 'Sırbistan', romania: 'Romanya', bulgaria: 'Bulgaristan', japan: 'Japonya',
  china: 'Çin', 'saudi arabia': 'Suudi Arabistan', egypt: 'Mısır', morocco: 'Fas', mexico: 'Meksika', 'south korea': 'Güney Kore', azerbaijan: 'Azerbaycan',
};
const trCountry = (c) => TR_COUNTRY[norm(c)] || c;

const INTL = /^(world|europe|international|south america|north america|central america|concacaf|conmebol|asia|africa|oceania|uefa|fifa|caf|afc)$/i;
const TOP_EU = new Set(['england', 'spain', 'italy', 'germany', 'france', 'portugal', 'netherlands', 'belgium', 'scotland', 'greece']);

// Yarışmanın grubu: tr (Türkiye), int (dünya/kıta), eu (büyük Avrupa ülkeleri), oth (diğer)
export function groupOf(country) {
  const c = norm(country);
  if (c === 'turkey' || c === 'turkiye') return 'tr';
  if (INTL.test(String(country || '').trim())) return 'int';
  if (TOP_EU.has(c)) return 'eu';
  return 'oth';
}

// Grup içi sıra: Türkiye'de Süper Lig, kupa, 1. Lig önce.
function orderOf(grp, name) {
  if (grp !== 'tr') return 5;
  const n = norm(name);
  if (/super lig/.test(n)) return 0;
  if (/cup|kupa/.test(n)) return 1;
  if (/(^| )1 ?(lig|league)|first/.test(n)) return 2;
  return 3;
}

// LiveScore gün yanıtı → maç listesi (ESPN maçıyla aynı biçim; src:'ls').
export function parseLiveScore(json, { now = Date.now() } = {}) {
  const out = [];
  const seen = new Set();
  for (const st of arr(json && json.Stages)) {
    try {
      const sid = str(st && st.Sid) || norm(`${st && st.Cnm} ${st && st.Snm}`).replace(/ /g, '-');
      const cnm = str(st && st.Cnm);
      const snm = str((st && (st.Snm || st.CompN)) || '');
      const grp = groupOf(cnm);
      const name = [cnm && trCountry(cnm), snm].filter(Boolean).join(' · ') || 'Diğer';
      const ord = orderOf(grp, snm);
      for (const ev of arr(st && st.Events)) {
        try {
          const a = ev && arr(ev.T1)[0];
          const b = ev && arr(ev.T2)[0];
          const n1 = str(a && a.Nm);
          const n2 = str(b && b.Nm);
          const t = parseEsd(ev && ev.Esd);
          if (!n1 || !n2 || t == null) continue;
          const scored = intOrNull(ev.Tr1) != null && intOrNull(ev.Tr2) != null;
          const status = lsStatus(ev.Eps, { t, now, scored });
          const played = status.state !== 'pre';
          const eid = str(ev.Eid) || `${t}-${norm(n1)}-${norm(n2)}`;
          const id = `ls:${sid}:${eid}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const side = (nm, tr, trp) => ({
            name: nm,
            label: teamLabel(nm),
            abbr: '',
            logo: '',
            score: played ? intOrNull(tr) : null,
            pen: played && trp != null ? intOrNull(trp) : null,
          });
          out.push({
            id,
            lg: `ls:${sid}`,
            lgName: name,
            grp,
            ord,
            src: 'ls',
            t,
            state: status.state,
            text: status.text,
            off: !!status.off,
            home: side(n1, ev.Tr1, ev.Trp1),
            away: side(n2, ev.Tr2, ev.Trp2),
            venue: '',
            intl: [],
          });
        } catch {
          /* bozuk maç atlanır */
        }
      }
    } catch {
      /* bozuk yarışma atlanır */
    }
  }
  return out;
}

// Bir günün tüm maçlarını indirir. Döner: { matches, url }; hiçbir adres çalışmazsa hata atar (hata.detail: ilk neden).
export async function loadLiveScoreDay({ net, dayMs, now = Date.now(), hosts = LS_HOSTS, timeoutMs = 25000 } = {}) {
  const urls = lsUrls(dayMs, hosts);
  const errs = [];
  for (const url of urls) {
    try {
      const json = await withTimeout(net.json(url, { fast: true }), timeoutMs);
      if (!json || typeof json !== 'object') throw new Error('Boş yanıt');
      if (!Array.isArray(json.Stages)) throw new Error('Beklenmeyen yanıt biçimi');
      return { matches: parseLiveScore(json, { now }), url };
    } catch (e) {
      errs.push(String((e && e.message) || e || 'hata').slice(0, 100));
    }
  }
  const err = new Error('LiveScore verisi alınamadı.');
  err.detail = errs[0] ? `${errs[0]}${errs.length > 1 ? ` (${errs.length} adres denendi)` : ''}` : 'hata';
  throw err;
}

// ---- iki kaynağı birleştirme ----

// Takım adındaki "kadın / genç / ikinci takım" işareti: işareti farklı olan iki ad aynı takım sayılmaz (Arsenal ≠ Arsenal W).
const MARK = /(?:^| )(w|women|womens|ladies|u ?\d{2}|youth|ii|b|reserves|res)(?= |$)/;
const nameInfo = new Map();
function infoOf(name) {
  let i = nameInfo.get(name);
  if (!i) {
    const m = MARK.exec(norm(name));
    nameInfo.set(name, (i = { mark: m ? m[1].replace(' ', '') : '', ...teamKeys(name) }));
  }
  return i;
}
export function sameTeam(a, b) {
  const x = infoOf(a);
  const y = infoOf(b);
  if (x.mark !== y.mark) return false;
  for (const p of x.strong) if (y.strong.has(p)) return true;
  return (!!x.single && y.words.has(x.single)) || (!!y.single && x.words.has(y.single));
}
const sameFixture = (l, e) => (sameTeam(l.home.name, e.home.name) && sameTeam(l.away.name, e.away.name)) || (sameTeam(l.home.name, e.away.name) && sameTeam(l.away.name, e.home.name));

// ESPN maçları + LiveScore maçları → tek liste. Aynı maç iki kaynakta varsa ESPN'inki kalır (logo, ayrıntı, yayıncı bilgisi onda).
// LiveScore saatleri ESPN'dekilerden saat dilimi kadar kaymışsa (aynı maçların ortanca farkı) LiveScore saatleri düzeltilir.
// Döner: { matches, shift (ms, LiveScore'a eklenen), dupes }
export function mergeSources(espn, ls, { tolerance = 90 * 60000, window = 15 * 3600e3 } = {}) {
  const base = [...(espn || [])].sort((a, b) => a.t - b.t);
  const lsAll = ls || [];
  const nearby = (t, w, fn) => {
    let lo = 0;
    let hi = base.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (base[mid].t < t - w) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < base.length && base[i].t <= t + w; i++) {
      const r = fn(base[i]);
      if (r) return r;
    }
    return null;
  };
  // 1) saat kayması: aynı maçların farkları
  const diffs = [];
  for (const l of lsAll) {
    let best = null;
    nearby(l.t, window, (e) => {
      if (sameFixture(l, e) && (best == null || Math.abs(e.t - l.t) < Math.abs(best))) best = e.t - l.t;
      return null;
    });
    if (best != null) diffs.push(best);
  }
  let shift = 0;
  if (diffs.length) {
    diffs.sort((a, b) => a - b);
    const med = diffs[diffs.length >> 1];
    const q = 15 * 60000;
    const s = Math.round(med / q) * q;
    if (Math.abs(s) >= q && Math.abs(s) <= 14 * 3600e3 && (diffs.length >= 2 || s % (30 * 60000) === 0)) shift = s;
  }
  // 2) ESPN'de karşılığı olmayanlar
  const kept = [];
  let dupes = 0;
  for (const l of lsAll) {
    const t = l.t + shift;
    const twin = nearby(t, tolerance, (e) => (sameFixture(l, e) ? e : null));
    if (twin) {
      dupes++;
      continue;
    }
    kept.push(shift ? { ...l, t } : l);
  }
  const seen = new Set();
  const all = [...base, ...kept].filter((m) => !seen.has(m.id) && seen.add(m.id));
  all.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return { matches: all, shift, dupes };
}
