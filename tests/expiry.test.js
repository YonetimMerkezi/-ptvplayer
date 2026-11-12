import test from 'node:test';
import assert from 'node:assert/strict';
import { expiryInfo, expiryText, expiryPlan, daysLeft, WARN_DAYS, PLAN_DAYS, LEAD_DAYS } from '../www/js/expiry.js';

const DAY = 86400000;
const NOW = new Date(2026, 10, 12, 15, 0, 0).getTime();

test('expiryInfo: düzey ve kalan gün; bilgi yoksa null', () => {
  assert.equal(expiryInfo(NaN), null);
  assert.equal(expiryInfo(0), null);
  assert.equal(expiryInfo(undefined), null);
  assert.deepEqual(expiryInfo(NOW + 90 * DAY, NOW), { days: 90, level: 'ok' });
  assert.deepEqual(expiryInfo(NOW + WARN_DAYS * DAY, NOW), { days: 7, level: 'soon' });
  assert.deepEqual(expiryInfo(NOW + 8 * DAY - 1000, NOW), { days: 8, level: 'ok' });
  assert.deepEqual(expiryInfo(NOW + 3600e3, NOW), { days: 1, level: 'soon' });
  assert.deepEqual(expiryInfo(NOW - 1000, NOW), { days: 0, level: 'expired' });
  assert.deepEqual(expiryInfo(NOW - 5 * DAY, NOW), { days: -5, level: 'expired' });
  assert.equal(daysLeft(NOW + 1, NOW), 1);
});

test('expiryText', () => {
  assert.equal(expiryText(expiryInfo(NOW + 5 * DAY, NOW)), '5 gün kaldı');
  assert.equal(expiryText(expiryInfo(NOW + 3600e3, NOW)), 'son gün');
  assert.equal(expiryText(expiryInfo(NOW - DAY, NOW)), 'süresi doldu');
  assert.equal(expiryText(null), '');
});

test('expiryPlan: bitişten 3 gün önce sabah 10:00; geçtiyse hemen; dolmuşsa yok', () => {
  const exp = NOW + 10 * DAY;
  const p = expiryPlan({ srcId: 's1', srcName: 'Liste A', expires: exp, now: NOW });
  const at = new Date(p.at);
  assert.equal(at.getHours(), 10);
  assert.equal(at.getMinutes(), 0);
  assert.equal(Math.round((exp - p.at) / DAY), LEAD_DAYS);
  assert.deepEqual([p.id, p.kind, p.exp, p.chId, p.chName, p.title, p.s], [`exp:s1:${exp}`, 'rem', true, '', 'Liste A', 'Abonelik bitiyor', exp]);
  assert.match(p.note, /^Aboneliğiniz 3 gün sonra bitiyor \(/);
  // son 3 gün içinde: hemen (5 sn sonra), metin kalan güne göre
  const soon = expiryPlan({ srcId: 's1', expires: NOW + 2 * DAY, now: NOW });
  assert.equal(soon.at, NOW + 5000);
  assert.match(soon.note, /^Aboneliğiniz 2 gün sonra bitiyor/);
  assert.match(expiryPlan({ srcId: 's1', expires: NOW + 12 * 3600e3, now: NOW }).note, /^Aboneliğiniz bugün bitiyor/);
  assert.match(expiryPlan({ srcId: 's1', expires: NOW + 30 * 3600e3, now: NOW }).note, /^Aboneliğiniz (yarın|bugün) bitiyor/);
  assert.equal(expiryPlan({ srcId: 's1', expires: NOW - 1, now: NOW }), null);
  assert.equal(expiryPlan({ srcId: 's1', expires: NaN, now: NOW }), null);
  assert.ok(PLAN_DAYS > WARN_DAYS);
});
