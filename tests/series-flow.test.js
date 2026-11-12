import test from 'node:test';
import assert from 'node:assert/strict';
import { parse1001, streamOf, timeMap, fillTimes, loadSeriesWeek, dayPageUrl, weekPageUrl, dayIndex, WEEKDAYS } from '../www/js/series-flow.js';

const B = 'https://1001dizi.net';

// Kart biçimi A: görsel bağlantısı + başlık bağlantısı ayrı, "Kanal - SS:DD", "N. Bölüm", durum etiketi bağlantı dışında
const cardA = (slug, title, ch, time, ep, status) =>
  `<div class="card"><a href="${B}/dizi-${slug}"><img src="/i/${slug}.jpg" alt="${title}, ${ch}"></a><a href="${B}/dizi-${slug}"><strong>${title}</strong></a>${time ? `<p>${ch} - ${time}</p>` : `<p>${ch}</p>`}<p>${ep}</p>${status ? `<span><b>${status}</b></span>` : ''}</div>`;

const MENU = `<ul class="menu"><li><a href="/bugunun-dizileri">BUGÜNÜN DİZİLERİ</a></li><li><a href="/haftalik-program">HAFTALIK PROGRAMLAR</a></li><li><a href="/dizi-populer">Popüler</a></li></ul>`;

const WEEK = `<html><head><script>var a = "<a href='/dizi-x'>x</a>";</script></head><body>${MENU}
${cardA('alti-usti-istanbul', 'Altı Üstü İstanbul', 'atv', '20:00', '20. Bölüm', 'Yeni Bölüm')}
${cardA('anne-yarisi', 'Anne Yarısı', 'NOW', '20:00', '7. Bölüm', 'Yeni Bölüm')}
${cardA('gunesin-dogdugu-yer', 'Güneşin Doğduğu Yer', 'atv', '20:00', '9. Bölüm', 'BU HAFTA YAYINLANMIYOR')}
${cardA('haysiyet', 'Haysiyet', 'Kanal D', '20:30', '9. Bölüm', 'Yeni Bölüm')}
<footer><a href="/hakkimizda">Hakkımızda</a> <p>© 1001dizi</p></footer></body></html>`;

test('streamOf: bağlantı, görsel alt metni ve metin olayları; betik ve yorum atılır', () => {
  const s = streamOf('<!-- gizli --><script>var x="<a href=\'/dizi-q\'>"</script><a href="/dizi-a"><img alt="A, atv"><b>A &amp; B</b></a> son');
  assert.deepEqual(s, [{ k: 'a', href: '/dizi-a' }, { k: 'alt', t: 'A, atv' }, { k: 't', t: 'A & B' }, { k: '/a' }, { k: 't', t: 'son' }]);
});

test('parse1001: kart biçimi A — başlık, kanal, saat, bölüm, durum; menü ve altbilgi atılır', () => {
  const r = parse1001(WEEK, B);
  assert.equal(r.rows.length, 4);
  const a = r.rows.find((x) => x.slug === 'alti-usti-istanbul');
  assert.deepEqual({ ...a }, { slug: 'alti-usti-istanbul', title: 'Altı Üstü İstanbul', channel: 'atv', time: '20:00', ep: '20. Bölüm', status: 'Yeni Bölüm', off: false, url: `${B}/dizi-alti-usti-istanbul` });
  const off = r.rows.find((x) => x.slug === 'gunesin-dogdugu-yer');
  assert.equal(off.status, 'Bu hafta yayınlanmıyor');
  assert.equal(off.off, true);
  assert.deepEqual(r.rows.map((x) => x.time), ['20:00', '20:00', '20:00', '20:30'], 'saate göre sıralı');
  assert.ok(r.diag.cards >= 4 && r.diag.anchors >= 8 && r.diag.bytes > 100);
});

test('parse1001: kart biçimi B — tüm kart tek bağlantı içinde, göreli adres, saat önce yazılmış', () => {
  const html = `<a href="/dizi-kizilcik-serbeti"><img data-src="x" alt="Kızılcık Şerbeti, Show TV"><h3>Kızılcık Şerbeti</h3><span>20:00 - Show TV</span><span>146. Bölüm</span><em>Yeni Bölüm</em></a>`;
  const r = parse1001(html, B);
  assert.equal(r.rows.length, 1);
  assert.deepEqual({ t: r.rows[0].title, c: r.rows[0].channel, s: r.rows[0].time, e: r.rows[0].ep, u: r.rows[0].url }, { t: 'Kızılcık Şerbeti', c: 'Show TV', s: '20:00', e: '146. Bölüm', u: `${B}/dizi-kizilcik-serbeti` });
});

