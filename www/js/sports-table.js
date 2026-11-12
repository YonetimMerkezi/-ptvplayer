// Puan durumu: ESPN'in herkese açık tablo yanıtı → { groups: [{ name, rows }] }. Saf mantık (ağ dışarıdan verilir); ekran sports-table-ui.js'te.
// Yanıt biçimi her lig için aynı olmayabilir (tek tablo / gruplar); ayrıştırıcı bu yüzden tutucu ve toleranslıdır.
import { ESPN_BASE, LEAGUES, teamLabel, withTimeout } from './sports.js';

// Tablosu olan ligler (kupa/milli maç yarışmalarında lig tablosu yok)
export const TABLE_IDS = ['tur.1', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'uefa.champions', 'uefa.europa', 'uefa.europa.conf'];
export const TABLE_LEAGUES = TABLE_IDS.map((id) => LEAGUES.find((l) => l.id === id)).filter(Boolean);

// Tablo adresi site/v2 altında değil, apis/v2 altındadır; site/v2 varyantı yedek olarak denenir.
export function standingsUrls(slug, base = ESPN_BASE) {
  const main = base.includes('/apis/site/v2/') ? base.replace('/apis/site/v2/', '/apis/v2/') : base;
  const urls = [`${main}${slug}/standings`];
  if (main !== base) urls.push(`${base}${slug}/standings`);
  return urls;
}

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const STAT_KEYS = {
  rank: ['rank'],
  p: ['gamesplayed', 'gp', 'played'],
  w: ['wins', 'w'],
  d: ['ties', 'draws', 'd', 't'],
  l: ['losses', 'l'],
  gd: ['pointdifferential', 'goaldifferential', 'gd'],
  pts: ['points', 'pts'],
};

function statMap(stats) {
  const m = new Map();
  for (const s of Array.isArray(stats) ? stats : []) {
    if (!s) continue;
    const v = num(s.value != null ? s.value : s.displayValue);
    if (v == null) continue;
    for (const k of [s.name, s.type, s.abbreviation, s.shortDisplayName]) {
      const key = String(k || '').toLowerCase();
      if (key && !m.has(key)) m.set(key, v);
    }
  }
  return m;
}

const pick = (m, names) => {
  for (const n of names) if (m.has(n)) return m.get(n);
  return null;
};

function parseEntry(e) {
  const team = (e && e.team) || {};
  const raw = team.displayName || team.shortDisplayName || team.name || team.location || '';
  if (!raw) return null;
  const st = statMap(e.stats);
  const logos = Array.isArray(team.logos) ? team.logos : [];
  const logo = (logos[0] && logos[0].href) || team.logo || '';
  const row = {
    name: String(raw),
    label: teamLabel(raw),
    logo: typeof logo === 'string' && /^https?:\/\//i.test(logo) ? logo : '',
    rank: pick(st, STAT_KEYS.rank),
    p: pick(st, STAT_KEYS.p),
    w: pick(st, STAT_KEYS.w),
    d: pick(st, STAT_KEYS.d),
    l: pick(st, STAT_KEYS.l),
    gd: pick(st, STAT_KEYS.gd),
    pts: pick(st, STAT_KEYS.pts),
  };
  if (row.pts == null && row.w != null && row.d != null) row.pts = row.w * 3 + row.d;
  if (row.pts == null && row.rank == null) return null; // sayısal hiçbir şey yok: tablo satırı değil
  return row;
}

function collect(node, name, out, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 4) return;
  const entries = node.standings && Array.isArray(node.standings.entries) ? node.standings.entries : Array.isArray(node.entries) ? node.entries : null;
  const gname = typeof node.name === 'string' ? node.name : name;
  if (entries) out.push({ name: gname || '', entries });
  for (const c of Array.isArray(node.children) ? node.children : []) collect(c, gname, out, depth + 1);
}

// Dönüş: [{ name, rows }] (boş gruplar atılır; sıra: ESPN sırası, yoksa puana göre)
export function parseStandings(json) {
  const found = [];
  collect(json, '', found);
  const groups = [];
  for (const g of found) {
    const rows = g.entries.map(parseEntry).filter(Boolean);
    if (!rows.length) continue;
    const ranked = rows.every((r) => r.rank != null);
    rows.sort(ranked ? (a, b) => a.rank - b.rank : (a, b) => (b.pts || 0) - (a.pts || 0) || (b.gd || 0) - (a.gd || 0));
    rows.forEach((r, i) => {
      if (r.rank == null) r.rank = i + 1;
    });
    groups.push({ name: found.length > 1 ? g.name : '', rows });
  }
  return groups;
}

// Tek bir ligin tablosu; adresler sırayla denenir. Hiçbirinde tablo yoksa hata atar (ilk nedeni ayrıntıya yazar).
export async function loadStandings({ net, slug, base = ESPN_BASE, timeoutMs = 12000 }) {
  let first = '';
  for (const url of standingsUrls(slug, base)) {
    try {
      const groups = parseStandings(await withTimeout(net.json(url, { fast: true }), timeoutMs));
      if (groups.length) return groups;
      first = first || 'tablo verisi boş';
    } catch (e) {
      first = first || (e && e.message) || 'hata';
    }
  }
  const err = new Error('Puan durumu alınamadı');
  err.detail = `${slug}: ${first}`;
  throw err;
}
