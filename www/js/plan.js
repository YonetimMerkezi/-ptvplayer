// Planlananlar: program hatırlatıcıları ve zamanlı kayıtlar. Saf mantık; saklama ve yerel zamanlayıcı app.js'te.
// Plan: { id, kind: 'rem' | 'rec', chId, chName, title, s, e, at, url?, headers? }
//   at: tetiklenme zamanı (ms). rem → program başlamadan LEAD dk önce; rec → başlamadan 1 dk önce kayıt açılır.
import { fold } from './util.js';

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

// ---- maç hatırlatıcıları: kind 'rem' (yerel taraf aynı bildirimi gösterir), program yerine maç; kanal varsa dokununca açılır ----
export const MATCH_LEADS = [0, 5, 15, 30, 60]; // dakika önce (0 = başlarken)
export const MATCH_LEAD_DEFAULT = 15;
export const MATCH_LEN_MS = 3 * 3600000;

export const leadLabel = (min) => (min <= 0 ? 'Başlarken' : min >= 60 ? `${min / 60} saat önce` : `${min} dk önce`);

// Maç kimliği kaynaklar arasında değişebilir (ESPN / yayın akışı): saat + takım adları anahtardır.
export const matchPlanId = (m) => `mrem:${m.t}:${fold(m.home.label || m.home.name)}:${fold(m.away.label || m.away.name)}`;

// Başlamamış maç mı? (başlamış ya da bitmiş maça hatırlatıcı kurulmaz)
export const canRemind = (m, now = Date.now()) => !!m && m.state === 'pre' && !m.off && Number.isFinite(m.t) && m.t > now;

export function makeMatchPlan(m, { lead = MATCH_LEAD_DEFAULT, chId = '', chName = '', src = '' } = {}) {
  const min = MATCH_LEADS.includes(lead) ? lead : MATCH_LEAD_DEFAULT;
  return {
    id: matchPlanId(m), kind: 'rem', match: true, lead: min, src, chId, chName,
    title: `${m.home.label || m.home.name} – ${m.away.label || m.away.name}`,
    s: m.t, e: m.t + MATCH_LEN_MS, at: m.t - min * 60000,
  };
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
