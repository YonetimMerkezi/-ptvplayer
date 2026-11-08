import test from 'node:test';
import assert from 'node:assert/strict';
import { fitSlots, createSlotSupervisor } from '../www/js/multi.js';
import { holeClip } from '../www/js/hole.js';

test('kayıtlı kanallar kutu sayısına sığdırılır', () => {
  assert.deepEqual(fitSlots(['a', 'b', 'c', 'd'], 2), ['a', 'b']);
  assert.deepEqual(fitSlots(['a'], 4), ['a', null, null, null]);
  assert.deepEqual(fitSlots(undefined, 2), [null, null]);
  assert.deepEqual(fitSlots(['a', null, 'c'], 3), ['a', null, 'c']);
});

// evenodd dolgusunun alanını ızgara örnekleyerek ölçer (deliklerin tam açıldığını ve fazladan bölge çıkmadığını doğrular)
function inside(poly, px, py) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const parse = (clip, W, H) =>
  clip
    .replace(/^polygon\(evenodd, /, '')
    .replace(/\)$/, '')
    .split(', ')
    .map((p) => p.split(' ').map((v, i) => (v.endsWith('%') ? (parseFloat(v) / 100) * (i ? H : W) : parseFloat(v))));

test('holeClip: boş liste → temizle', () => {
  assert.equal(holeClip([]), '');
  assert.equal(holeClip([{ x: 0, y: 0, w: 0, h: 10 }]), '');
});

test('holeClip: birden çok delik yalnız kendi dikdörtgenlerini açar', () => {
  const W = 400;
  const H = 300;
  const rects = [{ x: 20, y: 30, w: 100, h: 80 }, { x: 220, y: 40, w: 120, h: 90 }, { x: 60, y: 180, w: 150, h: 100 }];
  const poly = parse(holeClip(rects), W, H);
  const inRect = (r, x, y) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
  for (let x = 1; x < W; x += 3) {
    for (let y = 1; y < H; y += 3) {
      const hole = rects.some((r) => inRect(r, x + 0.5, y + 0.5));
      assert.equal(inside(poly, x + 0.5, y + 0.5), !hole, `(${x},${y}) ${hole ? 'delik olmalıydı' : 'dolu olmalıydı'}`);
    }
  }
});

function supSetup() {
  const log = [];
  let t = 0;
  const timers = {
    fns: [],
    ms: [],
    set(f, ms) { this.fns.push(f); this.ms.push(ms); return this.fns.length; },
    clear(id) { this.fns[id - 1] = null; },
    pending() { return this.fns.map((f, k) => (f ? k : -1)).filter((k) => k >= 0); },
    lastMs() { const p = this.pending(); return p.length ? this.ms[p.at(-1)] : null; },
    fire() { const p = this.pending(); if (!p.length) return false; const f = this.fns[p.at(-1)]; this.fns[p.at(-1)] = null; f(); return true; },
  };
  const sup = createSlotSupervisor({
    restart: (slot, rotate) => { log.push(['restart', slot, rotate]); sup.begin(slot, 2); },
    status: (slot, st, msg, n) => log.push(['status', slot, st, msg, n]),
    timers,
    now: () => t,
  });
  return { sup, log, timers, tick: (ms) => (t += ms) };
}
const restarts = (log) => log.filter((l) => l[0] === 'restart');

test('kutu bekçisi: oynarken kopan kutu hemen yeniden başlar, sonra kademeli ama kısa beklenir', () => {
  const { sup, log, timers } = supSetup();
  sup.begin(0, 1);
  sup.event(0, 'playing');
  const delays = [];
  for (let i = 0; i < 5; i++) {
    sup.event(0, 'error', 'x');
    delays.push(timers.lastMs());
    timers.fire();
  }
  assert.deepEqual(delays, [0, 600, 1200, 1800, 2000]);
  assert.equal(restarts(log).length, 5);
  assert.ok(log.some((l) => l[0] === 'status' && l[2] === 'loading' && l[4] === 3), 'deneme sayısı bildirilir');
});

test('kutu bekçisi: takılan (arabellekte kalan) kutu 7 sn sonra yeniden bağlanır', () => {
  const { sup, log, timers } = supSetup();
  sup.begin(1, 1);
  sup.event(1, 'playing');
  sup.event(1, 'buffering');
  assert.equal(timers.lastMs(), 7000);
  timers.fire(); // bekçi doldu → yeniden bağlanma planlanır
  assert.equal(timers.lastMs(), 0);
  timers.fire();
  assert.deepEqual(restarts(log), [['restart', 1, false]]);
});

test('kutu bekçisi: ilk açılışta hata sıradaki adrese geçirir; art arda başarısız denemelerde yedek adrese geçilir', () => {
  const { sup, log, timers } = supSetup();
  sup.begin(0, 2);
  sup.event(0, 'error', 'x'); // hiç oynamadı → hemen yedek adres
  timers.fire();
  assert.equal(restarts(log)[0][2], true);
  sup.event(0, 'playing');
  const rot = [];
  for (let i = 0; i < 4; i++) {
    sup.event(0, 'error', 'x');
    timers.fire();
    rot.push(restarts(log).at(-1)[2]);
  }
  assert.deepEqual(rot, [false, true, true, true], 'ilk açılıştaki hata da art arda sayılır (sayaç yalnız 8 sn kesintisiz oynayınca sıfırlanır)');
});

