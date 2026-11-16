// Müzik çalarda sıra: karışık çalma ve tekrarlama. Saf mantık; durum (çalınanlar kümesi, ayarlar) player-ui.js'te tutulur.

export const REPEATS = ['off', 'all', 'one']; // kapalı → tüm liste → tek şarkı
export const REPEAT_LABEL = { off: 'Tekrar kapalı', all: 'Listeyi tekrarla', one: 'Şarkıyı tekrarla' };
export const normalizeRepeat = (v) => (REPEATS.includes(v) ? v : 'off');
export const nextRepeat = (v) => REPEATS[(REPEATS.indexOf(normalizeRepeat(v)) + 1) % REPEATS.length];

// Sıradaki şarkının dizini; çalınacak şarkı yoksa -1.
//   index: çalan şarkı, count: listedeki şarkı sayısı, delta: +1 sonraki / -1 önceki
//   auto: şarkı kendiliğinden bitti (true) ya da düğmeye basıldı (false). "Şarkıyı tekrarla" yalnız kendiliğinden bitişte aynı şarkıyı verir.
//   played: bu turda çalınmış dizinler (karışık çalmada aynı şarkı tur bitmeden yinelenmez)
//   rnd: 0..1 rastgele sayı üreteci (test için verilebilir)
export function nextIndex({ index, count, delta = 1, repeat = 'off', shuffle = false, auto = false, played = [], rnd = Math.random }) {
  if (!(count > 0)) return -1;
  const rep = normalizeRepeat(repeat);
  if (auto && rep === 'one') return index;
  if (count === 1) return rep === 'off' && auto ? -1 : 0;
  if (shuffle && delta > 0) {
    const seen = new Set(played);
    seen.add(index);
    let pool = [];
    for (let i = 0; i < count; i++) if (!seen.has(i)) pool.push(i);
    if (!pool.length) {
      if (auto && rep === 'off') return -1; // tur bitti, tekrar kapalı: çalma durur
      for (let i = 0; i < count; i++) if (i !== index) pool.push(i); // yeni tur: yalnız çalan şarkı hemen yinelenmez
    }
    return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
  }
  const i = index + (delta < 0 ? -1 : 1);
  if (i >= 0 && i < count) return i;
  if (rep === 'all' || (!auto && shuffle)) return (i + count) % count; // liste tekrarında baştan / sondan sürer
  return -1;
}

// Şarkı adından renk tonu (0..359): arka plan görseli her şarkıda farklı, aynı şarkıda hep aynı olur.
export function hueOf(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}
