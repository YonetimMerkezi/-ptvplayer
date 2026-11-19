import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialsOf, hueOfName, trailerHtml, wireTrailer, peopleHtml, filmCardHtml, actorHtml, actorLoadingHtml, titleInfoHtml, releasesRowHtml, releasesPageHtml } from '../www/js/title-ui.js';

const kaynak = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('baş harfler: ad ve soyadın ilk harfi, Türkçe büyük harf; tek sözcük tek harf; boş ad "?"', () => {
  assert.equal(initialsOf('Tom Hanks'), 'TH');
  assert.equal(initialsOf('ilker ayrık'), 'İA', 'i → İ');
  assert.equal(initialsOf('Cher'), 'C');
  assert.equal(initialsOf('  Robert  Downey  Jr. '), 'RJ');
  assert.equal(initialsOf(''), '?');
  assert.equal(hueOfName('Tom Hanks'), hueOfName('Tom Hanks'));
  assert.ok(hueOfName('Tom Hanks') >= 0 && hueOfName('Tom Hanks') < 360);
});

test('fragman bloğu: otomatikte sessiz iframe + "Sesi aç"; kapalıyken küçük resim; her durumda YouTube bağlantısı; kimlik yoksa boş', () => {
  const auto = trailerHtml(['0jKUpBmYO1Q', 'm-btyJIYLyI'], { auto: true, origin: 'https://localhost' });
  assert.match(auto, /<iframe class="tr-frame" src="https:\/\/www\.youtube\.com\/embed\/0jKUpBmYO1Q\?[^"]*mute=1/);
  assert.match(auto, /referrerpolicy="strict-origin-when-cross-origin"/, 'Hata 153 için');
  assert.match(auto, /data-tr="unmute" hidden/);
  assert.match(auto, /href="https:\/\/www\.youtube\.com\/watch\?v=0jKUpBmYO1Q" target="_blank" rel="noopener"><svg[^>]*><use[^>]*\/><\/svg>YouTube’da aç/);
  const thumb = trailerHtml(['0jKUpBmYO1Q'], { auto: false });
  assert.doesNotMatch(thumb, /<iframe/);
  assert.match(thumb, /data-tr="play"/);
  assert.match(thumb, /i\.ytimg\.com\/vi\/0jKUpBmYO1Q\/hqdefault\.jpg/);
  assert.doesNotMatch(thumb, /tr-unmute/);
  assert.equal(trailerHtml([]), '');
  assert.equal(trailerHtml(null), '');
  assert.match(auto, /data-ids="0jKUpBmYO1Q,m-btyJIYLyI" data-origin="https:\/\/localhost"/, 'sıradaki fragman ve köken denetleyiciye taşınır');
});

test('fragman bloğu: kimlik yokken "YouTube’da fragman ara" bağlantısı (Türk yapımları); sorgu da yoksa boş', () => {
  const h = trailerHtml([], { query: 'Kuruluş Osman 2020 fragman' });
  assert.match(h, /^<section class="tr tr-none"><h2>Fragman<\/h2><a class="tr-find" href="https:\/\/www\.youtube\.com\/results\?search_query=Kurulu%C5%9F%20Osman%202020%20fragman" target="_blank" rel="noopener">/);
  assert.match(h, /YouTube’da fragman ara/);
  assert.doesNotMatch(h, /<iframe|tr-box/);
  assert.equal(trailerHtml(null, { query: '' }), '');
  assert.match(trailerHtml(['0jKUpBmYO1Q'], { query: 'x fragman' }), /data-q="x fragman"/, 'kimlik varken arama bağlantısı yok, sorgu yalnız hata sonrası için saklanır');
  assert.doesNotMatch(trailerHtml(['0jKUpBmYO1Q'], { query: 'x fragman' }), /tr-find/);
});

