// Kaynak girdisini (elle yazılan ya da telefondan gelen) kayıt biçimine çevirir. Saf mantık: ağ ve ekran yok.
import { parseXtreamLink, normalizeServer } from '../../www/js/xtream.js';

// g: { tip: 'xtream' | 'm3u', ad, server, user, pass, url } → { src } ya da { hata }
export function kaynakHazirla(g) {
  const ad = String((g && g.ad) || '').trim();
  if (g && g.tip === 'xtream') {
    let server = String(g.server || '').trim();
    let user = String(g.user || '').trim();
    let pass = String(g.pass || '').trim();
    const link = parseXtreamLink(server);
    if (link) {
      server = link.server;
      user = user || link.user;
      pass = pass || link.pass;
    }
    server = normalizeServer(server);
    if (!server || !user || !pass) return { hata: 'Sunucu, kullanıcı adı ve şifre gerekli.' };
    return { src: { type: 'xtream', name: ad || 'Xtream', server, user, pass } };
  }
  const url = String((g && g.url) || '').replace(/\s+/g, ''); // yapıştırılırken satır sonu / boşluk karışabilir
  if (!/^https?:\/\//i.test(url)) return { hata: 'Bağlantı http:// veya https:// ile başlamalı.' };
  const link = parseXtreamLink(url); // get.php?username=..&password=.. biçimi Xtream olarak eklenir
  return { src: link ? { type: 'xtream', name: ad || 'Xtream', server: link.server, user: link.user, pass: link.pass } : { type: 'm3u', name: ad || 'Liste', url } };
}
