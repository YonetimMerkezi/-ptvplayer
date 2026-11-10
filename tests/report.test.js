import test from 'node:test';
import assert from 'node:assert/strict';
import { hostOf, scrub, pushError, buildReport, encodeReport, decodeReport, describeReport, summarize, REPORT_PREFIX, MAX_CHARS, MAX_ERRORS } from '../www/js/report.js';

const NOW = Date.UTC(2026, 10, 10);
const input = (over = {}) => ({
  version: '1.0.101',
  tv: false,
  deviceId: 'a1b2-c3d4-e5f6',
  sources: [
    { type: 'xtream', server: 'http://sunucu.example:8080/', user: 'kul-GIZLI', pass: 'SIFRE-GIZLI', managed: true },
    { type: 'm3u', url: 'http://liste.example/get.php?username=kul-GIZLI&password=SIFRE-GIZLI&type=m3u' },
    { type: 'm3u', local: true, fileName: 'ozel-dosya.m3u' },
  ],
  counts: { live: 1200, movie: 300, series: 40 },
  bad: [{ name: 'TRT 1 HD', at: NOW - 1000 }, { name: 'Show TV', at: NOW }],
  errors: [{ at: NOW, k: 'live', n: 'TRT 1 HD', m: 'Hata http://sunucu.example:8080/live/kul-GIZLI/SIFRE-GIZLI/55.ts açılamadı password=SIFRE-GIZLI' }],
  hist: { ok: 10, fail: 2, unknown: 1 },
  ...over,
});
const LEAK = ['GIZLI', 'get.php', 'username', 'live/kul', 'ozel-dosya'];

test('hostOf: yalnız sunucu adı ve port', () => {
  assert.equal(hostOf('http://u:p@Sunucu.Example:8080/x?y=1'), 'sunucu.example:8080');
  assert.equal(hostOf('https://a.b/c'), 'a.b');
  assert.equal(hostOf('abc'), '');
  assert.equal(hostOf(null), '');
});

test('scrub: adresleri sunucuya indirir, gizli değerleri kapatır, kırpar', () => {
  assert.equal(scrub('açılamadı http://x.example/a/b?password=1 bitti'), 'açılamadı x.example bitti');
  assert.equal(scrub('password=abc token: xyz'), 'password=•••• token=••••');
  assert.equal(scrub('a'.repeat(500)).length, 100);
  assert.equal(scrub(null), '');
});

test('hata tamponu: sınır ve art arda tekrar', () => {
  let l = [];
  for (let i = 0; i < 100; i++) l = pushError(l, { k: 'live', n: 'K' + i, m: 'x' }, NOW + i);
  assert.equal(l.length, MAX_ERRORS);
  assert.equal(l[l.length - 1].n, 'K99');
  const same = pushError(l, { k: 'live', n: 'K99', m: 'x' }, NOW + 500);
  assert.equal(same.length, MAX_ERRORS);
  assert.equal(same, l);
  assert.equal(pushError(undefined, { n: 'a', m: 'b' }).length, 1);
});

