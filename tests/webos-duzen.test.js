// LG webOS: kategori sırası, liste sıralaması ve kullanıcı klasörleri (Yeşil tuş menüsü).
import test from 'node:test';
import assert from 'node:assert/strict';

class F {
  constructor(tag) {
    Object.assign(this, { tag, className: '', style: {}, _html: '', textContent: '', children: [], attrs: {}, clientHeight: 600, clientWidth: 800, parentNode: null, nodeType: 1, qs: {}, value: '' });
  }
  set innerHTML(v) {
    this._html = v;
  }
  get innerHTML() {
    return this._html;
  }
  appendChild(c) {
    this.children.push(c);
    c.parentNode = this;
    return c;
  }
  removeChild(c) {
    this.children = this.children.filter((x) => x !== c);
    return c;
  }
  addEventListener() {}
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  getAttribute(k) {
    return k in this.attrs ? this.attrs[k] : null;
  }
  replaceChild(yeni, eski) {
    yeni.parentNode = this;
    return eski;
  }
  querySelector(sel) {
    if (!this.qs[sel]) {
      this.qs[sel] = new F('q');
      this.qs[sel].parentNode = this;
    }
    return this.qs[sel];
  }
  querySelectorAll() {
    return [];
  }
}
globalThis.window = globalThis.window || {};
globalThis.document = { createElement: (t) => new F(t), getElementById: () => null, querySelectorAll: () => [], documentElement: { style: {} }, body: new F('body') };
globalThis.getComputedStyle = () => ({ fontSize: '20px' });

const D = await import('../webos/src/duzen.js');
const { createMenu } = await import('../webos/src/menu.js');
const { ctx, push, pop } = await import('../webos/src/ctx.js');
const { createStore, bellekDepo } = await import('../webos/src/store.js');
const { browseScreen } = await import('../webos/src/screens/browse.js');

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const KATS = [
  { id: '1', name: 'Spor', count: 5 },
  { id: '2', name: 'Haber', count: 3 },
  { id: '3', name: 'Film', count: 9 },
];
const adlar = (l) => l.map((x) => x.name);

test('düzen: kayıtlı sıra yoksa sağlayıcı sırası, klasörler en başta', () => {
  let d = D.bosDuzen();
  assert.deepEqual(adlar(D.kategorileriDuzenle(KATS, d)), ['Spor', 'Haber', 'Film']);
  d = D.klasorEkle(d, '  Sevdiğim   kanallar ', 'a1').d;
  const r = D.kategorileriDuzenle(KATS, d);
  assert.deepEqual(adlar(r), ['Sevdiğim kanallar', 'Spor', 'Haber', 'Film'], 'ad boşlukları sadeleşir');
  assert.equal(r[0].klasor, true);
  assert.equal(r[0].id, 'f:a1');
  assert.equal(r[0].count, 0);
});

test('düzen: kategori taşı (yukarı/aşağı/en üste), A→Z ve sıfırla; yeni kategori sona gelir', () => {
  let d = D.bosDuzen();
  let r = D.kategorileriDuzenle(KATS, d);
  d = D.kategoriTasi(d, r, r[2], 'top');
  r = D.kategorileriDuzenle(KATS, d);
  assert.deepEqual(adlar(r), ['Film', 'Spor', 'Haber']);
  d = D.kategoriTasi(d, r, r[0], 'down');
  r = D.kategorileriDuzenle(KATS, d);
  assert.deepEqual(adlar(r), ['Spor', 'Film', 'Haber']);
  d = D.kategoriTasi(d, r, r[2], 'up');
  r = D.kategorileriDuzenle(KATS, d);
  assert.deepEqual(adlar(r), ['Spor', 'Haber', 'Film']);
  d = D.kategoriAzSirala(d, r, r[0], false);
  r = D.kategorileriDuzenle(KATS, d);
  assert.deepEqual(adlar(r), ['Film', 'Haber', 'Spor']);
  d = D.kategoriAzSirala(d, r, r[0], true);
  assert.deepEqual(adlar(D.kategorileriDuzenle(KATS, d)), ['Spor', 'Haber', 'Film']);
  // sağlayıcıdan sonradan gelen kategori kayıtlı sıranın sonuna eklenir
  const yeni = KATS.concat([{ id: '4', name: 'Belgesel' }]);
  assert.deepEqual(adlar(D.kategorileriDuzenle(yeni, d)), ['Spor', 'Haber', 'Film', 'Belgesel']);
  assert.deepEqual(adlar(D.kategorileriDuzenle(KATS, D.kategoriSifirla(d))), ['Spor', 'Haber', 'Film']);
});

