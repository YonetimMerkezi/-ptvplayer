// Yenilikler: en yeni üstte. id her sürümde bir artar; güncellemeden sonra görülmemiş kayıtlar bir kez gösterilir.
// CI, en yeni kaydı güncelleme penceresinde göstermek üzere notes.txt'ye yazar (scripts/build-www.mjs).
export const CHANGELOG = [
  {
    id: 149,
    title: 'Fragman kontrolsüz, afişin yerinde',
    items: [
      'Fragman film/dizi ekranının en üstünde, kenardan kenara açılır; YouTube başlığı, ayar ve altyazı düğmeleri görünmez',
      'Gölgeli afiş hazır olduğunda kararır ve video yumuşakça belirir; küçük ses düğmesi sağ altta, video bitince afişe dönülür',
      'Bulunan diğer fragmanlar ve YouTube bağlantısı düğmelerin altında “Diğer fragmanlar” şeridinde',
    ],
  },
  {
    id: 148,
    title: 'Telefonda Netflix gibi vitrin',
    items: [
      'Film ve Dizi ekranı telefonda dikeyken de vitrinli açılır: üstte büyük gölgeli afiş, altında kayan satırlar (Genel ayarlar › Film ve dizi ekranı: Otomatik)',
      'Vitrinde Oynat (dizide İzle) ve Bilgi düğmeleri; afişe dokunmak yapımı açar',
    ],
  },
  {
    id: 147,
    title: 'Fragman araması: yatay sonuç şeridi',
    items: [
      'Fragman ararken YouTube’un bulduğu videolar fragmanın altında yatay kaydırılan bir şeritte listelenir; dokunduğunuz video üstte açılır',
      'En alakalı fragman ilk sıradadır ve otomatik oynar; yanlışsa şeritten doğrusunu seçebilirsiniz. Uygun fragman seçilemese de sonuçlar şeritte görünür',
      'Arama Türkçe adla ve yılsız yapılır (“Asla Teslim Olma fragman”); resmî kanal şartı yoktur. Başlıktaki yıl farklıysa (başka bir yapım) video elenir',
      'Fragman bulunamazsa kartın altında nedeni ve ilk sonuçların adları yazar',
    ],
  },
  {
    id: 146,
    title: 'Fragman araması telefonda düzeltildi',
    items: [
      'Uygulamanın YouTube araması telefonun mobil kimliğiyle gidiyordu ve YouTube’un mobil sayfası okunamıyordu; artık masaüstü sayfası istenir, mobil düzen de okunur',
      'Fragman bulunamazsa kartın altında nedeni yazar (kaç video bulundu, sayfa okunamadı ya da bağlantı hatası); eski hatalı “bulunamadı” kayıtları temizlendi',
    ],
  },
  {
    id: 145,
    title: 'Ana ekran bölümlerinin sırası ayarlardan değişir',
    items: [
      'Ayarlar → Genel → Ana ekran → “Bölüm sırası”: Keşfet, Hızlı erişim, Kaldığın yerden devam, Son izlenenler, Son eklenenler, Film önerileri, Vizyondakiler ve Radyo bölümlerini yukarı, aşağı ya da en üste taşıyabilirsiniz',
      '“Varsayılan sıra” ile eski düzene dönülür. Bağlantı durumu ve alt bilgi her zaman en altta kalır',
    ],
  },
  {
    id: 144,
    title: 'Ana ekranda tek “Son izlenenler”',
    items: [
      'Son izlenen kanallar, filmler ve diziler artık üç ayrı satır yerine tek bölümde sekmeli: Kanallar · Filmler · Diziler',
      'Açılışta en son izlediğiniz türün sekmesi gelir; sekmeye dokununca liste değişir, “Tümünü gör” seçili sekmeyi açar. İzlemediğiniz tür için sekme çıkmaz',
    ],
  },
  {
    id: 143,
    title: 'Fragmanı YouTube’da kendisi bulsun',
    items: [
      'Hazır fragman yoksa uygulama başlığı YouTube’da Türkçe adıyla arar (örn. “Asla Teslim Olma 2026 fragman”); olmazsa özgün adla “official trailer” dener ve bulduğu resmî fragmanı ekranda oynatır',
      'Bulunan videonun adı ve kanalı altında yazar; yanlış çıkarsa sıradaki video denenir, hiçbiri olmazsa “YouTube’da ara” düğmesi kalır',
      'Ayarlar → Genel → “Fragmanı otomatik ara” ile kapatılabilir',
    ],
  },
  {
    id: 142,
    title: 'Vizyondakilerde Türkçe konu ve türler',
    items: [
      'Vizyondaki (listenizde olmayan) filmlerin konu açıklaması otomatik Türkçeye çevrilir; “Özgün metni göster” ile İngilizcesine dönebilirsiniz. Çeviri alınamazsa özgün metin kalır',
      'Türler (Dram, Korku, Gizem…) ve süre (dk) de Türkçe gösterilir',
    ],
  },
  {
    id: 141,
    title: 'Türkçe adlı yabancı yapımlarda fragman',
    items: [
      'Türkçe adı olan yabancı film ve dizilerde (örn. “Bir Skandalın Anatomisi”) ad, Wikidata’dan özgün ada ve IMDb kaydına çevrilir; fragman ve oyuncular oradan gelir',
      'Fragman yine bulunamazsa “YouTube’da fragman ara” düğmesi artık özgün adla arar (örn. “Anatomy of a Scandal 2022 official trailer”)',
    ],
  },
  {
    id: 140,
    title: 'Türk yapımlarında ve Türkçe adlı filmlerde fragman',
    items: [
      'Sağlayıcının (IPTV panelinin) verdiği fragman artık kullanılıyor; internetteki kayıtta fragman olmasa da film ve dizi ekranında görünür',
      'Türkçe adlı filmler panelin verdiği özgün adla da aranır; bir video gömülmeye izin vermezse sıradaki fragman otomatik denenir',
      'Hiçbir fragman bulunamazsa “YouTube’da fragman ara” düğmesi çıkar; oynatılamayan fragmanda açıklama ve arama bağlantısı gösterilir',
    ],
  },
  {
    id: 139,
    title: 'Film ve dizi kategorileri görselli',
    items: [
      'Film ve Dizi kategorileri de Canlı TV gibi gerçekçi görselli kartlarla açılır: aksiyon, komedi, dram, korku, bilim kurgu, animasyon, aşk, gerilim, macera, savaş/tarih, fantastik ve yerli yapımlar için ayrı görseller',
      'Kategori adından tür tanınır (örn. “TR | AKSİYON FİLMLERİ”, “Yerli Diziler”); tanınmayan adlar film/dizi görselini alır. Kart altındaki sayı artık “film” / “dizi” yazar',
    ],
  },
  {
    id: 138,
    title: 'Vizyondaki filmler',
    items: [
      'Ana sayfada “Vizyondaki filmler” satırı: yeni çıkan filmlerin afişleri (internetten, 6 saat saklanır); “Tümünü gör” ile hepsi listelenir',
      'Kart listendeki bir filmse kendi ekranı açılır (“Listende” etiketi, Oynat); listende yoksa “Listenizde yok” bilgi ekranı ve fragman açılır, oyuncu kartları da çalışır',
      'Çocuk modunda satır gösterilmez',
    ],
  },
  {
    id: 137,
    title: 'Fragman, oyuncular ve oyuncu sayfası',
    items: [
      'Film ve dizi ekranında önce afiş görünür, ardından fragman sessiz başlar; “Sesi aç” ile sesi açarsın. Açılmazsa “YouTube’da aç” bağlantısı hazır',
      'Genel ayarlar › Film ve diziler › “Fragmanı otomatik oynat” ile otomatik başlamayı kapatabilirsin; kapalıyken küçük resme dokununca oynar. TV ekranında ve çocuk modunda fragman gösterilmez',
      'Yönetmen ve oyuncular kaydırılabilir kartlar oldu; bir oyuncuya dokununca diğer film ve dizileri listelenir: listendekiler “Oynat”, olmayanlar soluk “Listende yok” (dokununca bilgi ekranı ve fragman açılır)',
    ],
  },
  {
    id: 136,
    title: 'Radyo: önce listendeki kanallar',
    items: [
      'Radyo & Müzik artık önce kendi listendeki radyo kanallarını gösteriyor (kategorisi ya da adı “Radyo” olanlar); ana sayfadaki radyo satırı da onlardan dolar',
      'İnternet radyo dizini yedekte: listende radyo yoksa kendiliğinden açılır; varsa “İnternet radyoları” düğmesiyle istediğinde geçersin. Listede radyo varken dizine hiç bağlanılmaz',
      'Listedeki radyolar müzik çalar ekranında açılır, favoriye eklenebilir; gizlediğin ya da kilitlediğin kategoriler radyoda da gizli kalır',
    ],
  },
  {
    id: 135,
    title: 'Canlı TV kategorileri görselli',
    items: [
      'Canlı TV’de her kategori kendi gerçekçi görseliyle geniş kart oldu: spor, sinema, haber, çocuk, müzik, dini, belgesel, dizi, 4K, ulusal, yabancı, eğlence ve diğerleri',
      'Kategori adına göre görsel kendiliğinden seçilir; tanınmayan adlar genel görseli alır. Liste ve ızgara görünümünde çalışır, internet gerekmez',
      'Renkli temalarda kartın rengi ve sol çubuğu temayla uyumlu; düzenleme modunda eski sade satırlar durur',
    ],
  },
  {
    id: 134,
    title: 'Ne izleyeceğine karar veremedin mi?',
    items: [
      'Ana sayfada tür çipleri (Aksiyon, Komedi, Dram, Korku…) ve altında kendi film listenden öneriler var; çipler en çok filmi olan türlerden oluşur',
      'Aynı çipe tekrar dokunur ya da “Başka öner” dersen farklı filmler gelir; izlemediklerin önce, puanı yüksekler öne çıkar',
      '“Şaşırt beni” tüm türlerden rastgele seçer; öneriye dokununca film ekranı açılır',
    ],
  },
  {
    id: 133,
    title: 'Radyo & Müzik',
    items: [
      'Ana sayfadaki “İzleme listesi” kısayolunun yerine “Radyo & Müzik” geldi; izlediklerin “Son izlenen” satırlarında duruyor',
      'Türkiye ve diğer ülkelerin radyo istasyonları: arama, tür çipleri (pop, türkü, arabesk, haber, spor…), ülke seçimi ve favoriler',
      'Ana sayfada logolu radyo satırı: önce favorilerin, sonra en çok dinlenenler',
      'Radyo ekran kapalıyken de çalar; müzik çalar ekranı, önceki/sonraki istasyon ve bildirim düğmeleri çalışır',
      'Liste 24 saat saklanır; çocuk modunda radyo kapalıdır',
    ],
  },
  {
    id: 132,
    title: 'Sayfaların içi de çok renkli',
    items: [
      'Renkli temalarda artık her sayfanın içinde farklı renkler var: Bugün TV’de’nin Spor, Film ve Dizi sekmeleri, gün çipleri, program satırları, TV rehberi kategorileri, spor maçları, kanal ve kategori listeleri, kaynak kartları ve başlıklar paletin farklı renklerini sırayla alır',
      'Seçili öğe kendi rengiyle dolar, rozet ve ilerleme çubuğu satırın rengini taşır; dolgu üstündeki yazı hep koyudur',
    ],
  },
  {
    id: 131,
    title: 'Renkli temalar tüm uygulamaya yayıldı',
    items: [
      'Renkli kartlar, Dolu renk, Neon cam ve Gün batımı temalarında vurgu rengi artık bölüme göre değişir: Canlı TV turkuaz, Filmler turuncu, Favoriler sarı, Bugün TV’de mavi, TV rehberi turkuaz ve benzeri',
      'Seçili sekme, chip, ŞİMDİ rozeti, ilerleme çubuğu ve ana düğmeler her yerde mor yerine bulundukları bölümün rengiyle görünür',
    ],
  },
  {
    id: 130,
    title: 'Yönetici paneli bağlantısı',
    items: [
      'Panel kilidini açarken GitHub’a bağlanılamazsa istek Android’in kendi ağ katmanından yeniden denenir',
      'Hâlâ olmuyorsa hata nedeni ayırt edilir: telefonda GitHub açılmıyor (VPN/Özel DNS) ya da istek tarayıcı katmanında engellenmiş',
    ],
  },
  {
    id: 129,
    title: 'Ayarlar renkli temalara uyuyor',
    items: [
      'Renkli kartlar, Dolu renk, Neon cam ve Gün batımı temalarında ayar karoları ve ayar sayfalarındaki bölümler kendi renginde görünür',
    ],
  },
  {
    id: 128,
    title: 'Tüm ayar sayfaları yenilendi',
    items: [
      'Oynatıcı, görünüm ve animasyon, otomasyon, TV rehberi, planlananlar, profiller, üyelik, yedek, uygulama şifresi, çocuk profili ve Telefondan oynat sayfaları Genel ayarlar gibi bölümlere ayrıldı',
      'Açma/kapama seçenekleri anahtara döndü; açıklamalar kısaldı, düğmeler ve seçim kutuları hizalandı',
    ],
  },
  {
    id: 127,
    title: 'Genel ayarlar yenilendi',
    items: [
      'Ayarlar bölümlere ayrıldı: Canlı TV, Film ve diziler, Görünüm ve cihaz, Son izlenenler, Güvenlik ve yedek, Destek',
      'Onay kutuları anahtara döndü; açıklamalar kısaldı, seçim kutuları ve düğmeler hizalandı',
    ],
  },
  {
    id: 126,
    title: 'Açılış animasyonu',
    items: [
      'Uygulama açılırken logo belirir ve üzerinden ışık geçer; arayüz hazır olunca kendiliğinden kalkar (yaklaşık 1,3 saniye)',
      'Sayfa yenilenince (liste değiştirme, yedek geri yükleme) tekrar oynamaz; sistemde “animasyonları kaldır” açıksa gösterilmez',
    ],
  },
  {
    id: 125,
    title: 'Hediye üyelik ve cihaz kimliği',
    items: [
      'Üyelik penceresinde cihaz kimliği ve Kopyala düğmesi var; destek ya da hediye üyelik için bu kimliği iletebilirsiniz',
      'Yöneticinin cihazınıza verdiği hediye üyelik, uygulama açılınca ya da Üyelik penceresi açılınca kendiliğinden etkinleşir; durum metninde “hediye” ve kalan gün görünür',
    ],
  },
  {
    id: 124,
    title: 'Üyelik artık tek cihazda kullanılır',
    items: [
      'Satın alınan üyelik aynı anda bir telefonda ve bir TV’de kullanılabilir',
      'Yeni cihaza geçince Üyelik penceresindeki “Bu cihazı kullan” düğmesiyle üyeliği taşıyabilirsiniz; önceki cihazda kapanır (ayda en çok 2 taşıma)',
      'Sunucuya yalnızca aboneliğin geri döndürülemez özeti, cihaz kimliği ve cihaz türü gider; internet yokken 7 gün boyunca üyelik çalışmaya devam eder',
    ],
  },
  {
    id: 123,
    title: 'Kayıtlar dikey ekranda artık gerilmiyor',
    items: [
      '“Telefon oynatıcı yönü: Dikey” seçiliyken kayıt izlerken görüntü tüm ekrana gerilip bozuluyordu; artık video üstte doğru oranda, denetimler altta açılır',
      'Kayıt oynatırken de Tam ekran / Küçük ekran düğmesi kullanılabilir',
    ],
  },
  {
    id: 122,
    title: 'Sorun raporuna üyelik durumu eklendi',
    items: [
      'Sorun raporu artık üyelik durumunu da içerir (Deneme, Standart, Pro, Süresi doldu); gönderilmeden önce önizlemede görünür',
      'Yönetici panelindeki Raporlar sekmesi üyelik dağılımını ve her cihazın üyelik durumunu gösterir',
    ],
  },
  {
    id: 121,
    title: 'Yeni tema sayfası',
    items: [
      'Temalar uygulamanın gerçek ana ekran görüntüleriyle gösterilir',
      'Uygula düğmesi kalktı: dokunduğunuz tema hemen uygulanır',
      'Pro olan temalar kartlarında işaretlidir; Yönetici panelindeki yeni Temalar sekmesinden hangilerinin Pro olacağı seçilir',
    ],
  },
  {
    id: 120,
    title: 'Müzik çalar: kaydırarak şarkı değiştirme, yukarı kaydırınca büyüyen liste',
    items: [
      'Müzik çalarda kapağı sola kaydırınca sonraki, sağa kaydırınca önceki şarkı açılır',
      'Şarkı listesini yukarı kaydırınca çalar alanı küçülür ve liste büyür; listenin başında aşağı çekince eski haline döner',
    ],
  },
  {
    id: 119,
    title: 'Harici oynatıcıya aktarma hatası düzeltildi',
    items: [
      'Harici oynatıcı düğmesi “i is not defined” hatası verip oynatıcı seçim penceresini açmıyordu; düzeltildi',
      'Müzikte harici oynatıcı listesinde müzik çalar uygulamaları da çıkar',
      'Metin ayrıştırma hataları giderildi: saati yalnız “20:30” biçiminde gelen programların başlangıcı, uyarı metinlerindeki koyu yazı işaretleri ve başlık eşleştirmedeki boşluklar',
    ],
  },
  {
    id: 118,
    title: 'Medya merkezi: Müzik sekmeleri, şarkı bilgisi ve kapak; m3u hatası düzeltildi',
    items: [
      'Medya merkezine “Müzik” bölümü geldi: Şarkılar, Sanatçılar, Albümler, Favoriler ve Son çalınan sekmeleri; “Tümünü oynat” ve “Karışık” düğmeleri',
      'Şarkı adı, sanatçı, albüm ve süre dosya etiketinden okunur; etiketi olmayan şarkı dosya adıyla görünür. Arama sanatçı ve albümü de bulur',
      'Dosyaya gömülü kapak resimleri müzik çalarda, şarkı listesinde ve sıradaki şarkılarda görünür',
      'Müzik çalarda yıldız şarkıyı Müzik favorilerine ekler; uzun şarkı adına dokununca adın tamamı açılır',
      'Müzik listesine giren .m3u oynatma listesi dosyaları artık şarkı sayılmaz',
    ],
  },
  {
    id: 117,
    title: 'Vitrinli satırlar film/dizi ekranı geri geldi; vitrin, odak halkası ve ana ekran düzeltmeleri',
    items: [
      'Film ve dizi ekranı “Vitrinli satırlar” ayarında kategoriler yeniden yatay kayan satırlar olarak açılır; her satırın üstünde kategori adı görünür',
      'TV vitrini: odaktaki yapımın arka plan görseli artık güvenilir biçimde yüklenir; başlıkta yalnız ad yazar, bölüm ve tarih alt satırda',
      'Odak halkası kutunun çevresinde tam görünür: satırlarda, kategori içinde ve ana ekrandaki “Son eklenen filmler” satırında kırpılmaz, ekran dışına taşmaz',
      'TV’de kutular daha büyük ve afişler doğru oranda; kutudaki ad alanı alttan yarım satır göstermez',
      'Kategorileri düzenlerken (sırala, gizle, kilitle) düğmeler ızgara görünümünde de çıkar',
      'Ana ekranda aynı film “Son eklenen filmler” satırında bir kez gösterilir',
      'Vitrinli satır görünümünde vitrin artık telefonda da var: üstte öne çıkan yapımın gölgeli görseli, kaydırdıkça değişir; dokununca açılır',
      'Mini müzik çalar: müzik arka planda çalarken sekmelerin üstünde şarkı adı, duraklat, sonraki ve kapat düğmeleri',
      'Profiller (Ayarlar > Profiller): her aile üyesinin favorileri, izleme listesi ve kaldığı yer ayrı tutulur; kaynaklar ve ayarlar ortaktır',
      'Afişi olmayan filmlerde afiş, film eşleştirmesinden bulunup gösterilir',
      'İlk açılışta uygulamayı üç adımda anlatan karşılama ekranı',
      'İçerik uyarıları: doğrulanmış kaydı olmayan film ve dizilerde tür ve özetten çıkarılan tahmini uyarılar gösterilir (yerli ve yabancı); uyarı simgeleri artık görünür',
      'Vitrinli satır görünümünde arama kutusu ve Düzenle çubuğu vitrinin üstünden kalktı; “Kategorileri düzenle” üst çubukta',
      'Oynatıcı: yükleniyor halkası oynat düğmesinin üstüne binmez; çözülemeyen ses biçiminde ekrana uyarı çıkmaz, Ses düğmesi işaretlenir',
      'Canlı TV ızgarasında kanal adının ikinci satırı kesilmez',
      'Ses: Ayarlar > Oynatıcı’da “Yazılım ses çözücüsü (deneysel)”; açılınca cihazın çözemediği AC3/E-AC3/DTS sesli yayınlar uygulamanın kendi çözücüsüyle çalınır, uygulama kapanırsa kendiliğinden kapanır',
      'Canlı yayın: yavaş açılan ya da veri yavaş gelen kanallarda (özellikle “UHD” kanallar) 7 sn’de bir baştan bağlanma döngüsü giderildi; veri geliyorsa yayın beklenir, yeniden açılışa ilk açılış kadar süre tanınır',
      'Afişler, kanal logoları, takım simgeleri ve bayraklar cihazda saklanır (en çok 160 MB); aynı görsel her açılışta yeniden inmez. Wi-Fi’dayken uygulama açıldıktan sonra favori, devam eden ve son eklenen filmlerin afişleri ile içerik uyarıları ve bugünün maçlarının takım simgeleri arka planda önceden indirilir (Ayarlar’dan kapatılabilir, önbellek temizlenebilir)',
      'Listeyi TV’ye aktar (Pro): liste olmayan TV’nin ilk ekranında “Telefondan al” ile QR kod ve 6 haneli kod gösterilir; telefonda Ayarlar > Yedekle / geri yükle > TV ile eşitle’de “TV’deki QR kodu tara” (ya da kodu girerek) eşleşince liste, favoriler ve kaldığın yer TV’ye geçer; aynı Wi-Fi gerekir',
      'Oynatıcı: düğmeler ve pencereler yenilendi; açık düğmenin yazısı görünür, “Yayın bilgisi” penceresinde başlık ve kapat (X) düğmesi var, dikeyde düğmelerin altında durur',
      'Müzik çalar: telefonda şarkı açınca dikey müzik çalar ekranı açılır; tam ekran renkli arka plan, kapak, karışık çalma ve tekrarlama düğmeleri, sıradaki şarkılar',
      'Bugün TV’de ekranı yenilendi: büyük başlık ve tarih, sayaçlı Spor / Film / Dizi sekmeleri, saat, ŞİMDİ rozeti ve ilerleme çubuklu program kartları; renkler seçtiğiniz tema rengine uyar. Üstteki düğmelerle program ya da kanal araması ve gün seçimi yapılır',
      'TV Rehberi yenilendi: üstte başlık, arama ve yenile düğmeleri; Kategoriler / Tümü / Favoriler / Son İzlenen çipleri; kategori simgeleri ve kanal sayıları. Zaman çizelgesinde gün seçici (bugünden 7 gün), 3 saat kaydırma, şimdi etiketi, kanal logosu ve kalite satırı, ilerleme çubuklu program kutuları; renkler seçtiğiniz temaya uyar',
      'Ana ekranda artık son izlediklerin görünür: “Son izlenen kanallar”, “Son izlenen filmler” ve “Son izlenen diziler” ayrı satırlar olarak gelir (en yenisi başta); kanala dokununca doğrudan açılır, “Tümünü gör” tam listeye götürür. Diziler de artık son izlenenlere kaydedilir',
      'Telefonda dikey vitrinli satır görünümünde vitrin büyüdü: film konusu 5 satıra kadar gösterilir (küçük ekranlarda 4 ya da 3 satır), başlık ve künye kırpılmaz',
      'Uygulama Google Play’e hazırlanıyor: Play sürümünde Standart ve Pro yıllık abonelik Google Play üzerinden alınır, deneme teklifi ve fiyat üyelik ekranında görünür. Bu APK sürümü olduğu gibi tamamen açık kalır',
      'TMDB bağlantısı tamamen kaldırıldı: film ve dizi ayrıntısındaki yaş sınırı ve içerik uyarıları artık yalnız KTB, Screenwise ve sağlayıcının tür ve özetinden gelir; elle girilmiş kayıtlar ve TMDB’ye giden hiçbir istek kalmadı',
      'Uygulamada marka adı geçen “Netflix gibi / Netflix düzeni” adları “Vitrinli satırlar” ve “Öne çıkanlar önce” olarak değişti',
    ],
  },
  {
    id: 116,
    title: 'Oynatıcı ayarları sekmeleri, diyalog vurgulama, oynatma hızı ve yeni ana ekran',
    items: [
      'Oynatıcıda yeni Ayarlar düğmesi: Ses, Altyazı ve Görüntü & Hız sekmeleri tek pencerede (Ses ve Altyazı düğmeleri de bu pencereyi açar)',
      'Diyalog vurgulama: konuşmaları daha net öne çıkarır (Android); Gece modu açma/kapama anahtarı ve düzey seçimi aynı pencerede',
      'Oynatma hızı 0,5x – 2x (film ve diziler); canlı yayında kapalı',
      'Altyazı boyutu 5 kademe (14–28), yeni Kırmızı renk',
      'Ana ekran: saate göre karşılama, Kaldığın yerden devam et ve Son eklenen filmler satırları, Bağlantı ve liste durumu kartı',
      'Ana ekran üstünde Kaynak ekle ve Kaynak değiştir düğmeleri',
    ],
  },
  {
    id: 115,
    title: 'Medya merkezi: cihaz kütüphanesi, ağ paylaşımları, müzik ve fotoğraf',
    items: [
      'Cihazdan oynat artık Medya merkezi: telefondaki ve harici kart / USB bellekteki klasörleri ekleyip küçük resimlerle klasör klasör gezebilirsin (depolama izni gerekmez)',
      'Birden fazla video ya da şarkı seçince ya da bir klasörde Tümünü oynat deyince dosyalar ada göre doğal sırayla arka arkaya oynar',
      'Yerel videoların izleme konumu kaydedilir; aynı dosyayı yeniden açınca kaldığın yerden devam eder',
      'Aynı klasördeki .srt / .vtt altyazı videoyla otomatik yüklenir; Türkçe (Windows-1254) altyazılar da doğru görünür',
      'Cihaz klasörlerinde ada göre arama (Türkçe harf duyarsız) ve Son eklenenler listesi',
      'WebDAV, SMB (Windows paylaşımı) ve DLNA / UPnP medya sunucularındaki videolara, müziğe ve fotoğraflara erişim',
      'Müzik ekran kapalıyken de çalar; fotoğraflar kaydırmalı galeri ve slayt gösterisiyle açılır',
      'Klasörler uygulama şifresiyle kilitlenebilir; kilitli klasörlerin dosyaları arama ve Son eklenenler listesinde görünmez',
    ],
  },
  {
    id: 114,
    title: 'Cihazdaki medya dosyalarını uygulamada oynatma',
    items: [
      'Ana ekrana Cihazdan oynat kısayolu eklendi',
      'Android sistem dosya seçicisinden cihazdaki video ve ses dosyaları seçilebilir',
      'Dosya seçici çağrısı yerel Android köprüsüne bağlandı',
      'Seçilen dosya uygulamanın yerel oynatıcısında açılır; dosya uygulama deposuna kopyalanmaz',
    ],
  },
  {
    id: 113,
    title: 'Film ve dizi uyarıları çoklu kaynaklardan tamamlanıyor',
    items: [
      'TMDB film yayın sınıflandırmalarındaki ve dizi içerik derecelendirmelerindeki açıklayıcı tanımlayıcılar da okunur',
      'Şiddet, korku, cinsellik, çıplaklık ve ağır dil gibi işaretler kaynak verisine dayanarak gösterilir',
      'Yaş sınıfı ve içerik uyarıları ayrı değerlendirilir; tanımlayıcı yoksa uyarı tahmin edilmez',
      'Ayrıntılı uyarılarda TMDB bölgesel kaynağı belirtilir',
    ],
  },
  {
    id: 112,
    title: 'TMDB içerik tanımlayıcılarından ek uyarılar',
    items: [
      'Film ve dizilerin TMDB bölgesel yaş sınıflandırmalarındaki içerik tanımlayıcıları da taranır',
      'Şiddet, korku, cinsellik ve çıplaklık gibi açıkça belirtilen tanımlayıcılar içerik uyarılarına eklenir',
      'Türkiye kaydı bulunmadığında desteklenen diğer ülke sınıflandırmaları alternatif kaynak olarak değerlendirilir',
      'Uyarıların kaynağı ayrıntılı uyarılar penceresinde gösterilir; veri yokluğu güvenli içerik anlamına gelmez',
    ],
  },
  {
    id: 111,
    title: 'İçerik uyarılarında alternatif eşleştirme',
    items: [
      'Film ve diziler Screenwise üzerinde IMDb kimliği, Türkçe ad, katalog adı ve orijinal adla alternatif sorgularla aranır',
      'Yıl bilgisi eşleşmeyi engellediğinde yıl olmadan da arama yapılır; sonuçlar tür ve başlık benzerliğiyle doğrulanır',
      'KTB film sınıflandırması Türkçe, katalog ve orijinal adlarla ayrı ayrı aranır',
      'Uyarı bulunamayan kayıtların yeniden tarama süresi 24 saatten 6 saate indirildi',
      'Kaynakta doğrulanmayan içerik uyarıları tahmin edilerek gösterilmez',
    ],
  },

  {
    id: 110,
    title: 'Dizilerde içerik uyarıları',
    items: [
      'Dizi ayrıntı sayfasında yaş sınırı ve içerik uyarıları artık film sayfasındaki gibi gösterilir',
      'Kaynak geçici hata verirse "uyarı yok" sonucu günlerce saklanmaz; birkaç dakika sonra yeniden denenir',
      'Film bilgisi alınamasa bile içerik uyarıları başlık üzerinden aranır',
    ],
  },
  {
    id: 109,
    title: 'Dikey oynatma: YouTube düzeni',
    items: [
      'Telefon dik tutulurken video üstte (16:9), altında başlık, favori ve araç düğmeleri; canlıda yayın akışı, film/dizide öneri ve bölüm listesi',
      'Kontroller yalnız videonun üstünde görünür ve kendiliğinden gizlenir; alttaki düğmeler ve liste hep erişilebilir',
      'Dikeyde parlaklık, ses ve sarma kaydırmaları video alanında çalışır; alt listeye dokunmak kontrolleri açıp kapatmaz',
    ],
  },
  {
    id: 108,
    title: 'Dikey oynatıcı görüntü alanı düzeltildi',
    items: [
      'Android yerel video görünümü artık gizli HTML video öğesinin sıfır ölçülerini değil, gerçek video alanını temel alır',
      'Dikey canlı TV ve film/dizi oynatımında video alanı ekranın yaklaşık yüzde 46 yüksekliğini kullanır',
      'Sığdır seçeneğinde görüntü oranı korunur; video alanı EPG veya öneri listesinin altına taşmaz',
    ],
  },
  {
    id: 107,
    title: 'Dikey film ve dizi oynatıcı yerleşimi iyileştirildi',
    items: [
      'Video, orijinal 16:9 oranı korunarak ekran genişliğine sığar; kontrol alanı daha geniş tutulur',
      'Medya kontrol düğmeleri beş sütunlu düzende satırlara yerleşir ve ekran dışına taşmaz',
      'Görüntü boyutlandırma düğmesi dikey oynatıcıda görünür kalır',
      'Film önerileri ve dizi bölümleri yatay kartlar yerine dikey, kaydırılabilir liste olarak gösterilir',
    ],
  },
  {
    id: 106,
    title: 'Film ve dizi oynatıcı dikey düzene geçirildi',
    items: [
      'Film ve dizi oynatımında video üst alanda kaynak en-boy oranı korunarak, kırpılmadan ekran genişliğine sığdırılır',
      'Medya kontrolleri ve görüntü boyutlandırma seçeneği video alanında kalır',
      'Film oynatımında altta önerilen filmler, dizi oynatımında bölümler yatay kaydırmalı listede gösterilir',
    ],
  },
  {
    id: 105,
    title: 'Dikey oynatıcı görüntü oranı düzeltildi',
    items: [
      'Canlı yayın videosu dikey ekranda 16:9 alana sığdırılır; görüntü kırpılmaz',
      'EPG paneli video alanının hemen altından başlayarak kalan ekranı kullanır',
      'Android yerel oynatıcı boyutu doğrudan video alanının ölçüsüne eşitlenir',
    ],
  },
  {
    id: 104,
    title: 'Dikey oynatıcı ve EPG ekranı düzenlendi',
    items: [
      'Dikey canlı TV görünümünde video üst bölümde, yayın akışı alt bölümde ayrı alanlarda gösterilir',
      'EPG listesi kendi alanında kaydırılır; oynatma kontrolleri video bölümünde kalır',
      'Android yerel oynatıcı görüntüsü de dikey bölünmüş düzene göre yeniden boyutlandırılır',
    ],
  },
  {
    id: 103,
    title: 'Kategori düzenleme görünümü düzeltmesi',
    items: [
      'Izgara görünümünde kategori düzenlerken kategori adları yeniden görünür; gizle, kilitle ve taşıma düğmeleri korunur',
    ],
  },
  {
    id: 102,
    title: 'Kanal D rehberi ve film listesi için ek kaynak düzeltmesi',
    items: [
      'Kanal D için açık saatli yayın akışı kaynağı önceliklendirildi; 13 Kasım akışında Ana Haber 19.00–20.00, Beyaz’la Joker 20.00–23.15 ve Daha 17 23.15–02.00 olarak düzeltilir',
      'Önceki sürümden kalan hatalı EPG önbelleği yeni düzeltme sürümünde zorunlu yenilenir',
      'Film yayın akışı ana kaynaktan okunamazsa TV’de Bugün film listesi yedek kaynak olarak kullanılır'
    ],
  },

  {
    id: 101,
    title: 'Kanal D yayın akışı düzeltildi',
    items: [
      'Kanal D için harici EPG birleştirmesinde EPGShare program saatleri önceliklendirildi',
      'Kanal D Ana Haber ve Beyaz’la Joker programlarının hatalı uzayan bitiş süreleri düzeltildi',
      'Güller ve Günahlar, Daha 17 ve diğer bilinen Kanal D dizileri Bugün TV’de Dizi alanında gösterilir; haber ve yarışmalar dizi sayılmaz'
    ],
  },

  {
    id: 100,
    title: 'Eksik kanallar için harici EPG desteği',
    items: [
      'Kanal D gibi IPTV listesinde bulunan ancak sağlayıcının kendi rehberinde bulunmayan kanallar için harici XMLTV rehberi de alınır',
      'Sağlayıcının EPG verisi önceliğini korur; harici kaynak yalnızca eksik kanal rehberlerini tamamlar',
      'M3U listesinde EPG adresi olmasa bile ücretsiz birleşik rehberden eşleşen kanalların yayın akışı yüklenir'
    ],
  },

  {
    id: 99,
    title: 'Film yayın akışı ayrıştırıcısı yeniden düzenlendi',
    items: [
      'Film kayıtları artık kanal yayın akışı bağlantıları ile hemen öncesindeki saat ve program adından da okunur',
      'Kaynak yanıtında saat ve kanal bağlantısı sayıları gösterilerek hata teşhisi kolaylaştırıldı',
      'Film saatlerinin ekrana aktarılmasını engelleyen zaman ayrıştırma ifadesi düzeltildi'
    ],
  },

  {
    id: 98,
    title: 'Bugün TV’de film listesi eşleştirme sorunu giderildi',
    items: [
      'Film yayınları artık IPTV listenizde ilgili kanal bulunmasa bile saat, film adı ve yayıncı kanal adıyla listelenir',
      'Kaynak sayfasındaki HTML yapısı değişse bile saat ve kanal bağlantılarından yedek ayrıştırma yapılır',
      'Film sayacı kanal eşleşmesine bağlı olmadan gerçek yayın kayıtlarını sayar; eşleşen kanal varsa oynatma için kullanılır'
    ],
  },

  {
    id: 97,
    title: 'Film yayın akışı saatleri düzeltildi',
    items: [
      'Film kaynağından gelen HH:MM yayın saatleri artık doğru ayrıştırılır ve kanal eşleştirmesine aktarılır; bu nedenle harici film listesinin boş kalmasına yol açan hata giderildi'
    ],
  },
  {
    id: 96,
    title: 'Film listesi ve FB TV sınıflandırması düzeltildi',
    items: [
      'Boş veya sıfır uzunlukta kayıtlı Film kanalı tercihi artık otomatik kanal seçimi olarak değerlendirilir; Film sayacının yanlışlıkla sıfır kalması önlenir',
      'TR: gibi ülke ön ekleri bulunan FB TV kanal adları da Spor olarak tanınır ve Dizi listesinden çıkarılır'
    ],
  },
  {
    id: 95,
    title: 'Film yayın akışı kaynağı eklendi',
    items: [
      'Bugün TV’de > Film listesi TV Yayın Akışı kaynağından alınır; film adı, yayın saati ve kanal bilgisi IPTV kanal listenizle eşleştirilir',
      'Kaynak erişilemezse mevcut EPG tabanlı film listesi yedek olarak kullanılmaya devam eder; Spor ve Dizi ekranları değişmez'
    ],
  },
  {
    id: 94,
    title: 'Film kanalı seçimi ve FB TV filtresi',
    items: [
      'Film sekmesine ayrı Film kanalları seçimi eklendi; seçimler kaynak bazında saklanır ve genel kanal filtresinden bağımsızdır',
      'Film listesinde yalnız seçilen kanallardaki EPG tarafından açıkça Film/Sinema olarak tanımlanan programlar gösterilir; türü belirsiz yayınlar tahminle eklenmez',
      'FB TV, kanal adı ve program kategorisi ne olursa olsun Dizi akışından çıkarılır ve Spor olarak sınıflandırılır'
    ],
  },
  {
    id: 93,
    title: 'Bugün TV’de tür ve kanal filtreleri düzeltildi',
    items: [
      'Program süresi artık tek başına Film sayılmasına neden olmaz; yalnız EPG’de açıkça film/sinema olarak işaretlenen yayınlar veya tanımlı sinema kanallarının yayınları Film listesine girer',
      'S Sport, beIN Sports, A Spor, TRT Spor ve Sports TV yayınları kanal adına göre Spor olarak sabitlenir; A Para Film ve Dizi listelerinden çıkarılır',
      'beIN Series dizi kanalı olarak, Sinema TV ve beIN Movies gibi kanallar film kanalı olarak önceliklendirilir'
    ],
  },
  {
    id: 92,
    title: 'Bugün TV’de sinema kanalları ve dizi kanalı filtresi',
    items: [
      'Film sayacı için hatalı EPG kategori eşleşmesi düzeltildi; Sinema TV, beIN Movies, MovieSmart ve FilmBox gibi mevcut kanalların yayınları Film listesine eklenir',
      'beIN Series kanalları varsa Dizi listesine alınır; S Sport, A Para ve diğer spor kanalları Dizi akışından çıkarılır'
    ],
  },
  {
    id: 91,
    title: 'Bugün TV’de film sınıflandırması ve dizi takibi',
    items: [
      'TV rehberinde Drama, Komedi, Aksiyon, Gerilim gibi tür etiketleri bulunan uzun metraj programlar Film sayımına katılır; bölüm/sezon bilgisi bulunanlar dizi olarak kalır',
      'Bugün TV’de dizi programının ayrıntı ekranına Diziyi takip et / Dizi takibini bırak düğmesi eklendi; takip tercihi Dizi akışı ile ortak kullanılır'
    ],
  },
  {
    id: 90,
    title: 'Benzer filmler ve kumandayla kanal geçişi',
    items: [
      'Film detaylarının altında aynı kategori ve mevcut film metaverisine göre sıralanan benzer içerikler yatay afiş şeridinde gösterilir; M3U ve Xtream kaynakları desteklenir',
      'Benzer film kartları TV kumandasıyla odaklanabilir; OK ile seçilen filmin detay ekranı açılır',
      'Canlı TV’de CH+ / CH− ve medya sonraki/önceki tuşları kanal listesinde ileri-geri geçiş yapar; listenin uçlarında başa veya sona sarar',
      'Film ve dizi oynatımındaki sonraki/önceki içerik davranışı kanal geçişi için değiştirilmez'
    ],
  },
  {
    id: 89,
    title: 'Film hatırlatıcıları ve dizi takibi',
    items: [
      'Bugün TV’de film satırlarında kanal logosu ve film hatırlatıcısı gösterilir; zil düğmesi TV kumandasıyla odaklanıp seçilebilir ve Planlananlar listesine kaydedilir',
      'Dizi akışında yıldız düğmesiyle diziler takip listesine eklenir veya çıkarılır; takip edilen diziler için doğrulanmış “Yeni Bölüm” yayınları otomatik hatırlatıcıya dönüşür',
      'Aynı yeni bölüm için yinelenen bildirim planı oluşturulmaz; dizi takibi bırakıldığında o diziye ait otomatik planlar kaldırılır',
      'Kanal adı ve logosu mevcut canlı kanal listesiyle eşleştirilir; TV kumandası odağı satır eylemleri arasında korunur'
    ],
  },
  {
    id: 88,
    title: 'Spor ekranı puan durumu düğmesi',
    items: ['Puan durumu simgesinin yanına görünür metin etiketi eklendi; düğme TV kumandası ve dokunmatik kullanım için belirginleştirildi']
  },
  {
    id: 87,
    title: 'Dizi akışında spor kanalı filtresi',
    items: [
      'Sports TV, S Sport, beIN SPORTS, TRT Spor, A Spor, Tivibu Spor ve Eurosport gibi spor kanallarının programları dizi listelerinden çıkarıldı',
      'Filtre hem haftalık dizi kaynağına hem ücretsiz EPG tamamlamasına hem de önbellekten gelen eski kayıtlara uygulanır'
    ],
  },
  {
    id: 86,
    title: 'Dizi akışı listeleme düzeni',
    items: [
      'Bugünün dizi akışında süresi geçmiş programlar da listelenir',
      'Dizi akışı ilk açıldığında liste şu anki yayına hizalanır; önceki yayınlar yukarı kaydırılarak görülebilir',
      'Bugün TV’de ekranındaki alt Dizi akışı kısayolu kaldırıldı'
    ],
  },
  {
    id: 85,
    title: 'Ana ekran kart görünümü düzeltmesi',
    items: ['Bugün TV’de kartındaki başlık ve alt açıklama satırlarının kart dışına taşması düzeltildi; metin boyutu ve aralıklar ekrana göre ayarlandı'],
  },
  {
    id: 84,
    title: 'TV rehberi ve dizi akışı düzeltmeleri',
    items: [
      'Bugün TV’de ekranındaki dizi sayısı ve listesi, haftalık dizi akışı ile ücretsiz EPG kayıtları birleştirilerek tamamlanır',
      'Dizi akışında geçmiş programlar bugünün listesinden çıkarılır; devam eden ve sıradaki programlar gösterilir',
      'Dizi hatırlatıcı düğmeleri Android TV kumandasıyla odaklanabilir ve seçilebilir; kanal logosu varsa kanal adının yanında gösterilir'
    ],
  },
  {
    id: 83,
    title: 'Android TV için alternatif görüntü çözücü tercihleri',
    items: [
      'Oynatıcı ayarları › Görüntü çözücü bölümüne üç seçenek eklendi: Otomatik, Donanım öncelikli ve Yazılım öncelikli. Seçim Android Media3 üzerinde uygulanır ve açık yayın yeniden başlatılır',
      'Mi TV Stick 4K gibi Android TV cihazlarında görüntü bozulması yaşanırsa önce Donanım öncelikli, sonuç alınamazsa Yazılım öncelikli denenebilir. Yazılım çözümleme işlemciyi daha fazla kullanabilir',
      'Harici oynatıcı seçeneği mevcut şekilde korunur; cihazda VLC veya MX Player yüklüyse Android seçim penceresinden açılabilir'
    ],
  },
  {
    id: 82,
    title: 'Yayın bilgisinde çözücü ve olay kaydı',
    items: [
      'Oynatıcıdaki “Yayın bilgisi” artık video çözücüsünün adını (donanım/yazılım), uyumlu modun açık olup olmadığını ve son olayları gösterir: her adres denemesi, hatanın nedeni (HTTP kodu, çözücü, hata türü), çizilen kare sayısı, yeniden bağlanmalar. Bir kanal TV’de açılmayınca nedeni bu panelden okunur',
      'Uyumlu mod yazılım çözücüyü artık yalnız H.264 ve MPEG-2 yayınlarda öne alır; UHD (H.265) kanallarda yazılım çözücü yetişemediği için donanım çözücüde kalınır. Ayarlardaki “Görüntü çözücü: Yazılım” seçimi eskisi gibi her şey için geçerlidir'
    ],
  },
  {
    id: 81,
    title: 'Film ve dizi kategorileri öne çıkanlar önce düzeninde, TV’de kumanda ve kenar düzeltmeleri',
    items: [
      'Film ve dizi kategorileri artık öne çıkanlar önce sıralanır: önce “Devam et”, “Yeni eklenenler” ve “En çok puan alanlar” satırları, sonra yeni çıkanlar, platformlar (Netflix, Disney+…), Türkçe içerik ve en çok izlenen türler (Aksiyon, Komedi, Dram…); yabancı dil ve yetişkin kategoriler sonda. Kendi verdiğiniz sıra her zaman öncelikli',
      'Genel ayarlar › “Film ve dizi kategori sırası” ile eski “Sağlayıcının sırası”na dönülebilir. “Yeni eklenenler” yalnız eklenme zamanı bilinen listelerde (Xtream) çıkar',
      'TV’de sayfaların sol üstündeki geri düğmesi ve TV Rehberi’ndeki “Program ara” / “EPG yenile” düğmeleri artık üstten kesilmiyor: sayfalara kenar payı eklendi, odak halkası tam görünür',
      'TV’de Ara sayfasında kumandayla arama kutusuna geçilemiyordu (yukarı tuşu geri okuna gidiyordu); artık sekme düğmelerinden yukarı basınca kutuya gelinir, Tamam’a basınca yazılır',
      'Dizi akışı: bir dizi komşu kartın kanalıyla gösterilebiliyordu (ör. Daha 17 TRT 1 yerine Kanal D); artık görselin kendi kanal adı öncelikli. Yedek kaynak kullanılırsa “Ayrıntı” düğmesi nedenini ve okunan ham kartları gösterir'
    ],
  },
  {
    id: 80,
    title: 'Dizi akışı',
    items: [
      'Bugün TV’de ekranının üstündeki “Dizi akışı” düğmesiyle haftalık dizi programı: hangi dizi, hangi kanalda, kaçta, kaçıncı bölüm (yeni bölüm / bu hafta yayınlanmıyor bilgisiyle). Veri 1001dizi.net’ten alınır; o alınamazsa sinemalar.com denenir',
      'Üstteki gün çipleriyle bugünden itibaren 7 gün gezilir; kanal çipleriyle tek kanala daralır. Satıra dokununca kanal listenizde varsa açılır',
      'Satırdaki zil dizi başlamadan 15 dk önce hatırlatıcı kurar (Planlananlar’da görünür). Liste 3 saat önbellekte tutulur; “Yenile” ile elle güncellenir, alınamazsa kayıtlı liste kalır'
    ],
  },
  {
    id: 79,
    title: 'Canlı yayın: donma ve bozuk görüntü düzeltmeleri',
    items: [
      'Canlı yayın açıldığı hâlde görüntü gelmiyor ya da kare donuyorsa uygulama bunu artık fark eder ve yayını “uyumlu modda” (yazılım çözücü + geniş TS ayrıştırma) yeniden açar; ikinci donmada yayının öbür biçimine (HLS ↔ TS) geçer',
      'Canlı yayında tampon eşikleri kısaltıldı: açılışta en çok 2,5 sn, takılmadan sonra en çok 3 sn beklenir. Yayın zaten gerçek zamanlı aktığı için uzun bekleme “açılır açılmaz donuyor” döngüsüne yol açıyordu',
      'Oynatıcıda “Görüntü bozuk?” düğmesi: karıncalı/bozuk görüntüde dokunun, kanal uyumlu modda yeniden açılır',
      'Oynatıcı ayarları → “Canlı yayın biçimi” (Otomatik / HLS önce / TS önce). Otomatikte bir kanal bir biçimde 20 sn düzgün oynarsa uygulama o biçimi kanal için hatırlar'
    ],
  },
  {
    id: 78,
    title: 'Spor: favori takım ve puan durumu',
    items: [
      'Maç ayrıntısında takımın altındaki “Takip et” ile favori takım seçilir. Takip edilen takımın adının yanında ★ görünür; Spor ekranındaki “★ Takımlarım” çipi yalnız onların maçlarını gösterir',
      'Takip edilen takımların başlamamış maçları (8 gün içinde) için hatırlatıcı kendiliğinden kurulur; sizin kaldırdığınız hatırlatıcı geri gelmez, takibi bırakınca kendiliğinden kurulanlar kalkar',
      'Spor ekranının üstündeki liste düğmesiyle “Puan durumu”: Süper Lig, Premier Lig, La Liga, Serie A, Bundesliga, Ligue 1 ve UEFA kupaları; takip ettiğiniz takımın satırı ★ ile işaretlenir'
    ],
  },
  {
    id: 77,
    title: 'Ses/altyazı dili tercihi ve abonelik bitiş uyarısı',
    items: [
      'Oynatıcı ayarları: “Tercih edilen ses dili” ve “Altyazı dili”. Film ya da yayın açılınca uygun ses ve altyazı kendiliğinden seçilir; “Altyazıyı yalnız tercih ettiğim ses yoksa aç” ile örneğin Türkçe ses yoksa Türkçe altyazı açılır (yalnız Android)',
      'Xtream aboneliğinin bitişine 7 gün kala ana ekranda kırmızı uyarı ve günde bir kez ileti; son 14 günde bitişten 3 gün önce sabah 10’da bildirim gelir (Planlananlar’da görünür)'
    ],
  },
  {
    id: 76,
    title: 'Bugün TV’de: spor, film, dizi saatleri',
    items: [
      'Ana ekranda “Kategoriler” kutusunun yerine “Bugün TV’de” kutusu geldi: TV rehberinden bugünün (ya da yarının) spor, film ve dizi programlarını saatleriyle listeler (kategorilere Canlı TV, Filmler ve Diziler içinden ulaşılır)',
      '“Kanallar” düğmesiyle yalnız seçtiğiniz kanalların programları gösterilir (seçim kayıtlıdır); “Bitenler” ile geçmiş programlar da görünür',
      'Programa dokununca hatırlatıcı, kayıt ve izleme seçenekleri açılır. Tür bilgisi rehberin kendi türünden (Dizi, Film, Spor) alınır; tür yoksa yalnız belirgin başlıklar (“12. Bölüm”, “Süper Lig”…) sayılır'
    ],
  },
  {
    id: 75,
    title: 'Maç öncesi kadro',
    items: [
      'Başlamamış maçın ayrıntısında kadro, ESPN yayımlar yayımlamaz görünür; açık sayfa başlamaya 90 dakika kala 45 saniyede bir kendini yeniler',
      'İlk 11 henüz belli değilse oyuncular “Oyuncular” satırında listelenir ve “İlk 11 henüz açıklanmadı” yazar; kadro yoksa ne zaman açıklanacağı belirtilir (genelde maçtan ~1 saat önce, her ligde yok)'
    ],
  },
  {
    id: 74,
    title: 'Maç ayrıntısı daha kompakt',
    items: [
      'Maç ayrıntısında istatistik bölümü kaldırıldı (topla oynama, şut, korner vb.)',
      'Başlık, olaylar ve kadro daha sıkı yerleşimle gösterilir; kadro telefonda da iki sütundur, “SUB” etiketi gizlendi'
    ],
  },
  {
    id: 73,
    title: 'Telefonda vitrinli satır ekranı: düzenle, satır sayısı, adlar',
    items: [
      'Telefonda vitrinli satır görünümünün üstünde kategori çubuğu ve “Düzenle” düğmesi var (kumandada düzenleme kutusu en altta kalır)',
      'Ayarlar > Genel ayarlar > “Satırdaki yapım sayısı”: her satırda en çok 12, 24, 36, 48, 72 veya 100 kutu; fazlası “Tümünü gör” kutusunda',
      'Telefonda satırlardaki film/dizi adları daha küçük yazıyla ve “Kutudaki film/dizi adı” ayarı kadar satırda (varsayılan 3) görünür; adın altından sonraki satırın ucu artık görünmez'
    ],
  },
  {
    id: 72,
    title: 'Dikey telefonda ayarlar düzeldi',
    items: [
      'Genel ayarlar’da “Film ve dizi ekranı” satırı telefon dikeyken ekrandan taşıyordu ve açıklama yazısı dar bir sütunda harf harf kırılıyordu; seçenek adları kısaldı, satırlar artık ekrana sığar'
    ],
  },
  {
    id: 71,
    title: 'Vitrin afişinin kenarı her ekranda yumuşak',
    items: [
      'Geniş görseli olmayan dizi ve filmlerde afişin sağ kenarındaki keskin çizgi, 16:9’dan geniş TV ekranlarında kalıyordu; afiş artık kendi oranında bir kutuda durur ve iki kenarı da ekran oranından bağımsız olarak arka plana karışır'
    ],
  },
  {
    id: 70,
    title: 'Geniş görseli olmayan filmlerde de tam arka plan',
    items: [
      'Vitrinde geniş görseli bulunmayan film ve dizilerde afiş artık sağda sert kenarlı durmaz: arkasında afişin bulanık yansıması ekranı doldurur, afişin kenarları buna karışır. Geniş görselli yapımlarda değişiklik yok'
    ],
  },
  {
    id: 69,
    title: 'Film ve dizi satırları “Devam et”le başlar',
    items: [
      'Vitrinli satır ekranında en üstteki “Tümü” satırı kaldırıldı; izlemeye başladığınız yapım varsa ilk satır “Devam et”, yoksa ilk kategori. Tüm liste Klasik görünümde ve aramada durmaya devam eder'
    ],
  },
  {
    id: 68,
    title: 'TV’de odak, ayarlar ve görüntü çözücü',
    items: [
      'TV’de odaktaki kutunun çerçevesi hafif modda da görünür; film ve dizi satırlarında hangi yapımda olduğunuz belli',
      'Film vitrininin arka planı artık önce yanlış bir afiş kırpığı göstermez: ayrıntı gelene kadar bekler, sonra tek seferde geçer',
      'Spor ekranında gün, lig ve yenile düğmeleri daha az yer kaplar',
      'TV’de ayarlar pencereleri tam sayfa açılır',
      'Oynatıcı ayarlarına “Görüntü çözücü” eklendi: bazı kanallar TV kutunuzda bozuk, yeşil/beyaz ya da donuk görünüyorsa “Yazılım öncelikli”yi deneyin (daha yavaştır, açık kanalı hemen yeniden açar)'
    ],
  },
  {
    id: 67,
    title: 'Vitrinli satırlar film ve dizi ekranı',
    items: [
      'TV’de film ve dizi artık vitrinli satırlar hâlinde: her kategori yatayda kayan tek bir satır, satırlar alt alta; odaktaki yapımın geniş afişi çevresi gölgeli olarak üstte, altında adı, puanı, süresi, türü ve konusu görünür',
      'Her satırda ilk 24 yapım vardır; sondaki “Tümünü gör” kutusu kategoriyi açar, Geri ile aynı kutuya dönülür. En alttaki “Kategorileri düzenle” kutusu sıralama, gizleme, klasör ve kilit işlerini açar',
      'Ayarlar > Genel ayarlar > Film ve dizi ekranı: Otomatik (TV: Vitrinli satırlar, telefon: Klasik), Vitrinli satırlar, Klasik + TV vitrini, Klasik. Eski “TV vitrini” anahtarı bu ayarın içine katıldı',
      'Telefonda da seçilebilir: satırlar parmakla yana kayar; vitrin yalnız yatay ekranda kumanda ya da klavyeyle gezerken görünür'
    ],
  },
  {
    id: 66,
    title: 'TV vitrini: gezerken filmin arka planı ve konusu',
    items: [
      'TV’de film ve dizi kategorisinde kumandayla gezerken odaktaki yapımın geniş arka planı, adı, puanı, süresi, türü, oyuncuları ve konusu üstte görünür; Tamam yine ayrıntı sayfasını açar',
      'Kutular TV’de büyüdü; vitrin Genel ayarlar > TV vitrini ile kapatılabilir. Telefonda değişiklik yok',
      'Film bilgisi bellekte tutulur: vitrinde görülen filmin ayrıntı sayfası anında açılır'
    ],
  },
  {
    id: 65,
    title: 'Film ve dizi ayrıntısında kompakt düğmeler',
    items: [
      'Dikey telefonda film/dizi ayrıntısındaki düğmeler artık alt alta dizilmez: ana düğme tam genişlikte tek satırda, ötekiler (Baştan başlat, Favori, İndir, TV’de oynat, Klasör) yan yana iki satıra sığar; ad ve etiketler afişin yanında kalır'
    ],
  },
  {
    id: 64,
    title: 'Spor: goller atan takımın tarafında',
    items: [
      'LiveScore maçlarında gol, atan takımın sütununda görünür (ev sahibi solda, deplasman sağda); takım gol sonrası skordan ve maç skorundan çıkarılır, belirlenemezse nedeni küçük yazıyla yazılır'
    ],
  },
  {
    id: 63,
    title: 'Spor: LiveScore maçlarında gol dakikaları',
    items: [
      'ESPN’de olmayan liglerin (alt ligler, kupalar) canlı ve biten maçlarında gol dakikası ve gol atan oyuncu artık maç ayrıntısında görünür; skor akışı da yazılır',
      'Gol bilgisi alınamazsa ayrıntıda nedeni küçük yazıyla görünür (sorun bildirirken ekran görüntüsü için)'
    ],
  },
  {
    id: 62,
    title: 'Spor: skoru olan maç iki kez görünmüyor, skor yoksa “Skor yok” yazar',
    items: [
      'Yayın takvimindeki maç adı kısaltılmış yazıldığında (örneğin “Kepez Bld.”) skor veren kaynaktaki aynı maçla eşleşmiyor, maç skorsuz ayrı bir satır olarak kalıyordu. Aynı saatte bir takım eşleşiyorsa artık aynı maç sayılır: skor ve yayın kanalı tek satırda görünür',
      'Yalnız takvimden bilinen ve başlayalı çok geçen maç, saatiyle “oynanmamış” gibi kalmaz; satırda ve ayrıntıda “Skor yok” yazar'
    ],
  },
  {
    id: 61,
    title: 'Düğme geri bildirimi, oynatıcı simge adları, liste konumu',
    items: [
      'Düğmenin üzerine gelince ya da kumandayla odaklanınca hem kenarlık hem dolgu rengi belirgin değişir; Ayarlar’daki tema yuvarlakları dahil',
      'Oynatıcıdaki kontrol simgelerinin üzerine gelince (ya da kumandayla odaklanınca) ne işe yaradığı küçük bir yazıyla üstünde görünür',
      'Kanaldan geri dönünce açık kategori kapanmıyor, liste en üste atmıyor: oynatıcı telefonu yatay kilitlediği için ekran düzeni iki kez değişip listeyi sıfırlıyordu. Liste yenilenince de yeri korunur',
      'Kanal açılmazsa hata iletisi sunucunun cevabını söyler: erişim reddi (abonelik / bağlantı sınırı), kanal bulunamadı ya da sunucu hatası (HTTP kodu ile)'
    ],
  },
  {
    id: 60,
    title: 'Telefondan TV’yi tam yönetme, daha belirgin odak, maç olayları',
    items: [
      'Telefon, TV’de oynayan şeyi (TV’nin kendi açtığı kanal ya da film dahil) görüp yönetir: oynat/duraklat, sarma, önceki/sonraki, sessiz, ses çubuğu, ses dili, altyazı, gece modu, uyku zamanlayıcısı, en-boy, yayın bilgisi, favori, son kanal ve yön tuşları',
      'Ayarlar > Telefondan oynat listesinde eşleşmiş TV’nin yanındaki “Kumanda” düğmesi, TV’de bir şey oynamasa da kumandayı açar; TV’de gezinmek için yön tuşları hazırdır',
      'TV kumandasında odaktaki düğme artık dolgu rengiyle tersine döner ve büyür; oynatıcı denetimleri ve her ekrandaki düğmeler nerede olduğunuzu belli eder',
      'Spor: filtre düğmeleri artık imleci kendiliğinden kendine çekmiyor',
      'Maç ayrıntısı: gol dakikaları ve skor akışı, kartlar, oyuncu değişikliği (giren/çıkan), devre arası ve maç sonu işaretleri (yalnız ayrıntı veren maçlarda)',
      'Sunset ve Neon temalarında soluk kalan yazılar ve etiket düğmelerinin renk karşıtlığı düzeltildi'
    ],
  },
  {
    id: 59,
    title: 'Spor: maç hatırlatıcısı',
    items: [
      'Başlamamış maçların satırındaki zile dokununca maçtan 15 dakika önce bildirim gelir; tekrar dokununca kalkar',
      'Maç ayrıntısında hatırlatma süresi seçilir (başlarken, 5, 15, 30 dakika ya da 1 saat önce); son seçilen süre sonraki maçlarda kullanılır',
      'Hatırlatıcılar Ayarlar > Planlananlar’da görünür; maçın kanalı listenizde varsa bildirime dokununca kanal açılır'
    ],
  },
  {
    id: 58,
    title: 'Spor: boşluk farkı olan kanal adları eşleşiyor',
    items: ['Yayın bilgisindeki “Tivibu Spor 1” gibi adlar, listenizde “TIVIBUSPOR 1 HD” diye bitişik yazılmış kanalla eşleşir; maç ekranında kanal listelenir ve dokununca açılır'],
  },
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
