// Oynatıcı "Yayın bilgisi": motordan gelen ham ölçümleri okunur satırlara çevirir (saf mantık).
// Ham ölçüm (hepsi isteğe bağlı): { bufferMs, width, height, fps, videoBps, audioBps, bandwidthBps, videoCodec, audioCodec, videoMime, audioMime, dropped, rendered }

// 4_500_000 → "4,5 Mb/sn"; 640_000 → "640 kb/sn"
export function fmtBps(bps) {
  const n = Number(bps);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' Mb/sn';
  return Math.round(n / 1e3) + ' kb/sn';
}

// 12400 → "12,4 sn"
export function fmtBuffer(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 100) return '0 sn';
  return (n / 1000).toFixed(1).replace('.', ',') + ' sn';
}

// "avc1.64001f" → "H.264", "hvc1.1.6.L93" → "H.265", "mp4a.40.2" → "AAC"
export function codecName(codec, mime = '') {
  const c = String(codec || mime || '').toLowerCase();
  if (!c) return '';
  if (/avc|h264|video\/avc/.test(c)) return 'H.264';
  if (/hvc|hev|h265|video\/hevc/.test(c)) return 'H.265';
  if (/av01|av1/.test(c)) return 'AV1';
  if (/vp9|vp09/.test(c)) return 'VP9';
  if (/vp8/.test(c)) return 'VP8';
  if (/mpeg2|mp2v|mpeg-2/.test(c)) return 'MPEG-2';
  if (/mp4a\.40|aac|mp4a-latm/.test(c)) return 'AAC';
  if (/ec-3|eac3|e-ac-3/.test(c)) return 'E-AC3';
  if (/ac-3|ac3/.test(c)) return 'AC3';
  if (/mp4a\.6b|mp3|mpeg\/|audio\/mpeg/.test(c)) return 'MP3';
  if (/opus/.test(c)) return 'Opus';
  if (/dts/.test(c)) return 'DTS';
  return String(codec || mime).replace(/^(video|audio)\//, '');
}

// Tampon durumu: canlı yayında 3 sn altı ince, 10 sn üstü bol.
export function bufferLevel(ms, live = true) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return '';
  if (n < 3000) return 'low';
  return n >= (live ? 10000 : 20000) ? 'good' : 'ok';
}

const STATUS = { loading: 'Açılıyor', buffering: 'Tamponluyor', playing: 'Oynuyor', paused: 'Duraklatıldı', ended: 'Bitti', error: 'Hata', idle: 'Kapalı' };

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

// Adresin biçimi: "HLS", "MPEG-TS", "yedek kanal (...)" ya da motorun bildirdiği tür; bilinmiyorsa boş
export function targetKind(target) {
  if (!target) return '';
  return target.alt ? `yedek kanal (${target.alt})` : target.mime === 'hls' || /\.m3u8(\?|$)/i.test(target.url) ? 'HLS' : target.mime === 'ts' || /\.ts(\?|$)/i.test(target.url) ? 'MPEG-TS' : target.mime && target.mime !== 'auto' ? target.mime : '';
}

// Android çözücü adından: "OMX.google.h264.decoder", "c2.android.avc.decoder" yazılım; üreticinin ("OMX.MTK…", "c2.mtk…", "amlogic") çözücüleri donanım
export const isSoftwareDecoder = (name) => /^(omx\.google\.|c2\.android\.|c2\.google\.)|(^|\.)sw(\.|$)|software/i.test(String(name || ''));

// 3200 → "3,2 sn"
const fmtSec = (ms) => (Math.max(0, ms) / 1000).toFixed(1).replace('.', ',') + ' sn';

// st: player.state(); raw: motor ölçümü (null olabilir). Dönen: [{ k, v, level? }]
export function statsRows(st, raw) {
  const rows = [];
  const r = raw || {};
  const target = st && st.targets && st.targets[st.idx];
  rows.push({ k: 'Durum', v: (STATUS[st && st.status] || '') + (st && st.reconnect ? ` · yeniden bağlanma ${st.reconnect}` : '') });
  if (target) {
    const kind = targetKind(target);
    const adr = st.targets.length > 1 ? ` · adres ${st.idx + 1}/${st.targets.length}` : '';
    rows.push({ k: 'Yayın', v: [kind, hostOf(target.url)].filter(Boolean).join(' · ') + adr });
  }
  if (r.width > 0 && r.height > 0) {
    const codec = codecName(r.videoCodec, r.videoMime);
    rows.push({ k: 'Görüntü', v: [`${r.width}×${r.height}`, r.fps > 0 ? `${Math.round(r.fps)} k/sn` : '', codec].filter(Boolean).join(' · ') });
  }
  const vb = fmtBps(r.videoBps);
  const ab = fmtBps(r.audioBps);
  const acodec = codecName(r.audioCodec, r.audioMime);
  if (vb || ab || acodec) rows.push({ k: 'Bit hızı', v: [vb && 'görüntü ' + vb, ab && 'ses ' + ab, acodec].filter(Boolean).join(' · ') });
  const bw = fmtBps(r.bandwidthBps);
  if (bw) rows.push({ k: 'Bağlantı hızı', v: bw + ' (tahmini)' });
  const buf = fmtBuffer(r.bufferMs);
  if (buf) rows.push({ k: 'Tampon', v: buf, level: bufferLevel(r.bufferMs, !st || st.live !== false) });
  if (Number.isFinite(r.dropped) && r.dropped >= 0) {
    const total = (r.rendered || 0) + r.dropped;
    rows.push({ k: 'Düşen kare', v: r.dropped + (total > 0 ? ` (%${((r.dropped / total) * 100).toFixed(1).replace('.', ',')})` : ''), level: r.dropped > 30 ? 'low' : '' });
  }
  if (r.decoder) rows.push({ k: 'Çözücü', v: `${r.decoder} · ${isSoftwareDecoder(r.decoder) ? 'yazılım' : 'donanım'}` });
  if (r.compat) rows.push({ k: 'Mod', v: 'Uyumlu (geniş TS ayrıştırma, yazılım çözücü öncelikli)' });
  // Olay kaydı: her adres denemesi, hata (HTTP kodu, çözücü, neden), yeniden bağlanma — sorun olunca neden buradan okunur
  const log = (st && st.log) || [];
  const t0 = log.length ? log[0].t : 0;
  log.slice(-7).forEach((e, i) => rows.push({ k: i === 0 ? 'Olaylar' : '', v: `+${fmtSec(e.t - t0)} · ${e.text}` }));
  return rows;
}
