import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBeyazperde, parseParibu, parseBiletinial, lastPage, filmKey, sameFilm, mergeLists, loadVizyon, sourcesNote, VIZYON_TTL, BEYAZPERDE_URL, PARIBU_URL, BILETINIAL_URL } from '../www/js/vizyon.js';
import { releasesRowHtml, releasesPageHtml } from '../www/js/title-ui.js';

// Sayfa parçaları gerçek sayfalardan (19/11/2026) görülen yapıya göre: Beyazperde = görsel (alt "<ad> posteri") + başlık bağlantısı + tarih satırı + "Seanslar!" bağlantısı.
const bpCard = (id, title, date, img) => `<li class="mdl"><div class="card entity-card"><figure class="thumbnail"><img class="thumbnail-img" alt=" ${title} posteri" src="https://tr.web.img3.acsta.net/c_310_420/img/${img}.jpg" /></figure><div class="meta"><h2 class="meta-title"><a class="meta-title-link" href="/filmler/film-${id}/">${title}</a></h2><div class="meta-body"><span class="date">${date}</span> | 1s 21dk | Animasyon</div><div>Yönetmen Burak Kalaç</div><div>Oyuncular: <a href="/sanatcilar/sanatci-969972/">Mahsun Karaca</a></div><a href="/filmler/film-${id}/seanslar/">Seanslar! (286)</a></div></div></li>`;
const BP1 = `<html><body><ul>${bpCard(1000047397, 'Pırıl 3: Kayıp Anahtarın Gizemi', '13 Kasım 2026', 'f6/3f/aa')}${bpCard(1000051044, 'Av. Mahsun: Ben Sana İnanıyorum', '13 Kasım 2026', '96/8d/bb')}${bpCard(1000048391, 'Çakallarla Dans 8: Şututgart Çıkarması', '6 Kasım 2026', '0f/41/cc')}</ul><div class="pagination"><a href="/filmler/vizyondakiler/sinema-sayisi/?page=2">2</a><a href="/filmler/vizyondakiler/sinema-sayisi/?page=3">3</a><a href="/filmler/vizyondakiler/sinema-sayisi/?page=6">6</a></div></body></html>`;

const pbCard = (title, slug, img, genre = 'komedi') => `<div class="movie"><a href="/${genre}-filmleri/${slug}-filmi-izle"><img src="https://cdn-web.marsgate.tr/267//files/movie_posters/${img}.png" alt=""></a><h3>${title}</h3><span>1 sa 44 dk / Komedi</span><img src="/img/eggs-65.svg" alt=""><a href="#">Hemen Bilet Al</a><a href="https://www.paribucineverse.com/${genre}-filmleri/${slug}-filmi-izle">İncele</a></div>`;
const PB = `<html><body><div class="tab">${pbCard('Av. Mahsun: Ben Sana İnanıyorum', 'av-mahsun-karaca-ben-sana-inaniyorum', 'HO1_a')}${pbCard('Godzilla Minus Zero', 'godzilla-minus-zero', 'HO2_b', 'aksiyon')}${pbCard('The Odyssey', 'the-odyssey', 'HO3_c', 'macera')}</div><div class="tab yakinda"><ul><li><a href="/aksiyon-filmleri/avengers-doomsday-filmi-izle">Avengers: Doomsday</a></li><li><a href="/komedi-filmleri/zor-baba-4-filmi-izle">Zor Baba 4</a></li></ul></div></body></html>`;

const btCard = (title, slug, img) => `<div class="card"><a href="https://biletinial.com/tr-tr/sinema/${slug}" title="${title}"><img alt="${title}" src="https://b6s54eznn8xq.merlincdn.net/Uploads/Films/${img}.jpg"></a><span>Sinema</span><h3><a href="https://biletinial.com/tr-tr/sinema/${slug}">${title}</a></h3><div>Başlangıç Fiyatı <b>₺385</b></div></div>`;
const BT = `<html><body>${btCard('Odyssey', 'odyssey-2026', 'odyssey-2026615')}${btCard('Komşum Totoro', 'komsum-totoro', 'komsum-totoro-2024')}${btCard('Komşum Totoro', 'komsum-totoro', 'komsum-totoro-2024')}<a href="/tr-tr/sinema/sinemalar">Tüm sinemalar</a><img src="/img/banner.jpg"></body></html>`;

