import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYoutubeResults, pickTrailers, listTrailers, resultsUrl, findTrailerOnYoutube, describeFind, YT_HEADERS, FIND_TTL, FIND_MISS_TTL, MAX_LIST } from '../www/js/yt-search.js';

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

test('pickTrailers: ilk üç sıradaki fragman başlığı adla örtüşmese de kabul; anlatım/özet/tam film ve uygunsuz süre elenir; resmî kanal şart değil', () => {
  const picks = pickTrailers(parseYoutubeResults(page(RESULTS)), ['Asla Teslim Olma']);
  assert.deepEqual(picks.map((p) => p.id), [id('a'), id('e')], 'ilk sıradaki yabancı adlı fragman + adı başlıkta geçen 4. sıradaki');
  assert.deepEqual(picks[0], { id: id('a'), title: 'Never Surrender | Official Trailer | Netflix', channel: 'Netflix', seconds: 144 });
  // resmî olmayan kanalın ilk sıradaki fragmanı da seçilir; puan eşitse YouTube sırası kazanır
  const fan = parseYoutubeResults(page([vr(id('x'), 'Yabancı Ad | Official Trailer', 'Rastgele Kanal', '1:30'), vr(id('y'), 'Asla Teslim Olma Fragman', 'Kanal2', '1:20')]));
  assert.equal(pickTrailers(fan, ['Asla Teslim Olma'])[0].id, id('x'));
});

test('pickTrailers: 4. sıradan sonra başlık aranan adla örtüşmeli; örtüşen ve “resmi fragman” yazan hafif öne geçer', () => {
  const r = parseYoutubeResults(page([
    vr(id('a'), 'Alakasız 1 | Trailer', 'Kanal', '1:00'),
    vr(id('b'), 'Alakasız 2 | Trailer', 'Kanal', '1:00'),
    vr(id('c'), 'Alakasız 3 | Trailer', 'Kanal', '1:00'),
    vr(id('d'), 'Kuruluş Osman Fragman', 'Kanal', '1:50'),
    vr(id('e'), 'Alakasız 5 | Official Trailer', 'Netflix', '2:00', true),
  ]));
  const ids = pickTrailers(r, ['Kuruluş Osman']).map((p) => p.id);
  assert.deepEqual(ids, [id('a'), id('d'), id('b')], 'örtüşen 4. sıradaki öne geçer; örtüşmeyen 5. sıradaki resmî kanal bile elenir');
  assert.ok(!ids.includes(id('e')));
  assert.deepEqual(pickTrailers([], ['x']), []);
  assert.deepEqual(pickTrailers(null, null), []);
});

test('pickTrailers: başlıktaki yıl aranan yıldan ±1’den fazla ayrılıyorsa (başka filmin fragmanı) elenir', () => {
  const r = parseYoutubeResults(page([
    vr(id('a'), 'AS GOOD AS DEAD 2 — Official Trailer (2026)', 'MTube', '1:49', true),
    vr(id('b'), 'Asla Teslim Olma (1998) Fragman', 'Kanal', '1:30'),
    vr(id('c'), 'Asla Teslim Olma (2026) Fragman', 'Kanal', '1:30'),
    vr(id('d'), 'Asla Teslim Olma Fragman', 'Kanal', '1:30'),
  ]));
  assert.deepEqual(pickTrailers(r, ['Asla Teslim Olma'], { year: 2026 }).map((p) => p.id), [id('a'), id('c'), id('d')], '1998 elenir');
  assert.deepEqual(pickTrailers(r, ['Asla Teslim Olma'], { year: 0 }).map((p) => p.id), [id('a'), id('b'), id('c')], 'yıl bilinmiyorsa süzgeç yok');
  assert.deepEqual(pickTrailers(r, ['Asla Teslim Olma'], { year: 2025 }).map((p) => p.id), [id('a'), id('c'), id('d')], '±1 yıl tolerans');
});

