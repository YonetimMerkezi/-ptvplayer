// TV rehberinde türü olmayan programın film olup olmadığını program adını veri kaynaklarında arayarak bulur.
// Rehber kaynaklarının çoğu tür vermez (ücretsiz kaynaklarda programların ~%98'i boş); ad farklı dilde (Türkçe dublaj adı) bile olsa:
//  1) kullanıcının film kütüphanesi (yerel, anında);  2) Wikidata'da Türkçe adla arama (açıklamadan film / dizi ayrımı);
//  3) Cinemeta'da (IMDb) adla arama;  4) adı İngilizceye çevirip Cinemeta'da arama.
// Yalnız BİREBİR ad eşleşmesi sayılır; hem film hem dizi çıkarsa (belirsiz) film sayılmaz. Sonuçlar önbelleğe yazılır.
import { cleanTitle } from './titleclean.js';
import { CINEMETA } from './cinemeta.js';
import { WD_API } from './tr-names.js';
import { WIKI_UA } from './wdqs.js';
import { TRANSLATE_URL, parseTranslation } from './translate.js';

export const FILM_TTL = 60 * 86400000; // film / dizi kararı uzun süre değişmez
export const NONE_TTL = 3 * 86400000; // hiçbir kaynakta bulunamayan ad bir süre sonra yeniden denenir
const MIN_TRANSLATED_LEN = 8; // çeviriyle aramada tek/kısa sözcük ("Aile" → "Family") yanlış eşleşir

const keyCache = new Map();
export function keyOf(title) {
  const s = String(title || '');
  let k = keyCache.get(s);
  if (k === undefined) {
    k = cleanTitle(s).key || '';
    if (keyCache.size > 4000) keyCache.clear();
    keyCache.set(s, k);
  }
  return k;
}

// Arama metni: TÜMÜ BÜYÜK yazılmış rehber adları küçültülür (arama büyük/küçük harfe duyarlı olabilir)
export function searchText(title) {
  const t = cleanTitle(title).title || String(title || '').trim();
  if (t !== t.toLocaleLowerCase('tr-TR') && t === t.toLocaleUpperCase('tr-TR')) {
    // Türkçeye özgü büyük harf (İ Ş Ğ Ü Ö Ç) varsa Türkçe kuralıyla ("İKİ" → "iki"); yoksa genel kural ("SPIDER-MAN" → "spider-man", ı değil)
    return /[İŞĞÜÖÇ]/.test(t) ? t.toLocaleLowerCase('tr-TR') : t.toLowerCase();
  }
  return t;
}

// Wikidata açıklaması (İngilizce): dizi/program mı, film mi
const SERIES_DESC = /\b(television|tv|web|animated|anime|streaming)\s+(series|show|program(?:me)?)\b|\bminiseries\b|\bsitcom\b|\bsoap opera\b|\btelenovela\b|\btalk show\b|\bgame show\b|\breality\b|\bepisode\b|\bseason\b|\bpodcast\b/i;
const FILM_DESC = /\b(film|movie)\b/i;
export function kindOfDescription(description) {
  const s = String(description || '');
  if (SERIES_DESC.test(s)) return 'series';
  if (FILM_DESC.test(s)) return 'film';
  return '';
}

// İki sonucu (film var / dizi var) karara çevirir: yalnız biri varsa o; ikisi de varsa belirsiz → 'none'; hiçbiri yoksa '' (bilgi yok)
const decide = (film, series) => (film && !series ? 'film' : series && !film ? 'series' : film && series ? 'none' : '');

// Wikidata wbsearchentities yanıtı → karar. Etiket ya da eşleşen takma ad, program adıyla birebir aynı olmalı; yıl varsa açıklamadaki yıl ipucudur.
export function wikidataVerdict(json, title) {
  const want = keyOf(title);
  const year = cleanTitle(title).year;
  const list = json && Array.isArray(json.search) ? json.search : [];
  const hits = list.filter((x) => x && [x.label, x.match && x.match.text].some((n) => n && keyOf(n) === want));
  let film = hits.filter((h) => kindOfDescription(h.description) === 'film');
  let series = hits.filter((h) => kindOfDescription(h.description) === 'series');
  if (year && film.length && series.length) {
    const sameYear = (h) => String(h.description || '').includes(String(year));
    if (film.some(sameYear) && !series.some(sameYear)) series = [];
    else if (series.some(sameYear) && !film.some(sameYear)) film = [];
  }
  return decide(film.length > 0, series.length > 0);
}

// Cinemeta arama yanıtları (film ve dizi kataloğu) → karar; adlar birebir, yıl varsa ±1
export function cinemetaVerdict(movieJson, seriesJson, title) {
  const want = keyOf(title);
  const year = cleanTitle(title).year;
  const has = (j) => (j && Array.isArray(j.metas) ? j.metas : []).some((m) => {
    if (!m || keyOf(m.name) !== want) return false;
    const y = Number(String(m.releaseInfo || m.year || '').slice(0, 4));
    return !year || !y || Math.abs(y - year) <= 1;
  });
  return decide(has(movieJson), has(seriesJson));
}

const wikidataUrl = (q) => `${WD_API}?action=wbsearchentities&search=${encodeURIComponent(q)}&language=tr&uselang=en&type=item&limit=10&format=json&origin=*`;
const cinemetaUrl = (type, q) => `${CINEMETA}/catalog/${type}/top/search=${encodeURIComponent(q)}.json`;