test('düzen: A→Z klasörleri başta tutar; klasör kategoriyle birlikte taşınabilir', () => {
  let d = D.klasorEkle(D.bosDuzen(), 'Zzz', 'z').d;
  let r = D.kategorileriDuzenle(KATS, d);
  d = D.kategoriAzSirala(d, r, r[0], false);
  r = D.kategorileriDuzenle(KATS, d);
  assert.deepEqual(adlar(r), ['Zzz', 'Film', 'Haber', 'Spor']);
  d = D.kategoriTasi(d, r, r[0], 'down'); // klasör bir aşağı
  assert.deepEqual(adlar(D.kategorileriDuzenle(KATS, d)), ['Film', 'Zzz', 'Haber', 'Spor']);
});

test('düzen: klasör ekle/yeniden adlandır/sil; boş ad reddedilir; öğe ekle-çıkar', () => {
  let d = D.bosDuzen();
  assert.equal(D.klasorEkle(d, '   ').klasor, null);
  const k = D.klasorEkle(d, 'Çocuk', 'c1');
  d = k.d;
  assert.equal(D.klasorAdlandir(d, 'c1', '   ').klasorler[0].name, 'Çocuk', 'boş ad adı değiştirmez');
  d = D.klasorAdlandir(d, 'c1', 'Çizgi film');
  assert.equal(D.klasorBul(d, 'c1').name, 'Çizgi film');
  const oge = { id: 7, name: 'Heidi', kind: 'series', logo: 'u', uzun: 'x'.repeat(600), islev: () => 1 };
  let x = D.klasorDegistir(d, 'c1', oge);
  assert.equal(x.acik, true);
  d = x.d;
  assert.equal(D.klasordeMi(d, 'c1', 7), true);
  assert.equal(D.klasordeMi(d, 'c1', '7'), true, 'kimlik tür farkına bakmaz');
  const kayitli = D.klasorOgeleri(d, 'c1')[0];
  assert.equal(kayitli.name, 'Heidi');
  assert.equal(kayitli.uzun.length, 400, 'uzun metin kısaltılır');
  assert.equal('islev' in kayitli, false);
  x = D.klasorDegistir(d, 'c1', oge);
  assert.equal(x.acik, false);
  assert.equal(D.klasorOgeleri(x.d, 'c1').length, 0);
  assert.equal(D.klasorDegistir(d, 'yok', oge).acik, false, 'olmayan klasör sessizce yok sayılır');
  // silinen klasör sıradan da kalkar
  d = D.kategoriTasi(d, D.kategorileriDuzenle(KATS, d), D.kategorileriDuzenle(KATS, d)[0], 'down');
  assert.ok(d.order.indexOf('f:c1') >= 0);
  d = D.klasorSil(d, 'c1');
  assert.equal(d.klasorler.length, 0);
  assert.equal(d.order.indexOf('f:c1'), -1);
});

test('düzen: bozuk kayıt güvenle toparlanır; liste sıralaması kaynağı değiştirmez', () => {
  assert.deepEqual(D.duzenOku(null), D.bosDuzen());
  assert.deepEqual(D.duzenOku('x'), D.bosDuzen());
  const d = D.duzenOku({ sira: 'yok', order: ['g:1', 5, 'g:1'], klasorler: [{ id: 'a', name: ' ', items: [] }, { id: 'b', name: 'Ok', items: [{ id: 1 }, { id: 1 }, null, 3] }, { id: 'b', name: 'Çift' }, null] });
  assert.equal(d.sira, 'default');
  assert.deepEqual(d.order, ['g:1']);
  assert.equal(d.klasorler.length, 1);
  assert.equal(d.klasorler[0].name, 'Ok');
  assert.equal(d.klasorler[0].items.length, 1);
  const kaynak = [{ name: 'b' }, { name: 'a' }, { name: 'c' }];
  const az = D.listeSirala(kaynak, D.siraDegistir(D.bosDuzen(), 'az'));
  assert.deepEqual(adlar(az), ['a', 'b', 'c']);
  assert.deepEqual(adlar(kaynak), ['b', 'a', 'c'], 'kaynak dizi bozulmadı');
  assert.equal(D.siraDegistir(D.bosDuzen(), 'saçma').sira, 'default');
  // Türkçe harfler: ç, ş, ö, ü doğru yerde
  const tr = D.listeSirala([{ name: 'Zeki' }, { name: 'Çiçek' }, { name: 'Cem' }, { name: 'Şeker' }, { name: 'Sema' }], D.siraDegistir(D.bosDuzen(), 'az'));
  assert.deepEqual(adlar(tr), ['Cem', 'Çiçek', 'Sema', 'Şeker', 'Zeki']);
});

