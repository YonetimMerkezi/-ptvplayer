import test from 'node:test';
import assert from 'node:assert/strict';
import { seDateKey, seUrl, decodeEntities, tokensOf, extractChannels, splitChannels, parseSporEkrani, loadSeDay, seChannelsFor, seDiagText, seTime } from '../www/js/sports-se.js';

const DAYMS = new Date(2026, 10, 12, 0, 0, 0).getTime();
const href = (id, y, m, d, slug) => `https://www.sporekrani.com/home/match/${id}/${y}/${m}/${d}/${slug}-hangi-kanalda`;

// Sayfa yapısı iki biçimde de denenir: parça parça (span + img alt) ve düz metin
const STRUCT = `<div class="list">
  <a class="row" href="${href(497036, 2026, 11, 11, 'kepez-bld.-balikesirspor-tff-3.-lig')}"><span class="sp">Futbol</span><span class="t">13:00</span><span class="m">Kepez Bld. - Balıkesirspor</span><span class="c">TFF 3. Lig</span><span class="ch"><img src="/x.png" alt="Tivibu Spor 1"><b>Tivibu Spor 1</b></span></a>
  <a class="row" href="${href(497249, 2026, 11, 11, 'c.gauff-l.noskova-wta-indian-wells')}"><span>Tenis</span><span>00:30</span><span>C.Gauff - L.Noskova</span><span>WTA Indian Wells</span><img alt="Bein Sports Max 1"><b>Bein Sports Max 1</b></a>
  <a href="${href(5, 2026, 11, 12, 'gs-fb')}"><span>Futbol</span><span>20:00</span><span>Galatasaray - Fenerbahçe</span><span>Süper Lig</span><img alt="beIN Sports 1"><img alt="beIN Sports Max 2"><b>beIN Sports 1</b><b>beIN Sports Max 2</b></a>
  <a href="${href(6, 2026, 11, 12, 'turkiye-belcika')}"><span>Futbol</span><span>20:00</span><span>Türkiye - Belçika</span><span>UEFA Uluslar Ligi</span><img alt="A Spor"><b>A Spor</b></a>
  <a href="/home/team/galatasaray">Galatasaray</a>
</div>`;
const FLAT = [
  `<a href='${href(1, 2026, 11, 12, 'a')}'>Futbol 13:00 Kepez Bld. - Balıkesirspor TFF 3. Lig Tivibu Spor 1 Tivibu Spor 1</a>`,
  `<a href="${href(2, 2026, 11, 12, 'b')}">Futbol 20:45 Leuven - Koge UEFA Kadinlar Şampiyonlar Ligi Disney Plus Disney Plus</a>`,
  `<a href="${href(3, 2026, 11, 12, 'c')}">Futbol 22:45 Arnavutluk - Finlandiya UEFA Uluslar Ligi S Sport Plus S Sport 2 S Sport Plus S Sport 2</a>`,
  `<a href="${href(4, 2026, 11, 12, 'd')}">Basketbol 03:00 Duke - Michigan State NCAA S Sport Plus S Sport 2 S Sport Plus S Sport 2</a>`,
].join('\n');

test('adres ve tarih', () => {
  assert.equal(seDateKey(DAMS()), '2026-11-12');
  assert.equal(seUrl(DAMS()), 'https://www.sporekrani.com/home/day/2026-11-12');
  assert.equal(seUrl(DAMS(), 'http://x.test'), 'http://x.test/home/day/2026-11-12');
  // saat Türkiye saatidir (UTC+3 sabit)
  assert.equal(seTime(2026, 11, 12, 20, 0), Date.UTC(2026, 10, 12, 17, 0));
});
function DAMS() {
  return DAYMS;
}

test('HTML parçaları ve varlıklar', () => {
  assert.equal(decodeEntities('Fenerbah&#231;e &amp; G&#x131;da &quot;x&quot; &nbsp;&unknown; &#0;'), 'Fenerbahçe & Gıda "x"  &unknown; &#0;');
  assert.deepEqual(tokensOf('<span>Futbol</span> <b> 13:00 </b><img src=x alt="Tivibu Spor 1"><i>A &amp; B</i>'), ['Futbol', '13:00', 'Tivibu Spor 1', 'A & B']);
  assert.deepEqual(tokensOf("<img alt='X'>"), ['X']);
  assert.deepEqual(tokensOf(''), []);
});

