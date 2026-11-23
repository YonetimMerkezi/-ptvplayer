// QR üretici: OpenCV'nin kendi QR kodlayıcısından alınan bağımsız bir referansla ve yapı kurallarıyla sınanır
// (üretilen kodların telefon okuyucusuyla okunduğu ayrıca elle doğrulandı).
import test from 'node:test';
import assert from 'node:assert/strict';
import { qrMatris, qrSvg, QR_EN_COK_BAYT } from '../webos/src/qr.js';

// "https://youtu.be/jNQXAC9IVRw", sürüm 3 (29x29), düzey M, maske 3: OpenCV QRCodeEncoder çıktısı
const REFERANS = [
  '11111110111001110010101111111', '10000010100011001000001000001', '10111010001000001011001011101', '10111010111010110110001011101',
  '10111010010110101010001011101', '10000010010001011001001000001', '11111110101010101010101111111', '00000000101100011110100000000',
  '10110111001001010010101001011', '01011000110011110110101110001', '00111010001001001100010100110', '11011100100000001011011100001',
  '00110011101110110000110101100', '11110000011110101110001000111', '10011110111111011111010100111', '01100001011000101011111110010',
  '00111111101010111111110011010', '00100000010010101011100101110', '10110111101101111110010100100', '00000001010101100101101010100',
  '11010010100001101110111111100', '00000000111100011000100011111', '11111110110000110011101011010', '10000010101011110010100011001',
  '10111010010000001010111110101', '10111010100000000001010111010', '10111010101011100110100100101', '10000010011000010110100111010',
  '11111110101110100110110111010',
];

test('qrMatris: OpenCV referansıyla aynı (artık/ek bit modülü dışında)', () => {
  const m = qrMatris('https://youtu.be/jNQXAC9IVRw', 3);
  assert.equal(m.length, 29);
  const fark = [];
  for (let y = 0; y < 29; y++) for (let x = 0; x < 29; x++) if ((m[y][x] ? '1' : '0') !== REFERANS[y][x]) fark.push(x + ',' + y);
  // Artık bitler (veri bitlerinden sonra kalan modüller) kodu okumayı etkilemez; OpenCV o tek modülü farklı yazar
  assert.ok(fark.length <= 1, 'farklı modüller: ' + fark.join(' '));
  assert.ok(fark.every((f) => f === '0,20'), 'yalnız artık bit modülü farklı olabilir: ' + fark.join(' '));
});

test('qrMatris: sürüm boyutları (21, 25, 29, 33, 37) ve bulucu/zamanlama desenleri', () => {
  const boyut = (n) => qrMatris('x'.repeat(n)).length;
  assert.equal(boyut(3), 21);
  assert.equal(boyut(14), 21);
  assert.equal(boyut(15), 25);
  assert.equal(boyut(26), 25);
  assert.equal(boyut(28), 29);
  assert.equal(boyut(42), 29);
  assert.equal(boyut(43), 33);
  assert.equal(boyut(62), 33);
  assert.equal(boyut(63), 37);
  assert.equal(boyut(QR_EN_COK_BAYT), 37);
  assert.throws(() => qrMatris('x'.repeat(QR_EN_COK_BAYT + 1)), /çok uzun/);
  for (const n of [3, 20, 28, 50, 80]) {
    const m = qrMatris('a'.repeat(n));
    const t = m.length;
    // Üç köşede 7x7 bulucu: dış halka koyu, 5x5 halka açık, 3x3 merkez koyu
    for (const [ox, oy] of [[0, 0], [t - 7, 0], [0, t - 7]]) {
      for (let dy = 0; dy < 7; dy++) {
        for (let dx = 0; dx < 7; dx++) {
          const d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          assert.equal(m[oy + dy][ox + dx], d !== 2, 'bulucu ' + ox + ',' + oy + ' (' + dx + ',' + dy + ')');
        }
      }
    }
    for (let i = 8; i < t - 8; i++) {
      assert.equal(m[6][i], i % 2 === 0, 'yatay zamanlama ' + i);
      assert.equal(m[i][6], i % 2 === 0, 'dikey zamanlama ' + i);
    }
    assert.equal(m[t - 8][8], true, 'sabit koyu modül');
  }
});

test('qrMatris: aynı metin her seferinde aynı matrisi verir; UTF-8 bayt sayılır', () => {
  assert.deepEqual(qrMatris('https://youtu.be/dQw4w9WgXcQ'), qrMatris('https://youtu.be/dQw4w9WgXcQ'));
  assert.notDeepEqual(qrMatris('https://youtu.be/dQw4w9WgXcQ'), qrMatris('https://youtu.be/jNQXAC9IVRw'));
  assert.equal(qrMatris('ş'.repeat(7)).length, 21, '7 harf = 14 bayt → sürüm 1');
  assert.equal(qrMatris('ş'.repeat(8)).length, 25, '8 harf = 16 bayt → sürüm 2');
});

test('qrSvg: beyaz zeminli, sessiz bölgeli geçerli SVG', () => {
  const svg = qrSvg('https://youtu.be/jNQXAC9IVRw');
  assert.match(svg, /^<svg [^>]*viewBox="0 0 37 37"/, '29 modül + 2×4 sessiz bölge');
  assert.match(svg, /<rect width="37" height="37" fill="#fff"\/>/);
  assert.match(svg, /<path d="M\d+ \d+h\d+v1h-\d+z/);
  assert.ok(!/width="/.test(svg.split('>')[0]), 'px verilmezse boyutu CSS belirler');
  assert.match(qrSvg('abc', 300), /width="300" height="300"/);
});
