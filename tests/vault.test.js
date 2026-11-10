import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault, newUser, userStatus, extendUser, addBlocked, buildPublish, sealVault, openVault, inviteText, cleanSourceInput, DAY } from '../www/js/vault.js';
import { createGithub, loadVault, publish, sealToken, openToken } from '../www/js/admin.js';
import { parseConfig, resolveCode, codeId, normalizeCode } from '../www/js/managed.js';

const NOW = Date.UTC(2026, 10, 10);
const SRC = { type: 'xtream', name: 'Ana', server: 'http://s.example:8080', user: 'kul', pass: 'GIZLI-SIFRE' };
const PASS = 'panel-parolasi-123';

// Sahte GitHub: yalnızca kullanılan uç noktalar.
function fakeGithub({ push = true } = {}) {
  const files = new Map(); // path → {text, sha}
  let branch = false;
  let n = 0;
  const log = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const p = u.pathname.replace('/repos/YonetimMerkezi/-ptvplayer', '');
    const m = init.method || 'GET';
    log.push(`${m} ${p}`);
    const res = (status, json) => ({ status, ok: status < 400, json: async () => json });
    if (init.headers.Authorization !== 'Bearer TOKEN') return res(401, { message: 'Bad credentials' });
    if (p === '' && m === 'GET') return res(200, { default_branch: 'main', permissions: { push } });
    if (p === '/branches/data') return branch ? res(200, {}) : res(404, {});
    if (p === '/git/ref/heads/main') return res(200, { object: { sha: 'abc123' } });
    if (p === '/git/refs' && m === 'POST') {
      branch = true;
      return res(201, {});
    }
    const c = /^\/contents\/(.+)$/.exec(p);
    if (c && m === 'GET') {
      const f = files.get(c[1]);
      return f ? res(200, { sha: f.sha, content: Buffer.from(f.text).toString('base64') }) : res(404, {});
    }
    if (c && m === 'PUT') {
      const body = JSON.parse(init.body);
      const f = files.get(c[1]);
      if ((f && body.sha !== f.sha) || (!f && body.sha)) return res(409, { message: 'sha mismatch' });
      const sha = 'sha' + ++n;
      files.set(c[1], { text: Buffer.from(body.content, 'base64').toString('utf8'), sha });
      return res(200, { content: { sha } });
    }
    return res(404, {});
  };
  return { fetchImpl, files, log, hasBranch: () => branch };
}
const ghOf = (fake, token = 'TOKEN') => createGithub({ token, fetchImpl: fake.fetchImpl });

test('kullanıcı: doğrulama, durum, süre uzatma, davet metni', () => {
  assert.throws(() => newUser({ name: '', sources: [SRC] }), /adı gerekli/);
  assert.throws(() => newUser({ name: 'A', sources: [{ type: 'm3u', url: 'ftp://x' }] }), /liste gerekli/);
  const u = newUser({ name: 'Ayşe', days: 30, sources: [SRC, { type: 'm3u', url: 'http://l/x' }, { type: 'xtream' }] }, { now: NOW });
  assert.equal(u.sources.length, 2);
  assert.equal(u.x, NOW + 30 * DAY);
  assert.ok(normalizeCode(u.code));
  assert.equal(userStatus(u, NOW), 'active');
  assert.equal(userStatus(u, NOW + 31 * DAY), 'expired');
  assert.equal(userStatus({ ...u, off: true }, NOW), 'off');
  assert.equal(extendUser(u, 30, NOW + 40 * DAY).x, NOW + 70 * DAY);
  assert.equal(extendUser(u, 30, NOW).x, NOW + 60 * DAY);
  assert.equal(extendUser({ ...u, x: 0 }, 30, NOW).x, 0);
  const t = inviteText(u, 'https://x/y.apk');
  assert.ok(t.includes(u.code) && t.includes('https://x/y.apk'));
  assert.ok(!t.includes('GIZLI-SIFRE'));
  assert.equal(newUser({ name: 'S', days: 0, sources: [SRC] }, { now: NOW }).x, 0);
  assert.equal(cleanSourceInput({ type: 'm3u', url: 'javascript:1' }), null);
});

test('engelli cihaz: biçim denetimi, tekrar eklemez', () => {
  let v = addBlocked(emptyVault(NOW), 'A1B2-C3D4-E5F6', 'Ali');
  assert.deepEqual(v.blocked, [{ id: 'a1b2c3d4e5f6', note: 'Ali' }]);
  assert.equal(addBlocked(v, 'a1b2c3d4e5f6').blocked.length, 1);
  assert.throws(() => addBlocked(v, '123'), /12 harf/);
});

test('kasa: gidiş-dönüş, yanlış parola, düz metin yok', async () => {
  const v = { ...emptyVault(NOW), users: [newUser({ name: 'Ayşe', sources: [SRC] }, { now: NOW })] };
  const sealed = await sealVault(v, PASS);
  const raw = JSON.stringify(sealed);
  assert.ok(!raw.includes('Ayşe') && !raw.includes('GIZLI') && !raw.includes(v.users[0].code));
  assert.deepEqual((await openVault(sealed, PASS)).users[0].name, 'Ayşe');
  await assert.rejects(() => openVault(sealed, 'yanlış'), /Parola yanlış/);
  const tok = await sealToken('TOKEN', PASS);
  assert.equal(await openToken(tok, PASS), 'TOKEN');
  await assert.rejects(() => openToken(tok, 'x'), /Parola yanlış/);
  assert.ok(!JSON.stringify(tok).includes('TOKEN'));
});

