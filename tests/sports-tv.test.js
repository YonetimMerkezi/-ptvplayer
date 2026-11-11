import test from 'node:test';
import assert from 'node:assert/strict';
import { tvDateKey, tvUrls, parseTvTime, splitEvent, parseTv, loadTvDay, tvChannelsFor, channelsByName } from '../www/js/sports-tv.js';

const DAYMS = new Date(2026, 10, 12, 0, 0, 0).getTime();
const TV = {
  tvevents: [
    { idEvent: '1', strSport: 'Soccer', strEvent: 'Armenia vs Cyprus', strChannel: 'TRT Spor', strCountry: 'Turkey', strTimeStamp: '2026-11-12T17:00:00+00:00', dateEvent: '2026-11-12', strTime: '17:00:00' },
    { idEvent: '1', strSport: 'Soccer', strEvent: 'Armenia vs Cyprus', strChannel: 'tabii', strCountry: 'Turkey', strTimeStamp: '2026-11-12T17:00:00' },
    { idEvent: '1', strSport: 'Soccer', strEvent: 'Armenia vs Cyprus', strChannel: 'TRT Spor', strCountry: 'Turkey', strTimeStamp: '2026-11-12T17:00:00' }, // yinelenen
    { idEvent: '2', strSport: 'Soccer', strEvent: 'Galatasaray vs Fenerbahce', strChannel: 'beIN Sports 1', strCountry: 'Turkey', dateEvent: '2026-11-12', strTime: '17:00:00' },
    { idEvent: '3', strSport: 'American Football', strEvent: 'Bears vs Lions', strChannel: 'NFL Network', strCountry: 'Turkey' },
    { idEvent: '4', strSport: 'Soccer', strEvent: 'Arsenal vs Chelsea', strChannel: 'Sky Sports', strCountry: 'United Kingdom' },
    { idEvent: '5', strSport: 'Soccer', strEvent: 'Tek Takim', strChannel: 'X', strCountry: 'Turkey' },
    { idEvent: '6', strSport: 'Soccer', strEvent: 'A vs B', strChannel: '', strCountry: 'Turkey' },
    null,
  ],
};
const M = (home, away, t) => ({ id: 'x:1', t, home: { name: home }, away: { name: away } });
const T17 = Date.UTC(2026, 10, 12, 17, 0);

test('adres ve tarih anahtarı', () => {
  assert.equal(tvDateKey(DAYMS), '2026-11-12');
  const u = tvUrls(DAYMS);
  assert.equal(u.length, 2);
  assert.equal(u[0], 'https://www.thesportsdb.com/api/v1/json/123/eventstv.php?d=2026-11-12&a=Turkey');
  assert.match(u[1], /\/json\/3\/eventstv\.php/);
  assert.deepEqual(tvUrls(DAYMS, 'http://x.test').length, 1);
});

test('saat ayrıştırma: saat dilimi yoksa UTC', () => {
  assert.equal(parseTvTime('2026-11-12T17:00:00+00:00'), T17);
  assert.equal(parseTvTime('2026-11-12T20:00:00+03:00'), T17);
  assert.equal(parseTvTime('2026-11-12 17:00:00'), T17);
  assert.equal(parseTvTime('', '2026-11-12', '17:00:00'), T17);
  assert.equal(parseTvTime('', '2026-11-12', ''), Date.UTC(2026, 10, 12));
  for (const bad of [['', '', ''], ['xx', '', ''], [null, null, null]]) assert.equal(parseTvTime(...bad), null);
});

test('maç adı bölme', () => {
  assert.deepEqual(splitEvent('Armenia vs Cyprus'), ['Armenia', 'Cyprus']);
  assert.deepEqual(splitEvent('Armenia v Cyprus'), ['Armenia', 'Cyprus']);
  assert.deepEqual(splitEvent('Armenia vs. Cyprus'), ['Armenia', 'Cyprus']);
  assert.deepEqual(splitEvent('Armenia - Cyprus'), ['Armenia', 'Cyprus']);
  assert.deepEqual(splitEvent('Real Madrid vs Atletico Madrid'), ['Real Madrid', 'Atletico Madrid']);
  for (const bad of ['', 'Tek Takim', 'A vs B vs C', null, undefined]) assert.equal(splitEvent(bad), null, String(bad));
});

