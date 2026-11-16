// Ücretsiz Cloudflare Speed Test uç noktalarıyla indirme/yükleme ve gecikme ölçümü.
// Her çalıştırmada yaklaşık 9 MB veri kullanır; yayın oynatımına müdahale etmez.
const BASE = 'https://speed.cloudflare.com';
const DOWNLOAD_BYTES = 8_000_000;
const UPLOAD_BYTES = 1_000_000;
const PING_COUNT = 4;

function checkAbort(signal) {
  if (signal && signal.aborted) throw new DOMException('Test iptal edildi', 'AbortError');
}

async function request(url, options, { signal, timeoutMs = 25000, fetchImpl }) {
  checkAbort(signal);
  const ctl = new AbortController();
  const abort = () => ctl.abort();
  if (signal) signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: ctl.signal, cache: 'no-store', mode: 'cors', credentials: 'omit' });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', abort);
  }
}

function nonce() {
  return Math.random().toString(36).slice(2);
}

export async function runInternetSpeedTest({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => globalThis.performance.now(),
  signal,
  onProgress = () => {},
  downloadBytes = DOWNLOAD_BYTES,
  uploadBytes = UPLOAD_BYTES,
  pingCount = PING_COUNT,
} = {}) {
  const timings = [];
  onProgress({ phase: 'ping', percent: 4, message: 'Sunucu gecikmesi ölçülüyor' });
  for (let i = 0; i < pingCount; i++) {
    checkAbort(signal);
    const start = now();
    const res = await request(`${BASE}/__down?bytes=0&x=${nonce()}`, { method: 'GET' }, { signal, fetchImpl, timeoutMs: 12000 });
    if (!res.ok) throw new Error(`Test sunucusu yanıt vermedi (HTTP ${res.status})`);
    if (res.body && res.body.cancel) await res.body.cancel().catch(() => {});
    timings.push(Math.max(0, now() - start));
    onProgress({ phase: 'ping', percent: 5 + Math.round(((i + 1) / pingCount) * 12), message: `Gecikme ölçülüyor · ${i + 1}/${pingCount}` });
  }
  const pingMs = timings.slice().sort((a, b) => a - b)[Math.floor(timings.length / 2)];

  checkAbort(signal);
  onProgress({ phase: 'download', percent: 20, message: 'İndirme hızı ölçülüyor' });
  const downStart = now();
  const down = await request(`${BASE}/__down?bytes=${downloadBytes}&x=${nonce()}`, { method: 'GET' }, { signal, fetchImpl, timeoutMs: 35000 });
  if (!down.ok) throw new Error(`İndirme testi başarısız (HTTP ${down.status})`);
  let received = 0;
  if (down.body && down.body.getReader) {
    const reader = down.body.getReader();
    try {
      for (;;) {
        checkAbort(signal);
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        onProgress({ phase: 'download', percent: 20 + Math.min(48, Math.round((received / downloadBytes) * 48)), message: 'İndirme hızı ölçülüyor', transferred: received, total: downloadBytes });
      }
    } finally {
      try { reader.releaseLock(); } catch { /* okuyucu zaten bırakılmış: yok sayılır */ }
    }
  } else {
    const buf = await down.arrayBuffer();
    received = buf.byteLength;
  }
  const downSeconds = Math.max(0.001, (now() - downStart) / 1000);
  if (!received) throw new Error('İndirme testinde veri alınamadı');
  const downloadMbps = (received * 8) / downSeconds / 1_000_000;

  checkAbort(signal);
  onProgress({ phase: 'upload', percent: 72, message: 'Yükleme hızı ölçülüyor' });
  const payload = new Uint8Array(uploadBytes);
  const upStart = now();
  const up = await request(`${BASE}/__up?x=${nonce()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: payload,
  }, { signal, fetchImpl, timeoutMs: 35000 });
  if (!up.ok) throw new Error(`Yükleme testi başarısız (HTTP ${up.status})`);
  if (up.body && up.body.cancel) await up.body.cancel().catch(() => {});
  const upSeconds = Math.max(0.001, (now() - upStart) / 1000);
  const uploadMbps = (uploadBytes * 8) / upSeconds / 1_000_000;

  const result = {
    pingMs: Math.round(pingMs),
    downloadMbps: Math.round(downloadMbps * 10) / 10,
    uploadMbps: Math.round(uploadMbps * 10) / 10,
    testedAt: Date.now(),
    dataUsedBytes: received + uploadBytes,
    server: 'Cloudflare',
  };
  onProgress({ phase: 'done', percent: 100, message: 'Test tamamlandı', result });
  return result;
}
