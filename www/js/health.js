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
// Yerel katmanın İngilizce/teknik hata iletilerini anlaşılır Türkçeye çevirir
export function explainProbeError(msg, timeout = false) {
  const m = String(msg || '');
  if (timeout || /timed? ?out|timeout/i.test(m)) return 'Bağlantı zaman aşımına uğradı';
  if (/unable to resolve host|unknownhost|no address associated/i.test(m)) return 'Sunucu adı çözülemedi';
  if (/refused/i.test(m)) return 'Sunucu bağlantıyı reddetti';
  if (/reset|broken pipe|unexpected end|eof/i.test(m)) return 'Bağlantı sunucu tarafından kesildi';
  if (/network is unreachable|no route/i.test(m)) return 'Ağa ulaşılamıyor';
  if (/ssl|certificate|handshake/i.test(m)) return 'Güvenli bağlantı (SSL) kurulamadı';
  return m || 'Bağlantı kurulamadı';
}

// probe: yerel katmanın WebView dışı isteği ({ url, headers, timeoutMs } → { status, ms, contentType, bytes, playlist } | { error, timeout, ms }).
// Android'de verilir; WebView'in fetch'i CORS yüzünden çoğu IPTV sunucusuna ulaşamaz ve her kanalı "başarısız" gösterirdi.
async function viaProbe(probe, url, headers, timeoutMs, now) {
  const started = now();
  let r;
  try {
    r = await probe({ url, headers: headers || {}, timeoutMs });
  } catch (error) {
    return { ok: false, status: null, latencyMs: Math.max(0, now() - started), format: detectMediaFormat(url), message: explainProbeError(error && error.message) };
  }
  r = r || {};
  const latencyMs = Number.isFinite(r.ms) ? Math.max(0, r.ms) : Math.max(0, now() - started);
  const status = Number.isFinite(r.status) && r.status > 0 ? r.status : null;
  if (status == null) return { ok: false, status: null, latencyMs, format: detectMediaFormat(url), message: explainProbeError(r.error, r.timeout) };
  const okStatus = status >= 200 && status < 300;
  const empty = okStatus && r.bytes === 0;
  const ok = okStatus && !empty;
  return {
    ok, status, latencyMs,
    format: r.playlist ? 'HLS (M3U8)' : detectMediaFormat(url, r.contentType),
    contentType: r.contentType || '',
    message: ok ? 'Sunucu yanıt verdi; gerçek görüntü/codec testi oynatma sırasında yapılır' : empty ? 'Sunucu yanıt verdi ama veri göndermedi' : `HTTP ${status}`,
  };
}
export async function checkStreamHealth(target, { fetchImpl = globalThis.fetch, timeoutMs = 8000, now = () => Date.now(), probe = null } = {}) {
  const url = typeof target === 'string' ? target : target && target.url;
  const headers = typeof target === 'object' && target ? target.headers : undefined;
  if (!url) throw new Error('Yayın adresi boş');
  if (/^rtsp:/i.test(url)) return { ok: null, status: null, latencyMs: null, format: 'RTSP', message: 'RTSP bağlantısı HTTP testiyle doğrulanamaz' };
  if (probe) return viaProbe(probe, url, headers, timeoutMs, now);
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
