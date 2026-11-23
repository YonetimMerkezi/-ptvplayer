// Bağımlılıksız QR kod üretici (bayt kipi, hata düzeltme düzeyi M, sürüm 1-5: en çok 84 bayt). Fragman bağlantısını telefona okutmak için kullanılır.
// Kaynak yalnız ES5'e çevrilebilen düz yapılar kullanır; Symbol.iterator gerektirmez.

// Sürüm → [veri kodsözcüğü sayısı, blok başına EC kodsözcüğü, blok sayısı] (düzey M)
const SURUMLER = [null, [16, 10, 1], [28, 16, 1], [44, 26, 1], [64, 18, 2], [86, 24, 2]];
const HIZALAMA = [null, [], [6, 18], [6, 22], [6, 26], [6, 30]];
export const QR_EN_COK_BAYT = 84;

// GF(256) işlemleri (polinom 0x11d)
const EXP = [];
const LOG = [];
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
  for (let j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
})();
const carp = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsUretec(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const ng = [];
    for (let k = 0; k <= g.length; k++) ng.push(0);
    for (let j = 0; j < g.length; j++) {
      ng[j] ^= g[j];
      ng[j + 1] ^= carp(g[j], EXP[i]);
    }
    g = ng;
  }
  return g;
}
function rsEc(veri, n) {
  const g = rsUretec(n);
  const r = [];
  for (let i = 0; i < n; i++) r.push(0);
  for (let i = 0; i < veri.length; i++) {
    const f = veri[i] ^ r[0];
    r.shift();
    r.push(0);
    for (let j = 0; j < n; j++) r[j] ^= carp(g[j + 1], f);
  }
  return r;
}

function utf8(s) {
  const out = [];
  const t = unescape(encodeURIComponent(String(s)));
  for (let i = 0; i < t.length; i++) out.push(t.charCodeAt(i));
  return out;
}

// Verili bayt dizisi → araya katılmış (veri + EC) kodsözcükleri
function kodsozcukleri(bayt, surum) {
  const s = SURUMLER[surum];
  const kapasite = s[0];
  const bit = [];
  const ekle = (v, n) => {
    for (let i = n - 1; i >= 0; i--) bit.push((v >>> i) & 1);
  };
  ekle(4, 4); // bayt kipi
  ekle(bayt.length, 8);
  for (let i = 0; i < bayt.length; i++) ekle(bayt[i], 8);
  const sinir = kapasite * 8;
  for (let t = 0; t < 4 && bit.length < sinir; t++) bit.push(0);
  while (bit.length % 8) bit.push(0);
  const cw = [];
  for (let i = 0; i < bit.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bit[i + j];
    cw.push(b);
  }
  for (let p = 0; cw.length < kapasite; p++) cw.push(p % 2 ? 0x11 : 0xec);
  const blokSayisi = s[2];
  const blokBoy = kapasite / blokSayisi;
  const bloklar = [];
  const ecler = [];
  for (let b = 0; b < blokSayisi; b++) {
    const d = cw.slice(b * blokBoy, (b + 1) * blokBoy);
    bloklar.push(d);
    ecler.push(rsEc(d, s[1]));
  }
  const out = [];
  for (let i = 0; i < blokBoy; i++) for (let b = 0; b < blokSayisi; b++) out.push(bloklar[b][i]);
  for (let i = 0; i < s[1]; i++) for (let b = 0; b < blokSayisi; b++) out.push(ecler[b][i]);
  return out;
}

const MASKE = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function bos(n, v) {
  const m = [];
  for (let y = 0; y < n; y++) {
    const s = [];
    for (let x = 0; x < n; x++) s.push(v);
    m.push(s);
  }
  return m;
}

