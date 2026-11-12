// Kaynaktan (M3U veya Xtream) kataloğu ve TV rehberini yükler; arama/gruplama/oynatma adresleri.
import { M3UParser, groupSeries } from './m3u.js';
import * as X from './xtream.js';
import { XmltvParser, buildEpgIndex, resolveEpgId, nowNext } from './epg.js';
import { fold } from './util.js';

const sourceCfg = (src) => ({ server: src.server, user: src.user, pass: src.pass });

export function prepare(list) {
  for (const it of list) it.f = fold(it.name);
  return list;
}

const strip = (list) => list.map(({ f, ...r }) => r);

export function emptyCatalog() {
  return { live: [], movies: [], series: [], epgUrls: [], warnings: [], fetchedAt: 0 };
}

// source.text: az önce seçilen dosyanın içeriği; source.local: dosyadan eklenmiş, içerik readFile(id) ile okunur.
export async function loadCatalog(source, net, { onStage = () => {}, onProgress = () => {}, readFile = async () => null } = {}) {
  const cat = emptyCatalog();
  if (source.type === 'xtream') {
    const cfg = sourceCfg(source);
    onStage('Hesap doğrulanıyor…');
    const auth = X.checkAuth(await net.json(X.apiUrl(cfg)));
    if (!auth.ok) throw new Error(auth.reason);
    cat.account = { expires: auth.expires, maxConnections: auth.maxConnections, timezone: auth.timezone };
    const fetchList = async (label, action, extra) => {
      onStage(label);
      try {
        return await net.json(X.apiUrl(cfg, action, extra || {}));
      } catch (e) {
        cat.warnings.push(`${label.replace('…', '')} alınamadı: ${e.message}`);
        return [];
      }
    };
    const lc = await fetchList('Canlı kategoriler…', 'get_live_categories');
    const ls = await fetchList('Canlı kanallar…', 'get_live_streams');
    cat.live = X.mapLive(ls, lc);
    const vc = await fetchList('Film kategorileri…', 'get_vod_categories');
    const vs = await fetchList('Filmler…', 'get_vod_streams');
    cat.movies = X.mapVod(vs, vc);
    const sc = await fetchList('Dizi kategorileri…', 'get_series_categories');
    const ss = await fetchList('Diziler…', 'get_series');
    cat.series = X.mapSeries(ss, sc);
  } else {
    const parser = new M3UParser();
    if (source.text != null || source.local) {
      onStage('Dosya okunuyor…');
      const text = source.text != null ? source.text : await readFile(source.id);
      if (text == null) throw new Error('Kaydedilmiş liste dosyası bulunamadı; dosyayı yeniden seçin.');
      parser.push(text);
    } else {
      onStage('Liste indiriliyor…');
      await net.read(source.url, { headers: source.headers, onText: (t) => parser.push(t), onProgress });
    }
    onStage('Liste işleniyor…');
    const { items, epgUrls } = parser.end();
    cat.epgUrls = epgUrls;
    cat.live = items.filter((i) => i.kind === 'live');
    const g = groupSeries(items.filter((i) => i.kind === 'series'));
    cat.movies = [...items.filter((i) => i.kind === 'movie'), ...g.movies];
    cat.series = g.series;
  }
  if (!cat.live.length && !cat.movies.length && !cat.series.length) {
    throw new Error(cat.warnings[0] || 'Kaynakta oynatılabilir içerik bulunamadı.');
  }
  cat.fetchedAt = Date.now();
  prepare(cat.live);
  prepare(cat.movies);
  prepare(cat.series);
  return cat;
}

export function catalogToStorable(cat) {
  return { ...cat, live: strip(cat.live), movies: strip(cat.movies), series: strip(cat.series) };
}

export function catalogFromStorable(raw) {
  if (!raw || !Array.isArray(raw.live)) return null;
  prepare(raw.live);
  prepare(raw.movies || (raw.movies = []));
  prepare(raw.series || (raw.series = []));
  return raw;
}

export function search(list, query, limit = 300) {
  const terms = fold(query).split(' ').filter(Boolean);
  if (!terms.length) return [];
  const starts = [];
  const rest = [];
  for (const it of list) {
    const f = it.f ?? fold(it.name);
    if (terms.every((t) => f.includes(t))) (f.startsWith(terms[0]) ? starts : rest).push(it);
  }
  return starts.concat(rest).slice(0, limit);
}

export function groupList(list) {
  const m = new Map();
  for (const it of list) {
    const g = it.group || 'Diğer';
    m.set(g, (m.get(g) || 0) + 1);
  }
  return [...m.entries()].map(([name, count]) => ({ name, count }));
}

export function inGroup(list, group) {
  if (!group) return list;
  return list.filter((it) => (it.group || 'Diğer') === group);
}

function mimeOf(url) {
  if (/\.m3u8?(\?|$)/i.test(url)) return 'hls';
  if (/\.ts(\?|$)/i.test(url)) return 'ts';
  return 'auto';
}

// ---- yedek adres: aynı adlı başka canlı kanal ----
const NOISE = /\b(hd|fhd|uhd|sd|4k|8k|hevc|h ?26[45]|\d+ ?fps|1080p?|720p?|576p?|backup|yedek|raw|lq|hq)\b/g;