test('parseTv: yalnız Türkiye yayınlı futbol, tekrarsız; bozuk kayıt atlanır', () => {
  const ev = parseTv(TV);
  assert.deepEqual(ev.map((e) => `${e.home}|${e.away}|${e.channel}`), ['Armenia|Cyprus|TRT Spor', 'Armenia|Cyprus|tabii', 'Galatasaray|Fenerbahce|beIN Sports 1']);
  assert.equal(ev[0].t, T17);
  for (const j of [null, undefined, 5, 'x', {}, { tvevents: null }, { tvevents: 'x' }, { tvevent: [null, {}] }]) assert.deepEqual(parseTv(j), []);
});

test('tvChannelsFor: takım adları ve saatle eşleşir', () => {
  const ev = parseTv(TV);
  assert.deepEqual(tvChannelsFor(M('Armenia', 'Cyprus', T17), ev), ['TRT Spor', 'tabii']);
  assert.deepEqual(tvChannelsFor(M('Cyprus', 'Armenia', T17 + 3600e3), ev), ['TRT Spor', 'tabii'], 'ters yazım, 1 saat fark');
  assert.deepEqual(tvChannelsFor(M('Armenia', 'Cyprus', T17 + 6 * 3600e3), ev), [], 'saat çok uzaksa eşleşmez');
  assert.deepEqual(tvChannelsFor(M('Armenia', 'Malta', T17), ev), []);
  // saati olmayan kayıt (yalnız tarihli gün listesi) takımlar eşleşince kabul edilir
  assert.deepEqual(tvChannelsFor(M('Galatasaray', 'Fenerbahçe', Date.UTC(2026, 10, 12, 17, 0)), ev), ['beIN Sports 1']);
  assert.deepEqual(tvChannelsFor(M('Arsenal', 'Chelsea', T17), ev), [], 'başka ülke yayını yok sayılır');
  assert.deepEqual(tvChannelsFor(M('A', 'B', T17), null), []);
});

test('channelsByName: TV kanal adından kullanıcının kanalları', () => {
  const items = [
    { id: '1', name: 'TR: BEIN SPORTS 1 HD' },
    { id: '2', name: 'TR: BEIN SPORTS 2 HD' },
    { id: '3', name: 'TRT SPOR YILDIZ' },
    { id: '4', name: 'TABII SPOR' },
    { id: '5', name: 'A Haber' },
    { id: '6', name: 'TV' },
    { id: '7', name: 'S Sport Plus' },
  ];
  assert.deepEqual(channelsByName(items, ['beIN Sports 1']).map((x) => x.id), ['1']);
  assert.deepEqual(channelsByName(items, ['TRT Spor']).map((x) => x.id), ['3']);
  assert.deepEqual(channelsByName(items, ['tabii']).map((x) => x.id), ['4']);
  assert.deepEqual(channelsByName(items, ['TRT Spor', 'A Haber']).map((x) => x.id), ['3', '5']);
  assert.deepEqual(channelsByName(items, ['xx']).map((x) => x.id), [], 'eşleşen kanal yoksa boş');
  assert.deepEqual(channelsByName(items, ['x']).map((x) => x.id), [], 'tek harfli ad eşleşmez');
  assert.deepEqual(channelsByName(items, []), []);
  assert.deepEqual(channelsByName(null, ['a haber']), []);
  assert.equal(channelsByName(Array.from({ length: 40 }, (_, i) => ({ id: String(i), name: 'beIN SPORTS 1 ' + i })), ['bein sports 1'], 5).length, 5);
});

test('channelsByName: kısa adlar (ATV, A2, TV8) tam sözcük olarak eşleşir; kısa adlar yanlış eşleşmez', () => {
  const items = [
    { id: '1', name: 'TR: ATV HD' },
    { id: '2', name: 'ATV AVRUPA' },
    { id: '3', name: 'CATV Movies' },
    { id: '4', name: 'A2 FHD' },
    { id: '5', name: 'A' },
    { id: '6', name: 'TV8' },
    { id: '7', name: 'ATV' },
    { id: '8', name: 'A Spor' },
  ];
  assert.deepEqual(channelsByName(items, ['ATV']).map((x) => x.id), ['1', '2', '7'], 'sıra listedeki gibi, “CATV” gelmez');
  assert.deepEqual(channelsByName(items, ['A2']).map((x) => x.id), ['4']);
  assert.deepEqual(channelsByName(items, ['TV8']).map((x) => x.id), ['6']);
  assert.deepEqual(channelsByName(items, ['A Spor']).map((x) => x.id), ['8'], '“A” kanalı “A Spor”a karışmaz');
  assert.deepEqual(channelsByName(items, ['ATV'], 2).map((x) => x.id), ['1', '7'], 'sınır uygulanırken birebir olanlar (“TR: ATV HD” de) “ATV AVRUPA”dan önce korunur');
});