test('yayın: config cihazda çözülür, değişmeyen girişler yeniden şifrelenmez, kapalı kullanıcı girmez', async () => {
  const a = newUser({ name: 'Ayşe', days: 30, sources: [SRC] }, { now: NOW });
  const b = newUser({ name: 'Veli', sources: [SRC] }, { now: NOW });
  const off = { ...newUser({ name: 'Kapalı', sources: [SRC] }, { now: NOW }), off: true };
  let vault = { ...emptyVault(NOW), users: [a, b, off], blocked: [{ id: 'a1b2c3d4e5f6', note: '' }] };
  const p1 = await buildPublish(vault, { now: NOW });
  assert.equal(Object.keys(p1.config.entries).length, 2);
  assert.deepEqual(p1.config.blocked, ['a1b2c3d4e5f6']);
  const cfg = parseConfig(JSON.parse(JSON.stringify(p1.config)));
  const r = await resolveCode(a.code, cfg, { now: NOW });
  assert.equal(r.status, 'ok');
  assert.equal(r.sources[0].pass, 'GIZLI-SIFRE');
  assert.equal((await resolveCode(off.code, cfg, { now: NOW })).status, 'missing');
  // değişmeyen kullanıcı: aynı şifreli giriş; değişen: yeni
  vault = { ...p1.vault, users: p1.vault.users.map((u) => (u.code === a.code ? { ...u, name: 'Ayşe 2' } : u)) };
  const p2 = await buildPublish(vault, { now: NOW + 1 });
  const idA = await codeId(a.code);
  const idB = await codeId(b.code);
  assert.deepEqual(p2.config.entries[idB], p1.config.entries[idB]);
  assert.notDeepEqual(p2.config.entries[idA], p1.config.entries[idA]);
  assert.equal(p2.config.at, NOW + 1);
  // süresi dolan giriş kalır, cihaz "süresi doldu" der
  const p3 = await buildPublish({ ...emptyVault(NOW), users: [a] }, { now: NOW + 40 * DAY });
  assert.equal((await resolveCode(a.code, parseConfig(p3.config), { now: NOW + 40 * DAY })).status, 'expired');
});

test('GitHub: kurulum, dal oluşturma, yayın, çakışma, izin hataları', async () => {
  const fake = fakeGithub();
  const gh = ghOf(fake);
  let st = await loadVault(gh, PASS, { now: NOW });
  assert.equal(st.fresh, true);
  assert.ok(fake.hasBranch());
  assert.equal(fake.log.filter((l) => l.startsWith('POST')).length, 1);
  const u = newUser({ name: 'Ayşe', sources: [SRC] }, { now: NOW });
  let state = await publish(gh, { vault: { ...st.vault, users: [u] }, sha: st.sha }, PASS, { now: NOW });
  assert.ok(fake.files.has('config.json') && fake.files.has('vault.json'));
  // GitHub’daki iki dosyada düz metin yok
  for (const f of fake.files.values()) for (const s of ['GIZLI', 'Ayşe', 's.example', u.code]) assert.ok(!f.text.includes(s), 'sızıntı: ' + s);
  // ikinci yayın (sha’lar ilerler)
  state = await publish(gh, { ...state, vault: { ...state.vault, users: [...state.vault.users, newUser({ name: 'Veli', sources: [SRC] }, { now: NOW })] } }, PASS, { now: NOW + 5 });
  assert.equal(Object.keys(JSON.parse(fake.files.get('config.json').text).entries).length, 2);
  // yeniden yükleme aynı kasayı verir
  const again = await loadVault(gh, PASS, { now: NOW });
  assert.equal(again.vault.users.length, 2);
  assert.equal(again.fresh, false);
  await assert.rejects(() => loadVault(gh, 'başka-parola'), /Parola yanlış/);
  // başka cihaz kasayı değiştirdi: eski sha ile yazma çakışır
  await assert.rejects(() => publish(gh, { vault: again.vault, sha: 'eski-sha', cfgSha: state.cfgSha }, PASS, { now: NOW }), (e) => e.conflict === true);
  // config sha eskiyse kendini toparlar
  const ok = await publish(gh, { vault: again.vault, sha: again.sha, cfgSha: 'eski-cfg' }, PASS, { now: NOW + 9 });
  assert.ok(ok.sha);
  // hatalı token / salt-okunur token
  await assert.rejects(() => ghOf(fake, 'YANLIS').check(), /Token geçersiz/);
  await assert.rejects(() => ghOf(fakeGithub({ push: false })).check(), /yazamıyor/);
  const dead = createGithub({ token: 'TOKEN', fetchImpl: async () => { throw new TypeError('fail'); } });
  await assert.rejects(() => dead.check(), /ulaşılamadı/);
});
