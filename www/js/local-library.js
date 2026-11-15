// Medya merkezi mantığı (saf işlevler): dosya türü, klasör ağacı, arama, son eklenenler, altyazı eşleme,
// oynatma listesi, klasör kilidi ve ağ paylaşımı kayıtlarının ortak biçime çevrilmesi.
import { fold } from './util.js';
import { localId, naturalCompare, cleanName } from './local-media.js';

const VIDEO = /\.(mp4|m4v|mkv|webm|avi|mov|wmv|flv|ts|m2ts|3gp|mpg|mpeg)$/i;
const AUDIO = /\.(mp3|m4a|aac|flac|ogg|opus|wav|wma)$/i;
const IMAGE = /\.(jpe?g|png|gif|webp|bmp|heic)$/i;
const SUB = /\.(srt|vtt)$/i;

// Dosya türü: video | audio | image | sub | '' (ilgisiz). Uzantı öncelikli, yoksa MIME.
export function kindOfName(name, mime = '') {
  const n = String(name || '');
  if (SUB.test(n)) return 'sub';
  if (VIDEO.test(n)) return 'video';
  if (AUDIO.test(n)) return 'audio';
  if (IMAGE.test(n)) return 'image';
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('image/')) return 'image';
  return '';
}

export const KIND_LABEL = { video: 'Video', audio: 'Müzik', image: 'Fotoğraf' };
export const isMedia = (k) => k === 'video' || k === 'audio' || k === 'image';

// Yerel taramadan gelen satırları ortak biçime çevirir; ilgisiz ve adresi olmayanlar atılır.
export function buildIndex(rows, rootId) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !r.uri || !r.name) continue;
    const kind = r.kind || kindOfName(r.name, r.mime);
    if (!kind) continue;
    out.push({
      id: localId(r.uri),
      uri: r.uri,
      name: r.name,
      title: cleanName(r.name),
      kind,
      mime: r.mime || '',
      size: Number(r.size) || 0,
      mod: Number(r.mod) || 0,
      dir: String(r.dir || ''),
      rootId,
      key: fold(cleanName(r.name)),
    });
  }
  return out;
}

const parentOf = (dir) => (dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '');
const lastSeg = (dir) => dir.slice(dir.lastIndexOf('/') + 1);

// Bir klasörün doğrudan alt klasörleri (altındaki medya sayısıyla) ve dosyaları; ikisi de doğal sırada.
export function listDir(index, dir = '') {
  const folders = new Map();
  const files = [];
  const prefix = dir ? dir + '/' : '';
  for (const f of index) {
    if (f.kind === 'sub') continue;
    if (f.dir === dir) {
      files.push(f);
      continue;
    }
    if (dir && !f.dir.startsWith(prefix)) continue;
    const rest = f.dir.slice(prefix.length);
    const first = rest.split('/')[0];
    if (!first) continue;
    const path = prefix + first;
    const cur = folders.get(path) || { name: first, path, count: 0, sample: null };
    cur.count++;
    if (!cur.sample && f.kind !== 'audio') cur.sample = f; // klasör kapağı için ilk video/fotoğraf
    folders.set(path, cur);
  }
  return {
    folders: [...folders.values()].sort((a, b) => naturalCompare(a.name, b.name)),
    files: files.sort((a, b) => naturalCompare(a.name, b.name)),
  };
}

// Üst klasör zinciri: [{name, path}] (kök dahil değil).
export function crumbs(dir) {
  const out = [];
  let cur = dir;
  while (cur) {
    out.unshift({ name: lastSeg(cur), path: cur });
    cur = parentOf(cur);
  }
  return out;
}
export { parentOf };

// Videoyla aynı klasördeki altyazı: aynı ad (ya da ad + dil eki: film.tr.srt); .srt .vtt'ye tercih edilir.
export function findSubtitle(index, video) {
  if (!video || video.kind !== 'video') return null;
  const base = fold(cleanName(video.name));
  const subs = index.filter((f) => f.kind === 'sub' && f.dir === video.dir && f.rootId === video.rootId);
  const score = (s) => {
    const b = fold(s.name.replace(/\.(srt|vtt)$/i, ''));
    if (b === base) return 3;
    if (b.startsWith(base + ' ') || b.startsWith(base + '.')) return 2;
    return 0;
  };
  const ranked = subs
    .map((s) => ({ s, sc: score(s) + (/\.srt$/i.test(s.name) ? 0.5 : 0) }))
    .filter((x) => Math.floor(x.sc) > 0)
    .sort((a, b) => b.sc - a.sc);
  return ranked.length ? ranked[0].s : null;
}

// Ada göre arama (Türkçe harf duyarsız, tüm sözcükler geçmeli). allow(f): kilitli klasörler gibi dışlamalar.
export function searchIndex(index, query, { kinds = null, allow = null, limit = 200 } = {}) {
  const words = fold(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const f of index) {
    if (!isMedia(f.kind) || (kinds && !kinds.includes(f.kind))) continue;
    if (allow && !allow(f)) continue;
    const hay = f.key + ' ' + fold(f.dir);
    if (words.every((w) => hay.includes(w))) out.push(f);
    if (out.length >= limit) break;
  }
  return out;
}

