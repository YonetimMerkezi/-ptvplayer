// Uygulama dili (Türkçe / İngilizce): kodda Türkçe yazılı metinler İngilizce seçiliyken sözlükten çevrilir (www/js/i18n.js; webOS'a özgü metinler i18n-en.js).
// Ayar 'auto' ise TV'nin dili Türkçeyse Türkçe, değilse İngilizce.
import { startI18n, addPairs, lang } from '../../www/js/i18n.js';
import { EN_WEBOS } from './i18n-en.js';

export const DIL = [['auto', 'Otomatik / Auto'], ['tr', 'Türkçe'], ['en', 'English']];
let sozlukEklendi = false;
export function dilKur(depo) {
  if (!sozlukEklendi) {
    addPairs(EN_WEBOS);
    sozlukEklendi = true;
  }
  return startI18n({ pref: depo.setting('lang', 'auto'), device: (typeof navigator !== 'undefined' && navigator.language) || '' });
}
export { lang };
