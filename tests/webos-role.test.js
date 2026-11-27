// LG webOS: yerel aktarım. Büyük yanıtlar luna köprüsü yerine servisin 127.0.0.1 HTTP kapısından gelir (köprü iletisi çözme maliyeti yok).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';

const svc = createRequire(import.meta.url)('../webos/service/service.js');

const dinle = (isleyici) =>
  new Promise((coz) => {
    const s = http.createServer(isleyici);
    s.listen(0, '127.0.0.1', () => coz(s));
  });
const bilgi = () => new Promise((coz, red) => svc.roleBaslat({}, (e, r) => (e ? red(e) : coz(r))));
const al = (url) =>
  new Promise((coz, red) => {
    http
      .get(url, (res) => {
        const p = [];
        res.on('data', (c) => p.push(c));
        res.on('end', () => coz({ kod: res.statusCode, baslik: res.headers, metin: Buffer.concat(p).toString('utf8') }));
      })
      .on('error', red);
  });

const LS = { Stages: [{ Cnm: 'Turkey', Snm: 'Süper Lig', CompN: 'Süper Lig', Sid: 's1', gereksiz: 'x'.repeat(500), Events: [{ Eid: '1', Esd: '20261127200000', Eps: 'NS', T1: [{ Nm: 'A', Img: 'a.png' }], T2: [{ Nm: 'B', Img: 'b.png' }], Ekstra: 'y'.repeat(500) }] }] };

test('aktarım: servis yukarı akış yanıtını CORS başlığıyla verir, durumu başlıkta bildirir, projeyi uygular', async () => {
  const yukari = await dinle((q, r) => {
    if (q.url.indexOf('/yok') === 0) {
      r.writeHead(404, { 'Content-Type': 'text/plain' });
      return r.end('bulunamadı');
    }
    r.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    r.end(JSON.stringify(LS));
  });
  const b = await bilgi();
  try {
    assert.ok(b.port > 0 && b.jeton.length >= 16);
    assert.deepEqual(await bilgi(), b, 'ikinci çağrı aynı kapı ve jetonu verir');
    const taban = 'http://127.0.0.1:' + b.port + '/' + b.jeton + '/g?u=';
    const adres = 'http://127.0.0.1:' + yukari.address().port;
    const tam = await al(taban + encodeURIComponent(adres + '/gun'));
    assert.equal(tam.kod, 200);
    assert.equal(tam.baslik['x-upstream-status'], '200');
    assert.equal(tam.baslik['access-control-allow-origin'], '*');
    assert.deepEqual(JSON.parse(tam.metin), LS);
    // proje: yalnız uygulamanın okuduğu alanlar kalır; budama köprü yoluyla aynı işlevi kullanır
    const budali = await al(taban + encodeURIComponent(adres + '/gun') + '&p=ls-gun');
    assert.equal(budali.metin, svc.buda(JSON.stringify(LS), 'ls-gun'));
    assert.ok(budali.metin.length < tam.metin.length / 2, 'budanmış yanıt daha küçük');
    // yukarı akış 404: kapı 200 verir, durum başlıkta
    const yok = await al(taban + encodeURIComponent(adres + '/yok'));
    assert.equal(yok.kod, 200);
    assert.equal(yok.baslik['x-upstream-status'], '404');
    // yanlış jeton ve geçersiz adres
    assert.equal((await al('http://127.0.0.1:' + b.port + '/yanlis/g?u=' + encodeURIComponent(adres))).kod, 403);
    assert.equal((await al(taban + encodeURIComponent('dosya:///etc/passwd'))).kod, 400);
    // yukarı akışa ulaşılamıyor: 502
    yukari.close();
    const kapali = await al(taban + encodeURIComponent(adres + '/gun'));
    assert.equal(kapali.kod, 502);
  } finally {
    svc.roleDurdur();
    yukari.close();
  }
});

// Node'da XMLHttpRequest yok: uygulamanın kullandığı küçük bölümün http tabanlı karşılığı
class SahteXhr {
  open(yontem, url) {
    this.url = url;
  }
  setRequestHeader() {}
  getResponseHeader(ad) {
    return this._baslik ? this._baslik[String(ad).toLowerCase()] || null : null;
  }
  abort() {
    if (this._istek) this._istek.destroy();
    if (this.onabort) setTimeout(this.onabort, 0);
  }
  send() {
    this._istek = http
      .get(this.url, (res) => {
        const p = [];
        res.on('data', (c) => {
          p.push(c);
          if (this.onprogress) this.onprogress({ loaded: p.reduce((t, x) => t + x.length, 0) });
        });
        res.on('end', () => {
          this.status = res.statusCode;
          this._baslik = res.headers;
          this.responseText = Buffer.concat(p).toString('utf8');
          if (this.onload) this.onload();
        });
      })
      .on('error', () => {
        this.status = 0;
        if (this.onerror) this.onerror();
      });
  }
}

