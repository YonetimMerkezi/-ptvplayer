// Uygulama içi güncelleme: yayın sayfasındaki version.json okunur, yeni sürüm varsa kullanıcıya bildirilir.
// Sürüm numarası CI çalışma numarasıdır ("1.0.N"); Android de aynı sayıyı versionCode olarak kullanır.

export const UPDATE_BASE = 'https://github.com/YonetimMerkezi/-ptvplayer/releases/download/latest/';

// "1.0.57" → 57; tanınmayan (ör. "geliştirme") → 0.
export function versionCodeOf(v) {
  const m = /^\d+\.\d+\.(\d+)$/.exec(String(v == null ? '' : v).trim());
  return m ? Number(m[1]) : 0;
}

// version.json içeriğini doğrular ve normalleştirir; geçersizse null.
export function parseManifest(j, base = UPDATE_BASE) {
  if (!j || typeof j !== 'object') return null;
  const code = Number(j.versionCode);
  if (!Number.isInteger(code) || code <= 0) return null;
  const apk = typeof j.apk === 'string' && /^[\w.-]+\.apk$/.test(j.apk) ? j.apk : 'iptv-oynatici.apk';
  const size = Number(j.size);
  return {
    code,
    name: typeof j.versionName === 'string' && j.versionName ? j.versionName : `1.0.${code}`,
    size: Number.isFinite(size) && size > 0 ? size : 0,
    notes: typeof j.notes === 'string' ? j.notes.slice(0, 500) : '',
    apkUrl: base + apk,
  };
}

// Yalnızca bilinen bir yerel sürüm varken ve uzak sürüm daha büyükse güncelleme vardır.
export const isNewer = (remoteCode, localCode) => localCode > 0 && remoteCode > localCode;

// → { status: 'unsupported' } | { status: 'current'|'available', local, code, name, size, notes, apkUrl }
export async function checkUpdate({ net, localVersion, base = UPDATE_BASE }) {
  const local = versionCodeOf(localVersion);
  if (!local) return { status: 'unsupported' };
  const m = parseManifest(await net.json(base + 'version.json'), base);
  if (!m) throw new Error('Sürüm bilgisi okunamadı');
  return { status: isNewer(m.code, local) ? 'available' : 'current', local, ...m };
}

export const fmtMB = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`.replace('.', ',');

// Otomatik denetimin sıklığı: en çok 6 saatte bir.
export const AUTO_CHECK_MS = 6 * 3600e3;
export const shouldAutoCheck = (lastAt, now = Date.now()) => !lastAt || now - lastAt > AUTO_CHECK_MS;
