// Çevrimdışı izleme için indirme: saf mantık (sürüm bulma, kimlik/ad, durum metinleri, sıralama).
// İndirmeyi Android'de arka plan hizmeti yapar (Downloads.java); burada yalnız ekranın ihtiyaç duyduğu hesaplar var.
import { fold, hashId } from './util.js';
import { fmtBytes } from './rec.js';

// ---- sürüm (kalite) bulma: katalogda aynı filmin 4K / FHD / HD / SD adlı kopyaları ----

// Etiketsiz kopya (çoğunlukla 720p–1080p) HD ile SD arasında sayılır
const RANK = { '4K': 5, FHD: 4, HD: 3, '': 2, SD: 1 };
const Q_TESTS = [
  ['4K', /\b(4k|uhd|2160p?)\b/],
  ['FHD', /\b(fhd|full ?hd|1080[pi]?)\b/],
  ['HD', /\b(hd|720p?)\b/],
  ['SD', /\b(sd|480p?|360p?|576p?)\b/],
];

// Ad etiketindeki kalite: '4K' | 'FHD' | 'HD' | 'SD' | '' (belirsiz)
export function qualityOf(name) {
  const f = fold(name);
  for (const [q, re] of Q_TESTS) if (re.test(f)) return q;
  return '';
}

const YEAR = /\b(19|20)\d{2}\b/;
export const yearOfName = (name) => {
  const m = fold(name).match(YEAR);
  return m ? m[0] : '';
};

// Kalite/dil/kaynak etiketleri: "Film Adı FHD TR Dublaj" ve "Film Adı (2023) 4K" aynı filmdir.
const NOISE =
  /\b(4k|uhd|2160p?|fhd|full ?hd|1080[pi]?|720p?|480p?|360p?|576p?|hd|sd|hevc|h ?26[45]|x ?26[45]|hdr10?|hdr|web ?dl|webrip|blu ?ray|brrip|dvdrip|hdrip|turkce|dublaj(li)?|altyazi(li)?|yerli|multi|dual|tr|eng|ing|en)\b/g;
const LEAD = /^\s*[|[(]?\s*(tr|en|eng|us|uk|de|fr|ar|mix)\s*[|\])]?\s*[-:|–]+\s*/;

// Sürüm eşleştirmesi için ad: küçük harf, aksansız, parantez/köşeli parantez ve etiketsiz, noktalamasız.
export function baseName(name) {
  let f = fold(name);
  f = f.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(LEAD, ' ').replace(NOISE, ' ');
  const bare = f.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const noYear = bare.replace(YEAR, ' ').replace(/\s+/g, ' ').trim();
  if (noYear) return noYear;
  if (bare) return bare;
  return fold(name);
}

// Katalogdaki filmlerden { temel ad → [{ it, q, year }] } dizini (yalnız birden çok kopyası olanlar tutulur).
export function buildVersionIndex(movies) {
  const m = new Map();
  for (const it of movies || []) {
    if (!it || !it.name) continue;
    const b = baseName(it.name);
    if (!b) continue;
    let a = m.get(b);
    if (!a) m.set(b, (a = []));
    a.push({ it, q: qualityOf(it.name), year: yearOfName(it.name) });
  }
  for (const [k, v] of m) if (v.length < 2) m.delete(k);
  return m;
}

// Bir filmin tüm sürümleri (kendisi dahil), en yüksek kalite önde. Yıl ikisinde de varsa eşit olmalı.
export function versionsOf(index, it) {
  const self = { it, q: qualityOf(it.name), year: yearOfName(it.name) };
  const list = (index && index.get(baseName(it.name))) || [];
  const out = list.filter((x) => x.it.id === it.id || !self.year || !x.year || x.year === self.year);
  if (!out.some((x) => x.it.id === it.id)) out.push(self);
  return out
    .map((x) => ({ it: x.it, quality: x.q, label: x.q || 'Standart', group: x.it.group || '' }))
    .sort((a, b) => RANK[b.quality] - RANK[a.quality] || String(a.it.name).localeCompare(String(b.it.name), 'tr'));
}

// ---- kimlik, adres, uzantı ----

// Kaynak + öğe (+ bölüm) için sabit indirme kimliği: aynı içerik iki kez kuyruğa girmez. Yalnız [A-Za-z0-9_-], 80 karakter altı.
export function dlId(srcId, itemId, epId = '') {
  const raw = `${srcId}|${itemId}|${epId || ''}`;
  return `d_${hashId(raw)}_${hashId([...raw].reverse().join(''))}`;
}

const cleanExt = (e) => {
  const s = String(e || '').toLowerCase().replace(/^\./, '');
  return /^[a-z0-9]{2,4}$/.test(s) ? s : '';
};

function extOfUrl(url) {
  const p = String(url || '').split('?')[0];
  const m = p.match(/\.([a-z0-9]{2,4})$/i);
  return m && !/^(php|asp|html?|json|xml)$/i.test(m[1]) ? m[1].toLowerCase() : '';
}

