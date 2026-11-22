// Fragman: sağlayıcının verdiği YouTube kimliği, yoksa YouTube araması. 2016 LG'de (Chromium 38) gömülü YouTube oynatılamaz;
// bu yüzden kimlik bulununca TV'nin kendi YouTube uygulaması doğrudan o videoyla açılır.
import { trailerIds, trailerTitle } from '../../www/js/cinemeta.js';
import { findTrailerOnYoutube } from '../../www/js/yt-search.js';
import { luna } from './luna.js';

export const YOUTUBE_UYGULAMA = 'youtube.leanback.v4';
// YouTube uygulamasının videoyu kabul ettiği contentTarget biçimi TV sürümüne göre değişir: bir sürümde "v=KİMLİK", başkasında tam adres ister;
// yanlış biçimde uygulama açılır ama video yerine YouTube ana sayfası gelir. Bu yüzden biçim Ayarlar › Fragman testi ile seçilir ve saklanır.
export const izleParam = (id) => 'v=' + encodeURIComponent(id);
export const BICIMLER = [
  ['tv', 'Tam adres: youtube.com/tv?v=…', (id) => 'https://www.youtube.com/tv?v=' + encodeURIComponent(id)],
  ['watch', 'İzle adresi: youtube.com/watch?v=…', (id) => 'https://www.youtube.com/watch?v=' + encodeURIComponent(id)],
  ['tvhash', 'Tam adres: youtube.com/tv#/watch?v=…', (id) => 'https://www.youtube.com/tv#/watch?v=' + encodeURIComponent(id)],
  ['v', 'Kısa: v=KİMLİK', izleParam],
];
export const VARSAYILAN_BICIM = 'tv';
export const TEST_VIDEO = 'jNQXAC9IVRw'; // Fragman testinde açılan kısa, kalıcı video
export const contentTarget = (id, bicim) => {
  const b = BICIMLER.filter((x) => x[0] === bicim)[0] || BICIMLER.filter((x) => x[0] === VARSAYILAN_BICIM)[0];
  return b[2](id);
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
async function youtubeKapat(l) {
  const yollar = ['closeByAppId', 'close'];
  for (let i = 0; i < yollar.length; i++) {
    const yol = yollar[i];
    try {
      const r = await l('luna://com.webos.applicationManager/' + yol, { id: YOUTUBE_UYGULAMA }, 5000);
      if (r && r.returnValue !== false) return true;
    } catch (e) {
      /* kapatılamadı: açmayı yine de dene */
    }
  }
  return false;
}

export async function youtubeAc(id, luna_ = luna, secenek = {}) {
  const ay = Object.assign({ bicim: VARSAYILAN_BICIM, kapat: true, bekle: 900 }, ayarOku(), secenek);
  if (ay.kapat !== false && (await youtubeKapat(luna_)) && ay.bekle > 0) await bekle(ay.bekle);
  const r = await luna_('luna://com.webos.applicationManager/launch', { id: YOUTUBE_UYGULAMA, params: { contentTarget: contentTarget(id, ay.bicim) } }, 15000);
  if (!r || r.returnValue === false) throw new Error((r && (r.errorText || r.errorCode)) || 'YouTube uygulaması açılamadı');
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
