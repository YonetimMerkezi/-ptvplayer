// LG webOS spor (lig öncelikli): lig haftası, puan durumu, canlı, takım maçları, yayın akışından kanal eşleme. Hiçbir şey kendiliğinden yüklenmez.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TUR_ESPN_GUN, createSporVeri, kanalAdlari, kanalHaritasi, kullaniciKanallari, ULKE_LIGLERI, AVRUPA_LIGLERI } from '../webos/src/spor-veri.js';
import { gunEkle } from '../www/js/sports-tur.js';

const G = 86400000;
const gun0 = new Date(2026, 10, 20).getTime(); // Cuma
// LiveScore/Mackolik maçı: lg ESPN kimliği değil kaynağa özgüdür; lig, yarışma adından ve grubundan eşlenir
const lsMaç = (id, t, h, a, ek = {}) => maç(id, t, h, a, { lg: 'ls:turkey-super-lig', lgName: 'Türkiye · Süper Lig', grp: 'tr', src: 'ls', ...ek });
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
      return { matches: r || [], okCount: 1, failed: [], level: espn.__level || 0 };
    },
    loadTablo: async ({ slug }) => {
      say.tablo++;
      if (tablo instanceof Error) throw tablo;
      return tablo || [{ name: '', rows: [{ name: slug, rank: 1, pts: 3 }] }];
    },
    loadLs: async ({ dayMs, filtre } = {}) => {
      say.ls++;
      (say.filtreler = say.filtreler || []).push(filtre);
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

test('spor: canlı liste LiveScore\'dan yalnız süren maç süzgeciyle istenir', async () => {
  const k = kur({ ls: [lsMaç('l1', gun0 + 12 * 3600e3, 'T', 'U', { state: 'in', text: "67'" })] });
  const c = await k.v.canli(true);
  assert.equal(c.length, 1);
  assert.deepEqual(k.say.filtreler, ['x=1']);
});


// ---- maç haftası (turAl): Süper Lig gibi ligler cuma–pazartesi oynanır; hafta takvim haftası değil, ligin turudur ----
const gunBas = (ms) => new Date(ms).setHours(0, 0, 0, 0);
const TAKIM = ['Aslan', 'Bora', 'Çelik', 'Deniz', 'Ege', 'Fırat'];
// Hafta n: cuma, cumartesi, pazartesi (3 maç; her takım bir kez). Hafta 13: 20/21/23 Kas (bugün cuma 20 Kas), 14: 27/28/30 Kas, 12: 13/14/16 Kas
function turMaclari(n, gunler, ek = {}) {
  const esler = n % 2 ? [[0, 1], [2, 3], [4, 5]] : [[0, 2], [1, 4], [3, 5]];
  return esler.map((e, i) => lsMaç('h' + n + '-' + i, new Date(2026, 10, gunler[i], 20, 0).getTime(), TAKIM[e[0]], TAKIM[e[1]], { round: n + '. hafta', ...ek }));
}
const SUPER = [...turMaclari(12, [13, 14, 16]), ...turMaclari(13, [20, 21, 23]), ...turMaclari(14, [27, 28, 30])];
const gunluk = (hepsi) => (gun) => hepsi.filter((m) => gunBas(m.t) === gun);

test('spor: maç haftası — cuma–pazartesi maçları tek haftadır (pazartesi dahil), günler ikinci kaynaktan gelir, ESPN\'e gidilmez, ülke süzgeci istenir', async () => {
  const { v, say } = kur({ ls: gunluk(SUPER) });
  const r = await v.turAl('tur.1');
  assert.equal(r.tur.no, 13);
  assert.equal(r.tur.maclar.length, 3);
  assert.equal(r.tur.bas, new Date(2026, 10, 20).getTime());
  assert.equal(r.tur.son, new Date(2026, 10, 23).getTime(), 'pazartesi maçı aynı haftada');
  assert.equal(say.espn, 0);
  assert.ok(say.filtreler.every((f) => f === 'u=turkey,turkiye'));
  assert.ok(r.tur.maclar.every((m) => m.ligId === 'tur.1'), 'olay eşlemesi için lig kimliği işlenir');
  assert.equal(r.kaynak, 'ikinci');
  assert.ok(say.ls <= 12, 'yalnız gerekli günler istendi (' + say.ls + ')');
});

test('spor: maç haftası — sonraki / önceki hafta komşu turdur (takvim haftası atlamaz); alınan günler yeniden istenmez', async () => {
  const { v, say } = kur({ ls: gunluk(SUPER) });
  const bu = await v.turAl('tur.1');
  const sonraki = await v.turAl('tur.1', { merkez: gunEkle(bu.tur.son, 1), yon: 1 });
  assert.equal(sonraki.tur.no, 14);
  assert.equal(sonraki.tur.maclar.length, 3);
  const onceki = await v.turAl('tur.1', { merkez: gunEkle(bu.tur.bas, -1), yon: -1 });
  assert.equal(onceki.tur.no, 12);
  const once = say.ls;
  await v.turAl('tur.1', { merkez: gunEkle(bu.tur.son, 1), yon: 1 });
  assert.equal(say.ls, once, 'gün listeleri taze: ağa gidilmedi');
  // sezon sonu: bu yönde tur yok
  const son = await v.turAl('tur.1', { merkez: gunEkle(sonraki.tur.son, 1), yon: 1 });
  assert.equal(son.tur, null);
  assert.equal(son.yok, true);
});

test('spor: maç haftası — önbellek 10 dk, zorla yeniler; liste gün geldikçe onPart ile büyür', async () => {
  const { v, say, ilerle } = kur({ ls: gunluk(SUPER) });
  const parcalar = [];
  await v.turAl('tur.1', { onPart: (ml) => parcalar.push(ml.length) });
  assert.ok(parcalar.length >= 1 && parcalar[parcalar.length - 1] === 3, 'son parça tam hafta: ' + parcalar);
  assert.ok(parcalar.every((n, i) => i === 0 || parcalar[i - 1] <= n), 'liste yalnız büyür');
  const n1 = say.ls;
  await v.turAl('tur.1');
  assert.equal(say.ls, n1, 'taze önbellek');
  await v.turAl('tur.1', { zorla: true });
  assert.ok(say.ls > n1, 'zorla');
  const n2 = say.ls;
  ilerle(11 * 60000);
  await v.turAl('tur.1');
  assert.ok(say.ls > n2, 'süre dolunca yenilenir');
});

test('spor: maç haftası — yalnız bu ligin maçları (başka lig ve başka ülke eklenmez); aktif() false olunca durur', async () => {
  const baska = (gun) => [lsMaç('p' + gun, gun + 19 * 3600e3, 'Y', 'Z', { lg: 'ls:england-premier-league', lgName: 'İngiltere · Premier League', grp: 'eu', round: '13. hafta' })];
  const { v } = kur({ ls: (gun) => gunluk(SUPER)(gun).concat(baska(gun)) });
  const r = await v.turAl('tur.1');
  assert.equal(r.tur.maclar.length, 3);
  assert.ok(r.tur.maclar.every((m) => m.lgName === 'Türkiye · Süper Lig'));
  const k = kur({ ls: gunluk(SUPER) });
  let n = 0;
  const yarim = await k.v.turAl('tur.1', { aktif: () => ++n <= 2 });
  assert.equal(yarim.iptal, true);
  assert.ok(k.say.ls <= 3);
});

test('spor: maç haftası — alt ligler (Türkiye 1./2. Lig) ESPN\'e gitmeden aynı gün listelerinden kurulur; grup adı korunur', async () => {
  const lig = (ad, lgName, lg, n, gunler) => [0, 1, 2].map((i) => lsMaç(ad + n + i, new Date(2026, 10, gunler[i], 15, 0).getTime(), ad + 'A' + i, ad + 'B' + i, { lg, lgName, round: n + '. hafta' }));
  const hepsi = [
    ...lig('b', 'Türkiye · 2. Lig: Beyaz Grup', 'ls:turkey-2-lig-beyaz-grup', 15, [20, 21, 22]),
    ...lig('k', 'Türkiye · 1. Lig', 'ls:turkey-1-lig', 15, [20, 21, 22]),
    ...SUPER,
  ];
  const { v, say } = kur({ ls: gunluk(hepsi) });
  const iki = await v.turAl('tff.2');
  assert.equal(say.espn, 0);
  assert.equal(iki.tur.no, 15);
  assert.equal(iki.tur.maclar.length, 3);
  assert.ok(iki.tur.maclar.every((m) => /2\. Lig: Beyaz Grup/.test(m.lgName)));
  assert.ok(say.filtreler.every((f) => f === 'u=turkey,turkiye'));
  const n = say.ls;
  const bir = await v.turAl('tff.1');
  assert.equal(bir.tur.maclar.length, 3);
  assert.ok(bir.tur.maclar.every((m) => m.lgName === 'Türkiye · 1. Lig'));
  assert.equal(say.ls, n, '1. Lig aynı gün listelerinden (önbellekli) kuruldu');
});

test('spor: maç haftası — LiveScore düşerse Mackolik (Türkiye ligleri); numara yoksa 0, sonraki LiveScore denemesi 10 dk yapılmaz', async () => {
  const mk = SUPER.map((m) => ({ ...m, round: '', src: 'mk' }));
  const { v, say } = kur({ ls: new Error('LS yok'), mk });
  const r = await v.turAl('tur.1');
  assert.equal(r.tur.maclar.length, 3);
  assert.equal(r.tur.no, 0, 'Mackolik hafta numarası vermez (ekran puan durumundan ya da komşudan çıkarır)');
  assert.equal(say.ls, 1, 'LiveScore bir kez denendi');
  assert.ok(say.mk >= 3);
});

test('spor: maç haftası — Türkiye dışı ligde LiveScore düşünce Mackolik sorulmaz, ESPN penceresine düşülür; ESPN de yoksa hata', async () => {
  const e = ['a', 'b', 'c'].map((s, i) => maç('eng.1:' + s, new Date(2026, 10, 21 + i, 16, 0).getTime(), 'Kırmızı' + i, 'Mavi' + i, { lg: 'eng.1' }));
  const k = kur({ ls: new Error('LS yok'), espn: { 'eng.1': e } });
  const r = await k.v.turAl('eng.1');
  assert.equal(r.kaynak, 'espn');
  assert.equal(r.tur.maclar.length, 3);
  assert.equal(k.say.mk, 0, 'Mackolik İngiltere ligini bilmez');
  assert.equal(k.say.espn, 1);
  assert.equal(k.cagrilar[0].back, TUR_ESPN_GUN);
  assert.equal(k.cagrilar[0].ahead, TUR_ESPN_GUN);
  const hic = kur({ ls: new Error('LS yok'), espn: { 'eng.1': new Error('ESPN yok') } });
  await assert.rejects(hic.v.turAl('eng.1'), /alınamadı/);
  const tff = kur({ ls: new Error('LS yok'), mk: new Error('MK yok') });
  await assert.rejects(tff.v.turAl('tff.1'), /alınamadı/);
  await assert.rejects(tff.v.turAl('yok.1'), /Bilinmeyen lig/);
});

test('spor: maç haftası — ESPN\'de aralık adresi hatırası "yalnız bugün" ise ESPN yedeği sıfırdan dener; aralık çalışırsa hatıra onarılır', async () => {
  const hatira = { 'u|v': 2, 'u|v#oy': [0, 2, 2] };
  const cagri = [];
  const t = gun0 + 12 * 3600e3;
  const deps = {
    loadEspn: async (o) => {
      cagri.push(Object.assign({}, o.hatira));
      return { matches: [], okCount: 1, failed: [], level: 0 };
    },
    loadTablo: async () => [],
    loadLs: async () => ({ matches: [] }),
    loadMk: async () => ({ matches: [] }),
  };
  const kayit = [];
  const v = createSporVeri({}, { now: () => t, deps, hatira, hatiraKaydet: (h) => kayit.push(Object.assign({}, h)) });
  const r = await v.turAl('eng.1');
  assert.equal(r.tur, null);
  assert.equal(cagri[0]['u|v'], 0, 'istek hatırasız başladı (en yalın adrese inilmedi)');
  assert.equal(hatira['u|v'], 0, 'aralık adresi çalıştı: kalıcı hatıra onarıldı');
  assert.ok(kayit.length >= 1);
});

test('spor: maç olayları — ikinci kaynaktan gelen maç, Lig sekmesinde işlenen lig kimliğiyle ESPN listesinden eşlenir', async () => {
  const t = gun0 + 20 * 3600e3;
  const espnM = maç('tur.1:55', t, 'Galatasaray', 'Fenerbahçe', { state: 'post' });
  const { v, say, cagrilar } = kur({ espn: { 'tur.1': [espnM] } });
  const ls = maç('ls:turkey-super-lig:99', t + 60000, 'Galatasaray SK', 'Fenerbahce', { lg: 'ls:turkey-super-lig', ligId: 'tur.1', state: 'post', text: 'MS' });
  const b = await v.ozet(ls);
  assert.equal(b.durum, 'ok');
  assert.equal(say.espn, 1);
  assert.equal(cagrilar.filter((c) => c.ozet).pop().ozet, 'tur.1:55');
  const yok = await v.ozet(maç('ls:turkey-super-lig:7', t, 'Rize', 'Konya', { lg: 'ls:turkey-super-lig', state: 'post' }));
  assert.equal(yok.durum, 'yok', 'lig kimliği yoksa (ligId) eşleme denenmez');
});
