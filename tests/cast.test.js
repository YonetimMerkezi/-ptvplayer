import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCast, parseCast, createDevices, mergeDevices, pairResult, sendResult, syncResult, viewOf, createRemote, parseJson, parseRemoteCmd, extOf, REMOTE_KEYS } from '../www/js/cast.js';

const T = [{ url: 'http://a/x.m3u8', mime: 'hls' }, { url: 'http://b/x.m3u8', alt: 'Yedek', headers: { 'User-Agent': 'U' } }];

test('buildCast: canlı ve film; bölüm başlığı, süre, logo ve başlıklar', () => {
  const live = buildCast({ item: { kind: 'live', name: 'Kanal', logo: 'http://l/a.png' }, targets: T, startMs: 5000 });
  assert.equal(live.kind, 'live');
  assert.equal(live.startMs, 0);
  assert.equal(live.logo, 'http://l/a.png');
  assert.equal(live.targets.length, 2);
  assert.deepEqual(live.targets[1], { url: 'http://b/x.m3u8', mime: 'auto', headers: { 'User-Agent': 'U' }, alt: 'Yedek' });
  const mv = buildCast({ item: { kind: 'movie', name: 'Film', logo: 'dosya:///x' }, targets: [T[0]], startMs: 12345.7 });
  assert.equal(mv.kind, 'vod');
  assert.equal(mv.startMs, 12345);
  assert.equal(mv.logo, '');
  const ep = buildCast({ item: { kind: 'series', name: 'Dizi' }, ep: { label: 'S1 B2' }, targets: [T[0]] });
  assert.equal(ep.title, 'Dizi · S1 B2');
  assert.equal(buildCast({ item: { kind: 'series', name: 'Dizi' }, ep: { label: '' }, targets: [T[0]] }).title, 'Dizi');
  assert.equal(buildCast({ item: { kind: 'live', name: 'K' }, targets: Array.from({ length: 9 }, (_, i) => ({ url: 'http://x/' + i })) }).targets.length, 5);
});

test('parseCast: geçerli isteği oynatıcı öğesine çevirir, geçersizi reddeder', () => {
  const body = buildCast({ item: { kind: 'movie', name: 'Film', logo: 'http://l/a.png' }, targets: T, startMs: 90000 });
  const r = parseCast(JSON.parse(JSON.stringify(body)));
  assert.equal(r.item.kind, 'movie');
  assert.equal(r.item.name, 'Film');
  assert.equal(r.item.cast, true);
  assert.match(r.item.id, /^cast:/);
  assert.equal(r.startAt, 90000);
  assert.equal(r.targets.length, 2);
  assert.equal(parseCast(JSON.parse(JSON.stringify(buildCast({ item: { kind: 'live', name: 'K' }, targets: T, startMs: 5000 })))).startAt, 0);
  assert.equal(parseCast(null), null);
  assert.equal(parseCast({}), null);
  assert.equal(parseCast({ targets: [] }), null);
  assert.equal(parseCast({ targets: [{ url: 'file:///etc/passwd' }, { url: 'javascript:alert(1)' }, { url: 'ftp://x/y' }, { url: 5 }, null] }), null);
  const mixed = parseCast({ title: 'T', targets: [{ url: 'file:///x' }, { url: 'https://ok/y.mp4', mime: 'video/mp4' }] });
  assert.deepEqual(mixed.targets, [{ url: 'https://ok/y.mp4', mime: 'video/mp4' }]);
  assert.equal(parseCast({ targets: [{ url: 'http://' + 'a'.repeat(5000) }] }), null);
  const h = parseCast({ targets: [{ url: 'http://x/y', headers: Object.fromEntries(Array.from({ length: 20 }, (_, i) => ['H' + i, 'v'])) }] });
  assert.equal(Object.keys(h.targets[0].headers).length, 8);
  assert.equal(parseCast({ title: '', targets: [{ url: 'http://x/y' }] }).item.name, 'Telefondan');
  assert.equal(parseCast({ logo: 'javascript:x', targets: [{ url: 'http://x/y' }] }).item.logo, '');
});

