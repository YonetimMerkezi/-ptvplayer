// Yedekle / geri yükle: kaynaklar (kullanıcı adı/parola dahil), favoriler, son izlenenler, ilerleme, kategori düzeni ve ayarlar.
// Yedeğe girmeyenler: uygulama şifresi, "çalışmıyor" işaretleri ve dosyadan eklenen listeler (içeriği cihazda).
export const BACKUP_APP = 'iptv-oynatici';
export const BACKUP_VERSION = 1;

const SKIP = [/^pref\.lock\./, /^pref\.bad\./];
const PER_SOURCE = /^(fav|rec|prog|cats)\.(.+)$/;
const skipped = (k) => SKIP.some((re) => re.test(k));

// Mevcut depodan yedek nesnesi üretir.
export function makeBackup(store, now = Date.now()) {
  const sources = store.sources().filter((s) => !s.local);
  const ids = new Set(sources.map((s) => s.id));
  const data = {};
  for (const k of store.keys()) {
    if (skipped(k)) continue;
    if (k === 'sources') {
      data.sources = sources;
      continue;
    }
    const m = PER_SOURCE.exec(k);
    if (m && !ids.has(m[2])) continue;
    const v = store.get(k);
    if (v !== undefined) data[k] = v;
  }
  if (!data.sources) data.sources = sources;
  return { app: BACKUP_APP, v: BACKUP_VERSION, at: now, data };
}

export function backupFileName(now = Date.now()) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, '0');
  return `iptv-yedek-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

// Metinden yedeği okur ve doğrular: { ok, backup, summary } ya da { ok:false, error }.
export function parseBackup(text) {
  let b;
  try {
    b = JSON.parse(String(text || ''));
  } catch {
    return { ok: false, error: 'Dosya okunamadı (geçerli bir yedek değil)' };
  }
  if (!b || b.app !== BACKUP_APP || typeof b.data !== 'object' || b.data === null) return { ok: false, error: 'Bu dosya bu uygulamanın yedeği değil' };
  if (!(b.v >= 1) || b.v > BACKUP_VERSION) return { ok: false, error: 'Yedek daha yeni bir sürümden; önce uygulamayı güncelleyin' };
  if (!Array.isArray(b.data.sources)) return { ok: false, error: 'Yedekte kaynak listesi yok' };
  return { ok: true, backup: b, summary: summarize(b) };
}

export function summarize(b) {
  const d = b.data || {};
  let favs = 0;
  let folders = 0;
  let prefs = 0;
  for (const [k, v] of Object.entries(d)) {
    if (k.startsWith('fav.') && Array.isArray(v)) favs += v.length;
    else if (k.startsWith('cats.') && v && typeof v === 'object') for (const c of Object.values(v)) folders += Array.isArray(c && c.folders) ? c.folders.length : 0;
    else if (k.startsWith('pref.')) prefs++;
  }
  return { sources: (d.sources || []).length, favs, folders, prefs, at: b.at || 0 };
}

// Depoyu yedekle değiştirir: yedeğe girebilecek mevcut anahtarlar silinir, yedektekiler yazılır.
// Dosyadan eklenen yerel listeler ve uygulama şifresi korunur. Etkin kaynak yedektekine ayarlanır.
export function applyBackup(store, backup) {
  const keep = store.sources().filter((s) => s.local);
  for (const k of store.keys()) {
    if (skipped(k)) continue;
    const m = PER_SOURCE.exec(k);
    if (m && keep.some((s) => s.id === m[2])) continue;
    if (k === 'sources' || k === 'active' || m || k.startsWith('pref.')) store.drop(k);
  }
  const incoming = backup.data;
  for (const [k, v] of Object.entries(incoming)) {
    if (skipped(k) || k === 'sources') continue;
    if (k === 'active' || k.startsWith('pref.') || PER_SOURCE.test(k)) store.put(k, v);
  }
  const ids = new Set(incoming.sources.map((s) => s.id));
  store.put('sources', incoming.sources.concat(keep.filter((s) => !ids.has(s.id))));
  return summarize(backup);
}
