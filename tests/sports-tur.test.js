// Maç haftası: lig haftası takvim haftası değil, ardışık maçlar turudur (cuma–pazartesi). Numara kaynaktan ya da komşu turdan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { turlaraBol, ayniMac, turCoz, turNoOku, turNoTablodan, turNoKomsu, turEtiketi, turAraligi, gunEkle, TUR_AZAMI_GUN } from '../www/js/sports-tur.js';

const gun = (a, g) => new Date(2026, a - 1, g).getTime(); // yerel gün başı
const saat = (a, g, s = 20) => new Date(2026, a - 1, g, s, 0).getTime();
const maç = (id, t, h, b, ek = {}) => ({ id, t, state: 'pre', home: { name: h, label: h }, away: { name: b, label: b }, ...ek });

// 6 takımlı lig, haftada 3 maç; takımlar sabit (gerçek lig gibi): her turda her takım bir kez
const SABIT = ['Aslan', 'Bora', 'Çelik', 'Deniz', 'Ege', 'Fırat'];
function sabitTur(n, tarihler, numara = true) {
  const ek = numara ? { round: n + '. hafta' } : {};
  const esler = n % 2 ? [[0, 1], [2, 3], [4, 5]] : [[0, 2], [1, 4], [3, 5]];
  return esler.map((e, i) => maç('s' + n + '-' + i, saat(...tarihler[i]), SABIT[e[0]], SABIT[e[1]], ek));
}
const LIG = (numara = true) => [
  ...sabitTur(13, [[11, 20], [11, 21], [11, 23]], numara),
  ...sabitTur(14, [[11, 27], [11, 28], [11, 30]], numara),
  ...sabitTur(15, [[12, 4], [12, 5], [12, 6]], numara),
];

test('tur: cuma–pazartesi maçları aynı hafta, ertesi cuma yeni hafta', () => {
  const t = turlaraBol(LIG());
  assert.equal(t.length, 3);
  assert.deepEqual(t.map((x) => x.no), [13, 14, 15]);
  const h14 = t[1];
  assert.equal(h14.maclar.length, 3);
  assert.equal(h14.bas, gun(11, 27));
  assert.equal(h14.son, gun(11, 30)); // pazartesi dahil: takvim haftası (pzt–paz) olsaydı 30 Kas ertesi haftaya düşerdi
});

test('tur: aynı maçın iki kaynakta farklı yazılmış kopyası haftayı bölmez (Amed Sportif / Amedspor)', () => {
  const kaynak = LIG();
  const h14 = kaynak.filter((m) => m.id.startsWith('s14'));
  const kopya = maç('se:1', h14[1].t, h14[1].home.name, 'Başka Yazılış', {}); // aynı saat, aynı ev sahibi, rakip adı farklı
  const t = turlaraBol([...kaynak, kopya]);
  assert.equal(t.length, 3, 'kopya yüzünden 14. hafta ikiye bölünmedi');
  assert.deepEqual(t.map((x) => x.no), [13, 14, 15]);
  assert.equal(t[1].bas, gun(11, 27));
  assert.equal(t[1].son, gun(11, 30));
  assert.equal(t[1].maclar.length, 4);
  // gerçek tekrar (aynı takım bir hafta içinde başka saatte yine oynuyor) yine yeni tur başlatır
  const tekrar = turlaraBol([...LIG(false), maç('x', saat(11, 29, 20), 'Aslan', 'Ege')]); // numarasız: numara birleştirmesi karışmaz
  assert.ok(tekrar.length > 3);
  assert.equal(ayniMac(h14[1], kopya), true);
  assert.equal(ayniMac(h14[0], h14[1]), false);
});

test('tur: numara yoksa komşudan sayılır; yoksa 0 kalır', () => {
  const kaynak = LIG(false);
  assert.deepEqual(turlaraBol(kaynak).map((x) => x.no), [0, 0, 0]);
  // yalnız ortadaki turun maçları numaralı
  const kismi = [...sabitTur(13, [[11, 20], [11, 21], [11, 23]], false), ...sabitTur(14, [[11, 27], [11, 28], [11, 30]], true), ...sabitTur(15, [[12, 4], [12, 5], [12, 6]], false)];
  const t = turlaraBol(kismi);
  assert.deepEqual(t.map((x) => x.no), [13, 14, 15]);
  assert.deepEqual(t.map((x) => x.tahmin), [true, false, true]);
});

test('tur: takım tekrarı turu böler (ardışık günlerde bile)', () => {
  // Cum–Pzt tur, ardından salı hafta ortası turu: salı maçında Aslan yeniden oynuyor → yeni tur
  const m = [...sabitTur(14, [[11, 27], [11, 28], [11, 30]]), ...sabitTur(15, [[12, 1], [12, 1], [12, 2]])];
  const t = turlaraBol(m);
  assert.equal(t.length, 2);
  assert.equal(t[1].bas, gun(12, 1));
});

