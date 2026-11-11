// Futbol: maç takvimi, skorlar ve maçın hangi kanalda olduğu.
// Veri: ESPN'in herkese açık skor tablosu (anahtarsız). Bu dosya saf mantıktır (ağ ve TV rehberi dışarıdan verilir); ekran sports-ui.js'te.
import { fold } from './util.js';

export const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
export const DAY = 86400000;

// Yayıncılar (Türkiye, 2026-27 sezonu; basında çıkan dağılım, değişebilir). keys: kanal adında aranan sözcük öbekleri.
export const BROADCASTERS = {
  bein: { name: 'beIN SPORTS', keys: ['bein sports', 'bein sport', 'beinsports', 'bein spor'] },
  ssport: { name: 'S Sport', keys: ['s sport', 'ssport'] },
  trt: { name: 'TRT / Tabii', keys: ['trt spor', 'trt 1', 'trt1', 'tabii spor', 'tabii'] },
  aspor: { name: 'A Spor / ATV', keys: ['a spor', 'atv'] },
};

// Sıra, ekrandaki bölüm sırasıdır. bc: yayıncı(lar); tr: Türkiye oynuyorsa yayıncı(lar).
export const LEAGUES = [
  { id: 'tur.1', name: 'Süper Lig', bc: ['bein'] },
  { id: 'uefa.champions', name: 'Şampiyonlar Ligi', bc: ['trt'] },
  { id: 'uefa.europa', name: 'UEFA Avrupa Ligi', bc: ['trt'] },
  { id: 'uefa.europa.conf', name: 'UEFA Konferans Ligi', bc: ['trt'] },
  { id: 'eng.1', name: 'Premier Lig', bc: ['bein'] },
  { id: 'esp.1', name: 'La Liga', bc: ['ssport'] },
  { id: 'ita.1', name: 'Serie A', bc: ['ssport'] },
  { id: 'ger.1', name: 'Bundesliga', bc: ['ssport'] },
  { id: 'fra.1', name: 'Ligue 1', bc: ['bein'] },
  { id: 'uefa.nations', name: 'UEFA Uluslar Ligi', bc: [], tr: ['aspor'] },
  { id: 'fifa.friendly', name: 'Hazırlık maçları (milli)', bc: [], tr: ['aspor'] },
  { id: 'uefa.euroq', name: 'EURO Elemeleri', bc: [], tr: ['aspor'] },
];
export const leagueOf = (id) => LEAGUES.find((l) => l.id === id) || null;

// ---- takım adları: eşleştirme sözcük öbekleri ve ekranda gösterilecek Türkçe ad ----

// Rehberde bu adla yazılabilecek ek yazımlar (anahtar: ESPN adının sadeleşmiş hali).
const ALIAS = {
  'manchester united': ['man united', 'man utd', 'manchester utd'],
  'manchester city': ['man city'],
  'newcastle united': ['newcastle'],
  'west ham united': ['west ham'],
  'tottenham hotspur': ['tottenham', 'spurs'],
  'wolverhampton wanderers': ['wolves', 'wolverhampton'],
  'brighton hove albion': ['brighton'],
  'nottingham forest': ['nottingham'],
  'leeds united': ['leeds'],
  'paris saint germain': ['psg', 'paris sg', 'paris st germain', 'paris'],
  'bayern munich': ['bayern munih', 'bayern munchen', 'bayern'],
  'atletico madrid': ['atletico', 'at madrid'],
  'athletic club': ['athletic bilbao', 'bilbao'],
  'real betis': ['betis'],
  'celta vigo': ['celta'],
  'rayo vallecano': ['rayo'],
  'ac milan': ['milan'],
  'inter milan': ['inter', 'internazionale'],
  'internazionale': ['inter'],
  'hellas verona': ['verona'],
  'borussia monchengladbach': ['gladbach', 'monchengladbach', 'm gladbach'],
  'borussia dortmund': ['dortmund'],
  'rb leipzig': ['leipzig'],
  'eintracht frankfurt': ['frankfurt'],
  'werder bremen': ['bremen'],
  '1 fc koln': ['koln'],
  'fc koln': ['koln'],
  'olympique marseille': ['marsilya', 'marseille'],
  'olympique lyonnais': ['lyon'],
  'ogc nice': ['nice'],
  'stade rennais': ['rennes'],
  'istanbul basaksehir': ['basaksehir', 'medipol basaksehir'],
  'caykur rizespor': ['rizespor'],
  'gaziantep fk': ['gaziantep'],
  'sporting cp': ['sporting lizbon', 'sporting'],
  'benfica': ['sl benfica'],
  'psv eindhoven': ['psv'],
  'club brugge': ['brugge'],
  'red bull salzburg': ['salzburg'],
  'shakhtar donetsk': ['shakhtar', 'sahtar'],
  'dynamo kyiv': ['dinamo kiev'],
  'red star belgrade': ['kizil yildiz', 'crvena zvezda'],
  'young boys': ['young boys'],
};

