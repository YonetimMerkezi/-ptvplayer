// Maç ayrıntısı: ESPN "summary" yanıtını ekran verisine çevirir (olaylar, kadro, hakem, yayıncılar).
// ESPN'in resmî olmayan API'si alanları her maçta vermez; her şey eksik olabilir kabul edilir, hiçbir okuma hata atmaz.
import { ESPN_BASE, statusOf, parseBroadcasts } from './sports.js';
import { channelsByName } from './sports-tv.js';

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

// Devre arası / maç sonu işaretleri (ESPN keyEvents): çizelgede ayraç olur, o ana kadarki skorla gösterilir.
export function markerKind(ke) {
  const t = `${str(ke && ke.type && ke.type.text)} ${str(ke && ke.type && ke.type.type)}`.toLowerCase();
  if (/start|begin|kick.?off/.test(t)) return null;
  if (/half.?time|end 1st half|end first half/.test(t)) return 'ht';
  if (/full.?time|end regular time|end 2nd half|end second half|end of match|match end/.test(t)) return 'ft';
  return null;
}

// "45'+2'" gibi uzatma dakikaları da sıralanır: 45.02
export function minuteValue(v) {
  const m = /(\d+)(?:\D*?\+\s*(\d+))?/.exec(str(v));
  if (!m) return NaN;
  return Number(m[1]) + (m[2] ? Number(m[2]) / 100 : 0);
}

// Gol türüne ek bilgi (küçük etiket)
function detailOf(ke, kind) {
  const t = `${str(ke && ke.type && ke.type.text)} ${str(ke && ke.shortText)}`.toLowerCase();
  if (kind === 'goal') {
    if (ke && ke.penaltyKick === true || /penalty/.test(t)) return 'penaltı';
    if (/free.?kick/.test(t)) return 'serbest vuruş';
    if (/header/.test(t)) return 'kafa';
  }
  if (kind === 'red' && /yellow.?red|second.?yellow/.test(t)) return 'ikinci sarıdan';
  return '';
}

export const KIND_LABEL = { goal: 'Gol', own: 'Kendi kalesine gol', penmiss: 'Penaltı kaçtı', yellow: 'Sarı kart', red: 'Kırmızı kart', sub: 'Oyuncu değişikliği', var: 'VAR' };

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
  arr(j.keyEvents).forEach((ke, idx) => {
    try {
      const mark = eventKind(ke) ? null : markerKind(ke);
      const kind = eventKind(ke) || mark;
      if (!kind) return;
      const teamId = str(ke.team && ke.team.id);
      const parts = arr(ke.participants).map((p) => str(p && p.athlete && (p.athlete.displayName || p.athlete.fullName))).filter(Boolean);
      const clock = (ke.clock && (ke.clock.displayValue || (ke.clock.value != null ? Math.round(ke.clock.value / 60) + "'" : ''))) || '';
      out.push({
        kind,
        mark: !!mark,
        idx,
        minute: str(clock),
        side: teamId && teamId === ids.home ? 'home' : teamId && teamId === ids.away ? 'away' : '',
        player: parts[0] || '', // oyuncu değişikliğinde giren oyuncu
        other: parts[1] || '', // oyuncu değişikliğinde çıkan
        detail: detailOf(ke, kind),
        score: '',
        text: str(ke.shortText || ke.text).slice(0, 160),
      });
    } catch {
      /* bozuk olay atlanır */
    }
  });
  // Dakikaya göre sırala (aynı dakikada ESPN sırası); dakikası okunamayan olay bir öncekinin yerinde kalır
  let last = 0;
  for (const e of out) {
    const v = minuteValue(e.minute);
    e.key = Number.isFinite(v) ? (last = v) : last;
  }
  out.sort((a, b) => a.key - b.key || a.idx - b.idx);
  // Golden sonraki skor; takımı bilinmeyen gol varsa o noktadan sonra skor yazılmaz
  let h = 0;
  let a = 0;
  let known = true;
  for (const e of out) {
    if (e.kind === 'goal' || e.kind === 'own') {
      const side = e.kind === 'own' ? (e.side === 'home' ? 'away' : e.side === 'away' ? 'home' : '') : e.side;
      if (side === 'home') h++;
      else if (side === 'away') a++;
      else known = false;
    }
    if (known && (e.kind === 'goal' || e.kind === 'own' || e.mark)) e.score = `${h}–${a}`;
    delete e.key;
    delete e.idx;
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
    // Maç öncesi liste çoğu zaman "ilk 11" işareti olmadan gelir: hepsini yedek saymak yanlış olur, düz oyuncu listesi olarak gösterilir
    const squad = !players.some((p) => p.starter);
    out[side] = {
      formation: str(typeof f === 'string' ? f : f && (f.summary || f.displayName)),
      starters: players.filter((p) => p.starter),
      subs: players.filter((p) => !p.starter),
      squad,
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
    lineups: parseLineups(j, ids),
    intl: bc.slice(0, 8),
  };
  data.empty = !data.events.length && !data.lineups.home && !data.lineups.away;
  return data;
}

// Başlamamış maçın kadrosu genelde başlama saatinden ~1 saat önce açıklanır: ayrıntı sayfası açıkken bu süreye girince otomatik yoklanır.
export const PRE_POLL_MS = 90 * 60e3;
export const shouldPoll = (state, t, nowMs) => state === 'in' || (state === 'pre' && Number(t) - nowMs < PRE_POLL_MS);

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

// Yayın bölümü grupları: Rehberinizde (TV rehberindeki program) ve Yayın kanalları (maçın yayın listesindeki kanalların listenizdeki karşılıkları).
// Bilgi yoksa grup da yoktur: tahmin yürütülmez, ilgisiz kanal listelenmez. Kanallar gruplar arasında tekrarlanmaz.
export function broadcastGroups({ epgChans = [], tvNames = [], items = [], max = 14 }) {
  const used = new Set();
  const take = (list) => list.filter((c) => !used.has(c.item.id) && used.add(c.item.id));
  const groups = [];
  const epg = take(epgChans.map((c) => ({ item: c.item, p: c.p })));
  if (epg.length) groups.push({ id: 'epg', title: 'Rehberinizde', note: '', channels: epg });
  if (tvNames.length) {
    const ch = take(channelsByName(items, tvNames, max).map((item) => ({ item })));
    if (ch.length || !epg.length) {
      groups.push({ id: 'tv', title: `Yayın kanalları: ${tvNames.join(', ')}`, note: ch.length ? '' : 'Bu kanallar listenizde bulunamadı.', channels: ch });
    }
  }
  return groups;
}
