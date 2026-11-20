import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHIFT_BAR_MS, LIVE_EDGE_MS, SHIFT_AHEAD_MS, SHIFT_SPAN_MAX_MS, floorMin, ceilMin, canShift, archiveMs, barMs, wallOf, behindOf, behindLabel, barValue, barWall, shiftPlan, endedWall, stalled } from '../www/js/shift.js';
import { archiveTargets } from '../www/js/catalog.js';

const kaynak = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const MIN = 60000;
const HOUR = 3600000;
// 2026-11-09 12:07:40 UTC
const NOW = Date.UTC(2026, 10, 9, 12, 7, 40);

test('geri sarılabilen kanal: yalnız arşivli Xtream canlı kanalı (radyo, telefon yayını, M3U ve arşivsiz hariç)', () => {
  const ch = { kind: 'live', archive: true };
  const x = { type: 'xtream' };
  assert.equal(canShift(ch, x), true);
  assert.equal(canShift({ ...ch, archive: false }, x), false);
  assert.equal(canShift({ ...ch, radio: true }, x), false);
  assert.equal(canShift({ ...ch, cast: true }, x), false);
  assert.equal(canShift({ kind: 'movie', archive: true }, x), false);
  assert.equal(canShift(ch, { type: 'm3u' }), false);
  assert.equal(canShift(ch, null), false);
  assert.equal(canShift(null, x), false);
});

test('arşiv süresi: gün sayısı, bilinmiyorsa 1 gün; çubuk en çok son 6 saati kapsar', () => {
  assert.equal(archiveMs({ archiveDays: 3 }), 3 * 86400000);
  assert.equal(archiveMs({ archiveDays: 0 }), 86400000);
  assert.equal(archiveMs({}), 86400000);
  assert.equal(archiveMs(null), 86400000);
  assert.equal(barMs({ archiveDays: 7 }), SHIFT_BAR_MS);
  assert.equal(SHIFT_BAR_MS, 6 * HOUR);
});

test('dakikaya yuvarlama', () => {
  assert.equal(floorMin(NOW), Date.UTC(2026, 10, 9, 12, 7, 0));
  assert.equal(ceilMin(NOW), Date.UTC(2026, 10, 9, 12, 8, 0));
  assert.equal(ceilMin(Date.UTC(2026, 10, 9, 12, 8, 0)), Date.UTC(2026, 10, 9, 12, 8, 0), 'tam dakika değişmez');
});

test('arşiv akışındaki konum → gerçek an ve canlıdan geride kalınan süre', () => {
  const sh = { base: Date.UTC(2026, 10, 9, 11, 0, 0) };
  assert.equal(wallOf(sh, 90 * 1000), sh.base + 90000);
  assert.equal(wallOf(sh, -5), sh.base, 'negatif konum başa sayılır');
  assert.equal(wallOf(sh, undefined), sh.base);
  assert.equal(behindOf(NOW, NOW - 125000), 125000);
  assert.equal(behindOf(NOW, NOW + 5000), 0, 'gelecek an: geride değil');
  assert.equal(behindLabel(125000), '−2:05');
  assert.equal(behindLabel(3725000), '−1:02:05');
});

test('çubuk: 1000 canlı, pencerenin başı 0; değer ↔ an gidiş dönüşü', () => {
  const win = 6 * HOUR;
  assert.equal(barValue(NOW, NOW, win), 1000);
  assert.equal(barValue(NOW, NOW - win, win), 0);
  assert.equal(barValue(NOW, NOW - win / 2, win), 500);
  assert.equal(barValue(NOW, NOW - 10 * win, win), 0, 'pencere dışı 0\'a sıkışır');
  assert.equal(barValue(NOW, NOW + HOUR, win), 1000);
  assert.equal(barWall(NOW, 1000, win), NOW);
  assert.equal(barWall(NOW, 0, win), NOW - win);
  assert.equal(barWall(NOW, 500, win), NOW - win / 2);
  assert.equal(barWall(NOW, 'bozuk', win), NOW - win, 'geçersiz değer en başa düşer');
  const w = NOW - 77 * MIN;
  assert.ok(Math.abs(barWall(NOW, barValue(NOW, w, win), win) - w) <= win / 1000, 'bir çubuk adımından fazla kayma yok');
});

