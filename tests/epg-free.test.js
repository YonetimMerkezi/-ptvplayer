import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createNet } from '../www/js/net.js';
import {
  istDate, istDayStart, freeWindow, chanKey, parseTvdebugun, fetchSource, sameSlot, mergePrograms, buildFreeData, validateFree,
  matchFree, mergeEpgData, loadFreeData, probeFreeSources, FREE_SOURCES, AGG_URLS, MIN_CHANNELS,
} from '../www/js/epg-free.js';
import { EpgView } from '../www/js/catalog.js';

const NOW = Date.UTC(2026, 10, 12, 17, 0, 0); // 12 Kasım 2026 20:00 İstanbul
const D0 = istDayStart(NOW, 0);
const at = (h, m = 0, day = 0) => D0 + day * 864e5 + (h * 60 + m) * 60000;
const fixture = readFileSync(new URL('./fixtures/tvdebugun-gun.html', import.meta.url), 'utf8');

function fakeServer(routes, calls = []) {
  return createNet({
    fetchImpl: async (url) => {
      calls.push(String(url));
      for (const [re, fn] of routes) if (re.test(url)) return typeof fn === 'function' ? fn(url) : new Response(fn);
      return new Response('yok', { status: 404 });
    },
  });
}

// XMLTV üretici: her kanal bugün 00:00'dan başlayan ardışık programlar
function xmltv(n, { name = (i) => `KANAL ${i}.tr`, extra = '', day = '20261112' } = {}) {
  let s = '<?xml version="1.0"?><tv>';
  for (let i = 1; i <= n; i++) s += `<channel id="c${i}" country="${i % 2 ? 'tr' : 'es'}"><display-name>${name(i)}</display-name></channel>`;
  for (let i = 1; i <= n; i++) {
    s += `<programme start="${day}190000 +0300" stop="${day}210000 +0300" channel="c${i}"><title>Akşam ${i}</title>${extra}</programme>`;
    s += `<programme start="${day}210000 +0300" stop="${day}230000 +0300" channel="c${i}"><title>Gece ${i}</title></programme>`;
  }
  return s + '</tv>';
}

test('İstanbul günü: UTC+3, gece yarısı sınırı', () => {
  assert.equal(istDate(NOW), '2026-11-12');
  assert.equal(istDate(Date.UTC(2026, 10, 12, 21, 30)), '2026-11-13'); // 00:30 İstanbul
  assert.equal(istDate(NOW, 1), '2026-11-13');
  assert.equal(D0, Date.UTC(2026, 10, 11, 21, 0, 0));
  assert.deepEqual(freeWindow(NOW), { from: D0, to: D0 + 2 * 864e5 });
});

test('chanKey: kaynak adları tek anahtarda buluşur', () => {
  const same = (...names) => {
    const k = chanKey(names[0]);
    assert.ok(k, names[0]);
    for (const n of names) assert.equal(chanKey(n), k, n);
  };
  same('ATV', 'ATV.tr', 'ATV HD', 'TR: ATV HD', '|TR| atv', 'atv');
  same('Star TV', 'STAR TV HD', 'STAR', 'TR: Star');
  same('Show TV', 'SHOW TV HD', 'SHOW', 'Show');
  same('NOW TV', 'FOX HD', 'NOW', 'Fox TV');
  same('Kanal D', 'KANAL D HD', 'KANAL.D.HD.tr', 'TR ⇒ Kanal D FHD');
  same('TRT 1', 'TRT 1 HD', 'TRT.1.HD.tr', 'TRT 1 FHD', '[TR] TRT 1');
  same('TV8', 'TV 8', 'TV8 HD', 'tv8.tr');
  same('A Haber', 'AHABER.tr', 'A HABER HD');
  same('CNN Türk', 'CNN TURK.tr', 'CNN TÜRK HD');
  same('Habertürk', 'HABERTURK.tr', 'HABERTÜRK');
  same('24 TV', '24 TV.tr');
  same('360', '360.tr', '360 HD', '360 TV');
  same('beIN Sports 1', 'beIN SPORTS 1.tr', 'BEIN SPORTS 1 HD');
  // farklı kanallar karışmaz
  assert.notEqual(chanKey('TRT 1'), chanKey('TRT 2'));
  assert.notEqual(chanKey('beIN Sports 1'), chanKey('beIN Sports 2'));
  assert.notEqual(chanKey('Kanal D'), chanKey('Kanal 7'));
  assert.equal(chanKey(''), '');
  assert.equal(chanKey(null), '');
});

