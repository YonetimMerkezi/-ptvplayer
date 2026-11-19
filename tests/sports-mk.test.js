import test from 'node:test';
import assert from 'node:assert/strict';
import { mkUrl, parseMkTime, mkStatus, parseMackolik, loadMackolikDay } from '../www/js/sports-mk.js';
import { mergeSources } from '../www/js/sports-ls.js';
import { mergeSe, seInfoFor } from '../www/js/sports-se.js';

// Gerçek yanıttan (18/11/2026) alınan satırların konumları: 0 kimlik, 2 ev, 4 dep, 5 durum kodu, 6 durum yazısı, 7 DEVRE ARASI skoru (yazı),
// 12/13 güncel gol (sayı), 29/30 aynı skor (yazı), 31/32 devre arası golleri, 16 saat, 35 tarih, 36 yarışma.
const row = (id, home, away, code, text, ft, time, date, comp, ht = [0, 0]) => {
  const r = new Array(38).fill(0);
  r[0] = id; r[1] = 1; r[2] = home; r[3] = 2; r[4] = away; r[5] = code; r[6] = text; r[7] = `${ht[0]}-${ht[1]}`;
  r[12] = ft[0]; r[13] = ft[1]; r[29] = String(ft[0]); r[30] = String(ft[1]); r[31] = String(ht[0]); r[32] = String(ht[1]);
  r[16] = time; r[35] = date; r[36] = comp; r[33] = null;
  return r;
};
const ELA = row(4500020, 'Elazığspor', 'Menemen FK', 4, 'MS', [1, 1], '13:00', '18/11/2026', [1, 'Türkiye', 1708, '2.Lig Beyaz Grup', 73493, '2026/2027', '', 0, 1, 'T2L-B', 0, 1], [1, 1]);
const BNG = row(4499744, '12 Bingölspor', 'Sakaryaspor', 4, 'MS', [0, 1], '13:00', '18/11/2026', [1, 'Türkiye', 1707, '2.Lig Kırmızı Grup', 73494, '2026/2027', '', 0, 1, 'T2L-K', 0, 1], [0, 0]);
const BRA = row(4423376, 'Coritiba', 'Santos', 4, 'MS', [0, 0], '01:30', '19/11/2026', [32, 'Brezilya', 83, 'Serie A', 71950, '2026', '', 0, 1, 'BR1', 0, 1]);
const KDN = row(4555360, 'Fenerbahçe (K)', 'Ünye Gücü (K)', 4, 'MS', [2, 0], '14:00', '18/11/2026', [1, 'Türkiye', 1, 'Kadınlar Süper Lig', 1, '2026/2027', '', 0, 1, 'TKS', 0, 1]);
const BSK = row(4547922, 'Beşiktaş Fuzul', 'Real Madrid', 13, 'MS', [45, 37], '21:30', '18/11/2026', [436, 'EuroLeague', 5, 'Normal Sezon', 9, '2026/2027', '', 0, 1, 'EL', 0, 1]);
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
  const pre = row(1, 'Galatasaray', 'Fenerbahçe', 0, '', [0, 0], '20:00', '22/11/2026', [1, 'Türkiye', 1, 'Süper Lig', 1, '2026/2027', '', 0, 1, 'TSL', 0, 1]);
  const cup = row(2, 'Sivasspor', 'Bursaspor', 0, '', [0, 0], '19:00', '22/11/2026', [1, 'Türkiye', 2, 'Ziraat Türkiye Kupası', 1, '2026/2027', '', 0, 1, 'ZTK', 0, 1]);
  const first = row(3, 'Bandırmaspor', 'Boluspor', 0, '', [0, 0], '16:00', '22/11/2026', [1, 'Türkiye', 3, '1.Lig', 1, '2026/2027', '', 0, 1, 'T1L', 0, 1]);
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
  const pre = row(1, 'Galatasaray', 'Fenerbahçe', 0, '', [0, 0], '20:00', '22/11/2026', [1, 'Türkiye', 1, 'Süper Lig', 1, '2026/2027', '', 0, 1, 'TSL', 0, 1]);
  const r = mergeSources(espn, parseMackolik({ m: [pre] }, { now: NOW }));
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0].src, 'espn');
});

test('maç skoru devre arası skoru değil güncel gol alanlarından okunur (12 Bingölspor 0-1 Sakaryaspor, İY 0-0)', () => {
  const [m] = parseMackolik({ m: [BNG] }, { now: NOW });
  assert.equal(m.state, 'post');
  assert.equal(m.home.score, 0);
  assert.equal(m.away.score, 1, '7. alan "0-0" devre arasıdır; maç sonu 0-1');
  const ht = row(7, 'Ankara Demirspor', '52 Orduspor FK', 4, 'MS', [0, 2], '13:00', '18/11/2026', BNG[36], [0, 1]);
  const [h] = parseMackolik({ m: [ht] }, { now: NOW });
  assert.deepEqual([h.home.score, h.away.score], [0, 2]);
});

test('güncel gol alanı yoksa yazı alanlarına (29/30) düşer; ikisi de yoksa skor boş kalır, devre arası skoru gösterilmez', () => {
  const a = row(8, 'Adana Demirspor', 'GMG Kastamonuspor', 4, 'MS', [2, 2], '13:00', '18/11/2026', BNG[36], [2, 1]);
  a[12] = null; a[13] = null;
  const [x] = parseMackolik({ m: [a] }, { now: NOW });
  assert.deepEqual([x.home.score, x.away.score], [2, 2]);
  const b = row(9, 'Serik Spor', 'Erzincanspor', 4, 'MS', [0, 1], '13:00', '18/11/2026', BNG[36], [0, 0]);
  b[12] = null; b[13] = null; b[29] = null; b[30] = null;
  const [y] = parseMackolik({ m: [b] }, { now: NOW });
  assert.equal(y.home.score, null);
  assert.equal(y.away.score, null);
});

test('canlı maç: dakika ve güncel skor; saati geçmiş ama durumsuz 0-0 kayıt biten sayılmaz', () => {
  const live = row(10, 'Boluspor', 'Bandırmaspor', 2, "63'", [1, 0], '19:00', '19/11/2026', BNG[36], [0, 0]);
  const [l] = parseMackolik({ m: [live] }, { now: Date.UTC(2026, 10, 19, 16, 3) });
  assert.equal(l.state, 'in');
  assert.equal(l.text, "63'");
  assert.deepEqual([l.home.score, l.away.score], [1, 0]);
  const stale = row(11, 'Kırklarelispor', 'Serik Spor', 0, '', [0, 0], '08:00', '19/11/2026', BNG[36]);
  assert.equal(parseMackolik({ m: [stale] }, { now: NOW })[0].state, 'pre');
});
