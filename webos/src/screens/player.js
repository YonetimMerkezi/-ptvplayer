// Oynatıcı: HTML5 <video> (webOS yerel HLS/TS/MP4 çözücüsü). Canlıda kanal değiştirme ve sayı tuşları,
// film/bölümde ileri-geri sarma, kaldığı yerden devam ve bölüm sonunda sıradaki bölüm.
import { ctx, provider, pop } from '../ctx.js';
import { rakam } from '../keys.js';
import { VList } from '../vlist.js';
import { el, esc, saat, sure, toast } from '../ui.js';
import { eylemi, atamalar, eylemAdi } from '../kumanda.js';
import * as K from '../log.js';

const HATA = {
  1: 'Oynatma iptal edildi',
  2: 'Ağ hatası: yayın alınamadı',
  3: 'Görüntü çözülemedi (desteklenmeyen kodek olabilir)',
  4: 'Biçim desteklenmiyor ya da adres geçersiz',
};

export function playerScreen({ list, index, fresh }) {
  const kok = el('div', 'screen player');
  const src = ctx.store.active();
  const sid = src ? src.id : '';
  kok.innerHTML =
    '<video id="vid"></video>' +
    '<div class="p-ov"><div class="p-top"><div class="p-l"><div class="top-back" data-geri="1">‹ Geri</div><div class="p-title"></div></div><div class="p-r"><span class="p-fmt"></span><span class="clock"></span></div></div>' +
    '<div class="p-bot"><div class="p-epg"></div><div class="p-bar"><i></i></div><div class="p-time"></div><div class="p-acts"></div><div class="p-hint"></div></div></div>' +
    '<div class="p-list"><div class="p-list-in"></div></div>' +
    '<div class="p-spin"></div><div class="p-msg"></div><div class="p-num"></div>';
  kok.addEventListener('mousemove', () => {
    if (!kapali) goster();
  });
  const v = kok.querySelector('#vid');
  const ov = kok.querySelector('.p-ov');
  const titleEl = kok.querySelector('.p-title');
  const fmtEl = kok.querySelector('.p-fmt');
  const epgEl = kok.querySelector('.p-epg');
  const barEl = kok.querySelector('.p-bar');
  const barI = barEl.firstChild;
  const timeEl = kok.querySelector('.p-time');
  const hintEl = kok.querySelector('.p-hint');
  const actsEl = kok.querySelector('.p-acts');
  const listEl = kok.querySelector('.p-list');
  const spin = kok.querySelector('.p-spin');
  const msg = kok.querySelector('.p-msg');
  const numEl = kok.querySelector('.p-num');

  let idx = Math.max(0, Math.min(list.length - 1, index || 0));
  let it = list[idx];
  let kapali = false;
  let bekleyenSeek = 0; // ms
  let ovT = 0;
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
  let uykuT = 0;
  let uykuUyariT = 0;
  const ORAN = [['contain', 'Sığdır'], ['cover', 'Doldur (kırp)'], ['fill', 'Uzat']];
  const UYKU = [0, 15, 30, 45, 60, 90];

  const canli = () => it.kind === 'live';
  const fmt = () => ctx.store.setting('liveFmt', 'm3u8');

  const oranUygula = () => {
    const o = ctx.store.setting('aspect', 'contain');
    v.style.objectFit = o;
  };
  oranUygula();
  const hostOf = (u) => (/^[a-z]+:\/\/([^/?#]+)/i.exec(String(u)) || [])[1] || '?';

  function goster(ms) {
    ov.className = 'p-ov on';
    clearTimeout(ovT);
    if (ms !== 0 && odak === 'video') ovT = setTimeout(gizle, ms || 4500);
  }
  function gizle() {
    if (hata || odak !== 'video') return;
    ov.className = 'p-ov';
  }
  // Odak bölgesini değiştirir: Geri düğmesi / düğme çubuğu açıkken katman ekranda kalır
  function odakAyarla(o) {
    odak = o;
    const geri = kok.querySelector('.top-back');
    if (geri) geri.className = 'top-back' + (o === 'ust' ? ' on' : '');
    barCiz();
    listEl.className = 'p-list' + (o === 'liste' ? ' on' : '');
    if (o === 'video') goster();
    else goster(0);
  }
  // Düğme çubuğu: canlıda kanal işlemleri, filmde sarma
  const dugmeler = () =>
    canli()
      ? [['list', 'Kanallar'], ['last', 'Önceki kanal'], ['fav', 'Favori'], ['aspect', 'Oran'], ['sleep', 'Uyku'], ['fmt', 'Biçim']]
      : [['rw', '−10 sn'], ['pp', v.paused ? 'Oynat' : 'Duraklat'], ['ff', '+10 sn'], ['aspect', 'Oran'], ['sleep', 'Uyku']].concat(it.kind === 'episode' && list.length > 1 ? [['next', 'Sonraki bölüm']] : []);
  function barCiz() {
    const d = dugmeler();
    altIdx = Math.max(0, Math.min(d.length - 1, altIdx));
    actsEl.innerHTML = d.map((x, i) => '<span class="p-b' + (odak === 'alt' && i === altIdx ? ' on' : '') + '" data-a="' + x[0] + '">' + x[1] + '</span>').join('');
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
  const KISA = { fav: 'Favori', aspect: 'Oran', fmt: 'Biçim', list: 'Kanallar', sleep: 'Uyku', last: 'Önceki', info: 'Bilgi' };
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
      ? '<span class="p-k">▲ Geri</span><span class="p-k">▼ Menü</span><span class="p-k">P+ P− Kanal</span><span class="p-k">0–9 Numara</span>' + renkliIpucu()
      : '<span class="p-k">◀▶ 10 sn</span><span class="p-k">OK Duraklat</span><span class="p-k">▲ Geri</span><span class="p-k">▼ Menü</span>' + (list.length > 1 ? '<span class="p-k">P+ P− Bölüm</span>' : '');
    barCiz();
  };

  function zamanGuncelle() {
    const d = v.duration;
    const t = v.currentTime || 0;
    if (!canli() && isFinite(d) && d > 0) {
      barEl.style.display = '';
      barI.style.width = Math.min(100, (t / d) * 100) + '%';
      timeEl.textContent = sure(t * 1000) + ' / ' + sure(d * 1000);
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
    if (!sid || !it || canli()) return;
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
    const url = p ? p.urlFor(it, fmt()) : '';
    if (!url) {
      return hataGoster('Oynatma adresi bulunamadı');
    }
    bekleyenSeek = 0;
    if (!canli() && !(fresh && idx === index)) {
      const r = ctx.store.posOf(sid, it.id);
      if (r.pos > 20000 && (!r.dur || r.pos < r.dur - 30000)) bekleyenSeek = r.pos;
    }
    K.bilgi('Oynat: ' + it.name + ' [' + (it.kind || '?') + '] ' + hostOf(url));
    if (sid && canli()) ctx.store.touch(sid, it, 0, 0);
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
    const c = v.error ? v.error.code : 0;
    hataGoster((HATA[c] || 'Oynatılamadı') + (canli() ? ' · OK: yeniden dene · Sarı: biçimi değiştir' : ' · OK: yeniden dene'));
  });
  v.addEventListener('ended', () => {
    if (canli()) return;
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
    } else if (e === 'info') {
      if (ov.className.indexOf('on') >= 0 && !hata) gizle();
      else goster();
    }
    goster();
  }

  return {
    el: kok,
    name: 'player',
    onShow() {
      baslat();
    },
    onKey(a) {
      // Odak Geri düğmesinde / düğme çubuğunda / kanal listesinde iken yön tuşları oradadır
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
          goster(0);
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
        if (ov.className.indexOf('on') >= 0 && !hata) gizle();
        else goster();
        return true;
      }
      if (a === 'left' || a === 'rw') {
        if (!canli()) sar(-1);
        else goster();
        return true;
      }
      if (a === 'right' || a === 'ff') {
        if (!canli()) sar(1);
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
      clearTimeout(ovT);
      clearTimeout(beklT);
      clearTimeout(epgT);
      clearTimeout(numT);
      clearTimeout(uykuT);
      clearTimeout(uykuUyariT);
      durdurKaynak();
    },
  };
}