test('oyuncu kartları: yönetmen etiketi, ad kaçışlı, boşsa bölüm yok', () => {
  assert.equal(peopleHtml([]), '');
  const h = peopleHtml([{ name: 'Robert Zemeckis', role: 'Yönetmen' }, { name: 'Tom "Hanks" <b>', role: '' }]);
  assert.match(h, /data-person="Robert Zemeckis"/);
  assert.match(h, /<small>Yönetmen<\/small>/);
  assert.match(h, /data-person="Tom &quot;Hanks&quot; &lt;b&gt;"/);
  assert.doesNotMatch(h, /<b>[^<]*<b>/);
  assert.equal((h.match(/class="pp-card"/g) || []).length, 2);
});

test('oyuncu sayfası: listede olanlar "Oynat", olmayanlar soluk "Listende yok"; iki ayrı bölüm; boşsa bilgi', () => {
  const films = [
    { imdbId: 'tt0109830', type: 'movie', name: 'Forrest Gump', year: 1994, poster: 'https://p/1', inLib: true },
    { imdbId: 'tt0120689', type: 'movie', name: 'The Green Mile', year: 1999, poster: '', inLib: false },
    { imdbId: 'tt0000001', type: 'series', name: 'Mini Dizi', year: 2019, poster: '', inLib: false },
  ];
  const h = actorHtml('Tom Hanks', '', films);
  assert.match(h, /Listenizde bulunanlar <small>1<\/small>/);
  assert.match(h, /Diğer yapımları <small>2<\/small>/);
  assert.match(h, /class="ac-card k0 lib" data-film="tt0109830" data-type="movie"/);
  assert.match(h, /class="ac-card k0 off" data-film="tt0120689"/);
  assert.match(h, /<em><svg[^>]*><use[^>]*\/><\/svg>Oynat<\/em>/);
  assert.match(h, /<em>Listende yok<\/em>/);
  assert.match(h, /Dizi · 2019/);
  assert.match(h, /aria-label="The Green Mile, listende yok"/);
  assert.match(filmCardHtml(films[0], 7), /ac-card k1 lib/, 'renk sırası 6\'da döner');
  assert.match(actorHtml('Kimse', '', []), /başka yapım bulunamadı/);
  assert.match(actorHtml('Tom Hanks', 'Yönetmen', films), /<div class="dt-m"><span>Yönetmen<\/span>/);
  assert.match(actorLoadingHtml('Tom Hanks'), /spinner/);
  assert.match(h, /<span class="pp-av lg" style="--h:\d+">TH<\/span>/);
});

test('listede olmayan yapım ekranı: "Listenizde yok" düğmesi pasif, fragman alanı başta, özet; yüklenirken "Yükleniyor"', () => {
  const film = { imdbId: 'tt0120689', type: 'movie', name: 'The Green Mile', year: 1999, poster: 'https://p/2' };
  const d = { name: 'Yeşil Yol', year: 1999, runtime: '189 min', genres: ['Drama', 'Fantastik'], description: 'Bir cezaevi hikâyesi', poster: 'https://p/3' };
  const h = titleInfoHtml(film, d);
  assert.match(h, /<button class="btn lg" disabled><svg[^>]*><use[^>]*\/><\/svg>Listenizde yok<\/button>/);
  assert.ok(h.indexOf('id="ti-trailer"') < h.indexOf('<h2>Hakkında</h2>'), 'fragman özetten önce');
  assert.match(h, /Bir cezaevi hikâyesi/);
  assert.match(h, /<span>189 dk<\/span><span>Dram<\/span>/, 'süre ve tür Türkçe');
  assert.match(h, /src="https:\/\/p\/3"/, 'ayrıntıdaki afiş öncelikli');
  assert.match(titleInfoHtml(film, null, true), /Yükleniyor/);
  assert.match(titleInfoHtml(film, null), /özet bulunamadı/);
  assert.match(titleInfoHtml({ ...film, poster: '' }, null), /<div class="dt-pos">TM<\/div>/, 'afiş yoksa baş harfler');
});

