// Yayın kaydı yardımcıları: süre seçenekleri, boyut/süre/tarih biçimleri, kayıt listesi satırları.
import { fmtDuration } from './util.js';

export const REC_LIMITS = [
  [0, 'Ben durdurana kadar'],
  [30, '30 dakika'],
  [60, '1 saat'],
  [120, '2 saat'],
  [240, '4 saat'],
];

export function fmtBytes(n) {
  const b = Number(n);
  if (!Number.isFinite(b) || b < 0) return '';
  if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + ' KB';
  if (b < 1024 * 1024 * 1024) return Math.round(b / (1024 * 1024)) + ' MB';
  return (b / (1024 * 1024 * 1024)).toFixed(1).replace('.', ',') + ' GB';
}

// "12:34" ya da "1:02:03"
export const fmtElapsed = (ms) => fmtDuration(Math.max(0, ms));

const pad = (n) => String(n).padStart(2, '0');
export function fmtRecDate(ts) {
  const d = new Date(ts);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Eklentiden gelen kayıt → oynatıcıya verilecek öğe (kind: 'recording').
export function recItem(r) {
  return { id: 'rec:' + r.id, kind: 'recording', name: r.name || 'Kayıt', logo: '', url: r.url, recId: r.id };
}

// Kayıt bitince verilecek ileti.
export function recEndMessage(e) {
  if (e.reason === 'disk') return 'Depolama doldu, kayıt durduruldu ve kaydedildi';
  if (e.reason === 'error') return 'Kayıt yazılamadı, durduruldu (o ana kadarki bölüm kaydedildi)';
  if (e.reason === 'limit') return 'Kayıt süresi doldu, kaydedildi';
  return 'Kayıt kaydedildi';
}

// Kayıtlar listesindeki satırın alt yazısı.
export function recSub(r) {
  const parts = [fmtRecDate(r.startedAt)];
  if (r.active) parts.push('● kaydediliyor');
  else if (r.durationMs > 0) parts.push(fmtDuration(r.durationMs));
  parts.push(fmtBytes(r.size));
  return parts.filter(Boolean).join(' · ');
}
