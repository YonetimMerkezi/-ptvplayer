import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { claim, isSub, isDev, kindOf, MOVE_LIMIT, MOVE_WINDOW, SEEN_EVERY, DAY } from '../server/logic.js';
import { subId, bestToken, callClaim, nextBind, bindAllowed, bindDue, BIND_URL, GRACE_DAYS, RECHECK_MS, BLOCKED_RECHECK_MS } from '../www/js/devbind.js';
import { PLAY_PRODUCTS } from '../www/js/billing.js';

const NOW = Date.UTC(2026, 10, 18, 12);
const SUB = 'a'.repeat(64);
const SUB2 = 'b'.repeat(64);
const D1 = 'a1b2c3d4e5f6';
const D2 = 'b1b2c3d4e5f6';
const D3 = 'c1b2c3d4e5f6';
const memStore = () => {
  const m = new Map();
  return { m, get: (s, k) => m.get(s + '|' + k) || null, put: (s, k, r) => m.set(s + '|' + k, r) };
};

test('sunucu: ilk cihaz bağlanır, aynı cihaz tekrar sorunca ok, başka cihaz "other" alır', () => {
  const st = memStore();
  assert.deepEqual(claim(st, { s: SUB, d: D1, k: 'phone' }, NOW), { status: 'ok', fresh: true });
  assert.deepEqual(claim(st, { s: SUB, d: D1, k: 'phone' }, NOW + 1000), { status: 'ok' });
  assert.deepEqual(claim(st, { s: SUB, d: D2, k: 'phone' }, NOW + 2000), { status: 'other', since: NOW });
  // başka abonelik etkilenmez
  assert.equal(claim(st, { s: SUB2, d: D2, k: 'phone' }, NOW).status, 'ok');
});

test('sunucu: telefon ve TV ayrı hak; tablet telefon sayılır', () => {
  const st = memStore();
  assert.equal(claim(st, { s: SUB, d: D1, k: 'phone' }, NOW).status, 'ok');
  assert.equal(claim(st, { s: SUB, d: D2, k: 'tv' }, NOW).status, 'ok', 'aynı abonelikle bir TV de bağlanır');
  assert.equal(claim(st, { s: SUB, d: D3, k: 'tv' }, NOW).status, 'other', 'ikinci TV olmaz');
  assert.equal(claim(st, { s: SUB, d: D3, k: 'tablet' }, NOW).status, 'other', 'bilinmeyen tür telefon sayılır');
  assert.equal(kindOf('tv'), 'tv');
  assert.equal(kindOf(undefined), 'phone');
});

test('sunucu: "take" üyeliği taşır, eski cihaz other olur; ayda en çok 2 taşıma, sonra limit ve süre dolunca yine olur', () => {
  const st = memStore();
  claim(st, { s: SUB, d: D1, k: 'phone' }, NOW);
  assert.equal(MOVE_LIMIT, 2);
  assert.deepEqual(claim(st, { s: SUB, d: D2, k: 'phone', take: true }, NOW + DAY), { status: 'ok', moved: true });
  assert.equal(claim(st, { s: SUB, d: D1, k: 'phone' }, NOW + DAY + 1).status, 'other', 'eski cihaz kapanır');
  assert.equal(claim(st, { s: SUB, d: D2, k: 'phone' }, NOW + DAY + 2).status, 'ok');
  assert.equal(claim(st, { s: SUB, d: D1, k: 'phone', take: true }, NOW + 2 * DAY).moved, true, 'ikinci taşıma (geri alma da sayılır)');
  const lim = claim(st, { s: SUB, d: D3, k: 'phone', take: true }, NOW + 3 * DAY);
  assert.deepEqual(lim, { status: 'limit', next: NOW + DAY + MOVE_WINDOW }, 'üçüncü taşıma sınırda kalır; ilk taşımadan 30 gün sonra açılır');
  assert.equal(claim(st, { s: SUB, d: D1, k: 'phone' }, NOW + 3 * DAY).status, 'ok', 'limitte bağlama değişmez');
  assert.equal(claim(st, { s: SUB, d: D3, k: 'phone', take: true }, NOW + DAY + MOVE_WINDOW + 1).moved, true, 'pencere geçince yeniden taşınabilir');
  // take, bağlı olmayan abonelikte yalnız bağlar
  assert.equal(claim(st, { s: SUB2, d: D1, k: 'phone', take: true }, NOW).fresh, true);
});

