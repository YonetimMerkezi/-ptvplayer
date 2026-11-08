// Yayın sağlık kontrolü için güvenli, tek istekli tanılama yardımcıları.
// Bu katman oynatıcıya müdahale etmez; yalnız kullanıcı tarafından başlatılan testte kullanılır.
const FORMATS = [
  [/\.m3u8(?:$|[?#])/i, 'HLS (M3U8)'],
  [/\.mpd(?:$|[?#])/i, 'MPEG-DASH'],
  [/\.mp4(?:$|[?#])/i, 'MP4'],
  [/\.m4v(?:$|[?#])/i, 'M4V'],
  [/\.mkv(?:$|[?#])/i, 'MKV'],
  [/\.ts(?:$|[?#])/i, 'MPEG-TS'],
  [/\.mov(?:$|[?#])/i, 'MOV'],
  [/\.avi(?:$|[?#])/i, 'AVI'],
  [/\.wmv(?:$|[?#])/i, 'WMV'],
  [/\.flv(?:$|[?#])/i, 'FLV'],
  [/^rtsp:/i, 'RTSP'],
];
export function detectMediaFormat(url, mime = '') {
  const m = String(mime || '').toLowerCase();
  if (m.includes('mpegurl') || m === 'hls') return 'HLS (M3U8)';
  if (m.includes('dash') || m === 'mpd') return 'MPEG-DASH';
  if (m.startsWith('video/')) return m;
  const found = FORMATS.find(([re]) => re.test(String(url || '')));
  return found ? found[1] : 'Otomatik / bilinmiyor';
}
export async function checkStreamHealth(target, { fetchImpl = globalThis.fetch, timeoutMs = 8000, now = () => Date.now() } = {}) {
  const url = typeof target === 'string' ? target : target && target.url;
  const headers = typeof target === 'object' && target ? target.headers : undefined;
  if (!url) throw new Error('Yayın adresi boş');
  if (/^rtsp:/i.test(url)) return { ok: null, status: null, latencyMs: null, format: 'RTSP', message: 'RTSP bağlantısı HTTP testiyle doğrulanamaz' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = now();
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { ...(headers || {}), Range: 'bytes=0-0' },
      signal: controller.signal,
      cache: 'no-store',
    });
    const latencyMs = Math.max(0, now() - started);
    const status = response.status;
    try { if (response.body && response.body.cancel) await response.body.cancel(); } catch {}
    const ok = (status >= 200 && status < 300) || status === 206;
    return {
      ok, status, latencyMs,
      format: detectMediaFormat(url, response.headers && response.headers.get && response.headers.get('content-type')),
      contentType: response.headers && response.headers.get ? response.headers.get('content-type') || '' : '',
      message: ok ? 'Sunucu yanıt verdi; gerçek görüntü/codec testi oynatma sırasında yapılır' : `HTTP ${status}`,
    };
  } catch (error) {
    const timeout = error && error.name === 'AbortError';
    return { ok: false, status: null, latencyMs: Math.max(0, now() - started), format: detectMediaFormat(url), message: timeout ? 'Bağlantı zaman aşımına uğradı' : (error && error.message) || 'Bağlantı kurulamadı' };
  } finally {
    clearTimeout(timer);
  }
}
