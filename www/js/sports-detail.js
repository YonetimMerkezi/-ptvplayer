// Maç ayrıntısı: ESPN "summary" yanıtını ekran verisine çevirir (olaylar, istatistik, kadro, stat/hakem, yayıncılar).
// ESPN'in resmî olmayan API'si alanları her maçta vermez; her şey eksik olabilir kabul edilir, hiçbir okuma hata atmaz.
import { ESPN_BASE, statusOf, parseBroadcasts } from './sports.js';

export const summaryUrl = (slug, eventId, base = ESPN_BASE) => `${base}${slug}/summary?event=${encodeURIComponent(eventId)}`;

// Maç kimliği "tur.1:12345" biçimindedir; ESPN olay kimliği ":" sonrasıdır.
export const eventIdOf = (m) => String(m.id || '').slice(String(m.lg || '').length + 1);

const str = (v) => (v == null ? '' : String(v)).trim();
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// Olay türü (ESPN keyEvents[].type.text): ekranda gösterilecek kısa tür; ilgisiz olaylar (başlama/devre arası) null.
export function eventKind(ke) {
  const t = `${str(ke && ke.type && ke.type.text)} ${str(ke && ke.type && ke.type.type)}`.toLowerCase();
  if (/own.?goal/.test(t)) return 'own';
  if (/penalty/.test(t) && /(miss|saved|fail|no goal)/.test(t)) return 'penmiss';
  if (/goal/.test(t) || (ke && ke.scoringPlay === true) || /penalty.*(scor|goal)/.test(t)) return 'goal';
  if (/yellow.?red|second.?yellow|red.?card/.test(t)) return 'red';
  if (/yellow/.test(t)) return 'yellow';
  if (/substitution/.test(t)) return 'sub';
  if (/\bvar\b/.test(t)) return 'var';
  return null;
}

export const KIND_LABEL = { goal: 'Gol', own: 'Kendi kalesine gol', penmiss: 'Penaltı kaçtı', yellow: 'Sarı kart', red: 'Kırmızı kart', sub: 'Oyuncu değişikliği', var: 'VAR' };

// Gösterilecek istatistikler: [ESPN adı, Türkçe etiket, yüzde mi]
export const STAT_ROWS = [
  ['possessionPct', 'Topla oynama', true],
  ['totalShots', 'Şut'],
  ['shotsOnTarget', 'İsabetli şut'],
  ['wonCorners', 'Korner'],
  ['foulsCommitted', 'Faul'],
  ['offsides', 'Ofsayt'],
  ['saves', 'Kurtarış'],
  ['yellowCards', 'Sarı kart'],
  ['redCards', 'Kırmızı kart'],
];

function sideIds(j, comp) {
  const ids = { home: '', away: '' };
  const put = (side, id) => {
    const v = str(id);
    if (v && (side === 'home' || side === 'away') && !ids[side]) ids[side] = v;
  };
  for (const c of arr(comp && comp.competitors)) put(c && c.homeAway, (c && (c.id || (c.team && c.team.id))) || '');
  for (const t of arr(j.boxscore && j.boxscore.teams)) put(t && t.homeAway, t && t.team && t.team.id);
  for (const r of arr(j.rosters)) put(r && r.homeAway, r && r.team && r.team.id);
  return ids;
}

function parseEvents(j, ids) {
  const out = [];
  for (const ke of arr(j.keyEvents)) {
    try {
      const kind = eventKind(ke);
      if (!kind) continue;
      const teamId = str(ke.team && ke.team.id);
      const parts = arr(ke.participants).map((p) => str(p && p.athlete && (p.athlete.displayName || p.athlete.fullName))).filter(Boolean);
      const clock = (ke.clock && (ke.clock.displayValue || (ke.clock.value != null ? Math.round(ke.clock.value / 60) + "'" : ''))) || '';
      out.push({
        kind,
        minute: str(clock),
        side: teamId && teamId === ids.home ? 'home' : teamId && teamId === ids.away ? 'away' : '',
        player: parts[0] || '',
        other: parts[1] || '', // oyuncu değişikliğinde çıkan (ya da gole asist yapan)
        text: str(ke.shortText || ke.text).slice(0, 160),
      });
    } catch {
      /* bozuk olay atlanır */
    }
  }
  return out;
}

function statMap(team) {
  const m = new Map();
  for (const s of arr(team && team.statistics)) {
    if (s && s.name) m.set(String(s.name), s);
  }
  return m;
}

