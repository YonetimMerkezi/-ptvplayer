// Kategori içi sıralama: A→Z, Z→A, eklenme zamanı. Saf mantık (aynı girdi → aynı çıktı, kararlı).

const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });

export const SORTS = [
  ['default', 'Varsayılan sıra'],
  ['az', 'A → Z'],
  ['za', 'Z → A'],
  ['new', 'Eklenme: yeniden eskiye'],
  ['old', 'Eklenme: eskiden yeniye'],
];

export const isSortMode = (m) => SORTS.some(([k]) => k === m);

// Eklenme zamanı yoksa (M3U) listedeki sıra yerine geçer: liste sonuna eklenenler daha yeni sayılır.
export function sortItems(items, mode) {
  if (!mode || mode === 'default' || items.length < 2) return items;
  const rows = items.map((it, i) => ({ it, i, t: it.added > 0 ? it.added : 0 }));
  const byName = (a, b) => collator.compare(a.it.name, b.it.name) || a.i - b.i;
  if (mode === 'az') rows.sort(byName);
  else if (mode === 'za') rows.sort((a, b) => -collator.compare(a.it.name, b.it.name) || a.i - b.i);
  else if (mode === 'new') rows.sort((a, b) => b.t - a.t || b.i - a.i);
  else if (mode === 'old') rows.sort((a, b) => a.t - b.t || a.i - b.i);
  else return items;
  return rows.map((r) => r.it);
}
