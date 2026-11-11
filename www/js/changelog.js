// Yenilikler: en yeni üstte. id her sürümde bir artar; güncellemeden sonra görülmemiş kayıtlar bir kez gösterilir.
// CI, en yeni kaydı güncelleme penceresinde göstermek üzere notes.txt'ye yazar (scripts/build-www.mjs).
export const CHANGELOG = [
  {
    id: 57,
    title: 'Spor: bayraklar, takım logoları ve yedek yayın kaynakları',
    items: [
      'Milli takım maçlarında iki ülkenin bayrağı, kulüp maçlarında takım logosu görünür (maç satırında ve maç ekranının başlığında); logosu bulunamayan takımda baş harf yazar',
      'Yayın akışı bir siteden alınamazsa sırayla başka sitelere geçilir; maç takvimi ve kanal bilgisi yine gelir'
    ],
  },
  {
    id: 56,
    title: 'Spor: kısa adlı kanallar bulunuyor',
    items: ['Yayın bilgisindeki ATV, A2, TV8 gibi kısa adlı kanallar artık listenizdeki karşılığıyla eşleşir; maç ekranında “Bu kanallar listenizde bulunamadı” yerine kanal listelenir ve dokununca açılır'],
  },
  {
    id: 55,
    title: 'Spor: hata düzeltmesi',
    items: ['Aynı saatte birden fazla maç olduğunda listenin yalnızca ilk maçı gösterip “LEAGUES is not defined” hatası vermesi düzeltildi'],
  },
  {
    id: 54,
    title: 'Spor: örnekteki gibi maç kartları',
    items: [
      'Maçlar saat sırasıyla tek listede: saat, “Takım - Takım”, altında lig · tur/hafta; sağda yayın kanalının logosu, yayın bilgisi yoksa gri “Yayın yok”',
      'Yayın bilgisi yoksa maç ekranında kanal listesi ya da tahmin gösterilmez',
      'Günlük yayın akışı aynı zamanda maç takvimi olarak da kullanılır; Türkiye alt ligleri ve diğer ligler artık lig adıyla görünür',
      'Kaynak adları uygulamada gösterilmez',
    ],
  },
  {
    id: 53,
    title: 'Spor: maça dokununca maç bilgi ekranı ve kanal listesi',
    items: [
      'Maç satırına dokununca artık her zaman maç bilgi ekranı açılır; yayın kanalları bu ekrandaki “Yayın” bölümünde listelenir ve dokununca oynar (ⓘ düğmesi kalktı)',
      'Kanallar gruplanır: Rehberinizde ve Yayın kanalları',
      'Maçın ligi/turnuvası ve aşaması (Grup A, Çeyrek final, 12. hafta…) hem satırda hem bilgi ekranının başlığında yazar',
    ],
  },
  {
    id: 52,
    title: 'Spor: maç bazında güncel yayın kanalı',
    items: [
      'Maç satırlarında “Yayın: kanal adı” günlük TV yayın akışından gelir: TFF alt ligleri dahil Türkiye’deki gerçek kanal yazılır; dokununca listenizdeki karşılığı önerilir',
      'Yayın bilgisi bulunamayan maçlarda tahmin yürütülmez; “Yayın yok” yazar',
      'Veriler alınamazsa durum satırında kısa bir not görünür',
    ],
  },
  {
    id: 51,
    title: 'Spor: ikinci kaynakla daha eksiksiz maç takvimi',
    items: [
      'Maç takvimi artık iki kaynaktan birleştirilir: Türkiye alt ligleri ve kupa, uluslararası maçlar, büyük Avrupa ligleri ve diğer ülkelerin maçları tamamlanır; iki kaynakta da olan maç tek satır görünür',
      'Lig düğmelerinde yeni gruplar: Türkiye · diğer, Uluslararası, Avrupa ligleri ve Diğer ülkeler (Diğer ülkeler yalnız kendi düğmesinde görünür). Canlı maçlarda dakika ve skor gelir',
      'Kaynaklardan biri alınamazsa diğeriyle devam edilir. Bazı maçların ayrıntısında olay/istatistik/kadro yoktur (yalnız skor, durum ve yayın)',
    ],
  },
  {
    id: 50,
    title: 'Spor: maç ayrıntıları ve yayın bilgisi',
    items: [
      'Maç satırının sağındaki ⓘ düğmesi (biten maçta satıra dokunmak) maç ayrıntısını açar: skor ve dakika, goller/kartlar/oyuncu değişiklikleri, istatistik (topla oynama, şut…), kadro ve diziliş, stat, hakem, seyirci',
      'Yayın bölümü: TV rehberinizde bu maçı gösteren tüm kanallar program adıyla listelenir ve dokununca açılır; yabancı yayıncılar ülke adıyla yazılır',
      'Canlı maçta ayrıntı sayfası 45 saniyede bir kendiliğinden yenilenir (anlık değildir)',
    ],
  },
  {
    id: 49,
    title: 'Kumanda: daha rahat gezinme, belirgin imleç',
    items: [
      'Odaktaki öğe artık tüm temalarda beyaz + koyu kenarlı belirgin bir çerçeveyle gösterilir (yeşil temada da hangi düğmede/filmde olduğunuz net görünür)',
      'Kategori düzenlerken göster/gizle düğmesinden sağa basınca kilit düğmesine de gelinir',
      'Film ayrıntısında uzun konu kumandayla aşağı okunur, yukarı basınca en üste dönülür',
      'Bir kategoriden geri çıkınca imleç en üstteki Düzenle düğmesine değil, son girdiğiniz kategoride kalır; kategoriye girince imleç listenin ilk öğesinde başlar',
      'Spor: maç bilgisi alınamazsa nedeni ekranda yazar; bir adres reddedilirse daha yalın adrese düşülür; skor istekleri büyük liste/rehber indirmelerinin arkasında beklemez',
    ],
  },
  {
    id: 48,
    title: 'Spor: futbol maç takvimi ve skorlar',
    items: [
      'Ana ekranda yeni “Spor” kutusu: Süper Lig, Premier Lig, La Liga, Serie A, Bundesliga, Ligue 1, Şampiyonlar Ligi, Avrupa ve Konferans Ligi ile milli maçlar; dünden bir hafta sonrasına gün gün takvim, lig süzgeci',
      'Skorlar ve dakika dakikada bir yenilenir (anlık değil); sayfa açıkken canlı maç varsa kendiliğinden güncellenir',
      'Maçın hangi kanalda olduğu TV rehberinden bulunur: maça dokununca kanal doğrudan açılır. Rehberde bulunamazsa yayıncının adı (beIN SPORTS, S Sport, TRT / Tabii, A Spor / ATV; tahmini) yazılır ve dokununca listenizdeki o yayıncının kanalları gösterilir',
      'Çocuk modunda “Spor” kutusu gizlidir (çocuk profilinde gizlenmesi gereken kutuların gizleme kuralı da onarıldı)',
    ],
  },
  {
    id: 47,
    title: 'Hatırlatıcı bildirim uyarısı',
    items: [
      'Bildirimler (ya da hatırlatıcı kanalı) telefon ayarlarından kapatılmışsa Planlananlar’da artık Android sürümünden bağımsız uyarı çıkar; “İzni aç” doğrudan uygulamanın bildirim ayarlarını açar',
    ],
  },
  {
    id: 46,
    title: 'Canlı kayıt tanısı',
    items: [
      'Biçimi tanınmayan canlı yayında kayıt uyarısı ilk baytları, paket boyutu izini ve istek konumunu da gösterir',
    ],
  },
  {
    id: 45,
    title: 'Şifreli yayınların kaydı',
    items: [
      'AES-128 şifreli HLS yayınlar (ör. bazı film/dizi kanalları) artık kaydedilebiliyor: kayıt çözülmüş, normal bir .ts dosyası olur; oynatma etkilenmez',
      'Çözülemeyen şifreleme (SAMPLE-AES/DRM) kayıt başlamadan söylenir',
      'Biçimi tanınmayan yayında uyarı artık yayının dosya adı, sunucunun bildirdiği tür ve liste durumunu da gösterir (sorunu bulmak için); uzun uyarı daha uzun süre ekranda kalır',
    ],
  },
  {
    id: 44,
    title: 'Canlı yayın kaydı: biçim denetimi',
    items: [
      'Kaydedilemeyecek yayında (MKV, FLV, şifreli HLS, tanınmayan biçim) kayıt başlamadan nedeni söylenir; boş dosya oluşmaz',
      'fMP4 (HLS-CMAF) yayınlar artık .mp4 olarak kaydedilir; kayıtlar listesinde birlikte görünür',
      'Veri gelmeyen kayıt 40 saniye içinde kendiliğinden biter ve nedeni (yayın biçimi) bildirilir',
    ],
  },
  {
    id: 43,
    title: 'Kumanda düzeltmeleri',
    items: [
      'Film oynatıcıda ilerleme çubuğunun altındaki düğmelere artık inilebiliyor; çubukta aşağı/yukarı tuşu filmi sarmıyor (sarmak için sağ/sol)',
      'Film ayrıntı sayfası oynatıcının altında kumandayı çalmıyor: oklar doğrudan oynatıcı denetimlerinde geziyor',
      'Ayarlar’da Tema rengi ve sağa yaslı seçici satırları atlanmıyor; ekranın dışında kalan satırlara da aşağı/yukarı okla gidilip liste kayıyor',
    ],
  },
  {
    id: 42,
    title: 'Canlı yayın kaydı düzeltmesi',
    items: [
      'Doğrudan .ts adresli yayınlarda kayıt açılmıyordu (dosya boş kalıyordu); paket ortasından başlayan yayınlar artık kaydediliyor',
      'Hiç veri yazılamayan kayıt silinir ve nedeni söylenir; eski boş kayıtlar listede “boş” görünür',
    ],
  },
  {
    id: 41,
    title: 'Kutudaki film adı',
    items: ['Genel ayarlar › Kutudaki film/dizi adı: Gizli, 2, 3 (varsayılan) veya 5 satır; uzun adlar daha çok satırda görünür, gizlenince yalnız afiş kalır ve kutular kısalır'],
  },
  {
    id: 40,
    title: 'Büyük afiş',
    items: ['Yatay ekranda film ve dizi afişi görünen yüksekliğe tam sığar (2:3); sayfa kayarken yerinde durur'],
  },
  {
    id: 39,
    title: 'Bölüm küçük resmi ayarı',
    items: ['Genel ayarlar › Bölüm küçük resimlerini göster: kapatınca dizi bölümleri resimsiz, daha sıkışık listelenir'],
  },
  {
    id: 38,
    title: 'Dizi ekranı düzeltmeleri',
    items: [
      'Yatay ekranda uzun konu artık sol sütunda aşağı kayar ve sonuna kadar okunur; bölüm listesi ve afiş yerinde durur',
      'Bölüm satırları ve düğmeler küçültüldü; küçük resimli bölümler daha sıkışık, kısa yatay ekranda daha da küçük',
    ],
  },
  {
    id: 37,
    title: 'Yeni film ve dizi ekranı',
    items: [
      'Yatay ve geniş ekranda (TV, tablet) film ve dizi ayrıntısı: solda ayrıntılar, ortada bölümler, sağda büyük afiş; bölümlerde küçük resim (sağlayıcı verirse)',
      'Genel ayarlar › Hafif mod: animasyon, gölge ve bulanıklığı kapatır; 2 GB ve altı bellekli cihazda otomatik açılır',
      'Oynatıcı ayarları › Yayın önbelleği: kanalı çabuk açan “Hızlı” düzey eklendi',
      'Genel ayarlar › Devam çubuklarını göster: film kutuları ve bölümlerdeki izleme çubuğu gizlenebilir',
      'Film bitince aynı kategoriden bir sonraki film önerilir (Oynatıcı ayarlarından kapatılabilir)',
    ],
  },
  {
    id: 36,
    title: 'Çok renkli temalar',
    items: [
      'Genel ayarlar › Tema rengi: Renkli kartlar, Dolu renk, Neon cam ve Gün batımı temaları eklendi',
      'Bu temalarda Canlı TV, Filmler, Diziler ve Kategoriler kutuları ile alt sekmeler, üst çubuk ve ayar kutularındaki simgeler kendi renginde',
    ],
  },
  {
    id: 35,
    title: 'Yönetici formu renk düzeltmesi',
    items: ['Yönetici panelindeki Yeni kullanıcı formunda Süre ve Tür kutuları beyaz zemin üzerinde okunmuyordu: koyu temaya uyduruldu'],
  },
  {
    id: 34,
    title: 'Davet kodu ve sorun raporu',
    items: [
      'Kaynak ekle › Kod: size liste veren kişinin gönderdiği davet koduyla liste kendiliğinden eklenir; erişim bitince ya da kod kapatılınca liste de kalkar',
      'Genel ayarlar › Cihaz kimliği ve Sorun raporu: yöneticinize göndereceğiniz bilgileri önizleyip paylaşın (şifre, kullanıcı adı ve liste adresi gönderilmez)',
      'Canlı TV’nin bölmeli ekranından tam ekrana geçince sol üstteki geri oku oynatıcıyı yeniden açıyordu: düzeltildi',
    ],
  },
  {
    id: 33,
    title: 'Hızlı indirme, oynatıcıda İndir',
    items: [
      'Hızlı indirme (İndir sayfasından açılır, varsayılan kapalı): dosyayı birkaç bağlantıyla aynı anda indirir; sağlayıcı tek bağlantıyı yavaşlatıyorsa belirgin hızlanır, fazla bağlantıyı kabul etmezse kendiliğinden tek bağlantıya döner',
      'Oynatıcıda İndir düğmesi: film ya da bölümü izlerken indirmeye ekleyin',
      'Ayarlar › Oynatıcı ayarları: yayın bağlantısı, bölüm geçişi, altyazı ve kumanda ayarları Genel ayarlar’dan buraya taşındı; alt düğmelerden hangilerinin adı yazsın buradan seçilir',
      'Oynatıcının alt düğmeleri ortalı, tek satırda ve varsayılan yalnız simge (ad göstermek istediklerinizi seçersiniz)',
      'Oynatıcının sol üstündeki geri oku artık oynatıcıyı kapatır (telefonun geri hareketi yayını küçük oynatıcıya alır)',
    ],
  },
  {
    id: 32,
    title: 'Yeni sürüm bildirimi',
    items: [
      'Uygulama açılınca yeni sürüm varsa ekranın üstünde bildirim şeridi çıkar; “Güncelle”ye dokununca güncelleme açılır, × o açılış için gizler',
      'Büyük “Yeni sürüm hazır” penceresi artık kendiliğinden açılmaz; yeni sürüm bilgisi bir sonraki açılışta ağ beklemeden hemen gösterilir',
    ],
  },
  {
    id: 31,
    title: 'Çevrimdışı izleme: film ve bölüm indirme',
    items: [
      'Film sayfasında “İndir”, dizide her bölümün yanındaki simge ve “Sezonu indir” ile internetsiz izlemek için indirin; hepsi Ayarlar › İndirilenler’de',
      'İndirme arka planda ve bildirimle sürer: sırayla iner, duraklatılabilir, bağlantı kopsa da kaldığı yerden devam eder',
      'Aynı filmin 4K / FHD / SD gibi sürümleri listede varsa indirirken sürümü seçersiniz; “Yalnız Wi-Fi’de indir” seçeneği vardır',
      'Dosya olduğu gibi iner: ses dilini ve altyazıyı izlerken seçersiniz. Canlı ve parçalı (m3u8) yayınlar indirilemez',
    ],
  },
  {
    id: 30,
    title: 'Çocuk profili, tüm kaynaklarda arama, otomatik eşitleme',
    items: [
      'Çocuk profili: Ayarlar › Çocuk profili’nde izinli kategorileri seçin, ayrı bir şifre belirleyin; çocuk modunda yalnız bu kategoriler görünür, ayarlar ve kaynaklar gizlenir, çıkış şifreyle olur',
      'Ara sayfasında “Tüm kaynaklar”: kayıtlı tüm kaynakların listelerinde birlikte arar; sonuçta kaynak adı yazar, dokununca o kaynağa geçip açar',
      'TV ile eşitleme kendiliğinden: uygulama açılınca ve favori değişince, eşleşmiş TV aynı ağdaysa sessizce eşitler (Yedekle / geri yükle’den kapatılabilir)',
      'Favori silmeleri artık diğer cihaza da yayılır; izleme ilerlemesinde en yeni kayıt geçerli olur, bitirilen film her iki cihazda “devam et”ten kalkar',
    ],
  },
  {
    id: 29,
    title: 'TV düzeltmeleri',
    items: [
      'TV’de resim içinde resim ve küçük oynatıcı yok; Geri yayını kapatır',
      'TV’de arama kutusundan geçerken ekran klavyesi kendiliğinden açılmaz; Tamam’a basınca açılır',
      'Oynatıcıda yön tuşları yayını durdurmadan yalnız denetimleri açar; yukarı/aşağı artık kanal değiştirmez (kanal +/- tuşları değiştirir)',
      'Gece modu gibi pencerelerde kumandayla gezinme düzeldi',
      'Telefondan oynat: kodu yalnız TV üretir; telefonda TV’yi seçip TV’deki kodu girersiniz',
      'Film ilk açılışta yavaş ama veri geliyorsa artık 25 sn’de pes etmez (en çok 90 sn bekler); dosya açılıp görüntü başlamazsa nedenini söyler',
    ],
  },
  {
    id: 28,
    title: 'Kumanda renk tuşları, TV ana ekranı, sesli arama',
    items: [
      'Kırmızı/yeşil/sarı/mavi tuşlara oynatıcıda ve listelerde istediğiniz işi atayın (Genel ayarlar)',
      'Android TV ana ekranında “Devam et” satırı: yarım kalan film ve bölüm doğrudan açılır',
      'Sesli arama: arama kutusundaki mikrofon düğmesi (Android)',
    ],
  },
  {
    id: 27,
    title: 'Altyazı görünümü, gece modu, sonraki bölüm',
    items: [
      'Altyazı görünümü: boyut, renk, arka plan, konum (Altyazı penceresinden ya da Genel ayarlardan)',
      'Gece modu: sessiz konuşmayı yükseltir, patlamayı bastırır (oynatıcıda)',
      'Bölüm bitmeden “Sonraki bölüm” geri sayımı ve “Intro atla”; Genel ayarlardan kapatılır',
      'En-boy seçimi hatırlanır; iki parmakla açıp kısarak değişir',
    ],
  },
  {
    id: 26,
    title: 'Bağlantı ayarları, yayın bilgisi ve kanal temizliği',
    items: [
      'Genel ayarlar: yayın koparsa yeniden bağlanma (normal/sürekli/kapalı), takılma süresi, yedek kanal denemesi',
      'Oynatıcıda “Yayın bilgisi”: tampon, çözünürlük, bit hızı, codec, bağlantı hızı',
      'Yayın kalitesi: önceki test sonucu satırda görünür; çalışmayanları gizle, Gizlenenler’den geri getir',
      'Klasördeki kanalların sırası düzenlenebilir',
    ],
  },
  {
    id: 25,
    title: 'Geriye dönük izleme, hatırlatıcı ve zamanlı kayıt',
    items: [
      'Arşivli Xtream kanalında program ayrıntısından “Arşivden izle”; “Canlıya dön” kanala geçirir',
      '“Hatırlat”: program başlamadan 5 dk önce bildirim; dokununca kanal açılır',
      '“Kaydet”: uygulama kapalıyken de başlar, Kayıtlar’a düşer (Xtream, doğrudan TS)',
      'Ayarlar › Planlananlar ve rehberde “Program ara”',
    ],
  },
  {
    id: 24,
    title: 'Ana ekran kısayolları yatayda düzgün',
    items: [
      'Alt kısayol kutularında sayılar simgenin köşesinde rozet oldu; yatay ekranda yazı ve sayı taşmıyor',
    ],
  },
  {
    id: 23,
    title: 'Yayın kalitesi testi: kategori, arama, toplu test',
    items: [
      'Kategori seçip kanal arayabilir, kanala dokunarak ya da “Kategoriyi test et” ile tüm kanalları sınayabilirsiniz; sonuç her satırda görünür',
      'Test artık sunucuya doğrudan (WebView dışından) ulaşıyor; çalışan kanallar yanlışlıkla “başarısız” görünmez',
      'Yayın kalitesi kutucuğuna simge eklendi',
    ],
  },
  {
    id: 22,
    title: 'TV rehberi kumandayla ve tek kaydırmayla',
    items: [
      'TV Rehberi kutucuğuna simge eklendi',
      'Kumanda okları programdan programa ve kanaldan kanala gezer; Geri önce kategorilere, sonra ana ekrana döner',
      'Kategori seçince çizelge ekranı doldurur; tek kaydırma alanı var, sayfa kaymaz',
    ],
  },
  {
    id: 21,
    title: 'Zaman çizelgeli rehber ve kalıcı mini oynatıcı',
    items: [
      'TV rehberi zaman çizelgesi oldu: kanallar solda, programlar süresine göre bloklar, şimdi çizgisi; programa dokununca ayrıntı ve “Kanalı izle”',
      'Geri ile küçülen yayın, sekmeler ve listeler arasında gezerken açık kalır',
      'Ana ekrana çıkınca ya da ana ekranda Geri’ye basınca yayın küçük pencerede (PiP) sürer; pencereyi kapatınca yayın durur',
    ],
  },

  {
    id: 20,
    title: 'Hata taraması',
    items: [
      'Bozuk M3U satırı, eksik sağlayıcı yanıtı veya bozuk yedek dosyası artık uygulamayı çökertmiyor',
      'Bölmeli canlı TV ekranında kategori seçmeden arama yapınca oluşan çökme giderildi',
      'Uyku zamanlayıcısı, uygulama kilidi ve “TV’de oynat” artık yayını gerçekten durdurur (mini oynatıcıda çalmaya devam etmez)',
    ],
  },

  {
    id: 19,
    title: 'Kategorili ve logolu TV rehberi',
    items: [
      'TV rehberi önce kanal kategorilerini gösterir; kategori seçilince o kategorinin kanalları açılır',
      'Kanal logoları, şu anki ve sonraki programlar ile yayın ilerleme çizgisi gösterilir',
      'Kanala dokunulduğunda mevcut ayrıntılı günlük yayın akışı açılır',
      'Ana ekrandaki EPG kısayolu TV Rehberi olarak güncellendi',
    ],
  },

  {
    id: 18,
    title: 'TV rehberi ve yayın kalitesi ekranları',
    items: [
      'TV rehberinde kanallar tek ekranda aranabilir; her kanalın şu anki ve sonraki programı gösterilir',
      'Kanal seçildiğinde program ayrıntıları ve gün bazlı yayın akışı açılır',
      'Yayın kalitesi ekranında seçilen kanalın bağlantı süresi, HTTP yanıtı ve medya biçimi kontrol edilir',
      'Tanılama sonucu sunucu erişimini gösterir; görüntü ve codec uyumluluğu ayrıca oynatma sırasında doğrulanır',
    ],
  },


  {
    id: 17,
    title: 'Uygulama içi güncelleme denetimi',
    items: [
      'Sürüm bilgisi her kontrolde önbellekten bağımsız istenir; eski sürüm bilgisinin gösterilmesi riski azaltılır',
    ],
  },

  {
    id: 16,
    title: 'Küçük oynatıcı görüntüsü düzeltildi',
    items: [
      'Küçük oynatıcı açıkken arka plandaki film kartlarının videoyu örtmesi giderildi',
      'Video alanı uygulama arayüzünden ayrılır; büyütme ve kapatma düğmeleri çalışmaya devam eder',
    ],
  },

  {
    id: 15,
    title: 'Harici oynatıcı desteği',
    items: [
      'Android cihazlarda oynatma ekranından kurulu harici oynatıcılar seçilebilir',
      'VLC gibi uyumlu uygulamalara Android uygulama seçicisi üzerinden geçiş yapılır',
      'Özel HTTP başlığı gerektiren yayınlar için aktarımın desteklenmediği bildirilir',
    ],
  },

  {
    id: 14,
    title: 'Gelişmiş TV rehberi',
    items: [
      'Kanal programları günlere ayrıldı; Bugün ve diğer yayın günleri arasında geçiş yapılabilir',
      'Şu anda yayınlanan program belirginleştirilir; program açıklamaları rehberde gösterilir',
      'TV kumandası ve dokunmatik ekranla kullanılabilen gün seçimi eklendi',
    ],
  },
  {
    id: 13,
    title: 'Medya uyumluluğu ve yayın tanılama altyapısı',
    items: [
      'Yayın sağlık kontrolü için bağlantı süresi, HTTP yanıtı ve medya biçimini ölçen tanılama altyapısı eklendi; gerçek görüntü ve codec desteği oynatma sırasında ayrıca doğrulanır',
      'HLS, DASH, MP4, MKV, TS, MOV, AVI, WMV, FLV ve RTSP adreslerini tanımaya yönelik format algılama eklendi',
    ],
  },
  {
    id: 12,
    title: 'Çoklu ekran ve mini oynatıcı iyileştirmeleri',
    items: [
      'Canlı yayın ekranından geri çıkıldığında yayın kapanmadan uygulama içinde küçük oynatıcıya küçültülür; dokunarak yeniden büyütülebilir veya kapatılabilir',
      'Çoklu ekrandaki kanal kontrol düğmeleri 2 saniye işlem yapılmadığında gizlenir; ekrana dokununca yeniden görünür',
      'Çoklu ekran açılışında kontrol düğmelerinden kaynaklanan JavaScript hatası giderildi',
    ],
  },

  {
    id: 11,
    title: 'Çoklu ekran',
    items: [
      'Ses geliyor ama görüntü gelmiyorsa (örn. HEVC yayınlar) kutu kendiliğinden yeniden bağlanır; sürerse nedeni kutuda yazar (görüntü biçimi, kod çözücü)',
      'Küçük kutularda uyarlanır yayınlarda kutuya uygun çözünürlük seçilir; ilk kod çözücü açılamazsa yedeği denenir',
    ],
  },
  {
    id: 10,
    title: 'TV ile eşitleme',
    items: [
      'Telefondan Ayarlar › Genel › Yedekle / geri yükle › “TV ile eşitle”: kaynak, favori, son izlenen, izleme ilerlemesi ve kategori düzeni iki cihazda birbirini tamamlar',
      'İki cihazda var olan hiçbir şey değişmez ya da silinmez; her cihaz yalnız eksik olanı alır',
      'Ayarlar eşitlenmez; TV’de uygulama açık ve aynı Wi‑Fi’de olmalı',
    ],
  },
  {
    id: 9,
    title: 'Ses senkronu',
    items: [
      'Ses görüntüden önce ya da sonra geliyorsa: oynatıcıda “Ses senkronu” ile sesi 50 ms adımlarla geciktirin veya öne alın',
      'Ayar kalıcıdır ve tüm yayınlarda geçerlidir; “Sıfırla” ile kaldırılır',
      'Gecikme ayarlıyken Dolby/DTS sesler çözülerek işlenir; ayar ilk yapıldığında yayın yeniden açılır',
    ],
  },
  {
    id: 8,
    title: 'Kayıtlardan izleme düzeltildi',
    items: ['Ana ekran › Kayıtlar’dan bir kayda dokununca oynatıcı artık açık kalıyor (daha önce hemen kapanıyordu)', 'Alt pencereler kapanırken yeni açılan sayfa ya da oynatıcı da kapanma sorunu giderildi'],
  },
  {
    id: 7,
    title: 'Telefondan TV’ye oynatma',
    items: [
      'Telefondaki uygulamadan film veya kanalı aynı Wi‑Fi’deki TV’ye gönderin: film sayfasında ya da oynatıcıda “TV’de oynat”',
      'Telefon uzaktan kumanda olur: oynat/duraklat, 10 sn ileri-geri, konum çubuğu, ses, durdur; canlıda kanal değiştirme',
      'TV’de Ayarlar › Telefondan oynat: bir kereye mahsus eşleştirme kodu gösterir; film adı ve ilerleme TV ekranında görünür',
    ],
  },
  {
    id: 6,
    title: 'Yeni ad ve ikon, yedekleme',
    items: ['Uygulamanın adı “Iptv Player Pro” oldu, yeni ikon', 'Ayarlar › Genel ayarlar › Yedekle / geri yükle: kaynaklar, favoriler, kategori düzeni ve ayarlar tek dosyaya kaydedilir, yeni cihazda geri yüklenir', 'Yenilikler: güncellemeden sonra neler eklendiği burada gösterilir'],
  },
  {
    id: 5,
    title: 'Yayını cihaza kaydetme',
    items: ['Oynatıcıda “Kaydet”: izlenen canlı yayın cihaza kaydedilir (süre seçilebilir)', 'Ana ekran › Kayıtlar: kaydı istediğiniz yere sararak izleyin, silin', '“Durdur ve baştan izle” ve “Canlıya dön”'],
  },
  {
    id: 4,
    title: 'Yedek adres ve çalışmayan kanal işareti',
    items: ['Kanal açılmazsa listedeki aynı adlı kanal otomatik denenir', 'Açılamayan kanallar listede “Çalışmıyor olabilir” diye işaretlenir'],
  },
  {
    id: 3,
    title: 'Rakamla kanal, son kanal, uyku zamanlayıcısı',
    items: ['Kumanda rakamlarıyla kanal numarası girin; “0” son izlenen kanala döner', 'Oynatıcıda uyku zamanlayıcısı (15 dk – 2 saat)', 'Başlıkta kanal numarası görünür'],
  },
  {
    id: 2,
    title: 'Sıralama',
    items: ['Kanal, film ve dizi listelerinde yeni eklenen, A–Z, Z–A ve puana göre sıralama (Favoriler dahil)'],
  },
  {
    id: 1,
    title: 'Uygulama şifresi',
    items: ['4–6 rakamlık uygulama şifresi; kategorileri çocuk kilidiyle şifreleyebilirsiniz (Genel ayarlar › Uygulama şifresi)'],
  },
];

export const LATEST_ID = CHANGELOG[0].id;

// Görülmemiş kayıtlar. seen: son gösterilen id (yoksa null). Kurulu kullanıcı (kaynağı var) ilk kez güncelliyorsa hepsi sayılır; temiz kurulumda hiçbiri.
export function unseenEntries(seen, hasData, list = CHANGELOG) {
  const s = seen == null ? (hasData ? 0 : list[0] ? list[0].id : 0) : seen;
  return list.filter((e) => e.id > s);
}

// Güncelleme penceresindeki kısa not: en yeni kaydın maddeleri, satır satır.
export function latestNotes(list = CHANGELOG) {
  const e = list[0];
  return e ? e.items.map((x) => '• ' + x).join('\n').slice(0, 480) : '';
}
