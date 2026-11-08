import test from 'node:test';
import assert from 'node:assert/strict';
import { nativePlugin } from '../www/js/bridge.js';

test('tarayıcıda (köprü yok) null döner', () => {
  assert.equal(nativePlugin('IptvPlayer', {}), null);
  assert.equal(nativePlugin('IptvPlayer', { Capacitor: { isNativePlatform: () => false } }), null);
  // registerPlugin olmayan gerçek köprü biçimi de desteklenmeli
  assert.equal(typeof nativePlugin('X', { Capacitor: { isNativePlatform: () => true, nativePromise() {} } }), 'object');
});

test('gerçek köprü biçimi: registerPlugin olmadan nativePromise ve addListener', async () => {
  const sent = [];
  const win = {
    Capacitor: {
      isNativePlatform: () => true,
      nativePromise: async (p, m, o) => (sent.push([p, m, o]), { ok: 1 }),
      addListener: (p, e, cb) => (sent.push([p, 'addListener', e]), { remove() {}, cb }),
    },
  };
  assert.equal(win.Capacitor.registerPlugin, undefined);
  const pl = nativePlugin('IptvPlayer', win);
  assert.deepEqual(await pl.play({ url: 'u' }), { ok: 1 });
  await pl.stop();
  const h = await pl.addListener('state', () => {});
  assert.equal(typeof h.remove, 'function');
  assert.deepEqual(sent, [
    ['IptvPlayer', 'play', { url: 'u' }],
    ['IptvPlayer', 'stop', {}],
    ['IptvPlayer', 'addListener', 'state'],
  ]);
});
