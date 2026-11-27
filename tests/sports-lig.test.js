// Lig katalogu ve ikinci kaynak eşlemesi (webOS Lig sayfası ve Android lig görünümü ortak kullanır)
import test from 'node:test';
import assert from 'node:assert/strict';
import { TUM_LIGLER, HAFTALI_LIGLER, ligBul, ikinciLigMi, ligMaci, ikinciKaynakVar, LIG_ULKE } from '../www/js/sports-lig.js';

const ls = (lgName, grp, ek = {}) => ({ id: 'ls:x:1', lg: 'ls:x', lgName, grp, src: 'ls', ...ek });

test('lig: katalog Süper Lig, 1. Lig, 2. Lig sırasıyla başlar; alt ligler ikinci kaynaklıdır', () => {
  assert.deepEqual(TUM_LIGLER.slice(0, 3).map((l) => l.id), ['tur.1', 'tff.1', 'tff.2']);
  assert.equal(ligBul('tff.2').name, 'Türkiye 2. Lig');
  assert.equal(ligBul('yok'), null);
  assert.equal(ikinciLigMi('tff.1'), true);
  assert.equal(ikinciLigMi('tur.1'), false);
});

test('lig: hafta numaralı görünüm yalnız eşleme kuralı olan liglerde (milli maç yarışmalarında yok)', () => {
  const idler = HAFTALI_LIGLER.map((l) => l.id);
  assert.ok(idler.includes('tur.1') && idler.includes('tff.1') && idler.includes('tff.2') && idler.includes('eng.1') && idler.includes('uefa.champions'));
  assert.ok(!idler.includes('fifa.friendly') && !idler.includes('uefa.nations'));
  assert.equal(ikinciKaynakVar('fifa.friendly'), false);
  assert.equal(ikinciKaynakVar('tur.1'), true);
  assert.ok(Object.keys(LIG_ULKE).every((id) => ikinciKaynakVar(id)), 'her süzgeçli lig eşlenebilir');
});

test('lig: maç ESPN kimliğinden ya da yarışma adından lige eşlenir (Süper Lig / 1. Lig / 2. Lig ayrı)', () => {
  assert.equal(ligMaci({ lg: 'tur.1' }, 'tur.1'), true);
  assert.equal(ligMaci(ls('Türkiye · Süper Lig', 'tr'), 'tur.1'), true);
  assert.equal(ligMaci(ls('Türkiye · Süper Lig', 'tr'), 'tff.1'), false);
  assert.equal(ligMaci(ls('Türkiye · 1. Lig', 'tr'), 'tff.1'), true);
  assert.equal(ligMaci(ls('Türkiye · 2. Lig: Beyaz Grup', 'tr'), 'tff.2'), true);
  assert.equal(ligMaci(ls('Türkiye · 2. Lig: Beyaz Grup', 'tr'), 'tff.1'), false);
  assert.equal(ligMaci(ls('İngiltere · Premier League', 'eu'), 'eng.1'), true);
  assert.equal(ligMaci(ls('Almanya · Bundesliga 2', 'eu'), 'ger.1'), false, '2. Bundesliga ayrı lig');
  assert.equal(ligMaci(null, 'tur.1'), false);
});
