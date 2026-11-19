import test from 'node:test';
import assert from 'node:assert/strict';
import { tokensOf, dice, fuzzyFind } from '../www/js/title-match.js';
import { buildTitleIndex, findInLibrary } from '../www/js/cinemeta.js';

const lib = (...names) => names.map((name, i) => ({ id: 'm' + i, name }));
const idx = (...names) => buildTitleIndex(lib(...names));

test('sözcükler: kesme işareti atılır, harf/yıl/artikel sadeleşir', () => {
  assert.deepEqual(tokensOf("Fleet Sokağı'nın Şeytan Berberi"), ['fleet', 'sokaginin', 'seytan', 'berberi']);
  assert.deepEqual(tokensOf('The Lord of the Rings: 2001'), ['lord', 'rings']);
  assert.equal(dice(['a', 'b'], ['a', 'b']), 1);
  assert.equal(dice([], ['a']), 0);
});

test('bulanık eşleşme: Türkçe ad varyantları (kesme, sıra numarası, noktalama) aynı filmi bulur', () => {
  const ix = idx('Sweeney Todd Fleet Sokağının Şeytan Berberi (2007)', 'Karayip Korsanları 2: Ölü Adamın Sandığı | 2006 | 7.3', 'Charlie ile Çikolata Fabrikası 2005');
  const a = fuzzyFind(ix, "Sweeney Todd: Fleet Sokağı'nın Şeytan Berberi", 2007);
  assert.equal(a && a.it.id, 'm0');
  const b = fuzzyFind(ix, 'Karayip Korsanları: Ölü Adamın Sandığı', 2006);
  assert.equal(b && b.it.id, 'm1', 'listede sıra numarası olsa da yıl aynıysa eşleşir');
  assert.equal(fuzzyFind(ix, 'Charlie ve Çikolata Fabrikası', 2005), null, 'bağlaç değişince (ile/ve) benzerlik 0,8 altında: yanlış eşleşmektense eşleşmez');
});

test('bulanık eşleşme: devam filmleri karışmaz (yıl ve sıra numarası), tek sözcüklü adlar yalnız tam eşleşir, belirsizlikte boş döner', () => {
  const ix = idx('Karayip Korsanları: Siyah İncinin Laneti (2003)', 'Karayip Korsanları: Ölü Adamın Sandığı (2006)');
  assert.equal(fuzzyFind(ix, 'Karayip Korsanları: Ölü Adamın Sandığı', 2006).it.id, 'm1');
  assert.equal(fuzzyFind(ix, 'Karayip Korsanları: Dünyanın Sonu', 2007), null, 'farklı alt başlık');
  const toy = idx('Toy Story', 'Toy Story 2');
  assert.equal(fuzzyFind(toy, 'Toy Story 2', 0).it.id, 'm1', 'yıl yoksa sıra numarası eşit olmalı');
  assert.equal(fuzzyFind(toy, 'Toy Story 3', 0), null);
  assert.equal(fuzzyFind(idx('Heat 1995'), 'Heat Gece', 1995), null, 'tek sözcüklü anahtar');
  const amb = idx('Alfa Beta Gama Delta Zeta (2010)', 'Alfa Beta Gama Delta Eta (2010)');
  assert.equal(fuzzyFind(amb, 'Alfa Beta Gama Delta Epsilon', 2010), null, 'iki farklı kayıt eşit uzaklıkta: belirsiz');
  assert.equal(fuzzyFind(idx('Alfa Beta Gama Delta Zeta (2010)'), 'Alfa Beta Gama Delta Epsilon', 2010).it.id, 'm0', 'tek aday varsa belirsizlik yok');
});

test('findInLibrary: Türkçe ad (trNames) tam eşleşir; İngilizce ad apostrof/noktalama farkıyla bulanık bulunur; parantez içi özgün ad dizinlenir', () => {
  const ix = idx('Ölü Gelin | 2005', 'Pirates of the Caribbean Dead Mans Chest 2006', 'Katiller Devri (Jianyu) 2002');
  const corpse = { imdbId: 'tt0121164', name: 'Corpse Bride', year: 2005, trNames: ['Ölü Gelin'] };
  assert.equal(findInLibrary(corpse, { titleIndex: ix }).id, 'm0');
  const noTr = { imdbId: 'tt0121164', name: 'Corpse Bride', year: 2005 };
  assert.equal(findInLibrary(noTr, { titleIndex: ix }), null, 'Türkçe ad yoksa eşleşmez');
  const pirates = { imdbId: 'tt0383574', name: "Pirates of the Caribbean: Dead Man's Chest", year: 2006 };
  assert.equal(findInLibrary(pirates, { titleIndex: ix }).id, 'm1');
  const hero = { imdbId: 'tt0299977', name: 'Jianyu', year: 2002 };
  assert.equal(findInLibrary(hero, { titleIndex: ix }).id, 'm2', 'parantez içindeki özgün ad (Jianyu) de dizine girer');
  const hero2 = { imdbId: 'tt0299977', name: 'Jianyu', year: 2002, trNames: ['Katiller Devri'] };
  assert.equal(findInLibrary(hero2, { titleIndex: ix }).id, 'm2');
  const viaAlt = idx('Katiller Devri (Hero) 2002');
  assert.equal(findInLibrary({ imdbId: 'tt1', name: 'Hero', year: 2002 }, { titleIndex: viaAlt }).id, 'm0', 'parantez içindeki özgün adla bulunur');
});

