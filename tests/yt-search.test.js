import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYoutubeResults, pickTrailers, resultsUrl, findTrailerOnYoutube, FIND_TTL, FIND_MISS_TTL, MAX_FOUND } from '../www/js/yt-search.js';

const vr = (id, title, channel, len, verified = false) => ({ videoRenderer: {
  videoId: id, title: { runs: [{ text: title }] }, ownerText: { runs: [{ text: channel }] }, lengthText: { simpleText: len },
  ownerBadges: verified ? [{ metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_VERIFIED' } }] : [],
} });
const page = (items) => `<html><body><script nonce="x">var ytInitialData = ${JSON.stringify({ contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [{ itemSectionRenderer: { contents: items } }] } } } } })};</script><script>window.other = {};</script></body></html>`;
const id = (c) => c.repeat(11);

// Gerçek sonuç sayfasındaki sıra: önce Netflix'in resmî fragmanı, sonra anlatım/özet videoları
const RESULTS = [
  vr(id('a'), 'Never Surrender | Official Trailer | Netflix', 'Netflix', '2:24', true),
  vr(id('b'), 'Asla Teslim Olma’yı 1 dakikada anlattım', 'Spoiler Abi', '1:00'),
  { reelItemRenderer: { videoId: id('c') } },
  vr(id('d'), 'Torunları İçin Geçmişine Döndü! | Asla Teslim Olma Film Özeti', 'Film ve Dizi Özetleri', '4:10'),
  vr(id('e'), 'Asla Teslim Olma | Resmi Fragman', 'Sinema Kanalı', '1:20'),
  vr(id('f'), 'Asla Teslim Olma Full Movie Tek Parça İzle', 'Kanal', '1:30:00'),
];

test('parseYoutubeResults: videoRenderer kayıtları sırayla okunur; kısa video, süre ve rozet çözülür', () => {
  const r = parseYoutubeResults(page(RESULTS));
  assert.deepEqual(r.map((x) => x.id), [id('a'), id('b'), id('d'), id('e'), id('f')], 'reelItemRenderer atlanır');
  assert.deepEqual(r[0], { id: id('a'), title: 'Never Surrender | Official Trailer | Netflix', channel: 'Netflix', seconds: 144, verified: true });
  assert.equal(r[4].seconds, 5400, 'saat:dakika:saniye');
  assert.equal(r[1].verified, false);
});

test('parseYoutubeResults: sayfada ya da JSON’da sorun varsa boş döner; dizge içindeki süslü parantez bozmaz', () => {
  for (const bad of ['', null, '<html></html>', 'var ytInitialData = {"a": ', 'ytInitialData = nope', 'ytInitialData = {"a": 1']) assert.deepEqual(parseYoutubeResults(bad), []);
  const tricky = page([vr(id('g'), 'Fragman {sol} } sağ "tırnak" \\ | Resmi', 'Kanal', '1:00')]);
  assert.equal(parseYoutubeResults(tricky)[0].title, 'Fragman {sol} } sağ "tırnak" \\ | Resmi');
  assert.equal(parseYoutubeResults(page([vr(id('h'), 'T', 'K', '1:00'), vr(id('h'), 'T', 'K', '1:00')])).length, 1, 'aynı video tek sayılır');
});

test('pickTrailers: resmî fragman önce; anlatım/özet/tam film ve çok uzun/kısa videolar elenir', () => {
  const picks = pickTrailers(parseYoutubeResults(page(RESULTS)), ['Asla Teslim Olma']);
  assert.deepEqual(picks.map((p) => p.id), [id('a'), id('e')]);
  assert.deepEqual(picks[0], { id: id('a'), title: 'Never Surrender | Official Trailer | Netflix', channel: 'Netflix' });
});

test('pickTrailers: başlığı aranan adla örtüşmeyen ve resmî olmayan ya da sıralamada geride kalan video kabul edilmez', () => {
  const r = [
    vr(id('a'), 'Başka Bir Film | Official Trailer', 'Rastgele Kanal', '2:00'),
    vr(id('b'), 'Kuruluş Osman Fragman', 'Rastgele Kanal', '1:50'),
    vr(id('c'), 'Alakasız Dizi | Official Trailer', 'Netflix', '2:00', true),
    vr(id('d'), 'Alakasız Film | Official Trailer', 'Netflix', '2:00', true),
    vr(id('e'), 'Üçüncü Alakasız | Official Trailer', 'Netflix', '2:00', true),
    vr(id('f'), 'Dördüncü Alakasız | Official Trailer', 'Netflix', '2:00', true),
  ];
  const ids = pickTrailers(parseYoutubeResults(page(r)), ['Kuruluş Osman']).map((p) => p.id);
  assert.ok(ids.includes(id('b')), 'ad örtüşen kabul');
  assert.ok(!ids.includes(id('a')), 'resmî olmayan ve örtüşmeyen elenir');
  assert.ok(ids.includes(id('c')), 'ilk üç sıradaki resmî kanal örtüşmese de kabul');
  assert.ok(!ids.includes(id('d')) && !ids.includes(id('f')), 'dördüncü sıradan sonraki örtüşmeyen elenir');
  assert.ok(ids.length <= MAX_FOUND);
  assert.deepEqual(pickTrailers([], ['x']), []);
  assert.deepEqual(pickTrailers(null, null), []);
});

test('pickTrailers: süre sınırları ve özgün ad eşleşmesi', () => {
  const r = parseYoutubeResults(page([
    vr(id('a'), 'Money Heist | Official Trailer', 'Kanal', '0:10'),
    vr(id('b'), 'Money Heist | Official Trailer', 'Kanal', '6:00'),
    vr(id('c'), 'Money Heist | Official Trailer', 'Kanal', '2:00'),
  ]));
  assert.deepEqual(pickTrailers(r, ['Kâğıt Ev', 'Money Heist']).map((p) => p.id), [id('c')]);
});

test('resultsUrl: sorgu kaçışlı, yalnız videolar süzgeci var', () => {
  assert.equal(resultsUrl(' asla teslim olma 2026 fragman '), 'https://www.youtube.com/results?search_query=asla%20teslim%20olma%202026%20fragman&sp=EgIQAQ%253D%253D');
});

test('findTrailerOnYoutube: arar, önbelleğe yazar; ikinci çağrı ağa gitmez; bulunamayan kısa süre önbellekte kalır', async () => {
  const calls = [];
  const mem = new Map();
  const cache = { get: async (k) => mem.get(k), set: async (k, v) => { mem.set(k, v); } };
  const net = { text: async (url, opts) => { calls.push({ url, opts }); return page(RESULTS); } };
  const picks = await findTrailerOnYoutube({ net, cache, query: 'Asla Teslim Olma 2026 fragman', wanted: ['Asla Teslim Olma'] });
  assert.equal(picks[0].id, id('a'));
  assert.match(calls[0].url, /^https:\/\/www\.youtube\.com\/results\?search_query=Asla%20Teslim%20Olma%202026%20fragman/);
  assert.equal(calls[0].opts.fast, true);
  assert.match(calls[0].opts.headers['accept-language'], /^tr-TR/);
  assert.equal((await findTrailerOnYoutube({ net, cache, query: 'asla teslim olma 2026 fragman', wanted: ['x'] }))[0].id, id('a'));
  assert.equal(calls.length, 1, 'önbellekten (büyük/küçük harf fark etmez)');
  const later = Date.now() + FIND_TTL + 1000;
  await findTrailerOnYoutube({ net, cache, query: 'Asla Teslim Olma 2026 fragman', wanted: ['Asla Teslim Olma'], now: later });
  assert.equal(calls.length, 2, 'süresi dolan önbellek yenilenir');
  const empty = { text: async () => page([]) };
  assert.deepEqual(await findTrailerOnYoutube({ net: empty, cache, query: 'Bulunamayan', wanted: [] }), []);
  const n = calls.length;
  assert.deepEqual(await findTrailerOnYoutube({ net: { text: async () => { calls.push(1); return ''; } }, cache, query: 'Bulunamayan', wanted: [] }), []);
  assert.equal(calls.length, n, 'boş sonuç kısa süre önbellekte');
  assert.ok(FIND_MISS_TTL < FIND_TTL);
});

test('findTrailerOnYoutube: ağ hatasında null döner ve önbelleğe yazılmaz; boş sorguda ağa gidilmez', async () => {
  const mem = new Map();
  const cache = { get: async (k) => mem.get(k), set: async (k, v) => { mem.set(k, v); } };
  assert.equal(await findTrailerOnYoutube({ net: { text: async () => { throw new Error('ağ yok'); } }, cache, query: 'Film fragman' }), null);
  assert.equal(mem.size, 0);
  let n = 0;
  assert.deepEqual(await findTrailerOnYoutube({ net: { text: async () => { n++; return ''; } }, cache, query: '  ' }), []);
  assert.equal(n, 0);
});
