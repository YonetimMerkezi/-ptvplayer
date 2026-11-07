// hls.js'i web köküne kopyalar (www/vendor git'e girmez, CI ve yerelde bu betik üretir).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
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
