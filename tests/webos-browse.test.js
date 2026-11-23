// LG webOS gözatma: detaydan/oynatıcıdan Geri ile dönünce liste kaldığı satırda kalır (kategori yeniden yüklenip başa atlamaz).
import test from 'node:test';
import assert from 'node:assert/strict';

class F {
  constructor(tag) {
    Object.assign(this, { tag, className: '', style: {}, _html: '', textContent: '', children: [], attrs: {}, clientHeight: 600, clientWidth: 800, parentNode: null, nodeType: 1, l: {}, qs: {} });
  }
  set innerHTML(v) {
    this._html = v;
  }
  get innerHTML() {
    return this._html;
  }
  appendChild(c) {
    this.children.push(c);
    c.parentNode = this;
    return c;
  }
  removeChild(c) {
    this.children = this.children.filter((x) => x !== c);
    return c;
  }
  addEventListener() {}
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  getAttribute(k) {
    return k in this.attrs ? this.attrs[k] : null;
  }
  replaceChild(yeni, eski) {
    yeni.parentNode = this;
    return eski;
  }
  querySelector(sel) {
    if (!this.qs[sel]) {
      this.qs[sel] = new F('q');
      this.qs[sel].parentNode = this;
    }
    return this.qs[sel];
  }
  querySelectorAll() {
    return [];
  }
}
globalThis.window = globalThis.window || {};
globalThis.document = { createElement: (t) => new F(t), getElementById: () => null, querySelectorAll: () => [], documentElement: { style: {} }, body: new F('body') };
globalThis.getComputedStyle = () => ({ fontSize: '20px' });

const { ctx, push, pop } = await import('../webos/src/ctx.js');
const { createStore, bellekDepo } = await import('../webos/src/store.js');
const { browseScreen } = await import('../webos/src/screens/browse.js');

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const kanallar = Array.from({ length: 60 }, (_, i) => ({ id: 'c' + i, name: 'Kanal ' + i, kind: 'live', num: i + 1 }));

function kur() {
  ctx.stack.length = 0;
  ctx.root = new F('root');
  ctx.store = createStore(bellekDepo());
  const s = ctx.store.addSource({ type: 'xtream', name: 'T', server: 'http://srv:80', user: 'u', pass: 'p' });
  const say = { items: 0 };
  ctx._prov = {
    hasEpg: false,
    categories: async () => [{ id: 'k1', name: 'Ulusal' }, { id: 'k2', name: 'Spor' }],
    items: async () => {
      say.items++;
      return kanallar;
    },
  };
  ctx._provId = s.id;
  push({ el: new F('alt'), name: 'alt', onKey: () => false });
  const scr = browseScreen({ kind: 'live' });
  push(scr);
  return { scr, say };
}

test('gözatma: detaydan Geri ile dönünce liste kaldığı satırda kalır, kategori yeniden yüklenmez', async () => {
  const { scr, say } = kur();
  await bekle(400); // kategoriler gelir, ilk kategorinin kanalları yüklenir
  assert.equal(say.items, 1);
  scr.onKey('right'); // kategoriden listeye
  for (let i = 0; i < 7; i++) assert.equal(scr.onKey('down'), true);
  // başka ekran açılıp kapanır (detay → oynatıcı → Geri)
  push({ el: new F('detay'), name: 'detay', onKey: () => false });
  await bekle(20);
  pop();
  await bekle(450); // kategori odak zamanlayıcısı (260 ms) dolsun
  assert.equal(say.items, 1, 'geri dönüşte kategori yeniden yüklenmedi');
  // liste hâlâ 8. satırda: 7 kez ▲ ilk satıra iner; başa atlamış olsaydı ilk ▲ listeden çıkardı (false)
  for (let i = 0; i < 7; i++) assert.equal(scr.onKey('up'), true, i + 1 + '. ▲ satırda kaldı');
  assert.equal(scr.onKey('up'), false, 'ilk satırdayız');
});

// Kategori hızı: komşu kategoriler (canlı TV dahil) arka planda önceden yüklenir; bellekte hazır kategori bekletmeden açılır
function kurHizli(kind) {
  ctx.stack.length = 0;
  ctx.root = new F('root');
  ctx.store = createStore(bellekDepo());
  const s = ctx.store.addSource({ type: 'xtream', name: 'H', server: 'http://hiz:80', user: 'u', pass: 'p' });
  const cagri = []; // [kategori, ön plan mı]
  const hazir = {};
  ctx._prov = {
    type: 'xtream',
    hasEpg: false,
    categories: async () => Array.from({ length: 12 }, (_, i) => ({ id: 'k' + i, name: 'Kat ' + i })),
    hazir: (t, id) => !!hazir[id],
    items: async (t, id, grup) => {
      cagri.push([id, grup !== null]);
      await bekle(5);
      hazir[id] = true;
      return kanallar;
    },
  };
  ctx._provId = s.id;
  push({ el: new F('alt'), name: 'alt', onKey: () => false });
  const scr = browseScreen({ kind });
  push(scr);
  return { scr, cagri };
}

test('kategori hızı: canlı TV için de komşu kategoriler arka planda yüklenir, hepsi bir kez', async () => {
  const { cagri } = kurHizli('live');
  await bekle(900);
  const yuklenen = cagri.map((c) => c[0]);
  assert.equal(yuklenen[0], 'k0', 'önce seçili kategori ön planda');
  assert.deepEqual(cagri[0], ['k0', true]);
  for (const k of ['k1', 'k2', 'k3', 'k4', 'k5', 'k6']) assert.ok(yuklenen.indexOf(k) > 0, k + ' önceden yüklendi');
  assert.ok(cagri.slice(1).every((c) => c[1] === false), 'önyükleme ön plan isteğini kesmeyen gruptan gider');
  assert.equal(new Set(yuklenen).size, yuklenen.length, 'aynı kategori iki kez istenmedi');
});

test('kategori hızı: bellekte hazır kategoriye geçince 160 ms beklenmez', async () => {
  const { scr, cagri } = kurHizli('live');
  await bekle(900); // k1.. önceden yüklendi
  const once = cagri.length;
  assert.equal(scr.onKey('down'), true); // k1'e odak
  await bekle(40);
  const yeni = cagri.slice(once);
  assert.ok(yeni.some((c) => c[0] === 'k1' && c[1] === true), 'k1 ön planda hemen istendi (kısa bekleme yok)');
});

test('yazı boyutu: kök boyut ve [data-fs] kademesi birlikte ayarlanır (sabit yükseklikli kutular en büyük boyutta sıkılaşır)', async () => {
  const { boyutla } = await import('../webos/src/ui.js');
  const kok = document.documentElement;
  const sakla = kok.setAttribute;
  const ozellik = {};
  kok.setAttribute = (k, v) => (ozellik[k] = v);
  try {
    const kademe = (o) => (boyutla(o), ozellik['data-fs']);
    assert.equal(kademe(0.9), 's');
    assert.equal(kademe(1), 'n');
    assert.equal(kademe(1.15), 'l');
    assert.equal(kademe(1.3), 'xl');
    assert.equal(kademe(0), 'n', 'geçersiz değer normal sayılır');
    boyutla(1.3);
    assert.equal(parseFloat(kok.style.fontSize), (720 / 54) * 1.3);
  } finally {
    kok.setAttribute = sakla;
    boyutla(1);
  }
});