async function viaWikidata(net, title) {
  return wikidataVerdict(await net.json(wikidataUrl(searchText(title)), { fast: true, headers: { 'User-Agent': WIKI_UA } }), title);
}

async function viaCinemeta(net, name, title) {
  const get = (type) => net.json(cinemetaUrl(type, name), { fast: true });
  const [m, s] = await Promise.allSettled([get('movie'), get('series')]);
  if (m.status === 'rejected' && s.status === 'rejected') throw m.reason;
  return cinemetaVerdict(m.status === 'fulfilled' ? m.value : null, s.status === 'fulfilled' ? s.value : null, title);
}

async function translateToEn(net, cache, text, now) {
  const key = 'film:en:v1:' + keyOf(text);
  const hit = cache ? await cache.get(key).catch(() => null) : null;
  if (hit && typeof hit.text === 'string' && typeof hit.at === 'number' && now - hit.at < FILM_TTL) return hit.text;
  const out = parseTranslation(await net.json(`${TRANSLATE_URL}?client=gtx&sl=tr&tl=en&dt=t&q=${encodeURIComponent(text)}`, { fast: true }));
  if (cache && out) await cache.set(key, { at: now, text: out }).catch(() => {});
  return out;
}

// Dönüş: 'film' | 'series' | 'none' (kaynaklar yanıt verdi, film değil/bilinmiyor) | '' (ağ hatası: kaydedilmez, sonra yeniden denenir)
export async function lookupFilm({ net, cache = null, title, now = Date.now() }) {
  const key = keyOf(title);
  if (!key) return 'none';
  const ck = 'film:v1:' + key;
  const hit = cache ? await cache.get(ck).catch(() => null) : null;
  if (hit && typeof hit.v === 'string' && typeof hit.at === 'number' && now - hit.at < (hit.v === 'none' ? NONE_TTL : FILM_TTL)) return hit.v;
  const save = async (v) => {
    if (cache) await cache.set(ck, { at: now, v }).catch(() => {});
    return v;
  };
  let answered = 0;
  const attempt = async (fn) => {
    try {
      const v = await fn();
      answered++;
      return v;
    } catch (_) {
      return '';
    }
  };
  let v = await attempt(() => viaWikidata(net, title));
  if (v) return save(v);
  v = await attempt(() => viaCinemeta(net, searchText(title), title));
  if (v) return save(v);
  // Ad Cinemeta/Wikidata'da kendi diliyle yoksa: İngilizceye çevirip ara (en az iki sözcük ya da yeterince uzun; genel tek sözcükler yanlış eşleşir)
  const words = searchText(title).split(/\s+/).filter(Boolean);
  if (words.length >= 2 && key.length >= MIN_TRANSLATED_LEN) {
    let en = '';
    try {
      en = await translateToEn(net, cache, searchText(title), now);
    } catch (_) { /* çeviri alınamadı: arama bu adımda biter */ }
    if (en && keyOf(en) && keyOf(en) !== key && keyOf(en).length >= MIN_TRANSLATED_LEN) {
      v = await attempt(() => viaCinemeta(net, en, en));
      if (v) return save(v);
    }
  }
  return answered ? save('none') : '';
}

// Kuyruk: adaylar sırayla (en çok `concurrency` eşzamanlı) çözülür; sonuç bilinince değişim bildirilir (ekran yeniden çizilir).
// local(title): yerel kanıt (kullanıcının film kütüphanesi); ağa gitmeden 'film' sayar.
export function createFilmResolver({ net, cache = null, local = null, concurrency = 4, budget = 400, lookup = lookupFilm, now = () => Date.now() } = {}) {
  const memo = new Map(); // ad anahtarı → karar
  const queue = [];
  const queued = new Set();
  let running = 0;
  let spent = 0;
  let notify = null;
  let timer = null;

  const changed = () => {
    if (timer || !notify) return;
    timer = setTimeout(() => {
      timer = null;
      if (notify) notify();
    }, 250);
  };
  const verdict = (title) => {
    const k = keyOf(title);
    if (!k) return '';
    const v = memo.get(k);
    if (v) return v;
    return local && local(title) ? 'film' : '';
  };
  const pump = () => {
    while (running < concurrency && queue.length && spent < budget) {
      const title = queue.shift();
      const k = keyOf(title);
      spent++;
      running++;
      Promise.resolve()
        .then(() => lookup({ net, cache, title, now: now() }))
        .then((v) => {
          if (v) {
            memo.set(k, v);
            if (v === 'film') changed();
          } else queued.delete(k); // ağ hatası: sonraki istekte yeniden denenebilir
        })
        .catch(() => queued.delete(k))
        .finally(() => {
          running--;
          pump();
        });
    }
  };
  // titles: öncelik sırasıyla; onChange: yeni film kararı gelince çağrılır (son verilen geçerli olur)
  const request = (titles, onChange) => {
    if (onChange) notify = onChange;
    for (const title of titles) {
      const k = keyOf(title);
      if (!k || memo.has(k) || queued.has(k) || (local && local(title))) continue;
      queued.add(k);
      queue.push(title);
    }
    pump();
  };
  const stop = () => {
    notify = null;
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return { verdict, request, stop, _memo: memo };
}
