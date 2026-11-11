// İkinci veri kaynağı: LiveScore gün listesi. ESPN'de olmayan lig, kupa, alt lig ve milli maçları tamamlar.
// Resmî olmayan, belgesiz bir API'dir: her alan eksik/değişmiş olabilir kabul edilir, bozuk kayıt atlanır, hiçbir okuma hata atmaz.
// Saf mantık (ağ dışarıdan verilir). Ekran sports-ui.js'te.
import { teamLabel, teamKeys, norm, withTimeout, trRound } from './sports.js';

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
      // Yarışma adı (CompN) aşama adından (Snm: "Group A", "Quarter-finals"…) farklıysa yarışma adı gösterilir, aşama tur bilgisi olur.
      const comp = str(st && st.CompN);
      const stage = str(st && st.Snm);
      const sub = !!comp && !!stage && norm(comp) !== norm(stage);
      const snm = sub ? comp : stage || comp;
      const stageRound = sub ? trRound(stage) : '';
      const grp = groupOf(cnm);
      const name = [cnm && trCountry(cnm), snm].filter(Boolean).join(' · ') || 'Diğer';
      const lgId = `ls:${norm(`${cnm} ${snm}`).replace(/ /g, '-') || sid}`; // aynı yarışmanın aşamaları tek bölümde toplanır
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
            lg: lgId,
            lgName: name,
            grp,
            ord,
            src: 'ls',
            eid: str(ev.Eid),
            t,
            state: status.state,
            text: status.text,
            off: !!status.off,
            home: side(n1, ev.Tr1, ev.Trp1),
            away: side(n2, ev.Tr2, ev.Trp2),
            venue: '',
            intl: [],
            round: [stageRound, trRound(ev.ErnInf)].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' · ').slice(0, 48),
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

// ---- maç olayları (gol dakikaları) ----

const DETAIL_PATH = '/v1/api/app/scoreboard/soccer/';

// Bir LiveScore maçının tek maç özeti adresleri (ana ve yedek adres). Eid: gün listesindeki olay kimliği.
export function lsDetailUrls(eid, hosts = LS_HOSTS) {
  const hs = Array.isArray(hosts) ? hosts : [hosts];
  return [...hs].reverse().map((h) => `${h}${DETAIL_PATH}${encodeURIComponent(eid)}?locale=en`); // belgedeki sıra: cdn adresi önce
}

// Maç kimliği: gün listesinden gelen Eid (eski kayıtlarda yok: kimliğin sonundaki sayı).
export function lsEidOf(m) {
  const e = str(m && m.eid);
  if (e) return e;
  const last = String((m && m.id) || '').split(':').pop();
  return /^\d{5,}$/.test(last) ? last : '';
}

