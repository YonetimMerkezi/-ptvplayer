// Yenilikler: en yeni üstte. id her sürümde bir artar; güncellemeden sonra görülmemiş kayıtlar bir kez gösterilir.
// CI, en yeni kaydı güncelleme penceresinde göstermek üzere notes.txt'ye yazar (scripts/build-www.mjs).
export const CHANGELOG = [
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
