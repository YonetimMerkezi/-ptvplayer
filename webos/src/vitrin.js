// Vitrin: Filmler/Diziler listesinde odaktaki yapımın geniş görseli, adı, puanı, özeti ve oyuncuları.
// Bekleme, tek istek ve hata sınırı Android ile ortak www/js/hero.js'te; burada yalnız çizim ve görsel yükleme var.
import { createHero, heroModel } from '../../www/js/hero.js';
import { esc } from './ui.js';
import { t } from '../../www/js/i18n.js';

const kes = (s, n) => {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;
};

// Görünüm modeli → vitrin metni (saf; sınanır)
export function vitrinMetni(m) {
  const parcalar = [];
  if (m.rating) parcalar.push('<b>★ ' + esc(m.rating) + '</b>');
  for (let i = 0; i < m.meta.length; i++) parcalar.push(esc(m.meta[i]));
  let h = '<div class="v-t">' + esc(m.title) + '</div>';
  if (parcalar.length) h += '<div class="v-m">' + parcalar.join('<i>·</i>') + '</div>';
  if (m.plot) h += '<div class="v-p">' + esc(kes(m.plot, 300)) + '</div>';
  const kisiler = [];
  if (m.cast) kisiler.push(t('Oyuncular') + ': ' + kes(m.cast, 90));
  if (m.director) kisiler.push(t('Yönetmen') + ': ' + kes(m.director, 40));
  if (kisiler.length) h += '<div class="v-c">' + esc(kisiler.join('  ·  ')) + '</div>';
  return h;
}

const bos = (a) => (a || []).filter(Boolean);

// Görseli arka planda dener (sınama için değiştirilebilir)
export function resimDene(url, tamam, hata) {
  const r = new Image();
  r.onload = () => tamam(url);
  r.onerror = () => hata();
  r.src = url;
}

const cssUrl = (u) => 'url("' + String(u).replace(/"/g, '%22') + '")';

// Katman: görsel adayları sırayla denenir, ilk yüklenen gösterilir (yeni istek eskisini geçersiz kılar)
export function createArkaPlan(katman, { resim = resimDene } = {}) {
  let no = 0;
  let anahtar = '';
  return {
    goster(adaylar) {
      const l = bos(adaylar);
      const k = l.join('|');
      if (k === anahtar) return; // aynı görsel: yeniden yükleme/titreme yok
      anahtar = k;
      const n = ++no;
      katman.className = katman.className.replace(/\s*\bon\b/g, '');
      const dene = (i) => {
        if (n !== no || i >= l.length) return;
        resim(
          l[i],
          () => {
            if (n !== no) return;
            katman.style.backgroundImage = cssUrl(l[i]);
            katman.className += ' on';
          },
          () => dene(i + 1),
        );
      };
      dene(0);
    },
    temizle() {
      no++;
      anahtar = '';
      katman.className = katman.className.replace(/\s*\bon\b/g, '');
    },
  };
}

// host: .vit (metin, küçük afiş, ipucu); zemin: ekranın tamamını kaplayan katman (geniş görsel + yumuşatan karartma).
// saglayici(): geçerli sağlayıcı. Dönen: { odak(it), temizle(), bilgi(it) }
export function createVitrin(host, { zemin, saglayici, resim = resimDene, ipucu = true, zamanlayici } = {}) {
  zemin.innerHTML = '<div class="v-bg"></div><div class="v-vg"></div>';
  host.innerHTML = '<div class="v-pst"></div><div class="v-tx"></div>' + (ipucu ? '<div class="v-h"><i></i>Kırmızı: ▶ Fragman</div>' : '');
  const metin = host.querySelector('.v-tx');
  const arka = createArkaPlan(zemin.querySelector('.v-bg'), { resim });
  const afis = createArkaPlan(host.querySelector('.v-pst'), { resim });
  const bilgi = {};

  const paint = (it, info) => {
    const m = heroModel(it, info);
    metin.innerHTML = vitrinMetni(m);
    if (m.wide) {
      arka.goster(m.bg.slice(0, m.backs));
      afis.temizle();
    } else {
      arka.temizle();
      afis.goster(m.bg); // geniş görsel yok: dikey afiş küçük olarak sağda
    }
  };
  const ekstra = zamanlayici ? { setTimer: zamanlayici.set, clearTimer: zamanlayici.clear, delay: zamanlayici.delay } : {};
  const hero = createHero(
    Object.assign(
      {
        peek: (it) => bilgi[it.id] || null,
        canLoad: (it) => {
          const p = saglayici();
          return !!p && p.type === 'xtream' && (it.kind === 'movie' || it.kind === 'series');
        },
        load: (it) => {
          const p = saglayici();
          return (it.kind === 'series' ? p.seriesInfo(it) : p.vodInfo(it)).then((i) => (bilgi[it.id] = i || {}));
        },
        paint,
      },
      ekstra,
    ),
  );
  return {
    odak: (it) => hero.focus(it),
    bilgi: (it) => (it ? bilgi[it.id] || null : null),
    temizle() {
      hero.stop();
      metin.innerHTML = '';
      arka.temizle();
      afis.temizle();
    },
  };
}
