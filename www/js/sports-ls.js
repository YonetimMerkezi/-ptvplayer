// İkinci veri kaynağı: LiveScore gün listesi. ESPN'de olmayan lig, kupa, alt lig ve milli maçları tamamlar.
// Resmî olmayan, belgesiz bir API'dir: her alan eksik/değişmiş olabilir kabul edilir, bozuk kayıt atlanır, hiçbir okuma hata atmaz.
// Saf mantık (ağ dışarıdan verilir). Ekran sports-ui.js'te.
import { teamLabel, teamKeys, norm, withTimeout, trRound } from './sports.js';
import { isYouthText } from './util.js';

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
  turkey: 'Türkiye', turkiye: 'Türkiye', england: 'İngiltere', spain: 'İspanya', germany: 'Almanya', france: 'Fransa', italy: 'İtalya', portugal: 'Portekiz',
  netherlands: 'Hollanda', belgium: 'Belçika', scotland: 'İskoçya', greece: 'Yunanistan', russia: 'Rusya', brazil: 'Brezilya', argentina: 'Arjantin',
  usa: 'ABD', europe: 'Avrupa', world: 'Dünya', switzerland: 'İsviçre', austria: 'Avusturya', denmark: 'Danimarka', sweden: 'İsveç', norway: 'Norveç',
  poland: 'Polonya', ukraine: 'Ukrayna', croatia: 'Hırvatistan', serbia: 'Sırbistan', romania: 'Romanya', bulgaria: 'Bulgaristan', japan: 'Japonya',
  china: 'Çin', 'saudi arabia': 'Suudi Arabistan', egypt: 'Mısır', morocco: 'Fas', mexico: 'Meksika', 'south korea': 'Güney Kore', azerbaijan: 'Azerbaycan',
};
const trCountry = (c) => TR_COUNTRY[norm(c)] || c;

// TFF alt ligleri LiveScore'da İngilizce gelir ("2nd Lig: White Group", "3rd Lig: Group 4"): Türkçe yazılır.
const TR_GROUP_COLOR = { white: 'Beyaz', red: 'Kırmızı', blue: 'Mavi', green: 'Yeşil', yellow: 'Sarı' };
export const trStage = (s) =>
  String(s == null ? '' : s)
    .replace(/\b(\d)(?:st|nd|rd|th)\s+Lig\b/i, '$1. Lig')
    .replace(/\b(white|red|blue|green|yellow)\s+group\b/i, (m, c) => `${TR_GROUP_COLOR[c.toLowerCase()]} Grup`)
    .replace(/\bGroup\s+(\d+)\b/i, '$1. Grup');

// Yarışma adının başı ("International Friendlies", "UEFA Champions League", "World Cup Qualification Europe", "CONCACAF Nations League"): bir ülke adı bunlarla başlamaz.
const INTL = /^(world|europe|international|south america|north america|central america|concacaf|conmebol|asian?|african?|oceania|uefa|fifa|caf|afc|ofc|olympic|euro)\b/i;
const TOP_EU = new Set(['england', 'spain', 'italy', 'germany', 'france', 'portugal', 'netherlands', 'belgium', 'scotland', 'greece']);

// Yarışmanın grubu: tr (Türkiye), int (dünya/kıta), eu (büyük Avrupa ülkeleri), oth (diğer)
export function groupOf(country) {
  const c = norm(country);
  if (c === 'turkey' || c === 'turkiye') return 'tr';
  if (INTL.test(String(country || '').trim())) return 'int';
  if (TOP_EU.has(c)) return 'eu';
  return 'oth';
}

