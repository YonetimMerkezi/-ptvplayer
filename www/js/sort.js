// Liste sıralama: A→Z, Z→A, eklenme zamanı, puan. Saf mantık (aynı girdi → aynı çıktı, kararlı).
import { fold } from './util.js';

// Intl olmayan ya da sınırlı eski TV tarayıcılarında (webOS 3) Türkçe duyarsız, sayıları değerine göre karşılaştıran yedek kullanılır.
function dogal(a, b) {
  const x = fold(a).split(/(\d+)/);
  const y = fold(b).split(/(\d+)/);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    if (i % 2 === 1) return Number(x[i]) - Number(y[i]) || (x[i] < y[i] ? -1 : 1);
    return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length;
}
function yapCollator() {
  try {
    if (typeof Intl !== 'undefined' && Intl.Collator) return new Intl.Collator('tr', { sensitivity: 'base', numeric: true });
  } catch (e) {
    /* yedeğe geç */
  }
  return { compare: dogal };
}
const collator = yapCollator();

export const yedekKarsilastir = dogal;

export const SORTS = [
  ['default', 'Varsayılan sıra'],
  ['az', 'A → Z'],
  ['za', 'Z → A'],
  ['new', 'Eklenme: yeniden eskiye'],
  ['old', 'Eklenme: eskiden yeniye'],
  ['rate', 'Puan: yüksekten düşüğe'],
];

export const isSortMode = (m) => SORTS.some(([k]) => k === m);

// Eklenme zamanı yoksa (M3U) listedeki sıra yerine geçer: liste sonuna eklenenler daha yeni sayılır.
export function sortItems(items, mode) {
  if (!mode || mode === 'default' || items.length < 2) return items;
  const rows = items.map((it, i) => ({ it, i, t: it.added > 0 ? it.added : 0, r: Number(it.rating) > 0 ? Number(it.rating) : 0 }));
  const byName = (a, b) => collator.compare(a.it.name, b.it.name) || a.i - b.i;
  if (mode === 'az') rows.sort(byName);
  else if (mode === 'za') rows.sort((a, b) => -collator.compare(a.it.name, b.it.name) || a.i - b.i);
  else if (mode === 'new') rows.sort((a, b) => b.t - a.t || b.i - a.i);
  else if (mode === 'old') rows.sort((a, b) => a.t - b.t || a.i - b.i);
  else if (mode === 'rate') rows.sort((a, b) => b.r - a.r || a.i - b.i);
  else return items;
  return rows.map((r) => r.it);
}