test('kanal çıkarma: tekrarlı yazım, çiftler, düz metin, tekrarsız marka listesi', () => {
  const ex = (...t) => extractChannels(t);
  assert.deepEqual(ex('A - B', 'Lig', 'Tivibu Spor 1', 'Tivibu Spor 1').channels, ['Tivibu Spor 1']);
  assert.deepEqual(ex('A - B', 'Lig', 'S Sport Plus', 'S Sport 2', 'S Sport Plus', 'S Sport 2').channels, ['S Sport Plus', 'S Sport 2']);
  assert.deepEqual(ex('A - B', 'Lig', 'TRT Spor', 'TRT Spor', 'tabii', 'tabii').channels, ['TRT Spor', 'tabii']);
  assert.deepEqual(ex('A - B Lig S Sport Plus S Sport 2 S Sport Plus S Sport 2').channels, ['S Sport Plus', 'S Sport 2']);
  assert.deepEqual(ex('A - B Lig Bein Sports Max 1 Bein Sports Max 1').channels, ['Bein Sports Max 1']);
  assert.deepEqual(ex('A - B', 'Lig', 'beIN Sports 1', 'TRT Spor').channels, ['beIN Sports 1', 'TRT Spor'], 'tekrarsız ama marka tanınıyor');
  assert.deepEqual(ex('A - B', 'Lig').channels, [], 'kanal yoksa boş');
  assert.deepEqual(ex().channels, []);
  assert.deepEqual(ex('A - B', 'Lig', 'Tivibu Spor 1', 'Tivibu Spor 1').rest, ['A - B', 'Lig']);
  assert.deepEqual(splitChannels('A Spor A Haber S Sport 2 TRT 1 Disney Plus'.split(' ')), ['A Spor', 'A Haber', 'S Sport 2', 'TRT 1', 'Disney Plus']);
});

test('parseSporEkrani: yapılı sayfa — yalnız futbol, saat Türkiye saatiyle, kanallar', () => {
  const { rows, diag } = parseSporEkrani(STRUCT);
  assert.equal(diag.anchors, 4);
  assert.equal(diag.football, 3);
  assert.equal(diag.withChannel, 3);
  assert.deepEqual(rows.map((r) => r.id), ['497036', '5', '6']);
  assert.equal(rows[0].t, Date.UTC(2026, 10, 11, 10, 0)); // 13:00 TSİ
  assert.equal(rows[0].title, 'Kepez Bld. - Balıkesirspor TFF 3. Lig');
  assert.deepEqual(rows[0].channels, ['Tivibu Spor 1']);
  assert.deepEqual(rows[1].channels, ['beIN Sports 1', 'beIN Sports Max 2']);
  assert.equal(rows[1].t, Date.UTC(2026, 10, 12, 17, 0));
});

test('parseSporEkrani: düz metin sayfa', () => {
  const { rows, diag } = parseSporEkrani(FLAT);
  assert.equal(diag.anchors, 4);
  assert.deepEqual(rows.map((r) => r.id), ['1', '2', '3']);
  assert.deepEqual(rows[2].channels, ['S Sport Plus', 'S Sport 2']);
  assert.equal(rows[2].title, 'Arnavutluk - Finlandiya UEFA Uluslar Ligi');
  assert.match(diag.sample, /^Futbol/);
});

test('parseSporEkrani: bozuk/boş girdiler hata atmaz, aynı maç tekrarlanmaz', () => {
  for (const j of [null, undefined, 5, '', '<html></html>', '<a href="/home/match/1/2026/11/12/x"></a>', '<a href="/home/match/1/2026/11/12/x">Futbol bozuk</a>', '<a href="/home/match/1/2026/11/12/x">Futbol 25:99 A - B Lig Tivibu Spor 1 Tivibu Spor 1</a>']) assert.deepEqual(parseSporEkrani(j).rows, []);
  const dup = `<a href="/home/match/1/2026/11/12/x">Futbol 13:00 A - B Lig Tivibu Spor 1 Tivibu Spor 1</a><a href="/home/match/1/2026/11/12/x">Futbol 13:00 A - B Lig Tivibu Spor 1 Tivibu Spor 1</a>`;
  assert.equal(parseSporEkrani(dup).rows.length, 1);
});

