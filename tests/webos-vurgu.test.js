import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hoverBagla, HOVER_SECICI } from '../webos/src/vurgu.js';

const css = readFileSync(new URL('../webos/css/tv.css', import.meta.url), 'utf8');

// Minimal sahte DOM: yalnızca enYakin'in kullandığı alanlar + classList + olay dinleyicileri
function dugum(sinif, ebeveyn) {
  const set = new Set(sinif.split(' ').filter(Boolean));
  return {
    nodeType: 1,
    parentNode: ebeveyn || null,
    classList: { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) },
    matches(sel) { return sel.split(',').some((s) => s.trim().startsWith('.') && set.has(s.trim().slice(1))); },
  };
}
function belge() {
  const dinleyici = {};
  const body = dugum('');
  return { body, addEventListener: (ad, f) => { (dinleyici[ad] = dinleyici[ad] || []).push(f); }, yay: (ad, ev) => (dinleyici[ad] || []).forEach((f) => f(ev || {})) };
}

test('imleç odaklanabilir öğenin (ya da içindeki öğenin) üzerine gelince .hv alır, ayrılınca kaybeder', () => {
  const doc = belge();
  const karo = dugum('tile', doc.body);
  const ic = dugum('baslik', karo);
  const dis = dugum('bos', doc.body);
  hoverBagla(doc);
  doc.yay('mousemove', { target: ic });
  assert.ok(karo.classList.contains('hv'));
  doc.yay('mousemove', { target: dis });
  assert.ok(!karo.classList.contains('hv'));
});

test('aynı anda tek öğe vurgulu: imleç başka öğeye geçince öncekinden .hv kalkar', () => {
  const doc = belge();
  const a = dugum('vl-it', doc.body);
  const b = dugum('vl-it', doc.body);
  hoverBagla(doc);
  doc.yay('mousemove', { target: a });
  doc.yay('mousemove', { target: b });
  assert.ok(!a.classList.contains('hv') && b.classList.contains('hv'));
});

test('tuşa, tekerleğe basılınca ve imleç sayfadan çıkınca vurgu kalkar', () => {
  for (const [ad, ev] of [['keydown', {}], ['wheel', {}], ['mouseout', { relatedTarget: null }]]) {
    const doc = belge();
    const t = dugum('top-back', doc.body);
    hoverBagla(doc);
    doc.yay('mousemove', { target: t });
    assert.ok(t.classList.contains('hv'), ad);
    doc.yay(ad, ev);
    assert.ok(!t.classList.contains('hv'), ad);
  }
});

test('css: her odak (.on) kuralının .hv eşi var ve iki seçici aynı bildirimde', () => {
  const sin = HOVER_SECICI.split(',').map((s) => s.trim());
  let sayi = 0;
  for (const satir of css.split('\n')) {
    const m = /^([^{@}]+)\{/.exec(satir);
    if (!m) continue;
    for (const s of sin) {
      const re = new RegExp(s.replace('.', '\\.') + '\\.on(?![\\w-])');
      if (re.test(m[1])) {
        sayi++;
        assert.ok(new RegExp(s.replace('.', '\\.') + '\\.hv(?![\\w-])').test(m[1]), 'hv eşi yok: ' + satir.slice(0, 80));
      }
    }
  }
  assert.ok(sayi >= 20, 'beklenenden az odak kuralı: ' + sayi);
});

test('css: üst çubuk düğmeleri (Geri, Ara, Kumanda) en az 3,8rem (1080p\'de 76px) yüksek', () => {
  for (const s of ['top-back', 'top-ara', 'top-kum']) {
    const satir = css.split('\n').find((l) => l.startsWith('.' + s + ' {'));
    assert.ok(satir, s);
    const m = /min-height:\s*([\d.]+)rem/.exec(satir);
    assert.ok(m && parseFloat(m[1]) >= 3.8, s + ' yüksekliği');
  }
});

test('app.js açılışta hoverBagla çağırır', () => {
  assert.match(readFileSync(new URL('../webos/src/app.js', import.meta.url), 'utf8'), /hoverBagla\(document\)/);
});
