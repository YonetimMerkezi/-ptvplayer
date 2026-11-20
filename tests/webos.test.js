// LG webOS sürümü (webos/): saf modüller (tuşlar, depo, ağ yolu seçimi, veri sağlayıcılar), TV içi JS servisi ve paket tutarlılığı.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { actionOf, rakam } from '../webos/src/keys.js';
import { createStore, bellekDepo } from '../webos/src/store.js';
import { createNet, AgHatasi } from '../webos/src/net.js';
import { createProvider, ara } from '../webos/src/data.js';
import { SERVIS } from '../webos/src/luna.js';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const w = (...p) => join(kok, 'webos', ...p);
const oku = (...p) => readFileSync(w(...p), 'utf8');
const require = createRequire(import.meta.url);

test('keys: LG kumanda tuşları doğru eyleme çevrilir', () => {
  assert.equal(actionOf(461), 'back');
  assert.equal(actionOf(13), 'ok');
  assert.equal(actionOf(37), 'left');
  assert.equal(actionOf(403), 'red');
  assert.equal(actionOf(404), 'green');
  assert.equal(actionOf(405), 'yellow');
  assert.equal(actionOf(406), 'blue');
  assert.equal(actionOf(427), 'chup');
  assert.equal(actionOf(428), 'chdown');
  assert.equal(actionOf(53), 'num5');
  assert.equal(actionOf(101), 'num5');
  assert.equal(actionOf(65), null);
  assert.equal(rakam('num7'), 7);
  assert.equal(rakam('ok'), -1);
});

test('store: kaynak, favori, son izlenen ve ayarlar kalıcıdır', () => {
  const depo = bellekDepo();
  let s = createStore(depo);
  assert.equal(s.active(), null);
  const a = s.addSource({ type: 'xtream', name: 'A', server: 'http://x', user: 'u', pass: 'p' });
  const b = s.addSource({ type: 'm3u', name: 'B', url: 'http://x/l.m3u' });
  assert.equal(s.active().id, b.id, 'son eklenen etkin olur');
  s.setActive(a.id);
  assert.equal(s.active().name, 'A');
  s.setActive('yok');
  assert.equal(s.active().name, 'A', 'olmayan kimlik yok sayılır');

  assert.equal(s.toggleFav(a.id, { id: 'l1', kind: 'live', name: 'Kanal' }), true);
  assert.equal(s.isFav(a.id, 'l1'), true);
  assert.equal(s.isFav(b.id, 'l1'), false, 'favoriler kaynağa özeldir');
  s.touch(a.id, { id: 'm1', kind: 'movie', name: 'Film' }, 61000.7, 7200000);
  assert.deepEqual(s.posOf(a.id, 'm1'), { pos: 61000, dur: 7200000 });
  assert.deepEqual(s.posOf(a.id, 'yok'), { pos: 0, dur: 0 });
  s.setSetting('netMode', 'service');

  s = createStore(depo); // yeniden aç
  assert.equal(s.active().name, 'A');
  assert.equal(s.isFav(a.id, 'l1'), true);
  assert.equal(s.posOf(a.id, 'm1').pos, 61000);
  assert.equal(s.setting('netMode', 'auto'), 'service');
  assert.equal(s.setting('yok', 'varsayılan'), 'varsayılan');

  assert.equal(s.toggleFav(a.id, { id: 'l1' }), false, 'ikinci basış favoriden çıkarır');
  s.clearRecents(a.id);
  assert.equal(s.recents(a.id).length, 0);
  s.removeSource(a.id);
  assert.equal(s.active().id, b.id, 'etkin kaynak silinince diğeri etkin olur');
  assert.equal(s.favs(a.id).length, 0);
  s.removeSource(b.id);
  assert.equal(s.active(), null);
});

