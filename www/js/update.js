// Uygulama içi güncelleme: yayın sayfasındaki version.json okunur, yeni sürüm varsa kullanıcıya bildirilir.
// Sürüm numarası CI çalışma numarasıdır ("1.0.N"); Android de aynı sayıyı versionCode olarak kullanır.

export const UPDATE_BASE = 'https://github.com/YonetimMerkezi/-ptvplayer/releases/download/latest/';
// Ana adres geçici hata verirse (ör. 502/504) aynı yayının “en son” adresi denenir.
export const UPDATE_FALLBACKS = ['https://github.com/YonetimMerkezi/-ptvplayer/releases/latest/download/'];

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

const httpCode = (e) => {
  const m = /HTTP (\d{3})/.exec((e && e.message) || '');
  return m ? Number(m[1]) : 0;
};

// Geçici sayılan hatalar: 5xx, 408, 429 ve kodsuz ağ/zaman aşımı hataları. 404 gibi kalıcı hatalar tekrar denenmez.
export function isTransient(e) {
  if (e && e.permanent) return false;
  const c = httpCode(e);
  return !c || c >= 500 || c === 408 || c === 429;
}

// Okunur hata metni: ham “HTTP 504” yerine ne olduğunu ve ne yapılacağını söyler.
export function explainError(e) {
  const c = httpCode(e);
  if (c >= 500) return `Sunucu şu an yanıt vermiyor (HTTP ${c}). Biraz sonra yeniden deneyin.`;
  if (c === 429) return 'Çok sık denendi (HTTP 429). Biraz sonra yeniden deneyin.';
  if (c === 404) return 'Yayın dosyası bulunamadı (HTTP 404).';
  return String((e && e.message) || e || 'bilinmeyen hata');
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// fn'i geçici hatada artan beklemeyle yeniden dener (varsayılan 3 deneme: 1,2 sn). Kalıcı hata hemen yayılır.
export async function retry(fn, { tries = 3, delays = [1000, 2000], sleep = wait } = {}) {
  let last;
  for (let n = 0; n < tries; n++) {
    try {
      return await fn(n);
    } catch (e) {
      last = e;
      if (!isTransient(e) || n === tries - 1) break;
      await sleep(delays[Math.min(n, delays.length - 1)]);
    }
  }
  throw last;
}

// version.json'ı sırayla ana ve yedek adreslerden okur; her tur geçici hatada beklenip yinelenir.
async function fetchManifest(net, bases, sleep) {
  let last;
  for (let n = 0; n < 3; n++) {
    let transient = false;
    for (const b of bases) {
      try {
        const m = parseManifest(await net.json(b + 'version.json'), b);
        if (!m) throw Object.assign(new Error('Sürüm bilgisi okunamadı'), { permanent: true });
        return m;
      } catch (e) {
        last = e;
        if (isTransient(e)) transient = true;
      }
    }
    if (!transient || n === 2) break;
    await sleep([1000, 2000][n]);
  }
  throw last;
}

// → { status: 'unsupported' } | { status: 'current'|'available', local, code, name, size, notes, apkUrl }
export async function checkUpdate({ net, localVersion, base = UPDATE_BASE, fallbacks = base === UPDATE_BASE ? UPDATE_FALLBACKS : [], sleep = wait }) {
  const local = versionCodeOf(localVersion);
  if (!local) return { status: 'unsupported' };
  const m = await fetchManifest(net, [base, ...fallbacks], sleep);
  return { status: isNewer(m.code, local) ? 'available' : 'current', local, ...m };
}

export const fmtMB = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`.replace('.', ',');

// Otomatik denetimin sıklığı: en çok 6 saatte bir.
export const AUTO_CHECK_MS = 6 * 3600e3;
export const shouldAutoCheck = (lastAt, now = Date.now()) => !lastAt || now - lastAt > AUTO_CHECK_MS;