// ---- fragman denetleyicisi (sahte DOM) ----
const foundNote0 = (f, i) => 'not-' + i;
function fakeHost({ withFrame = true, dataset = {} } = {}) {
  const handlers = {};
  const unmute = { hidden: true, dataset: {} };
  const box = { innerHTML: '' };
  const posted = [];
  const frameWin = { postMessage: (m) => posted.push(JSON.parse(m)) };
  const frame = { contentWindow: frameWin, addEventListener: (ev, fn) => (handlers['frame:' + ev] = fn) };
  const host = {
    isConnected: true,
    dataset: { id: '0jKUpBmYO1Q', ...dataset },
    handlers,
    querySelector: (sel) => (sel === '.tr-frame' ? ((withFrame && box.innerHTML === '') || /<iframe/.test(box.innerHTML) ? frame : null) : sel === '.tr-box' ? box : sel === '.tr-unmute' ? unmute : null),
    addEventListener: (ev, fn) => (handlers[ev] = fn),
  };
  return { host, unmute, box, posted, frameWin, frame };
}
function fakeWin() {
  const ls = new Set();
  return { addEventListener: (ev, fn) => ev === 'message' && ls.add(fn), removeEventListener: (ev, fn) => ev === 'message' && ls.delete(fn), ls, emit: (e) => [...ls].forEach((f) => f(e)) };
}

test('denetleyici: yüklenince "Sesi aç" görünür, dokununca sesi açar ve gizlenir', () => {
  const { host, unmute, posted, frame } = fakeHost();
  const win = fakeWin();
  wireTrailer(host, { win, doc: null });
  frame.contentWindow.postMessage = (m) => posted.push(JSON.parse(m));
  host.handlers['frame:load']();
  assert.equal(unmute.hidden, false);
  assert.ok(posted.some((m) => m.event === 'listening'), 'dinleme el sıkışması');
  host.handlers.click({ target: { closest: () => ({ dataset: { tr: 'unmute' }, hidden: false }) } });
  assert.deepEqual(posted.at(-1), { event: 'command', func: 'unMute', args: [] });
});

test('denetleyici: yabancı iframe mesajı yoksayılır; tek fragman hata verirse açıklama + YouTube araması; sayfa kapanınca dinleyici bırakılır', () => {
  const { host, box, frameWin } = fakeHost({ dataset: { ids: '0jKUpBmYO1Q', q: 'Kuruluş Osman fragman' } });
  const win = fakeWin();
  wireTrailer(host, { win, doc: null });
  win.emit({ source: {}, data: JSON.stringify({ event: 'onError' }) });
  assert.equal(box.innerHTML, '', 'yabancı kaynak yoksayılır');
  win.emit({ source: frameWin, data: JSON.stringify({ event: 'onError', info: 153 }) });
  assert.match(box.innerHTML, /class="tr-fail"[^>]*><p>Fragman uygulamada oynatılamıyor/);
  assert.match(box.innerHTML, /href="https:\/\/www\.youtube\.com\/results\?search_query=Kurulu%C5%9F%20Osman%20fragman"/);
  assert.doesNotMatch(box.innerHTML, /data-tr="play"/, 'aynı hatayı tekrarlayan küçük resim yok');
  assert.equal(win.ls.size, 1);
  host.isConnected = false;
  win.emit({ source: frameWin, data: '{}' });
  assert.equal(win.ls.size, 0, 'bağlantısı kopan sayfa dinleyiciyi bırakır');
});

