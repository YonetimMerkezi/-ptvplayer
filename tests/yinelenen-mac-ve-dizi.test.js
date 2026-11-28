// Aynı maçın kaynaklar arasında farklı takım yazımıyla çift görünmesi, maç hatırlatıcısının çiftlenmesi,
// rehberde türsüz/“Drama” gelen dizinin “Bugün TV'de”den düşmesi ve telefonda tam sayfa fragman notu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sameTeam, collapseDuplicates, mergeSources } from '../www/js/sports-ls.js';
import { activePlans } from '../www/js/plan.js';
import { todayRows, kindOf } from '../www/js/today.js';

const T = Date.UTC(2030, 0, 5, 17, 0);
const mk = (id, src, h, a, t = T) => ({ id, src, t, state: 'pre', home: { name: h, label: h }, away: { name: a, label: a } });

test('takım adı: Çaykur Rizespor / Rizespor / Rize / Çaykur Rize / Ç. Rizespor aynı takım', () => {
  const names = ['Çaykur Rizespor', 'Rizespor', 'ÇAYKUR RİZESPOR', 'Rize', 'Çaykur Rize', 'Ç. Rizespor', 'Rize Spor', 'Çaykur Rizespor A.Ş.'];
  for (const a of names) for (const b of names) assert.ok(sameTeam(a, b), `${a} ≟ ${b}`);
});

test('takım adı: farklı takımlar karışmaz', () => {
  const no = [['Real Madrid', 'Atletico Madrid'], ['Istanbulspor', 'Istanbul Basaksehir'], ['Arsenal', 'Arsenal W'], ['Konyaspor', 'Kayserispor'], ['Samsunspor', 'Samsun U19'], ['Manchester United', 'Manchester City']];
  for (const [a, b] of no) assert.equal(sameTeam(a, b), false, `${a} ≠ ${b}`);
});

test('maç listesi: kaynaklar arası yazım farkıyla çift kalan maç tek olur (ESPN kalır, kanal bilgisi taşınır)', () => {
  const r = collapseDuplicates([
    mk('e1', undefined, 'Çaykur Rizespor', 'Galatasaray'),
    { ...mk('s1', 'se', 'Rize', 'Galatasaray', T + 5 * 60000), channels: ['beIN Sports 1'], logos: {} },
    mk('x', 'ls', 'Konyaspor', 'Kayserispor'),
  ]);
  assert.deepEqual(r.map((m) => m.id), ['e1', 'x']);
  assert.deepEqual(r[0].channels, ['beIN Sports 1']);
});

test('maç listesi: bir takım kesin, öteki kısaltma ve aynı saat → aynı maç; farklı saatte ayrı kalır', () => {
  assert.equal(collapseDuplicates([mk('a', undefined, 'Menemenspor', 'Bodrum FK'), mk('b', 'mk', 'Menemen FK', 'Sipay Bodrum')]).length, 1);
  assert.equal(collapseDuplicates([mk('a', undefined, 'Rizespor', 'Bodrum FK'), mk('b', 'mk', 'Rizespor', 'Bodrum FK', T + 4 * 3600e3)]).length, 2);
});

test('mergeSources: ESPN “Çaykur Rizespor”, LiveScore “Rize” → tek kayıt', () => {
  const r = mergeSources([mk('e1', undefined, 'Çaykur Rizespor', 'Galatasaray')], [mk('l1', 'ls', 'Rize', 'Galatasaray')]);
  assert.equal(r.matches.length, 1);
});

test('hatırlatıcı: aynı maça iki yazımla kurulmuş maç hatırlatıcısı listede tek görünür', () => {
  const now = T - 36e5;
  const plan = (id, title, chId = '') => ({ id, kind: 'rem', match: true, title, s: T, e: T + 3 * 36e5, at: T - 9e5, chId });
  const list = activePlans([plan('a', 'Çaykur Rizespor – Galatasaray'), plan('b', 'Rize – Galatasaray', '7'), plan('c', 'Konyaspor – Kayserispor')], now);
  assert.deepEqual(list.map((x) => x.id).sort(), ['b', 'c']);
});

test('Bugün TV’de: dizi akışında adı geçen dizi, rehber türsüz ya da “Drama” verse de Dizi listesinde görünür (TRT 1 20.00 Gönül Dağı)', () => {
  const day = new Date(2030, 0, 5);
  const at = (h) => new Date(2030, 0, 5, h).getTime();
  const now = at(15);
  assert.ok(day);
  const entries = [
    { id: '1', channel: 'TRT 1', p: { s: at(20), e: at(23), t: 'Gönül Dağı', c: 'Drama', d: '' } },
    { id: '1', channel: 'TRT 1', p: { s: at(23), e: at(23) + 36e5, t: 'Gece Haberleri', c: 'Haber', d: '' } },
  ];
  assert.equal(todayRows({ entries, kind: 'dizi', now }).rows.length, 0, 'bilinmeyen: eskiden olduğu gibi');
  const r = todayRows({ entries, kind: 'dizi', now, seriesTitles: new Set(['gonuldagi']) });
  assert.deepEqual(r.rows.map((x) => x.p.t), ['Gönül Dağı']);
  assert.equal(r.counts.dizi, 1);
});

test('Bugün TV’de: açıklamada “dizisinin yeni bölümü” geçen program dizi sayılır; haber/spor karışmaz', () => {
  assert.equal(kindOf({ t: 'Gönül Dağı', c: '', d: 'Yerli dizinin yeni bölümü' }), 'dizi');
  assert.equal(kindOf({ t: 'Ana Haber', c: 'Haber', d: 'Günün dizisi haberi' }), '');
});

test('telefon: fragman tam sayfa (sinema kipi) olunca üstte “Fragman oynuyor” notu ve #app dışında ses düğmesi kalır', () => {
  const css = readFileSync(new URL('../www/css/app.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../www/js/app.js', import.meta.url), 'utf8');
  assert.match(css, /html:not\(\.tv\)\.hero-live\.hero-cine #hero-live \{ display: flex;/);
  assert.match(css, /html:not\(\.tv\)\.hero-live\.hero-cine #hero-snd-float \{ display: grid;/);
  assert.match(html, /<button id="hero-snd-float"/);
  assert.ok(html.indexOf('id="hero-snd-float"') > html.indexOf('id="hero-live"'));
  assert.match(app, /\$\('#hero-snd-float'\)\?\.addEventListener\('click'/);
  assert.match(app, /closest\('#hero-snd-float'\)/, 'ses düğmesine dokunmak sinema kipini bozmaz');
});
