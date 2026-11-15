// Ana ekran ek bölümleri (saf işlevler): saate göre karşılama, "Kaldığın yerden devam et" listesi, liste durum özeti.

// Saat 0–23 → karşılama metni ve simgesi.
export function greeting(hour) {
  const h = Number(hour);
  if (h >= 5 && h < 11) return { text: 'İyi sabahlar, iyi seyirler', emoji: '🌅' };
  if (h >= 11 && h < 17) return { text: 'İyi günler, iyi seyirler', emoji: '☀️' };
  if (h >= 17 && h < 22) return { text: 'İyi akşamlar, iyi seyirler', emoji: '🌙' };
  return { text: 'İyi geceler, iyi seyirler', emoji: '🌙' };
}

// Yarım kalan izlemelerden (en yeni önce) katalogdaki yapımlar: film kendisi, bölüm ise dizisi; aynı yapım bir kez.
// lookup(kind, id) → katalog öğesi ya da undefined. Dönüş: [{ kind: 'movie' | 'series', it }]
export function homeContinue(progress, lookup, max = 10) {
  const seen = new Set();
  const out = [];
  for (const p of Array.isArray(progress) ? progress : []) {
    const kind = p && p.kind === 'movie' ? 'movie' : p && p.kind === 'episode' ? 'series' : '';
    const id = kind === 'movie' ? p.id : kind === 'series' ? p.parent : null;
    if (!kind || !id) continue;
    const key = kind + ':' + id;
    if (seen.has(key)) continue;
    const it = lookup(kind, id);
    if (!it) continue;
    seen.add(key);
    out.push({ kind, it });
    if (out.length >= max) break;
  }
  return out;
}

// "0 Canlı TV · 0 VOD · 0 liste" biçiminde liste durum özeti.
export const statusText = ({ live = 0, vod = 0, lists = 0 } = {}) => `${live} Canlı TV · ${vod} VOD · ${lists} liste`;