test('denetleyici: YouTube hata verirse sıradaki fragmana geçer (sessiz başladıysa sessiz); hepsi bitince açıklama; arama sorgusu yoksa düğme yok', () => {
  const { host, box, frameWin, unmute } = fakeHost({ dataset: { id: 'aaaaaaaaaaa', ids: 'aaaaaaaaaaa,bbbbbbbbbbb,ccccccccccc', origin: 'https://localhost' } });
  const win = fakeWin();
  wireTrailer(host, { win, doc: null });
  unmute.hidden = false;
  win.emit({ source: frameWin, data: JSON.stringify({ event: 'onError', info: 101 }) });
  assert.match(box.innerHTML, /embed\/bbbbbbbbbbb\?[^"]*mute=1[^"]*origin=https%3A%2F%2Flocalhost/);
  assert.equal(host.dataset.id, 'bbbbbbbbbbb', 'küçük resim/YouTube bağlantısı için geçerli kimlik güncellenir');
  assert.equal(unmute.hidden, true, 'yeni video yüklenene kadar "Sesi aç" gizli');
  win.emit({ source: frameWin, data: JSON.stringify({ event: 'onError', info: 150 }) });
  assert.match(box.innerHTML, /embed\/ccccccccccc\?/);
  win.emit({ source: frameWin, data: JSON.stringify({ event: 'onError', info: 153 }) });
  assert.match(box.innerHTML, /class="tr-fail"/);
  assert.doesNotMatch(box.innerHTML, /results\?search_query/, 'sorgu yoksa arama düğmesi yok');
});