test('kutu bekçisi: sekiz sn kesintisiz oynarsa sayaç sıfırlanır; kutular birbirinden bağımsız', () => {
  const { sup, timers, tick } = supSetup();
  sup.begin(0, 1);
  sup.begin(1, 1);
  sup.event(0, 'playing');
  sup.event(0, 'error', 'x');
  timers.fire();
  sup.event(0, 'error', 'x');
  assert.equal(timers.lastMs(), 600);
  timers.fire();
  sup.event(0, 'playing');
  tick(9000);
  sup.event(0, 'error', 'x');
  assert.equal(timers.lastMs(), 0, 'sayaç sıfırlandı');
  timers.fire();
  sup.event(1, 'playing');
  sup.event(1, 'error', 'y');
  assert.equal(timers.lastMs(), 0, 'ikinci kutunun sayacı ayrı');
});

test('kutu bekçisi: çok uzun süre bağlanamazsa hata durumuna geçer; temizleyince hiçbir zamanlayıcı kalmaz', () => {
  const { sup, log, timers } = supSetup();
  sup.begin(0, 1);
  sup.event(0, 'playing');
  for (let i = 0; i < 100; i++) {
    sup.event(0, 'error', 'koptu');
    timers.fire();
  }
  const last = log.filter((l) => l[0] === 'status').at(-1);
  assert.deepEqual(last.slice(2, 4), ['error', 'koptu']);
  sup.begin(0, 1);
  sup.event(0, 'buffering');
  sup.clear(0);
  assert.equal(timers.pending().length, 0);
});

test('kutu bekçisi: ses var görüntü yok → yeniden bağlanır, tekrarlanırsa nedeniyle hata gösterir', () => {
  const { sup, log, timers } = supSetup();
  sup.begin(0, 1);
  sup.event(0, 'video', '', { has: true, supported: true, info: 'hevc 1920x1080 50fps · c2.qti.hevc.decoder' });
  assert.equal(timers.pending().length, 1, 'oynamadan önce yalnız açılış bekçisi var');
  sup.event(0, 'playing');
  assert.equal(timers.lastMs(), 8000, 'oynuyor ama kare yok: 8 sn beklenir');
  timers.fire(); // kare gelmedi → yeniden bağlanma planlanır
  assert.equal(timers.lastMs(), 0);
  timers.fire();
  assert.equal(restarts(log).length, 1);
  sup.event(0, 'video', '', { has: true, supported: true, info: 'hevc 1920x1080' });
  sup.event(0, 'playing');
  timers.fire(); // ikinci kez görüntüsüz
  const last = log.filter((l) => l[0] === 'status').at(-1);
  assert.equal(last[2], 'error');
  assert.match(last[3], /^Görüntü gelmiyor \(hevc 1920x1080\)$/, 'neden iletide');
  assert.equal(timers.pending().length, 0, 'hata durumunda zamanlayıcı kalmaz');
});

test('kutu bekçisi: ilk kare gelirse görüntü bekçisi kapanır ve sayaç sıfırlanır; yalnız sesli (radyo) yayın sorun sayılmaz', () => {
  const { sup, log, timers } = supSetup();
  sup.begin(0, 1);
  sup.event(0, 'video', '', { has: true, supported: true });
  sup.event(0, 'playing');
  sup.event(0, 'frame', '', { info: 'h264 1280x720' });
  assert.equal(timers.pending().length, 0, 'kare geldi: bekçi yok');
  assert.ok(!restarts(log).length);
  // radyo: görüntü izi hiç bildirilmez
  sup.begin(1, 1);
  sup.event(1, 'playing');
  sup.event(1, 'video', '', { has: false });
  assert.equal(timers.pending().length, 0, 'görüntü izi yoksa kare beklenmez');
});

test('kutu bekçisi: görüntü biçimi cihazca desteklenmiyorsa yedek adres yoksa hemen nedenle hata verir, varsa önce yedeğe geçer', () => {
  const a = supSetup();
  a.sup.begin(0, 1);
  a.sup.event(0, 'playing');
  a.sup.event(0, 'video', '', { has: true, supported: false, info: 'hevc 3840x2160' });
  const last = a.log.filter((l) => l[0] === 'status').at(-1);
  assert.equal(last[2], 'error');
  assert.match(last[3], /Bu cihaz bu görüntü biçimini çözemiyor \(hevc 3840x2160\)/);
  const b = supSetup();
  b.sup.begin(0, 2);
  b.sup.event(0, 'playing');
  b.sup.event(0, 'video', '', { has: true, supported: false, info: 'hevc' });
  b.timers.fire();
  assert.deepEqual(restarts(b.log), [['restart', 0, true]], 'yedek adrese geçildi');
});
