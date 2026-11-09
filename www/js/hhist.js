// Yayın kalitesi geçmişi ve gizlenen kanallar (saf mantık; saklama app.js'te).
// Geçmiş: { kanalNo: [durum, ms, zaman] }  durum: 1 çalışıyor · 0 çalışmıyor · -1 doğrulanamadı
// Gizlenen kanallar: { kanalNo: ad }  (ad, geri getirme listesinde katalog olmadan da gösterilsin diye saklanır)
export const HIST_MAX = 3000;
export const HIST_TTL = 30 * 86400000;

const code = (ok) => (ok === true ? 1 : ok === false ? 0 : -1);

// Bir sonucu geçmişe ekler; sınırı aşınca en eski kayıtlar atılır. Yeni bir nesne döner.
export function recordResult(hist, id, r, now = Date.now(), max = HIST_MAX) {
  const out = { ...(hist || {}), [id]: [code(r.ok), r.ms == null ? -1 : Math.round(r.ms), now] };
  const keys = Object.keys(out);
  if (keys.length > max) {
    keys.sort((a, b) => out[a][2] - out[b][2]);
    for (const k of keys.slice(0, keys.length - max)) delete out[k];
  }
  return out;
}

// Kanalın son kayıtlı sonucu ({ ok, ms, at, hist: true }); yoksa ya da süresi dolduysa null.
export function lastResult(hist, id, now = Date.now(), ttl = HIST_TTL) {
  const r = hist && hist[id];
  if (!Array.isArray(r) || now - r[2] > ttl) return null;
  return { ok: r[0] === 1 ? true : r[0] === 0 ? false : null, ms: r[1] < 0 ? null : r[1], at: r[2], hist: true };
}

// Süresi dolan kayıtları atar (açılışta ya da kaydederken).
export function pruneHist(hist, now = Date.now(), ttl = HIST_TTL) {
  const out = {};
  for (const [k, r] of Object.entries(hist || {})) if (Array.isArray(r) && now - r[2] <= ttl) out[k] = r;
  return out;
}

// Gizlenen kanalları ekler ({ no: ad }); items: { id, name }.
export function hideChannels(map, items) {
  const out = { ...(map || {}) };
  for (const it of items) out[it.id] = it.name || '';
  return out;
}

// ids verilmezse hepsini geri getirir.
export function restoreChannels(map, ids) {
  if (!ids) return {};
  const drop = new Set(ids);
  const out = {};
  for (const [k, v] of Object.entries(map || {})) if (!drop.has(k)) out[k] = v;
  return out;
}

export const hiddenCount = (map) => Object.keys(map || {}).length;

// Boş haritada aynı dizi döner (gereksiz kopya yok).
export const applyHidden = (list, map) => (hiddenCount(map) ? list.filter((it) => !(it.id in map)) : list);
