import test from 'node:test';
import assert from 'node:assert/strict';
import { mkUrl, parseMkTime, mkStatus, parseMackolik, loadMackolikDay } from '../www/js/sports-mk.js';
import { mergeSources } from '../www/js/sports-ls.js';
import { mergeSe, seInfoFor } from '../www/js/sports-se.js';

// Gerçek yanıttan (18/11/2026) alınan satırların konumları: 0 kimlik, 2 ev, 4 dep, 5 durum kodu, 6 durum yazısı, 7 skor, 16 saat, 35 tarih, 36 yarışma.
const row = (id, home, away, code, text, score, time, date, comp) => {
  const r = new Array(38).fill(0);
  r[0] = id; r[1] = 1; r[2] = home; r[3] = 2; r[4] = away; r[5] = code; r[6] = text; r[7] = score; r[16] = time; r[35] = date; r[36] = comp; r[33] = null;
  return r;
};
const ELA = row(4500020, 'Elazığspor', 'Menemen FK', 4, 'MS', '1-1', '13:00', '18/11/2026', [1, 'Türkiye', 1708, '2.Lig Beyaz Grup', 73493, '2026/2027', '', 0, 1, 'T2L-B', 0, 1]);
const BNG = row(4499744, '12 Bingölspor', 'Sakaryaspor', 4, 'MS', '0-0', '13:00', '18/11/2026', [1, 'Türkiye', 1707, '2.Lig Kırmızı Grup', 73494, '2026/2027', '', 0, 1, 'T2L-K', 0, 1]);
const BRA = row(4423376, 'Coritiba', 'Santos', 4, 'MS', '0-0', '01:30', '19/11/2026', [32, 'Brezilya', 83, 'Serie A', 71950, '2026', '', 0, 1, 'BR1', 0, 1]);
const KDN = row(4555360, 'Fenerbahçe (K)', 'Ünye Gücü (K)', 4, 'MS', '2-0', '14:00', '18/11/2026', [1, 'Türkiye', 1, 'Kadınlar Süper Lig', 1, '2026/2027', '', 0, 1, 'TKS', 0, 1]);
const BSK = row(4547922, 'Beşiktaş Fuzul', 'Real Madrid', 13, 'MS', '45-37', '21:30', '18/11/2026', [436, 'EuroLeague', 5, 'Normal Sezon', 9, '2026/2027', '', 0, 1, 'EL', 0, 1]);
const NOW = Date.UTC(2026, 10, 19, 12, 0);

test('mkUrl / parseMkTime: gün adresi ve Türkiye saati (UTC+3)', () => {
  assert.equal(mkUrl(new Date(2026, 10, 18).getTime()), 'https://vd.mackolik.com/livedata?date=18/11/2026');
  assert.equal(parseMkTime('18/11/2026', '13:00'), Date.UTC(2026, 10, 18, 10, 0));
  assert.equal(parseMkTime('18/11/2026', '01:30'), Date.UTC(2026, 10, 17, 22, 30));
  assert.equal(parseMkTime('', '13:00'), null);
  assert.equal(parseMkTime('18/11/2026', ''), null);
});

test('mkStatus: MS, İY, dakika, ertelendi, başlamadı, bilinmeyen kod', () => {
  assert.deepEqual(mkStatus(4, 'MS'), { state: 'post', text: 'MS' });
  assert.deepEqual(mkStatus(2, 'İY'), { state: 'in', text: 'Devre arası' });
  assert.deepEqual(mkStatus(1, "67'"), { state: 'in', text: "67'" });
  assert.deepEqual(mkStatus(3, '90+3'), { state: 'in', text: "90+3'" });
  assert.deepEqual(mkStatus(9, 'Ert.'), { state: 'pre', text: 'Ertelendi', off: true });
  assert.deepEqual(mkStatus(0, '', { t: NOW + 3600e3, now: NOW }), { state: 'pre', text: '' });
  assert.equal(mkStatus(0, '', { t: NOW - 5 * 3600e3, now: NOW, scored: true }).state, 'post', 'saati çok geçmiş, skorlu, durumsuz kayıt biten sayılır');
  assert.equal(mkStatus(8, 'Pen').state, 'post');
  assert.equal(mkStatus(7, 'Xyz', { t: NOW + 1e6, now: NOW }).state, 'pre');
});

