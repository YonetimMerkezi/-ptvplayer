// Yönetici: GitHub Contents API ile `data` dalındaki config.json (herkese açık, şifreli girişler) ve vault.json
// (yalnızca yönetici parolasıyla açılan kasa) dosyalarını okur/yazar. Burada ağ çağrıları var; arayüz admin-ui.js’te.
import { b64, unb64, seal, unseal } from './managed.js';
import { emptyVault, sealVault, openVault, buildPublish } from './vault.js';

export const REPO = { owner: 'YonetimMerkezi', repo: '-ptvplayer', branch: 'data' };
const enc = new TextEncoder();
const dec = new TextDecoder();
const utf8b64 = (t) => b64(enc.encode(t));

export class ApiError extends Error {
  constructor(msg, status) {
    super(msg);
    this.status = status;
  }
}

export function createGithub({ token, fetchImpl = (...a) => globalThis.fetch(...a), repo = REPO, base = 'https://api.github.com' }) {
  const root = `${base}/repos/${repo.owner}/${repo.repo}`;
  async function call(method, url, body) {
    let res;
    try {
      res = await fetchImpl(url, {
        method,
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError('GitHub’a ulaşılamadı. İnternetinizi denetleyin.', 0);
    }
    let json = null;
    try {
      json = await res.json();
    } catch {}
    return { status: res.status, json };
  }
  const fail = (r, what) => {
    if (r.status === 401) throw new ApiError('Token geçersiz ya da süresi dolmuş.', 401);
    if (r.status === 403) throw new ApiError('Bu token’ın izni yetmiyor (Contents: Read and write gerekir) ya da GitHub sınırı doldu.', 403);
    throw new ApiError(`${what} (HTTP ${r.status}${r.json && r.json.message ? ': ' + r.json.message : ''})`, r.status);
  };
  return {
    // Token geçerli mi ve depoya yazabiliyor mu?
    async check() {
      const r = await call('GET', root);
      if (r.status === 404) throw new ApiError('Depo bulunamadı ya da token bu depoya erişemiyor.', 404);
      if (r.status !== 200) fail(r, 'Depo okunamadı');
      if (r.json.permissions && r.json.permissions.push === false) throw new ApiError('Bu token depoya yazamıyor (Contents: Read and write gerekir).', 403);
      return { defaultBranch: r.json.default_branch || 'main' };
    },
    // `data` dalı yoksa varsayılan dalın ucundan oluşturur.
    async ensureBranch() {
      const b = await call('GET', `${root}/branches/${repo.branch}`);
      if (b.status === 200) return false;
      if (b.status !== 404) fail(b, 'Dal okunamadı');
      const { defaultBranch } = await this.check();
      const ref = await call('GET', `${root}/git/ref/heads/${defaultBranch}`);
      if (ref.status !== 200) fail(ref, 'Varsayılan dal okunamadı');
      const mk = await call('POST', `${root}/git/refs`, { ref: `refs/heads/${repo.branch}`, sha: ref.json.object.sha });
      if (mk.status !== 201 && mk.status !== 422) fail(mk, 'Veri dalı oluşturulamadı');
      return true;
    },
    async getFile(path) {
      const r = await call('GET', `${root}/contents/${path}?ref=${repo.branch}`);
      if (r.status === 404) return null;
      if (r.status !== 200) fail(r, `${path} okunamadı`);
      return { sha: r.json.sha, text: dec.decode(unb64(String(r.json.content || '').replace(/\s/g, ''))) };
    },
    async putFile(path, text, sha, message) {
      const r = await call('PUT', `${root}/contents/${path}`, { message, content: utf8b64(text), branch: repo.branch, ...(sha ? { sha } : {}) });
      if (r.status === 409 || r.status === 422) throw Object.assign(new ApiError('Dosya başka bir yerden değişmiş. Paneli yenileyin.', r.status), { conflict: true });
      if (r.status !== 200 && r.status !== 201) fail(r, `${path} yazılamadı`);
      return r.json.content.sha;
    },
  };
}

// Token yerelde parolayla şifreli saklanır.
export const sealToken = (token, pass, opts) => seal({ t: token }, pass, { ...opts, aad: 'token' });
export async function openToken(sealed, pass, opts) {
  try {
    return (await unseal(sealed, pass, { ...opts, aad: 'token' })).t;
  } catch {
    throw new Error('Parola yanlış.');
  }
}

// Kasayı yükler (yoksa boş oluşturur — yayın yapılana kadar yazılmaz).
// → { vault, sha, fresh }
export async function loadVault(gh, pass, { now = Date.now(), subtle } = {}) {
  await gh.ensureBranch();
  const f = await gh.getFile('vault.json');
  if (!f) return { vault: emptyVault(now), sha: null, fresh: true };
  let sealed;
  try {
    sealed = JSON.parse(f.text);
  } catch {
    throw new Error('Kasa dosyası bozuk.');
  }
  return { vault: await openVault(sealed, pass, { subtle }), sha: f.sha, fresh: false };
}

// config.json + vault.json’u yazar. Kasa yazımı katıdır (başka cihaz değiştirdiyse çakışma hatası); config kasadan türediği için
// sha değişmişse yeniden okunup bir kez daha denenir.
// state: { vault, sha (vault.json), cfgSha } → yeni state
export async function publish(gh, state, pass, { now = Date.now(), subtle, rand, message = 'Yönetici paneli' } = {}) {
  const built = await buildPublish(state.vault, { now, subtle, rand });
  const cfgText = JSON.stringify(built.config);
  let cfgSha = state.cfgSha;
  if (cfgSha === undefined) cfgSha = (await gh.getFile('config.json'))?.sha || null;
  try {
    cfgSha = await gh.putFile('config.json', cfgText, cfgSha, message);
  } catch (e) {
    if (!e.conflict) throw e;
    cfgSha = await gh.putFile('config.json', cfgText, (await gh.getFile('config.json'))?.sha || null, message);
  }
  const sealed = await sealVault(built.vault, pass, { subtle, rand });
  const sha = await gh.putFile('vault.json', JSON.stringify(sealed), state.sha, message);
  return { vault: built.vault, sha, cfgSha };
}
