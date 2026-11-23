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
const { aramaPlani, fragmanKimlikleri, youtubeAc, fragmanOynat, yolAc, izleParam, YOUTUBE_UYGULAMA, BICIMLER, VARSAYILAN_BICIM, YOLLAR, VARSAYILAN_YOL, ytTvAdresi, kisaAdres, qrKaynagi, gitKaynagi, donusKaynagi, contentTarget, baslatParams, sonDeneme, ayarKaynagi } = await import('../webos/src/fragman.js');

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
  const zemin = new F();
  const v = createVitrin(host, { zemin, saglayici: () => p, resim, zamanlayici: z });
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
  assert.ok(/\bon\b/.test(zemin.querySelector('.v-bg').className), 'geniş görsel ekran zemininde (vitrin kutusunda değil) gösterilir');
  assert.ok(zemin.innerHTML.includes('v-vg'), 'zemin yumuşatma katmanını içerir');
  assert.ok(!host.innerHTML.includes('v-bg'), 'vitrin kutusunda ayrı görsel katmanı yok');
  assert.equal(v.bilgi(film).plot, 'Konu burada');
  v.odak(film);
  v.temizle();
  assert.equal(tx.innerHTML, '');
});

test('vitrin: M3U kaynakta ayrıntı istenmez; hızlı gezerken yalnız son öğe için istek atılır', async () => {
  const z = saat();
  let n = 0;
  const m3u = createVitrin(new F(), { zemin: new F(), saglayici: () => ({ type: 'm3u', vodInfo: async () => n++ }), resim: (u, ok) => ok(u), zamanlayici: z });
  m3u.odak({ id: 'a', kind: 'movie', name: 'A' });
  z.calistir();
  await bekle();
  assert.equal(n, 0);
  const sayac = [];
  const p = { type: 'xtream', vodInfo: async (it) => (sayac.push(it.id), {}) };
  const v = createVitrin(new F(), { zemin: new F(), saglayici: () => p, resim: (u, ok) => ok(u), zamanlayici: z });
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
  assert.equal(await youtubeAc('dQw4w9WgXcQ', luna, { bekle: 0 }), true);
  const ac = cagrilar[cagrilar.length - 1];
  assert.equal(ac.uri, 'luna://com.webos.applicationManager/launch');
  assert.equal(ac.par.id, YOUTUBE_UYGULAMA);
  assert.equal(ac.par.params.contentTarget, 'v=dQw4w9WgXcQ', 'varsayılan biçim: v=KİMLİK');
  assert.equal(VARSAYILAN_BICIM, 'v');
  assert.ok(!('contentId' in ac.par.params), 'yalın kimlik gönderilmez');
  await assert.rejects(() => youtubeAc('x', async (uri) => (/launch$/.test(uri) ? { returnValue: false, errorText: 'app yok' } : { returnValue: false }), { bekle: 0 }), /app yok/);
});

test('fragman: seçilebilir contentTarget biçimleri; biçim ve kapatma ayarı uygulanır', async () => {
  assert.equal(contentTarget('ABC', 'v'), izleParam('ABC'));
  assert.equal(contentTarget('ABC', 'watch'), 'https://www.youtube.com/watch?v=ABC');
  assert.equal(contentTarget('ABC', 'tvhash'), 'https://www.youtube.com/tv#/watch?v=ABC');
  assert.equal(contentTarget('ABC', 'yok'), 'v=ABC', 'bilinmeyen biçim varsayılana döner');
  assert.equal(contentTarget('ABC', 'tv'), 'https://www.youtube.com/tv?v=ABC');
  assert.equal(new Set(BICIMLER.map((b) => b[0])).size, BICIMLER.length);
  const cagrilar = [];
  const luna = async (uri, par) => (cagrilar.push({ uri, par }), { returnValue: true });
  // Ayarlardan gelen biçim
  ayarKaynagi(() => ({ bicim: 'watch', kapat: true }));
  await youtubeAc('ABC', luna, { bekle: 0 });
  assert.match(cagrilar[0].uri, /closeByAppId$/, 'önce YouTube kapatılır');
  assert.equal(cagrilar[0].par.id, YOUTUBE_UYGULAMA);
  assert.equal(cagrilar[cagrilar.length - 1].par.params.contentTarget, 'https://www.youtube.com/watch?v=ABC');
  // Kapatma kapalıysa yalnız açma çağrısı yapılır; seçenek ayarı ezer
  cagrilar.length = 0;
  ayarKaynagi(() => ({ bicim: 'watch', kapat: false }));
  await youtubeAc('ABC', luna, { bekle: 0, bicim: 'v' });
  assert.equal(cagrilar.length, 1);
  assert.match(cagrilar[0].uri, /launch$/);
  assert.equal(cagrilar[0].par.params.contentTarget, 'v=ABC');
  // YouTube kapalıyken kapatma hata verse de açılır
  cagrilar.length = 0;
  ayarKaynagi(() => ({}));
  const l2 = async (uri, par) => (cagrilar.push({ uri, par }), /launch$/.test(uri) ? { returnValue: true } : { returnValue: false, errorText: 'çalışmıyor' });
  assert.equal(await youtubeAc('ABC', l2, { bekle: 0 }), true);
  assert.ok(cagrilar.some((c) => /launch$/.test(c.uri)));
  ayarKaynagi(() => ({}));
});

