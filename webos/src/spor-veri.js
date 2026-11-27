// Spor verisi: ESPN (tüm ligler) + gün gün ikinci kaynak (LiveScore, olmazsa Mackolik) + yayın akışı (hangi kanalda).
// Ayrıştırma ve birleştirme Android uygulamasıyla ortaktır (www/js/sports*.js); burada yalnız önbellekli yükleme sırası vardır.
import { loadMatches, dayStart, matchesOnDay } from '../../www/js/sports.js';
import { LS_HOSTS, loadLiveScoreDay, mergeSources, sameTeam } from '../../www/js/sports-ls.js';
import { loadMackolikDay } from '../../www/js/sports-mk.js';
import { loadSchedDay, seInfoFor } from '../../www/js/sports-se.js';
import { loadTvDay, tvChannelsFor, channelsByName } from '../../www/js/sports-tv.js';
import { onbellek } from './onbellek.js';
import * as K from './log.js';

export const TAZE_MS = 5 * 60000; // ESPN ve günlük listeler bu süre taze sayılır
export const YAYIN_TAZE_MS = 30 * 60000;
export const KAYIT_OMUR_MS = 6 * 3600 * 1000; // kayıtlı gün listesi bundan eskiyse ilk anda gösterilmez (skorlar çok eskimiş olur)
export const ESPN_BEKLEME_MS = 10 * 60000; // ESPN hiç yanıt vermediyse bu süre yeniden denenmez (LiveScore için de aynı kural)
export const PARCA_MS = 250; // ligler/kaynaklar geldikçe listeyi en sık bu aralıkla tazele (zayıf TV'de çizim yükü)
const kayitAnahtari = (dayMs) => 'spor:' + dayMs;
const sn = (ms) => (ms / 1000).toFixed(1) + ' sn';
const ara = () => new Promise((c) => setTimeout(c, 0)); // olay döngüsüne dön (tuşlar işlensin)
export const KULLANILDI_KEY = 'sp.kullanildi'; // Spor ekranı bir kez açıldıysa ana sayfa bugünün maçlarını önceden hazırlar
export const ISITMA_GECIKME_MS = 7000; // ana sayfa açıldıktan bu kadar sonra (afişler yerleşince) ısıtma başlar

