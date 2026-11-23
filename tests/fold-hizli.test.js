// fold() hızlı yolu eski (yavaş) uygulamayla her girdide aynı sonucu vermeli: arama dizini diskte saklanıyor, sonuç değişirse eski kayıtlarla uyuşmaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fold } from '../www/js/util.js';
import { fold as foldT } from '../www/js/titleclean.js';

// Eski uygulamalar (referans)
const eskiUtil = (s) =>
  String(s ?? '')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
const MAP = { 'ı': 'i', 'İ': 'i', I: 'i', 'ş': 's', 'Ş': 's', 'ğ': 'g', 'Ğ': 'g', 'ü': 'u', 'Ü': 'u', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c', 'â': 'a', 'Â': 'a', 'î': 'i', 'Î': 'i', 'û': 'u', 'Û': 'u' };
const eskiTitle = (s) => {
  let o = '';
  for (const ch of String(s)) o += MAP[ch] ?? ch;
  return o.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
};

const ORNEK = ['I', 'İ', 'ı', 'i', 'Iİıi', 'ISPARTA', 'İSTANBUL', 'ışık', 'Işık', 'ÇELİK YÜREK', 'Şeker Kız', 'ĞÜŞÖÇ', 'ğüşöç', 'Ünlü  Şef\t\n', ' boşluk ', 'Ȧ', 'İ', 'é', 'É', 'Ñandú', 'Straße', 'ΣΊΣΥΦΟΣ', 'ǅ', 'ﬁ', '日本語', '😀 Film', 'Amélie', 'Léon: The Professional (1994)', 'TR | Show TV HD', '', ' ', 'x'.repeat(5), 'ABC def 123', 'Ａ'];

test('fold: eski uygulamayla birebir aynı (ASCII, Türkçe, aksanlı, Unicode, boşluklar)', () => {
  for (const s of ORNEK) {
    assert.equal(fold(s), eskiUtil(s), 'util.fold ' + JSON.stringify(s));
  }
  assert.equal(fold(null), '');
  assert.equal(fold(undefined), '');
  assert.equal(fold(42), '42');
});

test('fold: rastgele 20 bin dizgede eski uygulamayla aynı', () => {
  const havuz = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 \t.-_|()[]:,+ıİşŞğĞüÜöÖçÇâÂîÎûÛéèêëáàäíìóòúùñÑßæøåΣσ日本😀̇́';
  let x = 12345;
  const rnd = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let n = 0; n < 20000; n++) {
    const len = 1 + Math.floor(rnd() * 24);
    let s = '';
    for (let i = 0; i < len; i++) s += [...havuz][Math.floor(rnd() * [...havuz].length)];
    assert.equal(fold(s), eskiUtil(s), 'util ' + JSON.stringify(s));
  }
});

test('titleclean.fold: eski uygulamayla birebir aynı', () => {
  for (const s of ORNEK) assert.equal(foldT(s), eskiTitle(s), 'title.fold ' + JSON.stringify(s));
  const havuz = [...'abcXYZ019 .-_|ıİIşŞğĞüÜöÖçÇâÂîÎûÛéÉñß日😀̇́'];
  let x = 777;
  const rnd = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let n = 0; n < 20000; n++) {
    let s = '';
    for (let i = 0, len = 1 + Math.floor(rnd() * 20); i < len; i++) s += havuz[Math.floor(rnd() * havuz.length)];
    assert.equal(foldT(s), eskiTitle(s), 'title ' + JSON.stringify(s));
  }
});

test('isListRadio ön elemesi eski (her zaman fold eden) tanımla aynı sonucu verir', async () => {
  const { isListRadio } = await import('../www/js/radio.js');
  const GRP = /\b(radyo|radyolar|radio|radios)\b/;
  const NAM = /\b(radyo|radio)\b/;
  const eski = (it) => !!it && it.kind === 'live' && (GRP.test(eskiUtil(it.group || '')) || NAM.test(eskiUtil(it.name || '')));
  const metin = ['', 'TRT 1 HD', 'Power Radyo', 'RADYO D', 'Radio Paradise', 'TR | RADİO 7', 'RADIO', 'Radyolar', 'Radyoland', 'ULUSAL RADYOLAR', 'Müzik', 'Kral FM (radyo)', 'RADİO', 'radıo', 'RADYO-7', 'Şarkı Radyo', '📻 Radyo', 'Rad', 'Spor Radios'];
  for (const g of metin) for (const n of metin) {
    for (const kind of ['live', 'movie']) {
      const it = { kind, group: g, name: n };
      assert.equal(isListRadio(it), eski(it), JSON.stringify(it));
    }
  }
  assert.equal(isListRadio({ kind: 'live', group: null, name: undefined }), false);
  assert.equal(isListRadio(null), false);
});