test('parseBeyazperde: ad, film kimliği, afiş (alt eşleşmesi), tarih; Seanslar ve oyuncu bağlantıları atlanır', () => {
  const r = parseBeyazperde(BP1);
  assert.deepEqual(r.map((x) => x.title), ['Pırıl 3: Kayıp Anahtarın Gizemi', 'Av. Mahsun: Ben Sana İnanıyorum', 'Çakallarla Dans 8: Şututgart Çıkarması']);
  assert.equal(r[0].poster, 'https://tr.web.img3.acsta.net/c_310_420/img/f6/3f/aa.jpg');
  assert.equal(r[2].poster, 'https://tr.web.img3.acsta.net/c_310_420/img/0f/41/cc.jpg');
  assert.equal(r[0].year, 2026);
  assert.equal(r[0].date, '2026-11-13');
  assert.equal(r[2].date, '2026-11-06');
  assert.equal(parseBeyazperde('').length, 0);
  assert.equal(parseBeyazperde(null).length, 0);
});

test('parseBeyazperde: afiş tembel yüklemede data-src ile gelir; başka bir tembel öznitelikte de etiketteki görsel adresi bulunur', () => {
  const h = '<div><img class="lazy" alt=" Şapkalı Kedi posteri" src="data:image/gif;base64,AAAA" data-src="https://tr.web.img3.acsta.net/c_310_420/img/aa/bb/x.jpg"><h2><a href="https://www.beyazperde.com/filmler/film-5/">Şapkalı Kedi</a></h2><span>20 Kasım 2026</span></div>'
    + '<div><img class="lazy" alt=" Çirko posteri" src="data:image/gif;base64,AAAA" data-lazysrc="//tr.web.img2.acsta.net/c_310_420/img/cc/dd/y.jpg?v=2"><h2><a href="/filmler/film-6/">Çirko</a></h2></div>'
    + '<div><img alt=" Afişsiz Film posteri" src="data:image/gif;base64,AAAA"><h2><a href="/filmler/film-7/">Afişsiz Film</a></h2></div>';
  const r = parseBeyazperde(h);
  assert.equal(r[0].title, 'Şapkalı Kedi');
  assert.equal(r[0].poster, 'https://tr.web.img3.acsta.net/c_310_420/img/aa/bb/x.jpg');
  assert.equal(r[0].date, '2026-11-20');
  assert.equal(r[1].poster, 'https://tr.web.img2.acsta.net/c_310_420/img/cc/dd/y.jpg?v=2');
  assert.equal(r[2].title, 'Afişsiz Film', 'afiş adresi bulunamasa da kart film sayılır');
  assert.equal(r[2].poster, '');
});

test('parseBeyazperde: arama önerileri ve kenar çubuğu bağlantıları (afişsiz) film sayılmaz; öneride geçen film asıl kartından alınır', () => {
  const header = '<header><form><input placeholder="Ex: Dijital Esaret, Resmi Sırlar, Indiana Jones 5"><ul class="suggest"><li><a href="/filmler/film-111/">Dijital Esaret</a></li><li><a href="https://www.beyazperde.com/filmler/film-222/">Resmi Sırlar</a></li><li><a href="/filmler/film-333/">Indiana Jones 5</a></li><li><a href="/filmler/film-1000047397/">Pırıl 3: Kayıp Anahtarın Gizemi</a></li></ul></form></header>';
  const aside = '<aside><a href="/filmler/film-999/">Kenar Film</a></aside>';
  const r = parseBeyazperde(header + BP1 + aside);
  assert.deepEqual(r.map((x) => x.title), ['Pırıl 3: Kayıp Anahtarın Gizemi', 'Av. Mahsun: Ben Sana İnanıyorum', 'Çakallarla Dans 8: Şututgart Çıkarması']);
  assert.equal(r[0].poster, 'https://tr.web.img3.acsta.net/c_310_420/img/f6/3f/aa.jpg');
  assert.equal(r[0].date, '2026-11-13', 'tarih önerinin değil kartın satırından');
});