test('sunucu: geçersiz istekler reddedilir; "son görülme" günde bir yazılır', () => {
  const st = memStore();
  for (const bad of [null, {}, { s: 'x', d: D1 }, { s: SUB, d: 'zz' }, { s: SUB.toUpperCase(), d: D1 }, { s: SUB, d: D1.toUpperCase() }, { s: 5, d: D1 }]) assert.deepEqual(claim(st, bad, NOW), { status: 'bad' });
  assert.equal(st.m.size, 0);
  assert.ok(isSub(SUB) && isDev(D1) && !isSub(SUB.slice(1)) && !isDev(D1 + '0'));
  claim(st, { s: SUB, d: D1 }, NOW);
  claim(st, { s: SUB, d: D1 }, NOW + SEEN_EVERY - 1);
  assert.equal(st.get(SUB, 'phone').at, NOW, 'sık sorgu yazma yapmaz');
  claim(st, { s: SUB, d: D1 }, NOW + SEEN_EVERY);
  assert.equal(st.get(SUB, 'phone').at, NOW + SEEN_EVERY);
});

test('sunucu dosyaları: Worker mantığı logic.js\'ten kullanır, Durable Object SQLite, CORS ve boyut sınırı var', () => {
  const w = readFileSync(new URL('../server/worker.js', import.meta.url), 'utf8');
  assert.match(w, /import \{ claim \} from '\.\/logic\.js'/);
  assert.match(w, /export class Bindings extends DurableObject/);
  assert.match(w, /CREATE TABLE IF NOT EXISTS b \(sub TEXT NOT NULL, kind TEXT NOT NULL[^)]*PRIMARY KEY \(sub, kind\)\)/);
  assert.match(w, /access-control-allow-origin/);
  assert.match(w, /text\.length > 1024/);
  assert.match(w, /request\.method === 'OPTIONS'/);
  const t = readFileSync(new URL('../server/wrangler.toml', import.meta.url), 'utf8');
  assert.match(t, /new_sqlite_classes = \["Bindings"\]/);
  assert.match(t, /name = "BIND"\s+class_name = "Bindings"/);
  assert.ok(existsSync(new URL('../server/README.md', import.meta.url)));
});

test('istemci: abonelik kimliği jetonun özetidir, jeton sızmaz; en yüksek katmanın jetonu seçilir', async () => {
  const id = await subId('TOKEN-ABC');
  assert.match(id, /^[0-9a-f]{64}$/);
  assert.equal(id, await subId('TOKEN-ABC'));
  assert.notEqual(id, await subId('TOKEN-ABD'));
  assert.ok(!id.includes('TOKEN'));
  const { standard, pro } = PLAY_PRODUCTS;
  assert.equal(bestToken([standard, pro], { [standard]: 'T-S', [pro]: 'T-P' }), 'T-P');
  assert.equal(bestToken([standard], { [standard]: 'T-S', [pro]: 'T-P' }), 'T-S');
  assert.equal(bestToken([pro], { [standard]: 'T-S' }), '', 'jeton yoksa boş');
  assert.equal(bestToken([], { [pro]: 'T-P' }), '');
  assert.equal(bestToken(null, null), '');
  assert.equal(bestToken([pro], { [pro]: 5 }), '');
});

