import test from 'node:test';
import assert from 'node:assert/strict';
import { newCode, normalizeCode, formatCode, codeId, sealEntry, openEntry, buildConfig, parseConfig, fetchConfig, resolveCode, toSources, redeem, syncManaged, deviceId, fmtDeviceId, normDevice } from '../www/js/managed.js';

const noSleep = async () => {};
const NOW = Date.UTC(2026, 10, 10);
const X = { type: 'xtream', name: 'Ana', server: 'http://s.example:8080', user: 'kul', pass: 'GIZLI-SIFRE' };
const M = { type: 'm3u', name: 'Yedek', url: 'http://l.example/get.php?username=a&password=GIZLI2' };
const payload = (over = {}) => ({ p: 1, n: 'Ayşe', x: 0, s: [X, M], ...over });

function fakeStore(init = []) {
  const src = init.map((s) => ({ ...s }));
  const pref = new Map();
  return {
    src,
    sources: () => src.map((s) => ({ ...s })),
    saveSource(s) {
      const i = src.findIndex((x) => x.id === s.id);
      if (i >= 0) src[i] = { ...s };
      else src.push({ ...s });
      return s;
    },
    removeSource(id) {
      const i = src.findIndex((x) => x.id === id);
      if (i >= 0) src.splice(i, 1);
    },
    pref: (k, d) => (pref.has(k) ? pref.get(k) : d),
    setPref: (k, v) => pref.set(k, v),
  };
}
async function cfgWith(entries, extra = {}) {
  const e = {};
  for (const [code, p] of entries) e[await codeId(code)] = await sealEntry(code, p);
  return buildConfig({ entries: e, at: NOW, ...extra });
}
const netOf = (cfg) => ({ json: async () => JSON.parse(JSON.stringify(cfg)) });

test('kod: biçim, sadeleştirme, geçersizler', () => {
  const c = newCode();
  assert.match(c, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
  assert.equal(normalizeCode(c.toLowerCase().replace(/-/g, ' ')), c.replace(/-/g, ''));
  assert.equal(formatCode('ABCDEFGHJKMNPQRS'), 'ABCD-EFGH-JKMN-PQRS');
  for (const bad of ['', 'abc', 'ABCD-EFGH-JKMN-PQR', 'ABCD-EFGH-JKMN-PQR0', 'ABCD-EFGH-JKMN-PQRSS', null]) assert.equal(normalizeCode(bad), '');
  assert.notEqual(newCode(), newCode());
});

test('kimlik: kodla sabit, farklı kodlarda farklı, 20 hex', async () => {
  const a = newCode();
  assert.match(await codeId(a), /^[0-9a-f]{20}$/);
  assert.equal(await codeId(a), await codeId(a.toLowerCase()));
  assert.notEqual(await codeId(a), await codeId(newCode()));
  await assert.rejects(() => codeId('x'), /geçersiz/);
});

test('şifreleme: gidiş-dönüş, yanlış kod, bozulmuş veri, girişler arası takas', async () => {
  const a = newCode();
  const b = newCode();
  const e = await sealEntry(a, payload());
  assert.deepEqual(await openEntry(a, e), payload());
  await assert.rejects(() => openEntry(b, e));
  const bad = { ...e, c: e.c.slice(0, -4) + (e.c.endsWith('AAAA') ? 'BBBB' : 'AAAA') };
  await assert.rejects(() => openEntry(a, bad));
  // b’nin kimliğine a’nın girişi konsa bile (aad farkı) açılmaz
  const eA = await sealEntry(a, payload());
  await assert.rejects(() => openEntry(b, eA));
  // her şifreleme farklı tuz/iv üretir
  const e2 = await sealEntry(a, payload());
  assert.notEqual(e.c, e2.c);
});

test('config: düz metin sızmaz, ayrıştırma sıkı', async () => {
  const a = newCode();
  const cfg = await cfgWith([[a, payload()]], { blocked: ['AB12-CD34-EF56', 'ab12cd34ef56'] });
  const raw = JSON.stringify(cfg);
  for (const s of ['GIZLI', 'Ayşe', 's.example', 'l.example', 'kul', 'Ana', 'Yedek', a, a.replace(/-/g, '')]) assert.ok(!raw.includes(s), 'sızıntı: ' + s);
  assert.deepEqual(cfg.blocked, ['ab12cd34ef56']);
  const ok = parseConfig(JSON.parse(raw));
  assert.equal(Object.keys(ok.entries).length, 1);
  assert.equal(parseConfig(null), null);
  assert.equal(parseConfig({ v: 2, entries: {} }), null);
  assert.equal(parseConfig({ v: 1 }), null);
  const dirty = parseConfig({ v: 1, entries: { zz: { s: 'a', i: 'b', c: 'c' }, [await codeId(a)]: { s: 1, i: 'b', c: 'c' } } });
  assert.deepEqual(dirty.entries, {});
});

test('çözümleme: ok / eksik / engelli / süresi dolmuş / saat geri alma / bozuk', async () => {
  const a = newCode();
  const dev = 'a1b2c3d4e5f6';
  let cfg = parseConfig(await cfgWith([[a, payload({ x: NOW + 1000 })]]));
  const ok = await resolveCode(a, cfg, { deviceId: dev, now: NOW });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.sources.length, 2);
  assert.equal((await resolveCode(newCode(), cfg, { now: NOW })).status, 'missing');
  assert.equal((await resolveCode('kısa', cfg, { now: NOW })).status, 'bad');
  assert.equal((await resolveCode(a, cfg, { now: NOW + 5000 })).status, 'expired');
  // cihaz saati geri alınmış: yayın zamanı (cfg.at) esas
  const later = parseConfig(await cfgWith([[a, payload({ x: NOW - 1 })]]));
  assert.equal((await resolveCode(a, later, { now: NOW - 10 * 864e5 })).status, 'expired');
  // süresiz
  cfg = parseConfig(await cfgWith([[a, payload({ x: 0 })]]));
  assert.equal((await resolveCode(a, cfg, { now: NOW + 9e12 })).status, 'ok');
  // engelli cihaz
  cfg = parseConfig(await cfgWith([[a, payload()]], { blocked: [dev] }));
  assert.equal((await resolveCode(a, cfg, { deviceId: dev, now: NOW })).status, 'blocked');
  assert.equal((await resolveCode(a, cfg, { deviceId: 'ffffffffffff', now: NOW })).status, 'ok');
  // giriş var ama başka kodla şifrelenmiş
  const id = await codeId(a);
  cfg = parseConfig({ v: 1, at: NOW, entries: { [id]: await sealEntry(newCode(), payload()) } });
  assert.equal((await resolveCode(a, cfg, { now: NOW })).status, 'bad');
});

