import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidPin, newSalt, hashPin, makeRecord, checkPin, emptyFail, registerFail, waitMs, fmtWait, shouldLock, normalizeAfter, DEFAULT_AFTER } from '../www/js/lock.js';

test('isValidPin: 4–6 rakam', () => {
  for (const p of ['1234', '12345', '123456']) assert.equal(isValidPin(p), true, p);
  for (const p of ['123', '1234567', '12a4', '', '12 34', null, 1234]) assert.equal(isValidPin(p), false, String(p));
});

test('hashPin: tuzlu ve kararlı; farklı tuz/şifre farklı özet; düz şifre özette yok', async () => {
  const a = await hashPin('1234', 'abcd');
  assert.equal(a, await hashPin('1234', 'abcd'));
  assert.notEqual(a, await hashPin('1234', 'abce'));
  assert.notEqual(a, await hashPin('1235', 'abcd'));
  assert.ok(!a.includes('1234') && /^s[0-9a-f]{64}$/.test(a));
});

test('hashPin: subtle yoksa yedek özet çalışır', async () => {
  const a = await hashPin('1234', 'abcd', null);
  assert.match(a, /^f[0-9a-f]{16}$/);
  assert.equal(a, await hashPin('1234', 'abcd', null));
  assert.notEqual(a, await hashPin('1235', 'abcd', null));
});

test('makeRecord + checkPin: doğru şifre geçer, yanlış geçmez; kayıt uzunluğu tutulur', async () => {
  const rec = await makeRecord('4821');
  assert.equal(rec.len, 4);
  assert.equal(await checkPin('4821', rec), true);
  assert.equal(await checkPin('4822', rec), false);
  assert.equal(await checkPin('', rec), false);
  assert.equal(await checkPin('4821', null), false);
  const rec2 = await makeRecord('4821', { subtle: null });
  assert.equal(await checkPin('4821', rec2, null), true);
  assert.equal(await checkPin('0000', rec2, null), false);
});

test('newSalt: 16 onaltılık karakter', () => {
  assert.match(newSalt(), /^[0-9a-f]{16}$/);
  assert.notEqual(newSalt(), newSalt());
});

test('yanlış deneme: 5. hatada 30 sn, 10. hatada 60 sn bekleme; en çok 10 dk', () => {
  let st = emptyFail();
  const t = 1000000;
  for (let i = 1; i <= 4; i++) {
    st = registerFail(st, t);
    assert.equal(waitMs(st, t), 0, `${i}. hata`);
  }
  st = registerFail(st, t);
  assert.equal(st.n, 5);
  assert.equal(waitMs(st, t), 30000);
  assert.equal(waitMs(st, t + 31000), 0);
  for (let i = 6; i <= 10; i++) st = registerFail(st, t);
  assert.equal(waitMs(st, t), 60000);
  for (let i = 11; i <= 60; i++) st = registerFail(st, t);
  assert.ok(waitMs(st, t) <= 600000);
  assert.equal(fmtWait(30000), '30 sn');
  assert.equal(fmtWait(90000), '1 dk 30 sn');
});

test('shouldLock: bekleme süresine göre', () => {
  const now = 1000000;
  assert.equal(shouldLock({ enabled: false, after: 0, hiddenAt: now - 1e6, now }), false);
  assert.equal(shouldLock({ enabled: true, after: 0, hiddenAt: now, now }), true);
  assert.equal(shouldLock({ enabled: true, after: 60, hiddenAt: now - 30000, now }), false);
  assert.equal(shouldLock({ enabled: true, after: 60, hiddenAt: now - 61000, now }), true);
  assert.equal(shouldLock({ enabled: true, after: -1, hiddenAt: now - 1e9, now }), false);
  assert.equal(shouldLock({ enabled: true, after: 60, hiddenAt: null, now }), false);
  assert.equal(normalizeAfter('bilinmeyen'), DEFAULT_AFTER);
  assert.equal(normalizeAfter(300), 300);
});
