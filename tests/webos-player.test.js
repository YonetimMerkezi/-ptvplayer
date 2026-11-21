// LG webOS oynatıcı: kumanda odağı (Geri düğmesi, düğme çubuğu, kanal listesi, ▲▼ kanal değiştirme ayarı).
import test, { mock } from 'node:test';
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

function kur(ayar, liste, ag) {
  ctx.stack.length = 0;
  ctx.root = new F('root');
  ctx.store = createStore(bellekDepo());
  ctx.store.addSource({ type: 'xtream', name: 'T', server: 'http://srv:80', user: 'u', pass: 'p' });
  ctx.net = ag || { json: async () => ({ epg_listings: [] }), get: async () => '' };
  for (const k in ayar || {}) ctx.store.setSetting(k, ayar[k]);
  push({ el: new F('alt'), name: 'alt', onKey: () => false });
  const scr = playerScreen({ list: liste || KANALLAR, index: 0 });
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

test('oynatıcı: Ses düğmesi ses yollarını listeler, seçileni açar ve paneli kapatır', () => {
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
  assert.equal(o.q('.p-pick').className, 'p-pick', 'seçim yapılınca panel kapanır');
  assert.equal(top().name, 'player');
  o.bitir();
});

test('oynatıcı: Geri ve ◀ paneli kapatır, ekrandan çıkarmaz', () => {
  const o = kur();
  o.q('#vid').audioTracks = [{ label: '', language: 'tur', enabled: true }, { label: 'Dublaj', language: 'eng', enabled: false }];
  dugmeAc(o, 3);
  assert.equal(o.q('.p-pick').className, 'p-pick on');
  o.tus('back');
  assert.equal(o.q('.p-pick').className, 'p-pick');
  assert.equal(top().name, 'player', 'Geri yalnız paneli kapattı');
  o.tus('ok'); // odak çubukta kaldı: Ses yeniden açılır
  assert.equal(o.q('.p-pick').className, 'p-pick on');
  o.tus('left');
  assert.equal(o.q('.p-pick').className, 'p-pick', '◀ yan ayarı olmayan paneli kapatır');
  assert.equal(top().name, 'player');
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
  assert.equal(o.q('.p-pick').className, 'p-pick', 'seçim yapılınca panel kapanır');
  o.tus('ok'); // odak çubukta kaldı: Altyazı paneli yeniden açılır, seçili satır = açık olan
  o.tus('up');
  o.tus('ok');
  assert.equal(v.textTracks[0].mode, 'disabled');
  assert.equal(o.q('.p-pick').className, 'p-pick');
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
  assert.equal(o.q('.p-pick').className, 'p-pick', 'seçim yapılınca panel kapanır');
  o.tus('ok'); // Ekran paneli yeniden açılır; seçili satır = Yakınlaştır %25
  for (let i = 0; i < 4; i++) o.tus('up');
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

// ---- Harici altyazı
const SRT = '1\n00:00:10,000 --> 00:00:12,000\nMerhaba dünya\n\n2\n00:00:20,000 --> 00:00:22,000\nİkinci satır\n';
const FILM = { id: 'f1', kind: 'movie', name: 'TR | Esaret (1994)', year: '1994', streamId: 7, ext: 'mp4' };
function altyaziAgi(durum = {}) {
  const istek = [];
  return {
    istek,
    json: async (url) => {
      istek.push(url);
      if (url.indexOf('/catalog/series/top/search=') >= 0) return { metas: [{ id: 'tt0903747', name: 'Dizi', year: '2008–2013' }] };
      if (url.indexOf('/subtitles/series/tt0903747:1:1.json') >= 0) return { subtitles: [{ id: '1', url: 'http://altyazi.test/d.srt', lang: 'tur' }] };
      if (url.indexOf('/catalog/movie/top/search=') >= 0) return { metas: [{ id: 'tt0111161', name: 'Esaret', year: '1994' }, { id: 'tt9', name: 'Esaret', year: '2015' }] };
      if (url.indexOf('/subtitles/movie/tt0111161.json') >= 0) {
        if (durum.bos) return { subtitles: [] };
        return { subtitles: [{ id: '1', url: 'http://altyazi.test/en.srt', lang: 'eng' }, { id: '2', url: 'http://altyazi.test/tr.srt', lang: 'tur' }] };
      }
      return { epg_listings: [] };
    },
    get: async (url) => {
      istek.push(url);
      return SRT;
    },
  };
}
const altMetin = (o) => o.q('.p-sub').children[0].textContent; // metin, .p-sub içindeki span'da
const bekle = (ms = 5) => new Promise((r) => setTimeout(r, ms));
// Koşul gerçekleşene kadar (en çok 3 sn) bekler: ağ sahtesi zamanlayıcılardan geçtiği için süre sabit varsayılmaz
async function bekleKadar(f, ad) {
  for (let i = 0; i < 150 && !f(); i++) await bekle(20);
  assert.ok(f(), ad + ' bekleniyordu');
}

test('altyazı: film için ara → Türkçe listenin başında → seç → metin zamanında görünür, kaydır ve kapat', async () => {
  const ag = altyaziAgi();
  const o = kur({}, [FILM], ag);
  const v = o.q('#vid');
  v.textTracks = [];
  dugmeAc(o, 4); // Altyazı
  assert.match(o.q('.p-pick').innerHTML, /Altyazı ara…/);
  assert.match(o.q('.p-pick').innerHTML, /gömülü altyazısını uygulamaya vermiyor/);
  o.tus('down'); // Kapalı → Altyazı ara…
  o.tus('ok');
  assert.match(o.q('.p-pick').innerHTML, /aranıyor/);
  await bekleKadar(() => /Altyazı seç/.test(o.q('.p-pick').innerHTML), 'altyazı listesi');
  assert.ok(ag.istek.some((u) => /catalog\/movie\/top\/search=Esaret\.json/.test(u)), 'katalog adı temizlenip aranır');
  assert.ok(ag.istek.some((u) => u.endsWith('/subtitles/movie/tt0111161.json')), 'yıl uyan IMDb kimliğiyle altyazı istenir');
  const html = o.q('.p-pick').innerHTML;
  assert.match(html, /Altyazı seç/);
  assert.ok(html.indexOf('Türkçe') < html.indexOf('İngilizce'), 'Türkçe önce');
  o.tus('ok'); // Türkçe
  await bekleKadar(() => o.q('.p-pick').className === 'p-pick', 'panelin kapanması');
  assert.equal(o.q('.p-pick').className, 'p-pick', 'seçilince panel kapanır');
  assert.ok(ag.istek.includes('http://altyazi.test/tr.srt'));
  v.currentTime = 11;
  await bekle(300); // 250 ms'lik çizim döngüsü
  assert.equal(altMetin(o), 'Merhaba dünya');
  assert.equal(o.q('.p-sub').className, 'p-sub on');
  v.currentTime = 15;
  await bekle(300);
  assert.equal(altMetin(o), '');
  // Kaydır: altyazıyı 1 sn geciktir → 11 sn'de artık görünmez, 11,5 sn'de görünür? (kayma +1 sn: metin 11 sn'de başlar)
  o.tus('ok'); // çubukta Altyazı düğmesi: panel yeniden açılır
  const satirlar = o.q('.p-pick').innerHTML;
  assert.match(satirlar, /Türkçe \(harici\)/);
  assert.match(satirlar, /Altyazıyı kaydır/);
  o.tus('down'); // seçili satır "Türkçe (harici)" → "Altyazıyı kaydır"
  o.tus('ok');
  assert.match(o.q('.p-pick').innerHTML, /Altyazı senkronu/);
  o.tus('right');
  o.tus('right'); // +1,0 sn
  assert.match(o.q('.p-pick').innerHTML, /\+1,0 sn/);
  v.currentTime = 10.5;
  await bekle(300);
  assert.equal(altMetin(o), '', '10,5 sn − 1 sn = 9,5 sn: henüz yok');
  v.currentTime = 11.5;
  await bekle(300);
  assert.equal(altMetin(o), 'Merhaba dünya');
  o.tus('back');
  // Kapalı: katman temizlenir
  o.tus('ok'); // panel yeniden açılır, seçili satır "Türkçe (harici)"
  o.tus('up'); // Kapalı
  o.tus('ok');
  assert.equal(altMetin(o), '');
  assert.equal(o.q('.p-sub').className, 'p-sub');
  o.bitir();
});

test('altyazı: Türkçe ad katalogda başka adla çıkar → "Hangi yapım?" seçtirilir, seçilince altyazılar gelir', async () => {
  const ag = altyaziAgi();
  const baz = ag.json;
  ag.json = async (url) => {
    if (/search=Esaretin%20Bedeli\.json/.test(url)) {
      ag.istek.push(url);
      return { metas: [{ id: 'tt0111161', name: 'The Shawshank Redemption', releaseInfo: '1994' }, { id: 'tt0293927', name: 'Shawshank: The Redeeming Feature', releaseInfo: '2001' }] };
    }
    return baz(url);
  };
  const o = kur({}, [{ id: 'f2', kind: 'movie', name: 'TR | Esaretin Bedeli (1994)', year: '1994', streamId: 8, ext: 'mp4' }], ag);
  o.q('#vid').textTracks = [];
  dugmeAc(o, 4);
  o.tus('down');
  o.tus('ok');
  await bekleKadar(() => /Hangi yapım\?/.test(o.q('.p-pick').innerHTML), 'aday listesi');
  const html = o.q('.p-pick').innerHTML;
  assert.match(html, /The Shawshank Redemption \(1994\)/);
  assert.ok(html.indexOf('(1994)') < html.indexOf('(2001)'), 'yılı uyan aday önce');
  assert.ok(!ag.istek.some((u) => /\/subtitles\//.test(u)), 'kullanıcı seçmeden altyazı istenmez');
  o.tus('ok'); // ilk aday
  await bekleKadar(() => /Altyazı seç/.test(o.q('.p-pick').innerHTML), 'altyazı listesi');
  assert.ok(ag.istek.some((u) => u.endsWith('/subtitles/movie/tt0111161.json')));
  o.tus('ok');
  await bekleKadar(() => o.q('.p-pick').className === 'p-pick', 'panelin kapanması');
  assert.ok(ag.istek.includes('http://altyazi.test/tr.srt'));
  o.bitir();
});

test('altyazı: Altyazı görünümü boyut/renk/arka plan/konumu seçer, saklar ve örnek metin gösterir; Varsayılana dön', () => {
  const o = kur({}, [FILM], altyaziAgi());
  o.q('#vid').textTracks = [];
  dugmeAc(o, 4);
  assert.match(o.q('.p-pick').innerHTML, /Altyazı görünümü/);
  o.tus('down');
  o.tus('down'); // Kapalı → Altyazı ara… → Altyazı görünümü
  o.tus('ok');
  const html = o.q('.p-pick').innerHTML;
  assert.match(html, /Altyazı görünümü/);
  for (const a of ['Boyut', 'Renk', 'Arka plan', 'Konum', 'Varsayılana dön']) assert.ok(html.indexOf(a) >= 0, a);
  assert.match(html, /<b>Orta<\/b>/);
  assert.equal(altMetin(o), 'Altyazı örnek metni\nİkinci satır', 'ayar yapılırken örnek görünür');
  assert.equal(o.q('.p-sub').className, 'p-sub on');
  o.tus('right'); // Boyut: Orta → Büyük
  assert.equal(ctx.store.setting('subBoyut', 1), 2);
  assert.equal(o.q('.p-sub').className, 'p-sub sb2 on');
  o.tus('down');
  o.tus('right'); // Renk: Sarı
  o.tus('down');
  o.tus('right');
  o.tus('right'); // Arka plan: Siyah
  o.tus('down');
  o.tus('left'); // Konum: Altta → En yukarıda (başa sarar)
  assert.equal(o.q('.p-sub').className, 'p-sub sb2 sr1 sz2 sk2 on');
  assert.match(o.q('.p-pick').innerHTML, /<b>En yukarıda<\/b>/);
  o.tus('down'); // Varsayılana dön
  o.tus('ok');
  assert.equal(o.q('.p-sub').className, 'p-sub on');
  assert.equal(ctx.store.setting('subRenk', 0), 0);
  o.tus('right'); // Boyut'a dönmeden: seçili satır "Varsayılana dön", ◀▶ etkisiz
  assert.equal(o.q('.p-sub').className, 'p-sub on');
  o.tus('back');
  assert.equal(o.q('.p-pick').className, 'p-pick', 'Geri paneli kapatır');
  assert.equal(altMetin(o), '', 'örnek kalkar');
  assert.equal(o.q('.p-sub').className, 'p-sub');
  o.bitir();
});

test('altyazı: ayar kayıtlıysa harici altyazı onunla çizilir; panel kapanınca gerçek metin geri gelir', async () => {
  const o = kur({ subBoyut: 3, subRenk: 1 }, [FILM], altyaziAgi());
  const v = o.q('#vid');
  v.textTracks = [];
  dugmeAc(o, 4);
  o.tus('down');
  o.tus('ok');
  await bekleKadar(() => /Altyazı seç/.test(o.q('.p-pick').innerHTML), 'altyazı listesi');
  o.tus('ok');
  await bekleKadar(() => o.q('.p-pick').className === 'p-pick', 'panelin kapanması');
  v.currentTime = 11;
  await bekle(300);
  assert.equal(altMetin(o), 'Merhaba dünya');
  assert.equal(o.q('.p-sub').className, 'p-sub sb3 sr1 on', 'kayıtlı ayar uygulanır');
  o.tus('ok'); // Altyazı paneli: Kapalı, Türkçe (harici), kaydır, ara, görünüm
  for (let i = 0; i < 4; i++) o.tus('down');
  o.tus('ok');
  assert.match(o.q('.p-pick').innerHTML, /Altyazı görünümü/);
  assert.equal(altMetin(o), 'Altyazı örnek metni\nİkinci satır');
  o.tus('left'); // Boyut: Çok büyük → Büyük
  await bekle(300);
  assert.equal(altMetin(o), 'Altyazı örnek metni\nİkinci satır', 'harici metin örneği ezmez');
  o.tus('back');
  assert.equal(altMetin(o), 'Merhaba dünya', 'panel kapanınca gerçek altyazı döner');
  assert.equal(o.q('.p-sub').className, 'p-sub sb2 sr1 on');
  o.bitir();
});

test('oynatıcı: kontroller bir süre sonra kendiliğinden kalkar (odak çubukta olsa da); panel açıkken ve duraklatılmışken kalmaz', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const o = kur();
    const v = o.q('#vid');
    v.paused = false;
    v.readyState = 4; // yayın başlamış sayılsın (30 sn'lik "yayın başlamadı" zamanlayıcısı hata göstermesin)
    const ov = () => o.q('.p-ov').className;
    o.tus('down'); // düğme çubuğu
    assert.equal(ov(), 'p-ov on');
    assert.match(o.cubuk(), /p-b on/);
    mock.timers.tick(7500);
    assert.equal(ov(), 'p-ov on', 'süre dolmadan kalkmaz');
    mock.timers.tick(1000);
    assert.equal(ov(), 'p-ov', 'odak çubukta iken de kalkar');
    assert.doesNotMatch(o.cubuk(), /p-b on/, 'odak yayına döner');
    o.tus('down'); // yayındaki ▼ çubuğu yeniden açar
    assert.equal(ov(), 'p-ov on');
    mock.timers.tick(6000);
    o.tus('right'); // her tuş süreyi yeniler
    mock.timers.tick(6000);
    assert.equal(ov(), 'p-ov on');
    mock.timers.tick(2500);
    assert.equal(ov(), 'p-ov');
    o.tus('down');
    o.tus('up'); // Geri düğmesi
    mock.timers.tick(8500);
    assert.equal(ov(), 'p-ov', 'odak Geri düğmesinde iken de kalkar');
    // Açık panel kontrolleri tutar; panel kapanınca süre işler
    o.tus('down');
    o.tus('right');
    o.tus('right');
    o.tus('right');
    o.tus('ok'); // Ses paneli
    assert.match(o.q('.p-pick').className, /on/);
    mock.timers.tick(10000);
    assert.equal(ov(), 'p-ov on', 'panel açıkken kontroller kalmaz');
    mock.timers.tick(3000); // panelin kendi 12 sn'lik süresi doldu
    assert.equal(o.q('.p-pick').className, 'p-pick');
    assert.equal(ov(), 'p-ov on');
    mock.timers.tick(8500);
    assert.equal(ov(), 'p-ov');
    // Duraklatılmış yayında kontroller kalır
    v.paused = true;
    o.tus('down');
    mock.timers.tick(30000);
    assert.equal(ov(), 'p-ov on', 'duraklatılmışken kalmaz');
    o.bitir();
  } finally {
    mock.timers.reset();
  }
});

test('altyazı: kaynakta kayıt yoksa ve canlı yayında ne denenir', async () => {
  const o = kur({}, [FILM], altyaziAgi({ bos: true }));
  o.q('#vid').textTracks = [];
  dugmeAc(o, 4);
  o.tus('down');
  o.tus('ok');
  await bekleKadar(() => /altyazı bulunamadı/.test(o.q('.p-pick').innerHTML), 'boş sonuç iletisi');
  o.bitir();
  const c = kur();
  c.q('#vid').textTracks = [];
  dugmeAc(c, 4);
  assert.doesNotMatch(c.q('.p-pick').innerHTML, /Altyazı ara/, 'canlı yayında altyazı aranmaz');
  c.bitir();
});

test('altyazı: Yeni yapım başlayınca eski harici altyazı kalkar', async () => {
  const bolumler = [1, 2].map((n) => ({ id: 'e' + n, kind: 'episode', name: 'Dizi · ' + n, seriesName: 'Dizi', season: 1, episodeNum: n, episodeId: n, ext: 'mp4' }));
  const ag = altyaziAgi();
  const o = kur({}, bolumler, ag);
  o.q('#vid').textTracks = [];
  dugmeAc(o, 4);
  o.tus('down');
  o.tus('ok');
  await bekleKadar(() => /Altyazı seç/.test(o.q('.p-pick').innerHTML), 'altyazı listesi');
  o.tus('ok');
  await bekleKadar(() => o.q('.p-pick').className === 'p-pick', 'panelin kapanması');
  assert.ok(ag.istek.some((u) => u.endsWith('/subtitles/series/tt0903747:1:1.json')), 'dizi: tt…:sezon:bölüm kimliği');
  o.q('#vid').currentTime = 11;
  await bekle(300);
  assert.equal(altMetin(o), 'Merhaba dünya');
  o.tus('back');
  o.scr.onKey('chdown'); // sonraki bölüm
  assert.equal(altMetin(o), '', 'bölüm değişince altyazı kalkar');
  o.bitir();
});
