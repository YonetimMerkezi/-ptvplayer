import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStation, normalizeStations, genresOf, genreChips, filterStations, radioItem, isRadioItem, loadStations, countClick, radioFavs, isRadioFav, toggleRadioFav, listStations, isListRadio, RADIO_TTL, RADIO_MIRRORS, RADIO_GENRES } from '../www/js/radio.js';

const raw = (o = {}) => ({ stationuuid: 'u1', name: 'Virgin Radio Türkiye', url: 'http://a/b', url_resolved: 'https://s/stream', favicon: 'https://l/logo.png', tags: 'pop,rock,hits', countrycode: 'TR', codec: 'aac', bitrate: 64, votes: 5, clickcount: 100, lastcheckok: 1, ...o });

test('istasyon: çözülmüş adres tercih edilir, ad temizlenir, "RD:" öneki atılır, http logo elenir', () => {
  const st = normalizeStation(raw({ name: '  RD:  Radyo   Ege ', favicon: 'http://l/x.png' }));
  assert.equal(st.id, 'rb:u1');
  assert.equal(st.name, 'Radyo Ege');
  assert.equal(st.url, 'https://s/stream');
  assert.equal(st.logo, '');
  assert.equal(st.codec, 'AAC');
  assert.deepEqual(st.tags, ['pop', 'rock', 'hits']);
  assert.equal(normalizeStation(raw({ url_resolved: '' })).url, 'http://a/b');
});

test('istasyon: çalışmayan, adresi ya da adı olmayan kayıt elenir', () => {
  assert.equal(normalizeStation(raw({ lastcheckok: 0 })), null);
  assert.equal(normalizeStation(raw({ url: '', url_resolved: '' })), null);
  assert.equal(normalizeStation(raw({ stationuuid: '' })), null);
  assert.equal(normalizeStation(raw({ name: '   ' })), null);
  assert.equal(normalizeStation(null), null);
  assert.equal(normalizeStation(raw({ url_resolved: 'ftp://x', url: 'rtmp://y' })), null);
});

test('liste: aynı adlıdan en çok dinlenen kalır, en çok dinlenen başta', () => {
  const list = normalizeStations([
    raw({ stationuuid: 'a', name: 'Kral FM', clickcount: 10 }),
    raw({ stationuuid: 'b', name: 'kral fm', clickcount: 50 }),
    raw({ stationuuid: 'c', name: 'Metro FM', clickcount: 30 }),
    raw({ stationuuid: 'd', name: 'Bozuk', lastcheckok: 0, clickcount: 999 }),
  ]);
  assert.deepEqual(list.map((s) => s.id), ['rb:b', 'rb:c']);
  assert.deepEqual(normalizeStations('x'), []);
});

test('tür eşleştirme: etiket ve addan, Türkçe harflere duyarsız', () => {
  assert.ok(genresOf(normalizeStation(raw({ name: 'Türkü FM', tags: '' }))).includes('turku'));
  assert.ok(genresOf(normalizeStation(raw({ name: 'Power', tags: 'pop,dance' }))).includes('dans'));
  assert.ok(genresOf(normalizeStation(raw({ name: 'Semerkand Radyo', tags: 'islami' }))).includes('dini'));
  assert.ok(genresOf(normalizeStation(raw({ name: 'Haber Türk Radyo', tags: '' }))).includes('haber'));
  assert.deepEqual(genresOf(normalizeStation(raw({ name: 'X', tags: 'zzz' }))), []);
  assert.ok(new Set(RADIO_GENRES.map((g) => g.id)).size === RADIO_GENRES.length);
});

test('tür çipleri: yeterli istasyonu olmayan tür gösterilmez, sayılar doğru', () => {
  const many = Array.from({ length: 4 }, (_, i) => normalizeStation(raw({ stationuuid: 'p' + i, name: 'Pop ' + i, tags: 'pop' })));
  const few = [normalizeStation(raw({ stationuuid: 'j1', name: 'Caz', tags: 'jazz' }))];
  const chips = genreChips([...many, ...few]);
  assert.deepEqual(chips.map((c) => c.id), ['pop']);
  assert.equal(chips[0].n, 4);
});

test('süzme: tür ve arama (Türkçe duyarsız) birlikte çalışır', () => {
  const list = [normalizeStation(raw({ stationuuid: '1', name: 'Süper FM', tags: 'pop' })), normalizeStation(raw({ stationuuid: '2', name: 'Radyo Türkü', tags: 'turku' }))];
  assert.deepEqual(filterStations(list, { genre: 'pop' }).map((s) => s.id), ['rb:1']);
  assert.deepEqual(filterStations(list, { query: 'super' }).map((s) => s.id), ['rb:1']);
  assert.deepEqual(filterStations(list, { query: 'TÜRKÜ' }).map((s) => s.id), ['rb:2']);
  assert.equal(filterStations(list, {}).length, 2);
});

