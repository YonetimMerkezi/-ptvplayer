// Ana ekran bölümlerinin sırası (saf işlevler): ayarlardan değiştirilir, kayıtlı sıra bozuk ya da eksik olsa da tam bir sıra döner.

// Varsayılan sıra bu dizinin sırasıdır. Durum çubuğu ve alt bilgi sabittir, burada değildir.
export const HOME_SECTIONS = [
  { id: 'explore', label: 'Keşfet', hint: 'Canlı TV · Filmler · Diziler · Bugün TV’de' },
  { id: 'tools', label: 'Hızlı erişim', hint: 'Rehber · Çoklu ekran · Favoriler · Spor' },
  { id: 'continue', label: 'Kaldığın yerden devam et', hint: 'Yarım kalan film ve diziler' },
  { id: 'recent', label: 'Son izlenenler', hint: 'Kanallar · Filmler · Diziler sekmeleri' },
  { id: 'fresh', label: 'Son eklenen filmler', hint: 'Listenize en son eklenenler' },
  { id: 'picks', label: 'Ne izleyeceğine karar veremedin mi?', hint: 'Türe göre film önerileri' },
  { id: 'new', label: 'Vizyondaki filmler', hint: 'Sinemada yeni çıkanlar' },
  { id: 'radio', label: 'Radyo & Müzik', hint: 'Favori radyolarınız' },
];

export const DEFAULT_ORDER = HOME_SECTIONS.map((s) => s.id);
export const sectionLabel = (id) => (HOME_SECTIONS.find((s) => s.id === id) || {}).label || id;

// Kayıtlı sıra → tam sıra: bilinmeyen ve tekrarlanan kimlikler atılır; kayıtta olmayan bölüm (yeni eklenen ya da
// kayıt bozuksa) varsayılan sıradaki önceki komşusunun hemen arkasına, yoksa en başa konur.
export function normalizeOrder(saved) {
  const out = [];
  for (const id of Array.isArray(saved) ? saved : []) {
    if (DEFAULT_ORDER.includes(id) && !out.includes(id)) out.push(id);
  }
  DEFAULT_ORDER.forEach((id, i) => {
    if (out.includes(id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.indexOf(DEFAULT_ORDER[j]);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    out.splice(at, 0, id);
  });
  return out;
}

// where: 'up' | 'down' | 'top' | 'bottom'. Tam sırayı döner; bilinmeyen kimlikte sıra değişmez.
export function moveSection(order, id, where) {
  const list = normalizeOrder(order);
  const i = list.indexOf(id);
  if (i < 0) return list;
  list.splice(i, 1);
  const to = where === 'top' ? 0 : where === 'bottom' ? list.length : where === 'up' ? Math.max(0, i - 1) : Math.min(list.length, i + 1);
  list.splice(to, 0, id);
  return list;
}

export const isDefaultOrder = (order) => normalizeOrder(order).every((id, i) => id === DEFAULT_ORDER[i]);