// kalici: { okuYasli(anahtar), yaz(anahtar, dizi) } (IndexedDB önbelleği); verilmezse her şey yalnız bellekte tutulur.
export function createSporVeri(net, { now = () => Date.now(), deps = {}, kalici = null } = {}) {
  const d = Object.assign({ loadEspn: loadMatches, loadLs: loadLiveScoreDay, loadMk: loadMackolikDay, loadSched: loadSchedDay, loadTv: loadTvDay, birlestir: mergeSources }, deps);
  const st = { espn: {}, espnAt: 0, espnHata: '', espnDownAt: 0, gunler: {}, yayin: {}, lsDownAt: 0 };
  const bekleyen = {};
  const bir = (k, fn) => bekleyen[k] || (bekleyen[k] = fn().finally(() => delete bekleyen[k]));

  // ESPN: dayMs verilirse yalnız o günün (±1 gün) maçları istenir; yanıtlar küçük kalır, 2016 model TV'de ayrıştırma arayüzü dondurmaz.
  // dayMs verilmezse eski gibi tüm pencere (dün + 7 gün) tek seferde alınır.
  // onPart(maçlar): her lig gelince o ana kadarki liste (yalnız yüklemeyi başlatan çağrıda); paralel: arka plan ısıtmasında daha az eşzamanlı istek
  const espn = (zorla, dayMs, onPart, paralel) => {
    const k = dayMs == null ? '' : String(dayMs);
    return bir('espn:' + k, async () => {
      const c = st.espn[k];
      if (!zorla && c && now() - c.at < TAZE_MS) return c.matches;
      // ESPN hiçbir ligde yanıt vermediyse (engelli/yavaş ağ) kısa süre denenmez: gün değiştirirken her seferinde beklenmez
      if (st.espnDownAt && now() - st.espnDownAt < ESPN_BEKLEME_MS) return (c && c.matches) || [];
      try {
        const secenek = dayMs == null ? { net, now: now(), back: 1, ahead: 7 } : { net, now: dayMs, back: 0, ahead: 0 };
        if (onPart) secenek.onPart = onPart;
        if (paralel) secenek.parallel = paralel;
        const t0 = Date.now();
        const r = await d.loadEspn(secenek);
        K.bilgi('Spor ESPN: ' + (r.matches || []).length + ' maç, ' + (r.okCount != null ? r.okCount + '/' + (r.okCount + (r.failed || []).length) + ' lig, ' : '') + (r.sunucu ? r.sunucu + '. sunucu, ' : '') + sn(Date.now() - t0));
        st.espn[k] = { at: now(), matches: r.matches || [] };
        st.espnAt = now();
        st.espnHata = '';
        st.espnDownAt = 0;
      } catch (e) {
        st.espnHata = (e && e.message) || 'Maç bilgisi alınamadı';
        st.espnDownAt = now();
        K.uyar('Spor ESPN alınamadı' + (e && e.detail ? ': ' + e.detail : '') + ' · 10 dk denenmeyecek');
        if (!st.espn[k]) st.espn[k] = { at: 0, matches: [] };
      }
      return st.espn[k].matches;
    });
  };

  // Bir günün ikinci kaynak maçları: önce LiveScore; alınamazsa (ya da kısa süre önce alınamadıysa) Mackolik
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

  // Günün maçları (tüm kaynaklar birleşik); hiçbir kaynaktan veri gelmezse hata fırlatır. zorla: önbelleğe bakmadan yeniler.
  // ilk(maclar): liste kademeli gelir. Önce (varsa) kayıtlı liste hemen, yoksa ESPN ligleri ve ikinci kaynak geldikçe o ana kadarki birleşik liste
  // (en sık PARCA_MS'de bir) verilir; ekran her çağrıda listeyi yeniler, dönen son sonuç bunların yerini alır.
  // Kayıtlı liste gösterildiyse ağdan gelen kısmi listeler onun yerine geçmez (maçlar kaybolup geri gelmesin); yalnız tam sonuç geçer.
  // Aynı güne sürmekte olan bir yükleme (örn. ana sayfadaki ısıtma) varsa ona katılınır: o ana kadarki liste hemen verilir, sonrası kademeli gelir.
  // paralel: yalnız ısıtma (arka plan) için ESPN eşzamanlı istek sayısı.
  const canli = {}; // gün → sürmekte olan yüklemenin durumu
  function gunYukle(dayMs, zorla, paralel) {
    const c = st.gunler[dayMs];
    if (!zorla && c && now() - c.at < TAZE_MS) return Promise.resolve(c.matches);
    const gunu = dayStart(dayMs);
    const basla = Date.now();
    const g = (canli[dayMs] = { ilk: null, e: [], s: null, gosterildi: false, kayitli: false, kayitOkundu: false, bitti: false, zamanlayici: null });
    g.yap = () => {
      g.zamanlayici = null;
      if (g.bitti || g.kayitli || !g.ilk) return;
      const hepsi = g.s && g.s.length ? d.birlestir(g.e, g.s).matches : g.e;
      const gun = matchesOnDay(hepsi, gunu);
      if (!gun.length) return;
      g.gosterildi = true;
      g.ilk(gun);
    };
    const parca = () => {
      if (g.bitti || g.kayitli || !g.ilk) return;
      if (!g.gosterildi) g.yap();
      else if (!g.zamanlayici) g.zamanlayici = setTimeout(g.yap, PARCA_MS);
    };
    // Kayıtlı liste ağı beklemeden gösterilir; ağdan daha önce bir şey geldiyse ya da çok eskiyse kullanılmaz
    g.kayitOku = () => {
      if (g.kayitOkundu || !kalici) return;
      g.kayitOkundu = true;
      Promise.resolve(kalici.okuYasli(kayitAnahtari(dayMs), now()))
        .then((k) => {
          if (!k || g.bitti || g.gosterildi || g.kayitli || !g.ilk || now() - k.at > KAYIT_OMUR_MS) return;
          const gun = matchesOnDay(k.v, gunu);
          if (!gun.length) return;
          g.kayitli = true;
          g.ilk(gun);
        })
        .catch(() => {});
    };
    if (zorla) g.kayitOkundu = true; // yenileme: ekranda zaten liste var
    const pe = espn(zorla, dayMs, (parcaLigler) => {
      g.e = parcaLigler;
      parca();
    }, paralel);
    pe.then((son) => {
      g.e = son; // yükleyici parça bildirmese de (ya da önbellekten gelse de) ESPN sonucu gelince liste gösterilir
      parca();
    });
    const ps = ikinci(dayMs).then((m) => {
      g.s = m;
      parca();
      return m;
    });
    return (async () => {
      try {
        const [son, ikincil] = await Promise.all([pe, ps]);
        if (!son.length && !ikincil) throw new Error(st.espnHata || 'Maç bilgisi alınamadı');
        const hepsi = ikincil && ikincil.length ? d.birlestir(son, ikincil).matches : son;
        const gun = matchesOnDay(hepsi, gunu);
        st.gunler[dayMs] = { at: now(), matches: gun };
        K.bilgi('Spor gün hazır: ' + gun.length + ' maç, toplam ' + sn(Date.now() - basla));
        if (kalici && gun.length) Promise.resolve(kalici.yaz(kayitAnahtari(dayMs), gun, now())).catch(() => {});
        return gun;
      } finally {
        g.bitti = true;
        clearTimeout(g.zamanlayici);
        if (canli[dayMs] === g) delete canli[dayMs];
      }
    })();
  }

  function maclar(dayMs, zorla, ilk, paralel) {
    const sonuc = bir('gun:' + dayMs, () => gunYukle(dayMs, zorla, paralel));
    const g = canli[dayMs];
    if (ilk && g && !g.bitti) {
      g.ilk = ilk;
      if (g.e.length || g.s) g.yap();
      else g.kayitOku();
    }
    return sonuc;
  }

  // Ana sayfa boştayken günün maçlarını arka planda hazırlar (liste Spor'a girince hazır olur); hata sessizce yutulur
  function isit(dayMs) {
    return maclar(dayMs, false, null, 2).then(() => true, () => false);
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

  return { espn, maclar, isit, yayin, durum: () => ({ espnHata: st.espnHata, espnAt: st.espnAt }) };
}

// Tek ortak örnek: Spor ekranı ve ana sayfadaki ısıtma aynı önbelleği ve aynı bekleyen istekleri paylaşır.
let ortak = null;
export function sporVeri(net) {
  if (!ortak) ortak = createSporVeri(net, { kalici: onbellek });
  return ortak;
}

// Bir maçın TV kanal adları (yayın akışından). Spor Ekranı satırları Android'dekiyle aynı biçimde, satır başlığında iki takımın adı aranarak eşlenir
// (başlık "A - B" biçiminde ayrışmasa da çalışır); TheSportsDB olayları takım adı ve saatle eşlenir.
export function kanalAdlari(m, y, tolerans = 35 * 60000) {
  if (!y) return [];
  if (y.tur === 'tsdb') return tvChannelsFor(m, y.events);
  return seInfoFor(m, y.rows, { tolerance: tolerans }).channels;
}

// Günün maçları → { maç kimliği: kanal adları }. Oynanmış/ertelenmiş maçlara kanal yazılmaz.
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
    if (hazir[m.id]) continue;
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
