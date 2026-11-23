// webOS harici altyazı: ayrıştırma, zamanlama, IMDb eşleşmesi ve liste hazırlama.
import test from 'node:test';
import assert from 'node:assert/strict';

const A = await import('../webos/src/altyazi.js');

test('altyazı: SRT ve WebVTT ayrıştırılır; etiketler, BOM, CRLF ve ASS kodları temizlenir', () => {
  const srt = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\n<i>Merhaba</i> &amp; dünya\r\n\r\n2\r\n00:00:03,000 --> 00:00:05,000\r\n{\\an8}İkinci\r\nsatır\r\n\r\nWEBVTT\n\nNOTE yorum\n\n00:07.500 --> 00:09.000\nVTT satırı\n\n3\n00:00:20,000 --> 00:00:21,000\n<font color="#ff0">  </font>\n';
  const c = A.altyaziAyristir(srt);
  assert.deepEqual(c, [
    { b: 1000, s: 3500, m: 'Merhaba & dünya' },
    { b: 3000, s: 5000, m: 'İkinci\nsatır' },
    { b: 7500, s: 9000, m: 'VTT satırı' },
  ]);
  assert.deepEqual(A.altyaziAyristir(''), []);
  assert.deepEqual(A.altyaziAyristir('rastgele metin'), []);
  assert.deepEqual(A.altyaziAyristir('1\n01:02:03,5 --> 01:02:04,25\nSaatli'), [{ b: 3723500, s: 3724250, m: 'Saatli' }]);
});

test('altyazı: aktifMetin başlangıç/bitiş sınırlarını ve üst üste binen satırları doğru verir', () => {
  const c = A.altyaziAyristir('1\n00:00:01,000 --> 00:00:03,500\nA\n\n2\n00:00:03,000 --> 00:00:05,000\nB\n\n3\n00:00:09,000 --> 00:00:10,000\nC');
  const t = (ms) => A.aktifMetin(c, ms);
  assert.equal(t(500), '');
  assert.equal(t(1000), 'A');
  assert.equal(t(3200), 'A\nB');
  assert.equal(t(3500), 'B', 'bitiş anı dahil değil');
  assert.equal(t(5000), '');
  assert.equal(t(9500), 'C');
  assert.equal(t(99999), '');
  assert.equal(A.aktifMetin([], 1000), '');
});

test('altyazı: dil kodları ve liste sırası (Türkçe, İngilizce, sonra öteki; geçersiz adresler atılır)', () => {
  assert.deepEqual(['tr', 'tur', 'TR-tr', 'en', 'deu', 'pt-br', ''].map(A.dilKodu), ['tur', 'tur', 'tur', 'eng', 'ger', 'por', '']);
  const l = A.listeHazirla([
    { url: 'http://a/1', lang: 'eng' },
    { url: 'http://a/2', lang: 'tur' },
    { url: 'http://a/3', lang: 'tr' },
    { url: 'ftp://x/4', lang: 'tur' },
    { url: 'http://a/5', lang: 'fre' },
    { url: 'http://a/6', lang: 'fra' },
    { lang: 'tur' },
    null,
  ]);
  assert.deepEqual(l.map((x) => x.ad), ['Türkçe 1', 'Türkçe 2', 'İngilizce', 'Fransızca']);
  assert.deepEqual(A.listeHazirla(null), []);
  const cok = [];
  for (let i = 0; i < 40; i++) cok.push({ url: 'http://a/' + i, lang: i % 2 ? 'tur' : 'eng' });
  assert.equal(A.listeHazirla(cok).length, 9, 'Türkçe en çok 6, İngilizce en çok 3');
});

