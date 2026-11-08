// TV modu: kumandayla kullanım için yatay, tam ekran, büyük yazılı ve odak halkalı arayüz.
// "Otomatik": Android TV / dokunmatiksiz cihazda açılır; "Açık" telefonu ya da tableti de TV gibi kullanır.
export const TV_MODES = [
  ['auto', 'Otomatik'],
  ['on', 'Açık'],
  ['off', 'Kapalı'],
];
export const DEFAULT_TV_MODE = 'auto';

export function normalizeTvMode(mode) {
  return TV_MODES.some(([id]) => id === mode) ? mode : DEFAULT_TV_MODE;
}

// mode: kullanıcı seçimi, detected: cihaz TV mi (yerel isTv ya da ?tv=1)
export function resolveTv(mode, detected) {
  const m = normalizeTvMode(mode);
  if (m === 'on') return true;
  if (m === 'off') return false;
  return !!detected;
}
