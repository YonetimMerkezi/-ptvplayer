import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKtbClassification, parseScreenwiseMedia, translateScreenwiseText, classifyScreenwiseWarning } from '../www/js/movie-advisories.js';

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

test('Screenwise İngilizce uyarıları Türkçeye çevrilir', () => {
  const translated = translateScreenwiseText('The **R-rating is earned** through heavy language and the persistent, bone-deep anxiety of the situation.');
  assert.match(translated, /yoğun argo/);
  assert.match(translated, /gerilim/);
  assert.doesNotMatch(translated, /The |R-rating|heavy language/);
});
test('Screenwise açıklamasından anlamlı uyarı kategorisi ve simgesi seçilir', () => {
  assert.equal(classifyScreenwiseWarning('heavy language and persistent anxiety').category, 'language');
  assert.equal(classifyScreenwiseWarning('physically intense workplace gore').category, 'violence');
  assert.equal(classifyScreenwiseWarning('persistent anxiety and fear').category, 'fear');
});
test('Screenwise watchFor artık family_guidance teknik etiketi üretmez', () => {
  const result = parseScreenwiseMedia({ title: 'Fuze', wise: { parentCopy: { watchFor: ['heavy language', 'physically intense workplace gore'] } } });
  assert.deepEqual(result.warnings.map((w) => w.category), ['language', 'violence']);
  assert.ok(result.warnings.every((w) => w.label && w.icon));
});

test('Screenwise ayrıntılı uyarılar ve aile rehberi özeti Türkçeleştirilir', () => {
  const language = translateScreenwiseText('The **R-rating is earned** through heavy language and the persistent, bone-deep anxiety of the situation.');
  const violence = translateScreenwiseText('Some scenes involving the construction site accident that reveals the bomb are **physically intense** and potentially triggering for those sensitive to workplace gore.');
  const guidance = translateScreenwiseText('Fuze is a solid, mid-tier thriller that trades in realism rather than spectacle. It’s the kind of movie that makes you look at every construction pit in the city a little differently.');
  assert.match(language, /R yaş sınıfı/);
  assert.match(language, /yoğun argo/);
  assert.match(violence, /inşaat kazası/);
  assert.match(violence, /rahatsız edici olabilir/);
  assert.match(guidance, /gerilim filmi/);
  assert.doesNotMatch(language + violence + guidance, /heavy language|physically intense|construction site accident|mid-tier thriller/i);
});

test('Screenwise uzun rehber metnindeki kalan İngilizce ifadeler Türkçeleştirilir', () => {
  const text = translateScreenwiseText("This is strictly for the **older teen and adult** crowd. The R-rating isn't just for show—it is a mature, stressful thriller that will likely bore younger viewers.");
  assert.match(text, /daha büyük yaştaki gençlere ve yetişkinlere/);
  assert.match(text, /yetişkinlere yönelik/);
  assert.match(text, /genç yaştaki izleyicileri sıkabilir/);
  assert.doesNotMatch(text, /older teen|younger viewers|mature, stressful thriller/i);
});
