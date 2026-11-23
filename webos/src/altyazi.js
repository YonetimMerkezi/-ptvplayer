// Harici altyazı (webOS). 2016 LG'de gömülü altyazı uygulamaya verilmez (yalnız harici WebVTT desteklenir); bu yüzden
// film/dizi için IMDb kimliğiyle altyazı aranır, SRT/VTT metni ayrıştırılır ve uygulamanın kendi katmanında gösterilir.
// Kaynak: Stremio altyazı eklentisi protokolü (/subtitles/{tür}/{kimlik}.json → { subtitles: [{ id, url, lang }] }).
import { CINEMETA, trailerTitle } from '../../www/js/cinemeta.js';
import { cleanTitle } from '../../www/js/titleclean.js';

export const ALTYAZI_KAYNAK = 'https://opensubtitles-v3.strem.io';

// Dil kodları: 2 harfli → eklentinin kullandığı 3 harfli (ISO 639-2) biçim
const IKILI = { tr: 'tur', en: 'eng', de: 'ger', deu: 'ger', fr: 'fre', fra: 'fre', es: 'spa', it: 'ita', ru: 'rus', ar: 'ara', pt: 'por', nl: 'dut', nld: 'dut', pl: 'pol', el: 'gre', ell: 'gre', ro: 'rum', ron: 'rum', bg: 'bul', fa: 'per', fas: 'per', he: 'heb', sv: 'swe', cs: 'cze', ces: 'cze', hu: 'hun', ku: 'kur' };
export const DIL_ADI = { tur: 'Türkçe', eng: 'İngilizce', ger: 'Almanca', fre: 'Fransızca', spa: 'İspanyolca', ita: 'İtalyanca', rus: 'Rusça', ara: 'Arapça', por: 'Portekizce', dut: 'Felemenkçe', pol: 'Lehçe', gre: 'Yunanca', rum: 'Romence', bul: 'Bulgarca', per: 'Farsça', heb: 'İbranice', swe: 'İsveççe', cze: 'Çekçe', hun: 'Macarca', kur: 'Kürtçe' };

export function dilKodu(lang) {
  const k = String(lang || '').toLowerCase().trim();
  if (!k) return '';
  if (IKILI[k]) return IKILI[k];
  if (k.length > 3 && IKILI[k.slice(0, 2)]) return IKILI[k.slice(0, 2)]; // "tr-TR", "pt-br"
  return k.slice(0, 3);
}

// Ad karşılaştırması için: küçük harf, aksansız, yalnız harf/rakam
const ASCII = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u', 'é': 'e', 'è': 'e', 'ê': 'e', 'á': 'a', 'à': 'a', 'ä': 'a', 'ñ': 'n', 'ó': 'o', 'ô': 'o', 'ú': 'u', 'í': 'i', '̇': '' };
export const katla = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^\u0000-\u007f]/g, (c) => (ASCII[c] !== undefined ? ASCII[c] : ''))
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const yilOf = (m) => Number((/\b(?:19|20)\d{2}\b/.exec(String((m && (m.year || m.releaseInfo)) || '')) || [])[0]) || 0;

