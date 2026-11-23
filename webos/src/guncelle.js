// Güncelleme denetimi: GitHub'daki "webos" sürümünün adından (LG webOS TV sürümü 1.0.N) son sürüm okunur ve kurulu sürümle
// karşılaştırılır. CI her yayında sürüm numarasını (1.0.<derleme no>) hem pakete hem sürüm adına yazar (WEBOS_VERSION).
// Kurulumu TV servisi dener (service.js guncelleBaslat); çalışıp çalışmadığı TV'nin kurulum servisine bağlıdır.
import { SURUM } from './version.js';
import { luna, SERVIS } from './luna.js';
import * as K from './log.js';

export const DEPO = 'YonetimMerkezi/-ptvplayer';
export const YAYIN_ADRESI = 'https://api.github.com/repos/' + DEPO + '/releases/tags/webos';
export const IPK_ADI = 'iptv-player-webos.ipk';
const ARALIK_MS = 12 * 3600 * 1000; // otomatik denetim aralığı
const HATA_ARALIK_MS = 3600 * 1000; // denetim başarısızsa yeniden deneme

// '1.0.37' → [1, 0, 37]; geçersizse null
export function surumSayilari(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(s || '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// a, b'den eskiyse -1, eşitse 0, yeniyse 1; biri geçersizse 0
export function surumKarsilastir(a, b) {
  const x = surumSayilari(a);
  const y = surumSayilari(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

// GitHub sürüm yanıtı → { surum, derleme, sha, tarih, notlar, ipk: { boyut, ozet } } ; tanınmazsa null
export function yayinCoz(j) {
  if (!j || typeof j !== 'object') return null;
  const ad = String(j.name || '');
  const govde = String(j.body || '');
  const d = /Derleme\s+(\d+)(?:\s*\(([0-9a-f]{7,40})\))?/i.exec(govde);
  let surum = (/\b(\d+\.\d+\.\d+)\b/.exec(ad) || [])[1] || '';
  if (!surum && d) surum = '1.0.' + d[1];
  if (!surumSayilari(surum)) return null;
  const varlik = (j.assets instanceof Array ? j.assets : []).filter((a) => a && a.name === IPK_ADI)[0] || null;
  const ozet = varlik && /^sha256:([0-9a-f]{64})$/i.exec(String(varlik.digest || ''));
  return {
    surum,
    derleme: d ? Number(d[1]) : Number(surum.split('.')[2]),
    sha: d && d[2] ? d[2] : '',
    tarih: String((varlik && varlik.updated_at) || j.published_at || '').slice(0, 10),
    notlar: govde.replace(/\r/g, '').trim().slice(0, 400),
    ipk: varlik ? { boyut: Number(varlik.size) || 0, ozet: ozet ? ozet[1].toLowerCase() : '' } : null,
  };
}

// Son sürümü sorar. Dönen: { durum: 'yeni' | 'guncel' | 'hata', mevcut, son, hata }
export async function denetle({ net, mevcut = SURUM } = {}) {
  try {
    const j = await net.json(YAYIN_ADRESI, { timeoutMs: 15000, headers: { Accept: 'application/vnd.github+json' } });
    const son = yayinCoz(j);
    if (!son) throw new Error('Sürüm bilgisi tanınmadı');
    return { durum: surumKarsilastir(mevcut, son.surum) < 0 ? 'yeni' : 'guncel', mevcut, son, hata: '' };
  } catch (e) {
    return { durum: 'hata', mevcut, son: null, hata: e && e.message ? e.message : String(e) };
  }
}

// Sonucu depoya yazar: guncelleBilgi = { durum, surum, tarih, ozet… } (ayarlar satırı ve ekran okur)
export function sonucuKaydet(store, sonuc, simdi = Date.now) {
  store.setSetting('guncelleSon', simdi() - (sonuc.durum === 'hata' ? ARALIK_MS - HATA_ARALIK_MS : 0));
  store.setSetting('guncelleBilgi', sonuc.durum === 'hata' ? Object.assign({}, store.setting('guncelleBilgi', null) || {}, { hata: sonuc.hata }) : { durum: sonuc.durum, mevcut: sonuc.mevcut, son: sonuc.son, hata: '' });
}

// Depodaki son bilgi: yeni sürüm var mı (kurulu sürüm sonradan güncellendiyse bayat bilgi yok sayılır)
export function bekleyenSurum(store, mevcut = SURUM) {
  const b = store.setting('guncelleBilgi', null);
  return b && b.son && surumKarsilastir(mevcut, b.son.surum) < 0 ? b.son : null;
}

// Açılışta (arka planda) ve kullanıcı isteyince çağrılır. zorla: aralığa bakmadan sorar.
// Yeni sürüm için aynı sürümde tek kez bildirim verilir. Dönen: sonuç ya da null (atlandı)
export async function otomatikDenetle({ net, store, bildir = () => {}, simdi = Date.now, mevcut = SURUM, zorla = false } = {}) {
  if (!zorla) {
    if (!store.setting('guncelleDenetim', true)) return null;
    if (simdi() - Number(store.setting('guncelleSon', 0)) < ARALIK_MS) return null;
  }
  const sonuc = await denetle({ net, mevcut });
  sonucuKaydet(store, sonuc, simdi);
  if (sonuc.durum === 'hata') K.bilgi('Güncelleme denetimi: ' + sonuc.hata);
  if (sonuc.durum === 'yeni' && store.setting('guncelleBildirilen', '') !== sonuc.son.surum) {
    store.setSetting('guncelleBildirilen', sonuc.son.surum);
    bildir('Yeni sürüm var: ' + sonuc.son.surum + ' — Ayarlar › Güncelleme');
  }
  return sonuc;
}

// Açılışta: bir güncelleme istendiyse ve şimdi o sürümdeysek tamamlandığını bildirir. Dönen: tamamlandı mı
export function guncellemeSonrasi({ store, bildir = () => {}, mevcut = SURUM } = {}) {
  const beklenen = String(store.setting('guncelleBeklenen', ''));
  if (!beklenen) return false;
  if (surumKarsilastir(mevcut, beklenen) < 0) return false; // kurulum olmadı: ekran nedenini gösterir; kayıt kalır
  store.setSetting('guncelleBeklenen', '');
  store.setSetting('guncelleBilgi', null);
  bildir('Güncellendi: ' + mevcut);
  return true;
}

// TV servisi: indirme/kurulum. Hata fırlatmaz.
export const servisKur = {
  baslat: (ozet) => luna(SERVIS + 'guncelleBaslat', { sha256: ozet || '' }, 10000),
  durum: () => luna(SERVIS + 'guncelleDurum', {}, 6000),
};
