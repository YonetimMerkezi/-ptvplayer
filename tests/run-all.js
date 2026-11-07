// tests/*.test.js dosyalarını sırayla çalıştırır; biri düşerse çıkış kodu 1.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const klasor = dirname(fileURLToPath(import.meta.url));
const dosyalar = readdirSync(klasor).filter((d) => d.endsWith('.test.js')).sort();
let hata = 0;
for (const d of dosyalar) {
  const r = spawnSync(process.execPath, ['--test', join(klasor, d)], { stdio: 'inherit' });
  if (r.status !== 0) hata++;
}
console.log(`\n${dosyalar.length} test dosyası, ${hata} başarısız`);
process.exit(hata ? 1 : 0);