test('kayıtlı TV\'ler: kaydet, en yeni başta, unut, bozuk kayıt', () => {
  const m = new Map();
  const store = { pref: (k, d) => (m.has(k) ? m.get(k) : d), setPref: (k, v) => m.set(k, v) };
  const dv = createDevices(store);
  assert.deepEqual(dv.list(), []);
  dv.save({ id: 'a', name: 'Salon', host: '192.168.1.5', port: 8765, token: 't1' });
  dv.save({ id: 'b', name: 'Oda', host: '192.168.1.6', port: 8765, token: 't2' });
  dv.save({ id: 'a', name: 'Salon', host: '192.168.1.7', port: 8765, token: 't1' });
  assert.deepEqual(dv.list().map((d) => d.id + d.host.slice(-1)), ['a7', 'b6']);
  assert.equal(dv.get('b').token, 't2');
  dv.forget('a');
  assert.deepEqual(dv.list().map((d) => d.id), ['b']);
  m.set('cast.tvs', 'bozuk');
  assert.deepEqual(dv.list(), []);
  m.set('cast.tvs', [{ id: 'x' }, null, { id: 'y', host: 'h', token: 't' }]);
  assert.deepEqual(dv.list().map((d) => d.id), ['y']);
});

test('mergeDevices: kayıtlı + bulunan, adres güncellenir, aynı TV tek satır', () => {
  const saved = [{ id: 'a', name: 'Salon', host: '192.168.1.5', port: 8765, token: 't' }, { id: 'z', name: 'Kapalı TV', host: '192.168.1.9', port: 8765, token: 'u' }];
  const found = [
    { id: 'a', name: 'Salon TV', host: '192.168.1.50', port: 8766 },
    { id: 'a', name: 'Salon TV', host: '10.0.0.2', port: 8766 },
    { id: 'n', name: 'Yeni', host: '192.168.1.8', port: 8765 },
  ];
  const r = mergeDevices(saved, found);
  assert.equal(r.length, 3);
  assert.deepEqual(r[0], { id: 'a', name: 'Salon TV', host: '192.168.1.50', port: 8766, token: 't', saved: true, online: true });
  assert.equal(r[1].online, false);
  assert.equal(r[1].host, '192.168.1.9');
  assert.deepEqual(r[2], { id: 'n', name: 'Yeni', host: '192.168.1.8', port: 8765, saved: false, online: true });
  assert.deepEqual(mergeDevices([], []), []);
});

test('yanıt yorumları', () => {
  assert.deepEqual(pairResult({ status: 200, body: '{"token":"abc","id":"i","name":"TV"}' }), { ok: true, token: 'abc', id: 'i', name: 'TV' });
  assert.equal(pairResult({ status: 403, body: '{"error":"wrong"}' }).msg, 'Kod yanlış');
  assert.equal(pairResult({ status: 403, body: '{"error":"closed"}' }).closed, true);
  assert.match(pairResult({ status: 0 }).msg, /ulaşılamadı/);
  assert.equal(pairResult({ status: 200, body: 'bozuk' }).ok, false);
  assert.equal(sendResult({ status: 200 }).ok, true);
  assert.equal(sendResult({ status: 401 }).unpaired, true);
  assert.equal(sendResult({ status: 422, body: '{"error":"Oynatma adresi yok"}' }).msg, 'Oynatma adresi yok');
  assert.match(sendResult({ status: 0 }).msg, /ulaşılamadı/);
  assert.equal(parseJson('[1]') !== null, true);
  assert.equal(parseJson('x'), null);
});

test('viewOf: durum metni, ilerleme, canlı ve ses', () => {
  const v = viewOf({ active: true, state: 'playing', pos: 30000, dur: 120000, title: 'Film', vol: { cur: 5, max: 10, fixed: false } });
  assert.equal(v.text, 'Oynatılıyor');
  assert.equal(v.pct, 0.25);
  assert.equal(v.canSeek, true);
  assert.equal(v.canVol, true);
  assert.equal(v.vol, 50);
  assert.equal(v.paused, false);
  assert.equal(viewOf({ active: true, state: 'paused', pos: 1, dur: 10 }).paused, true);
  assert.equal(viewOf({ active: true, state: 'buffering' }).text, 'Yükleniyor…');
  const live = viewOf({ active: true, state: 'playing', pos: 5000, dur: -1, live: true });
  assert.equal(live.canSeek, false);
  assert.equal(live.pct, 0);
  assert.equal(viewOf({ active: true, state: 'playing', dur: 100, pos: 5 }, { kind: 'live', title: 'K' }).canSeek, false);
  assert.equal(viewOf({ active: false }).text, 'TV’de oynatılan yok');
  assert.equal(viewOf({ active: true, vol: { cur: 3, max: 10, fixed: true } }).canVol, false);
  assert.equal(viewOf({ active: true, title: '' }, { kind: 'vod', title: 'Gönderilen' }).title, 'Gönderilen');
  assert.equal(viewOf(null).active, false);
  assert.equal(viewOf({ active: true, pos: 5000, dur: 1000 }).pct, 1);
});

