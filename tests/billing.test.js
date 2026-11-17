import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_PRODUCTS, PRODUCT_IDS, OFFLINE_GRACE_DAYS, tierFromActive, entFromActive, nextEnt, periodText, offerText } from '../www/js/billing.js';
import { memberState, stateText, canUse, setBillingReady, BILLING_READY, enforced } from '../www/js/membership.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 18);

test('ürün kimlikleri Play kurallarına uyar (küçük harf, rakam, alt çizgi) ve katmanlar ayrıdır', () => {
  assert.equal(PRODUCT_IDS.length, 2);
  for (const id of PRODUCT_IDS) assert.match(id, /^[a-z0-9][a-z0-9_.-]*$/);
  assert.notEqual(PLAY_PRODUCTS.standard, PLAY_PRODUCTS.pro);
});

test('etkin aboneliklerden en yüksek katman: Pro, Standart\'ı geçer; yabancı kimlik sayılmaz', () => {
  assert.equal(tierFromActive([]), '');
  assert.equal(tierFromActive(null), '');
  assert.equal(tierFromActive(['baska']), '');
  assert.equal(tierFromActive([PLAY_PRODUCTS.standard]), 'standard');
  assert.equal(tierFromActive([PLAY_PRODUCTS.standard, PLAY_PRODUCTS.pro]), 'pro');
});

test('Play hakkı: çevrimdışı tolerans süresi kadar geçerli, durum "etkin" yazar', () => {
  const ent = entFromActive([PLAY_PRODUCTS.pro], NOW);
  assert.deepEqual(ent, { tier: 'pro', until: NOW + OFFLINE_GRACE_DAYS * DAY, play: true });
  const st = memberState({ start: NOW - 90 * DAY, ent, now: NOW });
  assert.equal(st.tier, 'pro');
  assert.equal(st.play, true);
  assert.equal(stateText(st), 'Pro üyelik etkin');
  assert.equal(canUse('multi', st), true);
  assert.equal(entFromActive([], NOW), null);
  assert.equal(memberState({ start: NOW - 90 * DAY, ent: { ...ent, until: NOW - 1 }, now: NOW }).tier, 'expired');
});

test('sorgu sonucu: başarılıysa liste belirler (iptal edilmiş abonelik kalkar); başarısızsa son hak süresince korunur', () => {
  const cur = entFromActive([PLAY_PRODUCTS.standard], NOW - 2 * DAY);
  assert.equal(nextEnt({ ids: [], current: cur, now: NOW }), null);
  assert.equal(nextEnt({ ids: [PLAY_PRODUCTS.pro], current: cur, now: NOW }).tier, 'pro');
  assert.deepEqual(nextEnt({ ids: null, current: cur, now: NOW }), cur);
  assert.equal(nextEnt({ ids: undefined, current: cur, now: NOW + 30 * DAY }), null);
  assert.equal(nextEnt({ ids: null, current: null, now: NOW }), null);
});

test('süre ve fiyat metni', () => {
  assert.equal(periodText('P1Y'), '1 yıl');
  assert.equal(periodText('P1W'), '1 hafta');
  assert.equal(periodText('P7D'), '7 gün');
  assert.equal(periodText('P1M'), '1 ay');
  assert.equal(periodText('saçma'), '');
  assert.equal(offerText({ price: '₺299,99', period: 'P1Y', trial: '' }), '₺299,99 / yıl');
  assert.equal(offerText({ price: '₺299,99', period: 'P1Y', trial: 'P1W' }), '1 hafta ücretsiz, sonra ₺299,99 / yıl');
  assert.equal(offerText(null), '');
});

test('faturalandırma yalnız Play sürümünde açılır', () => {
  assert.equal(BILLING_READY, false);
  assert.equal(enforced(''), false);
  setBillingReady(true);
  assert.equal(enforced(''), true);
  setBillingReady(false);
  assert.equal(enforced(''), false);
});
