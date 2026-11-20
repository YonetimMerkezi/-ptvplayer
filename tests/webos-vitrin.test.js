// LG webOS vitrin ve fragman: görünüm metni, görsel yedekleri, ayrıntı bekleme/yükleme, fragman kimliği bulma ve YouTube'u açma.
import test from 'node:test';
import assert from 'node:assert/strict';

class F {
  constructor() {
    Object.assign(this, { className: '', style: {}, innerHTML: '', qs: {} });
  }
  querySelector(sel) {
    return this.qs[sel] || (this.qs[sel] = new F());
  }
}
globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { createElement: () => new F() };

const { vitrinMetni, createArkaPlan, createVitrin } = await import('../webos/src/vitrin.js');
const { aramaPlani, fragmanKimlikleri, youtubeAc, fragmanOynat, izleParam, YOUTUBE_UYGULAMA } = await import('../webos/src/fragman.js');

// Elle işletilen zamanlayıcı
function saat() {
  let bekleyen = [];
  let no = 0;
  return {
    set: (f) => (bekleyen.push({ f, id: ++no }), no),
    clear: (id) => (bekleyen = bekleyen.filter((x) => x.id !== id)),
    delay: 1,
    calistir: () => bekleyen.splice(0).forEach((x) => x.f()),
  };
}
const bekle = () => new Promise((r) => setImmediate(r));

test('vitrin metni: ad, puan, üst bilgi, özet ve oyuncular; özel karakterler kaçırılır, uzun özet kısalır', () => {
  const m = { title: 'A & B <i>', rating: '7.8', meta: ['2024', '112 dk', 'Dram'], plot: 'x'.repeat(500), cast: 'Ali Veli', director: 'Ayşe', bg: [], wide: false, backs: 0 };
  const h = vitrinMetni(m);
  assert.ok(h.includes('A &amp; B &lt;i&gt;'));
  assert.ok(h.includes('★ 7.8'));
  assert.ok(h.includes('2024</i>') || h.includes('2024<i>·</i>112 dk'));
  assert.ok(h.includes('Oyuncular: Ali Veli'));
  assert.ok(h.includes('Yönetmen: Ayşe'));
  const p = /<div class="v-p">(.*?)<\/div>/.exec(h)[1];
  assert.ok(p.length <= 301 && p.endsWith('…') === true || p.length <= 300);
  assert.ok(!vitrinMetni({ title: 'T', rating: '', meta: [], plot: '', cast: '', director: '', bg: [] }).includes('v-m'));
});

test('arka plan: ilk yüklenmeyen görselden sonrakine geçer, eski istek yenisini bozmaz, aynı görsel yeniden yüklenmez', async () => {
  const k = new F();
  const istek = [];
  const resim = (url, ok, hata) => istek.push({ url, ok, hata });
  const a = createArkaPlan(k, { resim });
  a.goster(['u1', 'u2']);
  assert.equal(istek.length, 1);
  istek[0].hata(); // u1 yüklenemedi
  assert.equal(istek[1].url, 'u2');
  a.goster(['u1', 'u2']);
  assert.equal(istek.length, 2, 'aynı adaylar yeniden istenmez');
  a.goster(['u3']);
  istek[1].ok('u2'); // geç gelen eski yanıt
  assert.ok(!/\bon\b/.test(k.className), 'eski görsel gösterilmez');
  istek[2].ok('u3');
  assert.ok(/\bon\b/.test(k.className));
  assert.ok(k.style.backgroundImage.includes('u3'));
  a.temizle();
  assert.ok(!/\bon\b/.test(k.className));
});

test('vitrin: odakta liste bilgisi hemen, bekleme sonunda ayrıntı gelir; geniş görsel yoksa afiş kullanılır', async () => {
  const host = new F();
  const z = saat();
  const istekler = [];
  const resim = (url, ok) => {
    istekler.push(url);
    ok(url);
  };
  let vodSay = 0;
  const p = {
    type: 'xtream',
    vodInfo: async () => {
      vodSay++;
      return { plot: 'Konu burada', cast: 'Oyuncu 1', backdrop: 'http://x/b.jpg', rating: '8.1', year: '2023', durationSec: 5400 };
    },
    seriesInfo: async () => ({ plot: 'Dizi konusu', logo: 'http://x/c.jpg' }),
  };
  const v = createVitrin(host, { saglayici: () => p, resim, zamanlayici: z });
  const film = { id: 'm1', kind: 'movie', name: 'TR | Film Adı | 2023', logo: 'http://x/p.jpg' };
  v.odak(film);
  const tx = host.querySelector('.v-tx');
  assert.ok(tx.innerHTML.includes('Film Adı'), 'ad hemen yazılır');
  assert.ok(!tx.innerHTML.includes('Konu burada'));
  assert.deepEqual(istekler, ['http://x/p.jpg'], 'geniş görsel yok: afiş yüklenir');
  assert.ok(/\bon\b/.test(host.querySelector('.v-pst').className));
  z.calistir(); // bekleme doldu → ayrıntı istenir
  await bekle();
  await bekle();
  assert.equal(vodSay, 1);
  assert.ok(tx.innerHTML.includes('Konu burada'));
  assert.ok(tx.innerHTML.includes('Oyuncular: Oyuncu 1'));
  assert.ok(istekler.includes('http://x/b.jpg'), 'ayrıntıdaki geniş görsel yüklenir');
  assert.ok(/\bon\b/.test(host.querySelector('.v-bg').className));
  assert.equal(v.bilgi(film).plot, 'Konu burada');
  v.odak(film);
  v.temizle();
  assert.equal(tx.innerHTML, '');
});