test('oynatıcı öğesi: canlı yayın gibi, ses modunda, radyo işaretli', () => {
  const it = radioItem(normalizeStation(raw()));
  assert.equal(it.kind, 'live');
  assert.equal(it.audio, true);
  assert.equal(it.radio, true);
  assert.equal(it.url, 'https://s/stream');
  assert.match(it.artist, /pop · rock/);
  assert.match(it.artist, /AAC 64 kbps/);
  assert.ok(isRadioItem(it));
  assert.ok(!isRadioItem({ kind: 'live' }));
});

const fakeCache = () => {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? m.get(k) : null), set: async (k, v) => void m.set(k, v), m };
};

test('liste yükleme: User-Agent gider, ilk yansı çökerse ikincisi denenir, önbelleğe yazılır', async () => {
  const calls = [];
  const net = {
    json: async (url, opts) => {
      calls.push({ url, ua: opts.headers['User-Agent'] });
      if (url.startsWith(RADIO_MIRRORS[0])) throw new Error('HTTP 503');
      return [raw({ stationuuid: 'x', name: 'Kral FM' })];
    },
  };
  const cache = fakeCache();
  const r = await loadStations({ net, cache, country: 'tr', version: '9.9', now: 1000 });
  assert.equal(r.items[0].id, 'rb:x');
  assert.equal(r.stale, false);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.ua === 'IptvPlayerPro/9.9'));
  assert.match(calls[1].url, /countrycode=TR/);
  assert.match(calls[1].url, /hidebroken=true/);
  assert.equal(cache.m.get('radio:TR').at, 1000);
});

test('liste yükleme: taze önbellek ağa gitmez; süresi dolunca yenilenir; ağ yoksa eski önbellek', async () => {
  const cache = fakeCache();
  await cache.set('radio:TR', { at: 0, items: [{ id: 'rb:old', name: 'Eski', url: 'http://x' }] });
  let hits = 0;
  const ok = { json: async () => (hits++, [raw({ stationuuid: 'n', name: 'Yeni' })]) };
  const a = await loadStations({ net: ok, cache, now: RADIO_TTL - 1 });
  assert.equal(a.items[0].id, 'rb:old');
  assert.equal(hits, 0);
  const b = await loadStations({ net: ok, cache, now: RADIO_TTL + 1 });
  assert.equal(b.items[0].id, 'rb:n');
  assert.equal(hits, 1);
  const bad = { json: async () => { throw new Error('ağ yok'); } };
  const c = await loadStations({ net: bad, cache, now: RADIO_TTL * 5 });
  assert.equal(c.stale, true);
  assert.equal(c.items[0].id, 'rb:n');
  await assert.rejects(loadStations({ net: bad, cache: fakeCache(), now: 5 }), /ağ yok/);
});

test('liste yükleme: boş yanıt hata sayılır (önbelleğe boş liste yazılmaz)', async () => {
  const cache = fakeCache();
  const net = { json: async () => [] };
  await assert.rejects(loadStations({ net, cache, now: 1 }), /boş/);
  assert.equal(cache.m.size, 0);
});

test('tık sayacı: kimlik öneki atılır, User-Agent gider, hata sessizdir', async () => {
  let seen = null;
  const net = { text: async (url, opts) => ((seen = { url, ua: opts.headers['User-Agent'] }), 'ok') };
  assert.equal(await countClick({ net, id: 'rb:abc-1', version: '2' }), true);
  assert.match(seen.url, /\/json\/url\/abc-1$/);
  assert.equal(seen.ua, 'IptvPlayerPro/2');
  assert.equal(await countClick({ net: { text: async () => { throw new Error('x'); } }, id: 'rb:z' }), false);
  assert.equal(await countClick({ net, id: '' }), false);
});

test('User-Agent: sürüm adındaki ASCII dışı harfler atılır (başlık değeri geçersiz olmasın)', async () => {
  const uas = [];
  const net = { json: async (url, opts) => (uas.push(opts.headers['User-Agent']), [{ stationuuid: 'u', name: 'A', url_resolved: 'https://s', lastcheckok: 1 }]), text: async (url, opts) => (uas.push(opts.headers['User-Agent']), 'ok') };
  await loadStations({ net, cache: null, version: 'geliştirme', mirrors: ['https://m'] });
  await countClick({ net, id: 'rb:u', version: 'geliştirme', mirrors: ['https://m'] });
  assert.deepEqual(uas, ['IptvPlayerPro/gelitirme', 'IptvPlayerPro/gelitirme']);
  assert.ok(uas.every((u) => /^[\x20-\x7e]+$/.test(u)));
  uas.length = 0;
  await countClick({ net, id: 'rb:u', version: '', mirrors: ['https://m'] });
  assert.deepEqual(uas, ['IptvPlayerPro/1']);
});

