// LG webOS: sağlayıcı arşivinden geri sarma hesapları (sunucu saati farkı, damga, plan, etiket) ve arşiv adresi.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../webos/src/arsiv.js';
import { createXtream } from '../webos/src/data.js';

const DK = 60000;

test('arşiv: damga sunucu saatiyle "YYYY-MM-DD:HH-MM" yazar (gün/yıl sınırlarında da)', () => {
  const t = Date.UTC(2026, 10, 21, 9, 50, 30);
  assert.equal(A.damga(t, 3 * 3600000), '2026-11-21:12-50');
  assert.equal(A.damga(Date.UTC(2026, 11, 31, 22, 5), 3 * 3600000), '2027-01-01:01-05');
  assert.equal(A.damga(Date.UTC(2026, 0, 1, 0, 0), -5 * 3600000), '2025-12-31:19-00');
});

test('arşiv: sunucu saati farkı time_now ve timestamp_now arasından bulunur, 15 dakikaya yuvarlanır; bozuksa null', () => {
  const ts = Date.UTC(2026, 10, 21, 10, 0, 7) / 1000;
  assert.equal(A.sunucuFark({ time_now: '2026-11-21 13:00:09', timestamp_now: ts }), 3 * 3600000, 'birkaç sn sapma yuvarlanır');
  assert.equal(A.sunucuFark({ time_now: '2026-11-21 15:30:00', timestamp_now: ts }), 5.5 * 3600000);
  assert.equal(A.sunucuFark({ time_now: 'dün', timestamp_now: ts }), null);
  assert.equal(A.sunucuFark({ time_now: '2026-11-21 13:00:00' }), null);
  assert.equal(A.sunucuFark(null), null);
  assert.equal(A.sunucuFark({ time_now: '2026-11-25 13:00:00', timestamp_now: ts }), null, 'mantıksız fark yok sayılır');
});

test('arşiv: plan — canlıya yakınsa canlı; değilse dakikaya aşağı yuvarlı başlangıç ve 2 sa ileri süre; arşiv ucu aşılmaz', () => {
  const simdi = Date.UTC(2026, 10, 21, 10, 0, 40);
  const enFazla = A.enFazlaGeri({ archiveDays: 1 });
  assert.equal(enFazla, 24 * 3600000 - 2 * DK);
  assert.deepEqual(A.plan(simdi, 20000, enFazla), { canli: true });
  assert.deepEqual(A.plan(simdi, -5, enFazla), { canli: true });
  const p = A.plan(simdi, 15 * DK, enFazla);
  assert.equal(p.canli, false);
  assert.equal(p.start, Date.UTC(2026, 10, 21, 9, 45), 'dakikaya aşağı');
  assert.equal(p.sureDk, 15 + 120 + 1, '15 dk 40 sn geri + 2 sa, dakikaya yukarı');
  const uc = A.plan(simdi, 99 * 3600000, enFazla);
  assert.equal(uc.start, Math.floor((simdi - enFazla) / DK) * DK, 'arşivin ucuna kenetlenir');
  assert.equal(A.plan(simdi, 20 * 3600000, enFazla).sureDk, 12 * 60, 'süre 12 saati geçmez');
});

test('arşiv: arşiv süresi bilinmiyorsa 1 gün; etiket dakika ve saat gösterir', () => {
  assert.equal(A.arsivMs({}), 86400000);
  assert.equal(A.arsivMs({ archiveDays: 7 }), 7 * 86400000);
  assert.equal(A.etiket(5 * DK), '−5 dk');
  assert.equal(A.etiket(60 * DK), '−1 sa');
  assert.equal(A.etiket(75 * DK + 20000), '−1 sa 15 dk');
  assert.equal(A.etiket(-1), '−0 dk');
});

test('arşiv: Xtream sağlayıcı arşiv adresini sunucu saatine göre kurar; sunucu bilgisi bir kez sorulur, alınamazsa cihaz saati', async () => {
  const ts = Date.UTC(2026, 10, 21, 10, 0, 0) / 1000;
  const sorgu = [];
  const net = { json: async (u) => (sorgu.push(u), { server_info: { time_now: '2026-11-21 13:00:00', timestamp_now: ts } }), get: async () => '' };
  const p = createXtream({ server: 'http://srv:80/', user: 'u s', pass: 'p/1' }, net);
  const url = await p.arsivUrl({ streamId: '101' }, Date.UTC(2026, 10, 21, 9, 50), 130);
  assert.equal(url, 'http://srv:80/timeshift/u%20s/p%2F1/130/2026-11-21:12-50/101.ts');
  await p.arsivUrl({ streamId: '102' }, Date.UTC(2026, 10, 21, 9, 0), 60);
  assert.equal(sorgu.length, 1, 'sunucu saati bir kez sorulur');

  const bozuk = createXtream({ server: 'http://srv:80', user: 'u', pass: 'p' }, { json: async () => { throw new Error('ağ'); }, get: async () => '' });
  const u2 = await bozuk.arsivUrl({ streamId: '5' }, Date.UTC(2026, 10, 21, 9, 50), 10);
  assert.match(u2, /^http:\/\/srv:80\/timeshift\/u\/p\/10\/\d{4}-\d\d-\d\d:\d\d-\d\d\/5\.ts$/, 'cihaz saatiyle yine de adres üretilir');
});
