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

test('altyazı: imdbSec ad birebir ve yıl ±1 olmalı; imdbBul özgün adı dener, sonucu önbellekler, ağ hatasını önbelleğe yazmaz', async () => {
  assert.equal(A.imdbSec([{ id: 'tt1', name: 'Dune', year: '2021' }, { id: 'tt2', name: 'Dune', year: '1984' }], 'dune', 1984), 'tt2');
  assert.equal(A.imdbSec([{ id: 'tt1', name: 'Dune', year: '2021' }], 'Dune', 1984), '', 'yıl uymuyorsa yanlış film seçilmez');
  assert.equal(A.imdbSec([{ id: 'tt1', name: 'Dune: Part Two', year: '2024' }], 'Dune', 2024), '', 'ad birebir değilse seçilmez');
  assert.equal(A.imdbSec([{ id: 'tt3', name: 'The.Matrix.1999.1080p' }], 'The Matrix', 1999), 'tt3', 'IPTV biçimindeki noktalı ad ve kalite etiketleri temizlenir');
  assert.equal(A.imdbSec([{ id: 'tt4', name: 'The Matrix Resurrections', year: '2021' }], 'The Matrix', 2021), '', 'kısmi ad yanlış yapımla eşleşmez');
  assert.equal(A.imdbSec([{ id: 'tt5', name: 'The Matrix', year: '1999' }, { id: 'tt6', name: 'The Matrix', year: '2022' }], 'The Matrix', 1999), 'tt5', 'aynı adlı yapımlarda yıl doğru kaydı seçer');
  assert.equal(A.imdbSec([{ id: 'tt1', name: 'Şu İş', year: '2000' }], 'su is', 0), 'tt1', 'aksan ve büyük/küçük harf yok sayılır');
  assert.equal(A.imdbSec([{ id: 'x', name: 'A' }], 'A', 0), '', 'geçersiz kimlik');

  const istek = [];
  let bozuk = false;
  const net = {
    json: async (url) => {
      istek.push(url);
      if (bozuk) throw new Error('Zaman aşımı');
      if (/search=Kurtlar%20Vadisi\.json/.test(url)) return { metas: [] };
      if (/search=Valley%20of%20the%20Wolves\.json/.test(url)) return { metas: [{ id: 'tt0455276', name: 'Valley of the Wolves', year: '2003' }] };
      return { metas: [] };
    },
  };
  const v = { tur: 'series', ad: 'TR | Kurtlar Vadisi', yil: 0, sezon: 1, bolum: 1 };
  assert.equal(await A.imdbBul(net, v, ['Valley of the Wolves']), 'tt0455276');
  assert.equal(istek.length, 2, 'önce katalog adı, sonra özgün ad');
  assert.equal(await A.imdbBul(net, v, ['Valley of the Wolves']), 'tt0455276');
  assert.equal(istek.length, 2, 'ikinci çağrı önbellekten');
  bozuk = true;
  await assert.rejects(() => A.imdbBul(net, { tur: 'movie', ad: 'Başka Film', yil: 2001 }, []), /Zaman aşımı/);
  bozuk = false;
  assert.equal(await A.imdbBul(net, { tur: 'movie', ad: 'Başka Film', yil: 2001 }, []), '', 'hata önbelleğe yazılmadı; bulunamayan "" döner');
});

test('altyazı: imdbAdaylari yılı uyanları öne alır, yinelenenleri ve geçersiz kimlikleri eler; imdbHatirla seçimi saklar', async () => {
  const istek = [];
  const net = {
    json: async (url) => {
      istek.push(url);
      if (/search=Esaretin%20Bedeli\.json/.test(url)) {
        return { metas: [{ id: 'tt0293927', name: 'Shawshank: The Redeeming Feature', releaseInfo: '2001' }, { id: 'tt0111161', name: 'The Shawshank Redemption', releaseInfo: '1994' }, { id: 'tt0111161', name: 'kopya', releaseInfo: '1994' }, { id: 'x', name: 'geçersiz' }] };
      }
      return { metas: [] };
    },
  };
  const v = { tur: 'movie', ad: 'TR | Esaretin Bedeli (1994)', yil: 1994, sezon: 0, bolum: 0 };
  assert.equal(await A.imdbBul(net, v, []), '', 'ad birebir tutmaz');
  const a = await A.imdbAdaylari(net, v, []);
  assert.deepEqual(a.liste.map((x) => x.id), ['tt0111161', 'tt0293927']);
  assert.equal(a.liste[0].ad, 'The Shawshank Redemption');
  assert.equal(a.liste[0].yil, 1994);
  assert.deepEqual(a.adlar, ['Esaretin Bedeli']);
  assert.equal(a.yil, 1994);
  assert.equal(istek.length, 1, 'arama sonucu önbellekten kullanılır');
  A.imdbHatirla(v, [], 'tt0111161');
  assert.equal(await A.imdbBul(net, v, []), 'tt0111161', 'seçilen yapım hatırlanır');
  const bos = await A.imdbAdaylari(net, { tur: 'series', ad: 'Hiç Yok', yil: 0, sezon: 1, bolum: 1 }, []);
  assert.deepEqual(bos.liste, []);
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
