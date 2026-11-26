// Sol menü: ana sayfa dışındaki bölüm ekranlarında (Canlı TV, Filmler, Diziler, Rehber, Spor, Favoriler, Geçmiş, Ara, Ayarlar) solda duran
// kalıcı dikey şerit. Renkleri tv.css ve tema.js belirler (tema değişince şerit de boyanır).
// Kumanda: içeriğin en solunda ◀ ile girilir · ▲▼ öğeler arasında gezer · ▶ içeriğe (açık kategori paneline) döner · OK bölümü açar.
// Canlı TV / Filmler / Diziler öğesinde BEKLEME_MS beklenirse o bölümün kategorileri yandan açılır (aşağı yukarı geçerken açılmaz).
// Magic Remote: üzerine gelip beklemek aynı işi yapar, tıklamak bölümü açar.
import { KAROLAR } from './screens/home.js';
import { ctx, kanca, top, degistir, geriOdakla } from './ctx.js';
import { enYakin } from './ui.js';

export const RAIL_EKRAN = { browse: true, spor: true, search: true, settings: true }; // menünün göründüğü ekranlar
export const KAT_BOLUM = { live: true, movie: true, series: true }; // kategorisi açılabilen bölümler
export const BEKLEME_MS = 1000;

// Ekranın menüdeki karşılığı (KAROLAR sırası; yoksa -1). acilis: { ad, arg } (ctx.open kaydı)
export function aktifIndeks(acilis) {
  if (!acilis) return -1;
  for (let i = 0; i < KAROLAR.length; i++) {
    const e = KAROLAR[i].ekran;
    if (e[0] !== acilis.ad) continue;
    if (e[0] !== 'browse') return i;
    if (acilis.arg && e[1].kind === acilis.arg.kind) return i;
  }
  return -1;
}