test('tvdebugun: gerçek sayfa örneği ayrıştırılır (kanal, saat, süre, tür, rozet)', () => {
  const r = parseTvdebugun(fixture, D0);
  assert.equal(r.date, '2026-11-12');
  assert.deepEqual(r.channels.map((c) => c.name), ['TRT 1', 'TV8', 'atv', 'Star TV']);
  const trt = r.channels[0].list;
  assert.equal(trt.length, 15);
  assert.equal(trt[0].t, 'Mehmed: Fetihler Sultanı');
  assert.equal(trt[0].s, at(1, 0));
  assert.equal(trt[0].e, at(1, 40)); // "40 dk"
  assert.equal(trt[1].e, at(3, 25)); // "1 sa 45 dk" sonraki programa kadar
  assert.equal(trt[4].t, 'İstiklal Marşı');
  assert.equal(trt[4].e, at(5, 45)); // "2 dk"
  assert.equal(trt[trt.length - 1].t, 'Tehlikeli Miras');
  assert.equal(trt[trt.length - 1].e, null); // son programın bitişi sayfada yok
  assert.ok(trt.every((p, i) => i === 0 || p.s > trt[i - 1].s));
  // rozetler yalnız kaynakta varsa
  const tv8 = r.channels[1].list;
  assert.ok(tv8.some((p) => p.f === 'n'));
  assert.ok(tv8.every((p) => ['', 'n', 'r', 'l'].includes(p.f)));
  const canli = r.channels[2].list.find((p) => p.f === 'l');
  assert.equal(canli.t, 'Güneşin Doğduğu Yer'); // başlıktaki "CANLI" öneki rozete taşınır
  assert.ok(r.channels[3].list.some((p) => p.f === 'r'));
  assert.ok(trt.every((p) => !p.f)); // etiketsiz program etiket almaz
});

test('tvdebugun: bozuk ya da boş sayfa çökertmez', () => {
  assert.deepEqual(parseTvdebugun('', D0), { date: '', channels: [] });
  assert.equal(parseTvdebugun('<html>değişmiş tasarım</html>', D0).channels.length, 0);
});

test('fetchSource: XMLTV kaynağı alınır, ülke süzgeci ve güncellik denetimi', async () => {
  const gz = gzipSync(Buffer.from(xmltv(12)));
  const net = fakeServer([[/ok\.xml/, gz]]);
  const r = await fetchSource({ id: 'x', name: 'X', kind: 'xmltv', url: 'http://s/ok.xml.gz'.replace('ok.xml.gz', 'ok.xml') }, net, NOW);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.ch, 12);
  assert.equal(r.pr, 24);
  assert.equal(r.onAir, 12);
  assert.equal(r.channels[0].name, 'KANAL 1'); // ".tr" eki atılır
  // ülke süzgeci: yalnız country="tr" kanalları
  const net2 = fakeServer([[/ok\.xml/, xmltv(24)]]);
  const tr = await fetchSource({ id: 'x', name: 'X', kind: 'xmltv', country: 'tr', url: 'http://s/ok.xml' }, net2, NOW);
  assert.equal(tr.ch, 12);
  assert.ok(tr.channels.every((c) => Number(c.name.replace(/\D/g, '')) % 2 === 1));
});

test('fetchSource: eski, az kanallı ve ulaşılamayan kaynak geçersiz sayılır', async () => {
  const stale = await fetchSource({ id: 'e', name: 'Eski', kind: 'xmltv', url: 'http://s/e.xml' }, fakeServer([[/e\.xml/, xmltv(12, { day: '20261101' })]]), NOW);
  assert.equal(stale.ok, false);
  assert.match(stale.error, /güncel değil|program yok/);
  const few = await fetchSource({ id: 'f', name: 'Az', kind: 'xmltv', url: 'http://s/f.xml' }, fakeServer([[/f\.xml/, xmltv(MIN_CHANNELS - 1)]]), NOW);
  assert.equal(few.ok, false);
  assert.match(few.error, /çok az kanal/);
  const down = await fetchSource({ id: 'd', name: 'Kapalı', kind: 'xmltv', url: 'http://s/d.xml' }, fakeServer([]), NOW);
  assert.equal(down.ok, false);
  assert.match(down.error, /404/);
  const empty = await fetchSource({ id: 'z', name: 'Boş', kind: 'xmltv', url: 'http://s/z.xml' }, fakeServer([[/z\.xml/, '<tv></tv>']]), NOW);
  assert.equal(empty.ok, false);
});

