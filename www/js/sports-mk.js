// Mackolik canlı skor listesi (yedek kaynak): LiveScore'a ulaşılamadığında Türkiye ligleri (Süper Lig, 1/2/3. Lig, kupalar) buradan gelir.
// Adres: vd.mackolik.com/livedata?date=GG/AA/YYYY. Yanıt: { m: [ satır, … ] }. Satır: 0 kimlik, 2 ev, 4 deplasman, 5 durum kodu, 6 durum yazısı,
// 7 DEVRE ARASI skoru ("0-1" yazısı; maç skoru DEĞİL), 12/13 ev/deplasman güncel gol sayısı (sayı), 29/30 aynı skor (yazı), 31/32 devre arası golleri,
// 16 saat, 35 tarih, 36 yarışma [ülkeNo, ülke, ligNo, lig, aşamaNo, sezon, …].
// Saatler Türkiye saatidir. Maç olayı/kadro bu listede yoktur: yalnız skor ve durum.
import { teamLabel, norm, withTimeout } from './sports.js';
import { isWomenTeam } from './sports-ls.js';

export const MK_BASE = 'https://vd.mackolik.com/livedata';
const TR_OFFSET_MS = 3 * 3600e3; // Mackolik saatleri UTC+3

const pad = (n) => String(n).padStart(2, '0');
export function mkUrl(dayMs, base = MK_BASE) {
  const d = new Date(dayMs);
  return `${base}?date=${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// "18/11/2026" + "13:00" (Türkiye saati) → ms. Geçersizse null.
export function parseMkTime(date, time) {
  const a = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(date || '').trim());
  const b = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
  if (!a || !b) return null;
  const t = Date.UTC(Number(a[3]), Number(a[2]) - 1, Number(a[1]), Number(b[1]), Number(b[2])) - TR_OFFSET_MS;
  return Number.isFinite(t) ? t : null;
}

const goals = (v) => (v == null || !/^\d{1,3}$/.test(String(v).trim()) ? null : Number(v));
const scoreOf = (h, a) => {
  const x = goals(h);
  const y = goals(a);
  return x == null || y == null ? null : [x, y];
};

// Durum: kod (0 başlamadı, 4 maç sonu, 8 penaltılar, 9 ertelendi; 1-3 canlı) ve yazı ("MS", "İY", "67", "Ert."). Önce yazıya bakılır; bilinmeyen kod saate ve skora göre yorumlanır.
export function mkStatus(code, raw, { t = 0, now = Date.now(), scored = false } = {}) {
  const x = String(raw == null ? '' : raw).trim();
  const n = norm(x);
  const minute = x.replace(/['’′´]/g, '').trim();
  if (/^ert/.test(n)) return { state: 'pre', text: 'Ertelendi', off: true };
  if (n === 'ms') return { state: 'post', text: 'MS' };
  if (n === 'pen') return { state: 'post', text: 'MS · Pen.' };
  if (n === 'iy') return { state: 'in', text: 'Devre arası' };
  if (/^\d{1,3}(\s*\+\s*\d{1,2})?$/.test(minute)) return { state: 'in', text: `${minute.replace(/\s+/g, '')}'` };
  if (code === 4 || code === 8) return { state: 'post', text: 'MS' };
  if (code === 1 || code === 2 || code === 3) return { state: 'in', text: x || 'Canlı' };
  if (code === 0 || !x) return { state: scored && now - t > 150 * 60000 ? 'post' : 'pre', text: scored && now - t > 150 * 60000 ? 'MS' : '' };
  if (scored && now - t > 150 * 60000) return { state: 'post', text: x };
  return { state: now < t ? 'pre' : 'in', text: x };
}

// Kapsam: yalnız Türkiye'nin erkek profesyonel futbolu (Süper Lig, 1/2/3. Lig, kupalar). Basketbol, kadın, genç ve amatör ligler listeye girmez.
const TR_LEAGUE = /^(tff )?(super lig|[123] lig|turkiye kupasi|ziraat|super kupa)( |$)/;
const women = (s) => /(^| )(kadin|kadinlar|bayan|bayanlar|women|womens)( |$)/.test(s);
const orderOf = (n) => (/super lig/.test(n) ? 0 : /kupa/.test(n) ? 1 : /(^| )1 lig/.test(n) ? 2 : 3);
const prettyLeague = (s) => String(s || '').replace(/^(\d)\.\s*Lig\s*/i, '$1. Lig: ').replace(/:\s*$/, '').trim();

export function parseMackolik(json, { now = Date.now() } = {}) {
  const out = [];
  const rows = json && Array.isArray(json.m) ? json.m : [];
  const seen = new Set();
  for (const r of rows) {
    try {
      if (!Array.isArray(r) || r.length < 37 || !Array.isArray(r[36])) continue;
      const country = String(r[36][1] || '').trim();
      const league = String(r[36][3] || '').trim();
      const ln = norm(league);
      if (norm(country) !== 'turkiye' || !TR_LEAGUE.test(ln) || women(ln)) continue;
      const home = String(r[2] || '').trim();
      const away = String(r[4] || '').trim();
      if (!home || !away || /\(k\)\s*$/i.test(home) || /\(k\)\s*$/i.test(away) || isWomenTeam(home) || isWomenTeam(away)) continue;
      const t = parseMkTime(r[35], r[16]);
      if (t == null) continue;
      const id = `mk:${r[0]}`;
      if (seen.has(id)) continue;
      seen.add(id);
      // Güncel skor 12/13 (sayı), yoksa 29/30 (yazı). 7. alan devre arası skorudur; maç skoru diye okunmaz.
      const sc = scoreOf(r[12], r[13]) || scoreOf(r[29], r[30]);
      const status = mkStatus(Number(r[5]), r[6], { t, now, scored: !!sc && sc[0] + sc[1] > 0 });
      const played = status.state !== 'pre' && !status.off && !!sc;
      const side = (name, v) => ({ name, label: teamLabel(name), abbr: '', logo: '', score: played ? v : null, pen: null });
      out.push({
        id,
        lg: `mk:${ln.replace(/ /g, '-')}`,
        lgName: `Türkiye · ${prettyLeague(league)}`,
        grp: 'tr',
        ord: orderOf(ln),
        src: 'mk',
        t,
        state: status.state,
        text: status.text,
        off: !!status.off,
        home: side(home, sc ? sc[0] : null),
        away: side(away, sc ? sc[1] : null),
        venue: '',
        intl: [],
        round: '',
      });
    } catch {
      /* bozuk satır atlanır */
    }
  }
  return out;
}

// Bir günün listesini indirir. Döner: { matches, url }; olmazsa hata atar (hata.detail: neden).
export async function loadMackolikDay({ net, dayMs, now = Date.now(), base = MK_BASE, timeoutMs = 15000 } = {}) {
  const url = mkUrl(dayMs, base);
  try {
    const json = await withTimeout(net.json(url, { fast: true }), timeoutMs);
    if (!json || typeof json !== 'object') throw new Error('Boş yanıt');
    if (!Array.isArray(json.m)) throw new Error('Beklenmeyen yanıt biçimi');
    return { matches: parseMackolik(json, { now }), url };
  } catch (e) {
    const err = new Error('Mackolik verisi alınamadı.');
    err.detail = String((e && e.message) || e || 'hata').slice(0, 100);
    throw err;
  }
}
