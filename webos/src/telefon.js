// Telefon kumandası (uygulama tarafı): TV servisindeki küçük sunucuya telefon tarayıcısından gelen tuş, yazı ve
// "TV'de oynat" komutları uzun yoklamayla alınır ve burada uygulanır. Sunucu service/service.js içindedir.
import { ctx, open, pop, top } from './ctx.js';
import { luna, varlik, SERVIS } from './luna.js';
import { yolAc } from './fragman.js';
import { toast } from './ui.js';
import * as K from './log.js';

// Telefondaki düğme adı → webOS tuş kodu (keys.js ile aynı eşleme)
export const TUS_KODLARI = {
  up: 38, down: 40, left: 37, right: 39, ok: 13, back: 461,
  red: 403, green: 404, yellow: 405, blue: 406,
  play: 415, pause: 19, stop: 413, rw: 412, ff: 417, chup: 427, chdown: 428, info: 457,
  num0: 48, num1: 49, num2: 50, num3: 51, num4: 52, num5: 53, num6: 54, num7: 55, num8: 56, num9: 57,
};

// Gerçek kumanda basmış gibi keydown + keyup olayı üretir: uygulamanın tuş dağıtıcısı (app.js tuslariBagla) olduğu gibi çalışır.
// ms > 0: tuş o kadar basılı tutulur (uzun OK). Dönen: tuş tanındı mı.
export function tusGonder(ad, { ms = 0, doc = document, bekle = setTimeout } = {}) {
  const kod = Object.prototype.hasOwnProperty.call(TUS_KODLARI, ad) ? TUS_KODLARI[ad] : 0;
  if (!kod) return false;
  const olay = (tur) => {
    const e = doc.createEvent('Event');
    e.initEvent(tur, true, true);
    const alanlar = { keyCode: kod, which: kod, repeat: false };
    Object.keys(alanlar).forEach((k) => {
      try {
        Object.defineProperty(e, k, { value: alanlar[k] });
      } catch (x) {
        /* salt okunur alan değiştirilemezse yok sayılır */
      }
    });
    return e;
  };
  const hedef = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : doc;
  hedef.dispatchEvent(olay('keydown'));
  const birak = () => hedef.dispatchEvent(olay('keyup'));
  if (ms > 0) bekle(birak, ms);
  else birak();
  return true;
}

// Açık ekrandaki yazı alanına yazar; alan yoksa ve arama istenmişse Ara ekranını o yazıyla açar.
// Dönen: 'yazildi' | 'arama' | 'yok'
export function metinGonder(metin, enter, { doc = document, ust = top(), ac = open } = {}) {
  const a = doc.activeElement;
  let g = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') ? a : null;
  if (!g && ust && ust.el && ust.el.querySelector) g = ust.el.querySelector('input[type=text], input:not([type]), textarea');
  if (!g) {
    if (enter && metin) {
      ac('search', { q: metin });
      return 'arama';
    }
    return 'yok';
  }
  g.value = metin;
  try {
    const e = doc.createEvent('Event');
    e.initEvent('input', true, true);
    g.dispatchEvent(e);
  } catch (x) {
    /* dinleyici yoksa değer yine de yazılmıştır */
  }
  // Enter: ekranın kendi giriş tuşu işleyicisi (arama kutusunda aramayı başlatır)
  if (enter && ust && ust.onInputKey) ust.onInputKey('ok', { preventDefault() {}, keyCode: 13 }, g);
  return 'yazildi';
}