test('favoriler: ekle/çıkar, en yeni başta, adres saklanır, bozuk kayıt elenir', () => {
  const prefs = {};
  const store = { pref: (k, d) => (k in prefs ? prefs[k] : d), setPref: (k, v) => void (prefs[k] = v) };
  const a = normalizeStation(raw({ stationuuid: 'a', name: 'A' }));
  const b = normalizeStation(raw({ stationuuid: 'b', name: 'B' }));
  assert.equal(toggleRadioFav(store, a), true);
  assert.equal(toggleRadioFav(store, b), true);
  assert.deepEqual(radioFavs(store).map((f) => f.id), ['rb:b', 'rb:a']);
  assert.equal(radioFavs(store)[0].url, 'https://s/stream');
  assert.ok(isRadioFav(store, 'rb:a'));
  assert.equal(toggleRadioFav(store, a), false);
  assert.ok(!isRadioFav(store, 'rb:a'));
  prefs['radio.favs'] = [{ id: 'x' }, null, { id: 'y', url: 'http://u' }];
  assert.deepEqual(radioFavs(store).map((f) => f.id), ['y']);
  prefs['radio.favs'] = 'bozuk';
  assert.deepEqual(radioFavs(store), []);
});

// ---- listedeki radyolar (öncelikli kaynak) ----
const live = (o = {}) => ({ id: 'x1', streamId: '1', kind: 'live', name: 'Power FM', logo: 'https://l/p.png', group: 'RADYO', ...o });

test('listedeki radyo: kategori ya da ad "radyo/radio" ise sayılır; TV kanalı, film ve benzer sözcükler sayılmaz', () => {
  assert.equal(isListRadio(live()), true);
  assert.equal(isListRadio(live({ group: 'TR | Radyolar' })), true);
  assert.equal(isListRadio(live({ group: 'Müzik', name: 'Radyo D' })), true);
  assert.equal(isListRadio(live({ group: 'Ulusal', name: 'TRT Radio 3' })), true);
  assert.equal(isListRadio(live({ group: 'Ulusal', name: 'Show TV' })), false);
  assert.equal(isListRadio(live({ group: 'Spor', name: 'Radiohead Konseri' })), false, 'sözcük bütün olmalı');
  assert.equal(isListRadio(live({ kind: 'movie' })), false);
  assert.equal(isListRadio(null), false);
});

test('listedeki radyo: istasyon kaydı kaynağa bağlı kimlik taşır, aynı ad bir kez gelir, adresi olmayan atlanır, düz http logo elenir', () => {
  const items = [live(), live({ id: 'x2', name: 'power fm', group: 'MÜZİK RADYO' }), live({ id: 'x3', name: 'Kral FM', logo: 'http://l/k.png' }), live({ id: 'x4', name: 'Adresiz' }), live({ id: 'x5', name: 'Haber TV', group: 'Haber' })];
  const out = listStations(items, { sid: 'src1', urlOf: (it) => (it.name === 'Adresiz' ? '' : `https://h/${it.id}.m3u8`) });
  assert.deepEqual(out.map((x) => x.name), ['Power FM', 'Kral FM']);
  assert.equal(out[0].id, 'ls:src1:x1');
  assert.equal(out[0].listId, 'x1');
  assert.equal(out[0].url, 'https://h/x1.m3u8');
  assert.deepEqual(out[0].tags, ['RADYO']);
  assert.equal(out[0].fromList, true);
  assert.equal(out[1].logo, '');
  assert.deepEqual(listStations(null), []);
  const boom = listStations([live()], { sid: 's', urlOf: () => { throw new Error('x'); } });
  assert.deepEqual(boom, [], 'adres üretimi patlarsa kayıt atlanır');
});

test('listedeki radyo: oynatıcı öğesi listId taşır; favori kaydı da; dizine tık bildirilmez', async () => {
  const [st] = listStations([live()], { sid: 'src1', urlOf: () => 'https://h/1.m3u8' });
  const it = radioItem(st);
  assert.equal(it.radio, true);
  assert.equal(it.listId, 'x1');
  assert.equal(radioItem({ id: 'rb:u', name: 'a', url: 'https://a' }).listId, undefined);
  const prefs = {};
  const store = { pref: (k, d) => (k in prefs ? prefs[k] : d), setPref: (k, v) => { prefs[k] = v; } };
  toggleRadioFav(store, st);
  assert.equal(radioFavs(store)[0].listId, 'x1');
  let calls = 0;
  const net = { text: async () => { calls++; return ''; } };
  assert.equal(await countClick({ net, id: st.id }), false);
  assert.equal(calls, 0);
  assert.equal(await countClick({ net, id: 'rb:uuid1' }), true);
  assert.equal(calls, 1);
});

