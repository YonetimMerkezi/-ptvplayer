import test from 'node:test';
import assert from 'node:assert/strict';
import { pickNext, beyond, scrollStep } from '../www/js/dpad.js';

const R = (l, t, w, h) => ({ l, t, r: l + w, b: t + h });
// 3 × 3 ızgara (100 × 50 kutular, 10 aralık)
const grid = [];
for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) grid.push(R(x * 110, y * 60, 100, 50));
const at = (x, y) => grid[y * 3 + x];
const go = (cur, dir, list = grid) => pickNext(cur, list, dir);

test('ızgarada yön tuşları komşu kutuya gider', () => {
  const c = at(1, 1);
  assert.equal(go(c, 'right'), 1 * 3 + 2 );
  assert.equal(go(c, 'left'), 1 * 3 + 0);
  assert.equal(go(c, 'down'), 2 * 3 + 1);
  assert.equal(go(c, 'up'), 0 * 3 + 1);
});

test('kenarda o yönde aday yoksa -1 döner', () => {
  assert.equal(go(at(0, 0), 'left'), -1);
  assert.equal(go(at(0, 0), 'up'), -1);
  assert.equal(go(at(2, 2), 'right'), -1);
  assert.equal(go(at(2, 2), 'down'), -1);
});

test('düzensiz yerleşim: büyük kutudan sağa giderken hizalı olan küçük kutu seçilir', () => {
  // solda iki satır boyunca büyük "Canlı TV", sağda üstte film, altta dizi
  const live = R(0, 0, 200, 220);
  const movie = R(210, 0, 100, 100);
  const series = R(210, 120, 100, 100);
  const list = [live, movie, series];
  const i = pickNext(live, list, 'right');
  assert.ok(i === 1 || i === 2);
  assert.equal(pickNext(movie, list, 'down'), 2, 'filmin altındaki dizi');
  assert.equal(pickNext(series, list, 'left'), 0, 'dizinin solundaki büyük kutu');
  assert.equal(pickNext(movie, list, 'left'), 0);
});

test('dik eksende hizalı aday, yakın ama kayık adaya göre önceliklidir', () => {
  const cur = R(100, 100, 100, 50);
  const aligned = R(260, 100, 100, 50); // sağda, aynı satır, biraz uzak
  const lower = R(210, 170, 100, 50); // sağda ama bir satır aşağıda
  assert.equal(pickNext(cur, [lower, aligned], 'right'), 1);
});

test('yalnız yöndeki adaylar değerlendirilir; kendisi seçilmez', () => {
  const cur = R(100, 100, 100, 50);
  const above = R(100, 20, 100, 50);
  const below = R(100, 200, 100, 50);
  assert.equal(pickNext(cur, [cur, above, below], 'up'), 1);
  assert.equal(pickNext(cur, [cur, above, below], 'down'), 2);
  assert.equal(pickNext(cur, [cur, above], 'down'), -1);
});

test('uzun dikey liste: aşağı en yakın alttaki satıra gider', () => {
  const rows = Array.from({ length: 6 }, (_, i) => R(0, i * 64, 300, 60));
  assert.equal(pickNext(rows[2], rows, 'down'), 3);
  assert.equal(pickNext(rows[2], rows, 'up'), 1);
  assert.equal(pickNext(rows[5], rows, 'down'), -1);
});

test('liste ile yan panel: sağa basınca listeden sağdaki panele geçilir', () => {
  const rows = Array.from({ length: 4 }, (_, i) => R(0, i * 64, 300, 60));
  const slot = R(320, 20, 400, 225);
  const list = [...rows, slot];
  assert.equal(pickNext(rows[1], list, 'right'), 4);
  assert.equal(pickNext(slot, list, 'left'), 2, 'panelden sola: merkezi en hizalı satır (üçüncü)');
});

test('üst çubuk: sağa basınca aynı satırdaki uzak düğme, altındaki yakın arama alanına tercih edilir', () => {
  const source = R(88, 16, 110, 44); // kaynak seçici (sol üst)
  const search = R(834, 16, 44, 44); // arama düğmesi (sağ üst, çok uzak)
  const field = R(38, 112, 359, 38); // altta, yakın ve ortadan taşan arama alanı
  const list = [source, search, field];
  assert.equal(pickNext(source, list, 'right'), 1);
  assert.equal(pickNext(source, list, 'down'), 2, 'aşağı yine alandaki alana gider');
  assert.equal(pickNext(search, list, 'left'), 0);
});

test('satır dışı adaylar yalnız aynı satırda aday yoksa seçilir', () => {
  const cur = R(0, 0, 100, 50);
  const below = R(120, 80, 100, 50); // sağda ama bir satır aşağıda
  assert.equal(pickNext(cur, [below], 'right'), 0, 'tek aday satır dışı: yine de gidilir');
  const far = R(500, 0, 100, 50); // aynı satır, uzak
  assert.equal(pickNext(cur, [below, far], 'right'), 1);
});

