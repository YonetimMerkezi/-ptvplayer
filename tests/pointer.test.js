// TV'deki sanal imleç (telefondaki fare alanı) ve "yaz" komutunun arama kutusuna yazması.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPointer, scrollParent, typeInto, HIDE_MS } from '../www/js/pointer.js';

class Ev {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
}

function dunya({ gen = 1920, yuk = 1080 } = {}) {
  const olaylar = [];
  const mk = (tag, o = {}) => ({ tagName: tag, matches: () => false, dispatchEvent: (e) => olaylar.push(`${tag}:${e.type}${e.clientX !== undefined ? `@${e.clientX},${e.clientY}` : ''}`), click() { olaylar.push(`${tag}:click()`); }, ...o });
  const hedef = mk('DIV');
  const girdi = mk('INPUT', { odak: 0, focus() { this.odak++; }, matches: (q) => /input/.test(q), value: '' });
  let altinda = hedef;
  const dugumler = [];
  const zamanlar = [];
  const scrolling = { scrollTop: 100 };
  const doc = {
    body: { appendChild: (d) => dugumler.push(d) },
    createElement: () => ({ style: {}, className: '', innerHTML: '' }),
    elementFromPoint: () => altinda,
    scrollingElement: scrolling,
    activeElement: null,
    getElementById: () => null,
  };
  const win = { innerWidth: gen, innerHeight: yuk, MouseEvent: Ev, Event: Ev, KeyboardEvent: Ev, getComputedStyle: (n) => ({ overflowY: n.overflowY || 'visible' }) };
  return {
    doc, win, olaylar, hedef, girdi, dugumler, zamanlar, scrolling,
    altinda: (n) => (altinda = n),
    kur: () => createPointer({ doc, win, setT: (f, ms) => (zamanlar.push([f, ms]), zamanlar.length), clearT: () => {} }),
  };
}

test('imleç: ortada başlar, ekran sınırında kalır, hareket mousemove üretir, 5 sn sonra gizlenir ve yeniden görünür', () => {
  const d = dunya();
  const p = d.kur();
  assert.deepEqual(p.move(100, -50), { x: 1060, y: 490 });
  assert.equal(d.dugumler.length, 1);
  assert.equal(d.dugumler[0].className, 'vptr');
  assert.equal(d.dugumler[0].style.display, 'block');
  assert.deepEqual(d.olaylar, ['DIV:mousemove@1060,490']);
  assert.deepEqual(p.move(-99999, 99999), { x: 0, y: 1079 }, 'ekran dışına çıkmaz');
  assert.deepEqual(p.move('a', undefined), { x: 0, y: 1079 }, 'sayı olmayan hareket sıfır sayılır');
  const son = d.zamanlar[d.zamanlar.length - 1];
  assert.equal(son[1], HIDE_MS);
  son[0]();
  assert.equal(d.dugumler[0].style.display, 'none');
  p.move(1, 1);
  assert.equal(d.dugumler[0].style.display, 'block');
  assert.equal(d.dugumler.length, 1, 'düğüm bir kez oluşturulur');
});

test('imleç: tıklama altındaki öğeye gider; yazı alanına odak verir; öğe yoksa false', () => {
  const d = dunya();
  const p = d.kur();
  p.move(10, 10);
  d.olaylar.length = 0;
  assert.equal(p.click(), true);
  assert.deepEqual(d.olaylar, ['DIV:mousedown@970,550', 'DIV:mouseup@970,550', 'DIV:click()']);
  d.altinda(d.girdi);
  assert.equal(p.click(), true);
  assert.equal(d.girdi.odak, 1, 'yazı alanına tıklayınca odak verilir');
  d.altinda(null);
  assert.equal(p.click(), false);
});

test('imleç: kaydırma imlecin altındaki kaydırılabilir kapsayıcıyı oynatır; yoksa sayfayı; parmak aşağı = içerik aşağı', () => {
  const d = dunya();
  const p = d.kur();
  const liste = { nodeType: 1, overflowY: 'auto', scrollHeight: 2000, clientHeight: 500, scrollTop: 300, parentElement: null };
  const ic = { nodeType: 1, overflowY: 'visible', scrollHeight: 10, clientHeight: 10, parentElement: liste };
  d.altinda(ic);
  assert.equal(p.scroll(120), true);
  assert.equal(liste.scrollTop, 180, 'parmak 120 aşağı → liste yukarı çıkar (scrollTop azalır)');
  assert.equal(p.scroll(-50), true);
  assert.equal(liste.scrollTop, 230);
  d.altinda({ nodeType: 1, overflowY: 'visible', scrollHeight: 5, clientHeight: 5, parentElement: null });
  assert.equal(p.scroll(40), true);
  assert.equal(d.scrolling.scrollTop, 60, 'kaydırılabilir kapsayıcı yoksa sayfa kayar');
  assert.equal(scrollParent(ic, d.win), liste);
  assert.equal(scrollParent({ nodeType: 1, overflowY: 'auto', scrollHeight: 100, clientHeight: 100, parentElement: null }, d.win), null, 'taşma yoksa kaydırılamaz');
});

test('typeInto: odaktaki ya da görünen arama kutusuna yazar ve input olayı üretir; enter keydown gönderir; kutu yoksa Ara açılıp tekrar denenir', () => {
  const d = dunya();
  const olay = [];
  const kutu = { value: '', matches: () => true, offsetParent: {}, dispatchEvent: (e) => olay.push(e.type + (e.key ? ':' + e.key : '')) };
  d.doc.activeElement = kutu;
  assert.equal(typeInto('gora', { doc: d.doc, win: d.win }), true);
  assert.equal(kutu.value, 'gora');
  assert.deepEqual(olay, ['input']);
  olay.length = 0;
  typeInto('gora özel', { enter: true, doc: d.doc, win: d.win });
  assert.deepEqual(olay, ['input', 'keydown:Enter']);
  // odakta alan yok, ama genel arama sayfasındaki kutu görünüyor
  d.doc.activeElement = null;
  const gs = { value: '', offsetParent: {}, dispatchEvent: () => {} };
  d.doc.getElementById = (id) => (id === 'gs-q' ? gs : null);
  assert.equal(typeInto('film', { doc: d.doc, win: d.win }), true);
  assert.equal(gs.value, 'film');
  // hiç kutu yok: üstteki Ara açılır, kısa süre sonra kutu bulunursa yazılır
  d.doc.getElementById = () => null;
  let acildi = 0;
  const gec = [];
  assert.equal(typeInto('dizi', { doc: d.doc, win: d.win, open: () => (acildi++, (d.doc.getElementById = (id) => (id === 'q' ? gs : null))), setT: (f, ms) => gec.push([f, ms]) }), false);
  assert.equal(acildi, 1);
  assert.equal(gs.value, 'film', 'henüz yazılmadı');
  gec[0][0]();
  assert.equal(gs.value, 'dizi', 'Ara açıldıktan sonra yazıldı');
  // gizli (offsetParent null) kutu yok sayılır
  const gizli = { value: '', offsetParent: null, dispatchEvent: () => {} };
  d.doc.getElementById = () => gizli;
  assert.equal(typeInto('x', { doc: d.doc, win: d.win, open: () => {}, setT: () => {} }), false);
  assert.equal(gizli.value, '');
});