// [ESPN adı, Türkçe ad, rehberde ek yazımlar…] — milli takımlar
const NATIONS = [
  ['Turkey', 'Türkiye', 'turkiye', 'turk milli takimi'],
  ['Germany', 'Almanya'], ['France', 'Fransa'], ['Spain', 'İspanya'], ['Italy', 'İtalya'], ['England', 'İngiltere'],
  ['Netherlands', 'Hollanda'], ['Portugal', 'Portekiz'], ['Belgium', 'Belçika'], ['Croatia', 'Hırvatistan'],
  ['Switzerland', 'İsviçre'], ['Denmark', 'Danimarka'], ['Poland', 'Polonya'], ['Austria', 'Avusturya'],
  ['Sweden', 'İsveç'], ['Norway', 'Norveç'], ['Greece', 'Yunanistan'], ['Serbia', 'Sırbistan'],
  ['Czechia', 'Çekya', 'cek cumhuriyeti', 'czech republic'], ['Czech Republic', 'Çekya', 'cekya', 'cek cumhuriyeti'],
  ['Scotland', 'İskoçya'], ['Wales', 'Galler'], ['Ireland', 'İrlanda'], ['Republic of Ireland', 'İrlanda Cumhuriyeti', 'irlanda'],
  ['Northern Ireland', 'Kuzey İrlanda'], ['Hungary', 'Macaristan'], ['Romania', 'Romanya'], ['Ukraine', 'Ukrayna'],
  ['Slovakia', 'Slovakya'], ['Slovenia', 'Slovenya'], ['Bulgaria', 'Bulgaristan'], ['Georgia', 'Gürcistan'],
  ['Azerbaijan', 'Azerbaycan'], ['Albania', 'Arnavutluk'], ['Bosnia and Herzegovina', 'Bosna-Hersek', 'bosna hersek'],
  ['Bosnia-Herzegovina', 'Bosna-Hersek', 'bosna hersek'], ['North Macedonia', 'Kuzey Makedonya'],
  ['Kazakhstan', 'Kazakistan'], ['Israel', 'İsrail'], ['Iceland', 'İzlanda'], ['Finland', 'Finlandiya'],
  ['Luxembourg', 'Lüksemburg'], ['Montenegro', 'Karadağ'], ['Latvia', 'Letonya'], ['Lithuania', 'Litvanya'],
  ['Estonia', 'Estonya'], ['Kosovo', 'Kosova'], ['Cyprus', 'Kıbrıs'], ['Armenia', 'Ermenistan'],
  ['Faroe Islands', 'Faroe Adaları', 'faroe'], ['Moldova', 'Moldova'], ['Malta', 'Malta'], ['Andorra', 'Andorra'],
  ['Brazil', 'Brezilya'], ['Argentina', 'Arjantin'], ['United States', 'ABD', 'abd'], ['USA', 'ABD', 'abd'],
  ['Mexico', 'Meksika'], ['Japan', 'Japonya'], ['South Korea', 'Güney Kore'], ['Morocco', 'Fas'], ['Uruguay', 'Uruguay'],
];

