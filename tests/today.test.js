import test from 'node:test';
import assert from 'node:assert/strict';
import { kindOf, channelKind, dayStart, todayRows, normalizeChannels, MAX_ROWS } from '../www/js/today.js';
import { XmltvParser } from '../www/js/epg.js';
import { readFileSync } from 'node:fs';

test('channelKind: sinema ve beIN kanalları kanal adından tanınır', () => {
  for (const n of ['Sinema TV', 'Sinema 2', 'Cinema TV', 'beIN Movies', 'beIN Movies Stars', 'MovieSmart Action', 'FilmBox Premium', 'Cine 1']) assert.equal(channelKind(n), 'film', n);
  for (const n of ['beIN Series', 'beIN Series 1']) assert.equal(channelKind(n), 'dizi', n);
  assert.equal(channelKind('A Para'), 'ignore');
  assert.equal(channelKind('FB TV HD'), 'spor');
  assert.equal(channelKind('TR: FB TV HD'), 'spor');
  assert.equal(channelKind('S Sport 2'), 'spor');
  assert.equal(channelKind('A Spor HEVC'), 'spor');
  assert.equal(channelKind('beIN Sports 2 Premium'), 'spor');
});


test('ülke öneki eklenmiş spor kanalları dizi türüne karışmaz', () => {
  for (const name of ['TR: SPORTS TV HD', 'TR: S SPORT 2 HD', 'TR: beIN SPORTS 2 Premium', 'TR: A SPOR HD']) {
    assert.equal(channelKind(name), 'spor', name);
  }
});

test('kindOf: rehber kategorisi önceliklidir (Türkçe/İngilizce)', () => {
  assert.equal(kindOf({ t: 'X', c: 'Dizi' }), 'dizi');
  assert.equal(kindOf({ t: 'X', c: 'Drama / Series' }), 'dizi');
  assert.equal(kindOf({ t: 'X', c: 'Sinema' }), 'film');
  assert.equal(kindOf({ t: 'X', c: 'Movie / Drama' }), 'film');
  assert.equal(kindOf({ t: 'Akşam Filmi', c: 'Drama', s: 1000, e: 1000 + 120 * 60000 }), 'film');
  assert.equal(kindOf({ t: 'Dizi 12. Bölüm', c: 'Drama', s: 1000, e: 1000 + 120 * 60000 }), 'dizi');
  assert.equal(kindOf({ t: 'Kısa Komedi', c: 'Comedy', s: 1000, e: 1000 + 45 * 60000 }), '');
  assert.equal(kindOf({ t: 'X', c: 'Spor / Futbol' }), 'spor');
  assert.equal(kindOf({ t: 'X', c: 'Sports' }), 'spor');
  assert.equal(kindOf({ t: 'X', c: 'Basketbol' }), 'spor');
  assert.equal(kindOf({ t: 'X', c: 'Belgesel' }), '');
  assert.equal(kindOf({ t: 'Spor Haberleri', c: 'Spor' }), '');
  assert.equal(kindOf({ t: 'Gün Sonu', c: 'Haber' }), '');
  // kategori varsa başlık kalıbı yok sayılır: kategori "Çocuk" olan "12. Bölüm" dizi sayılmaz
  assert.equal(kindOf({ t: 'Pepee 12. Bölüm', c: 'Çocuk' }), '');
});

test('kindOf: kategori yoksa yalnız belirgin başlık kalıpları', () => {
  assert.equal(kindOf({ t: 'Kurtuluş Yolu 45. Bölüm' }), 'dizi');
  assert.equal(kindOf({ t: 'Sessiz Ev S02E05' }), 'dizi');
  assert.equal(kindOf({ t: 'Film: Gece Yarısı' }), 'film');
  assert.equal(kindOf({ t: 'Süper Lig: Galatasaray - Fenerbahçe' }), 'spor');
  assert.equal(kindOf({ t: 'Şampiyonlar Ligi Maçı' }), 'spor');
  assert.equal(kindOf({ t: 'Spor Haberleri Maç Özeti Bülteni' }), '');
  assert.equal(kindOf({ t: 'Akşam Haberleri' }), '');
  assert.equal(kindOf({ t: 'Mac and Cheese Tarifi' }), '');
  assert.equal(kindOf({ t: 'Adsız Uzun Metraj', s: 1000, e: 1000 + 110 * 60000 }), '');
  assert.equal(kindOf({ t: 'Drama Filmi', c: 'Drama', s: 1000, e: 1000 + 110 * 60000 }), 'film');
  assert.equal(kindOf({ t: 'Taşacak Bu Deniz', c: 'Dizi', s: 1000, e: 1000 + 255 * 60000 }), 'dizi');
  assert.equal(kindOf({ t: 'Akşam Haberleri', s: 1000, e: 1000 + 90 * 60000 }), '');
  assert.equal(kindOf({ t: 'Spor Ajansı', s: 1000, e: 1000 + 120 * 60000 }), '');
  assert.equal(kindOf({ t: 'Kısa Stüdyo Programı', s: 1000, e: 1000 + 45 * 60000 }), '');
  assert.equal(kindOf({ t: 'Süper Lig Maçı', s: 1000, e: 1000 + 120 * 60000 }), 'spor');
  assert.equal(kindOf(null), '');
  assert.equal(kindOf({}), '');
});