test('fragman: ekran akışı — iletiler, bulunamayan fragman, açılamayan YouTube, eş zamanlı ikinci istek yok sayılır', async () => {
  ayarKaynagi(() => ({ yol: 'uygulama' }));
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
  ayarKaynagi(() => ({}));
});

test('fragman yolları: varsayılan YouTube TV sayfası; sayfa yolu pencereyi video adresine götürür, QR yolu kısa bağlantıyla QR ekranını açar', async () => {
  assert.deepEqual(YOLLAR.map((y) => y[0]), ['sayfa', 'uygulama', 'qr']);
  assert.equal(VARSAYILAN_YOL, 'sayfa');
  assert.equal(ytTvAdresi('dQw4w9WgXcQ'), 'https://www.youtube.com/tv?v=dQw4w9WgXcQ#/');
  assert.equal(kisaAdres('dQw4w9WgXcQ'), 'https://youtu.be/dQw4w9WgXcQ');
  const gidilen = [];
  const qrler = [];
  gitKaynagi((u) => gidilen.push(u));
  qrKaynagi((p) => qrler.push(p));
  const lunaCagri = [];
  const luna = async (uri) => (lunaCagri.push(uri), { returnValue: true });
  const iletiler = [];
  const bildir = (t) => iletiler.push(t);
  const film = { id: 'y1', name: 'TR | Bir Film', trailer: 'dQw4w9WgXcQ' };
  // Ayar yok → varsayılan sayfa yolu; YouTube uygulaması hiç çağrılmaz
  ayarKaynagi(() => ({}));
  assert.equal(await fragmanOynat(film, null, { bildir, luna }), true);
  assert.deepEqual(gidilen, ['https://www.youtube.com/tv?v=dQw4w9WgXcQ#/']);
  assert.deepEqual(lunaCagri, []);
  assert.ok(iletiler.some((t) => /yeniden açın/.test(t)), 'çıkınca uygulamanın kapanacağı söylenir');
  // Dönüş bekçisi kurulabilirse ileti kendiliğinden açılacağını söyler ve sayfaya gitmeden önce beklenir; kurulamazsa yöneltme yine yapılır
  gidilen.length = 0;
  iletiler.length = 0;
  let sira = [];
  donusKaynagi(async () => (sira.push('hazirla'), { kuruldu: true, neden: '' }));
  gitKaynagi((u) => (sira.push('git'), gidilen.push(u)));
  assert.equal(await fragmanOynat(film, null, { bildir, luna }), true);
  assert.deepEqual(sira, ['hazirla', 'git'], 'önce bekçi kurulur, sonra sayfaya gidilir');
  assert.ok(iletiler.some((t) => /kendiliğinden açılır/.test(t)));
  donusKaynagi(async () => { throw new Error('servis yok'); });
  gidilen.length = 0;
  iletiler.length = 0;
  assert.equal(await fragmanOynat(film, null, { bildir, luna }), true);
  assert.equal(gidilen.length, 1, 'bekçi kurulamasa da fragman açılır');
  assert.ok(iletiler.some((t) => /yeniden açın/.test(t)));
  donusKaynagi(async () => ({ kuruldu: false, neden: '' }));
  // Ayardan QR yolu: sayfa açılmaz, QR ekranı kısa bağlantıyla ve yapım adıyla açılır
  gidilen.length = 0;
  ayarKaynagi(() => ({ yol: 'qr' }));
  assert.equal(await fragmanOynat(film, null, { bildir, luna }), true);
  assert.deepEqual(gidilen, []);
  assert.deepEqual(qrler, [{ url: 'https://youtu.be/dQw4w9WgXcQ', ad: 'TR | Bir Film' }]);
  // Çağrıdaki yol ayarı ezer (ayrıntı ekranındaki "telefonda izle" düğmesi)
  ayarKaynagi(() => ({ yol: 'sayfa' }));
  qrler.length = 0;
  assert.equal(await fragmanOynat(film, null, { bildir, luna, yol: 'qr' }), true);
  assert.equal(qrler.length, 1);
  assert.deepEqual(gidilen, []);
  // Uygulama yolu: eski akış (YouTube uygulaması luna ile açılır)
  ayarKaynagi(() => ({ yol: 'uygulama', kapat: false }));
  assert.equal(await fragmanOynat(film, null, { bildir, luna }), true);
  assert.ok(lunaCagri.some((u) => /launch$/.test(u)));
  // Geçersiz yol varsayılana döner; yolAc doğrudan da kullanılabilir (Fragman testi)
  gidilen.length = 0;
  assert.equal(await yolAc('yok', 'ABCDEFGHIJK', { bildir }), true);
  assert.deepEqual(gidilen, ['https://www.youtube.com/tv?v=ABCDEFGHIJK#/']);
  ayarKaynagi(() => ({}));
  gitKaynagi((u) => {
    globalThis.window.location.href = u;
  });
  qrKaynagi(() => {});
});

