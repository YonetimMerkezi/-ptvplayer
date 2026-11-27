// Spor verisi (lig öncelikli): hiçbir şey kendiliğinden yüklenmez; her çağrı kullanıcının bir seçimine karşılık gelir.
//  hafta(lig, pazartesi)  → ligin takvim haftası (ESPN, tek istek)       tablo(lig) → puan durumu (ESPN, tek istek)
//  canli()                → şu an oynanan maçlar (LiveScore, olmazsa Mackolik)
//  takim(fav)             → takımın yakın maçları (önce ülke ligi, sonra Avrupa kupaları; her lig tek istek)
//  yayin(gün)             → günün yayın akışı (hangi maç hangi kanalda); ağır sayfa, yalnız istenince
// Ayrıştırma ve birleştirme Android uygulamasıyla ortaktır (www/js/sports*.js); burada yalnız yükleme sırası ve önbellek vardır.
// İstekler birbiri ardına atılır (aynı anda tek ağır iş): yavaş TV'de yanıt işlenirken arayüz tuşlara yanıt verebilsin.
import { loadMatches, DAY, dayStart, leagueOf, dayMonth } from '../../www/js/sports.js';
import { TABLE_IDS, loadStandings } from '../../www/js/sports-table.js';
import { LS_HOSTS, loadLiveScoreDay } from '../../www/js/sports-ls.js';
import { loadMackolikDay } from '../../www/js/sports-mk.js';
import { loadSchedDay, seInfoFor } from '../../www/js/sports-se.js';
import { loadTvDay, tvChannelsFor, channelsByName } from '../../www/js/sports-tv.js';
import { hasFavMatch } from '../../www/js/sports-fav.js';
import * as K from './log.js';

export const TAZE_MS = 5 * 60000; // lig haftası ve takım maçları bu süre taze sayılır
export const TABLO_TAZE_MS = 10 * 60000;
export const CANLI_TAZE_MS = 45000;
export const YAYIN_TAZE_MS = 30 * 60000;
export const ULKE_LIGLERI = ['tur.1', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1']; // takımın "ülke ligi" aranacak ligler (bu sırayla)
export const AVRUPA_LIGLERI = ['uefa.champions', 'uefa.europa', 'uefa.europa.conf'];
export const TABLOLU_LIGLER = TABLE_IDS; // puan durumu olan ligler
export const TAKIM_GERI_GUN = 7; // takım sayfası: kaç gün öncesinden
export const TAKIM_ILERI_GUN = 21; // ... kaç gün sonrasına kadar

const sn = (ms) => (ms / 1000).toFixed(1) + ' sn';
const ara = () => new Promise((c) => setTimeout(c, 0)); // olay döngüsüne dön (tuşlar işlensin)

// ---- hafta yardımcıları (saf) ----

// Verilen anın takvim haftasının pazartesi 00:00'ı (yerel saat)
export function haftaBasi(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
export const haftaKaydir = (pzt, n) => {
  const d = new Date(pzt);
  d.setDate(d.getDate() + 7 * n);
  return d.getTime();
};
// Haftanın yedi gününün başlangıçları (pazartesi → pazar)
export function haftaGunleri(pzt) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(pzt);
    d.setDate(d.getDate() + i);
    out.push(d.getTime());
  }
  return out;
}
// "23–29 Kas" ya da ay değişiyorsa "30 Kas – 6 Ara"; bu hafta ise başına etiket
export function haftaEtiketi(pzt, simdi = Date.now()) {
  const son = haftaGunleri(pzt)[6];
  const a = dayMonth(pzt);
  const b = dayMonth(son);
  const aralik = a.split(' ')[1] === b.split(' ')[1] ? a.split(' ')[0] + '–' + b : a + ' – ' + b;
  const fark = Math.round((pzt - haftaBasi(simdi)) / (7 * DAY));
  const ek = fark === 0 ? 'Bu hafta' : fark === 1 ? 'Gelecek hafta' : fark === -1 ? 'Geçen hafta' : '';
  return ek ? ek + ' · ' + aralik : aralik;
}

// Maçları saat sırasına dizer, aynı kimlikli olanları tekilleştirir
function tekilSirala(maclar) {
  const gor = {};
  const out = maclar.filter((m) => !gor[m.id] && (gor[m.id] = true));
  out.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return out;
}

// hatira: ESPN adres basamağı belleği (loadMatches'e verilir); hatiraKaydet(hatira): değişince kalıcı yazım
export function createSporVeri(net, { now = () => Date.now(), deps = {}, hatira = {}, hatiraKaydet = null } = {}) {
  const d = Object.assign({ loadEspn: loadMatches, loadTablo: loadStandings, loadLs: loadLiveScoreDay, loadMk: loadMackolikDay, loadSched: loadSchedDay, loadTv: loadTvDay }, deps);
  const st = { hafta: {}, tablo: {}, takim: {}, canli: null, yayin: {}, lsDownAt: 0 };
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

  // Ligin bir takvim haftası (pzt: haftanın pazartesi 00:00'ı). Saat sırasına dizili.
  function hafta(lgId, pzt, zorla) {
    const k = lgId + '|' + pzt;
    return bir('hafta:' + k, async () => {
      const c = st.hafta[k];
      if (!zorla && c && now() - c.at < TAZE_MS) return c.matches;
      const t0 = Date.now();
      try {
        const r = await espn(lgId, pzt, 0, 6);
        K.bilgi('Spor ' + lgId + ' haftası: ' + r.matches.length + ' maç, ' + sn(Date.now() - t0));
        st.hafta[k] = { at: now(), matches: r.matches };
        return r.matches;
      } catch (e) {
        K.uyar('Spor ' + lgId + ' haftası alınamadı: ' + ((e && (e.detail || e.message)) || e) + ' · ' + sn(Date.now() - t0));
        if (c) return c.matches; // eski liste varsa o gösterilir
        throw e;
      }
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
  async function ikinci(dayMs) {
    let m = null;
    const t0 = Date.now();
    if (!st.lsDownAt || now() - st.lsDownAt >= 10 * 60000) {
      try {
        m = (await d.loadLs({ net, dayMs, now: now(), hosts: LS_HOSTS })).matches;
        st.lsDownAt = 0;
        K.bilgi('Spor LiveScore: ' + m.length + ' maç, ' + sn(Date.now() - t0));
      } catch (e) {
        st.lsDownAt = now();
        K.uyar('Spor LiveScore alınamadı: ' + ((e && e.message) || e) + ' · ' + sn(Date.now() - t0));
      }
    }
    if (!m) {
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
        const m = await ikinci(gunler[i]);
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

  return { hafta, tablo, canli, takim, yayin, yayinVar };
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