export const norm = (s) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim();
const GENERIC = new Set(['fc', 'cf', 'sc', 'afc', 'ac', 'as', 'ssc', 'fk', 'sk', 'bk', 'sv', 'vfb', 'vfl', 'tsg', 'ud', 'cd', 'rcd', 'ca', 'us', 'og', 'club', 'de', 'the', 'calcio', 'bsc', 'cfc', 'kv', 'sl', 'if', 'ik']);
// Tek başına bir takımı ayırt etmeyen sözcükler (tek sözcükle eşleştirmede kullanılmaz)
const AMBIG = new Set(['manchester', 'borussia', 'olympique', 'sporting', 'racing', 'united', 'albion', 'rovers', 'wanderers', 'athletic', 'atletico', 'saint', 'dynamo', 'spartak', 'lokomotiv', 'internacional', 'national', 'republic', 'district', 'herzegovina']);

const TR_NAME = new Map();
const NATION_ALIAS = new Map();
for (const [en, tr, ...extra] of NATIONS) {
  TR_NAME.set(norm(en), tr);
  NATION_ALIAS.set(norm(en), [norm(tr), ...extra.map(norm)].filter(Boolean));
}

// Ekranda gösterilecek ad: milli takımlar Türkçe, kulüpler ESPN'deki gibi.
export const teamLabel = (name) => TR_NAME.get(norm(name)) || String(name || '?');
export const isTurkey = (name) => norm(name) === 'turkey' || norm(name) === 'turkiye';

const phraseCache = new Map();
// Takımın rehber başlığında geçebileceği sözcük öbekleri.
export function teamPhrases(name) {
  const core = norm(name);
  let out = phraseCache.get(core);
  if (out) return out;
  const set = new Set([core]);
  for (const a of ALIAS[core] || []) set.add(a);
  for (const a of NATION_ALIAS.get(core) || []) set.add(a);
  const words = core.split(' ').filter((w) => !GENERIC.has(w));
  const stripped = words.join(' ');
  if (stripped) set.add(stripped);
  for (const w of words) if (w.length >= 6 && !AMBIG.has(w)) set.add(w);
  out = [...set].filter((p) => p.length >= 3);
  phraseCache.set(core, out);
  return out;
}

// Kaynakları birleştirirken takım eşitliği için: kesin adlar (tam ad, sadeleşmiş ad, bilinen ek yazımlar) ve ayırt edici sözcükler.
// teamPhrases'ten daha tutucudur (tek bir sözcük paylaşmak yetmez: Real Madrid ≠ Atletico Madrid).
export function teamKeys(name) {
  const core = norm(name);
  const strong = new Set([core]);
  for (const a of ALIAS[core] || []) strong.add(a);
  for (const a of NATION_ALIAS.get(core) || []) strong.add(a);
  const words = core.split(' ').filter((w) => w && !GENERIC.has(w));
  if (words.length) strong.add(words.join(' '));
  return {
    strong: new Set([...strong].filter((p) => p.length >= 3)),
    words: new Set(words.filter((w) => w.length >= 7 && !AMBIG.has(w))),
    single: words.length === 1 && words[0].length >= 7 ? words[0] : '',
  };
}

const hasAny = (paddedText, phrases) => phrases.some((p) => paddedText.includes(' ' + p + ' '));

// Program başlığı (+ açıklaması) iki takımı da içeriyorsa ve yayın başlangıcı maça yakınsa o program bu maçındır.
// hits: [{ id, p: { s, e, t, d } }] (TV rehberi). findPrograms: eşleşenlerin hepsi (maça en yakın başlangıçtan uzağa);
// findProgram: yalnız en yakını ({ id, p }) ya da null.
export function findPrograms(match, hits, { before = 90 * 60000, after = 20 * 60000 } = {}) {
  if (!match || !hits || !hits.length) return [];
  const hp = teamPhrases(match.home.name);
  const ap = teamPhrases(match.away.name);
  const found = [];
  for (const h of hits) {
    const p = h.p;
    if (!p || !(p.s >= match.t - before && p.s <= match.t + after && p.e > match.t)) continue;
    const text = ' ' + norm(p.t) + (p.d ? ' ' + norm(p.d) : '') + ' ';
    if (!hasAny(text, hp) || !hasAny(text, ap)) continue;
    found.push({ h, d: Math.abs(p.s - match.t) });
  }
  return found.sort((a, b) => a.d - b.d).map((x) => x.h);
}

