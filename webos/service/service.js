// Iptv Player Pro · TV içi JS servisi (webOS 3.x/4.x: Node.js 0.12 → yalnız ES5, bağımlılık yok).
// Uygulama (paketlenmiş web uygulaması) başka sunuculara XHR atınca tarayıcı CORS kuralı engelleyebilir;
// bu servis isteği Node tarafında yapar, yanıtı parça parça luna köprüsünden uygulamaya verir.
//
//   fetch {url, headers, timeoutMs, chunk} → {returnValue, status, data, id, done}
//   read  {id, offset, length}              → {returnValue, data, done}
//
// Telefondan kaynak aktarma (yerel ağda küçük HTTP alıcı; ekran açıkken çalışır, kapanınca durur):
//   aliciBaslat {}                          → {returnValue, port, pin, adresler[], kalanMs}
//   aliciSor    {}                          → {returnValue, alinan[{id, tip, ad, url, server, user, pass}], kalanMs}
//   aliciSonuc  {id, durum, mesaj}          → {returnValue}   (durum: 'tamam' | 'hata'; telefondaki bekleyen isteğe iletilir)
//   aliciDurdur {}                          → {returnValue}
//
// Medya merkezi (USB bellek): dosyaları listeler ve yerel (127.0.0.1) bir HTTP sunucusuyla Range destekli sunar;
// uygulama <video>/<audio>/<img> adresi olarak kullanır. Uygulama medyaSor ile sürekli sorar, sormayı keserse sunucu kapanır.
//   medyaKokler {}                          → {returnValue, kokler[{ad, yol}]}
//   medyaListele {yol}                      → {returnValue, yol, ogeler[{ad, dir, boyut, zaman}], kesildi}
//   medyaBaslat {}                          → {returnValue, port, jeton}      (adres: http://127.0.0.1:port/jeton/<kodlanmış yol>)
//   medyaSor {}                             → {returnValue, port, jeton}      (canlı tutar)
//   medyaDurdur {}                          → {returnValue}
//
// Telefon kumandası (kaynak aktarma alıcısından ayrı sunucu; telefon tarayıcısı http://TV-IP:port/k?k=KOD açar):
//   kumandaBaslat {pin, sifirla}            → {returnValue, port, pin, adresler[]}   (pin 4 hane verilirse sabit kalır)
//   kumandaSor    {bekleMs}                 → {returnValue, komutlar[{t:'tus'|'metin'|'oynat', ...}], telefon}   (uzun yoklama; 20 sn sorulmazsa kapanır)
//   kumandaDurdur {}                        → {returnValue}
//
// Fragman dönüşü: fragman sayfası uygulamanın kendi penceresinde açılır; YouTube Geri ile pencereyi kapatınca uygulama da kapanır.
// Bekçi uygulamanın kapandığını görünce onu yeniden açar (launch parametresi: {donus: 1, tani}).
//   donusKur   {uyg, params, sureMs}        → {returnValue}      (uygulama çalışıyorken çağrılır; kapanırsa yeniden açılır)
//   donusDurum {}                           → {returnValue, durum, tani[], uyg}
//   donusIptal {}                           → {returnValue}
//
// Kayıt (deneme): canlı yayını (MPEG-TS) USB belleğe/diske yazar; yazılamazsa nedenini açıkça bildirir.
//   kayitBaslat {url, ad, sureSn}           → {returnValue, id, dosya, disk}
//   kayitDurum  {id}                        → {returnValue, durum, bayt, sureMs, dosya, disk, http, mesaj}
//   kayitDurdur {id}                        → {returnValue, durum, ...}
//   kayitAlan   {}                          → {returnValue, diskler[{ad, yol, yazilabilir, hata, bos}]}   (bos: boş bayt, bilinmiyorsa null)
'use strict';

var http = require('http');
var https = require('https');
var zlib = require('zlib');
var urlm = require('url');
var os = require('os');
var childProc = require('child_process');
var crypto = require('crypto');
var fs = require('fs');
var pathm = require('path');

var SERVIS_ADI = 'com.koruk.iptv.webos.service';
var MAX_BAYT = 48 * 1024 * 1024; // TV belleği sınırlı: daha büyük yanıt reddedilir
var MAX_YONLENDIRME = 5;
var SAKLAMA_MS = 120000;
var SAKLAMA_ADET = 6;
var UA = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.122 Safari/537.36';

var depo = {};
var sayac = 0;

function temizle() {
  var simdi = Date.now();
  var anahtarlar = Object.keys(depo);
  var i;
  for (i = 0; i < anahtarlar.length; i++) {
    if (simdi - depo[anahtarlar[i]].t > SAKLAMA_MS) delete depo[anahtarlar[i]];
  }
  anahtarlar = Object.keys(depo);
  while (anahtarlar.length > SAKLAMA_ADET) {
    var enEski = anahtarlar[0];
    for (i = 1; i < anahtarlar.length; i++) if (depo[anahtarlar[i]].t < depo[enEski].t) enEski = anahtarlar[i];
    delete depo[enEski];
    anahtarlar = Object.keys(depo);
  }
}

function basliklariBirlestir(ozel) {
  var b = { 'User-Agent': UA, Accept: '*/*', 'Accept-Encoding': 'gzip, deflate', Connection: 'close' };
  if (ozel && typeof ozel === 'object') {
    for (var k in ozel) if (Object.prototype.hasOwnProperty.call(ozel, k)) b[k] = ozel[k];
  }
  return b;
}

