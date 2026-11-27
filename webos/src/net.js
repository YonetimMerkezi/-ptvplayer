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

// Kullanıcı başka kategoriye geçince eski istek bırakılır: yanıtı ayrıştırılıp eşlenmez, yedek yola da geçilmez
const iptalHatasi = () => {
  const e = new AgHatasi('İstek iptal edildi', 0);
  e.iptal = true;
  return e;
};
const aktifXhr = {}; // grup → bekleyen XMLHttpRequest (aynı gruptaki yeni istek öncekini keser)

// Köprü iletisi TV'de ~8 ms/KB ile çözülüyor (günlük: 296 KB → 2,4 sn donma): yedek yolda parçalar küçük tutulur, böylece her ileti kısa sürer
const CHUNK_VARSAYILAN = 24576; // servis yanıtları bu kadar karakterlik parçalarla okunur (yalnız yerel aktarım çalışmazsa)
const PARALEL = 2; // aynı anda istenen parça sayısı

const hostOf = (u) => {
  const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(String(u));
  return m ? m[1].toLowerCase() : '';
};

// Doğrudan XHR. status 0 → ağ/CORS hatası (yedeğe geçilebilir).
export function xhrGet(url, { timeoutMs = 30000, headers, onProgress, grup, sonUrl } = {}) {
  return new Promise((coz, red) => {
    const x = new XMLHttpRequest();
    if (grup) {
      if (aktifXhr[grup]) aktifXhr[grup].abort();
      aktifXhr[grup] = x;
    }
    const bitir = () => {
      if (grup && aktifXhr[grup] === x) delete aktifXhr[grup];
    };
    x.open('GET', url, true);
    x.timeout = timeoutMs;
    if (headers) for (const k in headers) if (Object.prototype.hasOwnProperty.call(headers, k)) x.setRequestHeader(k, headers[k]);
    x.onprogress = (e) => {
      if (onProgress) onProgress(e.loaded);
    };
    x.onload = () => {
      bitir();
      if (x.status >= 200 && x.status < 300) {
        if (sonUrl) sonUrl(x.responseURL || url); // yönlendirme sonrası adres (göreli adresleri çözmek için)
        coz(x.responseText);
      }
      else red(new AgHatasi('Sunucu ' + x.status + ' döndürdü', x.status));
    };
    x.onerror = () => {
      bitir();
      red(new AgHatasi('Bağlanılamadı', 0));
    };
    x.ontimeout = () => {
      bitir();
      red(new AgHatasi('Zaman aşımı', 0));
    };
    x.onabort = () => {
      bitir();
      red(iptalHatasi());
    };
    x.send();
  });
}

// Yerel aktarım: servisin 127.0.0.1 HTTP kapısı. Büyük yanıt köprü iletisi olarak değil doğal ağ yığınından gelir (arayüz donmaz).
// Çalışmazsa (kapı kapalı, CORS, eski sistem) köprü yoluna dönülür; art arda iki başarısızlıktan sonra bu oturumda denenmez.
const ROLE_BOSTA_MS = 3500; // servis ~5 sn boşta kalınca kapanır: bu süreden eskiyse bilgi yenilenir (servis yeniden başlatılır)
let role = null; // { port, jeton, t }
let roleHata = 0;
const roleHatasi = (m) => {
  const e = new AgHatasi(m, 0);
  e.role = true;
  return e;
};
async function roleBilgisi(zorla) {
  if (!zorla && role && Date.now() - role.t < ROLE_BOSTA_MS) return role;
  let r;
  try {
    r = await luna(SERVIS + 'roleBilgi', {}, 8000);
  } catch (e) {
    throw roleHatasi('Yerel aktarım bilgisi alınamadı: ' + (e && e.message ? e.message : e));
  }
  if (!r || !r.returnValue || !r.port || !r.jeton) throw roleHatasi('Yerel aktarım bilgisi alınamadı');
  role = { port: r.port, jeton: r.jeton, t: Date.now() };
  return role;
}
function roleXhr(b, url, { timeoutMs, headers, onProgress, iptalMi, proje }) {
  return new Promise((coz, red) => {
    const x = new XMLHttpRequest();
    let q = 'u=' + encodeURIComponent(url) + '&s=' + timeoutMs;
    if (headers) q += '&h=' + encodeURIComponent(JSON.stringify(headers));
    if (proje) q += '&p=' + encodeURIComponent(proje);
    x.open('GET', 'http://127.0.0.1:' + b.port + '/' + b.jeton + '/g?' + q, true);
    x.timeout = timeoutMs + 15000;
    const kes = iptalMi ? setInterval(() => iptalMi() && x.abort(), 300) : 0;
    const bitir = () => {
      if (kes) clearInterval(kes);
      role && (role.t = Date.now());
    };
    x.onprogress = (e) => {
      if (onProgress) onProgress(e.loaded);
    };
    x.onload = () => {
      bitir();
      if (x.status === 502) return red(new AgHatasi(String(x.responseText || 'Bağlanılamadı'), 0));
      const ust = Number(x.getResponseHeader('X-Upstream-Status'));
      if (x.status !== 200 || !ust) return red(roleHatasi('Yerel aktarım ' + x.status + ' döndürdü'));
      if (ust >= 400) return red(new AgHatasi('Sunucu ' + ust + ' döndürdü', ust));
      coz(x.responseText);
    };
    x.onerror = () => {
      bitir();
      red(roleHatasi('Yerel aktarıma bağlanılamadı'));
    };
    x.onabort = () => {
      bitir();
      red(iptalMi && iptalMi() ? iptalHatasi() : roleHatasi('Yerel aktarım kesildi'));
    };
    x.ontimeout = () => {
      bitir();
      red(new AgHatasi('Zaman aşımı', 0));
    };
    x.send();
  });
}
async function roleGet(url, o) {
  const t0 = Date.now();
  let son;
  for (let deneme = 0; deneme < 2; deneme++) {
    try {
      const m = await roleXhr(await roleBilgisi(deneme > 0), url, o);
      roleHata = 0;
      if (m.length > 60000) K.bilgi('Yerel aktarım: ' + Math.round(m.length / 1024) + ' KB, ' + (Date.now() - t0) + ' ms');
      return m;
    } catch (e) {
      if (!e || !e.role) throw e;
      son = e;
      role = null; // servis yeniden başlamış olabilir: jeton ve kapı yenilenir
    }
  }
  throw son;
}