test('altyazı: videoKimligi — canlıda yok; filmde ad/yıl; bölümde sezon ve bölüm şart', () => {
  assert.equal(A.videoKimligi({ kind: 'live', name: 'Kanal' }), null);
  assert.equal(A.videoKimligi(null), null);
  assert.deepEqual(A.videoKimligi({ kind: 'movie', name: 'F', year: '2020' }), { tur: 'movie', ad: 'F', yil: 2020, sezon: 0, bolum: 0 });
  assert.deepEqual(A.videoKimligi({ kind: 'episode', seriesName: 'D', season: 2, episodeNum: 5 }), { tur: 'series', ad: 'D', yil: 0, sezon: 2, bolum: 5 });
  assert.equal(A.videoKimligi({ kind: 'episode', seriesName: 'D', episodeNum: 5 }), null, 'sezon yoksa (eski kayıt) aranmaz');
});

// Sahte ağ: IMDb öneri araması (v3.sg.media-imdb.com) + Cinemeta arama/üstveri. tablo: { 'aranan ad': { imdb: [...], cin: [...] } }
function ag(tablo, meta = {}) {
  const istek = [];
  return {
    istek,
    cokme: false,
    imdbCokme: false,
    json: async function (url) {
      istek.push(url);
      let m;
      if ((m = /media-imdb\.com\/suggestion\/x\/(.+)\.json$/.exec(url))) {
        if (this.cokme || this.imdbCokme) throw new Error('Zaman aşımı');
        const t = tablo[decodeURIComponent(m[1])];
        return { d: (t && t.imdb) || [] };
      }
      if ((m = /\/catalog\/(?:movie|series)\/top\/search=(.+)\.json$/.exec(url))) {
        if (this.cokme) throw new Error('Zaman aşımı');
        const t = tablo[decodeURIComponent(m[1]).toLowerCase()];
        return { metas: (t && t.cin) || [] };
      }
      if ((m = /\/meta\/(?:movie|series)\/(tt\d+)\.json$/.exec(url))) return { meta: { moviedb_id: meta[m[1]] } };
      return {};
    },
  };
}
const IM = (id, l, y, qid) => ({ id, l, y, qid: qid || 'movie' });
const film = (ad, yil) => ({ tur: 'movie', ad, yil: yil || 0, sezon: 0, bolum: 0 });
const dizi = (ad) => ({ tur: 'series', ad, yil: 0, sezon: 1, bolum: 1 });

test('imdbCoz: Türkçe adlı film IMDb aramasının AKA eşleşmesiyle çözülür (yıl tek yapımla uyuşur); bölüm/oyun/kişi sonuçları elenir', async () => {
  const n = ag({ 'esaretin bedeli': { imdb: [IM('tt0111161', 'The Shawshank Redemption', 1994), IM('tt9999991', 'Esaretin Bedeli Belgeseli', 2010, 'tvEpisode'), { id: 'nm0000151', l: 'Morgan Freeman', qid: '' }, IM('tt0293927', 'Shawshank: The Redeeming Feature', 2001, 'video')] } });
  const r = await A.imdbCoz(n, film('TR | Esaretin Bedeli (1994)', 1994), {}, null);
  assert.deepEqual({ id: r.id, kaynak: r.kaynak }, { id: 'tt0111161', kaynak: 'yil' });
  assert.ok(n.istek.some((u) => u.indexOf(A.IMDB_ARAMA + 'esaretin%20bedeli.json') === 0), 'ad küçük harfli ve kodlanmış');
});