test('sarma planı: geri gidişte dakika aşağı yuvarlanır, kalan saniye skip olur; adres hedef anın dakikasından açılır', () => {
  const plan = shiftPlan(NOW, NOW - 10 * 1000 - 50 * MIN, { dir: -1, archive: 86400000 }); // 11:17:30
  assert.equal(plan.live, false);
  assert.equal(plan.start, Date.UTC(2026, 10, 9, 11, 17, 0));
  assert.equal(plan.skip, 30000);
  assert.equal(plan.span, NOW - plan.start + SHIFT_AHEAD_MS, 'istenen süre: hedefe kadar + yedek');
  assert.deepEqual(plan.p, { s: plan.start, e: plan.start + plan.span });
});

test('sarma planı: ileri sarmada dakika yukarı yuvarlanır (geri gitmez), skip 0', () => {
  const t = Date.UTC(2026, 10, 9, 11, 17, 20);
  const plan = shiftPlan(NOW, t, { dir: 1, archive: 86400000 });
  assert.equal(plan.start, Date.UTC(2026, 10, 9, 11, 18, 0));
  assert.ok(plan.start >= t);
  assert.equal(plan.skip, 0);
});

test('sarma planı: canlıya çok yakın hedef canlı sayılır; yuvarlama canlıya taşırsa da canlı', () => {
  assert.deepEqual(shiftPlan(NOW, NOW - 5000), { live: true });
  assert.deepEqual(shiftPlan(NOW, NOW - LIVE_EDGE_MS), { live: true });
  assert.deepEqual(shiftPlan(NOW, NOW + 10 * MIN), { live: true }, 'gelecek');
  const t = Date.UTC(2026, 10, 9, 12, 6, 50); // 50 sn geride; ileri yuvarlayınca 12:07:00 → 40 sn
  assert.equal(shiftPlan(NOW, t, { dir: 1 }).live, false);
  const edge = Date.UTC(2026, 10, 9, 12, 7, 20); // 20 sn geride
  assert.equal(shiftPlan(NOW, edge, { dir: -1 }).live, true);
  const near = NOW - 40000;
  assert.equal(shiftPlan(NOW, near, { dir: 1 }).live, false, 'ileri sarmada 40 sn geride 12:07:00\'a yuvarlanır (40 sn) ve hâlâ canlı sınırının dışında');
  assert.equal(shiftPlan(Date.UTC(2026, 10, 9, 12, 7, 50), Date.UTC(2026, 10, 9, 12, 7, 5), { dir: 1 }).live, true, 'ileri yuvarlama 12:08:00 = canlıdan sonra: canlı');
});

test('sarma planı: arşivden eski hedef arşivin en eski anına çekilir; süre üst sınırı', () => {
  const plan = shiftPlan(NOW, NOW - 5 * 86400000, { dir: -1, archive: 2 * 86400000 });
  assert.equal(plan.live, false);
  assert.ok(plan.start >= NOW - 2 * 86400000, 'arşiv sınırının gerisine gidilmez');
  assert.ok(plan.start <= NOW - 2 * 86400000 + 3 * MIN);
  assert.ok(plan.span <= SHIFT_SPAN_MAX_MS);
  const far = shiftPlan(NOW, NOW - 20 * HOUR, { dir: -1, archive: 3 * 86400000 });
  assert.equal(far.span, SHIFT_SPAN_MAX_MS, 'çok geri sarmada istenen süre 12 saatte kalır');
});

test('arşiv adresi: sarma planı, program arşivinin kullandığı archiveTargets ile aynı adresi üretir', () => {
  const src = { type: 'xtream', server: 'http://h:80', user: 'u', pass: 'p' };
  const ch = { id: 'x10', streamId: '10', kind: 'live', archive: true };
  const plan = shiftPlan(NOW, Date.UTC(2026, 10, 9, 11, 17, 30), { dir: -1, archive: 86400000 });
  const t = archiveTargets(src, ch, plan.p, 'UTC');
  const mins = Math.ceil(plan.span / MIN);
  assert.equal(t[0].url, `http://h:80/timeshift/u/p/${mins}/2026-11-09:11-17/10.ts`);
  assert.equal(t[1].mime, 'hls');
});

