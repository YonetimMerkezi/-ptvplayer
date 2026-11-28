// Sıralama: Intl.Collator açılışta değil ilk sıralamada kurulur (ICU verisi yüklemek zayıf TV kutusunda onlarca ms sürer).
import test from 'node:test';
import assert from 'node:assert/strict';

test('sort.js: modül yüklenince Collator kurulmaz; ilk sıralamada bir kez kurulur', async () => {
  const Gercek = Intl.Collator;
  let kuruldu = 0;
  Intl.Collator = function Sayac(...a) {
    kuruldu++;
    return new Gercek(...a);
  };
  try {
    const m = await import('../www/js/sort.js?lazy');
    assert.equal(kuruldu, 0, 'içe aktarma Collator kurmamalı');
    const sirali = m.sortItems([{ name: 'b' }, { name: 'a' }, { name: 'c' }], 'az');
    assert.deepEqual(sirali.map((x) => x.name), ['a', 'b', 'c']);
    m.sortItems([{ name: 'z' }, { name: 'y' }], 'za');
    assert.equal(kuruldu, 1, 'ilk sıralamada bir kez kurulur, sonra yeniden kullanılır');
  } finally {
    Intl.Collator = Gercek;
  }
});
