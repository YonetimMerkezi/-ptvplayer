# Google Play yayın rehberi – Iptv Player Pro

Telefondan kullanılacak şekilde sıralandı. Kutulardaki metinleri olduğu gibi yapıştır. Play Console'un menü adları zamanla değişebilir; mantık aynıdır.

## 1. Başlamadan önce bilmen gerekenler

- **IPTV uygulamaları Play'de sıkı incelenir.** Telif şikâyetiyle kaldırılan örnekler var. Uygulamanın içerik sağlamadığı mağaza metninde ve inceleme notunda açıkça yazılı (aşağıda). Sana ait olmayan kanal adı, logo ya da marka metinde ve ekran görüntülerinde kullanılmadı.
- **Marka adı:** Uygulamadaki “Netflix gibi / Netflix düzeni” adları “Vitrinli satırlar” ve “Öne çıkanlar önce” olarak değiştirildi; arayüzde ve mağaza metninde üçüncü tarafın marka adı geçmiyor (kanal/kategori adları kullanıcının kendi listesinden gelir).
- **Üçüncü taraf kaynaklar:** Spor, yayın akışı ve içerik uyarıları bazı sitelerden ve ücretsiz uç noktalardan okunuyor (Google Çeviri'nin resmî olmayan uç noktası dahil). Bunların kullanım şartlarını ayrıca değerlendirmek gerekir; şikâyet gelirse ilgili özellik kapatılabilir.
- **Depo herkese açık.** İçindeki APK imza anahtarı ve parolası (iptvplayer) herkes tarafından görülebiliyor. Play'de gerçek imza anahtarını Google tutacak; yine de APK imzası için yeni anahtar üretmek APK kullanıcılarının güncellemesini bozacağından ellemedim.

## 2. Sıra

1. **Geliştirici hesabı:** play.google.com/console, tek seferlik 25 USD. Kişisel hesapta (2023 sonrası) üretime çıkmadan önce **12 test kullanıcısıyla 14 gün kapalı test** şart. Kuruluş hesabında yok (D-U-N-S numarası ister).
2. **Uygulama oluştur:** Ad “Iptv Player Pro”, varsayılan dil Türkçe, Uygulama, Ücretsiz (satın alma uygulama içi abonelikle).
3. **Paketi indir:** GitHub'da depo > Releases > “Google Play paketi” (etiket: play) > `iptv-play.aab`. Her derlemede kendiliğinden güncellenir, sürüm kodu her seferinde artar.
4. **Uygulama imzalama:** “Google tarafından yönetilsin” (varsayılan) seç. Yükleme anahtarı olarak CI'daki mevcut anahtar kullanılıyor.
5. **Önce kapalı teste yükle:** Test > Kapalı test > yeni sürüm > AAB'yi yükle. (Abonelik ürünleri, faturalandırma izinli bir paket yüklendikten sonra oluşturulabilir.)
6. **Abonelikleri oluştur** (Bölüm 7).
7. **Mağaza girişi** (Bölüm 3) ve **Uygulama içeriği** formları (Bölüm 4, 5, 6).
8. 12 kişiyi ekle, 14 gün bekle, **üretim erişimi iste**.

> Not: Play'den kurulan uygulama, doğrudan APK'dan farklı imzalıdır. Aynı telefonda üst üste kurulmaz. APK kullanan biri Play sürümüne geçecekse önce Yedekle yapıp APK'yı kaldırmalı.

## 3. Mağaza girişi

**Uygulama adı** (15/30)
```
Iptv Player Pro
```

**Kısa açıklama – Türkçe** (79/80)
```
M3U ve Xtream listeleriniz için canlı TV, film ve dizi oynatıcı. İçerik sunmaz.
```

**Tam açıklama – Türkçe** (1608/4000)
```
Iptv Player Pro; kendi M3U listenizi ya da Xtream hesabınızı ekleyip canlı TV, film ve dizileri tek yerde izlemenizi sağlayan bir medya oynatıcıdır.

ÖNEMLİ: Uygulama hiçbir kanal, film, dizi ya da yayın aboneliği sağlamaz ve satmaz. Yalnızca yasal olarak erişim hakkınız olan kaynakları ekleyin.

NELER YAPAR
• Canlı TV: kategoriler, arama, favoriler, son izlenenler
• TV rehberi: şimdi ve sıradaki programlar, program hatırlatıcıları
• Film ve diziler: yatay satırlar, vitrin, kaldığınız yerden devam, izleme listesi
• Çoklu ekran: aynı anda birden fazla kanal
• Kayıt ve indirme: canlı yayını kaydedin, filmleri çevrimdışı izleyin
• Android TV: kumandayla tam gezinme, telefondan TV'ye aktarma ve yönetme
• Bugün TV'de, dizi akışı ve spor ekranı: maç saatleri, takım ve dizi takibi
• Çocuk kilidi, aile profilleri, uygulama şifresi
• Renkli temalar, yedekleme ve geri yükleme

ÜYELİK
İlk 7 gün ücretsiz deneyin. Sonrasında uygulamayı kullanmak için yıllık Standart üyelik gerekir. Yıllık Pro üyelik ek özellikleri açar: çoklu ekran, kayıt, indirme, birden fazla kaynak, yatay satır görünümü, renkli temalar, yedekleme, hatırlatıcılar, spor ayrıntıları, dizi ve takım takibi, TV'den oynatma, çocuk kilidi ve profiller. Abonelik Google Play üzerinden alınır ve yıllık yenilenir; istediğiniz zaman Google Play'de Abonelikler bölümünden iptal edebilirsiniz.

GİZLİLİK
Hesap gerekmez. Reklam ve izleme yoktur. Kaynaklarınız, parolalarınız ve izleme geçmişiniz yalnızca cihazınızda kalır.
```

**Yenilikler – Türkçe**
```
İlk Google Play sürümü: canlı TV, TV rehberi, film ve diziler, kayıt ve indirme, Android TV desteği. 7 gün ücretsiz deneme.
```

**English (ek dil, istersen)** – Short description (80/80)
```
Player for your own M3U and Xtream sources: live TV, movies, series. No content.
```

Full description (1526/4000)
```
Iptv Player Pro is a media player: add your own M3U playlist or Xtream account and watch live TV, movies and series in one place.

IMPORTANT: The app does not provide or sell any channels, movies, series or streaming subscriptions. Only add sources you have the legal right to access.

WHAT IT DOES
• Live TV: categories, search, favourites, recently watched
• TV guide: now and next programmes, programme reminders
• Movies and series: horizontal rows, showcase, resume where you left off, watchlist
• Multi-screen: several channels at once
• Record and download: record live streams, watch movies offline
• Android TV: full remote-control navigation, send from phone to TV and control it
• Today on TV, series schedule and sports screen: match times, team and series follow
• Child lock, family profiles, app passcode
• Colour themes, backup and restore

MEMBERSHIP
Try it free for 7 days. After that a yearly Standard membership is needed to keep using the app. A yearly Pro membership unlocks extra features: multi-screen, recording, downloads, multiple sources, row layout, colour themes, backup, reminders, sports details, series and team follow, casting to TV, child lock and profiles. Subscriptions are bought through Google Play and renew yearly; cancel any time in Google Play under Subscriptions.

PRIVACY
No account needed. No ads, no tracking. Your sources, passwords and watch history stay on your device.
```

What's new
```
First Google Play release: live TV, TV guide, movies and series, recording and downloads, Android TV support. 7-day free trial.
```

**Kategori:** Video Oynatıcılar ve Düzenleyiciler. **Etiketler:** Medya oynatıcı. **İletişim e-postası:** senin e-postan (zorunlu). **Gizlilik politikası URL'si:**
```
https://github.com/YonetimMerkezi/-ptvplayer/blob/main/gizlilik-politikasi.md
```

**Görseller** (klasör: `play/graphics` – depoda ve sohbette):
- Uygulama simgesi 512×512: `simge-512.png`
- Öne çıkan görsel 1024×500: `ozne-cikan-gorsel-1024x500.png`
- Telefon ekran görüntüleri (1080×1920): `telefon-1…5`
- Android TV: ekran görüntüsü 1920×1080 `tv-1-filmler-1920x1080.jpg`, TV afişi 1280×720 `tv-afisi-1280x720.png`

## 4. Uygulama içeriği formları

| Form | Yanıt |
|---|---|
| Gizlilik politikası | Yukarıdaki adres |
| Reklamlar | **Hayır** (AdMob eklenince güncelle) |
| Uygulama erişimi | **Tüm veya bazı bölümler kısıtlı** → inceleme notunu yapıştır (Bölüm 6) |
| Hedef kitle | **Yalnız 18 yaş ve üzeri** (kullanıcı kendi kaynağını ekler; Aileler programına girmez) |
| Haber uygulaması | Hayır |
| COVID-19 | Hayır |
| Finansal özellikler | Yok |
| Sağlık uygulaması | Hayır |
| Hesap silme | Uygulamada hesap oluşturulmaz → uygulanmaz |
| İçerik derecelendirme (IARC) | Kategori: “Medya/video oynatıcı ya da diğer”. Şiddet, cinsellik, kumar, uyuşturucu, küfür: **yok**. Kullanıcılar harici içerik izleyebilir: **evet**; kullanıcılar birbiriyle iletişim kurmaz: **hayır**; konum paylaşımı: **hayır**; dijital satın alma: **evet** (abonelik). Sonuç yüksek yaş çıkabilir, kabul et. |

## 5. Veri güvenliği formu

Önerilen (ihtiyatlı) yanıt: uygulama film/dizi adını kendi eşleştirme hizmetimize gönderir, bu yüzden veri toplanıyor sayılır.

- Uygulama kullanıcı verisi **topluyor veya paylaşıyor mu?** → **Evet, topluyor**
- **Şifreleme:** veri aktarılırken şifreleniyor → **Evet**
- **Silme talebi yolu:** **Hayır** (veri kişiye bağlı değil; politikada yazıyor)
- Tür: **Uygulama etkinliği → Diğer eylemler** (film/dizi adı, eşleştirme için)
  - Toplanıyor: **Evet** · Paylaşılıyor: **Hayır** (adlar, hizmet sağlayıcılara yalnız arama için gider; kullanıcıya bağlanmaz)
  - Amaç: **Uygulama işlevselliği**
  - Zorunlu mu: **Evet, zorunlu** (kapatma seçeneği yok)
  - Kişiye bağlı mı: **Hayır**
- Diğer tüm türler (konum, kişisel bilgi, finansal bilgi, mesajlar, fotoğraf/video, ses, dosya, takvim, kişiler, web gezinme, cihaz kimliği): **toplanmıyor**
- Satın alma geçmişi: beyan gerekmez, Google Play yönetiyor.

## 6. İzin ve hizmet beyanları, inceleme notu

**Ön plan hizmeti – veri senkronizasyonu (dataSync)**
```
Kullanıcının başlattığı film/dizi indirmesi ve kullanıcının önceden kurduğu zamanlı canlı yayın kaydı. Çalışırken bildirimde görünür, bildirimden durdurulabilir. Android 15 süre sınırında hizmet kendiliğinden durur.
```
**Ön plan hizmeti – medya oynatma (mediaPlayback)**
```
Kullanıcı ekranı kapatsa ya da başka uygulamaya geçse de seçtiği sesin çalmaya devam etmesi. Medya bildirimi görünür, oynatma bildirimden durdurulabilir.
```
Play her tür için **kısa bir ekran videosu** (YouTube'da liste dışı bağlantı) ister: (1) Film seç > İndir > bildirimde indirme görünür; (2) Canlı kanal > Kayıt kur > kayıt bildirimi; (3) Ses çal > ekranı kapat > bildirimden durdur.

**Tam zamanlı alarm (SCHEDULE_EXACT_ALARM)**
```
Kullanıcının seçtiği saatte başlayan zamanlı kayıt ve program/maç hatırlatıcıları. Zaman kaymasız çalışması uygulamanın temel işlevidir.
```

**Uygulama erişimi (inceleme notu)**
```
Iptv Player Pro bir medya oynatıcıdır; kanal, film ya da dizi sağlamaz. Kullanıcı kendi M3U listesini ya da Xtream hesabını ekler. İncelemek için: Ana ekran > Kaynak ekle > “M3U bağlantısı” > şu adresi girin:
https://raw.githubusercontent.com/YonetimMerkezi/-ptvplayer/main/play/demo.m3u
Bu liste yalnızca herkese açık test akışlarını içerir. Üyelik: ilk 7 gün deneme açıktır; sonrası Google Play aboneliğidir (lisans test hesabıyla denenebilir).
```
(Test akışları bu ortamdan doğrulanamadı; açılmıyorsa `play/demo.m3u` içindeki adresleri değiştir.)

## 7. Abonelik ürünleri (Para kazanma > Ürünler > Abonelikler)

Ürün kimlikleri **tam olarak** şöyle olmalı (uygulama bunları arıyor):

| Ürün kimliği | Ad | Temel plan |
|---|---|---|
| `uyelik_standart` | Standart üyelik | Yıllık (P1Y), otomatik yenilenir |
| `uyelik_pro` | Pro üyelik | Yıllık (P1Y), otomatik yenilenir |

Fiyatı sen belirlersin. Her ürüne temel plan ekleyip **etkinleştir**. Deneme istersen “Yeni müşteri edinme” teklifi ekle (ör. 1 hafta ücretsiz): uygulama bunu uygun kullanıcıya otomatik gösterir. Test için Ayarlar > Lisans testi'ne Gmail adresini ekle; ürünler etkinleşince dahili/kapalı testte sandbox ödemeyle dene.

## 8. Yayın öncesi son kontrol

- Telefon ve TV'de en son APK'yı dene: kenar boşlukları, geri tuşu, kayıt/indirme.
- Kapalı testte: abonelik al, iptal et, hak kalkıyor mu bak.
- AdMob eklenirse: gizlilik politikası, Veri güvenliği ve Reklamlar formu güncellenir.