const NOW = new Date(2026, 10, 12, 15, 0, 0).getTime();
const H = (h, m = 0) => new Date(2026, 10, 12, h, m, 0).getTime();
const prog = (sh, eh, t, c = '') => ({ s: H(sh), e: H(eh), t, d: '', c });

test('todayRows: bugünün programları tür ve zamana göre; biten gizli, şimdi/sonra durumlu', () => {
  const entries = [
    { id: 'a', p: prog(13, 15, 'Biten Dizi', 'Dizi') },
    { id: 'a', p: prog(15, 16, 'Şimdi Dizi', 'Dizi') },
    { id: 'b', p: prog(20, 22, 'Akşam Dizi', 'Dizi') },
    { id: 'b', p: prog(18, 20, 'Film X', 'Film') },
    { id: 'movie-channel', channel: 'Sinema TV', p: prog(16, 17, 'Özel Gösterim', '') },
    { id: 'series-channel', channel: 'beIN Series 1', p: prog(17, 18, 'Dizi yayını', 'Drama') },
    { id: 'sport-channel', channel: 'beIN Sports 2 Premium', p: prog(16, 18, 'Antalyaspor - Bodrum FK', 'Dizi') },
    { id: 'economy-channel', channel: 'A Para', p: prog(16, 18, 'Gün Ortası', 'Film') },
    { id: 'fb-channel', channel: 'FB TV HD', p: prog(17, 19, 'Hazırlık Maçları', 'Dizi') },
    { id: 'c', p: prog(17, 19, 'Maç', 'Spor') },
    { id: 'c', p: prog(19, 20, 'Belgesel', 'Belgesel') },
    { id: 'a', p: { s: H(26), e: H(27), t: 'Yarın dizi', d: '', c: 'Dizi' } },
  ];
  const r = todayRows({ entries, kind: 'dizi', now: NOW });
  assert.deepEqual(r.rows.map((x) => [x.p.t, x.state]), [['Şimdi Dizi', 'now'], ['Dizi yayını', 'next'], ['Akşam Dizi', 'next']]);
  assert.deepEqual(r.counts, { spor: 3, film: 2, dizi: 3 });
  const all = todayRows({ entries, kind: 'dizi', now: NOW, includePast: true });
  assert.deepEqual(all.rows.map((x) => [x.p.t, x.state]), [['Biten Dizi', 'past'], ['Şimdi Dizi', 'now'], ['Dizi yayını', 'next'], ['Akşam Dizi', 'next']]);
  const tomorrow = todayRows({ entries, kind: 'dizi', now: NOW, day: 1 });
  assert.deepEqual(tomorrow.rows.map((x) => x.p.t), ['Yarın dizi']);
  assert.deepEqual(todayRows({ entries, kind: 'film', now: NOW }).rows.map((x) => x.p.t), ['Özel Gösterim', 'Film X']);
  assert.equal(todayRows({ entries, kind: 'dizi', now: NOW }).rows.some((x) => x.id === 'series-channel'), true);
  assert.equal(todayRows({ entries, kind: 'dizi', now: NOW }).rows.some((x) => x.id === 'sport-channel' || x.id === 'fb-channel'), false);
  assert.equal(todayRows({ entries, kind: 'film', now: NOW }).rows.some((x) => x.id === 'sport-channel' || x.id === 'economy-channel'), false);
});

test('todayRows: aynı kanal+başlangıç tekrar etmez; üst sınır', () => {
  const p = prog(18, 19, 'Dizi', 'Dizi');
  const dup = todayRows({ entries: [{ id: 'a', p }, { id: 'a', p: { ...p } }, { id: 'b', p }], kind: 'dizi', now: NOW });
  assert.equal(dup.rows.length, 2);
  const many = Array.from({ length: MAX_ROWS + 20 }, (_, i) => ({ id: 'k' + i, p: prog(18, 19, 'Dizi', 'Dizi') }));
  const r = todayRows({ entries: many, kind: 'dizi', now: NOW });
  assert.equal(r.rows.length, MAX_ROWS);
  assert.equal(r.truncated, true);
});