test('parse1001: saatsiz gün sayfası, bölüm aralığı ve sezon etiketi; kanal görsel alt metninden gelir', () => {
  const html = `<a href="${B}/dizi-bir-baskadir"><img alt="Bir Başkadır, Netflix"></a><a href="${B}/dizi-bir-baskadir"><b>Bir Başkadır</b></a><p>(1-4)</p><p>YENİ SEZON</p>`;
  const r = parse1001(html, B);
  assert.equal(r.rows.length, 1);
  assert.deepEqual({ c: r.rows[0].channel, t: r.rows[0].time, e: r.rows[0].ep, s: r.rows[0].status }, { c: 'Netflix', t: '', e: '1-4. Bölüm', s: 'Yeni sezon' });
});

test('parse1001: kanıtı olmayan dizi bağlantıları (kenar çubuğu) ve yinelenen kartlar sayılmaz; boş sayfa hata atmaz', () => {
  const html = `<a href="/dizi-populer"><b>Popüler Dizi</b></a><a href="/dizi-baska"><b>Başka</b></a>${cardA('x', 'X Dizisi', 'atv', '21:00', '3. Bölüm', '')}${cardA('x', 'X Dizisi', 'atv', '21:00', '3. Bölüm', '')}`;
  const r = parse1001(html, B);
  assert.deepEqual(r.rows.map((x) => x.slug), ['x']);
  assert.deepEqual(parse1001('', B).rows, []);
  assert.deepEqual(parse1001(null, B).rows, []);
  assert.equal(parse1001('<html>hiç dizi yok</html>', B).diag.cards, 0);
});

test('parse1001: art arda gelen aynı dizi bağlantıları tek karttır (ilk kanal/saat alınır)', () => {
  const html = cardA('s', 'S Dizisi', 'Star TV', '20:00', '1. Bölüm', '') + cardA('s', 'S Dizisi', 'Fox', '23:00', '1. Bölüm', 'Tekrar');
  const r = parse1001(html, B);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].channel, 'Star TV');
});

test('timeMap/fillTimes: haftalık sayfadaki saat saatsiz gün satırına eklenir', () => {
  const map = timeMap(parse1001(WEEK, B).rows);
  const day = parse1001(cardA('haysiyet', 'Haysiyet', 'Kanal D', '', '9. Bölüm', 'Yeni Bölüm') + cardA('bilinmeyen', 'Bilinmeyen', 'atv', '', '1. Bölüm', 'Yeni Bölüm'), B).rows;
  const filled = fillTimes(day, map);
  assert.equal(filled.find((x) => x.slug === 'haysiyet').time, '20:30');
  assert.equal(filled.find((x) => x.slug === 'bilinmeyen').time, '');
  assert.equal(filled[filled.length - 1].slug, 'bilinmeyen', 'saati olmayanlar sona');
});

test('adresler ve gün sırası', () => {
  assert.equal(dayPageUrl(3), 'https://1001dizi.net/persembe-gunu-dizileri');
  assert.equal(weekPageUrl(), 'https://1001dizi.net/haftalik-dizi-programi');
  assert.equal(WEEKDAYS.length, 7);
  assert.equal(dayIndex(new Date(2026, 10, 12, 12).getTime()), 3, '12 Kasım 2026 Perşembe');
  assert.equal(dayIndex(new Date(2026, 10, 15, 12).getTime()), 6, 'Pazar');
  assert.equal(dayIndex(new Date(2026, 10, 9, 0, 5).getTime()), 0, 'Pazartesi');
});

const fakeNet = (pages) => ({
  calls: [],
  async text(url) {
    this.calls.push(url);
    const p = pages[url];
    if (p instanceof Error) throw p;
    if (p === undefined) throw new Error('HTTP 404');
    return p;
  },
});

