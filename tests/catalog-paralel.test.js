// Xtream katalog yüklemesi: altı liste aynı anda istenir; eşzamanlı isteği reddeden sunucuda sırayla yeniden denenir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../www/js/catalog.js';
import { createNet } from '../www/js/net.js';

const XT = { type: 'xtream', server: 'http://x', user: 'u', pass: 'p' };
const gec = (ms) => new Promise((r) => setTimeout(r, ms));
const JSONLAR = {
  get_live_categories: [{ category_id: '1', category_name: 'Haber' }],
  get_live_streams: [{ stream_id: 1, name: 'Haber Türk', category_id: '1', epg_channel_id: 'ht' }],
  get_vod_categories: [{ category_id: '2', category_name: 'Aksiyon' }],
  get_vod_streams: [{ stream_id: 9, name: 'Film', category_id: '2', container_extension: 'mkv' }],
  get_series_categories: [{ category_id: '3', category_name: 'Dizi' }],
  get_series: [{ series_id: 5, name: 'Dizi', category_id: '3' }],
};
const AUTH = { user_info: { auth: 1, status: 'Active' } };

function sunucu({ gecikme = 30, hata = {} } = {}) {
  const durum = { aktif: 0, enFazla: 0, istek: [], sayac: {} };
  const net = createNet({
    fetchImpl: async (url) => {
      const a = /action=([a-z_]+)/.exec(url);
      const ad = a ? a[1] : 'auth';
      durum.istek.push(ad);
      durum.sayac[ad] = (durum.sayac[ad] || 0) + 1;
      durum.aktif++;
      durum.enFazla = Math.max(durum.enFazla, durum.aktif);
      await gec(gecikme);
      durum.aktif--;
      const h = hata[ad];
      if (h && durum.sayac[ad] <= (h.kez ?? 1)) return new Response('x', { status: h.kod });
      return new Response(JSON.stringify(a ? JSONLAR[ad] : AUTH));
    },
  });
  return { net, durum };
}

test('Xtream: altı liste aynı anda istenir (süre en yavaş istek kadar), sonuçlar doğru eşlenir', async () => {
  const { net, durum } = sunucu({ gecikme: 60 });
  const t0 = Date.now();
  const cat = await loadCatalog(XT, net);
  const sure = Date.now() - t0;
  assert.equal(durum.enFazla, 6, 'altı istek birlikte uçuşta');
  assert.ok(sure < 60 * 4, `art arda olsaydı ≥ 7×60 ms; ölçülen ${sure} ms`);
  assert.equal(cat.live[0].group, 'Haber');
  assert.equal(cat.movies[0].group, 'Aksiyon');
  assert.equal(cat.series[0].group, 'Dizi');
  assert.deepEqual(cat.warnings, []);
});

test('Xtream: sunucu eşzamanlı isteği 429 ile reddederse o liste sırayla yeniden denenir ve alınır', async () => {
  const { net, durum } = sunucu({ hata: { get_vod_streams: { kod: 429 } } });
  const cat = await loadCatalog(XT, net);
  assert.equal(durum.sayac.get_vod_streams, 2, 'bir kez daha denendi');
  assert.equal(cat.movies.length, 1);
  assert.deepEqual(cat.warnings, []);
});

test('Xtream: yeniden deneme de başarısızsa uyarı yazılır, diğer listeler gelir; 404 gibi kalıcı hatalar yeniden denenmez', async () => {
  const kalici = sunucu({ hata: { get_series: { kod: 404, kez: 99 } } });
  const cat = await loadCatalog(XT, kalici.net);
  assert.equal(kalici.durum.sayac.get_series, 1, '404 yeniden denenmez');
  assert.equal(cat.series.length, 0);
  assert.equal(cat.live.length, 1);
  assert.match(cat.warnings[0], /Diziler alınamadı: HTTP 404/);
  const gecici = sunucu({ hata: { get_live_streams: { kod: 503, kez: 99 }, get_vod_categories: { kod: 429, kez: 99 } } });
  const c2 = await loadCatalog(XT, gecici.net);
  assert.equal(gecici.durum.sayac.get_live_streams, 2);
  assert.equal(c2.live.length, 0);
  assert.equal(c2.movies.length, 1, 'film listesi kategorisiz de gelir');
  assert.equal(c2.warnings.length, 2);
  assert.match(c2.warnings.join('|'), /Canlı kanallar alınamadı/);
  assert.match(c2.warnings.join('|'), /Film kategorileri alınamadı/);
});

test('Xtream: ilerleme bildirimi "n/6" olarak akar', async () => {
  const { net } = sunucu({ gecikme: 5 });
  const asamalar = [];
  await loadCatalog(XT, net, { onStage: (s) => asamalar.push(s) });
  assert.ok(asamalar.some((s) => /1\/6/.test(s)));
  assert.ok(asamalar.some((s) => /6\/6/.test(s)));
});

test('Xtream: hesap doğrulanamazsa liste istekleri hiç gönderilmez', async () => {
  const durum = { istek: [] };
  const net = createNet({
    fetchImpl: async (url) => {
      durum.istek.push(/action=/.test(url) ? 'liste' : 'auth');
      return new Response(JSON.stringify({ user_info: { auth: 0 } }));
    },
  });
  await assert.rejects(() => loadCatalog(XT, net));
  assert.deepEqual(durum.istek, ['auth']);
});