function manyCards(n) {
  const card = fixture.match(/<li class="kart">[\s\S]*?<\/ol><\/li>/)[0];
  return `<html><head><meta property="og:url" content="https://tvdebugun.net/yayin-akisi/2026-11-12/"/></head><body><ul>${Array.from({ length: n }, (_, i) => card.replace('>TRT 1<', `>Kanal ${i + 1}<`)).join('')}</ul></body></html>`;
}

test('fetchSource: tvdebugun iki gün sayfası; son programın bitişi ertesi güne bağlanır, farklı gün sayfası atılır', async () => {
  const day = (d, n) => manyCards(n).replace('2026-11-12', d);
  const calls = [];
  const net = fakeServer(
    [
      [/2026-11-12/, () => new Response(day('2026-11-12', 10))],
      [/2026-11-13/, () => new Response(day('2026-11-13', 10))],
    ],
    calls
  );
  const src = FREE_SOURCES.find((s) => s.id === 'tvdebugun');
  const r = await fetchSource(src, net, NOW);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.ch, 10);
  assert.equal(r.pr, 300);
  assert.equal(r.tomorrow, true);
  const c = r.channels[0].list;
  assert.equal(c[14].t, 'Tehlikeli Miras');
  assert.equal(c[14].e, c[15].s); // ertesi günün ilk programı
  assert.ok(c.every((p) => p.e > p.s));
  // yarın sayfası başka gün gösteriyorsa kullanılmaz; bugün yine çalışır
  const net2 = fakeServer([[/2026-11-12/, () => new Response(day('2026-11-12', 10))], [/2026-11-13/, () => new Response(day('2026-11-12', 10))]]);
  const r2 = await fetchSource(src, net2, NOW);
  assert.equal(r2.ok, true);
  assert.equal(r2.tomorrow, false);
  assert.match(r2.note, /farklı gün/);
  // iki sayfa da olmazsa kaynak geçersiz
  const r3 = await fetchSource(src, fakeServer([]), NOW);
  assert.equal(r3.ok, false);
});

const P = (s, e, t, extra = {}) => ({ s, e, t, d: '', c: '', x: '', f: '', ...extra });

test('sameSlot: aynı anda başlayanlar aynı dilimdir; kaymış ise adlar uyumlu olmalı', () => {
  assert.ok(sameSlot(P(at(20), at(21), 'Haber'), P(at(20, 1), at(21), 'Başka ad')));
  assert.ok(sameSlot(P(at(20), at(21), 'Kardeşlerim'), P(at(20, 10), at(21), 'Kardeşlerim 45. Bölüm')));
  assert.ok(!sameSlot(P(at(20), at(21), 'Haber'), P(at(20, 10), at(21), 'Dizi')));
  assert.ok(!sameSlot(P(at(20), at(21), 'Haber'), P(at(22), at(23), 'Haber')));
});

test('mergePrograms: kopya atılır, eksik alan tamamlanır, çakışan eklenmez, boşluk doldurulur', () => {
  const win = freeWindow(NOW);
  const a = [P(at(19), at(20), 'Ana Haber'), P(at(20), at(22), 'Kardeşlerim', { x: '2. Sezon 5. Bölüm' }), P(at(22), at(23), 'Film')];
  const b = [
    P(at(19), at(20), 'Ana Haber', { c: 'Haber' }),
    P(at(20, 3), at(22), 'Kardeşlerim 5. Bölüm', { c: 'Dizi', f: 'n', d: 'Özet metni' }),
    P(at(20, 30), at(21), 'Çakışan başka program'),
    P(at(23), at(23, 30), 'Gece Filmi'), // a'da boş kalan aralık
  ];
  const stat = { dup: 0, filled: 0, clash: 0, base: '' };
  const out = mergePrograms([{ id: 'a', list: a }, { id: 'b', list: b }], win, stat);
  assert.deepEqual(out.map((p) => p.t), ['Ana Haber', 'Kardeşlerim', 'Film', 'Gece Filmi']);
  const dizi = out[1];
  assert.equal(dizi.s, at(20)); // temel kaynağın saati korunur
  assert.equal(dizi.x, '2. Sezon 5. Bölüm');
  assert.equal(dizi.c, 'Dizi');
  assert.equal(dizi.f, 'n');
  assert.equal(dizi.d, 'Özet metni');
  assert.equal(out[0].c, 'Haber');
  assert.equal(stat.dup, 2);
  assert.equal(stat.clash, 1);
  assert.equal(stat.base, 'a');
  // yalnız tek kaynak
  assert.equal(mergePrograms([{ id: 'a', list: a }], win).length, 3);
});

