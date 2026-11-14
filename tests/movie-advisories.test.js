import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKtbClassification, parseScreenwiseMedia, translateScreenwiseText, classifyScreenwiseWarning, translateAdvisoryText, loadMovieAdvisories, advisoryKey } from '../www/js/movie-advisories.js';

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

test('genel çeviri katmanı Screenwise İngilizce açıklamayı Türkçeye çevirir', async () => {
  const net = { json: async (url) => {
    assert.match(url, /translate\.googleapis\.com/);
    return [[['Film boyunca yoğun şiddet', 'Intense violence throughout', null, null]]];
  }};
  const result = await translateAdvisoryText(net, 'Intense violence throughout');
  assert.equal(result, 'Film boyunca yoğun şiddet');
});
test('çeviri servisi çalışmazsa yerel sözlük devreye girer', async () => {
  const net = { json: async () => { throw new Error('offline'); } };
  const result = await translateAdvisoryText(net, 'A disturbing scene involving a dog that may upset animal-loving kids');
  assert.match(result, /rahatsız edici bir sahne/);
  assert.match(result, /hayvanları seven çocukları üzebilir/);
  assert.doesNotMatch(result, /disturbing scene|animal-loving kids/i);
});

test('ekran görüntüsündeki farklı İngilizce uyarı örnekleri çevrilir ve sınıflandırılır', async () => {
  const net = { json: async () => { throw new Error('offline'); } };
  const examples = [
    'Intense violence throughout—cyborg bodies are torn apart, limbs severed, faces crushed (minimal blood but maximum brutality)',
    'A disturbing scene involving a dog that may upset animal-loving kids',
    'Dark dystopian themes of class inequality and exploitation',
    'The romance subplot feels a bit forced and may make teens roll their eyes',
    'Ends on a cliffhanger that never got resolved (sequel unlikely at this point)',
  ];
  const translated = await Promise.all(examples.map((x) => translateAdvisoryText(net, x)));
  assert.match(translated[0], /yoğun şiddet|şiddet/i);
  assert.match(translated[1], /köpek|hayvan/i);
  assert.match(translated[2], /sınıf eşitsizliği|sömürü/i);
  assert.match(translated[3], /romantik yan hikâye/i);
  assert.match(translated[4], /ucu açık final|devam filmi/i);
  assert.doesNotMatch(translated.join(' '), /cyborg bodies|class inequality|romance subplot|cliffhanger|animal-loving kids/i);
  assert.equal(classifyScreenwiseWarning(examples[0]).category, 'violence');
  assert.equal(classifyScreenwiseWarning(examples[1]).category, 'fear');
  assert.equal(classifyScreenwiseWarning(examples[2]).category, 'social');
  assert.equal(classifyScreenwiseWarning(examples[3]).category, 'romance');
  assert.equal(classifyScreenwiseWarning(examples[4]).category, 'ending');
});

test('IMDb kimliği yokken Screenwise başlık ve yıl ile aranır', async () => {
  const calls = [];
  const net = { json: async (url) => {
    calls.push(url);
    if (url.includes('/browse?search=')) return '<html>no matching classification</html>';
    if (url.includes('/api/v1/media/search?')) return { results: [{ matchConfidence: 0.91, media: { slug: 'sample-film', type: 'movie' } }] };
    if (url.endsWith('/api/v1/media/sample-film')) return {
      title: 'Sample Film', url: 'https://screenwiseapp.com/media/sample-film',
      wise: { overall: 76, oneLiner: 'A thoughtful film', parentCopy: { watchFor: ['Intense violence throughout'], ageFitNote: 'For older teens' } },
      externalRatings: { imdb: { score: 7.2 } }
    };
    throw new Error('unexpected url ' + url);
  }};
  const cache = new Map();
  const store = { cache: { get: async (k) => cache.get(k), set: async (k,v) => cache.set(k,v) } };
  const record = await loadMovieAdvisories(net, store, { title: 'Sample Film', year: 2024 }, { name: 'Sample Film' });
  assert.equal(record.sources.screenwise.status, 'found');
  assert.equal(record.imdbRating, '7.2');
  assert.equal(record.warnings.length, 1);
  assert.ok(calls.some((url) => url.includes('q=Sample%20Film') && url.includes('year=2024')));
});

const memStore = () => { const cache = new Map(); return { cache: { get: async (k) => cache.get(k), set: async (k, v) => cache.set(k, v) }, raw: cache }; };