test('ağ: servis yolu önce yerel aktarımı dener; köprüden ileti almaz, hata durumları köprüyle aynı', async () => {
  const sakla = { window: globalThis.window, xhr: globalThis.XMLHttpRequest };
  const { servisGet, AgHatasi } = await import('../webos/src/net.js');
  const yukari = await dinle((q, r) => {
    if (q.url.indexOf('/yok') === 0) {
      r.writeHead(404);
      return r.end('x');
    }
    r.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    r.end(JSON.stringify(LS));
  });
  const adres = 'http://127.0.0.1:' + yukari.address().port;
  const komutlar = [];
  class Kopru {
    call(uri, json) {
      const komut = uri.split('/').pop();
      komutlar.push(komut);
      const yanit = (o) => setTimeout(() => this.onservicecallback(JSON.stringify(o)), 0);
      if (komut === 'roleBilgi') return bilgi().then((b) => yanit({ returnValue: true, port: b.port, jeton: b.jeton }));
      yanit({ returnValue: false, errorText: 'beklenmeyen: ' + komut });
    }
  }
  globalThis.window = { WebOSServiceBridge: Kopru };
  globalThis.XMLHttpRequest = SahteXhr;
  try {
    const ilerleme = [];
    const m = await servisGet(adres + '/gun', { proje: 'ls-gun', onProgress: (n) => ilerleme.push(n) });
    assert.equal(m, svc.buda(JSON.stringify(LS), 'ls-gun'));
    assert.deepEqual(komutlar, ['roleBilgi'], 'veri köprüden değil yerel aktarımdan geldi (fetch/read çağrılmadı)');
    assert.ok(ilerleme.length > 0);
    await assert.rejects(
      () => servisGet(adres + '/yok', {}),
      (e) => e instanceof AgHatasi && e.status === 404 && !e.role
    );
    // yukarı akışa ulaşılamıyor: gerçek ağ hatası, köprüye dönülmez
    yukari.close();
    await assert.rejects(
      () => servisGet(adres + '/gun', {}),
      (e) => e instanceof AgHatasi && !e.role
    );
    assert.deepEqual(komutlar.filter((k) => k === 'fetch'), []);
  } finally {
    svc.roleDurdur();
    yukari.close();
    globalThis.window = sakla.window;
    if (sakla.xhr === undefined) delete globalThis.XMLHttpRequest;
    else globalThis.XMLHttpRequest = sakla.xhr;
  }
});

test('ağ: yerel aktarım çalışmazsa köprü yoluna dönülür, art arda iki başarısızlıktan sonra denenmez', async () => {
  const sakla = { window: globalThis.window, xhr: globalThis.XMLHttpRequest };
  const { servisGet } = await import('../webos/src/net.js');
  const komutlar = [];
  class Kopru {
    call(uri, json) {
      const komut = uri.split('/').pop();
      komutlar.push(komut);
      const yanit = (o) => setTimeout(() => this.onservicecallback(JSON.stringify(o)), 0);
      if (komut === 'roleBilgi') return yanit({ returnValue: true, port: 1, jeton: 'aaaaaaaaaaaaaaaaaaaaaaaa' }); // kapalı kapı
      if (komut === 'fetch') return yanit({ returnValue: true, status: 200, total: 5, data: 'sahte', done: true });
      yanit({ returnValue: false, errorText: 'beklenmeyen' });
    }
  }
  globalThis.window = { WebOSServiceBridge: Kopru };
  globalThis.XMLHttpRequest = SahteXhr;
  try {
    assert.equal(await servisGet('http://x/y', {}), 'sahte', 'ilk istek köprüyle tamamlanır');
    assert.equal(await servisGet('http://x/y', {}), 'sahte');
    const roleCagri = komutlar.filter((k) => k === 'roleBilgi').length;
    assert.equal(await servisGet('http://x/y', {}), 'sahte');
    assert.equal(komutlar.filter((k) => k === 'roleBilgi').length, roleCagri, 'iki başarısızlıktan sonra yerel aktarım bu oturumda denenmez');
  } finally {
    globalThis.window = sakla.window;
    if (sakla.xhr === undefined) delete globalThis.XMLHttpRequest;
    else globalThis.XMLHttpRequest = sakla.xhr;
  }
});
