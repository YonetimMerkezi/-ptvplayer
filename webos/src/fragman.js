// Fragman: sağlayıcının verdiği YouTube kimliği, yoksa YouTube araması. 2016 LG'de (Chromium 38) gömülü YouTube oynatılamaz;
// bu yüzden kimlik bulununca TV'nin kendi YouTube uygulaması doğrudan o videoyla açılır.
import { trailerIds, trailerTitle } from '../../www/js/cinemeta.js';
import { findTrailerOnYoutube } from '../../www/js/yt-search.js';
import { luna } from './luna.js';

export const YOUTUBE_UYGULAMA = 'youtube.leanback.v4';
// YouTube uygulaması contentTarget'ı "youtube.com/tv?" sorgusuna ekler: değer "v=KİMLİK" olmalı. Tam adres ya da yalın kimlik
// verilirse uygulama açılır ama video yerine YouTube ana sayfası gelir (webosbrew/youtube-webos belgesindeki biçim).
export const izleParam = (id) => 'v=' + encodeURIComponent(id);

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

export async function youtubeAc(id, luna_ = luna) {
  const r = await luna_('luna://com.webos.applicationManager/launch', { id: YOUTUBE_UYGULAMA, params: { contentTarget: izleParam(id) } }, 15000);
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