test('bağlantı: radyo ekranı önce listedeki radyoları gösterir, internet dizini yedektir; listede radyo varsa ana sayfa dizine gitmez', () => {
  const app = _kaynak('www/js/app.js');
  const ui = _kaynak('www/js/radio-ui.js');
  assert.match(app, /listStations: listRadios/);
  assert.match(app, /if \(radioHome \|\| listRadios\(\)\.length\) return fillHomeRadio\(\)/);
  assert.match(app, /return own\.length \? own : radioHome \? radioHome\.items : \[\]/);
  assert.match(app, /visibleAll\('live'\)/, 'gizli/kilitli kategoriler listedeki radyolara da uygulanır');
  assert.match(ui, /env\.store\.pref\(RADIO_SRC_KEY, 'list'\) !== 'net' \? 'list' : 'net'/);
  assert.match(ui, /data-src="list"/);
  assert.match(ui, /data-src="net">İnternet radyoları/);
  assert.match(ui, /if \(src === 'net'\) load\(false\)/, 'listede radyo varken internet dizini yüklenmez');
  assert.match(ui, /if \(src !== 'net'\) return;/, 'yükleme sürerken listeye dönülürse sonuç yoksayılır');
});

// ---- uygulamaya bağlantılar (kaynak metin denetimi) ----
import { readFileSync as _oku } from 'node:fs';
const _kaynak = (f) => _oku(new URL('../' + f, import.meta.url), 'utf8');

test('bağlantı: ana sayfada izleme listesi kısayolu yerine Radyo & Müzik; çocuk modunda yok', () => {
  const app = _kaynak('www/js/app.js');
  assert.match(app, /data-go="radio"/);
  assert.doesNotMatch(app, /data-go="recent">\$\{miniIc\('history'/, 'eski kısayol kalmamalı');
  assert.match(app, /if \(go === 'radio'\) return openRadio\(\)/);
  assert.match(app, /function openRadio\(\) \{\n\s+if \(kidActive\(\)\) return/);
  assert.match(app, /id="home-radio"/);
});

test('bağlantı: radyo oynatma — doğrudan adres, geçmişe yazılmaz, kanal bozuk işaretlenmez, favori ayrı', () => {
  const app = _kaynak('www/js/app.js');
  assert.match(app, /isRadio \? radioTargets\(item\)/);
  assert.match(app, /return t\.length \? t\.map\(\(x\) => \(\{ \.\.\.x, live: true \}\)\) : \[\{ url: item\.url, mime: 'auto', live: true \}\]/);
  assert.match(app, /!isRec && !isRadio && !item\.localMedia\) store\.pushRecent/);
  assert.match(app, /st\.item\.cast \|\| st\.item\.radio \|\| !st\.targets/);
  assert.match(app, /it\.radio \? isRadioFav\(store, it\.id\)/);
  assert.match(app, /if \(it\.radio\) \{[^}]*toggleRadioFav\(store, it\)/);
});

test('bağlantı: oynatıcı arayüzü radyoda rehber/kanal listesi/karışık-tekrar göstermez, bitişte sıradakine geçmez', () => {
  const ui = _kaynak('www/js/player-ui.js');
  assert.match(ui, /\|\| !!st\.item\.radio;/);
  assert.match(ui, /!st\.item\.radio && chpAvailable\(\)/);
  assert.match(ui, /!!\(cur && cur\.radio\)/);
  assert.match(ui, /isMusic\(cur\) && !cur\.radio/);
  assert.match(ui, /st\.status === 'ended' && musicNow && !st\.item\.radio/);
});

test('bağlantı: radyo sprite ve renkleri tanımlı', () => {
  assert.match(_kaynak('www/index.html'), /<symbol id="i-radio"/);
  const css = _kaynak('www/css/app.css');
  assert.match(css, /\.tile\.mini\.t-radio \{ --accent: var\(--p4\); \}/);
  assert.match(css, /html\[data-multi\] \.rd-pg \{ --pc: var\(--p6\); \}/);
  assert.doesNotMatch(css, /\bt-rec\b/, 'eski izleme listesi kısayol sınıfı kalmamalı (t-recs kayıtlar kısayoludur)');
});