test('loadSeDay: sayfa, ağ hatası, tanınmayan sayfa', async () => {
  const urls = [];
  const net = { text: async (u, o) => (urls.push([u, o]), STRUCT) };
  const r = await loadSeDay({ net, dayMs: DAYMS });
  assert.equal(urls[0][0], 'https://www.sporekrani.com/home/day/2026-11-12');
  assert.deepEqual(urls[0][1], { fast: true });
  assert.equal(r.rows.length, 3);
  await assert.rejects(loadSeDay({ net: { text: async () => Promise.reject(new Error('HTTP 403')) }, dayMs: DAYMS }), (e) => /alınamadı/.test(e.message) && /HTTP 403/.test(e.detail));
  await assert.rejects(loadSeDay({ net: { text: async () => '<html>Just a moment...</html>' }, dayMs: DAYMS }), (e) => /tanınmadı/.test(e.message) && /bayt, maç bağlantısı yok/.test(e.detail));
  await assert.rejects(loadSeDay({ net: { text: () => new Promise(() => {}) }, dayMs: DAYMS, timeoutMs: 20 }), (e) => /zamanında/.test(e.detail));
  // maç bağlantıları var ama futbol yok: hata değil (satır yok), teşhis var
  const nf = await loadSeDay({ net: { text: async () => '<a href="/home/match/9/2026/11/12/t">Tenis 10:00 A - B WTA Bein Sports Max 1 Bein Sports Max 1</a>' }, dayMs: DAYMS });
  assert.equal(nf.rows.length, 0);
  assert.equal(seDiagText(nf.diag), '1 bağlantı, 0 futbol, 0 kanallı; örnek: Tenis | 10:00 | A - B WTA Bein Sports Max 1 Bein Sports Max 1'.replace(/ \| /g, ' | ').replace('Tenis | 10:00 | A - B WTA Bein Sports Max 1 Bein Sports Max 1', nf.diag.sample));
});

const M = (home, away, t) => ({ home: { name: home }, away: { name: away }, t });

test('seChannelsFor: Türkçe satır başlığıyla ESPN/LiveScore takım adları eşleşir', () => {
  const { rows } = parseSporEkrani(STRUCT);
  const gs = Date.UTC(2026, 10, 12, 17, 0);
  assert.deepEqual(seChannelsFor(M('Galatasaray', 'Fenerbahçe', gs), rows), ['beIN Sports 1', 'beIN Sports Max 2']);
  assert.deepEqual(seChannelsFor(M('Galatasaray', 'Fenerbahce', gs + 20 * 60000), rows), ['beIN Sports 1', 'beIN Sports Max 2'], 'LiveScore yazımı, 20 dk fark');
  assert.deepEqual(seChannelsFor(M('Turkey', 'Belgium', gs), rows), ['A Spor'], 'milli takım İngilizce adıyla; satırda Türkçe');
  assert.deepEqual(seChannelsFor(M('Galatasaray', 'Fenerbahçe', gs + 2 * 3600e3), rows), [], 'saat uzaksa eşleşmez');
  assert.deepEqual(seChannelsFor(M('Galatasaray', 'Beşiktaş', gs), rows), [], 'iki takım da geçmeli');
  assert.deepEqual(seChannelsFor(M('Kepez Bld.', 'Balıkesirspor', Date.UTC(2026, 10, 11, 10, 0)), rows), ['Tivibu Spor 1']);
  assert.deepEqual(seChannelsFor(M('A', 'B', gs), null), []);
});

test('seChannelsFor: kadın/genç maçı erkek maçıyla karışmaz', () => {
  const rows = [
    { id: '1', t: 1000, title: 'Arsenal Kadın - Chelsea Kadın UEFA Kadınlar Şampiyonlar Ligi', channels: ['Disney Plus'] },
    { id: '2', t: 1000, title: 'Arsenal - Chelsea Premier Lig', channels: ['beIN Sports 1'] },
    { id: '3', t: 1000, title: 'Türkiye U21 - Belçika U21 Hazırlık', channels: ['TRT Spor'] },
  ];
  assert.deepEqual(seChannelsFor(M('Arsenal', 'Chelsea', 1000), rows), ['beIN Sports 1']);
  assert.deepEqual(seChannelsFor(M('Arsenal W', 'Chelsea W', 1000), rows), ['Disney Plus']);
  assert.deepEqual(seChannelsFor(M('Turkey', 'Belgium', 1000), rows), []);
  assert.deepEqual(seChannelsFor(M('Turkiye U21', 'Belcika U21', 1000), rows), ['TRT Spor']);
});