test('lastPage: sayfa bağlantılarından en büyük numara (&amp; biçimi dahil), yoksa 1', () => {
  assert.equal(lastPage(BP1), 6);
  assert.equal(lastPage('<a href="/x/?a=1&amp;page=4">4</a>'), 4);
  assert.equal(lastPage('<p>yok</p>'), 1);
});

test('parseParibu: yalnız afişli "Vizyonda" kartları; "Yakında" metin bağlantıları ve derecelendirme simgeleri alınmaz', () => {
  const r = parseParibu(PB);
  assert.deepEqual(r.map((x) => x.title), ['Av. Mahsun: Ben Sana İnanıyorum', 'Godzilla Minus Zero', 'The Odyssey']);
  assert.equal(r[1].poster, 'https://cdn-web.marsgate.tr/267//files/movie_posters/HO2_b.png');
  assert.equal(r[1].url, 'https://www.paribucineverse.com/aksiyon-filmleri/godzilla-minus-zero-filmi-izle');
  assert.ok(!r.some((x) => /Doomsday|Zor Baba/.test(x.title)));
  assert.equal(parseParibu('<p>x</p>').length, 0);
});

test('parseBiletinial: görsel bağlantısından ad + afiş; aynı film bir kez; afişsiz bağlantı atlanır', () => {
  const r = parseBiletinial(BT);
  assert.deepEqual(r.map((x) => x.title), ['Odyssey', 'Komşum Totoro']);
  assert.equal(r[0].poster, 'https://b6s54eznn8xq.merlincdn.net/Uploads/Films/odyssey-2026615.jpg');
  assert.equal(r[0].url, 'https://biletinial.com/tr-tr/sinema/odyssey-2026');
});

test('filmKey / sameFilm: "The" ve sıra numarası farkı aynı filmdir; farklı devam filmleri ayrı kalır', () => {
  assert.equal(filmKey('The Odyssey'), filmKey('Odyssey'));
  assert.equal(filmKey('Şapkalı Kedi'), 'sapkali kedi');
  assert.ok(sameFilm(filmKey('Pırıl 3: Kayıp Anahtarın Gizemi'), filmKey('Pırıl: Kayıp Anahtarın Gizemi')));
  assert.ok(sameFilm(filmKey('Cinlerin Düğünü 1'), filmKey('Cinlerin Düğünü')));
  assert.ok(!sameFilm(filmKey('Toy Story 4'), filmKey('Toy Story 5')), 'ikisinde de numara var: ayrı film');
  assert.ok(!sameFilm(filmKey('Çatlı 2'), filmKey('Çirko')));
  assert.ok(!sameFilm('', 'x'));
});