test('kapsayıcı içindeki düğmelere geçilir (çoklu ekran hücresi, kart, satır)', () => {
  const cell = R(0, 0, 400, 300);
  const list = R(300, 10, 30, 30); // hücrenin sağ üstündeki düğmeler
  const full = R(335, 10, 30, 30);
  const close = R(370, 10, 20, 30);
  const next = R(402, 0, 400, 300); // yandaki hücre
  const all = [cell, list, full, close, next];
  assert.equal(pickNext(cell, all, 'up'), 1, 'hücreden yukarı: üstteki düğmelerden merkeze en yakın');
  assert.equal(pickNext(list, all, 'right'), 2, 'düğmeden sağa: yandaki düğme');
  assert.equal(pickNext(close, all, 'right'), 4, 'son düğmeden sağa: yandaki hücre');
  assert.equal(pickNext(full, all, 'left'), 1);
  assert.equal(pickNext(full, all, 'down'), 0, 'düğmeden aşağı: kendi hücresine döner');
  assert.equal(pickNext(cell, all, 'right'), 4, 'hücreden sağa: yandaki hücre (iç düğmeler değil)');
});

test('aşağı: ışın dışındaki yakın satır, uzaktaki tam genişlik düğmeye tercih edilir (sağa yaslı seçici atlanmaz)', () => {
  const swatch = R(540, 100, 60, 60); // ortadaki tema düğmesi
  const select = R(850, 190, 90, 38); // hemen altta, sağa yaslı seçici satırı (ışın dışı)
  const wide = R(0, 620, 940, 44); // çok aşağıda tam genişlik düğme (ışında)
  assert.equal(pickNext(swatch, [swatch, wide, select], 'down'), 2);
  assert.equal(pickNext(wide, [swatch, wide, select], 'up'), 2, 'yukarı: tam genişlik düğmeden en yakın satır seçicisine');
});

test('aşağı: yakın ışındaki aday, uzaktaki ışın dışı adaya göre önceliklidir', () => {
  const cur = R(100, 100, 100, 50);
  const near = R(100, 170, 100, 50); // hemen altta, ışında
  const farSide = R(500, 400, 100, 50); // uzakta ve yanda
  assert.equal(pickNext(cur, [cur, farSide, near], 'down'), 2);
});

test('beyond: hedef odaktaki öğenin gerçekten altında/üstünde mi', () => {
  const cur = R(0, 100, 100, 50); // 100..150
  assert.equal(beyond(R(0, 150, 100, 50), cur, 'down'), true);
  assert.equal(beyond(R(0, 120, 100, 50), cur, 'down'), false, 'üst üste binen öğe aşağıda sayılmaz');
  assert.equal(beyond(R(0, 40, 100, 60), cur, 'up'), true);
  assert.equal(beyond(R(0, 60, 100, 60), cur, 'up'), false);
});

test('scrollStep: uzun içerik yarım ekran adımlarla kayar, uçta durur, odak yerinde kalır', () => {
  const sc = { scrollHeight: 1000, clientHeight: 400, scrollTop: 0 };
  assert.equal(scrollStep(sc, 'up'), false, 'en üstteyken yukarı kaydırılmaz');
  assert.equal(scrollStep(sc, 'down'), true);
  assert.equal(sc.scrollTop, 200, 'adım: yarım ekran');
  sc.scrollTop = 500;
  assert.equal(scrollStep(sc, 'down'), true);
  assert.equal(sc.scrollTop, 600, 'kalan yer adımdan azsa uca oturur');
  assert.equal(scrollStep(sc, 'down'), false, 'en altta daha fazla kaydırılmaz');
  assert.equal(scrollStep(sc, 'up'), true);
  assert.equal(sc.scrollTop, 400);
  sc.scrollTop = 30;
  assert.equal(scrollStep(sc, 'up'), true);
  assert.equal(sc.scrollTop, 0);
  const tiny = { scrollHeight: 400.5, clientHeight: 400, scrollTop: 0 };
  assert.equal(scrollStep(tiny, 'down'), false, 'piksel altı taşma kaydırma sayılmaz');
});

test('pickNext: tam genişlik alan (arama kutusu) üstteki küçük düğme (geri) yerine, altındaki her düğmeden yukarı basınca seçilir', () => {
  // Ara sayfası: başlıkta geri düğmesi, altında tam genişlik arama kutusu + sağda mikrofon, onun altında sekme düğmeleri
  const back = R(8, 6, 44, 44);
  const input = R(16, 60, 864, 44);
  const mic = R(890, 60, 44, 44);
  const chips = [R(16, 112, 214, 44), R(238, 112, 214, 44), R(460, 112, 214, 44), R(682, 112, 214, 44)];
  const all = [back, input, mic, ...chips];
  const up = (c) => all[pickNext(c, all, 'up')]; // kaynak kendi dikdörtgeniyle listede: pickNext onu atlar
  for (const c of chips) assert.equal(up(c), input, 'her sekme düğmesinden yukarı → arama kutusu');
  const down = (c) => all[pickNext(c, all, 'down')];
  assert.equal(down(back), input, 'geri düğmesinden aşağı → arama kutusu');
  assert.equal(down(input), chips[1], 'kutudan aşağı → ortasındaki sekme');
  assert.equal(down(mic), chips[3], 'mikrofondan aşağı → hemen altındaki sekme');
});
