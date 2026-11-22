// Oynatıcı: HTML5 <video> (webOS yerel HLS/TS/MP4 çözücüsü). Canlıda kanal değiştirme ve sayı tuşları,
// film/bölümde ileri-geri sarma, kaldığı yerden devam ve bölüm sonunda sıradaki bölüm.
import { ctx, provider, push, pop, ikon } from '../ctx.js';
import { rakam } from '../keys.js';
import { VList } from '../vlist.js';
import { el, esc, saat, sure, toast } from '../ui.js';
import { eylemi, atamalar, eylemAdi } from '../kumanda.js';
import * as K from '../log.js';
import * as kayitIs from '../kayit.js';
import * as arsiv from '../arsiv.js';
import { videoKimligi, imdbBul, imdbAdaylari, imdbHatirla, imdbBilgi, altyaziListesi, altyaziAyristir, aktifMetin } from '../altyazi.js';

const HATA = {
  1: 'Oynatma iptal edildi',
  2: 'Ağ hatası: yayın alınamadı',
  3: 'Görüntü çözülemedi (desteklenmeyen kodek olabilir)',
  4: 'Biçim desteklenmiyor ya da adres geçersiz',
};

// Altyazı görünümü: [saklama anahtarı, ad, seçenekler, varsayılan sıra, seçeneğe karşılık gelen CSS sınıfı]
const SUB_AYAR = [
  ['subBoyut', 'Boyut', ['Küçük', 'Orta', 'Büyük', 'Çok büyük'], 1, ['sb0', '', 'sb2', 'sb3']],
  ['subRenk', 'Renk', ['Beyaz', 'Sarı', 'Camgöbeği'], 0, ['', 'sr1', 'sr2']],
  ['subZemin', 'Arka plan', ['Yok', 'Yarı saydam', 'Siyah'], 0, ['', 'sz1', 'sz2']],
  ['subKonum', 'Konum', ['Altta', 'Yukarıda', 'En yukarıda'], 0, ['', 'sk1', 'sk2']],
];
// Ekran boyutu seçenekleri: [ayar, ad, object-fit, ek dönüşüm] (Ayarlar ekranı da kullanır)
export const ORAN = [
  ['contain', 'Sığdır (özgün oran)', 'contain', ''],
  ['z95', 'Küçült %95 (kenar payı)', 'contain', 'scale(.95)'],
  ['z90', 'Küçült %90 (geniş kenar payı)', 'contain', 'scale(.9)'],
  ['z85', 'Küçült %85 (en geniş kenar payı)', 'contain', 'scale(.85)'],
  ['cover', 'Doldur (kenarları kırp)', 'cover', ''],
  ['fill', 'Uzat (tam ekran)', 'fill', ''],
  ['z110', 'Yakınlaştır %10', 'contain', 'scale(1.1)'],
  ['z125', 'Yakınlaştır %25', 'contain', 'scale(1.25)'],
];

