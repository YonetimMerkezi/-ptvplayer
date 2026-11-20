// LG webOS spor: kaynak sırası (ESPN + LiveScore → Mackolik), önbellek, yayın akışından kanal eşleme.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSporVeri, kanalAdlari, kanalHaritasi, kullaniciKanallari } from '../webos/src/spor-veri.js';

const G = 86400000;
const gun0 = new Date(2026, 10, 20).getTime();
const maç = (id, t, h, a) => ({ id, lg: 'tur.1', t, state: 'pre', text: '', home: { name: h, label: h, score: null }, away: { name: a, label: a, score: null } });

function kur({ espn, ls, mk, sched, tv, birlestir } = {}) {
  const say = { espn: 0, ls: 0, mk: 0, sched: 0, tv: 0 };
  let t = gun0 + 12 * 3600e3;
  const deps = {
    loadEspn: async () => {
      say.espn++;
      if (espn instanceof Error) throw espn;
      return { matches: espn || [] };
    },
    loadLs: async () => {
      say.ls++;
      if (ls instanceof Error) throw ls;
      return { matches: ls || [] };
    },
    loadMk: async () => {
      say.mk++;
      if (mk instanceof Error) throw mk;
      return { matches: mk || [] };
    },
    loadSched: async () => {
      say.sched++;
      if (sched instanceof Error) throw sched;
      return { rows: sched || [] };
    },
    loadTv: async () => {
      say.tv++;
      if (tv instanceof Error) throw tv;
      return { events: tv || [] };
    },
  };
  if (birlestir) deps.birlestir = birlestir;
  const v = createSporVeri({}, { now: () => t, deps });
  return { v, say, ilerle: (ms) => (t += ms) };
}

test('spor: günün maçları ESPN ve ikinci kaynaktan birleşir, yalnız o güne ait olanlar döner', async () => {
  const e = [maç('e1', gun0 + 20 * 3600e3, 'Galatasaray', 'Fenerbahçe'), maç('e2', gun0 + G + 20 * 3600e3, 'Beşiktaş', 'Trabzonspor')];
  const l = [maç('l1', gun0 + 15 * 3600e3, 'Bursaspor', 'Sakaryaspor')];
  const { v, say } = kur({ espn: e, ls: l, birlestir: (a, b) => ({ matches: a.concat(b) }) });
  const gun = await v.maclar(gun0);
  assert.deepEqual(gun.map((m) => m.id).sort(), ['e1', 'l1']);
  assert.equal(say.mk, 0, 'LiveScore çalışırken Mackolik denenmez');
});

test('spor: LiveScore düşerse Mackolik denenir; LiveScore 10 dk sonra yeniden denenir', async () => {
  const { v, say, ilerle } = kur({ espn: [], ls: new Error('ls yok'), mk: [maç('m1', gun0 + 18 * 3600e3, 'A', 'B')], birlestir: (a, b) => ({ matches: a.concat(b) }) });
  assert.deepEqual((await v.maclar(gun0)).map((m) => m.id), ['m1']);
  assert.equal(say.ls, 1);
  assert.equal(say.mk, 1);
  await v.maclar(gun0 + G, true);
  assert.equal(say.ls, 1, 'kısa süre önce düşen LiveScore tekrar denenmez');
  ilerle(11 * 60000);
  await v.maclar(gun0 + 2 * G, true);
  assert.equal(say.ls, 2, '10 dakika sonra yeniden denenir');
});

test('spor: ESPN düşse de ikinci kaynak yeter; hiçbiri yoksa hata, ESPN hatası iletilir', async () => {
  const a = kur({ espn: new Error('espn 403'), ls: [maç('l1', gun0 + 18 * 3600e3, 'A', 'B')], birlestir: (x, y) => ({ matches: x.concat(y) }) });
  assert.equal((await a.v.maclar(gun0)).length, 1);
  const b = kur({ espn: new Error('espn 403'), ls: new Error('x'), mk: new Error('y') });
  await assert.rejects(() => b.v.maclar(gun0), /espn 403/);
});

test('spor: önbellek taze kaldıkça yeniden istenmez, zorla ve süre sonunda yenilenir; eş zamanlı istekler birleşir', async () => {
  const { v, say, ilerle } = kur({ espn: [maç('e1', gun0 + 20 * 3600e3, 'A', 'B')], ls: [] });
  await Promise.all([v.maclar(gun0), v.maclar(gun0)]);
  assert.equal(say.espn, 1);
  await v.maclar(gun0);
  assert.equal(say.espn, 1, 'taze önbellek');
  await v.maclar(gun0, true);
  assert.equal(say.espn, 2, 'zorla yenileme');
  ilerle(6 * 60000);
  await v.maclar(gun0);
  assert.equal(say.espn, 3, '5 dakika sonra eskir');
});

