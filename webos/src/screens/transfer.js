// Telefondan kaynak aktarma: TV servisinde küçük bir alıcı açılır; ekranda QR kod ve 4 haneli kod görünür.
// Telefonda sayfa açılıp liste yapıştırılınca burada doğrulanır ve eklenir; sonuç telefona da iletilir.
// Ekran kapanınca (ya da yoklama kesilince) alıcı kendiliğinden durur. Yazı girişi gerekmez.
import { resetTo, ustCubuk, kaynakEkle } from '../ctx.js';
import { luna, varlik, SERVIS } from '../luna.js';
import { el, esc, toast } from '../ui.js';
import { kaynakHazirla } from '../kaynak.js';
import { qrSvg } from '../../../www/js/qr.js';
import * as K from '../log.js';

const SORU_MS = 1200;

export function transferScreen() {
  const kok = el('div', 'screen transfer');
  kok.innerHTML =
    ustCubuk('Telefondan aktar') +
    '<div class="tr-in"><div class="tr-qr" id="tr-qr"></div><div class="tr-tx">' +
    '<ol class="tr-ad"><li>Telefon ve TV aynı modemde (Wi-Fi) olmalı.</li>' +
    '<li>Telefon kamerasıyla QR kodu okutun ya da tarayıcıya aşağıdaki adresi yazın.</li>' +
    '<li>Açılan sayfada listenizi yapıştırıp “TV’ye gönder”e dokunun.</li></ol>' +
    '<div class="tr-url" id="tr-url"></div><div class="tr-pin">TV kodu: <b id="tr-pin">····</b></div>' +
    '<div class="f-msg" id="f-msg">Hazırlanıyor…</div></div></div>' +
    '<div class="hint">Geri: vazgeç · OK: yeniden başlat</div>';
  const $ = (s) => kok.querySelector(s);
  const msg = (t, hata) => {
    const m = $('#f-msg');
    m.innerHTML = esc(t || '');
    m.className = 'f-msg' + (hata ? ' err' : '');
  };

  let kapali = false; // ekran kapandı
  let calisiyor = false; // alıcı açık ve yoklanıyor
  let zaman = 0;
  const sira = [];
  let isleniyor = false;

  const sonuc = (id, durum, mesaj) => luna(SERVIS + 'aliciSonuc', { id, durum, mesaj }, 8000).catch((e) => K.hata(e));

  async function isle(g) {
    const h = kaynakHazirla(g);
    if (h.hata) {
      msg(h.hata, true);
      return sonuc(g.id, 'hata', h.hata);
    }
    msg('Alındı: “' + h.src.name + '” — bağlanılıyor…');
    try {
      const k = await kaynakEkle(h.src);
      await sonuc(g.id, 'tamam', '“' + k.name + '” TV’ye eklendi.');
      msg('Eklendi: “' + k.name + '”');
      toast('Kaynak eklendi');
      calisiyor = false;
      zaman = setTimeout(() => resetTo('home'), 1500); // telefona yanıt gitsin, TV'de de görülsün
    } catch (e) {
      K.hata(e);
      const t = 'Bağlanılamadı: ' + (e && e.message ? e.message : e) + '. Adresi kontrol edin.';
      msg(t, true);
      await sonuc(g.id, 'hata', t);
    }
  }

  // Bağlantı denemesi uzun sürebilir; bu sırada yoklama sürmeli (yoksa alıcı "ekran kapandı" sanıp durur)
  async function bosalt() {
    if (isleniyor) return;
    isleniyor = true;
    try {
      while (sira.length && !kapali) await isle(sira.shift());
    } finally {
      isleniyor = false;
    }
  }

  async function sor() {
    if (kapali || !calisiyor) return;
    try {
      const r = await luna(SERVIS + 'aliciSor', {}, 8000);
      if (!r.returnValue) throw new Error(r.errorText || 'Alıcı kapandı');
      if (r.kalanMs <= 0) throw new Error('Süre doldu');
      for (let i = 0; i < (r.alinan || []).length; i++) sira.push(r.alinan[i]);
      if (sira.length) bosalt();
    } catch (e) {
      calisiyor = false;
      msg('Alıcı durdu (' + (e && e.message ? e.message : e) + '). Yeniden başlatmak için OK’a basın.', true);
      return;
    }
    if (calisiyor && !kapali) zaman = setTimeout(sor, SORU_MS);
  }

  async function basla() {
    if (!varlik()) return msg('Bu özellik yalnızca TV’de çalışır.', true);
    msg('Hazırlanıyor…');
    try {
      const r = await luna(SERVIS + 'aliciBaslat', {}, 10000);
      if (!r.returnValue) throw new Error(r.errorText || 'Alıcı başlatılamadı');
      const ip = (r.adresler || [])[0];
      if (!ip) throw new Error('TV’nin ağ adresi bulunamadı; ağ bağlantısını kontrol edin');
      const adres = 'http://' + ip + ':' + r.port;
      $('#tr-qr').innerHTML = qrSvg(adres + '/?k=' + r.pin, { margin: 2 });
      $('#tr-url').textContent = ip + ':' + r.port;
      $('#tr-pin').textContent = r.pin;
      K.bilgi('Aktarma alıcısı açıldı: ' + adres);
      msg('Telefondan bekleniyor…');
      clearTimeout(zaman);
      calisiyor = true;
      sor();
    } catch (e) {
      K.hata(e);
      msg('Başlatılamadı: ' + (e && e.message ? e.message : e), true);
    }
  }

  const dur = () => {
    kapali = true;
    calisiyor = false;
    clearTimeout(zaman);
    if (varlik()) luna(SERVIS + 'aliciDurdur', {}, 5000).catch(() => {});
  };

  return {
    el: kok,
    name: 'transfer',
    onShow() {
      if (!calisiyor && !kapali) basla();
    },
    onKey(a) {
      if (a === 'ok') {
        if (!calisiyor && !isleniyor) basla();
        return true;
      }
      return false;
    },
    destroy: dur,
  };
}
