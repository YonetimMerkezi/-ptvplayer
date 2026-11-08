// Kategori düzeni: sıralama, gizleme ve özel klasörler. Saf mantık: durum dışarıda (store) saklanır,
// her işlem yeni bir tercih nesnesi döndürür.
//
// prefs = { order: [kimlik], hidden: [kimlik], locked: [kimlik], folders: [{ id, name, items: [öğe kimliği] }] }
// Kimlikler: grup "g:<ad>", klasör "f:<id>".

export const emptyPrefs = () => ({ order: [], hidden: [], locked: [], folders: [] });

export const groupKey = (name) => 'g:' + name;
export const folderKey = (id) => 'f:' + id;

const strings = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []);

// Bozuk/eski kayıtları güvenle toparlar.
export function normalizePrefs(p) {
  const folders = [];
  const seen = new Set();
  for (const f of Array.isArray(p && p.folders) ? p.folders : []) {
    if (!f || typeof f.id !== 'string' || typeof f.name !== 'string' || seen.has(f.id)) continue;
    seen.add(f.id);
    folders.push({ id: f.id, name: f.name, items: [...new Set(strings(f.items))] });
  }
  return { order: [...new Set(strings(p && p.order))], hidden: [...new Set(strings(p && p.hidden))], locked: [...new Set(strings(p && p.locked))], folders };
}

// base: [{ id, ... }] varsayılan sırada; kayıtlı sıradakiler önce (o sırayla), kalanlar varsayılan sırayla arkadan gelir.
export function arrange(base, prefs) {
  const pos = new Map(prefs.order.map((id, i) => [id, i]));
  const known = base.filter((r) => pos.has(r.id)).sort((a, b) => pos.get(a.id) - pos.get(b.id));
  return known.concat(base.filter((r) => !pos.has(r.id)));
}

export const isHidden = (prefs, id) => prefs.hidden.includes(id);

export function toggleHidden(prefs, id) {
  const hidden = isHidden(prefs, id) ? prefs.hidden.filter((x) => x !== id) : [...prefs.hidden, id];
  return { ...prefs, hidden };
}

// ids: şu anki tam sıra (gizliler dahil). where: 'up' | 'down' | 'top'. Sonuç tam sırayı kaydeder.
export function move(prefs, ids, id, where) {
  const i = ids.indexOf(id);
  if (i < 0) return prefs;
  const list = ids.slice();
  list.splice(i, 1);
  const to = where === 'top' ? 0 : where === 'up' ? Math.max(0, i - 1) : Math.min(list.length, i + 1);
  list.splice(to, 0, id);
  return { ...prefs, order: list };
}

// Kilitli kategori (çocuk kilidi): içine girmek ve öğelerini "Tümü"nde/aramada görmek için uygulama şifresi gerekir.
export const isLocked = (prefs, id) => prefs.locked.includes(id);

export function toggleLocked(prefs, id) {
  const locked = isLocked(prefs, id) ? prefs.locked.filter((x) => x !== id) : [...prefs.locked, id];
  return { ...prefs, locked };
}

export function lockedGroupNames(prefs) {
  return new Set(prefs.locked.filter((id) => id.startsWith('g:')).map((id) => id.slice(2)));
}

export const resetOrderAndHidden = (prefs) => ({ ...prefs, order: [], hidden: [] });

// Gizli grup adları (öğe süzmesi için)
export function hiddenGroupNames(prefs) {
  return new Set(prefs.hidden.filter((id) => id.startsWith('g:')).map((id) => id.slice(2)));
}

// ---- klasörler ----

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const cleanName = (n) => String(n == null ? '' : n).replace(/\s+/g, ' ').trim().slice(0, 60);

export function addFolder(prefs, name, id = newId()) {
  const nm = cleanName(name);
  if (!nm) return { prefs, folder: null };
  const folder = { id, name: nm, items: [] };
  // Sıra özelleştirilmişse yeni klasör en üstte görünsün
  const order = prefs.order.length ? [folderKey(id), ...prefs.order] : prefs.order;
  return { prefs: { ...prefs, folders: [...prefs.folders, folder], order }, folder };
}

export function renameFolder(prefs, id, name) {
  const nm = cleanName(name);
  if (!nm) return prefs;
  return { ...prefs, folders: prefs.folders.map((f) => (f.id === id ? { ...f, name: nm } : f)) };
}

export function deleteFolder(prefs, id) {
  const k = folderKey(id);
  return {
    order: prefs.order.filter((x) => x !== k),
    hidden: prefs.hidden.filter((x) => x !== k),
    locked: prefs.locked.filter((x) => x !== k),
    folders: prefs.folders.filter((f) => f.id !== id),
  };
}

export const folderOf = (prefs, id) => prefs.folders.find((f) => f.id === id) || null;
export const inFolder = (prefs, id, itemId) => {
  const f = folderOf(prefs, id);
  return !!f && f.items.includes(itemId);
};

// Öğeyi klasöre ekler/çıkarır. { prefs, on }
export function toggleInFolder(prefs, id, itemId) {
  const f = folderOf(prefs, id);
  if (!f) return { prefs, on: false };
  const on = !f.items.includes(itemId);
  const items = on ? [...f.items, itemId] : f.items.filter((x) => x !== itemId);
  return { prefs: { ...prefs, folders: prefs.folders.map((x) => (x.id === id ? { ...x, items } : x)) }, on };
}
