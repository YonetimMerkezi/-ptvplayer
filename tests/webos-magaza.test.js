// LG Content Store sürümü: derleme güncelleme kodunu paketten çıkarır, normal (yan yükleme) sürümü etkilemez.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { magazaKes, magazaKomutlari, IZ } = await import('../webos/scripts/magaza.mjs');
const require = createRequire(import.meta.url);
const servisKlasoru = new URL('../webos/service/', import.meta.url).pathname;
const kaynak = readFileSync(new URL('../webos/service/service.js', import.meta.url), 'utf8');
const servisler = readFileSync(new URL('../webos/service/services.json', import.meta.url), 'utf8');

test('kesme işaretleri çiftli ve iç içe değil', () => {
  const ac = (kaynak.match(/<magaza-kes[ >]/g) || []).length;
  const kapat = (kaynak.match(/<\/magaza-kes>/g) || []).length;
  assert.equal(ac, kapat);
  assert.ok(ac >= 4, 'başlık, bölüm, dışa aktarım ve kayıt bölgeleri işaretli olmalı');
});

test('normal servis güncelleme koduna sahip (yan yükleme sürümü bozulmaz)', () => {
  assert.ok(IZ.test(kaynak));
  assert.ok(/appInstallService\/dev\/install/.test(kaynak));
});

test('mağaza servisinde güncelleme izi kalmaz ve dosya yine yüklenir', () => {
  const kes = magazaKes(kaynak);
  assert.equal(IZ.test(kes), false);
  assert.ok(kes.length < kaynak.length);
  const kok = mkdtempSync(join(tmpdir(), 'iptv-magaza-'));
  try {
    mkdirSync(join(kok, 'service'));
    const yol = join(kok, 'service', 'service.js');
    writeFileSync(yol, kes);
    copyFileSync(join(servisKlasoru, 'kumanda.html'), join(kok, 'service', 'kumanda.html')); // servis telefon sayfasını yanından okur
    const s = require(yol);
    for (const ad of Object.keys(s)) assert.equal(/guncelle/i.test(ad), false, ad);
    assert.equal(typeof s.donusKur, 'function', 'fragman dönüş bekçisi korunur');
    assert.equal(typeof s.kumandaSor, 'function', 'telefon kumandası korunur');
  } finally {
    rmSync(kok, { recursive: true, force: true });
  }
});

test('services.json: guncelle komutları silinir, diğerleri kalır', () => {
  const once = JSON.parse(servisler);
  const adlar = (j) => j.services.flatMap((h) => h.commands.map((c) => c.name));
  assert.ok(adlar(once).includes('guncelleBaslat'));
  const sonra = JSON.parse(magazaKomutlari(servisler));
  assert.equal(adlar(sonra).some((a) => /^guncelle/.test(a)), false);
  assert.equal(adlar(sonra).length, adlar(once).length - adlar(once).filter((a) => /^guncelle/.test(a)).length);
  assert.ok(adlar(sonra).includes('donusKur'));
});

test('yerine=… ve \\n destekli kesme', () => {
  const k = 'a\n// <magaza-kes yerine="x = 1;\\ny = 2;\\n">\ngizli\n// </magaza-kes>\nb\n';
  assert.equal(magazaKes(k), 'a\nx = 1;\ny = 2;\nb\n');
  assert.equal(magazaKes('a\n  // <magaza-kes>\ngizli\n  // </magaza-kes>\nb\n'), 'a\nb\n');
});