test('tur: ertelenip hafta ortası oynanan tek maç (başka haftanın numarasıyla) sayımı kaydırmaz', () => {
  const m = [...sabitTur(13, [[11, 20], [11, 21], [11, 23]], true), maç('ert', saat(11, 25), 'Aslan', 'Bora', { round: '10. hafta' }), ...sabitTur(14, [[11, 27], [11, 28], [11, 30]], false)];
  const t = turlaraBol(m);
  assert.deepEqual(t.filter((x) => x.tam).map((x) => x.no), [13, 14]); // 14, ertelenen 10. haftadan değil 13'ten sayılır
  assert.equal(t.filter((x) => !x.tam).length, 1);
  assert.equal(t.find((x) => !x.tam).no, 10);
});

test('tur: uzun açıklık (milli ara) turu böler', () => {
  const t = turlaraBol([...sabitTur(14, [[11, 27], [11, 28], [11, 30]]), ...sabitTur(15, [[12, 12], [12, 13], [12, 14]])]);
  assert.equal(t.length, 2);
  assert.deepEqual(t.map((x) => x.no), [14, 15]);
});

test('tur: ertelenip sonra oynanan maç kendi hafta numarasıyla o turda birleşir', () => {
  const m = [...LIG(), maç('ert', saat(12, 2), 'Aslan', 'Fırat', { round: '14. hafta' })];
  const t = turlaraBol(m);
  const h14 = t.find((x) => x.no === 14);
  assert.equal(h14.maclar.length, 4);
  assert.equal(t.filter((x) => x.no === 14).length, 1);
  assert.equal(t.length, 3);
});

test('turNoOku: LiveScore turu "N. hafta", kupa/aşama adı olduğu gibi', () => {
  assert.equal(turNoOku({ round: '12. hafta' }), 12);
  assert.equal(turNoOku({ round: 'Grup aşaması · 3. hafta' }), 3);
  assert.equal(turNoOku({ round: 'Çeyrek final' }), 0);
  assert.equal(turNoOku({}), 0);
});

// ---- turCoz ----
function kaynak(maclar, { yavas = false, hataGunleri = [] } = {}) {
  const yuklenen = [];
  const f = async (g) => {
    yuklenen.push(g);
    if (hataGunleri.indexOf(g) >= 0) return null;
    return maclar.filter((m) => new Date(m.t).setHours(0, 0, 0, 0) === g);
  };
  return { f, yuklenen };
}

test('turCoz: bugün maç günüyse o tur (pazartesi dahil) bulunur; yalnız gerekli günler indirilir', async () => {
  const k = kaynak(LIG());
  const r = await turCoz({ gunYukle: k.f, merkez: gun(11, 27), yon: 0 });
  assert.equal(r.tur.no, 14);
  assert.equal(r.tur.maclar.length, 3);
  assert.equal(r.tur.son, gun(11, 30));
  assert.equal(r.yok, false);
  // 27 Kas ±: en çok 3 gün öncesinden 3 gün sonrasına
  assert.ok(Math.min(...k.yuklenen) >= gun(11, 24), 'çok geriye gidilmedi');
  assert.ok(Math.max(...k.yuklenen) <= gun(12, 3), 'çok ileri gidilmedi');
});

test('turCoz: pazartesi akşamı hâlâ aynı tur; salı yaklaşan tur', async () => {
  const k = kaynak(LIG());
  const pzt = await turCoz({ gunYukle: k.f, merkez: gun(11, 30), yon: 0 });
  assert.equal(pzt.tur.no, 14);
  const sali = await turCoz({ gunYukle: kaynak(LIG()).f, merkez: gun(12, 1), yon: 0 });
  assert.equal(sali.tur.no, 15);
});

test('turCoz: sonraki/önceki tur; çağrılar arası önbellek paylaşılır', async () => {
  const k = kaynak(LIG());
  const onb = new Map();
  const bu = await turCoz({ gunYukle: k.f, onbellek: onb, merkez: gun(11, 28), yon: 0 });
  assert.equal(bu.tur.no, 14);
  const say = k.yuklenen.length;
  const sonraki = await turCoz({ gunYukle: k.f, onbellek: onb, merkez: gunEkle(bu.tur.son, 1), yon: 1 });
  assert.equal(sonraki.tur.no, 15);
  assert.equal(sonraki.tur.maclar.length, 3);
  const onceki = await turCoz({ gunYukle: k.f, onbellek: onb, merkez: gunEkle(bu.tur.bas, -1), yon: -1 });
  assert.equal(onceki.tur.no, 13);
  assert.equal(onceki.tur.maclar.length, 3);
  assert.ok(k.yuklenen.length > say);
  // aynı gün iki kez indirilmez
  assert.equal(new Set(k.yuklenen).size, k.yuklenen.length);
});