test('mergePrograms: etiket/bölüm yalnız kaynakta varsa gelir, uydurulmaz', () => {
  const win = freeWindow(NOW);
  const out = mergePrograms([{ id: 'a', list: [P(at(20), at(21), 'Dizi 12. Bölüm')] }, { id: 'b', list: [P(at(20), at(21), 'Dizi 12. Bölüm')] }], win);
  assert.equal(out.length, 1);
  assert.equal(out[0].x, '');
  assert.equal(out[0].f, '');
});

function okSource(id, rows) {
  const channels = rows.map(([name, list]) => ({ name, list }));
  return { id, name: id, ok: true, ch: channels.length, pr: 1, channels };
}

test('buildFreeData: aynı kanal farklı adlarla tek kayıt, program tekrarsız, durum satırları', () => {
  const win = freeWindow(NOW);
  const a = okSource('openepg', [['ATV.tr', [P(at(20), at(22), 'Dizi', { x: '1. Sezon 3. Bölüm' })]], ['STAR TV.tr', [P(at(20), at(21), 'Haber')]]]);
  const b = okSource('tvdebugun', [['atv', [P(at(20), at(22), 'Dizi', { c: 'Dizi', f: 'n' })]], ['Star TV', [P(at(20), at(21), 'Haber')]]]);
  const bad = { id: 'epgshare', name: 'epgshare', ok: false, error: 'HTTP 404', channels: [] };
  const { data, info } = buildFreeData([a, b, bad], NOW, { detail: true });
  assert.deepEqual(Object.keys(data.ch).sort(), ['atv', 'star']);
  assert.equal(data.ch.atv.n, 'atv'); // tvdebugun adı tercih edilir
  assert.equal(data.ch.atv.p.length, 1);
  assert.deepEqual(data.ch.atv.p[0], [at(20), at(22), 'Dizi', '', 'Dizi', '1. Sezon 3. Bölüm', 'n']);
  assert.equal(data.ch.star.p[0].length, 5); // etiketsiz satır 5 alanlı kalır
  assert.deepEqual(data.sources.map((s) => [s.id, s.ok, s.used]), [['openepg', true, 2], ['tvdebugun', true, 2], ['epgshare', false, 0]]);
  assert.equal(data.sources[2].error, 'HTTP 404');
  assert.equal(info.atv.dup, 1);
  assert.deepEqual(info.atv.names, { openepg: 'ATV.tr', tvdebugun: 'atv' });
  assert.equal(data.from, win.from);
  assert.equal(data.tz, 'Europe/Istanbul');
  assert.equal(validateFree(data, NOW).ok, false); // 2 kanal: çok az
});

function bigData(n, over = {}) {
  const ch = {};
  for (let i = 0; i < n; i++) ch['k' + i] = { n: 'K' + i, p: [[at(19), at(23), 'Program', '', '']] };
  const w = freeWindow(NOW);
  return { v: 1, at: NOW - 3600e3, from: w.from, to: w.to, tz: 'Europe/Istanbul', sources: [], ch, ...over };
}

test('validateFree: biçim, kanal sayısı, yaş ve pencere', () => {
  assert.equal(validateFree(bigData(20), NOW).ok, true);
  assert.equal(validateFree(null, NOW).ok, false);
  assert.equal(validateFree({ v: 2, ch: {} }, NOW).ok, false);
  assert.match(validateFree(bigData(3), NOW).error, /az kanal/);
  assert.match(validateFree(bigData(20, { at: NOW - 40 * 3600e3 }), NOW).error, /Eski/);
  assert.match(validateFree(bigData(20, { at: NOW + 3 * 3600e3 }), NOW).error, /tarih/);
  const w = freeWindow(NOW + 3 * 864e5);
  assert.match(validateFree(bigData(20, { from: w.from, to: w.to }), NOW).error, /kapsam/);
});