export function findProgram(match, hits, opts) {
  return findPrograms(match, hits, opts)[0] || null;
}

// Başlangıca göre sıralı program listesinden [from, to] aralığındakileri verir (ikili arama; binlerce maç × program taramasını önler).
export function slicePrograms(sorted, from, to) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].p.s < from) lo = mid + 1;
    else hi = mid;
  }
  const out = [];
  for (let i = lo; i < sorted.length && sorted[i].p.s <= to; i++) out.push(sorted[i]);
  return out;
}

// Rehberde karşılığı yoksa gösterilecek yayıncı (tahmini): { names: 'beIN SPORTS', keys: ['bein'] } ya da null.
export function broadcasterFor(match) {
  const lg = leagueOf(match.lg);
  if (!lg) return null;
  let keys = lg.bc || [];
  if (lg.tr && (isTurkey(match.home.name) || isTurkey(match.away.name))) keys = lg.tr;
  if (!keys.length) return null;
  return { names: keys.map((k) => BROADCASTERS[k].name).join(' / '), keys: [...keys] };
}

// Yayıncının kanalları: kanal adında yayıncının sözcüklerinden biri geçenler (en çok max kanal).
export function channelsOfBroadcaster(items, keys, max = 14) {
  const phrases = (keys || []).flatMap((k) => (BROADCASTERS[k] ? BROADCASTERS[k].keys : []));
  const out = [];
  for (const it of items || []) {
    if (hasAny(' ' + norm(it.name) + ' ', phrases)) {
      out.push(it);
      if (out.length >= max) break;
    }
  }
  return out;
}

// ---- ESPN verisi ----

const ymd = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
};

export function scoreboardUrl(slug, fromMs, toMs, base = ESPN_BASE) {
  return `${base}${slug}/scoreboard?dates=${ymd(fromMs)}-${ymd(toMs)}&limit=300`;
}

// ESPN'in resmî olmayan API'si tarih aralığı/limit parametrelerini her zaman kabul etmeyebilir; sırayla daha yalın adresler denenir:
// 0) aralık + limit, 1) yalnız aralık, 2) parametresiz (yalnız güncel gün). Çalışan basamak sonraki liglerde baştan kullanılır.
export function scoreboardLadder(slug, fromMs, toMs, base = ESPN_BASE) {
  return [scoreboardUrl(slug, fromMs, toMs, base), `${base}${slug}/scoreboard?dates=${ymd(fromMs)}-${ymd(toMs)}`, `${base}${slug}/scoreboard`];
}

// ESPN durum nesnesi → { state: 'pre'|'in'|'post', text } (text: ekrandaki kısa yazı; 'pre'de boş = saat gösterilir)
export function statusOf(st) {
  const type = (st && st.type) || {};
  const name = String(type.name || '').toUpperCase();
  const state = type.state === 'in' || type.state === 'post' ? type.state : 'pre';
  if (/POSTPONED/.test(name)) return { state: 'pre', text: 'Ertelendi', off: true };
  if (/CANCEL/.test(name)) return { state: 'post', text: 'İptal', off: true };
  if (/SUSPEND|ABANDON/.test(name)) return { state: 'post', text: 'Yarıda kaldı', off: true };
  if (/DELAY/.test(name)) return { state: 'pre', text: 'Gecikmeli', off: false };
  if (state === 'in') {
    if (/HALFTIME/.test(name)) return { state, text: 'Devre arası' };
    if (/SHOOTOUT/.test(name)) return { state, text: 'Penaltılar' };
    const clock = String((st && st.displayClock) || '').trim();
    return { state, text: clock && clock !== "0'" ? clock : 'Canlı' };
  }
  if (state === 'post') {
    if (/PEN/.test(name)) return { state, text: 'MS (pen.)' };
    if (/AET|EXTRA/.test(name)) return { state, text: 'MS (uzatma)' };
    return { state, text: 'MS' };
  }
  return { state, text: '' };
}