test('fragman: contentId biçimleri doğru parametre adıyla gider; TV yanıtları tanı olarak saklanır', async () => {
  assert.deepEqual(baslatParams('ABC', 'tv'), { contentTarget: 'https://www.youtube.com/tv?v=ABC' });
  assert.deepEqual(baslatParams('ABC', 'tvhttp'), { contentTarget: 'http://www.youtube.com/tv?v=ABC' });
  assert.deepEqual(baslatParams('ABC', 'id'), { contentTarget: 'ABC' });
  assert.deepEqual(baslatParams('ABC', 'cid'), { contentId: 'v=ABC' });
  assert.deepEqual(baslatParams('ABC', 'cidid'), { contentId: 'ABC' });
  assert.deepEqual(baslatParams('ABC', 'v'), { contentTarget: 'v=ABC' });
  assert.deepEqual(baslatParams('ABC', 'hepsi'), { contentTarget: 'v=ABC', contentId: 'v=ABC' }, 'birden çok ad aynı değeri alır');
  assert.equal(BICIMLER[0][0], VARSAYILAN_BICIM, 'varsayılan biçim listenin başında');
  const cagrilar = [];
  const luna = async (uri, par) => (cagrilar.push({ uri, par }), { returnValue: true, appId: 'youtube.leanback.v4' });
  ayarKaynagi(() => ({}));
  await youtubeAc('ABC', luna, { bekle: 0, bicim: 'cid' });
  const ac = cagrilar[cagrilar.length - 1];
  assert.deepEqual(ac.par.params, { contentId: 'v=ABC' });
  const t = sonDeneme();
  assert.equal(t.bicim, 'cid');
  assert.ok(t.adimlar.some((a) => /^launch .*contentId.*"appId":"youtube\.leanback\.v4"/.test(a)), 'launch yanıtı ham olarak saklanır');
  assert.ok(t.adimlar.some((a) => /^closeByAppId/.test(a)));
});

test('fragman: açma çağrısı varsayılan olarak tek; “bir kez daha yinele” seçilirse ve YouTube kapatılamadıysa ikinci çağrı; hata TV iletisiyle tanıda kalır', async () => {
  ayarKaynagi(() => ({}));
  const cagrilar = [];
  const kapatmaz = async (uri, par) => (cagrilar.push(uri), /launch$/.test(uri) ? { returnValue: true } : { returnValue: false, errorText: 'izin yok' });
  await youtubeAc('ABC', kapatmaz, { bekle: 1 });
  assert.equal(cagrilar.filter((u) => /launch$/.test(u)).length, 1, 'varsayılan: tek açma çağrısı (ardışık iki launch YouTube’u ana sayfaya düşürebilir)');
  cagrilar.length = 0;
  await youtubeAc('ABC', kapatmaz, { bekle: 1, ikinci: true });
  assert.equal(cagrilar.filter((u) => /launch$/.test(u)).length, 2, 'ikinci seçeneği açıkken ve kapatılamadıysa ikinci çağrı');
  cagrilar.length = 0;
  ayarKaynagi(() => ({ ikinci: true }));
  await youtubeAc('ABC', kapatmaz, { bekle: 1 });
  assert.equal(cagrilar.filter((u) => /launch$/.test(u)).length, 2, 'ayardan gelen ikinci seçeneği de uygulanır');
  ayarKaynagi(() => ({}));
  cagrilar.length = 0;
  const kapatir = async (uri) => (cagrilar.push(uri), { returnValue: true });
  await youtubeAc('ABC', kapatir, { bekle: 1, ikinci: true });
  assert.equal(cagrilar.filter((u) => /launch$/.test(u)).length, 1, 'kapatma işlediyse tek çağrı yeter');
  await assert.rejects(() => youtubeAc('ABC', async (uri) => (/launch$/.test(uri) ? { returnValue: false, errorText: 'Denied method call' } : { returnValue: true }), { bekle: 0 }), /Denied method call/);
  assert.equal(sonDeneme().hata, 'Denied method call');
  assert.ok(sonDeneme().adimlar.some((a) => /Denied method call/.test(a)));
});