// Kapsam: yalnız Türkiye, Avrupa ve uluslararası (dünya/kıta) erkek futbolu. Kadın maçları ve Avrupa dışı ülke ligleri (Brezilya, Japonya…) listeye girmez.
const EUROPE = new Set([
  'albania', 'andorra', 'armenia', 'austria', 'azerbaijan', 'belarus', 'belgium', 'bosnia herzegovina', 'bosnia and herzegovina', 'bulgaria', 'croatia', 'cyprus',
  'czech republic', 'czechia', 'denmark', 'england', 'estonia', 'faroe islands', 'finland', 'france', 'georgia', 'germany', 'gibraltar', 'greece', 'hungary', 'iceland',
  'ireland', 'republic of ireland', 'rep of ireland', 'israel', 'italy', 'kazakhstan', 'kosovo', 'latvia', 'liechtenstein', 'lithuania', 'luxembourg', 'malta', 'moldova',
  'montenegro', 'netherlands', 'north macedonia', 'macedonia', 'northern ireland', 'norway', 'poland', 'portugal', 'romania', 'russia', 'san marino', 'scotland', 'serbia',
  'slovakia', 'slovenia', 'spain', 'sweden', 'switzerland', 'turkey', 'turkiye', 'ukraine', 'wales',
].map((c) => norm(c)));
export const isEuropean = (country) => EUROPE.has(norm(country));
const WOMEN_COMP = /(^| )(women|womens|woman|ladies|female|feminin|feminine|femenina|femenino|femminile|frauen|damen|kvinner|kvinde|kvindelig|kobiet|bayanlar|bayan|kadinlar|kadin|nwsl|wsl|liga f|toppserien|damallsvenskan)( |$)/;
const WOMEN_TEAM = /(^| )(w|women|womens|ladies)$/;
export const isWomenComp = (text) => WOMEN_COMP.test(norm(text));
export const isWomenTeam = (name) => WOMEN_TEAM.test(norm(name));
export function inScope(country, compText = '') {
  if (isWomenComp(compText) || isYouthText(compText)) return false;
  const g = groupOf(country);
  return g === 'tr' || g === 'int' || isEuropean(country);
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
      const snmRaw = sub ? comp : stage || comp;
      const grp = groupOf(cnm);
      const snm = grp === 'tr' ? trStage(snmRaw) : snmRaw;
      const stageRound = sub ? trRound(stage) : '';
      if (!inScope(cnm, `${comp} ${stage}`)) continue;
      const name = [cnm && trCountry(cnm), snm].filter(Boolean).join(' · ') || 'Diğer';
      const lgId = `ls:${norm(`${cnm} ${snmRaw}`).replace(/ /g, '-') || sid}`; // aynı yarışmanın aşamaları tek bölümde toplanır
      const ord = orderOf(grp, snm);
      for (const ev of arr(st && st.Events)) {
        try {
          const a = ev && arr(ev.T1)[0];
          const b = ev && arr(ev.T2)[0];
          const n1 = str(a && a.Nm);
          const n2 = str(b && b.Nm);
          const t = parseEsd(ev && ev.Esd);
          if (!n1 || !n2 || t == null || isWomenTeam(n1) || isWomenTeam(n2) || isYouthText(n1) || isYouthText(n2)) continue;
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
// filtre (yalnız TV servisi): 'u=ülkeler&x=1' — gün listesi servis içinde süzülür (bkz. webos/service/service.js lsSuz)
export async function loadLiveScoreDay({ net, dayMs, now = Date.now(), hosts = LS_HOSTS, timeoutMs = 25000, filtre = '' } = {}) {
  const urls = lsUrls(dayMs, hosts);
  const errs = [];
  for (const url of urls) {
    try {
      const json = await withTimeout(net.json(url, { fast: true, proje: filtre ? 'ls-gun:' + filtre : 'ls-gun' }), timeoutMs);
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

const DETAIL_PATHS = {
  scoreboard: '/v1/api/app/scoreboard/soccer/', // durum, skor, goller (Incs-s)
  incidents: '/v1/api/app/incidents/soccer/', // goller, asistler, kartlar (Incs)
  lineups: '/v1/api/app/lineups/soccer/', // ilk 11, yedekler, formasyon, teknik direktör, oyuncu değişiklikleri (Subs)
  statistics: '/v1/api/app/statistics/soccer/', // takım istatistikleri (Stat)
};
export function lsDetailUrls(eid, hosts = LS_HOSTS, kind = 'scoreboard') {
  const hs = Array.isArray(hosts) ? hosts : [hosts];
  return [...hs].reverse().map((h) => `${h}${DETAIL_PATHS[kind] || DETAIL_PATHS.scoreboard}${encodeURIComponent(eid)}?locale=en`); // belgedeki sıra: cdn adresi önce
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

// LiveScore olay tür kodları (gerçek maç yanıtlarından çıkarıldı: kodların belgesi yok). 36 gol, 37 gol (başka tür), 39 kendi kalesine gol
// (olay, golden yararlanan takımın altında gelir), 43 sarı kart, 63 asist. Tanınmayan kodlar gösterilmez.
const IT_GOALISH = new Set([36, 37, 39]);
const IT_GOAL = new Set([36, 37]);
const IT_OWN = 39;
const IT_YELLOW = 43;
const IT_ASSIST = 63;
const IT_SUB_ON = 5;
const IT_SUB_OFF = 4;

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
    // Tür kodu varsa yalnız gol türleri alınır: asist (63), kart (43) ve oyuncusuz kayıtlar (44…) gol sayılmaz
    if (node.IT == null || IT_GOALISH.has(Number(node.IT))) out.push({ ev: node, key });
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

const flip = (side) => (side === 'home' ? 'away' : side === 'away' ? 'home' : '');
const minuteOf = (ev) => {
  const min = str(ev && ev.Min).replace(/'/g, '');
  if (!min) return '';
  const ex = intOrNull(ev && ev.MinEx);
  return ex ? `${min}+${ex}'` : `${min}'`;
};
const minuteKey = (ev) => {
  const m = intOrNull(ev && ev.Min);
  if (m == null) return 999;
  const ex = intOrNull(ev && ev.MinEx);
  return m + (ex ? ex / 100 : 0);
};
const fullName = (p) => {
  const n = `${str(p && p.Fn)} ${str(p && p.Ln)}`.trim();
  return (n || str(p && (p.Snm || p.Pn))).slice(0, 60);
};
const scoreText = (sc) => (Array.isArray(sc) && intOrNull(sc[0]) != null && intOrNull(sc[1]) != null ? `${intOrNull(sc[0])}–${intOrNull(sc[1])}` : '');

// "incidents" yanıtı: Incs → yarı anahtarı ("1"/"2") → olaylar (iç içe "Incs" olabilir). Nm: takım (1 ev sahibi, 2 deplasman); Sc: olaydan sonraki skor.
// Gol, kendi kalesine gol ve sarı kart olay olur; asist golün ayrıntısına yazılır. Kırmızı kart kodu bilinmediği için gösterilmez.
export function parseLsIncidents(json) {
  const src = json && typeof json === 'object' ? json.Incs : null;
  if (!src || typeof src !== 'object') return { events: [], ht: '' };
  const nodes = [];
  const walk = (node, depth = 0) => {
    if (node == null || typeof node !== 'object' || depth > 6) return;
    if (Array.isArray(node)) return node.forEach((x) => walk(x, depth + 1));
    if ('Min' in node && 'IT' in node) return void nodes.push(node);
    for (const v of Object.values(node)) walk(v, depth + 1);
  };
  walk(src);
  const events = [];
  const assists = [];
  nodes.forEach((ev, idx) => {
    const it = Number(ev.IT);
    const nm = sideNo(ev.Nm);
    if (it === IT_ASSIST) return void assists.push({ ev, nm });
    const kind = IT_GOAL.has(it) ? 'goal' : it === IT_OWN ? 'own' : it === IT_YELLOW ? 'yellow' : '';
    if (!kind || !nm) return;
    events.push({
      kind,
      mark: false,
      idx,
      key: minuteKey(ev),
      minute: minuteOf(ev),
      side: kind === 'own' ? flip(nm) : nm,
      player: fullName(ev) || str(ev.Pn).slice(0, 60),
      other: '',
      detail: '',
      score: kind === 'yellow' ? '' : scoreText(ev.Sc),
      text: '',
      _sc: scoreText(ev.Sc),
      _nm: nm,
    });
  });
  // asist: aynı dakika, aynı takım ve aynı skorlu golün ayrıntısı
  for (const a of assists) {
    const sc = scoreText(a.ev.Sc);
    const g = events.find((e) => e.kind === 'goal' && e._nm === a.nm && e.key === minuteKey(a.ev) && e._sc === sc && !e.detail);
    const who = fullName(a.ev) || str(a.ev.Pn);
    if (g && who) g.detail = `asist: ${who}`;
  }
  for (const e of events) {
    delete e._sc;
    delete e._nm;
  }
  const ht = intOrNull(json.Trh1) != null && intOrNull(json.Trh2) != null ? `${intOrNull(json.Trh1)}–${intOrNull(json.Trh2)}` : '';
  return { events, ht };
}

const POS_TR = { 1: 'K', 2: 'D', 3: 'OS', 4: 'F' };
const fpOrder = (p) => {
  const m = /^(\d+):(\d+)$/.exec(str(p.Fp));
  return m ? [Number(m[1]), Number(m[2])] : [intOrNull(p.Pos) || 9, intOrNull(p.Snu) || 99];
};

// "lineups" yanıtı: Lu[takım] { Tnb, Fo (formasyon), Ps (oyuncular) }: Pos 1–4 ilk 11, 5 yedek (PosS: mevki), 10 teknik direktör. Subs: oyuncu değişiklikleri
// (her değişiklik iki kayıt: giren IT 5, çıkan IT 4; IDo karşı oyuncunun kimliği).
export function parseLsLineups(json) {
  const out = { lineups: {}, subs: [] };
  const teams = arr(json && json.Lu);
  const names = new Map();
  const sideOfTeam = new Map();
  teams.forEach((t, i) => {
    if (!t || typeof t !== 'object') return;
    const side = sideNo(t.Tnb) || (i === 0 ? 'home' : i === 1 ? 'away' : '');
    if (!side) return;
    const ps = arr(t.Ps);
    for (const p of ps) {
      const nm = fullName(p);
      for (const id of [p.Aid, p.Pid, p.ID]) if (id != null && id !== '') names.set(String(id), nm);
    }
    const starters = ps
      .filter((p) => [1, 2, 3, 4].includes(Number(p.Pos)))
      .sort((x, y) => {
        const a = fpOrder(x);
        const b = fpOrder(y);
        return a[0] - b[0] || a[1] - b[1];
      })
      .map((p) => ({ n: str(p.Snu), name: fullName(p), pos: POS_TR[Number(p.Pos)] || '', starter: true }))
      .filter((p) => p.name);
    if (!starters.length) return;
    const subs = ps
      .filter((p) => Number(p.Pos) === 5)
      .map((p) => ({ n: str(p.Snu), name: fullName(p), pos: POS_TR[Number(p.PosS)] || '', starter: false }))
      .filter((p) => p.name);
    const coach = ps.find((p) => Number(p.Pos) === 10);
    const fo = arr(t.Fo).map(intOrNull).filter((x) => x != null && x > 0);
    out.lineups[side] = { formation: fo.length >= 3 && fo.reduce((a, b) => a + b, 0) === 10 ? fo.join('-') : '', starters, subs, squad: false, coach: coach ? fullName(coach) : '' };
    sideOfTeam.set(i, side);
  });
  // oyuncu değişiklikleri
  const raw = [];
  const walk = (node, depth = 0) => {
    if (node == null || typeof node !== 'object' || depth > 6) return;
    if (Array.isArray(node)) return node.forEach((x) => walk(x, depth + 1));
    if ('Min' in node && ('IDo' in node || 'AIDo' in node)) return void raw.push(node);
    for (const v of Object.values(node)) walk(v, depth + 1);
  };
  walk(json && json.Subs);
  const seen = new Set();
  const take = (ev, on) => {
    const side = sideNo(ev.Nm);
    const idSelf = str(ev.Aid || ev.ID);
    const idOther = str(ev.AIDo || ev.IDo);
    if (!side || !idOther) return;
    const key = `${minuteKey(ev)}|${side}|${[idSelf, idOther].sort().join('-')}`;
    if (seen.has(key)) return;
    seen.add(key);
    const self = names.get(idSelf) || fullName(ev) || (str(ev.Pnum) ? `#${str(ev.Pnum)}` : '');
    const other = names.get(idOther) || (str(ev.PnumO) ? `#${str(ev.PnumO)}` : '');
    const player = on ? self : other;
    const out2 = on ? other : self;
    if (!player) return;
    out.subs.push({ kind: 'sub', mark: false, idx: 1000 + out.subs.length, key: minuteKey(ev), minute: minuteOf(ev), side, player, other: out2, detail: '', score: '', text: '' });
  };
  for (const ev of raw) if (Number(ev.IT) === IT_SUB_ON || ev.IT == null) take(ev, true);
  for (const ev of raw) if (Number(ev.IT) === IT_SUB_OFF) take(ev, false);
  return out;
}

// İstatistik satırları (LiveScore Stat anahtarları): yalnız anlamı doğrulananlar. Pss = top hakimiyeti (iki takımın toplamı 100). Kart satırları yalnız kart varsa.
const STAT_ROWS = [
  ['Pss', 'Top hakimiyeti', true],
  ['Shon', 'İsabetli şut', false],
  ['Shof', 'İsabetsiz şut', false],
  ['Shbl', 'Engellenen şut', false],
  ['Gks', 'Kurtarış', false],
  ['Fls', 'Faul', false],
  ['Ofs', 'Ofsayt', false],
  ['Ycs', 'Sarı kartlar', false, true],
  ['Rcs', 'Kırmızı kartlar', false, true],
];
export function parseLsStats(json) {
  const st = arr(json && json.Stat);
  if (st.length < 2) return [];
  const home = st.find((x) => sideNo(x && x.Tnb) === 'home') || st[0];
  const away = st.find((x) => sideNo(x && x.Tnb) === 'away') || st[1];
  if (home === away) return [];
  const rows = [];
  for (const [key, label, pct, onlyIfAny] of STAT_ROWS) {
    const h = intOrNull(home[key]);
    const a = intOrNull(away[key]);
    if (h == null || a == null) continue;
    if (pct && (h + a < 98 || h + a > 102)) continue; // yüzdelik değilse (başka bir sayaçsa) gösterilmez
    if (onlyIfAny && h + a === 0) continue;
    rows.push({ id: key, label, home: h, away: a, pct });
  }
  // tüm sayaçlar sıfırsa (veri henüz yok) istatistik gösterilmez
  return rows.some((r) => r.home + r.away > 0) ? rows : [];
};

// Olay listesine devre arası / maç sonu ayraçlarını koyar ve dakikaya göre sıralar. status: lsStatus çıktısı.
function arrange(events, { ht, ft, status }) {
  const out = events.map((e) => ({ ...e }));
  const min = /^(\d+)/.exec(String((status && status.text) || ''));
  const pastHalf = !!status && (status.state === 'post' || /Devre arası|Uzatma|Penalt/.test(status.text || '') || (min && Number(min[1]) > 45) || out.some((e) => e.key > 45.5));
  if (ht && pastHalf && out.length) out.push({ kind: 'ht', mark: true, idx: -1, key: 45.5, minute: '', side: '', player: '', other: '', detail: '', score: ht, text: '' });
  if (ft && status && status.state === 'post' && !status.off && out.length) out.push({ kind: 'ft', mark: true, idx: 99999, key: 9999, minute: '', side: '', player: '', other: '', detail: '', score: ft, text: '' });
  out.sort((a, b) => a.key - b.key || a.idx - b.idx);
  for (const e of out) {
    delete e.key;
    delete e.idx;
  }
  return out;
}

// Maçın canlı ayrıntısını indirir: durum + skor (scoreboard), olaylar (incidents; olmazsa scoreboard'daki goller), kadro + oyuncu değişiklikleri (lineups), istatistik (statistics).
// lineups/stats: false ise o uç hiç sorulmaz (kotayı korumak için ekran bunları seyrek ister). Döner: { events, note, warn, status, home, away, lineups?, stats? }. Hata atmaz.
export async function loadLsEvents({ net, match, hosts = LS_HOSTS, timeoutMs = 15000, lineups = true, stats = true, incidents = true } = {}) {
  const eid = lsEidOf(match);
  if (!eid) return { events: [], note: 'Maç kimliği yok' };
  const errs = [];
  const get = async (kind) => {
    let last = null;
    for (const url of lsDetailUrls(eid, hosts, kind)) {
      try {
        const json = await withTimeout(net.json(url, { fast: true }), timeoutMs);
        if (!json || typeof json !== 'object') throw new Error('Boş yanıt');
        return json;
      } catch (e) {
        last = e;
        errs.push(String((e && e.message) || e || 'hata').slice(0, 80));
      }
    }
    throw last || new Error('hata');
  };
  const [sb, inc, lu, st] = await Promise.allSettled([get('scoreboard'), incidents ? get('incidents') : Promise.reject(new Error('atlandı')), lineups ? get('lineups') : Promise.reject(new Error('atlandı')), stats ? get('statistics') : Promise.reject(new Error('atlandı'))]);
  const out = { events: [], note: '' };
  const sj = sb.status === 'fulfilled' ? sb.value : null;
  // durum + skor
  if (sj) {
    const h = intOrNull(sj.Tr1);
    const a = intOrNull(sj.Tr2);
    const status = lsStatus(sj.Eps, { t: match.t || 0, now: Date.now(), scored: h != null && a != null });
    out.status = status;
    out.home = { score: status.state === 'pre' ? null : h };
    out.away = { score: status.state === 'pre' ? null : a };
  }
  // olaylar
  const parsed = inc.status === 'fulfilled' ? parseLsIncidents(inc.value) : { events: [], ht: '' };
  let events = parsed.events;
  if (!events.length && sj) {
    const g = parseLsEvents(sj, match);
    events = g.events.map((e, i) => ({ ...e, idx: i, key: minuteKey({ Min: parseInt(e.minute, 10) }) }));
    out.note = events.length ? '' : g.note;
    if (g.warn) out.warn = g.warn;
  } else if (!events.length) out.note = errs[0] || 'hata';
  let subs = [];
  if (lu.status === 'fulfilled') {
    const l = parseLsLineups(lu.value);
    if (l.lineups.home || l.lineups.away) out.lineups = l.lineups;
    subs = l.subs;
  }
  if (st.status === 'fulfilled') out.stats = parseLsStats(st.value);
  const ft = sj && intOrNull(sj.Tr1) != null && intOrNull(sj.Tr2) != null ? `${intOrNull(sj.Tr1)}–${intOrNull(sj.Tr2)}` : '';
  out.events = arrange([...events, ...subs], { ht: parsed.ht || (sj && intOrNull(sj.Trh1) != null && intOrNull(sj.Trh2) != null ? `${intOrNull(sj.Trh1)}–${intOrNull(sj.Trh2)}` : ''), ft, status: out.status });
  if (!sj && !events.length && lu.status !== 'fulfilled' && st.status !== 'fulfilled') out.note = errs[0] || 'hata';
  return out;
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
      if (l.round && !twin.round) twin.round = l.round; // ESPN maçında hafta numarası yok: ikinci kaynaktaki karşılığından alınır (maç haftası hesabı için)
      continue;
    }
    kept.push(shift ? { ...l, t } : l);
  }
  const seen = new Set();
  const all = [...base, ...kept].filter((m) => !seen.has(m.id) && seen.add(m.id));
  all.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return { matches: all, shift, dupes };
}
