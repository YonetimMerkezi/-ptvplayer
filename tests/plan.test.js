import test from 'node:test';
import assert from 'node:assert/strict';
import { makePlan, activePlans, addPlan, removePlan, hasPlan, recConflict, planId, REMIND_LEAD_MIN, MATCH_LEADS, MATCH_LEAD_DEFAULT, leadLabel, matchPlanId, canRemind, makeMatchPlan } from '../www/js/plan.js';

const it = { id: 'x10', name: 'TRT 1' };
const prog = (s, m = 60, t = 'Haber') => ({ s, e: s + m * 60000, t });
const T = Date.UTC(2026, 10, 9, 12, 0);

test('hatırlatıcı programdan önce tetiklenir, kayıt bir dakika önce başlar ve iki dakika sonra biter', () => {
  const r = makePlan('rem', it, prog(T));
  assert.equal(r.at, T - REMIND_LEAD_MIN * 60000);
  assert.equal(r.id, planId('rem', 'x10', T));
  const k = makePlan('rec', it, prog(T), { url: 'http://h/live/u/p/10.ts' });
  assert.equal(k.at, T - 60000);
  assert.equal(k.until, T + 3600000 + 120000);
  assert.equal(k.url, 'http://h/live/u/p/10.ts');
});
test('kaynak numarası plan kimliğine girer; farklı kaynaktaki aynı kanal numarası çakışmaz', () => {
  const a = makePlan('rem', it, prog(T), { src: 's1' });
  const b = makePlan('rem', it, prog(T), { src: 's2' });
  assert.notEqual(a.id, b.id);
  assert.equal(a.src, 's1');
  assert.equal(a.id, planId('rem', 'x10', T, 's1'));
  assert.equal(addPlan(addPlan([], a), b).length, 2);
});
test('ekle/kaldır aynı programı yinelemez; biten planlar elenir; zamana göre sıralanır', () => {
  let l = [];
  l = addPlan(l, makePlan('rem', it, prog(T + 7200000)));
  l = addPlan(l, makePlan('rem', it, prog(T)));
  l = addPlan(l, makePlan('rem', it, prog(T)));
  assert.equal(l.length, 2);
  assert.ok(l[0].at < l[1].at);
  assert.ok(hasPlan(l, planId('rem', 'x10', T)));
  l = removePlan(l, planId('rem', 'x10', T));
  assert.equal(l.length, 1);
  assert.equal(activePlans(l, T + 4 * 3600000).length, 0);
  assert.equal(activePlans(null).length, 0);
});
test('çakışan kayıt planı bulunur; hatırlatıcı çakışmaz', () => {
  const a = makePlan('rec', it, prog(T), { url: 'u' });
  const b = makePlan('rec', { id: 'x11', name: 'Başka' }, prog(T + 1800000), { url: 'v' });
  assert.equal(recConflict([a], b).id, a.id);
  const far = makePlan('rec', { id: 'x11', name: 'Başka' }, prog(T + 3 * 3600000), { url: 'v' });
  assert.equal(recConflict([a], far), null);
  assert.equal(recConflict([a], makePlan('rem', it, prog(T))), null);
});

test('maç hatırlatıcısı: seçilen süre kadar önce, kanalı ve adı plana girer; kimlik kaynaklar arasında aynı kalır', () => {
  const m = { id: 'espn:1', t: T, state: 'pre', home: { label: 'Galatasaray' }, away: { label: 'Fenerbahçe' } };
  const p = makeMatchPlan(m, { lead: 30, chId: 'c7', chName: 'beIN Sports 1', src: 's1' });
  assert.equal(p.kind, 'rem');
  assert.equal(p.at, T - 30 * 60000);
  assert.equal(p.s, T);
  assert.equal(p.title, 'Galatasaray – Fenerbahçe');
  assert.equal(p.chId, 'c7');
  assert.equal(p.chName, 'beIN Sports 1');
  assert.equal(p.lead, 30);
  assert.ok(p.e > T, 'maç süresi kadar listede kalır');
  // başka kaynaktan aynı maç (farklı kimlik, ı/i ve büyük/küçük harf farkı) aynı plan kimliğini verir
  const other = { id: 'se:9', t: T, state: 'pre', home: { name: 'GALATASARAY' }, away: { name: 'Fenerbahce' } };
  assert.equal(matchPlanId(other), matchPlanId(m));
  assert.notEqual(matchPlanId({ ...m, t: T + 3600000 }), matchPlanId(m));
  assert.equal(makeMatchPlan(m, { lead: 0 }).at, T, 'başlarken');
  assert.equal(makeMatchPlan(m, { lead: 7 }).at, T - MATCH_LEAD_DEFAULT * 60000, 'geçersiz süre varsayılana döner');
  assert.equal(makeMatchPlan(m).chId, '');
  const list = addPlan([], p);
  assert.ok(hasPlan(list, matchPlanId(m)));
  assert.equal(activePlans(list, T + 3600000).length, 1, 'maç sürerken liste hâlâ gösterir');
  assert.equal(activePlans(list, T + 4 * 3600000).length, 0, 'maçtan çok sonra düşer');
  assert.deepEqual(removePlan(list, p.id), []);
});

test('maç hatırlatıcısı: yalnız başlamamış maça kurulur; süre etiketleri', () => {
  const base = { t: T, state: 'pre', home: { name: 'A' }, away: { name: 'B' } };
  assert.equal(canRemind(base, T - 1000), true);
  assert.equal(canRemind(base, T + 1000), false, 'saati geçmiş');
  assert.equal(canRemind({ ...base, state: 'in' }, T - 1000), false);
  assert.equal(canRemind({ ...base, state: 'post' }, T - 1000), false);
  assert.equal(canRemind({ ...base, off: true }, T - 1000), false, 'ertelenen/iptal');
  assert.equal(canRemind(null), false);
  assert.deepEqual(MATCH_LEADS.map(leadLabel), ['Başlarken', '5 dk önce', '15 dk önce', '30 dk önce', '1 saat önce']);
});
