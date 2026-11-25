// webOS'a özgü Türkçe → İngilizce sözlük; ortak (Android ile paylaşılan) sözlüğün üstüne eklenir (app.js › dilKur).
import { EN_WEBOS_A } from './i18n-en-a.js';
import { EN_WEBOS_B } from './i18n-en-b.js';
export const EN_WEBOS = [...EN_WEBOS_A, ...EN_WEBOS_B];
