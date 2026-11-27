// Maç haftası ("tur"): bir ligin 14. haftası, 15. haftası gibi gerçek lig haftaları. Takvim haftasıyla (pazartesi–pazar) karıştırılmaz:
// Süper Lig haftası cuma başlayıp pazartesi bitebilir, hafta ortası turları salı–perşembe oynanır.
// Tur, ligin maçları saat sırasına dizilince "hiçbir takım iki kez oynamadan" ve "iki maç arası 3 günden uzun açılmadan" ardışık gelen maçlardır.
// Numara kaynak verisinden okunur (LiveScore "Round 14" → "14. hafta"); yoksa komşu turdan ya da puan durumundaki oynanan maç sayısından çıkarılır.
// Saf mantık: ağ dışarıdan verilir (webOS: spor-veri.js, Android: sports-ui.js). Bu dosya her iki uygulamada ortaktır.
import { DAY, dayStart, dayMonth, norm } from './sports.js';

export const TUR_BOSLUK_MS = 3 * DAY; // iki maç arası bundan uzunsa yeni tur başlar
export const TUR_KENAR_GUN = 3; // bir turun sınırı, ilk/son maç gününden bu kadar gün öteye bakılınca kesinleşir (boşluk kuralıyla tutarlı)
export const TUR_UFUK_GUN = 21; // maç bulunamazsa en çok bu kadar gün ileri/geri aranır (milli ara, yaz arası)
export const TUR_AZAMI_GUN = 40; // tek çağrıda en çok bu kadar yeni gün indirilir

