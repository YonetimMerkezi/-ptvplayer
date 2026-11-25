// Telefon sayfalarının (kumanda ve liste aktarma) dili: metinler Türkçe yazılıdır; telefonun dili Türkçe değilse (ya da adreste &l=en varsa)
// sayfa İngilizceye çevrilir. Servis bu dosyayı iki sayfaya da <script> olarak koyar; sayfa betikleri iletileri T() ile çevirir.
// ES5: telefon tarayıcıları için. Anahtarlar tırnak işaretiyle (’) yazılır; T() düz tırnağı (') da ’ gibi okur.
(function () {
  var q = /[?&]l=(tr|en)\b/.exec(location.search);
  var dil = q ? q[1] : /^tr\b/i.test(navigator.language || 'tr') ? 'tr' : 'en';
  var S = {
    // kumanda sayfası
    'TV kumandası': 'TV remote', 'Bağlanıyor…': 'Connecting…', 'TV kodu (4 hane)': 'TV code (4 digits)',
    '⟵ Geri': '⟵ Back', '⌂ Ana': '⌂ Home', 'ⓘ Bilgi': 'ⓘ Info', '🔉 Ses −': '🔉 Vol −', '🔇 Sessiz': '🔇 Mute', '🔊 Ses +': '🔊 Vol +',
    'Kanal −': 'Channel −', 'Kanal +': 'Channel +',
    'Parmağınızı kaydırarak TV’deki imleci oynatın': 'Slide your finger to move the cursor on the TV',
    'Dokun: tıkla · İki parmakla kaydır: listeyi kaydır': 'Tap: click · Two fingers: scroll the list',
    'Tıkla': 'Click', 'Yavaş': 'Slow', 'Normal': 'Normal', 'Hızlı': 'Fast',
    'TV’deki arama kutusuna yazılır (yazdıkça)': 'Types into the TV search box (as you type)',
    'Temizle': 'Clear', 'Yaz': 'Type', 'Yaz ve ara': 'Type and search',
    'Hızlı geçiş': 'Quick jump', 'Ana sayfa': 'Home', 'Canlı TV': 'Live TV', 'Filmler': 'Movies', 'Diziler': 'Series', 'Rehber': 'Guide',
    'Spor': 'Sports', 'Favoriler': 'Favorites', 'Geçmiş': 'History', 'Ara': 'Search', 'Ayarlar': 'Settings',
    'TV’de oynat': 'Play on TV', 'Yayın bağlantısı (m3u8, mp4) ya da YouTube': 'Stream link (m3u8, mp4) or YouTube',
    'Ad (isteğe bağlı)': 'Name (optional)', 'Liste bilgilerini yaz (Kaynak ekle)': 'Enter list details (Add source)',
    'M3U bağlantısı': 'M3U link', 'Sunucu adresi': 'Server address', 'Kullanıcı adı': 'Username', 'Şifre': 'Password',
    'TV’ye yaz': 'Write to TV', 'Yaz ve ekle': 'Write and add', 'Evim': 'Home', 'http://sunucu:port': 'http://server:port',
    'Kumanda': 'Remote', 'Fare': 'Mouse', 'Daha': 'More',
    'Iptv Player Pro · Kumanda': 'Iptv Player Pro · Remote',
    // iletiler
    'TV ekranındaki 4 haneli kodu yazın.': 'Enter the 4-digit code shown on the TV.',
    'TV ekranındaki kodu aşağıya yazın.': 'Type the code shown on the TV below.',
    'TV’ye bağlı ✓': 'Connected to the TV ✓',
    'TV’ye ulaşılamadı. Aynı Wi-Fi’de misiniz, TV’de uygulama açık mı?': 'Could not reach the TV. Are you on the same Wi-Fi, and is the app open on the TV?',
    'http:// ya da https:// ile başlayan bir bağlantı yazın.': 'Enter a link that starts with http:// or https://.',
    'http:// ya da https:// ile başlayan liste bağlantısını yazın.': 'Enter a list link that starts with http:// or https://.',
    'TV’ye gönderildi ✓': 'Sent to the TV ✓', 'TV’ye gönderildi; TV bağlanıyor ✓': 'Sent to the TV; it is connecting ✓',
    'TV’deki forma yazıldı ✓': 'Written to the form on the TV ✓', 'Sunucu adresini yazın.': 'Enter the server address.',
    'Bilinmeyen ekran.': 'Unknown screen.', 'Bilinmeyen ses işlemi.': 'Unknown volume action.', 'Bilinmeyen tuş.': 'Unknown key.',
    'Bulunamadı.': 'Not found.', 'Geçersiz istek.': 'Invalid request.', 'TV ekranı kapandı.': 'The TV screen closed.',
    'TV kodu yanlış. TV ekranındaki 4 haneli kodu yazın.': 'Wrong TV code. Enter the 4-digit code shown on the TV.',
    'TV kodu yanlış. TV’deki Telefon kumandası ekranında yazan 4 haneli kodu yazın.': 'Wrong TV code. Enter the 4-digit code shown on the TV’s Phone remote screen.',
    'TV kumandası kapalı.': 'The TV remote is off.', 'TV ses servisine ulaşılamıyor.': 'The TV audio service cannot be reached.',
    'TV zamanında yanıt vermedi.': 'The TV did not respond in time.',
    'TV şu an başka kaynakları işliyor, biraz sonra deneyin.': 'The TV is busy handling other sources; try again shortly.',
    'Çok fazla yanlış kod denendi. TV’de Telefon kumandası ekranını yeniden açın.': 'Too many wrong codes. Reopen the Phone remote screen on the TV.',
    'Çok fazla yanlış kod denendi. TV’de ekranı kapatıp yeniden açın.': 'Too many wrong codes. Close and reopen the screen on the TV.',
    'İstek çok büyük.': 'The request is too large.', 'Sunucu adresi gerekli.': 'Server address is required.', 'Liste bağlantısı gerekli.': 'List link is required.',
    'Bağlantı http:// veya https:// ile başlamalı.': 'The link must start with http:// or https://.',
    'Doğrulanamadı': 'Could not be verified', 'Sunucu geçerli bir yanıt vermedi': 'The server did not return a valid response',
    // liste aktarma sayfası
    'Iptv Player Pro · TV’ye aktar': 'Iptv Player Pro · Send to TV', 'TV’ye liste gönder': 'Send a list to the TV',
    'TV ekranındaki 4 haneli kodu yazın, listenizi yapıştırıp gönderin.': 'Enter the 4-digit code on the TV screen, paste your list and send it.',
    'TV kodu': 'TV code', 'Bağlantı': 'Link', 'Xtream bilgileri': 'Xtream details', 'Liste bağlantısı (M3U ya da get.php)': 'List link (M3U or get.php)',
    'TV’ye gönder': 'Send to the TV', 'TV’ye gönderildi, bağlanılıyor…': 'Sent to the TV, connecting…',
    'TV’ye ulaşılamadı. Telefon ve TV aynı ağda mı, TV ekranı hâlâ açık mı?': 'Could not reach the TV. Are your phone and TV on the same network, and is the TV screen still open?'
  };
  var P = [
    [/^Gönderilemedi \(kod (\d+)\)$/, 'Could not send (code $1)'],
    [/^Eklendi ✓ ([\s\S]*)$/, 'Added ✓ $1'],
    [/^“([\s\S]*)” TV’ye eklendi\.$/, '“$1” was added to the TV.'],
    [/^Bağlanılamadı: ([\s\S]*)\. Adresi kontrol edin\.$/, 'Could not connect: $1. Check the address.'],
    [/^Bağlanılamadı: ([\s\S]*)$/, 'Could not connect: $1'],
    [/^TV sesi uygulamadan değiştirilemedi \(([\s\S]*)$/, 'The TV volume could not be changed from the app ($1'],
    [/^Önceki diskler yazılamadı: ([\s\S]*)$/, 'The previous disks were not writable: $1']
  ];
  function T(s) {
    if (dil !== 'en' || typeof s !== 'string' || !s) return s;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    var k = m[2].replace(/\s+/g, ' ').replace(/'/g, '’');
    if (!k) return s;
    if (Object.prototype.hasOwnProperty.call(S, k)) return m[1] + S[k] + m[3];
    for (var i = 0; i < P.length; i++) if (P[i][0].test(k)) return m[1] + k.replace(P[i][0], P[i][1]) + m[3];
    return s;
  }
  window.T = T;
  window.TDIL = dil;
  if (dil !== 'en') return;
  document.documentElement.lang = 'en';
  document.title = T(document.title);
  function yuru(n) {
    if (n.nodeType === 3) { var v = T(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; return; }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(n.tagName)) return;
    var a = ['placeholder', 'title', 'aria-label'];
    for (var i = 0; i < a.length; i++) if (n.hasAttribute(a[i])) n.setAttribute(a[i], T(n.getAttribute(a[i])));
    for (var c = n.firstChild; c; c = c.nextSibling) yuru(c);
  }
  yuru(document.body);
})();