test('menü: ▲▼ gezer, OK çalıştırır, alt menü Geri ile bir üste döner, Geri kökten kapatır', () => {
  const host = new F('host');
  const m = createMenu(host);
  const log = [];
  const alt = { baslik: 'Alt', satirlar: [{ ad: 'A1', calis: () => log.push('a1') }] };
  m.ac({
    baslik: 'Ana',
    satirlar: [
      { ad: 'Birinci', calis: () => log.push('b1') },
      { ad: 'Alt menü', calis: () => alt },
      { ad: 'Kal', sag: '✓', calis: () => 'kal' },
    ],
  });
  assert.equal(m.acik, true);
  const html = () => host.children[0]._html;
  assert.match(html(), /Ana/);
  assert.match(html(), /mn-r on"><span>Birinci/);
  m.key('down');
  m.key('ok'); // alt menüye
  assert.match(html(), /Alt/);
  assert.equal(m.key('left'), true, 'açıkken her tuşu menü tüketir');
  m.key('back');
  assert.match(html(), /Ana/, 'Geri bir üst menüye döndü');
  m.key('down');
  m.key('ok'); // 'kal': açık kalır
  assert.equal(m.acik, true);
  assert.match(html(), /✓/);
  m.key('up');
  m.key('up');
  m.key('ok'); // Birinci: çalışır ve kapanır
  assert.deepEqual(log, ['b1']);
  assert.equal(m.acik, false);
  assert.equal(host.children[0].className, 'mn');
  m.ac({ baslik: 'X', satirlar: () => [{ ad: 'y' }] });
  m.key('back');
  assert.equal(m.acik, false);
  assert.equal(m.key('ok'), false, 'kapalıyken tuşu tüketmez');
});

// ---- Gözat ekranı entegrasyonu
const hamKanal = [
  { id: 'c1', name: 'Zeta', kind: 'live', num: 1 },
  { id: 'c2', name: 'Alfa', kind: 'live', num: 2 },
  { id: 'c3', name: 'Mavi', kind: 'live', num: 3 },
];

function kur() {
  ctx.stack.length = 0;
  ctx.root = new F('root');
  ctx.store = createStore(bellekDepo());
  const s = ctx.store.addSource({ type: 'xtream', name: 'D', server: 'http://duz:80', user: 'u', pass: 'p' });
  const t = { istek: [], ad: null, oynat: null };
  ctx._prov = {
    type: 'xtream',
    hasEpg: false,
    categories: async () => [
      { id: 'k1', name: 'Ulusal' },
      { id: 'k2', name: 'Spor' },
      { id: 'k3', name: 'Haber' },
    ],
    hazir: () => false,
    items: async (tur, id) => {
      t.istek.push(id);
      return hamKanal;
    },
  };
  ctx._provId = s.id;
  ctx.reg = {
    ad: (p) => {
      t.ad = p;
      return { el: new F('ad'), name: 'ad', onKey: () => false };
    },
    player: (p) => {
      t.oynat = p;
      return { el: new F('oyn'), name: 'player', onKey: () => false };
    },
  };
  push({ el: new F('alt'), name: 'alt', onKey: () => false });
  const scr = browseScreen({ kind: 'live' });
  push(scr);
  const tus = (...k) => k.forEach((x) => scr.onKey(x));
  const ayar = () => ctx.store.setting('duzen:' + s.id + ':live', null);
  const menu = () => scr.el.children.filter((c) => String(c.className).indexOf('mn') === 0)[0];
  return { scr, t, tus, ayar, menu, s };
}

test('gözat: Yeşil menüyü açar; kategori aşağı taşınır ve kalıcı kaydedilir, içerik yeniden yüklenmez', async () => {
  const { scr, t, tus, ayar, menu } = kur();
  await bekle(900); // ilk kategori ve komşu önyüklemeleri bitsin
  const once = t.istek.length;
  assert.equal(scr.onKey('green'), true);
  assert.match(menu().className, /on/);
  assert.match(menu()._html, /Kategori sırası/);
  assert.doesNotMatch(menu()._html, /Klasöre ekle/, 'kategori sütunundayken öğe satırı yok');
  tus('down', 'ok'); // Kategori sırası
  assert.match(menu()._html, /Aşağı taşı/);
  tus('down', 'ok'); // Aşağı taşı → menü açık kalır
  assert.match(menu().className, /on/);
  assert.deepEqual(ayar().order, ['g:k2', 'g:k1', 'g:k3']);
  tus('ok'); // bir daha aşağı
  assert.deepEqual(ayar().order, ['g:k2', 'g:k3', 'g:k1']);
  tus('back', 'back');
  assert.doesNotMatch(menu().className, /on/);
  await bekle(350);
  assert.equal(t.istek.length, once, 'taşıma içerik isteği yapmaz');
  assert.ok(t.istek.every((x) => String(x).indexOf('f:') !== 0));
});

test('gözat: liste sıralaması uygulanır, başlıkta görünür ve kalıcıdır', async () => {
  const { scr, t, tus, ayar } = kur();
  await bekle(350);
  tus('green', 'ok'); // Liste sıralaması
  tus('down', 'ok'); // A → Z
  assert.equal(ayar().sira, 'az');
  await bekle(60);
  assert.match(scr.el.querySelector('.top h1').textContent, /A→Z/);
  tus('right', 'ok'); // listeye geç, ilk kanalı aç
  assert.deepEqual(
    t.oynat.list.map((x) => x.name),
    ['Alfa', 'Mavi', 'Zeta'],
  );
  assert.equal(t.oynat.index, 0);
});

test('gözat: yeni klasör → ad ekranı → klasör kaydedilir; öğe klasöre eklenir/çıkarılır; klasör içeriği ağsız açılır', async () => {
  const { scr, t, tus, ayar } = kur();
  await bekle(350);
  tus('green', 'down', 'down', 'down', 'ok'); // Klasörler
  assert.match(scr.el.children.filter((c) => String(c.className).indexOf('mn') === 0)[0]._html, /Yeni klasör/);
  tus('ok'); // Yeni klasör… → ad ekranı
  assert.ok(t.ad, 'ad girişi ekranı açıldı');
  assert.equal(t.ad.baslik, 'Yeni klasör');
  t.ad.tamam('Benim listem');
  pop(); // ad ekranı kapanır, gözat ekranı yeniden görünür
  assert.equal(ayar().klasorler.length, 1);
  assert.equal(ayar().klasorler[0].name, 'Benim listem');
  const fid = ayar().klasorler[0].id;
  await bekle(60);
  // listeye geç, ilk kanalı klasöre ekle
  tus('right');
  tus('green', 'ok'); // Klasöre ekle / çıkar
  tus('ok'); // 'Benim listem'
  assert.equal(ayar().klasorler[0].items.length, 1);
  assert.equal(ayar().klasorler[0].items[0].id, 'c1');
  tus('ok'); // ikinci OK: çıkarır
  assert.equal(ayar().klasorler[0].items.length, 0);
  tus('ok'); // yine ekle
  tus('back', 'back');
  // kategori sütununa dön: klasör en üstte, odak yeni konumda
  const istekOnce = t.istek.length;
  assert.ok(scr.solKenar(), 'listenin sol kenarında ◀ soldaki menüye geçer');
  scr.katAc(); // soldaki menüde beklenince kategori paneli açılır
  scr.katOdak(); // menüden ▶ ile panele girilir
  tus('up'); // 'Ulusal' (k1) klasörün altına inmişti → klasöre
  await bekle(60);
  assert.equal(t.istek.length, istekOnce, 'klasör içeriği ağdan istenmez');
  assert.ok(t.istek.indexOf('f:' + fid) < 0);
  tus('right', 'ok'); // klasör içindeki kanalı aç
  assert.deepEqual(
    t.oynat.list.map((x) => x.id),
    ['c1'],
  );
});

test('gözat: klasör silinir (onaylı), sıradan kalkar; ad ekranından dönüşte sütun yenilenir', async () => {
  const { scr, t, tus, ayar } = kur();
  await bekle(350);
  tus('green', 'down', 'down', 'down', 'ok', 'ok');
  t.ad.tamam('Geçici');
  pop();
  await bekle(60);
  assert.equal(ayar().klasorler.length, 1);
  // klasör satırı en üstte; odak 'Ulusal'da. Yukarı → klasör, Yeşil → Klasörler → Bu klasörü sil → Evet
  tus('up');
  await bekle(40);
  tus('green', 'down', 'down', 'down', 'ok'); // Klasörler (kategori sütunu odakta: 3 satır)
  const html = () => scr.el.children.filter((c) => String(c.className).indexOf('mn') === 0)[0]._html;
  assert.match(html(), /Bu klasörü sil/);
  tus('down', 'down', 'ok'); // Bu klasörü sil → onay menüsü
  assert.match(html(), /silinsin mi/);
  assert.match(html(), /Evet, sil/);
  tus('ok');
  assert.equal(ayar().klasorler.length, 0);
  assert.ok(!ayar().order.some((x) => x.indexOf('f:') === 0), 'silinen klasör sıradan da kalktı');
  await bekle(350);
});
