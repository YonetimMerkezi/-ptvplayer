import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKtbClassification, parseScreenwiseMedia } from '../www/js/movie-advisories.js';

test('KTB film kaydındaki yaş ve içerik işaretlerini çıkarır', () => {
  const html = '<article><h3>Örnek Film</h3><p>16 Yaş ve Üzeri İzleyici Kitlesi İçindir.</p><p>Şiddet veya Korku Unsurları İçerir.</p><p>Olumsuz Örnek Oluşturabilecek Davranışlar İçerir.</p></article>';
  const result = parseKtbClassification(html, 'Örnek Film', 2024);
  assert.equal(result.ageRating, '16+');
  assert.deepEqual(result.warnings.map((w) => w.category), ['violence', 'negative_examples']);
  assert.equal(result.year, 2024);
});
test('KTB sayfasında yalnızca başlık bulunması sınıflandırma uydurmaz', () => {
  const html = '<main><h3>Örnek Film</h3><p>Sayfa yükleniyor...</p></main>';
  assert.equal(parseKtbClassification(html, 'Örnek Film'), null);
});
test('eşleşmeyen başlık için sınıflandırma uydurmaz', () => {
  const html = '<article><h3>Başka Film</h3><p>18 Yaş ve Üzeri</p><p>Şiddet</p></article>';
  assert.equal(parseKtbClassification(html, 'Örnek Film'), null);
});
test('Screenwise rehberindeki watchFor maddelerini kaynaklı uyarıya dönüştürür', () => {
  const result = parseScreenwiseMedia({
    title: 'Example Movie', url: 'https://screenwiseapp.com/media/example',
    wise: { overall: 72, oneLiner: 'Aile rehberi özeti', parentCopy: { verdict: 'Dikkatli izleyin', watchFor: ['Yoğun şiddet sahneleri', 'Kaba dil'], ageFitNote: '12 yaş ve üzeri' } },
  });
  assert.equal(result.wise.overall, 72);
  assert.equal(result.warnings.length, 2);
  assert.equal(result.warnings[0].source, 'Screenwise aile rehberi');
  assert.match(result.warnings[0].url, /screenwiseapp/);
});
test('uyarı maddesi yoksa Screenwise uyarısı uydurmaz', () => {
  const result = parseScreenwiseMedia({ title: 'Example', wise: { overall: 90, parentCopy: { watchFor: [] } } });
  assert.deepEqual(result.warnings, []);
});