function parseStats(j, ids) {
  const sides = {};
  for (const t of arr(j.boxscore && j.boxscore.teams)) {
    const id = str(t && t.team && t.team.id);
    const side = (t && (t.homeAway === 'home' || t.homeAway === 'away') && t.homeAway) || (id && id === ids.home ? 'home' : id && id === ids.away ? 'away' : '');
    if (side) sides[side] = statMap(t);
  }
  if (!sides.home || !sides.away) return [];
  const out = [];
  for (const [name, label, pct] of STAT_ROWS) {
    const h = sides.home.get(name);
    const a = sides.away.get(name);
    if (!h || !a) continue;
    const hv = num(h.displayValue != null ? h.displayValue : h.value);
    const av = num(a.displayValue != null ? a.displayValue : a.value);
    if (hv == null || av == null) continue;
    const fmt = (v) => (pct ? Math.round(v) + '%' : String(Math.round(v)));
    out.push({ label, home: fmt(hv), away: fmt(av), hv, av });
  }
  return out;
}

function parseLineups(j, ids) {
  const out = {};
  for (const r of arr(j.rosters)) {
    const id = str(r && r.team && r.team.id);
    const side = (r && (r.homeAway === 'home' || r.homeAway === 'away') && r.homeAway) || (id && id === ids.home ? 'home' : id && id === ids.away ? 'away' : '');
    if (!side) continue;
    const players = arr(r.roster)
      .map((p) => ({
        n: str(p && p.jersey),
        name: str(p && p.athlete && (p.athlete.displayName || p.athlete.fullName)),
        pos: str(p && p.position && (p.position.abbreviation || p.position.displayName)),
        starter: !!(p && p.starter),
      }))
      .filter((p) => p.name);
    if (!players.length) continue;
    const f = r.formation;
    out[side] = {
      formation: str(typeof f === 'string' ? f : f && (f.summary || f.displayName)),
      starters: players.filter((p) => p.starter),
      subs: players.filter((p) => !p.starter),
    };
  }
  return out;
}

// ESPN summary yanıtı → ekran verisi. m: listedeki maç (ad/logo/saat için yedek).
export function parseSummary(json, m) {
  const j = json && typeof json === 'object' ? json : {};
  const comp = (j.header && arr(j.header.competitions)[0]) || null;
  const ids = sideIds(j, comp);
  const status = comp && comp.status ? statusOf(comp.status) : null;
  const score = (side) => {
    const c = arr(comp && comp.competitors).find((x) => x && x.homeAway === side);
    if (!c || c.score == null || c.score === '') return null;
    const n = parseInt(c.score, 10);
    return Number.isFinite(n) ? n : null;
  };
  const info = j.gameInfo || {};
  const venue = info.venue || {};
  const ref = arr(info.officials).find((o) => o && (o.fullName || o.displayName));
  const bc = [];
  for (const b of [...parseBroadcasts(comp), ...parseBroadcasts(j)]) if (!bc.some((x) => x.name === b.name && x.region === b.region)) bc.push(b);
  const data = {
    status,
    home: { score: score('home') },
    away: { score: score('away') },
    venue: str(venue.fullName),
    city: str(venue.address && (venue.address.city || venue.address.country)),
    attendance: num(info.attendance) || 0,
    referee: ref ? str(ref.fullName || ref.displayName) : '',
    events: parseEvents(j, ids),
    stats: parseStats(j, ids),
    lineups: parseLineups(j, ids),
    intl: bc.slice(0, 8),
  };
  data.empty = !data.events.length && !data.stats.length && !data.lineups.home && !data.lineups.away;
  return data;
}

// Ayrıntıyı indirir. Döner: parseSummary çıktısı; ağ/biçim hatasında Error (hata.detail: kısa neden).
export async function loadSummary({ net, match, base = ESPN_BASE, timeoutMs = 12000 }) {
  const url = summaryUrl(match.lg, eventIdOf(match), base);
  let timer;
  try {
    const json = await Promise.race([
      net.json(url, { fast: true }),
      new Promise((_, rej) => (timer = setTimeout(() => rej(new Error('Sunucu zamanında yanıt vermedi')), timeoutMs))),
    ]);
    if (!json || typeof json !== 'object') throw new Error('Boş yanıt');
    return parseSummary(json, match);
  } catch (e) {
    const err = new Error('Maç ayrıntısı alınamadı. İnternet bağlantınızı denetleyin.');
    err.detail = String((e && e.message) || e || 'hata').slice(0, 140);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