test('store: son izlenenler tekrarsız, en yeni başta, üst sınırlı; bozuk depo çökertmez', () => {
  const s = createStore(bellekDepo());
  const src = s.addSource({ type: 'm3u', name: 'x', url: 'http://x' });
  for (let i = 0; i < 80; i++) s.touch(src.id, { id: 'i' + i, name: 'n' + i, kind: 'movie' }, 1000, 5000);
  s.touch(src.id, { id: 'i10', name: 'n10', kind: 'movie' }, 9000, 5000);
  const r = s.recents(src.id);
  assert.equal(r.length, 60);
  assert.equal(r[0].item.id, 'i10');
  assert.equal(r.filter((x) => x.item.id === 'i10').length, 1);
  const bozuk = bellekDepo();
  bozuk.setItem('iptv.webos.v1', '{bozuk json');
  assert.equal(createStore(bozuk).active(), null);
});

test('net: otomatik modda önce doğrudan, ağ/CORS hatasında TV servisi; öğrenilen yol öne alınır', async () => {
  const cagri = [];
  const tas = {
    hasService: () => true,
    direct: async (u) => {
      cagri.push('direct');
      throw new AgHatasi('CORS', 0);
    },
    service: async (u) => {
      cagri.push('service');
      return '{"a":1}';
    },
  };
  const n = createNet({ ayar: () => 'auto', taşıyıcı: tas });
  assert.deepEqual(await n.json('http://h:80/x'), { a: 1 });
  assert.deepEqual(cagri, ['direct', 'service']);
  cagri.length = 0;
  await n.get('http://h:80/y');
  assert.deepEqual(cagri, ['service'], 'öğrenilen yol ilk denenir');
  assert.equal(n.ogrenilen['h:80'], 'service');
});

test('net: gerçek HTTP hatası yedeğe geçmez; geçersiz JSON anlaşılır hata verir; servis yoksa yalnız doğrudan', async () => {
  const cagri = [];
  const n1 = createNet({
    ayar: () => 'auto',
    taşıyıcı: {
      hasService: () => true,
      direct: async () => {
        cagri.push('d');
        throw new AgHatasi('Sunucu 404 döndürdü', 404);
      },
      service: async () => {
        cagri.push('s');
        return 'x';
      },
    },
  });
  await assert.rejects(() => n1.get('http://a/b'), (e) => e.status === 404);
  assert.deepEqual(cagri, ['d']);

  const n2 = createNet({ ayar: () => 'direct', taşıyıcı: { hasService: () => true, direct: async () => '<html>', service: async () => assert.fail('çağrılmamalı') } });
  await assert.rejects(() => n2.json('http://a/b'), /geçerli bir yanıt/);

  const n3 = createNet({ ayar: () => 'auto', taşıyıcı: { hasService: () => false, direct: async () => { throw new AgHatasi('Bağlanılamadı', 0); }, service: async () => assert.fail('servis yok') } });
  await assert.rejects(() => n3.get('http://a/b'), /Bağlanılamadı/);

  const n4 = createNet({ ayar: () => 'service', taşıyıcı: { hasService: () => true, direct: async () => assert.fail('doğrudan kapalı'), service: async () => 'tamam' } });
  assert.equal(await n4.get('http://a/b'), 'tamam');
});

const CFG = { type: 'xtream', name: 'T', server: 'http://srv:8000', user: 'u', pass: 'p' };

test('data/xtream: kategori, öğe, adres üretimi ve bellek önbelleği', async () => {
  const urls = [];
  const net = {
    json: async (url) => {
      urls.push(url);
      if (url.includes('action=get_live_categories')) return [{ category_id: '5', category_name: 'Haber' }, null, { category_id: '6' }];
      if (url.includes('action=get_live_streams')) return [{ num: 1, name: 'Kanal A', stream_id: 11, category_id: '5' }, { num: 2, name: 'Kanal B', stream_id: 12, category_id: '6' }];
      if (url.includes('action=get_vod_streams')) return [{ name: 'Film', stream_id: 7, container_extension: 'mkv', category_id: '1' }];
      if (url.includes('action=get_vod_categories')) return [{ category_id: '1', category_name: 'Dram' }];
      return { user_info: { auth: 1, status: 'Active' } };
    },
    // liste yanıtları ham metin olarak alınır (ayrıştırma işçide/ana parçada yapılır); gerçek net ikisini de sağlar
    get: async (url) => JSON.stringify(await net.json(url)),
  };
  const p = createProvider(CFG, net);
  assert.equal(p.type, 'xtream');
  assert.equal((await p.auth()).ok, true);
  const cats = await p.categories('live');
  assert.deepEqual(cats.map((c) => c.name), ['Haber', 'Diğer'], 'null kategori atlanır, adsız “Diğer” olur');
  const l = await p.items('live', '5');
  assert.equal(l.length >= 1, true);
  assert.equal(l[0].kind, 'live');
  assert.equal(p.urlFor(l[0], 'm3u8'), 'http://srv:8000/live/u/p/11.m3u8');
  assert.equal(p.urlFor(l[0], 'ts'), 'http://srv:8000/live/u/p/11.ts');
  const f = (await p.items('movie', '1'))[0];
  assert.equal(p.urlFor(f), 'http://srv:8000/movie/u/p/7.mkv');
  const once = urls.length;
  await p.categories('live');
  await p.items('live', '5');
  assert.equal(urls.length, once, 'aynı istek tekrarlanmaz');
  const bul = await ara(p, 'kanal b', 10);
  assert.deepEqual(bul.map((x) => x.name), ['Kanal B']);
});