// Oynatılan öğeden altyazı aranabilir mi? Canlı yayında hayır. Bölümde sezon ve bölüm numarası şart.
export function videoKimligi(it) {
  if (!it) return null;
  if (it.kind === 'episode') {
    const bolum = Number(it.episodeNum) || 0;
    const sezon = Number(it.season) || 0;
    if (!it.seriesName || !sezon || !bolum) return null;
    return { tur: 'series', ad: String(it.seriesName), yil: 0, sezon, bolum };
  }
  if (it.kind === 'movie' && it.name) return { tur: 'movie', ad: String(it.name), yil: Number(it.year) || 0, sezon: 0, bolum: 0 };
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// IMDb kimliği çözümü (Türkçe adlı film/dizi için). Sıra, güvenilirliğe göre:
//   1. kullanıcının daha önce seçtiği yapım (kalıcı hafıza)
//   2. sağlayıcının verdiği IMDb kimliği
//   3. sağlayıcının verdiği TMDB kimliği ≡ Cinemeta kaydındaki moviedb_id
//   4. adı birebir tutan yapım (katalog adı ya da sağlayıcının özgün adı)
//   5. IMDb arama (Türkçe AKA adlarını tanır: "Esaretin Bedeli" → The Shawshank Redemption) ve Cinemeta aynı yapımı
//      gösteriyorsa; ya da yıl tek bir yapımla uyuşuyorsa
//   6. hâlâ belirsizse: kullanıcıya aday listesi (seçim kalıcı hafızaya yazılır)
// ---------------------------------------------------------------------------------------------------------------
export const IMDB_ARAMA = 'https://v3.sg.media-imdb.com/suggestion/x/';
const KIMLIK = /^tt\d{5,10}$/;
const TUR_IMDB = { movie: 'movie', tvMovie: 'movie', video: 'movie', tvSeries: 'series', tvMiniSeries: 'series' };

const imdbOnbellek = {}; // oturum: kesin eşleşen aramalar (anahtar → kimlik); sağlayıcı kimliği ve kullanıcı seçimi bunun önüne geçer
const imdbSecim = {}; // oturum: kullanıcının seçtiği yapımlar (kalıcı hafızanın oturum kopyası)
const imdbAramaOnbellek = {};
const aramaOnbellek = {};
const metaOnbellek = {};
const imdbBilgiDefteri = {}; // IMDb kimliği → { ad, yil } (altyazı listesinde "hangi yapım" gösterilsin)
export const imdbBilgi = (id) => imdbBilgiDefteri[id] || null;
const bilgiYaz = (id, ad, yil) => {
  if (KIMLIK.test(String(id)) && ad && !imdbBilgiDefteri[id]) sinirli(imdbBilgiDefteri, id, { ad: String(ad), yil: Number(yil) || 0 });
};
const sahip = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Önbelleğin sınırsız büyümemesi için (TV belleği az)
function sinirli(o, k, v) {
  const anahtarlar = Object.keys(o);
  if (anahtarlar.length >= 200) delete o[anahtarlar[0]];
  o[k] = v;
}

// Aranacak adlar: sağlayıcının özgün adları, katalog adı, ayrıca "Ad: Alt başlık" → "Ad" (yinelenenler elenir)
function aramaAdlari(v, ipucu) {
  const t = trailerTitle(v.ad, v.yil);
  const yil = Number(v.yil) || t.year || (ipucu && ipucu.yil) || 0;
  const ham = ((ipucu && ipucu.adlar) || []).concat([t.title]); // özgün ad önce: en güvenilir arama
  const adlar = [];
  const gorulen = {};
  const ekle = (a) => {
    const k = katla(a);
    if (!a || k.length < 2 || gorulen[k]) return;
    gorulen[k] = true;
    adlar.push(a);
  };
  for (let i = 0; i < ham.length; i++) {
    const a = trailerTitle(ham[i], yil).title;
    ekle(a);
  }
  for (let i = 0; i < ham.length; i++) {
    const a = trailerTitle(ham[i], yil).title;
    const bas = a.split(/\s*[:–—]\s*|\s+-\s+/)[0];
    if (bas !== a && katla(bas).length >= 4) ekle(bas);
  }
  return { adlar, yil, anahtar: v.tur + '|' + katla(t.title) + '|' + (v.tur === 'movie' ? yil : 0) };
}

// Cinemeta araması (Türkçe adı da tanır ama sonuçta özgün/İngilizce adı verir). Hata fırlatılır, önbelleğe yazılmaz.
async function cinemetaAra(net, tur, ad) {
  const k = tur + '|' + katla(ad);
  if (sahip(aramaOnbellek, k)) return aramaOnbellek[k];
  const r = await net.json(CINEMETA + '/catalog/' + tur + '/top/search=' + encodeURIComponent(ad) + '.json', { timeoutMs: 15000 });
  const m = r && Array.isArray(r.metas) ? r.metas : [];
  for (let i = 0; i < m.length; i++) bilgiYaz(String((m[i] && (m[i].imdb_id || m[i].id)) || ''), m[i] && m[i].name, yilOf(m[i]));
  sinirli(aramaOnbellek, k, m);
  return m;
}

// IMDb öneri araması: [{ id, ad, yil, tur }] (yalnız film/dizi; bölüm, kısa film, oyun, kişi elenir)
async function imdbAra(net, ad) {
  const k = katla(ad);
  if (sahip(imdbAramaOnbellek, k)) return imdbAramaOnbellek[k];
  const q = String(ad).replace(/İ/g, 'i').toLowerCase().replace(/[\/?#%]/g, ' ').trim();
  const r = await net.json(IMDB_ARAMA + encodeURIComponent(q) + '.json', { timeoutMs: 15000 });
  const d = r && Array.isArray(r.d) ? r.d : [];
  const cikis = [];
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    const tur = TUR_IMDB[x && x.qid];
    if (!tur || !KIMLIK.test(String((x && x.id) || ''))) continue;
    cikis.push({ id: x.id, ad: String(x.l || x.id), yil: Number(x.y) || 0, tur });
    bilgiYaz(x.id, x.l, x.y);
  }
  sinirli(imdbAramaOnbellek, k, cikis);
  return cikis;
}

// Cinemeta kaydındaki TMDB kimliği (sağlayıcının kimliğiyle doğrulamak için). Hata: ''.
async function tmdbOf(net, tur, id) {
  const k = tur + '|' + id;
  if (sahip(metaOnbellek, k)) return metaOnbellek[k];
  try {
    const r = await net.json(CINEMETA + '/meta/' + tur + '/' + id + '.json', { timeoutMs: 15000 });
    const t = String((r && r.meta && r.meta.moviedb_id) || '');
    if (r && r.meta) bilgiYaz(id, r.meta.name, yilOf(r.meta));
    sinirli(metaOnbellek, k, t);
    return t;
  } catch (e) {
    return '';
  }
}

// Adaylar: { id, ad, yil, tur, imdb: IMDb sırası (-1 yok), cin: Cinemeta sırası (-1 yok), tmdb }
function birlestir(liste, imdb, cin, tur) {
  const ara = (id) => {
    for (let i = 0; i < liste.length; i++) if (liste[i].id === id) return liste[i];
    return null;
  };
  for (let i = 0; i < imdb.length; i++) {
    const x = imdb[i];
    if (x.tur !== tur) continue;
    const m = ara(x.id);
    if (m) {
      if (m.imdb < 0) m.imdb = i;
      m.yil = m.yil || x.yil;
    } else liste.push({ id: x.id, ad: x.ad, yil: x.yil, tur, imdb: i, cin: -1, tmdb: '' });
  }
  for (let i = 0; i < cin.length; i++) {
    const x = cin[i];
    const id = String((x && (x.imdb_id || x.id)) || '');
    if (!KIMLIK.test(id)) continue;
    const m = ara(id);
    const tmdb = String((x && x.moviedb_id) || '');
    if (m) {
      if (m.cin < 0) m.cin = i;
      m.yil = m.yil || yilOf(x);
      m.tmdb = m.tmdb || tmdb;
    } else liste.push({ id, ad: String(x.name || id), yil: yilOf(x), tur, imdb: -1, cin: i, tmdb });
  }
}

const yilUyar = (a, yil) => !yil || !a.yil || Math.abs(a.yil - yil) <= 1;

// Aday listesinden kesin seçim: { id, kaynak } ya da null (belirsiz)
function sec(liste, adlar, yil, tmdb) {
  const aday = liste.filter((a) => yilUyar(a, yil));
  if (tmdb) {
    const t = aday.filter((a) => a.tmdb === tmdb);
    if (t.length === 1) return { id: t[0].id, kaynak: 'tmdb' };
  }
  const anahtarlar = adlar.map((a) => katla(a));
  const hedefler = adlar.map((a) => cleanTitle(a, yil).key);
  const tam = aday.filter((a) => {
    const k = cleanTitle(a.ad, a.yil || yil).key;
    return anahtarlar.indexOf(katla(a.ad)) >= 0 || (k && hedefler.indexOf(k) >= 0);
  });
  if (tam.length === 1) return { id: tam[0].id, kaynak: 'tam-ad' };
  if (tam.length > 1 && yil) {
    const y = tam.filter((a) => a.yil && Math.abs(a.yil - yil) <= 1);
    if (y.length === 1) return { id: y[0].id, kaynak: 'tam-ad' };
  }
  // IMDb'nin ilk sırası ile Cinemeta'nın aynı yapımı göstermesi
  const imdbIlk = aday.filter((a) => a.imdb >= 0).sort((x, y) => x.imdb - y.imdb)[0];
  if (imdbIlk && imdbIlk.cin >= 0) return { id: imdbIlk.id, kaynak: 'capraz' };
  if (yil) {
    // IMDb'nin ilk beş sonucundan yılı uyan tek yapım; ±1 yıl sapma payı var ama tam yıl tutan varsa o öne geçer
    const y = aday.filter((a) => a.imdb >= 0 && a.imdb < 5 && a.yil && Math.abs(a.yil - yil) <= 1);
    const tamYil = y.filter((a) => a.yil === yil);
    if (tamYil.length === 1) return { id: tamYil[0].id, kaynak: 'yil' };
    if (y.length === 1) return { id: y[0].id, kaynak: 'yil' };
  }
  const imdbli = aday.filter((a) => a.imdb >= 0);
  if (imdbli.length === 1 && imdbli[0].imdb === 0 && aday.length === 1) return { id: imdbli[0].id, kaynak: 'tek' };
  return null;
}

// Kalıcı hafıza: seçilen eşleşmeler yeniden başlatmadan sonra da kalır. oku()/yaz(nesne) depoya bağlanır.
export function kaliciHafiza(oku, yaz, azami) {
  const en = azami || 400;
  const al = () => {
    const m = oku();
    return m && m.v && Array.isArray(m.s) ? m : { v: {}, s: [] };
  };
  return {
    al: (k) => String(al().v[k] || ''),
    koy(k, id) {
      const m = al();
      if (m.v[k] === id) return;
      if (!sahip(m.v, k)) m.s.push(k);
      m.v[k] = id;
      while (m.s.length > en) delete m.v[m.s.shift()];
      yaz(m);
    },
  };
}

// Adayları toplar. erken: kesin eşleşme bulunur bulunmaz { id, kaynak } döner. Aksi halde aday listesi döner.
// Ağ hatası, hiçbir kaynak yanıt vermediyse fırlatılır; kısmi hata yok sayılır.
async function topla(net, v, a, tmdbHam, erken) {
  const tmdb = /^\d{1,9}$/.test(String(tmdbHam || '')) ? String(tmdbHam) : '';
  const liste = [];
  let hata = null;
  let yanit = 0;
  for (let i = 0; i < a.adlar.length; i++) {
    const ad = a.adlar[i];
    const [im, ci] = await Promise.all([
      imdbAra(net, ad).then((x) => (yanit++, x), (e) => ((hata = e), [])),
      cinemetaAra(net, v.tur, ad).then((x) => (yanit++, x), (e) => ((hata = e), [])),
    ]);
    birlestir(liste, im, ci, v.tur);
    const r = erken ? sec(liste, a.adlar, a.yil, tmdb) : null;
    if (r) return r;
  }
  if (!yanit && hata) throw hata;
  if (tmdb) {
    // TMDB kimliği Cinemeta aramasında görünmediyse en olası adayların kaydı sorulur
    const bak = liste.filter((x) => yilUyar(x, a.yil) && !x.tmdb).slice(0, 4);
    for (let i = 0; i < bak.length; i++) bak[i].tmdb = await tmdbOf(net, v.tur, bak[i].id);
    const t = liste.filter((x) => x.tmdb === tmdb && yilUyar(x, a.yil));
    if (t.length === 1 && erken) return { id: t[0].id, kaynak: 'tmdb' };
    if (t.length === 1) liste.unshift(liste.splice(liste.indexOf(t[0]), 1)[0]);
  }
  const uyan = liste.filter((x) => yilUyar(x, a.yil));
  const digeri = liste.filter((x) => !yilUyar(x, a.yil));
  const sirali = uyan.concat(digeri).slice(0, 6);
  return { id: '', liste: sirali.map((x) => ({ id: x.id, ad: x.ad, yil: x.yil })), adlar: a.adlar, yil: a.yil };
}

// ipucu: { imdb, tmdb, adlar: [özgün adlar], yil }. kalici: kaliciHafiza(...) (isteğe bağlı).
// Dönen: { id, kaynak } ya da belirsizse { id: '', liste: [{ id, ad, yil }], adlar, yil }.
export async function imdbCoz(net, v, ipucu, kalici) {
  const ip = ipucu || {};
  const a = aramaAdlari(v, ip);
  // 1) kullanıcının seçtiği yapım (en güvenilir; "Başka yapım seç" ile değiştirilebilir) 2) sağlayıcının IMDb kimliği
  const secilen = (kalici && kalici.al(a.anahtar)) || (sahip(imdbSecim, a.anahtar) ? imdbSecim[a.anahtar] : '');
  if (KIMLIK.test(secilen)) return { id: secilen, kaynak: 'kayit' };
  if (KIMLIK.test(String(ip.imdb || ''))) return { id: ip.imdb, kaynak: 'saglayici' };
  if (sahip(imdbOnbellek, a.anahtar)) return { id: imdbOnbellek[a.anahtar], kaynak: 'onbellek' };
  const r = await topla(net, v, a, ip.tmdb, true);
  if (r.id) sinirli(imdbOnbellek, a.anahtar, r.id); // otomatik eşleşme yalnız bu oturumda önbelleklenir; kalıcı kayıt yalnız kullanıcı seçimidir
  return r;
}

// Kimliği belli bir yapımın adı ve yılı (sağlayıcı/kalıcı kimlikte arama yapılmadığı için Cinemeta üstverisinden). Yoksa null.
export async function imdbAdi(net, tur, id) {
  if (!imdbBilgi(id)) await tmdbOf(net, tur, id);
  return imdbBilgi(id);
}

// Kullanıcı "başka yapım" derse: kayıtlı eşleşmeye bakmadan aday listesi { id: '', liste, adlar, yil }
export async function imdbAdaylari(net, v, ipucu) {
  const ip = ipucu || {};
  return topla(net, v, aramaAdlari(v, ip), ip.tmdb, false);
}

// Kullanıcının seçtiği yapım hatırlanır (oturumda ve kalıcı hafızada); başka yapım seçerse yenisi eskinin yerine geçer
export function imdbHatirla(v, ipucu, id, kalici) {
  const a = aramaAdlari(v, ipucu);
  sinirli(imdbSecim, a.anahtar, id);
  if (kalici) kalici.koy(a.anahtar, id);
}

// Eklenti yanıtından seçim listesi: Türkçe önce, sonra İngilizce, sonra öteki diller (dil başına 1)
export function listeHazirla(subs) {
  const gruplar = {};
  const sira = [];
  for (let i = 0; i < (Array.isArray(subs) ? subs.length : 0); i++) {
    const s = subs[i];
    if (!s || !/^https?:\/\//i.test(String(s.url || ''))) continue;
    const dil = dilKodu(s.lang);
    if (!dil) continue;
    if (!gruplar[dil]) {
      gruplar[dil] = [];
      sira.push(dil);
    }
    gruplar[dil].push(String(s.url));
  }
  const oncelik = (d) => (d === 'tur' ? 0 : d === 'eng' ? 1 : 2);
  sira.sort((a, b) => oncelik(a) - oncelik(b) || (DIL_ADI[a] || a).localeCompare(DIL_ADI[b] || b));
  const cikis = [];
  for (let i = 0; i < sira.length; i++) {
    const dil = sira[i];
    const en = dil === 'tur' ? 6 : dil === 'eng' ? 3 : 1;
    const l = gruplar[dil].slice(0, en);
    for (let j = 0; j < l.length; j++) cikis.push({ url: l[j], dil, ad: (DIL_ADI[dil] || dil.toUpperCase()) + (l.length > 1 ? ' ' + (j + 1) : '') });
  }
  return cikis.slice(0, 12);
}

export async function altyaziListesi(net, v, imdbId) {
  const id = v.tur === 'series' ? imdbId + ':' + v.sezon + ':' + v.bolum : imdbId;
  const r = await net.json(ALTYAZI_KAYNAK + '/subtitles/' + v.tur + '/' + id + '.json', { timeoutMs: 20000 });
  return listeHazirla(r && r.subtitles);
}

// SRT ve WebVTT metni → [{ b, s, m }] (başlangıç ms, bitiş ms, metin), başlangıca göre sıralı
const ZAMAN = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
const ms = (h, m, s, f) => ((Number(h) || 0) * 3600 + Number(m) * 60 + Number(s)) * 1000 + Math.round(Number('0.' + f) * 1000);
const VARLIK = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&apos;': "'" };
export function altyaziAyristir(metin) {
  const bloklar = String(metin || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const cikis = [];
  for (let i = 0; i < bloklar.length; i++) {
    const satirlar = bloklar[i].split('\n');
    let k = -1;
    for (let j = 0; j < satirlar.length && k < 0; j++) if (satirlar[j].indexOf('-->') >= 0) k = j;
    if (k < 0) continue;
    const z = ZAMAN.exec(satirlar[k]);
    if (!z) continue;
    const m = satirlar
      .slice(k + 1)
      .join('\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\{\\[^}]*\}/g, '')
      .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (x) => VARLIK[x] || x)
      .replace(/[ \t]+\n/g, '\n')
      .trim();
    if (!m) continue;
    const b = ms(z[1], z[2], z[3], z[4]);
    const s = ms(z[5], z[6], z[7], z[8]);
    if (s > b) cikis.push({ b, s, m });
  }
  cikis.sort((x, y) => x.b - y.b);
  return cikis;
}

// t (ms) anında görünmesi gereken metin; üst üste binen satırlar alt alta
export function aktifMetin(cues, t) {
  let lo = 0;
  let hi = cues.length - 1;
  let son = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].b <= t) {
      son = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const m = [];
  for (let i = son; i >= 0 && i > son - 6; i--) if (cues[i].s > t) m.unshift(cues[i].m);
  return m.join('\n');
}