test('mergeLists: öncelik sırası korunur, aynı film birleşir (eksik afiş/yıl tamamlanır), kaynak listesi tutulur', () => {
  const films = mergeLists([
    { id: 'beyazperde', items: [{ title: 'Pırıl 3: Kayıp Anahtarın Gizemi', year: 2026, date: '2026-11-13', poster: '' }, { title: 'Godzilla Minus Zero', year: 2026, date: '2026-11-13', poster: 'https://a/g.jpg' }] },
    { id: 'paribu', items: [{ title: 'Pırıl: Kayıp Anahtarın Gizemi', poster: 'https://p/piril.png' }, { title: 'The Odyssey', poster: 'https://p/o.png' }, { title: 'Godzilla Minus Zero', poster: 'https://p/g.png' }] },
    { id: 'biletinial', items: [{ title: 'Odyssey', poster: 'https://b/o.jpg' }, { title: 'Komşum Totoro', poster: 'https://b/t.jpg' }] },
  ]);
  assert.deepEqual(films.map((f) => f.name), ['Pırıl 3: Kayıp Anahtarın Gizemi', 'Godzilla Minus Zero', 'The Odyssey', 'Komşum Totoro']);
  assert.equal(films[0].poster, 'https://p/piril.png', 'poster eksikse sonraki kaynaktan');
  assert.equal(films[1].poster, 'https://a/g.jpg');
  assert.deepEqual(films[0].src, ['beyazperde', 'paribu']);
  assert.deepEqual(films[2].src, ['paribu', 'biletinial']);
  assert.equal(films[0].year, 2026);
  assert.equal(films[0].id, 'v:piril-3-kayip-anahtarin-gizemi');
  assert.equal(films[0].imdbId, '');
  assert.equal(films[0].local, true);
  assert.deepEqual(films[0].trNames, ['Pırıl 3: Kayıp Anahtarın Gizemi']);
  assert.deepEqual(films[0].trGuess, [], 'Türkçe ad zaten var: makine çevirisi aranmaz');
  assert.equal(new Set(films.map((f) => f.id)).size, films.length);
  assert.equal(mergeLists([{ id: 'x', items: Array.from({ length: 10 }, (_, i) => ({ title: `Film ${i}a${i}` })) }], 3).length, 3);
});

// Ağ: adrese göre sayfa döndürür
const bpPage = (n) => `<ul>${Array.from({ length: 12 }, (_, i) => bpCard(2000000 + n * 100 + i, `Film ${n}${String.fromCharCode(97 + i)}x`, '13 Kasım 2026', `p${n}${i}`)).join('')}</ul>${n === 1 ? '<a href="?page=3">3</a>' : ''}`;
const netOf = (over = {}) => {
  const calls = [];
  return {
    calls,
    text: async (url) => {
      calls.push(url);
      if (over[url] instanceof Error) throw over[url];
      if (over[url] !== undefined) return over[url];
      if (url === BEYAZPERDE_URL) return bpPage(1);
      if (url.startsWith(BEYAZPERDE_URL + '?page=')) return bpPage(Number(url.split('=')[1]));
      if (url === PARIBU_URL) return PB;
      if (url === BILETINIAL_URL) return BT;
      throw new Error('bilinmeyen adres ' + url);
    },
  };
};
const mem = () => { const m = new Map(); return { get: async (k) => m.get(k), set: async (k, v) => { m.set(k, v); }, m }; };

test('loadVizyon: üç kaynak birleşir; Beyazperde sayfaları (1..6) alınır; 6 saat önbellekten', async () => {
  const net = netOf();
  const cache = mem();
  const r = await loadVizyon({ net, cache, now: 1000 });
  assert.equal(r.stale, false);
  assert.equal(r.fallback, false);
  assert.deepEqual(r.sources.map((s) => [s.id, s.count, s.error]), [['beyazperde', 72, ''], ['paribu', 3, ''], ['biletinial', 2, '']]);
  assert.equal(net.calls.filter((u) => u.startsWith(BEYAZPERDE_URL)).length, 6, '1. sayfa + 2..6');
  assert.equal(r.films.length, 72 + 3 + 2 - 1 - 0, 'Odyssey (Paribu "The Odyssey" ↔ Biletinial "Odyssey") tek film');
  assert.equal(r.films[0].name, 'Film 1ax');
  const n = net.calls.length;
  const again = await loadVizyon({ net, cache, now: 2000 });
  assert.equal(net.calls.length, n, 'önbellekten: ağ yok');
  assert.equal(again.films.length, r.films.length);
  assert.equal(again.stale, false);
  await loadVizyon({ net, cache, now: 1000 + VIZYON_TTL + 1 });
  assert.ok(net.calls.length > n, 'süre dolunca yeniden alınır');
});