test('findInLibrary: IMDb dizini her zaman önce; yıl farkı 1\'den büyükse tam eşleşme de reddedilir', () => {
  const ix = idx('Ölü Gelin | 2005');
  const byImdb = new Map([['tt9', { id: 'x' }]]);
  assert.equal(findInLibrary({ imdbId: 'tt9', name: 'Zzz', year: 1990 }, { titleIndex: ix, imdbIndex: byImdb }).id, 'x');
  assert.equal(findInLibrary({ imdbId: 'tt1', name: 'Ölü Gelin', year: 2010 }, { titleIndex: ix }), null);
  assert.equal(findInLibrary({ imdbId: 'tt1', name: 'Ölü Gelin', year: 2005 }, { titleIndex: ix }).id, 'm0');
});

test('gevşek eşik (makine çevirisi tahmin adları): yıl biliniyorsa kısmi örtüşme kabul edilir; yıl yoksa 0,8 ve sıra numarası şart', () => {
  const ix = idx('Makas Eller (1990)', 'Makas Eller 2 (1993)');
  assert.equal(fuzzyFind(ix, 'Edward Makas Eller', 1990), null, 'sıkı eşikte 0,8 yetmez (kısa ad)');
  assert.equal(fuzzyFind(ix, 'Edward Makas Eller', 1990, { loose: true }).it.id, 'm0', 'gevşek eşikte bulunur');
  assert.equal(fuzzyFind(ix, 'Edward Makas Eller', 1999, { loose: true }), null, 'yıl uyuşmazsa gevşek de eşleşmez');
  const noYear = idx('Gece Yarısı Güneşi');
  assert.equal(fuzzyFind(noYear, 'Gece Yarısı Güneşi Filmi', 0), null, 'sıkı eşikte yılsız 0,9 gerekir');
  assert.equal(fuzzyFind(noYear, 'Gece Yarısı Güneşi Filmi', 0, { loose: true }).it.id, 'm0', 'gevşek eşikte yılsız 0,8 yeter');
  assert.equal(fuzzyFind(noYear, 'Gece Yarısı Güneşi 2 Filmi', 0, { loose: true }), null, 'sıra numarası farklıysa yılsız eşleşme yok');
});

test('findInLibrary: tahmin adları (trGuess) yalnız yıl biliniyorsa ve gevşek eşikle aranır', () => {
  const ix = idx('Makas Eller (1990)');
  const film = { imdbId: 'tt0099487', name: 'Edward Scissorhands', year: 1990, trGuess: ['Edward Makas Eller'] };
  assert.equal(findInLibrary(film, { titleIndex: ix }).id, 'm0');
  assert.equal(findInLibrary({ ...film, year: 0 }, { titleIndex: ix }), null, 'yılsız film tahmin adıyla aranmaz');
  assert.equal(findInLibrary({ ...film, trGuess: [] }, { titleIndex: ix }), null);
});

test('ad dizini: "Özgün - Türkçe" ayraçlı adlarda her parça ayrıca dizinlenir', () => {
  const ix = idx('Corpse Bride - Ölü Gelin (2005)', 'Spider-Man 2002');
  assert.equal(findInLibrary({ imdbId: 'tt0121164', name: 'Corpse Bride', year: 2005 }, { titleIndex: ix }).id, 'm0');
  assert.equal(findInLibrary({ imdbId: 'tt0121164', name: 'Ölü Gelin', year: 2005 }, { titleIndex: ix }).id, 'm0');
  assert.equal(findInLibrary({ imdbId: 'tt0121164', name: 'Ölü Gelin', year: 2012 }, { titleIndex: ix }), null, 'yıl yine korunur');
  const pipe = idx('Ad Soyad | 2023 | 7.1 | NF | HD');
  assert.equal(findInLibrary({ imdbId: 'tt1', name: '2023', year: 2023 }, { titleIndex: pipe }), null, 'boru ayraçlı üstveri parçası dizinlenmez');
});