test('imdbCoz: kesinlik sırası — kalıcı kayıt > sağlayıcı IMDb > TMDB doğrulaması > birebir ad; ağa hiç gitmeden döner', async () => {
  const n = ag({});
  const depo = {};
  const kalici = A.kaliciHafiza(() => depo.m, (m) => (depo.m = m));
  // sağlayıcının IMDb kimliği doğrudan kullanılır
  assert.deepEqual(await A.imdbCoz(n, film('Bir Film', 2020), { imdb: 'tt1234567' }, kalici), { id: 'tt1234567', kaynak: 'saglayici' });
  assert.equal(n.istek.length, 0);
  // geçersiz kimlik yok sayılır, kalıcı kayıt öne geçer
  kalici.koy('movie|kayitli film|2019', 'tt7654321');
  assert.deepEqual(await A.imdbCoz(n, film('Kayıtlı Film', 2019), { imdb: 'x1' }, kalici), { id: 'tt7654321', kaynak: 'kayit' });
  assert.equal(n.istek.length, 0);
  // birebir ad (özgün ad): IMDb sonuçları aynı adı taşıyan birden çok yapım içerse de yıl doğruyu seçer
  const n2 = ag({ dune: { imdb: [IM('tt1160419', 'Dune', 2021), IM('tt0087182', 'Dune', 1984)], cin: [] } });
  const r = await A.imdbCoz(n2, film('Dune', 1984), {}, null);
  assert.deepEqual({ id: r.id, kaynak: r.kaynak }, { id: 'tt0087182', kaynak: 'tam-ad' });
});

test('imdbCoz: sağlayıcının özgün adı önce aranır; TMDB kimliği Cinemeta kaydıyla doğrulanır', async () => {
  const n = ag(
    {
      'kurtlar vadisi irak': { imdb: [IM('tt0455276', 'Valley of the Wolves: Iraq', 2006)], cin: [{ id: 'tt0455276', name: 'Valley of the Wolves: Iraq', year: '2006', moviedb_id: 14137 }] },
      'valley of the wolves: iraq': { imdb: [IM('tt0455276', 'Valley of the Wolves: Iraq', 2006), IM('tt1111111', 'Valley of the Wolves: Iraq (Part 2)', 2006)], cin: [{ id: 'tt0455276', name: 'Valley of the Wolves: Iraq', year: '2006', moviedb_id: 14137 }] },
    },
    { tt1111111: '55', tt0455276: '14137' }
  );
  const r = await A.imdbCoz(n, film('Kurtlar Vadisi Irak', 2006), { adlar: ['Valley of the Wolves: Iraq'], tmdb: '14137' }, null);
  assert.deepEqual({ id: r.id, kaynak: r.kaynak }, { id: 'tt0455276', kaynak: 'tmdb' });
  const ilk = n.istek.find((u) => /media-imdb/.test(u));
  assert.match(decodeURIComponent(ilk), /valley of the wolves: iraq\.json$/, 'özgün ad önce aranır');
  // TMDB kimliği aramada görünmezse adayların kaydı sorulur
  const n2 = ag({ 'gizli film': { imdb: [IM('tt2000001', 'Hidden Movie', 2015), IM('tt2000002', 'Hidden Movie 2', 2015)] } }, { tt2000001: '777', tt2000002: '888' });
  const r2 = await A.imdbCoz(n2, film('Gizli Film', 2015), { tmdb: '888' }, null);
  assert.deepEqual({ id: r2.id, kaynak: r2.kaynak }, { id: 'tt2000002', kaynak: 'tmdb' });
  assert.ok(n2.istek.some((u) => /\/meta\/movie\/tt2000002\.json/.test(u)));
});

test('imdbCoz: dizi — IMDb ve Cinemeta aynı yapımı gösterirse seçilir; film/dizi türü karışmaz', async () => {
  const n = ag({
    'kurtlar vadisi': {
      imdb: [IM('tt0421384', 'Kurtlar Vadisi', 2003, 'tvSeries'), IM('tt0455276', 'Valley of the Wolves: Iraq', 2006, 'movie'), IM('tt1111999', 'Kurtlar Vadisi: Pusu', 2007, 'tvSeries')],
      cin: [{ id: 'tt0421384', name: 'Kurtlar Vadisi', year: '2003–2005' }],
    },
  });
  const r = await A.imdbCoz(n, dizi('TR | Kurtlar Vadisi'), {}, null);
  assert.deepEqual({ id: r.id, kaynak: r.kaynak }, { id: 'tt0421384', kaynak: 'tam-ad' });
  const n2 = ag({ 'yüzüklerin efendisi': { imdb: [IM('tt7631058', 'The Lord of the Rings: The Rings of Power', 2022, 'tvSeries'), IM('tt0120737', 'The Lord of the Rings: The Fellowship of the Ring', 2001), IM('tt0167261', 'The Lord of the Rings: The Two Towers', 2002)] } });
  const f = await A.imdbCoz(n2, film('Yüzüklerin Efendisi', 2002), {}, null);
  assert.deepEqual({ id: f.id, kaynak: f.kaynak }, { id: 'tt0167261', kaynak: 'yil' }, 'dizi sonucu atlanır, yıl iki filmden doğrusunu seçer');
});

