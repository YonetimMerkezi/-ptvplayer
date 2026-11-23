// Yayın kalitesi: HLS ana listesinden (master playlist) oynatıcıya verilecek en yüksek uygun kaliteyi seçer.
// webOS'un yerel oynatıcısı varsayılan olarak düşük kaliteyle başlayıp yavaşça yükselebilir; en yüksek kalite seçildiğinde
// doğrudan en iyi sürümün listesi verilir. Ağ yoksa, liste çözülemezse ya da seçilecek bir şey yoksa özgün adres kullanılır.
import * as K from './log.js';

// Eski modellerde çözülemeyen kodekler (HEVC/AV1/VP9) ve 1080p üstü sürümler elenir; H.264 ≤ 1080p her modelde çalışır
const DESTEKSIZ = /(hvc1|hev1|dvh1|dvhe|av01|vp09|vp9)/i;
const AZAMI_YUKSEKLIK = 1080;

export const hlsMi = (u) => /\.m3u8(?:[?#]|$)/i.test(String(u || ''));

// Göreli adresi tabanına göre mutlak yapar
export function mutlakUrl(taban, yol) {
  const y = String(yol || '').trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(y)) return y;
  const t = String(taban || '').replace(/[?#].*$/, '');
  const m = /^([a-z][a-z0-9+.-]*:)\/\/([^/]*)(\/.*)?$/i.exec(t);
  if (!m) return '';
  if (y.indexOf('//') === 0) return m[1] + y;
  if (y.charAt(0) === '/') return m[1] + '//' + m[2] + y;
  const yol0 = m[3] || '/';
  return m[1] + '//' + m[2] + yol0.slice(0, yol0.lastIndexOf('/') + 1) + y;
}

const oznitelikler = (s) => {
  const r = {};
  const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let m;
  while ((m = re.exec(s))) r[m[1]] = m[2].replace(/^"|"$/g, '');
  return r;
};

// metin: ana liste; taban: listenin son (yönlendirmeden sonraki) adresi. Seçilecek sürüm yoksa null.
export function enYuksekVaryant(metin, taban) {
  const satirlar = String(metin || '').split(/\r?\n/);
  if (String(metin || '').indexOf('#EXTM3U') < 0) return null;
  const adaylar = [];
  for (let i = 0; i < satirlar.length; i++) {
    const s = satirlar[i].trim();
    // Sesi ayrı listeden gelen yayında sürümü tek başına vermek sessiz kalmasına yol açar: olduğu gibi bırak
    if (s.indexOf('#EXT-X-MEDIA:') === 0) {
      const o = oznitelikler(s.slice(13));
      if (o.TYPE === 'AUDIO' && o.URI) return null;
      continue;
    }
    if (s.indexOf('#EXT-X-STREAM-INF:') !== 0) continue;
    const o = oznitelikler(s.slice(18));
    let j = i + 1;
    while (j < satirlar.length && (!satirlar[j].trim() || satirlar[j].trim().charAt(0) === '#')) j++;
    if (j >= satirlar.length) continue;
    const res = /^(\d+)x(\d+)$/i.exec(o.RESOLUTION || '');
    adaylar.push({ uri: satirlar[j].trim(), bw: parseInt(o.BANDWIDTH, 10) || 0, w: res ? +res[1] : 0, h: res ? +res[2] : 0, kodek: o.CODECS || '' });
  }
  if (adaylar.length < 2) return null; // seçenek yok: yerel oynatıcı zaten tek sürümü oynatır
  const uygun = adaylar.filter((a) => !DESTEKSIZ.test(a.kodek) && (!a.h || a.h <= AZAMI_YUKSEKLIK));
  if (!uygun.length) return null;
  uygun.sort((a, b) => b.bw - a.bw || b.h - a.h);
  const en = uygun[0];
  const url = mutlakUrl(taban, en.uri);
  return url ? { url, bw: en.bw, w: en.w, h: en.h } : null;
}

const onbellek = {}; // ana liste adresi → { t, v }
const OMUR_BASARI = 10 * 60 * 1000;
const OMUR_BASARISIZ = 2 * 60 * 1000;

// net: createNet() nesnesi. Her zaman çözülür (hata/zaman aşımı → null: özgün adres kullanılır).
export async function kaliteCoz(net, url, { zamanAsimi = 2500 } = {}) {
  const o = onbellek[url];
  if (o && Date.now() - o.t < (o.v ? OMUR_BASARI : OMUR_BASARISIZ)) return o.v;
  let v = null;
  try {
    let son = '';
    const metin = await net.get(url, { timeoutMs: zamanAsimi, sonUrl: (u) => (son = u || '') });
    // Son adres bilinmiyorsa (TV servisi yolu) göreli sürüm adresleri çözülemez: yalnız mutlak adresler kabul edilir
    v = enYuksekVaryant(metin, son);
  } catch (e) {
    K.uyar('Kalite listesi alınamadı: ' + (e && e.message ? e.message : e));
    v = null;
  }
  onbellek[url] = { t: Date.now(), v };
  if (v) K.bilgi('En yüksek kalite seçildi: ' + (v.h ? v.h + 'p ' : '') + Math.round(v.bw / 1000) + ' kb/s');
  return v;
}

// Seçilen sürüm oynatılamadıysa bu ana liste için seçim bir süre bırakılır
export const kaliteVazgec = (url) => {
  onbellek[url] = { t: Date.now(), v: null };
};

export const kaliteTemizle = () => {
  for (const k in onbellek) delete onbellek[k];
};
