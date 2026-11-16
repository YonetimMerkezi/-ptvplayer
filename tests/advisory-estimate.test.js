import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateAdvisories, ESTIMATE_LABEL, ESTIMATE_ICON } from '../www/js/advisory-estimate.js';

const cats = (r) => Object.fromEntries(r.map((x) => [x.category, x.level]));

test('Türk yapımı: tür ve Türkçe özetten tahmin', () => {
  const r = cats(estimateAdvisories({ genres: 'Dram, Suç', plot: 'Susurluk’ta meydana gelen kazada hayatını kaybeden bir mafya liderinin, suikast ve silahlı çatışmalarla dolu yaşam öyküsü.' }));
  assert.equal(r.violence, 'moderate');
  assert.equal(r.fear, undefined);
  const k = cats(estimateAdvisories({ genres: ['Korku'], plot: 'Bir annenin başvurduğu kadim ve yasaklı bir büyü, yıllar önce işlenmiş cinayetin sırlarıyla birleşir.' }));
  assert.equal(k.fear, 'high');
  assert.equal(k.violence, 'moderate');
});

test('yabancı yapım: İngilizce özet ve TMDB anahtar kelimeleri', () => {
  const r = estimateAdvisories({ genres: ['Drama'], plot: 'A heroin addict tries to rebuild his life after an overdose.', keywords: ['suicide attempt', 'rape', 'nudity'] });
  const c = cats(r);
  assert.equal(c.drugs, 'moderate');
  assert.equal(c.self_harm, 'high');
  assert.equal(c.sexual_violence, 'high');
  assert.equal(c.nudity, 'moderate');
  assert.ok(r[0].level === 'high', 'yüksek düzey önce');
  assert.ok(r.find((x) => x.category === 'self_harm').from.includes('anahtar kelime'));
});

test('yüksek şiddet, kelime sınırı ve aksan katlama', () => {
  assert.equal(cats(estimateAdvisories({ plot: 'Bir SERİ KATİLİN izini süren dedektif, işkence odasını bulur.' })).violence, 'high');
  // "skill" içindeki "kill" ya da "essex" içindeki "sex" eşleşmez
  assert.deepEqual(estimateAdvisories({ plot: 'A skilled chef from Essex opens a restaurant.' }), []);
});

test('çocuk/aile türünde yalnız türe dayanan düşük tahmin gösterilmez; veri yoksa boş', () => {
  assert.deepEqual(estimateAdvisories({ genres: 'Animasyon, Aile, Macera', plot: 'Küçük bir balık okyanusta arkadaşlarını arar.' }), []);
  assert.equal(cats(estimateAdvisories({ genres: 'Animasyon, Aksiyon', plot: 'Kahraman, katil robotlarla savaşır.' })).violence, 'moderate');
  assert.deepEqual(estimateAdvisories({}), []);
  assert.deepEqual(estimateAdvisories({ genres: 'Komedi, Romantik', plot: 'İki eski arkadaş yıllar sonra karşılaşır.' }), []);
});

test('her kategori için ad ve simge var', () => {
  for (const c of ['violence', 'fear', 'sex', 'nudity', 'sexual_violence', 'drugs', 'self_harm', 'language', 'negative_examples']) assert.ok(ESTIMATE_LABEL[c] && ESTIMATE_ICON[c], c);
});