// Son eklenenler: değiştirilme zamanı en yeni medya dosyaları.
export function recentAdded(index, { kinds = ['video'], allow = null, limit = 30 } = {}) {
  return index
    .filter((f) => kinds.includes(f.kind) && f.mod > 0 && (!allow || allow(f)))
    .sort((a, b) => b.mod - a.mod)
    .slice(0, limit);
}

// Aynı klasördeki aynı türden dosyalar doğal sırada; seçilen dosyanın yeri. {items, index}
export function playlistOf(files, current) {
  const items = files.filter((f) => f.kind === current.kind).sort((a, b) => naturalCompare(a.name, b.name));
  const i = items.findIndex((f) => f.id === current.id);
  return { items, index: i < 0 ? 0 : i };
}

// ---- klasör kilidi (uygulama şifresiyle) ----
export const lockKey = (rootId, dir = '') => `${rootId}|${dir}`;
// Klasör ya da üst klasörlerinden biri kilitliyse kilitli sayılır; kilitleyen anahtarı döndürür, yoksa ''.
export function lockedBy(locks, rootId, dir = '') {
  const set = new Set(Array.isArray(locks) ? locks : []);
  let cur = dir;
  for (;;) {
    const k = lockKey(rootId, cur);
    if (set.has(k)) return k;
    if (!cur) return '';
    cur = parentOf(cur);
  }
}
export function toggleLock(locks, key) {
  const list = Array.isArray(locks) ? locks : [];
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

// ---- biçimleme ----
export function fmtSize(b) {
  const n = Number(b) || 0;
  if (n >= 1073741824) return (n / 1073741824).toFixed(1).replace('.', ',') + ' GB';
  if (n >= 1048576) return Math.round(n / 1048576) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n ? n + ' B' : '';
}

// ---- ağ paylaşımları ----
// Kullanıcının yazdığı WebDAV adresi: şema yoksa http, klasör için sonda eğik çizgi.
export function normalizeDavUrl(input) {
  let u = String(input || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  try {
    const url = new URL(u);
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url.toString();
  } catch {
    return '';
  }
}

// SMB ana makine adı ya da IP: smb:// ve eğik çizgiler atılır.
export function normalizeSmbHost(input) {
  return String(input || '').trim().replace(/^smb:\/\//i, '').replace(/[\\/].*$/, '');
}

const stableRemoteId = (scheme, key) => localId(scheme + ':' + key);

// Yerel tarama dışı kaynakların girdilerini ortak satıra çevirir: { dir, name, kind, size, id, ref }
export function davRow(e, auth) {
  if (!e || !e.url) return null;
  const dir = !!e.dir;
  const kind = dir ? '' : kindOfName(e.name, e.mime);
  if (!dir && !isMedia(kind) && kind !== 'sub') return null;
  return { dir, name: e.name, kind, size: Number(e.size) || 0, id: stableRemoteId('dav', e.url), url: e.url, headers: auth ? { Authorization: auth } : null };
}
export function upnpRow(e) {
  if (!e) return null;
  if (e.dir) return { dir: true, name: e.name, kind: '', size: 0, id: stableRemoteId('upnp', e.id), objectId: e.id };
  const kind = kindOfName(e.name, e.mime);
  if (!isMedia(kind) || !e.url) return null;
  return { dir: false, name: e.name, kind, size: Number(e.size) || 0, id: stableRemoteId('upnp', e.url), url: e.url, headers: null };
}
export function smbRow(e, host) {
  if (!e) return null;
  if (e.dir) return { dir: true, name: e.name, kind: '', size: 0, id: stableRemoteId('smb', host + '/' + e.path), path: e.path };
  const kind = kindOfName(e.name);
  if (!isMedia(kind) && kind !== 'sub') return null;
  return { dir: false, name: e.name, kind, size: Number(e.size) || 0, id: stableRemoteId('smb', host + '/' + e.path), path: e.path };
}

// Ağ klasöründe satırları sırala: klasörler önce, doğal ad sırası.
export function sortRows(rows) {
  return [...rows].sort((a, b) => (a.dir === b.dir ? naturalCompare(a.name, b.name) : a.dir ? -1 : 1));
}

// Ağ klasöründeki altyazıyı videoyla eşler (findSubtitle ile aynı kural; satırlar tek klasördedir).
export function findSiblingSub(rows, video) {
  const fake = rows.filter((r) => !r.dir).map((r) => ({ ...r, dir: '', rootId: 'r', uri: r.url || r.path || '', key: fold(cleanName(r.name)) }));
  const v = fake.find((r) => r.id === video.id);
  return v ? findSubtitle(fake, v) : null;
}
