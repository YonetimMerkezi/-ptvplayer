// LG webOS: büyük Xtream yanıtlarının arka plan işçisinde ayrıştırılması (kumanda takılmasın) ve kategori geçişinde eski isteğin iptali.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isle } from '../webos/src/isci-cekirdek.js';
import { createNet } from '../webos/src/net.js';

const kategoriler = [{ category_id: '3', category_name: 'Yeni Eklenenler' }];
const film = (i) => ({ stream_id: 100 + i, name: 'Film ' + i, stream_icon: '', category_id: '3', rating: '6.5', container_extension: 'mp4', added: '1700000000' });
const buyuk = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => film(i)));

test('işçi çekirdeği: ham JSON → uygulama öğeleri; bozuk metin ve bilinmeyen tür hata döner', () => {
  const r = isle({ id: 7, metin: buyuk(3), tur: 'movie', kategoriler });
  assert.equal(r.ok, true);
  assert.equal(r.id, 7);
  assert.equal(r.liste.length, 3);
  assert.equal(r.liste[0].kind, 'movie');
  assert.equal(r.liste[0].group, 'Yeni Eklenenler', 'kategori adı eşlendi');
  assert.equal(isle({ id: 1, metin: '{bozuk', tur: 'movie', kategoriler: [] }).ok, false);
  assert.equal(isle({ id: 2, metin: '[]', tur: 'tuhaf', kategoriler: [] }).ok, false);
  assert.deepEqual(isle({ id: 3, metin: '[null, 5, {"stream_id": 1, "name": "A"}]', tur: 'live', kategoriler: [] }).liste.map((x) => x.name), ['A'], 'geçersiz kayıtlar elenir');
});

test('ağ: aynı gruptaki yeni istek öncekini bırakır; bırakılan istek yedek yola geçmez', async () => {
  const gorulen = [];
  let servisCagri = 0;
  const net = createNet({
    ayar: () => 'auto',
    taşıyıcı: {
      hasService: () => true,
      direct: async (url, opt) => {
        gorulen.push({ url, iptalMi: opt.iptalMi });
        if (url.endsWith('/a')) {
          // ilk istek sürerken ikincisi başlar: bu istek artık bırakılmış sayılmalı
          await new Promise((r) => setTimeout(r, 30));
          const e = new Error('İstek iptal edildi');
          e.iptal = true;
          throw e;
        }
        return '[]';
      },
      service: async () => {
        servisCagri++;
        return '[]';
      },
    },
  });
  const bir = net.get('http://x/a', { grup: 'kat' });
  const iki = net.get('http://x/b', { grup: 'kat' });
  await assert.rejects(bir, (e) => e.iptal === true);
  assert.equal(await iki, '[]');
  assert.equal(servisCagri, 0, 'iptal edilen istek servise yönlendirilmedi');
  assert.equal(gorulen[0].iptalMi(), true, 'eski istek bırakıldığını görür');
  assert.equal(gorulen[1].iptalMi(), false, 'son istek geçerlidir');
});

// --- istemci: sahte Worker
class SahteIsci {
  constructor(url) {
    SahteIsci.son = this;
    this.url = url;
    this.gelen = [];
  }
  postMessage(m) {
    this.gelen.push(m);
    if (SahteIsci.mod === 'sessiz') return;
    setTimeout(() => this.onmessage && this.onmessage({ data: isle(m) }), 1);
  }
  terminate() {
    this.kapandi = true;
  }
}

test('işçi istemcisi: büyük yanıt işçiye gider, küçük yanıt gitmez; işçi hata verirse kapanır ve yedek yol kalır', async () => {
  globalThis.Worker = SahteIsci;
  SahteIsci.mod = '';
  const ist = await import('../webos/src/isci-ist.js');
  ist.sifirla();
  const kucuk = buyuk(5);
  const cok = buyuk(900);
  assert.equal(ist.isciKullanilir(kucuk), false, 'küçük yanıt doğrudan ayrıştırılır');
  assert.equal(ist.isciKullanilir(cok), true);
  const liste = await ist.esle(cok, 'movie', kategoriler);
  assert.equal(liste.length, 900);
  assert.equal(SahteIsci.son.url, 'js/isci.js');
  // işçi betiği yüklenemedi: onerror → işçi kapatılır, sonraki yanıtlar işçiye gönderilmez
  SahteIsci.son.onerror({ message: 'yüklenemedi' });
  assert.equal(ist.isciKullanilir(cok), false);
  await assert.rejects(() => ist.esle(cok, 'movie', kategoriler));
  delete globalThis.Worker;
  ist.sifirla();
});

test('Xtream sağlayıcı: büyük kategori işçiden gelir; işçi yoksa aynı sonuç ana iş parçacığında üretilir', async () => {
  const { createXtream } = await import('../webos/src/data.js');
  const ist = await import('../webos/src/isci-ist.js');
  const cok = buyuk(900);
  const net = (say) => ({
    get: async (url, opt) => {
      say.istekler.push({ url, grup: opt && opt.grup });
      if (url.includes('get_vod_categories')) return JSON.stringify(kategoriler);
      return cok;
    },
    json: async (url) => JSON.parse(await net(say).get(url)),
  });
  const kur = () => {
    const say = { istekler: [] };
    const p = createXtream({ server: 'http://s', user: 'u', pass: 'p' }, Object.assign(net(say), { json: async (u) => JSON.parse(u.includes('get_vod_categories') ? JSON.stringify(kategoriler) : cok) }));
    return { p, say };
  };
  // işçi var
  globalThis.Worker = SahteIsci;
  SahteIsci.mod = '';
  ist.sifirla();
  const a = kur();
  const l1 = await a.p.items('movie', '3');
  assert.equal(l1.length, 900);
  assert.ok(SahteIsci.son.gelen.length >= 1, 'ayrıştırma işçiye verildi');
  assert.ok(a.say.istekler.some((i) => i.grup === 'kat'), 'kategori isteği iptal grubuyla gitti');
  // işçi yok
  delete globalThis.Worker;
  ist.sifirla();
  const b = kur();
  const l2 = await b.p.items('movie', '3');
  assert.deepEqual(l2.map((x) => x.id), l1.map((x) => x.id), 'işçisiz yol aynı öğeleri üretir');
  ist.sifirla();
});
