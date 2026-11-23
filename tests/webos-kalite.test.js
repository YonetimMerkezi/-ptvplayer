// LG webOS: HLS ana listesinden en yüksek uygun kaliteyi seçme (saf mantık ve çözümleme).
import test from 'node:test';
import assert from 'node:assert/strict';
import { enYuksekVaryant, mutlakUrl, hlsMi, kaliteCoz, kaliteVazgec, kaliteTemizle } from '../webos/src/kalite.js';

const lst = (...s) => ['#EXTM3U'].concat(s).join('\n');

test('hlsMi: yalnız .m3u8 adreslerini tanır', () => {
  assert.equal(hlsMi('http://a/b/1.m3u8'), true);
  assert.equal(hlsMi('http://a/b/1.M3U8?token=x'), true);
  assert.equal(hlsMi('http://a/b/1.ts'), false);
  assert.equal(hlsMi('http://a/b/film.mkv'), false);
  assert.equal(hlsMi(''), false);
});

test('mutlakUrl: mutlak, // ile başlayan, / ile başlayan ve göreli adresler', () => {
  assert.equal(mutlakUrl('http://h:80/a/b/c.m3u8?x=1', 'http://z/y.m3u8'), 'http://z/y.m3u8');
  assert.equal(mutlakUrl('https://h/a/b/c.m3u8?x=1#f', '//cdn/y.m3u8'), 'https://cdn/y.m3u8');
  assert.equal(mutlakUrl('http://h:80/a/b/c.m3u8', '/k/y.m3u8'), 'http://h:80/k/y.m3u8');
  assert.equal(mutlakUrl('http://h:80/a/b/c.m3u8?t=1', 'v2/i.m3u8?q=2'), 'http://h:80/a/b/v2/i.m3u8?q=2');
  assert.equal(mutlakUrl('http://h', 'v.m3u8'), 'http://h/v.m3u8');
  assert.equal(mutlakUrl('', 'v.m3u8'), '', 'taban yoksa göreli adres çözülemez');
});

test('enYuksekVaryant: en yüksek BANDWIDTH seçilir, sıra önemsiz; çıktı mutlak adres', () => {
  const m = lst(
    '#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720',
    'a.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080',
    'b.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=640x360',
    'c.m3u8',
  );
  const v = enYuksekVaryant(m, 'http://h/live/x.m3u8');
  assert.equal(v.url, 'http://h/live/b.m3u8');
  assert.equal(v.h, 1080);
  assert.equal(v.bw, 6000000);
});

test('enYuksekVaryant: HEVC/AV1 ve 1080p üstü elenir; yalnız onlar varsa null', () => {
  const m = lst(
    '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"',
    'd.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=9000000,RESOLUTION=1920x1080,CODECS="hvc1.1.6.L120,mp4a.40.2"',
    'h.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=20000000,RESOLUTION=3840x2160,CODECS="avc1.640033,mp4a.40.2"',
    'u.m3u8',
  );
  assert.equal(enYuksekVaryant(m, 'http://h/x.m3u8').url, 'http://h/d.m3u8');
  const yalniz = lst('#EXT-X-STREAM-INF:BANDWIDTH=9000000,CODECS="hev1.1"', 'h.m3u8', '#EXT-X-STREAM-INF:BANDWIDTH=7000000,CODECS="av01.0.08M.08"', 'a.m3u8');
  assert.equal(enYuksekVaryant(yalniz, 'http://h/x.m3u8'), null);
});

test('enYuksekVaryant: medya listesi, tek sürüm, ayrı ses listesi ve bozuk metin için null', () => {
  assert.equal(enYuksekVaryant(lst('#EXTINF:6,', 'seg1.ts'), 'http://h/x.m3u8'), null, 'medya listesi');
  assert.equal(enYuksekVaryant(lst('#EXT-X-STREAM-INF:BANDWIDTH=1', 'a.m3u8'), 'http://h/x.m3u8'), null, 'tek sürüm');
  const sesli = lst('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="tr",URI="ses.m3u8"', '#EXT-X-STREAM-INF:BANDWIDTH=1,AUDIO="a"', 'a.m3u8', '#EXT-X-STREAM-INF:BANDWIDTH=2,AUDIO="a"', 'b.m3u8');
  assert.equal(enYuksekVaryant(sesli, 'http://h/x.m3u8'), null, 'ses ayrı listedeyse sürümü tek başına vermek sessiz bırakır');
  const gomulu = lst('#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",NAME="en",INSTREAM-ID="CC1"', '#EXT-X-STREAM-INF:BANDWIDTH=1', 'a.m3u8', '#EXT-X-STREAM-INF:BANDWIDTH=2', 'b.m3u8');
  assert.equal(enYuksekVaryant(gomulu, 'http://h/x.m3u8').url, 'http://h/b.m3u8', 'gömülü altyazı engel değil');
  assert.equal(enYuksekVaryant('<html>hata</html>', 'http://h/x.m3u8'), null);
  assert.equal(enYuksekVaryant('', 'http://h/x.m3u8'), null);
  assert.equal(enYuksekVaryant(null, 'http://h/x.m3u8'), null);
});

