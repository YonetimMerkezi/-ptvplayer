import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYoutubeResults, pickTrailers, resultsUrl, findTrailerOnYoutube, describeFind, YT_HEADERS, FIND_TTL, FIND_MISS_TTL, MAX_FOUND } from '../www/js/yt-search.js';

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
  const noMatch = { text: async () => page([vr(id('z'), 'Alakasız Video', 'Kanal', '10:00')]) };
  assert.deepEqual(await findTrailerOnYoutube({ net: noMatch, cache, query: 'Bulunamayan', wanted: [] }), []);
  const n = calls.length;
  const seen = [];
  assert.deepEqual(await findTrailerOnYoutube({ net: { text: async () => { calls.push(1); return ''; } }, cache, query: 'Bulunamayan', wanted: [], onInfo: (i) => seen.push(i) }), []);
  assert.equal(calls.length, n, 'sayfa okunup uygun video çıkmadıysa kısa süre önbellekte');
  assert.deepEqual(seen, [{ read: 1, bytes: 0, error: '', cached: true }]);
  assert.ok(FIND_MISS_TTL < FIND_TTL);
  // sayfa hiç okunamadıysa (0 video: düzen değişmiş ya da engel sayfası) önbelleğe yazılmaz; her açılışta yeniden denenir
  const blocked = { text: async () => { calls.push(2); return '<html>consent</html>'; } };
  const info = [];
  assert.deepEqual(await findTrailerOnYoutube({ net: blocked, cache, query: 'Okunamayan', wanted: [], onInfo: (i) => info.push(i) }), []);
  await findTrailerOnYoutube({ net: blocked, cache, query: 'Okunamayan', wanted: [] });
  assert.equal(calls.filter((x) => x === 2).length, 2);
  assert.deepEqual(info, [{ read: 0, bytes: 20, error: '', cached: false }]);
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

test('YT_HEADERS: masaüstü kimliği ve onay çerezi gönderilir (yerel eklentinin mobil kimliğini ezer)', async () => {
  assert.match(YT_HEADERS['user-agent'], /Windows NT 10\.0.*Chrome\/\d+/);
  assert.doesNotMatch(YT_HEADERS['user-agent'], /Mobile|Android/);
  assert.match(YT_HEADERS.cookie, /SOCS=/);
  let seen;
  await findTrailerOnYoutube({ net: { text: async (u, o) => { seen = o; return page([]); } }, query: 'x fragman' });
  assert.equal(seen.headers, YT_HEADERS);
});

test('parseYoutubeResults: mobil sayfa düzeni (videoWithContextRenderer, headline, süre rozeti) de okunur', () => {
  const mobile = page([
    { videoWithContextRenderer: { videoId: id('m'), headline: { runs: [{ text: 'Never Surrender | Official Trailer | Netflix' }] }, lengthText: { runs: [{ text: '2:24' }], accessibility: {} }, shortBylineText: { runs: [{ text: 'Netflix' }] }, ownerBadges: [{ metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_VERIFIED' } }] } },
    { videoWithContextRenderer: { videoId: id('n'), headline: { runs: [{ text: 'Başka Fragman' }] }, thumbnailOverlays: [{ thumbnailOverlayTimeStatusRenderer: { text: { simpleText: '1:05' } } }], shortBylineText: { runs: [{ text: 'Kanal' }] } } },
    { compactVideoRenderer: { videoId: id('o'), title: { simpleText: 'Kompakt Fragman' }, lengthText: { simpleText: '0:45' }, longBylineText: { runs: [{ text: 'Kanal2' }] } } },
  ]);
  const r = parseYoutubeResults(mobile);
  assert.deepEqual(r.map((x) => [x.id, x.title, x.channel, x.seconds, x.verified]), [
    [id('m'), 'Never Surrender | Official Trailer | Netflix', 'Netflix', 144, true],
    [id('n'), 'Başka Fragman', 'Kanal', 65, false],
    [id('o'), 'Kompakt Fragman', 'Kanal2', 45, false],
  ]);
});

test('parseYoutubeResults: kaçışlı JSON.parse(\'\\x7b…\') biçimi ve sayfadaki başka ytInitialData geçişleri atlanır', () => {
  const data = { a: { contents: [vr(id('p'), 'Kaçışlı "Fragman" | Resmi', 'Netflix', '2:00', true)] } };
  const esc = JSON.stringify(data).replace(/[{}":,\\']/g, (c) => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0'));
  const html = `<script>window.ytInitialDataEndpoint = 1; if (window.ytInitialData) {}</script><script>var ytInitialData = JSON.parse('${esc}');</script>`;
  const r = parseYoutubeResults(html);
  assert.deepEqual(r.map((x) => [x.id, x.title, x.seconds]), [[id('p'), 'Kaçışlı "Fragman" | Resmi', 120]]);
  // ilk geçiş boş nesne, ikincisi gerçek veri
  assert.equal(parseYoutubeResults('var ytInitialData = {}; ' + page([vr(id('q'), 'T', 'K', '1:00')]))[0].id, id('q'));
});

test('describeFind: bulunamama nedeni kullanıcıya anlaşılır yazılır', () => {
  assert.equal(describeFind([]), '');
  assert.equal(describeFind([{ read: 18, bytes: 900000 }, { read: 0, bytes: 100 }]), 'YouTube aramasında 18 video bulundu, uygun fragman çıkmadı');
  assert.equal(describeFind([{ read: 0, bytes: 2048 }]), 'YouTube sayfası okunamadı (2 KB yanıt, 0 video)');
  assert.equal(describeFind([{ error: 'HTTP 429' }, { error: 'x' }]), 'YouTube araması yapılamadı: HTTP 429');
  assert.match(describeFind([{ read: 0, bytes: 5, error: '' }, { error: 'zaman aşımı' }]), /okunamadı/, 'biri okunduysa ama video yoksa');
});
