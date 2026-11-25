// LG webOS: kategoriler arasında hızlı gezerken yarım kalan indirme çöpe gitmesin (tek iptal grubu her geçişte öncekini kesiyordu).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createXtream } from '../webos/src/data.js';

const kat = [1, 2, 3, 4, 5].map((i) => ({ category_id: String(i), category_name: 'K' + i }));
const filmler = (c) => [{ stream_id: Number(c) * 10, name: 'F' + c, category_id: String(c), container_extension: 'mp4', stream_icon: '' }];

function kur() {
  const istekler = [];
  const net = {
    json: async (u) => (/categories/.test(u) ? kat : []),
    get: async (u, o) => {
      istekler.push({ u, grup: o && o.grup });
      if (/categories/.test(u)) return JSON.stringify(kat);
      const c = /category_id=(\d+)/.exec(u);
      return JSON.stringify(filmler(c ? c[1] : '1'));
    },
  };
  const kalici = { oku: async () => null, yaz: async () => true };
  return { p: createXtream({ id: 's', server: 'http://s', user: 'u', pass: 'p' }, net, kalici), istekler };
}

test('kategori geçişi: ardışık ön plan istekleri iki dönüşümlü gruba gider, üçüncüsü ilkinin grubunu kullanır', async () => {
  const { p, istekler } = kur();
  await p.items('movie', '1');
  await p.items('movie', '2');
  await p.items('movie', '3');
  const gruplar = istekler.filter((i) => /get_vod_streams/.test(i.u)).map((i) => i.grup);
  assert.equal(gruplar.length, 3);
  assert.notEqual(gruplar[0], gruplar[1], 'ardışık iki istek farklı gruptadır: ikincisi birincisini kesmez');
  assert.equal(gruplar[0], gruplar[2], 'üçüncü istek ilkinin grubunu alır: en eski yarım iş kesilir');
  assert.ok(gruplar.every((g) => /^kat[01]$/.test(g)));
});

test('kategori geçişi: arka plan önyüklemesi (grup null) kesilmez ve dönüşümü kaydırmaz', async () => {
  const { p, istekler } = kur();
  await p.items('movie', '1');
  await p.items('movie', '4', null);
  await p.items('movie', '2');
  const g = istekler.filter((i) => /get_vod_streams/.test(i.u));
  assert.equal(g[1].grup, null);
  assert.notEqual(g[0].grup, g[2].grup);
});