function fake() {
  let id = 0;
  const q = new Map();
  return {
    setT: (fn, ms) => {
      q.set(++id, { fn, ms });
      return id;
    },
    clearT: (i) => q.delete(i),
    pending: () => [...q.values()],
    run: async () => {
      const first = [...q.entries()][0];
      if (!first) return false;
      q.delete(first[0]);
      first[1].fn();
      await new Promise((r) => setImmediate(r));
      return true;
    },
  };
}
const flush = () => new Promise((r) => setImmediate(r));
const st = (o) => ({ status: 200, body: JSON.stringify(o) });

test('uzaktan kumanda: yoklar, görünümü bildirir, TV durunca biter', async () => {
  const f = fake();
  const log = [];
  const resp = [st({ active: false }), st({ active: true, state: 'playing', pos: 1000, dur: 9000 }), st({ active: true, state: 'playing', pos: 2000, dur: 9000 }), st({ active: false }), st({ active: false })];
  const calls = [];
  const rm = createRemote({
    request: async (p, m) => (calls.push(p + ' ' + m), resp.shift()),
    sent: { kind: 'vod', title: 'Film' },
    onView: (v) => log.push('v:' + v.active + ':' + v.pos),
    onEnd: (r) => log.push('end:' + r),
    setT: f.setT,
    clearT: f.clearT,
    now: () => 0,
  });
  rm.start();
  await flush();
  while (await f.run());
  assert.deepEqual(log, ['v:false:0', 'v:true:1000', 'v:true:2000', 'v:false:0', 'v:false:0', 'end:stopped']);
  assert.ok(calls.every((c) => c === '/state GET'));
  assert.equal(f.pending().length, 0);
});

test('uzaktan kumanda: TV hiç başlamazsa (süre dolunca) bitirir; hemen bitirmez', async () => {
  const f = fake();
  let t = 0;
  const log = [];
  const rm = createRemote({ request: async () => st({ active: false }), onEnd: (r) => log.push(r), setT: f.setT, clearT: f.clearT, now: () => t, grace: 10000 });
  rm.start();
  await flush();
  t = 5000;
  await f.run();
  assert.deepEqual(log, []);
  t = 11000;
  await f.run();
  assert.deepEqual(log, ['never']);
});

test('uzaktan kumanda: üst üste 3 hata → ulaşılamıyor; arada başarı sayacı sıfırlar', async () => {
  const f = fake();
  const log = [];
  const resp = [{ status: 0 }, { status: 0 }, st({ active: true, state: 'playing' }), { status: 0 }, { status: 0 }, { status: 500 }];
  const rm = createRemote({ request: async () => resp.shift(), onLost: () => log.push('lost'), onView: () => log.push('v'), setT: f.setT, clearT: f.clearT, now: () => 0 });
  rm.start();
  await flush();
  while (await f.run());
  assert.deepEqual(log, ['v', 'lost']);
});

test('uzaktan kumanda: eşleşme kaldırılmışsa (401) bildirir ve durur', async () => {
  const f = fake();
  const log = [];
  const rm = createRemote({ request: async () => ({ status: 401, body: '' }), onUnpaired: () => log.push('unpaired'), setT: f.setT, clearT: f.clearT });
  rm.start();
  await flush();
  assert.deepEqual(log, ['unpaired']);
  assert.equal(f.pending().length, 0);
});

