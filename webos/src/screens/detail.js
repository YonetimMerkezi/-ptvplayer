// Film / dizi ayrıntısı: film için konu ve düğmeler; dizi için sezonlar ve bölümler.
import { ctx, provider, open, ustCubuk } from '../ctx.js';
import { VList } from '../vlist.js';
import { el, esc, px, sure, toast } from '../ui.js';
import * as K from '../log.js';
import { createArkaPlan } from '../vitrin.js';
import { fragmanOynat } from '../fragman.js';

const bolumOge = (item, e) => ({
  id: e.id,
  kind: 'episode',
  episodeId: e.episodeId,
  ext: e.ext,
  url: e.url,
  name: item.name + ' · ' + (e.title || 'Bölüm ' + e.episodeNum),
  logo: e.logo || item.logo,
  seriesName: item.name,
});

export function detailScreen({ item }) {
  const kok = el('div', 'screen detail');
  const src = ctx.store.active();
  const sid = src ? src.id : '';
  const dizi = item.kind === 'series';
  kok.innerHTML =
    '<div class="dt-bg"></div><div class="dt-sh"></div>' +
    ustCubuk(esc(item.name)) +
    '<div class="dt"><div class="dt-poster">' + (item.logo ? '<img src="' + esc(item.logo) + '" alt="">' : '') + '</div>' +
    '<div class="dt-info"><div class="dt-meta" id="meta"></div><div class="dt-plot" id="plot">Yükleniyor…</div>' +
    (dizi ? '<div class="dt-lists"><div class="dt-seasons"></div><div class="dt-eps"></div></div>' : '<div class="dt-btns" id="btns"></div>') +
    '</div></div><div class="hint" id="hint"></div>';
  const hint = kok.querySelector('#hint');
  const arka = createArkaPlan(kok.querySelector('.dt-bg'));
  const plot = kok.querySelector('#plot');
  const meta = kok.querySelector('#meta');
  let seasons = null;
  let eps = null;
  let bolge = 'eps';
  let info = null;
  let btnIdx = 0;

  const metaYaz = (i) => {
    const p = [];
    if (i.year) p.push(esc(String(i.year).slice(0, 10)));
    if (i.genre) p.push(esc(i.genre));
    if (i.rating) p.push('★ ' + esc(i.rating));
    if (i.durationSec) p.push(sure(i.durationSec * 1000));
    meta.innerHTML = p.join(' · ');
    plot.textContent = i.plot || 'Açıklama yok.';
    const g = [i.backdrop, item.backdrop].filter(Boolean);
    if (g.length) arka.goster(g);
  };
  const fragman = () => fragmanOynat(item, info, { net: ctx.net, bildir: (t) => toast(t, 3500) });

  // --- film düğmeleri
  const btnler = () => {
    const kayit = ctx.store.posOf(sid, item.id);
    const devam = kayit.pos > 20000 && (!kayit.dur || kayit.pos < kayit.dur - 30000);
    const l = [];
    if (devam) l.push({ id: 'resume', ad: 'Devam et (' + sure(kayit.pos) + ')' });
    l.push({ id: 'play', ad: devam ? 'Baştan oynat' : 'Oynat' });
    l.push({ id: 'trailer', ad: '▶ Fragman' });
    l.push({ id: 'fav', ad: ctx.store.isFav(sid, item.id) ? 'Favorilerden çıkar' : 'Favorilere ekle' });
    return l;
  };
  let bl = [];
  const btnCiz = () => {
    const k = kok.querySelector('#btns');
    if (!k) return;
    bl = btnler();
    btnIdx = Math.min(btnIdx, bl.length - 1);
    k.innerHTML = bl.map((b, i) => '<div class="f-btn' + (i === btnIdx ? ' on2' : '') + '" data-b="' + i + '">' + esc(b.ad) + '</div>').join('');
  };
  const btnAc = (b) => {
    if (b.id === 'fav') {
      const e = ctx.store.toggleFav(sid, item);
      toast(e ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı');
      btnCiz();
    } else if (b.id === 'trailer') {
      fragman();
    } else {
      open('player', { list: [item], index: 0, fresh: b.id === 'play' });
    }
  };

  // --- dizi: sezon ve bölüm listeleri
  const bolumRender = (e) => {
    const o = bolumOge(item, e);
    const r = ctx.store.posOf(sid, o.id);
    const y = r.dur > 0 ? Math.min(100, Math.round((r.pos / r.dur) * 100)) : 0;
    return '<span class="nm">' + esc(e.episodeNum + '. ' + (e.title || '')) + '</span>' + (y ? '<span class="rk">%' + y + '</span>' : '');
  };
  const diziKur = () => {
    seasons = new VList(kok.querySelector('.dt-seasons'), {
      rowH: Math.round(px() * 3.1),
      render: (s) => '<span class="cn">' + s.season + '. Sezon</span><span class="cc">' + s.episodes.length + '</span>',
      onFocus: (s) => eps.setItems(s.episodes),
      onActivate: () => odak('eps'),
    });
    eps = new VList(kok.querySelector('.dt-eps'), {
      rowH: Math.round(px() * 3.4),
      render: bolumRender,
      onActivate: (e, i) => {
        const s = seasons.cur;
        open('player', { list: s.episodes.map((x) => bolumOge(item, x)), index: i });
      },
    });
    seasons.setItems(info.seasons);
    seasons.setActive(true);
    odak('eps');
  };
  function odak(b) {
    bolge = b;
    if (seasons) seasons.setActive(b === 'seasons');
    if (eps) eps.setActive(b === 'eps');
  }

  const yukle = async () => {
    try {
      if (dizi) {
        info = await provider().seriesInfo(item);
        metaYaz(info);
        if (!info.seasons.length) plot.textContent = 'Bu dizide bölüm bulunamadı.';
        else diziKur();
      } else {
        info = await provider().vodInfo(item);
        metaYaz(info);
        btnCiz();
      }
    } catch (e) {
      K.hata(e);
      plot.textContent = 'Ayrıntı alınamadı: ' + (e && e.message ? e.message : e);
      if (!dizi) btnCiz();
    }
  };
  yukle();

  kok.addEventListener('click', (ev) => {
    const b = ev.target.getAttribute && ev.target.getAttribute('data-b');
    if (b != null) {
      btnIdx = Number(b);
      btnCiz();
      btnAc(bl[btnIdx]);
    }
  });

  return {
    el: kok,
    name: 'detail',
    onShow() {
      hint.innerHTML = dizi ? '▲▼◀▶ gezin · OK: oynat · Kırmızı: fragman · Sarı: favori · Geri' : '◀▶ düğme seç · OK: seç · Kırmızı: fragman · Sarı: favori · Geri';
      if (!dizi) btnCiz();
      else if (seasons) {
        seasons.setItems(seasons.items, true);
        eps.setItems(eps.items, true);
        odak(bolge);
      }
    },
    onKey(a) {
      if (a === 'red') {
        fragman();
        return true;
      }
      if (a === 'yellow') {
        const e = ctx.store.toggleFav(sid, item);
        toast(e ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı');
        if (!dizi) btnCiz();
        return true;
      }
      if (!dizi) {
        if (a === 'up') return false; // ▲: Geri düğmesine çıkılır
        if (a === 'left') btnIdx = Math.max(0, btnIdx - 1);
        else if (a === 'right' || a === 'down') btnIdx = Math.min(bl.length - 1, btnIdx + 1);
        else if (a === 'ok') {
          if (bl[btnIdx]) btnAc(bl[btnIdx]);
          return true;
        } else return false;
        btnCiz();
        return true;
      }
      if (!seasons) return false;
      if (bolge === 'seasons') {
        if (a === 'right' || a === 'ok') {
          odak('eps');
          return true;
        }
        return seasons.key(a);
      }
      if (a === 'left') {
        odak('seasons');
        return true;
      }
      return eps.key(a);
    },
  };
}