const intOrNull = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

function side(c, played) {
  const team = (c && c.team) || {};
  const raw = team.displayName || team.shortDisplayName || team.name || team.location || '?';
  return {
    name: String(raw),
    label: teamLabel(raw),
    abbr: String(team.abbreviation || '').slice(0, 4),
    logo: typeof team.logo === 'string' && /^https?:\/\//i.test(team.logo) ? team.logo : '',
    score: played ? intOrNull(c && c.score) : null,
    pen: c && c.shootoutScore != null ? intOrNull(c.shootoutScore) : null,
  };
}

const REGIONS = { us: 'ABD', gb: 'İngiltere', uk: 'İngiltere', ca: 'Kanada', au: 'Avustralya', es: 'İspanya', de: 'Almanya', fr: 'Fransa', it: 'İtalya', tr: 'Türkiye', br: 'Brezilya', mx: 'Meksika', pt: 'Portekiz', nl: 'Hollanda', ar: 'Arjantin', in: 'Hindistan' };

// ESPN yanıtındaki yayıncılar (çoğunlukla ABD/İngiltere/Avrupa kanalları): [{ name, region }]; yoksa boş dizi.
// broadcasts: [{ names: [...] }] ya da [{ media: { shortName } }]; geoBroadcasts: [{ media: { shortName }, region }]
export function parseBroadcasts(obj) {
  const out = [];
  const seen = new Set();
  const add = (name, region) => {
    const n = String(name || '').trim();
    if (!n || n.length > 40) return;
    const r = REGIONS[String(region || '').toLowerCase()] || (region ? String(region).toUpperCase().slice(0, 12) : '');
    const key = n.toLowerCase() + '|' + r;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: n, region: r });
  };
  for (const b of obj && Array.isArray(obj.broadcasts) ? obj.broadcasts : []) {
    if (typeof b === 'string') add(b, '');
    else if (b && Array.isArray(b.names)) for (const n of b.names) add(n, b.region || '');
    else if (b) add((b.media && (b.media.shortName || b.media.name)) || b.shortName || b.name, b.region || '');
  }
  for (const g of obj && Array.isArray(obj.geoBroadcasts) ? obj.geoBroadcasts : []) {
    if (g) add((g.media && (g.media.shortName || g.media.name)) || g.shortName, g.region || '');
  }
  return out.slice(0, 8);
}

// ESPN scoreboard yanıtı → maç listesi (bozuk kayıtlar atlanır, hata atmaz).
export function parseScoreboard(json, leagueId) {
  const out = [];
  const events = json && Array.isArray(json.events) ? json.events : [];
  for (const ev of events) {
    try {
      const comp = ev && Array.isArray(ev.competitions) ? ev.competitions[0] : null;
      if (!comp) continue;
      const cs = Array.isArray(comp.competitors) ? comp.competitors : [];
      const home = cs.find((c) => c && c.homeAway === 'home') || cs[0];
      const away = cs.find((c) => c && c.homeAway === 'away') || cs[1];
      if (!home || !away || home === away) continue;
      const t = Date.parse(ev.date || comp.date || comp.startDate || '');
      if (!Number.isFinite(t)) continue;
      const status = statusOf(comp.status || ev.status);
      const played = status.state !== 'pre';
      out.push({
        id: `${leagueId}:${ev.id || t}`,
        lg: leagueId,
        t,
        state: status.state,
        text: status.text,
        off: !!status.off,
        home: side(home, played),
        away: side(away, played),
        venue: String((comp.venue && comp.venue.fullName) || '').slice(0, 80),
        intl: parseBroadcasts(comp),
      });
    } catch {
      /* bozuk kayıt atlanır */
    }
  }
  return out;
}

const startOfDay = (ms) => new Date(ms).setHours(0, 0, 0, 0);

