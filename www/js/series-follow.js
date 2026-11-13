import { fold } from './util.js';

export const FOLLOW_STORAGE_KEY = 'series.followed.v1';
export const followKey = (title) => fold(String(title || '')).replace(/[^a-z0-9]+/g, ' ').trim();

export function normalizeFollowed(list) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const title = String((item && item.title) || '').trim();
    const key = followKey(title);
    if (!title || !key || seen.has(key)) continue;
    seen.add(key);
    out.push({ title, key, slug: String(item.slug || ''), channel: String(item.channel || ''), addedAt: Number(item.addedAt) || 0 });
  }
  return out;
}

export function isFollowed(list, title) {
  const key = followKey(title);
  return !!key && normalizeFollowed(list).some((item) => item.key === key);
}

export function toggleFollowed(list, row, now = Date.now()) {
  const current = normalizeFollowed(list);
  const key = followKey(row && row.title);
  if (!key) return current;
  if (current.some((item) => item.key === key)) return current.filter((item) => item.key !== key);
  return [...current, { title: String(row.title).trim(), key, slug: String(row.slug || ''), channel: String(row.channel || ''), addedAt: now }];
}

export function buildNewEpisodePlans(days, followed, liveItems = [], existing = [], now = Date.now(), lead = 15) {
  const tracked = new Map(normalizeFollowed(followed).map((item) => [item.key, item]));
  const have = new Set((Array.isArray(existing) ? existing : []).map((plan) => plan && plan.id).filter(Boolean));
  const out = [];
  for (const day of Array.isArray(days) ? days : []) {
    for (const row of Array.isArray(day) ? day : []) {
      const key = followKey(row && row.title);
      const trackedItem = tracked.get(key);
      const start = Number(row && row.startAt);
      const status = fold(String((row && row.status) || ''));
      const isNew = /yeni\s*(bolum|sezon)/i.test(status) || (row && row.isNew === true);
      if (!trackedItem || !isNew || row.off || !Number.isFinite(start) || start <= now) continue;
      const slug = String(row.slug || key).replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);
      const id = 'sfnew:' + slug + ':' + start;
      if (have.has(id)) continue;
      const channelKey = followKey(row.channel);
      const ch = liveItems.find((item) => followKey(item && item.name) === channelKey);
      const mins = Math.max(0, Number(lead) || 0);
      out.push({ id, kind: 'rem', src: 'series-follow', followKey: key, followTitle: trackedItem.title, chId: ch ? ch.id : '', chName: String(row.channel || ''), title: trackedItem.title + (row.ep ? ' · ' + row.ep : '') + ' · Yeni bölüm', s: start, e: Number(row.endAt) > start ? Number(row.endAt) : start + 150 * 60000, at: Math.max(start - mins * 60000, now + 3000) });
      have.add(id);
    }
  }
  return out;
}