test('uzaktan kumanda: komut gönderir, sonucu döner, ardından durumu hızla yeniler; durmuşken yoklamaz', async () => {
  const f = fake();
  const calls = [];
  const rm = createRemote({
    request: async (p, m, b) => {
      calls.push(`${m} ${p} ${b || ''}`);
      return p === '/cmd' ? { status: 200, body: '{"ok":true}' } : st({ active: true, state: 'playing' });
    },
    setT: f.setT,
    clearT: f.clearT,
  });
  rm.start();
  await flush();
  const r = await rm.send({ a: 'seekBy', v: 10000 });
  assert.equal(r.ok, true);
  assert.ok(calls.includes('POST /cmd {"a":"seekBy","v":10000}'));
  assert.equal(f.pending().length, 1);
  assert.equal(f.pending()[0].ms, 280);
  rm.stop();
  assert.equal(f.pending().length, 0);
  await rm.send({ a: 'pause' });
  assert.equal(f.pending().length, 0);
  const bad = createRemote({ request: async () => ({ status: 0 }), setT: f.setT, clearT: f.clearT });
  assert.match((await bad.send({ a: 'play' })).msg, /ulaşılamadı/);
});

test('syncResult: başarı, eşleşme kaldırılmış, TV hatası/zaman aşımı, ulaşılamadı, bozuk yanıt', () => {
  const snap = { app: 'iptv-oynatici-sync', v: 1, sources: [], data: {} };
  const ok = syncResult({ status: 200, body: JSON.stringify({ ok: true, added: { favs: 2 }, snapshot: snap }) });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.added, { favs: 2 });
  assert.deepEqual(ok.snapshot, snap);
  assert.equal(syncResult({ status: 200, body: '{"ok":true}' }).ok, false, 'veri yoksa geçersiz');
  assert.equal(syncResult({ status: 200, body: 'bozuk' }).ok, false);
  assert.equal(syncResult({ status: 401, body: '' }).unpaired, true);
  assert.equal(syncResult({ status: 422, body: '{"error":"Diğer cihazdaki uygulama daha yeni"}' }).msg, 'Diğer cihazdaki uygulama daha yeni');
  assert.match(syncResult({ status: 504, body: '{"error":"TV yanıt vermedi"}' }).msg, /yanıt vermedi/);
  assert.equal(syncResult({ status: 422, body: '' }).msg, 'Eşitleme yapılamadı');
  assert.equal(syncResult({ status: 0, body: '' }).msg, 'TV’ye ulaşılamadı');
  assert.equal(syncResult(null).ok, false);
});

// ---- telefon kumandası: TV'deki oynatıcının ek denetimleri ----

test('parseRemoteCmd: bilinen komutları ve değerlerini doğrular, gerisini reddeder', () => {
  for (const a of ['next', 'prev', 'last', 'golive', 'fav', 'stats']) assert.deepEqual(parseRemoteCmd({ a, v: 'x', fazla: 1 }), { a });
  assert.deepEqual(parseRemoteCmd({ a: 'aspect' }), { a: 'aspect' });
  assert.deepEqual(parseRemoteCmd({ a: 'aspect', v: 2 }), { a: 'aspect', v: 2 });
  assert.deepEqual(parseRemoteCmd({ a: 'aspect', v: 99 }), { a: 'aspect' }); // döngü: geçersiz sıra yok sayılır
  for (const v of Object.keys(REMOTE_KEYS)) assert.deepEqual(parseRemoteCmd({ a: 'key', v }), { a: 'key', v });
  assert.equal(parseRemoteCmd({ a: 'key', v: 'F5' }), null);
  assert.equal(parseRemoteCmd({ a: 'key', v: 'constructor' }), null); // prototip anahtarları tuş sayılmaz
  assert.equal(parseRemoteCmd({ a: 'key' }), null);
  assert.deepEqual(parseRemoteCmd({ a: 'sleep', v: 30 }), { a: 'sleep', v: 30 });
  assert.deepEqual(parseRemoteCmd({ a: 'sleep', v: '45' }), { a: 'sleep', v: 45 });
  assert.deepEqual(parseRemoteCmd({ a: 'sleep', v: 0 }), { a: 'sleep', v: 0 });
  assert.equal(parseRemoteCmd({ a: 'sleep', v: 7 }), null);
  assert.deepEqual(parseRemoteCmd({ a: 'night', v: 'low' }), { a: 'night', v: 'low' });
  assert.equal(parseRemoteCmd({ a: 'night', v: '' }), null);
  assert.equal(parseRemoteCmd({ a: 'night', v: 'x'.repeat(21) }), null);
  assert.deepEqual(parseRemoteCmd({ a: 'audio', v: '2' }), { a: 'audio', v: '2' });
  assert.equal(parseRemoteCmd({ a: 'audio', v: '' }), null); // ses izi kapatılamaz
  assert.deepEqual(parseRemoteCmd({ a: 'text', v: '' }), { a: 'text', v: '' }); // boş = altyazı kapalı
  assert.equal(parseRemoteCmd({ a: 'text', v: 5 }), null);
  for (const kotu of [null, undefined, 'next', 5, {}, { a: 5 }, { a: 'format' }, { a: 'stop' }, { a: 'seekBy', v: 1 }]) assert.equal(parseRemoteCmd(kotu), null);
});