export function solMenuKur(kok) {
  const el = document.createElement('div');
  el.className = 'rl';
  let html = '';
  for (let i = 0; i < KAROLAR.length; i++) {
    html += '<div class="rl-it c' + ((i % 8) + 1) + '" data-rl="' + i + '"><i class="ic">' + KAROLAR[i].ic + '</i><span>' + KAROLAR[i].kisa + '</span></div>';
  }
  el.innerHTML = html;
  kok.appendChild(el);
  const ogeler = el.querySelectorAll('.rl-it');

  // gorunur: şerit gösteriliyor · odak: kumanda odağı şeritte · cr: odaktaki öğe · aktif: bulunulan bölümün öğesi
  const s = { gorunur: false, odak: false, cr: 0, aktif: -1 };
  let bekT = 0;
  let imlecT = 0;
  let imlecNo = -1;

  const boya = () => {
    for (let i = 0; i < ogeler.length; i++) {
      const c = ogeler[i].classList;
      if (s.odak && s.cr === i) c.add('on');
      else c.remove('on');
      if (i === s.aktif) c.add('cur');
      else c.remove('cur');
    }
  };
  const bekleTemizle = () => {
    clearTimeout(bekT);
    bekT = 0;
  };

  // Yığın değişince: şerit yalnız menülü ekranlarda görünür, o ekranlar menünün sağına kayar
  const guncelle = () => {
    const st = ctx.stack;
    for (let i = 0; i < st.length; i++) {
      const c = st[i].el.classList;
      if (RAIL_EKRAN[st[i].name]) c.add('rl-ekran');
      else c.remove('rl-ekran');
    }
    const t = top();
    s.gorunur = !!(t && RAIL_EKRAN[t.name]);
    if (s.gorunur) el.classList.add('gor');
    else el.classList.remove('gor');
    s.aktif = s.gorunur ? aktifIndeks(t.acilis) : -1;
    if (!s.gorunur) {
      s.odak = false;
      bekleTemizle();
    }
    boya();
  };

  // i. öğenin bölümüne geç (üstteki ekranın yerine); katAc: kategori paneli açık gelsin
  const git = (i, katAc) => {
    const k = KAROLAR[i];
    degistir(k.ekran[0], k.ekran[1], katAc ? { katAc: true } : undefined);
    const t = top();
    if (katAc && s.odak && t && t.solGir) t.solGir(); // kumanda odağı menüde kalır, açılan ekranda hiçbir satır vurgulanmaz
  };

  // Bekleme doldu (ya da OK/tıklama): bulunulan bölümse paneli aç, başka bölümse kategorileri açık olarak o bölüme geç
  const katIstegi = (i, odakla) => {
    bekT = 0;
    const t = top();
    if (!t || !s.gorunur) return;
    if (i === s.aktif) {
      if (!t.katAc) return;
      t.katAc();
      if (odakla) {
        cik();
        if (t.katOdak) t.katOdak();
      }
      return;
    }
    git(i, true);
  };

  const bekle = (i) => {
    bekleTemizle();
    if (KAT_BOLUM[KAROLAR[i].id]) bekT = setTimeout(() => katIstegi(i, false), BEKLEME_MS);
  };

  // İçeriğin sol kenarından ◀: odak menüye geçer (açık kategori paneli açık kalır; kapalıysa bekleme başlar)
  const gir = (t) => {
    geriOdakla(false);
    s.odak = true;
    s.cr = s.aktif >= 0 ? s.aktif : 0;
    if (t.solGir) t.solGir();
    boya();
    if (!(t.katAcik && t.katAcik())) bekle(s.cr);
  };

  const cik = () => {
    s.odak = false;
    bekleTemizle();
    boya();
  };
  // Odağı içeriğe geri ver (ekran kendi bölgesindeki vurguyu açar)
  const don = (t) => {
    cik();
    if (t.solCik) t.solCik();
  };

  // Odak şeritteyken tuşlar (true: tüketildi)
  const key = (t, a) => {
    if (!s.odak) return false;
    if (a === 'up' || a === 'down') {
      const n = s.cr + (a === 'down' ? 1 : -1);
      if (n >= 0 && n < KAROLAR.length) {
        s.cr = n;
        if (t.katKapat) t.katKapat(); // başka öğeye geçildi: bu bölümün açık paneli kapanır
        boya();
        bekle(n);
      }
      return true;
    }
    if (a === 'right') {
      const acik = !!(t.katAcik && t.katAcik());
      don(t);
      if (acik && t.katOdak) t.katOdak(); // açık kategori paneline gir
      return true;
    }
    if (a === 'ok') {
      bekleTemizle();
      if (s.cr === s.aktif) {
        if (KAT_BOLUM[KAROLAR[s.cr].id] && t.katAc) katIstegi(s.cr, true);
        else don(t);
        return true;
      }
      const i = s.cr;
      cik();
      git(i, false);
      return true;
    }
    if (a === 'back') {
      if (t.katKapat) t.katKapat();
      don(t);
      return true;
    }
    return a === 'left';
  };

  // Magic Remote: öğe üzerinde bekleyince kategoriler açılır; tıklayınca bölüm açılır
  el.addEventListener(
    'mouseover',
    (ev) => {
      const o = enYakin(ev.target, '.rl-it', el);
      if (!o) return;
      const i = Number(o.getAttribute('data-rl'));
      if (i === imlecNo) return;
      imlecNo = i;
      clearTimeout(imlecT);
      if (KAT_BOLUM[KAROLAR[i].id]) {
        imlecT = setTimeout(() => {
          if (imlecNo === i) katIstegi(i, false);
        }, BEKLEME_MS);
      }
    },
    false
  );
  el.addEventListener(
    'mouseout',
    (ev) => {
      if (ev.relatedTarget && el.contains(ev.relatedTarget)) return;
      imlecNo = -1;
      clearTimeout(imlecT);
    },
    false
  );
  el.addEventListener(
    'click',
    (ev) => {
      const o = enYakin(ev.target, '.rl-it', el);
      if (!o) return;
      const i = Number(o.getAttribute('data-rl'));
      clearTimeout(imlecT);
      bekleTemizle();
      s.cr = i;
      if (i === s.aktif) {
        if (KAT_BOLUM[KAROLAR[i].id]) katIstegi(i, false);
        return;
      }
      s.odak = false;
      git(i, false);
    },
    false
  );

  kanca.yigin = guncelle;
  return { durum: s, guncelle, gir, cik, key, el };
}
