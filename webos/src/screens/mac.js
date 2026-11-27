// Maç ayrıntısı: takımlar, skor ve durum, saat, lig, stadyum, yayın kanalları (kullanıcının listesindeki eşleşenler açılır) ve takım takibi.
import { ctx, provider, open, ustCubuk } from '../ctx.js';
import { el, esc, saat, toast } from '../ui.js';
import { kanalAdlari, kullaniciKanallari } from '../spor-veri.js';
import { lgLine } from '../../../www/js/sports.js';
import { cleanFavs, toggleFav, isFavSide, FAV_KEY } from '../../../www/js/sports-fav.js';
import { KIND_LABEL } from '../../../www/js/sports-detail.js';
import * as K from '../log.js';

let canliKanallar = null; // kullanıcının canlı kanalları: kaynak değişmedikçe bir kez yüklenir
let canliSid = '';

// Dönüş: { adlar: yayıncı adları, hits: kullanıcının listesindeki eşleşen kanallar, durum: bulunamadıysa açıklama }
export async function kanallariBul(veri, m, gun) {
  const y = await veri.yayin(gun);
  const adlar = kanalAdlari(m, y);
  if (!adlar.length) return { adlar: [], hits: [], durum: y ? 'Bu maç için yayın kanalı bulunamadı' : 'Yayın bilgisi alınamadı' };
  const p = provider();
  if (!p) return { adlar, hits: [], durum: '' };
  const s = ctx.store.active();
  const sid = s ? s.id : '';
  if (!canliKanallar || canliSid !== sid) {
    canliKanallar = await p.all('live');
    canliSid = sid;
  }
  return { adlar, hits: kullaniciKanallari(canliKanallar, adlar), durum: '' };
}