test('enYuksekVaryant: I-FRAME listeleri sayılmaz, CRLF ve yorum satırları güvenle geçilir, BANDWIDTH yoksa en sona düşer', () => {
  const m = '#EXTM3U\r\n#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=99999999,URI="iframe.m3u8"\r\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\r\n# yorum\r\n\r\nlo.m3u8\r\n#EXT-X-STREAM-INF:BANDWIDTH=3000000\r\nhi.m3u8\r\n#EXT-X-STREAM-INF:RESOLUTION=640x360\r\nbilinmeyen.m3u8\r\n';
  assert.equal(enYuksekVaryant(m, 'http://h/p/x.m3u8').url, 'http://h/p/hi.m3u8');
});

test('enYuksekVaryant: mutlak sürüm adresleri tabansız da kabul edilir, göreli olanlar edilmez', () => {
  const mutlak = lst('#EXT-X-STREAM-INF:BANDWIDTH=1', 'http://c/a.m3u8', '#EXT-X-STREAM-INF:BANDWIDTH=2', 'http://c/b.m3u8');
  assert.equal(enYuksekVaryant(mutlak, '').url, 'http://c/b.m3u8');
  const goreli = lst('#EXT-X-STREAM-INF:BANDWIDTH=1', 'a.m3u8', '#EXT-X-STREAM-INF:BANDWIDTH=2', 'b.m3u8');
  assert.equal(enYuksekVaryant(goreli, ''), null);
});

const ANA = lst('#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=640x360', 'lo.m3u8', '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080', 'hi.m3u8');

test('kaliteCoz: yönlendirme sonrası adrese göre çözer, sonucu önbelleğe alır', async () => {
  kaliteTemizle();
  let n = 0;
  const net = {
    get: async (url, opt) => {
      n++;
      opt.sonUrl('http://token.cdn/abc/live.m3u8'); // yönlendirme sonrası adres
      return ANA;
    },
  };
  const v = await kaliteCoz(net, 'http://s/live/1.m3u8');
  assert.equal(v.url, 'http://token.cdn/abc/hi.m3u8');
  const v2 = await kaliteCoz(net, 'http://s/live/1.m3u8');
  assert.equal(v2.url, v.url);
  assert.equal(n, 1, 'ikinci çağrı önbellekten');
});

test('kaliteCoz: son adres bilinmiyorsa (TV servisi) göreli liste güvenli değildir → null', async () => {
  kaliteTemizle();
  const net = { get: async () => ANA }; // sonUrl hiç çağrılmaz
  assert.equal(await kaliteCoz(net, 'http://s/live/2.m3u8'), null);
});

test('kaliteCoz: hata/zaman aşımı null döner ve bir süre yeniden denenmez; kaliteVazgec seçimi bırakır', async () => {
  kaliteTemizle();
  let n = 0;
  const bozuk = {
    get: async () => {
      n++;
      throw new Error('Zaman aşımı');
    },
  };
  assert.equal(await kaliteCoz(bozuk, 'http://s/live/3.m3u8'), null);
  assert.equal(await kaliteCoz(bozuk, 'http://s/live/3.m3u8'), null);
  assert.equal(n, 1, 'başarısız sonuç da kısa süre önbellekte');
  const iyi = {
    get: async (u, opt) => {
      opt.sonUrl(u);
      return ANA;
    },
  };
  assert.equal((await kaliteCoz(iyi, 'http://s/live/4.m3u8')).url, 'http://s/live/hi.m3u8');
  kaliteVazgec('http://s/live/4.m3u8');
  assert.equal(await kaliteCoz(iyi, 'http://s/live/4.m3u8'), null, 'vazgeçilen adres için seçim yapılmaz');
});

test('kaliteCoz: istekte kısa zaman aşımı istenir', async () => {
  kaliteTemizle();
  let alinan = 0;
  const net = {
    get: async (u, opt) => {
      alinan = opt.timeoutMs;
      return '';
    },
  };
  await kaliteCoz(net, 'http://s/live/5.m3u8');
  assert.ok(alinan > 0 && alinan <= 3000, 'başlangıcı geciktirmemek için en çok birkaç saniye');
});