export function withTimeout(p, ms) {
  let timer;
  return Promise.race([p, new Promise((_, rej) => (timer = setTimeout(() => rej(new Error('Sunucu zamanında yanıt vermedi')), ms)))]).finally(() => clearTimeout(timer));
}

// Dün'den (back) bugünden itibaren ahead gün sonrasına kadar tüm liglerin maçları. Bir lig alınamazsa diğerleri yine gelir.
// Döner: { matches, okCount, failed: [lig kimlikleri], errors: { lig: ilk hata iletisi }, level }; hiçbir lig alınamazsa hata atar
// (hata.detail: "tur.1: HTTP 403" gibi ilk nedenler, ekranda gösterilir).
export async function loadMatches({ net, now = Date.now(), back = 1, ahead = 7, leagues = LEAGUES, base = ESPN_BASE, timeoutMs = 12000, parallel = 4, budgetMs = 60000 } = {}) {
  const today = startOfDay(now);
  const from = today - back * DAY;
  const to = today + (ahead + 1) * DAY;
  const matches = [];
  const failed = [];
  const errors = {};
  let okCount = 0;
  let level = 0; // çalışan en yalın basamak (sonraki ligler buradan başlar)
  const votes = [0, 0, 0];
  const deadline = Date.now() + budgetMs;
  const queue = [...leagues];
  async function worker() {
    for (let lg = queue.shift(); lg; lg = queue.shift()) {
      if (Date.now() > deadline) {
        failed.push(lg.id);
        errors[lg.id] = errors[lg.id] || 'Süre doldu';
        continue;
      }
      const urls = scoreboardLadder(lg.id, from - DAY, to + DAY, base);
      let json = null;
      for (let k = Math.min(level, urls.length - 1); k < urls.length && json === null; k++) {
        try {
          json = await withTimeout(net.json(urls[k], { fast: true }), timeoutMs);
          if (json === null || typeof json !== 'object') throw new Error('Boş yanıt');
          if (k > level && ++votes[k] >= 2) level = k; // iki ayrı ligde aynı basamağa düşülürse sonrakiler oradan başlar (tek seferlik ağ hatası yalınlaştırmaz)
        } catch (e) {
          json = null;
          if (!errors[lg.id]) errors[lg.id] = String((e && e.message) || e || 'hata').slice(0, 140);
        }
      }
      if (json === null) {
        failed.push(lg.id);
        continue;
      }
      delete errors[lg.id];
      okCount++;
      for (const m of parseScoreboard(json, lg.id)) if (m.t >= from && m.t < to) matches.push(m);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(parallel, leagues.length)) }, worker));
  if (!okCount) {
    const err = new Error('Maç bilgisi alınamadı. İnternet bağlantınızı denetleyin.');
    err.detail = Object.entries(errors).slice(0, 3).map(([id, m]) => `${id}: ${m}`).join(' · ');
    throw err;
  }
  const seen = new Set();
  const uniq = matches.filter((m) => !seen.has(m.id) && seen.add(m.id));
  uniq.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return { matches: uniq, okCount, failed, errors, level };
}

// ---- gün ve lig süzgeci ----

const DAYS_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// Yerel takvim gününün sayısal anahtarı (gece yarısı, ms)
export const dayStart = startOfDay;

export function dayLabel(dayMs, now = Date.now()) {
  const diff = Math.round((dayMs - startOfDay(now)) / DAY);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Yarın';
  if (diff === -1) return 'Dün';
  const d = new Date(dayMs);
  return `${DAYS_TR[d.getDay()]} ${d.getDate()} ${MONTHS_TR[d.getMonth()]}`;
}

// Gün şeridi: dünden başlayıp ahead gün sonrasına kadar gün başlangıçları
export function dayStrip(now = Date.now(), back = 1, ahead = 7) {
  const today = startOfDay(now);
  const out = [];
  for (let i = -back; i <= ahead; i++) out.push(new Date(today).setDate(new Date(today).getDate() + i));
  return out;
}