// Takvim günü kaydırma (yaz/kış saati kaymasına karşı gün sayısıyla)
export function gunEkle(dayMs, n) {
  const d = new Date(dayMs);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

const takimAdi = (t) => norm((t && (t.name || t.label)) || '');

// Maçın kaynak verisindeki hafta numarası ("12. hafta", "Grup aşaması · 3. hafta" → 12, 3); yoksa 0
export function turNoOku(m) {
  const r = /(\d{1,3})\.\s*hafta/i.exec(String((m && m.round) || ''));
  return r ? Number(r[1]) : 0;
}

const enSik = (sayilar) => {
  const say = {};
  let en = 0;
  let kazanan = 0;
  for (const n of sayilar) {
    say[n] = (say[n] || 0) + 1;
    if (say[n] > en || (say[n] === en && n < kazanan)) {
      en = say[n];
      kazanan = n;
    }
  }
  return kazanan;
};

function tekilMaclar(maclar) {
  const gor = {};
  return (maclar || []).filter((m) => m && Number.isFinite(m.t) && m.id != null && !gor[m.id] && (gor[m.id] = true));
}

// Bir ligin maçlarını turlara böler. Dönüş (saat sırasıyla): [{ no, tahmin, bas, son, maclar, tam }]
//  no: hafta numarası (bilinmiyorsa 0) · tahmin: numara komşu turdan çıkarıldı · bas/son: ilk/son maç günü · tam: tam boy bir tur (kısmi uç parça değil)
export function turlaraBol(maclar) {
  const s = tekilMaclar(maclar).sort((a, b) => a.t - b.t || String(a.id).localeCompare(String(b.id)));
  const gruplar = [];
  let cur = null;
  for (const m of s) {
    const a = takimAdi(m.home);
    const b = takimAdi(m.away);
    const bol = cur && ((a && cur.takimlar.has(a)) || (b && cur.takimlar.has(b)) || m.t - cur.sonT > TUR_BOSLUK_MS);
    if (!cur || bol) {
      cur = { maclar: [], takimlar: new Set(), sonT: m.t };
      gruplar.push(cur);
    }
    cur.maclar.push(m);
    if (a) cur.takimlar.add(a);
    if (b) cur.takimlar.add(b);
    cur.sonT = m.t;
  }
  // numara: tur içindeki maçların çoğunun numarası; aynı numaralı turlar (ertelenip sonra oynanan maç) tek turda birleşir
  const turlar = [];
  const numarali = {};
  for (const g of gruplar) {
    const no = enSik(g.maclar.map(turNoOku).filter((n) => n > 0));
    if (no > 0 && numarali[no]) {
      numarali[no].maclar = numarali[no].maclar.concat(g.maclar).sort((x, y) => x.t - y.t || String(x.id).localeCompare(String(y.id)));
      continue;
    }
    const t = { no, tahmin: false, maclar: g.maclar, bas: 0, son: 0, tam: false };
    if (no > 0) numarali[no] = t;
    turlar.push(t);
  }
  turlar.sort((a, b) => a.maclar[0].t - b.maclar[0].t);
  const en = turlar.reduce((n, g) => Math.max(n, g.maclar.length), 0);
  for (const g of turlar) {
    g.bas = dayStart(g.maclar[0].t);
    g.son = dayStart(g.maclar[g.maclar.length - 1].t);
    g.tam = en > 0 && g.maclar.length * 2 >= en; // yarıdan küçük parça: ertelenen tek maç ya da yarım yüklenmiş uç
  }
  // numarasız turlar komşusundan sayılır; yalnız tam boy turlar sayıyı ilerletir (tek ertelenmiş maç turu kaydırmasın)
  const tamlar = turlar.filter((g) => g.tam);
  for (let i = 1; i < tamlar.length; i++) {
    if (!tamlar[i].no && tamlar[i - 1].no > 0) {
      tamlar[i].no = tamlar[i - 1].no + 1;
      tamlar[i].tahmin = true;
    }
  }
  for (let i = tamlar.length - 2; i >= 0; i--) {
    if (!tamlar[i].no && tamlar[i + 1].no > 1) {
      tamlar[i].no = tamlar[i + 1].no - 1;
      tamlar[i].tahmin = true;
    }
  }
  return turlar;
}

// Puan durumundaki oynanan maç sayısından bir turun numarası (yalnız güncel tur için güvenilir). Bilinmiyorsa 0.
// Turdaki her takım için: maçı bitmişse oynadığı sayı, bitmemişse oynadığı sayı + 1; ortancası.
export function turNoTablodan(tur, gruplar) {
  const satirlar = [];
  for (const g of gruplar || []) for (const r of (g && g.rows) || []) if (r && Number.isFinite(r.p)) satirlar.push({ k: [norm(r.name), norm(r.label)].filter(Boolean), p: r.p });
  const bul = (t) => {
    const k = takimAdi(t);
    if (!k) return null;
    const tam = satirlar.find((r) => r.k.indexOf(k) >= 0);
    if (tam) return tam;
    return satirlar.find((r) => r.k.some((x) => x.length >= 4 && k.length >= 4 && (x.indexOf(k) >= 0 || k.indexOf(x) >= 0))) || null;
  };
  const adaylar = [];
  for (const m of (tur && tur.maclar) || []) {
    if (m.off) continue;
    for (const t of [m.home, m.away]) {
      const r = bul(t);
      if (r) adaylar.push(m.state === 'post' ? r.p : r.p + 1);
    }
  }
  if (adaylar.length < 2) return 0;
  adaylar.sort((a, b) => a - b);
  const n = adaylar[adaylar.length >> 1];
  return n > 0 ? n : 0;
}

// Komşu turdan numara: ref (numarası belli komşu tur), yon (+1: hedef ref'ten sonra, -1: önce)
export const turNoKomsu = (tur, ref, yon) => (tur && tur.no > 0 ? tur.no : ref && ref.no > 0 && ref.no + yon > 0 ? ref.no + yon : 0);

// "14. Hafta · 28 Kas – 1 Ara" (numara yoksa yalnız tarih aralığı)
export function turAraligi(tur) {
  if (!tur) return '';
  const a = dayMonth(tur.bas);
  const b = dayMonth(tur.son);
  if (tur.bas === tur.son) return a;
  return a.split(' ')[1] === b.split(' ')[1] ? a.split(' ')[0] + '–' + b : a + ' – ' + b;
}
export const turEtiketi = (tur, no = tur && tur.no) => (!tur ? '' : no > 0 ? no + '. Hafta · ' + turAraligi(tur) : turAraligi(tur));

// Tur seçimi (yukarıdaki ara döngüsünün saf parçası)
//  yon > 0: merkez gününden itibaren ilk tur · yon < 0: merkez gününde ya da öncesinde biten son tur
// Dönüş: { hedef } | { yukle: gün } (önce bu gün indirilmeli) | { yok: true }
function ara(turlar, yuklu, merkez, yon, ufuk) {
  if (yon > 0) {
    const g = turlar.find((t) => t.bas >= merkez);
    const sinir = g ? g.bas : gunEkle(merkez, ufuk + 1);
    for (let d = merkez; d < sinir; d = gunEkle(d, 1)) if (!yuklu(d)) return { yukle: d };
    return g ? { hedef: g } : { yok: true };
  }
  let g = null;
  for (let i = turlar.length - 1; i >= 0; i--) {
    if (turlar[i].son <= merkez) {
      g = turlar[i];
      break;
    }
  }
  const sinir = g ? g.son : gunEkle(merkez, -(ufuk + 1));
  for (let d = merkez; d > sinir; d = gunEkle(d, -1)) if (!yuklu(d)) return { yukle: d };
  return g ? { hedef: g } : { yok: true };
}

// Kapanış: turun sınırı, ilk maçından önceki ve son maçından sonraki TUR_KENAR_GUN gün de yüklenince kesinleşir.
// Dönüş: yüklenmesi gereken en yakın gün ya da null
function kapanis(tur, yuklu) {
  let en = null;
  let enUzak = Infinity;
  for (let k = -TUR_KENAR_GUN; k <= Math.round((tur.son - tur.bas) / DAY) + TUR_KENAR_GUN; k++) {
    const d = gunEkle(tur.bas, k);
    if (yuklu(d)) continue;
    const uzak = d < tur.bas ? Math.round((tur.bas - d) / DAY) : d > tur.son ? Math.round((d - tur.son) / DAY) : 0; // tur içindeki boş günler önce, sonra ileri, sonra geri
    const puan = uzak * 2 + (d < tur.bas ? 1 : 0);
    if (puan < enUzak) {
      enUzak = puan;
      en = d;
    }
  }
  return en;
}

// Bir turu bulur ve sınırları kesinleşene dek gün gün indirir.
//  gunYukle(dayMs) → o günün (yalnız bu ligin) maçları | null (alınamadı)     onbellek: Map(gün → maç dizisi), çağrılar arasında korunabilir
//  merkez: gün · yon: 0 (merkez gününün ya da yaklaşan turu; yoksa sonuncusu), +1 (merkezden sonraki ilk tur), -1 (merkezden önceki son tur)
//  aktif(): false olunca bırakılır · onPart(turlar, hedef): her gün sonrası (hedef kesinleşmeden önce de verilir)
// Dönüş: { tur, turlar, yok, kismi, eksik: [günler] }
export async function turCoz({ gunYukle, onbellek = new Map(), merkez, yon = 0, aktif = () => true, onPart = null, ufuk = TUR_UFUK_GUN, azami = TUR_AZAMI_GUN }) {
  merkez = dayStart(merkez);
  const eksik = [];
  const yuklu = (d) => onbellek.has(d) || eksik.indexOf(d) >= 0;
  const topla = () => {
    let hepsi = [];
    onbellek.forEach((m) => {
      hepsi = hepsi.concat(m);
    });
    return turlaraBol(hepsi);
  };
  let yeni = 0;
  let turlar = topla();
  const dene = (turlar2) => {
    if (yon !== 0) return ara(turlar2, yuklu, merkez, yon, ufuk);
    if (!yuklu(merkez)) return { yukle: merkez };
    const icinde = turlar2.find((t) => t.bas <= merkez && merkez <= t.son);
    if (icinde) return { hedef: icinde };
    const ileri = ara(turlar2, yuklu, merkez, 1, ufuk);
    if (!ileri.yok) return ileri;
    return ara(turlar2, yuklu, merkez, -1, ufuk);
  };
  for (;;) {
    if (!aktif()) return { tur: null, turlar, yok: false, kismi: true, eksik, iptal: true };
    const r = dene(turlar);
    let gun = r.yukle != null ? r.yukle : null;
    if (r.yok) return { tur: null, turlar, yok: true, kismi: false, eksik };
    if (gun == null && r.hedef) {
      gun = kapanis(r.hedef, yuklu);
      if (gun == null) return { tur: r.hedef, turlar, yok: false, kismi: false, eksik };
    }
    if (yeni >= azami) return { tur: r.hedef || null, turlar, yok: !r.hedef, kismi: true, eksik };
    let m = null;
    try {
      m = await gunYukle(gun);
    } catch (e) {
      m = null;
    }
    if (!aktif()) return { tur: null, turlar, yok: false, kismi: true, eksik, iptal: true };
    yeni++;
    if (m) onbellek.set(gun, m);
    else eksik.push(gun);
    turlar = topla();
    if (onPart) {
      try {
        const o = dene(turlar);
        onPart(turlar, o.hedef || null);
      } catch (e) {
        /* ekrandaki hata veri yüklemeyi bozmaz */
      }
    }
  }
}
