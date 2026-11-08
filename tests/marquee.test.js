import test from 'node:test';
import assert from 'node:assert/strict';
import { marqueeFor, MQ_SPEED } from '../www/js/marquee.js';

test('sığan ad kaymaz', () => {
  assert.equal(marqueeFor(120, 200), null);
  assert.equal(marqueeFor(200, 200), null);
  assert.equal(marqueeFor(201, 200), null); // 1-2 px taşma gözle görülmez
});

test('taşan ad, taşma kadar kayar; süre taşmayla orantılı ve en az 3 sn', () => {
  const a = marqueeFor(260, 200);
  assert.equal(a.over, 60);
  assert.equal(a.dur, 3.6);
  const b = marqueeFor(200 + MQ_SPEED * 10, 200);
  assert.equal(b.over, MQ_SPEED * 10);
  assert.equal(b.dur, 12);
  assert.ok(marqueeFor(204, 200).dur >= 3);
});
