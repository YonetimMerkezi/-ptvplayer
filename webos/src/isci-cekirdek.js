// Arka plan işçisinin işi (ayrı dosyada: işçi dışında, testlerde de çağrılabilir): büyük Xtream yanıtını ayrıştırır ve
// uygulamanın kullandığı öğelere eşler. Böylece ana iş parçacığı (kumanda tuşları, çizim) uzun ayrıştırma sırasında meşgul kalmaz.
import { mapLive, mapVod, mapSeries } from '../../www/js/xtream.js';

const ESLE = { live: mapLive, movie: mapVod, series: mapSeries };
const gecerli = (l) => (Array.isArray(l) ? l.filter((c) => c && typeof c === 'object') : []);

// iste: { id, metin (JSON metni), tur: 'live'|'movie'|'series', kategoriler: [ham kategori nesneleri] } → { id, ok, liste | hata }
export function isle(iste) {
  try {
    const esle = ESLE[iste.tur];
    if (!esle) return { id: iste.id, ok: false, hata: 'Bilinmeyen tür: ' + iste.tur };
    const json = JSON.parse(iste.metin);
    return { id: iste.id, ok: true, liste: esle(gecerli(json), gecerli(iste.kategoriler)) };
  } catch (e) {
    return { id: iste.id, ok: false, hata: (e && e.message) || 'Ayrıştırılamadı' };
  }
}