test('turCoz: numarasız kaynakta (Mackolik) numara yok; komşudan türetilir', async () => {
  const k = kaynak(LIG(false));
  const bu = await turCoz({ gunYukle: k.f, merkez: gun(11, 28), yon: 0 });
  assert.equal(bu.tur.no, 0);
  assert.equal(turNoKomsu(bu.tur, { no: 13 }, 1), 14);
  assert.equal(turNoKomsu({ no: 20 }, { no: 13 }, 1), 20);
  assert.equal(turNoKomsu(bu.tur, null, 1), 0);
});

test('turCoz: milli ara — sonraki tur uzaktaysa da bulunur; maç hiç yoksa yok', async () => {
  const uzak = [...sabitTur(14, [[11, 27], [11, 28], [11, 30]]), ...sabitTur(15, [[12, 12], [12, 13], [12, 14]])];
  const r = await turCoz({ gunYukle: kaynak(uzak).f, merkez: gun(12, 1), yon: 0 });
  assert.equal(r.tur.no, 15);
  const bos = await turCoz({ gunYukle: kaynak([]).f, merkez: gun(7, 15), yon: 0 });
  assert.equal(bos.tur, null);
  assert.equal(bos.yok, true);
});

test('turCoz: bir gün alınamazsa eksik listelenir, döngü sonsuza gitmez', async () => {
  const k = kaynak(LIG(), { hataGunleri: [gun(11, 29)] });
  const r = await turCoz({ gunYukle: k.f, merkez: gun(11, 28), yon: 0 });
  assert.equal(r.tur.no, 14);
  assert.deepEqual(r.eksik, [gun(11, 29)]);
  assert.equal(new Set(k.yuklenen).size, k.yuklenen.length);
});

test('turCoz: aktif() false olunca bırakılır; onPart kısmi turu verir', async () => {
  const k = kaynak(LIG());
  let n = 0;
  const parcalar = [];
  const r = await turCoz({ gunYukle: k.f, merkez: gun(11, 27), yon: 0, aktif: () => ++n < 4, onPart: (t, h) => parcalar.push(h && h.maclar.length) });
  assert.equal(r.iptal, true);
  assert.ok(parcalar.length >= 1);
  // iptalde istek sayısı sınırlı kalır
  assert.ok(k.yuklenen.length <= 4);
});

test('turCoz: azami gün sınırı', async () => {
  const k = kaynak([]);
  const r = await turCoz({ gunYukle: k.f, merkez: gun(7, 15), yon: 0, azami: 5 });
  assert.ok(k.yuklenen.length <= 5);
  assert.equal(r.kismi, true);
  assert.ok(TUR_AZAMI_GUN >= 21);
});

// ---- numara / etiket ----
test('turNoTablodan: oynanan maç sayısından numara', () => {
  const satir = (ad, p) => ({ name: ad, label: ad, p });
  const tablo = [{ name: '', rows: [satir('Aslan', 14), satir('Bora', 13), satir('Çelik', 14), satir('Deniz', 13), satir('Ege', 13), satir('Fırat', 13)] }];
  // 14. hafta turu: Aslan–Çelik oynandı (14), Bora–Ege ve Deniz–Fırat oynanmadı (13+1)
  const tur = { maclar: [maç('1', 1, 'Aslan', 'Çelik', { state: 'post' }), maç('2', 2, 'Bora', 'Ege'), maç('3', 3, 'Deniz', 'Fırat')] };
  assert.equal(turNoTablodan(tur, tablo), 14);
  assert.equal(turNoTablodan(tur, []), 0);
  assert.equal(turNoTablodan({ maclar: [maç('9', 1, 'X', 'Y')] }, tablo), 0);
});

test('turEtiketi: numara ve tarih aralığı', () => {
  const tur = { no: 14, bas: gun(11, 27), son: gun(11, 30) };
  assert.equal(turAraligi(tur), '27–30 Kas');
  assert.equal(turEtiketi(tur), '14. Hafta · 27–30 Kas');
  assert.equal(turEtiketi({ no: 0, bas: gun(11, 30), son: gun(12, 2) }), '30 Kas – 2 Ara');
  assert.equal(turEtiketi({ no: 0, bas: gun(11, 30), son: gun(11, 30) }), '30 Kas');
  assert.equal(turEtiketi(tur, 0), '27–30 Kas');
});
