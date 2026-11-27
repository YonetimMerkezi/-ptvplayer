// Spor verisi (lig öncelikli): hiçbir şey kendiliğinden yüklenmez; her çağrı kullanıcının bir seçimine karşılık gelir.
//  turAl(lig, {merkez,yon,no}) → ligin maç haftası (14. hafta gibi; TheSportsDB'den tek istek, olmazsa günler ikinci kaynaktan)       tablo(lig) → puan durumu (ESPN, tek istek)
//  canli()                → şu an oynanan maçlar (LiveScore, olmazsa Mackolik)
//  takim(fav)             → takımın yakın maçları (önce ülke ligi, sonra Avrupa kupaları; her lig tek istek)
//  yayin(gün)             → günün yayın akışı (hangi maç hangi kanalda); ağır sayfa, yalnız istenince
// Ayrıştırma ve birleştirme Android uygulamasıyla ortaktır (www/js/sports*.js); burada yalnız yükleme sırası ve önbellek vardır.
// İstekler birbiri ardına atılır (aynı anda tek ağır iş): yavaş TV'de yanıt işlenirken arayüz tuşlara yanıt verebilsin.
import { loadMatches, DAY, dayStart, leagueOf, norm } from '../../www/js/sports.js';
import { TABLE_IDS, loadStandings } from '../../www/js/sports-table.js';
import { LS_HOSTS, loadLiveScoreDay } from '../../www/js/sports-ls.js';
import { loadMackolikDay } from '../../www/js/sports-mk.js';
import { loadSchedDay, seInfoFor } from '../../www/js/sports-se.js';
import { loadSummary, eventIdOf } from '../../www/js/sports-detail.js';
import { loadTvDay, tvChannelsFor, channelsByName } from '../../www/js/sports-tv.js';
import { hasFavMatch } from '../../www/js/sports-fav.js';
import { turCoz } from '../../www/js/sports-tur.js';
import { ligBul, ligEsler, ikinciKaynakVar, LIG_ULKE } from '../../www/js/sports-lig.js';
import { haftaCoz, haftaDestek, eslestir } from '../../www/js/sports-hafta.js';
import * as K from './log.js';