export const matchesOnDay = (matches, dayMs) => matches.filter((m) => startOfDay(m.t) === dayMs);

// İkinci kaynaktan (LiveScore) gelen, ESPN tablosunda olmayan yarışmaların grupları. Sıra ekrandaki sıradır.
// "oth" yalnız kendi düğmesinden görünür ("Tümü" listesini binlerce alt lig maçıyla doldurmaz).
export const GROUPS = [
  { id: 'tr', name: 'Türkiye · diğer' },
  { id: 'int', name: 'Uluslararası' },
  { id: 'eu', name: 'Avrupa ligleri' },
  { id: 'oth', name: 'Diğer ülkeler' },
];
const groupIndex = (id) => {
  const i = GROUPS.findIndex((g) => g.id === id);
  return i < 0 ? GROUPS.length - 1 : i;
};

// Liglere göre bölümler: önce LEAGUES sırasıyla ESPN ligleri, sonra ikinci kaynağın yarışmaları (grup, sıra, ad).
// leagueId: '' (tümü: "oth" grubu hariç), bir lig/yarışma kimliği ya da 'g:<grup>' (grubun tümü).
export function sections(matches, leagueId = '') {
  const out = [];
  const byGroup = leagueId.startsWith('g:') ? leagueId.slice(2) : '';
  for (const lg of LEAGUES) {
    if (leagueId && lg.id !== leagueId) continue;
    const list = matches.filter((m) => m.lg === lg.id).sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
    if (list.length) out.push({ lg, matches: list });
  }
  const extra = new Map();
  for (const m of matches) {
    if (leagueOf(m.lg)) continue;
    const g = m.grp || 'oth';
    if (leagueId) {
      if (byGroup ? g !== byGroup : m.lg !== leagueId) continue;
    } else if (g === 'oth') continue;
    let sec = extra.get(m.lg);
    if (!sec) extra.set(m.lg, (sec = { lg: { id: m.lg, name: m.lgName || 'Diğer', grp: g, ord: Number(m.ord) || 0 }, matches: [] }));
    sec.matches.push(m);
  }
  const rest = [...extra.values()];
  for (const s of rest) s.matches.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  rest.sort((a, b) => groupIndex(a.lg.grp) - groupIndex(b.lg.grp) || a.lg.ord - b.lg.ord || a.lg.name.localeCompare(b.lg.name, 'tr'));
  return out.concat(rest);
}

// Seçili günün lig düğmeleri: { all: "Tümü" sayısı, chips: [{ id, name, count }] } (ESPN ligleri, sonra ikinci kaynağın grupları).
export function chipsFor(dayMatches) {
  const counts = new Map();
  const groups = new Map();
  let all = 0;
  for (const m of dayMatches) {
    if (leagueOf(m.lg)) {
      counts.set(m.lg, (counts.get(m.lg) || 0) + 1);
      all++;
      continue;
    }
    const g = m.grp || 'oth';
    groups.set(g, (groups.get(g) || 0) + 1);
    if (g !== 'oth') all++;
  }
  const chips = LEAGUES.filter((l) => counts.has(l.id)).map((l) => ({ id: l.id, name: l.name, count: counts.get(l.id) }));
  for (const g of GROUPS) if (groups.has(g.id)) chips.push({ id: 'g:' + g.id, name: g.name, count: groups.get(g.id) });
  return { all, chips };
}

// Çok uzun listeleri keser (alt lig yığınları düşük güçlü TV kutularını yormasın): en çok max maç; kesilen sayısı hidden.
export function capSections(secs, max = 500) {
  let left = max;
  let hidden = 0;
  const out = [];
  for (const s of secs) {
    if (left <= 0) {
      hidden += s.matches.length;
      continue;
    }
    if (s.matches.length <= left) {
      out.push(s);
      left -= s.matches.length;
    } else {
      out.push({ lg: s.lg, matches: s.matches.slice(0, left) });
      hidden += s.matches.length - left;
      left = 0;
    }
  }
  return { secs: out, hidden };
}

export const hasLive = (matches) => matches.some((m) => m.state === 'in');
