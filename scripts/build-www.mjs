// hls.js'i web köküne kopyalar ve sürüm numarasını yazar (ikisi de git'e girmez; CI ve yerelde bu betik üretir).
import { copyFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const kaynak = join(kok, 'node_modules', 'hls.js', 'dist', 'hls.min.js');
const hedef = join(kok, 'www', 'vendor', 'hls.min.js');

if (!existsSync(kaynak)) {
  console.error('hls.min.js bulunamadı; önce "npm install" çalıştırın.');
  process.exit(1);
}
mkdirSync(dirname(hedef), { recursive: true });
copyFileSync(kaynak, hedef);
console.log('hls.min.js -> www/vendor');

// Sürüm: CI çalışma numarası (gradle versionName ile aynı), yerelde "geliştirme".
const run = process.env.GITHUB_RUN_NUMBER;
writeFileSync(join(kok, 'www', 'js', 'version.js'), `export const VERSION = ${JSON.stringify(run ? `1.0.${run}` : 'geliştirme')};\n`);
console.log('sürüm:', run ? `1.0.${run}` : 'geliştirme');

// Güncelleme penceresindeki not (CI, version.json'a bu dosyayı yazar): www/js/changelog.js'teki en yeni kayıt.
const { latestNotes } = await import('../www/js/changelog.js');
writeFileSync(join(kok, 'notes.txt'), latestNotes());