export const TAZE_MS = 5 * 60000; // lig haftası ve takım maçları bu süre taze sayılır
export const TABLO_TAZE_MS = 10 * 60000;
export const CANLI_TAZE_MS = 45000;
export const YAYIN_TAZE_MS = 30 * 60000;
export const TUR_ESPN_GUN = 10; // ikinci kaynak hiç maç vermezse ESPN'den bugünün bu kadar gün öncesi ve sonrası istenir
const GUN_TAZE_MS = 10 * 60000;
export const ULKE_LIGLERI = ['tur.1', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1']; // takımın "ülke ligi" aranacak ligler (bu sırayla)
export const AVRUPA_LIGLERI = ['uefa.champions', 'uefa.europa', 'uefa.europa.conf'];
export const TABLOLU_LIGLER = TABLE_IDS; // puan durumu olan ligler
export const TAKIM_GERI_GUN = 7; // takım sayfası: kaç gün öncesinden
export const TAKIM_ILERI_GUN = 21; // ... kaç gün sonrasına kadar

// Lig katalogu ve ikinci kaynak eşlemesi Android'le ortaktır (www/js/sports-lig.js)
export { IKINCI_LIGLER, TUM_LIGLER, ligBul, ikinciLigMi, ligEsler, LIG_ULKE } from '../../www/js/sports-lig.js';
export const CANLI_SUZGEC = 'x=1'; // canlı liste: yalnız süren maçlar
const mkUygun = (filtre) => !/^u=/.test(filtre) || /turkey|turkiye/.test(filtre); // Mackolik yalnız Türkiye maçlarını verir: başka ülke süzgecinde boşuna sorulmaz

const sn = (ms) => (ms / 1000).toFixed(1) + ' sn';
const ara = () => new Promise((c) => setTimeout(c, 0)); // olay döngüsüne dön (tuşlar işlensin)

// Maçları saat sırasına dizer, aynı kimlikli olanları tekilleştirir
function tekilSirala(maclar) {
  const gor = {};
  const out = maclar.filter((m) => !gor[m.id] && (gor[m.id] = true));
  out.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return out;
}

// hatira: ESPN adres basamağı belleği (loadMatches'e verilir); hatiraKaydet(hatira): değişince kalıcı yazım
export function createSporVeri(net, { now = () => Date.now(), deps = {}, hatira = {}, hatiraKaydet = null } = {}) {
  const d = Object.assign({ loadEspn: loadMatches, loadTablo: loadStandings, loadLs: loadLiveScoreDay, loadMk: loadMackolikDay, loadSched: loadSchedDay, loadTv: loadTvDay, loadSummary, haftaCoz }, deps);
  const st = { tablo: {}, takim: {}, canli: null, yayin: {}, gun: {}, ozet: {}, lsDownAt: 0, hafta: new Map() };
  const bekleyen = {};
  const bir = (k, fn) => bekleyen[k] || (bekleyen[k] = fn().finally(() => delete bekleyen[k]));

  // Tek ligin ESPN maçları: [dün+geri … bugün+ileri] penceresi, tek istek
  const espn = async (lgId, tarih, geri, ileri) => {
    const lig = leagueOf(lgId);
    if (!lig) throw new Error('Bilinmeyen lig');
    try {
      return await d.loadEspn({ net, now: tarih, back: geri, ahead: ileri, leagues: [lig], parallel: 1, hatira, timeoutMs: 20000, budgetMs: 45000, vazgec: 1 });
    } finally {
      if (hatiraKaydet) hatiraKaydet(hatira);
    }
  };

  // ESPN'de en yalın adrese (yalnız bugün) düşülüp kalınması aralıklı programı bozar: aralık istekleri hafızayı sıfırdan dener, ağ sonradan düzeldiyse
  // (aralıklı adres çalışırsa) kalıcı hafızayı da onarır. Döner: ESPN yanıtı.
  async function espnTaze(lgId, tarih, geri, ileri) {
    const lig = leagueOf(lgId);
    if (!lig) throw new Error('Bilinmeyen lig');
    const bozuk = Object.keys(hatira).some((a) => !/#oy$/.test(a) && Number(hatira[a]) >= 2);
    if (!bozuk) return espn(lgId, tarih, geri, ileri);
    const gecici = {};
    Object.keys(hatira).forEach((a) => {
      if (!/#oy$/.test(a)) gecici[a] = 0;
    });
    try {
      const r = await d.loadEspn({ net, now: tarih, back: geri, ahead: ileri, leagues: [lig], parallel: 1, hatira: gecici, timeoutMs: 20000, budgetMs: 45000, vazgec: 1 });
      if (r.level < 2) {
        Object.keys(gecici).forEach((a) => {
          if (!/#oy$/.test(a)) hatira[a] = gecici[a];
        });
        if (hatiraKaydet) hatiraKaydet(hatira);
      }
      return r;
    } catch (e) {
      return espn(lgId, tarih, geri, ileri); // bu ağda hiçbir adres çalışmıyor: olağan yol (hata iletisi aynı)
    }
  }

  // Bir günün ikinci kaynak maçları (LiveScore, olmazsa Mackolik); gün listeleri 10 dk saklanır. Ülke süzgeci aynı olan ligler (Süper Lig, 1. Lig, 2. Lig) aynı listeyi paylaşır.
  async function ikinciGun(dayMs, filtre = '') {
    const kk = dayMs + '|' + filtre;
    const c = st.gun[kk];
    if (c && now() - c.at < GUN_TAZE_MS) return c.m;
    const m = await ikinci(dayMs, filtre);
    if (m) st.gun[kk] = { at: now(), m };
    return m;
  }

  // Ligin maç haftası (14. hafta, 15. hafta gibi): takvim haftası değil, ligin ardışık maçlarının turu (cuma–pazartesi). Günler ikinci kaynaktan
  // gün gün indirilir, tur sınırı kesinleşince durulur (www/js/sports-tur.js). merkez: gün (varsayılan bugün); yon: 0 güncel ya da yaklaşan tur,
  // +1 / −1 merkez gününden sonraki ilk / önceki son tur. İkinci kaynak hiç maç vermezse ESPN penceresine düşülür.
  // onPart(maçlar, tur): tur kesinleşmeden önce de o ana kadarki liste. Döner: { tur | null, yok, kismi, eksik, iptal, kaynak: 'ikinci' | 'espn' }
  // Hafta listesindeki (TheSportsDB) maçlardan başlamış ya da başlamak üzere olanların günleri için ikinci kaynaktaki (LiveScore/Mackolik) karşılık
  // alınır: skor ve durum canlı oradan gelir; karşılığı bulunmayan maç hafta listesindeki halini korur.
  async function canliEkle(lgId, tur, filtre, aktif) {
    const esle = ligEsler(lgId);
    const bugun = dayStart(now());
    const gunler = [];
    tur.maclar.forEach((m) => {
      const g = dayStart(m.t);
      if (g <= bugun && m.state !== 'post' && !m.off && m.t < now() + 3 * 3600e3 && gunler.indexOf(g) < 0) gunler.push(g);
    });
    if (!gunler.length) return tur;
    let adaylar = [];
    for (let i = 0; i < gunler.length; i++) {
      if (!aktif()) return tur;
      const m = await ikinciGun(gunler[i], filtre);
      if (m) adaylar = adaylar.concat(m.filter((x) => x && esle(x)));
    }
    const maclar = tur.maclar.map((m) => {
      const c = gunler.indexOf(dayStart(m.t)) >= 0 ? eslestir(m, adaylar) : null;
      return c ? Object.assign({}, c, { ligId: lgId }) : m;
    });
    return Object.assign({}, tur, { maclar });
  }

  async function turAl(lgId, { merkez = now(), yon = 0, no = 0, sezon = '', aktif = () => true, onPart = null, zorla = false } = {}) {
    if (!ligBul(lgId)) throw new Error('Bilinmeyen lig');
    const esle = ligEsler(lgId);
    const filtre = LIG_ULKE[lgId] || '';
    if (zorla) Object.keys(st.gun).forEach((k) => k.split('|')[1] === filtre && delete st.gun[k]);
    // 1) hafta kaynağı: numaralı hafta tek istekte. Çalışmazsa ya da lig/yön için uygun değilse 2) günler ikinci kaynaktan gün gün
    if (haftaDestek(lgId)) {
      const th = Date.now();
      let h = null;
      try {
        h = await d.haftaCoz({ net, ligId: lgId, no, yon, sezon, now: now(), lgName: ligBul(lgId).name, onbellek: st.hafta, zorla: !!zorla });
      } catch (e) {
        K.uyar('Spor ' + lgId + ' hafta kaynağı alınamadı: ' + ((e && (e.detail || e.message)) || e) + ' · ' + sn(Date.now() - th));
      }
      if (!aktif()) return { tur: null, yok: false, kismi: true, eksik: [], iptal: true, kaynak: 'tsdb' };
      if (h && (h.tur || (h.yok && yon !== 0))) {
        const tur = h.tur ? await canliEkle(lgId, h.tur, filtre, aktif) : null;
        K.bilgi('Spor ' + lgId + ' haftası: ' + (tur ? tur.no + '. hafta, ' + tur.maclar.length + ' maç' : 'yok') + ' (tsdb), ' + sn(Date.now() - th));
        return { tur, yok: !tur, kismi: false, eksik: [], iptal: !aktif(), kaynak: 'tsdb' };
      }
    }
    const gunYukle = async (g) => {
      const m = await ikinciGun(g, filtre);
      return m ? m.filter((x) => x && esle(x) && dayStart(x.t) === g).map((x) => Object.assign({}, x, { ligId: lgId })) : null;
    };
    const parca = (turlar, hedef) => {
      if (onPart && hedef) onPart(hedef.maclar, hedef);
    };
    const t0 = Date.now();
    // eşleme kuralı olmayan yarışmalar (milli maçlar) ikinci kaynaktan seçilemez: doğrudan ESPN penceresi
    let r = ikinciKaynakVar(lgId) ? await turCoz({ gunYukle, merkez, yon, aktif, onPart: parca }) : { tur: null, turlar: [], yok: true, kismi: false, eksik: [] };
    let kaynak = 'ikinci';
    if (r.yok && !r.iptal && leagueOf(lgId)) {
      try {
        const e = await espnTaze(lgId, dayStart(merkez), TUR_ESPN_GUN, TUR_ESPN_GUN);
        const gunler = new Map();
        e.matches.forEach((m) => {
          const g = dayStart(m.t);
          if (!gunler.has(g)) gunler.set(g, []);
          gunler.get(g).push(Object.assign({}, m, { ligId: lgId }));
        });
        if (gunler.size) {
          const r2 = await turCoz({ gunYukle: async (g) => gunler.get(g) || [], merkez, yon, aktif, onPart: parca, ufuk: TUR_ESPN_GUN });
          if (r2.tur) {
            r = r2;
            kaynak = 'espn';
          }
        }
      } catch (e) {
        K.uyar('Spor ' + lgId + ' ESPN yedeği alınamadı: ' + ((e && (e.detail || e.message)) || e));
      }
    }
    K.bilgi('Spor ' + lgId + ' haftası: ' + (r.tur ? (r.tur.no ? r.tur.no + '. hafta, ' : '') + r.tur.maclar.length + ' maç' : 'yok') + (r.eksik.length ? ', ' + r.eksik.length + ' gün alınamadı' : '') + ' (' + kaynak + '), ' + sn(Date.now() - t0));
    if (!r.tur && !r.iptal && r.eksik.length) throw new Error('Maç bilgisi alınamadı');
    return { tur: r.tur, yok: r.yok, kismi: r.kismi, eksik: r.eksik, iptal: !!r.iptal, kaynak };
  }

  // Maç olayları (gol, kart, VAR, değişiklik): ESPN maç özeti, yalnız olaylar kalacak biçimde budanmış gelir. ESPN dışı kaynaktan gelen maç
  // (LiveScore/Mackolik) ligin aynı gün ESPN listesindeki karşılığıyla eşlenir; bulunamazsa olay yoktur. Döner: { events[], durum: 'ok'|'baslamadi'|'yok' }
  const ad = (s) => norm((s && (s.name || s.label)) || '');
  const ayni = (a, b) => !!a && !!b && (a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0);
  const espnMaci = (m) => !!m.id && !!leagueOf(m.lg) && String(m.id).indexOf(m.lg + ':') === 0; // ESPN kimliği: "<lig>:<olay>" (LiveScore "ls:<aşama>:<olay>" ile karışmaz)
  function ozet(m, zorla) {
    return bir('ozet:' + m.id, async () => {
      if (!m || m.state === 'pre' || m.off) return { events: [], durum: 'baslamadi' };
      const c = st.ozet[m.id];
      const omur = m.state === 'in' ? 45000 : 10 * 60000;
      if (!zorla && c && now() - c.at < omur) return c.v;
      const t0 = Date.now();
      let es = espnMaci(m) ? m : null;
      const lid = leagueOf(m.lg) ? m.lg : m.ligId; // ikinci kaynaktan gelen maçta lig, Lig sekmesinde seçilen ligdir (ligId)
      if (!es && lid && leagueOf(lid)) {
        const r = await espn(lid, dayStart(m.t), 0, 0);
        es = r.matches.find((x) => Math.abs(x.t - m.t) < 4 * 3600e3 && ayni(ad(x.home), ad(m.home)) && ayni(ad(x.away), ad(m.away))) || null;
      }
      let v = { events: [], durum: 'yok' };
      if (es) {
        const s = await d.loadSummary({ net, match: es, proje: 'espn-ozet' });
        v = { events: s.events || [], durum: 'ok' };
      }
      K.bilgi('Spor maç olayları: ' + v.events.length + ', ' + sn(Date.now() - t0));
      st.ozet[m.id] = { at: now(), v };
      return v;
    });
  }

  // Ligin puan durumu: [{ name, rows }]; tablosu olmayan ligde null
  function tablo(lgId, zorla) {
    if (TABLOLU_LIGLER.indexOf(lgId) < 0) return Promise.resolve(null);
    return bir('tablo:' + lgId, async () => {
      const c = st.tablo[lgId];
      if (!zorla && c && now() - c.at < TABLO_TAZE_MS) return c.groups;
      const t0 = Date.now();
      try {
        const groups = await d.loadTablo({ net, slug: lgId });
        K.bilgi('Spor ' + lgId + ' puan durumu: ' + groups.reduce((n, g) => n + g.rows.length, 0) + ' satır, ' + sn(Date.now() - t0));
        st.tablo[lgId] = { at: now(), groups };
        return groups;
      } catch (e) {
        K.uyar('Spor ' + lgId + ' puan durumu alınamadı: ' + ((e && (e.detail || e.message)) || e) + ' · ' + sn(Date.now() - t0));
        if (c) return c.groups;
        throw e;
      }
    });
  }

  // Bir günün ikinci kaynak maçları: önce LiveScore; alınamazsa (ya da kısa süre önce alınamadıysa) Mackolik. Hiçbiri olmazsa null.
  async function ikinci(dayMs, filtre = '') {
    let m = null;
    const t0 = Date.now();
    if (!st.lsDownAt || now() - st.lsDownAt >= 10 * 60000) {
      try {
        m = (await d.loadLs({ net, dayMs, now: now(), hosts: LS_HOSTS, filtre })).matches;
        st.lsDownAt = 0;
        K.bilgi('Spor LiveScore: ' + m.length + ' maç, ' + sn(Date.now() - t0));
      } catch (e) {
        st.lsDownAt = now();
        K.uyar('Spor LiveScore alınamadı: ' + ((e && e.message) || e) + ' · ' + sn(Date.now() - t0));
      }
    }
    if (!m && mkUygun(filtre)) {
      const t1 = Date.now();
      try {
        m = (await d.loadMk({ net, dayMs, now: now() })).matches;
        K.bilgi('Spor Mackolik: ' + m.length + ' maç, ' + sn(Date.now() - t1));
      } catch (e) {
        K.uyar('Spor Mackolik alınamadı: ' + ((e && e.message) || e) + ' · ' + sn(Date.now() - t1));
      }
    }
    return m || null;
  }

  // Şu an oynanan maçlar (saat sırasına dizili). Gece yarısından sonra dünün günü de bakılır (23:30'da başlayan maç hâlâ sürebilir).
  function canli(zorla) {
    return bir('canli', async () => {
      if (!zorla && st.canli && now() - st.canli.at < CANLI_TAZE_MS) return st.canli.matches;
      const bugun = dayStart(now());
      const gunler = new Date(now()).getHours() < 4 ? [bugun - DAY, bugun] : [bugun];
      let hepsi = [];
      let alindi = false;
      for (let i = 0; i < gunler.length; i++) {
        const m = await ikinci(gunler[i], CANLI_SUZGEC);
        if (m) {
          alindi = true;
          hepsi = hepsi.concat(m);
        }
      }
      if (!alindi) {
        if (st.canli) return st.canli.matches; // eski liste varsa o gösterilir
        throw new Error('Canlı maç bilgisi alınamadı');
      }
      const liste = tekilSirala(hepsi.filter((m) => m.state === 'in'));
      st.canli = { at: now(), matches: liste };
      return liste;
    });
  }

  // Takımın yakın maçları. Ülke ligi kayıtlıysa (fav.g) yalnız o, değilse ülke ligleri sırayla (takım bulununca durur); sonra Avrupa kupaları.
  // onPart(maçlar, ligAdı): her lig gelince o ana kadarki liste. Döner: { matches, lg: bulunan ülke ligi ('' = bulunamadı), alinan: yanıt veren lig sayısı }.
  function takim(fav, { zorla = false, onPart = null } = {}) {
    return bir('takim:' + fav.n, async () => {
      const c = st.takim[fav.n];
      if (!zorla && c && now() - c.at < TAZE_MS) return c.v;
      const bugun = dayStart(now());
      const t0 = Date.now();
      let sonuc = [];
      let ulke = '';
      let alinan = 0;
      let sonHata = null;
      const dene = async (id) => {
        try {
          const r = await espn(id, bugun, TAKIM_GERI_GUN, TAKIM_ILERI_GUN);
          alinan++;
          const b = r.matches.filter((m) => hasFavMatch([fav], m));
          if (b.length) {
            sonuc = tekilSirala(sonuc.concat(b));
            if (onPart) onPart(sonuc, leagueOf(id).name);
          }
          return b.length > 0;
        } catch (e) {
          sonHata = e;
          return false;
        }
      };
      const kayitli = fav.g && ULKE_LIGLERI.indexOf(fav.g) >= 0 ? fav.g : '';
      if (kayitli) {
        if (await dene(kayitli)) ulke = kayitli;
      } else {
        for (let i = 0; i < ULKE_LIGLERI.length && !ulke; i++) if (await dene(ULKE_LIGLERI[i])) ulke = ULKE_LIGLERI[i];
      }
      for (let i = 0; i < AVRUPA_LIGLERI.length; i++) await dene(AVRUPA_LIGLERI[i]);
      K.bilgi('Spor takım ' + fav.n + ': ' + sonuc.length + ' maç, ' + alinan + ' lig yanıtı, ' + sn(Date.now() - t0));
      if (!alinan) {
        if (c) return c.v;
        throw sonHata || new Error('Maç bilgisi alınamadı');
      }
      const v = { matches: sonuc, lg: ulke, alinan };
      st.takim[fav.n] = { at: now(), v };
      return v;
    });
  }

  // Günün yayın akışı (maç → kanal adları). Önce Spor Ekranı sayfası, olmazsa TheSportsDB. Alınamazsa null.
  function yayin(dayMs) {
    return bir('yayin:' + dayMs, async () => {
      const c = st.yayin[dayMs];
      if (c && now() - c.at < YAYIN_TAZE_MS) return c.v;
      let v = null;
      const t0 = Date.now();
      try {
        const r = await d.loadSched({ net, dayMs, nowMs: now(), ara });
        if (r.rows && r.rows.length) v = { tur: 'se', rows: r.rows };
        K.bilgi('Spor yayın: ' + ((r.rows && r.rows.length) || 0) + ' satır, ' + sn(Date.now() - t0) + (r.via ? ' (' + r.via + ')' : ''));
      } catch (e) {
        K.uyar('Spor yayın alınamadı: ' + ((e && (e.detail || e.message)) || e) + ' · ' + sn(Date.now() - t0));
      }
      if (!v) {
        try {
          const r = await d.loadTv({ net, dayMs });
          if (r.events && r.events.length) v = { tur: 'tsdb', events: r.events };
        } catch (e) {
          /* yayın bilgisi yok */
        }
      }
      st.yayin[dayMs] = { at: now(), v };
      return v;
    });
  }
  // Ağa gitmeden: günün yayın akışı önceden alınmışsa (taze) o, yoksa null
  const yayinVar = (dayMs) => {
    const c = st.yayin[dayMs];
    return c && now() - c.at < YAYIN_TAZE_MS ? c.v : null;
  };

  return { turAl, tablo, canli, takim, yayin, yayinVar, ozet };
}

// ESPN adres basamağı belleği kalıcıdır (3 gün): bu ağda ilk adres (limit=…) hata veriyorsa her açılışta boşa istek atılmaz.
const HATIRA_ANAHTAR = 'iptv.espnBasamak';
const HATIRA_OMUR_MS = 3 * 24 * 3600 * 1000;
function hatiraOku() {
  try {
    const k = JSON.parse(localStorage.getItem(HATIRA_ANAHTAR) || 'null');
    if (k && typeof k === 'object' && k.h && typeof k.h === 'object' && Date.now() - Number(k.t) < HATIRA_OMUR_MS) return k.h;
  } catch (e) {
    /* kayıt yok ya da bozuk */
  }
  return {};
}
let sonHatiraYazim = '';
function hatiraYaz(h) {
  try {
    const s = JSON.stringify(h);
    if (s === sonHatiraYazim) return;
    sonHatiraYazim = s;
    localStorage.setItem(HATIRA_ANAHTAR, JSON.stringify({ t: Date.now(), h }));
  } catch (e) {
    /* depolama dolu ya da kapalı */
  }
}

// Tek ortak örnek: Spor ekranı yeniden açılınca önbellek ve bekleyen istekler korunur.
let ortak = null;
export function sporVeri(net) {
  if (!ortak) ortak = createSporVeri(net, { hatira: hatiraOku(), hatiraKaydet: hatiraYaz });
  return ortak;
}

// Bir maçın TV kanal adları (yayın akışından). Spor Ekranı satırları Android'dekiyle aynı biçimde, satır başlığında iki takımın adı aranarak eşlenir
// (başlık "A - B" biçiminde ayrışmasa da çalışır); TheSportsDB olayları takım adı ve saatle eşlenir.
export function kanalAdlari(m, y, tolerans = 35 * 60000) {
  if (!y) return [];
  if (y.tur === 'tsdb') return tvChannelsFor(m, y.events);
  return seInfoFor(m, y.rows, { tolerance: tolerans }).channels;
}

// Maçlar → { maç kimliği: kanal adları }. Oynanmış/ertelenmiş maçlara kanal yazılmaz.
// TV'nin işlemcisi yavaş: iş küçük dilimlerle yapılır, her dilimden sonra olay döngüsüne dönülür (tuşlar işlenir).
// hedef: doldurulacak harita; hazir: işlenmiş maç kimlikleri (aynı maç yeniden hesaplanmaz); aktif(): false dönerse durur;
// parca(kimlikler): her dilimde kanalı bulunan maçlar bildirilir (ekran yalnız o satırları yeniler).
export async function kanalHaritasi(maclar, y, { hedef = {}, hazir = {}, aktif = () => true, parca = null, dilimMs = 10 } = {}) {
  if (!y) return hedef;
  await ara(); // çağıran liste çizimini bitirsin
  if (!aktif()) return hedef;
  let t0 = Date.now();
  let bulunan = [];
  for (let i = 0; i < maclar.length; i++) {
    const m = maclar[i];
    if (!m || !m.id || hazir[m.id]) continue;
    hazir[m.id] = true;
    if (m.state === 'post' || m.off) continue;
    const a = kanalAdlari(m, y);
    if (a.length) {
      hedef[m.id] = a;
      bulunan.push(m.id);
    }
    if (Date.now() - t0 >= dilimMs) {
      if (parca && bulunan.length) parca(bulunan);
      bulunan = [];
      await ara();
      if (!aktif()) return hedef;
      t0 = Date.now();
    }
  }
  if (parca && bulunan.length) parca(bulunan);
  return hedef;
}

// Kanal adlarına karşılık gelen kullanıcının canlı kanalları
export const kullaniciKanallari = (canliListe, adlar) => channelsByName(canliListe, adlar);