test('dizi için Screenwise type=show ile aranır, KTB film sitesi çağrılmaz', async () => {
  const calls = [];
  const net = {
    text: async (url) => { calls.push(url); return ''; },
    json: async (url) => {
      calls.push(url);
      if (url.includes('/api/v1/media/search?')) return { results: [{ matchConfidence: 0.95, media: { slug: 'sample-show', type: 'show' } }] };
      if (url.endsWith('/api/v1/media/sample-show')) return { title: 'Sample Show', url: 'https://screenwiseapp.com/media/sample-show', wise: { overall: 70, parentCopy: { watchFor: ['Intense violence throughout'] } } };
      throw new Error('unexpected url ' + url);
    },
  };
  const store = memStore();
  const record = await loadMovieAdvisories(net, store, { title: 'Sample Show', year: 2020, imdbId: 'tt1234567' }, { name: 'Sample Show' }, 'series');
  assert.equal(record.kind, 'series');
  assert.equal(record.sources.screenwise.status, 'found');
  assert.equal(record.sources.ktb, undefined);
  assert.equal(record.warnings.length, 1);
  assert.ok(calls.some((u) => u.includes('imdb_id=tt1234567') && u.includes('type=show')));
  assert.ok(!calls.some((u) => u.includes('ktb.gov.tr')));
  assert.ok(store.raw.has(advisoryKey({ title: 'Sample Show', year: 2020, imdbId: 'tt1234567' }, 'series')));
});

test('dizi araması film türündeki sonucu kabul etmez', async () => {
  const net = { text: async () => '', json: async () => ({ results: [{ matchConfidence: 1, media: { slug: 'same-name-movie', type: 'movie' } }] }) };
  const record = await loadMovieAdvisories(net, memStore(), { title: 'Same Name', year: 2020 }, { name: 'Same Name' }, 'series');
  assert.equal(record.sources.screenwise.status, 'no_data');
  assert.deepEqual(record.warnings, []);
});

test('film ve dizi önbellek anahtarları çakışmaz', () => {
  const meta = { title: 'Aynı Ad', year: 2020 };
  assert.notEqual(advisoryKey(meta, 'movie'), advisoryKey(meta, 'series'));
  assert.equal(advisoryKey({ imdbId: 'tt1' }, 'movie'), 'movie-advisory:v4:tt1');
});

test('kaynak hatası "uyarı yok" diye günlerce saklanmaz; kısa süre sonra yeniden denenir', async () => {
  let fail = true, n = 0;
  const net = {
    text: async () => '<html></html>',
    json: async (url) => {
      n++;
      if (fail) throw new Error('HTTP 429');
      if (url.includes('/media/search?')) return { results: [{ matchConfidence: 1, media: { slug: 'x', type: 'movie' } }] };
      return { title: 'X', url: 'https://screenwiseapp.com/media/x', wise: { overall: 60, parentCopy: { watchFor: ['heavy language'] } } };
    },
  };
  const store = memStore();
  const meta = { title: 'Hata Filmi', year: 2022 };
  const first = await loadMovieAdvisories(net, store, meta, { name: 'Hata Filmi' });
  assert.equal(first.sources.screenwise.status, 'error');
  // hemen tekrar: kısa süre içinde önbellekten döner
  const calls = n;
  await loadMovieAdvisories(net, store, meta, { name: 'Hata Filmi' });
  assert.equal(n, calls);
  // 6 dakika sonra: hata kaydı geçersiz, yeniden istenir ve uyarı bulunur
  const key = advisoryKey(meta, 'movie');
  store.raw.set(key, { ...store.raw.get(key), checkedAt: Date.now() - 6 * 60000 });
  fail = false;
  const again = await loadMovieAdvisories(net, store, meta, { name: 'Hata Filmi' });
  assert.equal(again.sources.screenwise.status, 'found');
  assert.equal(again.warnings.length, 1);
});


test('Screenwise eşleşmesi Türkçe/orijinal alternatif adlarla ve yıl olmadan yeniden denenir', async () => {
  const calls = [];
  const net = {
    text: async (url) => { calls.push(url); return '<html></html>'; },
    json: async (url) => {
      calls.push(url);
      if (url.includes('/api/v1/media/search?')) {
        if (!url.includes('q=Orijinal%20Ad')) return { results: [] };
        if (url.includes('q=Orijinal%20Ad')) return { results: [{ matchConfidence: 0.68, media: { slug: 'alternate-title', type: 'movie', title: 'Orijinal Ad' } }] };
      }
      if (url.endsWith('/api/v1/media/alternate-title')) return {
        title: 'Orijinal Ad', url: 'https://screenwiseapp.com/media/alternate-title',
        wise: { parentCopy: { watchFor: ['Intense violence throughout'] } },
      };
      throw new Error('unexpected url ' + url);
    },
  };
  const record = await loadMovieAdvisories(net, memStore(), {
    title: 'Turkce Ad', trTitle: 'Türkçe Ad', originalTitle: 'Orijinal Ad', year: 2021,
  }, { name: 'Turkce Ad' });
  assert.equal(record.sources.screenwise.status, 'found');
  assert.equal(record.sources.screenwise.title, 'Orijinal Ad');
  assert.equal(record.warnings.length, 1);
  assert.ok(calls.some((url) => url.includes('q=Orijinal%20Ad')));
});
