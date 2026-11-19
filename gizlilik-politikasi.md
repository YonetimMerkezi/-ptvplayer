# Iptv Player Pro – Gizlilik Politikası

*English version below.*

Son güncelleme: 19 Kasım 2026 · Uygulama: Iptv Player Pro (`com.koruk.iptv`) · Geliştirici: YonetimMerkezi

## Kısaca

- Iptv Player Pro bir **medya oynatıcıdır**. Yayın hizmeti sunmaz, içerik sağlamaz; yalnızca sizin eklediğiniz kaynakları (M3U listesi, Xtream hesabı) oynatır.
- Hesap açmanız gerekmez. Ad, e-posta, telefon, konum gibi kişisel bilgi **istemeyiz**.
- Reklam, analiz (istatistik) ve çökme raporlama kitaplığı **yoktur**.
- Kaynaklarınız, parolalarınız, favorileriniz ve izleme geçmişiniz **yalnız cihazınızda** durur; bize gönderilmez.

## Cihazınızda tutulan veriler

Şunlar yalnız cihazınızın uygulama deposunda saklanır ve bizim sunucularımıza gönderilmez: eklediğiniz kaynaklar (adres, kullanıcı adı, parola), favoriler, son izlenenler, izleme ilerlemesi, profiller, ayarlar, uygulama kilidi şifresi, indirilen ve kaydedilen dosyalar. Uygulamayı kaldırırsanız ya da uygulama verilerini silerseniz bunların hepsi silinir. “Yedekle” özelliğini kullanırsanız bu veriler, sizin seçtiğiniz bir dosyaya yazılır; dosyayı kimseyle paylaşmamanızı öneririz.

## Kaynağınızın sağlayıcısı

Eklediğiniz IPTV kaynağına uygulama doğrudan bağlanır. Sağlayıcı, isteği IP adresinizle ve kendi hesap bilgilerinizle alır. Bu bağlantı sizin seçiminizdir; sağlayıcının kendi gizlilik koşulları geçerlidir. Biz bu bağlantılara aracılık etmeyiz.

## Uygulamanın internetten aldığı bilgiler

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

## Üyelik ve ödeme

Üyelik (Standart, Pro) Google Play aboneliğidir. Ödeme bilgileriniz Google tarafından işlenir; bize ulaşmaz. Uygulama yalnız aboneliğinizin etkin olup olmadığını Google Play'den öğrenir. Aboneliği Google Play > Abonelikler bölümünden istediğiniz zaman iptal edebilirsiniz.

Üyelik aynı anda bir telefonda ve bir TV'de kullanılabilir. Bunu denetlemek için Google Play sürümü, üyelik sunucumuza (Cloudflare Workers) aboneliğinizin geri döndürülemez bir özetini (abonelik anahtarınızın tek yönlü karması; anahtarın kendisi gönderilmez), cihaza özgü rastgele bir kimliği ve cihaz türünü (telefon ya da TV) gönderir. Ad, e-posta, hesap, konum, izleme listesi ya da kaynak bilgisi gönderilmez. Bu kayıtlar yalnızca üyeliğin hangi cihazda etkin olduğunu belirlemek için tutulur.

Yönetici size hediye üyelik verirse, cihaz kimliğinizi (Üyelik penceresinde görünen rastgele kimlik) siz ona iletirsiniz. Herkese açık yapılandırma dosyasında yalnızca bu kimlik, üyelik türü ve bitiş tarihi yer alır; ad, e-posta ya da hesap bilgisi yer almaz. Uygulama bu dosyayı okuyup kendi kimliğiyle eşleşen kaydı uygular.

## İzinler

- **İnternet, ağ durumu, çoklu yayın:** kaynaklara ve hizmetlere bağlanmak, yerel ağda cihaz bulmak için.
- **Bildirimler:** indirme ve kayıt durumu, program hatırlatıcıları için; yalnız siz açarsanız.
- **Tam zamanlı alarm, açılışta başlatma:** zamanlı kayıt ve hatırlatıcıları zamanında çalıştırmak, cihaz açılınca yeniden kurmak için.
- **Ön plan hizmetleri:** arka planda ses çalmak, indirmek ve zamanlı kayıt yapmak için.
- **Android TV “Devam et”:** izlemeye devam edilecek içeriği TV ana ekranında göstermek için.

