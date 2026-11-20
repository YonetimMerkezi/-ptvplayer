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
'use strict';

var http = require('http');
var https = require('https');
var zlib = require('zlib');
var urlm = require('url');
var os = require('os');
var crypto = require('crypto');

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
function istek(adres, basliklar, bitis, kalan, cb) {
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
        return istek(urlm.resolve(adres, res.headers.location), basliklar, bitis, kalan - 1, cb);
      }
      var akis = res;
      var kodlama = String(res.headers['content-encoding'] || '').toLowerCase();
      if (kodlama === 'gzip') akis = res.pipe(zlib.createGunzip());
      else if (kodlama === 'deflate') akis = res.pipe(zlib.createInflate());
      var parcalar = [];
      var boyut = 0;
      akis.on('data', function (c) {
        boyut += c.length;
        if (boyut > MAX_BAYT) {
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
    depo[id] = { metin: metin, t: Date.now() };
    yanit.data = metin.slice(0, parca);
    yanit.id = id;
    yanit.done = false;
    cb(null, yanit);
  });
}

function oku(p) {
  var kayit = depo[p && p.id];
  if (!kayit) return { returnValue: false, errorText: 'Oturum bitti (yanıt artık bellekte değil)' };
  kayit.t = Date.now();
  var bas = p.offset > 0 ? p.offset : 0;
  var uz = p.length > 0 ? p.length : 262144;
  var data = kayit.metin.slice(bas, bas + uz);
  var bitti = bas + uz >= kayit.metin.length;
  if (bitti) delete depo[p.id];
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
    var parcalar = [];
    var boyut = 0;
    var asti = false;
    req.on('data', function (c) {
      if (asti) return;
      boyut += c.length;
      if (boyut > ALICI_MAX_GOVDE) {
        asti = true;
        return aliciYanit(res, 413, { ok: false, mesaj: 'İstek çok büyük.' });
      }
      parcalar.push(c);
    });
    req.on('end', function () {
      if (asti || !alici) return;
      var g = null;
      try {
        g = JSON.parse(Buffer.concat(parcalar).toString('utf8'));
      } catch (e) {
        return aliciYanit(res, 400, { ok: false, mesaj: 'Geçersiz istek.' });
      }
      aliciEkle(res, g);
    });
    return;
  }
  aliciYanit(res, 404, { ok: false, mesaj: 'Bulunamadı.' });
}

// cb(hata, bilgi). Zaten çalışıyorsa aynı kod ve port döner.
function aliciBaslat(p, cb) {
  if (alici) {
    alici.sonSoru = Date.now();
    return cb(null, aliciBilgi());
  }
  var ilk = p && p.ilkPort >= 0 ? Math.floor(p.ilkPort) : ALICI_ILK_PORT;
  var adet = p && p.portAdedi > 0 ? Math.min(100, Math.floor(p.portAdedi)) : ALICI_PORT_ADEDI;
  var deneme = 0;
  function dene() {
    var port = ilk === 0 ? 0 : ilk + deneme;
    var sunucu = http.createServer(aliciIstek);
    var tamam = false;
    sunucu.on('error', function (e) {
      if (tamam) return;
      deneme++;
      if (e && e.code === 'EADDRINUSE' && deneme < adet) return dene();
      cb(new Error('Alıcı başlatılamadı: ' + String((e && e.message) || e)));
    });
    sunucu.listen(port, function () {
      tamam = true;
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
  dene();
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

module.exports = {
  getir: getir,
  oku: oku,
  aliciBaslat: aliciBaslat,
  aliciSor: aliciSor,
  aliciSonuc: aliciSonuc,
  aliciDurdur: aliciDurdur,
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
      var bos = Object.keys(depo).length === 0 && !alici;
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
  servis.register('fetch', function (m) {
    getir(m.payload || {}, function (e, r) {
      m.respond(e ? { returnValue: false, errorText: String((e && e.message) || e) } : r);
      canliTut();
    });
  });
  servis.register('read', function (m) {
    m.respond(oku(m.payload || {}));
    canliTut();
  });
}
