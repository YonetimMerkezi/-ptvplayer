// Planlananlar: program hatırlatıcıları ve zamanlı kayıtlar. Saf mantık; saklama ve yerel zamanlayıcı app.js'te.
// Plan: { id, kind: 'rem' | 'rec', chId, chName, title, s, e, at, url?, headers? }
//   at: tetiklenme zamanı (ms). rem → program başlamadan LEAD dk önce; rec → başlamadan 1 dk önce kayıt açılır.
export const REMIND_LEAD_MIN = 5;
export const REC_PRE_MS = 60000;
export const REC_POST_MS = 2 * 60000;

// Kaynak numarası kimliğe girer: iki kaynakta aynı kanal numarası çakışmasın.
export const planId = (kind, chId, s, src = '') => (src ? `${kind}:${src}:${chId}:${s}` : `${kind}:${chId}:${s}`);

export function makePlan(kind, item, p, { lead = REMIND_LEAD_MIN, url = '', headers = null, src = '' } = {}) {
  const base = { id: planId(kind, item.id, p.s, src), kind, src, chId: item.id, chName: item.name, title: p.t || 'Program', s: p.s, e: p.e };
  if (kind === 'rec') return { ...base, at: p.s - REC_PRE_MS, until: p.e + REC_POST_MS, url, headers };
  return { ...base, at: p.s - Math.max(0, lead) * 60000 };
}

// Süresi dolmamış planlar, zamana göre sıralı (rec bitişine, rem başlangıcına kadar geçerli)
export function activePlans(list, now = Date.now()) {
  return (Array.isArray(list) ? list : [])
    .filter((x) => x && x.id && Number.isFinite(x.at) && (x.kind === 'rec' ? (x.until || x.e) : x.e) > now)
    .sort((a, b) => a.at - b.at);
}

export function addPlan(list, plan) {
  return activePlans(list.filter((x) => x.id !== plan.id).concat(plan), 0);
}

export const removePlan = (list, id) => list.filter((x) => x.id !== id);
export const hasPlan = (list, id) => list.some((x) => x.id === id);

// Aynı saatte iki kayıt planı çakışır (tek kayıt yuvası var)
export function recConflict(list, plan) {
  if (plan.kind !== 'rec') return null;
  const a0 = plan.at;
  const a1 = plan.until;
  return list.find((x) => x.kind === 'rec' && x.id !== plan.id && x.at < a1 && (x.until || x.e) > a0) || null;
}

export function planWhen(plan, now = Date.now(), fmt = (ms) => new Date(ms).toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) {
  if (plan.kind === 'rec' && plan.at <= now && (plan.until || plan.e) > now) return 'Kayıt sürüyor olmalı';
  return fmt(plan.s);
}