## Çocuklar

Uygulama çocuklara yönelik değildir. Aile profilleri için isteğe bağlı, cihazda çalışan bir çocuk kilidi vardır; çocuklardan bilgi toplamayız.

## Saklama ve silme

Biz kişisel veri toplamadığımız için silme talebine konu veri yoktur. Cihazdaki veriler uygulamayı kaldırarak silinir.

## Güvenlik

Kendi hizmetlerimize ve çoğu üçüncü taraf hizmete HTTPS ile bağlanılır. IPTV sağlayıcıları bazen şifrelenmemiş (http) adres kullanır; bu sağlayıcının seçimidir.

## Değişiklikler

Reklam ya da analiz eklenirse bu politika, o sürümden önce güncellenir. Güncel metin bu sayfadadır.

## İletişim

Soru ve talepler için: https://github.com/YonetimMerkezi/-ptvplayer/issues

---

# Iptv Player Pro – Privacy Policy

Last updated: 19 November 2026 · App: Iptv Player Pro (`com.koruk.iptv`) · Developer: YonetimMerkezi

## In short

- Iptv Player Pro is a **media player**. It provides no streaming service and no content; it only plays sources that you add (M3U playlist, Xtream account).
- No account is needed. We do **not** ask for your name, email, phone number or location.
- There are **no ads, analytics or crash-reporting libraries**.
- Your sources, passwords, favourites and watch history stay **on your device only** and are not sent to us.

## Data kept on your device

The following is stored only in the app's storage on your device and is never sent to our servers: your sources (address, username, password), favourites, recently watched, watch progress, profiles, settings, the app-lock passcode, and downloaded or recorded files. Uninstalling the app or clearing its data deletes all of it. If you use "Back up", the data is written to a file you choose; we recommend not sharing that file.

## Your source provider

The app connects directly to the IPTV source you add. The provider receives the request with your IP address and your own account details. That connection is your choice and the provider's own privacy terms apply. We do not mediate these connections.

## Information the app fetches from the internet

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

## Membership and payment

Membership (Standard, Pro) is a Google Play subscription. Google processes your payment details; they never reach us. The app only learns from Google Play whether your subscription is active. You can cancel at any time in Google Play > Subscriptions.

Membership can be used on one phone and one TV at a time. To enforce this, the Google Play version sends our membership server (Cloudflare Workers) an irreversible digest of your subscription (a one-way hash of the subscription key; the key itself is never sent), a random device-specific ID and the device type (phone or TV). No name, email, account, location, watch history or source details are sent. These records are kept only to determine which device the membership is active on.

If the administrator gives you a complimentary membership, you send them your device ID (the random ID shown in the Membership window). The publicly readable configuration file contains only that ID, the membership type and the end date; no name, email or account details. The app reads this file and applies the entry that matches its own ID.

## Permissions

- **Internet, network state, multicast:** to reach sources and services and to find devices on the local network.
- **Notifications:** for download and recording status and programme reminders, only if you allow them.
- **Exact alarms, start at boot:** to run scheduled recordings and reminders on time and to re-arm them after a restart.
- **Foreground services:** to play audio in the background, download, and record on schedule.
- **Android TV "Continue watching":** to show what to resume on the TV home screen.

## Children

The app is not directed at children. An optional on-device child lock exists for family profiles; we do not collect information from children.

## Retention and deletion

Because we do not collect personal data, there is no personal data to delete on request. On-device data is removed by uninstalling the app.

## Security

We connect to our own services and most third-party services over HTTPS. IPTV providers sometimes use unencrypted (http) addresses; that is the provider's choice.

## Changes

If ads or analytics are ever added, this policy will be updated before that version is released. The current text is on this page.

## Contact

Questions and requests: https://github.com/YonetimMerkezi/-ptvplayer/issues
