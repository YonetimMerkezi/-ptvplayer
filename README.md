# Iptv Player Pro

Android için IPTV oynatıcı. **M3U/M3U8 liste bağlantısı** ya da **Xtream Codes hesabı** ile çalışır.

- Canlı TV: gruplar, arama (Türkçe harf duyarsız), favoriler, son izlenenler
- TV rehberi (XMLTV / Xtream): kanal satırında "şimdi", oynatıcıda "şimdi/sonra", kanal program listesi
- Film ve dizi: poster ızgarası, sezon/bölüm listesi, kaldığın yerden devam
- Oynatıcı: Media3 (ExoPlayer) — HLS ve MPEG-TS, ses/altyazı seçimi, görüntü oranı, kanal değiştirme
- Telefon, tablet ve Android TV (kumanda okları) için

Uygulama içerik sağlamaz; yalnızca erişim hakkınız olan kaynakları ekleyin.

## Geliştirme

```bash
npm install
npm test                 # birim testleri
bash mock/make-media.sh  # örnek yayınlar (ffmpeg)
node tests/e2e/run.cjs   # uçtan uca (Playwright + sahte sunucu)
npm run sync             # web dosyalarını android/ içine aktarır
```

## APK

`.github/workflows/build-apk.yml` her push'ta APK üretir ve sabit adrese yayınlar:
`https://github.com/YonetimMerkezi/-ptvplayer/releases/download/latest/iptv-oynatici.apk`

**Güncelleme:** telefonda bu adresi açıp indir, eski uygulamanın üstüne kur (kaldırmaya gerek yok).
Bunun şartı iki şey: APK her zaman `android/app/iptv.keystore` ile imzalanır ve sürüm numarası
(`1.0.<derleme no>`) her derlemede artar. Kaynaklar sekmesinin altında kurulu sürüm yazar.
Anahtar dosyasını silmeyin/değiştirmeyin; değişirse bir sonraki kurulum için eskisini kaldırmak gerekir.

Yerelde: JDK 17 + Android SDK kurulu olmalı, sonra `cd android && ./gradlew assembleDebug`.

## Yapı

- `www/` — arayüz (düz JS, derleme adımı yok); `www/js/` çekirdek: `m3u`, `xtream`, `epg`, `catalog`, `net`, `store`, `player`
- `android/app/src/main/java/com/koruk/iptv/IptvPlayerPlugin.java` — yerel oynatıcı + büyük dosya indirme
- Video, saydam WebView'in arkasındaki Media3 görünümünde çizilir; denetimler HTML'dir.
- `mock/` — deneme sunucusu (M3U, Xtream, XMLTV, örnek yayın)
