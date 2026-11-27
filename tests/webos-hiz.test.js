// LG webOS hız: büyük servis yanıtı paralel/sırasız okunur; parça sırası bozulmaz, kayıt tüm parçalar okununca silinir; bellek önbelleği "hazır" işaretler.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const kok = join(dirname(fileURLToPath(import.meta.url)), '..', 'webos');
const svc = require(join(kok, 'service', 'service.js'));
const getir = (p) => new Promise((coz, red) => svc.getir(p, (e, r) => (e ? red(e) : coz(r))));

async function sunucu(t, govde) {
  const s = http.createServer((req, res) => res.writeHead(200).end(govde));
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => { s.closeAllConnections?.(); s.close(r); }));
  return 'http://127.0.0.1:' + s.address().port + '/';
}

const BUYUK = Array.from({ length: 200000 }, (_, i) => 'ğ' + (i % 10)).join('') + 'SON'; // ~400k karakter: ilk yanıt + 2 parça

test('servis: ilk yanıt toplam uzunluğu bildirir; parçalar sırasız okunsa da kayıt son parçada değil, hepsi okununca silinir', async (t) => {
  const url = await sunucu(t, BUYUK);
  const CHUNK = 100000;
  const r = await getir({ url, chunk: CHUNK });
  assert.equal(r.total, BUYUK.length);
  assert.equal(r.done, false);
  const sayi = Math.ceil((BUYUK.length - CHUNK) / CHUNK);
  const parcalar = new Array(sayi);
  // sondan başa: son parça ilk okunsa bile kayıt kalmalı
  for (let i = sayi - 1; i >= 0; i--) {
    const y = svc.oku({ id: r.id, offset: CHUNK + i * CHUNK, length: CHUNK });
    assert.equal(y.returnValue, true, i + '. parça okundu');
    parcalar[i] = y.data;
  }
  assert.equal(r.data + parcalar.join(''), BUYUK);
  assert.equal(svc.oku({ id: r.id, offset: 0, length: 10 }).returnValue, false, 'tüm parçalar okununca kayıt silinir');
});

test('ağ: servis yolu büyük yanıtı paralel okur, sıra bozulmaz, ilerleme artar; eksik gelirse hata verir', async () => {
  const sakla = globalThis.window;
  const { servisGet } = await import('../webos/src/net.js');
  let aktif = 0;
  let enCok = 0;
  let okumaSayisi = 0;
  const kayit = {};
  const METIN = 'abcçdefgğhıij'.repeat(60000); // 780k karakter
  class Kopru {
    call(uri, json) {
      const p = JSON.parse(json);
      const komut = uri.split('/').pop();
      const yanit = (o) => setTimeout(() => this.onservicecallback(JSON.stringify(o)), 0);
      if (komut === 'roleBilgi') return yanit({ returnValue: false, errorText: 'yerel aktarım yok' }); // yedek (köprü) yolu sınanıyor
      if (komut === 'fetch') {
        kayit.id = 'x1';
        return yanit({ returnValue: true, status: 200, total: METIN.length, data: METIN.slice(0, p.chunk), id: 'x1', done: false });
      }
      okumaSayisi++;
      aktif++;
      enCok = Math.max(enCok, aktif);
      // geç gelen parça önce biten parçayı geçmesin diye gecikme sondan başa azalır
      const gecikme = Math.max(1, 30 - Math.floor(p.offset / p.length) * 4);
      setTimeout(() => {
        aktif--;
        this.onservicecallback(JSON.stringify({ returnValue: true, data: METIN.slice(p.offset, p.offset + p.length), done: p.offset + p.length >= METIN.length }));
      }, gecikme);
    }
  }
  globalThis.window = { WebOSServiceBridge: Kopru };
  try {
    const ilerleme = [];
    const m = await servisGet('http://x/y', { onProgress: (n) => ilerleme.push(n) });
    assert.equal(m, METIN);
    assert.ok(enCok > 1 && enCok <= 2, 'parçalar aynı anda istendi, en çok 2 (' + enCok + ')');
    assert.equal(okumaSayisi, Math.ceil((METIN.length - 24576) / 24576));
    assert.equal(ilerleme[ilerleme.length - 1], METIN.length);
    // toplam bildirilen uzunluktan kısa içerik gelirse sessizce bozuk metin verilmez
    class Eksik extends Kopru {
      call(uri, json) {
        if (uri.split('/').pop() === 'fetch') return super.call(uri, json);
        const p = JSON.parse(json);
        setTimeout(() => this.onservicecallback(JSON.stringify({ returnValue: true, data: METIN.slice(p.offset, p.offset + 10), done: false })), 0);
      }
    }
    globalThis.window = { WebOSServiceBridge: Eksik };
    await assert.rejects(() => servisGet('http://x/y', {}), /eksik/);
  } finally {
    globalThis.window = sakla;
  }
});

test('xtream: bellekte biten kategori hazır sayılır, hata vereni sayılmaz', async () => {
  const { createXtream } = await import('../webos/src/data.js');
  const veri = JSON.stringify([{ stream_id: 1, name: 'Kanal', category_id: '5' }]);
  let bozuk = true;
  const net = {
    json: async () => [{ category_id: '5', category_name: 'Haber' }],
    get: async () => {
      if (bozuk) throw new Error('ağ yok');
      return veri;
    },
  };
  const p = createXtream({ id: 'hiz1', server: 'http://s', user: 'u', pass: 'p' }, net, { oku: async () => null, yaz: async () => false });
  assert.equal(p.hazir('live', '5'), false);
  await assert.rejects(() => p.items('live', '5'));
  assert.equal(p.hazir('live', '5'), false, 'hata veren istek hazır sayılmaz');
  bozuk = false;
  const sonuc = p.items('live', '5');
  assert.equal(p.hazir('live', '5'), false, 'istek sürerken hazır değil');
  await sonuc;
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(p.hazir('live', '5'), true);
});