test('akış bitince kalınan an ve takılma koruması', () => {
  const sh = { base: Date.UTC(2026, 10, 9, 11, 0, 0), span: 30 * MIN };
  assert.equal(endedWall(sh, { dur: 600000, pos: 590000 }), sh.base + 600000, 'süre biliniyorsa süre');
  assert.equal(endedWall(sh, { dur: -1, pos: 421000 }), sh.base + 421000, 'süre yoksa son konum');
  assert.equal(endedWall(sh, { dur: -1, pos: 0 }), sh.base + 30 * MIN, 'ikisi de yoksa istenen süre');
  assert.equal(stalled(sh, sh.base + 20000), true, 'bir dakikadan az oynayıp bittiyse aynı yerden açmak döngü olur');
  assert.equal(stalled(sh, sh.base + 59000), true);
  assert.equal(stalled(sh, sh.base + 60000), false);
  assert.equal(stalled(sh, sh.base + 30 * MIN), false);
});

// ---- bağlantı: oynatıcı ve uygulama ----

test('oynatıcı: sarma tek yerden (shiftBy / shiftToWall) geçer; düğme, tuş, kaydırma ve çubuk arşivli kanalda canlı sarmaya gider', () => {
  const ui = kaynak('www/js/player-ui.js');
  assert.match(ui, /from '\.\/shift\.js'/);
  assert.match(ui, /function shiftCh\(st\)/);
  assert.match(ui, /function shiftBy\(deltaMs\)/);
  assert.match(ui, /function shiftToWall\(target, dir\)/);
  assert.match(ui, /q\('#pl-rew'\)\.addEventListener\('click', \(\) => \{\s*if \(!shiftBy\(-10000\)\) player\.seekBy\(-10000\);/);
  assert.match(ui, /q\('#pl-fwd'\)\.addEventListener\('click', \(\) => \{\s*if \(!shiftBy\(10000\)\) player\.seekBy\(10000\);/);
  assert.match(ui, /if \(shiftBy\(step \* 1000\)\) return;/);
  assert.match(ui, /gest\.mode = 'hs'/);
  assert.match(ui, /gest\.mode === 'hs' && gest\.target != null && Math\.abs\(gest\.target - gest\.base\) >= 3000\) shiftToWall\(/, 'üç saniyeden küçük sürüklemede yeniden açılmaz');
  assert.match(ui, /else if \(seekKey && \(!live \|\| shiftCh\(st\)\)\) keySeek\(seekKey\)/);
  assert.match(ui, /e\.target\.id === 'pl-seek' && \(!live \|\| shiftCh\(st\)\)/);
  assert.match(ui, /env\.onShift\(sh, endedWall\(st\.item\.shift, st\), -1, ctx, st\.item\.shift\)/, 'arşiv akışı bitince kalınan yerden sürer');
  assert.match(ui, /shiftToWall\(barWall\(Date\.now\(\), Number\(seek\.value\), barMs\(sh\)\), 0\)/);
});

test('oynatıcı: sarılamayan canlıda (arşivsiz, radyo) eski davranış korunur: "Canlı yayında sarma yok"', () => {
  const ui = kaynak('www/js/player-ui.js');
  assert.match(ui, /hud\('info', 'Canlı yayında sarma yok'\)/);
  assert.match(ui, /function shiftCh\(st\) \{[^}]*env\.canShift/s);
});

test('uygulama: arşiv oynatma tek işlev (playArchive); rehberden ve sarmadan aynı yoldan açılır, sarma kanal listesi bağlamını korur', () => {
  const app = kaynak('www/js/app.js');
  assert.match(app, /from '\.\/shift\.js'/);
  assert.match(app, /canShift: \(it\) => canShiftLive\(it, S\.source\)/);
  assert.match(app, /onShift: \(ch, target, dir, ctx, prev\) => shiftTo\(ch, target, dir, ctx, prev\)/);
  assert.match(app, /function shiftTo\(ch, target, dir, ctx, prev\)/);
  assert.match(app, /function playArchive\(it, p, \{ ctx: liveCtx = null, shift = null \} = \{\}\)/);
  assert.match(app, /pui\.open\(item, targets, \{ ep: null, startAt: 0, ctx \}\)/);
  assert.equal((app.match(/function playArchive\(/g) || []).length, 1, 'ikinci bir arşiv oynatma işlevi yok');
});

test('CSS: arşivli canlıda sarma çubuğu ve geri düğmesi görünür; arşivsizde eskisi gibi gizli', () => {
  const css = kaynak('www/css/app.css');
  assert.match(css, /\.pl-prog\.live:not\(\.shiftable\) input \{ display: none; \}/);
  assert.match(css, /body\.live-mode:not\(\.live-shift\) #pl-rew, body\.live-mode #pl-fwd \{ display: none; \}/);
});
