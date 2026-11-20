// Ağ: önce doğrudan XMLHttpRequest; tarayıcı kısıtı (CORS) ya da bağlantı hatasında TV içindeki JS servisi.
// Sunucu gerçek bir HTTP cevabı verdiyse (404, 401 …) yedeğe geçilmez: sorun ağda değil istektedir.
import { luna, SERVIS, varlik } from './luna.js';
import * as K from './log.js';

export class AgHatasi extends Error {
  constructor(mesaj, durum) {
    super(mesaj);
    this.name = 'AgHatasi';
    this.status = durum || 0;
  }
}

const CHUNK = 262144; // servis yanıtları bu kadar karakterlik parçalarla okunur

const hostOf = (u) => {
  const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(String(u));
  return m ? m[1].toLowerCase() : '';
};

// Doğrudan XHR. status 0 → ağ/CORS hatası (yedeğe geçilebilir).
export function xhrGet(url, { timeoutMs = 30000, headers, onProgress } = {}) {
  return new Promise((coz, red) => {
    const x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.timeout = timeoutMs;
    if (headers) for (const k in headers) if (Object.prototype.hasOwnProperty.call(headers, k)) x.setRequestHeader(k, headers[k]);
    x.onprogress = (e) => {
      if (onProgress) onProgress(e.loaded);
    };
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) coz(x.responseText);
      else red(new AgHatasi('Sunucu ' + x.status + ' döndürdü', x.status));
    };
    x.onerror = () => red(new AgHatasi('Bağlanılamadı', 0));
    x.ontimeout = () => red(new AgHatasi('Zaman aşımı', 0));
    x.send();
  });
}

// TV içindeki JS servisi (service/service.js): istekleri Node tarafında atar, CORS yoktur.
export async function servisGet(url, { timeoutMs = 30000, headers, onProgress } = {}) {
  let r = await luna(SERVIS + 'fetch', { url, headers: headers || null, timeoutMs, chunk: CHUNK }, timeoutMs + 15000);
  if (!r.returnValue) throw new AgHatasi(r.errorText || 'Servis hatası', 0);
  if (r.status >= 400) throw new AgHatasi('Sunucu ' + r.status + ' döndürdü', r.status);
  let metin = r.data || '';
  while (!r.done) {
    r = await luna(SERVIS + 'read', { id: r.id, offset: metin.length, length: CHUNK }, 30000);
    if (!r.returnValue) throw new AgHatasi(r.errorText || 'Servis okuma hatası', 0);
    metin += r.data || '';
    if (onProgress) onProgress(metin.length);
  }
  return metin;
}

export function createNet({ ayar, taşıyıcı } = {}) {
  const tas = Object.assign({ direct: xhrGet, service: servisGet, hasService: varlik }, taşıyıcı || {});
  const ogrenilen = {}; // sunucu → son çalışan yol
  const mod = () => (ayar ? ayar() : 'auto');

  const sira = (url) => {
    const m = mod();
    if (m === 'direct') return ['direct'];
    if (m === 'service') return ['service'];
    const o = ogrenilen[hostOf(url)];
    const hepsi = tas.hasService() ? ['direct', 'service'] : ['direct'];
    return o && hepsi.indexOf(o) >= 0 ? [o].concat(hepsi.filter((x) => x !== o)) : hepsi;
  };

  async function get(url, opt) {
    const yollar = sira(url);
    let sonHata = null;
    for (let i = 0; i < yollar.length; i++) {
      const y = yollar[i];
      try {
        const t = await tas[y](url, opt || {});
        if (mod() === 'auto' && ogrenilen[hostOf(url)] !== y) {
          ogrenilen[hostOf(url)] = y;
          K.bilgi('Ağ yolu: ' + hostOf(url) + ' → ' + (y === 'direct' ? 'doğrudan' : 'TV servisi'));
        }
        return t;
      } catch (e) {
        sonHata = e;
        K.uyar((y === 'direct' ? 'Doğrudan' : 'Servis') + ' istek başarısız: ' + (e && e.message) + ' (' + hostOf(url) + ')');
        if (e && e.status > 0) throw e; // gerçek HTTP cevabı
      }
    }
    throw sonHata || new AgHatasi('Bağlanılamadı', 0);
  }

  async function json(url, opt) {
    const t = await get(url, opt);
    try {
      return JSON.parse(t);
    } catch (e) {
      throw new AgHatasi('Sunucu geçerli bir yanıt vermedi', 0);
    }
  }
  // text: get ile aynıdır (Android'deki ortak modüller net.text bekler)
  return { get, text: get, json, ogrenilen };
}
