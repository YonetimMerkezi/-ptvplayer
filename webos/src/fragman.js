// Fragman: sağlayıcının verdiği YouTube kimliği, yoksa YouTube araması. 2016 LG'de (Chromium 38) gömülü YouTube oynatılamaz;
// bu yüzden kimlik bulununca TV'nin kendi YouTube uygulaması doğrudan o videoyla açılır.
import { trailerIds, trailerTitle } from '../../www/js/cinemeta.js';
import { findTrailerOnYoutube } from '../../www/js/yt-search.js';
import { luna } from './luna.js';
import * as K from './log.js';

export const YOUTUBE_UYGULAMA = 'youtube.leanback.v4';
// YouTube uygulamasının videoyu kabul ettiği parametre biçimi TV sürümüne göre değişir. En yaygın bildirilen çalışan biçim contentTarget: "v=KİMLİK";
// yalın kimlik uygulamayı açar ama video başlamaz (ana sayfa kalır), tam adres bazı sürümlerde küçük pencere ya da çift yükleme yapar.
// Biçim Ayarlar › Fragman testi ile seçilir ve saklanır.
export const izleParam = (id) => 'v=' + encodeURIComponent(id);
// [kod, ad, değer(id), parametre adı ya da adları (varsayılan contentTarget)]
export const BICIMLER = [
  ['v', 'Kısa: v=KİMLİK (önerilen)', izleParam],
  ['hepsi', 'v=KİMLİK, contentTarget + contentId birlikte', izleParam, ['contentTarget', 'contentId']],
  ['tv', 'Tam adres: youtube.com/tv?v=…', (id) => 'https://www.youtube.com/tv?v=' + encodeURIComponent(id)],
  ['watch', 'İzle adresi: youtube.com/watch?v=…', (id) => 'https://www.youtube.com/watch?v=' + encodeURIComponent(id)],
  ['tvhash', 'Tam adres: youtube.com/tv#/watch?v=…', (id) => 'https://www.youtube.com/tv#/watch?v=' + encodeURIComponent(id)],
  ['tvhttp', 'Tam adres (http): youtube.com/tv?v=…', (id) => 'http://www.youtube.com/tv?v=' + encodeURIComponent(id)],
  ['cid', 'contentId: v=KİMLİK', izleParam, 'contentId'],
  ['cidid', 'contentId: yalın kimlik', (id) => String(id), 'contentId'],
  ['id', 'Yalın kimlik', (id) => String(id)],
];
export const VARSAYILAN_BICIM = 'v';
export const TEST_VIDEO = 'jNQXAC9IVRw'; // Fragman testinde açılan kısa, kalıcı video
const bicimBul = (bicim) => BICIMLER.filter((x) => x[0] === bicim)[0] || BICIMLER.filter((x) => x[0] === VARSAYILAN_BICIM)[0];
export const contentTarget = (id, bicim) => bicimBul(bicim)[2](id);
// YouTube'a gönderilen params nesnesi: { contentTarget: … } ya da biçime göre { contentId: … } (birden çok ad varsa hepsine aynı değer)
export const baslatParams = (id, bicim) => {
  const b = bicimBul(bicim);
  const adlar = Array.isArray(b[3]) ? b[3] : [b[3] || 'contentTarget'];
  const p = {};
  for (let i = 0; i < adlar.length; i++) p[adlar[i]] = b[2](id);
  return p;
};

// Son açma denemesinin ayrıntısı (TV'nin verdiği ham yanıtlar): Fragman testi ekranında gösterilir, kayda da yazılır
let sonTani = null;
export const sonDeneme = () => sonTani;
const ozet = (r) => {
  try {
    return JSON.stringify(r);
  } catch (e) {
    return String(r);
  }
};

// Ayarlar (seçilen biçim, YouTube'u önce kapatma) uygulama başlarken bağlanır; fragman modülü depoyu bilmez.
let ayarOku = () => ({});
export const ayarKaynagi = (f) => {
  ayarOku = f;
};

// Aynı yapım için aramayı tekrarlamamak için (oturum boyunca); bulunamayan ya da hata alan silinir
const bulunan = {};
let calisiyor = false;

// Katalog adından arama planı: "TR | Ad (2024)" → sorgu "Ad fragman", beklenen ad ve yıl
export function aramaPlani(it, info) {
  const yil = (info && info.year) || it.year || '';
  const t = trailerTitle(it.name, yil);
  const y = t.year || Number((/\b(?:19|20)\d{2}\b/.exec(String(yil)) || [])[0]) || 0;
  return { query: t.title ? t.title + ' fragman' : '', wanted: t.title ? [t.title] : [], year: y };
}

