# Iptv Player Pro – Gizlilik Politikası

*English version below.*

Son güncelleme: 25 Kasım 2026 · Uygulama: Iptv Player Pro (Android: `com.koruk.iptv`, LG webOS TV: `com.koruk.iptv.webos`) · Geliştirici: YonetimMerkezi · E-posta: karagozyazilim12@gmail.com

Bu politika hem Android hem LG webOS TV uygulamasını kapsar. Android'e özgü bölümler başlıklarında “Android” yazar; LG TV sürümü için “LG webOS TV sürümü” bölümüne bakın.

## Kısaca

- Iptv Player Pro bir **medya oynatıcıdır**. Yayın hizmeti sunmaz, içerik sağlamaz; yalnızca sizin eklediğiniz kaynakları (M3U listesi, Xtream hesabı) oynatır.
- Hesap açmanız gerekmez. Ad, e-posta, telefon, konum gibi kişisel bilgi **istemeyiz**.
- Reklam, analiz (istatistik) ve çökme raporlama kitaplığı **yoktur**.
- Kaynaklarınız, parolalarınız, favorileriniz ve izleme geçmişiniz **yalnız cihazınızda** durur; bize gönderilmez.

## Cihazınızda tutulan veriler

Şunlar yalnız cihazınızın uygulama deposunda saklanır ve bizim sunucularımıza gönderilmez: eklediğiniz kaynaklar (adres, kullanıcı adı, parola), favoriler, son izlenenler, izleme ilerlemesi, profiller, ayarlar, uygulama kilidi şifresi, indirilen ve kaydedilen dosyalar. Uygulamayı kaldırırsanız ya da uygulama verilerini silerseniz bunların hepsi silinir. “Yedekle” özelliğini kullanırsanız bu veriler, sizin seçtiğiniz bir dosyaya yazılır; dosyayı kimseyle paylaşmamanızı öneririz.

## Kaynağınızın sağlayıcısı

Eklediğiniz IPTV kaynağına uygulama doğrudan bağlanır. Sağlayıcı, isteği IP adresinizle ve kendi hesap bilgilerinizle alır. Bu bağlantı sizin seçiminizdir; sağlayıcının kendi gizlilik koşulları geçerlidir. Biz bu bağlantılara aracılık etmeyiz.

## Uygulamanın internetten aldığı bilgiler (Android)

Uygulamanın özellikleri için aşağıdaki hizmetlere istek gider. İsteklerde adınız, hesabınız ya da cihaz kimliğiniz **bulunmaz**; her internet isteğinde olduğu gibi hizmet IP adresinizi görür.

- **Film ve dizi bilgisi:** Film/dizi adı (listenizdeki addan temizlenmiş hâli) ve varsa yıl, eşleştirme, tür, özet ve afiş için Cinemeta (Stremio), Metahub (afiş) ve Wikidata'ya gönderilir. Bu hizmetlere giden istek kullanıcıya ya da cihaza bağlanmaz.
- **Fragmanlar:** Fragman gösterilen ekranlarda küçük resim ve oynatıcı YouTube'dan (Google) yüklenir; "Fragmanı otomatik ara" açıksa fragman bulmak için film/dizi adı YouTube'da aranır. YouTube bu istekleri kendi gizlilik politikasına göre işleyebilir. Çocuk modunda fragman gösterilmez.
- **Oyuncu bilgisi:** Oyuncu ve yönetmen adları fotoğraf için Wikidata'ya gönderilir, fotoğraflar Wikimedia Commons'tan yüklenir; oyuncunun diğer yapımları için ad Cinemeta'ya gönderilir. Bu istekler kullanıcıya ya da cihaza bağlanmaz.
- **İçerik uyarıları:** Film için uyarı bilgisi screenwiseapp.com'dan alınır; film adı bu hizmete gönderilir. İngilizce uyarı metni Türkçeye çevrilmek üzere Google Çeviri'ye (translate.googleapis.com) gönderilir.
- **TV rehberi ve yayın akışı:** EPG kaynakları (epgshare01, open-epg, Teleonline, jsDelivr) ve yayın akışı sayfaları (tvdebugun, tvyayinakisi, 1001dizi).
- **Spor:** TheSportsDB, ESPN, LiveScore, sahadan, macrehberi, livesoccertv, sporekrani; bayraklar için flagcdn.
- **Diğer:** Film sınıflandırma bilgisi için Kültür ve Turizm Bakanlığı (filmsiniflandirma.ktb.gov.tr); hız testi için Cloudflare (speed.cloudflare.com).
- **TV'ye aktarma, yayın gönderme:** Telefon ve TV arasındaki aktarım ve ağ cihazı bulma, yalnız yerel ağınızda olur.
- **QR kod okuma:** Google Play hizmetlerinin kod tarayıcısı kullanılır; kamera görüntüsü uygulamada saklanmaz.
- **Uygulama ayarı:** Hangi temaların Pro üyelik gerektirdiği, projenin GitHub deposundaki küçük bir ayar dosyasından (raw.githubusercontent.com) okunur. İstekte kimliğiniz bulunmaz.