test('vitrin: M3U kaynakta ayrıntı istenmez; hızlı gezerken yalnız son öğe için istek atılır', async () => {
  const z = saat();
  let n = 0;
  const m3u = createVitrin(new F(), { saglayici: () => ({ type: 'm3u', vodInfo: async () => n++ }), resim: (u, ok) => ok(u), zamanlayici: z });
  m3u.odak({ id: 'a', kind: 'movie', name: 'A' });
  z.calistir();
  await bekle();
  assert.equal(n, 0);
  const sayac = [];
  const p = { type: 'xtream', vodInfo: async (it) => (sayac.push(it.id), {}) };
  const v = createVitrin(new F(), { saglayici: () => p, resim: (u, ok) => ok(u), zamanlayici: z });
  v.odak({ id: 'a', kind: 'movie', name: 'A' });
  v.odak({ id: 'b', kind: 'movie', name: 'B' });
  v.odak({ id: 'c', kind: 'movie', name: 'C' });
  z.calistir();
  await bekle();
  assert.deepEqual(sayac, ['c']);
});

test('fragman: arama planı katalog önekini ve yılı ayıklar', () => {
  const p = aramaPlani({ name: 'TR | Asla Teslim Olma (2024)' }, null);
  assert.equal(p.query, 'Asla Teslim Olma fragman');
  assert.deepEqual(p.wanted, ['Asla Teslim Olma']);
  assert.equal(p.year, 2024);
  assert.equal(aramaPlani({ name: '' }, null).query, '');
});

test('fragman: sağlayıcının kimliği varsa arama yapılmaz; yoksa YouTube aramasının uygun sonucu; erişilemezse hata', async () => {
  let arama = 0;
  const ara = async (o) => {
    arama++;
    assert.equal(o.query, 'Bir Film fragman');
    return [{ id: 'zzzzzzzzzzz', good: false }, { id: 'AAAAAAAAAAA', good: true }];
  };
  const hazir = await fragmanKimlikleri({ name: 'X', trailer: 'dQw4w9WgXcQ' }, null, { ara });
  assert.deepEqual(hazir, ['dQw4w9WgXcQ']);
  assert.equal(arama, 0);
  const bulunan = await fragmanKimlikleri({ id: 'm9', name: 'Bir Film' }, null, { ara });
  assert.deepEqual(bulunan, ['AAAAAAAAAAA']);
  await fragmanKimlikleri({ id: 'm9', name: 'Bir Film' }, null, { ara });
  assert.equal(arama, 1, 'bulunan sonuç oturum boyunca önbellekte');
  await assert.rejects(() => fragmanKimlikleri({ id: 'm10', name: 'Başka Film' }, null, { ara: async () => null }), /ulaşılamadı/);
  assert.deepEqual(await fragmanKimlikleri({ id: 'm11', name: 'Üçüncü Film' }, null, { ara: async () => [{ id: 'q', good: false }] }), []);
});

test('fragman: YouTube uygulaması doğru kimlik ve adresle açılır; hata iletilir', async () => {
  const cagrilar = [];
  const luna = async (uri, par) => (cagrilar.push({ uri, par }), { returnValue: true });
  assert.equal(await youtubeAc('dQw4w9WgXcQ', luna), true);
  assert.equal(cagrilar[0].uri, 'luna://com.webos.applicationManager/launch');
  assert.equal(cagrilar[0].par.id, YOUTUBE_UYGULAMA);
  assert.equal(cagrilar[0].par.params.contentTarget, 'v=dQw4w9WgXcQ', 'YouTube uygulaması "v=KİMLİK" bekler; tam adres ana sayfayı açar');
  assert.equal(cagrilar[0].par.params.contentTarget, izleParam('dQw4w9WgXcQ'));
  assert.ok(!('contentId' in cagrilar[0].par.params), 'yalın kimlik gönderilmez');
  await assert.rejects(() => youtubeAc('x', async () => ({ returnValue: false, errorText: 'app yok' })), /app yok/);
});

test('fragman: ekran akışı — iletiler, bulunamayan fragman, açılamayan YouTube, eş zamanlı ikinci istek yok sayılır', async () => {
  const iletiler = [];
  const bildir = (t) => iletiler.push(t);
  const ok = await fragmanOynat({ id: 'a', name: 'A', trailer: 'dQw4w9WgXcQ' }, null, { bildir, luna: async () => ({ returnValue: true }) });
  assert.equal(ok, true);
  assert.ok(iletiler.some((t) => /YouTube uygulamasında açılıyor/.test(t)));
  iletiler.length = 0;
  assert.equal(await fragmanOynat({ id: 'b', name: 'Fragmansız Film' }, null, { bildir, ara: async () => [] }), false);
  assert.ok(iletiler.some((t) => /fragman bulunamadı/.test(t)));
  iletiler.length = 0;
  assert.equal(await fragmanOynat({ id: 'c', name: 'C', trailer: 'dQw4w9WgXcQ' }, null, { bildir, luna: async () => ({ returnValue: false, errorText: 'yok' }) }), false);
  assert.ok(iletiler.some((t) => /YouTube açılamadı: yok/.test(t)));
  let birakma;
  const bekleyen = new Promise((r) => (birakma = r));
  const birinci = fragmanOynat({ id: 'd', name: 'D', trailer: 'dQw4w9WgXcQ' }, null, { luna: () => bekleyen.then(() => ({ returnValue: true })) });
  await bekle();
  assert.equal(await fragmanOynat({ id: 'd', name: 'D', trailer: 'dQw4w9WgXcQ' }, null, {}), false, 'ilk istek sürerken ikincisi başlamaz');
  birakma();
  assert.equal(await birinci, true);
});