test('loadVizyon: bir kaynak düşerse diğerleri yeter; neden sources içinde görünür', async () => {
  const big = `<div>${Array.from({ length: 6 }, (_, i) => pbCard(`Yerli Film ${i}z`, `yerli-film-${i}z`, `HO${i}`)).join('')}</div>`;
  const net = netOf({ [BEYAZPERDE_URL]: new Error('HTTP 403'), [PARIBU_URL]: big, [BILETINIAL_URL]: '<html>boş</html>' });
  const r = await loadVizyon({ net, cache: null, now: 1 });
  assert.equal(r.films.length, 6);
  assert.deepEqual(r.sources.map((s) => s.error), ['HTTP 403', '', 'Film bulunamadı']);
  assert.equal(sourcesNote(r.sources), 'Beyazperde alınamadı (HTTP 403) · Paribu Cineverse 6 · Biletinial alınamadı (Film bulunamadı)');
});

test('loadVizyon: az film (bozuk sayfa) → eski önbellek (stale); önbellek yoksa fallback; o da yoksa hata', async () => {
  const cache = mem();
  await loadVizyon({ net: netOf(), cache, now: 1 });
  const down = { text: async () => { throw new Error('ağ yok'); } };
  const stale = await loadVizyon({ net: down, cache, now: 1 + VIZYON_TTL + 5 });
  assert.equal(stale.stale, true);
  assert.ok(stale.films.length > 50);
  assert.equal(stale.sources[0].error, 'ağ yok');
  const fb = await loadVizyon({ net: down, cache: null, now: 1, fallback: async () => ({ films: [{ imdbId: 'tt1', name: 'X' }], at: 9, stale: false }) });
  assert.equal(fb.fallback, true);
  assert.equal(fb.films[0].imdbId, 'tt1');
  assert.equal(fb.sources.length, 3);
  await assert.rejects(loadVizyon({ net: down, cache: null, now: 1 }), (e) => /alınamadı/.test(e.message) && e.sources.length === 3);
});

test('arayüz: afişi olmayan filmde boş src\'li görsel üretilmez', () => {
  const row = releasesRowHtml([{ id: 'v:a', imdbId: '', type: 'movie', name: 'Afişsiz Film', year: 0, poster: '' }, { id: 'v:b', imdbId: '', type: 'movie', name: 'Afişli', year: 0, poster: 'https://p/b.jpg' }], () => false);
  assert.doesNotMatch(row, /<img src=""/);
  assert.equal((row.match(/<img /g) || []).length, 1);
  assert.match(row, />AF</, 'baş harfler kalır');
});

test('arayüz: yerel filmin kimliği v:… ile kartlanır; kaynak özeti ve yedek notları sayfada görünür', () => {
  const films = mergeLists([{ id: 'beyazperde', items: [{ title: 'Şapkalı Kedi', year: 2026, poster: 'https://p/k.jpg' }, { title: 'Çirko', year: 2026, poster: '' }] }]);
  const row = releasesRowHtml(films, () => false);
  assert.match(row, /data-nid="v:sapkali-kedi"/);
  const page = releasesPageHtml(films.map((f) => ({ ...f, inLib: false })), { sources: 'Beyazperde 2 · Paribu Cineverse alınamadı (HTTP 403)', stale: true });
  assert.match(page, /data-film="v:sapkali-kedi"/);
  assert.match(page, /Türkiye sinemalarında vizyondaki filmler/);
  assert.match(page, /ac-src">Güncel liste alınamadı/);
  assert.match(page, /ac-src">Beyazperde 2 · Paribu Cineverse alınamadı \(HTTP 403\)/);
  assert.match(releasesPageHtml([{ imdbId: 'tt1', type: 'movie', name: 'A', year: 2026, poster: '', inLib: false }], { fallback: true }), /genel yeni çıkanlar listesi/);
});