test('channelsByName: boşluk farkı önemsiz (“Tivibu Spor 1” = “TR: TIVIBUSPOR 1 HD”), numaralar karışmaz', () => {
  const items = [
    { id: 'g', name: 'TR: TiViBUSPOR' },
    { id: '1h', name: 'TR: TIVIBUSPOR 1 HD' },
    { id: '1f', name: 'TR: TiViBUSPOR 1 FHD' },
    { id: '2h', name: 'TR: TIVIBUSPOR 2 HD' },
    { id: '2f', name: 'TR: TIVIBUSPOR 2 FHD' },
    { id: '3h', name: 'TR: TIVIBUSPOR 3 HD' },
    { id: '4', name: 'TR: TIVIBUSPOR 4' },
    { id: '5', name: 'TR: TIVIBUSPOR 5' },
    { id: 'x', name: 'TIVIBU 1' },
  ];
  const ids = (names) => channelsByName(items, names).map((x) => x.id);
  assert.deepEqual(ids(['Tivibu Spor 1']), ['g', '1h', '1f'], 'numaralı yayın + genel “Tivibu Spor”; 2–5 gelmez');
  assert.deepEqual(ids(['Tivibu Spor 2']), ['g', '2h', '2f']);
  assert.deepEqual(ids(['Tivibu Spor 5']), ['g', '5']);
  assert.deepEqual(ids(['TivibuSpor 1']), ['g', '1h', '1f'], 'bitişik yazılan ad da eşleşir');
  assert.deepEqual(ids(['Tivibu Spor']), ['g', '1h', '1f', '2h', '2f', '3h', '4', '5'], 'numarasız ad tüm Tivibu Spor kanallarını verir');
  assert.deepEqual(ids(['Tivibu Spor 6']), ['g'], 'olmayan numara yalnız genel kanalı verir');
  // tersi: kanal adındaki sözcükler ayrık, TV adı bitişik
  assert.deepEqual(channelsByName([{ id: 'a', name: 'A 2' }, { id: 'b', name: 'A 3' }], ['A2']).map((x) => x.id), ['a']);
  // “Sports”/“Sport” yazımı aynı sayılır
  assert.deepEqual(channelsByName([{ id: 'p', name: 'S Sport Plus' }, { id: 'q', name: 'TR: BEIN SPORT 1' }], ['beIN Sports 1']).map((x) => x.id), ['q']);
});

test('loadTvDay: yedek adrese düşer; biçim/ağ hataları ayrıntıyla bildirilir; boş gün hata değildir', async () => {
  const urls = [];
  const net = { json: async (u) => (urls.push(u), urls.length === 1 ? Promise.reject(new Error('HTTP 401')) : TV) };
  const r = await loadTvDay({ net, dayMs: DAYMS });
  assert.equal(urls.length, 2);
  assert.equal(r.events.length, 3);

  const empty = await loadTvDay({ net: { json: async () => ({ tvevents: null }) }, dayMs: DAYMS });
  assert.deepEqual(empty.events, []);

  await assert.rejects(loadTvDay({ net: { json: async () => ({ Message: 'premium' }) }, dayMs: DAYMS }), (e) => /Beklenmeyen yanıt biçimi/.test(e.detail) && /2 adres/.test(e.detail) && /Yayın listesi/.test(e.message));
  await assert.rejects(loadTvDay({ net: { json: async () => Promise.reject(new Error('HTTP 503')) }, dayMs: DAYMS }), (e) => /HTTP 503/.test(e.detail));
  await assert.rejects(loadTvDay({ net: { json: async () => null }, dayMs: DAYMS }), (e) => /Boş yanıt/.test(e.detail));
  await assert.rejects(loadTvDay({ net: { json: () => new Promise(() => {}) }, dayMs: DAYMS, timeoutMs: 20 }), (e) => /zamanında/.test(e.detail));
});
