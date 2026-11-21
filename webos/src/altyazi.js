// Harici altyazı (webOS). 2016 LG'de gömülü altyazı uygulamaya verilmez (yalnız harici WebVTT desteklenir); bu yüzden
// film/dizi için IMDb kimliğiyle altyazı aranır, SRT/VTT metni ayrıştırılır ve uygulamanın kendi katmanında gösterilir.
// Kaynak: Stremio altyazı eklentisi protokolü (/subtitles/{tür}/{kimlik}.json → { subtitles: [{ id, url, lang }] }).
import { CINEMETA, trailerTitle } from '../../www/js/cinemeta.js';
import { cleanTitle } from '../../www/js/titleclean.js';
import { fuzzyFind } from '../../www/js/title-match.js';

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

// Cinemeta arama sonucundan IMDb kimliği: önce temizlenmiş tam ad, sonra belirsizliği
// reddeden yüksek eşikli başlık eşleştirmesi. Yıl çakışmaları yanlış filmi engeller.
export function imdbSec(metas, baslik, yil) {
  if (!baslik || !Array.isArray(metas)) return '';
  const kayitlar = [];
  const ekle = (m, ad) => {
    const id = String((m && (m.imdb_id || m.id)) || '');
    const ct = cleanTitle(ad, yilOf(m) || yil);
    if (!/^tt\d+$/.test(id) || !ct.key) return;
    const y = yilOf(m) || ct.year || 0;
    if (yil && y && Math.abs(y - yil) > 1) return;
    kayitlar.push({ id, ad: ct.title, year: y });
  };
  for (let i = 0; i < metas.length; i++) {
    const m = metas[i];
    if (!m) continue;
    ekle(m, m.name);
    if (m.original_name && m.original_name !== m.name) ekle(m, m.original_name);
  }
  const hedef = cleanTitle(baslik, yil);
  if (!hedef.key) return '';
  const tam = kayitlar.filter((x) => cleanTitle(x.ad, x.year).key === hedef.key);
  if (tam.length) {
    const ids = Array.from(new Set(tam.map((x) => x.id)));
    return ids.length === 1 ? ids[0] : '';
  }
  const dizin = new Map();
  for (let i = 0; i < kayitlar.length; i++) {
    const k = cleanTitle(kayitlar[i].ad, kayitlar[i].year).key;
    if (!k) continue;
    if (!dizin.has(k)) dizin.set(k, []);
    dizin.get(k).push({ it: kayitlar[i], year: kayitlar[i].year });
  }
  const es = fuzzyFind(dizin, hedef.title, yil || hedef.year || 0);
  return es && es.it ? es.it.id : '';
}

const imdbOnbellek = {};
// Dönen: IMDb kimliği ya da '' (bulunamadı). Ağ hatası fırlatılır ve önbelleğe yazılmaz.
export async function imdbBul(net, v, ekAdlar) {
  const t = trailerTitle(v.ad, v.yil);
  const yil = v.tur === 'movie' ? t.year || v.yil || 0 : 0;
  const anahtar = v.tur + '|' + katla(t.title) + '|' + yil;
  if (Object.prototype.hasOwnProperty.call(imdbOnbellek, anahtar)) return imdbOnbellek[anahtar];
  const adlar = [t.title];
  const ek = ekAdlar || [];
  for (let i = 0; i < ek.length; i++) {
    const a = trailerTitle(ek[i], yil).title;
    if (a && adlar.indexOf(a) < 0) adlar.push(a);
  }
  let id = '';
  for (let i = 0; i < adlar.length && !id; i++) {
    if (!adlar[i]) continue;
    const r = await net.json(CINEMETA + '/catalog/' + v.tur + '/top/search=' + encodeURIComponent(adlar[i]) + '.json', { timeoutMs: 15000 });
    id = imdbSec(r && r.metas, adlar[i], yil);
  }
  imdbOnbellek[anahtar] = id;
  return id;
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