test('parseMackolik: yalnız Türkiye erkek profesyonel futbolu; basketbol, kadın, yabancı lig ve bozuk satır elenir', () => {
  const ms = parseMackolik({ m: [ELA, BNG, BRA, KDN, BSK, [1, 2], null, ELA] }, { now: NOW });
  assert.equal(ms.length, 2, 'yinelenen kimlik bir kez');
  const [a, b] = ms;
  assert.equal(a.id, 'mk:4500020');
  assert.equal(a.src, 'mk');
  assert.equal(a.grp, 'tr');
  assert.equal(a.lgName, 'Türkiye · 2. Lig: Beyaz Grup');
  assert.equal(a.t, Date.UTC(2026, 10, 18, 10, 0));
  assert.equal(a.state, 'post');
  assert.equal(a.text, 'MS');
  assert.equal(a.home.score, 1);
  assert.equal(a.away.score, 1);
  assert.equal(a.home.name, 'Elazığspor');
  assert.equal(b.lgName, 'Türkiye · 2. Lig: Kırmızı Grup');
  assert.notEqual(a.lg, b.lg);
  assert.equal(parseMackolik(null).length, 0);
  assert.equal(parseMackolik({ m: 'x' }).length, 0);
});

test('parseMackolik: başlamamış maçta skor yok; Süper Lig ve kupa sıralaması', () => {
  const pre = row(1, 'Galatasaray', 'Fenerbahçe', 0, '', '', '20:00', '22/11/2026', [1, 'Türkiye', 1, 'Süper Lig', 1, '2026/2027', '', 0, 1, 'TSL', 0, 1]);
  const cup = row(2, 'Sivasspor', 'Bursaspor', 0, '', '', '19:00', '22/11/2026', [1, 'Türkiye', 2, 'Ziraat Türkiye Kupası', 1, '2026/2027', '', 0, 1, 'ZTK', 0, 1]);
  const first = row(3, 'Bandırmaspor', 'Boluspor', 0, '', '', '16:00', '22/11/2026', [1, 'Türkiye', 3, '1.Lig', 1, '2026/2027', '', 0, 1, 'T1L', 0, 1]);
  const [g, k, f] = parseMackolik({ m: [pre, cup, first] }, { now: NOW });
  assert.equal(g.state, 'pre');
  assert.equal(g.home.score, null);
  assert.deepEqual([g.ord, k.ord, f.ord], [0, 1, 2]);
  assert.equal(f.lgName, 'Türkiye · 1. Lig');
});

test('loadMackolikDay: adres, yanıt doğrulama ve hata nedeni', async () => {
  const urls = [];
  const net = { json: async (u) => (urls.push(u), { m: [ELA] }) };
  const r = await loadMackolikDay({ net, dayMs: new Date(2026, 10, 18).getTime(), now: NOW });
  assert.equal(r.matches.length, 1);
  assert.equal(urls[0], 'https://vd.mackolik.com/livedata?date=18/11/2026');
  await assert.rejects(loadMackolikDay({ net: { json: async () => ({ x: 1 }) }, dayMs: 0 }), (e) => /Mackolik/.test(e.message) && /biçim/.test(e.detail));
  await assert.rejects(loadMackolikDay({ net: { json: async () => { throw new Error('Connection reset'); } }, dayMs: 0 }), (e) => e.detail === 'Connection reset');
});

test('birleşik liste: Mackolik 2. Lig maçı yayın sitesi satırıyla tek maç olur; kanal skorlu maçta kalır', () => {
  const mk = parseMackolik({ m: [ELA, BNG] }, { now: NOW });
  const base = mergeSources([], mk).matches;
  const rows = [{ id: '21', t: mk[0].t, title: 'Elazığspor - Menemenspor TFF 2. Lig', teams: ['Elazığspor', 'Menemenspor'], comp: 'TFF 2. Lig', channels: ['Tivibu Spor 1'], logos: {} }];
  const all = mergeSe(base, rows);
  assert.equal(all.length, 2);
  assert.ok(all.every((m) => m.src === 'mk'));
  assert.deepEqual(seInfoFor(all.find((m) => m.id === 'mk:4500020'), rows).channels, ['Tivibu Spor 1']);
});

test('ESPN ile aynı maç (Süper Lig) Mackolik listesinden yinelenmez', () => {
  const t = Date.UTC(2026, 10, 22, 17, 0);
  const espn = [{ id: 'espn:1', lg: 'tur.1', lgName: 'Süper Lig', grp: 'tr', ord: 0, src: 'espn', t, state: 'pre', text: '', home: { name: 'Galatasaray', label: 'Galatasaray', score: null }, away: { name: 'Fenerbahçe', label: 'Fenerbahçe', score: null } }];
  const pre = row(1, 'Galatasaray', 'Fenerbahçe', 0, '', '', '20:00', '22/11/2026', [1, 'Türkiye', 1, 'Süper Lig', 1, '2026/2027', '', 0, 1, 'TSL', 0, 1]);
  const r = mergeSources(espn, parseMackolik({ m: [pre] }, { now: NOW }));
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0].src, 'espn');
});