test('toSources: kimlik sabit, geçersizler atlanır, alanlar sınırlı', () => {
  const id = 'abcdef0123456789abcd';
  const s = toSources({ n: 'Ayşe', s: [X, { type: 'xtream', server: '', user: 'a' }, { type: 'm3u' }, M, null, { type: 'zzz', url: 'x' }] }, id, 'KOD');
  assert.equal(s.length, 2);
  assert.deepEqual(s.map((x) => x.id), ['mabcdef012345-0', 'mabcdef012345-3']);
  assert.ok(s.every((x) => x.managed === true && x.code === 'KOD'));
  assert.equal(s[1].name, 'Yedek');
  assert.equal(toSources({ n: 'A', s: [{ type: 'm3u', url: 'http://a/x' }] }, id, 'K')[0].name, 'A');
  assert.deepEqual(toSources(null, id, 'K'), []);
});

test('redeem: ekler, tekrar eklemez, hata metinleri', async () => {
  const a = newCode();
  const store = fakeStore();
  const net = netOf(await cfgWith([[a, payload({ x: NOW + 1e6 })]]));
  const r = await redeem({ code: a.toLowerCase(), store, net, deviceId: 'a1b2c3d4e5f6', now: NOW, sleep: noSleep });
  assert.equal(r.added, 2);
  assert.equal(r.name, 'Ayşe');
  assert.equal(store.src.length, 2);
  assert.ok(store.src.every((s) => s.managed && s.code === a.replace(/-/g, '')));
  const r2 = await redeem({ code: a, store, net, now: NOW, sleep: noSleep });
  assert.equal(r2.added, 0);
  assert.equal(store.src.length, 2);
  await assert.rejects(() => redeem({ code: 'xyz', store, net, sleep: noSleep }), /16 harf/);
  await assert.rejects(() => redeem({ code: newCode(), store, net, now: NOW, sleep: noSleep }), /bulunamadı/);
  await assert.rejects(() => redeem({ code: a, store: fakeStore(), net, now: NOW + 9e9, sleep: noSleep }), /süresi doldu/);
  const blockedNet = netOf(await cfgWith([[a, payload()]], { blocked: ['a1b2c3d4e5f6'] }));
  await assert.rejects(() => redeem({ code: a, store: fakeStore(), net: blockedNet, deviceId: 'a1b2c3d4e5f6', now: NOW, sleep: noSleep }), /erişimi kapatıldı/);
  const down = { json: async () => { throw new Error('HTTP 503'); } };
  await assert.rejects(() => redeem({ code: a, store: fakeStore(), net: down, now: NOW, sleep: noSleep }), /ulaşılamadı/);
});