Google Play dışında dağıtılan APK sürümü ayrıca yeni sürüm denetimi için GitHub'a bağlanır. Google Play sürümünde bu yoktur.

## Üyelik ve ödeme (Android)

Üyelik (Standart, Pro) Google Play aboneliğidir. Ödeme bilgileriniz Google tarafından işlenir; bize ulaşmaz. Uygulama yalnız aboneliğinizin etkin olup olmadığını Google Play'den öğrenir. Aboneliği Google Play > Abonelikler bölümünden istediğiniz zaman iptal edebilirsiniz.

Üyelik aynı anda bir telefonda ve bir TV'de kullanılabilir. Bunu denetlemek için Google Play sürümü, üyelik sunucumuza (Cloudflare Workers) aboneliğinizin geri döndürülemez bir özetini (abonelik anahtarınızın tek yönlü karması; anahtarın kendisi gönderilmez), cihaza özgü rastgele bir kimliği ve cihaz türünü (telefon ya da TV) gönderir. Ad, e-posta, hesap, konum, izleme listesi ya da kaynak bilgisi gönderilmez. Bu kayıtlar yalnızca üyeliğin hangi cihazda etkin olduğunu belirlemek için tutulur.

Yönetici size hediye üyelik verirse, cihaz kimliğinizi (Üyelik penceresinde görünen rastgele kimlik) siz ona iletirsiniz. Herkese açık yapılandırma dosyasında yalnızca bu kimlik, üyelik türü ve bitiş tarihi yer alır; ad, e-posta ya da hesap bilgisi yer almaz. Uygulama bu dosyayı okuyup kendi kimliğiyle eşleşen kaydı uygular.

## İzinler (Android)

- **İnternet, ağ durumu, çoklu yayın:** kaynaklara ve hizmetlere bağlanmak, yerel ağda cihaz bulmak için.
- **Bildirimler:** indirme ve kayıt durumu, program hatırlatıcıları için; yalnız siz açarsanız.
- **Tam zamanlı alarm, açılışta başlatma:** zamanlı kayıt ve hatırlatıcıları zamanında çalıştırmak, cihaz açılınca yeniden kurmak için.
- **Ön plan hizmetleri:** arka planda ses çalmak, indirmek ve zamanlı kayıt yapmak için.
- **Android TV “Devam et”:** izlemeye devam edilecek içeriği TV ana ekranında göstermek için.

## LG webOS TV sürümü

LG TV'ler için ayrı, sade bir sürüm vardır (`com.koruk.iptv.webos`). Yukarıdaki ilkeler onun için de geçerlidir: hesap yok, reklam yok, analiz yok, kişisel bilgi istenmez, üyelik ya da satın alma yok. Farklar şunlardır:

