// LG webOS maç sayfası: yayın kanalı eşleme ve açma, takım takibi, kumanda odağı.
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
  querySelector(sel) {
    return this.qs[sel] || (this.qs[sel] = new F('q'));
  }
}
globalThis.window = globalThis.window || {};
globalThis.document = { createElement: (t) => new F(t), getElementById: () => null, querySelectorAll: () => [], documentElement: { style: {} }, body: new F('body') };
globalThis.getComputedStyle = () => ({ fontSize: '20px' });

const { ctx, push, top } = await import('../webos/src/ctx.js');
const { createStore, bellekDepo } = await import('../webos/src/store.js');
const { macScreen } = await import('../webos/src/screens/mac.js');
const { FAV_KEY } = await import('../www/js/sports-fav.js');

const gun0 = new Date(2026, 10, 20).getTime();
const m = { id: 'e1', lg: 'tur.1', t: gun0 + 20 * 3600e3, state: 'pre', text: '', home: { name: 'Galatasaray', label: 'Galatasaray', score: null }, away: { name: 'Fenerbahçe', label: 'Fenerbahçe', score: null }, venue: 'RAMS Park' };
const yayin = { tur: 'se', rows: [{ t: m.t + 600e3, teams: ['Galatasaray', 'Fenerbahçe'], channels: ['beIN Sports 1'] }] };
const bekle = () => new Promise((r) => setTimeout(r, 5));

function kur(canli, y) {
  ctx.stack.length = 0;
  ctx.root = new F('root');
  ctx.store = createStore(bellekDepo());
  const s = ctx.store.addSource({ type: 'xtream', name: 'T', server: 'http://srv:80', user: 'u', pass: 'p' });
  ctx._prov = { all: async () => canli };
  ctx._provId = s.id;
  ctx.reg.player = (a) => ({ el: new F('p'), name: 'player', args: a });
  push({ el: new F('alt'), name: 'alt', onKey: () => false });
  const scr = macScreen({ m, gun: gun0, veri: { yayin: async () => y } });
  push(scr);
  return { scr, tus: (a) => scr.onKey(a), dugmeler: () => scr.el.querySelector('#mc-b').innerHTML, yt: () => scr.el.querySelector('#mc-yt').innerHTML };
}

test('maç sayfası: yayın kanalı listede varsa düğme çıkar, OK kanalı açar', async () => {
  const o = kur([{ id: 'c1', kind: 'live', name: 'TR: BEIN SPORTS 1 HD' }, { id: 'c2', kind: 'live', name: 'TR: TRT 1 HD' }], yayin);
  assert.match(o.dugmeler(), /takip et/, 'kanal gelmeden takip düğmeleri var');
  await bekle();
  assert.match(o.yt(), /beIN Sports 1/);
  assert.match(o.dugmeler(), /▶ TR: BEIN SPORTS 1 HD/);
  o.tus('ok'); // ilk düğme: kanal
  assert.equal(top().name, 'player');
  assert.equal(top().args.list[0].name, 'TR: BEIN SPORTS 1 HD');
  assert.equal(top().args.index, 0);
});

test('maç sayfası: kanal yoksa bunu söyler; Sarı/Mavi ev sahibi ve deplasmanı takip eder', async () => {
  const o = kur([{ id: 'c2', kind: 'live', name: 'TR: TRT 1 HD' }], yayin);
  await bekle();
  assert.match(o.yt(), /listenizde bu kanallar bulunamadı/);
  assert.ok(!/▶/.test(o.dugmeler()));
  o.tus('yellow');
  assert.ok(ctx.store.setting(FAV_KEY, []).length === 1);
  assert.match(o.dugmeler(), /★ Galatasaray takipte/);
  o.tus('blue');
  assert.ok(ctx.store.setting(FAV_KEY, []).length === 2);
  o.tus('yellow'); // yeniden: takipten çıkar
  assert.ok(ctx.store.setting(FAV_KEY, []).length === 1);
  assert.match(o.dugmeler(), /☆ Galatasaray takip et/);
});

test('maç sayfası: yayın bilgisi yoksa açıklama; ▲ ilk düğmede Geri düğmesine bırakır, ▼ iner', async () => {
  const o = kur([], null);
  await bekle();
  assert.match(o.yt(), /Yayın bilgisi alınamadı/);
  assert.equal(o.tus('up'), false, 'ilk düğmede ▲ dışarı bırakılır (Geri düğmesi)');
  assert.equal(o.tus('down'), true);
  assert.match(o.dugmeler(), /f-btn on" data-i="1"/);
  assert.equal(o.tus('up'), true);
  assert.equal(o.tus('left'), true);
});