test('imdbCoz: IMDb ilk sonucu Cinemeta ile aynıysa seçilir; belirsizse yıl uyanlar önde aday listesi döner ve seçim kalıcıdır', async () => {
  const n = ag({ 'çapraz film': { imdb: [IM('tt3000001', 'Cross Movie', 0), IM('tt3000002', 'Other Cross', 0)], cin: [{ id: 'tt3000001', name: 'Cross Movie', year: '2012' }] } });
  const r = await A.imdbCoz(n, film('Çapraz Film'), {}, null);
  assert.deepEqual({ id: r.id, kaynak: r.kaynak }, { id: 'tt3000001', kaynak: 'capraz' });

  const n2 = ag({
    'belirsiz': { imdb: [IM('tt4000001', 'Foo', 1980), IM('tt4000002', 'Bar', 2016), IM('tt4000003', 'Baz', 2016), IM('tt4000004', 'Qux', 2001, 'tvSeries')] },
  });
  const depo = {};
  const kalici = A.kaliciHafiza(() => depo.m, (m) => (depo.m = m));
  const v = film('Belirsiz', 2016);
  const a = await A.imdbCoz(n2, v, {}, kalici);
  assert.equal(a.id, '');
  assert.deepEqual(a.liste.map((x) => x.id), ['tt4000002', 'tt4000003', 'tt4000001'], 'yılı uyanlar önde; dizi (tür uymaz) listede yok');
  assert.deepEqual(a.adlar, ['Belirsiz']);
  assert.equal(a.yil, 2016);
  assert.equal(depo.m, undefined, 'belirsiz sonuç hafızaya yazılmaz');
  A.imdbHatirla(v, {}, 'tt4000003', kalici);
  const b = await A.imdbCoz(ag({}), v, {}, kalici);
  assert.deepEqual(b, { id: 'tt4000003', kaynak: 'kayit' }, 'seçim ağa gitmeden hatırlanır');
  // yeni oturum (aynı kalıcı hafıza): yine hatırlanır
  assert.equal(kalici.al('movie|belirsiz|2016'), 'tt4000003');
  // başka yapım seç: kayıtlı eşleşmeye bakmadan adaylar
  const c = await A.imdbAdaylari(n2, v, {});
  assert.equal(c.liste[0].id, 'tt4000002');
});

test('imdbCoz: bir kaynak çökse de diğeri sürer; ikisi de çökerse hata fırlatılır ve önbelleğe yazılmaz', async () => {
  const n = ag({ 'tek kaynak film': { imdb: [IM('tt5000001', 'Single Source', 2011)], cin: [{ id: 'tt5000001', name: 'Single Source', year: '2011' }] } });
  n.imdbCokme = true;
  const r = await A.imdbCoz(n, film('Tek Kaynak Film', 2011), {}, null);
  assert.equal(r.id, '', 'yalnız Cinemeta: kesin eşleşme yok, aday verir');
  assert.equal(r.liste[0].id, 'tt5000001');
  const m = ag({});
  m.cokme = true;
  await assert.rejects(() => A.imdbCoz(m, film('Çöken Film', 2011), {}, null), /Zaman aşımı/);
  m.cokme = false;
  const s = await A.imdbCoz(m, film('Çöken Film', 2011), {}, null);
  assert.deepEqual(s.liste, [], 'hata önbelleğe yazılmadı; bulunamayan boş liste');
});

