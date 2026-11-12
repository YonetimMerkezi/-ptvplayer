import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFavs, sameTeam, isFavSide, hasFavMatch, toggleFav, autoRemindTargets, nextDone, FAV_MAX } from '../www/js/sports-fav.js';
import { matchPlanId } from '../www/js/plan.js';

const side = (name, label = name) => ({ name, label, score: null });
const mk = (t, h, a, extra = {}) => ({ id: `${t}-${h}`, t, state: 'pre', off: false, home: side(h), away: side(a), ...extra });
const NOW = Date.UTC(2026, 10, 12, 12, 0);
const H = 3600e3;

test('takım adı farklı yazılsa da aynı takım sayılır', () => {
  assert.ok(sameTeam('Galatasaray', 'Galatasaray SK'));
  assert.ok(sameTeam('Manchester United', 'Man United'));
  assert.ok(sameTeam('Turkey', 'Türkiye'));
  assert.ok(sameTeam('Fenerbahçe', 'Fenerbahce'));
});

test('benzer ama farklı takımlar karışmaz', () => {
  assert.ok(!sameTeam('Real Madrid', 'Atletico Madrid'));
  assert.ok(!sameTeam('Manchester United', 'Manchester City'));
  assert.ok(!sameTeam('Inter Milan', 'AC Milan'));
  assert.ok(!sameTeam('', 'Galatasaray'));
});

test('cleanFavs bozuk ve yinelenen kayıtları atar, üst sınırı uygular', () => {
  assert.deepEqual(cleanFavs(null), []);
  assert.deepEqual(cleanFavs([{ n: 'Galatasaray' }, { n: 'galatasaray' }, null, { n: '' }, { x: 1 }]), [{ n: 'Galatasaray', l: 'Galatasaray' }]);
  const many = Array.from({ length: 80 }, (_, i) => ({ n: 'Takim ' + i }));
  assert.equal(cleanFavs(many).length, FAV_MAX);
});

test('toggleFav takibi açar ve kapatır; üst sınırda reddeder', () => {
  let r = toggleFav([], side('Galatasaray'));
  assert.equal(r.on, true);
  assert.equal(r.favs.length, 1);
  r = toggleFav(r.favs, side('Galatasaray SK'));
  assert.equal(r.on, false);
  assert.equal(r.favs.length, 0);
  const full = Array.from({ length: FAV_MAX }, (_, i) => ({ n: 'Takim ' + i }));
  const f = toggleFav(full, side('Yeni Takim'));
  assert.equal(f.full, true);
  assert.equal(f.favs.length, FAV_MAX);
});

test('hasFavMatch iki taraftan birine bakar; Türkçe ad da eşleşir', () => {
  const favs = cleanFavs([{ n: 'Turkey' }, { n: 'Galatasaray' }]);
  assert.ok(hasFavMatch(favs, mk(NOW + H, 'Almanya', 'Türkiye')));
  assert.ok(hasFavMatch(favs, mk(NOW + H, 'Galatasaray SK', 'Fenerbahçe')));
  assert.ok(!hasFavMatch(favs, mk(NOW + H, 'Beşiktaş', 'Fenerbahçe')));
  assert.ok(!hasFavMatch([], mk(NOW + H, 'Galatasaray', 'X')));
  assert.ok(isFavSide(favs, { name: 'Turkey', label: 'Türkiye' }));
});

test('autoRemindTargets: yalnız takip edilen, gelecekteki, daha önce kurulmamış maçlar', () => {
  const favs = cleanFavs([{ n: 'Galatasaray' }]);
  const a = mk(NOW + 2 * H, 'Galatasaray', 'Rizespor');
  const b = mk(NOW + 30 * H, 'Fenerbahçe', 'Galatasaray');
  const c = mk(NOW + 3 * H, 'Beşiktaş', 'Trabzonspor'); // takip dışı
  const past = mk(NOW - H, 'Galatasaray', 'Sivas'); // başlamış
  const live = mk(NOW + H, 'Galatasaray', 'Konya', { state: 'in' });
  const far = mk(NOW + 20 * 864e5, 'Galatasaray', 'Bursa'); // ufuk dışı
  const dup = { ...a, id: 'other-source' }; // aynı maç ikinci kaynaktan
  const all = [far, c, b, past, live, dup, a];
  assert.deepEqual(autoRemindTargets(all, favs, { now: NOW }).map((m) => m.t), [a.t, b.t]);
  // daha önce otomatik kurulmuş ya da elle kurulmuş olanlar atlanır
  assert.deepEqual(autoRemindTargets(all, favs, { now: NOW, done: [matchPlanId(a)] }).map((m) => m.t), [b.t]);
  assert.deepEqual(autoRemindTargets(all, favs, { now: NOW, planned: [matchPlanId(a), matchPlanId(b)] }), []);
  assert.deepEqual(autoRemindTargets(all, [], { now: NOW }), []);
  assert.equal(autoRemindTargets(all, favs, { now: NOW, max: 1 }).length, 1);
});

test('nextDone eski maç kimliklerini atar, yenilerini ekler, tekrarı önler', () => {
  const old = `mrem:${NOW - 3 * 864e5}:a:b`;
  const keep = `mrem:${NOW + H}:c:d`;
  const add = `mrem:${NOW + 2 * H}:e:f`;
  assert.deepEqual(nextDone([old, keep], [add, keep], NOW), [keep, add]);
  assert.deepEqual(nextDone(null, [], NOW), []);
});