test('data/xtream: istek başarısız olunca önbellek zehirlenmez, yeniden denenir', async () => {
  let n = 0;
  const net = { json: async () => { if (++n === 1) throw new AgHatasi('Zaman aşımı', 0); return [{ category_id: '1', category_name: 'X' }]; } };
  const p = createProvider(CFG, net);
  await assert.rejects(() => p.categories('live'), /Zaman aşımı/);
  assert.equal((await p.categories('live')).length, 1);
});

test('data/m3u: liste bir kez indirilir; gruplar, adres ve arama çalışır', async () => {
  let indirme = 0;
  const metin = ['#EXTM3U', '#EXTINF:-1 group-title="Haber",Kanal Bir', 'http://h/live/1.m3u8', '#EXTINF:-1 group-title="Spor",Kanal İki', 'http://h/live/2.ts', '#EXTINF:-1 group-title="Filmler",Büyük Film', 'http://h/movie/9.mp4'].join('\n');
  const net = { get: async () => { indirme++; return metin; } };
  const p = createProvider({ type: 'm3u', name: 'L', url: 'http://h/l.m3u' }, net);
  assert.equal((await p.auth()).ok, true);
  const cats = await p.categories('live');
  assert.deepEqual(cats.map((c) => c.name).sort(), ['Haber', 'Spor']);
  const h = await p.items('live', 'Haber');
  assert.equal(h[0].name, 'Kanal Bir');
  assert.equal(p.urlFor(h[0]), 'http://h/live/1.m3u8');
  assert.equal((await ara(p, 'kanal iki', 10))[0].name, 'Kanal İki', 'Türkçe büyük/küçük harf duyarsız');
  assert.equal(indirme, 1);
  const bos = createProvider({ type: 'm3u', name: 'B', url: 'http://h/b' }, { get: async () => '#EXTM3U\n' });
  assert.equal((await bos.auth()).ok, false);
});

// ---- TV içi JS servisi (Node 0.12 uyumlu ES5; burada güncel Node ile çalıştırılır)
const svc = require(w('service', 'service.js'));
const getir = (p) => new Promise((coz, red) => svc.getir(p, (e, r) => (e ? red(e) : coz(r))));

async function sunucu(t) {
  const BUYUK = 'ğüşiöçİĞ-' .repeat(90000); // ~810k karakter: birden çok parça
  const s = http.createServer((req, res) => {
    const u = req.url;
    if (u === '/kucuk') return res.writeHead(200).end('merhaba ğüş');
    if (u === '/bom') return res.writeHead(200).end('﻿{"a":1}');
    if (u === '/buyuk') return res.writeHead(200).end(BUYUK);
    if (u === '/yon') return res.writeHead(302, { Location: '/kucuk' }).end();
    if (u === '/dongu') return res.writeHead(302, { Location: '/dongu' }).end();
    if (u === '/gz') return res.writeHead(200, { 'Content-Encoding': 'gzip' }).end(gzipSync('sıkıştırılmış'));
    if (u === '/yok') return res.writeHead(404).end('bulunamadı');
    if (u === '/ua') return res.writeHead(200).end(String(req.headers['user-agent']) + '|' + String(req.headers['x-ozel']));
    // /yavas: yanıt hiç gelmez
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => { s.closeAllConnections?.(); s.close(r); }));
  return { url: 'http://127.0.0.1:' + s.address().port, BUYUK };
}

