// LG webOS oynatıcı: kumanda odağı (Geri düğmesi, düğme çubuğu, kanal listesi, ▲▼ kanal değiştirme ayarı).
import test from 'node:test';
import assert from 'node:assert/strict';

const temizle = []; // oluşturulan oynatıcıların zamanlayıcıları, test başarısız olsa da kapatılır
test.after(() => temizle.forEach((f) => f()));

class F {
  constructor(tag) {
    Object.assign(this, { tag, className: '', style: {}, _html: '', textContent: '', children: [], attrs: {}, paused: true, currentTime: 0, duration: NaN, readyState: 0, clientHeight: 600, clientWidth: 800, parentNode: null, nodeType: 1, firstChild: { style: {} }, l: {}, qs: {} });
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
  addEventListener(a, f) {
    (this.l[a] = this.l[a] || []).push(f);
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  getAttribute(k) {
    return k in this.attrs ? this.attrs[k] : null;
  }
  removeAttribute(k) {
    delete this.attrs[k];
  }
  querySelector(sel) {
    return this.qs[sel] || (this.qs[sel] = new F('q'));
  }
  play() {
    this.paused = false;
  }
  pause() {
    this.paused = true;
  }
  load() {}
}
globalThis.window = globalThis.window || {};
globalThis.document = { createElement: (t) => new F(t), getElementById: () => null, querySelectorAll: () => [], documentElement: { style: {} }, body: new F('body') };
globalThis.getComputedStyle = () => ({ fontSize: '20px' });

const { ctx, push, pop, top } = await import('../webos/src/ctx.js');
const { createStore, bellekDepo } = await import('../webos/src/store.js');
const { playerScreen } = await import('../webos/src/screens/player.js');

const KANALLAR = [1, 2, 3].map((n) => ({ id: 'k' + n, kind: 'live', name: 'Kanal ' + n, num: n, streamId: 100 + n }));

function kur(ayar) {
  ctx.stack.length = 0;
  ctx.root = new F('root');
  ctx.store = createStore(bellekDepo());
  ctx.store.addSource({ type: 'xtream', name: 'T', server: 'http://srv:80', user: 'u', pass: 'p' });
  ctx.net = { json: async () => ({ epg_listings: [] }), get: async () => '' };
  for (const k in ayar || {}) ctx.store.setSetting(k, ayar[k]);
  push({ el: new F('alt'), name: 'alt', onKey: () => false });
  const scr = playerScreen({ list: KANALLAR, index: 0 });
  push(scr);
  const q = (sel) => scr.el.querySelector(sel);
  temizle.push(() => scr.destroy());
  return { scr, q, tus: (a) => scr.onKey(a), baslik: () => {
      const h = q('.p-title').innerHTML;
      const n = /class="p-no">([^<]*)</.exec(h);
      const a = /class="p-nm">([^<]*)</.exec(h);
      return (n ? n[1] + '  ' : '') + (a ? a[1] : '');
    }, cubuk: () => q('.p-acts').innerHTML, bitir: () => scr.destroy() };
}

test('oynatıcı: ▲ üstteki Geri düğmesine geçer, OK oynatıcıdan çıkar', () => {
  const o = kur();
  assert.equal(o.tus('up'), true);
  assert.equal(o.q('.top-back').className, 'top-back on');
  assert.equal(o.baslik(), '1  Kanal 1', 'kanal değişmedi');
  o.tus('ok');
  assert.equal(top().name, 'alt', 'Geri düğmesinde OK ekranı kapatır');
  o.bitir();
});

test('oynatıcı: ▼ düğme çubuğuna iner, ◀▶ düğme seçer, ▲ Geri düğmesine, ▼ yayına döner', () => {
  const o = kur();
  assert.ok(!/p-b on/.test(o.cubuk()));
  o.tus('down');
  assert.match(o.cubuk(), /p-b on" data-a="list"/);
  o.tus('right');
  assert.match(o.cubuk(), /p-b on" data-a="last"/);
  o.tus('left');
  o.tus('up');
  assert.equal(o.q('.top-back').className, 'top-back on');
  assert.ok(!/p-b on/.test(o.cubuk()), 'çubuktaki seçim kalktı');
  o.tus('down'); // Geri düğmesinden çubuğa
  o.tus('down'); // çubuktan yayına
  assert.equal(o.q('.top-back').className, 'top-back');
  assert.ok(!/p-b on/.test(o.cubuk()));
  assert.equal(o.baslik(), '1  Kanal 1', 'hiçbir adımda kanal değişmedi');
  o.bitir();
});

test('oynatıcı: kanal listesi açılır, seçilen kanal oynar, Geri listeyi kapatır', () => {
  const o = kur();
  o.tus('down');
  o.tus('ok'); // Kanallar
  assert.equal(o.q('.p-list').className, 'p-list on');
  o.tus('down');
  o.tus('down');
  o.tus('ok');
  assert.equal(o.baslik(), '3  Kanal 3');
  assert.equal(o.q('.p-list').className, 'p-list', 'seçimden sonra liste kapanır');
  o.tus('ok'); // odak düğme çubuğunda kaldı: "Kanallar" yeniden açılır
  assert.equal(o.q('.p-list').className, 'p-list on');
  o.tus('back');
  assert.equal(o.q('.p-list').className, 'p-list');
  assert.equal(top().name, 'player', 'Geri yalnız listeyi kapattı');
  o.bitir();
});

test('oynatıcı: P+/P− kanal değiştirir, ▲▼ varsayılanda değiştirmez; ayar açılırsa eski davranış', () => {
  const o = kur();
  o.tus('chdown');
  assert.equal(o.baslik(), '2  Kanal 2');
  o.tus('chup');
  assert.equal(o.baslik(), '1  Kanal 1');
  o.bitir();
  const z = kur({ arrowZap: true });
  z.tus('down');
  assert.equal(z.baslik(), '2  Kanal 2', 'ayar açıkken ▼ kanal değiştirir');
  z.tus('up');
  assert.equal(z.baslik(), '1  Kanal 1');
  assert.equal(z.q('.top-back').className, '', 'Geri düğmesine geçilmedi');
  z.bitir();
});

test('oynatıcı: Geri tuşu her odakta çıkar; numara tuşu odağı yayına döndürüp kanal seçer', () => {
  const o = kur();
  o.tus('down');
  o.tus('back');
  assert.equal(top().name, 'alt');
  o.bitir();
  const p = kur();
  p.tus('up');
  p.tus('num2');
  assert.equal(p.q('.top-back').className, 'top-back', 'sayı tuşu odağı yayına döndürür');
  p.bitir();
});

// Düğme çubuğunda n. düğmeye gidip OK basar (canlıda sıra: Kanallar, Önceki, Favori, Ses, Altyazı, Ekran, Senkron, Bilgi, Uyku, Biçim)
function dugmeAc(o, sira) {
  o.tus('down');
  for (let i = 0; i < sira; i++) o.tus('right');
  o.tus('ok');
}

test('oynatıcı: Ses düğmesi ses yollarını listeler, seçileni açar; Geri paneli kapatır', () => {
  const o = kur();
  const v = o.q('#vid');
  v.audioTracks = [{ label: '', language: 'tur', enabled: true }, { label: 'Dublaj', language: 'eng', enabled: false }];
  dugmeAc(o, 3);
  assert.equal(o.q('.p-pick').className, 'p-pick on');
  assert.match(o.q('.p-pick').innerHTML, /Türkçe/);
  assert.match(o.q('.p-pick').innerHTML, /Dublaj \(İngilizce\)/);
  o.tus('down');
  o.tus('ok');
  assert.equal(v.audioTracks[1].enabled, true);
  assert.equal(v.audioTracks[0].enabled, false);
  o.tus('back');
  assert.equal(o.q('.p-pick').className, 'p-pick');
  assert.equal(top().name, 'player', 'Geri yalnız paneli kapattı');
  o.bitir();
});

test('oynatıcı: ses/altyazı yolu yoksa panel bunu söyler, çıkmaz', () => {
  const o = kur();
  dugmeAc(o, 3);
  assert.match(o.q('.p-pick').innerHTML, /bildirilmedi/);
  o.tus('ok');
  assert.equal(o.q('.p-pick').className, 'p-pick');
  o.tus('right'); // odak çubukta kaldı: Altyazı
  o.tus('ok');
  assert.match(o.q('.p-pick').innerHTML, /altyazı bildirilmedi/);
  o.bitir();
});

test('oynatıcı: Altyazı düğmesi altyazıyı açar ve kapatır', () => {
  const o = kur();
  const v = o.q('#vid');
  v.textTracks = [{ kind: 'subtitles', label: 'Türkçe', language: 'tur', mode: 'disabled' }, { kind: 'metadata', label: 'x', mode: 'disabled' }];
  dugmeAc(o, 4);
  assert.match(o.q('.p-pick').innerHTML, /Kapalı/);
  o.tus('down');
  o.tus('ok');
  assert.equal(v.textTracks[0].mode, 'showing');
  assert.equal(v.textTracks[1].mode, 'disabled', 'altyazı olmayan iz dokunulmadı');
  o.tus('up');
  o.tus('ok');
  assert.equal(v.textTracks[0].mode, 'disabled');
  o.bitir();
});

test('oynatıcı: Ekran düğmesi boyutu seçer, ayara yazar ve videoya uygular', () => {
  const o = kur();
  const v = o.q('#vid');
  dugmeAc(o, 5);
  assert.match(o.q('.p-pick').innerHTML, /Yakınlaştır %25/);
  for (let i = 0; i < 4; i++) o.tus('down');
  o.tus('ok');
  assert.equal(ctx.store.setting('aspect', ''), 'z125');
  assert.equal(v.style.transform, 'scale(1.25)');
  assert.equal(v.style.objectFit, 'contain');
  o.tus('up');
  o.tus('up');
  o.tus('up');
  o.tus('up');
  o.tus('ok');
  assert.equal(v.style.transform, '');
  o.bitir();
});

test('oynatıcı: Senkron ◀▶ ile 50 ms adımla sesi geciktirir; Web Audio yoksa uyarır ve sıfırda kalır', () => {
  const o = kur();
  dugmeAc(o, 6);
  assert.match(o.q('.p-pick').innerHTML, /0 ms/);
  o.tus('right'); // Web Audio yok: desteklenmiyor
  assert.match(o.q('.p-pick').innerHTML, /0 ms/);
  o.bitir();
  const gecik = { delayTime: { value: 0 }, connect() {} };
  globalThis.window.AudioContext = class {
    constructor() {
      this.destination = {};
    }
    createMediaElementSource() {
      return { connect() {} };
    }
    createDelay() {
      return gecik;
    }
    close() {}
  };
  try {
    const z = kur();
    dugmeAc(z, 6);
    z.tus('right');
    z.tus('right');
    assert.match(z.q('.p-pick').innerHTML, /100 ms/);
    assert.equal(gecik.delayTime.value, 0.1);
    z.tus('left');
    assert.equal(gecik.delayTime.value, 0.05);
    z.tus('down');
    z.tus('ok'); // Sıfırla
    assert.equal(gecik.delayTime.value, 0);
    z.tus('back');
    z.bitir();
  } finally {
    delete globalThis.window.AudioContext;
  }
});

test('oynatıcı: kumandanın Bilgi tuşu bilgi panelini açar ve kapatır', () => {
  const o = kur();
  o.tus('info');
  assert.equal(o.q('.p-pick').className, 'p-pick on');
  assert.match(o.q('.p-pick').innerHTML, /Kanal 1/);
  assert.match(o.q('.p-pick').innerHTML, /Kaynak/);
  o.tus('info');
  assert.equal(o.q('.p-pick').className, 'p-pick');
  o.bitir();
});