test('extOf: eksik ya da bozuk bildirimde her şey kapalı; geçerli bildirim temizlenerek geçer', () => {
  const bos = extOf(undefined);
  assert.ok(Object.values(bos.can).every((x) => x === false));
  assert.deepEqual([bos.audio, bos.text, bos.fav, bos.night, bos.sleepMin, bos.epg], [[], [], false, 'off', 0, '']);
  assert.deepEqual(extOf('metin'), bos);
  assert.deepEqual(extOf({ can: 'evet' }), bos);
  assert.equal(extOf({ can: { next: 'true' } }).can.next, false); // yalnız gerçek true
  const x = extOf({
    can: { prev: true, next: true, audio: true, text: true, night: true, sleep: true, aspect: true, stats: true, fav: true, last: false },
    fav: true,
    stats: true,
    aspect: 'Doldur',
    night: 'high',
    sleep: { min: 30, left: 1500000.4 },
    audio: [{ id: 1, label: 'Türkçe', selected: true }, { id: 'a2', label: '' }, { label: 'kimliksiz' }, null],
    text: [{ id: 't1', label: 'İngilizce' }],
    textOn: true,
    epg: 'Haber · 20:00–21:00',
  });
  assert.equal(x.can.prev && x.can.audio && x.can.stats && !x.can.last, true);
  assert.deepEqual([x.fav, x.stats, x.aspect, x.night, x.sleepMin, x.sleepLeft, x.textOn, x.epg], [true, true, 'Doldur', 'high', 30, 1500000, true, 'Haber · 20:00–21:00']);
  assert.deepEqual(x.audio, [{ id: '1', label: 'Türkçe', selected: true }, { id: 'a2', label: 'a2', selected: false }]);
  assert.deepEqual(x.text, [{ id: 't1', label: 'İngilizce', selected: false }]);
  assert.equal(extOf({ audio: Array.from({ length: 80 }, (_, i) => ({ id: String(i), label: 'x' })) }).audio.length, 24);
  assert.equal(extOf({ epg: 'e'.repeat(500) }).epg.length, 200);
  assert.equal(extOf({ sleep: { min: -5, left: -1 } }).sleepMin, 0);
});

test('viewOf: ext, sessiz ve en yüksek ses TV durumundan gelir', () => {
  const v = viewOf({ active: true, state: 'playing', vol: { cur: 4, max: 15, fixed: false, muted: true }, ext: { fav: true, can: { next: true } } });
  assert.equal(v.muted, true);
  assert.equal(v.volMax, 15);
  assert.equal(v.ext.fav, true);
  assert.equal(v.ext.can.next, true);
  const e = viewOf({ active: true });
  assert.equal(e.muted, false);
  assert.equal(e.ext.can.next, false);
});

test('uzaktan kumanda (yalnız kumanda): TV’de oynayan olmasa da ya da oynayan bitse de kapanmaz', async () => {
  const f = fake();
  const log = [];
  const resp = [st({ active: false }), st({ active: true, state: 'playing' }), st({ active: false }), st({ active: false }), st({ active: false }), st({ active: false })];
  const rm = createRemote({ request: async () => resp.shift(), keep: true, onView: (v) => log.push(v.active), onEnd: (r) => log.push('end:' + r), setT: f.setT, clearT: f.clearT, now: () => 1e9, grace: 1 });
  rm.start();
  await flush();
  for (let i = 0; i < 5; i++) await f.run();
  assert.deepEqual(log, [false, true, false, false, false, false]);
  assert.equal(f.pending().length, 1); // yoklama sürüyor
  rm.stop();
  assert.equal(f.pending().length, 0);
});
