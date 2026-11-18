import test from 'node:test';
import assert from 'node:assert/strict';
import { memberState, canUse, canUseApp, canUsePro, enforced, isProFeature, PRO_FEATURES, TRIAL_DAYS, BILLING_READY, needPro, setProGate, stateText } from '../www/js/membership.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 16);

test('satın alma bağlanana kadar kilitler kapalı; yalnız önizleme seçilmiş cihazda açılır', () => {
  assert.equal(BILLING_READY, false);
  assert.equal(enforced(''), false);
  assert.equal(enforced('bilinmeyen'), false);
  assert.equal(enforced('expired'), true);
});

test('deneme: 7 gün, kalan gün yukarı yuvarlanır, süre dolunca kapanır', () => {
  assert.equal(TRIAL_DAYS, 7);
  assert.deepEqual(memberState({ start: NOW, now: NOW }), { tier: 'trial', until: NOW + 7 * DAY, daysLeft: 7 });
  assert.equal(memberState({ start: NOW, now: NOW + 6.5 * DAY }).daysLeft, 1);
  const end = memberState({ start: NOW, now: NOW + 7 * DAY });
  assert.equal(end.tier, 'expired');
  assert.equal(canUseApp(end), false);
  // saat geri alınmışsa (başlangıç gelecekte) deneme uzamaz
  assert.equal(memberState({ start: NOW + 30 * DAY, now: NOW }).until, NOW + 7 * DAY);
});

test('üyelik: Standart uygulamayı açar, Pro özelliklerini açmaz; Pro hepsini açar; süresi biten hak sayılmaz', () => {
  const std = memberState({ start: NOW - 30 * DAY, ent: { tier: 'standard', until: NOW + 100 * DAY }, now: NOW });
  assert.equal(std.tier, 'standard');
  assert.equal(canUse('live', std), true);
  assert.equal(canUse('multi', std), false);
  const pro = memberState({ start: NOW - 30 * DAY, ent: { tier: 'pro', until: NOW + 100 * DAY }, now: NOW });
  assert.ok(PRO_FEATURES.every((f) => canUse(f.id, pro)));
  const old = memberState({ start: NOW - 400 * DAY, ent: { tier: 'pro', until: NOW - DAY }, now: NOW });
  assert.equal(old.tier, 'expired');
  assert.equal(canUsePro(old), false);
});

test('denemede Pro özellikleri de açık; kararlaştırılan özellikler Pro listesinde', () => {
  const tr = memberState({ start: NOW, now: NOW + DAY });
  assert.equal(canUse('cast', tr), true);
  for (const id of ['multi', 'rec', 'dl', 'sources', 'rows', 'themes', 'backup', 'remind', 'sportdetail', 'seriesfollow', 'teamfollow', 'cast', 'tvlink', 'kid', 'profiles']) assert.ok(isProFeature(id), id);
  assert.equal(PRO_FEATURES.length, 15);
  assert.equal(isProFeature('live'), false);
});

test('önizleme durumları ve metin', () => {
  assert.equal(memberState({ preview: 'expired', now: NOW }).tier, 'expired');
  assert.equal(memberState({ preview: 'standard', now: NOW }).tier, 'standard');
  assert.match(stateText(memberState({ start: NOW, now: NOW })), /7 gün kaldı/);
});

test('Pro kapısı: bağlanmadıysa açık; bağlanınca denetimin sonucunu verir', () => {
  assert.equal(needPro('multi'), true);
  setProGate((f) => f !== 'multi');
  assert.equal(needPro('multi'), false);
  assert.equal(needPro('rec'), true);
  setProGate(null);
  assert.equal(needPro('multi'), true);
});

test('hediye üyelik: üstün tür kazanır, eşitse uzun süre; biten hediye sayılmaz; metin "hediye" der', () => {
  const g = (tier, days) => ({ tier, until: NOW + days * DAY });
  // denemesi bitmiş cihaza Pro hediye → Pro, kalan gün gerçek
  let st = memberState({ start: NOW - 30 * DAY, gift: g('pro', 40), now: NOW });
  assert.equal(st.tier, 'pro');
  assert.equal(st.daysLeft, 40);
  assert.equal(st.gift, true);
  assert.equal(st.play, undefined);
  assert.equal(stateText(st), 'Pro üyelik (hediye): 40 gün kaldı');
  assert.equal(canUse('multi', st), true);
  // Play'de Standart + hediye Pro → Pro (hediye); Play'de Pro + hediye Standart → Pro (Play)
  st = memberState({ start: NOW - 30 * DAY, ent: { tier: 'standard', until: NOW + 100 * DAY, play: true }, gift: g('pro', 10), now: NOW });
  assert.deepEqual([st.tier, st.gift, st.play], ['pro', true, undefined]);
  st = memberState({ start: NOW - 30 * DAY, ent: { tier: 'pro', until: NOW + 100 * DAY, play: true }, gift: g('standard', 400), now: NOW });
  assert.deepEqual([st.tier, st.gift, st.play], ['pro', undefined, true]);
  // aynı tür: uzun olan
  st = memberState({ start: NOW - 30 * DAY, ent: { tier: 'pro', until: NOW + 5 * DAY, play: true }, gift: g('pro', 50), now: NOW });
  assert.equal(st.gift, true);
  // biten hediye ya da bozuk tür: deneme bittiyse süresi doldu
  assert.equal(memberState({ start: NOW - 30 * DAY, gift: g('pro', -1), now: NOW }).tier, 'expired');
  assert.equal(memberState({ start: NOW - 30 * DAY, gift: { tier: 'gold', until: NOW + DAY }, now: NOW }).tier, 'expired');
  // hediye yokken eskisi gibi
  assert.equal(memberState({ start: NOW - 30 * DAY, gift: null, now: NOW }).tier, 'expired');
});
