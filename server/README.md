# Üyelik sunucusu (tek cihaz kuralı)

Bir Google Play aboneliği aynı anda **bir telefonda ve bir TV'de** kullanılır. Uygulama her açılışta ve öne gelişinde bu
sunucuya sorar. Abonelik başka bir cihaza bağlıysa Pro/Standart kilitleri açılmaz; kullanıcı "Bu cihazı kullan" diyerek üyeliği
taşıyabilir (ayda en çok 2 kez). Kural: `logic.js`. Sunucuya yalnız abonelik jetonunun tek yönlü özeti, cihaz kimliği ve cihaz türü gider.

## Kurulum (bir kez, telefondan yapılabilir)

1. cloudflare.com'da ücretsiz hesap açın. Panelde **Workers & Pages** sayfasını bir kez açın (alt alan adı seçtirir).
2. **My Profile › API Tokens › Create Token › "Edit Cloudflare Workers"** şablonuyla bir anahtar oluşturun, kopyalayın.
3. GitHub deposunda **Settings › Secrets and variables › Actions › New repository secret**:
   `CLOUDFLARE_API_TOKEN` = anahtar. Birden çok Cloudflare hesabınız varsa `CLOUDFLARE_ACCOUNT_ID` de ekleyin.
4. **Actions › Üyelik sunucusu › Run workflow**. Bitince çalışma özetinde sunucu adresi (`https://iptv-uyelik.….workers.dev`) görünür.
5. Adresi `www/js/devbind.js` içindeki `BIND_URL` sabitine yazın (kural o zaman açılır).

Sunucu bağlamaları Durable Object'in SQLite deposunda tutar. Bir aboneliğin bağlamasını sıfırlamak gerekirse Cloudflare paneli
**Workers & Pages › Durable Objects › Bindings** veri görüntüleyicisinden `b` tablosundaki ilgili satır silinir.