// Kanal adını kalite/ülke ekleri olmadan karşılaştırma anahtarına çevirir ("TR: TRT 1 HD" ≈ "TRT 1").
export function altKey(name) {
  let s = fold(name)
    .replace(/^\s*[a-z]{2,3}\s*[:|]\s*/, '')
    .replace(/[\[(][^\])]*[\])]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ');
  s = s.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
  return s.length >= 2 ? s : '';
}

// anahtar → aynı anahtarlı kanallar (yalnız birden fazla olanlar saklanır).
export function buildAltIndex(list) {
  const m = new Map();
  for (const it of list) {
    const k = altKey(it.name);
    if (!k) continue;
    const a = m.get(k);
    if (a) a.push(it);
    else m.set(k, [it]);
  }
  for (const [k, a] of m) if (a.length < 2) m.delete(k);
  return m;
}

export function altsOf(index, item, max = 3) {
  const k = altKey(item.name);
  const a = k && index.get(k);
  if (!a) return [];
  return a.filter((x) => x.id !== item.id && x.url !== item.url).slice(0, max);
}

// Sırayla denenecek oynatma adresleri (ilki olmazsa ikincisi); yedek kanalların ilk adresi sona eklenir.
export function playTargets(source, item, ep, alts = []) {
  const own = ownTargets(source, item, ep);
  if (!own.length || !alts.length) return own;
  const extra = [];
  for (const a of alts) {
    const t = ownTargets(source, a)[0];
    if (t) extra.push({ ...t, alt: a.name });
  }
  return own.concat(extra);
}

function ownTargets(source, item, ep) {
  if (source.type === 'xtream') {
    const cfg = sourceCfg(source);
    if (item.kind === 'live') {
      return [
        { url: X.liveUrl(cfg, item.streamId, 'm3u8'), mime: 'hls', live: true },
        { url: X.liveUrl(cfg, item.streamId, 'ts'), mime: 'ts', live: true },
      ];
    }
    if (item.kind === 'movie') return [{ url: X.movieUrl(cfg, item.streamId, item.ext), mime: 'auto' }];
    if (ep) return [{ url: X.episodeUrl(cfg, ep.episodeId, ep.ext), mime: 'auto' }];
    return [];
  }
  const src = ep && ep.url ? ep : item;
  if (!src.url) return [];
  const mime = mimeOf(src.url);
  const first = { url: src.url, mime, headers: src.headers || null, ...(item.kind === 'live' ? { live: true } : {}) };
  // Uzantısız canlı adres HLS çıkabilir: ikinci denemede HLS olarak aç.
  return item.kind === 'live' && mime === 'auto' ? [first, { ...first, mime: 'hls' }] : [first];
}

export async function loadSeriesInfo(source, net, item) {
  if (item.local) return { plot: '', cast: '', genre: '', year: '', logo: item.logo, seasons: item.seasons };
  const info = X.mapSeriesInfo(await net.json(X.apiUrl(sourceCfg(source), 'get_series_info', { series_id: item.seriesId })));
  return info;
}

// Film ayrıntısı: odakta önizleme ile ayrıntı sayfası aynı sonucu kullanır (bir film için tek istek, sonuç bellekte kalır).
// Hata önbelleğe alınmaz; sonraki deneme yeniden ister. En eski kayıt belirli sayıdan sonra atılır.
const VOD_CACHE_MAX = 300;
const vodDone = new Map();
const vodBusy = new Map();
const vodKey = (source, item) => `${source.id || ''}|${item.streamId}`;

export function peekVodInfo(source, item) {
  return source.type === 'xtream' ? vodDone.get(vodKey(source, item)) || null : null;
}

export function loadVodInfo(source, net, item) {
  if (source.type !== 'xtream') return Promise.resolve(null);
  const k = vodKey(source, item);
  if (vodDone.has(k)) return Promise.resolve(vodDone.get(k));
  if (vodBusy.has(k)) return vodBusy.get(k);
  const p = (async () => {
    try {
      const info = X.mapVodInfo(await net.json(X.apiUrl(sourceCfg(source), 'get_vod_info', { vod_id: item.streamId })));
      vodDone.set(k, info);
      while (vodDone.size > VOD_CACHE_MAX) vodDone.delete(vodDone.keys().next().value);
      return info;
    } finally {
      vodBusy.delete(k);
    }
  })();
  vodBusy.set(k, p);
  return p;
}

export function clearVodInfoCache() {
  vodDone.clear();
  vodBusy.clear();
}

// Arşivli (catch-up) kanalın geçmiş programları; yalnız Xtream. Dönen her program { s, e, t, d, archive }.
export async function loadArchiveEpg(source, net, item) {
  if (source.type !== 'xtream' || item.kind !== 'live' || !item.archive) return [];
  return X.mapArchiveEpg(await net.json(X.apiUrl(sourceCfg(source), 'get_simple_data_table', { stream_id: item.streamId })));
}