// Tek istek (yönlendirmeleri izler). Sertifika doğrulaması bilerek gevşektir: 2016-2017 TV'lerin kök sertifika
// listesi eskidir ve IPTV sunucularının çoğu kendinden imzalıdır; adresi kullanıcı kendisi girer.
function istek(adres, basliklar, bitis, kalan, cb, sinir) {
  var u;
  try {
    u = urlm.parse(adres);
  } catch (e) {
    return cb(e);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return cb(new Error('Desteklenmeyen adres'));
  var kalanMs = bitis - Date.now();
  if (kalanMs <= 0) return cb(new Error('Zaman aşımı'));
  var bitti = false;
  var req;
  function son(e, r) {
    if (bitti) return;
    bitti = true;
    cb(e, r);
  }
  var lib = u.protocol === 'https:' ? https : http;
  req = lib.request(
    { protocol: u.protocol, hostname: u.hostname, port: u.port, path: u.path, method: 'GET', headers: basliklar, rejectUnauthorized: false, agent: false },
    function (res) {
      var kod = res.statusCode;
      if (kod >= 300 && kod < 400 && res.headers.location) {
        res.resume();
        if (kalan <= 0) return son(new Error('Çok fazla yönlendirme'));
        bitti = true;
        return istek(urlm.resolve(adres, res.headers.location), basliklar, bitis, kalan - 1, cb, sinir);
      }
      var akis = res;
      var kodlama = String(res.headers['content-encoding'] || '').toLowerCase();
      if (kodlama === 'gzip') akis = res.pipe(zlib.createGunzip());
      else if (kodlama === 'deflate') akis = res.pipe(zlib.createInflate());
      var parcalar = [];
      var boyut = 0;
      akis.on('data', function (c) {
        boyut += c.length;
        if (boyut > (sinir || MAX_BAYT)) {
          req.abort();
          return son(new Error('Yanıt çok büyük'));
        }
        parcalar.push(c);
      });
      akis.on('end', function () {
        son(null, { status: kod, body: Buffer.concat(parcalar) });
      });
      akis.on('error', function (e) {
        son(e);
      });
    }
  );
  req.setTimeout(kalanMs, function () {
    req.abort();
    son(new Error('Zaman aşımı'));
  });
  req.on('error', function (e) {
    son(e);
  });
  req.end();
}

function metne(tampon) {
  var m = tampon.toString('utf8');
  return m.charCodeAt(0) === 0xfeff ? m.slice(1) : m;
}

// cb(hata, yanit)
function getir(p, cb) {
  temizle();
  var adres = p && p.url ? String(p.url) : '';
  if (!adres) return cb(new Error('Adres yok'));
  var sure = p.timeoutMs > 0 ? p.timeoutMs : 30000;
  var parca = p.chunk > 0 ? p.chunk : 262144;
  istek(adres, basliklariBirlestir(p.headers), Date.now() + sure, MAX_YONLENDIRME, function (e, r) {
    if (e) return cb(e);
    var metin = metne(r.body);
    var yanit = { returnValue: true, status: r.status, total: metin.length };
    if (metin.length <= parca) {
      yanit.data = metin;
      yanit.done = true;
      return cb(null, yanit);
    }
    var id = 'r' + ++sayac;
    depo[id] = { metin: metin, t: Date.now(), ilk: parca, okunan: 0 };
    yanit.data = metin.slice(0, parca);
    yanit.id = id;
    yanit.done = false;
    cb(null, yanit);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Resim yedeği: <img> doğrudan yüklenemezse (eski TV'lerin kök sertifika listesi eski; bazı sunucular başvuranı denetler)
// resmi bu servis getirir ve data: adresi olarak verir. Yalnız küçük resimler (kanal logoları) için.
// ---------------------------------------------------------------------------------------------------------------
var RESIM_EN_FAZLA = 160 * 1024; // luna yanıtı (base64) ~215 KB: parçalı okuma gerekmez
var RESIM_SURE_MS = 12000;

// İlk baytlardan resim türü; resim değilse ''.
function resimTuru(b) {
  if (!b || b.length < 4) return '';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return 'image/x-icon';
  var bas = b.toString('utf8', 0, Math.min(b.length, 400)).replace(/^﻿/, '').trim().toLowerCase();
  if (bas.indexOf('<svg') === 0 || (bas.indexOf('<?xml') === 0 && bas.indexOf('<svg') > 0)) return 'image/svg+xml';
  return '';
}

function resimGetir(p, cb) {
  var adres = p && p.url ? String(p.url) : '';
  if (!/^https?:\/\//i.test(adres)) return cb(new Error('Adres yok'));
  var kok = (/^(https?:\/\/[^\/?#]+)/i.exec(adres) || [])[1] || '';
  var basliklar = basliklariBirlestir({ Accept: 'image/*,*/*;q=0.8', Referer: kok + '/' });
  istek(
    adres,
    basliklar,
    Date.now() + RESIM_SURE_MS,
    MAX_YONLENDIRME,
    function (e, r) {
      if (e) return cb(e);
      if (r.status !== 200) return cb(new Error('HTTP ' + r.status));
      var tur = resimTuru(r.body);
      if (!tur) return cb(new Error('Resim değil'));
      cb(null, { returnValue: true, mime: tur, data: r.body.toString('base64') });
    },
    RESIM_EN_FAZLA
  );
}

function oku(p) {
  var kayit = depo[p && p.id];
  if (!kayit) return { returnValue: false, errorText: 'Oturum bitti (yanıt artık bellekte değil)' };
  kayit.t = Date.now();
  var bas = p.offset > 0 ? p.offset : 0;
  var uz = p.length > 0 ? p.length : 262144;
  var data = kayit.metin.slice(bas, bas + uz);
  var bitti = bas + uz >= kayit.metin.length;
  // Parçalar paralel ve sırasız istenebilir: kayıt, ilk yanıtın dışında kalan tüm karakterler okunduktan sonra silinir
  kayit.okunan += data.length;
  if (kayit.okunan >= kayit.metin.length - kayit.ilk) delete depo[p.id];
  return { returnValue: true, data: data, done: bitti };
}

// ---------------------------------------------------------------------------------------------------------------
// Telefondan aktarma alıcısı
// Güvenlik: yalnız yerel ağ; 4 haneli kod TV ekranında görünür, yanlış kod sayısı sınırlıdır (8), ekran kapanınca ya da
// 10 dakika sonra alıcı durur. Telefon, sayfadaki formu gönderir; bağlantı denemesi TV uygulamasında yapılır, sonuç
// (eklendi / hata) telefondaki bekleyen isteğe aynı yanıtla döner.
// ---------------------------------------------------------------------------------------------------------------
var ALICI_ILK_PORT = 8780;
var ALICI_PORT_ADEDI = 20;
var ALICI_OMUR_MS = 10 * 60 * 1000;
var ALICI_SORU_MS = 20000; // uygulama bu süredir sormuyorsa (ekran kapandı) alıcı durur
var ALICI_CEVAP_MS = 60000; // telefondaki isteğin TV'den sonuç bekleme süresi
var ALICI_MAX_GOVDE = 8192;
var ALICI_MAX_YANLIS = 8;
var ALICI_MAX_KUYRUK = 5;

var alici = null;
var kapaninca = null; // servis katmanı: alıcı kapanınca canlı tutma etkinliğini bırakır

// ---- Fragman dönüşü: uygulama kapanınca yeniden aç ----
var DONUS_SORGU_MS = 1000;
var DONUS_EN_AZ_MS = 60000;
var DONUS_EN_COK_MS = 3 * 3600 * 1000;
var DONUS_DOSYA = pathm.join(os.tmpdir(), 'iptv-donus.json');
var donus = null; // etkin bekçi
var donusSon = null; // son bekçinin özeti (bitince de kalır)
var donusCagri = null; // servis katmanı: (uri, params, cb(yanit|null)) — yoksa bekçi kurulamaz
var DONUS_YOLLARI = [
  ['running', 'luna://com.webos.applicationManager/running'],
  ['running', 'luna://com.webos.service.applicationmanager/running'],
  ['onde', 'luna://com.webos.applicationManager/getForegroundAppInfo'],
  ['onde', 'luna://com.webos.service.applicationmanager/getForegroundAppInfo']
];

function donusYaz(d) {
  donusSon = { durum: d.durum, uyg: d.uyg, tani: d.tani.slice(0, 30), zaman: Date.now() };
  try {
    fs.writeFileSync(DONUS_DOSYA, JSON.stringify(donusSon));
  } catch (e) {
    /* /tmp yazılamıyorsa yalnız bellekte kalır */
  }
}

function donusNot(d, metin) {
  d.tani.push(metin);
  if (d.tani.length > 40) d.tani.splice(1, d.tani.length - 40);
}

function donusBitir(d, durum) {
  if (!d || d.bitti) return;
  d.bitti = true;
  d.durum = durum;
  if (d.zaman) clearInterval(d.zaman);
  d.zaman = null;
  if (donus === d) donus = null;
  donusNot(d, durum);
  donusYaz(d);
  if (kapaninca) kapaninca();
}

function donusIptal() {
  if (donus) donusBitir(donus, 'iptal');
  return { returnValue: true };
}

function donusDurum() {
  var o = donus ? { durum: donus.durum, uyg: donus.uyg, tani: donus.tani.slice(0, 30) } : donusSon;
  if (!o) {
    try {
      o = JSON.parse(fs.readFileSync(DONUS_DOSYA, 'utf8'));
    } catch (e) {
      o = null;
    }
  }
  if (!o) return { returnValue: true, durum: 'yok', tani: [], uyg: '' };
  return { returnValue: true, durum: o.durum, tani: o.tani || [], uyg: o.uyg || '' };
}

// Bir sorguyu bir kez yapar; yanıt gelmezse 3 sn sonra null ile döner
function donusSorgu(uri, cb) {
  var bitti = false;
  var t = setTimeout(function () {
    if (!bitti) {
      bitti = true;
      cb(null);
    }
  }, 3000);
  try {
    donusCagri(uri, {}, function (r) {
      if (bitti) return;
      bitti = true;
      clearTimeout(t);
      cb(r || null);
    });
  } catch (e) {
    if (!bitti) {
      bitti = true;
      clearTimeout(t);
      cb(null);
    }
  }
}

// Uygulama çalışıyor mu? true/false; hiçbir yol yanıt vermezse null. Çalışan yol aklında tutulur.
function donusCalisiyorMu(d, cb) {
  var sira = d.yol >= 0 ? [d.yol] : [0, 1, 2, 3];
  var i = 0;
  var dene = function () {
    if (i >= sira.length) return cb(null);
    var k = sira[i++];
    donusSorgu(DONUS_YOLLARI[k][1], function (r) {
      var j;
      if (r && r.returnValue !== false) {
        if (DONUS_YOLLARI[k][0] === 'running' && r.running && r.running.length !== undefined) {
          var bulundu = false;
          for (j = 0; j < r.running.length; j++) if (r.running[j] && r.running[j].id === d.uyg) bulundu = true;
          if (d.yol < 0) donusNot(d, 'yol: ' + DONUS_YOLLARI[k][1] + ' (' + r.running.length + ' uygulama)');
          d.yol = k;
          return cb(bulundu);
        }
        if (DONUS_YOLLARI[k][0] === 'onde' && typeof r.appId === 'string') {
          if (d.yol < 0) donusNot(d, 'yol: ' + DONUS_YOLLARI[k][1] + ' (ön: ' + r.appId + ')');
          d.yol = k;
          return cb(r.appId === d.uyg);
        }
      }
      if (d.yol < 0) donusNot(d, 'yanıtsız: ' + DONUS_YOLLARI[k][1] + (r && r.errorText ? ' (' + r.errorText + ')' : ''));
      if (d.yol >= 0) return cb(null); // çalışan yol bu kez yanıt vermedi: sonra yeniden denenir
      dene();
    });
  };
  dene();
}

function donusAc(d, deneme) {
  var bitti = false;
  var t = setTimeout(function () {
    if (!bitti) {
      bitti = true;
      sonuc(null);
    }
  }, 4000);
  var sonuc = function (r) {
    if (r && r.returnValue !== false) {
      donusNot(d, 'yeniden açıldı (' + deneme + '. deneme)');
      return donusBitir(d, 'açıldı');
    }
    donusNot(d, 'açma ' + deneme + ' başarısız' + (r && r.errorText ? ': ' + r.errorText : ''));
    if (deneme >= 5) return donusBitir(d, 'açılamadı');
    d.acmaT = setTimeout(function () {
      donusAc(d, deneme + 1);
    }, 1500);
  };
  try {
    donusCagri('luna://com.webos.applicationManager/launch', { id: d.uyg, params: d.params }, function (r) {
      if (bitti) return;
      bitti = true;
      clearTimeout(t);
      sonuc(r);
    });
  } catch (e) {
    if (!bitti) {
      bitti = true;
      clearTimeout(t);
      sonuc(null);
    }
  }
}

function donusSor(d) {
  if (d.bitti || d.sorgu || d.aciliyor) return;
  if (Date.now() > d.bitis) return donusBitir(d, 'süre doldu');
  d.sorgu = true;
  donusCalisiyorMu(d, function (calisiyor) {
    d.sorgu = false;
    if (d.bitti) return;
    if (calisiyor === null) {
      d.yanitsiz++;
      return;
    }
    if (calisiyor) {
      if (!d.goruldu) donusNot(d, 'uygulama çalışıyor');
      d.goruldu = true;
      d.yok = 0;
      return;
    }
    if (!d.goruldu) return; // hiç görülmediyse (kimlik eşleşmedi) yanlış yere yeniden açmayız
    d.yok++;
    if (d.yok >= 2) {
      d.aciliyor = true;
      donusNot(d, 'uygulama kapandı → açılıyor');
      donusAc(d, 1);
    }
  });
}

// uyg uygulama kimliği; params açılışta uygulamaya iletilir; sureMs bekçinin en uzun ömrü
function donusKur(p) {
  p = p || {};
  var uyg = String(p.uyg || '');
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(uyg)) return { returnValue: false, errorText: 'Geçersiz uygulama kimliği' };
  if (!donusCagri) return { returnValue: false, errorText: 'Servis köprüsü yok' };
  if (donus) donusBitir(donus, 'yenisiyle değişti');
  var ms = Number(p.sureMs) || 3600000;
  if (ms < DONUS_EN_AZ_MS) ms = DONUS_EN_AZ_MS;
  if (ms > DONUS_EN_COK_MS) ms = DONUS_EN_COK_MS;
  var par = {};
  var k;
  if (p.params && typeof p.params === 'object') for (k in p.params) if (Object.prototype.hasOwnProperty.call(p.params, k)) par[k] = p.params[k];
  par.donus = 1;
  var d = { uyg: uyg, params: par, bitis: Date.now() + ms, durum: 'bekliyor', tani: ['kuruldu: ' + uyg], yol: -1, goruldu: false, yok: 0, yanitsiz: 0, sorgu: false, aciliyor: false, bitti: false, zaman: null, acmaT: null };
  donus = d;
  donusYaz(d);
  d.zaman = setInterval(function () {
    donusSor(d);
  }, DONUS_SORGU_MS);
  donusSor(d);
  if (kapaninca) kapaninca();
  return { returnValue: true, durum: d.durum };
}

var SAYFA =
  '<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Iptv Player Pro · TV\'ye aktar</title>' +
  '<style>body{font-family:system-ui,sans-serif;background:#0d1320;color:#e8ecf4;margin:0;padding:18px;max-width:520px;margin:0 auto}' +
  'h1{font-size:22px;margin:6px 0 4px}p{color:#9aa6bf;margin:0 0 14px;font-size:15px}label{display:block;font-size:14px;color:#9aa6bf;margin:12px 0 4px}' +
  'input,textarea{box-sizing:border-box;width:100%;font-size:17px;padding:11px 12px;background:#111827;color:#e8ecf4;border:2px solid #26324b;border-radius:10px}' +
  'input:focus,textarea:focus{outline:none;border-color:#2dd4bf}' +
  '.seg{display:flex;margin:14px 0 2px}.seg button{flex:1;font-size:16px;padding:10px;background:#1b2437;color:#dbe2f2;border:2px solid #26324b}' +
  '.seg button:first-child{border-radius:10px 0 0 10px}.seg button:last-child{border-radius:0 10px 10px 0}' +
  '.seg button.on{background:#26324b;color:#fff;border-color:#2dd4bf}' +
  '#go{width:100%;margin-top:18px;font-size:18px;font-weight:600;padding:14px;background:#2dd4bf;color:#04141a;border:0;border-radius:12px}' +
  '#go:disabled{opacity:.5}#msg{margin-top:14px;font-size:16px;line-height:1.4;min-height:44px}.ok{color:#5eead4}.err{color:#ff8a8a}</style></head><body>' +
  '<h1>TV\'ye liste gönder</h1><p>TV ekranındaki 4 haneli kodu yazın, listenizi yapıştırıp gönderin.</p>' +
  '<label for="pin">TV kodu</label><input id="pin" inputmode="numeric" maxlength="4" autocomplete="off">' +
  '<div class="seg"><button id="b1" class="on" type="button">Bağlantı</button><button id="b2" type="button">Xtream bilgileri</button></div>' +
  '<div id="g1"><label for="url">Liste bağlantısı (M3U ya da get.php)</label><textarea id="url" rows="3" autocapitalize="none" autocorrect="off" spellcheck="false"></textarea></div>' +
  '<div id="g2" style="display:none"><label for="sv">Sunucu adresi</label><input id="sv" placeholder="http://sunucu:port" autocapitalize="none" autocorrect="off" spellcheck="false">' +
  '<label for="us">Kullanıcı adı</label><input id="us" autocapitalize="none" autocorrect="off" spellcheck="false">' +
  '<label for="pw">Şifre</label><input id="pw" autocapitalize="none" autocorrect="off" spellcheck="false"></div>' +
  '<label for="ad">Ad (isteğe bağlı)</label><input id="ad" placeholder="Evim">' +
  '<button id="go" type="button">TV\'ye gönder</button><div id="msg"></div>' +
  '<script>(function(){var $=function(i){return document.getElementById(i)},tip="m3u";' +
  'var q=/[?&]k=(\\d{4})/.exec(location.search);if(q)$("pin").value=q[1];' +
  'function sec(t){tip=t;$("g1").style.display=t==="m3u"?"":"none";$("g2").style.display=t==="xtream"?"":"none";' +
  '$("b1").className=t==="m3u"?"on":"";$("b2").className=t==="xtream"?"on":""}' +
  '$("b1").onclick=function(){sec("m3u")};$("b2").onclick=function(){sec("xtream")};' +
  'function yaz(t,k){$("msg").className=k||"";$("msg").textContent=t}' +
  '$("go").onclick=function(){var g={pin:$("pin").value.trim(),tip:tip,ad:$("ad").value.trim(),url:$("url").value.trim(),' +
  'server:$("sv").value.trim(),user:$("us").value.trim(),pass:$("pw").value.trim()};' +
  'if(!/^\\d{4}$/.test(g.pin))return yaz("TV ekranındaki 4 haneli kodu yazın.","err");' +
  '$("go").disabled=true;yaz("TV\'ye gönderildi, bağlanılıyor…");' +
  'var x=new XMLHttpRequest();x.open("POST","/add");x.setRequestHeader("Content-Type","application/json");x.timeout=75000;' +
  'x.onload=function(){$("go").disabled=false;var r={};try{r=JSON.parse(x.responseText)}catch(e){}' +
  'if(r.ok)yaz("Eklendi ✓ "+(r.mesaj||""),"ok");else yaz(r.mesaj||"Gönderilemedi (kod "+x.status+")","err")};' +
  'x.onerror=x.ontimeout=function(){$("go").disabled=false;yaz("TV\'ye ulaşılamadı. Telefon ve TV aynı ağda mı, TV ekranı hâlâ açık mı?","err")};' +
  'x.send(JSON.stringify(g))}})()</script></body></html>';

// Node 0.12'de Buffer.from yok, yeni sürümlerde new Buffer kaldırılıyor: ikisini de destekle
function tampon(metin) {
  return Buffer.from && Buffer.from !== Uint8Array.from ? Buffer.from(metin, 'utf8') : new Buffer(metin, 'utf8');
}

function pinUret() {
  var b = crypto.randomBytes(4);
  var n = (b[0] * 16777216 + b[1] * 65536 + b[2] * 256 + b[3]) % 10000;
  return ('0000' + n).slice(-4);
}

// Yerel ağ adresleri (IPv4, dahili olmayan); özel ağ aralıkları öne alınır
function yerelAdresler() {
  var liste = [];
  var arayuzler = {};
  try {
    arayuzler = os.networkInterfaces() || {};
  } catch (e) {
    arayuzler = {};
  }
  Object.keys(arayuzler).forEach(function (ad) {
    (arayuzler[ad] || []).forEach(function (a) {
      if (a && (a.family === 'IPv4' || a.family === 4) && !a.internal && a.address) liste.push(a.address);
    });
  });
  var ozel = function (ip) {
    return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) ? 0 : 1;
  };
  liste.sort(function (x, y) {
    return ozel(x) - ozel(y);
  });
  return liste;
}

function aliciBilgi() {
  return {
    returnValue: true,
    port: alici.port,
    pin: alici.pin,
    adresler: yerelAdresler(),
    kalanMs: Math.max(0, ALICI_OMUR_MS - (Date.now() - alici.bas)),
  };
}

function aliciYanit(res, kod, nesne) {
  var govde = tampon(JSON.stringify(nesne));
  try {
    res.writeHead(kod, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': govde.length, 'Cache-Control': 'no-store', Connection: 'close' });
    res.end(govde);
  } catch (e) {
    /* istemci gitmiş */
  }
}

function aliciSayfa(res) {
  var govde = tampon(SAYFA);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': govde.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Connection: 'close'
  });
  res.end(govde);
}

function metinAlani(v, en) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').slice(0, en) : '';
}

function aliciEkle(res, g) {
  if (!g || typeof g !== 'object') return aliciYanit(res, 400, { ok: false, mesaj: 'Geçersiz istek.' });
  if (alici.hatali >= ALICI_MAX_YANLIS) return aliciYanit(res, 429, { ok: false, mesaj: 'Çok fazla yanlış kod denendi. TV’de ekranı kapatıp yeniden açın.' });
  if (String(g.pin) !== alici.pin) {
    alici.hatali++;
    return aliciYanit(res, 403, { ok: false, mesaj: 'TV kodu yanlış. TV ekranındaki 4 haneli kodu yazın.' });
  }
  var tip = g.tip === 'xtream' ? 'xtream' : 'm3u';
  var kayit = {
    tip: tip,
    ad: metinAlani(g.ad, 80),
    url: metinAlani(g.url, 2000),
    server: metinAlani(g.server, 400),
    user: metinAlani(g.user, 200),
    pass: metinAlani(g.pass, 200)
  };
  if (tip === 'xtream' ? !kayit.server : !kayit.url) return aliciYanit(res, 400, { ok: false, mesaj: tip === 'xtream' ? 'Sunucu adresi gerekli.' : 'Liste bağlantısı gerekli.' });
  if (Object.keys(alici.bekleyen).length >= ALICI_MAX_KUYRUK) return aliciYanit(res, 429, { ok: false, mesaj: 'TV şu an başka kaynakları işliyor, biraz sonra deneyin.' });
  var id = 'a' + ++alici.sayac;
  kayit.id = id;
  alici.kuyruk.push(kayit);
  alici.bekleyen[id] = {
    res: res,
    zaman: setTimeout(function () {
      if (!alici || !alici.bekleyen[id]) return;
      var b = alici.bekleyen[id];
      delete alici.bekleyen[id];
      aliciYanit(b.res, 504, { ok: false, mesaj: 'TV zamanında yanıt vermedi.' });
    }, ALICI_CEVAP_MS)
  };
}

function aliciIstek(req, res) {
  var yol = String(req.url || '/').split('?')[0];
  if (req.method === 'GET' && (yol === '/' || yol === '/index.html')) return aliciSayfa(res);
  if (req.method === 'POST' && yol === '/add') {
    return govdeOku(req, res, ALICI_MAX_GOVDE, function (g) {
      if (alici) aliciEkle(res, g);
    });
  }
  aliciYanit(res, 404, { ok: false, mesaj: 'Bulunamadı.' });
}

// İlk boş portta dinleyen HTTP sunucusu açar (ilk 0 ise sistem seçer); cb(hata, sunucu)
function dinle(isleyici, ilk, adet, ad, cb) {
  var deneme = 0;
  function dene() {
    var port = ilk === 0 ? 0 : ilk + deneme;
    var sunucu = http.createServer(isleyici);
    var tamam = false;
    sunucu.on('error', function (e) {
      if (tamam) return;
      deneme++;
      if (e && e.code === 'EADDRINUSE' && deneme < adet) return dene();
      cb(new Error(ad + ' başlatılamadı: ' + String((e && e.message) || e)));
    });
    sunucu.listen(port, function () {
      tamam = true;
      cb(null, sunucu);
    });
  }
  dene();
}

// İstek gövdesini en çok 'en' bayt okuyup JSON olarak verir; cb(nesne). Büyük ya da bozuksa yanıtı kendisi verir.
function govdeOku(req, res, en, cb) {
  var parcalar = [];
  var boyut = 0;
  var asti = false;
  req.on('data', function (c) {
    if (asti) return;
    boyut += c.length;
    if (boyut > en) {
      asti = true;
      return aliciYanit(res, 413, { ok: false, mesaj: 'İstek çok büyük.' });
    }
    parcalar.push(c);
  });
  req.on('end', function () {
    if (asti) return;
    var g = null;
    try {
      g = JSON.parse(Buffer.concat(parcalar).toString('utf8'));
    } catch (e) {
      return aliciYanit(res, 400, { ok: false, mesaj: 'Geçersiz istek.' });
    }
    cb(g);
  });
}

// cb(hata, bilgi). Zaten çalışıyorsa aynı kod ve port döner.
function aliciBaslat(p, cb) {
  if (alici) {
    alici.sonSoru = Date.now();
    return cb(null, aliciBilgi());
  }
  var ilk = p && p.ilkPort >= 0 ? Math.floor(p.ilkPort) : ALICI_ILK_PORT;
  var adet = p && p.portAdedi > 0 ? Math.min(100, Math.floor(p.portAdedi)) : ALICI_PORT_ADEDI;
  dinle(aliciIstek, ilk, adet, 'Alıcı', function (e, sunucu) {
    if (e) return cb(e);
    var simdi = Date.now();
    alici = {
      sunucu: sunucu,
      port: sunucu.address().port,
      pin: pinUret(),
      bas: simdi,
      sonSoru: simdi,
      kuyruk: [],
      bekleyen: {},
      hatali: 0,
      sayac: 0,
      zamanlayici: setInterval(function () {
        aliciKontrol(Date.now());
      }, 2000)
    };
    if (alici.zamanlayici.unref) alici.zamanlayici.unref();
    cb(null, aliciBilgi());
  });
}

function aliciSor() {
  if (!alici) return { returnValue: false, errorText: 'Alıcı kapalı' };
  alici.sonSoru = Date.now();
  var alinan = alici.kuyruk;
  alici.kuyruk = [];
  return { returnValue: true, alinan: alinan, kalanMs: Math.max(0, ALICI_OMUR_MS - (Date.now() - alici.bas)) };
}

function aliciSonuc(p) {
  if (!alici || !p) return { returnValue: false, errorText: 'Alıcı kapalı' };
  var b = alici.bekleyen[p.id];
  if (!b) return { returnValue: false, errorText: 'Bekleyen istek yok' };
  clearTimeout(b.zaman);
  delete alici.bekleyen[p.id];
  var tamam = p.durum === 'tamam';
  aliciYanit(b.res, tamam ? 200 : 422, { ok: tamam, mesaj: metinAlani(String(p.mesaj || ''), 300) });
  return { returnValue: true };
}

function aliciDurdur() {
  if (!alici) return { returnValue: true };
  var a = alici;
  alici = null;
  clearInterval(a.zamanlayici);
  Object.keys(a.bekleyen).forEach(function (id) {
    clearTimeout(a.bekleyen[id].zaman);
    aliciYanit(a.bekleyen[id].res, 503, { ok: false, mesaj: 'TV ekranı kapandı.' });
  });
  try {
    a.sunucu.close();
  } catch (e) {
    /* zaten kapalı */
  }
  if (kapaninca) kapaninca();
  return { returnValue: true };
}

// Ömür ya da sorgusuzluk dolduysa durdurur (zamanlayıcı çağırır; testte simdi verilir)
function aliciKontrol(simdi) {
  if (!alici) return false;
  if (simdi - alici.bas > ALICI_OMUR_MS || simdi - alici.sonSoru > ALICI_SORU_MS) {
    aliciDurdur();
    return true;
  }
  return false;
}

var KUMANDA_SAYFA =
  '<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">' +
  '<meta name="theme-color" content="#0d1320"><title>Iptv Player Pro · Kumanda</title>' +
  '<style>' +
  '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;touch-action:manipulation}' +
  'body{margin:0 auto;background:#0d1320;color:#e8ecf4;font-family:system-ui,sans-serif;padding:12px 14px 28px;max-width:440px}' +
  'h1{font-size:19px;margin:6px 0 2px}h2{font-size:16px;margin:22px 0 4px;color:#9aa6bf;font-weight:600}' +
  '#st{font-size:14px;color:#9aa6bf;min-height:20px;margin-bottom:8px}#st.ok{color:#5eead4}#st.err{color:#ff8a8a}' +
  '.row{display:flex;gap:8px;margin:8px 0}.row button{flex:1}' +
  'button{font-size:19px;padding:14px 0;border:0;border-radius:14px;background:#1b2437;color:#e8ecf4;-webkit-user-select:none;user-select:none}' +
  'button:active{background:#2dd4bf;color:#04141a}' +
  '.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.pad button{height:70px;font-size:26px}' +
  '.pad .ok{background:#26324b;font-size:20px;font-weight:700}' +
  '.c1{background:#e5484d}.c2{background:#30a46c}.c3{background:#f5d90a}.c4{background:#3e63dd}' +
  'details{margin:14px 0}summary{color:#9aa6bf;padding:6px 0;font-size:15px}' +
  'input{width:100%;font-size:17px;padding:11px 12px;background:#111827;color:#e8ecf4;border:2px solid #26324b;border-radius:10px;margin:6px 0}' +
  'input:focus{outline:none;border-color:#2dd4bf}.g{background:#2dd4bf;color:#04141a;font-weight:600;font-size:17px}' +
  '</style></head><body>' +
  '<h1>TV kumandası</h1><div id="st">Bağlanıyor…</div>' +
  '<div id="pw" style="display:none"><input id="pin" inputmode="numeric" maxlength="4" placeholder="TV kodu (4 hane)" autocomplete="off"></div>' +
  '<div class="row"><button data-t="back">⟵ Geri</button><button data-t="info">ⓘ Bilgi</button><button data-t="stop">■</button></div>' +
  '<div class="pad"><i></i><button data-t="up" data-r="1">▲</button><i></i><button data-t="left" data-r="1">◀</button><button class="ok" data-t="ok" data-l="1">OK</button><button data-t="right" data-r="1">▶</button><i></i><button data-t="down" data-r="1">▼</button><i></i></div>' +
  '<div class="row"><button data-t="rw" data-r="1">⏪</button><button data-t="play">▶</button><button data-t="pause">⏸</button><button data-t="ff" data-r="1">⏩</button></div>' +
  '<div class="row"><button class="c1" data-t="red">&nbsp;</button><button class="c2" data-t="green">&nbsp;</button><button class="c3" data-t="yellow">&nbsp;</button><button class="c4" data-t="blue">&nbsp;</button></div>' +
  '<div class="row"><button data-t="chdown">Kanal −</button><button data-t="chup">Kanal +</button></div>' +
  '<details><summary>Rakamlar</summary><div class="pad"><button data-t="num1">1</button><button data-t="num2">2</button><button data-t="num3">3</button><button data-t="num4">4</button><button data-t="num5">5</button><button data-t="num6">6</button><button data-t="num7">7</button><button data-t="num8">8</button><button data-t="num9">9</button><i></i><button data-t="num0">0</button><i></i></div></details>' +
  '<h2>Yazı gönder</h2><input id="tx" placeholder="TV’deki arama kutusuna yazılacak" autocomplete="off">' +
  '<div class="row"><button id="tg">Yaz</button><button id="ta" class="g">Yaz ve ara</button></div>' +
  '<h2>TV’de oynat</h2><input id="ul" placeholder="Yayın bağlantısı (m3u8, mp4) ya da YouTube" autocapitalize="none" autocorrect="off" spellcheck="false"><input id="un" placeholder="Ad (isteğe bağlı)">' +
  '<button class="g" id="og" style="width:100%;margin-top:6px">TV’de oynat</button>' +
  '<script>(function(){var $=function(i){return document.getElementById(i)};' +
  'var pin=(/[?&]k=(\\d{4})/.exec(location.search)||[])[1]||"";' +
  'try{if(pin)localStorage.setItem("tvk",pin);else pin=localStorage.getItem("tvk")||""}catch(e){}' +
  'if(!pin)$("pw").style.display="";' +
  'function pn(){return pin||$("pin").value.trim()}' +
  'function yaz(t,k){var s=$("st");s.textContent=t;s.className=k||""}' +
  'function gonder(yol,g,cb){g.pin=pn();' +
  'if(!/^\\d{4}$/.test(g.pin)){yaz("TV ekranındaki 4 haneli kodu yazın.","err");return}' +
  'var x=new XMLHttpRequest();x.open("POST",yol);x.setRequestHeader("Content-Type","application/json");x.timeout=8000;' +
  'x.onload=function(){var r={};try{r=JSON.parse(x.responseText)}catch(e){}' +
  'if(r.ok){yaz("TV’ye bağlı ✓","ok");if(cb)cb(true)}else{yaz(r.mesaj||"Gönderilemedi (kod "+x.status+")","err");if(cb)cb(false)}};' +
  'x.onerror=x.ontimeout=function(){yaz("TV’ye ulaşılamadı. Aynı Wi-Fi’de misiniz, TV’de uygulama açık mı?","err")};' +
  'x.send(JSON.stringify(g))}' +
  'function tus(t,ms){gonder("/tus",{tus:t,ms:ms||0});try{if(navigator.vibrate)navigator.vibrate(10)}catch(e){}}' +
  'var dugmeler=document.querySelectorAll("button[data-t]");' +
  'for(var i=0;i<dugmeler.length;i++)(function(b){var t=b.getAttribute("data-t"),yin=b.getAttribute("data-r"),uzun=b.getAttribute("data-l"),bek=null,yi=null,bas=0;' +
  'function dur(){clearTimeout(bek);clearInterval(yi);bek=yi=null}' +
  'b.addEventListener("pointerdown",function(e){e.preventDefault();bas=Date.now();if(uzun)return;tus(t);' +
  'if(yin)bek=setTimeout(function(){yi=setInterval(function(){tus(t)},140)},380)});' +
  'var birak=function(){if(uzun&&bas){var u=Date.now()-bas>600;bas=0;tus(t,u?900:0)}dur()};' +
  'b.addEventListener("pointerup",birak);b.addEventListener("pointercancel",function(){bas=0;dur()});' +
  'b.addEventListener("pointerleave",function(){if(yi||bek)dur()});' +
  'b.addEventListener("contextmenu",function(e){e.preventDefault()})})(dugmeler[i]);' +
  '$("tg").onclick=function(){gonder("/metin",{metin:$("tx").value,enter:false})};' +
  '$("ta").onclick=function(){gonder("/metin",{metin:$("tx").value,enter:true})};' +
  '$("og").onclick=function(){var u=$("ul").value.trim();' +
  'if(!/^https?:\\/\\/\\S+$/i.test(u)){yaz("http:// ya da https:// ile başlayan bir bağlantı yazın.","err");return}' +
  'gonder("/oynat",{url:u,ad:$("un").value.trim()},function(ok){if(ok)yaz("TV’ye gönderildi ✓","ok")})};' +
  'if(pin)gonder("/tus",{tus:"ping"});else yaz("TV ekranındaki kodu aşağıya yazın.")})()</script></body></html>';

// Telefon kumandası: aynı ağdaki telefon tarayıcısı TV uygulamasına tuş, yazı ve oynatma bağlantısı gönderir.
// Kaynak aktarma alıcısından ayrı bir sunucudur (aktarma ekranı kapanınca kumanda kapanmasın). Uygulama kumandaSor ile uzun
// yoklama yapar; 20 sn yoklama yoksa (uygulama kapandı) sunucu kendiliğinden durur. Kod (PIN) uygulamadan gelir, böylece sabit kalabilir.
var KUMANDA_ILK_PORT = 8800;
var KUMANDA_PORT_ADEDI = 20;
var KUMANDA_SORU_MS = 20000;
var KUMANDA_BEKLE_MS = 1500;
var KUMANDA_EN_COK_BEKLE_MS = 5000;
var KUMANDA_EN_COK_KOMUT = 50;
var KUMANDA_MAX_GOVDE = 4096;
var KUMANDA_MAX_YANLIS = 8;
var KUMANDA_TUSLARI = {
  up: 1, down: 1, left: 1, right: 1, ok: 1, back: 1, red: 1, green: 1, yellow: 1, blue: 1,
  play: 1, pause: 1, stop: 1, rw: 1, ff: 1, chup: 1, chdown: 1, info: 1,
  num0: 1, num1: 1, num2: 1, num3: 1, num4: 1, num5: 1, num6: 1, num7: 1, num8: 1, num9: 1
};
var kumanda = null;

function kumandaBilgi() {
  return { returnValue: true, port: kumanda.port, pin: kumanda.pin, adresler: yerelAdresler() };
}

function kumandaYanit(komutlar) {
  return { returnValue: true, komutlar: komutlar, telefon: !!kumanda && Date.now() - kumanda.sonTelefon < 12000 };
}

// Sıradaki komutları bekleyen uzun yoklamaya verir (yoksa bir şey yapmaz)
function kumandaBosalt() {
  var k = kumanda;
  if (!k || !k.bekleyen || !k.komutlar.length) return;
  var b = k.bekleyen;
  k.bekleyen = null;
  clearTimeout(b.zaman);
  var l = k.komutlar;
  k.komutlar = [];
  k.sonSoru = Date.now();
  b.cb(kumandaYanit(l));
}

function kumandaKomutEkle(komut) {
  kumanda.komutlar.push(komut);
  if (kumanda.komutlar.length > KUMANDA_EN_COK_KOMUT) kumanda.komutlar.shift();
  kumandaBosalt();
}

function kumandaSayfa(res) {
  var govde = tampon(KUMANDA_SAYFA);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': govde.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Connection: 'close'
  });
  res.end(govde);
}

function kumandaKomut(res, yol, g) {
  var k = kumanda;
  if (!k) return aliciYanit(res, 503, { ok: false, mesaj: 'TV kumandası kapalı.' });
  if (!g || typeof g !== 'object') return aliciYanit(res, 400, { ok: false, mesaj: 'Geçersiz istek.' });
  if (k.hatali >= KUMANDA_MAX_YANLIS) return aliciYanit(res, 429, { ok: false, mesaj: 'Çok fazla yanlış kod denendi. TV’de Telefon kumandası ekranını yeniden açın.' });
  if (String(g.pin) !== k.pin) {
    k.hatali++;
    return aliciYanit(res, 403, { ok: false, mesaj: 'TV kodu yanlış. TV’deki Telefon kumandası ekranında yazan 4 haneli kodu yazın.' });
  }
  k.sonTelefon = Date.now();
  if (yol === '/tus') {
    var ad = String(g.tus || '');
    if (ad === 'ping') return aliciYanit(res, 200, { ok: true });
    if (!Object.prototype.hasOwnProperty.call(KUMANDA_TUSLARI, ad)) return aliciYanit(res, 400, { ok: false, mesaj: 'Bilinmeyen tuş.' });
    var ms = Math.floor(Number(g.ms) || 0);
    kumandaKomutEkle({ t: 'tus', tus: ad, ms: ms < 0 ? 0 : ms > 1500 ? 1500 : ms });
  } else if (yol === '/metin') {
    kumandaKomutEkle({ t: 'metin', metin: metinAlani(g.metin, 300), enter: g.enter === true });
  } else {
    var url = metinAlani(g.url, 2000).replace(/^\s+|\s+$/g, '');
    if (!/^https?:\/\/\S+$/i.test(url)) return aliciYanit(res, 400, { ok: false, mesaj: 'http:// ya da https:// ile başlayan bir bağlantı yazın.' });
    kumandaKomutEkle({ t: 'oynat', url: url, ad: metinAlani(g.ad, 80) });
  }
  aliciYanit(res, 200, { ok: true });
}

function kumandaIstek(req, res) {
  var yol = String(req.url || '/').split('?')[0];
  if (req.method === 'GET' && (yol === '/' || yol === '/k' || yol === '/index.html')) return kumandaSayfa(res);
  if (req.method === 'POST' && (yol === '/tus' || yol === '/metin' || yol === '/oynat')) {
    return govdeOku(req, res, KUMANDA_MAX_GOVDE, function (g) {
      kumandaKomut(res, yol, g);
    });
  }
  aliciYanit(res, 404, { ok: false, mesaj: 'Bulunamadı.' });
}

// p: {pin (4 hane, verilirse sabit kalır), sifirla (yanlış kod sayacını sıfırlar), ilkPort, portAdedi}. cb(hata, bilgi)
function kumandaBaslat(p, cb) {
  p = p || {};
  if (kumanda) {
    kumanda.sonSoru = Date.now();
    if (p.sifirla) kumanda.hatali = 0;
    return cb(null, kumandaBilgi());
  }
  var ilk = p.ilkPort >= 0 ? Math.floor(p.ilkPort) : KUMANDA_ILK_PORT;
  var adet = p.portAdedi > 0 ? Math.min(100, Math.floor(p.portAdedi)) : KUMANDA_PORT_ADEDI;
  dinle(kumandaIstek, ilk, adet, 'Kumanda', function (e, sunucu) {
    if (e) return cb(e);
    var simdi = Date.now();
    kumanda = {
      sunucu: sunucu,
      port: sunucu.address().port,
      pin: /^\d{4}$/.test(String(p.pin || '')) ? String(p.pin) : pinUret(),
      sonSoru: simdi,
      sonTelefon: 0,
      komutlar: [],
      bekleyen: null,
      hatali: 0,
      zamanlayici: setInterval(function () {
        kumandaKontrol(Date.now());
      }, 2000)
    };
    if (kumanda.zamanlayici.unref) kumanda.zamanlayici.unref();
    if (kapaninca) kapaninca();
    cb(null, kumandaBilgi());
  });
}

// Uygulama uzun yoklama yapar: komut varsa hemen, yoksa p.bekleMs (en çok 5 sn) sonra boş liste ile yanıt verir. cb(yanit)
function kumandaSor(p, cb) {
  var k = kumanda;
  if (!k) return cb({ returnValue: false, errorText: 'Kumanda kapalı' });
  k.sonSoru = Date.now();
  if (k.bekleyen) {
    var eski = k.bekleyen;
    k.bekleyen = null;
    clearTimeout(eski.zaman);
    eski.cb(kumandaYanit([]));
  }
  if (k.komutlar.length) {
    var l = k.komutlar;
    k.komutlar = [];
    return cb(kumandaYanit(l));
  }
  var ms = p && p.bekleMs !== undefined ? Number(p.bekleMs) : KUMANDA_BEKLE_MS;
  if (!(ms >= 0)) ms = KUMANDA_BEKLE_MS;
  if (ms > KUMANDA_EN_COK_BEKLE_MS) ms = KUMANDA_EN_COK_BEKLE_MS;
  if (ms === 0) return cb(kumandaYanit([]));
  var b = { cb: cb, zaman: null };
  b.zaman = setTimeout(function () {
    if (k.bekleyen !== b) return;
    k.bekleyen = null;
    k.sonSoru = Date.now();
    cb(kumandaYanit([]));
  }, ms);
  k.bekleyen = b;
}

function kumandaDurdur() {
  if (!kumanda) return { returnValue: true };
  var k = kumanda;
  kumanda = null;
  clearInterval(k.zamanlayici);
  if (k.bekleyen) {
    clearTimeout(k.bekleyen.zaman);
    k.bekleyen.cb({ returnValue: true, komutlar: [], telefon: false });
  }
  try {
    k.sunucu.close();
  } catch (e) {
    /* zaten kapalı */
  }
  if (kapaninca) kapaninca();
  return { returnValue: true };
}

// Uygulama yoklamayı kestiyse (kapandı) durdurur; bekleyen uzun yoklama varsa uygulama canlıdır
function kumandaKontrol(simdi) {
  if (!kumanda || kumanda.bekleyen) return false;
  if (simdi - kumanda.sonSoru > KUMANDA_SORU_MS) {
    kumandaDurdur();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------
// Medya merkezi
// Güvenlik: yalnız USB/dahili bellek kökleri altındaki yollar; adres 127.0.0.1'e bağlıdır ve her oturumda yeni bir
// jeton ister; sembolik bağlantılar listelenmez ve sunulmaz; sorgusuzluk 20 sn sürerse sunucu kapanır.
// ---------------------------------------------------------------------------------------------------------------
var MEDYA_SORU_MS = 20000;
var MEDYA_MAX_OGE = 2000;
var MEDYA_UZANTI = /\.(mp4|m4v|mkv|webm|avi|mov|wmv|flv|ts|m2ts|3gp|mpg|mpeg|mp3|m4a|aac|flac|ogg|opus|wav|wma|jpe?g|png|gif|webp|bmp|srt|vtt)$/i;
var MEDYA_GIZLI = /^(system volume information|\$recycle\.bin|lost\+found)$/i;
var MEDYA_MIME = {
  mp4: 'video/mp4', m4v: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', avi: 'video/x-msvideo', mov: 'video/quicktime',
  wmv: 'video/x-ms-wmv', flv: 'video/x-flv', ts: 'video/mp2t', m2ts: 'video/mp2t', '3gp': 'video/3gpp', mpg: 'video/mpeg', mpeg: 'video/mpeg',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', wma: 'audio/x-ms-wma',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  srt: 'text/plain; charset=utf-8', vtt: 'text/vtt; charset=utf-8'
};
var KAYIT_KLASOR = 'IPTV-Kayit';
var kayitYedekKok = '/media/developer'; // USB yazılamazsa son çare; testte değiştirilir
var medyaKokleri = ['/tmp/usb', '/media/internal']; // izinli kökler (testte değiştirilir)
var usbDizini = '/tmp/usb';
var medya = null;

// Yol izinli bir kökün altında mı? Dönen: düzgelenmiş yol ya da null ('..' ve çift eğik çizgi çözülür)
function medyaYol(yol) {
  if (typeof yol !== 'string' || !yol || yol.indexOf('\u0000') >= 0) return null;
  var n = pathm.normalize(yol);
  if (n.charAt(0) !== '/') return null;
  if (n.length > 1) n = n.replace(/\/+$/, '');
  var kokler = medyaKokleri.concat([kayitYedekKok + '/' + KAYIT_KLASOR]); // yedek kayıt klasörü de oynatılabilsin
  for (var i = 0; i < kokler.length; i++) {
    if (n === kokler[i] || n.indexOf(kokler[i] + '/') === 0) return n;
  }
  return null;
}

function medyaDizinMi(y) {
  try {
    return fs.statSync(y).isDirectory();
  } catch (e) {
    return false;
  }
}

function medyaAltlar(y) {
  try {
    return fs
      .readdirSync(y)
      .filter(function (a) {
        return a.charAt(0) !== '.' && medyaDizinMi(y + '/' + a);
      })
      .sort();
  } catch (e) {
    return [];
  }
}

// Takılı bellekler: /tmp/usb/sda/sda1 gibi bölümler (bölüm klasörü yoksa aygıtın kendisi)
function medyaKokler() {
  var kokler = [];
  var sira = 0;
  medyaAltlar(usbDizini).forEach(function (d) {
    if (/^blockinfo$/i.test(d)) return; // sistem klasörü, bellek değil
    var y1 = usbDizini + '/' + d;
    var bolumler = medyaAltlar(y1).filter(function (a) {
      return /^[a-z]+\d+$/i.test(a);
    });
    if (bolumler.length) {
      bolumler.forEach(function (b) {
        kokler.push({ ad: 'USB ' + ++sira + ' (' + b + ')', yol: y1 + '/' + b });
      });
    } else {
      kokler.push({ ad: 'USB ' + ++sira + ' (' + d + ')', yol: y1 });
    }
  });
  var dahili = '/media/internal';
  if (medyaKokleri.indexOf(dahili) >= 0 && medyaAltlar(dahili).length) kokler.push({ ad: 'Dahili bellek', yol: dahili });
  return { returnValue: true, kokler: kokler };
}

function medyaListele(p) {
  var y = medyaYol(p && p.yol);
  if (!y) return { returnValue: false, errorText: 'Geçersiz konum' };
  var adlar;
  try {
    adlar = fs.readdirSync(y);
  } catch (e) {
    return { returnValue: false, errorText: 'Klasör okunamadı: ' + String((e && (e.code || e.message)) || e) };
  }
  var ogeler = [];
  var kesildi = false;
  for (var i = 0; i < adlar.length; i++) {
    var ad = adlar[i];
    if (ad.charAt(0) === '.' || MEDYA_GIZLI.test(ad)) continue;
    var st;
    try {
      st = fs.lstatSync(y + '/' + ad);
    } catch (e) {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    var dir = st.isDirectory();
    if (!dir && !(st.isFile() && MEDYA_UZANTI.test(ad))) continue;
    if (ogeler.length >= MEDYA_MAX_OGE) {
      kesildi = true;
      break;
    }
    ogeler.push({ ad: ad, dir: dir, boyut: dir ? 0 : st.size, zaman: st.mtime ? st.mtime.getTime() : 0 });
  }
  return { returnValue: true, yol: y, ogeler: ogeler, kesildi: kesildi };
}

function medyaIstek(req, res) {
  var yanit = function (kod, metin) {
    try {
      res.writeHead(kod, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(metin), Connection: 'close' });
      res.end(metin);
    } catch (e) {
      /* istemci gitmiş */
    }
  };
  if (!medya) return yanit(503, 'Medya sunucusu kapalı');
  if (req.method !== 'GET' && req.method !== 'HEAD') return yanit(405, 'Yöntem desteklenmiyor');
  var parca = String(req.url || '').split('?')[0].split('/'); // ['', jeton, kodlanmış yol]
  if (parca.length !== 3 || parca[1] !== medya.jeton) return yanit(403, 'Yetkisiz');
  var yol;
  try {
    yol = decodeURIComponent(parca[2]);
  } catch (e) {
    return yanit(400, 'Geçersiz yol');
  }
  var y = medyaYol(yol);
  if (!y) return yanit(403, 'Konum izinli değil');
  var st;
  try {
    st = fs.lstatSync(y);
  } catch (e) {
    return yanit(404, 'Dosya yok');
  }
  if (!st.isFile()) return yanit(404, 'Dosya değil');
  var boyut = st.size;
  var bas = 0;
  var son = boyut - 1;
  var kod = 200;
  var a = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  if (a && (a[1] || a[2])) {
    if (a[1] === '') {
      bas = Math.max(0, boyut - Number(a[2]));
    } else {
      bas = Number(a[1]);
      if (a[2] !== '') son = Math.min(son, Number(a[2]));
    }
    if (bas > son || bas >= boyut) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + boyut, Connection: 'close' });
      return res.end();
    }
    kod = 206;
  }
  var uz = (/\.([a-z0-9]+)$/i.exec(y) || [])[1];
  var baslik = {
    'Content-Type': MEDYA_MIME[String(uz || '').toLowerCase()] || 'application/octet-stream',
    'Content-Length': boyut === 0 ? 0 : son - bas + 1,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store'
  };
  if (kod === 206) baslik['Content-Range'] = 'bytes ' + bas + '-' + son + '/' + boyut;
  res.writeHead(kod, baslik);
  if (req.method === 'HEAD' || boyut === 0) return res.end();
  var akis = fs.createReadStream(y, { start: bas, end: son });
  akis.on('error', function () {
    try {
      res.destroy();
    } catch (e) {
      /* kapalı */
    }
  });
  res.on('close', function () {
    try {
      akis.destroy();
    } catch (e) {
      /* kapalı */
    }
  });
  akis.pipe(res);
}

function medyaBilgi() {
  return { returnValue: true, port: medya.port, jeton: medya.jeton };
}

// cb(hata, bilgi). Zaten çalışıyorsa aynı port ve jeton döner.
function medyaBaslat(p, cb) {
  if (medya) {
    medya.sonSoru = Date.now();
    return cb(null, medyaBilgi());
  }
  var sunucu = http.createServer(medyaIstek);
  var tamam = false;
  sunucu.on('error', function (e) {
    if (!tamam) cb(new Error('Medya sunucusu başlatılamadı: ' + String((e && e.message) || e)));
  });
  sunucu.listen(0, '127.0.0.1', function () {
    tamam = true;
    medya = {
      sunucu: sunucu,
      port: sunucu.address().port,
      jeton: crypto.randomBytes(12).toString('hex'),
      sonSoru: Date.now(),
      zamanlayici: setInterval(function () {
        medyaKontrol(Date.now());
      }, 2000)
    };
    if (medya.zamanlayici.unref) medya.zamanlayici.unref();
    cb(null, medyaBilgi());
  });
}

function medyaSor() {
  if (!medya) return { returnValue: false, errorText: 'Medya sunucusu kapalı' };
  medya.sonSoru = Date.now();
  return medyaBilgi();
}

function medyaDurdur() {
  if (!medya) return { returnValue: true };
  var m = medya;
  medya = null;
  clearInterval(m.zamanlayici);
  try {
    m.sunucu.close();
  } catch (e) {
    /* zaten kapalı */
  }
  if (kapaninca) kapaninca();
  return { returnValue: true };
}

function medyaKontrol(simdi) {
  if (!medya) return false;
  if (simdi - medya.sonSoru > MEDYA_SORU_MS) {
    medyaDurdur();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------
// Kayıt (deneme)
// Yayın adresi Node tarafında açılır, gelen MPEG-TS baytları olduğu gibi dosyaya yazılır (çözme/yeniden kodlama yok).
// Disk sırası: takılı USB bellekler → dahili bellek → geliştirici alanı. Her adayda önce yazma denenir; hepsi
// başarısızsa her birinin hata kodu (EACCES, EROFS …) bildirilir. Kayıtlar KAYIT_KLASOR altındadır ve medya
// sunucusuyla (Range destekli) oynatılabilir.
// ---------------------------------------------------------------------------------------------------------------
var KAYIT_DURGUN_MS = 20000; // bu kadar süre hiç veri gelmezse yayın durdu sayılır
var KAYIT_BAGLANTI_MS = 15000;
var KAYIT_EN_FAZLA = 4 * 1024 * 1024 * 1024;
var KAYIT_EN_UZUN_SN = 4 * 3600;
var kayitHazirlaniyor = false;
var KAYIT_BOS_PAY = 150 * 1024 * 1024; // diskte her zaman bu kadar boş yer kalır (dahili bellek dolarsa TV'nin kendi işleri bozulur)
var KAYIT_EN_AZ_BOS = 20 * 1024 * 1024; // pay düşüldükten sonra bu kadar yer yoksa kayıt başlamaz
var KAYIT_SAKLA = 6;
var kayitlar = {};
var kayitSayac = 0;

function hataKodu(e) {
  return String((e && (e.code || e.message)) || e);
}

function kayitAdi(ad) {
  var t = { 'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U' };
  var d = new Date();
  function iki(n) {
    return (n < 10 ? '0' : '') + n;
  }
  var damga = '' + d.getFullYear() + iki(d.getMonth() + 1) + iki(d.getDate()) + '-' + iki(d.getHours()) + iki(d.getMinutes()) + iki(d.getSeconds());
  var temiz = String(ad || 'yayin')
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, function (h) {
      return t[h];
    })
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return (temiz || 'yayin') + '-' + damga + '.ts';
}

// Kök altında yazılabilir kayıt klasörü açar. Dönen: { yol } ya da { hata: kod }
function kayitKlasoru(kok) {
  var k = kok + '/' + KAYIT_KLASOR;
  try {
    fs.mkdirSync(k);
  } catch (e) {
    if (!e || e.code !== 'EEXIST') return { hata: hataKodu(e) };
  }
  var d = k + '/.yazma-denemesi';
  try {
    fs.writeFileSync(d, 'x');
    fs.unlinkSync(d);
  } catch (e2) {
    return { hata: hataKodu(e2) };
  }
  return { yol: k };
}

function kayitAdaylari() {
  var l = medyaKokler().kokler.slice();
  l.push({ ad: 'Geliştirici alanı', yol: kayitYedekKok });
  return l;
}

function kayitOzet(r) {
  var bitis = r.bitis || Date.now();
  var boyut = r.bayt;
  if (r.bitti) {
    try {
      boyut = fs.statSync(r.dosya).size;
    } catch (e) {
      /* dosya yoksa sayaç kalır */
    }
  }
  return {
    returnValue: true,
    id: r.id,
    durum: r.durum, // baglaniyor | yaziyor | bitti | hata
    bayt: boyut,
    sureMs: Math.max(0, bitis - r.bas),
    dosya: r.dosya,
    disk: r.disk,
    http: r.http,
    mesaj: r.mesaj
  };
}

function kayitVar() {
  return Object.keys(kayitlar).some(function (k) {
    return !kayitlar[k].bitti;
  });
}

function kayitBitir(r, durum, mesaj) {
  if (r.bitti) return;
  r.bitti = true;
  r.durum = durum;
  r.mesaj = mesaj || '';
  r.bitis = Date.now();
  clearTimeout(r.sureT);
  clearInterval(r.bekciT);
  clearTimeout(r.baglantiT);
  try {
    if (r.res) r.res.unpipe(r.ws);
  } catch (e) {
    /* yoksay */
  }
  try {
    if (r.req) r.req.abort();
  } catch (e2) {
    /* yoksay */
  }
  try {
    if (r.ws) r.ws.end();
  } catch (e3) {
    /* yoksay */
  }
  if (r.ws && r.bayt === 0) {
    // hiç veri gelmediyse boş dosya bırakılmaz
    setTimeout(function () {
      try {
        fs.unlinkSync(r.dosya);
      } catch (e4) {
        /* yoksay */
      }
    }, 500);
  }
  // eski kayıt bilgilerini sınırla
  var ids = Object.keys(kayitlar).filter(function (k) {
    return kayitlar[k].bitti;
  });
  while (ids.length > KAYIT_SAKLA) delete kayitlar[ids.shift()];
  if (kapaninca) kapaninca();
}

function kayitBaglan(r, adres, kalan) {
  var u;
  try {
    u = urlm.parse(adres);
  } catch (e) {
    return kayitBitir(r, 'hata', 'Yayın adresi geçersiz');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return kayitBitir(r, 'hata', 'Yayın adresi desteklenmiyor');
  var lib = u.protocol === 'https:' ? https : http;
  var req = lib.request(
    {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port,
      path: u.path,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Encoding': 'identity', Connection: 'close' },
      rejectUnauthorized: false,
      agent: false
    },
    function (res) {
      if (r.bitti) return res.resume();
      r.http = res.statusCode;
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (kalan <= 0) return kayitBitir(r, 'hata', 'Çok fazla yönlendirme');
        return kayitBaglan(r, urlm.resolve(adres, res.headers.location), kalan - 1);
      }
      var tur = String(res.headers['content-type'] || '');
      if (res.statusCode !== 200 || /text\/|json|xml|mpegurl/i.test(tur)) {
        // Hata sayfası ya da HLS listesi: sunucunun ne söylediğini göster (ör. bağlantı sınırı iletisi)
        var ilk = [];
        var n = 0;
        res.on('data', function (c) {
          if (n < 200) {
            ilk.push(c);
            n += c.length;
          }
        });
        var bitir = function () {
          var metin = Buffer.concat(ilk).toString('utf8').replace(/\s+/g, ' ').slice(0, 120);
          var neden = res.statusCode !== 200 ? 'Sunucu HTTP ' + res.statusCode + ' yanıtı verdi' : /mpegurl/i.test(tur) ? 'Sunucu HLS listesi verdi (TS gerekli)' : 'Sunucu yayın yerine metin verdi';
          kayitBitir(r, 'hata', neden + (metin ? ': ' + metin : ''));
        };
        res.on('end', bitir);
        res.on('error', bitir);
        return;
      }
      clearTimeout(r.baglantiT);
      r.durum = 'yaziyor';
      r.son = Date.now();
      var ws = fs.createWriteStream(r.dosya);
      r.res = res;
      r.ws = ws;
      ws.on('error', function (e) {
        kayitBitir(r, 'hata', 'Diske yazılamadı: ' + hataKodu(e));
      });
      res.on('data', function (c) {
        r.bayt += c.length;
        r.son = Date.now();
        if (r.bayt >= r.sinir) kayitBitir(r, 'bitti', r.sinir < KAYIT_EN_FAZLA ? 'Boş alan sınırına ulaşıldı' : 'Boyut sınırına ulaşıldı');
      });
      res.on('end', function () {
        kayitBitir(r, r.bayt > 0 ? 'bitti' : 'hata', r.bayt > 0 ? 'Sunucu yayını kapattı' : 'Sunucu hiç veri vermedi');
      });
      res.on('error', function (e) {
        kayitBitir(r, 'hata', 'Yayın kesildi: ' + hataKodu(e));
      });
      res.pipe(ws);
    }
  );
  r.req = req;
  req.on('error', function (e) {
    kayitBitir(r, 'hata', 'Bağlanılamadı: ' + hataKodu(e));
  });
  req.end();
}

// cb(hata, yanit). Yanıt hemen döner (id); ilerleme kayitDurum ile izlenir.
function kayitBaslat(p, cb) {
  var adres = p && p.url ? String(p.url) : '';
  if (!/^https?:\/\//i.test(adres)) return cb(new Error('Yayın adresi yok'));
  if (kayitVar() || kayitHazirlaniyor) return cb(new Error('Zaten bir kayıt sürüyor'));
  var sure = Math.max(1, Math.min(KAYIT_EN_UZUN_SN, Number(p.sureSn) || 30));
  var denemeler = [];
  var yol = '';
  var disk = '';
  var adaylar = kayitAdaylari();
  for (var i = 0; i < adaylar.length && !yol; i++) {
    var k = kayitKlasoru(adaylar[i].yol);
    if (k.yol) {
      yol = k.yol;
      disk = adaylar[i].ad;
    } else {
      denemeler.push(adaylar[i].ad + ': ' + k.hata);
    }
  }
  if (!yol) return cb(new Error('Hiçbir diske yazılamadı (' + denemeler.join('; ') + ')'));
  kayitHazirlaniyor = true; // boş alan ölçülürken ikinci bir kayıt başlamasın
  bosAlan(yol, function (bos) {
    kayitHazirlaniyor = false;
    var sinir = bos == null ? KAYIT_EN_FAZLA : Math.min(KAYIT_EN_FAZLA, bos - KAYIT_BOS_PAY);
    if (sinir < KAYIT_EN_AZ_BOS) return cb(new Error(disk + ' diskinde yeterli boş yer yok (' + Math.max(0, Math.floor(bos / 1048576)) + ' MB boş)'));
    kayitKur(p, adres, sure, yol, disk, denemeler, sinir, cb);
  });
}

function kayitKur(p, adres, sure, yol, disk, denemeler, sinir, cb) {
  var r = {
    sinir: sinir,
    id: 'k' + ++kayitSayac,
    dosya: yol + '/' + kayitAdi(p.ad),
    disk: disk,
    durum: 'baglaniyor',
    bayt: 0,
    http: 0,
    mesaj: denemeler.length ? 'Önceki diskler yazılamadı: ' + denemeler.join('; ') : '',
    bas: Date.now(),
    son: Date.now(),
    bitti: false
  };
  kayitlar[r.id] = r;
  r.baglantiT = setTimeout(function () {
    kayitBitir(r, 'hata', 'Sunucu ' + KAYIT_BAGLANTI_MS / 1000 + ' sn içinde yanıt vermedi');
  }, KAYIT_BAGLANTI_MS);
  r.sureT = setTimeout(function () {
    kayitBitir(r, r.bayt > 0 ? 'bitti' : 'hata', r.bayt > 0 ? 'Süre doldu' : 'Hiç veri gelmedi');
  }, sure * 1000);
  r.bekciT = setInterval(function () {
    if (r.durum === 'yaziyor' && Date.now() - r.son > KAYIT_DURGUN_MS) kayitBitir(r, r.bayt > 0 ? 'bitti' : 'hata', 'Yayın ' + KAYIT_DURGUN_MS / 1000 + ' sn veri vermedi');
  }, 2000);
  kayitBaglan(r, adres, MAX_YONLENDIRME);
  var o = kayitOzet(r);
  cb(null, o);
}

// Boş alan: `df -k yol` (webOS'ta busybox df vardır). Dönen bayt ya da bilinmiyorsa null.
function bosAlan(yol, cb) {
  var bitti = false;
  function son(v) {
    if (bitti) return;
    bitti = true;
    cb(v);
  }
  try {
    childProc.execFile('df', ['-k', yol], { timeout: 4000 }, function (e, cikti) {
      if (e || !cikti) return son(null);
      var satirlar = String(cikti).split('\n').filter(function (x) {
        return x.replace(/\s+/g, '') !== '';
      });
      var t = satirlar.length > 1 ? satirlar[satirlar.length - 1].trim().split(/\s+/) : [];
      var bos = Number(t[3]);
      son(t.length >= 4 && bos >= 0 && isFinite(bos) ? bos * 1024 : null);
    });
  } catch (e2) {
    son(null);
  }
}

// cb(null, {returnValue, diskler}). Her aday için yazılabilir mi (klasör açılır, deneme dosyası yazılır) ve boş alan.
function kayitAlan(p, cb) {
  var adaylar = kayitAdaylari();
  var sonuc = [];
  var kalan = adaylar.length;
  if (!kalan) return cb(null, { returnValue: true, diskler: [] });
  adaylar.forEach(function (a, i) {
    var k = kayitKlasoru(a.yol);
    var kayit = { ad: a.ad, yol: a.yol, yazilabilir: !!k.yol, hata: k.hata || '', bos: null };
    sonuc[i] = kayit;
    bosAlan(k.yol || a.yol, function (bos) {
      kayit.bos = bos;
      if (--kalan === 0) cb(null, { returnValue: true, diskler: sonuc });
    });
  });
}

function kayitBul(p) {
  var r = kayitlar[p && p.id];
  if (r) return r;
  var ids = Object.keys(kayitlar);
  return !p || !p.id ? kayitlar[ids[ids.length - 1]] : null; // id verilmezse sonuncusu
}

function kayitDurum(p) {
  var r = kayitBul(p);
  if (!r) return { returnValue: false, errorText: 'Kayıt bulunamadı' };
  return kayitOzet(r);
}

function kayitDurdur(p) {
  var r = kayitBul(p);
  if (!r) return { returnValue: false, errorText: 'Kayıt bulunamadı' };
  kayitBitir(r, r.bayt > 0 ? 'bitti' : 'hata', r.bayt > 0 ? 'Durduruldu' : 'Hiç veri gelmeden durduruldu');
  return kayitOzet(r);
}

module.exports = {
  getir: getir,
  oku: oku,
  aliciBaslat: aliciBaslat,
  aliciSor: aliciSor,
  aliciSonuc: aliciSonuc,
  aliciDurdur: aliciDurdur,
  medyaKokler: medyaKokler,
  medyaListele: medyaListele,
  medyaBaslat: medyaBaslat,
  medyaSor: medyaSor,
  medyaDurdur: medyaDurdur,
  kayitBaslat: kayitBaslat,
  kayitDurum: kayitDurum,
  kayitDurdur: kayitDurdur,
  kayitAlan: kayitAlan,
  resimGetir: resimGetir,
  resimTuru: resimTuru,
  kumandaBaslat: kumandaBaslat,
  kumandaSor: kumandaSor,
  kumandaDurdur: kumandaDurdur,
  _kumanda: function () {
    return kumanda;
  },
  _kumandaKontrol: kumandaKontrol,
  _kumandaSayfa: KUMANDA_SAYFA,
  donusKur: donusKur,
  donusDurum: donusDurum,
  donusIptal: donusIptal,
  _donusCagri: function (f) {
    donusCagri = f;
  },
  _donus: function () {
    return donus;
  },
  _donusSor: function () {
    if (donus) donusSor(donus);
  },
  _donusDosya: function (y) {
    DONUS_DOSYA = y;
  },
  _kayitAyarla: function (yedek, bosPay) {
    kayitYedekKok = yedek;
    if (bosPay != null) KAYIT_BOS_PAY = bosPay;
  },
  _kayitlar: kayitlar,
  _medyaKontrol: medyaKontrol,
  _medyaYol: medyaYol,
  _medyaAyarla: function (kokler, usb) {
    medyaKokleri = kokler;
    usbDizini = usb;
  },
  _medya: function () {
    return medya;
  },
  _aliciKontrol: aliciKontrol,
  _alici: function () {
    return alici;
  },
  _yerelAdresler: yerelAdresler,
  _depo: depo,
  _basliklar: basliklariBirlestir
};

// webOS çalışma zamanında: servisi kaydet. (Masaüstünde/testte 'webos-service' yoktur: yalnız işlevler dışa aktarılır.)
var Service = null;
try {
  Service = require('webos-service');
} catch (e) {
  Service = null;
}
if (Service) {
  var servis = new Service(SERVIS_ADI);
  // Parçalı okuma sürerken servis kapanmasın (dinamik servisler boşta ~5 sn sonra sonlanır)
  var etkinlik = null;
  var canliTut = function () {
    try {
      var bos = Object.keys(depo).length === 0 && !alici && !medya && !kayitVar() && !donus && !kumanda;
      if (!bos && !etkinlik && servis.activityManager) {
        servis.activityManager.create('iptv-canli', function (a) {
          etkinlik = a;
        });
      } else if (bos && etkinlik && servis.activityManager) {
        servis.activityManager.complete(etkinlik, function () {});
        etkinlik = null;
      }
    } catch (e) {
      /* eski sürümlerde yoksa yoksay */
    }
  };
  kapaninca = canliTut;
  servis.register('aliciBaslat', function (m) {
    aliciBaslat(m.payload || {}, function (e, r) {
      m.respond(e ? { returnValue: false, errorText: String((e && e.message) || e) } : r);
      canliTut();
    });
  });
  servis.register('aliciSor', function (m) {
    m.respond(aliciSor());
    canliTut();
  });
  servis.register('aliciSonuc', function (m) {
    m.respond(aliciSonuc(m.payload || {}));
  });
  servis.register('aliciDurdur', function (m) {
    m.respond(aliciDurdur());
  });
  servis.register('medyaKokler', function (m) {
    m.respond(medyaKokler());
  });
  servis.register('medyaListele', function (m) {
    m.respond(medyaListele(m.payload || {}));
    canliTut();
  });
  servis.register('medyaBaslat', function (m) {
    medyaBaslat(m.payload || {}, function (e, r) {
      m.respond(e ? { returnValue: false, errorText: String((e && e.message) || e) } : r);
      canliTut();
    });
  });
  servis.register('medyaSor', function (m) {
    m.respond(medyaSor());
    canliTut();
  });
  servis.register('medyaDurdur', function (m) {
    m.respond(medyaDurdur());
  });
  servis.register('kayitBaslat', function (m) {
    kayitBaslat(m.payload || {}, function (e, r) {
      m.respond(e ? { returnValue: false, errorText: String((e && e.message) || e) } : r);
      canliTut();
    });
  });
  servis.register('kayitAlan', function (m) {
    kayitAlan(m.payload || {}, function (e, r) {
      m.respond(e ? { returnValue: false, errorText: String((e && e.message) || e) } : r);
    });
  });
  servis.register('kayitDurum', function (m) {
    m.respond(kayitDurum(m.payload || {}));
    canliTut();
  });
  servis.register('kayitDurdur', function (m) {
    m.respond(kayitDurdur(m.payload || {}));
    canliTut();
  });
  servis.register('fetch', function (m) {
    getir(m.payload || {}, function (e, r) {
      m.respond(e ? { returnValue: false, errorText: String((e && e.message) || e) } : r);
      canliTut();
    });
  });
  donusCagri = function (uri, par, cb) {
    servis.call(uri, par || {}, function (m) {
      cb(m && m.payload ? m.payload : null);
    });
  };
  servis.register('kumandaBaslat', function (m) {
    kumandaBaslat(m.payload || {}, function (e, r) {
      m.respond(e ? { returnValue: false, errorText: String((e && e.message) || e) } : r);
      canliTut();
    });
  });
  servis.register('kumandaSor', function (m) {
    kumandaSor(m.payload || {}, function (r) {
      m.respond(r);
    });
  });
  servis.register('kumandaDurdur', function (m) {
    m.respond(kumandaDurdur());
  });
  servis.register('donusKur', function (m) {
    m.respond(donusKur(m.payload || {}));
  });
  servis.register('donusDurum', function (m) {
    m.respond(donusDurum());
  });
  servis.register('donusIptal', function (m) {
    m.respond(donusIptal());
  });
  servis.register('resim', function (m) {
    resimGetir(m.payload || {}, function (e, r) {
      m.respond(e ? { returnValue: false, errorText: String((e && e.message) || e) } : r);
    });
  });
  servis.register('read', function (m) {
    m.respond(oku(m.payload || {}));
    canliTut();
  });
}
