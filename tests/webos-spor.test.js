// LG webOS spor (lig öncelikli): lig haftası, puan durumu, canlı, takım maçları, yayın akışından kanal eşleme. Hiçbir şey kendiliğinden yüklenmez.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HAFTA_YETER, createSporVeri, kanalAdlari, kanalHaritasi, kullaniciKanallari, haftaBasi, haftaKaydir, haftaGunleri, haftaEtiketi, ULKE_LIGLERI, AVRUPA_LIGLERI } from '../webos/src/spor-veri.js';

const G = 86400000;
const gun0 = new Date(2026, 10, 20).getTime(); // Cuma
const pzt0 = new Date(2026, 10, 16).getTime(); // o haftanın pazartesisi
const maç = (id, t, h, a, ek = {}) => ({ id, lg: 'tur.1', t, state: 'pre', text: '', home: { name: h, label: h, score: null }, away: { name: a, label: a, score: null }, ...ek });

// espn: lig kimliği → maç dizisi | Error; ls/mk: dizi | Error
function kur({ espn = {}, ls, mk, sched, tv, tablo, saat = 12, ozetHata = null } = {}) {
  const say = { espn: 0, ls: 0, mk: 0, sched: 0, tv: 0, tablo: 0 };
  const cagrilar = [];
  let t = gun0 + saat * 3600e3;
  const deps = {
    loadEspn: async (o) => {
      say.espn++;
      cagrilar.push(o);
      const id = o.leagues[0].id;
      const r = espn[id];
      if (r instanceof Error) throw r;
      if (r === undefined && espn['*'] instanceof Error) throw espn['*'];
      return { matches: r || [], okCount: 1, failed: [] };
    },
    loadTablo: async ({ slug }) => {
      say.tablo++;
      if (tablo instanceof Error) throw tablo;
      return tablo || [{ name: '', rows: [{ name: slug, rank: 1, pts: 3 }] }];
    },
    loadLs: async ({ dayMs } = {}) => {
      say.ls++;
      if (ls instanceof Error) throw ls;
      return { matches: typeof ls === 'function' ? ls(dayMs) : ls || [] };
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
    loadSummary: async ({ match, proje }) => {
      say.ozet = (say.ozet || 0) + 1;
      cagrilar.push({ ozet: match.id, proje });
      if (ozetHata) throw ozetHata;
      return { events: [{ kind: 'goal', minute: "12'", side: 'home', player: 'X', score: '1–0' }] };
    },
    loadTv: async () => {
      say.tv++;
      if (tv instanceof Error) throw tv;
      return { events: tv || [] };
    },
  };
  const kayit = [];
  const v = createSporVeri({}, { now: () => t, deps, hatira: {}, hatiraKaydet: (h) => kayit.push(h) });
  return { v, say, cagrilar, kayit, ilerle: (ms) => (t += ms) };
}

test('spor: hafta yardımcıları — pazartesi başlangıcı, kaydırma, yedi gün, etiket', () => {
  assert.equal(haftaBasi(gun0 + 15 * 3600e3), pzt0, 'cuma → o haftanın pazartesisi');
  assert.equal(haftaBasi(pzt0), pzt0);
  assert.equal(haftaBasi(pzt0 + 6 * G + 23 * 3600e3), pzt0, 'pazar gecesi hâlâ aynı hafta');
  assert.equal(haftaBasi(pzt0 + 7 * G), pzt0 + 7 * G);
  assert.equal(haftaKaydir(pzt0, 1), pzt0 + 7 * G);
  assert.equal(haftaKaydir(pzt0, -2), pzt0 - 14 * G);
  const g = haftaGunleri(pzt0);
  assert.equal(g.length, 7);
  assert.equal(g[6], pzt0 + 6 * G);
  assert.equal(haftaEtiketi(pzt0, gun0), 'Bu hafta · 16–22 Kas');
  assert.equal(haftaEtiketi(haftaKaydir(pzt0, 1), gun0), 'Gelecek hafta · 23–29 Kas');
  assert.equal(haftaEtiketi(haftaKaydir(pzt0, -1), gun0), 'Geçen hafta · 9–15 Kas');
  assert.equal(haftaEtiketi(haftaKaydir(pzt0, 2), gun0), '30 Kas – 6 Ara', 'ay değişirse iki ay yazılır');
});

test('spor: lig haftası tek istektir (yalnız o lig, o hafta), önbellek taze kaldıkça yeniden istenmez, zorla yeniler, eşzamanlılar birleşir', async () => {
  const e = [maç('a', gun0 + 20 * 3600e3, 'Galatasaray', 'Fenerbahçe')];
  const { v, say, cagrilar, kayit, ilerle } = kur({ espn: { 'tur.1': e } });
  const [x, y] = await Promise.all([v.hafta('tur.1', pzt0), v.hafta('tur.1', pzt0)]);
  assert.equal(say.espn, 1, 'eşzamanlı istekler birleşir');
  assert.deepEqual(x, y);
  assert.equal(x.length, 1);
  const o = cagrilar[0];
  assert.deepEqual(o.leagues.map((l) => l.id), ['tur.1'], 'yalnız seçilen lig');
  assert.equal(o.now, pzt0);
  assert.equal(o.back, 0);
  assert.equal(o.ahead, 6, 'pazartesiden pazara yedi gün');
  assert.equal(o.parallel, 1);
  assert.ok(kayit.length >= 1, 'adres basamağı belleği kaydedilir');
  await v.hafta('tur.1', pzt0);
  assert.equal(say.espn, 1, 'taze önbellek');
  await v.hafta('tur.1', haftaKaydir(pzt0, 1));
  assert.equal(say.espn, 2, 'başka hafta ayrı istek');
  await v.hafta('tur.1', pzt0, true);
  assert.equal(say.espn, 3, 'zorla');
  ilerle(6 * 60000);
  await v.hafta('tur.1', pzt0);
  assert.equal(say.espn, 4, 'süre dolunca yenilenir');
});

test('spor: lig haftası alınamazsa hata atar; eski liste varsa o gösterilir; bilinmeyen lig hata verir', async () => {
  const a = kur({ espn: { 'tur.1': new Error('Maç bilgisi alınamadı') } });
  await assert.rejects(a.v.hafta('tur.1', pzt0), /alınamadı/);
  const b = kur({ espn: { 'tur.1': [maç('a', gun0 + 20 * 3600e3, 'A', 'B')] } });
  await b.v.hafta('tur.1', pzt0);
  b.ilerle(6 * 60000);
  b.cagrilar.length = 0;
  // bundan sonra ESPN düşer
  const v2 = createSporVeri({}, { now: () => gun0 + 12 * 3600e3 + 6 * 60000, deps: { loadEspn: async () => { throw new Error('x'); } } });
  await assert.rejects(v2.hafta('tur.1', pzt0), /x/);
  await assert.rejects(a.v.hafta('yok.1', pzt0), /Bilinmeyen lig/);
});

test('spor: puan durumu tek istektir; tablosu olmayan ligde ağa gidilmez; önbellekli; hata iletilir', async () => {
  const { v, say, ilerle } = kur();
  assert.equal(await v.tablo('fifa.friendly'), null);
  assert.equal(say.tablo, 0, 'tablosuz lig için istek yok');
  const g = await v.tablo('tur.1');
  assert.equal(g[0].rows[0].name, 'tur.1');
  await v.tablo('tur.1');
  assert.equal(say.tablo, 1);
  ilerle(11 * 60000);
  await v.tablo('tur.1');
  assert.equal(say.tablo, 2, '10 dk sonra yenilenir');
  const h = kur({ tablo: new Error('Puan durumu alınamadı') });
  await assert.rejects(h.v.tablo('tur.1'), /Puan durumu/);
});

test('spor: canlı maçlar yalnız oynananlardır; LiveScore düşerse Mackolik; hiçbiri yoksa hata; 45 sn önbellek', async () => {
  const ls = [maç('l1', gun0 + 11 * 3600e3, 'A', 'B', { state: 'in', text: "37'" }), maç('l2', gun0 + 20 * 3600e3, 'C', 'D'), maç('l3', gun0 + 9 * 3600e3, 'E', 'F', { state: 'post', text: 'MS' })];
  const a = kur({ ls });
  const c = await a.v.canli();
  assert.deepEqual(c.map((m) => m.id), ['l1']);
  assert.equal(a.say.mk, 0);
  await a.v.canli();
  assert.equal(a.say.ls, 1, 'önbellek');
  a.ilerle(46000);
  await a.v.canli();
  assert.equal(a.say.ls, 2, '45 sn sonra yenilenir');
  const b = kur({ ls: new Error('LiveScore verisi alınamadı.'), mk: [maç('m1', gun0 + 11 * 3600e3, 'G', 'H', { state: 'in', text: "10'" })] });
  assert.deepEqual((await b.v.canli()).map((m) => m.id), ['m1']);
  const d = kur({ ls: new Error('x'), mk: new Error('y') });
  await assert.rejects(d.v.canli(), /Canlı maç bilgisi alınamadı/);
});

test('spor: gece yarısından sonra canlı maç için dünün günü de sorulur', async () => {
  const { v, say } = kur({ ls: [maç('l1', gun0 - 1800e3, 'A', 'B', { state: 'in', text: "80'" })], saat: 0.5 });
  const c = await v.canli();
  assert.equal(say.ls, 2, 'dün + bugün');
  assert.equal(c.length, 1, 'tekilleştirilir');
});

test('spor: takım maçları — kayıtlı ülke ligi varsa yalnız o ve Avrupa kupaları sorulur', async () => {
  const gs = { n: 'Galatasaray', l: 'Galatasaray', g: 'tur.1' };
  const tur = [maç('t1', gun0 + 2 * G + 18 * 3600e3, 'Galatasaray', 'Fenerbahçe'), maç('t2', gun0 + 3 * G, 'Beşiktaş', 'Trabzonspor')];
  const uefa = [maç('u1', gun0 + 5 * G, 'Galatasaray', 'Ajax', { lg: 'uefa.champions' })];
  const { v, cagrilar } = kur({ espn: { 'tur.1': tur, 'uefa.champions': uefa } });
  const parcalar = [];
  const r = await v.takim(gs, { onPart: (m) => parcalar.push(m.length) });
  assert.deepEqual(cagrilar.map((o) => o.leagues[0].id), ['tur.1', ...AVRUPA_LIGLERI], 'ülke ligi + üç Avrupa kupası, başka lig yok');
  assert.deepEqual(r.matches.map((m) => m.id), ['t1', 'u1'], 'yalnız bu takımın maçları, saat sırasıyla');
  assert.equal(r.lg, 'tur.1');
  assert.deepEqual(parcalar, [1, 2], 'her lig gelince liste kademeli büyür');
  assert.equal(cagrilar[0].back, 7);
  assert.equal(cagrilar[0].ahead, 21);
});

test('spor: ülke ligi kayıtlı değilse ligler sırayla taranır ve takım bulunur bulunmaz durulur', async () => {
  const fav = { n: 'Real Madrid', l: 'Real Madrid' };
  const es = [maç('r1', gun0 + G, 'Real Madrid', 'Sevilla', { lg: 'esp.1' })];
  const { v, cagrilar } = kur({ espn: { 'esp.1': es } });
  const r = await v.takim(fav);
  const sira = cagrilar.map((o) => o.leagues[0].id);
  assert.deepEqual(sira, ['tur.1', 'eng.1', 'esp.1', ...AVRUPA_LIGLERI], 'tur, eng sonra esp: bulununca ita/ger/fra denenmez');
  assert.equal(r.lg, 'esp.1');
  assert.equal(r.matches.length, 1);
  const bos = kur({});
  const r2 = await bos.v.takim({ n: 'Bilinmeyen FK', l: 'Bilinmeyen FK' });
  assert.equal(bos.cagrilar.length, ULKE_LIGLERI.length + AVRUPA_LIGLERI.length, 'bulunamazsa hepsi taranır');
  assert.equal(r2.lg, '');
  assert.deepEqual(r2.matches, []);
});

test('spor: takım maçları — hiçbir lig yanıt vermezse hata; bazı ligler düşse de gelenler yeter', async () => {
  const a = kur({ espn: { '*': new Error('Maç bilgisi alınamadı') } });
  await assert.rejects(a.v.takim({ n: 'Galatasaray', l: 'Galatasaray' }), /alınamadı/);
  const b = kur({ espn: { 'tur.1': [maç('t1', gun0 + G, 'Galatasaray', 'Fenerbahçe')], 'uefa.champions': new Error('x') } });
  const r = await b.v.takim({ n: 'Galatasaray', l: 'Galatasaray', g: 'tur.1' });
  assert.equal(r.matches.length, 1);
  const c = kur({ espn: { 'tur.1': [maç('t1', gun0 + G, 'Galatasaray', 'Fenerbahçe')] } });
  await c.v.takim({ n: 'Galatasaray', l: 'Galatasaray', g: 'tur.1' });
  await c.v.takim({ n: 'Galatasaray', l: 'Galatasaray', g: 'tur.1' });
  assert.equal(c.cagrilar.length, 4, 'ikinci çağrı önbellekten');
});

test('spor: yayinVar ağa gitmez; yayın alınmışsa taze sürece o döner', async () => {
  const satir = [{ id: 's1', t: gun0 + 20 * 3600e3, teams: ['Galatasaray', 'Fenerbahçe'], channels: ['beIN Sports 1'] }];
  const { v, say, ilerle } = kur({ sched: satir });
  assert.equal(v.yayinVar(gun0), null);
  await v.yayin(gun0);
  assert.equal(v.yayinVar(gun0).tur, 'se');
  assert.equal(say.sched, 1);
  ilerle(31 * 60000);
  assert.equal(v.yayinVar(gun0), null, '30 dk sonra bayat');
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

test('spor: başlık "A - B" biçiminde ayrışmasa da (teams yok) kanal bulunur; oynanmış maça kanal yazılmaz', async () => {
  const m1 = maç('e1', gun0 + 20 * 3600e3, 'Galatasaray', 'Fenerbahçe');
  const m2 = { ...maç('e2', gun0 + 17 * 3600e3, 'Beşiktaş', 'Trabzonspor'), state: 'post', text: 'MS' };
  const y = {
    tur: 'se',
    rows: [
      { t: m1.t, title: 'Galatasaray Fenerbahçe derbisi (Süper Lig)', teams: null, channels: ['beIN Sports 1', 'TRT Spor'] },
      { t: m2.t, title: 'Beşiktaş - Trabzonspor', teams: ['Beşiktaş', 'Trabzonspor'], channels: ['S Sport'] },
    ],
  };
  const h = await kanalHaritasi([m1, m2], y);
  assert.deepEqual(h.e1, ['beIN Sports 1', 'TRT Spor']);
  assert.equal(h.e2, undefined, 'bitmiş maçın yayını gösterilmez');
  assert.deepEqual(await kanalHaritasi([m1], null), {}, 'yayın bilgisi yoksa boş harita');
});

test('spor: kanal eşleme dilimlidir (arada olay döngüsüne döner), hesaplananı atlar ve aktif() false olunca durur', async () => {
  const y = { tur: 'se', rows: [] };
  const ms = [];
  for (let i = 0; i < 400; i++) ms.push(maç('x' + i, gun0 + (10 + (i % 10)) * 3600e3, 'Takım' + i, 'Rakip' + i));
  let araVerildi = 0;
  const kalem = setInterval(() => araVerildi++, 0); // olay döngüsü dönerse sayaç artar
  const hazir = {};
  await kanalHaritasi(ms, y, { hazir, dilimMs: 0 }); // her maçtan sonra bırakır
  clearInterval(kalem);
  assert.ok(araVerildi > 5, 'olay döngüsüne dönüldü: ' + araVerildi);
  assert.equal(Object.keys(hazir).length, 400);
  let cagri = 0;
  await kanalHaritasi(ms, y, { hazir, parca: () => cagri++ });
  assert.equal(cagri, 0, 'hazır maçlar yeniden hesaplanmaz');
  const hazir2 = {};
  let sayi = 0;
  await kanalHaritasi(ms, y, { hazir: hazir2, dilimMs: 0, aktif: () => ++sayi < 3 });
  assert.ok(Object.keys(hazir2).length < 400, 'aktif() false olunca kalan işlenmez');
});


test('spor: ESPN haftayı eksik verirse maçsız günler ikinci kaynaktan tamamlanır (yalnız o lig, yalnız boş günler); tam haftaya dokunulmaz', async () => {
  const ESPN_MAC = [maç('e1', pzt0 + 4 * G + 18 * 3600e3, 'A', 'B'), maç('e2', pzt0 + 4 * G + 20 * 3600e3, 'C', 'D')]; // yalnız cuma
  const ls = (gun) => {
    const i = Math.round((gun - pzt0) / G);
    return [
      maç('l' + i, gun + 19 * 3600e3, 'T' + i, 'U' + i), // bu lig
      maç('x' + i, gun + 19 * 3600e3, 'Y', 'Z', { lg: 'eng.1' }), // başka lig: eklenmez
    ];
  };
  const { v, say } = kur({ espn: { 'tur.1': ESPN_MAC }, ls });
  const ml = await v.hafta('tur.1', pzt0);
  assert.equal(ml.length, 2);
  const parcalar = [];
  const son = await v.haftaEk('tur.1', pzt0, ml, { onPart: (x) => parcalar.push(x.length) });
  assert.equal(say.ls, 6, 'cuma dışındaki altı gün sorulur');
  assert.equal(son.length, 2 + 6, 'her boş güne bu ligin bir maçı eklendi, başka lig eklenmedi');
  assert.deepEqual(parcalar, [3, 4, 5, 6, 7, 8], 'liste gün gün büyür');
  assert.ok(son.every((m) => m.lg === 'tur.1'));
  assert.ok(son.every((m, i) => i === 0 || son[i - 1].t <= m.t), 'saat sırasında');
  // tamamlanmış hafta ağa gitmez; hafta() önbelleği tamamlanmış listeyi verir
  assert.equal((await v.haftaEk('tur.1', pzt0, ml)).length, 8);
  assert.equal(say.ls, 6);
  assert.equal((await v.hafta('tur.1', pzt0)).length, 8);
  // yeterli maç varsa ikinci kaynağa gidilmez
  const dolu = Array.from({ length: HAFTA_YETER }, (_, i) => maç('d' + i, pzt0 + i * G + 18 * 3600e3, 'P' + i, 'Q' + i));
  const k2 = kur({ espn: { 'tur.1': dolu }, ls });
  const m2 = await k2.v.hafta('tur.1', pzt0);
  assert.equal((await k2.v.haftaEk('tur.1', pzt0, m2)).length, HAFTA_YETER);
  assert.equal(k2.say.ls, 0);
});

test('spor: hafta tamamlama aktif() false olunca durur; ikinci kaynak düşerse eldeki liste bozulmaz', async () => {
  const ls = (gun) => [maç('l' + gun, gun + 19 * 3600e3, 'T', 'U')];
  const k = kur({ espn: { 'tur.1': [maç('e1', pzt0 + 4 * G + 18 * 3600e3, 'A', 'B')] }, ls });
  const ml = await k.v.hafta('tur.1', pzt0);
  let n = 0;
  const yari = await k.v.haftaEk('tur.1', pzt0, ml, { aktif: () => ++n <= 3 });
  assert.ok(yari.length >= 2 && yari.length < 7, 'yarıda kesildi (' + yari.length + ')');
  const dusuk = kur({ espn: { 'tur.1': [maç('e1', pzt0 + 4 * G + 18 * 3600e3, 'A', 'B')] }, ls: new Error('LS yok'), mk: new Error('MK yok') });
  const m3 = await dusuk.v.hafta('tur.1', pzt0);
  const s3 = await dusuk.v.haftaEk('tur.1', pzt0, m3);
  assert.equal(s3.length, 1, 'ikinci kaynak yoksa ESPN listesi olduğu gibi kalır');
});

test('spor: maç olayları — ESPN maçı doğrudan özetten, ESPN dışı kaynak ligin o günkü ESPN listesiyle eşlenir, başlamamış maç ağa gitmez', async () => {
  const t = gun0 + 20 * 3600e3;
  const espnM = maç('tur.1:55', t, 'Galatasaray', 'Fenerbahçe', { state: 'in' });
  const { v, say, cagrilar } = kur({ espn: { 'tur.1': [espnM] } });
  // ESPN kimlikli maç: doğrudan özet, budanmış istenir
  const a = await v.ozet(espnM);
  assert.equal(a.durum, 'ok');
  assert.equal(a.events.length, 1);
  assert.equal(say.espn, 0);
  assert.deepEqual(cagrilar.filter((c) => c.ozet), [{ ozet: 'tur.1:55', proje: 'espn-ozet' }]);
  // canlı maç 45 sn önbellekli
  await v.ozet(espnM);
  assert.equal(say.ozet, 1);
  // LiveScore kimlikli aynı maç: ESPN günlük listesinden eşlenir
  const ls = maç('ls:99', t + 60000, 'Galatasaray SK', 'Fenerbahce', { state: 'post', text: 'MS' });
  const b = await v.ozet(ls);
  assert.equal(b.durum, 'ok');
  assert.equal(say.espn, 1, 'ligin o günkü ESPN listesi istendi');
  assert.equal(cagrilar.filter((c) => c.ozet).pop().ozet, 'tur.1:55', 'eşleşen ESPN maçının özeti alındı');
  // eşleşme yok → olay yok
  const baska = maç('ls:7', t, 'Rize', 'Konya', { state: 'post' });
  assert.equal((await v.ozet(baska)).durum, 'yok');
  // başlamamış ya da ertelenmiş maç: ağ yok
  const onceki = say.espn + say.ozet;
  assert.equal((await v.ozet(maç('tur.1:1', t, 'A', 'B', { state: 'pre' }))).durum, 'baslamadi');
  assert.equal((await v.ozet(maç('tur.1:2', t, 'A', 'B', { state: 'post', off: true }))).durum, 'baslamadi');
  assert.equal(say.espn + say.ozet, onceki);
});

test('spor: maç olayları — özet alınamazsa hata atar (ekran "alınamadı" yazar)', async () => {
  const { v } = kur({ ozetHata: new Error('Maç ayrıntısı alınamadı'), espn: { 'tur.1': [] } });
  await assert.rejects(() => v.ozet(maç('tur.1:5', gun0, 'A', 'B', { state: 'post' })), /alınamadı/);
});