// TV içindeki JS servisi (service/service.js): istekleri Node tarafında atar, CORS yoktur.
// proje: servis yanıt JSON'unu yalnız uygulamanın okuduğu alanlara budar (küçük köprü iletisi: büyük ileti TV'de arayüzü donduruyordu).
// chunk: parça boyutu (varsayılan CHUNK); nazik: parçalar tek tek ve aralarda kısa bekleyerek okunur (tuşlar işlenebilsin; yalnız ağır, isteğe bağlı sayfalarda).
const bekle = (ms) => new Promise((c) => setTimeout(c, ms));
export async function servisGet(url, { timeoutMs = 30000, headers, onProgress, iptalMi, proje, chunk, nazik } = {}) {
  if (roleHata < 2) {
    try {
      return await roleGet(url, { timeoutMs, headers, onProgress, iptalMi, proje });
    } catch (e) {
      if (!e || !e.role) throw e; // gerçek ağ/HTTP hatası: köprü de aynı sonucu verirdi
      roleHata++;
      K.uyar('Yerel aktarım çalışmadı, köprüye dönülüyor: ' + e.message);
      if (iptalMi && iptalMi()) throw iptalHatasi();
    }
  }
  const CHUNK = chunk > 0 ? chunk : CHUNK_VARSAYILAN;
  const par = nazik ? 1 : PARALEL;
  let r = await luna(SERVIS + 'fetch', { url, headers: headers || null, timeoutMs, chunk: CHUNK, proje: proje || null }, timeoutMs + 15000);
  if (iptalMi && iptalMi()) throw iptalHatasi();
  if (!r.returnValue) throw new AgHatasi(r.errorText || 'Servis hatası', 0);
  if (r.status >= 400) throw new AgHatasi('Sunucu ' + r.status + ' döndürdü', r.status);
  let metin = r.data || '';
  if (r.done) return metin;
  const toplam = r.total > 0 ? r.total : 0;
  // Toplam uzunluk biliniyorsa kalan parçalar aynı anda (en çok PARALEL tane) istenir: sıralı okumada her parça bir gidiş-dönüş bekletiyordu
  if (toplam > metin.length) {
    const id = r.id;
    const bas = metin.length;
    const adet = Math.ceil((toplam - bas) / CHUNK);
    const parcalar = new Array(adet);
    let siradaki = 0;
    let yuklenen = bas;
    const isci = async () => {
      while (siradaki < adet) {
        const i = siradaki++;
        if (iptalMi && iptalMi()) throw iptalHatasi();
        const y = await luna(SERVIS + 'read', { id, offset: bas + i * CHUNK, length: CHUNK }, 30000);
        if (!y.returnValue) throw new AgHatasi(y.errorText || 'Servis okuma hatası', 0);
        parcalar[i] = y.data || '';
        yuklenen += parcalar[i].length;
        if (onProgress) onProgress(yuklenen);
        if (nazik) await bekle(40);
      }
    };
    const isciler = [];
    for (let k = 0; k < Math.min(par, adet); k++) isciler.push(isci());
    await Promise.all(isciler);
    metin += parcalar.join('');
    if (metin.length !== toplam) throw new AgHatasi('Servis yanıtı eksik geldi', 0);
    return metin;
  }
  while (!r.done) {
    if (iptalMi && iptalMi()) throw iptalHatasi();
    r = await luna(SERVIS + 'read', { id: r.id, offset: metin.length, length: CHUNK }, 30000);
    if (!r.returnValue) throw new AgHatasi(r.errorText || 'Servis okuma hatası', 0);
    metin += r.data || '';
    if (onProgress) onProgress(metin.length);
    if (nazik) await bekle(40);
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

  const grupNo = {}; // grup → son istek numarası (servis yolunda eski istekler bunu görüp bırakılır)
  async function get(url, opt) {
    const yollar = sira(url);
    let sonHata = null;
    if (opt && opt.grup) {
      const n = (grupNo[opt.grup] = (grupNo[opt.grup] || 0) + 1);
      const g = opt.grup;
      opt = Object.assign({}, opt, { iptalMi: () => grupNo[g] !== n });
    }
    for (let i = 0; i < yollar.length; i++) {
      const y = yollar[i];
      try {
        const t = await tas[y](url, opt || {});
        if (opt && typeof opt.yolBildir === 'function') opt.yolBildir(y); // hangi yoldan geldi (doğrudan XHR'de TLS'i tarayıcı doğrular)
        if (mod() === 'auto' && ogrenilen[hostOf(url)] !== y) {
          ogrenilen[hostOf(url)] = y;
          K.bilgi('Ağ yolu: ' + hostOf(url) + ' → ' + (y === 'direct' ? 'doğrudan' : 'TV servisi'));
        }
        return t;
      } catch (e) {
        if (e && e.iptal) throw e; // bırakılan istek: yedek yola geçilmez, kayda yazılmaz
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