export async function fragmanKimlikleri(it, info, { net, ara = findTrailerOnYoutube } = {}) {
  const hazir = trailerIds(null, (info && info.trailer) || it.trailer);
  if (hazir.length) return hazir;
  const p = aramaPlani(it, info);
  if (!p.query) return [];
  const anahtar = p.query + '|' + p.year;
  if (!bulunan[anahtar]) {
    const s = Promise.resolve(ara({ net, query: p.query, wanted: p.wanted, year: p.year })).then((picks) => {
      if (picks === null || picks === undefined) throw new Error('YouTube aramasına ulaşılamadı');
      return picks.filter((x) => x && x.good && x.id).map((x) => x.id);
    });
    bulunan[anahtar] = s;
    s.then(
      (l) => {
        if (!l.length) delete bulunan[anahtar];
      },
      () => {
        delete bulunan[anahtar];
      },
    );
  }
  return bulunan[anahtar];
}

const bekle = (ms) => new Promise((coz) => setTimeout(coz, ms));

// YouTube zaten (arka planda) açıksa webOS yeni parametreyi yok sayıp ana sayfayı gösterebilir: önce kapatılır, sonra videoyla açılır.
// Kapatma başarısız olsa da açma denenir (YouTube kapalıysa kapatma hata verir).
async function youtubeKapat(l, tani) {
  const yollar = ['closeByAppId', 'close'];
  for (let i = 0; i < yollar.length; i++) {
    const yol = yollar[i];
    try {
      const r = await l('luna://com.webos.applicationManager/' + yol, { id: YOUTUBE_UYGULAMA }, 5000);
      tani.adimlar.push(yol + ' → ' + ozet(r));
      if (r && r.returnValue !== false) return true;
    } catch (e) {
      tani.adimlar.push(yol + ' → hata: ' + (e && e.message ? e.message : e));
      /* kapatılamadı: açmayı yine de dene */
    }
  }
  return false;
}

// secenek / ayar: bicim (BICIMLER kodu), kapat (önce YouTube'u kapat), ikinci (kapatılamadıysa açma çağrısını bir kez daha yinele), bekle (ms).
// Açma çağrısı varsayılan olarak TEK kez yapılır: webOS aynı uygulamaya her launch çağrısında uygulamayı yeniden başlatır; ardışık iki çağrı
// YouTube'u videodan ana sayfaya düşürebilir.
export async function youtubeAc(id, luna_ = luna, secenek = {}) {
  const ay = Object.assign({ bicim: VARSAYILAN_BICIM, kapat: true, ikinci: false, bekle: 1500 }, ayarOku(), secenek);
  const params = baslatParams(id, ay.bicim);
  const tani = (sonTani = { bicim: ay.bicim, params, adimlar: [] });
  let kapandi = false;
  if (ay.kapat !== false) {
    kapandi = await youtubeKapat(luna_, tani);
    if (kapandi && ay.bekle > 0) await bekle(ay.bekle);
  }
  const ac = async () => {
    const r = await luna_('luna://com.webos.applicationManager/launch', { id: YOUTUBE_UYGULAMA, params }, 15000);
    tani.adimlar.push('launch ' + ozet(params) + ' → ' + ozet(r));
    if (!r || r.returnValue === false) throw new Error((r && (r.errorText || r.errorCode)) || 'YouTube uygulaması açılamadı');
  };
  try {
    await ac();
    // İsteğe bağlı: kapatılamadıysa YouTube arka planda açık olabilir ve ilk çağrıdaki parametreyi kaçırabilir; aynı çağrı bir kez daha yapılır
    if (ay.ikinci && !kapandi && ay.bekle > 0) {
      await bekle(Math.round(ay.bekle * 1.6));
      await ac();
    }
  } catch (e) {
    tani.hata = e && e.message ? e.message : String(e);
    K.uyar('YouTube açılamadı: ' + tani.hata + ' | ' + tani.adimlar.join(' | '));
    throw e;
  }
  K.bilgi('YouTube açıldı (' + ay.bicim + '): ' + tani.adimlar.join(' | '));
  return true;
}

// Ekrandan çağrılan tek adım: bul → aç. bildir(metin): kullanıcıya kısa ileti. Dönen: açıldı mı.
export async function fragmanOynat(it, info, { net, bildir = () => {}, ara, luna: l } = {}) {
  if (calisiyor) return false;
  calisiyor = true;
  try {
    bildir('Fragman aranıyor…');
    let ids;
    try {
      ids = await fragmanKimlikleri(it, info, { net, ara });
    } catch (e) {
      bildir('Fragman aranamadı: ' + (e && e.message ? e.message : e));
      return false;
    }
    if (!ids.length) {
      bildir('Bu yapım için fragman bulunamadı');
      return false;
    }
    try {
      await youtubeAc(ids[0], l);
    } catch (e) {
      bildir('YouTube açılamadı: ' + (e && e.message ? e.message : e));
      return false;
    }
    bildir('Fragman TV’nin YouTube uygulamasında açılıyor…');
    return true;
  } finally {
    calisiyor = false;
  }
}
