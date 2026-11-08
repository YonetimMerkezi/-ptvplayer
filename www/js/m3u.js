// M3U / M3U8 oynatma listesi ayrıştırıcı (parça parça beslenebilir).
import { hashId } from './util.js';

const VIDEO_EXT = /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|mpg|mpeg)(\?|$)/i;
const SERIES_NAME = /^(.*?)[\s._\-–]*S(\d{1,2})\s?E(\d{1,3})\b/i;

function attrs(str) {
  const out = {};
  const re = /([A-Za-z0-9_\-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s",]+))/g;
  let m;
  while ((m = re.exec(str))) out[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? '').trim();
  return out;
}

// "#EXTINF:-1 a=\"1\" b=\"2\",Ad" -> { attrs, name }; virgül tırnak içinde sayılmaz.
function parseExtinf(line) {
  const body = line.slice(line.indexOf(':') + 1);
  let q = null;
  let comma = -1;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === ',') {
      comma = i;
      break;
    }
  }
  const head = comma < 0 ? body : body.slice(0, comma);
  const name = comma < 0 ? '' : body.slice(comma + 1).trim();
  return { attrs: attrs(head), name };
}

export function splitPipeHeaders(url) {
  const i = url.indexOf('|');
  if (i < 0 || !/^https?:/i.test(url)) return { url, headers: null };
  const headers = {};
  for (const part of url.slice(i + 1).split('&')) {
    const k = part.indexOf('=');
    if (k < 1) continue;
    const name = part.slice(0, k).trim();
    const val = decodeURIComponent(part.slice(k + 1));
    if (/^user-agent$/i.test(name)) headers['User-Agent'] = val;
    else if (/^referr?er$/i.test(name)) headers.Referer = val;
    else if (/^origin$/i.test(name)) headers.Origin = val;
    else if (/^cookie$/i.test(name)) headers.Cookie = val;
  }
  return { url: url.slice(0, i), headers: Object.keys(headers).length ? headers : null };
}

export function classify(url, name, group) {
  const u = String(url);
  if (/\/series\/[^/]+\/[^/]+\/\d+/i.test(u)) return 'series';
  if (/\/movie\/[^/]+\/[^/]+\/\d+/i.test(u)) return 'movie';
  if (/\/live\//i.test(u) || /\.m3u8?(\?|$)/i.test(u)) return 'live';
  if (VIDEO_EXT.test(u)) {
    if (SERIES_NAME.test(name || '') || /dizi|series|sezon/i.test(group || '')) return 'series';
    return 'movie';
  }
  return 'live';
}

export class M3UParser {
  constructor() {
    this.items = [];
    this.epgUrls = [];
    this._tail = '';
    this._pending = null;
    this._group = '';
    this._opts = null;
    this._first = true;
  }

  push(chunk) {
    let text = this._tail + chunk;
    if (this._first) {
      text = text.replace(/^﻿/, '');
      this._first = false;
    }
    const lines = text.split(/\r\n|\n|\r/);
    this._tail = lines.pop();
    for (const l of lines) this._line(l);
    return this;
  }

  end() {
    if (this._tail) this._line(this._tail);
    this._tail = '';
    return { items: this.items, epgUrls: this.epgUrls };
  }

  _line(raw) {
    const line = raw.trim();
    if (!line) return;
    if (line.charCodeAt(0) === 35) {
      const up = line.slice(0, 8).toUpperCase();
      if (up.startsWith('#EXTM3U')) {
        const a = attrs(line.slice(7));
        const list = a['url-tvg'] || a['x-tvg-url'] || a['tvg-url'] || '';
        for (const u of list.split(',')) if (/^https?:\/\//i.test(u.trim())) this.epgUrls.push(u.trim());
      } else if (up.startsWith('#EXTINF')) {
        this._pending = parseExtinf(line);
      } else if (up.startsWith('#EXTGRP')) {
        this._group = line.slice(line.indexOf(':') + 1).trim();
      } else if (up.startsWith('#EXTVLC')) {
        const kv = line.slice(line.indexOf(':') + 1);
        const k = kv.indexOf('=');
        if (k > 0) {
          const key = kv.slice(0, k).toLowerCase();
          const val = kv.slice(k + 1).trim();
          this._opts = this._opts || {};
          if (key === 'http-user-agent') this._opts['User-Agent'] = val;
          else if (key === 'http-referrer' || key === 'http-referer') this._opts.Referer = val;
        }
      }
      return;
    }
    // URL satırı
    const { url, headers: pipeHeaders } = splitPipeHeaders(line);
    if (!/^[a-z][a-z0-9+.\-]*:\/\//i.test(url)) {
      this._pending = null;
      return;
    }
    const p = this._pending;
    const a = p ? p.attrs : {};
    const group = a['group-title'] || this._group || '';
    const name = (p && p.name) || a['tvg-name'] || decodeURIComponent(url.split('?')[0].split('/').pop() || url);
    const merged = { ...(this._opts || {}), ...(pipeHeaders || {}) };
    const headers = Object.keys(merged).length ? merged : null;
    this.items.push({
      id: hashId(url),
      name,
      url,
      logo: a['tvg-logo'] || '',
      group,
      tvgId: a['tvg-id'] || '',
      tvgName: a['tvg-name'] || '',
      num: parseInt(a['tvg-chno'] || a['channel-number'] || '', 10) || 0,
      kind: classify(url, name, group),
      headers,
    });
    this._pending = null;
    this._opts = null;
    // #EXTGRP bir sonraki EXTGRP'ye kadar geçerli kalır (VLC davranışı).
  }
}

export function parseM3U(text) {
  return new M3UParser().push(text).end();
}

// Bölüm adlarından ("Dizi S01E02") dizi/sezon/bölüm ağacı çıkarır; eşleşmeyenler film olur.
export function groupSeries(items) {
  const movies = [];
  const map = new Map();
  for (const it of items) {
    const m = SERIES_NAME.exec(it.name);
    if (!m || !m[1].trim()) {
      movies.push({ ...it, kind: 'movie' });
      continue;
    }
    const title = m[1].trim();
    const key = title.toLocaleLowerCase('tr');
    let s = map.get(key);
    if (!s) {
      s = { id: 's' + hashId(key), kind: 'series', name: title, logo: it.logo, group: it.group, local: true, seasons: new Map() };
      map.set(key, s);
    }
    if (!s.logo && it.logo) s.logo = it.logo;
    const sn = parseInt(m[2], 10);
    const en = parseInt(m[3], 10);
    if (!s.seasons.has(sn)) s.seasons.set(sn, []);
    s.seasons.get(sn).push({ id: it.id, title: `Bölüm ${en}`, episodeNum: en, url: it.url, headers: it.headers, ext: '' });
  }
  const series = [...map.values()].map((s) => ({
    ...s,
    seasons: [...s.seasons.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([season, eps]) => ({ season, episodes: eps.sort((a, b) => a.episodeNum - b.episodeNum) })),
  }));
  return { movies, series };
}
