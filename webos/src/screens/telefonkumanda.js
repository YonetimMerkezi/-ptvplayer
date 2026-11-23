// Telefon kumandası: ekranda QR kod ve 4 haneli kod görünür; telefonda açılan sayfa kumanda, yazı ve "TV'de oynat" sunar.
// Ekran açılınca kumanda açılır ve (kapatılana dek) uygulama her açıldığında kendiliğinden başlar.
import { ctx, ustCubuk } from '../ctx.js';
import { varlik } from '../luna.js';
import { el, esc } from '../ui.js';
import { telefon } from '../telefon.js';
import { qrSvg } from '../../../www/js/qr.js';
import * as K from '../log.js';

export function telefonKumandaScreen() {
  const kok = el('div', 'screen transfer');
  kok.innerHTML =
    ustCubuk('Telefon kumandası') +
    '<div class="tr-in"><div class="tr-qr" id="tk-qr"></div><div class="tr-tx">' +
    '<ol class="tr-ad"><li>Telefon ve TV aynı modemde (Wi-Fi) olmalı.</li>' +
    '<li>Telefon kamerasıyla QR kodu okutun; açılan sayfa kumanda olur. Sayfayı ana ekrana ekleyebilirsiniz.</li>' +
    '<li>Tuşlara basın, arama yazın ya da bir yayın / YouTube bağlantısını TV’de oynatın.</li></ol>' +
    '<div class="tr-url" id="tk-url"></div><div class="tr-pin">TV kodu: <b id="tk-pin">····</b></div>' +
    '<div class="f-msg" id="f-msg">Hazırlanıyor…</div></div></div>' +
    '<div class="hint">OK: kapat / aç · Geri</div>';
  const $ = (s) => kok.querySelector(s);
  const msg = (t, hata) => {
    const m = $('#f-msg');
    m.innerHTML = esc(t || '');
    m.className = 'f-msg' + (hata ? ' err' : '');
  };

  const goster = () => {
    const b = telefon.bilgi();
    if (!ctx.store.setting('telefonKumanda', false)) {
      $('#tk-qr').innerHTML = '';
      $('#tk-url').textContent = '';
      $('#tk-pin').textContent = '····';
      return msg('Telefon kumandası kapalı. Açmak için OK’a basın.');
    }
    if (!b) return msg(telefon.hata() ? 'Başlatılamadı: ' + telefon.hata() : 'Hazırlanıyor…', !!telefon.hata());
    if (!b.ip) return msg('TV’nin ağ adresi bulunamadı; ağ bağlantısını kontrol edin', true);
    $('#tk-qr').innerHTML = qrSvg(b.adres, { margin: 2 });
    $('#tk-url').textContent = b.ip + ':' + b.port;
    $('#tk-pin').textContent = b.pin;
    if (telefon.hata()) return msg('Bağlantı sorunu: ' + telefon.hata() + ' — yeniden deneniyor', true);
    msg(telefon.telefon() ? 'Telefon bağlı ✓' : 'Telefondan bekleniyor…');
  };

  async function ac() {
    if (!varlik()) return msg('Bu özellik yalnızca TV’de çalışır.', true);
    ctx.store.setSetting('telefonKumanda', true);
    msg('Hazırlanıyor…');
    try {
      await telefon.baslat({ sifirla: true });
      K.bilgi('Telefon kumandası açıldı: ' + (telefon.bilgi() || {}).adres);
    } catch (e) {
      K.hata(e);
    }
    goster();
  }
  function kapat() {
    ctx.store.setSetting('telefonKumanda', false);
    telefon.durdur();
    goster();
  }

  let birak = null;
  return {
    el: kok,
    name: 'telefonkumanda',
    onShow() {
      if (!birak) birak = telefon.abone(goster);
      if (ctx.store.setting('telefonKumanda', false) && telefon.bilgi()) goster();
      else ac();
    },
    onKey(a) {
      if (a === 'ok') {
        if (ctx.store.setting('telefonKumanda', false)) kapat();
        else ac();
        return true;
      }
      return false;
    },
    destroy() {
      if (birak) birak();
      birak = null;
    },
  };
}
