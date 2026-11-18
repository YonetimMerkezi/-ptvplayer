// Giriş noktası: Chromium 38 için gerekli çoklu doldurmalar (core-js) yüklenir, sonra uygulama başlar.
import 'core-js/stable';
import 'regenerator-runtime/runtime';
import { start } from './app.js';

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