test('matchFree: kullanıcı kanalları ücretsiz rehberle eşleşir; eşleşmeyen yok sayılır', () => {
  const free = bigData(0);
  free.ch = {
    atv: { n: 'atv', p: [[1, 2, 'A', '', '']] },
    star: { n: 'Star TV', p: [[1, 2, 'S', '', '']] },
    trt1: { n: 'TRT 1', p: [[1, 2, 'T', '', '']] },
  };
  const live = [
    { id: '1', name: 'TR: ATV FHD' },
    { id: '2', name: 'Yedek', tvgName: 'STAR TV HD' },
    { id: '3', name: 'TRT 1 HD' },
    { id: '4', name: 'TRT 1 (yedek)' },
    { id: '5', name: 'Bilinmeyen Kanal' },
  ];
  const m = matchFree(free, live);
  assert.deepEqual(m.map, { 1: '~atv', 2: '~star', 3: '~trt1', 4: '~trt1' });
  assert.equal(m.matched, 4);
  assert.deepEqual(Object.keys(m.prog).sort(), ['~atv', '~star', '~trt1']);
});

test('mergeEpgData: sağlayıcı önce, ücretsiz yalnız boş kanalları doldurur; EpgView ikisini de okur', () => {
  const base = { fetchedAt: 1, map: { a: 'x' }, prog: { x: [[at(20), at(21), 'Sağlayıcı', '', '']] }, matched: 1 };
  const extra = { map: { a: '~a', b: '~b' }, prog: { '~a': [[at(20), at(21), 'Ücretsiz', '', '']], '~b': [[at(20), at(21), 'Dizi', 'd', 'Dizi', '2. Sezon 1. Bölüm', 'r']] } };
  const m = mergeEpgData(base, extra);
  assert.deepEqual(m.map, { a: 'x', b: '~b' });
  assert.equal(m.matched, 2);
  assert.equal(mergeEpgData(null, extra), extra);
  assert.equal(mergeEpgData(base, null), base);
  const v = new EpgView(m);
  assert.equal(v.listFor({ id: 'a' })[0].t, 'Sağlayıcı');
  const b = v.listFor({ id: 'b' })[0];
  assert.equal(b.x, '2. Sezon 1. Bölüm');
  assert.equal(b.f, 'r');
  assert.equal(v.listFor({ id: 'a' })[0].f, undefined);
  assert.equal(v.between(at(0), at(23)).find((h) => h.id === 'b').p.x, '2. Sezon 1. Bölüm');
});

test('loadFreeData: önce birleşik özet; eskiyse/yoksa kaynaklara doğrudan', async () => {
  const agg = JSON.stringify(bigData(20));
  const calls = [];
  const net1 = fakeServer([[/raw\.githubusercontent\.com.*epg\.json/, agg]], calls);
  const r1 = await loadFreeData(net1, { now: NOW });
  assert.equal(r1.via, 'sunucu');
  assert.equal(Object.keys(r1.ch).length, 20);
  assert.equal(calls.length, 1);

  // ilk adres eski, ikincisi (yansı) güncel
  const stale = JSON.stringify(bigData(20, { at: NOW - 50 * 3600e3 }));
  const net2 = fakeServer([[/raw\.githubusercontent\.com/, stale], [/jsdelivr/, agg]]);
  assert.equal((await loadFreeData(net2, { now: NOW })).via, 'sunucu');

  // özet hiç yok: Open-EPG doğrudan; tvdebugun yok → yine de çalışan kaynakla devam
  const net3 = fakeServer([[/open-epg\.com/, gzipSync(Buffer.from(xmltv(12)))]]);
  const r3 = await loadFreeData(net3, { now: NOW });
  assert.equal(r3.via, 'doğrudan');
  assert.equal(Object.keys(r3.ch).length, 12);
  assert.deepEqual(r3.sources.filter((s) => s.ok).map((s) => s.id), ['openepg']);
  assert.equal(r3.sources.find((s) => s.id === 'tvdebugun').ok, false);

  // hiçbiri çalışmıyor
  await assert.rejects(() => loadFreeData(fakeServer([]), { now: NOW }), /hiçbiri alınamadı/);
});

test('probeFreeSources: her yol ayrı satır; sunucuya özel kaynak sınanmaz', async () => {
  const net = fakeServer([[/raw\.githubusercontent\.com/, JSON.stringify(bigData(20))], [/open-epg\.com/, xmltv(12)]]);
  const rows = await probeFreeSources(net, { now: NOW });
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by['raw.githubusercontent.com'].ok, true);
  assert.equal(by['cdn.jsdelivr.net'].ok, false);
  assert.equal(by.openepg.ok, true);
  assert.equal(by.openepg.ch, 12);
  assert.equal(by.epgshare.ok, false);
  assert.equal(by.tvdebugun.ok, false);
  assert.equal(by.teleonline.ok, null);
  assert.equal(AGG_URLS.length, 2);
});