const minuteText = (v) => {
  const s = str(v).replace(/'/g, '');
  return s ? `${s}'` : '';
};

// "Incs-s" (yalnız goller) içindeki olayları dolaşır: Min ve Pn/IT alanı olan her nesne bir gol sayılır. "1"/"2" anahtarı takım mı devre mi belli
// değildir (gerçek cihazda devre gibi davrandı); bu yüzden takım sırayla şunlardan çıkarılır: gol sonrası skor (Sc), olaydaki takım numarası,
// maç skoru (bir takım hiç gol atmadıysa), skorla tam tutan "1"/"2" anahtarı. Hiçbiri tutmazsa takım boş kalır (ekran ortada gösterir).
function collectGoals(node, key, out, depth = 0) {
  if (node == null || typeof node !== 'object' || depth > 6) return;
  if (Array.isArray(node)) {
    for (const x of node) collectGoals(x, key, out, depth + 1);
    return;
  }
  if ('Min' in node && ('Pn' in node || 'IT' in node)) {
    out.push({ ev: node, key });
    return;
  }
  for (const [k, v] of Object.entries(node)) collectGoals(v, k === '1' || k === '2' ? k : key, out, depth + 1);
}

const TEAM_FIELDS = ['Nm', 'Tn', 'Tm', 'T', 'Team', 'TeamNo', 'Tid'];
const sideNo = (v) => (v === 1 || v === '1' ? 'home' : v === 2 || v === '2' ? 'away' : '');
const minVal = (e) => {
  const x = /(\d+)(?:\D*?\+\s*(\d+))?/.exec(e.minute);
  return x ? Number(x[1]) + (x[2] ? Number(x[2]) / 100 : 0) : 999;
};

// Tek maç özeti yanıtı → { events (ekrandaki olay biçimi), note, warn }. Yalnız goller gelir; dakika, oyuncu, takım tarafı ve (tutarlıysa) skor akışı.
export function parseLsEvents(json, m) {
  const src = json && typeof json === 'object' ? json['Incs-s'] : null;
  if (!src || typeof src !== 'object') return { events: [], note: json && typeof json === 'object' ? `Incs-s yok (alanlar: ${Object.keys(json).slice(0, 12).join(',')})` : 'Boş yanıt', warn: '' };
  const found = [];
  collectGoals(src, '', found);
  const events = found.map(({ ev, key }, idx) => ({
    kind: 'goal',
    mark: false,
    idx,
    minute: minuteText(ev.Min),
    side: '',
    player: str(ev.Pn).slice(0, 60),
    other: '',
    detail: '',
    score: '',
    text: '',
    _ev: ev,
    _key: key,
  }));
  events.sort((x, y) => minVal(x) - minVal(y) || x.idx - y.idx);
  const hs = m && m.home ? intOrNull(m.home.score) : null;
  const as = m && m.away ? intOrNull(m.away.score) : null;
  const scored = hs != null && as != null;

  // 1) gol sonrası skor (Sc: [ev sahibi, deplasman]): hangi sayı arttıysa o takım attı
  const sc = (e) => {
    const v = e._ev.Sc;
    const a = Array.isArray(v) ? [intOrNull(v[0]), intOrNull(v[1])] : null;
    return a && a[0] != null && a[1] != null ? a : null;
  };
  if (events.length && events.every((e) => sc(e))) {
    let p0 = 0;
    let p1 = 0;
    for (const e of events) {
      const [x, y] = sc(e);
      e.side = x > p0 ? 'home' : y > p1 ? 'away' : '';
      p0 = x;
      p1 = y;
    }
  }
  // 2) olaydaki takım numarası
  for (const e of events) {
    if (e.side) continue;
    for (const f of TEAM_FIELDS) {
      const sd = sideNo(e._ev[f]);
      if (sd) {
        e.side = sd;
        break;
      }
    }
  }
  // 3) maç skoru: bir takım hiç gol atmadıysa tüm goller diğerinindir
  if (scored && hs === 0 && as > 0) for (const e of events) e.side = e.side || 'away';
  if (scored && as === 0 && hs > 0) for (const e of events) e.side = e.side || 'home';
  // 4) "1"/"2" anahtarı, sayıları maç skoruyla tam uyuşuyorsa takım anahtarıdır
  if (scored && events.some((e) => !e.side)) {
    const c1 = events.filter((e) => e._key === '1').length;
    const c2 = events.filter((e) => e._key === '2').length;
    if (c1 === hs && c2 === as && c1 + c2 === events.length) for (const e of events) e.side = e.side || (e._key === '1' ? 'home' : 'away');
  }
  const unknown = events.some((e) => !e.side);
  // Takım belirlenemediyse ilk olayın ham alanları da yazılır (sorun bildirirken ekran görüntüsü biçimi düzeltmeye yeter)
  const sample = (events.find((e) => !e.side) || {})._ev;
  const warn = unknown ? `Golü atan takım belirlenemedi (alanlar: ${Object.keys(sample || {}).slice(0, 10).join(',')}; örnek: ${JSON.stringify(sample || {}).slice(0, 140)})` : '';

  // Skor akışı yalnız tüm takımlar belliyse ve gol sayıları maç skoruyla tam uyuşuyorsa yazılır
  let h = 0;
  let a = 0;
  for (const e of events) {
    if (e.side === 'home') h++;
    else if (e.side === 'away') a++;
  }
  if (!unknown && scored && h === hs && a === as) {
    let rh = 0;
    let ra = 0;
    for (const e of events) {
      if (e.side === 'home') rh++;
      else ra++;
      e.score = `${rh}–${ra}`;
    }
  }
  for (const e of events) {
    delete e.idx;
    delete e._ev;
    delete e._key;
  }
  return { events, note: events.length ? '' : 'Incs-s boş', warn };
}

// Maçın gollerini indirir. Döner: { events, note }; adres çalışmazsa events boş, note nedeni söyler (ekranda küçük yazıyla görünür). Hata atmaz.
export async function loadLsEvents({ net, match, hosts = LS_HOSTS, timeoutMs = 15000 } = {}) {
  const eid = lsEidOf(match);
  if (!eid) return { events: [], note: 'Maç kimliği yok' };
  const errs = [];
  for (const url of lsDetailUrls(eid, hosts)) {
    try {
      const json = await withTimeout(net.json(url, { fast: true }), timeoutMs);
      if (!json || typeof json !== 'object') throw new Error('Boş yanıt');
      return parseLsEvents(json, match);
    } catch (e) {
      errs.push(String((e && e.message) || e || 'hata').slice(0, 80));
    }
  }
  return { events: [], note: errs[0] || 'hata' };
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
