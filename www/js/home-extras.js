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

// "Son izlenen" satırları: kind = 'live' | 'movie' | 'series'. recents = son izlenenler kaydı, progress = ilerleme kayıtları (dizi için
// bölüm izlemeleri de sayılır: bu özellikten önce izlenen diziler kayıtta olmasa da görünsün). En yeni önce, her yapım bir kez.
// lookup(kind, id|kayıt) → katalog öğesi ya da undefined. Dönüş: [katalog öğesi, …]
export function homeRecent(kind, recents, progress, lookup, max = 12) {
  const cand = [];
  for (const r of Array.isArray(recents) ? recents : []) {
    if (r && r.kind === kind && r.id) cand.push({ at: Number(r.at) || 0, entry: r });
  }
  if (kind === 'series') {
    for (const p of Array.isArray(progress) ? progress : Object.values(progress || {})) {
      if (p && p.kind === 'episode' && p.parent) cand.push({ at: Number(p.at) || 0, entry: { id: p.parent, name: '' } });
    }
  }
  cand.sort((a, b) => b.at - a.at);
  const seen = new Set();
  const out = [];
  for (const { entry } of cand) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const it = lookup(kind, entry);
    if (!it) continue;
    out.push(it);
    if (out.length >= max) break;
  }
  return out;
}

// "0 Canlı TV · 0 VOD · 0 liste" biçiminde liste durum özeti.
export const statusText = ({ live = 0, vod = 0, lists = 0 } = {}) => `${live} Canlı TV · ${vod} VOD · ${lists} liste`;

// Ana ekrandaki tek "Son izlenenler" bölümünün sekmeleri; go = "Tümünü gör" düğmesinin gideceği yer.
export const RECENT_TABS = [
  { kind: 'live', label: 'Kanallar', icon: '📺', go: 'recent' },
  { kind: 'movie', label: 'Filmler', icon: '🎬', go: 'recent-movie' },
  { kind: 'series', label: 'Diziler', icon: '📚', go: 'recent-series' },
];

// Her türün en son izleme zamanı (ms). Diziler için bölüm izlemeleri de sayılır (homeRecent ile aynı kaynak).
export function recentLatest(recents, progress) {
  const out = { live: 0, movie: 0, series: 0 };
  for (const r of Array.isArray(recents) ? recents : []) {
    if (r && r.id && r.kind in out) out[r.kind] = Math.max(out[r.kind], Number(r.at) || 0);
  }
  for (const p of Array.isArray(progress) ? progress : Object.values(progress || {})) {
    if (p && p.kind === 'episode' && p.parent) out.series = Math.max(out.series, Number(p.at) || 0);
  }
  return out;
}

// Açık sekme: seçilen sekmede içerik varsa o; yoksa (ya da hiç seçilmediyse) en son izlemenin olduğu sekme, eşitse
// canlı → film → dizi sırası. counts = { live, movie, series } öğe sayıları; hiçbirinde içerik yoksa ''.
export function recentTabPick(counts, latest, selected = '') {
  const has = (k) => Number(counts && counts[k]) > 0;
  if (selected && has(selected) && RECENT_TABS.some((t) => t.kind === selected)) return selected;
  let best = '';
  for (const t of RECENT_TABS) {
    if (!has(t.kind)) continue;
    if (!best || (Number(latest && latest[t.kind]) || 0) > (Number(latest && latest[best]) || 0)) best = t.kind;
  }
  return best;
}
