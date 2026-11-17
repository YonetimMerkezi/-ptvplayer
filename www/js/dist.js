// Dağıtım türü: uygulama Google Play'den ('play') ya da doğrudan APK olarak ('direct') kurulmuş olabilir. Yerel taraf bildirir (distInfo);
// tarayıcıda ve eski kabukta 'direct' sayılır. Play sürümünde uygulama kendini güncellemez, yönetici paneli ve davet kodlu listeler yoktur,
// FFmpeg ses çözücüsü pakette bulunmaz. Saf mantık: ağ/depo yok.

let flags = { play: false };

export const isPlay = () => flags.play;

// Yerel eklentiden dağıtım türünü okur (açılışta, ilk ekran çizilmeden). Okunamazsa 'direct' kalır.
export async function loadDist(plugin) {
  try {
    const r = plugin && typeof plugin.distInfo === 'function' ? await plugin.distInfo() : null;
    flags = { play: !!(r && r.play === true) };
  } catch {
    flags = { play: false };
  }
  return flags;
}

// Yalnız testler için.
export const setDist = (v) => {
  flags = { play: !!(v && v.play) };
};