test('loadSeriesWeek: haftalık sayfa saat verir, gün sayfaları güne ayırır; bir gün alınamazsa diğerleri gelir', async () => {
  const pages = {
    [weekPageUrl(B)]: WEEK,
    [dayPageUrl(0, B)]: cardA('anne-yarisi', 'Anne Yarısı', 'NOW', '', '7. Bölüm', 'Yeni Bölüm') + cardA('alti-usti-istanbul', 'Altı Üstü İstanbul', 'atv', '', '20. Bölüm', 'Yeni Bölüm'),
    [dayPageUrl(3, B)]: cardA('haysiyet', 'Haysiyet', 'Kanal D', '', '9. Bölüm', 'Yeni Bölüm'),
    [dayPageUrl(4, B)]: new Error('HTTP 503'),
  };
  const net = fakeNet(pages);
  const r = await loadSeriesWeek({ net, base: B });
  assert.equal(r.via, '1001dizi');
  assert.deepEqual(r.days.map((d) => d.length), [2, 0, 0, 1, 0, 0, 0]);
  assert.equal(r.days[3][0].time, '20:30');
  assert.deepEqual(r.days[0].map((x) => x.title), ['Altı Üstü İstanbul', 'Anne Yarısı']);
  assert.ok(r.failed.includes(4) && r.failed.includes(1), 'alınamayan günler bildirilir: ' + r.failed);
  assert.equal(net.calls.length, 8, 'başarılı 1001dizi akışında yalnız sekiz yayın sayfası istenir');
  assert.equal(net.calls.length, 8, '1 haftalık + 7 gün');
});

test('loadSeriesWeek: ücretsiz EPG bugünün ve yarının kayıtlarını tamamlar; aynı programı çoğaltmaz', async () => {
  const now = new Date('2026-11-12T18:00:00+03:00').getTime();
  const pages = Object.fromEntries([weekPageUrl(B), ...WEEKDAYS.map((_, i) => dayPageUrl(i, B))].map((url) => [url, '<html>boş</html>']));
  pages[weekPageUrl(B)] = WEEK;
  pages[dayPageUrl(3, B)] = cardA('haysiyet', 'Haysiyet', 'Kanal D', '', '9. Bölüm', 'Yeni Bölüm');
  const same = new Date('2026-11-12T20:30:00+03:00').getTime();
  const extra = new Date('2026-11-13T21:00:00+03:00').getTime();
  const freeLoader = async () => ({
    v: 1, at: now, from: now - 864e5, to: now + 2 * 864e5, tz: 'Europe/Istanbul',
    ch: { kanald: { n: 'Kanal D', p: [
      [same, same + 90 * 60000, 'Haysiyet', '', 'Dizi', '9. Bölüm', 'Yeni Bölüm'],
      [extra, extra + 90 * 60000, 'EPG Ek Dizisi', '', 'Dizi', '1. Bölüm', 'Yeni Bölüm'],
      [same + 60000, same + 90 * 60000, 'Canlı Futbol Maçı', '', 'Spor', '', ''],
    ] } },
  });
  const r = await loadSeriesWeek({ net: fakeNet(pages), base: B, nowMs: now, freeLoader });
  assert.equal(r.via, '1001dizi + ücretsiz EPG');
  assert.equal(r.days[3].length, 1, 'Haysiyet EPG ile ikinci kez eklenmedi');
  assert.equal(r.days[3][0].startAt, same, 'mevcut satır gerçek EPG başlangıç zamanıyla zenginleşti');
  assert.equal(r.days[4].length, 1, 'yarınki eksik dizi EPG ile tamamlandı');
  assert.equal(r.days[4][0].title, 'EPG Ek Dizisi');
  assert.equal(r.epgAdded, 1);
});