- **TV'de tutulan veriler:** Eklediğiniz kaynaklar (adres, kullanıcı adı, parola), favoriler, klasörler, son izlenenler, kaldığınız yer ve ayarlar yalnız TV'nin bu uygulamaya ayrılmış depolama alanında durur ve bize gönderilmez. Parola TV'de şifrelenmeden saklanır. Uygulamayı TV'den kaldırırsanız hepsi silinir. Kayıt özelliğini (deneme) kullanırsanız kayıtlar TV'nin ya da takılı USB belleğin diskine yazılır; hiçbir yere yüklenmez.
- **Kaynağınızın sağlayıcısı:** Uygulama eklediğiniz IPTV kaynağına doğrudan (gerekirse TV içinde çalışan uygulama servisi aracılığıyla, aynı TV'de) bağlanır. Sağlayıcı isteği IP adresinizle ve kendi hesap bilgilerinizle alır; sağlayıcının kendi gizlilik koşulları geçerlidir.
- **İnternetten alınanlar:** İsteklerde adınız, hesabınız ya da TV'nizin kimliği **bulunmaz**; her internet isteğinde olduğu gibi hizmet IP adresinizi görür.
  - **Vizyondaki filmler:** Beyazperde (beyazperde.com) sayfası ve afişleri.
  - **Film bilgisi ve afiş:** Film adı (ve varsa yıl) eşleştirme, tür, özet ve afiş için Cinemeta'ya (Stremio) gönderilir; afişler bu hizmetlerin gösterdiği görsel sunucularından (ör. Metahub, TMDB) yüklenir.
  - **Altyazı:** Film adı, kimliğe çevrilmek üzere IMDb öneri hizmetine (v3.sg.media-imdb.com) gönderilir; altyazı listesi ve dosyası OpenSubtitles'ın Stremio eklentisinden (opensubtitles-v3.strem.io) alınır.
  - **Fragmanlar:** YouTube (Google). Fragman, TV'nin YouTube uygulamasında açılır ya da ekrandaki QR kodla telefonda açılır; fragmanı bulmak için film adı YouTube'da aranabilir. Küçük resimler i.ytimg.com'dan yüklenir. YouTube bu istekleri kendi gizlilik politikasına göre işleyebilir.
  - **Spor:** ESPN, LiveScore, Mackolik, TheSportsDB, sahadan, macrehberi, livesoccertv ve sporekrani.
  - **Güncelleme:** LG İçerik Mağazası sürümü güncellemeyi mağaza üzerinden alır ve kendisi güncelleme denetlemez. Mağaza dışından yüklenen sürüm ayrıca yeni sürüm denetimi için GitHub'a bağlanır.
- **Telefon kumandası (isteğe bağlı):** Ayarlar'dan ya da Kaynak ekle ekranından açarsanız TV, yalnız yerel ağınızda (aynı Wi-Fi) erişilebilen küçük bir sayfa sunar. Sayfayı kullanmak için TV ekranındaki 4 haneli kod gerekir. Telefonla TV arasında giden bilgi (tuşlar, yazdığınız arama, gönderdiğiniz bağlantı ya da kaynak bilgisi) internete çıkmaz. Ekranı kapatınca ya da özelliği kapatınca sayfa durur.
- **İzinler:** LG webOS uygulaması kamera, mikrofon, konum ya da kişi listesi gibi izinleri kullanmaz.

## Çocuklar

Uygulama çocuklara yönelik değildir. Aile profilleri için isteğe bağlı, cihazda çalışan bir çocuk kilidi vardır; çocuklardan bilgi toplamayız.

## Saklama ve silme

Biz kişisel veri toplamadığımız için silme talebine konu veri yoktur. Cihazdaki veriler uygulamayı kaldırarak silinir.

## Güvenlik

Kendi hizmetlerimize ve çoğu üçüncü taraf hizmete HTTPS ile bağlanılır. IPTV sağlayıcıları bazen şifrelenmemiş (http) adres kullanır; bu sağlayıcının seçimidir.

## Değişiklikler

Reklam ya da analiz eklenirse bu politika, o sürümden önce güncellenir. Güncel metin bu sayfadadır.

## İletişim

Soru ve talepler için: karagozyazilim12@gmail.com ya da https://github.com/YonetimMerkezi/-ptvplayer/issues

---

# Iptv Player Pro – Privacy Policy

Last updated: 25 November 2026 · App: Iptv Player Pro (Android: `com.koruk.iptv`, LG webOS TV: `com.koruk.iptv.webos`) · Developer: YonetimMerkezi · Email: karagozyazilim12@gmail.com

This policy covers both the Android app and the LG webOS TV app. Sections specific to Android say “Android” in their heading; for the LG TV version see the “LG webOS TV version” section.

## In short

- Iptv Player Pro is a **media player**. It provides no streaming service and no content; it only plays sources that you add (M3U playlist, Xtream account).
- No account is needed. We do **not** ask for your name, email, phone number or location.
- There are **no ads, analytics or crash-reporting libraries**.
- Your sources, passwords, favourites and watch history stay **on your device only** and are not sent to us.

## Data kept on your device

The following is stored only in the app's storage on your device and is never sent to our servers: your sources (address, username, password), favourites, recently watched, watch progress, profiles, settings, the app-lock passcode, and downloaded or recorded files. Uninstalling the app or clearing its data deletes all of it. If you use "Back up", the data is written to a file you choose; we recommend not sharing that file.

## Your source provider

The app connects directly to the IPTV source you add. The provider receives the request with your IP address and your own account details. That connection is your choice and the provider's own privacy terms apply. We do not mediate these connections.

## Information the app fetches from the internet (Android)

To power its features the app sends requests to the services below. Requests contain **no** name, account or device identifier; as with any internet request, the service sees your IP address.

- **Movie and series information:** The film/series title (cleaned from the name in your list) and, if known, the year are sent to Cinemeta (Stremio), Metahub (posters) and Wikidata for matching, genres, plots and posters. These requests are not linked to any user or device.
- **Trailers:** On screens that show a trailer, the thumbnail and the player are loaded from YouTube (Google); if "Find trailers automatically" is on, the film/series title is searched on YouTube to find one. YouTube may process these requests under its own privacy policy. Trailers are not shown in child mode.
- **Cast information:** Actor and director names are sent to Wikidata to find photos, and the photos are loaded from Wikimedia Commons; the name is sent to Cinemeta to list the person's other titles. These requests are not linked to any user or device.
- **Content warnings:** Warning information comes from screenwiseapp.com; the film title is sent to this service. English warning text is sent to Google Translate (translate.googleapis.com) to be translated into Turkish.
- **TV guide and schedules:** EPG sources (epgshare01, open-epg, Teleonline, jsDelivr) and schedule pages (tvdebugun, tvyayinakisi, 1001dizi).
- **Sports:** TheSportsDB, ESPN, LiveScore, sahadan, macrehberi, livesoccertv, sporekrani; flagcdn for flags.
- **Other:** The Turkish Ministry of Culture and Tourism (filmsiniflandirma.ktb.gov.tr) for film classification; Cloudflare (speed.cloudflare.com) for the speed test.
- **Sending to TV, casting:** Transfers between phone and TV and discovery of network devices happen only on your local network.
- **QR scanning:** The Google Play services code scanner is used; no camera image is stored by the app.
- **App setting:** Which themes require a Pro membership is read from a small settings file in the project's GitHub repository (raw.githubusercontent.com). The request contains no identity.

The APK distributed outside Google Play also connects to GitHub to check for new versions. The Google Play version does not.

## Membership and payment (Android)

Membership (Standard, Pro) is a Google Play subscription. Google processes your payment details; they never reach us. The app only learns from Google Play whether your subscription is active. You can cancel at any time in Google Play > Subscriptions.

Membership can be used on one phone and one TV at a time. To enforce this, the Google Play version sends our membership server (Cloudflare Workers) an irreversible digest of your subscription (a one-way hash of the subscription key; the key itself is never sent), a random device-specific ID and the device type (phone or TV). No name, email, account, location, watch history or source details are sent. These records are kept only to determine which device the membership is active on.

If the administrator gives you a complimentary membership, you send them your device ID (the random ID shown in the Membership window). The publicly readable configuration file contains only that ID, the membership type and the end date; no name, email or account details. The app reads this file and applies the entry that matches its own ID.

## Permissions (Android)

- **Internet, network state, multicast:** to reach sources and services and to find devices on the local network.
- **Notifications:** for download and recording status and programme reminders, only if you allow them.
- **Exact alarms, start at boot:** to run scheduled recordings and reminders on time and to re-arm them after a restart.
- **Foreground services:** to play audio in the background, download, and record on schedule.
- **Android TV "Continue watching":** to show what to resume on the TV home screen.

## LG webOS TV version

There is a separate, simplified version for LG TVs (`com.koruk.iptv.webos`). The principles above apply to it as well: no account, no ads, no analytics, no personal information requested, no membership or purchases. The differences are:

- **Data kept on the TV:** The sources you add (address, username, password), favourites, folders, recently watched, resume positions and settings stay only in the storage the TV reserves for this app and are never sent to us. The password is stored on the TV without encryption. Removing the app from the TV deletes all of it. If you use the (experimental) recording feature, recordings are written to the TV's disk or an attached USB drive and are not uploaded anywhere.
- **Your source provider:** The app connects to the IPTV source you add directly (if needed, through the app's service running on the same TV). The provider receives the request with your IP address and your own account details; the provider's own privacy terms apply.
- **Information fetched from the internet:** Requests contain **no** name, account or TV identifier; as with any internet request, the service sees your IP address.
  - **In cinemas:** the Beyazperde (beyazperde.com) page and its posters.
  - **Movie information and posters:** The title (and the year, if known) is sent to Cinemeta (Stremio) for matching, genres, plots and posters; posters are loaded from the image servers those services point to (for example Metahub, TMDB).
  - **Subtitles:** The title is sent to the IMDb suggestion service (v3.sg.media-imdb.com) to find its ID; the subtitle list and file come from OpenSubtitles' Stremio add-on (opensubtitles-v3.strem.io).
  - **Trailers:** YouTube (Google). A trailer opens in the TV's YouTube app or, through the on-screen QR code, on your phone; the title may be searched on YouTube to find a trailer. Thumbnails load from i.ytimg.com. YouTube may process these requests under its own privacy policy.
  - **Sports:** ESPN, LiveScore, Mackolik, TheSportsDB, sahadan, macrehberi, livesoccertv and sporekrani.
  - **Updates:** The LG Content Store version is updated through the store and does not check for updates itself. A version installed from outside the store also connects to GitHub to check for new versions.
- **Phone remote (optional):** If you turn it on in Settings or on the Add source screen, the TV serves a small page reachable only on your local network (the same Wi-Fi). The 4-digit code on the TV screen is required to use it. What passes between phone and TV (keys, the search you type, a link or source details you send) does not leave your network. The page stops when you leave that screen or turn the feature off.
- **Permissions:** The LG webOS app does not use permissions such as camera, microphone, location or contacts.

## Children

The app is not directed at children. An optional on-device child lock exists for family profiles; we do not collect information from children.

## Retention and deletion

Because we do not collect personal data, there is no personal data to delete on request. On-device data is removed by uninstalling the app.

## Security

We connect to our own services and most third-party services over HTTPS. IPTV providers sometimes use unencrypted (http) addresses; that is the provider's choice.

## Changes

If ads or analytics are ever added, this policy will be updated before that version is released. The current text is on this page.

## Contact

Questions and requests: karagozyazilim12@gmail.com or https://github.com/YonetimMerkezi/-ptvplayer/issues
