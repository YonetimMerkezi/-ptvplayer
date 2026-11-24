// Kaynak ekleme: Xtream (sunucu, kullanıcı, şifre) ya da M3U bağlantısı. Yazı girişi TV'nin ekran klavyesiyle ya da (TV'de ise)
// sağdaki panelin QR koduyla açılan telefon sayfasından, telefonun klavyesiyle yapılır; ilk kurulumda da böyledir.
import { ctx, resetTo, open, pop, ustCubuk, kaynakEkle, geriOdakla } from '../ctx.js';
import { el, esc, toast } from '../ui.js';
import { kaynakHazirla } from '../kaynak.js';
import { varlik } from '../luna.js';
import { telefon } from '../telefon.js';
import { qrSvg } from '../../../www/js/qr.js';
import * as K from '../log.js';

export function addSourceScreen(arg) {
  const ilk = !!(arg && arg.first);
  const kok = el('div', 'screen form');
  let tip = 'xtream';
  const alan = (id, etiket, ph, tur) => '<div class="f-row" data-f="' + id + '"><label>' + etiket + '</label><input id="f-' + id + '" type="' + (tur || 'text') + '" placeholder="' + ph + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></div>';
  kok.innerHTML =
    ustCubuk('Kaynak ekle') +
    '<div class="form-in">' +
    '<div class="seg"><div class="f-btn on" data-f="tx">Xtream</div><div class="f-btn" data-f="tm">M3U bağlantısı</div><div class="f-btn" data-f="phone">Telefondan aktar</div></div>' +
    alan('ad', 'Ad (isteğe bağlı)', 'Evim') +
    '<div class="grp gx">' + alan('server', 'Sunucu adresi', 'http://sunucu:port') + alan('user', 'Kullanıcı adı', '') + alan('pass', 'Şifre', '') + '</div>' +
    '<div class="grp gm" style="display:none">' + alan('url', 'M3U bağlantısı', 'http://…/liste.m3u') + '</div>' +
    '<div class="f-row"><div class="f-btn pri" data-f="go">Bağlan ve ekle</div>' + (ilk ? '' : '<div class="f-btn" data-f="cancel">Vazgeç</div>') + '</div>' +
    '<div class="f-msg" id="f-msg"></div></div>' +
    '<div class="tel-pn" id="tel-pn"></div>' +
    '<div class="hint">OK: yaz / seç · ▲▼: alan değiştir' + (ilk ? '' : ' · Geri: vazgeç') + ' · Telefondan da yazabilirsiniz (sağdaki kod)</div>';

  const $ = (id) => kok.querySelector(id);
  const msg = (t, hata) => {
    const m = $('#f-msg');
    m.textContent = t || '';
    m.className = 'f-msg' + (hata ? ' err' : '');
  };

  // Sağdaki telefon paneli: QR kod + 4 haneli kod. Telefon sayfası "Liste bilgilerini yaz" bölümü açık gelir (s=liste).
  // Kumanda ilk kez burada açılır (hiç karar verilmediyse); kullanıcı Ayarlar'dan kapattıysa panel yalnızca "aç" düğmesi gösterir.
  const panel = $('#tel-pn');
  const kapaliAd = () => ctx.store.setting('telefonKumanda', null) === false;
  const panelCiz = () => {
    if (!varlik()) {
      panel.innerHTML = '<div class="tp-t">Telefondan yazma</div><div class="tp-d">Yalnızca TV’de çalışır.</div>';
      return;
    }
    const b = telefon.bilgi();
    let h = '<div class="tp-t">Telefondan yazın</div>';
    if (kapaliAd()) {
      h += '<div class="tp-d">Telefon kumandası kapalı.</div><div class="f-btn" data-f="tel">Telefon kumandasını aç</div>';
    } else if (b && b.ip) {
      h += '<div class="tp-qr">' + qrSvg(b.adres + '&s=liste', { margin: 2 }) + '</div>' +
        '<div class="tp-d">Telefon kamerasıyla okutun, açılan sayfada bilgileri yazın.</div>' +
        '<div class="tp-pin">Kod <b>' + esc(b.pin) + '</b></div>' +
        '<div class="tp-d' + (telefon.hata() ? ' err' : '') + '">' + (telefon.hata() ? 'Bağlantı sorunu: ' + esc(telefon.hata()) : telefon.telefon() ? 'Telefon bağlı ✓' : 'Telefondan bekleniyor…') + '</div>';
    } else if (b) {
      h += '<div class="tp-d err">TV’nin ağ adresi bulunamadı; ağ bağlantısını kontrol edin.</div>';
    } else {
      h += '<div class="tp-d' + (telefon.hata() ? ' err' : '') + '">' + (telefon.hata() ? 'Başlatılamadı: ' + esc(telefon.hata()) : 'Hazırlanıyor…') + '</div>';
    }
    panel.innerHTML = h;
  };
  async function telefonAc() {
    if (!varlik()) return panelCiz();
    ctx.store.setSetting('telefonKumanda', true);
    panelCiz();
    if (!telefon.bilgi()) {
      try {
        await telefon.baslat({ sifirla: true });
      } catch (e) {
        K.hata(e);
      }
    }
    panelCiz();
  }
  let birak = null;

  const odaklar = () => {
    const out = [];
    const adaylar = kok.querySelectorAll('[data-f]');
    for (let i = 0; i < adaylar.length; i++) {
      const e = adaylar[i];
      if (e.offsetParent !== null || e.className.indexOf('f-btn') >= 0) {
        // görünür olanlar (gizli grup içindekiler hariç)
        let p = e;
        let gizli = false;
        while (p && p !== kok) {
          if (p.style && p.style.display === 'none') gizli = true;
          p = p.parentNode;
        }
        if (!gizli) out.push(e);
      }
    }
    return out;
  };
  let sec = 0;
  const isaretle = () => {
    const l = odaklar();
    sec = Math.max(0, Math.min(l.length - 1, sec));
    const hepsi = kok.querySelectorAll('[data-f]');
    for (let i = 0; i < hepsi.length; i++) hepsi[i].className = hepsi[i].className.replace(/\s*\bon2\b/g, '');
    if (l[sec]) l[sec].className += ' on2';
  };
  const tipDegis = (t) => {
    tip = t;
    $('.gx').style.display = t === 'xtream' ? '' : 'none';
    $('.gm').style.display = t === 'm3u' ? '' : 'none';
    $('[data-f=tx]').className = 'f-btn' + (t === 'xtream' ? ' on' : '');
    $('[data-f=tm]').className = 'f-btn' + (t === 'm3u' ? ' on' : '');
    isaretle();
  };

  let mesgul = false;
  async function baglan() {
    if (mesgul) return;
    const h = kaynakHazirla({ tip, ad: $('#f-ad').value, server: $('#f-server').value, user: $('#f-user').value, pass: $('#f-pass').value, url: $('#f-url').value });
    if (h.hata) return msg(h.hata, true);
    mesgul = true;
    msg('Bağlanılıyor…');
    try {
      await kaynakEkle(h.src);
      toast('Kaynak eklendi');
      resetTo('home');
    } catch (e) {
      K.hata(e);
      msg('Bağlanılamadı: ' + esc(e && e.message ? e.message : e) + '. Adresi kontrol edin; sorun sürerse Ayarlar › Hata kaydına bakın.', true);
    } finally {
      mesgul = false;
    }
  }

  const ac = (e) => {
    const f = e.getAttribute('data-f');
    if (f === 'tx') return tipDegis('xtream');
    if (f === 'tm') return tipDegis('m3u');
    if (f === 'phone') return open('transfer');
    if (f === 'tel') return telefonAc();
    if (f === 'go') return baglan();
    if (f === 'cancel') return pop();
    const inp = e.querySelector('input');
    if (inp) inp.focus();
  };

  kok.addEventListener('click', (ev) => {
    let n = ev.target;
    while (n && n !== kok && !(n.getAttribute && n.getAttribute('data-f'))) n = n.parentNode;
    if (!n || n === kok) return;
    const l = odaklar();
    sec = Math.max(0, l.indexOf(n));
    isaretle();
    ac(n);
  });

  return {
    el: kok,
    name: 'addsource',
    onShow() {
      isaretle();
      if (!birak) birak = telefon.abone(panelCiz);
      panelCiz();
      if (varlik() && !kapaliAd()) telefonAc(); // ilk kurulumda ve kullanıcı kapatmadıkça kumanda burada açılır
    },
    // Telefondan gelen form (service.js /kaynak): alanlar doldurulur; ekle ise bağlanılır, değilse "Bağlan ve ekle"ye gelinir
    kaynakDoldur(k) {
      tipDegis(k.tip === 'm3u' ? 'm3u' : 'xtream');
      $('#f-ad').value = k.ad || '';
      if (tip === 'xtream') {
        $('#f-server').value = k.server || '';
        $('#f-user').value = k.user || '';
        $('#f-pass').value = k.pass || '';
      } else $('#f-url').value = k.url || '';
      const inp = kok.querySelector('input:focus');
      if (inp) inp.blur();
      if (k.ekle) {
        msg('Telefondan alındı — bağlanılıyor…');
        return baglan();
      }
      const l = odaklar();
      for (let i = 0; i < l.length; i++) if (l[i].getAttribute('data-f') === 'go') sec = i;
      isaretle();
      msg('Telefondan yazıldı. Kontrol edip “Bağlan ve ekle”ye basın.');
    },
    destroy() {
      if (birak) birak();
      birak = null;
    },
    onKey(a) {
      const l = odaklar();
      if (a === 'down') sec = Math.min(l.length - 1, sec + 1);
      else if (a === 'up') {
        if (sec === 0) return false; // en üstte ▲: Geri düğmesine çıkılır
        sec = Math.max(0, sec - 1);
      }
      else if (a === 'left' || a === 'right') {
        const f = l[sec] && l[sec].getAttribute('data-f');
        if (f === 'tx' || f === 'tm' || f === 'phone') {
          // üstteki üç düğme arasında gezinir; Xtream / M3U'ya gelince tür de değişir
          const j = sec + (a === 'right' ? 1 : -1);
          const g = l[j] && l[j].getAttribute('data-f');
          if (g === 'tx' || g === 'tm' || g === 'phone') {
            sec = j;
            if (g === 'tx') tipDegis('xtream');
            else if (g === 'tm') tipDegis('m3u');
          }
        } else if (f === 'go' || f === 'cancel') {
          const j = l.indexOf(l[sec]) + (a === 'right' ? 1 : -1);
          if (l[j] && /^(go|cancel)$/.test(l[j].getAttribute('data-f'))) sec = j;
        }
      } else if (a === 'ok') {
        if (l[sec]) ac(l[sec]);
        return true;
      } else return false;
      isaretle();
      return true;
    },
    // Yazı alanı odaktayken: Enter sonraki alana geçer, yukarı/aşağı alandan çıkar
    onInputKey(a, e, inp) {
      if (a === 'ok' || a === 'down' || a === 'up' || a === 'back') {
        inp.blur();
        if (a === 'down' || a === 'ok') this.onKey('down');
        if (a === 'up' && !this.onKey('up')) geriOdakla(true);
        return true;
      }
      return false;
    },
  };
}