// Oynatma hedeflerinden indirilebilen ilki: { url, headers, ext }. HLS/DASH (parçalı) yayınlar indirilemez.
export function pickTarget(targets, extHint = '') {
  for (const t of targets || []) {
    if (!t || !/^https?:\/\//i.test(String(t.url || ''))) continue;
    if (t.mime === 'hls' || t.mime === 'dash' || /\.(m3u8|mpd)(\?|$)/i.test(t.url)) continue;
    return { url: t.url, headers: t.headers || null, ext: cleanExt(extHint) || extOfUrl(t.url) };
  }
  return null;
}

// ---- meta (yerel taraf opak saklar): çevrimdışı oynatırken öğe kimliği ve ilerleme için gerekenler ----

const pick = (o, keys) => {
  const r = {};
  for (const k of keys) if (o && o[k] != null && o[k] !== '') r[k] = o[k];
  return r;
};
const ITEM_KEYS = ['id', 'kind', 'name', 'logo', 'group', 'rating', 'ext', 'streamId', 'seriesId', 'year', 'local'];
const EP_KEYS = ['id', 'episodeId', 'episodeNum', 'season', 'title', 'ext', 'label', 'durationSec'];

export function makeMeta({ src, item, ep = null }) {
  return JSON.stringify({ v: 1, src, item: pick(item, ITEM_KEYS), ep: ep ? pick(ep, EP_KEYS) : null });
}

export function parseMeta(s) {
  try {
    const m = JSON.parse(s);
    if (!m || m.v !== 1 || !m.src || !m.item || !m.item.id) return null;
    return m;
  } catch {
    return null;
  }
}

// Listede görünen ad: film (adındaki kalite etiketiyle birlikte) ya da "Dizi · S1 B3 · Başlık".
export function dlName({ item, ep = null }) {
  return ep ? `${item.name} · ${ep.label || 'Bölüm'}` : item.name;
}

// ---- durum ve metinler ----

export const ACTIVE = new Set(['queued', 'downloading', 'waiting']);
export const isActive = (j) => !!j && ACTIVE.has(j.state);
export const isDone = (j) => !!j && j.state === 'done';

export function pctOf(j) {
  if (!j) return 0;
  if (j.state === 'done') return 100;
  return j.total > 0 ? Math.max(0, Math.min(100, Math.floor((j.bytes / j.total) * 100))) : 0;
}

export function fmtSpeed(bps) {
  const b = Number(bps);
  if (!Number.isFinite(b) || b <= 0) return '';
  return b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1).replace('.', ',')} MB/sn` : `${Math.max(1, Math.round(b / 1024))} KB/sn`;
}

// Satırın alt yazısı
export function dlSub(j) {
  const size = j.total > 0 ? `${fmtBytes(j.bytes)} / ${fmtBytes(j.total)}` : j.bytes > 0 ? fmtBytes(j.bytes) : '';
  switch (j.state) {
    case 'downloading':
      return [j.total > 0 ? `%${pctOf(j)}` : '', size, fmtSpeed(j.speed)].filter(Boolean).join(' · ') || 'Başlıyor…';
    case 'queued':
      return 'Sırada' + (size ? ` · ${size}` : '');
    case 'waiting':
      return 'Wi-Fi bekleniyor' + (size ? ` · ${size}` : '');
    case 'paused':
      return 'Duraklatıldı' + (j.total > 0 ? ` · %${pctOf(j)}` : '') + (size ? ` · ${size}` : '');
    case 'error':
      return j.error || 'İndirilemedi';
    case 'done':
      return `İndirildi · ${fmtBytes(j.total > 0 ? j.total : j.bytes)}`;
    default:
      return '';
  }
}

const ORDER = { downloading: 0, queued: 1, waiting: 1, paused: 2, error: 3, done: 4 };
// Liste sırası: iniyor → sırada → duraklatılmış → hatalı → biten (en yeni önce). Sıradakiler eklenme sırasıyla.
export function sortJobs(list) {
  return [...list].sort((a, b) => {
    const d = (ORDER[a.state] ?? 9) - (ORDER[b.state] ?? 9);
    if (d) return d;
    return a.state === 'done' ? (b.createdAt || 0) - (a.createdAt || 0) : (a.createdAt || 0) - (b.createdAt || 0);
  });
}

export function summary(list) {
  let active = 0;
  let done = 0;
  let paused = 0;
  let failed = 0;
  for (const j of list) {
    if (isActive(j)) active++;
    else if (j.state === 'done') done++;
    else if (j.state === 'paused') paused++;
    else if (j.state === 'error') failed++;
  }
  return { active, done, paused, failed, total: list.length };
}

// Aynı dizinin biten bölümleri, sezon/bölüm sırasıyla (çevrimdışı "sonraki bölüm" için).
export function seriesDone(jobs, src, seriesId) {
  const out = [];
  for (const j of jobs) {
    if (j.state !== 'done') continue;
    const m = parseMeta(j.meta);
    if (m && m.ep && m.src === src && m.item.id === seriesId) out.push({ job: j, meta: m });
  }
  return out.sort((a, b) => (a.meta.ep.season || 0) - (b.meta.ep.season || 0) || (a.meta.ep.episodeNum || 0) - (b.meta.ep.episodeNum || 0));
}
