// Takip ettikleriniz için kendiliğinden eşitleme: uygulama açılınca (ve öne gelince, en çok günde bir kez) sayfa açmadan
// takip edilen takımların önümüzdeki maçları ile takip edilen dizilerin yeni bölümleri için hatırlatıcılar kurulur.
// Kurulan hatırlatıcılar alarm olarak çalışır; uygulama kapalıyken de bildirim gelir. Saf mantık: ağ, depo ve plan listesi dışarıdan verilir.
import { hasPro as hasProDefault } from './membership.js';
import { loadMatches, dayStart, lgLine } from './sports.js';
import { loadMackolikDay } from './sports-mk.js';
import { LS_HOSTS, loadLiveScoreDay, mergeSources } from './sports-ls.js';
import { cleanFavs, applyAutoRemind, FAV_KEY } from './sports-fav.js';
import { normalizeFollowed, buildNewEpisodePlans, FOLLOW_STORAGE_KEY } from './series-follow.js';
import { readFlowCache, refreshFlow, FLOW_FRESH_MS } from './series-flow.js';

export const SYNC_KEY = 'follow.sync'; // { series, teams: son başarılı eşitleme zamanı, failAt: son başarısız deneme (0: yok) }
export const SYNC_EVERY_MS = 20 * 3600e3; // bir bölüm başarılı eşitlendikten sonra en erken bu kadar süre geçince yenilenir
export const SYNC_RETRY_MS = 3 * 3600e3; // başarısız denemeden sonra en erken bu kadar süre geçince yeniden denenir
export const SYNC_AHEAD_DAYS = 7; // maçlar için bakılan gün sayısı (bugün dahil +7)
const DAY = 864e5;

// Takip edilen takımların maçları: ESPN (tüm ligler, 8 gün) + gün gün ikinci kaynak (Spor ekranıyla aynı sıra: önce LiveScore, olmazsa Mackolik;
// Türkiye alt ligleri dahil) birleştirilir. Dönen: kurulan hatırlatıcı sayısı. Hiç kaynak yanıt vermezse hata fırlatır (eşitleme başarılı sayılmaz).
export async function syncTeams({ net, store, rem, sourceId, now = Date.now(), base, hasPro = hasProDefault, loadEspn = loadMatches, loadLs = loadLiveScoreDay, loadMk = loadMackolikDay } = {}) {
  const favs = cleanFavs(store.pref(FAV_KEY, []));
  if (!favs.length || !hasPro('teamfollow')) return 0;
  let espn = [];
  let ok = false;
  try {
    espn = (await loadEspn({ net, now, base })).matches || [];
    ok = true;
  } catch {
    /* ESPN alınamadı: ikinci kaynakla sürer */
  }
  const second = [];
  const d0 = dayStart(now);
  let lsDown = false; // bir gün LiveScore alınamadıysa kalan günlerde denenmez (süre kaybı olmasın)
  for (let i = 0; i <= SYNC_AHEAD_DAYS; i++) {
    const dayMs = d0 + i * DAY;
    let got = null;
    if (!lsDown) {
      try {
        got = await loadLs({ net, dayMs, now, hosts: LS_HOSTS });
      } catch {
        lsDown = true;
      }
    }
    if (!got) {
      try {
        got = await loadMk({ net, dayMs, now });
      } catch {
        /* bu gün alınamadı */
      }
    }
    if (got) {
      second.push(...(got.matches || []));
      ok = true;
    }
  }
  if (!ok) throw new Error('Maç bilgisi alınamadı');
  const matches = second.length ? mergeSources(espn, second).matches : espn;
  // Yayıncı kanalı bu yolda bilinmez (Spor ekranı açılınca eşleşir); bildirimde lig adı görünür.
  const info = (m) => ({ chId: '', chName: lgLine(m), src: sourceId ? sourceId() : '' });
  return applyAutoRemind({ matches, favs, rem, store, now, info }).length;
}

// Takip edilen dizilerin "yeni bölüm / yeni sezon" yayınları: haftalık akış (önbellek 3 saatten tazeyse o) yüklenir.
export async function syncSeries({ net, store, rem, liveItems, now = Date.now(), base, hasPro = hasProDefault, readFlow = readFlowCache, refresh = refreshFlow } = {}) {
  const followed = normalizeFollowed(store.pref(FOLLOW_STORAGE_KEY, []));
  if (!followed.length || !hasPro('seriesfollow') || !rem) return 0;
  let data = await readFlow(store, now);
  if (!data || now - data.at > FLOW_FRESH_MS) data = await refresh({ net, store, base, nowMs: now, prev: data });
  const plans = buildNewEpisodePlans(data.days || [], followed, liveItems ? liveItems() : [], rem.list() || [], now);
  for (const plan of plans) rem.set(plan);
  return plans.length;
}

// Sıra: dizi, sonra takım; biri başarısız olsa da diğeri çalışır. Her bölümün son başarı zamanı ayrı tutulur (yeni takip eklenince o bölüm hemen
// sıraya girer); başarısız deneme 3 saat sonra yeniden denenir. force: zamanlara bakmaz.
// Döner: { skipped: 'fresh' | 'retry' | 'offline' | 'none' } ya da { series, teams, failed }.
export async function runFollowSync({ net, store, rem, liveItems, sourceId, now = Date.now(), base, force = false, online = true, hasPro = hasProDefault, deps = {} } = {}) {
  const last = store.pref(SYNC_KEY, null) || {};
  const followed = normalizeFollowed(store.pref(FOLLOW_STORAGE_KEY, []));
  const favs = cleanFavs(store.pref(FAV_KEY, []));
  const due = (part) => force || now - (Number(last[part]) || 0) >= SYNC_EVERY_MS;
  const wantSeries = followed.length > 0 && hasPro('seriesfollow') && due('series');
  const wantTeams = favs.length > 0 && hasPro('teamfollow') && due('teams');
  if (!wantSeries && !wantTeams) return { skipped: 'fresh' }; // takip yok ya da henüz zamanı gelmedi: ağ kullanılmaz
  if (!force && last.failAt && now - Number(last.failAt) < SYNC_RETRY_MS) return { skipped: 'retry' };
  if (!online) return { skipped: 'offline' };
  const out = { series: 0, teams: 0, failed: [] };
  const next = { ...last, failAt: 0 };
  if (wantSeries) {
    try {
      out.series = await syncSeries({ net, store, rem, liveItems, now, base, hasPro, ...(deps.series || {}) });
      next.series = now;
    } catch {
      out.failed.push('series');
    }
  }
  if (wantTeams) {
    try {
      out.teams = await syncTeams({ net, store, rem, sourceId, now, hasPro, ...(deps.teams || {}) });
      next.teams = now;
    } catch {
      out.failed.push('teams');
    }
  }
  if (out.failed.length) next.failAt = now;
  store.setPref(SYNC_KEY, next);
  return out;
}