// YouTube bağlantısından video kimliği; YouTube değilse ''
export function youtubeKimligi(url) {
  const m = /^https?:\/\/(?:www\.|m\.|music\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)(\/[^?#]*)?(\?[^#]*)?/i.exec(String(url || ''));
  if (!m) return '';
  const KIMLIK = /^[A-Za-z0-9_-]{11}$/;
  const yol = m[2] || '';
  if (/^youtu\.be$/i.test(m[1])) {
    const k = yol.slice(1).split('/')[0];
    return KIMLIK.test(k) ? k : '';
  }
  const v = /[?&]v=([A-Za-z0-9_-]{11})(?:[&#]|$)/.exec(m[3] || '');
  if (v) return v[1];
  const p = /^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})(?:\/|$)/.exec(yol);
  return p ? p[1] : '';
}

// Telefondan gelen bağlantı için oynatıcı öğesi: oynatıcı 'local' öğeyi kendi adresiyle açar
export function oynatmaOgesi(url, ad, simdi = Date.now) {
  const konak = (/^https?:\/\/([^/?#]+)/i.exec(url) || [])[1] || 'Yayın';
  return { kind: 'local', id: 'tel:' + simdi(), name: String(ad || '').trim() || 'Telefondan · ' + konak, url };
}

export function oynatIsle(url, ad, { ac = open, youtube, bildir = () => {} } = {}) {
  const yt = youtubeKimligi(url);
  if (yt && youtube) {
    bildir('YouTube açılıyor…');
    return youtube(yt, ad);
  }
  bildir('Telefondan gelen yayın açılıyor…');
  ac('player', { list: [oynatmaOgesi(url, ad)], index: 0 });
  return true;
}

// Servisten gelen tek komutu uygular. b: { doc, ust, ac, youtube, bildir, bekle }
export function komutIsle(k, b = {}) {
  if (!k) return false;
  if (k.t === 'tus') return tusGonder(k.tus, { ms: k.ms, doc: b.doc, bekle: b.bekle });
  if (k.t === 'metin') {
    const s = metinGonder(k.metin, k.enter, { doc: b.doc, ust: b.ust, ac: b.ac });
    if (s === 'yok' && b.bildir) b.bildir('TV’de yazı yazılacak bir alan açık değil');
    return s;
  }
  if (k.t === 'oynat') return oynatIsle(k.url, k.ad, b);
  if (k.t === 'kaynak') return b.kaynak ? b.kaynak(k) : false;
  return false;
}

// Yoklayıcı: servisteki sunucuyu başlatır ve komutları sürekli alır. Bağımlılıklar dışarıdan verilebilir (test).
export function telefonYoklayici({ cagri = luna, pin, uygula, bekle = (ms) => new Promise((c) => setTimeout(c, ms)) } = {}) {
  let nesil = 0;
  let bilgi = null;
  let telefon = false;
  let hata = '';
  const aboneler = [];
  const duyur = () => aboneler.slice().forEach((f) => f());

  async function dongu(n) {
    let ardisik = 0;
    while (n === nesil) {
      try {
        const r = await cagri(SERVIS + 'kumandaSor', { bekleMs: 1500 }, 8000);
        if (n !== nesil) return;
        if (!r || r.returnValue === false) throw new Error((r && r.errorText) || 'Kumanda kapandı');
        ardisik = 0;
        if (hata) {
          hata = '';
          duyur();
        }
        if (!!r.telefon !== telefon) {
          telefon = !!r.telefon;
          duyur();
        }
        const l = r.komutlar || [];
        for (let i = 0; i < l.length; i++) {
          try {
            if (uygula) uygula(l[i]);
          } catch (e) {
            K.hata(e);
          }
        }
      } catch (e) {
        if (n !== nesil) return;
        ardisik++;
        hata = e && e.message ? e.message : String(e);
        duyur();
        await bekle(Math.min(5000, 800 * ardisik));
        if (n !== nesil) return;
        // Sunucu kapanmış olabilir (yoklama kesilmişti): aynı kodla yeniden başlat
        try {
          await cagri(SERVIS + 'kumandaBaslat', { pin: pin ? pin() : '' }, 8000);
        } catch (x) {
          /* bir sonraki turda yeniden denenir */
        }
      }
    }
  }

  return {
    // sifirla: yanlış kod sayacını sıfırlar (TV ekranında kod gösterilirken). Dönen: { ip, port, pin, adres }
    async baslat({ sifirla = false } = {}) {
      if (!varlik()) throw new Error('Bu özellik yalnızca TV’de çalışır');
      const n = ++nesil;
      const r = await cagri(SERVIS + 'kumandaBaslat', { pin: pin ? pin() : '', sifirla }, 10000);
      if (n !== nesil) return bilgi;
      if (!r || r.returnValue === false) throw new Error((r && r.errorText) || 'Kumanda başlatılamadı');
      const ip = (r.adresler || [])[0] || '';
      bilgi = { ip, port: r.port, pin: r.pin, adres: ip ? 'http://' + ip + ':' + r.port + '/k?k=' + r.pin : '' };
      hata = '';
      telefon = false;
      duyur();
      dongu(n);
      return bilgi;
    },
    durdur() {
      nesil++;
      bilgi = null;
      telefon = false;
      hata = '';
      duyur();
      Promise.resolve(varlik() ? cagri(SERVIS + 'kumandaDurdur', {}, 4000) : null).catch(() => {});
    },
    bilgi: () => bilgi,
    telefon: () => telefon,
    hata: () => hata,
    abone(f) {
      aboneler.push(f);
      return () => {
        const i = aboneler.indexOf(f);
        if (i >= 0) aboneler.splice(i, 1);
      };
    },
  };
}

// Kalıcı 4 haneli kod: bir kez üretilir, böylece telefondaki yer imi/ana ekran kısayolu çalışmaya devam eder
export function kodAl(store, rastgele = Math.random) {
  let k = String(store.setting('telefonKod', ''));
  if (!/^\d{4}$/.test(k)) {
    k = ('0000' + Math.floor(rastgele() * 10000)).slice(-4);
    store.setSetting('telefonKod', k);
  }
  return k;
}

// Telefondaki "Liste bilgilerini yaz" formu: "Kaynak ekle" ekranının alanlarına yazılır; ekran açık değilse (oynatıcı dışında) açılır.
// Alanlar günlüğe yazılmaz (şifre içerir). Dönen: 'yazildi' | 'yok'
export function kaynakFormuDoldur(k, { ust = top, ac = open, bildir = (t) => toast(t, 3500) } = {}) {
  let t = ust();
  if (t && t.name === 'player') {
    bildir('Önce oynatıcıdan çıkın, sonra telefondan liste bilgisi gönderin');
    return 'yok';
  }
  if (!t || t.name !== 'addsource') {
    ac('addsource');
    t = ust();
  }
  if (!t || !t.kaynakDoldur) return 'yok';
  t.kaynakDoldur(k);
  return 'yazildi';
}

export const telefon = telefonYoklayici({
  pin: () => kodAl(ctx.store),
  uygula: (k) =>
    komutIsle(k, {
      doc: document,
      ust: top(),
      // Oynatıcı açıkken yeni yayın gelirse eskisinin üstüne yığılmaz: değiştirilir
      ac: (ad, arg) => {
        if (ad === 'player' && top() && top().name === 'player') pop();
        open(ad, arg);
      },
      youtube: (id, ad) => yolAc('sayfa', id, { ad, bildir: (t) => toast(t, 3500) }),
      bildir: (t) => toast(t, 3000),
      kaynak: kaynakFormuDoldur,
    }),
});
telefon.abone(() => {
  if (telefon.telefon()) toast('Telefon bağlandı', 2000);
});

// Açılışta: kullanıcı açtıysa ve TV'deyse yoklamayı başlatır
export function telefonuBaslat() {
  if (!varlik() || !ctx.store.setting('telefonKumanda', false) || telefon.bilgi()) return Promise.resolve(null); // bilgi varsa bir ekran zaten başlattı
  return telefon.baslat().catch((e) => {
    K.hata(e);
    return null;
  });
}