test('servis: küçük yanıt tek seferde, BOM temizlenir, gzip açılır, yönlendirme izlenir', async (t) => {
  const { url } = await sunucu(t);
  const k = await getir({ url: url + '/kucuk' });
  assert.deepEqual([k.returnValue, k.status, k.done, k.data], [true, 200, true, 'merhaba ğüş']);
  assert.equal((await getir({ url: url + '/bom' })).data, '{"a":1}');
  assert.equal((await getir({ url: url + '/gz' })).data, 'sıkıştırılmış');
  assert.equal((await getir({ url: url + '/yon' })).data, 'merhaba ğüş');
  const y = await getir({ url: url + '/yok' });
  assert.equal(y.status, 404, 'HTTP hata kodu istemciye iletilir');
  const ua = (await getir({ url: url + '/ua', headers: { 'X-Ozel': 'evet' } })).data;
  assert.match(ua, /Web0S.*\|evet/);
});

test('servis: büyük yanıt parça parça okunur ve birleşince birebir aynıdır; oturum bitince temizlenir', async (t) => {
  const { url, BUYUK } = await sunucu(t);
  const CHUNK = 262144;
  let r = await getir({ url: url + '/buyuk', chunk: CHUNK });
  assert.equal(r.done, false);
  assert.equal(r.data.length, CHUNK);
  let metin = r.data;
  const id = r.id;
  while (!r.done) {
    r = svc.oku({ id, offset: metin.length, length: CHUNK });
    assert.equal(r.returnValue, true);
    metin += r.data;
  }
  assert.equal(metin.length, BUYUK.length);
  assert.equal(metin, BUYUK);
  assert.equal(svc.oku({ id, offset: 0, length: 10 }).returnValue, false, 'okuma bitince kayıt silinir');
  assert.match(svc.oku({ id: 'yok' }).errorText, /Oturum/);
});

test('servis: yönlendirme döngüsü, zaman aşımı, boş/hatalı adres anlaşılır hata verir', async (t) => {
  const { url } = await sunucu(t);
  await assert.rejects(() => getir({ url: url + '/dongu' }), /yönlendirme/);
  await assert.rejects(() => getir({ url: url + '/yavas', timeoutMs: 300 }), /Zaman aşımı/);
  await assert.rejects(() => getir({}), /Adres yok/);
  await assert.rejects(() => getir({ url: 'ftp://x/y' }), /Desteklenmeyen/);
  await assert.rejects(() => getir({ url: 'http://127.0.0.1:1/x', timeoutMs: 2000 }));
});

