// TV rehberi zaman çizelgesi: bir kanalın programlarını pencereye (ws..we, ms) oturtur.
// Çıktı blokları birbirine binmez; başlangıç/süre dakika cinsindendir (pencere başından).
export function guideBlocks(list, ws, we, now = Date.now()) {
  const out = [];
  let cursor = ws;
  for (const p of list || []) {
    if (!p || !Number.isFinite(p.s) || !Number.isFinite(p.e)) continue;
    const s = Math.max(p.s, cursor);
    const e = Math.min(p.e, we);
    if (!(e - s >= 60000)) continue; // pencere dışında ya da başka programın içinde kalan / 1 dakikadan kısa
    cursor = e;
    out.push({ p, m: (s - ws) / 60000, d: (e - s) / 60000, cls: p.s <= now && p.e > now ? ' now' : p.e <= now ? ' past' : '' });
  }
  return out;
}