test('listTrailers: önce en alakalı fragmanlar (good), sonra YouTube sırasıyla makul videolar; özet/tam film/uygunsuz süre/yanlış yıl yok; en çok 10', () => {
  const r = parseYoutubeResults(page(RESULTS));
  assert.deepEqual(listTrailers(r, ['Asla Teslim Olma'], { year: 2026 }).map((x) => [x.id, x.good]), [[id('a'), true], [id('e'), true]]);
  const items = [vr(id('0'), 'Rastgele Bir Video', 'Kanal', '3:00'), vr(id('1'), 'Asla Teslim Olma | Resmi Fragman', 'Kanal', '1:00'), vr(id('2'), 'Başka Bir Video (1990)', 'Kanal', '2:00'), vr(id('3'), 'Uzun Video', 'Kanal', '12:00')];
  for (let i = 0; i < 12; i++) items.push(vr(String.fromCharCode(97 + i).repeat(11), 'Video ' + i, 'Kanal', '2:00'));
  const l = listTrailers(parseYoutubeResults(page(items)), ['Asla Teslim Olma'], { year: 2026 });
  assert.equal(l.length, MAX_LIST);
  assert.deepEqual(l[0], { id: id('1'), title: 'Asla Teslim Olma | Resmi Fragman', channel: 'Kanal', seconds: 60, good: true }, 'en alakalı başta');
  assert.equal(l[1].id, id('0'));
  assert.equal(l[1].good, false, 'fragman gibi görünmeyen ama makul video kullanıcı seçsin diye şeritte');
  assert.ok(!l.some((x) => x.id === id('2') || x.id === id('3')), 'yanlış yıl ve uzun video yok');
  assert.deepEqual(listTrailers([], ['x']), []);
  assert.deepEqual(listTrailers(null, null), []);
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
  const picks = await findTrailerOnYoutube({ net, cache, query: 'Asla Teslim Olma fragman', wanted: ['Asla Teslim Olma'] });
  assert.equal(picks[0].id, id('a'));
  assert.equal(picks[0].good, true);
  assert.match(calls[0].url, /^https:\/\/www\.youtube\.com\/results\?search_query=Asla%20Teslim%20Olma%20fragman/);
  assert.equal(calls[0].opts.fast, true);
  assert.match(calls[0].opts.headers['accept-language'], /^tr-TR/);
  assert.equal((await findTrailerOnYoutube({ net, cache, query: 'asla teslim olma fragman', wanted: ['x'] }))[0].id, id('a'));
  assert.equal(calls.length, 1, 'önbellekten (büyük/küçük harf fark etmez)');
  const later = Date.now() + FIND_TTL + 1000;
  await findTrailerOnYoutube({ net, cache, query: 'Asla Teslim Olma fragman', wanted: ['Asla Teslim Olma'], now: later });
  assert.equal(calls.length, 2, 'süresi dolan önbellek yenilenir');
  const noMatch = { text: async () => page([vr(id('z'), 'Alakasız Video', 'Kanal', '10:00')]) };
  assert.deepEqual(await findTrailerOnYoutube({ net: noMatch, cache, query: 'Bulunamayan', wanted: [] }), []);
  const n = calls.length;
  const seen = [];
  assert.deepEqual(await findTrailerOnYoutube({ net: { text: async () => { calls.push(1); return ''; } }, cache, query: 'Bulunamayan', wanted: [], onInfo: (i) => seen.push(i) }), []);
  assert.equal(calls.length, n, 'sayfa okunup uygun video çıkmadıysa kısa süre önbellekte');
  assert.deepEqual(seen, [{ read: 1, bytes: 0, error: '', cached: true, first: ['Alakasız Video'] }]);
  assert.ok(FIND_MISS_TTL < FIND_TTL);
  // sayfa hiç okunamadıysa (0 video: düzen değişmiş ya da engel sayfası) önbelleğe yazılmaz; her açılışta yeniden denenir
  const blocked = { text: async () => { calls.push(2); return '<html>consent</html>'; } };
  const info = [];
  assert.deepEqual(await findTrailerOnYoutube({ net: blocked, cache, query: 'Okunamayan', wanted: [], onInfo: (i) => info.push(i) }), []);
  await findTrailerOnYoutube({ net: blocked, cache, query: 'Okunamayan', wanted: [] });
  assert.equal(calls.filter((x) => x === 2).length, 2);
  assert.deepEqual(info, [{ read: 0, bytes: 20, error: '', cached: false, first: [] }]);
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
  assert.equal(describeFind([{ read: 18, first: ['Çok uzun bir video başlığı burada yazıyor ve kırpılmalı artık', 'Kısa'] }]), 'YouTube aramasında 18 video bulundu, uygun fragman çıkmadı (ilk sonuçlar: “Çok uzun bir video başlığı burada yazıyor…”, “Kısa”)');
  assert.equal(describeFind([{ read: 0, bytes: 2048 }]), 'YouTube sayfası okunamadı (2 KB yanıt, 0 video)');
  assert.equal(describeFind([{ error: 'HTTP 429' }, { error: 'x' }]), 'YouTube araması yapılamadı: HTTP 429');
  assert.match(describeFind([{ read: 0, bytes: 5, error: '' }, { error: 'zaman aşımı' }]), /okunamadı/, 'biri okunduysa ama video yoksa');
});
