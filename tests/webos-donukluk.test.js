// Arayüz donma ölçer: sayaç gecikince en uzun süre ve eşik üstü donma sayısı tutulur, kayda yazılır.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baslat, durdur, durum, sifirla } from '../webos/src/donukluk.js';
import { kayitlar } from '../webos/src/log.js';

test('donukluk: sayaç gecikince en uzun süre ve eşik üstü donma sayısı kaydedilir, Hata kaydına yazılır', async () => {
  sifirla();
  let t = 1000;
  let tik = 0;
  // Her sayaç adımı 100 ms ilerler; ikinci adımda TV 1,5 sn takılmış gibi saat sıçrar
  baslat(() => 'spor', () => {
    tik++;
    t += tik === 2 ? 1600 : 100;
    return t;
  });
  await new Promise((r) => setTimeout(r, 450));
  durdur();
  const d = durum();
  assert.ok(d.enUzun >= 1400, 'en uzun donma ölçüldü: ' + d.enUzun);
  assert.equal(d.sayi, 1, 'yalnız eşik üstü donma sayılır');
  assert.ok(kayitlar().some((s) => /Arayüz \d+ ms yanıtsız kaldı \(spor\)/.test(s)));
});
