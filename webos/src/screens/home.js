// Ana sayfa (Android düzeni): üstte 3 büyük kart, altında küçük butonlar, en altta yatay kayan "Vizyondakiler" afişleri.
// Odak üç satırda gezer: ▲▼ satır değiştirir, ◀▶ satırın içinde gider. Afişler yüklenirken de tüm satırlara geçilebilir.
import { ctx, open, ikon, ustCubuk } from '../ctx.js';
import { el, esc, enYakin } from '../ui.js';
import { eylemi } from '../kumanda.js';
import { vizyonYukle } from '../vizyon.js';
import * as K from '../log.js';
import { t } from '../../../www/js/i18n.js';

// id'ler Ayarlar › Kumanda tuşları'ndaki eylem adlarıyla aynıdır
export const KAROLAR = [
  { id: 'live', ad: 'Canlı TV', kisa: 'Canlı TV', ic: ikon.tv, ekran: ['browse', { kind: 'live' }] },
  { id: 'movie', ad: 'Filmler', kisa: 'Filmler', ic: ikon.film, ekran: ['browse', { kind: 'movie' }] },
  { id: 'series', ad: 'Diziler', kisa: 'Diziler', ic: ikon.dizi, ekran: ['browse', { kind: 'series' }] },
  { id: 'guide', ad: 'TV Rehberi', kisa: 'Rehber', ic: ikon.rehber, ekran: ['browse', { kind: 'guide' }] },
  { id: 'spor', ad: 'Spor', kisa: 'Spor', ic: ikon.spor, ekran: ['spor'] },
  { id: 'favs', ad: 'Favoriler', kisa: 'Favoriler', ic: ikon.yildiz, ekran: ['browse', { kind: 'favs' }] },
  { id: 'recents', ad: 'Son izlenenler', kisa: 'Geçmiş', ic: ikon.gecmis, ekran: ['browse', { kind: 'recents' }] },
  { id: 'search', ad: 'Ara', kisa: 'Ara', ic: ikon.ara, ekran: ['search'] },
  { id: 'settings', ad: 'Ayarlar', kisa: 'Ayarlar', ic: ikon.ayar, ekran: ['settings'] },
];
const BUYUK = ['live', 'movie', 'series'];
const KUCUK = ['guide', 'spor', 'favs', 'recents', 'search', 'settings'];
const bul = (id) => KAROLAR.filter((k) => k.id === id)[0];
const renkSinifi = (i) => 'c' + ((i % 8) + 1); // çok renkli temalarda karonun rengi
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export const tarihYaz = (f) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((f && f.date) || '');
  if (m) return Number(m[3]) + ' ' + t(AYLAR[Number(m[2]) - 1]) + ' ' + m[1];
  return f && f.year ? String(f.year) : '';
};
const bas = (ad) => String(ad || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');
// Satır sayısı farklı iki satır arasında geçerken yatay konumu korur (3 kart ↔ 6 buton)
export const yakinSutun = (kimden, sayi, nereye) => Math.max(0, Math.min(nereye - 1, Math.floor(((kimden + 0.5) * nereye) / Math.max(1, sayi))));

export function homeScreen() {
  const kok = el('div', 'screen home');
  const src = ctx.store.active();
  kok.innerHTML =
    ustCubuk('Iptv Player Pro', src ? esc(src.name) : '', true, false, true) +
    '<div class="hm">' +
    '<div class="hm-c">' +
    BUYUK.map((id, i) => {
      const k = bul(id);
      return '<div class="tile hc ' + renkSinifi(i) + '" data-r="0" data-i="' + i + '"><i class="ic">' + k.ic + '</i><span>' + k.ad + '</span></div>';
    }).join('') +
    '</div><div class="hm-b">' +
    KUCUK.map((id, i) => {
      const k = bul(id);
      return '<div class="tile hb ' + renkSinifi(i + 3) + '" data-r="1" data-i="' + i + '"><i class="ic">' + k.ic + '</i><span>' + k.kisa + '</span></div>';
    }).join('') +
    '</div><div class="hm-t"><b>Vizyondakiler</b><em id="hm-d"></em></div>' +
    '<div class="hm-p"><div class="hm-pi" id="hm-pi"></div><div class="hm-m" id="hm-m">Vizyondakiler yükleniyor…</div></div>' +
    '</div><div class="hint">Gezin: ▲▼◀▶ · Seç: OK · Çıkış: Geri ×2</div>';

  const kartlar = kok.querySelectorAll('.hc');
  const butonlar = kok.querySelectorAll('.hb');
  const kumEl = kok.querySelector('.top-kum');
  const serit = kok.querySelector('#hm-pi');
  const ileti = kok.querySelector('#hm-m');
  const tarihEl = kok.querySelector('#hm-d');
  let filmler = [];
  let afisler = [];
  let yukleniyor = false;
  let olu = false;
  let r = 0; // odaktaki satır: 0 kartlar, 1 butonlar, 2 afişler
  let ustte = false; // odak üst çubuktaki küçük Telefon kumandası düğmesinde (▲ ile kartlardan çıkılır)
  const c = [0, 0, 0]; // her satırda son odak sütunu

  const adet = (satir) => (satir === 0 ? BUYUK.length : satir === 1 ? KUCUK.length : filmler.length);

  // Görünür afişlerin (ve yakınındakilerin) resmi yüklenir: 40 resmi birden istemek eski TV'yi yorar
  const resimleriYukle = () => {
    for (let i = Math.max(0, c[2] - 3); i < Math.min(afisler.length, c[2] + 10); i++) {
      const a = afisler[i];
      if (a.istendi || !a.url) continue;
      a.istendi = true;
      const im = a.dugum.querySelector('.pr-im');
      im.onload = () => {
        a.dugum.className = a.dugum.className.replace(/\bok\b/, '') + ' ok';
      };
      im.onerror = () => {
        a.istendi = false;
        a.url = ''; // bu afiş yüklenemedi: baş harfleri kalır
      };
      im.src = a.url;
    }
  };

  const kaydir = () => {
    const a = afisler[c[2]];
    if (!a || a.dugum.offsetLeft === undefined) return;
    const goruntu = serit.parentNode.clientWidth || 0;
    const toplam = serit.scrollWidth || 0;
    // seçili afişten önce bir afiş görünsün; son afişlerde şerit sonda dursun
    const hedef = Math.max(0, Math.min(a.dugum.offsetLeft - a.dugum.offsetWidth - 16, Math.max(0, toplam - goruntu)));
    const t = 'translateX(' + -Math.round(hedef) + 'px)';
    serit.style.webkitTransform = t;
    serit.style.transform = t;
  };

  const isaretle = () => {
    kumEl.className = 'top-kum' + (ustte ? ' on' : '');
    for (let i = 0; i < kartlar.length; i++) kartlar[i].className = 'tile hc ' + renkSinifi(i) + (!ustte && r === 0 && c[0] === i ? ' on' : '');
    for (let i = 0; i < butonlar.length; i++) butonlar[i].className = 'tile hb ' + renkSinifi(i + 3) + (!ustte && r === 1 && c[1] === i ? ' on' : '');
    for (let i = 0; i < afisler.length; i++) {
      const a = afisler[i];
      a.dugum.className = 'pr' + (a.dugum.className.indexOf(' ok') >= 0 ? ' ok' : '') + (!ustte && r === 2 && c[2] === i ? ' on' : '');
    }
    const f = !ustte && r === 2 ? filmler[c[2]] : null;
    tarihEl.textContent = f ? [tarihYaz(f)].filter(Boolean).join('') : '';
    if (afisler.length) {
      kaydir();
      resimleriYukle();
    }
  };

  const afisCiz = () => {
    serit.innerHTML = '';
    afisler = filmler.map((f, i) => {
      const d = el('div', 'pr');
      d.setAttribute('data-r', '2');
      d.setAttribute('data-i', String(i));
      d.innerHTML = '<div class="pr-ph">' + esc(bas(f.title)) + '</div><img class="pr-im" alt=""><div class="pr-g"><div class="pr-n">' + esc(f.title) + '</div></div>';
      serit.appendChild(d);
      return { dugum: d, url: /^https:\/\//.test(f.poster || '') ? f.poster : '', istendi: false };
    });
    if (c[2] >= afisler.length) c[2] = 0;
    // Afiş genişliği yükseklikten (2:3) türetilir; ölçülemezse CSS'teki varsayılan kalır
    const h = serit.clientHeight || 0;
    if (h > 0) for (let i = 0; i < afisler.length; i++) afisler[i].dugum.style.width = Math.round(h / 1.5) + 'px';
  };

  const yukle = () => {
    if (yukleniyor || olu || filmler.length) return;
    yukleniyor = true;
    ileti.style.display = '';
    ileti.textContent = 'Vizyondakiler yükleniyor…';
    const depo = { al: () => ctx.store.setting('vizyon.onbellek', null), yaz: (v) => ctx.store.setSetting('vizyon.onbellek', v) };
    vizyonYukle({ net: ctx.net, depo }).then(
      (s) => {
        yukleniyor = false;
        if (olu) return;
        filmler = s.films;
        ileti.style.display = 'none';
        afisCiz();
        isaretle();
        K.bilgi('Vizyondakiler: ' + filmler.length + ' film (' + s.kaynak + (s.eski ? ', eski' : '') + ')');
      },
      (e) => {
        yukleniyor = false;
        if (olu) return;
        K.uyar('Vizyondakiler alınamadı: ' + (e && e.message ? e.message : e));
        ileti.textContent = 'Vizyondakiler alınamadı (ana sayfaya dönünce yeniden denenir)';
      },
    );
  };

  const ac = (satir, i) => {
    if (satir === 2) {
      if (filmler[i]) open('vizyon', { film: filmler[i] });
      return;
    }
    const k = bul((satir === 0 ? BUYUK : KUCUK)[i]);
    if (k) open(k.ekran[0], k.ekran[1]);
  };

  kok.addEventListener('click', (e) => {
    if (enYakin(e.target, '.top-kum', kok)) {
      open('telefonkumanda');
      return;
    }
    const n = enYakin(e.target, '[data-r]', kok);
    if (!n) return;
    r = Number(n.getAttribute('data-r'));
    c[r] = Number(n.getAttribute('data-i'));
    isaretle();
    ac(r, c[r]);
  });

  return {
    el: kok,
    name: 'home',
    onShow() {
      isaretle();
      yukle();
    },
    destroy() {
      olu = true;
    },
    onKey(a) {
      if (ustte && (a === 'ok' || a === 'down' || a === 'up' || a === 'left' || a === 'right')) {
        if (a === 'ok') open('telefonkumanda');
        else if (a === 'down') {
          ustte = false;
          isaretle();
        }
        return true;
      }
      if (a === 'ok') {
        ac(r, c[r]);
        return true;
      }
      if (a === 'red' || a === 'green' || a === 'yellow' || a === 'blue') {
        // Renkli tuşlar: Ayarlar › Kumanda tuşları'nda atanan ekranı açar
        const k = bul(eylemi(ctx.store, 'ana', a));
        if (!k) return false;
        open(k.ekran[0], k.ekran[1]);
        return true;
      }
      if (a === 'left' || a === 'right') {
        const n = c[r] + (a === 'right' ? 1 : -1);
        if (n >= 0 && n < adet(r)) {
          c[r] = n;
          isaretle();
        }
        return true;
      }
      if (a === 'up' && r === 0) {
        ustte = true;
        isaretle();
        return true;
      }
      if (a === 'up' || a === 'down') {
        const hedef = r + (a === 'down' ? 1 : -1);
        if (hedef < 0 || hedef > 2 || !adet(hedef)) return true; // afişler henüz gelmediyse alta inilmez, odak yerinde kalır
        // Kartlar ↔ butonlar arasında yatay konum korunur; afişlere girerken/çıkarken satırın son odağı kullanılır
        if (hedef !== 2 && r !== 2) c[hedef] = yakinSutun(c[r], adet(r), adet(hedef));
        r = hedef;
        isaretle();
        return true;
      }
      return false;
    },
  };
}
