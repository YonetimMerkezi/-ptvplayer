// Arama: yazdıkça (kısa bir bekleyişten sonra) seçili kapsamda aranır ve sonuçlar altta listelenir.
// Kapsam sekmeleri: Tümü / Canlı TV / Filmler / Diziler — yalnız seçili kapsamın listesi indirilir, arama hızlı kalır.
// Kumanda: OK yazı alanını açar · ▶ "Ara" düğmesi · ▼ sekmeler, sonra sonuçlar · sonuçlarda ◀▶ sekme değiştirir.
import { ctx, provider, open, ustCubuk, geriOdakla } from '../ctx.js';
import { VList } from '../vlist.js';
import { araTur, aramayaHazirla, sonuclariSuz } from '../data.js';
import { el, esc, px, toast, enYakin } from '../ui.js';
import * as K from '../log.js';
import { t as cevir } from '../../../www/js/i18n.js';

const TUR = { live: 'Canlı', movie: 'Film', series: 'Dizi' };
const YER = { live: 'Canlı TV', movie: 'Filmler', series: 'Diziler' };
const KAPSAM_AD = { live: 'Kanal adı', movie: 'Film adı', series: 'Dizi adı' };
const TURLER = ['live', 'movie', 'series'];
const SEKMELER = [
  { id: '', ad: 'Tümü' },
  { id: 'live', ad: YER.live },
  { id: 'movie', ad: YER.movie },
  { id: 'series', ad: YER.series },
];
export const CANLI_MIN = 2; // yazdıkça aramanın başladığı en az harf sayısı (OK / Ara düğmesi tek harfle de arar)
export const CANLI_MS = 300; // son tuştan sonra bu kadar beklenip aranır
export const TUR_LIMIT = 300; // her türden en çok bu kadar sonuç
const ILK_METIN = 'Yazmak için OK’a basın; yazdıkça sonuçlar altta listelenir.';

// Bölgeler arası kumanda geçişi (saf işlev, test edilir). Bölgeler: input (yazı alanı) · go (Ara düğmesi) · tabs (sekmeler) · list (sonuçlar).
// git: odaklanacak bölge ('' = aynı kalır) · yut: tuş burada tüketildi (üst çubuğa/Geri'ye düşmez) · sekme: ±1 sekme değiştir.
// liste0: sonuç listesinde ilk satırdayız (▲ ile sekmelere çıkılır).
export function gecis(bolge, a, sonucVar, liste0) {
  const yok = { git: '', yut: false, sekme: 0 };
  if (bolge === 'input') {
    if (a === 'right') return { git: 'go', yut: true, sekme: 0 };
    if (a === 'down') return { git: 'tabs', yut: true, sekme: 0 };
    return a === 'left' ? { git: '', yut: true, sekme: 0 } : yok;
  }
  if (bolge === 'go') {
    if (a === 'left') return { git: 'input', yut: true, sekme: 0 };
    if (a === 'down') return { git: 'tabs', yut: true, sekme: 0 };
    return a === 'right' ? { git: '', yut: true, sekme: 0 } : yok;
  }
  if (bolge === 'tabs') {
    if (a === 'left' || a === 'right') return { git: '', yut: true, sekme: a === 'right' ? 1 : -1 };
    if (a === 'up') return { git: 'input', yut: true, sekme: 0 };
    if (a === 'down' || a === 'ok') return { git: sonucVar ? 'list' : '', yut: true, sekme: 0 };
    return yok;
  }
  if (bolge === 'list') {
    if (a === 'left' || a === 'right') return { git: '', yut: true, sekme: a === 'right' ? 1 : -1 };
    if (a === 'up' && liste0) return { git: 'tabs', yut: true, sekme: 0 };
  }
  return yok;
}