// Maskesiz bir matris kurar: modul[y][x] koyu mu, islev[y][x] işlev deseni mi (veri yazılmaz / maskelenmez)
function iskelet(surum) {
  const n = 17 + 4 * surum;
  const modul = bos(n, false);
  const islev = bos(n, false);
  const koy = (x, y, v) => {
    if (x < 0 || y < 0 || x >= n || y >= n) return;
    modul[y][x] = v;
    islev[y][x] = true;
  };
  const bulucu = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        koy(cx + dx, cy + dy, d !== 2 && d !== 4);
      }
    }
  };
  // Zamanlama çizgileri önce çizilir; bulucu ve hizalama desenleri üzerine yazar
  for (let i = 0; i < n; i++) {
    koy(6, i, i % 2 === 0);
    koy(i, 6, i % 2 === 0);
  }
  bulucu(3, 3);
  bulucu(n - 4, 3);
  bulucu(3, n - 4);
  const h = HIZALAMA[surum];
  for (let a = 0; a < h.length; a++) {
    for (let b = 0; b < h.length; b++) {
      const cx = h[a];
      const cy = h[b];
      if ((a === 0 && b === 0) || (a === 0 && b === h.length - 1) || (a === h.length - 1 && b === 0)) continue; // bulucularla çakışır
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) koy(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  // Biçim bilgisi alanlarını ayır (değer sonra yazılır); koyu modül
  for (let i = 0; i < 9; i++) {
    if (i === 6) continue; // (8,6) ve (6,8) zamanlama çizgisinin parçasıdır
    koy(8, i, false);
    koy(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    koy(n - 1 - i, 8, false);
    koy(8, n - 1 - i, false);
  }
  koy(8, n - 8, true);
  return { n, modul, islev };
}

function bicimYaz(modul, islev, n, maske) {
  const veri = (0 << 3) | maske; // düzey M = 00
  let r = veri;
  for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
  const bits = ((veri << 10) | r) ^ 0x5412;
  const al = (i) => ((bits >>> i) & 1) === 1;
  const koy = (x, y, v) => {
    modul[y][x] = v;
    islev[y][x] = true;
  };
  for (let i = 0; i <= 5; i++) koy(8, i, al(i));
  koy(8, 7, al(6));
  koy(8, 8, al(7));
  koy(7, 8, al(8));
  for (let i = 9; i < 15; i++) koy(14 - i, 8, al(i));
  for (let i = 0; i < 8; i++) koy(n - 1 - i, 8, al(i));
  for (let i = 8; i < 15; i++) koy(8, n - 15 + i, al(i));
  koy(8, n - 8, true);
}

function cezaPuani(m, n) {
  let ceza = 0;
  // Satır/sütunda 5+ aynı renk ve bulucu benzeri desen
  const cizgi = (al) => {
    let seri = 1;
    for (let i = 1; i < n; i++) {
      if (al(i) === al(i - 1)) {
        seri++;
        if (seri === 5) ceza += 3;
        else if (seri > 5) ceza++;
      } else seri = 1;
    }
    const s = [];
    for (let i = 0; i < n; i++) s.push(al(i) ? 1 : 0);
    const metin = s.join('');
    const desenler = ['10111010000', '00001011101'];
    for (let d = 0; d < desenler.length; d++) {
      let k = metin.indexOf(desenler[d]);
      while (k >= 0) {
        ceza += 40;
        k = metin.indexOf(desenler[d], k + 1);
      }
    }
  };
  for (let y = 0; y < n; y++) cizgi((x) => m[y][x]);
  for (let x = 0; x < n; x++) cizgi((y) => m[y][x]);
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) ceza += 3;
  let koyu = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) koyu++;
  ceza += Math.floor(Math.abs(koyu * 20 - n * n * 10) / (n * n)) * 10;
  return ceza;
}

// text → koyu/açık modül matrisi (matris[y][x] true = koyu). Sığmazsa hata atar. maske (0-7): belirtilirse yalnız o maske denenir (test için).
export function qrMatris(text, maske) {
  const bayt = utf8(text);
  let surum = 0;
  for (let v = 1; v < SURUMLER.length; v++) {
    // 4 bit kip + 8 bit uzunluk + veri, kapasiteye sığmalı
    if (4 + 8 + bayt.length * 8 <= SURUMLER[v][0] * 8) {
      surum = v;
      break;
    }
  }
  if (!surum) throw new Error('QR için metin çok uzun (' + bayt.length + ' bayt)');
  const cw = kodsozcukleri(bayt, surum);
  const bitler = [];
  for (let i = 0; i < cw.length; i++) for (let j = 7; j >= 0; j--) bitler.push((cw[i] >>> j) & 1);
  const taban = iskelet(surum);
  const n = taban.n;
  // Veri bitlerini zikzak yerleştir (sağdan sola ikili sütunlar, dönüşümlü yukarı/aşağı)
  const veriYeri = bos(n, -1); // -1: veri değil, aksi halde bit
  let k = 0;
  let yukari = true;
  for (let sag = n - 1; sag >= 1; sag -= 2) {
    if (sag === 6) sag = 5;
    for (let adim = 0; adim < n; adim++) {
      const y = yukari ? n - 1 - adim : adim;
      for (let c = 0; c < 2; c++) {
        const x = sag - c;
        if (taban.islev[y][x]) continue;
        veriYeri[y][x] = k < bitler.length ? bitler[k] : 0;
        k++;
      }
    }
    yukari = !yukari;
  }
  let enIyi = null;
  let enIyiPuan = 1e9;
  for (let mk = maske == null ? 0 : maske; mk < (maske == null ? 8 : maske + 1); mk++) {
    const modul = [];
    const islev = [];
    for (let y = 0; y < n; y++) {
      modul.push(taban.modul[y].slice());
      islev.push(taban.islev[y].slice());
    }
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (veriYeri[y][x] >= 0) modul[y][x] = (veriYeri[y][x] === 1) !== MASKE[mk](x, y);
      }
    }
    bicimYaz(modul, islev, n, mk);
    const p = cezaPuani(modul, n);
    if (p < enIyiPuan) {
      enIyiPuan = p;
      enIyi = modul;
    }
  }
  return enIyi;
}

// text → SVG dizgisi (beyaz zemin, 4 modül sessiz bölge; okuyucular için gerekli). px: ekrandaki kenar uzunluğu.
export function qrSvg(text, px, kenar) {
  const m = qrMatris(text);
  const n = m.length;
  const b = kenar == null ? 4 : kenar;
  const t = n + 2 * b;
  let yol = '';
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!m[y][x]) {
        x++;
        continue;
      }
      let u = 0;
      while (x + u < n && m[y][x + u]) u++;
      yol += 'M' + (x + b) + ' ' + (y + b) + 'h' + u + 'v1h-' + u + 'z';
      x += u;
    }
  }
  const boy = px ? ' width="' + px + '" height="' + px + '"' : '';
  return '<svg xmlns="http://www.w3.org/2000/svg"' + boy + ' viewBox="0 0 ' + t + ' ' + t + '" shape-rendering="crispEdges"><rect width="' + t + '" height="' + t + '" fill="#fff"/><path d="' + yol + '" fill="#000"/></svg>';
}
