// LG webOS: kalıcı liste önbelleği (IndexedDB) ve Xtream sağlayıcıda "önce kayıtlı liste, güncel arkadan" akışı.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnbellek } from '../webos/src/onbellek.js';
import { createXtream } from '../webos/src/data.js';

// Küçük sahte IndexedDB: tek depo, get/put/delete/openCursor; olaylar mikro görev sonrası tetiklenir
function sahteIdb() {
  const veri = new Map();
  const istek = (calis) => {
    const r = { result: undefined, onsuccess: null };
    Promise.resolve().then(() => {
      r.result = calis();
      if (r.onsuccess) r.onsuccess();
    });
    return r;
  };
  const depo = {
    get: (k) => istek(() => veri.get(k)),
    put: (v, k) => istek(() => (veri.set(k, v), k)),
    delete: (k) => istek(() => (veri.delete(k), undefined)),
    openCursor: () => {
      const anahtarlar = [...veri.keys()];
      let i = -1;
      const r = { result: null, onsuccess: null };
      const ilerle = () => {
        i++;
        r.result = i < anahtarlar.length ? { key: anahtarlar[i], value: veri.get(anahtarlar[i]), continue: () => Promise.resolve().then(ilerle) } : null;
        if (r.onsuccess) r.onsuccess();
      };
      Promise.resolve().then(ilerle);
      return r;
    },
  };
  const db = {
    objectStoreNames: { contains: () => true },
    transaction: () => {
      const tx = { oncomplete: null, objectStore: () => depo };
      // Tüm bekleyen mikro görevler bitince işlem tamamlanır
      setTimeout(() => tx.oncomplete && tx.oncomplete(), 5);
      return tx;
    },
  };
  return { veri, idb: { open: () => { const r = { result: db, onsuccess: null }; Promise.resolve().then(() => r.onsuccess && r.onsuccess()); return r; } } };
}

test('önbellek: yazılan liste okunur; boş liste yazılmaz; eski kayıt gösterilmez; IndexedDB yoksa null', async () => {
  const { idb } = sahteIdb();
  const o = createOnbellek(() => idb);
  assert.equal(await o.oku('a'), null);
  assert.equal(await o.yaz('a', []), false, 'boş liste yazılmaz');
  assert.equal(await o.yaz('a', [{ id: 1 }, { id: 2 }], 1000), true);
  assert.deepEqual(await o.oku('a', 2000), [{ id: 1 }, { id: 2 }]);
  assert.equal(await o.oku('a', 1000 + 15 * 24 * 3600 * 1000), null, '14 günden eski kayıt gösterilmez');
  const yok = createOnbellek(() => null);
  assert.equal(await yok.oku('a'), null);
  assert.equal(await yok.yaz('a', [{ id: 1 }]), true, 'yazma hata vermez');
  const bozuk = createOnbellek(() => { throw new Error('idb yok'); });
  assert.equal(await bozuk.oku('a'), null);
});

test('xtream: kategori ve içerik kalıcı önbelleğe yazılır; yeni oturumda önce kayıtlı liste okunur', async () => {
  const kategoriler = [{ category_id: '7', category_name: 'Aksiyon' }, { category_id: '8', category_name: 'Dram' }];
  const filmler = [{ stream_id: 1, name: 'Bir Film', category_id: '7', container_extension: 'mp4', stream_icon: '' }];
  const istekler = [];
  const net = {
    json: async (u) => (istekler.push(u), /get_vod_categories/.test(u) ? kategoriler : []),
    get: async (u) => (istekler.push(u), /get_vod_streams/.test(u) ? JSON.stringify(filmler) : JSON.stringify(kategoriler)),
  };
  const { idb } = sahteIdb();
  const kalici = createOnbellek(() => idb);
  const src = { id: 's1', server: 'http://srv', user: 'u', pass: 'p' };
  const p1 = createXtream(src, net, kalici);
  assert.equal(await p1.onbellekten('movie', '7'), null, 'ilk açılışta kayıt yok');
  const l = await p1.items('movie', '7');
  assert.ok(l.length >= 1);
  await p1.categories('movie');
  await new Promise((r) => setTimeout(r, 1800)); // yazma ekran çizildikten sonra (1,5 sn) yapılır
  // Yeni oturum: bellek önbelleği boş, kalıcı olan dolu
  const p2 = createXtream(src, net, kalici);
  const eski = await p2.onbellekten('movie', '7');
  assert.ok(Array.isArray(eski) && eski.length === l.length, 'kayıtlı liste hemen okunur');
  const kat = await p2.categoriesOnbellekten('movie');
  assert.deepEqual(kat.map((c) => c.name), ['Aksiyon', 'Dram']);
  // Başka kaynağın listesi görünmez
  const p3 = createXtream({ id: 's2', server: 'http://baska', user: 'x', pass: 'y' }, net, kalici);
  assert.equal(await p3.onbellekten('movie', '7'), null);
  // Canlı kanal listeleri kalıcı yazılmaz
  await p1.items('live', '1').catch(() => {});
  await new Promise((r) => setTimeout(r, 1800));
  assert.equal(await p2.onbellekten('live', '1'), null);
});
