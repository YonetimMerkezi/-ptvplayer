// Gözatma düzeni (kaynak + tür başına): kategori sırası, liste sıralaması ve kullanıcı klasörleri. Saf mantık: durum dışarıda saklanır,
// her işlem yeni bir düzen nesnesi döndürür. Kategori taşıma Android ile ortak www/js/cats.js'ten, liste sıralama www/js/sort.js'ten gelir.
//
// duzen = { sira: 'default'|'az'|'za'|'new'|'old'|'rate', order: ['g:<kimlik>' | 'f:<klasör>'], klasorler: [{ id, name, items: [öğe özeti] }] }
// Kategori kimliği "g:<id>", klasör kimliği "f:<id>"; ekrandaki kategori satırının id'si kategori için sağlayıcıdaki id, klasör için "f:<id>".
import { arrange, move } from '../../www/js/cats.js';
import { sortItems, SORTS, isSortMode } from '../../www/js/sort.js';

export { SORTS };
export const siraAdi = (k) => (SORTS.filter((x) => x[0] === k)[0] || SORTS[0])[1];
// Üst çubuk başlığı için kısa ad
const KISA = { az: 'A→Z', za: 'Z→A', new: 'Yeni önce', old: 'Eski önce', rate: 'Puan' };
export const siraKisa = (k) => KISA[k] || '';

export const bosDuzen = () => ({ sira: 'default', order: [], klasorler: [] });

const dizgeler = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []);
const AD_EN_FAZLA = 40;
const temizAd = (n) => String(n == null ? '' : n).replace(/\s+/g, ' ').trim().slice(0, AD_EN_FAZLA);

// Kayıttan okunan (bozuk/eski olabilen) değeri güvenle toparlar
export function duzenOku(ham) {
  const d = bosDuzen();
  if (!ham || typeof ham !== 'object') return d;
  if (isSortMode(ham.sira)) d.sira = ham.sira;
  d.order = dizgeler(ham.order).filter((x, i, a) => a.indexOf(x) === i);
  const gorulen = {};
  for (const f of Array.isArray(ham.klasorler) ? ham.klasorler : []) {
    if (!f || typeof f.id !== 'string' || gorulen[f.id]) continue;
    const ad = temizAd(f.name);
    if (!ad) continue;
    gorulen[f.id] = 1;
    const oge = [];
    const idler = {};
    for (const o of Array.isArray(f.items) ? f.items : []) {
      if (o && typeof o === 'object' && o.id != null && !idler[o.id]) {
        idler[o.id] = 1;
        oge.push(o);
      }
    }
    d.klasorler.push({ id: f.id, name: ad, items: oge });
  }
  return d;
}

export const klasorId = (id) => 'f:' + id;
const kategoriId = (id) => 'g:' + id;
// Ekrandaki satır → düzen kimliği
const satirKimlik = (r) => (r.klasor ? klasorId(r.fid) : kategoriId(r.id));

// Sağlayıcının kategorileri → ekrandaki satırlar: klasörler başta, sonra kategoriler; kayıtlı sıra varsa onun üstüne uygulanır.
// Her satır: { id, name, count?, klasor?, fid? }  (klasör satırının id'si "f:<id>")
export function kategorileriDuzenle(kategoriler, d) {
  const taban = d.klasorler.map((f) => ({ id: klasorId(f.id), name: f.name, count: f.items.length, klasor: true, fid: f.id })).concat(kategoriler.map((c) => ({ id: String(c.id), name: c.name, count: c.count })));
  // cats.arrange kimlik olarak id'yi kullanır: kategori kimlikleri g:… öneki ile eşlenir
  const eslenen = taban.map((r) => Object.assign({}, r, { _k: satirKimlik(r) }));
  const sirali = arrange(eslenen.map((r) => ({ id: r._k, r })), { order: d.order, hidden: [], locked: [], folders: [] });
  return sirali.map((x) => x.r);
}

// Seçili satırı taşır: 'up' | 'down' | 'top'. satirlar: şu anki tam sıra.
export function kategoriTasi(d, satirlar, satir, nereye) {
  const idler = satirlar.map(satirKimlik);
  const yeni = move({ order: d.order, hidden: [], locked: [], folders: [] }, idler, satirKimlik(satir), nereye);
  return Object.assign({}, d, { order: yeni.order });
}

// Tüm kategorileri ada göre dizer (klasörler başta kalır)
export function kategoriAzSirala(d, satirlar, satir, ters) {
  const klasorler = satirlar.filter((r) => r.klasor);
  const dizi = sortItems(
    satirlar.filter((r) => !r.klasor).map((r) => ({ name: r.name, r })),
    ters ? 'za' : 'az',
  ).map((x) => x.r);
  return Object.assign({}, d, { order: klasorler.concat(dizi).map(satirKimlik) });
}

export const kategoriSifirla = (d) => Object.assign({}, d, { order: [] });

export const listeSirala = (items, d) => sortItems(items, d.sira);
export const siraDegistir = (d, sira) => Object.assign({}, d, { sira: isSortMode(sira) ? sira : 'default' });

// ---- klasörler ----
const yeniId = () => Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);

export function klasorEkle(d, ad, id) {
  const nm = temizAd(ad);
  if (!nm) return { d, klasor: null };
  const k = { id: id || yeniId(), name: nm, items: [] };
  // Sıra özelleştirilmişse yeni klasör en üstte görünsün
  const order = d.order.length ? [klasorId(k.id)].concat(d.order) : d.order;
  return { d: Object.assign({}, d, { klasorler: d.klasorler.concat([k]), order }), klasor: k };
}

export function klasorAdlandir(d, id, ad) {
  const nm = temizAd(ad);
  if (!nm) return d;
  return Object.assign({}, d, { klasorler: d.klasorler.map((f) => (f.id === id ? Object.assign({}, f, { name: nm }) : f)) });
}

export function klasorSil(d, id) {
  return Object.assign({}, d, { klasorler: d.klasorler.filter((f) => f.id !== id), order: d.order.filter((x) => x !== klasorId(id)) });
}

export const klasorBul = (d, id) => d.klasorler.filter((f) => f.id === id)[0] || null;
export const klasordeMi = (d, id, ogeId) => {
  const f = klasorBul(d, id);
  return !!f && f.items.some((o) => String(o.id) === String(ogeId));
};
export const klasorOgeleri = (d, id) => (klasorBul(d, id) ? klasorBul(d, id).items.slice() : []);

// Klasöre konan öğe, favorilerdeki gibi tam kopya olarak saklanır (oynatmak için gereken alanlar kaybolmasın); yalnız uzun metinler kısaltılır
export function ogeOzet(o) {
  let r;
  try {
    r = JSON.parse(JSON.stringify(o));
  } catch (e) {
    r = {};
  }
  for (const k in r) if (typeof r[k] === 'string' && r[k].length > 400) r[k] = r[k].slice(0, 400);
  return r;
}

// Öğeyi klasöre ekler ya da çıkarır. { d, acik }
export function klasorDegistir(d, id, oge) {
  const f = klasorBul(d, id);
  if (!f) return { d, acik: false };
  const vardi = f.items.some((o) => String(o.id) === String(oge.id));
  const items = vardi ? f.items.filter((o) => String(o.id) !== String(oge.id)) : f.items.concat([ogeOzet(oge)]);
  return { d: Object.assign({}, d, { klasorler: d.klasorler.map((x) => (x.id === id ? Object.assign({}, x, { items }) : x)) }), acik: !vardi };
}
