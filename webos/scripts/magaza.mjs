// Mağaza (LG Content Store) sürümü: kendi kendine güncelleme kodu paketten çıkarılır; mağaza güncellemeyi kendisi yapar.
// service.js'te <magaza-kes> ... </magaza-kes> arası kesilir (yerine="…" verilmişse o metin konur, \n satır sonu demektir);
// services.json'daki guncelle* komutları da silinir. Kesimden sonra güncelleme kodundan iz kalmışsa derleme durur.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const KES = /[ \t]*\/\/ <magaza-kes(?: yerine="([^"]*)")?>\n[\s\S]*?[ \t]*\/\/ <\/magaza-kes>\n/g;
export const IZ = /guncelle(Baslat|Durum|Indir|Kur|Ayar)|GUNCELLE_|dev\/install|releases\/download|appInstallService/;

export function magazaKes(kaynak) {
  return kaynak.replace(KES, (t, yerine) => (yerine ? yerine.replace(/\\n/g, '\n') : ''));
}

export function magazaKomutlari(json) {
  const j = JSON.parse(json);
  for (const h of j.services || []) h.commands = (h.commands || []).filter((c) => !/^guncelle/.test(c.name));
  return JSON.stringify(j, null, 2);
}

export function magazaServisi(klasor) {
  const yol = join(klasor, 'service.js');
  const kes = magazaKes(readFileSync(yol, 'utf8'));
  if (IZ.test(kes)) throw new Error('Mağaza sürümünde güncelleme kodu kaldı: ' + IZ.exec(kes)[0]);
  writeFileSync(yol, kes);
  const sj = join(klasor, 'services.json');
  writeFileSync(sj, magazaKomutlari(readFileSync(sj, 'utf8')));
}