test('istemci: callClaim istek biçimi, yanıt ayıklama, hata ve boş adres', async () => {
  let seen;
  const ok = (j, status = 200) => async (url, init) => {
    seen = { url, init };
    return { ok: status < 400, status, json: async () => j };
  };
  const r = await callClaim({ sub: SUB, dev: D1, kind: 'tv', take: true }, { url: 'https://x.example/', fetchImpl: ok({ status: 'limit', next: 123, extra: 'yok sayılır' }) });
  assert.deepEqual(r, { status: 'limit', since: 0, next: 123, moved: false });
  assert.equal(seen.url, 'https://x.example/v1/claim');
  assert.equal(seen.init.method, 'POST');
  assert.deepEqual(JSON.parse(seen.init.body), { s: SUB, d: D1, k: 'tv', take: true });
  assert.deepEqual(JSON.parse((await callClaim({ sub: SUB, dev: D1, kind: 'bozuk' }, { url: 'https://x.example', fetchImpl: ok({ status: 'ok' }) }) && seen).init.body), { s: SUB, d: D1, k: 'phone', take: false });
  assert.equal((await callClaim({ sub: SUB, dev: D1 }, { url: 'https://x.example', fetchImpl: ok({ status: 'ok', moved: true }) })).moved, true);
  assert.equal(await callClaim({ sub: SUB, dev: D1 }, { url: 'https://x.example', fetchImpl: ok({ status: 'bad' }, 400) }), null, 'bad yanıt = doğrulama yok');
  assert.equal(await callClaim({ sub: SUB, dev: D1 }, { url: 'https://x.example', fetchImpl: ok({ status: 'root' }) }), null);
  assert.equal(await callClaim({ sub: SUB, dev: D1 }, { url: 'https://x.example', fetchImpl: async () => { throw new Error('ağ yok'); } }), null);
  assert.equal(await callClaim({ sub: SUB, dev: D1 }, { url: 'https://x.example', fetchImpl: async () => ({ json: async () => { throw new Error('json değil'); } }) }), null);
  let called = false;
  assert.equal(await callClaim({ sub: SUB, dev: D1 }, { url: '', fetchImpl: async () => { called = true; } }), null);
  assert.equal(called, false, 'adres boşken ağa çıkılmaz');
  assert.equal(BIND_URL === '' || /^https:\/\//.test(BIND_URL), true);
});

test('istemci: bağlama durumu geçişleri ve tolerans', () => {
  const T = NOW;
  const DAYMS = 86400000;
  let b = nextBind({ bind: null, sub: SUB, result: null, now: T });
  assert.deepEqual(b, { s: SUB, first: T, at: 0, other: false, since: 0, next: 0 });
  assert.equal(bindAllowed(b, T + 6 * DAYMS), true, 'sunucuya hiç ulaşılamadı: ilk denemeden 7 gün tolerans');
  assert.equal(bindAllowed(b, T + 8 * DAYMS), false);
  b = nextBind({ bind: b, sub: SUB, result: { status: 'ok' }, now: T + DAYMS });
  assert.equal(b.at, T + DAYMS);
  assert.equal(b.first, T, 'ilk deneme korunur');
  assert.equal(bindAllowed(b, T + DAYMS + GRACE_DAYS * DAYMS), true);
  assert.equal(bindAllowed(b, T + DAYMS + GRACE_DAYS * DAYMS + 1), false, 'son doğrulamadan 7 günden fazla geçti');
  // ulaşılamazsa durum aynen kalır (sıfırlanmaz)
  assert.deepEqual(nextBind({ bind: b, sub: SUB, result: null, now: T + 2 * DAYMS }), b);
  // başka cihaza bağlı: kilit; ok gelince açılır
  const o = nextBind({ bind: b, sub: SUB, result: { status: 'other', since: 77 }, now: T + 3 * DAYMS });
  assert.equal(o.other, true);
  assert.equal(o.since, 77);
  assert.equal(bindAllowed(o, T + 3 * DAYMS), false);
  assert.equal(bindAllowed(nextBind({ bind: o, sub: SUB, result: null, now: T + 4 * DAYMS }), T + 4 * DAYMS), false, 'başka cihazdayken ulaşılamasa da açılmaz');
  const lim = nextBind({ bind: o, sub: SUB, result: { status: 'limit', next: 999 }, now: T + 5 * DAYMS });
  assert.equal(lim.other, true);
  assert.equal(lim.next, 999);
  const back = nextBind({ bind: lim, sub: SUB, result: { status: 'ok', moved: true }, now: T + 6 * DAYMS });
  assert.equal(back.other, false);
  assert.equal(back.next, 0);
  assert.equal(bindAllowed(back, T + 6 * DAYMS), true);
  // yeni abonelik (yeni jeton): sıfırdan başlar
  const fresh = nextBind({ bind: o, sub: SUB2, result: null, now: T + 7 * DAYMS });
  assert.equal(fresh.s, SUB2);
  assert.equal(fresh.other, false);
  assert.equal(bindAllowed(null), true);
});

test('istemci: ne zaman yeniden sorulur', () => {
  const T = NOW;
  assert.equal(bindDue(null, T), true);
  assert.equal(bindDue({ s: SUB, first: T, at: 0, other: false }, T), true, 'hiç doğrulanmadıysa her seferinde dener');
  assert.equal(bindDue({ s: SUB, first: T, at: T, other: false }, T + RECHECK_MS - 1), false);
  assert.equal(bindDue({ s: SUB, first: T, at: T, other: false }, T + RECHECK_MS + 1), true);
  assert.equal(bindDue({ s: SUB, first: T, at: T, other: true }, T + BLOCKED_RECHECK_MS - 1), false);
  assert.equal(bindDue({ s: SUB, first: T, at: T, other: true }, T + BLOCKED_RECHECK_MS + 1), true, 'başka cihazdayken daha sık bakılır');
});

test('tek cihaz kuralı: Java jetonları döndürür, uygulama bağlar, arayüz taşıma sunar, dağıtım ve gizlilik metni yerinde', () => {
  const oku = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  const java = oku('android/app/src/play/java/com/koruk/iptv/PlayBilling.java');
  assert.match(java, /tokens\.put\(id, p\.getPurchaseToken\(\)\)/, 'her ürünün satın alma jetonu uygulamaya verilir (karma için)');
  assert.match(java, /o\.put\("tokens", tokens\)/);
  const app = oku('www/js/app.js');
  assert.match(app, /from '\.\/devbind\.js'/);
  assert.match(app, /oneDevice\(nextEnt\(\{ ids, current: cur \}\), ids, tokens\)/, 'üyelik hakkı her eşitlemede tek cihaz kuralından geçer');
  assert.match(app, /!BIND_URL\) return ent/, 'adres boşken kural kapalı: hiçbir şey değişmez');
  assert.match(app, /data-take/, 'üyelik penceresinde "Bu cihazı kullan"');
  assert.match(app, /id="mw-take"/, 'üyelik duvarında "Bu cihazı kullan"');
  assert.match(app, /\(other \? '' : `<button class="btn/, 'başka cihaza bağlıyken satın alma düğmesi gizlenir');
  const wf = oku('.github/workflows/server.yml');
  assert.match(wf, /CLOUDFLARE_API_TOKEN/);
  assert.match(wf, /working-directory: server/);
  assert.match(wf, /wrangler@4 deploy/);
  assert.match(wf, /\[ -z "\$CLOUDFLARE_API_TOKEN" \][\s\S]*?exit 0/, 'jeton yoksa sessizce atlar, derlemeyi bozmaz');
  const gp = oku('gizlilik-politikasi.md');
  assert.match(gp, /Cloudflare Workers/, 'sunucuya giden veri gizlilik metninde açıklanır');
  assert.match(gp, /one-way hash/);
  assert.ok(existsSync(new URL('../server/README.md', import.meta.url)));
});