test('denetleyici: dokunarak başlatılan (sesli) fragman hata verirse sıradaki de sesli açılır', () => {
  const { host, box, frameWin } = fakeHost({ withFrame: false, dataset: { id: 'aaaaaaaaaaa', ids: 'aaaaaaaaaaa,bbbbbbbbbbb' } });
  const win = fakeWin();
  wireTrailer(host, { win, doc: null });
  host.handlers.click({ target: { closest: () => ({ dataset: { tr: 'play' } }) } });
  assert.match(box.innerHTML, /embed\/aaaaaaaaaaa\?[^"]*mute=0/);
  win.emit({ source: frameWin, data: JSON.stringify({ event: 'onError' }) });
  assert.match(box.innerHTML, /embed\/bbbbbbbbbbb\?[^"]*mute=0/);
});

test('denetleyici: küçük resme dokununca sesli iframe açılır', () => {
  const { host, box } = fakeHost({ withFrame: false });
  wireTrailer(host, { win: fakeWin(), doc: null });
  host.handlers.click({ target: { closest: () => ({ dataset: { tr: 'play' } }) } });
  assert.match(box.innerHTML, /<iframe class="tr-frame"[^>]*mute=0/);
});

test('bağlantı: film ve dizi ekranı fragman/oyuncu alanlarını taşır; oyuncuya dokunma oyuncu sayfasını açar; ayar düğmesi var', () => {
  const app = kaynak('www/js/app.js');
  assert.match(app, /id="mv-trailer"/);
  assert.match(app, /id="mv-people"/);
  assert.match(app, /id="sr-trailer"/);
  assert.match(app, /id="sr-people"/);
  assert.match(app, /openActor\(personOf\(b\)\.name, personOf\(b\)\.role\)/);
  assert.match(app, /chkRow\('trailerAuto', 'Fragmanı otomatik oynat'/);
  assert.match(app, /const autoPlay = auto && setting\('trailerAuto'\)/, 'otomatik oynatma ayara bağlı (varsayılan açık)');
  assert.match(app, /chkRow\('trailerFind', 'Fragmanı otomatik ara'/);
  assert.match(app, /const trailerOn = \(\) => !kidActive\(\) && !isTvUi\(\)/, 'TV ve çocuk modunda fragman yok');
  assert.match(app, /pp\.innerHTML = kidActive\(\) \? ''/, 'çocuk modunda oyuncu kartı yok');
  assert.match(app, /if \(own\) return film\.type === 'series' \? openSeries\(own\) : openMovie\(own\)/, 'listedeyse kendi ekranı');
  assert.match(app, /auto: !extras\.shown/, 'dizi yeniden çizilince fragman yeniden başlamaz');
});

test('fragman bloğu: aranırken bekleme satırı; aramayla bulunanlar için video adı notu, sıradakine geçince not güncellenir, hepsi bitince kalkar', () => {
  assert.match(trailerHtml([], { searching: true, query: 'x fragman' }), /class="tr tr-none"><h2>Fragman<\/h2><div class="tr-wait" role="status">YouTube’da fragman aranıyor…<\/div>/);
  assert.doesNotMatch(trailerHtml([], { searching: true, query: 'x' }), /tr-find/);
  const found = [{ id: 'aaaaaaaaaaa', title: 'Never Surrender | Official Trailer | Netflix', channel: 'Netflix' }, { id: 'bbbbbbbbbbb', title: 'Asla Teslim Olma | Resmi Fragman', channel: '' }];
  const h = trailerHtml(['aaaaaaaaaaa', 'bbbbbbbbbbb'], { auto: true, found, query: 'q' });
  assert.match(h, /<p class="tr-note">YouTube aramasıyla bulundu: Never Surrender \| Official Trailer \| Netflix · Netflix<\/p>/);
  assert.match(h, /data-notes="\[&quot;YouTube aramasıyla bulundu: Never Surrender/);
  assert.doesNotMatch(trailerHtml(['aaaaaaaaaaa'], { auto: true }), /tr-note|data-notes/, 'hazır fragmanda not yok');
  const d = trailerHtml([], { query: 'x fragman', diag: 'YouTube aramasında 18 video bulundu, uygun fragman çıkmadı' });
  assert.match(d, /<\/a><p class="tr-note tr-diag">YouTube aramasında 18 video bulundu, uygun fragman çıkmadı<\/p><\/section>/, 'bulunamama nedeni kartın altında');
  assert.doesNotMatch(trailerHtml([], { query: 'x fragman' }), /tr-diag/);

  const note = { textContent: 'ilk', removed: false, remove() { this.removed = true; } };
  const { host, frameWin } = fakeHost({ dataset: { id: 'aaaaaaaaaaa', ids: 'aaaaaaaaaaa,bbbbbbbbbbb', notes: JSON.stringify(['not 1', 'not 2']) } });
  const q = host.querySelector;
  host.querySelector = (sel) => (sel === '.tr-note' ? note : q(sel));
  const win = fakeWin();
  wireTrailer(host, { win, doc: null });
  win.emit({ source: frameWin, data: JSON.stringify({ event: 'onError', info: 101 }) });
  assert.equal(note.textContent, 'not 2', 'sıradaki videonun adı');
  win.emit({ source: frameWin, data: JSON.stringify({ event: 'onError', info: 150 }) });
  assert.equal(note.removed, true, 'hepsi başarısızsa video adı notu kalkar');
});

test('fragman bloğu: 2+ YouTube sonucu yatay şeritte; dokunulan kart oynatıcıda açılır, not/vurgu/“YouTube’da aç” bağlantısı güncellenir', () => {
  const found = [
    { id: 'aaaaaaaaaaa', title: 'Never Surrender | Official Trailer | Netflix', channel: 'Netflix', seconds: 144, good: true },
    { id: 'bbbbbbbbbbb', title: 'Rastgele <b>Video</b>', channel: 'Kanal', seconds: 3725, good: false },
    { id: 'ccccccccccc', title: 'Üçüncü', channel: '', seconds: 0, good: false },
  ];
  const h = trailerHtml(found.map((f) => f.id), { auto: true, found, query: 'q' });
  assert.match(h, /<div class="tr-rs"><p class="tr-rh">YouTube sonuçları<\/p><div class="tr-rl" role="list">/);
  assert.equal((h.match(/class="tr-r( on)?" role="listitem" data-tr="pick"/g) || []).length, 3);
  assert.match(h, /class="tr-r on" role="listitem" data-tr="pick" data-id="aaaaaaaaaaa"/, 'oynayan kart vurgulu');
  assert.match(h, /<i class="tr-d">2:24<\/i>/);
  assert.match(h, /<i class="tr-d">1:02:05<\/i>/, 'saatli süre');
  assert.doesNotMatch(h.split('data-id="ccccccccccc"')[1].split('</button>')[0], /tr-d/, 'süresiz kartta rozet yok');
  assert.match(h, /<b>Rastgele &lt;b&gt;Video&lt;\/b&gt;<\/b>/, 'başlık kaçışlanır');
  assert.match(h, /<p class="tr-note">YouTube aramasıyla bulundu: Never Surrender/);
  assert.match(trailerHtml(['bbbbbbbbbbb', 'aaaaaaaaaaa'], { found: [found[1], found[0]] }), /<p class="tr-note">YouTube sonucu: Rastgele/, 'doğrulanmamış ilk sonuç “bulundu” diye sunulmaz');
  assert.doesNotMatch(trailerHtml(['aaaaaaaaaaa'], { found: [found[0]] }), /tr-rs/, 'tek sonuçta şerit yok');
  assert.doesNotMatch(trailerHtml(['aaaaaaaaaaa'], { auto: true }), /tr-rs/);

  const cards = found.map((f, i) => ({ dataset: { id: f.id }, on: i === 0, classList: { toggle(c, v) { cards[i].on = v; } } }));
  const open = { href: 'x' };
  const note = { textContent: '' };
  const { host, box, frameWin, unmute } = fakeHost({ dataset: { id: 'aaaaaaaaaaa', ids: found.map((f) => f.id).join(','), origin: 'https://localhost', notes: JSON.stringify(found.map(foundNote0)) } });
  const q = host.querySelector;
  host.querySelector = (sel) => (sel === '.tr-note' ? note : sel === '.tr-open' ? open : q(sel));
  host.querySelectorAll = (sel) => (sel === '.tr-r' ? cards : []);
  const win = fakeWin();
  wireTrailer(host, { win, doc: null });
  host.handlers.click({ target: { closest: () => ({ dataset: { tr: 'pick', id: 'bbbbbbbbbbb' } }) } });
  assert.equal(host.dataset.id, 'bbbbbbbbbbb');
  assert.match(box.innerHTML, /embed\/bbbbbbbbbbb\?.*mute=0/, 'dokunarak seçilen video sesli açılır');
  assert.deepEqual(cards.map((c) => c.on), [false, true, false], 'vurgu seçilen karta geçer');
  assert.equal(open.href, 'https://www.youtube.com/watch?v=bbbbbbbbbbb');
  assert.equal(unmute.dataset.done, '1', 'sesli açılan videoda “Sesi aç” yeniden çıkmaz');
  assert.equal(unmute.hidden, true);
  assert.equal(note.textContent, 'not-1');
  // seçilen video gömülemezse sıradaki sonuca geçilir
  win.emit({ source: frameWin, data: JSON.stringify({ event: 'onError', info: 101 }) });
  assert.equal(host.dataset.id, 'ccccccccccc');
  assert.deepEqual(cards.map((c) => c.on), [false, false, true]);
  // listede olmayan kimlik yok sayılır
  host.handlers.click({ target: { closest: () => ({ dataset: { tr: 'pick', id: 'zzzzzzzzzzz' } }) } });
  assert.equal(host.dataset.id, 'ccccccccccc');
});

test('bağlantı: bilgi ekranı özeti Türkçeye çevrilir; çeviri gelene kadar özgün metin, "Özgün metni göster" ile geri dönülür', () => {
  const app = kaynak('www/js/app.js');
  assert.match(app, /import \{ translateToTr \} from '\.\/translate\.js'/);
  assert.match(app, /translatePlot\(body, detail && detail\.description\);/);
  assert.match(app, /if \(!body\.isConnected \|\| !p\.isConnected \|\| !tr \|\| tr === text\) return;/, 'çeviri yoksa özgün metin kalır');
  assert.match(app, /const o = e\.target\.closest\('\[data-orig\]'\);\n\s+if \(o\) togglePlot\(body\);/);
  assert.match(app, /'Türkçe çeviriyi göster' : 'Özgün metni göster'/);
});

test('bağlantı: fragman Cinemeta + sağlayıcı kimliğiyle boyanır; kimlik yoksa YouTube araması; eşleşme çözülemese de gösterilir', () => {
  const app = kaynak('www/js/app.js');
  assert.match(app, /const ids = trailerIds\(detail, provider && provider\.trailer\);/);
  assert.match(app, /const find = trailerOn\(\) && !ids\.length && finds\.length > 0 && setting\('trailerFind'\);/, 'yalnız hazır fragman yokken ve ayar açıkken aranır');
  assert.match(app, /findTrailerOnYoutube\(\{ net, cache: store\.cache, query: q, wanted, year, onInfo: \(i\) => infos\.push\(i\) \}\)/);
  assert.match(app, /diag: picks\.length \? '' : describeFind\(infos\)/, 'bulunamayınca nedeni kartın altında yazar');
  assert.match(app, /if \(!tr\.isConnected \|\| tr\._find !== token\) return;/, 'yeni boyama eski aramanın sonucunu geçersiz kılar');
  assert.match(app, /trailerHtml\(picks\.map\(\(p\) => p\.id\), \{ auto: autoPlay && good, origin: location\.origin, query, found: picks, diag: /);
  assert.match(app, /onFound: \(\) => \{ extras\.shown = true; \}/, 'dizi: aramayla bulunan fragman yeniden çizimde otomatik başlamaz');
  assert.match(app, /trailer: \(info && info\.trailer\) \|\| it\.trailer/, 'film: sağlayıcı fragmanı');
  assert.match(app, /trailer: info\.trailer \|\| it\.trailer/, 'dizi: sağlayıcı fragmanı');
  assert.match(app, /\.\.\.trailerSearch\(film\.name, film\.year, null\)/, 'bilgi ekranı');
  assert.match(app, /\.\.\.trailerSearch\(it\.name, \(info && info\.year\) \|\| \(meta && meta\.year\), origin\)/);
  assert.match(app, /paintTitleExtras\(body, null, provider, extrasOf\(null, null\)\)/, 'film: eşleşme çözülemese de fragman');
  assert.match(app, /resolveTitleOrigin\(net, it\.name, year, store\)/, 'IMDb eşleşmesi yoksa Türkçe ad özgün ada çevrilir');
  assert.match(app, /const query = `\$\{t\.title\} fragman`;/, 'Türkçe ad yılsız aranır (düğme ve uygulamanın aramasında)');
  assert.match(app, /trailerQuery\(original, oy \|\| '', 'official trailer'\)/, 'ikinci arama özgün adla');
  assert.match(app, /const good = picks\.length > 0 && picks\[0\]\.good;/, 'en alakalı fragman ilkse otomatik oynar, değilse şeritten seçilir');
  assert.match(app, /auto: autoPlay && good,/);
  assert.match(app, /if \(r && r\.some\(\(p\) => p\.good\)\) \{ picks = r; break; \}/, 'en alakalı bulunduysa sonraki aramaya geçilmez');
  assert.match(app, /loadTitleExtras\(it, meta && meta\.imdbId, 'movie', \(detail, origin\) => paintTitleExtras\(body, detail, provider, extrasOf\(meta, origin\)\)/);
  assert.match(app, /loadTitleExtras\(it, meta && meta\.imdbId, 'series', \(detail, origin\) => \{ extras\.detail = detail; extras\.origin = origin;/);
  assert.match(app, /if \(!extras\.ready\) \{ extras\.ready = true; paintExtras\(\); \}/, 'dizi: eşleşme çözülemese de fragman');
  assert.match(app, /trailer: extras\.ready \? '#sr-trailer' : ''/, 'dizi: eşleşme çözülmeden fragman boyanmaz (video değişip yeniden başlamasın)');
  assert.match(app, /if \(extras\.ready && trailerIds\(extras\.detail, extras\.provider\.trailer\)\.length && trailerOn\(\)\) extras\.shown = true/);
});

test('bağlantı: oyuncu sayfası sınıfı çok renkli tema listesinde; sayfa kapanınca fragman dinleyicisi bırakılır', () => {
  const css = kaynak('www/css/app.css');
  assert.match(css, /html\[data-multi\] \.ac-pg \{ --pc: var\(--p2\); \}/);
  assert.match(css, /\.rd-pg, \.ac-pg\) \{\n\s+--accent: var\(--pc\)/);
  assert.match(css, /\.dt-sp \.dt-tr \{ grid-area: trl; \}/);
  assert.match(css, /\.dt-tr:empty, \.dt-pp:empty \{ display: none; \}/);
  assert.doesNotMatch(css, /\.tr-play \{[^}]*color: #fff/, 'dolgu üstü yazı koyu kalır');
  const ui = kaynak('www/js/title-ui.js');
  assert.match(ui, /if \(!host\.isConnected\) return dispose\(\)/);
});

test('vizyondaki filmler: satır 12 kartla sınırlı, listedekilere "Listende" etiketi, "Tümünü gör" düğmesi; boşsa satır yok', () => {
  const films = Array.from({ length: 20 }, (_, i) => ({ imdbId: `tt${i + 1}`, type: 'movie', name: `Film <${i}>`, year: 2026, poster: `https://p/${i}.jpg` }));
  const h = releasesRowHtml(films, (f) => f.imdbId === 'tt2');
  assert.equal((h.match(/class="card nw"/g) || []).length, 12);
  assert.equal((h.match(/nw-tag/g) || []).length, 1);
  assert.match(h, /data-nid="tt2"[^>]*>.*?Listende<\/span>/);
  assert.match(h, /data-go="new">Tümünü gör/);
  assert.match(h, /Film &lt;0&gt;/, 'ad kaçışlı');
  assert.equal(releasesRowHtml([]), '');
  assert.equal(releasesRowHtml(null), '');
});

test('vizyondaki filmler: tüm liste kartları Oynat/Listende yok etiketli; boşsa bilgi', () => {
  const h = releasesPageHtml([{ imdbId: 'tt1', type: 'movie', name: 'A', year: 2026, poster: '', inLib: true }, { imdbId: 'tt2', type: 'movie', name: 'B', year: 2026, poster: '', inLib: false }]);
  assert.match(h, /class="ac-card k0 lib" data-film="tt1"/);
  assert.match(h, /class="ac-card k1 off" data-film="tt2"/);
  assert.match(releasesPageHtml([]), /bulunamadı/);
});

test('bağlantı: vizyondaki filmler ana sayfada, çocuk modunda yok; kart bilgi ekranını açar; ekran kaynağa bağlı değil', () => {
  const app = kaynak('www/js/app.js');
  assert.match(app, /<div id="home-new">\$\{kidActive\(\) \|\| !newHome \? '' : releasesRowHtml/);
  assert.match(app, /ensureHomeNew\(\);/);
  assert.match(app, /if \(go === 'new'\) return openNewReleases\(\)/);
  assert.match(app, /function openNewReleases\(\) \{\n\s+if \(kidActive\(\)\) return;/);
  assert.match(app, /const nc = e\.target\.closest\('\[data-nid\]'\)/);
  assert.match(app, /if \(film\) return openTitleInfo\(film\)/);
  const css = kaynak('www/css/app.css');
  assert.match(css, /\.nw-tag \{[^}]*color: var\(--accent-ink, #0a1118\)/, 'dolgu üstü yazı koyu');
});