export function searchScreen(p) {
  const kok = el('div', 'screen search');
  const src = ctx.store.active();
  const gecerliKapsam = (k) => (k === '' || TURLER.indexOf(k) >= 0 ? k : null);
  // Bölümden açıldıysa (Filmler → Ara) o sekme seçili gelir; yoksa son seçilen sekme
  let kapsam = gecerliKapsam(p && p.tur) || gecerliKapsam(ctx.store.setting('aramaKapsam', '')) || '';
  const kapsamTurleri = () => (kapsam ? [kapsam] : TURLER);
  kok.innerHTML =
    ustCubuk('Ara', src ? esc(src.name) : '') +
    '<div class="s-in"><input id="q" type="text" placeholder="' + (KAPSAM_AD[kapsam] || 'Kanal, film ya da dizi adı') + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><div class="f-btn" id="s-go">Ara</div></div>' +
    '<div class="s-tabs" id="s-tabs"></div>' +
    '<div class="s-st" id="s-st">' + ILK_METIN + '</div>' +
    '<div class="s-res"></div><div class="hint" id="hint">OK: yaz / aç · ▶ Ara · ◀▶ sekme · ▲▼ gezin · Geri</div>';
  const inp = kok.querySelector('#q');
  const goEl = kok.querySelector('#s-go');
  const sekmeEl = kok.querySelector('#s-tabs');
  const st = kok.querySelector('#s-st');
  const resEl = kok.querySelector('.s-res');
  let bolge = 'input'; // input | go | tabs | list
  let sayac = 0; // her arama turunda artar: eski turun sonucu yok sayılır
  let zaman = 0;
  let list = null;
  let sorgu = ''; // sonuçların ait olduğu sorgu
  let bul = {}; // tür → bu sorgunun sonucu (kategoriler yüklendikçe dolar)
  let tamam = {}; // tür → tarama bitti (bul[tür] eksiksiz)
  let ilerle = {}; // tür → { b: biten kategori, t: toplam, h: başarısız kategori }
  let hata = {}; // tür → hata iletisi (tür hiç yüklenemedi)
  let cizimT = 0;
  let hazirlandi = false;
  let otomatik = !!(p && p.q); // başka ekrandan hazır sorguyla açıldıysa ilk gösterimde aranır
  if (otomatik) inp.value = String(p.q);

  const kur = () => {
    list = new VList(resEl, {
      rowH: Math.round(px() * 3.6),
      render: (it) => '<span class="nm">' + esc(it.name) + '</span><span class="rk">' + TUR[it.kind] + '</span>',
      empty: 'Sonuç yok',
      onActivate: (it) => {
        if (it.kind === 'live') {
          const tum = list.items.filter((x) => x.kind === 'live');
          open('player', { list: tum, index: Math.max(0, tum.indexOf(it)) });
        } else open('detail', { item: it });
      },
    });
  };
  kur();

  function sekmeCiz() {
    const bitti = TURLER.filter((k) => tamam[k]);
    let h = '';
    SEKMELER.forEach((s) => {
      let n = -1; // sayı: tür taranırken en az bulunan, bitince kesin
      if (s.id) n = bul[s.id] && (tamam[s.id] || bul[s.id].length) ? bul[s.id].length : -1;
      else if (bitti.length === TURLER.length) n = bitti.reduce((t, k) => t + bul[k].length, 0);
      const sayi = n >= 0 ? '<b>' + n + '</b>' : '';
      const sec = s.id === kapsam;
      h += '<span class="s-tab' + (sec ? ' sel' : '') + (sec && bolge === 'tabs' ? ' on' : '') + '" data-k="' + s.id + '">' + esc(s.ad) + sayi + '</span>';
    });
    sekmeEl.innerHTML = h;
  }

  // Seçili kapsamın sonuçları (tür sırasıyla) listeye yazılır; yeni sonuç gelince satır konumu korunur
  let gosterilen = '';
  function goster() {
    const items = [];
    kapsamTurleri().forEach((k) => {
      const r = bul[k];
      for (let i = 0; r && i < r.length; i++) items.push(r[i]);
    });
    const imza = sorgu + '|' + kapsam;
    if (items.length) list.setItems(items, imza === gosterilen);
    else list.setMessage(!sorgu ? '' : kapsamTurleri().some((k) => !tamam[k] && !hata[k]) ? 'Aranıyor…' : 'Sonuç yok');
    gosterilen = imza;
  }

  function durumYaz() {
    if (!sorgu) {
      st.textContent = ILK_METIN;
      return;
    }
    const sec = kapsamTurleri();
    const yuk = sec.filter((k) => !tamam[k] && !hata[k]);
    const toplam = sec.reduce((t, k) => t + (bul[k] ? bul[k].length : 0), 0);
    const bos = sec.filter((k) => hata[k]);
    let m = '';
    // Durum satırı parça parça çevrilir (birleşik metin tek kalıba uymaz): her parça sözlükteki kalıpla eşleşir
    if (toplam) m = cevir(toplam + ' sonuç') + (sec.some((k) => bul[k] && bul[k].length >= TUR_LIMIT) ? ' ' + cevir('(türde ilk ' + TUR_LIMIT + ')') : '');
    else if (!yuk.length && !bos.length) m = '“' + sorgu + '” için sonuç yok';
    // Tarama ilerlemesi görünür: kaç kategori tarandı (ilk aramada kategoriler yüklenir, sonra anında)
    if (yuk.length) m += (m ? ' · ' : '') + yuk.map((k) => cevir(YER[k]) + (ilerle[k] ? ' ' + ilerle[k].b + '/' + ilerle[k].t : ' ' + cevir('kategoriler yükleniyor'))).join(', ') + ' ' + cevir('taranıyor…');
    if (bos.length) m += (m ? ' · ' : '') + bos.map((k) => cevir(YER[k]) + ' ' + cevir('yüklenemedi:') + ' ' + hata[k]).join(' · ');
    const eksik = sec.reduce((t, k) => t + (ilerle[k] ? ilerle[k].h || 0 : 0), 0);
    if (eksik && !yuk.length) m += ' · ' + cevir(eksik + ' kategori yüklenemedi');
    st.textContent = m;
  }

  // Aramayı çalıştırır. zorla: OK / Giriş / Ara düğmesi (ilk sonuç gelince sonuçlara geçer); değilse yazarken arka planda (odağı çalmaz).
  async function calistir(zorla) {
    clearTimeout(zaman);
    const q = inp.value.trim();
    if (!q) {
      if (zorla) toast('Aranacak bir şey yazın');
      return;
    }
    const pr = provider();
    if (!pr) return;
    const n = ++sayac;
    if (q !== sorgu) {
      // Yeni sorgu öncekinin devamıysa ve önceki sonuç eksiksizse yeniden aranmaz, anında süzülür
      const onceki = bul;
      const oncekiTam = tamam;
      const oncekiSorgu = sorgu;
      sorgu = q;
      bul = {};
      tamam = {};
      ilerle = {};
      hata = {};
      kapsamTurleri().forEach((k) => {
        const s = oncekiTam[k] ? sonuclariSuz(onceki[k], oncekiSorgu, q, TUR_LIMIT) : null;
        if (s) {
          bul[k] = s;
          tamam[k] = true;
        }
      });
    }
    const turler = kapsamTurleri().filter((k) => !tamam[k]);
    turler.forEach((k) => {
      delete hata[k];
      delete ilerle[k];
    });
    let atladi = false;
    const ciz = () => {
      clearTimeout(cizimT);
      cizimT = 0;
      if (n !== sayac) return;
      goster();
      durumYaz();
      sekmeCiz();
      if (zorla && !atladi && list.items.length && bolge !== 'list') {
        atladi = true;
        odak('list');
      }
    };
    ciz();
    // Kategori yüklendikçe gelen güncellemeler birleştirilir (yüzlerce kategoride her birinde yeniden çizmek TV'yi yorardı)
    const planla = () => {
      if (!cizimT) cizimT = setTimeout(ciz, 120);
    };
    await Promise.all(
      turler.map(async (k) => {
        try {
          const r = await araTur(
            pr,
            q,
            k,
            TUR_LIMIT,
            (o, b, t, h) => {
              if (n !== sayac) return;
              bul[k] = o.slice();
              ilerle[k] = { b, t, h };
              planla();
            },
            () => n !== sayac,
          );
          if (n !== sayac) return;
          bul[k] = r;
          tamam[k] = true;
        } catch (e) {
          if (n !== sayac) return;
          K.hata(e);
          hata[k] = e && e.message ? e.message : 'hata';
        }
        ciz();
      }),
    );
  }

  function sekmeSec(id) {
    if (id === kapsam) return;
    kapsam = id;
    ctx.store.setSetting('aramaKapsam', id);
    inp.placeholder = KAPSAM_AD[kapsam] || 'Kanal, film ya da dizi adı';
    sekmeCiz();
    const pr = provider();
    if (pr) aramayaHazirla(pr, kapsamTurleri());
    if (sorgu) calistir(false); // yüklü türler anında gelir, eksik tür arkadan yüklenir
  }
  function sekmeKaydir(d) {
    let i = 0;
    for (let k = 0; k < SEKMELER.length; k++) if (SEKMELER[k].id === kapsam) i = k; // findIndex Chromium 38'de yok
    const j = Math.max(0, Math.min(SEKMELER.length - 1, i + d));
    sekmeSec(SEKMELER[j].id);
  }

  function odak(b) {
    bolge = b;
    list.setActive(b === 'list');
    inp.parentNode.className = 's-in' + (b === 'input' ? ' on2' : '');
    goEl.className = 'f-btn' + (b === 'go' ? ' on2' : '');
    sekmeCiz();
  }

  inp.addEventListener('input', () => {
    clearTimeout(zaman);
    const q = inp.value.trim();
    if (q.length < CANLI_MIN) {
      sayac++; // sürmekte olan aramanın sonucu gelirse yok sayılır
      sorgu = '';
      bul = {};
      tamam = {};
      ilerle = {};
      hata = {};
      goster();
      st.textContent = q ? 'En az ' + CANLI_MIN + ' harf yazın' : ILK_METIN;
      sekmeCiz();
      return;
    }
    zaman = setTimeout(() => calistir(false), CANLI_MS);
  });
  goEl.addEventListener('click', () => calistir(true));
  inp.addEventListener('click', () => inp.focus());
  sekmeEl.addEventListener('click', (e) => {
    const t = enYakin(e.target, '[data-k]', sekmeEl);
    if (t) sekmeSec(t.getAttribute('data-k'));
  });
  sekmeCiz();

  return {
    el: kok,
    name: 'search',
    // Yazı kutusunda ve ilk sekmedeyken ◀ soldaki menüye geçer (öteki yerlerde ◀▶ düğme/sekme değiştirir)
    solKenar: () => bolge === 'input' || (SEKMELER[0].id === kapsam && (bolge === 'tabs' || bolge === 'list')),
    onShow() {
      odak(bolge);
      if (!hazirlandi) {
        hazirlandi = true;
        const pr = provider();
        if (pr) aramayaHazirla(pr, kapsamTurleri()); // listeler kullanıcı yazarken arka planda iner
      }
      if (otomatik) {
        otomatik = false;
        calistir(true);
      }
      if (list.items.length) list.setItems(list.items, true);
    },
    onKey(a) {
      const g = gecis(bolge, a, list.items.length > 0, list.index === 0);
      if (g.sekme) sekmeKaydir(g.sekme);
      if (g.git) odak(g.git);
      if (g.yut) return true;
      if (bolge === 'list') return list.key(a);
      if (a === 'ok' && (bolge === 'input' || bolge === 'go')) {
        if (bolge === 'go') calistir(true);
        else inp.focus();
        return true;
      }
      return false; // ▲ üst çubuğa, Geri çıkışa düşer
    },
    // Ekran klavyesi açıkken: Giriş aramayı başlatır; Geri klavyeyi kapatır ve sonuç varsa sonuçlara geçer
    onInputKey(a, e, giris) {
      if (a === 'ok') {
        giris.blur();
        calistir(true);
        return true;
      }
      if (a === 'back' || a === 'down') {
        giris.blur();
        odak(list.items.length ? 'list' : a === 'down' ? 'tabs' : 'input');
        return true;
      }
      if (a === 'up') {
        giris.blur();
        geriOdakla(true);
        return true;
      }
      return false;
    },
    destroy() {
      sayac++;
      clearTimeout(zaman);
      clearTimeout(cizimT);
    },
  };
}