test('imdbCoz: otomatik eşleşme yalnız oturumda önbelleklenir ve kalıcı yazılmaz; sağlayıcı kimliği onun önüne, kullanıcı seçimi ikisinin önüne geçer', async () => {
  const n = ag({ 'öncelik filmi': { imdb: [IM('tt6000001', 'Priority Movie', 2014)], cin: [{ id: 'tt6000001', name: 'Priority Movie', year: '2014' }] } });
  const depo = {};
  const kalici = A.kaliciHafiza(() => depo.m, (m) => (depo.m = m));
  const v = film('Öncelik Filmi', 2014);
  assert.equal((await A.imdbCoz(n, v, {}, kalici)).id, 'tt6000001');
  assert.equal(depo.m, undefined, 'otomatik eşleşme kalıcı hafızaya yazılmaz');
  const sayi = n.istek.length;
  assert.deepEqual(await A.imdbCoz(n, v, {}, kalici), { id: 'tt6000001', kaynak: 'onbellek' });
  assert.equal(n.istek.length, sayi, 'ikinci çağrı ağa gitmez');
  assert.deepEqual(await A.imdbCoz(n, v, { imdb: 'tt6000002' }, kalici), { id: 'tt6000002', kaynak: 'saglayici' }, 'sağlayıcı kimliği otomatik önbellekten güvenilir');
  A.imdbHatirla(v, {}, 'tt6000003', kalici);
  assert.deepEqual(await A.imdbCoz(n, v, { imdb: 'tt6000002' }, kalici), { id: 'tt6000003', kaynak: 'kayit' }, 'kullanıcı seçimi sağlayıcı kimliğini de geçersiz kılar');
  assert.equal(kalici.al('movie|oncelik filmi|2014'), 'tt6000003');
  const ad = await A.imdbAdi(ag({}, { tt6000009: '1' }), 'movie', 'tt6000009');
  assert.equal(ad, null, 'adı bilinmeyen kimlikte null');
});

test('kaliciHafiza: sınırı aşınca en eskiyi atar, aynı kaydı yeniden yazmaz', () => {
  let yazilan = 0;
  let m = null;
  const k = A.kaliciHafiza(() => m, (x) => ((m = JSON.parse(JSON.stringify(x))), yazilan++), 3);
  for (let i = 1; i <= 5; i++) k.koy('a' + i, 'tt000000' + i);
  assert.equal(k.al('a1'), '');
  assert.equal(k.al('a2'), '');
  assert.equal(k.al('a5'), 'tt0000005');
  assert.deepEqual(m.s, ['a3', 'a4', 'a5']);
  const once = yazilan;
  k.koy('a5', 'tt0000005');
  assert.equal(yazilan, once, 'değişmeyen kayıt yazılmaz');
  assert.equal(A.kaliciHafiza(() => 'bozuk', () => {}).al('x'), '', 'bozuk depo boş sayılır');
});

test('altyazı: altyaziListesi bölüm kimliğini tt…:sezon:bölüm biçiminde ister', async () => {
  const istek = [];
  const net = { json: async (u) => (istek.push(u), { subtitles: [{ url: 'https://s/1.srt', lang: 'tur' }] }) };
  const l = await A.altyaziListesi(net, { tur: 'series', sezon: 3, bolum: 7 }, 'tt0903747');
  assert.equal(istek[0], A.ALTYAZI_KAYNAK + '/subtitles/series/tt0903747:3:7.json');
  assert.equal(l[0].ad, 'Türkçe');
  await A.altyaziListesi(net, { tur: 'movie', sezon: 0, bolum: 0 }, 'tt0111161');
  assert.equal(istek[1], A.ALTYAZI_KAYNAK + '/subtitles/movie/tt0111161.json');
});
