// Hata ve olay kaydı: ekranda (Ayarlar › Hata kaydı) görülebilir; uzaktan hata ayıklamak için ekran görüntüsü yeter.
const MAX = 300;
const satirlar = [];
const dinleyenler = [];

const iki = (n) => (n < 10 ? '0' : '') + n;
const saat = () => {
  const d = new Date();
  return iki(d.getHours()) + ':' + iki(d.getMinutes()) + ':' + iki(d.getSeconds());
};

export function log(seviye, mesaj) {
  const s = saat() + ' ' + seviye + ' ' + String(mesaj);
  satirlar.push(s);
  if (satirlar.length > MAX) satirlar.shift();
  for (let i = 0; i < dinleyenler.length; i++) dinleyenler[i](s);
}
export const bilgi = (m) => log('i', m);
export const uyar = (m) => log('!', m);
export const hata = (m) => log('E', m && m.message ? m.message : m);
export const kayitlar = () => satirlar.slice();
export function dinle(fn) {
  dinleyenler.push(fn);
}

// Yakalanmamış hatalar da kayda girer (TV'de konsol yok).
export function yakala(pencere) {
  pencere.addEventListener('error', (e) => hata('JS: ' + e.message + (e.filename ? ' @' + String(e.filename).split('/').pop() + ':' + e.lineno : '')));
  pencere.addEventListener('unhandledrejection', (e) => hata('Söz: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)));
}
