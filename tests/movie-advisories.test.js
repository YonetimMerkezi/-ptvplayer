import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKtbClassification } from '../www/js/movie-advisories.js';

test('KTB film kaydındaki yaş ve içerik işaretlerini çıkarır', () => {
  const html = '<article><h3>Örnek Film</h3><p>16 Yaş ve Üzeri İzleyici Kitlesi İçindir.</p><p>Şiddet veya Korku Unsurları İçerir.</p><p>Olumsuz Örnek Oluşturabilecek Davranışlar İçerir.</p></article>';
  const result = parseKtbClassification(html, 'Örnek Film', 2024);
  assert.equal(result.ageRating, '16+');
  assert.deepEqual(result.warnings.map((w) => w.category), ['violence', 'negative_examples']);
  assert.equal(result.year, 2024);
});
test('eşleşmeyen başlık için sınıflandırma uydurmaz', () => {
  const html = '<article><h3>Başka Film</h3><p>18 Yaş ve Üzeri</p><p>Şiddet</p></article>';
  assert.equal(parseKtbClassification(html, 'Örnek Film'), null);
});
test('sınıflandırma işareti yoksa uyarı üretmez', () => {
  const html = '<article><h3>Örnek Film</h3><p>Genel izleyici</p></article>';
  const result = parseKtbClassification(html, 'Örnek Film');
  assert.deepEqual(result.warnings, []);
  assert.equal(result.ageRating, '');
});