test('loadSeriesWeek: 1001dizi boşsa ücretsiz EPG bugün ve yarın için yedek olur; spor kayıtları alınmaz', async () => {
  const now = new Date('2026-11-12T18:00:00+03:00').getTime();
  const pages = Object.fromEntries([weekPageUrl(B), ...WEEKDAYS.map((_, i) => dayPageUrl(i, B))].map((url) => [url, '<html>boş</html>']));
  const net = fakeNet(pages);
  const todayStart = new Date('2026-11-12T20:00:00+03:00').getTime();
  const tomorrowStart = new Date('2026-11-13T21:15:00+03:00').getTime();
  const freeLoader = async () => ({
    v: 1, at: now, from: now - 864e5, to: now + 2 * 864e5, tz: 'Europe/Istanbul',
    ch: {
      trt1: { n: 'TRT 1', p: [
        [todayStart, todayStart + 7200e3, 'Mehmed: Fetihler Sultanı', '', 'Dizi', '1. Sezon 5. Bölüm', 'Yeni Bölüm'],
        [tomorrowStart, tomorrowStart + 5400e3, 'Seksenler', '', 'Dizi', '', 'Tekrar'],
        [todayStart + 3600e3, todayStart + 7200e3, 'Canlı Futbol Maçı', '', 'Spor', '', ''],
      ] },
    },
  });
  const r = await loadSeriesWeek({ net, base: B, nowMs: now, freeLoader });
  assert.equal(r.via, 'ücretsiz EPG');
  assert.equal(r.coverageDays, 2);
  assert.equal(r.limitedDays, true);
  assert.equal(r.days[3].length, 1);
  assert.equal(r.days[4].length, 1);
  assert.equal(r.days[3][0].title, 'Mehmed: Fetihler Sultanı');
  assert.equal(r.days[3][0].time, '20:00');
  assert.equal(r.days[3][0].ep, '1. Sezon 5. Bölüm');
  assert.equal(r.days[3][0].endAt, todayStart + 7200e3);
  assert.equal(r.days[4][0].time, '21:15');
  assert.match(r.note, /bugün ve yarın için 2 dizi kaydı/);
  assert.equal(net.calls.length, 8, 'yedek EPG, 1001dizi sayfalarının ardından kullanılır');
});

test('loadSeriesWeek: hiçbir kaynak satır vermezse nedenleri ayrıntıya yazılır', async () => {
  const net = fakeNet({ [weekPageUrl(B)]: new Error('HTTP 403'), 'https://s.test/x': '<html></html>' });
  await assert.rejects(
    () => loadSeriesWeek({ net, base: B, sinemalarUrl: 'https://s.test/x' }),
    (e) => e.message === 'Dizi akışı alınamadı.' && /haftalık: HTTP 403/.test(e.detail) && /ücretsiz EPG: dizi kategorisinde güncel kayıt bulunamadı/.test(e.detail),
  );
});

test('parse1001: kartın kendi görselindeki kanal, metne kayan komşu kanaldan üstündür (Daha 17: Kanal D, TRT 1 değil)', () => {
  // Kart başlığından sonra gelen "TRT 1 - 20:00" komşu karta aittir ama bu kartın metin akışına düşmüş; görsel alt metni "Daha 17, Kanal D"
  const html =
    `<a href="${B}/dizi-daha-17"><img alt="Daha 17, Kanal D"></a><a href="${B}/dizi-daha-17"><b>Daha 17</b></a><span>TRT 1 - 20:00</span><span>8. Bölüm</span>` +
    `<a href="${B}/dizi-tuzlu-kahve"><img alt="Tuzlu Kahve, TRT 1"></a><a href="${B}/dizi-tuzlu-kahve"><b>Tuzlu Kahve</b></a><span>TRT 1 - 20:00</span><span>5. Bölüm</span>`;
  const r = parse1001(html, B);
  assert.deepEqual(r.rows.map((x) => [x.title, x.channel]), [['Daha 17', 'Kanal D'], ['Tuzlu Kahve', 'TRT 1']]);
});

test('parse1001: alt metin kanalı metindekini içeriyorsa metin korunur; afiş açıklaması kanal sayılmaz', () => {
  const a = parse1001(`<a href="${B}/dizi-x"><img alt="X, Kanal D HD"></a><a href="${B}/dizi-x"><b>X</b></a><span>Kanal D - 21:00</span><span>3. Bölüm</span>`, B);
  assert.equal(a.rows[0].channel, 'Kanal D', 'Kanal D, “Kanal D HD” içinde geçtiği için metin korunur');
  const b = parse1001(`<a href="${B}/dizi-y"><img alt="Y, dizi afişi"></a><a href="${B}/dizi-y"><b>Y</b></a><span>ATV - 20:00</span><span>3. Bölüm</span>`, B);
  assert.equal(b.rows[0].channel, 'ATV');
});

test('parse1001: teşhis ham kartları içerir (metin ve görsel alt metni)', () => {
  const r = parse1001(cardA('s', 'S Dizisi', 'Star TV', '20:00', '1. Bölüm', ''), B);
  assert.equal(r.diag.raw.length, 1);
  assert.match(r.diag.raw[0], /^s: .*Star TV - 20:00.*\[alt: S Dizisi, Star TV\]$/);
});
