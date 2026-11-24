// Fragmandan dönüş: "YouTube TV sayfası" yolunda uygulamanın penceresi YouTube'a gider; YouTube'dan Geri ile çıkınca pencere,
// yani uygulama kapanır. Çıkmadan önce ekran yığını kaydedilir ve TV servisindeki bekçiye "uygulama kapanınca beni yeniden aç"
// denir; uygulama açılınca kayıttaki ekranlar geri kurulur.
import { ctx, open } from './ctx.js';
import { luna, SERVIS } from './luna.js';
import * as K from './log.js';

export const UYGULAMA_ID = 'com.koruk.iptv.webos';
const KAYIT = 'donus';
const KAYIT_OMRU_MS = 3 * 3600 * 1000; // bekçi en çok bu kadar bekler
const TEKRAR_MS = 60000; // dönüş açılışından sonra kayıt bu kadar süre ikinci açılış için geçerli kalır
const MANUEL_ACILIS_MS = 120000; // açılış parametresi okunamazsa: kayıt bu kadar tazeyse dönüş sayılır
const EN_BUYUK_KAYIT = 200000; // karakter
const KAYDEDILMEYEN = { player: 1, fragmanqr: 1, fragmantesti: 1, addsource: 1 };

// Ekran yığınından (ilk ekran hariç: o her açılışta kurulur) kaydedilebilir ekranlar [{ad, arg}]; ilk uygun olmayanda durur
export function yiginKaydi(yigin) {
  const liste = [];
  for (let i = 1; i < yigin.length; i++) {
    const e = yigin[i];
    if (!e || !e.acilis || KAYDEDILMEYEN[e.acilis.ad]) break;
    let gecerli = true;
    let metin;
    try {
      metin = JSON.stringify(e.acilis.arg === undefined ? null : e.acilis.arg, (k, v) => {
        if (typeof v === 'function') gecerli = false;
        return v;
      });
    } catch (x) {
      gecerli = false;
    }
    if (!gecerli || metin === undefined || metin.length > EN_BUYUK_KAYIT) break;
    liste.push({ ad: e.acilis.ad, arg: JSON.parse(metin) });
  }
  return liste;
}

// Açılış parametreleri (TV'nin verdiği JSON metni); yoksa boş nesne
export function acilisParametreleri(pencere = typeof window !== 'undefined' ? window : {}) {
  const kaynaklar = [pencere.PalmSystem, pencere.webOSSystem];
  for (let i = 0; i < kaynaklar.length; i++) {
    try {
      const m = kaynaklar[i] && kaynaklar[i].launchParams;
      if (m) {
        const o = typeof m === 'string' ? JSON.parse(m) : m;
        if (o && typeof o === 'object') return o;
      }
    } catch (e) {
      /* okunamadı: sıradaki kaynak */
    }
  }
  return {};
}

// Çıkmadan önce: ekranları kaydet, bekçiyi kur. Hata fırlatmaz; {kuruldu, neden}
export async function donusHazirla({ cagri = luna, simdi = Date.now } = {}) {
  try {
    ctx.store.setSetting(KAYIT, { t: simdi(), yigin: yiginKaydi(ctx.stack) });
  } catch (e) {
    K.hata(e);
  }
  try {
    const r = await cagri(SERVIS + 'donusKur', { uyg: UYGULAMA_ID, sureMs: KAYIT_OMRU_MS }, 4000);
    if (r && r.returnValue === false) return { kuruldu: false, neden: r.errorText || 'servis reddetti' };
    return { kuruldu: true, neden: '' };
  } catch (e) {
    K.bilgi('Dönüş bekçisi kurulamadı: ' + (e && e.message ? e.message : e));
    return { kuruldu: false, neden: e && e.message ? e.message : String(e) };
  }
}

// Açılışta: kaydı oku ve sil. Dönüş ise kayıtlı ekranları açar; {donus: bool, tani, acilan}
export function donusUygula({ params = acilisParametreleri(), simdi = Date.now, ac = open } = {}) {
  const sonuc = { donus: false, tani: '', acilan: 0, kayit: false };
  let kayit = null;
  try {
    kayit = ctx.store.setting(KAYIT, null);
  } catch (e) {
    kayit = null;
  }
  if (!kayit) return sonuc;
  sonuc.kayit = true;
  const yas = simdi() - (Number(kayit.t) || 0);
  const kullanildi = Number(kayit.kullanildi) || 0;
  const sonra = simdi() - kullanildi;
  // Servis, TV başka uygulamayı öne aldıysa uygulamayı yeniden açabilir (ikinci açılış): kullanılmış kayıt kısa süre geçerli kalır
  const tekrar = kullanildi > 0 && !!(params && params.donus) && sonra >= 0 && sonra < TEKRAR_MS;
  const ilk = kullanildi === 0 && yas >= 0 && yas < KAYIT_OMRU_MS && (!!(params && params.donus) || yas < MANUEL_ACILIS_MS);
  const donusMu = tekrar || ilk;
  try {
    ctx.store.setSetting(KAYIT, donusMu ? { t: kayit.t, yigin: kayit.yigin, kullanildi: simdi() } : null);
  } catch (e) {
    /* yazılamazsa bir sonraki açılışta zaman denetimi eler */
  }
  if (params && params.tani) sonuc.tani = String(params.tani);
  if (!donusMu) return sonuc;
  sonuc.donus = true;
  const liste = kayit.yigin instanceof Array ? kayit.yigin : [];
  for (let i = 0; i < liste.length; i++) {
    try {
      ac(liste[i].ad, liste[i].arg);
      sonuc.acilan++;
    } catch (e) {
      K.hata(e);
      break;
    }
  }
  return sonuc;
}

// Bekçinin notlarından, uygulamanın neden kendiliğinden açılmadığını gösteren tek satır: önce servis yeniden başlamışsa (bekçi kaybolmuş),
// sonra uyarılar ve açma/etkinlik hataları, yoksa son not. Toast'a sığacak kadar kısa tutulur.
export function raporMetni(d) {
  if (!d || !d.durum || d.durum === 'yok') return '';
  const tani = (d.tani || []).map(String);
  const onem = [/^UYARI/, /^dikkat/, /canlı tutma/, /başarısız|açılamadı|geçilemedi|sorgulanamadı/];
  let satir = '';
  for (let i = 0; i < onem.length && !satir; i++) satir = tani.filter((t) => onem[i].test(t))[0] || '';
  if (!satir) satir = tani[tani.length - 1] || '';
  const m = 'Dönüş bekçisi: ' + d.durum + (satir ? ' · ' + satir : '');
  return m.length > 170 ? m.slice(0, 169) + '…' : m;
}

// Uygulama bekçi tarafından değil elle açıldıysa: bekçinin durumunu okuyup metne çevirir (dönüşün neden olmadığını gösterir); hata fırlatmaz
export async function donusRaporu({ cagri = luna } = {}) {
  try {
    return raporMetni(await cagri(SERVIS + 'donusDurum', {}, 3000));
  } catch (e) {
    return '';
  }
}

// Uygulama kayıtsız (elle) açıldıysa bekçiyi durdur: ikinci kez açmasın
export function bekciyiDurdur({ cagri = luna } = {}) {
  return Promise.resolve(cagri(SERVIS + 'donusIptal', {}, 3000)).catch(() => {});
}