// ---- Paket tutarlılığı
test('paket: sürüm, kimlik ve servis adı birbiriyle tutarlı; gerekli dosyalar var', () => {
  const app = JSON.parse(oku('appinfo.json'));
  const pkg = JSON.parse(oku('package.json'));
  const sp = JSON.parse(oku('service', 'package.json'));
  const sj = JSON.parse(oku('service', 'services.json'));
  assert.equal(app.version, pkg.version);
  assert.equal(sp.version, pkg.version);
  assert.equal(app.type, 'web');
  assert.equal(app.main, 'index.html');
  assert.equal(sj.id, SERVIS.replace(/^luna:\/\//, '').replace(/\/$/, ''), 'uygulamanın çağırdığı servis adı services.json ile aynı');
  assert.equal(sj.id, sp.name);
  assert.ok(sj.id.startsWith(app.id + '.'), 'servis kimliği uygulama kimliğiyle başlamalı (webOS kuralı)');
  assert.deepEqual(sj.services[0].commands.map((c) => c.name).sort(), ['aliciBaslat', 'aliciDurdur', 'aliciSonuc', 'aliciSor', 'fetch', 'medyaBaslat', 'medyaDurdur', 'medyaKokler', 'medyaListele', 'medyaSor', 'read']);
  for (const f of [app.icon, app.largeIcon, app.bgImage, app.splashBackground]) assert.ok(existsSync(w('assets', f)), f + ' eksik');
  assert.match(oku('src', 'version.js'), /__VERSION__/);
});

test('paket: Chromium 38 (webOS 3) için yasak API/özellikler kaynakta kullanılmamış', () => {
  const dosyalar = [];
  for (const d of ['src', 'src/screens']) for (const f of readdirSync(w(d))) if (f.endsWith('.js')) dosyalar.push(join(d, f));
  const YASAK = [
    [/\bfetch\(/, 'fetch() (Chromium 42+)'],
    [/\.closest\(/, 'Element.closest (Chromium 41+)'],
    [/\.(append|prepend)\(/, 'ParentNode.append/prepend (Chromium 54+)'],
    [/\.key\s*===/, 'KeyboardEvent.key (Chromium 51+)'],
    [/IntersectionObserver|ResizeObserver|requestIdleCallback/, 'yeni gözlemciler'],
    [/new Intl\./, 'Intl biçimleyici (eski motorda sınırlı)'],
    [/querySelectorAll\([^)]*\)\.forEach/, 'NodeList.forEach (Chromium 51+)'],
  ];
  const sorunlar = [];
  for (const f of dosyalar) {
    const kaynak = oku(f).replace(/\/\/.*$/gm, '');
    for (const [re, ad] of YASAK) if (re.test(kaynak)) sorunlar.push(f + ': ' + ad);
  }
  const css = oku('css', 'tv.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/var\(--|display\s*:\s*grid|(^|[;{\s])gap\s*:|(^|[;{\s])inset\s*:/m.test(css), 'tv.css Chromium 38 dışı özellik içeriyor');
  assert.deepEqual(sorunlar, []);
});

test('data/xtream: shortEpg adet parametresi, kısa süreli önbellek ve hata sonrası yeniden deneme', async () => {
  const istekler = [];
  let bozuk = true;
  const b64 = (t) => Buffer.from(t, 'utf8').toString('base64');
  const net = {
    json: async (url) => {
      istekler.push(url);
      if (!url.includes('action=get_short_epg')) return {};
      if (bozuk) throw new AgHatasi('Zaman aşımı', 0);
      return { epg_listings: [{ start_timestamp: '2000', stop_timestamp: '3000', title: b64('Haber'), description: b64('Gün özeti') }, { start_timestamp: '3000', stop_timestamp: '4000', title: b64('Dizi') }] };
    },
  };
  const p = createProvider(CFG, net);
  const kanal = { streamId: 11 };
  await assert.rejects(() => p.shortEpg(kanal, 8), /Zaman aşımı/);
  bozuk = false;
  const l = await p.shortEpg(kanal, 8);
  assert.deepEqual(l.map((e) => e.t), ['Haber', 'Dizi']);
  assert.equal(l[0].s, 2000000);
  assert.ok(istekler[istekler.length - 1].includes('limit=8') && istekler[istekler.length - 1].includes('stream_id=11'));
  const n = istekler.length;
  await p.shortEpg(kanal, 8);
  assert.equal(istekler.length, n, 'taze önbellek varken yeniden istenmez');
  await p.shortEpg(kanal, 3);
  assert.equal(istekler.length, n + 1, 'farklı adet ayrı istektir');
});

test('keys: TV keyCode göndermese de key / keyIdentifier adından Geri tanınır', async () => {
  const { actionOfEvent } = await import('../webos/src/keys.js');
  assert.equal(actionOfEvent({ keyCode: 461 }), 'back');
  assert.equal(actionOfEvent({ keyCode: 0, key: 'GoBack' }), 'back');
  assert.equal(actionOfEvent({ keyCode: 0, keyIdentifier: 'U+0008' }), 'back');
  assert.equal(actionOfEvent({ keyCode: 0, key: 'BrowserBack' }), 'back');
  assert.equal(actionOfEvent({ keyCode: 0, key: 'Unidentified' }), null);
  assert.equal(actionOfEvent({ keyCode: 13 }), 'ok');
  assert.equal(actionOfEvent(null), null);
});