test('dayStart ve kanal seçimi normalleştirme', () => {
  assert.equal(dayStart(NOW), H(0));
  assert.equal(dayStart(NOW, 1), new Date(2026, 10, 13).getTime());
  assert.deepEqual(normalizeChannels(['1', 2, '1']), ['1', '2']);
  assert.deepEqual(normalizeChannels('x'), []);
  assert.equal(normalizeChannels(Array.from({ length: 300 }, (_, i) => i)).length, 200);
});

test('XmltvParser: <category> okunur, birden çoksa birleşir, yoksa boş', () => {
  const now = Date.UTC(2026, 10, 12, 12, 0, 0);
  const xml = `<tv><channel id="a"><display-name>A</display-name></channel>
    <programme start="20261112120000 +0000" stop="20261112130000 +0000" channel="a"><title>Dizi 1</title><category lang="tr">Dizi</category><category>Drama &amp; Aşk</category></programme>
    <programme start="20261112130000 +0000" stop="20261112140000 +0000" channel="a"><title>Başka</title></programme></tv>`;
  const r = new XmltvParser({ now }).push(xml).end();
  const l = r.byChannel.get('a');
  assert.equal(l[0].c, 'Dizi / Drama & Aşk');
  assert.equal(l[1].c, '');
});

test('todayRows: Kanal D dizileri dizi alanına eklenir, haber ve yarışma eklenmez', () => {
  const entries = [
    { id: 'kd', channel: 'TR: KANAL D UHD', p: prog(16, 19, 'Güller ve Günahlar') },
    { id: 'kd', channel: 'TR: KANAL D UHD', p: prog(20, 23, "Beyaz'la Joker") },
    { id: 'kd', channel: 'TR: KANAL D UHD', p: prog(23, 25, 'Daha 17') },
    { id: 'kd', channel: 'TR: KANAL D UHD', p: prog(19, 20, 'Kanal D Ana Haber') },
  ];
  const r = todayRows({ entries, kind: 'dizi', now: H(15) });
  assert.deepEqual(r.rows.map((x) => x.p.t), ['Güller ve Günahlar', 'Daha 17']);
  assert.deepEqual(r.counts, { spor: 0, film: 0, dizi: 2 });
});

test('todayRows: giriş ipucu (kütüphane kanıtı) yalnız rehber tür çıkarmıyorsa filme çevirir; haber/dizi/spor kanıtını ezmez', () => {
  const entries = [
    { id: 'trt1', channel: 'TR: TRT 1 HD', p: prog(20, 23, 'Yüzüklerin Efendisi: İki Kule', ''), hint: 'film' },
    { id: 'trt1', channel: 'TR: TRT 1 HD', p: prog(23, 24, 'Başka Program', '') },
    { id: 'n', channel: 'TR: Haber TV', p: prog(21, 22, 'Ana Haber', 'Haber'), hint: 'film' },
    { id: 's', channel: 'TR: Dizi TV', p: prog(21, 22, 'Bir Dizi 12. Bölüm', ''), hint: 'film' },
    { id: 'x', channel: 'TR: Kanal X', p: prog(21, 22, 'Bilinmeyen Tür', ''), hint: 'saçma' },
  ];
  assert.deepEqual(todayRows({ entries, kind: 'film', now: NOW }).rows.map((x) => x.p.t), ['Yüzüklerin Efendisi: İki Kule']);
  assert.equal(todayRows({ entries, kind: 'film', now: NOW }).counts.film, 1);
  assert.deepEqual(todayRows({ entries, kind: 'dizi', now: NOW }).rows.map((x) => x.p.t), ['Bir Dizi 12. Bölüm']);
  assert.deepEqual(todayRows({ entries: entries.map(({ hint, ...e }) => e), kind: 'film', now: NOW }).rows, [], 'ipucu yokken eskisi gibi tahmin yok');
});

test('Bugün TV\'de: türü boş, film uzunluğunda ve adı listede film olarak birebir geçen program film sayılır (kütüphane kanıtı)', () => {
  const ui = readFileSync(new URL('../www/js/today-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /const libFilm = \(x\) => !x\.p\.c && x\.p\.e - x\.p\.s >= 70 \* 60e3 && !channelKind\(x\.channel\) && !kindOf\(x\.p\) && !!\(env\.libraryFilm && env\.libraryFilm\(x\.p\.t\)\);/);
  assert.match(ui, /\|\| libFilm\(x\)\)\s*\.map\(\(x\) => \(libFilm\(x\) \? \{ \.\.\.x, hint: 'film' \} : x\)\);/);
  const app = readFileSync(new URL('../www/js/app.js', import.meta.url), 'utf8');
  assert.match(app, /hasExactTitle\(k, ix\.movie\) && !hasExactTitle\(k, ix\.series\)/, 'dizi kütüphanesinde de varsa film sayılmaz');
  assert.match(app, /epgReady: \(\) => S\.epg\.ready,\s*libraryFilm,/);
});
