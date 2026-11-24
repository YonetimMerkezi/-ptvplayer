# Iptv Player Pro · LG webOS TV kurulumu

Bu sürüm **webOS 3.x (2016–2017) ve üstü** televizyonlar içindir. Eski motorda (Chromium 38) çalışsın diye arayüz Android sürümünden **ayrı ve sadedir**: kanallar, filmler, diziler, arama, favoriler, son izlenenler, kaldığın yerden devam ve ayarlar vardır. Android'e özel özellikler (zamanlı kayıt, indirme, Cast, yazılım ses çözücüsü, PiP) televizyonda yoktur.

> **Dürüst not:** Bu paket gerçek bir LG televizyonda henüz denenmedi. Tarayıcıda (sahte sunucuyla) ve ES5 denetimiyle doğrulandı. İlk kurulumda bir sorun çıkarsa **Ayarlar › Hata kaydı** ekranının fotoğrafını göndermen yeterli.

## 1. IPK dosyasını indir

GitHub sürümleri › **webos** etiketi › `iptv-player-webos.ipk`
(sabit adres: `https://github.com/YonetimMerkezi/-ptvplayer/releases/download/webos/iptv-player-webos.ipk`)

## 2. Geliştirici modu ile kurulum (hemen denemek için)

1. [webostv.developer.lge.com](https://webostv.developer.lge.com) adresinde ücretsiz LG geliştirici hesabı aç.
2. Televizyonda **LG Content Store**'dan **Developer Mode** uygulamasını kur ve aç. Hesabınla giriş yap, **Dev Mode Status** ve **Key Server** seçeneklerini **ON** yap; televizyon yeniden başlar. Uygulamayı yeniden açınca **TV IP adresi**, **geçen süre** ve **Passphrase** görünür (süre dolunca aynı ekrandan uzatılır).
3. Bir bilgisayarda (Windows, macOS ya da Linux) Node.js kurulu olsun, sonra:

```
npm install -g @webos-tools/cli
ares-setup-device --add tv --info "{'host':'TV_IP_ADRESI','port':'9922','username':'prisoner'}"
ares-novacom --device tv --getkey
ares-install --device tv iptv-player-webos.ipk
ares-launch --device tv com.koruk.iptv.webos
```

`--getkey` sırasında televizyonda görünen **Passphrase** istenir. Kurulumdan sonra uygulama televizyonun uygulama listesinde de görünür.

Telefondan: Android'de Termux ile aynı komutlar çalışmalıdır (denenmedi); televizyon ve telefon aynı ağda olmalıdır.

## 3. İlk açılış

Uygulama kaynak ister: **Xtream** (sunucu, kullanıcı adı, şifre) ya da **M3U bağlantısı**. Yazı alanında OK'a basınca televizyonun ekran klavyesi açılır. Adres olarak `get.php?username=…&password=…` bağlantısını yapıştırırsan alanlar kendiliğinden ayrıştırılır.

**Telefondan yazma (ilk kurulumda da):** Kaynak ekle ekranının sağında QR kod ve 4 haneli kod görünür; uygulama ilk açıldığında telefon kumandası kendiliğinden başlar (Ayarlar › Telefon kumandası'ndan kapatmışsan panel yalnızca “Telefon kumandasını aç” düğmesi gösterir). Telefon ve TV aynı modemdeyken QR kodu telefonun kamerasıyla okut: açılan sayfada **Liste bilgilerini yaz** bölümü açık gelir. Xtream (sunucu, kullanıcı, şifre) ya da M3U bağlantısını telefonun klavyesiyle yaz; **TV'ye yaz** TV'deki alanları doldurur (kontrol edip OK ile bağlarsın), **Yaz ve ekle** doğrudan bağlanıp ekler. Aynı sayfa normal kumandadır (yön/OK/Geri, oynat, yazı gönderme). Şifre yerel ağda, TV'ye düz HTTP ile gider; yalnızca kendi ağında kullan.

**Telefondan aktarma:** Kaynak ekle ekranındaki **Telefondan aktar** düğmesi TV'de bir QR kod ve 4 haneli kod gösterir. Telefon ve TV aynı modemdeyken telefonun kamerasıyla QR kodu okut (ya da tarayıcıya ekrandaki adresi yaz), açılan sayfaya liste bağlantını ya da Xtream bilgilerini yapıştırıp gönder; TV bağlanıp kaynağı ekler ve sonucu telefonda da gösterir. Dışarıda bir sunucu kullanılmaz; alıcı yalnızca bu ekran açıkken çalışır, ekrandan çıkınca ya da 10 dakika sonra kapanır. Telefon sayfayı açamıyorsa: ikisinin de aynı Wi-Fi/modemde olduğunu ve modemde “istemci yalıtımı (AP isolation)” seçeneğinin kapalı olduğunu kontrol et.

Kumanda: oklar gezinir, **OK** seçer, **Geri** döner. Listelerde **Sarı** tuş (ya da OK'a basılı tutmak) favoriye ekler; **Mavi** arama açar. Canlı yayında **▲▼ / CH** kanal değiştirir, sayı tuşları kanal numarasına gider, **Sarı** yayın biçimini (HLS / TS) değiştirir. Filmde **◀▶** 10 sn sarar (hızlı basınca adım büyür). Kumanda çubuğu ve Geri düğmesi son tuştan 8 sn sonra (yayında 4,5 sn) kendiliğinden kalkar; duraklatılmış yayında, açık panelde ve hata iletisinde kalır.

**Altyazı:** LG televizyonlar filmin içine gömülü altyazıyı uygulamaya vermez; listede altyazı görünmezse oynatıcıda **Altyazı › Altyazı ara…** ile film ya da bölüm için harici (Türkçe öncelikli) altyazı bulunur. Altyazı sesten kayıksa aynı menüdeki **Altyazıyı kaydır** ile ◀▶ 0,1 sn adımla düzeltilir (tuşu basılı tutarsanız adım büyür). **Altyazı görünümü** boyut, renk, arka plan ve konumu seçtirir (örnek metin gösterilir; ayarlar saklanır ve aranan altyazıya uygulanır). Altyazı kaynağı internet gerektirir. Yapım şu sırayla eşleştirilir: önce daha önce seçtiğiniz eşleşme, sonra sağlayıcının verdiği IMDb/TMDB kimliği ve özgün ad, sonra IMDb araması (Türkçe adları tanır, ör. "Esaretin Bedeli") ile Cinemeta'nın birbirini doğrulaması ve yapım yılı. Kesin eşleşme çıkmazsa "Hangi yapım?" listesi açılır; seçiminiz hatırlanır. Gelen altyazılar başka bir yapıma aitse listenin sonundaki **Başka yapım seç** ile düzeltilir. Sağlayıcı kimlik/özgün ad vermiyorsa ve ad çok farklıysa seçim sizden istenir. **Fragman** varsayılan olarak bu uygulamanın penceresinde YouTube TV sayfasında oynar; Geri ile çıkınca uygulama kapanır ama TV servisi onu birkaç saniyede yeniden açıp kaldığınız ekrana döndürür. Telefonda izlemek için QR kod da vardır. **Kanal logoları:** bir logo doğrudan yüklenemezse (eski TV'lerin sertifika listesi ya da sunucunun başvuran denetimi yüzünden) uygulama resmi TV içindeki servis üzerinden yeniden dener; o da olmazsa kırık simge yerine logoyu gizler.

**Canlı yayında geri sarma:** Sağlayıcının yayın arşivi (Xtream `tv_archive`) olan kanallarda, kumandada **◀▶** 5 dk (**◀◀ ▶▶** 15 dk) geri/ileri sarar; tuşlar birikir, kısa bir bekleyişten sonra arşiv o andan açılır. **Geri sar** düğmesi 5–90 dk ve “Programın başına” seçeneklerini, arşivdeyken “Canlıya dön”ü sunar. Diske yazılmaz; arşiv bitince ya da hata verirse canlıya dönülür. Kaç gün geriye gidilebileceğini sağlayıcı belirler (Bilgi panelinde “Sağlayıcı arşivi”). Arşivi olmayan kanallarda düğme görünmez.

**Canlı yayın kaydı (deneme):** Canlı yayında **Kayıt** düğmesi yayını MPEG-TS olarak yazılabilir bir diske yazar (≈ 7–8 Mbps, saatte yaklaşık 3 GB). Panel disklerin yazılabilirliğini ve boş alanı gösterir. LG'nin kısıtları nedeniyle uygulamanın servisi kök yetkisiz çalışır: harici USB disklere (kök sahibi, izin 755) yazamaz, bu yüzden kayıt dahili belleğe gider. Dahili bellekte çoğu zaman yalnızca birkaç yüz MB boş yer olur; kayıt diskte 150 MB boş yer bırakarak kendiliğinden biter.

**Görünüm:** **Ayarlar › Tema merkezi** yedi canlı, çok renkli tema sunar (tek renkli tema yoktur; eski seçimler en yakın yeni temaya taşınır). **Yazı boyutu** dört kademedir; büyüdükçe kartlar, düğmeler ve kumanda çubuğu taşmayacak biçimde yeniden yerleşir. **Kanallarda görüntü oranı** varsayılan olarak ekranı tam doldurur (Uzat); **Film/dizi görüntü oranı** ayrıca seçilir (Sığdır / Doldur / Uzat). Filmler ve Diziler vitrin yapısındadır: seçili yapımın görseli tüm ekranı yumuşak kenarlı bir arka plan olarak kaplar, ◀ ile kategoriler açılır.

**Düzenleme (Yeşil tuş):** Canlı TV, Filmler ve Diziler'de **Yeşil** tuş “Düzenle” menüsünü açar. *Liste sıralaması*: varsayılan, A→Z, Z→A, eklenme tarihi (yeni/eski) ve puan (kanallarda yalnız ad sıraları); seçim tür başına hatırlanır. *Kategori sırası*: seçili kategoriyi yukarı/aşağı taşı, en üste al, ada göre diz ya da varsayılana sıfırla. *Klasörler*: istediğin adla klasör oluştur; bir kanalın/filmin üzerindeyken Yeşil › **Klasöre ekle / çıkar** ile içine koy. Klasörler kategori listesinin başında görünür, içeriği ağ gerektirmeden açılır; klasörü silmek içindekileri kaynaktan silmez. Düzen kaynak ve tür başına ayrı saklanır.

**Yayın kalitesi:** **Ayarlar › Yayın kalitesi** varsayılan olarak **En yüksek**tir: kaynak birden çok kaliteli bir HLS yayını verirse en yüksek uygun sürüm (H.264, en çok 1080p; HEVC/4K eski modellerde açılmayabildiği için elenir) doğrudan seçilir ve oynatıcıda “HLS 1080p” gibi görünür. Liste alınamazsa ya da seçilen sürüm açılmazsa özgün adresle devam edilir. Ses ayrı listeden gelen yayınlarda seçim yapılmaz. İnternet yavaşsa ve görüntü takılıyorsa **Otomatik**e alın. TS ve film/dizi dosyaları (MP4/MKV) zaten tek kaliteli olduğundan seçilecek bir şey yoktur.

**Telefon kumandası:** **Ayarlar › Telefon kumandası** QR kodu ve 4 haneli kodu gösterir. Telefon ve TV aynı Wi-Fi'deyken kodu telefon kamerasıyla okutun; açılan sayfa kumanda olur: yön/OK/Geri ve renkli tuşlar, oynat/duraklat/sar, kanal ve rakam tuşları, aramaya yazı gönderme ve “TV'de oynat” (yayın bağlantısı ya da YouTube linki). Sayfayı telefonun ana ekranına ekleyebilirsiniz; kod değişmez. Uygulama açıkken çalışır; kapatılana dek her açılışta kendiliğinden başlar.

**Arama:** Canlı TV, Rehber, Filmler, Diziler ve Favoriler ekranlarının sağ üstünde **Ara** düğmesi vardır (▲ ile üst çubuğa çık, ▶ ile Ara'ya geç, OK; Mavi tuş da aynı işi yapar). Filmler'den açılan arama yalnızca filmlerde, Diziler'den yalnızca dizilerde, Canlı TV'den yalnızca kanallarda arar (daha hızlıdır, ilk aramada yalnız o katalog indirilir); Favoriler ve Ana sayfa › Ara tüm katalogda arar.

**Güncelleme:** Uygulama açıldıktan kısa süre sonra, en çok 12 saatte bir (açıkken) GitHub'daki `webos` sürümüne bakar ve yeni sürüm varsa bir kez “Yeni sürüm var: 1.0.N” ileti verir; **Ayarlar › Güncelleme** kurulu/son sürümü gösterir, elle denetler ve otomatik denetimi kapatır. **Şimdi güncelle** (OK'a iki kez basın) yalnızca sabit yayın adresindeki IPK'yı TV servisiyle indirir, `!<arch>` başlığını ve yayındaki SHA-256 özetini doğrular, sonra TV'nin kurulum servisine (`appInstallService/dev/install`) verir. Bu son adımı TV'nin izin verip vermediği cihaza bağlıdır; vermezse ekran nedenini ve TV'nin ham yanıtını gösterir ve **bölüm 2'deki elle kurulum** (webOS Dev Manager / `ares-install`) geçerli kalır. Kurulum başarılı olursa uygulama kapanır; yeniden açınca “Güncellendi” iletisi görünür.

**Fragman:** Kırmızı tuş fragmanı **Ayarlar › Fragman testi**nde seçili yolla açar: (1) bu uygulamanın penceresinde YouTube TV sayfası (varsayılan; Geri ile çıkınca uygulama kapanır, TV servisi onu birkaç saniyede kendiliğinden yeniden açar ve kaldığınız ekrana döndürür; dönmezse aynı ekranda “Dönüş notları” nedeni gösterir), (2) TV'nin YouTube uygulaması (farklı açma biçimleri denenebilir), (3) telefonda izlemek için QR kod. Ayrıntı ekranındaki **Fragman: telefonda izle (QR)** düğmesi her zaman QR gösterir.

## 4. Liste yüklenmiyorsa

Paketlenmiş uygulamalar için tarayıcı kuralları (CORS) bazı sunucuları engelleyebilir. Bu durumda uygulama otomatik olarak **televizyonun içindeki servis** üzerinden bağlanır. Elle seçmek için: **Ayarlar › Ağ yolu › TV servisi**. **Bağlantıyı sına** hangi yolla bağlandığını gösterir.

Canlı yayın açılmıyorsa **Ayarlar › Canlı yayın biçimi**ni değiştir (Xtream için HLS ya da TS). Sesi olmayan ya da görüntüsü gelmeyen yayınlar çoğu zaman kodek sınırıdır: televizyonun kendi çözücüsü AC3/DTS ses ve bazı HEVC yayınları 2016–2017 modellerde oynatamayabilir.

## 5. LG Content Store'a yüklemek (isteğe bağlı, ayrı bir süreç)

Mağaza yayını LG'nin kendi inceleme sürecidir ve bu paketin otomatik yapabildiği bir şey değildir. Genel adımlar:

1. [LG Seller Lounge](https://seller.lgappstv.com) hesabı aç ve satıcı bilgilerini tamamla.
2. Uygulamayı geliştirici modunda gerçek televizyonda eksiksiz dene (LG'nin “self-test” kontrol listesi vardır).
3. Mağaza için hazırla: IPK, 1920×1080 ekran görüntüleri, simgeler (80×80 ve 130×130 pakette var), açıklama, gizlilik politikası ve **inceleme ekibi için çalışan örnek bir kaynak** (kendi içeriğini taşımadığı için LG'nin deneyebileceği bir Xtream/M3U hesabı gerekir).
4. Gönder; LG incelemesi sonucuna göre düzeltme isteyebilir.

Uygulama hiçbir içerik sunmaz ve içerik adresi içermez; yalnızca kullanıcının eklediği kaynakları oynatır. Bu, incelemede açıkça belirtilmelidir.

## Geliştirme

```
cd webos
npm ci
npm run build   # dist/app + dist/service (ES5, Chromium 38)
npm run check   # ES5 ve CSS denetimi
npx ares-package --no-minify dist/app dist/service -o dist/ipk
```

Testler: depo kökünde `node --test tests/webos.test.js`.
