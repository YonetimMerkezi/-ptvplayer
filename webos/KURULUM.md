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

**Telefondan aktarma:** Kaynak ekle ekranındaki **Telefondan aktar** düğmesi TV'de bir QR kod ve 4 haneli kod gösterir. Telefon ve TV aynı modemdeyken telefonun kamerasıyla QR kodu okut (ya da tarayıcıya ekrandaki adresi yaz), açılan sayfaya liste bağlantını ya da Xtream bilgilerini yapıştırıp gönder; TV bağlanıp kaynağı ekler ve sonucu telefonda da gösterir. Dışarıda bir sunucu kullanılmaz; alıcı yalnızca bu ekran açıkken çalışır, ekrandan çıkınca ya da 10 dakika sonra kapanır. Telefon sayfayı açamıyorsa: ikisinin de aynı Wi-Fi/modemde olduğunu ve modemde “istemci yalıtımı (AP isolation)” seçeneğinin kapalı olduğunu kontrol et.

Kumanda: oklar gezinir, **OK** seçer, **Geri** döner. Listelerde **Sarı** tuş (ya da OK'a basılı tutmak) favoriye ekler; **Mavi** arama açar. Canlı yayında **▲▼ / CH** kanal değiştirir, sayı tuşları kanal numarasına gider, **Sarı** yayın biçimini (HLS / TS) değiştirir. Filmde **◀▶** 10 sn sarar (hızlı basınca adım büyür). Kumanda çubuğu ve Geri düğmesi son tuştan 8 sn sonra (yayında 4,5 sn) kendiliğinden kalkar; duraklatılmış yayında, açık panelde ve hata iletisinde kalır.

**Altyazı:** LG televizyonlar filmin içine gömülü altyazıyı uygulamaya vermez; listede altyazı görünmezse oynatıcıda **Altyazı › Altyazı ara…** ile film ya da bölüm için harici (Türkçe öncelikli) altyazı bulunur. Altyazı sesten kayıksa aynı menüdeki **Altyazıyı kaydır** ile ◀▶ 0,5 sn adımla düzeltilir. **Altyazı görünümü** boyut, renk, arka plan ve konumu seçtirir (örnek metin gösterilir; ayarlar saklanır ve aranan altyazıya uygulanır). Altyazı kaynağı internet gerektirir; yapımın adı kaynaktaki adla birebir eşleşmezse (Türkçe ad, farklı yıl gibi) bulunamaz. **Fragman** TV'nin YouTube uygulamasında açılır.

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
