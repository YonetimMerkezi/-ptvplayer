// Iptv Player Pro · TV içi JS servisi (webOS 3.x/4.x: Node.js 0.12 → yalnız ES5, bağımlılık yok).
// Uygulama (paketlenmiş web uygulaması) başka sunuculara XHR atınca tarayıcı CORS kuralı engelleyebilir;
// bu servis isteği Node tarafında yapar, yanıtı parça parça luna köprüsünden uygulamaya verir.
//
//   fetch {url, headers, timeoutMs, chunk} → {returnValue, status, data, id, done}
//   read  {id, offset, length}              → {returnValue, data, done}
'use strict';

var http = require('http');
var https = require('https');
var zlib = require('zlib');
var urlm = require('url');

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

module.exports = { getir: getir, oku: oku, _depo: depo, _basliklar: basliklariBirlestir };

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
      var bos = Object.keys(depo).length === 0;
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