test('syncManaged: yönetilen kaynak yoksa dokunmaz, ağ hatasında silmez', async () => {
  const store = fakeStore([{ id: 'k1', type: 'm3u', url: 'http://x/y' }]);
  assert.deepEqual(await syncManaged({ store, net: netOf({}), sleep: noSleep }), { skipped: true });
  const a = newCode();
  const s2 = fakeStore(toSources(payload(), 'abcdef0123456789abcd', a.replace(/-/g, '')));
  const down = { json: async () => { throw new Error('HTTP 502'); } };
  const r = await syncManaged({ store: s2, net: down, now: NOW, sleep: noSleep });
  assert.ok(r.error);
  assert.equal(s2.src.length, 2);
});

test('syncManaged: güncelleme, artık olmayanı kaldırma, silinmiş/süresi dolmuş/engelli', async () => {
  const a = newCode();
  const norm = a.replace(/-/g, '');
  const id = await codeId(a);
  const mk = () => fakeStore(toSources(payload(), id, norm));
  // değişmemiş: değişiklik yok
  let st = mk();
  let r = await syncManaged({ store: st, net: netOf(await cfgWith([[a, payload()]])), now: NOW, sleep: noSleep });
  assert.equal(r.changed, false);
  // adres değişti → güncellenir (kimlik aynı)
  const X2 = { ...X, server: 'http://yeni.example:80' };
  r = await syncManaged({ store: st, net: netOf(await cfgWith([[a, payload({ s: [X2, M] })]])), now: NOW, sleep: noSleep });
  assert.equal(r.updated, 1);
  assert.equal(st.src.find((s) => s.id.endsWith('-0')).server, 'http://yeni.example:80');
  // yönetici ikinci listeyi çıkardı → kaldırılır
  r = await syncManaged({ store: st, net: netOf(await cfgWith([[a, payload({ s: [X2] })]])), now: NOW, sleep: noSleep });
  assert.equal(st.src.length, 1);
  assert.equal(r.changed, true);
  // giriş silindi
  st = mk();
  r = await syncManaged({ store: st, net: netOf(await cfgWith([[newCode(), payload()]])), now: NOW, sleep: noSleep });
  assert.equal(st.src.length, 0);
  assert.match(r.removed[0].reason, /artık geçerli değil/);
  // süresi doldu
  st = mk();
  r = await syncManaged({ store: st, net: netOf(await cfgWith([[a, payload({ x: NOW - 1 })]])), now: NOW, sleep: noSleep });
  assert.equal(st.src.length, 0);
  assert.match(r.removed[0].reason, /süresi doldu/);
  // cihaz engelli
  st = mk();
  r = await syncManaged({ store: st, net: netOf(await cfgWith([[a, payload()]], { blocked: ['a1b2c3d4e5f6'] })), deviceId: 'a1b2c3d4e5f6', now: NOW, sleep: noSleep });
  assert.equal(st.src.length, 0);
  assert.match(r.removed[0].reason, /kapatıldı/);
  // elle eklenen kaynaklar korunur
  st = fakeStore([{ id: 'el', type: 'm3u', url: 'http://benim/l' }, ...toSources(payload(), id, norm)]);
  await syncManaged({ store: st, net: netOf(await cfgWith([])), now: NOW, sleep: noSleep });
  assert.deepEqual(st.src.map((s) => s.id), ['el']);
  // bozuk giriş (çözülemeyen): silmez
  st = mk();
  const broken = { v: 1, at: NOW, entries: { [id]: await sealEntry(newCode(), payload()) } };
  r = await syncManaged({ store: st, net: netOf(broken), now: NOW, sleep: noSleep });
  assert.equal(st.src.length, 2);
  assert.equal(r.errors, 1);
});

test('fetchConfig: önbellek kırıcı eklenir, geçici hata yeniden denenir, bozuk dosya reddedilir', async () => {
  const urls = [];
  let n = 0;
  const net = { json: async (u) => { urls.push(u); if (++n === 1) throw new Error('HTTP 503'); return { v: 1, at: 5, entries: {} }; } };
  const cfg = await fetchConfig(net, { sleep: noSleep });
  assert.equal(cfg.at, 5);
  assert.match(urls[0], /\/data\/config\.json\?check=\d+$/);
  assert.equal(urls.length, 2);
  await assert.rejects(() => fetchConfig({ json: async () => ({ x: 1 }) }, { sleep: noSleep }), /okunamadı/);
});

test('cihaz kimliği: 12 hex, kalıcı, biçimli gösterim', () => {
  const st = fakeStore();
  const id = deviceId(st);
  assert.match(id, /^[0-9a-f]{12}$/);
  assert.equal(deviceId(st), id);
  assert.match(fmtDeviceId(id), /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal(normDevice(fmtDeviceId(id)), id);
});
