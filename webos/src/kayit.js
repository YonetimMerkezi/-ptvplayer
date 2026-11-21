// Canlı yayın kaydı (deneme) istemcisi: TV servisindeki kayitBaslat / kayitDurum / kayitDurdur komutları,
// kaydın oynatma adresi ve durum metinleri. Yayını TV içi servis diske (USB bellek) MPEG-TS olarak yazar.
import { luna, SERVIS, varlik } from './luna.js';
import { sure } from './ui.js';

async function servis(komut, par, ms) {
  const r = await luna(SERVIS + komut, par || {}, ms || 20000);
  if (!r || r.returnValue === false) throw new Error((r && r.errorText) || 'Servis hatası');
  return r;
}

// Ekranların kullandığı işlemler (testte değiştirilebilir)
export const api = {
  hazir: () => varlik(),
  baslat: (url, ad, sureSn) => servis('kayitBaslat', { url, ad, sureSn }, 20000),
  durum: (id) => servis('kayitDurum', { id }, 8000),
  durdur: (id) => servis('kayitDurdur', { id }, 8000),
  alan: () => servis('kayitAlan', {}, 12000),
  medyaBaslat: () => servis('medyaBaslat', {}, 10000),
  medyaSor: () => servis('medyaSor', {}, 8000),
};

// Deneme kayıt süreleri: [saniye, ad]
export const SURELER = [[30, '30 sn'], [120, '2 dk'], [600, '10 dk']];
export const sureAdi = (sn) => (SURELER.filter((x) => x[0] === sn)[0] || SURELER[0])[1];
export const sonrakiSure = (sn, d) => {
  const i = SURELER.map((x) => x[0]).indexOf(sn);
  return SURELER[(Math.max(0, i) + d + SURELER.length) % SURELER.length][0];
};

export function boyutYaz(b) {
  if (!(b > 0)) return '0 MB';
  if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + ' KB';
  if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
  return (b / (1024 * 1024 * 1024)).toFixed(2).replace('.', ',') + ' GB';
}

// Ortalama hız (Mbit/sn)
export const hizYaz = (bayt, ms) => (ms > 1500 && bayt > 0 ? ((bayt * 8) / 1e6 / (ms / 1000)).toFixed(1).replace('.', ',') + ' Mbps' : '');

// Disk özeti: "Dahili bellek: 2,1 GB boş (≈ 35 dk) · USB 2 (sda1): yazılamıyor (EACCES)". Süre tahmini 8 Mbps'lik yayına göredir.
export const AKIS_BAYT_SN = 1000000; // 8 Mbps ≈ 1 MB/sn
export function alanMetni(diskler) {
  const l = Array.isArray(diskler) ? diskler : [];
  const p = [];
  for (let i = 0; i < l.length; i++) {
    const d = l[i];
    if (!d || !d.ad) continue;
    if (!d.yazilabilir) p.push(d.ad + ': yazılamıyor (' + (d.hata || '?') + ')');
    else if (d.bos > 0) p.push(d.ad + ': ' + boyutYaz(d.bos) + ' boş (≈ ' + Math.floor(d.bos / AKIS_BAYT_SN / 60) + ' dk)');
    else p.push(d.ad + ': yazılabilir');
  }
  return p.join(' · ');
}

export const calisiyor = (d) => !!d && (d.durum === 'yaziyor' || d.durum === 'baglaniyor');
export const bitti = (d) => !!d && (d.durum === 'bitti' || d.durum === 'hata');

export const dosyaAdi = (yol) => String(yol || '').slice(String(yol || '').lastIndexOf('/') + 1);

// Panelin alt notundaki durum metni
export function durumMetni(d, sureSn) {
  if (!d) return '';
  const hiz = hizYaz(d.bayt, d.sureMs);
  const parcalar = [];
  if (d.durum === 'baglaniyor') return 'Yayına bağlanılıyor…';
  if (d.durum === 'yaziyor') parcalar.push('Yazılıyor · ' + sure(d.sureMs) + (sureSn ? ' / ' + sure(sureSn * 1000) : ''));
  else if (d.durum === 'bitti') parcalar.push('Bitti' + (d.mesaj ? ' (' + d.mesaj + ')' : '') + ' · ' + sure(d.sureMs));
  else return 'Kayıt başarısız: ' + (d.mesaj || 'bilinmeyen neden');
  parcalar.push(boyutYaz(d.bayt));
  if (hiz) parcalar.push(hiz);
  if (d.disk) parcalar.push(d.disk);
  if (d.durum === 'bitti' && d.dosya) parcalar.push(dosyaAdi(d.dosya));
  if (d.mesaj && d.durum === 'yaziyor') parcalar.push(d.mesaj);
  return parcalar.join(' · ');
}

// Kayıt dosyası → oynatıcı öğesi (medya sunucusu bilgisi b: { port, jeton })
export const kayitOgesi = (d, ad, b) => ({
  id: 'k:' + d.dosya,
  kind: 'local',
  mkind: 'video',
  name: 'Kayıt · ' + ad,
  path: d.dosya,
  url: 'http://127.0.0.1:' + b.port + '/' + b.jeton + '/' + encodeURIComponent(d.dosya),
});

// Yerel medya sunucusunu oynatma sürerken canlı tutar (20 sn sorgusuzlukta kendiliğinden kapanır); dönen işlev durdurur
export function medyaCanliTut(aralikMs) {
  const t = setInterval(() => {
    Promise.resolve(api.medyaSor()).catch(() => {});
  }, aralikMs || 5000);
  return () => clearInterval(t);
}