test('spor: yayın akışı önce Spor Ekranı, olmazsa TheSportsDB; ikisi de yoksa null', async () => {
  const satir = [{ id: 's1', t: gun0 + 20 * 3600e3, teams: ['Galatasaray', 'Fenerbahçe'], channels: ['beIN Sports 1', 'TRT Spor'] }];
  const a = kur({ sched: satir });
  const y = await a.v.yayin(gun0);
  assert.equal(y.tur, 'se');
  assert.equal(a.say.tv, 0);
  const b = kur({ sched: new Error('x'), tv: [{ home: 'Galatasaray', away: 'Fenerbahçe', channel: 'S Sport', t: gun0 + 20 * 3600e3 }] });
  assert.equal((await b.v.yayin(gun0)).tur, 'tsdb');
  const c = kur({ sched: new Error('x'), tv: new Error('y') });
  assert.equal(await c.v.yayin(gun0), null);
});

test('spor: maç → kanal adları (takım ve saat eşleşmesi) → kullanıcının canlı kanalları', async () => {
  const m = maç('e1', gun0 + 20 * 3600e3, 'Galatasaray', 'Fenerbahçe');
  const y = { tur: 'se', rows: [{ t: gun0 + 20 * 3600e3 + 600e3, title: 'Galatasaray - Fenerbahçe (Süper Lig)', teams: ['Galatasaray', 'Fenerbahçe'], channels: ['beIN Sports 1'] }, { t: gun0 + 20 * 3600e3, title: 'Beşiktaş - Trabzonspor', teams: ['Beşiktaş', 'Trabzonspor'], channels: ['S Sport'] }] };
  assert.deepEqual(kanalAdlari(m, y), ['beIN Sports 1']);
  assert.deepEqual(kanalAdlari({ ...m, t: m.t + 6 * 3600e3 }, y), [], 'saat farkı büyükse eşleşmez');
  assert.deepEqual(kanalAdlari(m, null), []);
  const canli = [{ name: 'TR: BEIN SPORTS 1 HD' }, { name: 'TR: TRT 1 HD' }, { name: 'TR: BEIN SPORTS 2 HD' }];
  const hits = kullaniciKanallari(canli, ['beIN Sports 1']);
  assert.equal(hits[0].name, 'TR: BEIN SPORTS 1 HD');
  assert.ok(!hits.some((h) => h.name.includes('TRT')));
});

test('spor: başlık "A - B" biçiminde ayrışmasa da (teams yok) kanal bulunur; oynanmış maça kanal yazılmaz', () => {
  const m1 = maç('e1', gun0 + 20 * 3600e3, 'Galatasaray', 'Fenerbahçe');
  const m2 = { ...maç('e2', gun0 + 17 * 3600e3, 'Beşiktaş', 'Trabzonspor'), state: 'post', text: 'MS' };
  const y = {
    tur: 'se',
    rows: [
      { t: m1.t, title: 'Galatasaray Fenerbahçe derbisi (Süper Lig)', teams: null, channels: ['beIN Sports 1', 'TRT Spor'] },
      { t: m2.t, title: 'Beşiktaş - Trabzonspor', teams: ['Beşiktaş', 'Trabzonspor'], channels: ['S Sport'] },
    ],
  };
  const h = kanalHaritasi([m1, m2], y);
  assert.deepEqual(h.e1, ['beIN Sports 1', 'TRT Spor']);
  assert.equal(h.e2, undefined, 'bitmiş maçın yayını gösterilmez');
  assert.deepEqual(kanalHaritasi([m1], null), {}, 'yayın bilgisi yoksa boş harita');
});

test('spor: ESPN yalnız istenen günün penceresini alır; ilk sonuç ikinci kaynak beklenmeden gelir', async () => {
  const istekler = [];
  let lsBitir;
  const ls = new Promise((r) => (lsBitir = r));
  const deps = {
    loadEspn: async (o) => {
      istekler.push(o);
      return { matches: [maç('e1', gun0 + 20 * 3600e3, 'Galatasaray', 'Fenerbahçe')] };
    },
    loadLs: () => ls,
    loadMk: async () => ({ matches: [] }),
    birlestir: (a, b) => ({ matches: a.concat(b) }),
  };
  const v = createSporVeri({}, { now: () => gun0 + 12 * 3600e3, deps });
  const ilkler = [];
  const sonuc = v.maclar(gun0, false, (l) => ilkler.push(l.map((x) => x.id)));
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(ilkler, [['e1']], 'LiveScore hâlâ sürerken ESPN maçları gösterilir');
  lsBitir({ matches: [maç('l1', gun0 + 15 * 3600e3, 'Bursaspor', 'Sakaryaspor')] });
  assert.deepEqual((await sonuc).map((x) => x.id).sort(), ['e1', 'l1']);
  assert.equal(istekler.length, 1);
  assert.equal(istekler[0].back, 0, 'dünü değil yalnız o günü ister');
  assert.equal(istekler[0].ahead, 0, 'gelecek günleri toptan çekmez');
  assert.equal(istekler[0].now, gun0);
});
