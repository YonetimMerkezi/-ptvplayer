// XMLTV (TV rehberi) ayrıştırıcı: parça parça beslenir, yalnız ilgili zaman penceresini tutar.
import { decodeEntities, fold } from './util.js';

const TIME_RE = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?\s*([+-]\d{4}|Z)?/;

export function parseXmltvTime(s) {
  const m = TIME_RE.exec(String(s || '').trim());
  if (!m) return NaN;
  const [, y, mo, d, h = '00', mi = '00', se = '00', tz] = m;
  let ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  if (tz && tz !== 'Z') {
    const sign = tz[0] === '-' ? -1 : 1;
    ms -= sign * (parseInt(tz.slice(1, 3), 10) * 60 + parseInt(tz.slice(3, 5), 10)) * 60000;
  }
  return ms;
}

function cdata(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
}

function tagText(block, tag) {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  return m ? decodeEntities(cdata(m[1]).replace(/<[^>]+>/g, '')).trim() : '';
}

// Programın türü (<category>): birden çoksa " / " ile birleşir, kısa tutulur. Bugün ekranı dizi/film/spor ayrımını buradan yapar.
function categoriesOf(block) {
  const out = [];
  const re = /<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi;
  let m;
  while ((m = re.exec(block)) && out.length < 3) {
    const t = decodeEntities(cdata(m[1])).replace(/<[^>]+>/g, '').trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out.join(' / ').slice(0, 80);
}

function attr(openTag, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(openTag);
  return m ? decodeEntities(m[1] ?? m[2]) : '';
}

// Bölüm bilgisi: yalnız kaynakta açıkça yazılıysa (xmltv_ns "1.4." ya da ekran yazısı "S02E05" / "5. Bölüm") alınır; program kodu gibi
// başka biçimler yok sayılır. Hiçbir şey tahmin edilmez.
export function formatEpisode(season, episode) {
  const s = Number.isFinite(season) && season > 0 ? `${season}. Sezon` : '';
  const e = Number.isFinite(episode) && episode > 0 ? `${episode}. Bölüm` : '';
  return [s, e].filter(Boolean).join(' ');
}

export function parseEpisode(text, system = '') {
  const v = String(text || '').trim();
  const sys = String(system || '').toLowerCase();
  if (!v) return '';
  if (sys === 'xmltv_ns') {
    const m = /^\s*(\d*)\s*(?:\/\s*\d+)?\s*\.\s*(\d*)\s*(?:\/\s*\d+)?\s*(?:\.|$)/.exec(v);
    if (!m) return '';
    return formatEpisode(m[1] === '' ? NaN : Number(m[1]) + 1, m[2] === '' ? NaN : Number(m[2]) + 1);
  }
  if (sys && sys !== 'onscreen') return '';
  let m = /\bs(?:ezon)?\s*0*(\d{1,2})\s*[ .x-]?\s*(?:e|ep|b[öo]l[üu]m)\.?\s*0*(\d{1,4})\b/i.exec(v);
  if (m) return formatEpisode(Number(m[1]), Number(m[2]));
  m = /^0*(\d{1,2})x0*(\d{1,3})$/i.exec(v);
  if (m) return formatEpisode(Number(m[1]), Number(m[2]));
  m = /\b0*(\d{1,4})\s*\.?\s*b[öo]l[üu]m\b/i.exec(v);
  if (m) return formatEpisode(NaN, Number(m[1]));
  m = /^e(?:p|pisode)?\.?\s*0*(\d{1,4})$/i.exec(v);
  if (m) return formatEpisode(NaN, Number(m[1]));
  return '';
}

function episodeOf(block) {
  const re = /<episode-num((?:\s[^>]*)?)>([\s\S]*?)<\/episode-num>/gi;
  let m;
  let found = '';
  while ((m = re.exec(block))) {
    const x = parseEpisode(decodeEntities(cdata(m[2])).replace(/<[^>]+>/g, ''), attr(m[1] || '', 'system'));
    if (x && (!found || /xmltv_ns/i.test(m[1] || ''))) found = x;
  }
  return found;
}

// 'n' yeni bölüm/ilk yayın, 'r' tekrar, 'l' canlı; yalnız kaynakta etiket varsa
function flagOf(block) {
  if (/<previously-shown[\s/>]/i.test(block)) return 'r';
  if (/<(?:new|premiere)\s*\/?>/i.test(block) || /<premiere[\s>]/i.test(block)) return 'n';
  if (/<live\s*\/?>/i.test(block)) return 'l';
  return '';
}

// Önbellek/aktarım satırı: [başlangıç, bitiş, ad, açıklama, tür] (+ bölüm, etiket varsa). Eski 5 alanlı kayıtlar aynen geçerlidir.
export function packProg(p) {
  const r = [p.s, p.e, p.t, p.d || '', p.c || ''];
  if (p.x || p.f) r.push(p.x || '', p.f || '');
  return r;
}

export function unpackProg(row) {
  const o = { s: row[0], e: row[1], t: row[2], d: row[3], c: row[4] || '' };
  if (row[5]) o.x = row[5];
  if (row[6]) o.f = row[6];
  return o;
}

export class XmltvParser {
  // opts.from/to: tutulacak zaman penceresi (ms). opts.maxDesc: açıklama kısaltma.
  constructor(opts = {}) {
    const now = opts.now ?? Date.now();
    this.from = opts.from ?? now - 3 * 3600e3;
    this.to = opts.to ?? now + 36 * 3600e3;
    this.maxDesc = opts.maxDesc ?? 280;
    this.accept = typeof opts.accept === 'function' ? opts.accept : null; // kanal kimliği süzgeci (programlar kanallardan sonra gelir)
    this.channels = new Map(); // id -> { id, name }
    this.byChannel = new Map(); // id -> [{ s, e, t, d }]
    this._buf = '';
    this.count = 0;
  }

  push(chunk) {
    this._buf += chunk;
    const buf = this._buf;
    const re = /<(programme|channel)[\s>/]/g;
    let pos = 0;
    for (;;) {
      re.lastIndex = pos;
      const m = re.exec(buf);
      if (!m) {
        // Yarım kalmış "<programme" başlangıcı olabilir: son birkaç karakteri sakla.
        pos = Math.max(pos, buf.length - 12);
        break;
      }
      const lt = m.index;
      const head = m[1];
      const openEnd = buf.indexOf('>', lt);
      if (openEnd < 0) {
        pos = lt;
        break;
      }
      const open = buf.slice(lt, openEnd + 1);
      if (open.endsWith('/>')) {
        if (head === 'channel') this._channel(open, '');
        pos = openEnd + 1;
        continue;
      }
      const closeTag = `</${head}>`;
      const close = buf.indexOf(closeTag, openEnd);
      if (close < 0) {
        pos = lt;
        break;
      }
      const inner = buf.slice(openEnd + 1, close);
      if (head === 'channel') this._channel(open, inner);
      else this._programme(open, inner);
      pos = close + closeTag.length;
    }
    this._buf = buf.slice(pos);
    return this;
  }

  _channel(open, inner) {
    const id = attr(open, 'id');
    if (!id) return;
    const names = [];
    const re = /<display-name(?:\s[^>]*)?>([\s\S]*?)<\/display-name>/gi;
    let m;
    while ((m = re.exec(inner))) names.push(decodeEntities(cdata(m[1])).trim());
    this.channels.set(id, { id, name: names[0] || id, names, country: attr(open, 'country') });
  }

  _programme(open, inner) {
    const s = parseXmltvTime(attr(open, 'start'));
    let e = parseXmltvTime(attr(open, 'stop'));
    const ch = attr(open, 'channel');
    if (!ch || !Number.isFinite(s)) return;
    if (this.accept && !this.accept(ch)) return;
    if (!Number.isFinite(e)) e = s + 30 * 60000;
    if (e < this.from || s > this.to) return;
    let d = tagText(inner, 'desc');
    if (d.length > this.maxDesc) d = d.slice(0, this.maxDesc - 1) + '…';
    let list = this.byChannel.get(ch);
    if (!list) this.byChannel.set(ch, (list = []));
    const x = episodeOf(inner);
    const f = flagOf(inner);
    const row = { s, e, t: tagText(inner, 'title'), d, c: categoriesOf(inner) };
    if (x) row.x = x;
    if (f) row.f = f;
    list.push(row);
    this.count++;
  }

  end() {
    for (const list of this.byChannel.values()) list.sort((a, b) => a.s - b.s);
    return { channels: this.channels, byChannel: this.byChannel, count: this.count };
  }
}

// Kanalı (tvg-id, tvg-name veya ad ile) XMLTV kanal kimliğine eşler.
export function buildEpgIndex(epg) {
  const byId = new Map();
  const byName = new Map();
  for (const ch of epg.channels.values()) {
    byId.set(fold(ch.id), ch.id);
    for (const n of ch.names || [ch.name]) if (n) byName.set(fold(n), ch.id);
  }
  for (const id of epg.byChannel.keys()) if (!byId.has(fold(id))) byId.set(fold(id), id);
  return { byId, byName };
}

export function resolveEpgId(item, index) {
  if (item.tvgId) {
    const r = index.byId.get(fold(item.tvgId));
    if (r) return r;
  }
  for (const n of [item.tvgName, item.name]) {
    if (!n) continue;
    const r = index.byName.get(fold(n));
    if (r) return r;
  }
  return null;
}

// Sıralı program listesinde şimdi/sonraki programı bulur.
export function nowNext(list, now = Date.now()) {
  if (!list || !list.length) return { now: null, next: null, progress: 0 };
  let lo = 0;
  let hi = list.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].s <= now) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const cur = idx >= 0 && list[idx].e > now ? list[idx] : null;
  const next = list[idx + 1] || null;
  const progress = cur ? Math.min(1, Math.max(0, (now - cur.s) / Math.max(1, cur.e - cur.s))) : 0;
  return { now: cur, next, progress };
}