export function macScreen(p) {
  const m = p.m;
  const kok = el('div', 'screen mac');
  const src = ctx.store.active();
  const ad = (s) => s.label || s.name;
  const durumMetni = m.state === 'in' ? m.text || 'Canlı' : m.state === 'post' || m.off ? m.text || 'MS' : saat(m.t);
  const skor = m.home.score != null && m.away.score != null ? m.home.score + ' - ' + m.away.score : 'v';
  kok.innerHTML =
    ustCubuk('Maç', src ? esc(src.name) : '') +
    '<div class="mc"><div class="mc-lg">' + esc(lgLine(m)) + (m.venue ? ' · ' + esc(m.venue) : '') + '</div>' +
    '<div class="mc-sc"><span class="mc-h">' + esc(ad(m.home)) + '</span><span class="mc-m"><b>' + esc(skor) + '</b><i class="' + (m.state === 'in' ? 'live' : '') + '">' + esc(durumMetni) + '</i></span><span class="mc-a">' + esc(ad(m.away)) + '</span></div>' +
    '<div class="mc-yt" id="mc-yt">Yayın kanalı aranıyor…</div><div class="mc-b" id="mc-b"></div>' +
    '<div class="mc-ev" id="mc-ev"></div></div>' +
    '<div class="hint">▲▼ gezin · OK: seç · Sarı: ev sahibini takip et · Mavi: deplasmanı takip et · Geri</div>';
  const ytEl = kok.querySelector('#mc-yt');
  const kapEl = kok.querySelector('#mc-b');
  const evEl = kok.querySelector('#mc-ev');
  let kanal = null; // kanallariBul sonucu
  let secili = 0;
  let kapali = false;
  let dugmeler = [];

  const favler = () => cleanFavs(ctx.store.setting(FAV_KEY, []));
  const dugmeleriKur = () => {
    const f = favler();
    const l = [];
    if (kanal && kanal.hits.length) for (let i = 0; i < kanal.hits.length; i++) l.push({ id: 'k' + i, ad: '▶ ' + kanal.hits[i].name, ac: i });
    l.push({ id: 'home', ad: (isFavSide(f, m.home) ? '★ ' : '☆ ') + ad(m.home) + (isFavSide(f, m.home) ? ' takipte (çıkar)' : ' takip et') });
    l.push({ id: 'away', ad: (isFavSide(f, m.away) ? '★ ' : '☆ ') + ad(m.away) + (isFavSide(f, m.away) ? ' takipte (çıkar)' : ' takip et') });
    dugmeler = l;
    secili = Math.max(0, Math.min(l.length - 1, secili));
    kapEl.innerHTML = l.map((b, i) => '<div class="f-btn' + (i === secili ? ' on' : '') + '" data-i="' + i + '">' + esc(b.ad) + '</div>').join('');
  };
  const yayinYaz = () => {
    if (!kanal) return;
    if (kanal.adlar.length) ytEl.innerHTML = '<b>Yayın:</b> ' + esc(kanal.adlar.join(', ')) + (kanal.hits.length ? '' : '<span class="dim"> · listenizde bu kanallar bulunamadı</span>');
    else ytEl.innerHTML = '<span class="dim">' + esc(kanal.durum || 'Yayın kanalı bulunamadı') + '</span>';
  };

  // Olaylar (gol, kart, VAR): değişiklikler sıklığı yüzünden listelenmez; en çok EV_SATIR satır, fazlası en yeniler kalacak biçimde kısaltılır
  const EV_SATIR = 8;
  const evKisa = { goal: 'Gol', own: 'Kendi kalesine', penmiss: 'Penaltı kaçtı', yellow: 'Sarı kart', red: 'Kırmızı kart', var: 'VAR' };
  const olaylariYaz = (r) => {
    if (kapali) return;
    if (!r || r.durum === 'baslamadi') {
      evEl.innerHTML = m.state === 'pre' ? '' : '<div class="ev-bos">Olay bilgisi yok</div>';
      return;
    }
    const l = (r.events || []).filter((e) => evKisa[e.kind]);
    if (!l.length) {
      evEl.innerHTML = '<div class="ev-h">Olaylar</div><div class="ev-bos">' + (r.durum === 'ok' ? 'Henüz önemli olay yok' : 'Bu maç için olay bilgisi bulunamadı') + '</div>';
      return;
    }
    const gor = l.slice(-EV_SATIR);
    const ek = l.length - gor.length;
    evEl.innerHTML =
      '<div class="ev-h">Olaylar</div>' +
      (ek > 0 ? '<div class="ev-bos">+' + ek + ' önceki olay</div>' : '') +
      gor
        .map((e) => {
          const takim = e.side === 'home' ? ad(m.home) : e.side === 'away' ? ad(m.away) : '';
          const kisi = e.player || takim;
          const detay = e.detail && e.kind === 'goal' && e.detail !== KIND_LABEL.goal ? ' (' + e.detail + ')' : '';
          return (
            '<div class="ev-r ev-' + e.kind + (e.side ? ' ev-' + e.side : '') + '"><span class="ev-m">' + esc(e.minute) + '</span><span class="ev-k">' + esc(evKisa[e.kind]) + '</span><span class="ev-p">' +
            '<b>' + esc(kisi + detay) + '</b>' + (e.player && takim ? '<i>' + esc(takim) + '</i>' : '') + '</span>' + (e.score && (e.kind === 'goal' || e.kind === 'own') ? '<span class="ev-s">' + esc(e.score) + '</span>' : '') + '</div>'
          );
        })
        .join('');
  };
  const olaylariAl = (zorla) => {
    if (!p.veri || !p.veri.ozet || m.state === 'pre' || m.off) return olaylariYaz({ durum: 'baslamadi' });
    p.veri.ozet(m, zorla).then(olaylariYaz, (e) => {
      if (kapali) return;
      K.uyar('Maç olayları: ' + (e && e.message ? e.message : e));
      evEl.innerHTML = '<div class="ev-h">Olaylar</div><div class="ev-bos">Olaylar alınamadı</div>';
    });
  };

  const takipDegis = (taraf) => {
    const s = taraf === 'home' ? m.home : m.away;
    const r = toggleFav(favler(), s);
    if (r.full) return toast('En çok 30 takım takip edilebilir');
    ctx.store.setSetting(FAV_KEY, r.favs);
    toast(ad(s) + (r.on ? ' takip ediliyor' : ' takipten çıkarıldı'));
    dugmeleriKur();
  };
  const calistir = (b) => {
    if (!b) return;
    if (b.id === 'home' || b.id === 'away') return takipDegis(b.id);
    // Seçilen kanal başa gelir; diğer eşleşenler P+/P− ile gezilebilir
    const hits = kanal.hits.slice(b.ac).concat(kanal.hits.slice(0, b.ac));
    open('player', { list: hits, index: 0 });
  };

  kok.addEventListener('click', (e) => {
    let n = e.target;
    while (n && n !== kok && !(n.getAttribute && n.getAttribute('data-i') !== null)) n = n.parentNode;
    if (!n || n === kok) return;
    secili = Number(n.getAttribute('data-i'));
    dugmeleriKur();
    calistir(dugmeler[secili]);
  });

  dugmeleriKur();
  if (m.state !== 'pre' && !m.off) evEl.innerHTML = '<div class="ev-h">Olaylar</div><div class="ev-bos">Olaylar yükleniyor…</div>';
  olaylariAl(false);
  // Canlı maçta olaylar dakikada bir tazelenir (yanıt küçük; yalnız maç ekranı açıkken)
  const evT = m.state === 'in' ? setInterval(() => olaylariAl(true), 60000) : 0;
  kanallariBul(p.veri, m, p.gun).then(
    (k) => {
      if (kapali) return;
      kanal = k;
      yayinYaz();
      dugmeleriKur();
    },
    (e) => {
      if (kapali) return;
      K.uyar('Maç yayın kanalı: ' + (e && e.message ? e.message : e));
      ytEl.innerHTML = '<span class="dim">Kanal listesi alınamadı</span>';
    },
  );

  return {
    el: kok,
    name: 'mac',
    onKey(a) {
      if (a === 'yellow') {
        takipDegis('home');
        return true;
      }
      if (a === 'blue') {
        takipDegis('away');
        return true;
      }
      if (a === 'ok') {
        calistir(dugmeler[secili]);
        return true;
      }
      if (a === 'down') {
        if (secili < dugmeler.length - 1) {
          secili++;
          dugmeleriKur();
        }
        return true;
      }
      if (a === 'up' && secili > 0) {
        secili--;
        dugmeleriKur();
        return true;
      }
      return a === 'left' || a === 'right'; // ▲ ilk düğmede Geri düğmesine çıkar
    },
    destroy() {
      kapali = true;
      if (evT) clearInterval(evT);
    },
  };
}