test('rapor: kimlik bilgisi ve adres yolu sızmaz', () => {
  const rep = buildReport(input(), NOW);
  const text = encodeReport(rep);
  assert.ok(text.startsWith(REPORT_PREFIX));
  const json = JSON.stringify(rep);
  for (const s of LEAK) {
    assert.ok(!json.includes(s), 'rapor nesnesinde sızıntı: ' + s);
    assert.ok(!Buffer.from(text.slice(REPORT_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString().includes(s), 'metinde sızıntı: ' + s);
  }
  assert.deepEqual(rep.s.map((s) => [s.t, s.h, s.g]), [['xtream', 'sunucu.example:8080', 1], ['m3u', 'liste.example', 0], ['dosya', '', 0]]);
  assert.equal(rep.id, 'a1b2c3d4e5f6');
  assert.ok(!describeReport(rep).includes('GIZLI'));
});

test('rapor: kodlama gidiş-dönüş, gürültülü metin, bozuk girdiler', () => {
  const rep = buildReport(input(), NOW);
  const text = encodeReport(rep);
  assert.deepEqual(decodeReport(text), rep);
  const wrapped = 'Merhaba, raporum:\n' + text.replace(/(.{60})/g, '$1\n') + '\nTeşekkürler';
  assert.deepEqual(decodeReport(wrapped), rep);
  assert.equal(decodeReport('rapor yok'), null);
  assert.equal(decodeReport(REPORT_PREFIX + '***'), null);
  assert.equal(decodeReport(REPORT_PREFIX + 'AAAA'), null);
  assert.equal(decodeReport(null), null);
  // Türkçe karakter
  const tr = buildReport(input({ bad: [{ name: 'Çocuk Şarkıları İğ', at: 1 }] }), NOW);
  assert.equal(decodeReport(encodeReport(tr)).bad[0].n, 'Çocuk Şarkıları İğ');
});

test('rapor: dışarıdan gelen sahte rapor yeniden süzülür', () => {
  const evil = { r: 1, at: NOW, v: 'x'.repeat(100), tv: 1, id: 'a1b2c3d4e5f6', s: [{ t: 'xtream', h: 'h'.repeat(200), g: 1, pass: 'GIZLI' }], n: { l: 'abc', m: 5, d: 1 }, q: {}, bad: [{ n: 'k', at: 1, x: 'GIZLI' }], e: [{ at: 1, k: 'live', n: 'k', m: 'http://a.b/GIZLI/c?password=GIZLI', extra: 'GIZLI' }], gizli: 'GIZLI' };
  const text = REPORT_PREFIX + Buffer.from(JSON.stringify(evil)).toString('base64url');
  const r = decodeReport(text);
  assert.ok(r);
  assert.ok(!JSON.stringify(r).includes('GIZLI'));
  assert.equal(r.v.length, 20);
  assert.equal(r.s[0].h.length, 60);
  assert.equal(r.n.l, 0);
  assert.equal(decodeReport(REPORT_PREFIX + Buffer.from(JSON.stringify({ ...evil, id: 'zz' })).toString('base64url')), null);
});

test('rapor: çok uzun veri boyut sınırına kırpılır', () => {
  const errors = Array.from({ length: 200 }, (_, i) => ({ at: i, k: 'live', n: 'Kanal ' + 'ğ'.repeat(30) + i, m: 'hata iletisi uzun uzun ' + i }));
  const bad = Array.from({ length: 200 }, (_, i) => ({ name: 'Çalışmayan kanal ' + 'ş'.repeat(25) + i, at: i }));
  const text = encodeReport(buildReport(input({ errors, bad }), NOW));
  assert.ok(text.length <= MAX_CHARS, 'uzunluk: ' + text.length);
  assert.ok(decodeReport(text));
});

test('özet: aynı cihazın en yeni raporu, sürüm dağılımı, en çok hata veren kanallar', () => {
  const mk = (id, v, at, names, tv = false) => buildReport(input({ deviceId: id, version: v, tv, bad: names.map((name) => ({ name, at })), errors: [] }), at);
  const s = summarize([
    mk('a1b2c3d4e5f6', '1.0.100', 1, ['Eski']),
    mk('a1b2c3d4e5f6', '1.0.101', 5, ['TRT 1', 'Show']),
    mk('b1b2c3d4e5f6', '1.0.101', 3, ['TRT 1'], true),
    mk('c1b2c3d4e5f6', '1.0.99', 2, ['TRT 1', 'Atv']),
  ]);
  assert.equal(s.devices, 3);
  assert.equal(s.tvs, 1);
  assert.deepEqual(s.versions, { '1.0.101': 2, '1.0.99': 1 });
  assert.deepEqual(s.top[0], { name: 'TRT 1', devices: 3 });
  assert.ok(!s.top.some((t) => t.name === 'Eski'));
});

test('decodeAll: art arda yapıştırılan raporlar ayrı ayrı çözülür, bozuklar atlanır', async () => {
  const { decodeAll } = await import('../www/js/report.js');
  const a = encodeReport(buildReport(input({ deviceId: 'a1b2c3d4e5f6' }), NOW));
  const b = encodeReport(buildReport(input({ deviceId: 'b1b2c3d4e5f6' }), NOW + 1));
  const all = decodeAll(`Ali:\n${a}\n\nVeli:\n${b}\nbozuk ${REPORT_PREFIX}xxx.`);
  assert.deepEqual(all.map((r) => r.id), ['a1b2c3d4e5f6', 'b1b2c3d4e5f6']);
  assert.deepEqual(decodeAll('rapor yok'), []);
});
