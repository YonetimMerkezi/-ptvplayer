# ptv-meta kurulumu (telefondan, Cloudflare paneli)

Menü adları zamanla değişebilir, mantık aynı kalır.

1. **D1 veritabanı:** Storage & Databases → D1 → Create → ad: `ptv-meta`.
   Açılan veritabanında Console sekmesine `schema.sql` içeriğini yapıştırıp çalıştır.
2. **Worker:** Workers & Pages → Create → Hello World → ad: `ptv-meta` → Deploy → Edit code.
   Açılan editördeki her şeyi sil, `worker.js` içeriğini yapıştır, Deploy.
3. **D1 bağlantısı:** Worker → Settings → Bindings → Add → D1 database.
   Variable name: `DB` (tam böyle), database: `ptv-meta`.
4. **Gizli değerler:** Worker → Settings → Variables and Secrets → Add (tip: Secret):
   - `TMDB_KEY` → TMDB API anahtarın (v3 "API Key")
   - `APP_TOKEN` → uzun rastgele bir metin (uygulama kullanacak)
   - `ADMIN_TOKEN` → başka bir uzun rastgele metin (sadece sen kullanacaksın)
5. **Deneme:** tarayıcıda `https://ptv-meta.<hesap>.workers.dev/health` aç.
   `{"ok":true,"db":true,"tmdb":true}` görmelisin.

Uygulamaya girecek tek şey: Worker adresi + `APP_TOKEN`.
`ADMIN_TOKEN` ve `TMDB_KEY` uygulamaya asla girmez.

---

# Güncelleme (adım 3: imdb ve Türkçe ad alanları)

Worker zaten kuruluysa sırayla:
1. D1 Console'a `guncelle.sql` içeriğini yapıştırıp çalıştır (iki `ALTER TABLE` satırı, bir kez).
2. Worker'daki kodu silip yeni `worker.js` içeriğini yapıştır → Deploy.
3. Uygulamada `www/js/meta-worker.js` içindeki `META_APP_TOKEN` değerine Cloudflare'deki `APP_TOKEN`'ı yapıştır.
   Repo herkese açıksa token da görünür olur: repoyu özel (private) tut ya da bu riski kabul et.
   Kötüye kullanım görürsen Cloudflare'de APP_TOKEN'ı değiştirip uygulamayı güncellemen yeter.
