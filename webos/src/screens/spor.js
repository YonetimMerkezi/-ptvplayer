// Spor: günün maçları (ESPN + LiveScore/Mackolik), üstte gün ve lig şeritleri, canlı skor. Bir maça OK basınca maç sayfası (yayın kanalı, takip) açılır.
import { ctx, provider, open, ustCubuk } from '../ctx.js';
import { VList } from '../vlist.js';
import { el, esc, px, saat, toast, enYakin } from '../ui.js';
import { sporVeri, kanalHaritasi } from '../spor-veri.js';
import { dayStart, dayStrip, dayLabel, sections, chipsFor, capSections, lgLine, hasLive } from '../../../www/js/sports.js';
import { cleanFavs, toggleFav, isFavSide, hasFavMatch, FAV_KEY, FAV_CHIP } from '../../../www/js/sports-fav.js';
import * as K from '../log.js';

const yenileMs = 60000;

export function sporScreen() {
  const kok = el('div', 'screen k-spor');
  const src = ctx.store.active();
  const veri = sporVeri(ctx.net); // ekran kapanıp açılınca önbellek paylaşılır
  const gunler = dayStrip(Date.now(), 1, 7);
  let gunNo = 1; // bugün
  let chip = '';
  let chipNo = 0;
  let chipler = [];
  let bolge = 'list'; // 'gun' | 'chip' | 'list': ▲▼ bölge değiştirir, ◀▶ şeritte gezer
  let maclar = [];
  let yukleniyor = false; // gün listesi indirilirken true: şerit boş "Maç yok" yerine "Yükleniyor…" gösterir, OK yüklemeyi yeniden başlatmaz
  let yayinV = null; // günün yayın akışı (hangi maç hangi kanalda)
  let kanallar = {}; // maç kimliği → kanal adları
  let kanalDurum = { y: null, hazir: {} }; // hangi yayın akışı için hangi maçların kanalı hesaplandı
  let kanalSay = 0; // bir önceki dilimli hesabı bırakmak için
  let kapali = false;
  let sayac = 0;
  let yenileT = 0;
  let gunT = 0;

  kok.innerHTML =
    ustCubuk('Spor', src ? esc(src.name) : '') +
    '<div class="sp-days"><div class="sp-in" id="sp-d"></div></div>' +
    '<div class="sp-chips"><div class="sp-in" id="sp-c"></div></div>' +
    '<div class="sp-body"><div class="content"></div></div>' +
    '<div class="hint">▲▼◀▶ gezin · OK: maç sayfası · Kırmızı/Yeşil: gün · Sarı: ev sahibini takip et · Mavi: deplasmanı takip et · Geri</div>';
  const gunKap = kok.querySelector('.sp-days');
  const gunIc = kok.querySelector('#sp-d');
  const chipKap = kok.querySelector('.sp-chips');
  const chipIc = kok.querySelector('#sp-c');

  const favler = () => cleanFavs(ctx.store.setting(FAV_KEY, []));
  const takim = (s) => esc(s.label || s.name) + (isFavSide(favler(), s) ? ' ★' : '');

  // Seçili öğe görünür kalacak şekilde şeridi yatay kaydırır
  const kaydir = (kap, ic, i) => {
    const d = ic.children && ic.children[i];
    if (!d || d.offsetLeft === undefined) return;
    const gor = kap.clientWidth || 0;
    const topl = ic.scrollWidth || 0;
    const x = Math.max(0, Math.min(d.offsetLeft - Math.round(gor * 0.3), Math.max(0, topl - gor)));
    ic.style.webkitTransform = ic.style.transform = 'translateX(' + -Math.round(x) + 'px)';
  };
  const sinif = (i, secili) => 'sp-d' + (i === secili ? (bolge === 'gun' || bolge === 'chip' ? ' on' : ' sel') : '');
  const gunCiz = () => {
    gunIc.innerHTML = gunler.map((g, i) => '<span class="sp-d' + (i === gunNo ? (bolge === 'gun' ? ' on' : ' sel') : '') + '" data-d="' + i + '">' + esc(dayLabel(g)) + '</span>').join('');
    kaydir(gunKap, gunIc, gunNo);
  };
  const chipCiz = () => {
    chipIc.innerHTML = chipler.length
      ? chipler.map((c, i) => '<span class="sp-d' + (i === chipNo ? (bolge === 'chip' ? ' on' : ' sel') : '') + '" data-c="' + i + '">' + esc(c.name) + ' <i>' + c.count + '</i></span>').join('')
      : '<span class="sp-d dim">' + (yukleniyor ? 'Yükleniyor…' : 'Maç yok') + '</span>';
    kaydir(chipKap, chipIc, chipNo);
  };

  // Sağ sütun: üstte yayın kanalı (varsa), altta lig
  const kanalYazi = (a) => a.slice(0, 2).join(' · ') + (a.length > 2 ? ' +' + (a.length - 2) : '');
  const satirRender = (m) => {
    const durum = m.state === 'in' ? '<span class="sp-c live">' + esc(m.text || 'Canlı') + '</span>' : m.state === 'post' || m.off ? '<span class="sp-c">' + esc(m.text || 'MS') + '</span>' : '<span class="sp-c">' + saat(m.t) + '</span>';
    const skor = m.home.score != null && m.away.score != null ? m.home.score + ' - ' + m.away.score : 'v';
    const kn = kanallar[m.id];
    return durum + '<span class="sp-h">' + takim(m.home) + '</span><span class="sp-s">' + skor + '</span><span class="sp-a">' + takim(m.away) + '</span><span class="sp-r">' + (kn ? '<b class="sp-k">' + esc(kanalYazi(kn)) + '</b>' : '') + '<i>' + esc(lgLine(m)) + '</i></span>';
  };

  const list = new VList(kok.querySelector('.content'), {
    rowH: Math.round(px() * 4.2),
    render: satirRender,
    empty: 'Bu gün için maç bulunamadı',
    onActivate: (m) => macAc(m),
  });
  list.setActive(true);

  function odak(b) {
    bolge = b;
    list.setActive(b === 'list');
    gunCiz();
    chipCiz();
  }

  function satirlariKur(koru) {
    const secili = chip === FAV_CHIP ? maclar.filter((m) => hasFavMatch(favler(), m)) : maclar;
    const secs = capSections(sections(secili, chip === FAV_CHIP ? '' : chip), 500).secs;
    const satirlar = [];
    for (let i = 0; i < secs.length; i++) for (let j = 0; j < secs[i].matches.length; j++) satirlar.push(secs[i].matches[j]);
    list.setItems(satirlar, !!koru);
    kanalIsle(); // liste değişti (gün ya da lig süzgeci): yeni görünen maçların kanalı hesaplanır, hesaplananlar atlanır
  }

  function chipleriKur() {
    const f = favler();
    const { all, chips } = chipsFor(maclar);
    const fav = maclar.filter((m) => hasFavMatch(f, m)).length;
    const l = [{ id: '', name: 'Tümü', count: all }];
    if (f.length) l.push({ id: FAV_CHIP, name: 'Takip ettiklerim', count: fav });
    for (let i = 0; i < chips.length; i++) l.push(chips[i]);
    chipler = l;
    const k = l.map((c) => c.id).indexOf(chip);
    if (k >= 0) chipNo = k;
    else {
      chip = '';
      chipNo = 0;
    }
    chipCiz();
  }

  // Kanallar listedeki sıraya göre küçük dilimlerle eşlenir; her dilimde yalnız o satırlar yenilenir. Liste yeniden kurulmaz, imleç yerinde kalır ve tuşlar yanıt verir.
  function kanalIsle() {
    const y = yayinV;
    if (!y) return;
    if (kanalDurum.y !== y) {
      kanalDurum = { y: y, hazir: {} };
      kanallar = {};
    }
    const bu = ++kanalSay;
    const sira = list.items.length ? list.items : maclar;
    kanalHaritasi(sira, y, {
      hedef: kanallar,
      hazir: kanalDurum.hazir,
      aktif: () => bu === kanalSay && yayinV === y && !kapali,
      parca: (idler) => {
        const k = {};
        for (let i = 0; i < idler.length; i++) k[idler[i]] = true;
        for (const no in list.nodes) {
          const mc = list.items[Number(no)];
          if (mc && k[mc.id]) list.redraw(Number(no));
        }
      },
    }).catch((e) => K.uyar('Kanal eşleme: ' + (e && e.message ? e.message : e)));
  }

  // Günün yayın akışı arka planda gelir: liste beklemez, gelince satırlara kanal yazılır
  function yayinYukle(gun, n) {
    veri.yayin(gun).then(
      (y) => {
        if (n !== sayac) return;
        yayinV = y;
        kanalIsle();
      },
      (e) => K.uyar('Yayın akışı: ' + (e && e.message ? e.message : e)),
    );
  }

  async function yukle(zorla) {
    const n = ++sayac;
    const gun = gunler[gunNo];
    yukleniyor = true;
    gunCiz();
    clearTimeout(yenileT);
    if (!zorla) {
      list.setMessage('Maçlar yükleniyor…');
      maclar = [];
      chipler = [];
      yayinV = null;
      kanallar = {};
      kanalDurum = { y: null, hazir: {} };
      chipCiz();
    }
    try {
      // ESPN yanıtı gelir gelmez liste gösterilir; ikinci kaynak (LiveScore/Mackolik) gelince birleşik liste tazelenir
      const m = await veri.maclar(gun, zorla, (parca) => {
        if (n !== sayac) return;
        const ilkMi = !maclar.length;
        maclar = parca;
        chipleriKur();
        satirlariKur(!ilkMi); // ilk liste başa, sonraki kademeler okuyucunun yerini koruyarak gelir
      });
      if (n !== sayac) return;
      yukleniyor = false;
      maclar = m;
      chipleriKur();
      satirlariKur(zorla || !!list.items.length);
      yayinYukle(gun, n);
      if (gunNo === 1 && hasLive(maclar)) yenileT = setTimeout(() => yukle(true), yenileMs); // canlı maç varsa skorlar dakikada bir tazelenir
    } catch (e) {
      if (n !== sayac) return;
      yukleniyor = false;
      K.hata(e);
      if (maclar.length) {
        // Kayıtlı ya da kısmi liste ekranda: silinmez, güncellenemediği bildirilir
        chipCiz();
        toast('Maçlar güncellenemedi, kayıtlı liste gösteriliyor');
        return;
      }
      maclar = [];
      chipler = [];
      chipCiz();
      const hm = String(e && e.message ? e.message : e).replace(/\.+$/, '');
      list.setMessage((/^Maç bilgisi/.test(hm) ? hm : 'Maç bilgisi alınamadı: ' + hm) + '. OK ile yeniden dene'); // ileti zaten "Maç bilgisi alınamadı…" ile başlıyorsa tekrarlanmaz
    }
  }

  // Gün şeridinde gezerken her tuşta ağ isteği atılmasın: seçim durunca yüklenir
  function gunDegis(d) {
    const y = Math.max(0, Math.min(gunler.length - 1, gunNo + d));
    if (y === gunNo) return;
    gunNo = y;
    gunCiz();
    clearTimeout(gunT);
    gunT = setTimeout(() => yukle(false), 320);
  }
  function chipDegis(d) {
    const y = Math.max(0, Math.min(chipler.length - 1, chipNo + d));
    if (y === chipNo || !chipler.length) return;
    chipNo = y;
    chip = chipler[y].id;
    chipCiz();
    satirlariKur(false);
  }

  function macAc(m) {
    if (m) open('mac', { m, gun: gunler[gunNo], veri });
  }

  function takipDegis(taraf) {
    const m = bolge === 'list' ? list.cur : null;
    if (!m) return toast('Takip için listeden bir maç seçin');
    const s = taraf === 'home' ? m.home : m.away;
    const r = toggleFav(favler(), s);
    if (r.full) return toast('En çok 30 takım takip edilebilir');
    ctx.store.setSetting(FAV_KEY, r.favs);
    toast((s.label || s.name) + (r.on ? ' takip ediliyor' : ' takipten çıkarıldı'));
    chipleriKur();
    satirlariKur(true);
  }

  gunIc.addEventListener('click', (e) => {
    const n = enYakin(e.target, '[data-d]', gunIc);
    if (!n) return;
    gunNo = Number(n.getAttribute('data-d'));
    odak('gun');
    yukle(false);
  });
  chipIc.addEventListener('click', (e) => {
    const n = enYakin(e.target, '[data-c]', chipIc);
    if (!n) return;
    chipNo = Number(n.getAttribute('data-c'));
    chip = chipler[chipNo] ? chipler[chipNo].id : '';
    odak('chip');
    satirlariKur(false);
  });

  return {
    el: kok,
    name: 'spor',
    // Maç listesinde ◀ soldaki menüye geçer (gün ve lig şeritlerinde ◀▶ gün/lig değiştirir)
    solKenar: () => bolge === 'list',
    onShow() {
      gunCiz();
      chipCiz();
      yukle(!!maclar.length);
    },
    onKey(a) {
      if (a === 'red' || a === 'green') {
        gunDegis(a === 'red' ? -1 : 1);
        return true;
      }
      if (a === 'yellow' || a === 'blue') {
        takipDegis(a === 'yellow' ? 'home' : 'away');
        return true;
      }
      // Hiçbir bölge odağı tutmaz: yüklenirken de ▲▼◀▶ ile şeritlere ve listeye geçilir, ▲ en üstte Geri düğmesine çıkar
      if (bolge === 'gun') {
        if (a === 'left' || a === 'right') {
          gunDegis(a === 'right' ? 1 : -1);
          return true;
        }
        if (a === 'down') {
          odak(chipler.length ? 'chip' : 'list');
          return true;
        }
        if (a === 'ok') {
          clearTimeout(gunT);
          if (!yukleniyor) yukle(false);
          return true;
        }
        return false;
      }
      if (bolge === 'chip') {
        if (a === 'left' || a === 'right') {
          chipDegis(a === 'right' ? 1 : -1);
          return true;
        }
        if (a === 'down' || a === 'ok') {
          odak('list');
          return true;
        }
        if (a === 'up') {
          odak('gun');
          return true;
        }
        return false;
      }
      if (a === 'ok' && !maclar.length && !list.items.length) {
        if (!yukleniyor) yukle(false);
        return true;
      }
      if (a === 'up' && list.index === 0) {
        odak(chipler.length ? 'chip' : 'gun');
        return true;
      }
      if (list.key(a)) return true;
      return a === 'left' || a === 'right';
    },
    onHide() {
      clearTimeout(yenileT);
      clearTimeout(gunT);
    },
    destroy() {
      sayac++;
      kapali = true;
      clearTimeout(yenileT);
      clearTimeout(gunT);
    },
  };
}
