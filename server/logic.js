// Üyelik cihaz bağlama (tek cihaz kuralı): bir abonelik (sub), telefon ve TV için birer cihaza bağlanır.
// Saf mantık: depolama dışarıdan verilir (worker.js'te Durable Object SQLite, testlerde Map). Ağ ve saat dışarıdan gelir.
//
// İstek: { s: abonelik kimliği (64 onaltılık), d: cihaz kimliği (12 onaltılık), k: 'phone' | 'tv', take: true | false }
// Yanıt: { status: 'ok' | 'other' | 'limit' | 'bad', ... }
//   ok     : bu cihaz bağlı (moved: true → taşındı, fresh: true → ilk bağlama)
//   other  : abonelik başka bir cihaza bağlı (since: o cihaza bağlandığı an)
//   limit  : taşıma sınırı doldu (next: yeniden taşınabileceği an)
//   bad    : geçersiz istek
export const DAY = 86400e3;
export const MOVE_LIMIT = 2; // bir abonelik, tür başına, MOVE_WINDOW içinde en çok bu kadar kez cihaz değiştirir
export const MOVE_WINDOW = 30 * DAY;
export const SEEN_EVERY = DAY; // "son görülme" en çok günde bir yazılır (ücretsiz yazma kotasını korur)

export const isSub = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
export const isDev = (d) => typeof d === 'string' && /^[0-9a-f]{12}$/.test(d);
export const kindOf = (k) => (k === 'tv' ? 'tv' : 'phone'); // tablet de telefon sayılır

// store: { get(sub, kind) → { dev, since, at, moves: number[] } | null, put(sub, kind, row) } (eşzamanlı: araya await girmez)
export function claim(store, req, now = Date.now()) {
  const r = req || {};
  if (!isSub(r.s) || !isDev(r.d)) return { status: 'bad' };
  const kind = kindOf(r.k);
  const row = store.get(r.s, kind);
  if (!row) {
    store.put(r.s, kind, { dev: r.d, since: now, at: now, moves: [] });
    return { status: 'ok', fresh: true };
  }
  if (row.dev === r.d) {
    if (now - row.at >= SEEN_EVERY) store.put(r.s, kind, { ...row, at: now });
    return { status: 'ok' };
  }
  if (r.take !== true) return { status: 'other', since: row.since };
  const recent = row.moves.filter((t) => now - t < MOVE_WINDOW);
  if (recent.length >= MOVE_LIMIT) return { status: 'limit', next: Math.min(...recent) + MOVE_WINDOW };
  store.put(r.s, kind, { dev: r.d, since: now, at: now, moves: [...recent, now] });
  return { status: 'ok', moved: true };
}