// Bir programı baştan izleme adresleri (Xtream timeshift); arşivi olmayan kanal/kaynakta boş liste.
export function archiveTargets(source, item, p, timeZone = '') {
  if (source.type !== 'xtream' || item.kind !== 'live' || !item.archive || !p) return [];
  const cfg = sourceCfg(source);
  const mins = Math.max(1, Math.ceil((p.e - p.s) / 60000));
  return [
    { url: X.timeshiftUrl(cfg, item.streamId, p.s, mins, timeZone, 'ts'), mime: 'ts' },
    { url: X.timeshiftUrl(cfg, item.streamId, p.s, mins, timeZone, 'm3u8'), mime: 'hls' },
  ];
}

// Zamanlı kayıt: kayıt hizmeti doğrudan TS akışı okur; yalnız doğrudan TS adresi olan kanallar kaydedilebilir.
export function recordTarget(source, item, ep) {
  const t = playTargets(source, item, ep).find((x) => x.mime === 'ts' || /\.ts(?:$|[?#])/i.test(x.url));
  return t ? { url: t.url, headers: t.headers || null } : null;
}

export async function loadShortEpg(source, net, item, limit = 6) {
  if (source.type !== 'xtream' || item.kind !== 'live') return [];
  return X.mapShortEpg(await net.json(X.apiUrl(sourceCfg(source), 'get_short_epg', { stream_id: item.streamId, limit })));
}

// ---- TV rehberi ----

export function epgSourceUrls(source, cat) {
  if (source.epgUrl) return [source.epgUrl];
  if (source.type === 'xtream') return [X.xmltvUrl(sourceCfg(source))];
  return cat.epgUrls || [];
}

// XMLTV'yi indirir; yalnız canlı kanallarla eşleşen kanalların programlarını döndürür.
export async function loadEpg(source, cat, net, { onProgress = () => {}, now = Date.now() } = {}) {
  const urls = epgSourceUrls(source, cat);
  if (!urls.length) return null;
  let lastErr = null;
  for (const url of urls) {
    try {
      const parser = new XmltvParser({ now });
      await net.read(url, { onText: (t) => parser.push(t), onProgress });
      const parsed = parser.end();
      if (!parsed.count) throw new Error('Rehberde güncel program yok');
      const index = buildEpgIndex(parsed);
      const map = {};
      const prog = {};
      for (const ch of cat.live) {
        const eid = resolveEpgId(ch, index);
        if (!eid || !parsed.byChannel.has(eid)) continue;
        map[ch.id] = eid;
        if (!prog[eid]) prog[eid] = parsed.byChannel.get(eid).map((p) => [p.s, p.e, p.t, p.d, p.c || '']);
      }
      return { fetchedAt: now, map, prog, matched: Object.keys(map).length };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Rehber alınamadı');
}

export class EpgView {
  constructor(data) {
    this.data = data && data.prog ? data : { map: {}, prog: {} };
    this._cache = new Map();
  }
  get ready() {
    return Object.keys(this.data.map).length > 0;
  }
  listFor(item) {
    const eid = this.data.map[item.id];
    if (!eid) return [];
    let l = this._cache.get(eid);
    if (!l) {
      l = (this.data.prog[eid] || []).map(([s, e, t, d, c]) => ({ s, e, t, d, c: c || '' }));
      this._cache.set(eid, l);
    }
    return l;
  }
  nowNext(item, now = Date.now()) {
    return nowNext(this.listFor(item), now);
  }
  _ensureRep() {
    if (this._rep) return;
    this._rep = new Map();
    for (const [itemId, eid] of Object.entries(this.data.map)) if (!this._rep.has(eid)) this._rep.set(eid, itemId);
    this._folded = new Map();
  }
  // Program adında arama: { id: kanal öğesi no, p: program }, başlangıç sırasıyla. Aynı rehber kanalını paylaşan kanallardan biri alınır.
  search(term, { from = Date.now() - 2 * 3600e3, limit = 150 } = {}) {
    const t = fold(String(term || ''));
    if (t.length < 2) return [];
    this._ensureRep();
    const out = [];
    for (const [eid, list] of Object.entries(this.data.prog)) {
      const itemId = this._rep.get(eid);
      if (!itemId) continue;
      let ft = this._folded.get(eid);
      if (!ft) this._folded.set(eid, (ft = list.map((r) => fold(r[2]))));
      for (let i = 0; i < list.length; i++) {
        const [s, e, title, d, c] = list[i];
        if (e >= from && ft[i].includes(t)) out.push({ id: itemId, p: { s, e, t: title, d, c: c || '' } });
      }
    }
    out.sort((a, b) => a.p.s - b.p.s);
    return out.slice(0, limit);
  }
  // Başlangıcı [from, to] aralığında olan tüm programlar ({ id: kanal öğesi no, p }); her rehber kanalı için bir öğe (search ile aynı).
  between(from, to) {
    this._ensureRep();
    const out = [];
    for (const [eid, list] of Object.entries(this.data.prog)) {
      const itemId = this._rep.get(eid);
      if (!itemId) continue;
      for (const [s, e, t, d, c] of list) if (s >= from && s <= to) out.push({ id: itemId, p: { s, e, t, d, c: c || '' } });
    }
    return out;
  }
}
