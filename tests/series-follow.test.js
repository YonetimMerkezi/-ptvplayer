import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFollowed, toggleFollowed, isFollowed, buildNewEpisodePlans, seriesTitle, isSeriesProgram } from '../www/js/series-follow.js';

const NOW = new Date('2026-11-13T10:00:00+03:00').getTime();
const future = NOW + 4 * 3600000;

test('dizi takibi Türkçe adları normalleştirir ve aynı diziyi çoğaltmaz', () => {
  let list = normalizeFollowed([{ title: 'Kızılcık Şerbeti' }, { title: 'KIZILCIK SERBETI' }, null]);
  assert.equal(list.length, 1);
  assert.equal(isFollowed(list, 'Kızılcık Şerbeti'), true);
  list = toggleFollowed(list, { title: 'Kızılcık Şerbeti' });
  assert.equal(list.length, 0);
  list = toggleFollowed(list, { title: 'Kızılcık Şerbeti', slug: 'kizilcik' }, NOW);
  assert.equal(list[0].addedAt, NOW);
});

test('yalnız takip edilen ve doğrulanmış yeni bölüm için tekil hatırlatıcı oluşturur', () => {
  const followed = normalizeFollowed([{ title: 'Kızılcık Şerbeti' }]);
  const days = [[
    { title: 'Kızılcık Şerbeti', slug: 'kizilcik', channel: 'Show TV', status: 'Yeni Bölüm', ep: '120. Bölüm', startAt: future, endAt: future + 5400000 },
    { title: 'Kızılcık Şerbeti', slug: 'kizilcik-tekrar', channel: 'Show TV', status: 'Tekrar', startAt: future + 7200000 },
    { title: 'Başka Dizi', slug: 'baska', channel: 'ATV', status: 'Yeni Bölüm', startAt: future + 9000000 },
    { title: 'Kızılcık Şerbeti', slug: 'iptal', channel: 'Show TV', status: 'Yeni Bölüm', off: true, startAt: future + 10000000 },
  ]];
  const plans = buildNewEpisodePlans(days, followed, [{ id: 'show', name: 'Show TV' }], [], NOW);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].chId, 'show');
  assert.equal(plans[0].followTitle, 'Kızılcık Şerbeti');
  assert.equal(plans[0].title, 'Kızılcık Şerbeti · 120. Bölüm · Yeni bölüm');
  assert.equal(plans[0].at, future - 15 * 60000);
  assert.equal(buildNewEpisodePlans(days, followed, [], plans, NOW).length, 0, 'aynı bölüm ikinci kez planlanmaz');
});

test('başlamış veya başlangıç zamanı bilinmeyen bölüm için bildirim kurulmaz', () => {
  const followed = [{ title: 'Dizi' }];
  const rows = [[
    { title: 'Dizi', status: 'Yeni Bölüm', startAt: NOW - 1000 },
    { title: 'Dizi', status: 'Yeni Bölüm' },
  ]];
  assert.deepEqual(buildNewEpisodePlans(rows, followed, [], [], NOW), []);
});
test('seriesTitle: EPG adından bölüm/sezon eki ayrılır; takip diziye bağlanır', () => {
  assert.equal(seriesTitle('Kızılcık Şerbeti 120. Bölüm'), 'Kızılcık Şerbeti');
  assert.equal(seriesTitle('Yalı Çapkını S02E10'), 'Yalı Çapkını');
  assert.equal(seriesTitle('Yalı Çapkını - 15. Bölüm (Yeni)'), 'Yalı Çapkını');
  assert.equal(seriesTitle('Masterchef Türkiye 3. Sezon 12. Bölüm'), 'Masterchef Türkiye');
  assert.equal(seriesTitle('Arka Sokaklar 700. bolum'), 'Arka Sokaklar');
  assert.equal(seriesTitle('Survivor'), 'Survivor');
  assert.equal(seriesTitle('Bölüm 5'), 'Bölüm 5', 'ad yalnız ekten oluşuyorsa olduğu gibi kalır');
  // ertesi hafta başka bölüm: aynı dizi olarak eşleşir
  const list = toggleFollowed([], { title: seriesTitle('Kızılcık Şerbeti 120. Bölüm') });
  assert.ok(isFollowed(list, seriesTitle('Kızılcık Şerbeti 121. Bölüm')));
});

test('isSeriesProgram: kategori "dizi" ya da adda Türkçe harfli bölüm/sezon numarası', () => {
  assert.equal(isSeriesProgram({ c: 'Dizi / Drama', t: 'Bir Dizi' }), true);
  assert.equal(isSeriesProgram({ c: '', t: 'Kızılcık Şerbeti 120. Bölüm' }), true, 'ö harfli "Bölüm" de dizi sayılır');
  assert.equal(isSeriesProgram({ t: 'Arka Sokaklar 700. bolum' }), true);
  assert.equal(isSeriesProgram({ t: 'Yalı Çapkını S02E10' }), true);
  assert.equal(isSeriesProgram({ c: 'Haber', t: 'Ana Haber' }), false);
  assert.equal(isSeriesProgram(null), false);
});