export function playerScreen({ list, index, fresh }) {
  const kok = el('div', 'screen player');
  const src = ctx.store.active();
  const sid = src ? src.id : '';
  kok.innerHTML =
    '<video id="vid"></video>' +
    '<div class="p-ov"><div class="p-top"><div class="p-l"><div class="top-back" data-geri="1">' + ikon.geriOk + '<span>Geri</span></div><div class="p-title"></div></div><div class="p-r"><span class="p-geri"></span><span class="p-rec"></span><span class="p-fmt"></span><span class="clock"></span></div></div>' +
    '<div class="p-bot"><div class="p-epg"></div><div class="p-bar"><i></i></div><div class="p-time"></div><div class="p-acts"></div><div class="p-hint"></div></div></div>' +
    '<div class="p-sub"></div><div class="p-list"><div class="p-list-in"></div></div><div class="p-pick"></div>' +
    '<div class="p-spin"></div><div class="p-msg"></div><div class="p-num"></div>';
  kok.addEventListener('mousemove', () => {
    if (!kapali) goster();
  });
  const v = kok.querySelector('#vid');
  const ov = kok.querySelector('.p-ov');
  const titleEl = kok.querySelector('.p-title');
  const fmtEl = kok.querySelector('.p-fmt');
  const recEl = kok.querySelector('.p-rec');
  const geriEl = kok.querySelector('.p-geri');
  const epgEl = kok.querySelector('.p-epg');
  const barEl = kok.querySelector('.p-bar');
  const barI = barEl.firstChild;
  const timeEl = kok.querySelector('.p-time');
  const hintEl = kok.querySelector('.p-hint');
  const actsEl = kok.querySelector('.p-acts');
  const listEl = kok.querySelector('.p-list');
  const pickEl = kok.querySelector('.p-pick');
  const spin = kok.querySelector('.p-spin');
  const msg = kok.querySelector('.p-msg');
  const numEl = kok.querySelector('.p-num');

  let idx = Math.max(0, Math.min(list.length - 1, index || 0));
  let it = list[idx];
  let kapali = false;
  let bekleyenSeek = 0; // ms
  let ovT = 0;
  let medyaDur = null; // yerel medya sunucusunu canlı tutan sorgu (yalnız yerel öğe oynarken)
  let saveT = 0;
  let beklT = 0;
  let epgT = 0;
  let numT = 0;
  let numBuf = '';
  let sonSarma = 0;
  let sarmaAdim = 10;
  let hata = false;
  let onceki = -1; // önceki kanalın sırası ("önceki kanal" eylemi)
  let odak = 'video'; // 'video' (yayın), 'ust' (Geri düğmesi), 'alt' (düğme çubuğu), 'liste' (kanal listesi)
  let altIdx = 0;
  let simdiProg = null; // canlı yayında şu an süren program (ilerleme çubuğu için)
  let kanalListe = null; // VList (ilk açılışta kurulur)
  let uykuDk = 0;
  let secim = null; // açık seçim paneli: { baslik, satirlar:[{ad,sag,on}], idx, calis(i), yan(d), not, bilgi }
  let kaynakUrl = '';
  let geri = null; // sağlayıcı arşivinden oynatılıyor: { start (ms) } — canlıya dönünce null
  let geriBeklT = 0;
  let geriHedef = null; // ◀▶ ile biriken, henüz uygulanmamış geri kalma (ms)
  let gecikmeMs = 0; // sesi geciktirme (ms); Web Audio ile, yalnız kullanıcı isteyince kurulur
  let sesGrafigi = null;
  let uykuT = 0;
  let uykuUyariT = 0;
  const UYKU = [0, 15, 30, 45, 60, 90];

  const canli = () => it.kind === 'live';
  const fmt = () => ctx.store.setting('liveFmt', 'm3u8');

  const oranBul = () => {
    const k = ctx.store.setting('aspect', 'contain');
    return ORAN.filter((x) => x[0] === k)[0] || ORAN[0];
  };
  const oranUygula = () => {
    const o = oranBul();
    v.style.objectFit = o[2];
    v.style.webkitTransform = o[3];
    v.style.transform = o[3];
  };
  oranUygula();
  const hostOf = (u) => (/^[a-z]+:\/\/([^/?#]+)/i.exec(String(u)) || [])[1] || '?';

  // Kontroller kumandaya son dokunuştan sonra kendiliğinden kalkar; odak düğme çubuğunda ya da Geri düğmesinde olsa da.
  // Kalmaz: açık panel/kanal listesi, hata iletisi ve duraklatılmış yayın (ms === 0 da süresiz gösterir).
  const ODAK_MS = 8000;
  function goster(ms) {
    ov.className = 'p-ov on';
    clearTimeout(ovT);
    if (ms !== 0) ovT = setTimeout(gizle, ms || 4500);
  }
  function gizle() {
    if (hata || odak === 'sec' || odak === 'liste' || (v.paused && !v.ended)) return;
    if (odak !== 'video') {
      odak = 'video'; // odak yayına döner: sonraki tuş yayın tuşu gibi çalışır
      odakBoya();
    }
    ov.className = 'p-ov';
  }
  function odakBoya() {
    const geri = kok.querySelector('.top-back');
    if (geri) geri.className = 'top-back' + (odak === 'ust' ? ' on' : '');
    barCiz();
    listEl.className = 'p-list' + (odak === 'liste' ? ' on' : '');
  }
  // Odak bölgesini değiştirir
  function odakAyarla(o) {
    odak = o;
    odakBoya();
    goster(o === 'video' ? undefined : o === 'sec' || o === 'liste' ? 0 : ODAK_MS);
  }
  // Düğme simgeleri (Oynat/Duraklat durumuna göre değişir)
  const IKONLAR = { list: 'liste', last: 'onceki', fav: 'yildiz', audio: 'ses', sub: 'altyazi', aspect: 'ekran', sync: 'senkron', info: 'bilgi', sleep: 'uyku', fmt: 'bicim', rec: 'kayit', geri: 'geri10', rw: 'geri10', ff: 'ileri10', next: 'sonraki' };
  const dugmeIkon = (id) => (id === 'pp' ? (v.paused ? ikon.oynat : ikon.duraklat) : ikon[IKONLAR[id]] || '');
  // Düğme çubuğu: canlıda kanal işlemleri, filmde sarma
  const dugmeler = () =>
    canli()
      ? [['list', 'Kanallar'], ['last', 'Önceki'], ['fav', 'Favori'], ['audio', 'Ses'], ['sub', 'Altyazı'], ['aspect', 'Ekran'], ['sync', 'Senkron'], ['info', 'Bilgi'], ['sleep', 'Uyku'], ['fmt', 'Biçim']].concat(arsivVar() ? [['geri', 'Geri sar']] : [], [['rec', 'Kayıt']])
      : [['rw', '−10 sn'], ['pp', v.paused ? 'Oynat' : 'Duraklat'], ['ff', '+10 sn'], ['audio', 'Ses'], ['sub', 'Altyazı'], ['aspect', 'Ekran'], ['sync', 'Senkron'], ['info', 'Bilgi'], ['sleep', 'Uyku']].concat(it.kind === 'episode' && list.length > 1 ? [['next', 'Sonraki bölüm']] : []);
  function barCiz() {
    const d = dugmeler();
    altIdx = Math.max(0, Math.min(d.length - 1, altIdx));
    actsEl.innerHTML = d.map((x, i) => '<span class="p-b' + (odak === 'alt' && i === altIdx ? ' on' : '') + '" data-a="' + x[0] + '"><span class="p-i">' + dugmeIkon(x[0]) + '</span><em>' + x[1] + '</em></span>').join('');
  }
  function listeAc() {
    if (list.length < 2) return toast('Başka kanal yok');
    if (!kanalListe) {
      listEl.className = 'p-list on'; // boyut ölçülebilsin
      kanalListe = new VList(kok.querySelector('.p-list-in'), {
        rowH: Math.round(parseFloat(getComputedStyle(document.documentElement).fontSize) * 3.8),
        render: (c) => '<span class="num">' + (c.num || '') + '</span><span class="nm">' + esc(c.name) + '</span>',
        onActivate: (c, i) => {
          if (i !== idx) {
            onceki = idx;
            idx = i;
            baslat();
          }
          odakAyarla('alt');
        },
      });
    }
    odakAyarla('liste');
    kanalListe.setItems(list, true);
    kanalListe.setIndex(idx);
    kanalListe.setActive(true);
  }
  // Düğme çubuğu ve imleç tıklaması için ortak eylem yürütücüsü
  function dugmeCalistir(id) {
    if (id === 'list') return listeAc();
    if (id === 'rw') return sar(-1);
    if (id === 'ff') return sar(1);
    if (id === 'pp') {
      if (v.paused) v.play();
      else v.pause();
      barCiz();
      return;
    }
    if (id === 'next') return kanal(1);
    if (id === 'audio') return sesAc();
    if (id === 'sub') return altyaziAc();
    if (id === 'aspect') return ekranAc();
    if (id === 'sync') return senkronAc();
    if (id === 'info') return bilgiAc();
    if (id === 'geri') return geriAc();
    if (id === 'rec') return kayitAc();
    oyunEylem(id);
    barCiz();
  }
  const oklarKanal = () => canli() && ctx.store.setting('arrowZap', false);
  kok.addEventListener('click', (e) => {
    let n = e.target;
    while (n && n !== kok && !(n.getAttribute && n.getAttribute('data-a'))) n = n.parentNode;
    if (n && n !== kok) dugmeCalistir(n.getAttribute('data-a'));
  });
  // Renkli tuşlar: renkli nokta + kısa eylem adı (uzun adlar yalnız Ayarlar'da)
  const KISA = { fav: 'Favori', aspect: 'Ekran', fmt: 'Biçim', list: 'Kanallar', sleep: 'Uyku', last: 'Önceki', info: 'Bilgi', audio: 'Ses', sub: 'Altyazı', sync: 'Senkron' };
  const renkliIpucu = () => {
    const at = atamalar(ctx.store, 'oyn');
    const r = [['red', 'r'], ['green', 'g'], ['yellow', 'y'], ['blue', 'b']];
    return r
      .filter((x) => at[x[0]] !== 'none')
      .map((x) => '<span class="p-k"><i class="k-' + x[1] + '"></i>' + esc(KISA[at[x[0]]] || eylemAdi('oyn', at[x[0]])) + '</span>')
      .join('');
  };
  const ipucu = () => {
    hintEl.innerHTML = canli()
      ? '<span class="p-k">▲ Geri</span><span class="p-k">▼ Menü</span><span class="p-k">P+ P− Kanal</span><span class="p-k">0–9 Numara</span>' + (arsivVar() ? '<span class="p-k">◀▶ Geri sar</span>' : '') + renkliIpucu()
      : '<span class="p-k">◀▶ 10 sn</span><span class="p-k">OK Duraklat</span><span class="p-k">▲ Geri</span><span class="p-k">▼ Menü</span>' + (list.length > 1 ? '<span class="p-k">P+ P− Bölüm</span>' : '');
    barCiz();
  };

  function zamanGuncelle() {
    if (!geri && geriHedef == null && geriEl.className !== 'p-geri') {
      geriEl.className = 'p-geri';
      geriEl.textContent = '';
    }
    const d = v.duration;
    const t = v.currentTime || 0;
    if (!canli() && isFinite(d) && d > 0) {
      barEl.style.display = '';
      barI.style.width = Math.min(100, (t / d) * 100) + '%';
      timeEl.textContent = sure(t * 1000) + ' / ' + sure(d * 1000);
    } else if (canli() && geri) {
      barEl.style.display = 'none';
      timeEl.textContent = 'Canlıdan ' + arsiv.etiket(geriMs());
      geriEl.textContent = '◀ ' + arsiv.etiket(geriMs());
      geriEl.className = 'p-geri on';
      return;
    } else if (canli() && simdiProg && Date.now() < simdiProg.e) {
      const n = Date.now();
      barEl.style.display = '';
      barI.style.width = Math.max(0, Math.min(100, ((n - simdiProg.s) / (simdiProg.e - simdiProg.s)) * 100)) + '%';
      timeEl.textContent = 'Bitmesine ' + Math.max(1, Math.round((simdiProg.e - n) / 60000)) + ' dk';
    } else {
      barEl.style.display = 'none';
      timeEl.textContent = canli() ? '' : sure(t * 1000);
    }
  }

  function kaydet() {
    if (!sid || !it || canli() || it.kind === 'local') return;
    const t = v.currentTime || 0;
    const d = v.duration;
    if (t < 5) return;
    // Bitişe çok yakınsa baştan başlasın
    const bitti = isFinite(d) && d > 0 && t > d - 30;
    ctx.store.touch(sid, it, bitti ? 0 : t * 1000, isFinite(d) ? d * 1000 : 0);
  }

  function epgYukle() {
    epgEl.innerHTML = '';
    simdiProg = null;
    clearTimeout(epgT);
    if (!canli() || !provider() || !provider().hasEpg) return;
    const hedef = it;
    epgT = setTimeout(async () => {
      try {
        const l = await provider().shortEpg(hedef);
        if (kapali || hedef !== it) return;
        const t = Date.now();
        const simdi = l.filter((e) => e.s <= t && t < e.e)[0];
        const sonra = l.filter((e) => e.s >= t)[0];
        let h = '';
        if (simdi) h += '<div><b>' + saat(simdi.s) + '–' + saat(simdi.e) + '</b> ' + esc(simdi.t) + '</div>';
        if (sonra) h += '<div class="dim"><b>' + saat(sonra.s) + '</b> ' + esc(sonra.t) + '</div>';
        epgEl.innerHTML = h;
        simdiProg = simdi || null;
        zamanGuncelle();
      } catch (e) {
        /* program bilgisi yok */
      }
    }, 500);
  }

  function durdurKaynak() {
    clearTimeout(beklT);
    try {
      v.pause();
    } catch (e) {
      /* yoksay */
    }
    // Kod çözücüyü bırak: webOS'ta yalnız pause yetmez
    try {
      v.removeAttribute('src');
      v.load();
    } catch (e) {
      /* yoksay */
    }
  }

  function baslat() {
    it = list[idx];
    geri = null; // yeni kanal ya da yeniden deneme her zaman canlıdan başlar
    geriHedef = null;
    clearTimeout(geriBeklT);
    haricKaldir(); // önceki yapımın harici altyazısı yenisine taşınmaz
    if (medyaDur) medyaDur();
    medyaDur = it.kind === 'local' ? kayitIs.medyaCanliTut() : null;
    hata = false;
    msg.className = 'p-msg';
    spin.className = 'p-spin on';
    durdurKaynak();
    titleEl.innerHTML = (canli() && it.num ? '<span class="p-no">' + esc(it.num) + '</span>' : '') + (canli() && it.logo ? '<img class="p-logo" src="' + esc(it.logo) + '" alt="">' : '') + '<span class="p-nm">' + esc(it.name) + '</span>';
    fmtEl.textContent = canli() && provider() && provider().type === 'xtream' ? (fmt() === 'ts' ? 'TS' : 'HLS') : '';
    ipucu();
    zamanGuncelle();
    epgYukle();
    const p = provider();
    const url = it.kind === 'local' && it.url ? it.url : p ? p.urlFor(it, fmt()) : ''; // yerel öğe (kayıt/USB) kendi adresini taşır
    kaynakUrl = url;
    if (!url) {
      return hataGoster('Oynatma adresi bulunamadı');
    }
    bekleyenSeek = 0;
    if (it.kind !== 'local' && !canli() && !(fresh && idx === index)) {
      const r = ctx.store.posOf(sid, it.id);
      if (r.pos > 20000 && (!r.dur || r.pos < r.dur - 30000)) bekleyenSeek = r.pos;
    }
    K.bilgi('Oynat: ' + it.name + ' [' + (it.kind || '?') + '] ' + hostOf(url));
    if (sid && canli()) ctx.store.touch(sid, it, 0, 0);
    oynat(url);
  }

  // Kaynağı verir ve oynatır; yayın hiç başlamazsa kullanıcıya haber verir.
  function oynat(url) {
    v.src = url;
    try {
      v.play();
    } catch (e) {
      /* otomatik oynatma */
    }
    goster();
    // Yayın hiç başlamazsa kullanıcıya haber ver
    clearTimeout(beklT);
    beklT = setTimeout(() => {
      if (!kapali && v.readyState < 3) hataGoster('Yayın başlamadı. OK: yeniden dene' + (canli() ? ' · Sarı: biçimi değiştir' : ''));
    }, 30000);
  }

  function hataGoster(t) {
    hata = true;
    spin.className = 'p-spin';
    msg.innerHTML = esc(t);
    msg.className = 'p-msg on';
    goster(0);
    K.hata(t + ' (' + (it ? it.name : '?') + ')');
  }

  // --- video olayları
  v.addEventListener('loadedmetadata', () => {
    if (bekleyenSeek > 0 && isFinite(v.duration)) {
      try {
        v.currentTime = bekleyenSeek / 1000;
      } catch (e) {
        /* canplay'de yeniden denenir */
      }
    }
  });
  v.addEventListener('canplay', () => {
    if (bekleyenSeek > 0 && Math.abs(v.currentTime - bekleyenSeek / 1000) > 3) {
      try {
        v.currentTime = bekleyenSeek / 1000;
      } catch (e) {
        /* yoksay */
      }
    }
    bekleyenSeek = 0;
  });
  v.addEventListener('playing', () => {
    clearTimeout(beklT);
    hata = false;
    spin.className = 'p-spin';
    msg.className = 'p-msg';
  });
  v.addEventListener('waiting', () => {
    if (!kapali) spin.className = 'p-spin on';
  });
  v.addEventListener('timeupdate', zamanGuncelle);
  v.addEventListener('durationchange', zamanGuncelle);
  v.addEventListener('pause', () => {
    barCiz();
    if (!kapali && !v.ended) goster(0);
  });
  v.addEventListener('play', () => {
    barCiz();
    if (!kapali) goster();
  });
  v.addEventListener('error', () => {
    if (kapali || !v.getAttribute('src')) return;
    clearTimeout(beklT);
    if (geri) {
      toast('Arşiv oynatılamadı, canlıya dönülüyor', 4000);
      geriGit(0);
      return;
    }
    const c = v.error ? v.error.code : 0;
    hataGoster((HATA[c] || 'Oynatılamadı') + (canli() ? ' · OK: yeniden dene · Sarı: biçimi değiştir' : ' · OK: yeniden dene'));
  });
  v.addEventListener('ended', () => {
    if (canli()) {
      if (geri) geriGit(0); // arşiv akışı bitti: canlıya dön
      return;
    }
    if (it.kind === 'episode' && idx < list.length - 1 && ctx.store.setting('autoNext', true)) {
      kaydetBitti();
      idx++;
      toast('Sıradaki bölüm');
      baslat();
    } else {
      kaydetBitti();
      pop();
    }
  });
  const kaydetBitti = () => {
    if (sid && it && !canli()) ctx.store.touch(sid, it, 0, 0);
  };

  saveT = setInterval(kaydet, 10000);

  // --- eylemler
  function sar(delta) {
    const t = Date.now();
    sarmaAdim = t - sonSarma < 500 ? Math.min(sarmaAdim * 2, 240) : 10;
    sonSarma = t;
    const d = v.duration;
    if (!isFinite(d) || d <= 0) return;
    const hedef = Math.max(0, Math.min(d - 1, (v.currentTime || 0) + (delta > 0 ? sarmaAdim : -sarmaAdim)));
    try {
      v.currentTime = hedef;
    } catch (e) {
      K.uyar('Sarma başarısız: ' + (e && e.message));
    }
    goster();
    zamanGuncelle();
    toast((delta > 0 ? '+' : '−') + sarmaAdim + ' sn', 800);
  }
  function kanal(d) {
    if (list.length < 2) return;
    onceki = idx;
    idx = (idx + d + list.length) % list.length;
    numBuf = '';
    numEl.className = 'p-num';
    baslat();
  }
  function numaraGit() {
    const n = Number(numBuf);
    numBuf = '';
    numEl.className = 'p-num';
    let h = -1;
    for (let i = 0; i < list.length; i++) if (Number(list[i].num) === n) h = i;
    if (h < 0 && n >= 1 && n <= list.length) h = n - 1; // numarasız listelerde sıra no
    if (h < 0) return toast('Kanal ' + n + ' yok');
    onceki = idx;
    idx = h;
    baslat();
  }

  // --- seçim paneli (Ses, Altyazı, Ekran, Senkron, Bilgi)
  const DIL = { tur: 'Türkçe', tr: 'Türkçe', eng: 'İngilizce', en: 'İngilizce', ger: 'Almanca', deu: 'Almanca', de: 'Almanca', fre: 'Fransızca', fra: 'Fransızca', fr: 'Fransızca', spa: 'İspanyolca', es: 'İspanyolca', ita: 'İtalyanca', it: 'İtalyanca', rus: 'Rusça', ru: 'Rusça', ara: 'Arapça', ar: 'Arapça', per: 'Farsça', fas: 'Farsça', fa: 'Farsça', und: 'Belirsiz' };
  const izAdi = (t, i, on) => {
    const etiket = String(t.label || '').replace(/\s+/g, ' ').trim();
    const dil = DIL[String(t.language || '').toLowerCase().slice(0, 3)] || DIL[String(t.language || '').toLowerCase()] || '';
    if (etiket && dil && etiket.toLowerCase().indexOf(dil.toLowerCase().slice(0, 4)) < 0) return etiket + ' (' + dil + ')';
    return etiket || dil || on + ' ' + (i + 1);
  };
  function secimCiz() {
    const s = secim;
    if (!s) return;
    let h = '<div class="pk-t">' + esc(s.baslik) + '</div>';
    h += s.satirlar
      .map((x, i) => '<div class="pk-r' + (!s.bilgi && i === s.idx ? ' on' : '') + '" data-p="' + i + '">' + (x.sag ? '<b>' + esc(x.sag) + '</b>' : '') + '<span class="pk-m">' + (x.on ? '●' : '') + '</span>' + esc(x.ad) + '</div>')
      .join('');
    if (s.not) h += '<div class="pk-n">' + esc(s.not) + '</div>';
    pickEl.innerHTML = h;
    pickEl.className = 'p-pick on';
  }
  // Panel kendiliğinden kapanır: Geri tuşu bir TV'de ulaşmasa bile ekranda takılı kalmasın
  let secimT = 0;
  function secimZamanla() {
    clearTimeout(secimT);
    const sure = (secim && secim.sure) || 12000; // arama/indirme panellerinde ağı beklemek için daha uzun
    secimT = setTimeout(() => {
      if (secim) secimKapat();
    }, sure);
  }
  function secimAc(s) {
    s.idx = Math.max(0, Math.min(s.satirlar.length - 1, s.idx || 0));
    secim = s;
    odakAyarla('sec');
    secimCiz();
    secimZamanla();
  }
  function secimKapat() {
    clearTimeout(secimT);
    const kapan = secim && secim.kapan;
    secim = null;
    pickEl.className = 'p-pick';
    odakAyarla('alt');
    if (kapan) kapan();
  }
  pickEl.addEventListener('click', (e) => {
    let n = e.target;
    while (n && n !== pickEl && !(n.getAttribute && n.getAttribute('data-p') !== null)) n = n.parentNode;
    if (!n || n === pickEl || !secim) return;
    secim.idx = Number(n.getAttribute('data-p'));
    secim.calis(secim.idx);
  });
  const bosPanel = (baslik, ileti, not) => secimAc({ baslik, satirlar: [{ ad: ileti }], idx: 0, bilgi: true, not, calis: secimKapat });

  function sesAc() {
    const t = v.audioTracks;
    if (!t || !t.length) return bosPanel('Ses', 'Bu yayında ses seçeneği bildirilmedi', 'TV tek bir ses yolu görüyor ya da seçenekleri uygulamaya vermiyor. Başka dil için kaynağın farklı ses sürümlerini deneyin.');
    const yap = () => {
      const l = [];
      for (let i = 0; i < t.length; i++) l.push({ ad: izAdi(t[i], i, 'Ses'), on: !!t[i].enabled });
      return l;
    };
    secimAc({
      baslik: 'Ses',
      satirlar: yap(),
      idx: Math.max(0, yap().map((x) => x.on).indexOf(true)),
      calis(i) {
        for (let j = 0; j < t.length; j++) t[j].enabled = j === i;
        toast('Ses: ' + yap()[i].ad);
        secimKapat();
      },
    });
  }

  // --- Harici altyazı: TV gömülü altyazıyı uygulamaya vermediğinde IMDb kimliğiyle aranır ve kendi katmanımızda gösterilir
  const subEl = kok.querySelector('.p-sub');
  const subIc = document.createElement('span'); // metin burada; arka plan yalnız metnin genişliğini kaplasın
  subIc.className = 'p-sub-t';
  subEl.appendChild(subIc);
  let onizleme = false; // Altyazı ayarları paneli açıkken örnek metin gösterilir
  const subDeger = (a) => Math.max(0, Math.min(a[2].length - 1, Number(ctx.store.setting(a[0], a[3])) || 0));
  const subSinif = (acik) => {
    let c = 'p-sub';
    for (let i = 0; i < SUB_AYAR.length; i++) {
      const k = SUB_AYAR[i][4][subDeger(SUB_AYAR[i])];
      if (k) c += ' ' + k;
    }
    return c + (acik ? ' on' : '');
  };
  let harici = null; // { cues, ad, kayma, olcek } — kayma ms; + = altyazı gecikir; olcek: altyazı zamanı = (video zamanı − kayma) × olcek (fps farkından doğan giderek açılan kayma)
  let haricT = 0;
  let aramaNo = 0;
  let sonMetin = '';
  const kaymaYaz = (k) => (k > 0 ? '+' : '') + (k / 1000).toFixed(1).replace('.', ',') + ' sn';
  function onizleCiz() {
    subIc.textContent = 'Altyazı örnek metni\nİkinci satır';
    subEl.className = subSinif(true);
  }
  function haricCiz() {
    if (onizleme) return onizleCiz();
    if (!harici) return;
    const m = aktifMetin(harici.cues, Math.round(((v.currentTime || 0) * 1000 - harici.kayma) * harici.olcek));
    if (m === sonMetin) return;
    sonMetin = m;
    subIc.textContent = m;
    subEl.className = subSinif(!!m);
  }
  function haricKaldir() {
    aramaNo++; // süren arama/indirme sonucu artık kullanılmaz
    clearInterval(haricT);
    harici = null;
    sonMetin = '';
    subIc.textContent = '';
    subEl.className = subSinif(false);
  }
  function haricAc(cues, ad) {
    clearInterval(haricT);
    harici = { cues, ad, kayma: 0, olcek: 1 };
    sonMetin = '\u0000';
    haricCiz();
    haricT = setInterval(haricCiz, 250);
    const t = v.textTracks; // gömülü altyazı da açıksa çift görünmesin
    for (let i = 0; t && i < t.length; i++) if (t[i].mode === 'showing') t[i].mode = 'disabled';
  }
  const haricGecerli = (n) => !kapali && secim && secim.arama === n;
  async function haricIndir(x, n) {
    secimAc({ baslik: 'Altyazı', satirlar: [{ ad: x.ad + ' indiriliyor…' }], idx: 0, bilgi: true, arama: n, sure: 60000, calis: secimKapat });
    try {
      const metin = await ctx.net.get(x.url, { timeoutMs: 25000 });
      if (!haricGecerli(n)) return;
      const cues = altyaziAyristir(metin);
      if (!cues.length) return bosPanel('Altyazı', 'Altyazı dosyası okunamadı', 'Dosya boş ya da desteklenmeyen biçimde. Başka bir seçenek deneyin.');
      haricAc(cues, x.ad);
      toast('Altyazı: ' + x.ad);
      secimKapat();
    } catch (e) {
      if (!haricGecerli(n)) return;
      K.uyar('Altyazı indirilemedi: ' + (e && e.message));
      bosPanel('Altyazı indirilemedi', (e && e.message) || 'Ağ hatası', 'İnternet bağlantısını kontrol edip başka bir seçenek deneyin.');
    }
  }
  async function haricAra(kimlik) {
    const n = ++aramaNo;
    secimAc({ baslik: 'Altyazı ara', satirlar: [{ ad: 'Altyazı aranıyor…' }], idx: 0, bilgi: true, arama: n, sure: 60000, calis: secimKapat });
    try {
      let ek = [];
      if (kimlik.tur === 'movie') {
        try {
          const vi = await provider().vodInfo(it);
          if (vi && vi.originalName) ek = [vi.originalName]; // Türkçe adlı filmler özgün adla da aranır
        } catch (e) {
          /* özgün ad alınamadı: yalnız katalog adıyla aranır */
        }
      }
      if (!haricGecerli(n)) return;
      const imdb = await imdbBul(ctx.net, kimlik, ek);
      if (!haricGecerli(n)) return;
      if (imdb) return haricListele(kimlik, imdb, n, ek);
      // Ad birebir tutmadı (çoğunlukla Türkçe ad): katalogun bulduğu yapımlar seçtirilir
      await haricAdaylar(kimlik, ek, n, 'Adı tam tutan yapım bulunamadı. Doğru olanı seçin; yanlışını seçerseniz altyazı uymaz.');
    } catch (e) {
      if (!haricGecerli(n)) return;
      K.uyar('Altyazı aranamadı: ' + (e && e.message));
      bosPanel('Altyazı aranamadı', (e && e.message) || 'Ağ hatası', 'İnternet bağlantısını kontrol edip yeniden deneyin.');
    }
  }
  // Katalogun bulduğu yapımları seçtirir (yılı uyanlar önce)
  async function haricAdaylar(kimlik, ek, n, not) {
    const a = await imdbAdaylari(ctx.net, kimlik, ek);
    if (!haricGecerli(n)) return;
    if (!a.liste.length) {
      return bosPanel('Altyazı', 'Bu yapım altyazı kaynağında bulunamadı', 'Aranan: ' + a.adlar.join(' / ') + (a.yil ? ' (' + a.yil + ')' : '') + '. Katalog bu adla bir yapım bulamadı.');
    }
    secimAc({
      baslik: 'Hangi yapım?',
      satirlar: a.liste.map((x) => ({ ad: x.ad + (x.yil ? ' (' + x.yil + ')' : '') })),
      idx: 0,
      arama: n,
      not: not || 'Doğru yapımı seçin; yanlışını seçerseniz altyazı uymaz.',
      calis(i) {
        imdbHatirla(kimlik, ek, a.liste[i].id);
        haricListele(kimlik, a.liste[i].id, n, ek);
      },
    });
  }
  // IMDb kimliği belli: altyazı listesini getirip seçtirir. Eşleşen yapımın adı başlıkta görünür; yanlışsa son satırdan başka yapım seçilir.
  async function haricListele(kimlik, imdb, n, ek) {
    secimAc({ baslik: 'Altyazı ara', satirlar: [{ ad: 'Altyazılar getiriliyor…' }], idx: 0, bilgi: true, arama: n, sure: 60000, calis: secimKapat });
    try {
      const liste = await altyaziListesi(ctx.net, kimlik, imdb);
      if (!haricGecerli(n)) return;
      const bil = imdbBilgi(imdb);
      const yapim = bil && bil.ad ? bil.ad + (bil.yil ? ' (' + bil.yil + ')' : '') : '';
      if (!liste.length) return bosPanel('Altyazı', 'Bu yapım için altyazı bulunamadı', (yapim ? 'Eşleşen yapım: ' + yapim + '. ' : '') + 'Altyazı kaynağında bu film ya da bölüm için kayıt yok. Başka yapım seçmek için Altyazı ara… menüsünü yeniden açın.');
      const satirlar = liste.map((x) => ({ ad: x.ad }));
      satirlar.push({ ad: 'Yanlış yapım mı? Başka yapım seç…' });
      secimAc({
        baslik: yapim ? 'Altyazı seç · ' + yapim : 'Altyazı seç',
        satirlar,
        idx: 0,
        arama: n,
        calis(i) {
          if (i >= liste.length) return haricAdaylar(kimlik, ek || [], n, 'Doğru yapımı seçin. Seçilen yapımın altyazıları listelenir.').catch(() => {});
          haricIndir(liste[i], n);
        },
      });
    } catch (e) {
      if (!haricGecerli(n)) return;
      K.uyar('Altyazı aranamadı: ' + (e && e.message));
      bosPanel('Altyazı aranamadı', (e && e.message) || 'Ağ hatası', 'İnternet bağlantısını kontrol edip yeniden deneyin.');
    }
  }
  // Altyazı görünümü: boyut, renk, arka plan, konum (yalnız aranan/harici altyazıya uygulanır; gömülü altyazıyı TV çizer)
  function altyaziAyarAc() {
    const yap = () => SUB_AYAR.map((a) => ({ ad: a[1], sag: a[2][subDeger(a)] })).concat([{ ad: 'Varsayılana dön' }]);
    const yenile = (sc) => {
      sc.satirlar = yap();
      secimCiz();
      onizleCiz();
      if (harici) sonMetin = '\u0000'; // panel kapanınca gerçek altyazı yeniden çizilsin
    };
    onizleme = true;
    onizleCiz();
    secimAc({
      baslik: 'Altyazı görünümü',
      satirlar: yap(),
      idx: 0,
      not: '◀▶ değiştirir. Ayarlar aranan (harici) altyazıya uygulanır.',
      kapan() {
        onizleme = false;
        sonMetin = '\u0000';
        if (harici) haricCiz();
        else {
          subIc.textContent = '';
          subEl.className = subSinif(false);
        }
      },
      yan(d) {
        const a = SUB_AYAR[this.idx];
        if (!a) return;
        ctx.store.setSetting(a[0], (subDeger(a) + d + a[2].length) % a[2].length);
        yenile(this);
      },
      calis(i) {
        if (i < SUB_AYAR.length) return this.yan(1);
        for (let j = 0; j < SUB_AYAR.length; j++) ctx.store.setSetting(SUB_AYAR[j][0], SUB_AYAR[j][3]);
        yenile(this);
      },
    });
  }
  // Altyazı senkronu: üç araç.
  //  1) Gecikme: ◀▶ 0,1 sn adımla (tuş basılı tutulursa adım büyür: 10 basıştan sonra 0,5 sn, 25'ten sonra 1 sn). Sabit kaymayı düzeltir.
  //  2) Şimdiki söze göre eşle: videoda duyulan cümleye karşılık gelen altyazı satırı seçilir; gecikme kendiliğinden hesaplanır (uzun kaymalar için en hızlı yol).
  //  3) Hız düzeltme: filmin fps'i altyazınınkinden farklıysa (23,976 ↔ 25 gibi) kayma film ilerledikçe büyür; sabit gecikme bunu düzeltemez, hız oranı seçilir.
  const KAYMA_ADIM = 100;
  const KAYMA_SINIR = 600000; // ±10 dk
  // [ölçek, ad]: altyazı zamanı = (video zamanı − kayma) × ölçek
  const OLCEKLER = [
    [1, 'Yok (özgün hız)'],
    [25 / 23.976, 'Altyazı 23,976 fps · video 25 fps'],
    [23.976 / 25, 'Altyazı 25 fps · video 23,976 fps'],
    [25 / 24, 'Altyazı 24 fps · video 25 fps'],
    [24 / 25, 'Altyazı 25 fps · video 24 fps'],
    [24 / 23.976, 'Altyazı 23,976 fps · video 24 fps'],
    [23.976 / 24, 'Altyazı 24 fps · video 23,976 fps'],
  ];
  const olcekSira = () => {
    for (let i = 0; i < OLCEKLER.length; i++) if (Math.abs(OLCEKLER[i][0] - harici.olcek) < 0.00002) return i;
    return 0;
  };
  const sureYaz = (msn) => {
    const sn = Math.max(0, Math.round(msn / 1000));
    const h = Math.floor(sn / 3600);
    const dk = Math.floor((sn % 3600) / 60);
    const s2 = sn % 60;
    return (h ? h + ':' : '') + (h && dk < 10 ? '0' : '') + dk + ':' + (s2 < 10 ? '0' : '') + s2;
  };
  function haricKaydirAc() {
    const yap = () => [
      { ad: 'Altyazıyı geciktir', sag: kaymaYaz(harici.kayma) },
      { ad: 'Şimdiki söze göre eşle…' },
      { ad: 'Hız düzeltme', sag: olcekSira() ? OLCEKLER[olcekSira()][1] : 'Yok' },
      { ad: 'Sıfırla' },
    ];
    const son = harici.cues.length ? harici.cues[harici.cues.length - 1].s : 0;
    const sure = Math.round((v.duration || 0) * 1000);
    let ipucu = '◀▶ ile 0,1 sn adımla (tuşu basılı tutarsanız adım büyür). Altyazı sesten sonra geliyorsa eksi, önce geliyorsa artı değer verin.';
    if (isFinite(sure) && sure > 0 && son > 0) {
      ipucu += ' Altyazının son satırı ' + sureYaz(son) + ', video ' + sureYaz(sure) + '.' + (son > sure * 1.005 ? ' Altyazı videodan uzun: Hız düzeltme’de “Altyazı 23,976 fps · video 25 fps” seçeneğini deneyin.' : '');
    }
    let seri = 0;
    let sonBasis = 0;
    let sonYon = 0;
    secimAc({
      baslik: 'Altyazı senkronu',
      satirlar: yap(),
      idx: 0,
      sure: 30000,
      not: ipucu,
      yan(d) {
        if (this.idx === 2) {
          // Hız düzeltme satırında ◀▶ oranları gezer
          const k = (olcekSira() + d + OLCEKLER.length) % OLCEKLER.length;
          // Ölçek değişirken şimdiki an sabit kalsın: kayma, aynı videoya göre yeniden hesaplanır
          const t = (v.currentTime || 0) * 1000;
          const simdiki = (t - harici.kayma) * harici.olcek;
          harici.olcek = OLCEKLER[k][0];
          harici.kayma = Math.max(-KAYMA_SINIR, Math.min(KAYMA_SINIR, Math.round(t - simdiki / harici.olcek)));
        } else {
          const simdi = Date.now();
          seri = simdi - sonBasis < 350 && d === sonYon ? seri + 1 : 0;
          sonBasis = simdi;
          sonYon = d;
          const adim = seri >= 25 ? 10 : seri >= 10 ? 5 : 1;
          harici.kayma = Math.max(-KAYMA_SINIR, Math.min(KAYMA_SINIR, harici.kayma + d * adim * KAYMA_ADIM));
        }
        this.satirlar = yap();
        secimCiz();
        haricCiz();
      },
      calis(i) {
        if (i === 1) return haricEsleAc();
        if (i === 2) {
          harici.olcek = OLCEKLER[(olcekSira() + 1) % OLCEKLER.length][0];
          this.satirlar = yap();
          secimCiz();
          haricCiz();
        } else if (i === 3) {
          harici.kayma = 0;
          harici.olcek = 1;
          this.satirlar = yap();
          secimCiz();
          haricCiz();
        } else secimKapat();
      },
    });
  }
  // Videoda şu an duyulan cümleye karşılık gelen altyazı satırını seçtirir; gecikme buna göre hesaplanır.
  function haricEsleAc() {
    const t0 = Math.round((v.currentTime || 0) * 1000);
    const cues = harici.cues;
    const sim = (t0 - harici.kayma) * harici.olcek; // altyazı çizgisindeki şimdiki an
    let k = -1;
    for (let i = 0; i < cues.length; i++) {
      if (cues[i].b <= sim) k = i;
      else break;
    }
    const bas = Math.max(0, k - 4);
    const bit = Math.min(cues.length, Math.max(k, 0) + 6);
    const satirlar = [];
    for (let i = bas; i < bit; i++) satirlar.push({ ad: cues[i].m.replace(/\s*\n\s*/g, ' / ').slice(0, 70), sag: sureYaz(cues[i].b) });
    if (!satirlar.length) return bosPanel('Altyazı', 'Eşlenecek satır yok', 'Altyazı dosyası boş görünüyor.');
    secimAc({
      baslik: 'Şimdi hangi cümle söyleniyor?',
      satirlar,
      idx: Math.max(0, k - bas),
      sure: 60000,
      not: 'Videoda şu an duyduğunuz (ya da az önce duyduğunuz) cümleye en yakın altyazı satırını seçin. Eşleşince gecikme kendiliğinden ayarlanır; gerekirse ◀▶ ile ince ayar yapın.',
      calis(i) {
        const c = cues[bas + i];
        harici.kayma = Math.max(-KAYMA_SINIR, Math.min(KAYMA_SINIR, Math.round(t0 - c.b / harici.olcek)));
        sonMetin = '\u0000';
        haricCiz();
        toast('Altyazı eşlendi: ' + kaymaYaz(harici.kayma));
        haricKaydirAc();
      },
    });
  }

  function altyaziAc() {
    const t = v.textTracks;
    const l = [];
    for (let i = 0; t && i < t.length; i++) if (t[i].kind === 'subtitles' || t[i].kind === 'captions' || !t[i].kind) l.push(t[i]);
    const kimlik = videoKimligi(it);
    if (!l.length && !kimlik && !harici) return bosPanel('Altyazı', 'Bu yayında altyazı bildirilmedi', 'Gömülü altyazı yoksa ya da TV altyazıyı uygulamaya vermiyorsa liste boş kalır.');
    const yap = () => {
      const r = [{ ad: 'Kapalı', on: !harici && !l.some((x) => x.mode === 'showing'), eyl: 'kapali' }];
      for (let i = 0; i < l.length; i++) r.push({ ad: izAdi(l[i], i, 'Altyazı'), on: !harici && l[i].mode === 'showing', eyl: 'iz', iz: i });
      if (harici) {
        r.push({ ad: harici.ad + ' (harici)', on: true, eyl: 'harici' });
        r.push({ ad: 'Altyazıyı kaydır', sag: kaymaYaz(harici.kayma), eyl: 'kaydir' });
      }
      if (kimlik) r.push({ ad: 'Altyazı ara…', eyl: 'ara' });
      if (kimlik || harici) r.push({ ad: 'Altyazı görünümü', eyl: 'ayar' });
      return r;
    };
    const not = !l.length && kimlik && !harici ? 'TV bu yayının gömülü altyazısını uygulamaya vermiyor. “Altyazı ara…” ile harici altyazı bulunabilir.' : '';
    secimAc({
      baslik: 'Altyazı',
      satirlar: yap(),
      idx: Math.max(0, yap().map((x) => x.on).indexOf(true)),
      not,
      calis(i) {
        const x = this.satirlar[i];
        if (x.eyl === 'ara') return haricAra(kimlik);
        if (x.eyl === 'kaydir') return haricKaydirAc();
        if (x.eyl === 'ayar') return altyaziAyarAc();
        if (x.eyl === 'harici') return secimKapat();
        haricKaldir();
        for (let j = 0; j < l.length; j++) l[j].mode = x.eyl === 'iz' && j === x.iz ? 'showing' : 'disabled';
        toast(x.eyl === 'iz' ? 'Altyazı: ' + x.ad : 'Altyazı kapalı');
        secimKapat();
      },
    });
  }

  // Canlı yayın kaydı (deneme): TV servisi yayını USB belleğe MPEG-TS olarak yazar. Panel kapansa da kayıt sürer.
  let kayit = null; // { id, d (servisin son durumu), sureSn, ad, hata, bekliyor }
  let kayitSure = 30;
  let kayitT = 0;
  // --- Sağlayıcı arşivinden geri sarma (Xtream tv_archive): diske yazılmaz, arşiv adresi o andan açılır
  function arsivVar() {
    const p = provider();
    return !!it && canli() && !!it.archive && !!p && typeof p.arsivUrl === 'function';
  }
  // Şu an oynayan görüntünün canlıdan ne kadar geride olduğu (ms)
  const geriMs = () => (geri ? Math.max(0, Date.now() - (geri.start + (v.currentTime || 0) * 1000)) : 0);
  // geriMs kadar geriye git (0 = canlı)
  async function geriGit(istenen) {
    if (!arsivVar()) return;
    const pl = arsiv.plan(Date.now(), istenen, arsiv.enFazlaGeri(it));
    if (pl.canli) return baslat();
    const hedef = it;
    let url;
    try {
      url = await provider().arsivUrl(it, pl.start, pl.sureDk);
    } catch (e) {
      toast('Arşiv adresi alınamadı', 4000);
      return;
    }
    if (kapali || hedef !== it) return;
    geri = { start: pl.start };
    geriHedef = null;
    hata = false;
    msg.className = 'p-msg';
    spin.className = 'p-spin on';
    durdurKaynak();
    kaynakUrl = url;
    K.bilgi('Arşiv: ' + it.name + ' ' + arsiv.etiket(Date.now() - pl.start) + ' ' + hostOf(url));
    oynat(url);
    zamanGuncelle();
    barCiz();
  }
  // ◀▶ ile adım adım: tuşlar birikir, kısa bir bekleyişten sonra bir kez uygulanır (her basışta akış yeniden açılmasın)
  function geriAdim(yon, buyuk) {
    const mevcut = geriHedef != null ? geriHedef : geriMs();
    const yeni = Math.max(0, Math.min(arsiv.enFazlaGeri(it), mevcut + yon * (buyuk ? 15 : 5) * arsiv.DK));
    goster();
    if (yeni === mevcut) return;
    geriHedef = yeni;
    geriEl.textContent = '◀ ' + arsiv.etiket(yeni);
    geriEl.className = 'p-geri on';
    clearTimeout(geriBeklT);
    geriBeklT = setTimeout(() => {
      const h = geriHedef;
      geriHedef = null;
      if (!kapali && h != null) geriGit(h);
    }, 800);
  }
  function geriAc() {
    if (!arsivVar()) return;
    const enFazla = arsiv.enFazlaGeri(it);
    const satirlar = [];
    if (geri) satirlar.push({ ad: 'Canlıya dön', ms: 0 });
    arsiv.ADIMLAR.forEach((dk) => {
      if (dk * arsiv.DK <= enFazla) satirlar.push({ ad: dk + ' dk geri', ms: dk * arsiv.DK });
    });
    if (simdiProg && simdiProg.s < Date.now() - arsiv.CANLI_KENAR_MS && Date.now() - simdiProg.s <= enFazla) satirlar.push({ ad: 'Programın başına', sag: simdiProg.t, ms: Date.now() - simdiProg.s });
    secimAc({
      baslik: 'Geri sar',
      satirlar,
      not: 'Sağlayıcının yayın arşivinden oynatır (' + Math.round(arsiv.arsivMs(it) / 86400000) + ' gün). Kumandada ◀▶ 5 dk, ◀◀ ▶▶ 15 dk geri/ileri sarar.',
      idx: 0,
      calis(i) {
        const x = satirlar[i];
        secimKapat();
        if (x) geriGit(x.ms);
      },
    });
  }

  let kayitHata = 0; // art arda başarısız durum sorgusu
  let kayitDiskler = null; // servisin bildirdiği diskler (yazılabilirlik, boş alan)
  let kayitDiskHata = ''; // disk bilgisi alınamadıysa nedeni (sessizce yutulmaz)
  function kayitGoster() {
    const d = kayit && kayit.d;
    recEl.textContent = kayitIs.calisiyor(d) ? '● KAYIT ' + sure(d.sureMs) : '';
    recEl.className = 'p-rec' + (kayitIs.calisiyor(d) ? ' on' : '');
  }
  function kayitSatirlari() {
    const d = kayit && kayit.d;
    const sureAd = kayitIs.sureAdi(kayitSure);
    if (kayit && kayit.bekliyor) return { satirlar: [{ ad: 'Kayıt başlatılıyor…' }], not: 'Disk yazılabilir mi denetleniyor, yayına bağlanılıyor.', bilgi: true };
    if (kayitIs.calisiyor(d)) return { satirlar: [{ ad: 'Kaydı durdur', eyl: 'durdur' }], not: kayitIs.durumMetni(d, kayit.sureSn) };
    if (d && d.durum === 'bitti') return { satirlar: [{ ad: 'Kaydı oynat', eyl: 'oynat' }, { ad: 'Yeniden kaydet', sag: sureAd, eyl: 'basla' }], not: kayitIs.durumMetni(d, 0) };
    const alan = kayitDiskler ? kayitIs.alanMetni(kayitDiskler) : kayitDiskHata ? 'Disk bilgisi alınamadı: ' + kayitDiskHata : '';
    const genel = 'Yayın MPEG-TS olarak yazılır. ◀▶ süreyi değiştirir. Hesabınız tek bağlantıya izin veriyorsa yayın kesilebilir.';
    const ilk = d ? kayitIs.durumMetni(d, 0) : kayit && kayit.hata ? 'Başlatılamadı: ' + kayit.hata : (alan ? alan + ' — ' : '') + genel;
    return { satirlar: [{ ad: d || (kayit && kayit.hata) ? 'Yeniden dene' : 'Kaydı başlat', sag: sureAd, eyl: 'basla' }], not: ilk };
  }
  function kayitPanelYenile() {
    if (!kayitPanel || secim !== kayitPanel) return;
    const k = kayitSatirlari();
    kayitPanel.satirlar = k.satirlar;
    kayitPanel.not = k.not;
    kayitPanel.bilgi = !!k.bilgi;
    kayitPanel.idx = Math.min(kayitPanel.idx, k.satirlar.length - 1);
    secimCiz();
  }
  let kayitPanel = null;
  async function kayitYokla() {
    if (!kayit || !kayit.id || kapali) return;
    try {
      const d = await kayitIs.api.durum(kayit.id);
      if (kapali || !kayit) return;
      kayitHata = 0;
      const once = kayitIs.bitti(kayit.d);
      kayit.d = d;
      kayitGoster();
      kayitPanelYenile();
      if (kayitIs.bitti(d)) {
        clearInterval(kayitT);
        if (!once) toast(d.durum === 'hata' ? 'Kayıt başarısız: ' + d.mesaj : 'Kayıt bitti · ' + kayitIs.boyutYaz(d.bayt), 5000);
      }
    } catch (e) {
      if (++kayitHata >= 8 && kayit) {
        clearInterval(kayitT);
        kayit.d = { durum: 'hata', mesaj: 'Servise ulaşılamıyor', bayt: 0, sureMs: 0, dosya: '', disk: '' };
        kayitGoster();
        kayitPanelYenile();
      }
    }
  }
  async function kayitBasla() {
    const p = provider();
    const url = p ? p.urlFor(it, 'ts') : ''; // kayıt her zaman TS (HLS listesi kaydedilemez)
    if (!url) return toast('Kayıt için yayın adresi yok');
    kayit = { id: '', d: null, sureSn: kayitSure, ad: it.name, hata: '', bekliyor: true };
    const k = kayit;
    kayitPanelYenile();
    try {
      const r = await kayitIs.api.baslat(url, it.name, k.sureSn);
      if (kayit !== k || kapali) return;
      k.bekliyor = false;
      k.id = r.id;
      k.d = r;
      kayitHata = 0;
      clearInterval(kayitT);
      kayitT = setInterval(kayitYokla, 1000);
      kayitGoster();
      kayitPanelYenile();
      toast('Kayıt başladı · ' + (r.disk || ''), 4000);
    } catch (e) {
      if (kayit !== k || kapali) return;
      k.bekliyor = false;
      k.hata = (e && e.message) || 'Servis hatası';
      K.uyar('Kayıt başlatılamadı: ' + k.hata);
      kayitPanelYenile();
    }
  }
  async function kayitOynat() {
    const d = kayit && kayit.d;
    if (!d || d.durum !== 'bitti' || !d.dosya) return;
    try {
      const b = await kayitIs.api.medyaBaslat();
      if (kapali) return;
      secimKapat();
      push(playerScreen({ list: [kayitIs.kayitOgesi(d, kayit.ad || '', b)], index: 0 })); // bu ekran gizlenince yayını durdurur, geri dönünce yeniden başlatır
    } catch (e) {
      toast('Kayıt açılamadı: ' + ((e && e.message) || 'servis hatası'), 5000);
    }
  }
  async function kayitDurdur() {
    if (!kayit || !kayit.id) return;
    try {
      kayit.d = await kayitIs.api.durdur(kayit.id);
    } catch (e) {
      toast('Kayıt durdurulamadı: ' + ((e && e.message) || 'servis hatası'), 4000);
    }
    kayitGoster();
    kayitPanelYenile();
  }
  function kayitAc() {
    if (!canli()) return;
    if (!kayitIs.api.hazir()) return bosPanel('Kayıt', 'Bu ortamda kayıt yok', 'Kayıt yalnızca TV üzerinde, uygulamanın TV servisiyle çalışır.');
    const k = kayitSatirlari();
    const s = {
      baslik: 'Kayıt (deneme)',
      satirlar: k.satirlar,
      not: k.not,
      bilgi: !!k.bilgi,
      idx: 0,
      sure: 120000,
      kapan() {
        if (kayitPanel === s) kayitPanel = null;
      },
      yan(d) {
        const x = this.satirlar[this.idx];
        if (!x || !x.sag) return;
        kayitSure = kayitIs.sonrakiSure(kayitSure, d);
        kayitPanelYenile();
      },
      calis(i) {
        const x = this.satirlar[i];
        if (!x) return;
        if (x.eyl === 'basla') kayitBasla();
        else if (x.eyl === 'durdur') kayitDurdur();
        else if (x.eyl === 'oynat') kayitOynat();
      },
    };
    kayitPanel = s;
    secimAc(s);
    if (kayit && kayit.id && kayitIs.calisiyor(kayit.d)) kayitYokla(); // panel açılırken en güncel durum
    kayitIs.api
      .alan()
      .then((r) => {
        if (kapali) return;
        kayitDiskler = (r && r.diskler) || [];
        kayitDiskHata = '';
        kayitPanelYenile();
      })
      .catch((e) => {
        if (kapali) return;
        kayitDiskHata = (e && e.message) || 'servis hatası';
        kayitPanelYenile();
      });
  }

  function ekranAc() {
    const yap = () => ORAN.map((x) => ({ ad: x[1], on: x[0] === oranBul()[0] }));
    secimAc({
      baslik: 'Ekran boyutu',
      satirlar: yap(),
      idx: ORAN.map((x) => x[0]).indexOf(oranBul()[0]),
      calis(i) {
        ctx.store.setSetting('aspect', ORAN[i][0]);
        oranUygula();
        secimKapat();
      },
    });
  }

  // Ses gecikmesi: HTML5 video'da böyle bir ayar yok; ses Web Audio gecikme düğümünden geçirilir (yalnız sesi geciktirir).
  // Kurulum kullanıcı ilk kez gecikme verdiğinde yapılır; TV desteklemezse özgün ses bozulmaz ya da çıkışta kalınca uyarı verilir.
  function gecikmeUygula() {
    if (!sesGrafigi) {
      if (gecikmeMs === 0) return true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) throw new Error('Web Audio yok');
        const ac = new AC();
        const kaynak = ac.createMediaElementSource(v);
        const d = ac.createDelay ? ac.createDelay(3) : ac.createDelayNode(3);
        kaynak.connect(d);
        d.connect(ac.destination);
        sesGrafigi = { ac, kaynak, d };
      } catch (e) {
        K.uyar('Ses gecikmesi kurulamadı: ' + (e && e.message));
        gecikmeMs = 0;
        toast('Bu TV ses gecikmesini desteklemiyor');
        return false;
      }
    }
    sesGrafigi.d.delayTime.value = gecikmeMs / 1000;
    return true;
  }
  function senkronAc() {
    const yap = () => [{ ad: 'Sesi geciktir', sag: gecikmeMs + ' ms' }, { ad: 'Sıfırla' }];
    const s = {
      baslik: 'Ses senkronu',
      satirlar: yap(),
      idx: 0,
      not: '◀▶ ile 50 ms adımla ayarlayın. Ses görüntüden önce geliyorsa gecikme ekleyin (yalnız sesi geciktirebilir, ileri alamaz). Deneysel: ayar sonrası ses kesilirse Geri ile çıkıp yayını yeniden açın.',
      yan(d) {
        gecikmeMs = Math.max(0, Math.min(3000, gecikmeMs + d * 50));
        if (!gecikmeUygula()) gecikmeMs = 0;
        this.satirlar = yap();
        secimCiz();
      },
      calis(i) {
        if (i === 1) this.yan(-gecikmeMs / 50);
        else secimKapat();
      },
    };
    secimAc(s);
  }

  function bilgiAc() {
    if (secim && secim.baslik === 'Bilgi') return secimKapat();
    const r = [{ ad: 'Ad', sag: it.name }];
    if (v.videoWidth) r.push({ ad: 'Çözünürlük', sag: v.videoWidth + '×' + v.videoHeight });
    if (!canli() && isFinite(v.duration) && v.duration > 0) r.push({ ad: 'Süre', sag: sure(v.duration * 1000) });
    try {
      const b = v.buffered;
      if (b && b.length) r.push({ ad: 'Önde tampon', sag: Math.max(0, Math.round(b.end(b.length - 1) - (v.currentTime || 0))) + ' sn' });
    } catch (e) {
      /* tampon bilgisi yok */
    }
    const bicim = (/\.(m3u8|ts|mp4|mkv|avi|mov|webm)(?:[?#]|$)/i.exec(kaynakUrl) || [])[1];
    r.push({ ad: 'Kaynak', sag: hostOf(kaynakUrl) + (bicim ? ' · ' + bicim.toLowerCase() : '') });
    r.push({ ad: 'Ses / Altyazı yolu', sag: (v.audioTracks ? v.audioTracks.length : 0) + ' / ' + (v.textTracks ? v.textTracks.length : 0) });
    r.push({ ad: 'Ekran', sag: oranBul()[1] });
    if (gecikmeMs) r.push({ ad: 'Ses gecikmesi', sag: gecikmeMs + ' ms' });
    if (canli() && simdiProg) r.push({ ad: 'Program', sag: simdiProg.t });
    if (canli() && provider() && provider().type === 'xtream') r.push({ ad: 'Sağlayıcı arşivi', sag: it.archive ? 'Var · ' + (it.archiveDays || 1) + ' gün' : 'Yok' }); // geri sarma için
    secimAc({ baslik: 'Bilgi', satirlar: r, idx: 0, bilgi: true, calis: secimKapat });
  }

  // Renkli tuşlara atanabilen eylemler (Ayarlar › Kumanda tuşları)
  function oyunEylem(e) {
    if (e === 'fav') {
      if (!sid || (it.kind !== 'live' && it.kind !== 'movie')) return toast('Bu öğe favoriye eklenemez');
      const f = ctx.store.toggleFav(sid, it);
      toast(f ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı');
    } else if (e === 'aspect') {
      const i = ORAN.map((x) => x[0]).indexOf(ctx.store.setting('aspect', 'contain'));
      const y = ORAN[(i + 1) % ORAN.length];
      ctx.store.setSetting('aspect', y[0]);
      oranUygula();
      toast('Görüntü oranı: ' + y[1]);
    } else if (e === 'fmt') {
      if (!canli() || !provider() || provider().type !== 'xtream') return toast('Biçim yalnız Xtream canlı yayında değişir');
      ctx.store.setSetting('liveFmt', fmt() === 'ts' ? 'm3u8' : 'ts');
      toast('Canlı yayın biçimi: ' + (fmt() === 'ts' ? 'MPEG-TS' : 'HLS'));
      baslat();
    } else if (e === 'sleep') {
      uykuDk = UYKU[(UYKU.indexOf(uykuDk) + 1) % UYKU.length];
      clearTimeout(uykuT);
      clearTimeout(uykuUyariT);
      if (uykuDk) {
        uykuUyariT = setTimeout(() => toast('Uyku zamanlayıcısı: 30 sn sonra kapanacak', 5000), Math.max(0, uykuDk * 60000 - 30000));
        uykuT = setTimeout(() => {
          if (kapali) return;
          kaydet();
          pop();
          toast('Uyku zamanlayıcısı: oynatma kapandı');
        }, uykuDk * 60000);
        toast('Uyku zamanlayıcısı: ' + uykuDk + ' dakika');
      } else toast('Uyku zamanlayıcısı kapalı');
    } else if (e === 'last') {
      if (!canli() || onceki < 0 || onceki >= list.length || list.length < 2) return toast('Önceki kanal yok');
      const t = idx;
      idx = onceki;
      onceki = t;
      baslat();
    } else if (e === 'list') {
      listeAc();
      return;
    } else if (e === 'audio') {
      return sesAc();
    } else if (e === 'sub') {
      return altyaziAc();
    } else if (e === 'sync') {
      return senkronAc();
    } else if (e === 'info') {
      return bilgiAc();
    }
    goster();
  }

  return {
    el: kok,
    name: 'player',
    onShow() {
      baslat();
    },
    onHide() {
      durdurKaynak(); // üstüne başka ekran (ör. kayıt oynatma) açılınca yayın arkada çalmasın
      if (medyaDur) medyaDur();
      medyaDur = null;
    },
    onKey(a) {
      // Odak Geri düğmesinde / düğme çubuğunda / kanal listesinde iken yön tuşları oradadır
      if (odak === 'sec') {
        const sc = secim;
        if (sc) secimZamanla();
        if (!sc || a === 'back' || a === 'stop' || a === 'info' || (a === 'left' && !sc.yan)) {
          if (sc) secimKapat();
          else odakAyarla('alt');
          return true;
        }
        if (a === 'up' || a === 'down' || a === 'chup' || a === 'chdown') {
          if (!sc.bilgi) {
            sc.idx = Math.max(0, Math.min(sc.satirlar.length - 1, sc.idx + (a === 'down' || a === 'chdown' ? 1 : -1)));
            secimCiz();
          }
          return true;
        }
        if ((a === 'left' || a === 'right') && sc.yan) sc.yan(a === 'right' ? 1 : -1);
        else if (a === 'ok') sc.calis(sc.idx);
        return true;
      }
      if (odak === 'liste') {
        if (a === 'back' || a === 'left') {
          odakAyarla('alt');
          return true;
        }
        if (a === 'up' || a === 'down' || a === 'ok' || a === 'chup' || a === 'chdown') return kanalListe.key(a);
        return true;
      }
      if (odak === 'ust') {
        if (a === 'ok') {
          kaydet();
          pop();
          return true;
        }
        if (a === 'down') {
          odakAyarla('alt');
          return true;
        }
        if (a === 'up' || a === 'left' || a === 'right') return true;
        if (a !== 'back') odakAyarla('video');
      } else if (odak === 'alt') {
        const d = dugmeler();
        if (a === 'left' || a === 'right') {
          altIdx = Math.max(0, Math.min(d.length - 1, altIdx + (a === 'right' ? 1 : -1)));
          barCiz();
          goster(ODAK_MS);
          return true;
        }
        if (a === 'ok') {
          dugmeCalistir(d[altIdx][0]);
          return true;
        }
        if (a === 'up') {
          odakAyarla('ust');
          return true;
        }
        if (a === 'down') {
          odakAyarla('video');
          return true;
        }
        if (a !== 'back' && a !== 'stop') odakAyarla('video');
      }
      const n = rakam(a);
      if (n >= 0 && canli()) {
        numBuf = (numBuf + n).slice(0, 4);
        numEl.textContent = numBuf;
        numEl.className = 'p-num on';
        clearTimeout(numT);
        numT = setTimeout(numaraGit, 1600);
        return true;
      }
      if (a === 'back' || a === 'stop') {
        kaydet();
        pop();
        return true;
      }
      if (hata && a === 'ok') {
        baslat();
        return true;
      }
      if (a === 'ok' || a === 'play' || a === 'pause') {
        if (canli()) {
          if (a === 'ok') goster();
          else if (a === 'pause') v.pause();
          else v.play();
          return true;
        }
        if (a === 'pause' || (a === 'ok' && !v.paused)) v.pause();
        else v.play();
        goster();
        return true;
      }
      if (a === 'info') {
        bilgiAc();
        return true;
      }
      if (a === 'left' || a === 'rw') {
        if (!canli()) sar(-1);
        else if (arsivVar()) geriAdim(1, a === 'rw');
        else goster();
        return true;
      }
      if (a === 'right' || a === 'ff') {
        if (!canli()) sar(1);
        else if (arsivVar()) geriAdim(-1, a === 'ff');
        else goster();
        return true;
      }
      if (a === 'down' && !oklarKanal()) {
        odakAyarla('alt');
        return true;
      }
      if (a === 'up' && !oklarKanal()) {
        odakAyarla('ust');
        return true;
      }
      if (a === 'down' || a === 'chdown') {
        if (canli()) kanal(1);
        else if (a === 'chdown' && it.kind === 'episode') kanal(1);
        else goster();
        return true;
      }
      if (a === 'up' || a === 'chup') {
        if (canli()) kanal(-1);
        else if (a === 'chup' && it.kind === 'episode') kanal(-1);
        else goster();
        return true;
      }
      if (a === 'red' || a === 'green' || a === 'yellow' || a === 'blue') {
        const e = eylemi(ctx.store, 'oyn', a);
        if (!e) return false;
        oyunEylem(e);
        return true;
      }
      return false;
    },
    destroy() {
      kaydet();
      kapali = true;
      clearInterval(saveT);
      clearInterval(kayitT);
      clearTimeout(geriBeklT);
      if (medyaDur) medyaDur();
      clearTimeout(secimT);
      clearInterval(haricT);
      clearTimeout(ovT);
      clearTimeout(beklT);
      clearTimeout(epgT);
      clearTimeout(numT);
      clearTimeout(uykuT);
      clearTimeout(uykuUyariT);
      durdurKaynak();
      if (sesGrafigi) {
        try {
          sesGrafigi.ac.close();
        } catch (e) {
          /* yoksay */
        }
      }
    },
  };
}
