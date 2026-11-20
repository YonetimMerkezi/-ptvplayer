// Spor verisi: ESPN (tüm ligler) + gün gün ikinci kaynak (LiveScore, olmazsa Mackolik) + yayın akışı (hangi kanalda).
// Ayrıştırma ve birleştirme Android uygulamasıyla ortaktır (www/js/sports*.js); burada yalnız önbellekli yükleme sırası vardır.
import { loadMatches, dayStart, matchesOnDay } from '../../www/js/sports.js';
import { LS_HOSTS, loadLiveScoreDay, mergeSources, sameTeam } from '../../www/js/sports-ls.js';
import { loadMackolikDay } from '../../www/js/sports-mk.js';
import { loadSchedDay, seInfoFor } from '../../www/js/sports-se.js';
import { loadTvDay, tvChannelsFor, channelsByName } from '../../www/js/sports-tv.js';

export const TAZE_MS = 5 * 60000; // ESPN ve günlük listeler bu süre taze sayılır
export const YAYIN_TAZE_MS = 30 * 60000;

export function createSporVeri(net, { now = () => Date.now(), deps = {} } = {}) {
  const d = Object.assign({ loadEspn: loadMatches, loadLs: loadLiveScoreDay, loadMk: loadMackolikDay, loadSched: loadSchedDay, loadTv: loadTvDay, birlestir: mergeSources }, deps);
  const st = { espn: {}, espnAt: 0, espnHata: '', gunler: {}, yayin: {}, lsDownAt: 0 };
  const bekleyen = {};
  const bir = (k, fn) => bekleyen[k] || (bekleyen[k] = fn().finally(() => delete bekleyen[k]));

  // ESPN: dayMs verilirse yalnız o günün (±1 gün) maçları istenir; yanıtlar küçük kalır, 2016 model TV'de ayrıştırma arayüzü dondurmaz.
  // dayMs verilmezse eski gibi tüm pencere (dün + 7 gün) tek seferde alınır.
  const espn = (zorla, dayMs) => {
    const k = dayMs == null ? '' : String(dayMs);
    return bir('espn:' + k, async () => {
      const c = st.espn[k];
      if (!zorla && c && now() - c.at < TAZE_MS) return c.matches;
      try {
        const secenek = dayMs == null ? { net, now: now(), back: 1, ahead: 7 } : { net, now: dayMs, back: 0, ahead: 0 };
        const r = await d.loadEspn(secenek);
        st.espn[k] = { at: now(), matches: r.matches || [] };
        st.espnAt = now();
        st.espnHata = '';
      } catch (e) {
        st.espnHata = (e && e.message) || 'Maç bilgisi alınamadı';
        if (!st.espn[k]) st.espn[k] = { at: 0, matches: [] };
      }
      return st.espn[k].matches;
    });
  };

  // Bir günün ikinci kaynak maçları: önce LiveScore; alınamazsa (ya da kısa süre önce alınamadıysa) Mackolik
  async function ikinci(dayMs) {
    let m = null;
    if (!st.lsDownAt || now() - st.lsDownAt >= 10 * 60000) {
      try {
        m = (await d.loadLs({ net, dayMs, now: now(), hosts: LS_HOSTS })).matches;
        st.lsDownAt = 0;
      } catch (e) {
        st.lsDownAt = now();
      }
    }
    if (!m) {
      try {
        m = (await d.loadMk({ net, dayMs, now: now() })).matches;
      } catch (e) {
        /* ikinci kaynak yok */
      }
    }
    return m || null;
  }

  // Günün maçları (tüm kaynaklar birleşik); hiçbir kaynaktan veri gelmezse hata fırlatır. zorla: önbelleğe bakmadan yeniler.
  // ilk(maclar): ESPN yanıtı gelir gelmez (ikinci kaynak beklenmeden) bir kez çağrılır; ekran listeyi hemen gösterip birleşik sonucu sonra tazeler.
  function maclar(dayMs, zorla, ilk) {
    return bir('gun:' + dayMs, async () => {
      const c = st.gunler[dayMs];
      if (!zorla && c && now() - c.at < TAZE_MS) return c.matches;
      const pe = espn(zorla, dayMs);
      const ps = ikinci(dayMs);
      if (ilk) {
        pe.then((e) => {
          const gun = matchesOnDay(e, dayStart(dayMs));
          if (gun.length) ilk(gun);
        });
      }
      const [e, s] = await Promise.all([pe, ps]);
      if (!e.length && !s) throw new Error(st.espnHata || 'Maç bilgisi alınamadı');
      const hepsi = s && s.length ? d.birlestir(e, s).matches : e;
      const gun = matchesOnDay(hepsi, dayStart(dayMs));
      st.gunler[dayMs] = { at: now(), matches: gun };
      return gun;
    });
  }

  // Günün yayın akışı (maç → kanal adları). Önce Spor Ekranı sayfası, olmazsa TheSportsDB. Alınamazsa null.
  function yayin(dayMs) {
    return bir('yayin:' + dayMs, async () => {
      const c = st.yayin[dayMs];
      if (c && now() - c.at < YAYIN_TAZE_MS) return c.v;
      let v = null;
      try {
        const r = await d.loadSched({ net, dayMs, nowMs: now() });
        if (r.rows && r.rows.length) v = { tur: 'se', rows: r.rows };
      } catch (e) {
        /* yedek kaynağa geç */
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

  return { espn, maclar, yayin, durum: () => ({ espnHata: st.espnHata, espnAt: st.espnAt }) };
}

// Bir maçın TV kanal adları (yayın akışından). Spor Ekranı satırları Android'dekiyle aynı biçimde, satır başlığında iki takımın adı aranarak eşlenir
// (başlık "A - B" biçiminde ayrışmasa da çalışır); TheSportsDB olayları takım adı ve saatle eşlenir.
export function kanalAdlari(m, y, tolerans = 35 * 60000) {
  if (!y) return [];
  if (y.tur === 'tsdb') return tvChannelsFor(m, y.events);
  return seInfoFor(m, y.rows, { tolerance: tolerans }).channels;
}

// Günün maçları → { maç kimliği: kanal adları }. Oynanmış/ertelenmiş maçlara kanal yazılmaz.
export function kanalHaritasi(maclar, y) {
  const h = {};
  if (!y) return h;
  for (let i = 0; i < maclar.length; i++) {
    const m = maclar[i];
    if (m.state === 'post' || m.off) continue;
    const a = kanalAdlari(m, y);
    if (a.length) h[m.id] = a;
  }
  return h;
}

// Kanal adlarına karşılık gelen kullanıcının canlı kanalları
export const kullaniciKanallari = (canliListe, adlar) => channelsByName(canliListe, adlar);
